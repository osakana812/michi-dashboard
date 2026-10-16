import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { emptyWorkspace,sampleWorkspace,workspaceSchema,monday,shiftDate } from "../lib/model.ts";

await test("Postgres functions and RLS isolate owner, invited reader, outsider and anonymous",async t=>{
  const db=new PGlite();
  const ids={owner:"11111111-1111-4111-8111-111111111111",viewer:"22222222-2222-4222-8222-222222222222",outsider:"33333333-3333-4333-8333-333333333333"};
  try{
    await db.exec(`create schema auth;create role anon;create role authenticated;create table auth.users(id uuid primary key);create publication supabase_realtime;
    `);
  }catch(e){await db.close();throw e;}
  // Match Supabase's auth helper contract, with test-only JWT claims.
  await db.exec("create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;grant usage on schema auth to anon,authenticated;grant execute on all functions in schema auth to anon,authenticated;");
  await db.exec(await readFile(new URL("../supabase/migrations/202610160001_workspace.sql",import.meta.url),"utf8"));
  await db.query("insert into auth.users values($1),($2),($3)",Object.values(ids));
  await db.exec("insert into public.app_settings(owner_email) values('owner@tests.invalid');");
  const asUser=async(who,operation)=>{
    await db.exec("reset role");
    const email=who?`${who}@tests.invalid`:"";
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(who?{sub:ids[who],email}:{})]);
    await db.exec(`set role ${who?"authenticated":"anon"}`);
    return operation();
  };
  let revision=1;
  const value=sampleWorkspace("2026-10-16");
  await t.test("only the configured owner can initialize",async()=>{
    await asUser("outsider",()=>assert.rejects(db.query("select public.create_workspace($1::jsonb)",[JSON.stringify(value)]),e=>e.code==="42501"));
    const result=await asUser("owner",()=>db.query("select public.create_workspace($1::jsonb) as s",[JSON.stringify(value)]));
    assert.equal(result.rows[0].s.role,"owner");assert.equal(result.rows[0].s.revision,1);
  });
  await t.test("anonymous cannot call read RPC or select records",async()=>{
    await asUser(null,()=>assert.rejects(db.query("select public.read_workspace()"),e=>e.code==="42501"));
    await asUser(null,()=>assert.rejects(db.query("select * from public.workspaces"),e=>e.code==="42501"));
  });
  await t.test("an authenticated outsider cannot read or grant themselves access",async()=>{
    await asUser("outsider",()=>assert.rejects(db.query("select public.read_workspace()"),e=>e.code==="42501"));
    const rows=await asUser("outsider",()=>db.query("select * from public.workspaces"));assert.equal(rows.rows.length,0);
    await asUser("outsider",()=>assert.rejects(db.exec("insert into public.workspace_members(workspace_id,email) values('main','outsider@tests.invalid')"),e=>e.code==="42501"));
  });
  await t.test("invited reader can read and is denied every write path",async()=>{
    await db.exec("reset role;insert into public.workspace_members(workspace_id,email) values('main','viewer@tests.invalid');");
    const result=await asUser("viewer",()=>db.query("select public.read_workspace() as s"));assert.equal(result.rows[0].s.role,"viewer");assert.equal(result.rows[0].s.workspace.projects.length,3);
    await asUser("viewer",()=>assert.rejects(db.query("select public.save_workspace(1,$1::jsonb)",[JSON.stringify(value)]),e=>e.code==="42501"));
    await asUser("viewer",()=>assert.rejects(db.exec("update public.workspaces set revision=999"),e=>e.code==="42501"));
    await asUser("viewer",()=>assert.rejects(db.exec("select public.remove_viewer('viewer@tests.invalid')"),e=>e.code==="42501"));
  });
  await t.test("valid owner writes persist and stale revisions fail atomically",async()=>{
    const next={...value,name:"Updated"};const saved=await asUser("owner",()=>db.query("select public.save_workspace(1,$1::jsonb) as s",[JSON.stringify(next)]));revision=saved.rows[0].s.revision;assert.equal(revision,2);
    await asUser("owner",()=>assert.rejects(db.query("select public.save_workspace(1,$1::jsonb)",[JSON.stringify(value)]),e=>e.code==="40001"));
    const result=await asUser("viewer",()=>db.query("select public.read_workspace() as s"));assert.equal(result.rows[0].s.workspace.name,"Updated");
  });
  await t.test("database validates IDs, references, dates and role-independent payloads",async()=>{
    for(const bad of [{...value,projects:[value.projects[0],value.projects[0]]},{...value,time:[{id:"t",projectId:"missing",date:"2026-10-16",hours:1,note:""}]},{...value,time:[{id:"t",projectId:"p1",date:"2026-02-31",hours:1,note:""}]},{...value,tasks:[{...value.tasks[0],status:"administrator"}]}]){
      await asUser("owner",()=>assert.rejects(db.query("select public.save_workspace($1,$2::jsonb)",[revision,JSON.stringify(bad)]),e=>e.code==="22023"));
    }
  });
  await t.test("revoking membership removes future database reads",async()=>{
    await asUser("owner",()=>db.exec("select public.remove_viewer('viewer@tests.invalid')"));
    await asUser("viewer",()=>assert.rejects(db.query("select public.read_workspace()"),e=>e.code==="42501"));
  });
  await db.close();
});
test("Japan-time dates and document validation",()=>{
  assert.equal(monday("2026-10-18"),"2026-10-12");assert.equal(shiftDate("2026-10-31",1),"2026-11-01");
  assert.equal(workspaceSchema.safeParse(emptyWorkspace("My work")).success,true);
  assert.equal(workspaceSchema.safeParse(sampleWorkspace("2026-10-16")).success,true);
});

