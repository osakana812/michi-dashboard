import { z } from "zod";
const id = z.string().min(1).max(80);
const short = z.string().trim().min(1).max(160);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, "正しい日付を入力してください");
const optionalDate = z.union([date, z.literal("")]);
export const projectSchema = z.object({
  id, name: short, client: z.string().max(100), due: optionalDate,
  budget: z.number().min(0).max(100000), color: z.enum(["green", "purple", "blue", "orange"]),
  archived: z.boolean(), description: z.string().max(4000),
});
export const taskSchema = z.object({
  id, title: short, projectId: id, status: z.enum(["todo", "doing", "done"]),
  priority: z.enum(["high", "medium", "low"]), due: optionalDate,
  estimate: z.number().min(0).max(10000), description: z.string().max(4000), completedAt: z.string().max(40),
});
export const timeSchema = z.object({id, projectId: id, date, hours: z.number().positive().max(24), note: z.string().max(2000)});
export const noteSchema = z.object({id, title: short, body: z.string().max(12000), projectId: z.string().max(80), updatedAt: z.string().max(40)});
export const reportSchema = z.object({
  id, title: short, start: date, end: date, done: z.string().max(12000), next: z.string().max(12000),
  blockers: z.string().max(12000), createdAt: z.string().max(40),
}).refine(r => r.end >= r.start, "終了日は開始日以降にしてください");
export const activitySchema = z.object({id, text: z.string().max(250), at: z.string().max(40), type: z.enum(["task", "project", "time", "report", "note"])});
export const workspaceSchema = z.object({
  name: short, projects: z.array(projectSchema).max(100), tasks: z.array(taskSchema).max(1500),
  time: z.array(timeSchema).max(3000), notes: z.array(noteSchema).max(500), reports: z.array(reportSchema).max(300), activity: z.array(activitySchema).max(80),
}).superRefine((data, ctx) => {
  for (const [key, items] of Object.entries({projects:data.projects,tasks:data.tasks,time:data.time,notes:data.notes,reports:data.reports})) {
    if(new Set(items.map(x=>x.id)).size !== items.length) ctx.addIssue({code:"custom",message:"IDが重複しています",path:[key]});
  }
  const projects = new Set(data.projects.map(p=>p.id));
  for (const item of [...data.tasks,...data.time,...data.notes]) {
    if(item.projectId && !projects.has(item.projectId)) ctx.addIssue({code:"custom",message:"存在しない案件への参照です"});
  }
});
export type Workspace = z.infer<typeof workspaceSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Task = z.infer<typeof taskSchema>;
export type TimeEntry = z.infer<typeof timeSchema>;
export type Note = z.infer<typeof noteSchema>;
export type Report = z.infer<typeof reportSchema>;
export type Kind = "project" | "task" | "time" | "note" | "report";
export type Snapshot = { workspace: Workspace | null; revision: number; updatedAt: string; role: "owner" | "viewer"; ownerName: string };
export function localDate(date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
}
export function shiftDate(date: string, days: number) {
  const d = new Date(date + "T12:00:00+09:00"); d.setUTCDate(d.getUTCDate()+days); return localDate(d);
}
export function monday(date: string) {
  const day = new Date(date + "T12:00:00+09:00").getUTCDay(); return shiftDate(date, -(day===0?6:day-1));
}
export function emptyWorkspace(name: string): Workspace { return {name,projects:[],tasks:[],time:[],notes:[],reports:[],activity:[]}; }
export function progress(w: Workspace, projectId: string) {
  const tasks=w.tasks.filter(t=>t.projectId===projectId); return tasks.length?Math.round(tasks.filter(t=>t.status==="done").length/tasks.length*100):0;
}
export function reportMarkdown(report: Report, workspace: Workspace) {
  const hours=workspace.time.filter(t=>t.date>=report.start && t.date<=report.end).reduce((a,b)=>a+b.hours,0);
  return `# ${report.title}\n\n${workspace.name} | ${report.start} 〜 ${report.end}\n\n## 今週の実績\n\n${report.done || "記録なし"}\n\n## 次に取り組むこと\n\n${report.next || "記録なし"}\n\n## 課題・相談したいこと\n\n${report.blockers || "なし"}\n\n## 実績工数\n\n${hours.toFixed(1)} 時間\n`;
}
export function sampleWorkspace(today: string): Workspace {
  const start = monday(today);
  const projects: Project[] = [
    {id:"p1",name:"コーポレートサイト リニューアル",client:"株式会社 北星デザイン",due:shiftDate(today,10),budget:80,color:"green",archived:false,description:"企業の魅力が伝わる、使いやすいウェブサイトへ。"},
    {id:"p2",name:"顧客管理システム 改善",client:"合同会社 スタジオノート",due:shiftDate(today,18),budget:60,color:"purple",archived:false,description:"業務フローを整理して、チームが使いやすいシステムに。"},
    {id:"p3",name:"ブランドガイドライン 制作",client:"社内プロジェクト",due:shiftDate(today,5),budget:32,color:"blue",archived:false,description:"チームの表現をひとつにまとめるデザインガイド。"},
  ];
  const titles=["トップページのデザインを仕上げる","下層ページのワイヤーフレーム","問い合わせフォームの実装","既存サイトの調査","要件と構成の整理","デザイン方針の合意","サイトマップの作成","素材の整理","顧客一覧の検索機能を実装","権限の設計をレビュー","現状の業務フローを整理","改善内容の優先順位づけ","チームヒアリング","ロゴの使用ルールをまとめる","カラーシステムを定義","ブランドの方向性を整理","キックオフミーティング"];
  const tasks:Task[]=titles.map((title,i)=>({id:`t${i}`,title,projectId:i<8?"p1":i<13?"p2":"p3",status:[0,2,8,13].includes(i)?"doing":[1,9,14].includes(i)?"todo":"done",priority:[0,8,13].includes(i)?"high":"medium",due:shiftDate(today,i===13?-1:i===0?0:i===8?1:3+(i%4)),estimate:i%3+1,description:"",completedAt:[0,1,2,8,9,13,14].includes(i)?"":new Date(start+"T12:00:00+09:00").toISOString()}));
  const time:TimeEntry[]=Array.from({length:5},(_,i)=>({id:`l${i}`,projectId:i%2?"p2":"p1",date:shiftDate(start,i),hours:[4.5,6,3.5,7,4][i],note:["要件整理・デザイン検討","顧客一覧の検索機能","トップページの制作","実装とレビュー","デザインの調整"][i]})).filter(t=>t.date<=today);
  return {name:"マイワークスペース",projects,tasks,time,notes:[{id:"n1",title:"次回の定例で話したいこと",body:"・トップページのデザイン方針を確認\n・素材のご提供スケジュール\n・公開に向けたレビューの進め方",projectId:"p1",updatedAt:new Date().toISOString()},{id:"n2",title:"検索機能の改善アイデア",body:"よく使う検索条件を保存できると便利そう。次のヒアリングで確かめる。",projectId:"p2",updatedAt:new Date().toISOString()}],reports:[{id:"r1",title:"今週の進捗まとめ",start,end:shiftDate(start,6),done:"・サイトの構成とデザイン方針を整理\n・顧客管理システムの業務フローを確認",next:"・トップページのデザインを仕上げる\n・検索機能の実装とレビュー",blockers:"サイトに使用する素材の確認待ち。次の定例で公開日程をすり合わせます。",createdAt:new Date().toISOString()}],activity:[{id:"a1",text:"「トップページのデザインを仕上げる」を進行中に変更",at:new Date(Date.now()-25*60000).toISOString(),type:"task"},{id:"a2",text:"コーポレートサイトに工数を記録",at:new Date(Date.now()-80*60000).toISOString(),type:"time"},{id:"a3",text:"「次回の定例で話したいこと」を追加",at:new Date(Date.now()-180*60000).toISOString(),type:"note"}]};
}

