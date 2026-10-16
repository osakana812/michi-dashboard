import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "./dashboard";
import { supabase,appUser,type AppUser } from "@/lib/backend";
import "./globals.css";
function App(){
  const [user,setUser]=useState<AppUser|null>(null),[ready,setReady]=useState(!supabase);
  const [authError,setAuthError]=useState("");
  useEffect(()=>{
    if(!supabase)return;
    let alive=true;
    void supabase.auth.getSession().then(({data,error})=>{if(alive){setUser(appUser(data.session?.user??null));if(error)setAuthError("ログイン情報を確認できませんでした。メールのリンクが期限切れの場合は、新しいリンクを送ってください。");setReady(true);}}).catch(()=>{if(alive){setAuthError("ログイン情報を確認できませんでした。接続を確認して、もう一度ログインしてください。");setReady(true);}});
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>{if(alive){setUser(appUser(session?.user??null));setReady(true);}});
    return()=>{alive=false;data.subscription.unsubscribe();};
  },[]);
  if(!ready)return <div className="auth-loading">サインイン情報を確認しています…</div>;
  return <Dashboard key={user?.id??"demo"} user={user} authError={authError}/>;
}
createRoot(document.getElementById("root")!).render(<App/>);
