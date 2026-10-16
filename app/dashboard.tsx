"use client";
import { useEffect, useRef, useState, useMemo, type ReactNode } from "react";
import { LayoutDashboard, FolderKanban, CircleCheck, CalendarDays, FileText, NotebookPen, Clock3, Search, ChevronRight, ChevronDown, Plus, ArrowUpRight, ArrowRight, LockKeyhole, Users, Download, Copy, Check, HelpCircle, X, Menu, Circle, CheckCheck, Flag, MoreHorizontal, RefreshCw, WifiOff, LoaderCircle, LogOut, ExternalLink } from "lucide-react";
import { emptyWorkspace, sampleWorkspace, localDate, monday, shiftDate, progress, workspaceSchema, reportMarkdown, type Workspace, type Project, type Task, type Kind, type Snapshot, type Report } from "@/lib/model";
import Editor, { Modal, type EditorState, type Entry } from "./editor";
import { appUrl,configured,readWorkspace,initializeWorkspace,saveWorkspace,watchWorkspace,signOut,AccessError,ConflictError,type AppUser } from "@/lib/backend";
import { EmailLogin,ViewerAccess } from "./access";

type View="overview"|"projects"|"tasks"|"roadmap"|"reports"|"time"|"notes";
const nav=[{id:"overview",label:"概要",icon:LayoutDashboard},{id:"projects",label:"プロジェクト",icon:FolderKanban},{id:"tasks",label:"タスク",icon:CircleCheck},{id:"roadmap",label:"今後の予定",icon:CalendarDays},{id:"time",label:"工数の記録",icon:Clock3},{id:"reports",label:"進捗レポート",icon:FileText},{id:"notes",label:"メモ・ナレッジ",icon:NotebookPen}] as const;
const statusLabel={todo:"未着手",doing:"進行中",done:"完了"};
const labels={project:"プロジェクト",task:"タスク",time:"工数",report:"週次報告",note:"メモ"};
const collections={project:"projects",task:"tasks",time:"time",report:"reports",note:"notes"} as const;
function hours(n:number){return n.toLocaleString("ja-JP",{maximumFractionDigits:2});}
function dateLabel(d:string){if(!d)return"期限なし";return `${Number(d.slice(5,7))}/${Number(d.slice(8,10))}`;}
function relative(at:string){const m=Math.max(0,Math.floor((Date.now()-new Date(at).getTime())/60000));return m<1?"たった今":m<60?`${m}分前`:m<1440?`${Math.floor(m/60)}時間前`:`${Math.floor(m/1440)}日前`;}
function download(filename:string,content:string,type="text/plain;charset=utf-8"){
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function Mark(){return <span className="brand-mark" aria-hidden="true"><i/><i/><i/></span>;}
function Empty({title,description,action}:{title:string;description?:string;action?:ReactNode}){return <div className="empty"><span className="empty-icon"><FolderKanban size={23}/></span><h3>{title}</h3>{description&&<p>{description}</p>}{action}</div>;}
function Panel({title,sub,action,children,className=""}:{title:string;sub?:string;action?:ReactNode;children:ReactNode;className?:string}){return <section className={`panel ${className}`}><div className="panel-heading"><div><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>{action}</div>{children}</section>;}
function ProjectIcon({p}:{p:Project}){return <span className={`project-icon ${p.color}`}>{p.name.slice(0,1)}</span>;}

export default function Dashboard({user,authError=""}:{user:AppUser|null;authError?:string}){
  const today=localDate(),week=monday(today);
  const [w,setW]=useState<Workspace>(()=>sampleWorkspace(today));
  const [mode,setMode]=useState<"loading"|"sample"|"live"|"error">(user?"loading":"sample");
  const [view,setView]=useState<View>("overview");
  const [role,setRole]=useState<"owner"|"viewer">("viewer");
  const [sync,setSync]=useState<"connecting"|"live"|"offline">("connecting");
  const [updatedAt,setUpdatedAt]=useState("");
  const snap=useRef<Snapshot|null>(null),workspaceRef=useRef(w),savingRef=useRef(false);
  const [busy,setBusy]=useState(false),[toast,setToast]=useState<{message:string;error:boolean}|null>(null);
  const [editor,setEditor]=useState<EditorState|null>(null);
  const [modal,setModal]=useState<"setup"|"share"|"help"|"export"|"auth"|null>(null);
  const [readReport,setReadReport]=useState<Report|null>(null);
  const [query,setQuery]=useState(""),[projectFilter,setProjectFilter]=useState("all"),[statusFilter,setStatusFilter]=useState("all");
  const [period,setPeriod]=useState("week"),[mobile,setMobile]=useState(false);
  const searchRef=useRef<HTMLInputElement>(null);
  const isSample=mode==="sample",canEdit=(mode==="live"&&role==="owner")||isSample;
  const notify=(message:string,error=false)=>setToast({message,error});
  function apply(s:Snapshot){
    if(snap.current && s.revision<snap.current.revision)return;
    snap.current=s;
    if(s.workspace){workspaceRef.current=s.workspace;setW(s.workspace);setRole(s.role);setUpdatedAt(s.updatedAt);setMode("live");}
    else{setMode("sample");setRole("owner");}
  }
  async function load(){
    if(!user)return;
    try{apply(await readWorkspace());}
    catch(error){
      if(error instanceof AccessError){snap.current=null;const sample=sampleWorkspace(today);workspaceRef.current=sample;setW(sample);setRole("viewer");setEditor(null);setReadReport(null);setMode("error");}
      else if(!snap.current?.workspace)setMode("error");
      notify(error instanceof Error?error.message:"データを読み込めませんでした",true);
    }
  }
  useEffect(()=>{void load();},[]);
  useEffect(()=>{if(authError&&!user){notify(authError,true);setModal("auth");}},[authError,user]);
  useEffect(()=>{workspaceRef.current=w;},[w]);
  useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(null),toast.error?10000:3800);return()=>clearTimeout(id);},[toast]);
  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();searchRef.current?.focus();}};
    document.addEventListener("keydown",handler);return()=>document.removeEventListener("keydown",handler);
  },[]);
  useEffect(()=>{
    if(mode!=="live")return;
    let stop:(()=>void)|undefined;
    const start=()=>{if(document.hidden)return;stop?.();setSync("connecting");stop=watchWorkspace(()=>void load(),setSync);};
    const visibility=()=>{if(document.hidden){stop?.();stop=undefined;setSync("connecting");}else{void load();start();}};
    const online=()=>{void load();start();};const offline=()=>setSync("offline");
    start();document.addEventListener("visibilitychange",visibility);window.addEventListener("online",online);window.addEventListener("offline",offline);
    const timer=setInterval(()=>{if(!document.hidden)void load();},30000);
    return()=>{stop?.();clearInterval(timer);document.removeEventListener("visibilitychange",visibility);window.removeEventListener("online",online);window.removeEventListener("offline",offline);};
  },[mode]);
  function navigate(id:View){setView(id);setQuery("");setMobile(false);setProjectFilter("all");setStatusFilter("all");}
  function open(kind:Kind,entry?:Entry,status?:Task["status"]){
    if(!canEdit)return;
    if((kind==="task"||kind==="time")&&!w.projects.some(p=>!p.archived)){notify("先にプロジェクトを追加しましょう。");setEditor({kind:"project"});return;}
    setEditor({kind,entry,status,projectId:projectFilter!=="all"?projectFilter:undefined});
  }
  async function commit(transform:(value:Workspace)=>Workspace,message:string){
    if(!canEdit||savingRef.current)return false;
    const next=transform(structuredClone(workspaceRef.current));
    const valid=workspaceSchema.safeParse(next);
    if(!valid.success){notify(valid.error.issues[0]?.message??"入力内容を確認してください",true);return false;}
    if(isSample){workspaceRef.current=next;setW(next);notify(`${message}（サンプル内のみ）`);return true;}
    savingRef.current=true;setBusy(true);
    try{
      apply(await saveWorkspace(snap.current!.revision,valid.data));notify(message);return true;
    }catch(error){if(error instanceof ConflictError||error instanceof AccessError)await load();notify(error instanceof Error?error.message:"保存できませんでした。もう一度お試しください。",true);return false;}
    finally{savingRef.current=false;setBusy(false);}
  }
  function activity(value:Workspace,text:string,type:Kind){value.activity=[{id:crypto.randomUUID(),text,at:new Date().toISOString(),type},...value.activity].slice(0,80);return value;}
  async function saveEntry(entry:Entry){
    if(!editor)return false;
    const kind=editor.kind,key=collections[kind];
    if(editor.entry){
      const current=(workspaceRef.current[key] as Entry[]).find(item=>item.id===editor.entry?.id);
      if(JSON.stringify(current)!==JSON.stringify(editor.entry)){
        notify("この記録は別の画面で変更されました。入力内容を控えてから、編集画面を開き直してください。",true);return false;
      }
    }
    return commit(value=>{
      const list=value[key] as Entry[];const i=list.findIndex(x=>x.id===entry.id);if(i>=0)list[i]=entry;else list.unshift(entry);
      const name="name" in entry?entry.name:"title" in entry?entry.title:"工数";
      return activity(value,`${name}を${i>=0?"更新":"追加"}`,kind);
    },`${labels[kind]}を保存しました`);
  }
  async function deleteEntry(){
    if(!editor?.entry)return false;const {kind,entry}=editor;const key=collections[kind];
    const current=(workspaceRef.current[key] as Entry[]).find(item=>item.id===entry.id);
    if(JSON.stringify(current)!==JSON.stringify(entry)){notify("この記録は別の画面で変更されています。編集画面を開き直してください。",true);return false;}
    return commit(value=>{
      (value[key] as Entry[])=(value[key] as Entry[]).filter(x=>x.id!==entry.id);
      if(kind==="project"){value.tasks=value.tasks.filter(t=>t.projectId!==entry.id);value.time=value.time.filter(t=>t.projectId!==entry.id);value.notes=value.notes.filter(t=>t.projectId!==entry.id);}
      return activity(value,`${labels[kind]}を削除`,kind);
    },`${labels[kind]}を削除しました`);
  }
  function toggle(task:Task){void commit(value=>{const t=value.tasks.find(x=>x.id===task.id);if(t){t.status=t.status==="done"?"todo":"done";t.completedAt=t.status==="done"?new Date().toISOString():"";}return activity(value,`「${task.title}」を${t?.status==="done"?"完了":"未着手"}に変更`,"task");},"タスクを更新しました");}
  async function setup(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();if(!user)return;const data=new FormData(e.currentTarget);const name=String(data.get("name")??"").trim();
    const value=data.get("sample")?{...sampleWorkspace(today),name}:emptyWorkspace(name);
    setBusy(true);
    try{apply(await initializeWorkspace(value));setModal(null);notify("ワークスペースを作成しました。最初のプロジェクトを追加しましょう。");}
    catch(e){notify(e instanceof Error?e.message:"作成できませんでした",true);}finally{setBusy(false);}
  }
  const active=w.projects.filter(p=>!p.archived);
  const done=w.tasks.filter(t=>t.status==="done").length;
  const rangeStart=period==="week"?week:today.slice(0,8)+"01";
  const timeInRange=w.time.filter(t=>t.date>=rangeStart&&t.date<=today);
  const totalHours=timeInRange.reduce((a,t)=>a+t.hours,0);
  const dueTasks=w.tasks.filter(t=>t.status!=="done"&&t.due&&t.due<=shiftDate(today,7));
  const overdue=dueTasks.filter(t=>t.due<today);
  const filteredProjects=w.projects.filter(p=>(p.name+p.client+p.description).toLowerCase().includes(query.toLowerCase()));
  const filteredTasks=w.tasks.filter(t=>(projectFilter==="all"||t.projectId===projectFilter)&&(statusFilter==="all"||t.status===statusFilter)&&(t.title+t.description+(w.projects.find(p=>p.id===t.projectId)?.name??"")).toLowerCase().includes(query.toLowerCase()));
  const focus=[...w.tasks].filter(t=>t.status!=="done").sort((a,b)=>((a.due||"9999")>(b.due||"9999")?1:-1)).slice(0,3);
  const getProject=(id:string)=>w.projects.find(p=>p.id===id);
  const latestReport=[...w.reports].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  const button=(kind:Kind,text?:string)=>canEdit?<button className="btn primary" disabled={busy} onClick={()=>open(kind)}><Plus size={16}/>{text??`${labels[kind]}を追加`}</button>:null;
  const goTasks=(p:Project)=>{navigate("tasks");setProjectFilter(p.id);};
  const viewTitle={overview:"仕事の現在地を、ひと目で。",projects:"プロジェクト",tasks:"タスク",roadmap:"今後の予定",reports:"進捗レポート",time:"工数の記録",notes:"メモ・ナレッジ"}[view];
  const subtitle={overview:"日々の積み重ねを、チームに伝わる進捗に。",projects:"案件ごとの進捗と、次の一歩を見渡しましょう。",tasks:"やることを整理して、ひとつずつ前へ。",roadmap:"これからの予定を、少し先まで見通す。",reports:"今週の実績と次の予定を、ひとつの報告に。",time:"使った時間を記録して、仕事の配分を知る。",notes:"アイデアも、決まったことも。仕事のそばに残す。"}[view];

  const projectRows=(projects:Project[])=><div className="table-scroll"><table className="project-table"><thead><tr><th>プロジェクト名</th><th>進捗</th><th>期限</th><th>ステータス</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{projects.map(p=>{const pct=progress(w,p.id),late=Boolean((p.due&&p.due<today&&pct<100)||w.tasks.some(t=>t.projectId===p.id&&t.due&&t.due<today&&t.status!=="done"));return <tr key={p.id}><td><button className="project-name" onClick={()=>goTasks(p)}><ProjectIcon p={p}/><span><strong>{p.name}</strong><small>{p.client||"クライアント未設定"}</small></span></button></td><td><div className="progress-cell"><span className="progress-track"><i className={p.color} style={{width:`${pct}%`}}/></span><b>{pct}<small>%</small></b></div></td><td className="date-cell">{dateLabel(p.due)}</td><td><span className={`badge ${pct===100?"green":late?"amber":"green"}`}><i/>{pct===100?"完了":late?"要確認":"順調"}</span></td><td>{canEdit?<button className="icon-btn" aria-label={`${p.name}を編集`} onClick={()=>open("project",p)}><MoreHorizontal size={17}/></button>:<button className="icon-btn" aria-label={`${p.name}のタスクを見る`} onClick={()=>goTasks(p)}><ChevronRight size={16}/></button>}</td></tr>;})}</tbody></table></div>;
  return <div className="app-shell">
    {mobile&&<div className="sidebar-shade" onClick={()=>setMobile(false)}/>}
    <aside className={`sidebar ${mobile?"mobile-open":""}`}>
      <button className="brand" onClick={()=>navigate("overview")} aria-label="michi 概要へ"><Mark/><span>michi<span className="brand-dot">.</span></span></button>
      <div className="workspace-switch"><span className="workspace-avatar">W</span><span><strong>{w.name}</strong><small>WORKSPACE</small></span><LockKeyhole size={13}/></div>
      <div className="nav-caption">ワークスペース</div>
      <nav aria-label="メインナビゲーション">{nav.map(item=><button key={item.id} className={`nav-item ${view===item.id?"active":""}`} onClick={()=>navigate(item.id)} aria-current={view===item.id?"page":undefined}><item.icon size={18}/><span>{item.label}</span>{item.id==="tasks"&&<span className="nav-count">{w.tasks.filter(t=>t.status!=="done").length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-symbol"><span>↗</span><i/></div><strong>小さく記録、大きく前進。</strong><p>今日の進みを残すことから<br/>はじめてみましょう。</p><button onClick={()=>setModal("help")}>使い方ガイド <ArrowUpRight size={13}/></button></div><a className="sidebar-help" href={new URL("references.html",appUrl()).href} target="_blank" rel="noopener"><ExternalLink size={16}/>作例・デザインの方向性</a><button className="sidebar-help" onClick={()=>setModal("help")}><HelpCircle size={17}/>ヘルプ・使い方</button><div className="user-card"><span className="user-avatar">{(user?.name??"M").slice(0,1).toUpperCase()}</span><span><strong>{user?.name?.includes("@")?user.name.split("@")[0]:user?.name??"マイワークスペース"}</strong><small>{isSample?"サンプルを体験中":role==="owner"?"オーナー · 編集可能":"招待メンバー · 閲覧専用"}</small></span>{user&&<button className="icon-btn" aria-label="サインアウト" onClick={()=>void signOut()}><LogOut size={14}/></button>}</div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-btn mobile-menu" onClick={()=>setMobile(true)} aria-label="メニューを開く"><Menu size={20}/></button><span>ワークスペース</span><ChevronRight size={13}/><strong>{nav.find(n=>n.id===view)?.label}</strong></div><div className="topbar-tools"><label className="search"><Search size={16}/><input ref={searchRef} placeholder="案件やタスクを検索" aria-label="案件やタスクを検索" value={query} onChange={e=>{setQuery(e.target.value);if(view==="overview"||view==="roadmap")setView("tasks");}}/><kbd>Ctrl K</kbd></label><span className="topbar-divider"/><button className="access-button" onClick={()=>setModal("share")}><LockKeyhole size={14}/><span>招待制</span></button></div></header>
      <main>
        {(isSample||mode==="loading"||mode==="error")&&<div className={`sample-banner ${mode==="error"?"error":""}`}>
          <span>{mode==="loading"?<><LoaderCircle size={15} className="spin"/>ワークスペースを読み込み中…</>:mode==="error"?<><WifiOff size={16}/>接続または閲覧権限を確認してください。表示はサンプルです。実データの保存は停止しています。</>:<><span className="sample-dot"/>サンプルワークスペース <span className="banner-detail">自由に操作できます。変更は保存されません。</span></>}</span>
          {mode==="error"?<button onClick={()=>void load()}><RefreshCw size={13}/>再試行</button>:mode==="loading"?null:user?<button onClick={()=>setModal("setup")}>自分のワークスペースを作成<ArrowRight size={14}/></button>:<button onClick={()=>setModal("auth")}>メールでログイン <ArrowRight size={14}/></button>}
        </div>}
        {mode==="live"&&role==="viewer"&&<div className="viewer-banner"><LockKeyhole size={14}/>閲覧専用で共有されています。データの変更はオーナーが行います。</div>}
        <div className="page-heading"><div><div className="eyebrow">{view==="overview"?"YOUR WORK, IN PERSPECTIVE":`WORKSPACE / ${view.toUpperCase()}`}</div><h1>{viewTitle}</h1><p>{subtitle}</p></div><div className="page-heading-actions">{view==="overview"?<><button className="btn" onClick={()=>setModal("share")}><Users size={15}/>共有</button>{button("task","記録を追加")}</>:view==="projects"?button("project"):view==="tasks"?button("task"):view==="reports"?button("report","週次報告を作成"):view==="time"?button("time","工数を記録"):view==="notes"?button("note"):null}</div></div>
        <div className="context-row"><div className="context-date"><CalendarDays size={15}/>{new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"long",day:"numeric",weekday:"long"}).format(new Date(today+"T12:00:00+09:00"))}<span className="tiny-divider"/><span className="week-label">第{Math.ceil((Number(today.slice(8))+new Date(today.slice(0,8)+"01T12:00:00+09:00").getUTCDay())/7)}週</span></div><div className={`sync-status ${isSample?"sample":sync}`}><i/>{isSample?"サンプルデータ":mode==="loading"?"読み込み中":mode==="error"?"接続を確認してください":sync==="live"?"リアルタイム同期中":sync==="offline"?"再接続しています":"接続中"}{busy&&<LoaderCircle size={12} className="spin"/>}</div></div>

        {view==="overview"&&<>
          <section className="weekly-brief"><div className="weekly-brief-heading"><div><span className="eyebrow">THIS WEEK'S UPDATE</span><h2>{latestReport?.title??"今週の進みを、チームに伝える。"}</h2>{latestReport&&<p>{dateLabel(latestReport.start)} — {dateLabel(latestReport.end)} · 最新の報告</p>}</div>{latestReport?<button className="text-btn" onClick={()=>setReadReport(latestReport)}>報告を読む<ArrowUpRight size={15}/></button>:button("report","今週の報告を書く")}</div>{latestReport?<div className="brief-columns">{[["実績・できたこと",latestReport.done],["課題・相談したいこと",latestReport.blockers],["次に取り組むこと",latestReport.next]].map(([title,text])=><div key={title}><h3>{title}</h3><p>{text||"記録なし"}</p></div>)}</div>:<p className="weekly-brief-empty">完了したタスクから実績を下書きできます。課題と次の予定を添えて、仕事の現在地を共有しましょう。</p>}</section>
          <div className="section-top"><h2>ワークサマリー</h2><label className="period-select"><CalendarDays size={13}/><select aria-label="集計期間" value={period} onChange={e=>setPeriod(e.target.value)}><option value="week">今週</option><option value="month">今月</option></select></label></div>
          <div className="stats-grid">
            <Stat title="進行中の案件" value={String(active.filter(p=>progress(w,p.id)<100).length)} unit="件" icon={<FolderKanban size={18}/>} color="green" detail={`全 ${w.projects.length} 件のプロジェクト`} />
            <Stat title="タスク完了率" value={String(w.tasks.length?Math.round(done/w.tasks.length*100):0)} unit="%" icon={<CircleCheck size={18}/>} color="purple" detail={`${done} / ${w.tasks.length} タスクが完了`} progress={w.tasks.length?done/w.tasks.length*100:0}/>
            <Stat title={`${period==="week"?"今週":"今月"}の実績工数`} value={hours(totalHours)} unit="h" icon={<Clock3 size={18}/>} color="blue" detail={`${dateLabel(rangeStart)} – ${dateLabel(today)} の記録`} />
            <Stat title="期限が近いタスク" value={String(dueTasks.length)} unit="件" icon={<Flag size={18}/>} color="orange" detail={overdue.length?`うち ${overdue.length} 件の期限を要確認`:"これから7日以内のタスク"} warning={overdue.length>0}/>
          </div>
          <div className="dashboard-grid">
            <Panel title="プロジェクトの進捗" sub="案件ごとの進み具合をチェック" action={<button className="text-btn" onClick={()=>navigate("projects")}>すべて見る<ArrowRight size={14}/></button>} className="projects-panel">
              {active.length?projectRows(active.slice(0,4)):<Empty title="最初の案件を追加しましょう" description="プロジェクトを作ると、タスクと工数をまとめて管理できます。" action={button("project")}/>}
              <div className="panel-footer"><span><span className="legend-dot green"/>順調 <span className="legend-dot orange"/>要確認</span><span>完了タスク数から進捗を自動集計</span></div>
            </Panel>
            <Panel title="今日のフォーカス" sub="まずは、ここから。" action={<span className="count-pill">{focus.length}</span>} className="focus-panel">
              {focus.length?<div className="focus-list">{focus.map(t=><div className="focus-item" key={t.id}><button className={`task-check ${t.status==="done"?"checked":""}`} disabled={!canEdit||busy} aria-label={`${t.title}を完了にする`} onClick={()=>toggle(t)}>{t.status==="done"&&<Check size={13}/>}</button><div><button className="focus-title" onClick={()=>canEdit?open("task",t):navigate("tasks")}>{t.title}</button><small><span className={`legend-dot ${getProject(t.projectId)?.color}`}/>{getProject(t.projectId)?.name}</small><div className="focus-tags"><span className={`badge ${t.due&&t.due<today?"red":t.due===today?"amber":"neutral"}`}>{!t.due?"期限なし":t.due<today?"期限超過":t.due===today?"今日まで":`${dateLabel(t.due)} まで`}</span>{t.priority==="high"&&<span className="priority"><Flag size={10}/>優先度 高</span>}</div></div></div>)}</div>:<Empty title="急ぎのタスクはありません" description="次の一歩をタスクに残しましょう。"/>}
              <button className="focus-footer" onClick={()=>navigate("tasks")}>タスクボードを開く<ArrowUpRight size={14}/></button>
            </Panel>
            <Panel title="時間の使い方" sub="過去7日間の実績工数" action={<button className="text-btn" onClick={()=>navigate("time")}>詳細<ArrowRight size={14}/></button>} className="chart-panel"><TimeChart w={w} today={today}/><div className="chart-legend">{active.slice(0,4).map(p=><span key={p.id}><i className={`legend-dot ${p.color}`}/>{p.name.split(" ")[0]}</span>)}</div></Panel>
            <Panel title="最近のアクティビティ" sub="日々の積み重ね" className="activity-panel"><div className="activity-list">{w.activity.length?w.activity.slice(0,4).map(a=><div className="activity-item" key={a.id}><span className={`activity-icon ${a.type==="task"?"green":a.type==="time"?"blue":"purple"}`}>{a.type==="task"?<CheckCheck size={13}/>:a.type==="time"?<Clock3 size={13}/>:<NotebookPen size={13}/>}</span><div><p>{a.text}</p><small>{relative(a.at)}</small></div></div>):<Empty title="記録がここに集まります" description="タスクや工数を記録すると、更新履歴が残ります。"/>}</div></Panel>
          </div>
          <div className="upcoming-strip"><span className="upcoming-icon"><CalendarDays size={21}/></span><div><strong>次のマイルストーン</strong><p>{active.filter(p=>p.due&&p.due>=today).sort((a,b)=>a.due.localeCompare(b.due))[0]?.name??"これからの予定を立てましょう"}</p></div><span className="upcoming-date">{dateLabel(active.filter(p=>p.due&&p.due>=today).sort((a,b)=>a.due.localeCompare(b.due))[0]?.due??"")}</span><button className="text-btn" onClick={()=>navigate("roadmap")}>予定を見る<ArrowRight size={14}/></button></div>
        </>}

        {view==="projects"&&<><div className="section-top"><h2>すべてのプロジェクト <span className="count-pill">{filteredProjects.length}</span></h2><span className="muted small">タスクの完了に合わせて進捗を更新</span></div>{filteredProjects.length?<div className="project-cards">{filteredProjects.map(p=>{const pct=progress(w,p.id);const actual=w.time.filter(t=>t.projectId===p.id).reduce((a,t)=>a+t.hours,0);return <article className="project-card" key={p.id}><div className="project-card-top"><ProjectIcon p={p}/>{canEdit&&<button className="icon-btn" aria-label={`${p.name}を編集`} onClick={()=>open("project",p)}><MoreHorizontal size={18}/></button>}</div><span className="eyebrow">{p.client||"MY PROJECT"}</span><h2><button onClick={()=>goTasks(p)}>{p.name}</button></h2><p>{p.description||"プロジェクトの説明を追加できます。"}</p><div className="project-card-progress"><span>進捗</span><strong>{pct}%</strong></div><div className="progress-track"><i className={p.color} style={{width:`${pct}%`}}/></div><div className="project-card-meta"><span><CalendarDays size={13}/>{dateLabel(p.due)}</span><span><Clock3 size={13}/>{hours(actual)} / {p.budget?`${hours(p.budget)}h`:"未設定"}</span></div><button className="project-card-footer" onClick={()=>goTasks(p)}>{w.tasks.filter(t=>t.projectId===p.id&&t.status==="done").length} / {w.tasks.filter(t=>t.projectId===p.id).length} タスクが完了<ArrowRight size={15}/></button></article>;})}</div>:<Panel title="プロジェクト"><Empty title={query?"検索に一致する案件はありません":"最初の案件を追加しましょう"} description="クライアント、期限、予定工数をひとつにまとめられます。" action={button("project")}/></Panel>}</>}

        {view==="tasks"&&<><div className="filter-bar"><label><FolderKanban size={14}/><select aria-label="プロジェクトで絞り込み" value={projectFilter} onChange={e=>setProjectFilter(e.target.value)}><option value="all">すべてのプロジェクト</option>{w.projects.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label><label><CircleCheck size={14}/><select aria-label="ステータスで絞り込み" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">すべてのステータス</option><option value="todo">未着手</option><option value="doing">進行中</option><option value="done">完了</option></select></label><span className="muted small">{filteredTasks.length} 件のタスク</span></div><div className="kanban">{(["todo","doing","done"] as const).filter(s=>statusFilter==="all"||statusFilter===s).map(status=><section className={`kanban-column ${status}`} key={status}><div className="kanban-heading"><span><i/>{statusLabel[status]} <b>{filteredTasks.filter(t=>t.status===status).length}</b></span>{canEdit&&<button className="icon-btn" aria-label={`${statusLabel[status]}のタスクを追加`} onClick={()=>open("task",undefined,status)}><Plus size={15}/></button>}</div>{filteredTasks.filter(t=>t.status===status).map(t=><article className="task-card" key={t.id}><div className="task-card-project"><span className={`legend-dot ${getProject(t.projectId)?.color}`}/>{getProject(t.projectId)?.name}</div><div className="task-card-title"><button className={`task-check ${status==="done"?"checked":""}`} disabled={!canEdit||busy} onClick={()=>toggle(t)} aria-label={`${t.title}を${status==="done"?"未着手":"完了"}にする`}>{status==="done"&&<Check size={12}/>}</button><button disabled={!canEdit} onClick={()=>open("task",t)}>{t.title}</button></div>{t.description&&<p>{t.description}</p>}<div className="task-card-bottom"><span className={t.due&&t.due<today&&status!=="done"?"late":""}><CalendarDays size={12}/>{dateLabel(t.due)}</span>{t.priority==="high"&&<span className="priority"><Flag size={10}/>高</span>}<span>{hours(t.estimate)}h</span></div></article>)}{!filteredTasks.some(t=>t.status===status)&&<div className="column-empty">タスクはありません</div>}</section>)}</div></>}

        {view==="roadmap"&&<Roadmap w={w} today={today} canEdit={canEdit} open={open}/>}
        {view==="time"&&<><div className="stats-grid compact"><Stat title="今週の実績工数" value={hours(w.time.filter(t=>t.date>=week&&t.date<=today).reduce((a,t)=>a+t.hours,0))} unit="h" icon={<Clock3 size={18}/>} color="green" detail={`${dateLabel(week)} からの合計`}/><Stat title="記録した日数" value={String(new Set(w.time.map(t=>t.date)).size)} unit="日" icon={<CalendarDays size={18}/>} color="blue" detail="すべての工数記録"/><Stat title="総実績工数" value={hours(w.time.reduce((a,t)=>a+t.hours,0))} unit="h" icon={<CheckCheck size={18}/>} color="purple" detail="全プロジェクトの累計"/></div><Panel title="工数の記録" sub="作業に使った時間を、案件ごとに振り返る" action={<button className="text-btn" onClick={()=>{const csv="\uFEFF日付,プロジェクト,実績時間,作業内容\r\n"+w.time.map(t=>[t.date,getProject(t.projectId)?.name??"",t.hours,t.note].map(v=>'"'+String(v).replace(/^[=+@\-]/,"'$&").replaceAll('"','""')+'"').join(",")).join("\r\n");download("michi-time.csv",csv,"text/csv;charset=utf-8");notify("CSVをダウンロードしました");}}><Download size={14}/>CSV</button>}><div className="table-scroll"><table className="records-table"><thead><tr><th>作業日</th><th>プロジェクト</th><th>作業内容</th><th>実績工数</th><th/></tr></thead><tbody>{[...w.time].filter(t=>(t.note+(getProject(t.projectId)?.name??"")).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.date.localeCompare(a.date)).map(t=><tr key={t.id}><td>{dateLabel(t.date)}</td><td><span className={`legend-dot ${getProject(t.projectId)?.color}`}/>{getProject(t.projectId)?.name}</td><td>{t.note||"—"}</td><td className="number">{hours(t.hours)}<small> h</small></td><td>{canEdit&&<button className="icon-btn" aria-label="工数を編集" onClick={()=>open("time",t)}><MoreHorizontal size={17}/></button>}</td></tr>)}</tbody></table>{!w.time.length&&<Empty title="時間の記録をはじめましょう" description="15分単位で、作業した時間と内容を残せます。" action={button("time")}/>}</div></Panel><Panel title="プロジェクト別の工数" className="allocation-panel">{w.projects.length?w.projects.map(p=>{const n=w.time.filter(t=>t.projectId===p.id).reduce((a,t)=>a+t.hours,0);return <div className="allocation-row" key={p.id}><ProjectIcon p={p}/><div><strong>{p.name}</strong><div className="progress-track"><i className={p.color} style={{width:`${p.budget?Math.min(100,n/p.budget*100):0}%`}}/></div></div><span className={p.budget&&n>p.budget?"late":""}>{hours(n)}<small> / {p.budget?hours(p.budget):"未設定"} h</small></span></div>;}):<p className="muted">プロジェクトを追加すると、配分が表示されます。</p>}</Panel></>}

        {view==="reports"&&<><div className="report-intro"><span className="report-illustration"><FileText size={31}/><span><Check size={14}/></span></span><div><span className="eyebrow">A WEEK, WELL TOLD.</span><h2>報告のために、記憶をたどらなくていい。</h2><p>完了したタスクとこれからの予定を、週次報告の下書きに。<br/>ひと言添えて保存すれば、招待したメンバーにも届きます。</p></div>{button("report","今週の報告を書く")}</div><div className="section-top"><h2>保存したレポート <span className="count-pill">{w.reports.length}</span></h2></div>{w.reports.length?<div className="report-cards">{w.reports.filter(r=>(r.title+r.done+r.next+r.blockers).toLowerCase().includes(query.toLowerCase())).map(r=><article className="report-card" key={r.id}><span className="report-date"><FileText size={15}/>{r.start} — {r.end}</span><h2><button onClick={()=>setReadReport(r)}>{r.title}</button></h2><p>{r.done||"実績の記載なし"}</p><div><span className="badge green">共有中</span><button className="text-btn" onClick={()=>setReadReport(r)}>報告を読む<ArrowRight size={14}/></button></div></article>)}</div>:<Panel title="レポート"><Empty title="最初の週次報告をつくりましょう" description="記録したタスクから、今週の実績を自動で下書きします。" action={button("report","週次報告を作成")}/></Panel>}</>}

        {view==="notes"&&<>{w.notes.length?<div className="notes-grid">{w.notes.filter(n=>(n.title+n.body).toLowerCase().includes(query.toLowerCase())).map(n=><article className="note-card" key={n.id}><div className="note-card-top"><NotebookPen size={17}/><span>{dateLabel(localDate(new Date(n.updatedAt)))}</span>{canEdit&&<button className="icon-btn" aria-label={`${n.title}を編集`} onClick={()=>open("note",n)}><MoreHorizontal size={17}/></button>}</div><h2>{n.title}</h2><p>{n.body}</p><span className="note-project"><span className={`legend-dot ${getProject(n.projectId)?.color??"green"}`}/>{getProject(n.projectId)?.name??"ワークスペース全体"}</span></article>)}</div>:<Panel title="メモ"><Empty title="ふと思ったことを、ここに。" description="打ち合わせの記録やアイデアを、案件と一緒に残せます。" action={button("note")}/></Panel>}</>}

        <footer className="main-footer"><span><Mark/><b>michi</b><span>一歩ずつ、仕事を前へ。</span></span><div>{updatedAt&&<span>最終更新 {new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(updatedAt))}</span>}<button onClick={()=>setModal("export")}><Download size={12}/>データを書き出す</button><span>JST</span></div></footer>
      </main>
    </div>
    {editor&&<Editor key={`${editor.kind}-${editor.entry?.id??"new"}`} editor={editor} w={w} busy={busy} onClose={()=>setEditor(null)} onSave={saveEntry} onDelete={deleteEntry}/>}
    {modal==="setup"&&<Modal title="あなたの仕事の場所をつくる" onClose={()=>{if(!busy)setModal(null);}}><p className="modal-copy">ここからの記録はサーバーに保存され、ほかの端末でも続きから使えます。まずはワークスペースに名前をつけましょう。</p><form onSubmit={setup}><label className="field"><span>ワークスペース名</span><input name="name" required maxLength={160} defaultValue="マイワークスペース"/></label><label className="checkbox-label"><input type="checkbox" name="sample"/>説明用のサンプル案件を引き継ぐ</label><p className="form-hint">通常はチェックせず、空のワークスペースから始めてください。所有者として登録したメールアドレスでのみ作成できます。</p><div className="modal-actions"><button className="btn" type="button" disabled={busy} onClick={()=>setModal(null)}>戻る</button><button className="btn primary" disabled={busy}>{busy?<LoaderCircle size={15} className="spin"/>:<ArrowRight size={15}/>}ワークスペースを作成</button></div></form></Modal>}
    {modal==="auth"&&<Modal title="メールのリンクで、すぐにログイン" onClose={()=>setModal(null)}><EmailLogin/></Modal>}
    {modal==="share"&&<Modal title="招待した人と、進捗を共有" onClose={()=>setModal(null)}><div className="share-security"><LockKeyhole size={22}/><div><strong>メール招待 · オーナーのみ編集</strong><p>招待されたメールアドレスでログインした人だけが閲覧できます。URLの所持だけではアクセスできません。</p></div></div><label className="field"><span>ワークスペースのURL</span><div className="copy-field"><input readOnly value={appUrl()}/><button className="btn" onClick={async()=>{try{await navigator.clipboard.writeText(appUrl());notify("URLをコピーしました");}catch{notify("URL欄を選択してコピーしてください",true);}}}><Copy size={14}/>コピー</button></div></label>{mode==="live"&&role==="owner"?<ViewerAccess/>:<div className="invite-instructions"><h3>招待メールからアクセス</h3><p>オーナーが招待すると、ログイン用のメールが届きます。メールのリンクを開くだけで入れます。パスワードの登録は不要です。</p><p>{configured?"閲覧者の招待は、オーナーがワークスペースを作成した後に利用できます。":"現在はサンプルです。招待とメール認証は、接続設定の完了後に利用できます。"}</p></div>}<p className="form-hint">招待した人は、すべての案件・タスク・工数・メモ・報告を閲覧します。</p></Modal>}
    {modal==="help"&&<Modal title="michi のはじめかた" onClose={()=>setModal(null)}><div className="help-steps">{[["01","プロジェクトをつくる","案件名、クライアント、期限、予定工数を登録します。"],["02","タスクで、次の一歩を明確に","作業をタスクに分け、未着手・進行中・完了で管理。完了率は自動で計算されます。"],["03","使った時間とメモを残す","作業した時間と内容を記録。打ち合わせのメモやアイデアも案件ごとにまとめます。"],["04","週次報告をまとめて共有","タスクをもとに下書きを作り、内容を整えて保存。招待した閲覧者にも更新が届きます。"]].map(([n,title,text])=><div key={n}><span>{n}</span><section><h3>{title}</h3><p>{text}</p></section></div>)}</div><p className="form-hint">時刻・日付は日本時間（JST）。保存すると数秒程度で閲覧者へ同期されます。接続状態は画面上部で確認できます。</p></Modal>}
    {modal==="export"&&<Modal title="仕事の記録を持ち出す" onClose={()=>setModal(null)}><p className="modal-copy">JSON にはプロジェクト・タスク・工数・メモ・報告の全データが含まれます。定期的なバックアップにも使えます。</p><button className="export-option" onClick={()=>{download(`michi-backup-${today}.json`,JSON.stringify({version:1,exportedAt:new Date().toISOString(),workspace:w},null,2),"application/json");notify("全データを書き出しました");}}><span className="export-icon"><Download size={21}/></span><span><strong>すべてのデータ · JSON</strong><small>{w.projects.length} 案件 / {w.tasks.length} タスク / {w.time.length} 工数記録</small></span><ArrowRight size={17}/></button><p className="form-hint">工数のCSVは「工数の記録」、報告のMarkdownは各レポートから保存できます。このバージョンにJSONの復元・取り込み機能はありません。</p></Modal>}
    {readReport&&<Modal title={readReport.title} wide onClose={()=>setReadReport(null)}><div className="report-reader"><span className="report-date">{readReport.start} — {readReport.end}</span>{[["今週の実績",readReport.done],["次に取り組むこと",readReport.next],["課題・相談したいこと",readReport.blockers]].map(([title,text])=><section key={title}><h3>{title}</h3><p>{text||"記録なし"}</p></section>)}<div className="report-hours"><Clock3 size={16}/>期間中の実績工数 <b>{hours(w.time.filter(t=>t.date>=readReport.start&&t.date<=readReport.end).reduce((a,t)=>a+t.hours,0))} h</b></div></div><div className="modal-actions">{canEdit&&<button className="btn" onClick={()=>{setReadReport(null);open("report",readReport);}}>編集</button>}<button className="btn primary" onClick={()=>download(`${readReport.start}-report.md`,reportMarkdown(readReport,w),"text/markdown;charset=utf-8")}><Download size={14}/>Markdownで保存</button></div></Modal>}
    {toast&&<div className={`toast ${toast.error?"error":""}`} role={toast.error?"alert":"status"}>{toast.error?<WifiOff size={17}/>:<Check size={17}/>}<span>{toast.message}</span><button aria-label="通知を閉じる" onClick={()=>setToast(null)}><X size={15}/></button></div>}
  </div>;
}

function Stat({title,value,unit,icon,color,detail,progress:pr,warning=false}:{title:string;value:string;unit:string;icon:ReactNode;color:string;detail:string;progress?:number;warning?:boolean}){
  return <article className="stat-card"><div className="stat-top"><span>{title}</span><span className={`stat-icon ${color}`}>{icon}</span></div><div className="stat-number">{value}<small>{unit}</small></div><div className={`stat-detail ${warning?"warning":""}`}>{pr!==undefined&&<span className="mini-progress"><i style={{width:`${pr}%`}}/></span>}{warning&&<span className="warning-dot"/>}{detail}</div></article>;
}
function TimeChart({w,today}:{w:Workspace;today:string}){
  const days=Array.from({length:7},(_,i)=>shiftDate(today,i-6));
  const total=w.time.filter(t=>days.includes(t.date)).reduce((a,t)=>a+t.hours,0);
  const max=Math.max(8,...days.map(d=>w.time.filter(t=>t.date===d).reduce((a,t)=>a+t.hours,0)));
  return <div className="time-chart"><div className="chart-total"><strong>{hours(total)}<small>h</small></strong><span>過去7日間の合計</span></div><div className="bar-chart" role="img" aria-label={`過去7日間の作業時間 合計${hours(total)}時間`}><div className="chart-axis">{[max,max/2,0].map(n=><span key={n}>{hours(n)}h</span>)}</div><div className="chart-bars">{days.map(d=>{const values=w.projects.map(p=>({p,h:w.time.filter(t=>t.date===d&&t.projectId===p.id).reduce((a,t)=>a+t.hours,0)}));const all=values.reduce((a,v)=>a+v.h,0);return <div className={`bar-column ${d===today?"today":""}`} key={d}><div className="bar-well" title={`${dateLabel(d)}: ${hours(all)}時間`}><div className="bar-stack">{values.filter(v=>v.h>0).map(({p,h})=><div key={p.id} className={`bar ${p.color}`} style={{height:`${h/max*100}%`}}/>)}</div></div><span>{new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",weekday:"short"}).format(new Date(d+"T12:00:00+09:00"))}<small>{dateLabel(d)}</small></span></div>;})}</div></div></div>;
}
function Roadmap({w,today,canEdit,open}:{w:Workspace;today:string;canEdit:boolean;open:(kind:Kind,entry?:Entry)=>void}){
  const due=[...w.projects.filter(p=>p.due).map(p=>({id:p.id,date:p.due,title:p.name,sub:p.client,kind:"project" as const,entry:p,color:p.color,done:progress(w,p.id)===100})),...w.tasks.filter(t=>t.due&&t.status!=="done").map(t=>({id:t.id,date:t.due,title:t.title,sub:w.projects.find(p=>p.id===t.projectId)?.name??"",kind:"task" as const,entry:t,color:w.projects.find(p=>p.id===t.projectId)?.color??"green",done:false}))].sort((a,b)=>a.date.localeCompare(b.date));
  const groups=[{title:"期限を確認",items:due.filter(d=>d.date<today&&!d.done),tone:"amber"},{title:"今週・来週の予定",items:due.filter(d=>d.date>=today&&d.date<=shiftDate(today,14)),tone:"green"},{title:"その先の予定",items:due.filter(d=>d.date>shiftDate(today,14)),tone:"blue"}];
  return <div className="roadmap">{due.length?groups.map(g=><Panel key={g.title} title={g.title} action={<span className={`badge ${g.tone}`}>{g.items.length} 件</span>}>{g.items.length?g.items.map(d=><div className="roadmap-item" key={d.id}><span className={`roadmap-date ${d.date<today&&!d.done?"late":""}`}><strong>{dateLabel(d.date)}</strong><small>{d.kind==="project"?"案件期限":"タスク期限"}</small></span><span className={`roadmap-line ${d.color}`}/><div><span className="muted small">{d.sub}</span><h3>{d.title}</h3></div><span className={`badge ${d.done?"green":d.date<today?"amber":"neutral"}`}>{d.done?"完了":d.date<today?"要確認":d.date===today?"今日":`あと ${Math.round((Date.parse(d.date)-Date.parse(today))/86400000)} 日`}</span>{canEdit&&<button className="icon-btn" aria-label={`${d.title}を編集`} onClick={()=>open(d.kind,d.entry)}><MoreHorizontal size={18}/></button>}</div>):<div className="roadmap-empty">この期間に予定はありません。</div>}</Panel>):<Panel title="これからの予定"><Empty title="予定を見渡せる場所" description="プロジェクトやタスクに期限を設定すると、時系列で表示されます。"/></Panel>}</div>;
}





