-- Single-owner, email-invited workspace. No visitor may self-assign membership.
create schema if not exists private;
create table public.app_settings (
  id boolean primary key default true check (id),
  owner_email text not null check(owner_email=lower(trim(owner_email))),
  owner_invited_at timestamptz
);
create table public.workspaces (
  id text primary key check(id='main'),
  owner_id uuid not null references auth.users(id),
  owner_name text not null,
  data jsonb not null,
  revision bigint not null default 1 check(revision>0),
  updated_at timestamptz not null default now()
);
create table public.workspace_members (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  email text not null check(email=lower(trim(email)) and length(email)<=254 and email like '%@%'),
  created_at timestamptz not null default now(),
  last_invited_at timestamptz,
  primary key(workspace_id,email)
);
create index workspace_members_email_idx on public.workspace_members(email);
alter table public.app_settings enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
revoke all on public.app_settings,public.workspaces,public.workspace_members from anon,authenticated;
grant select on public.workspaces,public.workspace_members to authenticated;

create function private.configured_owner() returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.app_settings where id and owner_email=lower(auth.jwt()->>'email'));
$$;
create function private.is_owner() returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.workspaces where id='main' and owner_id=auth.uid());
$$;
create function private.can_read_workspace() returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    exists(select 1 from public.workspaces where id='main' and owner_id=auth.uid())
    or exists(select 1 from public.workspace_members where workspace_id='main' and email=lower(auth.jwt()->>'email'))
  );
$$;
revoke all on function private.configured_owner(),private.is_owner(),private.can_read_workspace() from public;
grant usage on schema private to authenticated;
grant execute on function private.configured_owner(),private.is_owner(),private.can_read_workspace() to authenticated;
create policy "invited_read_workspace" on public.workspaces for select to authenticated using((select private.can_read_workspace()));
create policy "owner_or_self_read_membership" on public.workspace_members for select to authenticated
  using((select private.is_owner()) or email=lower((select auth.jwt())->>'email'));

create function private.text_ok(p jsonb,k text,n integer,required boolean default false) returns boolean language sql immutable set search_path='' as $$
  select coalesce(jsonb_typeof(p->k)='string' and length(p->>k)<=n and (not required or length(trim(p->>k))>0),false);
$$;
create function private.valid_day(p text,allow_empty boolean default false) returns boolean language plpgsql immutable set search_path='' as $$
begin
  if p='' then return allow_empty; end if;
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  return to_char(p::date,'YYYY-MM-DD')=p;
exception when others then return false;
end;
$$;
create function private.valid_timestamp(p text,allow_empty boolean default false) returns boolean language plpgsql immutable set search_path='' as $$
begin
  if p='' then return allow_empty; end if;
  if p is null or length(p)>40 or p !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:' then return false; end if;
  return p::timestamptz is not null;
exception when others then return false;
end;
$$;
create function private.validate_document(p jsonb) returns void language plpgsql immutable set search_path='' as $$
declare k text; item jsonb; count_limit integer; project_ids text[];
begin
  if jsonb_typeof(p)<>'object' or not private.text_ok(p,'name',160,true) or octet_length(p::text)>1500000 then
    raise exception using errcode='22023',message='ワークスペース名またはデータ量を確認してください';
  end if;
  foreach k in array array['projects','tasks','time','notes','reports','activity'] loop
    count_limit:=case k when 'projects' then 100 when 'tasks' then 1500 when 'time' then 3000 when 'notes' then 500 when 'reports' then 300 else 80 end;
    if coalesce(jsonb_typeof(p->k),'null')<>'array' then raise exception using errcode='22023',message='配列の形式が不正です'; end if;
    if jsonb_array_length(p->k)>count_limit then raise exception using errcode='22023',message='記録数の上限を超えています'; end if;
    if exists(select 1 from jsonb_array_elements(p->k) v where not private.text_ok(v,'id',80,true))
      or (select count(*)<>count(distinct v->>'id') from jsonb_array_elements(p->k) v) then
      raise exception using errcode='22023',message='IDが不正または重複しています';
    end if;
  end loop;
  select coalesce(array_agg(v->>'id'),array[]::text[]) into project_ids from jsonb_array_elements(p->'projects') v;
  for item in select value from jsonb_array_elements(p->'projects') loop
    if not private.text_ok(item,'name',160,true) or not private.text_ok(item,'client',100) or not private.text_ok(item,'description',4000)
      or not private.valid_day(item->>'due',true) or coalesce(item->>'color','') not in ('green','purple','blue','orange')
      or coalesce(jsonb_typeof(item->'archived'),'')<>'boolean' or coalesce(jsonb_typeof(item->'budget'),'')<>'number'
      then raise exception using errcode='22023',message='案件の項目が不正です'; end if;
    if (item->>'budget')::numeric<0 or (item->>'budget')::numeric>100000 then raise exception using errcode='22023',message='予定工数が範囲外です'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p->'tasks') loop
    if not private.text_ok(item,'title',160,true) or not private.text_ok(item,'description',4000)
      or not coalesce((item->>'projectId')=any(project_ids),false) or not private.valid_day(item->>'due',true)
      or coalesce(item->>'status','') not in ('todo','doing','done') or coalesce(item->>'priority','') not in ('high','medium','low')
      or coalesce(jsonb_typeof(item->'estimate'),'')<>'number' or not private.valid_timestamp(item->>'completedAt',true)
      then raise exception using errcode='22023',message='タスクの項目が不正です'; end if;
    if (item->>'estimate')::numeric<0 or (item->>'estimate')::numeric>10000 then raise exception using errcode='22023',message='見積もりが範囲外です'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p->'time') loop
    if not coalesce((item->>'projectId')=any(project_ids),false) or not private.valid_day(item->>'date')
      or not private.text_ok(item,'note',2000) or coalesce(jsonb_typeof(item->'hours'),'')<>'number'
      then raise exception using errcode='22023',message='工数の項目が不正です'; end if;
    if (item->>'hours')::numeric<=0 or (item->>'hours')::numeric>24 then raise exception using errcode='22023',message='工数は0より大きく24以下にしてください'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p->'notes') loop
    if not private.text_ok(item,'title',160,true) or not private.text_ok(item,'body',12000) or not private.text_ok(item,'projectId',80)
      or ((item->>'projectId')<>'' and not coalesce((item->>'projectId')=any(project_ids),false))
      or not private.valid_timestamp(item->>'updatedAt') then raise exception using errcode='22023',message='メモの項目が不正です'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p->'reports') loop
    if not private.text_ok(item,'title',160,true) or not private.valid_day(item->>'start') or not private.valid_day(item->>'end')
      or (item->>'end')<(item->>'start') or not private.text_ok(item,'done',12000) or not private.text_ok(item,'next',12000)
      or not private.text_ok(item,'blockers',12000) or not private.valid_timestamp(item->>'createdAt')
      then raise exception using errcode='22023',message='報告の項目または対象期間が不正です'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p->'activity') loop
    if not private.text_ok(item,'text',250,true) or coalesce(item->>'type','') not in ('project','task','time','note','report')
      or not private.valid_timestamp(item->>'at') then raise exception using errcode='22023',message='操作履歴が不正です'; end if;
  end loop;
end;
$$;
revoke all on function private.text_ok(jsonb,text,integer,boolean),private.valid_day(text,boolean),private.valid_timestamp(text,boolean),private.validate_document(jsonb) from public;

create function public.read_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w public.workspaces;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='ログインしてください'; end if;
  select * into w from public.workspaces where id='main';
  if not found then
    if not private.configured_owner() then raise exception using errcode='42501',message='招待が必要です'; end if;
    return jsonb_build_object('workspace',null,'revision',0,'updatedAt','','role','owner','ownerName','');
  end if;
  if not private.can_read_workspace() then raise exception using errcode='42501',message='招待が必要です'; end if;
  return jsonb_build_object('workspace',w.data,'revision',w.revision,'updatedAt',w.updated_at,'role',case when w.owner_id=auth.uid() then 'owner' else 'viewer' end,'ownerName',w.owner_name);
end;
$$;
create function public.create_workspace(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.configured_owner() then raise exception using errcode='42501',message='所有者として登録したメールでログインしてください'; end if;
  perform private.validate_document(p_data);
  insert into public.workspaces(id,owner_id,owner_name,data) values('main',auth.uid(),coalesce(nullif(auth.jwt()->'user_metadata'->>'full_name',''),auth.jwt()->>'email'),p_data);
  return public.read_workspace();
end;
$$;
create function public.save_workspace(p_revision bigint,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.is_owner() then raise exception using errcode='42501',message='オーナーだけが編集できます'; end if;
  perform private.validate_document(p_data);
  update public.workspaces set data=p_data,revision=revision+1,updated_at=clock_timestamp() where id='main' and owner_id=auth.uid() and revision=p_revision;
  if not found then raise exception using errcode='40001',message='別の画面で更新されました'; end if;
  return public.read_workspace();
end;
$$;
create function public.remove_viewer(p_email text) returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.is_owner() then raise exception using errcode='42501',message='オーナーだけが変更できます'; end if;
  delete from public.workspace_members where workspace_id='main' and email=lower(trim(p_email));
end;
$$;
revoke all on function public.read_workspace(),public.create_workspace(jsonb),public.save_workspace(bigint,jsonb),public.remove_viewer(text) from public,anon;
grant execute on function public.read_workspace(),public.create_workspace(jsonb),public.save_workspace(bigint,jsonb),public.remove_viewer(text) to authenticated;
-- Publish only the workspace document; Realtime still applies the SELECT RLS.
alter publication supabase_realtime add table public.workspaces;
