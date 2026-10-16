import { createClient } from "npm:@supabase/supabase-js@2.118.0";
// Public deployment configuration, not a credential. Match the actual Pages URL.
const APP_URL=Deno.env.get("APP_URL")||"https://osakana812.github.io/michi-dashboard/";
const allowedOrigin=new URL(APP_URL).origin;
const headers={"Access-Control-Allow-Origin":allowedOrigin,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin","Cache-Control":"no-store"};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers});
Deno.serve(async(request:Request)=>{
  if(request.headers.get("origin") && request.headers.get("origin")!==allowedOrigin)return json({error:"このオリジンからは利用できません"},403);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(request.method!=="POST")return json({error:"POSTを使用してください"},405);
  const authorization=request.headers.get("authorization");
  if(!authorization?.startsWith("Bearer "))return json({error:"ログインが必要です"},401);
  const url=Deno.env.get("SUPABASE_URL")!,secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await admin.auth.getUser(authorization.slice(7));
  if(authError||!user)return json({error:"ログインをやり直してください"},401);
  const {data:workspace,error:workspaceError}=await admin.from("workspaces").select("owner_id").eq("id","main").maybeSingle();
  if(workspaceError||workspace?.owner_id!==user.id)return json({error:"オーナーだけが招待できます"},403);
  let email:string;
  try{const value=await request.json();email=String(value.email??"").trim().toLowerCase();}catch{return json({error:"メールアドレスを確認してください"},400);}
  if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))return json({error:"メールアドレスを確認してください"},400);
  if(email===user.email?.toLowerCase())return json({error:"オーナー自身の招待は不要です"},400);
  const {data:existing,error:readError}=await admin.from("workspace_members").select("last_invited_at").eq("workspace_id","main").eq("email",email).maybeSingle();
  if(readError)return json({error:"招待情報を取得できませんでした"},503);
  if(existing?.last_invited_at && Date.now()-Date.parse(existing.last_invited_at)<60000)return json({error:"再送する場合は1分ほどお待ちください"},429);
  const {error:grantError}=await admin.from("workspace_members").upsert({workspace_id:"main",email,last_invited_at:new Date().toISOString()},{onConflict:"workspace_id,email"});
  if(grantError)return json({error:"閲覧権限を登録できませんでした"},503);
  const {error:inviteError}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:APP_URL});
  if(inviteError){
    if(/already.*registered|already.*exists/i.test(inviteError.message)){
      const publicClient=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
      const {error}=await publicClient.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:APP_URL}});
      if(!error)return json({success:true});
    }
    return json({error:"閲覧権限は登録しましたが、メールを送信できませんでした。メール送信（SMTP）設定を確認して再送してください。"},502);
  }
  return json({success:true});
});
