import React, { useEffect, useState } from "react";
import { AdminPanel } from "./admin/AdminPanel";
import { US } from "./core/store";
import { C } from "./core/theme";
import { Dashboard } from "./dashboard/Dashboard";
import { AcceptInvite, Login, ResetPassword } from "./ui/login";

// ══════════════════════════════════════════════
// ROOT
// ══════════════════════════════════════════════

class ErrBoundary extends React.Component {
  constructor(p){super(p);this.state={err:null};}
  static getDerivedStateFromError(e){return{err:e};}
  render(){
    if(this.state.err) return(
      <div style={{background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"monospace",color:C.text,gap:16,padding:20}}>
        <div style={{fontSize:32}}>⚠︎</div>
        <div style={{color:C.gold,fontSize:16,fontWeight:700}}>EcoScope encountered an error</div>
        <div style={{color:C.mid,fontSize:12,maxWidth:500,textAlign:"center"}}>{this.state.err.message}</div>
        <button onClick={()=>{localStorage.clear();window.location.reload();}} style={{background:C.gold,color:C.onGold,border:"none",borderRadius:6,padding:"10px 20px",fontSize:12,fontWeight:700,cursor:"pointer",marginTop:8}}>
          Clear Session &amp; Reload
        </button>
      </div>
    );
    return this.props.children;
  }
}
export default function App() {
  const [user,setUser]=useState(null);
  const [booting,setBooting]=useState(true);
  const [expired,setExpired]=useState(false);
  const [invite,setInvite]=useState(()=>{ try { const v=new URLSearchParams(window.location.search).get("invite"); return v&&/^[a-f0-9]{40}$/.test(v)?v:null; } catch(e){ return null; } });
  const [reset,setReset]=useState(()=>{ try { const v=new URLSearchParams(window.location.search).get("reset"); return v&&/^[a-f0-9]{64}$/.test(v)?v:null; } catch(e){ return null; } });
  const clearReset=()=>{ try { const url=new URL(window.location.href); url.searchParams.delete("reset"); window.history.replaceState(null,"",url.pathname+url.search+url.hash); } catch(e){} setReset(null); };
  const clearInvite=()=>{ try { const url=new URL(window.location.href); url.searchParams.delete("invite"); window.history.replaceState(null,"",url.pathname+url.search+url.hash); } catch(e){} setInvite(null); };
  useEffect(()=>{ const f=()=>{ localStorage.removeItem(US.SESS); setUser(null); setExpired(true); }; window.addEventListener('ecoscope-auth-expired',f); return ()=>window.removeEventListener('ecoscope-auth-expired',f); },[]);

  useEffect(()=>{
    try{
      const sess=JSON.parse(localStorage.getItem(US.SESS)||"null");
      if(sess?.username && !sess.token){ localStorage.removeItem(US.SESS); setExpired(true); }
      else if(sess?.username){
        const initials=sess.username.slice(0,2).toUpperCase();
        const avatarColor=["#6ea8fe","#3ecf8e","#f0a950","#b39ddb","#56c7d4"][Math.abs((sess.username.charCodeAt(0)||0))%5];
        setUser({...sess,initials,avatarColor,
          settings:{defaultCountry:"GH",theme:"dark",fredKey:"",anthropicKey:""},
          plan:sess.plan||"free",role:sess.role||(sess.username==="admin"?"admin":"user")});
      }
    }catch(_){}
    setBooting(false);
  },[]);

  if(booting) return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:C.gold,fontFamily:"monospace",fontSize:14}}>◈ Loading EcoScope…</div>
    </div>
  );
  if(!user && reset) return <ResetPassword token={reset} onCancel={clearReset} onLogin={u=>{const nu={...u,role:u.role||"user"};localStorage.setItem(US.SESS,JSON.stringify({username:nu.username,role:nu.role,plan:nu.plan,token:nu.token,at:new Date().toISOString()}));clearReset();setUser(nu);}}/>;
  if(!user && invite) return <AcceptInvite token={invite} onCancel={clearInvite} onLogin={u=>{const nu={...u,role:u.role||"user"};localStorage.setItem(US.SESS,JSON.stringify({username:nu.username,role:nu.role,plan:nu.plan,token:nu.token,at:new Date().toISOString()}));clearInvite();setUser(nu);}}/>;
  if(!user) return <Login notice={expired? "Your session has ended. Please sign in again." : ""} onLogin={u=>{const nu={...u,role:u.role||(u.username==="admin"?"admin":"user")};localStorage.setItem(US.SESS,JSON.stringify(nu));setExpired(false);setUser(nu);}}/>;
  if(user.role==="admin"||user.username==="admin") return <AdminPanel user={user} onLogout={()=>{US.logout(user.username);setUser(null);}}/>;
  return <ErrBoundary><Dashboard user={user} onLogout={()=>{US.logout(user.username);setUser(null);}}/></ErrBoundary>;
}
