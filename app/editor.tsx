"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, Trash2, LoaderCircle } from "lucide-react";
import { localDate, monday, shiftDate, type Kind, type Workspace, type Project, type Task, type TimeEntry, type Note, type Report } from "@/lib/model";
export type Entry = Project | Task | TimeEntry | Note | Report;
export type EditorState = {kind:Kind;entry?:Entry;projectId?:string;status?:Task["status"]};
export function Modal({title,children,onClose,wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const d=ref.current;d?.showModal();return()=>d?.close();},[]);
  return <dialog ref={ref} className={`modal ${wide?"wide":""}`} onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="modal-heading"><div><span className="eyebrow">MICHI WORKSPACE</span><h2>{title}</h2></div><button className="icon-btn" aria-label="閉じる" onClick={onClose}><X size={19}/></button></div>{children}
  </dialog>;
}
const names={project:"プロジェクト",task:"タスク",time:"工数",note:"メモ",report:"週次報告"};
export default function Editor({editor,w,onClose,onSave,onDelete,busy}:{editor:EditorState;w:Workspace;onClose:()=>void;onSave:(entry:Entry)=>Promise<boolean>;onDelete:()=>Promise<boolean>;busy:boolean}){
  const {kind,entry}=editor;
  const r=(entry??{}) as unknown as Record<string,string|number|boolean>;
  const today=localDate(),start=monday(today),end=shiftDate(start,6);
  const [deleting,setDeleting]=useState(false);
  const [error,setError]=useState("");
  const done=w.tasks.filter(t=>t.status==="done"&&t.completedAt&&localDate(new Date(t.completedAt))>=start&&localDate(new Date(t.completedAt))<=end).map(t=>`・${t.title}`).join("\n");
  const next=w.tasks.filter(t=>t.status!=="done").slice(0,8).map(t=>`・${t.title}`).join("\n");
  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();setError("");const f=new FormData(e.currentTarget);const text=(name:string)=>String(f.get(name)??"").trim();const num=(name:string)=>Number(f.get(name)??0);
    const base={id:entry?.id??crypto.randomUUID()};let value:Entry;
    if(kind==="project")value={...base,name:text("name"),client:text("client"),due:text("due"),budget:num("budget"),color:text("color") as Project["color"],description:text("description"),archived:r.archived===true};
    else if(kind==="task")value={...base,title:text("title"),projectId:text("projectId"),status:text("status") as Task["status"],priority:text("priority") as Task["priority"],due:text("due"),estimate:num("estimate"),description:text("description"),completedAt:text("status")==="done"?(String(r.completedAt||new Date().toISOString())):""};
    else if(kind==="time")value={...base,projectId:text("projectId"),date:text("date"),hours:num("hours"),note:text("note")};
    else if(kind==="note")value={...base,title:text("title"),body:text("body"),projectId:text("projectId"),updatedAt:new Date().toISOString()};
    else value={...base,title:text("title"),start:text("start"),end:text("end"),done:text("done"),next:text("next"),blockers:text("blockers"),createdAt:String(r.createdAt||new Date().toISOString())};
    if(await onSave(value))onClose();else setError("保存できませんでした。入力内容は保持されています。通知を確認して再試行してください。");
  }
  const field=(label:string,name:string,options:{type?:string;required?:boolean;defaultValue?:string|number;step?:string;min?:number;max?:number;placeholder?:string}={})=><label className="field"><span>{label}{options.required&&<i> *</i>}</span><input name={name} defaultValue={String(r[name]??options.defaultValue??"")} maxLength={options.type==="number"||options.type==="date"?undefined:160} {...Object.fromEntries(Object.entries(options).filter(([k])=>k!=="defaultValue"))}/></label>;
  const area=(label:string,name:string,defaultValue="",rows=3)=><label className="field"><span>{label}</span><textarea name={name} defaultValue={String(r[name]??defaultValue)} rows={rows} maxLength={kind==="report"||name==="body"?12000:kind==="time"?2000:4000}/></label>;
  const projectSelect=<label className="field"><span>プロジェクト{kind!=="note"&&<i> *</i>}</span><select aria-label="プロジェクト" name="projectId" required={kind!=="note"} defaultValue={String(r.projectId??editor.projectId??(kind==="note"?"":w.projects.find(p=>!p.archived)?.id??""))}>{kind==="note"&&<option value="">ワークスペース全体</option>}{w.projects.filter(p=>!p.archived||p.id===r.projectId).map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>;
  return <Modal title={`${names[kind]}を${entry?"編集":"追加"}`} onClose={()=>{if(!busy)onClose();}} wide={kind==="report"}>
    <form onSubmit={submit}>
      {kind==="project"&&<>{field("プロジェクト名","name",{required:true,placeholder:"例：サービスサイトの改善"})}{field("クライアント・所属","client",{placeholder:"例：株式会社〇〇 / 社内"})}<div className="form-grid">{field("期限","due",{type:"date"})}{field("予定工数（時間）","budget",{type:"number",min:0,max:100000,step:"0.25"})}</div><label className="field"><span>テーマカラー</span><select aria-label="テーマカラー" name="color" defaultValue={String(r.color??"green")}><option value="green">グリーン</option><option value="purple">パープル</option><option value="blue">ブルー</option><option value="orange">オレンジ</option></select></label>{area("概要・ゴール","description")}</>}
      {kind==="task"&&<>{field("タスク名","title",{required:true})}{projectSelect}<div className="form-grid"><label className="field"><span>ステータス</span><select aria-label="ステータス" name="status" defaultValue={String(r.status??editor.status??"todo")}><option value="todo">未着手</option><option value="doing">進行中</option><option value="done">完了</option></select></label><label className="field"><span>優先度</span><select aria-label="優先度" name="priority" defaultValue={String(r.priority??"medium")}><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label></div><div className="form-grid">{field("期限","due",{type:"date"})}{field("見積もり（時間）","estimate",{type:"number",min:0,max:10000,step:"0.25"})}</div>{area("詳細・メモ","description")}</>}
      {kind==="time"&&<>{projectSelect}<div className="form-grid">{field("作業日","date",{required:true,type:"date",defaultValue:today})}{field("実績工数（時間）","hours",{required:true,type:"number",min:0.25,max:24,step:"0.25",defaultValue:1})}</div>{area("作業内容","note")}</>}
      {kind==="note"&&<>{field("タイトル","title",{required:true})}{projectSelect}{area("メモ","body","",8)}</>}
      {kind==="report"&&<><p className="form-hint">今週の完了タスクと、これからのタスクを下書きにしました。共有前に内容を整えてください。期間を変えた場合は本文も見直してください。</p>{field("報告タイトル","title",{required:true,defaultValue:`週次報告 ${start.slice(5).replace("-","/")} – ${end.slice(5).replace("-","/")}`})}<div className="form-grid">{field("対象期間の開始","start",{required:true,type:"date",defaultValue:start})}{field("対象期間の終了","end",{required:true,type:"date",defaultValue:end})}</div>{area("実績・できたこと","done",done,5)}{area("次に取り組むこと","next",next,4)}{area("課題・相談したいこと","blockers","",3)}</>}
      {error&&<p className="form-error" role="alert">{error}</p>}
      {deleting&&<div className="delete-confirm"><p>{kind==="project"?"この案件と関連するタスク・工数・メモを削除します。保存済みの週次報告の本文は残ります。":"この記録を削除します。"}</p><button type="button" className="btn danger" disabled={busy} onClick={async()=>{if(await onDelete())onClose();}}>削除する</button><button type="button" className="btn" onClick={()=>setDeleting(false)}>戻る</button></div>}
      <div className="modal-actions">{entry&&<button type="button" className="icon-btn delete" aria-label="削除" disabled={busy} onClick={()=>setDeleting(true)}><Trash2 size={17}/></button>}<span className="spacer"/><button type="button" className="btn" disabled={busy} onClick={onClose}>キャンセル</button><button className="btn primary" type="submit" disabled={busy}>{busy&&<LoaderCircle size={15} className="spin"/>}{kind==="report"?"報告を保存":"保存する"}</button></div>
    </form>
  </Modal>;
}


