// admin/AdminPanel.js — split from App.js (code unchanged; only imports and exports were added)
import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsMobile } from "../core/fetch";
import { US, openIesgi } from "../core/store";
import { C, COUNTRIES, Ico, PLANS, applyTheme, globalCSS, ink } from "../core/theme";
import { AdminSupportInbox } from "../impact/tabs";
import { btn, inp, pill, sel } from "../ui/login";
import { AdminVault } from "../vault/vault";

// ══════════════════════════════════════════════
// MOCK DATA FOR ADMIN
// ══════════════════════════════════════════════
const SOURCE_STATUS = [
  {name:"World Bank",short:"WB",url:"https://api.worldbank.org/v2/country/GH/indicator/NY.GDP.MKTP.CD?format=json",status:"live",latency:"210ms",uptime:"99.9%",get color(){return C.blue}},
  {name:"IMF DataMapper",short:"IMF",url:"https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/GHA",status:"live",latency:"380ms",uptime:"99.4%",get color(){return C.teal}},
  {name:"FRED (St. Louis Fed)",short:"FRED",url:null,status:"key-required",latency:"—",uptime:"99.8%",get color(){return C.red}},
  {name:"WHO GHO",short:"WHO",url:"https://ghoapi.azureedge.net/api/WHOSIS_000001?$top=1",status:"live",latency:"290ms",uptime:"98.7%",get color(){return C.purple}},
  {name:"Bank of Ghana",short:"BoG",url:null,status:"proxied",latency:"—",uptime:"99.9%",get color(){return C.gold}},
  {name:"BIS",short:"BIS",url:null,status:"proxied",latency:"—",uptime:"99.5%",get color(){return C.cyan}},
  {name:"UNCTAD",short:"UNCTAD",url:null,status:"proxied",latency:"—",uptime:"99.2%",get color(){return C.orange}},
  {name:"ILO STAT",short:"ILO",url:null,status:"proxied",latency:"—",uptime:"99.1%",get color(){return C.cyan}},
  {name:"UNESCO UIS",short:"UIS",url:null,status:"proxied",latency:"—",uptime:"98.9%",get color(){return C.orange}},
  {name:"UN Environment",short:"ENV",url:null,status:"proxied",latency:"—",uptime:"99.0%",get color(){return C.teal}},
];
// ══════════════════════════════════════════════
// ADMIN PANEL
// ══════════════════════════════════════════════

// ══════════════════════════════════════════════
// INVITE MODAL
// ══════════════════════════════════════════════
function InviteModal({onClose,onDone}){
  const [email,setEmail]=useState('');
  const [role,setRole]=useState('user');
  const [err,setErr]=useState('');
  const [sent,setSent]=useState(false);
  const [loading,setLoading]=useState(false);
  const [inviteLink,setInviteLink]=useState('');
  const send=async e=>{
    e.preventDefault();setErr('');
    if(!email.trim()||!email.includes('@')){setErr('Valid email required');return;}
    setLoading(true);
    const res=await US.invite(email.trim(),role);
    setLoading(false);
    if(res.error){setErr(res.error);return;}
    setInviteLink(`${window.location.origin}/?invite=${res.inviteToken}`);
    setSent(true);setTimeout(()=>{onDone();onClose();},1800);
  };
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,backdropFilter:'blur(6px)'}}>
      <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:8,padding:'36px 40px',width:420,fontFamily:C.font,boxShadow:'0 32px 80px rgba(0,0,0,.7)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
          <h2 style={{color:C.text,fontSize:16,fontWeight:700,margin:0}}>✉︎ Invite User</h2>
          <button onClick={onClose} style={{background:'none',border:'none',color:C.mid,cursor:'pointer',fontSize:18}}>✕</button>
        </div>
        {sent?(
          <div style={{padding:'10px 0'}}>
            <div style={{textAlign:'center',marginBottom:16}}>
              <div style={{fontSize:36,marginBottom:8}}><Ico n="link"/></div>
              <div style={{color:C.teal,fontSize:14,fontWeight:600}}>User created!</div>
              <div style={{color:C.mid,fontSize:11,fontFamily:C.mono,marginTop:4}}>{email} added as {role}</div>
            </div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:'12px 14px',marginBottom:14}}>
              <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6}}>Share this invite link:</div>
              <div style={{color:C.text,fontSize:11,fontFamily:C.mono,wordBreak:'break-all',marginBottom:10}}>{inviteLink}</div>
              <button onClick={()=>{ try { (navigator.clipboard? navigator.clipboard.writeText(inviteLink) : Promise.reject()).catch(()=>window.prompt("Copy this invite link:", inviteLink)); } catch(e){ window.prompt("Copy this invite link:", inviteLink); } }} style={{background:C.gold,color:'#000',border:'none',borderRadius:6,padding:'7px 16px',fontSize:11,fontWeight:700,cursor:'pointer'}}><Ico n="clipboard"/> Copy Link</button>
            </div>
            <div style={{color:C.dim,fontSize:11,fontFamily:C.mono,lineHeight:1.6}}>Share this link with {email}. They open it, choose a username and password, and are signed in. The link works once and expires in 14 days.</div>
            <button onClick={onClose} style={{...btn(),width:'100%',marginTop:14,padding:'10px',fontSize:12}}>Done</button>
          </div>
        ):(
          <form onSubmit={send}>
            <div style={{marginBottom:16}}>
              <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,letterSpacing:'0.14em',textTransform:'uppercase',marginBottom:7}}>Email Address</div>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="user@example.com" style={{...inp,fontSize:13,padding:'11px 14px',border:`1px solid ${email?C.gold:C.border}`}}/>
            </div>
            <div style={{marginBottom:20}}>
              <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,letterSpacing:'0.14em',textTransform:'uppercase',marginBottom:7}}>Role</div>
              <div style={{display:'flex',gap:8}}>
                {['user','analyst','admin'].map(r=>(
                  <button key={r} type="button" onClick={()=>setRole(r)} style={{...pill(role===r),flex:1,textAlign:'center',padding:'8px',textTransform:'capitalize',fontSize:11}}>{r}</button>
                ))}
              </div>
            </div>
            {err&&<div style={{background:`${C.red}12`,border:`1px solid ${C.red}44`,borderRadius:6,padding:'9px 12px',marginBottom:14,color:C.red,fontSize:11,fontFamily:C.mono}}>{err}</div>}
            <div style={{display:'flex',gap:10}}>
              <button type="button" onClick={onClose} style={{flex:1,background:'none',border:`1px solid ${C.border}`,borderRadius:6,padding:'11px',color:C.mid,fontSize:12,cursor:'pointer'}}>Cancel</button>
              <button type="submit" disabled={loading} style={{flex:2,...btn(),padding:'11px',fontSize:12,opacity:loading?.6:1}}>{loading?'Sending…':'Send Invitation →'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
// ══════════════════════════════════════════════
// EDIT USER MODAL
// ══════════════════════════════════════════════
function EditUserModal({user:u,onClose,onSave}){
  const [email,setEmail]=useState(u.email||'');
  const [role,setRole]=useState(u.role||'user');
  const [plan,setPlan]=useState(u.plan||'free');
  const [status,setStatus]=useState(u.planStatus||'active');
  const [country,setCountry]=useState(u.country||'GH');
  const [err,setErr]=useState('');
  const save=async()=>{
    if(!email.trim()||!email.includes('@')){setErr('Valid email required');return;}
    await US.updateProfile(u.username,{email,role,plan,plan_status:status,country});
    if(plan!==u.plan||status!==u.planStatus) await US.setPlan(u.username,plan,status);
    onSave();
  };
  const Row=({label,children})=>(
    <div style={{marginBottom:14}}>
      <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,letterSpacing:'0.14em',textTransform:'uppercase',marginBottom:7}}>{label}</div>
      {children}
    </div>
  );
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,backdropFilter:'blur(6px)'}}>
      <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:8,padding:'32px 36px',width:500,fontFamily:C.font,maxHeight:'85vh',overflowY:'auto',boxShadow:'0 32px 80px rgba(0,0,0,.7)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
          <div><h2 style={{color:C.text,fontSize:16,fontWeight:700,margin:'0 0 3px'}}><Ico n="pencil"/> Edit User</h2><div style={{color:C.mid,fontSize:11,fontFamily:C.mono}}>@{u.username}</div></div>
          <button onClick={onClose} style={{background:'none',border:'none',color:C.mid,cursor:'pointer',fontSize:18}}>✕</button>
        </div>
        <Row label="Email Address">
          <input value={email} onChange={e=>setEmail(e.target.value)} type="email" style={{...inp,fontSize:12,border:`1px solid ${email?C.gold:C.border}`}}/>
        </Row>
        <Row label="Role">
          <div style={{display:'flex',gap:8}}>
            {['user','analyst','admin'].map(r=>(
              <button key={r} onClick={()=>setRole(r)} disabled={u.username==='admin'&&r!=='admin'} style={{...pill(role===r),flex:1,textAlign:'center',padding:'8px',textTransform:'capitalize',fontSize:11,opacity:u.username==='admin'&&r!=='admin'?.4:1}}>{r}</button>
            ))}
          </div>
        </Row>
        <Row label="Subscription Plan">
          <div style={{display:'flex',gap:8}}>
            {Object.entries(PLANS).map(([key,pl])=>(
              <button key={key} onClick={()=>setPlan(key)} style={{...pill(plan===key,pl.color),flex:1,textAlign:'center',padding:'8px',fontSize:11}}>{pl.name}</button>
            ))}
          </div>
        </Row>
        <Row label="Account Status">
          <div style={{display:'flex',gap:8}}>
            {['active','suspended','invited'].map(s=>(
              <button key={s} onClick={()=>setStatus(s)} style={{...pill(status===s,s==='active'?C.teal:s==='suspended'?C.red:C.blue),flex:1,textAlign:'center',padding:'8px',textTransform:'capitalize',fontSize:11}}>{s}</button>
            ))}
          </div>
        </Row>
        <Row label="Country">
          <select value={country} onChange={e=>setCountry(e.target.value)} style={{...sel,fontSize:12}}>
            {COUNTRIES.map(c=><option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
          </select>
        </Row>
        {err&&<div style={{background:`${C.red}12`,border:`1px solid ${C.red}44`,borderRadius:6,padding:'9px 12px',marginBottom:14,color:C.red,fontSize:11,fontFamily:C.mono}}>{err}</div>}
        <div style={{display:'flex',gap:10,marginTop:8}}>
          <button onClick={onClose} style={{flex:1,background:'none',border:`1px solid ${C.border}`,borderRadius:6,padding:'11px',color:C.mid,fontSize:12,cursor:'pointer'}}>Cancel</button>
          <button onClick={save} style={{flex:2,...btn(),padding:'11px',fontSize:12}}>Save Changes →</button>
        </div>
      </div>
    </div>
  );
}
function AdminPanel({user, onLogout}) {
  const T=useMemo(()=>({...applyTheme(user.settings?.theme||"dark")}), [user.settings?.theme]);
  const isMobile=useIsMobile();
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [tab,setTab]=useState("overview");
  const [supportUnread,setSupportUnread]=useState(0);
  useEffect(()=>{ let alive=true; const poll=async()=>{ const r=await US.supportThreads(); if(alive&&Array.isArray(r)) setSupportUnread(r.reduce((a,t)=>a+(t.unread||0),0)); };
    poll(); const t=setInterval(poll,30000); return ()=>{ alive=false; clearInterval(t); }; },[]);
  const [showUserMenu,setShowUserMenu]=useState(false);
  const [sourceStatuses,setSourceStatuses]=useState([{name:'World Bank',short:'WB',url:'https://api.worldbank.org/v2/country/GH/indicator/NY.GDP.MKTP.CD?format=json',status:'live',latency:'—',uptime:'99.9%',color:C.blue},{name:'IMF DataMapper',short:'IMF',url:'https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/GHA',status:'live',latency:'—',uptime:'99.4%',color:C.teal},{name:'FRED',short:'FRED',url:null,status:'key-required',latency:'—',uptime:'99.8%',color:C.red},{name:'WHO GHO',short:'WHO',url:'https://ghoapi.azureedge.net/api/WHOSIS_000001?$top=1',status:'live',latency:'—',uptime:'98.7%',color:C.purple},{name:'Bank of Ghana',short:'BoG',url:null,status:'proxied',latency:'—',uptime:'99.9%',color:C.gold},{name:'BIS',short:'BIS',url:null,status:'proxied',latency:'—',uptime:'99.5%',color:C.cyan},{name:'UNCTAD',short:'UNCTAD',url:null,status:'proxied',latency:'—',uptime:'99.2%',color:C.orange},{name:'ILO',short:'ILO',url:null,status:'proxied',latency:'—',uptime:'99.1%',color:C.cyan},{name:'UNESCO',short:'UIS',url:null,status:'proxied',latency:'—',uptime:'98.9%',color:C.orange},{name:'UN Environment',short:'ENV',url:null,status:'proxied',latency:'—',uptime:'99.0%',color:C.teal}]);
  const [users,setUsers]=useState([]);
  const [userSearch,setUserSearch]=useState("");
  const [roleFilter,setRoleFilter]=useState("all");
  const [pingLoading,setPingLoading]=useState({});
  const [selectedUser,setSelectedUser]=useState(null);
  const [notif,setNotif]=useState(null);
  const [showInvite,setShowInvite]=useState(false);
  const [editUser,setEditUser]=useState(null);
  const [confirmDelete,setConfirmDelete]=useState(null);
  const [activity,setActivity]=useState([]);
  const [requests,setRequests]=useState([]);
  const [activeReqTab,setActiveReqTab]=useState(false);
  const [apiKeys,setApiKeys]=useState({
    anthropic: localStorage.getItem('admin_anthropic_key')||'',
    fred: localStorage.getItem('admin_fred_key')||'',
  });
  const [apiKeySaved,setApiKeySaved]=useState(false);
  const saveApiKeys=()=>{
    if(apiKeys.anthropic) localStorage.setItem('admin_anthropic_key',apiKeys.anthropic);
    if(apiKeys.fred) localStorage.setItem('admin_fred_key',apiKeys.fred);
    notify('API keys saved — users will inherit these on next session');
    setApiKeySaved(true); setTimeout(()=>setApiKeySaved(false),3000);
  };

  const refresh=useCallback(async()=>{
    try {
      const [all,log,reqs]=await Promise.all([US.getAll(),US.getLog(),US.getRequests()]);
      setUsers(all||[]);
      setActivity(log||[]);
      setRequests(reqs||[]);
    } catch(e){ console.error('Refresh error:',e); }
  },[]);

  useEffect(()=>{
    refresh();
    window.addEventListener('ecoscope-update',refresh);
    window.addEventListener('storage',refresh);
    const iv=setInterval(refresh,5000);
    return()=>{
      window.removeEventListener('ecoscope-update',refresh);
      window.removeEventListener('storage',refresh);
      clearInterval(iv);
    };
  },[refresh]);

  const notify=(msg,type="success")=>{setNotif({msg,type});setTimeout(()=>setNotif(null),3500);};

  const changePlan=async(username,plan,status='active')=>{
    await US.setPlan(username,plan,status);
    await refresh();
    notify(`${username} → ${plan} (${status})`);
  };

  const pingSource=async(idx)=>{
    const s=sourceStatuses[idx];
    if(!s.url){notify(`${s.name} uses proxied data — no direct endpoint to ping.`,"info");return;}
    setPingLoading(p=>({...p,[idx]:true}));
    const t0=Date.now();
    try{
      await fetch(s.url,{mode:"cors"});
      const ms=Date.now()-t0;
      setSourceStatuses(ss=>ss.map((x,i)=>i===idx?{...x,status:"live",latency:`${ms}ms`}:x));
      notify(`${s.name} responded in ${ms}ms ✓`,"success");
    }catch{
      setSourceStatuses(ss=>ss.map((x,i)=>i===idx?{...x,status:"error"}:x));
      notify(`${s.name} ping failed`,"error");
    }
    setPingLoading(p=>({...p,[idx]:false}));
  };

  const totalQueries=activity.length;
  const activeUsers=users.filter(u=>u.planStatus==="active").length;
  const aiEnabled=users.filter(u=>u.settings?.anthropicKey).length;
  const ghanaUsers=users.filter(u=>u.country==="GH").length;

  const filteredUsers=users.filter(u=>{
    const sq=userSearch.toLowerCase();
    const matchSearch=!sq||u.username.toLowerCase().includes(sq)||u.email.toLowerCase().includes(sq);
    const matchRole=roleFilter==="all"||u.role===roleFilter;
    return matchSearch&&matchRole;
  });

  const pendingReqs=requests.filter(r=>r.status==="pending").length;
  const navItems=[
    {id:"overview",icon:"◈",label:"Overview"},
    {id:"users",icon:<Ico n="users"/>,label:"User Management"},
    {id:"subscriptions",icon:"⬡",label:"Subscriptions"},
    {id:"sources",icon:<Ico n="globe"/>,label:"Data Sources"},
    {id:"vault",icon:"◆",label:"Data Vault"},
    {id:"apikeys",icon:<Ico n="key"/>,label:"API Keys"},
    {id:"support",icon:<Ico n="message"/>,label:"Support inbox",badge:supportUnread},
    {id:"activity",icon:<Ico n="clipboard"/>,label:"Activity Log"},
    {id:"config",icon:<Ico n="settings"/>,label:"System Config"},
  ];


  const statusBadge=(s)=>{
    const map={live:[C.teal,"●"],error:[C.red,"●"],"key-required":[C.gold,"◌"],proxied:[C.blue,"◎"]};
    const [col,ic]=map[s]||[C.dim,"●"];
    return <span style={{color:col,fontSize:10,fontFamily:C.mono}}>{ic} {s}</span>;
  };

  return (
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:C.font,color:C.text,display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden"}}>

      {/* NOTIFICATION */}
      {notif&&(
        <div style={{position:"fixed",top:16,right:16,zIndex:9999,background:notif.type==="success"?`${C.teal}18`:notif.type==="error"?`${C.red}18`:`${C.blue}18`,border:`1px solid ${notif.type==="success"?C.teal:notif.type==="error"?C.red:C.blue}55`,borderRadius:6,padding:"11px 18px",color:notif.type==="success"?C.teal:notif.type==="error"?C.red:C.blue,fontSize:12,fontFamily:C.mono,boxShadow:C.shadow}}>
          {notif.msg}
        </div>
      )}

      {/* HEADER */}
      <header style={{background:"rgba(20,26,48,0.55)",borderBottom:`1px solid ${C.border}`,padding:isMobile?"10px 12px":"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,zIndex:20,gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:isMobile?8:12}}>
          {isMobile&&<button onClick={()=>setSidebarOpen(o=>!o)} style={{background:C.gold,border:"none",cursor:"pointer",padding:9,borderRadius:6,display:"flex",flexDirection:"column",gap:4,flexShrink:0}}><span style={{display:"block",width:18,height:2,background:C.onGold,borderRadius:2}}/><span style={{display:"block",width:18,height:2,background:C.onGold,borderRadius:2}}/><span style={{display:"block",width:18,height:2,background:C.onGold,borderRadius:2}}/></button>}
          <div style={{width:32,height:32,background:`${C.gold}`,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,color:C.onGold,fontWeight:700}}>◈</div>
          <div>
            <div style={{fontSize:15,fontWeight:700,letterSpacing:"-0.3px",lineHeight:1}}>EcoScope</div>
            <div style={{fontSize:10,color:C.dim,fontFamily:C.mono,letterSpacing:"0.08em"}}>GLOBAL ECONOMIC INTELLIGENCE</div>
          </div>
          <div style={{width:1,height:28,background:C.border,margin:"0 6px"}}/>
          <div style={{background:`${C.gold}18`,border:`1px solid ${C.gold}55`,borderRadius:6,padding:"3px 10px",display:"flex",alignItems:"center",gap:5}}>
            <span style={{fontSize:10,color:C.gold}}>⬡</span>
            <span style={{color:C.gold,fontSize:11,fontFamily:C.mono,fontWeight:700,letterSpacing:"0.1em"}}>ADMIN PANEL</span>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          
          {!isMobile&&<div style={{display:"flex",gap:6,fontFamily:C.mono,fontSize:11}}>
            <span style={{color:C.teal}}>● {activeUsers} active</span>
            <span style={{color:C.dim}}>·</span>
            <span style={{color:C.mid}}>{totalQueries} queries today</span>
          </div>}
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowUserMenu(v=>!v)} style={{display:"flex",alignItems:"center",gap:8,background:C.card,border:`1px solid ${showUserMenu?C.gold:C.border}`,borderRadius:6,padding:"5px 14px 5px 6px",cursor:"pointer",transition:"border-color .15s"}}>
              <div style={{width:26,height:26,borderRadius:"50%",background:user.avatarColor||C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#0b0e14"}}>{user.initials||"A"}</div>
              <span style={{color:C.text,fontSize:12,fontFamily:C.mono,fontWeight:600}}>{user.username}</span>
              <span style={{color:C.mid,fontSize:10}}>{showUserMenu?"▲":"▼"}</span>
            </button>
            {showUserMenu&&(
              <div style={{position:"fixed",top:60,right:isMobile?8:20,left:isMobile?8:"auto",background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:8,padding:"6px",minWidth:isMobile?"auto":220,boxShadow:C.shadow,zIndex:300}}>
                <div style={{padding:"10px 14px 10px",borderBottom:`1px solid ${C.border}`,marginBottom:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                    <div style={{width:34,height:34,borderRadius:"50%",background:user.avatarColor||C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#0b0e14"}}>{user.initials||"A"}</div>
                    <div><div style={{color:C.text,fontSize:12,fontWeight:700}}>{user.username}</div><div style={{color:C.mid,fontSize:11,fontFamily:C.mono}}>{user.email||"admin@ecoscope.app"}</div></div>
                  </div>
                  <div style={{background:`${C.gold}18`,border:`1px solid ${C.gold}44`,borderRadius:5,padding:"3px 9px",display:"inline-block"}}><span style={{color:C.gold,fontSize:10,fontFamily:C.mono,fontWeight:700}}>⬡ ADMINISTRATOR</span></div>
                </div>
                {[
                  {icon:"⬡",label:"Admin Home",action:()=>{setTab("overview");setShowUserMenu(false);},special:true},
                  null,
                  {icon:<Ico n="settings"/>,label:"System Config",action:()=>{setTab("config");setShowUserMenu(false);}},
                  {icon:<Ico n="users"/>,label:"User Management",action:()=>{setTab("users");setShowUserMenu(false);}},
                  {icon:<Ico n="globe"/>,label:"Data Sources",action:()=>{setTab("sources");setShowUserMenu(false);}},
                  {icon:<Ico n="message"/>,label:`Support inbox${supportUnread?` (${supportUnread})`:""}`,action:()=>{setTab("support");setShowUserMenu(false);}},
                  null,
                  {icon:<Ico n="globe"/>,label:"IESGI console (versions, API, partners)",action:()=>{openIesgi("/data/admin");setShowUserMenu(false);}},
                  {icon:<Ico n="clipboard"/>,label:"IESGI public portal",action:()=>{openIesgi("/data");setShowUserMenu(false);}},
                  null,
                  {icon:"←",label:"Sign Out",action:onLogout,danger:true},
                ].map((item,i)=>item===null
                  ?<div key={i} style={{height:1,background:C.border,margin:"4px 6px"}}/>
                  :<button key={i} onClick={item.action} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 14px",borderRadius:6,border:"none",background:item.special?`${C.gold}12`:"transparent",cursor:"pointer",textAlign:"left",color:item.danger?C.red:item.special?C.gold:C.text}}>
                    <span style={{fontSize:13,width:18,textAlign:"center"}}>{item.icon}</span>
                    <span style={{fontSize:12,fontFamily:C.font,fontWeight:item.special?700:500}}>{item.label}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div style={{display:"flex",flex:1,overflow:"hidden",position:"relative"}}>

        {/* Mobile overlay */}
        {sidebarOpen&&isMobile&&<div onClick={()=>setSidebarOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:98}}/>}

        {/* ADMIN SIDEBAR NAV */}
        <nav id="scroll-adminnav" style={{background:"rgba(20,26,48,0.55)",borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",padding:"12px 8px",...(isMobile?{position:"fixed",top:0,left:0,bottom:0,width:"80vw",maxWidth:280,zIndex:99,transform:sidebarOpen?"translateX(0)":"translateX(-105%)",transition:"transform 0.3s ease",boxShadow:sidebarOpen?"8px 0 40px rgba(0,0,0,0.7)":"none",overflowY:"auto"}:{width:200,flexShrink:0})}}>
          {isMobile&&<div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}><button onClick={()=>setSidebarOpen(false)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,color:C.mid,cursor:"pointer",padding:"5px 12px",fontSize:12,fontFamily:C.mono}}>✕ Close</button></div>}
          {navItems.map(n=>(
            <button key={n.id} onClick={()=>{setTab(n.id);if(isMobile) setSidebarOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:6,border:"none",background:tab===n.id?`${C.gold}15`:"transparent",cursor:"pointer",textAlign:"left",borderLeft:`2px solid ${tab===n.id?C.gold:"transparent"}`,marginBottom:2,transition:"all .12s",width:"100%"}}>
              <span style={{fontSize:15}}>{n.icon}</span>
              <span style={{color:tab===n.id?C.gold:C.mid,fontSize:12,fontWeight:tab===n.id?700:400,flex:1}}>{n.label}</span>
              {n.badge>0&&<span style={{background:C.red,color:C.onGold,fontSize:10,fontWeight:700,borderRadius:6,padding:"2px 6px",fontFamily:C.mono}}>{n.badge}</span>}
            </button>
          ))}
          <div style={{flex:1}}/>
          <button onClick={()=>setTab("overview")} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:6,border:`1px solid ${C.border}`,background:"transparent",cursor:"pointer",textAlign:"left",marginTop:8}}>
            <span style={{fontSize:13}}>◫</span>
            <span style={{color:C.mid,fontSize:11,fontFamily:C.mono}}>v2.0 · Admin</span>
          </button>
        </nav>

        {/* MAIN CONTENT */}
        <main id="scroll-adminmain" style={{flex:1,overflowY:"auto",padding:20,display:"flex",flexDirection:"column",gap:16}}>

          {/* ── OVERVIEW ── */}
          {tab==="overview"&&(
            <>
              <div>
                <h1 style={{fontSize:20,fontWeight:700,color:C.text,margin:"0 0 4px"}}>Welcome back, {user.username}</h1>
                <p style={{color:C.mid,fontSize:11,fontFamily:C.mono,margin:0}}>EcoScope Admin Dashboard · {new Date().toLocaleDateString("en-GB",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
              </div>
              {/* KPI row */}
              <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)",gap:isMobile?8:12}}>
                {[
                  {icon:<Ico n="users"/>,label:"Total Users",val:users.length,sub:`${activeUsers} active`,col:C.blue},
                  {icon:<Ico n="chart"/>,label:"Total Queries",val:totalQueries.toLocaleString(),sub:"session total",col:C.gold},
                  {icon:"◈",label:"AI Insights",val:`${aiEnabled}/${users.length}`,sub:"users with key",col:C.purple},
                  {icon:<Ico n="globe"/>,label:"Ghana Users",val:ghanaUsers,sub:`${Math.round(ghanaUsers/users.length*100)}% of base`,col:C.teal},
                ].map((k,i)=>(
                  <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"16px 18px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                      <span style={{fontSize:22}}>{k.icon}</span>
                      <div style={{width:8,height:8,borderRadius:"50%",background:k.col}}/>
                    </div>
                    <div style={{fontSize:26,fontWeight:600,color:C.text,marginBottom:3}}>{k.val}</div>
                    <div style={{fontSize:10,color:C.dim,fontFamily:C.mono,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:2}}>{k.label}</div>
                    <div style={{fontSize:11,color:C.mid,fontFamily:C.mono}}>{k.sub}</div>
                  </div>
                ))}
              </div>
              {/* Sources status grid */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"18px 20px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <h3 style={{margin:0,fontSize:13,fontWeight:700,color:C.text}}><Ico n="globe"/> Data Source Health</h3>
                  <span style={{color:C.teal,fontSize:11,fontFamily:C.mono}}>● {sourceStatuses.filter(s=>s.status==="live").length}/{sourceStatuses.length} live</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
                  {sourceStatuses.map((s,i)=>(
                    <div key={i} style={{background:C.surface,border:`1px solid ${s.status==="live"?`${s.color}44`:s.status==="error"?`${C.red}44`:C.border}`,borderRadius:6,padding:"10px 12px"}}>
                      <div style={{display:"flex",justify:"space-between",alignItems:"center",marginBottom:5}}>
                        <span style={{color:ink(s.color),fontSize:12,fontWeight:700,fontFamily:C.mono}}>{s.short}</span>
                        {statusBadge(s.status)}
                      </div>
                      <div style={{color:C.mid,fontSize:10,fontFamily:C.mono}}>{s.latency!=="—"?s.latency:"proxied"}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Recent activity */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"18px 20px"}}>
                <h3 style={{margin:"0 0 14px",fontSize:13,fontWeight:700,color:C.text}}><Ico n="clipboard"/> Recent Activity</h3>
                {activity.slice(0,5).map((a,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:i<4?`1px solid ${C.border}`:"none"}}>
                    <span style={{color:C.dim,fontSize:11,fontFamily:C.mono,width:36,flexShrink:0}}>{a.time}</span>
                    <span style={{color:C.gold,fontSize:11,fontFamily:C.mono,width:120,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.user}</span>
                    <span style={{color:C.teal,fontSize:11,fontFamily:C.mono,width:140,flexShrink:0}}>{a.action}</span>
                    <span style={{color:C.mid,fontSize:11,fontFamily:C.mono,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.detail}</span>
                  </div>
                ))}
                <button onClick={()=>setTab("activity")} style={{marginTop:12,background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"7px 16px",color:C.mid,fontSize:11,cursor:"pointer",fontFamily:C.mono}}>View all activity →</button>
              </div>
            </>
          )}

          {/* ── USERS ── */}
          {tab==="users"&&(
            <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><h2 style={{margin:0,fontSize:16,fontWeight:700,color:C.text}}><Ico n="users"/> User Management</h2><p style={{margin:"3px 0 0",color:C.mid,fontSize:11,fontFamily:C.mono}}>{users.length} users · Real accounts</p></div>
                <button onClick={()=>setShowInvite(true)} style={{background:C.gold,color:C.onGold,border:"none",borderRadius:6,padding:"9px 18px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:C.font}}>+ Invite User</button>
              </div>
              {/* Filters */}
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input value={userSearch} onChange={e=>setUserSearch(e.target.value)} placeholder="Search users..." style={{...inp,width:240,fontSize:12,padding:"8px 12px"}}/>
                <div style={{display:"flex",gap:5}}>
                  {["all","admin","analyst","user"].map(r=>(
                    <button key={r} onClick={()=>setRoleFilter(r)} style={{...pill(roleFilter===r),textTransform:"capitalize",padding:"5px 12px",fontSize:11}}>{r}</button>
                  ))}
                </div>
              </div>
              {/* Table */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontFamily:C.mono,fontSize:11}}>
                  <thead>
                    <tr style={{background:C.surface}}>
                      {["User","Email","Role","Status","Joined","Last Seen","Queries","API Keys","Actions"].map(h=>(
                        <th key={h} style={{color:C.dim,padding:"11px 14px",fontWeight:500,textAlign:"left",fontSize:10,textTransform:"uppercase",letterSpacing:"0.1em",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u,i)=>(
                      <tr key={u.id} style={{background:i%2?`${C.surface}55`:"transparent",cursor:"pointer"}} onClick={()=>setSelectedUser(selectedUser?.id===u.id?null:u)}>
                        <td style={{padding:"10px 14px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{width:28,height:28,borderRadius:"50%",background:u.role==="admin"?C.gold:u.role==="analyst"?C.teal:C.blue,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:C.onGold}}>{u.username.slice(0,2).toUpperCase()}</div>
                            <span style={{color:C.text,fontWeight:600}}>{u.username}</span>
                          </div>
                        </td>
                        <td style={{padding:"10px 14px",color:C.mid}}>{u.email}</td>
                        <td style={{padding:"10px 14px"}}>
                          <span style={{background:u.role==="admin"?`${C.gold}20`:u.role==="analyst"?`${C.teal}20`:`${C.blue}20`,color:u.role==="admin"?C.gold:u.role==="analyst"?C.teal:C.blue,borderRadius:5,padding:"2px 8px",fontSize:10,fontWeight:700,textTransform:"uppercase"}}>{u.role}</span>
                        </td>
                        <td style={{padding:"10px 14px"}}><span style={{color:u.planStatus==="active"?C.teal:u.planStatus==="suspended"?C.red:C.blue,fontSize:10}}>● {u.planStatus}</span></td>
                        <td style={{padding:"10px 14px",color:C.mid}}>{u.createdAt?u.createdAt.slice(0,10):"—"}</td>
                        <td style={{padding:"10px 14px",color:C.mid}}>{u.lastLogin?new Date(u.lastLogin).toLocaleString():"Never"}</td>
                        <td style={{padding:"10px 14px",color:C.gold,fontWeight:600}}>{activity.filter(a=>a.username===u.username).length}</td>
                        <td style={{padding:"10px 14px"}}>
                          <div style={{display:"flex",gap:4}}>
                            <span style={{color:u.settings?.anthropicKey?C.teal:C.dim,fontSize:10}} title="Anthropic">◈</span>
                            <span style={{color:u.settings?.fredKey?C.red:C.dim,fontSize:10}} title="FRED"><Ico n="bank"/></span>
                          </div>
                        </td>
                        <td style={{padding:"10px 14px"}}>
                          <div style={{display:"flex",gap:4}}>
                            <button onClick={e=>{e.stopPropagation();setEditUser(u);}} style={{background:`${C.blue}18`,border:`1px solid ${C.blue}44`,borderRadius:5,padding:"4px 9px",color:C.blue,fontSize:10,cursor:"pointer"}}><Ico n="pencil"/> Edit</button>
                            {u.role!=="admin"&&<button onClick={e=>{e.stopPropagation();setConfirmDelete(u);}} style={{background:`${C.red}18`,border:`1px solid ${C.red}44`,borderRadius:5,padding:"4px 9px",color:C.red,fontSize:10,cursor:"pointer"}}><Ico n="trash"/> Delete</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedUser&&(
                <div style={{background:C.card,border:`1px solid ${C.gold}44`,borderRadius:8,padding:"18px 20px"}}>
                  <h3 style={{margin:"0 0 14px",fontSize:13,fontWeight:700,color:C.gold}}><Ico n="user"/> {selectedUser.username} — Details</h3>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                    {[{l:"Email",v:selectedUser.email||'—'},{l:"Role",v:selectedUser.role},{l:"Plan",v:selectedUser.plan},{l:"Status",v:selectedUser.planStatus},{l:"Country",v:selectedUser.country||'—'},{l:"Joined",v:selectedUser.createdAt?selectedUser.createdAt.slice(0,10):'—'},{l:"Last Login",v:selectedUser.lastLogin?new Date(selectedUser.lastLogin).toLocaleString():'Never'},{l:"User ID",v:selectedUser.id}].map(({l,v})=>(
                      <div key={l} style={{background:C.surface,borderRadius:6,padding:"10px 13px"}}>
                        <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>{l}</div>
                        <div style={{color:C.text,fontSize:12,fontWeight:600}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── SUBSCRIPTIONS ── */}
          {tab==="subscriptions"&&(
            <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><h2 style={{margin:0,fontSize:16,fontWeight:700,color:C.text}}>⬡ Subscription Management</h2><p style={{margin:"3px 0 0",color:C.mid,fontSize:11,fontFamily:C.mono}}>User plans, revenue and billing</p></div>
              </div>
              {/* Revenue KPIs */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                {[
                  {icon:<Ico n="dollar"/>,label:"MRR",val:`$${(users.filter(u=>u.plan==="pro"&&u.planStatus==="active").length*9.99).toFixed(2)}`,sub:"monthly recurring",col:C.teal},
                  {icon:"⬡",label:"Pro Users",val:users.filter(u=>u.plan==="pro"&&u.planStatus==="active").length,sub:"active subscriptions",col:C.gold},
                  {icon:<Ico n="building"/>,label:"Enterprise",val:users.filter(u=>u.plan==="enterprise").length,sub:"accounts",col:C.purple},
                  {icon:<Ico n="user"/>,label:"Free Tier",val:users.filter(u=>u.plan==="free").length,sub:"users",col:C.mid},
                ].map((k,i)=>(
                  <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px"}}>
                    <div style={{fontSize:20,marginBottom:8}}>{k.icon}</div>
                    <div style={{fontSize:22,fontWeight:600,color:C.text,marginBottom:2}}>{k.val}</div>
                    <div style={{fontSize:10,color:C.dim,fontFamily:C.mono,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:1}}>{k.label}</div>
                    <div style={{fontSize:11,color:C.mid,fontFamily:C.mono}}>{k.sub}</div>
                  </div>
                ))}
              </div>
              {/* Subscriptions table */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontFamily:C.mono,fontSize:11}}>
                  <thead>
                    <tr style={{background:C.surface}}>
                      {["User","Plan","Status","Since","Expires","Revenue/mo","Actions"].map(h=>(
                        <th key={h} style={{color:C.dim,padding:"11px 14px",fontWeight:500,textAlign:"left",fontSize:10,textTransform:"uppercase",letterSpacing:"0.1em",borderBottom:`1px solid ${C.border}`}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u,i)=>{ const s={user:u.username,email:u.email,plan:u.plan,status:u.planStatus,since:u.createdAt?u.createdAt.slice(0,10):"—",lastLogin:u.lastLogin?new Date(u.lastLogin).toLocaleString():"Never",revenue:u.plan==="pro"?9.99:0};
                      const pl=PLANS[s.plan]||PLANS.free;
                      return(
                        <tr key={i} style={{background:i%2?`${C.surface}55`:"transparent"}}>
                          <td style={{padding:"9px 14px",color:C.gold,fontWeight:600}}>{s.user}</td>
                          <td style={{padding:"9px 14px"}}><span style={{background:`${pl.color}20`,color:ink(pl.color),borderRadius:5,padding:"2px 8px",fontSize:10,fontWeight:700}}>{pl.badge}</span></td>
                          <td style={{padding:"9px 14px"}}><span style={{color:s.status==="active"?C.teal:C.red,fontSize:10}}>● {s.status}</span></td>
                          <td style={{padding:"9px 14px",color:C.mid}}>{s.since}</td>
                          <td style={{padding:"9px 14px",color:C.mid}}>{s.expires||"—"}</td>
                          <td style={{padding:"9px 14px",color:s.revenue>0?C.teal:C.dim,fontWeight:s.revenue>0?600:400}}>{s.revenue>0?`$${s.revenue.toFixed(2)}`:"Free"}</td>
                          <td style={{padding:"9px 14px"}}>
                            <div style={{display:"flex",gap:5}}>
                              {s.plan!=="enterprise"&&s.plan!=="pro"&&<button onClick={()=>{changePlan(u.username,'pro');}} style={{background:`${C.gold}18`,border:`1px solid ${C.gold}44`,borderRadius:5,padding:"3px 8px",color:C.gold,fontSize:10,cursor:"pointer"}}>→ Pro</button>}
                              
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── SOURCES ── */}
          {tab==="sources"&&(
            <>
              <div><h2 style={{margin:0,fontSize:16,fontWeight:700,color:C.text}}><Ico n="globe"/> Data Source Management</h2><p style={{margin:"3px 0 0",color:C.mid,fontSize:11,fontFamily:C.mono}}>Monitor and test all connected data APIs</p></div>
              {sourceStatuses.map((s,i)=>(
                <div key={i} style={{background:C.card,border:`1px solid ${s.status==="live"?`${s.color}44`:s.status==="error"?`${C.red}44`:C.border}`,borderRadius:8,padding:"16px 20px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:s.status==="live"?C.teal:s.status==="error"?C.red:s.status==="key-required"?C.gold:C.blue,flexShrink:0}}/>
                      <div>
                        <div style={{color:C.text,fontSize:13,fontWeight:700}}>{s.name}</div>
                        <div style={{display:"flex",gap:14,marginTop:3}}>
                          <span style={{color:C.mid,fontSize:11,fontFamily:C.mono}}>Latency: {s.latency}</span>
                          <span style={{color:C.mid,fontSize:11,fontFamily:C.mono}}>Uptime: {s.uptime}</span>
                          {statusBadge(s.status)}
                        </div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      {s.status==="key-required"&&<span style={{color:C.gold,fontSize:11,fontFamily:C.mono}}>⚠︎ Requires API key from users</span>}
                      {s.status==="proxied"&&<span style={{color:C.blue,fontSize:11,fontFamily:C.mono}}>◎ Data via World Bank / IMF proxy</span>}
                      <button onClick={()=>pingSource(i)} disabled={pingLoading[i]} style={{background:`${s.color}15`,border:`1px solid ${s.color}44`,borderRadius:6,padding:"7px 16px",color:ink(s.color),fontSize:11,cursor:"pointer",fontFamily:C.mono,opacity:pingLoading[i]?.6:1}}>
                        {pingLoading[i]?"Pinging…":"Ping →"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── ACTIVITY ── */}
          {tab==="support"&&(
            <>
              <div><h2 style={{margin:0,fontSize:16,fontWeight:700,color:C.text}}>Support inbox</h2><p style={{margin:"3px 0 0",color:C.mid,fontSize:12}}>Messages from users, with every conversation's history, dates and times. Replies appear in the user's help chat.</p></div>
              <AdminSupportInbox admin={user}/>
            </>
          )}
          {tab==="activity"&&(
            <>
              <div><h2 style={{margin:0,fontSize:16,fontWeight:700,color:C.text}}><Ico n="clipboard"/> Activity Log</h2><p style={{margin:"3px 0 0",color:C.mid,fontSize:11,fontFamily:C.mono}}>All user actions — today</p></div>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontFamily:C.mono,fontSize:11}}>
                  <thead>
                    <tr style={{background:C.surface}}>
                      {["Time","User","Action","Detail"].map(h=>(
                        <th key={h} style={{color:C.dim,padding:"11px 16px",fontWeight:500,textAlign:"left",fontSize:10,textTransform:"uppercase",letterSpacing:"0.1em",borderBottom:`1px solid ${C.border}`}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((a,i)=>(
                      <tr key={i} style={{background:i%2?`${C.surface}55`:"transparent"}}>
                        <td style={{padding:"9px 16px",color:C.dim,whiteSpace:"nowrap"}}>{a.time}</td>
                        <td style={{padding:"9px 16px",color:C.gold,fontWeight:600}}>{a.user}</td>
                        <td style={{padding:"9px 16px"}}><span style={{background:`${C.teal}18`,color:C.teal,borderRadius:5,padding:"2px 8px",fontSize:10}}>{a.action}</span></td>
                        <td style={{padding:"9px 16px",color:C.mid}}>{a.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── API KEYS ── */}
          {tab==="apikeys"&&(
            <>
              <div>
                <h2 style={{margin:0,fontSize:16,fontWeight:700,color:C.text}}><Ico n="key"/> API Keys Management</h2>
                <p style={{margin:"3px 0 0",color:C.mid,fontSize:11,fontFamily:C.mono}}>Configure platform-wide API keys — admin only</p>
              </div>

              <div style={{background:`${C.gold}0e`,border:`1px solid ${C.gold}33`,borderRadius:6,padding:"13px 16px"}}>
                <div style={{color:C.gold,fontSize:11,fontFamily:C.mono}}><Ico n="lock"/> Keys are stored securely. Users inherit the platform Anthropic key for AI Insights. Individual users can override with their own keys in Settings.</div>
              </div>

              {/* Anthropic Key */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"20px 22px"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                  <div style={{width:36,height:36,background:`${C.purple}20`,border:`1px solid ${C.purple}44`,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>◈</div>
                  <div>
                    <div style={{color:C.text,fontSize:14,fontWeight:700}}>Anthropic Claude API</div>
                    <div style={{color:C.mid,fontSize:11,fontFamily:C.mono}}>Powers AI Insights for all Pro users</div>
                  </div>
                  <div style={{marginLeft:"auto"}}>
                    {apiKeys.anthropic?(
                      <span style={{background:`${C.teal}18`,border:`1px solid ${C.teal}44`,borderRadius:6,padding:"4px 10px",color:C.teal,fontSize:11,fontFamily:C.mono,fontWeight:700}}>✓ Configured</span>
                    ):(
                      <span style={{background:`${C.red}18`,border:`1px solid ${C.red}44`,borderRadius:6,padding:"4px 10px",color:C.red,fontSize:11,fontFamily:C.mono,fontWeight:700}}>✗ Not set</span>
                    )}
                  </div>
                </div>
                <div style={{marginBottom:8}}>
                  <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:7}}>API Key</div>
                  <input
                    type="password"
                    value={apiKeys.anthropic}
                    onChange={e=>setApiKeys(k=>({...k,anthropic:e.target.value}))}
                    placeholder="sk-ant-api03-..."
                    style={{...inp,fontSize:12,fontFamily:C.mono}}
                  />
                  {apiKeys.anthropic&&<div style={{color:C.teal,fontSize:11,fontFamily:C.mono,marginTop:6}}>✓ Key entered ({apiKeys.anthropic.length} chars) · AI Insights enabled for Pro users</div>}
                </div>
                <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{color:C.blue,fontSize:11,fontFamily:C.mono}}>Get API key at console.anthropic.com ↗</a>
              </div>

              {/* FRED Key */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"20px 22px"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                  <div style={{width:36,height:36,background:`${C.red}20`,border:`1px solid ${C.red}44`,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}><Ico n="bank"/></div>
                  <div>
                    <div style={{color:C.text,fontSize:14,fontWeight:700}}>FRED — Federal Reserve Economic Data</div>
                    <div style={{color:C.mid,fontSize:11,fontFamily:C.mono}}>Enables 800K+ US economic series for all users</div>
                  </div>
                  <div style={{marginLeft:"auto"}}>
                    {apiKeys.fred?(
                      <span style={{background:`${C.teal}18`,border:`1px solid ${C.teal}44`,borderRadius:6,padding:"4px 10px",color:C.teal,fontSize:11,fontFamily:C.mono,fontWeight:700}}>✓ Configured</span>
                    ):(
                      <span style={{background:`${C.orange}18`,border:`1px solid ${C.orange}44`,borderRadius:6,padding:"4px 10px",color:C.orange,fontSize:11,fontFamily:C.mono,fontWeight:700}}>⚠︎ Optional</span>
                    )}
                  </div>
                </div>
                <div style={{marginBottom:8}}>
                  <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:7}}>API Key</div>
                  <input
                    type="password"
                    value={apiKeys.fred}
                    onChange={e=>setApiKeys(k=>({...k,fred:e.target.value}))}
                    placeholder="Your FRED API key..."
                    style={{...inp,fontSize:12,fontFamily:C.mono}}
                  />
                  {apiKeys.fred&&<div style={{color:C.teal,fontSize:11,fontFamily:C.mono,marginTop:6}}>✓ Key entered · FRED data source unlocked for all users</div>}
                </div>
                <a href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noreferrer" style={{color:C.blue,fontSize:11,fontFamily:C.mono}}>Get free FRED key ↗</a>
              </div>

              {/* Free sources */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"18px 20px"}}>
                <div style={{color:C.gold,fontSize:10,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}}>Sources With No Key Required</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {["World Bank","IMF WEO","WHO GHO","ILO ILOSTAT","UNESCO UIS","UNCTAD","BIS","UN SDG","FAO","UN Environment"].map(s=>(
                    <div key={s} style={{background:`${C.teal}12`,border:`1px solid ${C.teal}33`,borderRadius:6,padding:"5px 12px",color:C.teal,fontSize:11,fontFamily:C.mono}}>✓ {s}</div>
                  ))}
                </div>
              </div>

              {/* Save button */}
              <div style={{display:"flex",gap:10}}>
                <button onClick={saveApiKeys} style={{...btn(),padding:"11px 28px",fontSize:12}}>
                  {apiKeySaved?"✓ Saved!":"Save API Keys"}
                </button>
                <button onClick={()=>{setApiKeys({anthropic:'',fred:''});localStorage.removeItem('admin_anthropic_key');localStorage.removeItem('admin_fred_key');notify('API keys cleared','error');}} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"11px 20px",color:C.dim,fontSize:12,cursor:"pointer"}}>Clear All</button>
              </div>
            </>
          )}

          {/* ── CONFIG ── */}
          {tab==="vault"&&<AdminVault users={users} notify={notify}/>}
          {tab==="config"&&(
            <>
              <div><h2 style={{margin:0,fontSize:16,fontWeight:700,color:C.text}}><Ico n="settings"/> System Configuration</h2><p style={{margin:"3px 0 0",color:C.mid,fontSize:11,fontFamily:C.mono}}>Platform-wide settings — admin only</p></div>
              {/* Platform */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"18px 20px"}}>
                <div style={{color:C.gold,fontSize:10,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:14,paddingBottom:9,borderBottom:`1px solid ${C.border}`}}>Platform Settings</div>
                {[{l:"Platform Name",v:"EcoScope"},{l:"Version",v:"v2.0"},{l:"Environment",v:"Production"},{l:"Base URL",v:window.location.origin}].map(({l,v})=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                    <span style={{color:C.mid,fontSize:12,fontFamily:C.mono}}>{l}</span>
                    <span style={{color:C.text,fontSize:12,fontFamily:C.mono,fontWeight:600}}>{v}</span>
                  </div>
                ))}
              </div>
              {/* Access control */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"18px 20px"}}>
                <div style={{color:C.gold,fontSize:10,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:14,paddingBottom:9,borderBottom:`1px solid ${C.border}`}}>Access Control</div>
                {[{l:"Open Registration",v:true},{l:"Require Email Verification",v:false},{l:"Allow Guest Access",v:true},{l:"Total Registered Users",v:users.length}].map(({l,v},i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                    <span style={{color:C.mid,fontSize:12,fontFamily:C.mono}}>{l}</span>
                    {typeof v==="boolean"?<span style={{color:v?C.teal:C.red,fontSize:12,fontFamily:C.mono,fontWeight:600}}>{v?"● Enabled":"○ Disabled"}</span>:<span style={{color:C.text,fontSize:12,fontFamily:C.mono,fontWeight:600}}>{v}</span>
                    }
                  </div>
                ))}
              </div>
              {/* Roles */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"18px 20px"}}>
                <div style={{color:C.gold,fontSize:10,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:14,paddingBottom:9,borderBottom:`1px solid ${C.border}`}}>Role Permissions</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                  {[
                    {role:"Admin",col:C.gold,perms:["Full platform access","User management","System config","All data sources","AI Insights","Activity logs"]},
                    {role:"Analyst",col:C.teal,perms:["All data sources","AI Insights","CSV export","Compare countries","Save charts","View activity (own)"]},
                    {role:"User",col:C.blue,perms:["All data sources","CSV export","Compare countries","Basic charts","Own settings","—"]},
                  ].map(({role,col,perms})=>(
                    <div key={role} style={{background:C.surface,border:`1px solid ${col}33`,borderRadius:6,padding:"13px 15px"}}>
                      <div style={{color:col,fontWeight:700,fontSize:12,marginBottom:10}}>{role}</div>
                      {perms.map((p,i)=><div key={i} style={{color:p==="—"?C.dim:C.mid,fontSize:11,fontFamily:C.mono,padding:"3px 0",borderBottom:i<perms.length-1?`1px solid ${C.border}`:"none"}}>{p!=="—"?"✓ ":""}{p}</div>)}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Footer */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderTop:`1px solid ${C.border}`,marginTop:4,flexShrink:0}}>
            <span style={{color:C.dim,fontSize:10,fontFamily:C.mono}}>EcoScope Admin Panel · v2.0 · {users.length} registered users · {sourceStatuses.filter(s=>s.status==="live").length} live sources</span>
            <span style={{color:C.dim,fontSize:10,fontFamily:C.mono}}>{new Date().toLocaleTimeString()}</span>
          </div>
        </main>
      </div>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
          #eco-overlay.open{display:block!important;}
          #eco-main{width:100%!important;margin-left:0!important;}
          #eco-hamburger{display:flex!important;}
          .eco-close-btn{display:block!important;}
          .eco-breadcrumb{display:none!important;}
          .eco-subtitle{display:none!important;}
        }
        }
      `}</style>
      <style>{globalCSS()}</style>

      {/* Invite Modal */}
      {showInvite&&<InviteModal onClose={()=>setShowInvite(false)} onDone={()=>{refresh();notify("User invited successfully");}}/>}

      {/* Edit User Modal */}
      {editUser&&<EditUserModal user={editUser} onClose={()=>setEditUser(null)} onSave={()=>{refresh();notify(`${editUser.username} updated`);setEditUser(null);}}/>}

      {/* Confirm Delete */}
      {confirmDelete&&(
        <div style={{position:"fixed",inset:0,background:C.overlay,display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}}>
          <div style={{background:C.surface,border:`2px solid ${C.red}55`,borderRadius:8,padding:"36px 40px",width:400,textAlign:"center",fontFamily:C.font}}>
            <div style={{fontSize:40,marginBottom:16}}><Ico n="trash"/></div>
            <h2 style={{color:C.text,fontSize:17,fontWeight:700,marginBottom:10}}>Delete User?</h2>
            <p style={{color:C.mid,fontSize:12,fontFamily:C.mono,marginBottom:8,lineHeight:1.7}}>
              You are about to permanently delete <strong style={{color:C.gold}}>{confirmDelete.username}</strong> ({confirmDelete.email}).
            </p>
            <p style={{color:C.red,fontSize:11,fontFamily:C.mono,marginBottom:24}}>⚠︎ This action cannot be undone.</p>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button onClick={()=>setConfirmDelete(null)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"11px 22px",color:C.mid,fontSize:12,cursor:"pointer"}}>Cancel</button>
              <button onClick={()=>{US.deleteUser(confirmDelete.username);refresh();notify(`${confirmDelete.username} deleted`,"error");setConfirmDelete(null);setSelectedUser(null);}} style={{background:C.red,border:"none",borderRadius:6,padding:"11px 26px",color:C.onGold,fontSize:12,fontWeight:700,cursor:"pointer"}}>Delete Permanently</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { AdminPanel };
