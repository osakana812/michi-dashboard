import { createClient, type User } from "@supabase/supabase-js";
import { workspaceSchema, type Snapshot, type Workspace } from "./model";
const url=import.meta.env.VITE_SUPABASE_URL as string|undefined;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string|undefined;
export const configured=Boolean(url&&key);
// This is a PUBLIC publishable key; secret/service-role keys never belong here.
export const supabase=configured?createClient(url!,key!,{
  auth:{flowType:"implicit",detectSessionInUrl:true,persistSession:true,autoRefreshToken:true},
}):null;
export function appUrl(){return new URL(import.meta.env.BASE_URL,window.location.origin).href;}
export type AppUser={id:string;name:string;email:string};
export function appUser(user:User|null):AppUser|null{
  if(!user)return null;
  return{id:user.id,name:String(user.user_metadata?.full_name||user.email?.split("@")[0]||"メンバー"),email:user.email??""};
}
export class AccessError extends Error{}
export class ConflictError extends Error{}
function client(){if(!supabase)throw new Error("接続設定がまだ完了していません。現在はサンプル表示です。");return supabase;}
function errorMessage(error:{code?:string;message:string}):never{
  if(error.code==="42501")throw new AccessError("このワークスペースへの招待、または編集権限がありません。");
  if(error.code==="40001")throw new ConflictError("別の画面で更新されました。最新の内容を確認して、もう一度保存してください。");
  if(error.code==="23505")throw new Error("ワークスペースは作成済みです。画面を再読み込みしてください。");
  if(error.code==="22023")throw new Error("入力内容を確認してください。"+error.message);
  throw new Error("接続先から応答を取得できませんでした。入力内容は保持されています。");
}
function snapshot(value:unknown):Snapshot{
  const s=value as Snapshot;
  if(!s||!Number.isInteger(s.revision)||!["owner","viewer"].includes(s.role))throw new Error("応答の形式を確認できませんでした。");
  if(s.workspace)s.workspace=workspaceSchema.parse(s.workspace);
  return s;
}
export async function readWorkspace(){const {data,error}=await client().rpc("read_workspace");if(error)errorMessage(error);return snapshot(data);}
export async function initializeWorkspace(workspace:Workspace){const {data,error}=await client().rpc("create_workspace",{p_data:workspaceSchema.parse(workspace)});if(error)errorMessage(error);return snapshot(data);}
export async function saveWorkspace(revision:number,workspace:Workspace){const {data,error}=await client().rpc("save_workspace",{p_revision:revision,p_data:workspaceSchema.parse(workspace)});if(error)errorMessage(error);return snapshot(data);}
export function watchWorkspace(onChange:()=>void,onStatus:(status:"connecting"|"live"|"offline")=>void){
  const c=client();
  const channel=c.channel("michi-workspace").on("postgres_changes",{event:"UPDATE",schema:"public",table:"workspaces",filter:"id=eq.main"},onChange).subscribe(status=>{
    onStatus(status==="SUBSCRIBED"?"live":status==="CHANNEL_ERROR"||status==="TIMED_OUT"||status==="CLOSED"?"offline":"connecting");
    if(status==="SUBSCRIBED")onChange();
  });
  return()=>{void c.removeChannel(channel);};
}
export async function sendLoginLink(email:string){
  const {error}=await client().auth.signInWithOtp({email:email.trim(),options:{shouldCreateUser:false,emailRedirectTo:appUrl()}});
  // Do not reveal whether an address has an account.
  if(error&&!/signups? (?:are |is )?not allowed/i.test(error.message))throw new Error(error.status===429?"少し時間をおいてから、もう一度お試しください。":"メールを送信できませんでした。接続先またはメール送信設定を確認してください。");
}
export async function signOut(){const {error}=await client().auth.signOut();if(error)throw error;}
export type Viewer={email:string;created_at:string};
export async function listViewers(){const {data,error}=await client().from("workspace_members").select("email,created_at").eq("workspace_id","main").order("created_at");if(error)errorMessage(error);return data as Viewer[];}
export async function inviteViewer(email:string){const {data,error}=await client().functions.invoke("invite-viewer",{body:{email:email.trim()}});if(error){let message="招待メールを送信できませんでした。設定を確認して再試行してください。";try{const details=await error.context?.json();if(details?.error)message=details.error;}catch{}throw new Error(message);}if(data?.error)throw new Error(data.error);}
export async function removeViewer(email:string){const {error}=await client().rpc("remove_viewer",{p_email:email});if(error)errorMessage(error);}
