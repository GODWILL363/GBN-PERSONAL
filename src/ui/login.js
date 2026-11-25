// ui/login.js — split from App.js (code unchanged; only imports and exports were added)
import { labExport } from "../workbench/export";
import { useEffect, useState } from "react";
import { dlCSV, dlPDF, fmtVal, useIsMobile } from "../core/fetch";
import { US } from "../core/store";
import { C, COUNTRIES, Ico, PLANS, checkPw, checkUn, globalCSS, ink, pwRules } from "../core/theme";

// ── CSV Import & Frequency Auto-Detection ────────────────────────────────────
// CSV/TSV reader: quoted fields may hold commas, quotes ("") and line breaks, e.g. "Egypt, Arab Rep."
const parseCSV = (text) => {
  const src = String(text || "").replace(/^﻿/, "");
  const first = (src.match(/^[^\r\n]*/) || [""])[0];
  const count = (ch) => { let n = 0, q = false; for (const c of first) { if (c === '"') q = !q; else if (!q && c === ch) n++; } return n; };
  const delim = count("\t") > 0 ? "\t" : count(";") > count(",") ? ";" : ",";
  const recs = []; let row = [], cell = "", q = false, quoted = false;
  const endCell = () => { row.push(quoted ? cell : cell.trim()); cell = ""; quoted = false; };
  for (let i = 0; i < src.length; i++) { const c = src[i];
    if (q) { if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"' && cell.trim() === "") { q = true; quoted = true; cell = ""; continue; }
    if (c === delim) { endCell(); continue; }
    if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; endCell(); if (row.some(x => x !== "")) recs.push(row); row = []; continue; }
    cell += c; }
  endCell(); if (row.some(x => x !== "")) recs.push(row);
  if (recs.length < 2) return {error:"CSV needs a header row and at least one data row."};
  const headers = recs[0].map(h => h.trim());
  const rows = recs.slice(1).map(r => r.map(c => String(c).trim()));
  return {headers, rows, delim};
};
// Auto-detect the time/date column and its frequency
const detectTimeColumn = (headers, rows) => {
  for(let c=0;c<headers.length;c++){
    const h=headers[c].toLowerCase();
    const vals=rows.map(r=>r[c]).filter(Boolean);
    // Header name hints
    const nameHint=/date|year|time|period|month|quarter|day/.test(h);
    // Value pattern checks
    const allYears=vals.every(v=>/^(19|20)\d{2}$/.test(v));
    const allDates=vals.every(v=>/\d{4}-\d{2}(-\d{2})?/.test(v)||/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(v));
    const hasQuarter=vals.some(v=>/Q[1-4]/i.test(v));
    const hasMonth=vals.some(v=>/^\d{4}-\d{2}$/.test(v))||vals.some(v=>/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(v));
    if(nameHint||allYears||allDates||hasQuarter){
      let freq="annual";
      if(hasQuarter) freq="quarterly";
      else if(hasMonth) freq="monthly";
      else if(allDates&&!allYears) freq="daily";
      return {col:c, freq, name:headers[c]};
    }
  }
  return {col:0, freq:"annual", name:headers[0]}; // fallback: first column
};
// Sort years numerically and dates/periods (2020-01, 2020Q1) as text
const ecoTimeCmp=(a,b)=>{ const x=+a, y=+b; return (isFinite(x)&&isFinite(y)&&String(a).trim()!==""&&String(b).trim()!=="")? x-y : String(a).localeCompare(String(b),undefined,{ numeric:true }); };
// Convert imported CSV into EcoScope series format
const csvToSeries = (headers, rows, timeCol) => {
  // {columnName: [{year, value}]}; repeated time values (e.g. several firms on the same date) are averaged so each series has one value per period
  const series={};
  headers.forEach((h,c)=>{
    if(c===timeCol) return;
    const acc=new Map(); let ok=0, seen=0;
    for(let i=0;i<rows.length;i++){ const r=rows[i]; const t=r[timeCol]; if(t==null||t==="") continue; const raw=r[c]; if(raw==null||raw===""||/^(na|n\/a|nan|null|\.|-|\.\.)$/i.test(raw)) continue; seen++;
      const v=parseFloat(String(raw).replace(/[$,%\s]/g,"")); if(isNaN(v)) { if(seen>50 && ok<seen*0.2) break; continue; } ok++;
      const e=acc.get(t); if(e){ e.s+=v; e.n++; } else acc.set(t,{ s:v, n:1 }); }
    if(acc.size && ok>=seen*0.5) series[h]=[...acc.entries()].map(([t,e])=>({year:/^\d{4}$/.test(String(t))? +t : t, value:e.s/e.n})).sort((a,b)=>ecoTimeCmp(a.year,b.year));
  });
  return series;
};
// Long panel check: the time column repeats and another (text) column identifies units (country, firm, ticker…)
const ecoPanelInfo = (parsed, tcol) => {
  const { headers, rows } = parsed; const n=rows.length; if (n<20) return null;
  const tu=new Set(); for (let i=0;i<n;i++) tu.add(rows[i][tcol]); if (tu.size>=0.9*n) return null;
  const sample=rows.length>5000? rows.filter((_,i)=>i%Math.ceil(rows.length/5000)===0) : rows;
  let best=null;
  headers.forEach((h,c)=>{ if (c===tcol) return; const vals=sample.map(r=>r[c]).filter(v=>v!==""&&v!=null); if (!vals.length) return;
    const num=vals.filter(v=>isFinite(parseFloat(String(v).replace(/[$,%\s]/g,"")))&&/^[-+$\d.,%\s]+$/.test(String(v))).length/vals.length; if (num>0.5) return;
    const cnt=new Map(); for (let i=0;i<n;i++){ const u=rows[i][c]; cnt.set(u,(cnt.get(u)||0)+1); } if (cnt.size<2 || cnt.size>n/2) return;
    const score=Math.abs(Math.log((cnt.size*tu.size)/n)); if (!best || score<best.score) best={ unitCol:c, unitName:h, units:[...cnt.entries()].sort((a,b)=>b[1]-a[1]).map(([u,k])=>({ u:String(u), n:k })), score }; });
  return best? { ...best, nTimes:tu.size, nRows:n } : null;
};
// ══════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════

const inp = {
  get background(){return C.inputBg}, get border(){return `1px solid ${C.border}`}, borderRadius:6,
  padding:"9px 12px", get color(){return C.text}, fontSize:13, get fontFamily(){return C.font},
  outline:"none", boxSizing:"border-box", width:"100%", transition:"border-color .15s ease, box-shadow .15s ease"};
const sel = Object.defineProperties({cursor:"pointer"}, Object.getOwnPropertyDescriptors(inp));
const pill = (active, col=C.gold) => ({padding:"5px 11px",borderRadius:4,border:"1px solid",borderColor:active?col:(C.pillBorder||C.border),
  background:active?`${col}${C.scheme==="light"?"14":"1f"}`:(C.scheme==="light"?C.card:"transparent"),color:active?col:(C.scheme==="light"?C.text:C.mid),fontSize:11,fontWeight:active?600:500,cursor:"pointer",
  boxShadow:C.scheme==="light"&&!active?"0 1px 0 rgba(11,20,36,.04)":"none",
  fontFamily:C.font,transition:"background-color .15s, border-color .15s, color .15s",whiteSpace:"nowrap"});
const btn = (col=C.gold) => ({background:col,color:C.onGold,border:`1px solid ${col}`,borderRadius:6,padding:"9px 18px",
  fontSize:13,fontWeight:600,fontFamily:C.font,cursor:"pointer",letterSpacing:"0.01em",boxShadow:"none"});
const card = {
  get background(){return C.card}, get border(){return `1px solid ${C.border}`}, borderRadius:6, padding:"16px 20px",
  get boxShadow(){return C.shadow}, position:"relative"};
// ══════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════

// ── Accept an invitation: /?invite=<token> → choose a username and password → signed in ──
function AcceptInvite({ token, onLogin, onCancel }){
  const [info,setInfo]=useState(null); const [err,setErr]=useState(""); const [u,setU]=useState(""); const [p,setP]=useState(""); const [p2,setP2]=useState(""); const [busy,setBusy]=useState(false);
  useEffect(()=>{ fetch(`/api/auth/invite/${encodeURIComponent(token)}`).then(r=>r.json().then(j=>({ok:r.ok,j}))).then(({ok,j})=>{ if(ok) setInfo(j); else setErr(j.error||"This invitation link is not valid."); }).catch(()=>setErr("Could not check the invitation. Please try again.")); },[token]);
  const unErrs=u.trim()?checkUn(u.trim()):[]; const pwErrs=p?checkPw(p):[];
  const go=async e=>{ e.preventDefault(); setErr("");
    if(!u.trim()||unErrs.length){ setErr(unErrs[0]||"Choose a username"); return; } if(pwErrs.length){ setErr(pwErrs[0]); return; } if(p!==p2){ setErr("Passwords do not match"); return; }
    setBusy(true);
    try{ const r=await fetch("/api/auth/accept-invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,username:u.trim(),password:p})}); const j=await r.json();
      if(!r.ok){ setErr(j.error||"Could not finish setting up the account."); setBusy(false); return; }
      const nu=j.user; const initials=nu.username.slice(0,2).toUpperCase(); const avatarColor=["#6ea8fe","#3ecf8e","#f0a950","#b39ddb","#56c7d4"][Math.abs(nu.username.charCodeAt(0)||0)%5];
      onLogin({...nu,token:j.token,initials,avatarColor});
    }catch(_){ setErr("Could not reach EcoScope. Please try again."); setBusy(false); } };
  const inp={width:"100%",boxSizing:"border-box",background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,padding:"10px 12px",fontSize:14,fontFamily:C.font,marginBottom:12};
  const lab={color:C.mid,fontSize:11,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6,display:"block"};
  return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:16,fontFamily:C.font}}>
      <form onSubmit={go} style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:10,padding:"32px 36px",width:"100%",maxWidth:420}}>
        <h1 style={{color:C.text,fontSize:20,margin:"0 0 6px"}}>Welcome to EcoScope</h1>
        {!info&&!err&&<p style={{color:C.mid,fontSize:13}}>Checking your invitation…</p>}
        {info&&<p style={{color:C.mid,fontSize:13,margin:"0 0 18px"}}>You were invited as <b style={{color:C.text}}>{info.email}</b>. Choose a username and password to finish.</p>}
        {info&&<>
          <label style={lab} htmlFor="inv-u">Username</label><input id="inv-u" autoComplete="username" value={u} onChange={e=>setU(e.target.value)} style={inp}/>
          <label style={lab} htmlFor="inv-p">Password</label><input id="inv-p" type="password" autoComplete="new-password" value={p} onChange={e=>setP(e.target.value)} style={inp}/>
          {p&&pwErrs.length>0&&<div style={{color:C.dim,fontSize:11,marginTop:-6,marginBottom:10}}>{pwErrs.join(" · ")}</div>}
          <label style={lab} htmlFor="inv-p2">Confirm password</label><input id="inv-p2" type="password" autoComplete="new-password" value={p2} onChange={e=>setP2(e.target.value)} style={inp}/>
          <button type="submit" disabled={busy} style={{...btn(),width:"100%",padding:"11px",marginTop:4}}>{busy?"Setting up…":"Create my account →"}</button>
        </>}
        {err&&<div role="alert" style={{color:C.red,fontSize:13,marginTop:12}}>{err}</div>}
        <button type="button" onClick={onCancel} style={{background:"none",border:"none",color:C.teal,fontSize:12,marginTop:16,cursor:"pointer",padding:0}}>Go to sign in</button>
      </form>
    </div>);
}
// ── Reset a forgotten password: emailed link /?reset=<token> → new password → signed in ──
function ResetPassword({ token, onLogin, onCancel }){
  const [name,setName]=useState(null); const [err,setErr]=useState(""); const [p,setP]=useState(""); const [p2,setP2]=useState(""); const [busy,setBusy]=useState(false);
  useEffect(()=>{ fetch(`/api/auth/reset/${encodeURIComponent(token)}`).then(r=>r.json().then(j=>({ok:r.ok,j}))).then(({ok,j})=>{ if(ok) setName(j.username); else setErr(j.error||"This reset link is not valid."); }).catch(()=>setErr("Could not check the link. Please try again.")); },[token]);
  const pwErrs=p?checkPw(p):[];
  const go=async e=>{ e.preventDefault(); setErr(""); if(pwErrs.length||!p){ setErr(pwErrs[0]||"Choose a new password"); return; } if(p!==p2){ setErr("Passwords do not match"); return; }
    setBusy(true);
    try{ const r=await fetch("/api/auth/reset",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,password:p})}); const j=await r.json();
      if(!r.ok){ setErr(j.error||"Could not reset the password."); setBusy(false); return; }
      const nu=j.user; const initials=nu.username.slice(0,2).toUpperCase(); const avatarColor=["#6ea8fe","#3ecf8e","#f0a950","#b39ddb","#56c7d4"][Math.abs(nu.username.charCodeAt(0)||0)%5];
      onLogin({...nu,token:j.token,initials,avatarColor});
    }catch(_){ setErr("Could not reach EcoScope. Please try again."); setBusy(false); } };
  const inp={width:"100%",boxSizing:"border-box",background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,padding:"10px 12px",fontSize:14,fontFamily:C.font,marginBottom:12};
  const lab={color:C.mid,fontSize:11,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6,display:"block"};
  return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:16,fontFamily:C.font}}>
      <form onSubmit={go} style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:10,padding:"32px 36px",width:"100%",maxWidth:420}}>
        <h1 style={{color:C.text,fontSize:20,margin:"0 0 6px"}}>Choose a new password</h1>
        {!name&&!err&&<p style={{color:C.mid,fontSize:13}}>Checking your link…</p>}
        {name&&<>
          <p style={{color:C.mid,fontSize:13,margin:"0 0 18px"}}>For the account <b style={{color:C.text}}>{name}</b>.</p>
          <label style={lab} htmlFor="rs-p">New password</label><input id="rs-p" type="password" autoComplete="new-password" value={p} onChange={e=>setP(e.target.value)} style={inp}/>
          {p&&pwErrs.length>0&&<div style={{color:C.dim,fontSize:11,marginTop:-6,marginBottom:10}}>{pwErrs.join(" · ")}</div>}
          <label style={lab} htmlFor="rs-p2">Confirm password</label><input id="rs-p2" type="password" autoComplete="new-password" value={p2} onChange={e=>setP2(e.target.value)} style={inp}/>
          <button type="submit" disabled={busy} style={{...btn(),width:"100%",padding:"11px",marginTop:4}}>{busy?"Saving…":"Save and sign in →"}</button>
        </>}
        {err&&<div role="alert" style={{color:C.red,fontSize:13,marginTop:12}}>{err}</div>}
        <button type="button" onClick={onCancel} style={{background:"none",border:"none",color:C.teal,fontSize:12,marginTop:16,cursor:"pointer",padding:0}}>Go to sign in</button>
      </form>
    </div>);
}

function Login({onLogin, notice=""}){
  const [mode,setMode]=useState("login");
  const [u,setU]=useState(""); const [email,setEmail]=useState("");
  const [p,setP]=useState(""); const [p2,setP2]=useState("");
  const [err,setErr]=useState(""); const [loading,setLoading]=useState(false);
  const [ok,setOk]=useState(""); const [showPw,setShowPw]=useState(false);

  // Live validation
  const unErrs=u.trim()?checkUn(u):[];
  const pwErrs=p?checkPw(p):[];
  const initials=u.trim()?u.trim().slice(0,2).toUpperCase():"◈";
  const avatarColor=["#6ea8fe","#3ecf8e","#f0a950","#b39ddb","#56c7d4"][Math.abs(u.charCodeAt(0)||0)%5];

  useState(()=>{  },[]);

  const go=async e=>{
    e.preventDefault(); setErr("");
    if(mode==="forgot"){
      if(!email.trim()){setErr("Enter your email or username");return;}
      setLoading(true);
      try{ const r=await fetch("/api/auth/forgot",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email.trim()})}); const j=await r.json().catch(()=>({}));
        if(!r.ok) setErr(j.error||"Could not send the reset email. Please try again."); else setOk(j.message||"If an account uses that email, a reset link is on its way."); }
      catch(_){ setErr("Could not reach EcoScope. Please try again."); }
      setLoading(false);return;
    }
    if(mode==="register"){
      const ue=checkUn(u); if(ue.length){setErr(ue[0]);return;}
      if(!email.trim()||!email.includes("@")){setErr("Valid email required");return;}
      const pe=checkPw(p); if(pe.length){setErr(pe[0]);return;}
      if(p!==p2){setErr("Passwords do not match");return;}
      setLoading(true);await new Promise(r=>setTimeout(r,600));setLoading(false);
      const res=await US.register(u.trim(),email.trim(),p);
      if(res.error){setErr(res.error);return;}
      const initials=u.trim().slice(0,2).toUpperCase();
      const avatarColor=["#6ea8fe","#3ecf8e","#f0a950","#b39ddb","#56c7d4"][Math.abs(u.charCodeAt(0)||0)%5];
      onLogin({...res.user,initials,avatarColor});
    } else {
      if(!u.trim()||!p){setErr("Both fields required");return;}
      setLoading(true);await new Promise(r=>setTimeout(r,600));setLoading(false);
      const res=await US.login(u.trim(),p);
      if(res.error){setErr(res.error);return;}
      const initials=res.user.username.slice(0,2).toUpperCase();
      const avatarColor=["#6ea8fe","#3ecf8e","#f0a950","#b39ddb","#56c7d4"][Math.abs(res.user.username.charCodeAt(0)||0)%5];
      const role=res.user.role||(res.user.username==="admin"?"admin":"user");
      onLogin({...res.user,initials,avatarColor,role});
    }
  };

  const Tab=({id,label})=>(<button onClick={()=>{setMode(id);setErr("");setOk("");}} style={{background:"none",border:"none",padding:"10px 0",fontSize:11,fontFamily:C.mono,cursor:"pointer",color:mode===id?C.gold:C.mid,borderBottom:`2px solid ${mode===id?C.gold:"transparent"}`,transition:"all .15s",letterSpacing:"0.08em",textTransform:"uppercase",flex:1}}>{label}</button>);

  const PwStrength=({pw})=>{
    const errs=checkPw(pw);
    const score=pwRules.length-errs.length;
    const cols=[C.red,C.orange,C.gold,C.teal];
    return pw?(
      <div style={{marginTop:8}}>
        <div style={{display:"flex",gap:3,marginBottom:5}}>
          {pwRules.map((_,i)=><div key={i} style={{flex:1,height:3,borderRadius:2,background:i<score?cols[Math.min(score-1,3)]:C.border,transition:"background .2s"}}/>)}
        </div>
        {errs.map((e,i)=><div key={i} style={{color:C.red,fontSize:10,fontFamily:C.mono}}>✗ {e}</div>)}
        {!errs.length&&<div style={{color:C.teal,fontSize:10,fontFamily:C.mono}}>✓ Strong password</div>}
      </div>
    ):null;
  };

  return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:C.font,color:C.text,position:"relative",overflow:"auto",padding:16}}>
      <style>{globalCSS()}</style>
      <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(${C.border}66 1px,transparent 1px),linear-gradient(90deg,${C.border}66 1px,transparent 1px)`,backgroundSize:"32px 32px",opacity:.5,pointerEvents:"none"}}/>
            <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:6,padding:"36px 40px 28px",width:"100%",maxWidth:440,position:"relative",boxShadow:C.shadow}}>
        <div style={{textAlign:"center",marginBottom:22}}>
          <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:54,height:54,background:`${C.gold}`,borderRadius:8,fontSize:24,marginBottom:12,boxShadow:"none"}}>◈</div>
          <h1 style={{color:C.text,fontSize:24,fontWeight:700,margin:"0 0 3px",letterSpacing:"-0.5px"}}>EcoScope</h1>
          <p style={{color:C.dim,fontSize:10,margin:0,fontFamily:C.mono,letterSpacing:"0.08em"}}>GLOBAL ECONOMIC INTELLIGENCE PLATFORM</p>
        </div>

        {u.trim()&&mode!=="forgot"&&(
          <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
            <div style={{width:38,height:38,borderRadius:"50%",background:avatarColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#0b0e14",boxShadow:`0 0 0 3px ${C.surface},0 0 0 5px ${avatarColor}55`}}>{initials}</div>
          </div>
        )}

        {mode!=="forgot"&&(<div style={{display:"flex",gap:0,borderBottom:`1px solid ${C.border}`,marginBottom:20}}><Tab id="login" label="Sign In"/><Tab id="register" label="Create Account"/></div>)}

        {ok&&<div style={{background:`${C.teal}15`,border:`1px solid ${C.teal}44`,borderRadius:6,padding:"10px 13px",marginBottom:14,color:C.teal,fontSize:11,fontFamily:C.mono}}>{ok}</div>}
        {notice&&!ok&&<div role="status" style={{background:`${C.orange}15`,border:`1px solid ${C.orange}44`,borderRadius:6,padding:"10px 13px",marginBottom:14,color:C.orange,fontSize:11,fontFamily:C.mono}}>{notice}</div>}

        <form onSubmit={go}>
          {mode==="forgot"?(
            <><div style={{color:C.mid,fontSize:11,fontFamily:C.mono,marginBottom:16,lineHeight:1.6}}>Enter the email (or username) of your account. We will email you a link to choose a new password.</div>
            <div style={{marginBottom:16}}><div style={{color:C.mid,fontSize:10,fontFamily:C.mono,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:7}}>Email Address</div><input type="text" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com or username" style={{...inp,border:`1px solid ${email?C.gold:C.border}`,fontSize:13,padding:"12px 14px"}}/></div></>
          ):(
            <>
              <div style={{marginBottom:12}}>
                <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:7}}>Username</div>
                <input type="text" value={u} onChange={e=>setU(e.target.value)} placeholder="Enter your username" style={{...inp,border:`1px solid ${u&&!unErrs.length?C.teal:u&&unErrs.length?C.red:C.border}`,fontSize:13,padding:"12px 14px"}}/>
                {mode==="register"&&u&&unErrs.map((e,i)=><div key={i} style={{color:C.red,fontSize:10,fontFamily:C.mono,marginTop:4}}>✗ {e}</div>)}
                {mode==="register"&&u&&!unErrs.length&&<div style={{color:C.teal,fontSize:10,fontFamily:C.mono,marginTop:4}}>✓ Username available</div>}
              </div>
              {mode==="register"&&(
                <div style={{marginBottom:12}}>
                  <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:7}}>Email Address</div>
                  <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={{...inp,border:`1px solid ${email?C.gold:C.border}`,fontSize:13,padding:"12px 14px"}}/>
                </div>
              )}
              <div style={{marginBottom:mode==="register"?8:6}}>
                <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:7}}>Password</div>
                <div style={{position:"relative"}}>
                  <input type={showPw?"text":"password"} value={p} onChange={e=>setP(e.target.value)} placeholder={mode==="login"?"Enter password":"Min 8 chars, uppercase, number, symbol"} style={{...inp,border:`1px solid ${p&&mode==="register"?(!pwErrs.length?C.teal:C.red):p?C.gold:C.border}`,fontSize:13,padding:"12px 40px 12px 14px"}}/>
                  <button type="button" onClick={()=>setShowPw(v=>!v)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.mid,cursor:"pointer",fontSize:12}}>{showPw?<Ico n="eyeoff"/>:<Ico n="eye"/>}</button>
                </div>
                {mode==="register"&&<PwStrength pw={p}/>}
              </div>
              {mode==="register"&&(
                <div style={{marginBottom:8}}>
                  <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:7}}>Confirm Password</div>
                  <input type="password" value={p2} onChange={e=>setP2(e.target.value)} placeholder="Repeat password" style={{...inp,border:`1px solid ${p2?(p===p2?C.teal:C.red):C.border}`,fontSize:13,padding:"12px 14px"}}/>
                  {p2&&p!==p2&&<div style={{color:C.red,fontSize:10,fontFamily:C.mono,marginTop:4}}>✗ Passwords do not match</div>}
                  {p2&&p===p2&&<div style={{color:C.teal,fontSize:10,fontFamily:C.mono,marginTop:4}}>✓ Passwords match</div>}
                </div>
              )}
              {mode==="login"&&<div style={{textAlign:"right",marginBottom:14}}><button type="button" onClick={()=>{setMode("forgot");setErr("");setOk("");}} style={{background:"none",border:"none",color:C.blue,fontSize:11,fontFamily:C.mono,cursor:"pointer"}}>Forgot password?</button></div>}
            </>
          )}
          {err&&<div style={{background:`${C.red}12`,border:`1px solid ${C.red}44`,borderRadius:6,padding:"9px 12px",marginBottom:12,color:C.red,fontSize:11,fontFamily:C.mono}}>{err}</div>}
          <button type="submit" disabled={loading} style={{...btn(),width:"100%",padding:"13px",fontSize:13,opacity:loading?.6:1,marginTop:4}}>
            {loading?"PROCESSING…":mode==="login"?"SIGN IN →":mode==="register"?"CREATE ACCOUNT →":"SEND RESET LINK →"}
          </button>
        </form>
        {mode==="forgot"&&<button onClick={()=>{setMode("login");setOk("");setErr("");}} style={{background:"none",border:"none",color:C.mid,fontSize:11,fontFamily:C.mono,cursor:"pointer",width:"100%",textAlign:"center",marginTop:14}}>← Back to Sign In</button>}
        <div style={{borderTop:`1px solid ${C.border}`,marginTop:20,paddingTop:14,display:"flex",justifyContent:"center",gap:22}}>
          {[[<Ico n="globe"/>,"World Bank"],[<Ico n="chart"/>,"IMF"],[<Ico n="bank"/>,"FRED"],[<Ico n="flask"/>,"WHO"]].map(([ic,nm])=>(
            <div key={nm} style={{textAlign:"center"}}><div style={{fontSize:16,marginBottom:2}}>{ic}</div><div style={{color:C.dim,fontSize:10,fontFamily:C.mono}}>{nm}</div></div>
          ))}
        </div>
        <p style={{textAlign:"center",color:C.dim,fontSize:10,marginTop:10,fontFamily:C.mono}}>EcoScope · Real accounts required</p>
      </div>
    </div>
  );
}
// ══════════════════════════════════════════════
// UPGRADE MODAL
// ══════════════════════════════════════════════
function UpgradeModal({feature,requiredPlan="pro",onClose,onUpgrade}){
  const pl=PLANS[requiredPlan]||PLANS.pro;
  return(
    <div style={{position:"fixed",inset:0,background:C.overlay,display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`2px solid ${pl.color}55`,borderRadius:6,padding:"40px 44px",width:430,textAlign:"center",boxShadow:`0 32px 80px rgba(0,0,0,.7),0 0 0 1px ${pl.color}22`}}>
        <div style={{fontSize:40,marginBottom:14}}><Ico n="lock"/></div>
        <div style={{background:`${pl.color}18`,border:`1px solid ${pl.color}44`,borderRadius:6,padding:"4px 14px",display:"inline-block",marginBottom:14}}>
          <span style={{color:ink(pl.color),fontSize:11,fontFamily:C.mono,fontWeight:700,letterSpacing:"0.12em"}}>{pl.badge} PLAN REQUIRED</span>
        </div>
        <h2 style={{color:C.text,fontSize:18,fontWeight:700,margin:"0 0 10px",lineHeight:1.3}}>{feature}</h2>
        <p style={{color:C.mid,fontSize:12,fontFamily:C.mono,marginBottom:24,lineHeight:1.7}}>
          This feature requires the <strong style={{color:ink(pl.color)}}>{pl.name} plan</strong> ({pl.priceLabel}).<br/>
          Upgrade to unlock AI Insights, all 10 data sources, Excel & PDF exports, and country comparison.
        </p>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={onClose} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"11px 22px",color:C.mid,fontSize:12,cursor:"pointer",fontFamily:C.font}}>Maybe later</button>
          <button onClick={onUpgrade} style={{background:`${pl.color}`,border:"none",borderRadius:6,padding:"11px 26px",color:C.onGold,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:C.font}}>Upgrade to {pl.name} →</button>
        </div>
      </div>
    </div>
  );
}
// ══════════════════════════════════════════════
// EXPORT MENU
// ══════════════════════════════════════════════
function ExportMenu({data,currentVar,cc,source,startYear,endYear,plan,onUpgradeNeeded,getTable}){
  const [open,setOpen]=useState(false);
  const canXls=plan.exports.includes("excel");
  const canPdf=plan.exports.includes("pdf");
  const fmt=currentVar.fmt;
  const filename=`${cc.name}_${currentVar.name.replace(/[^a-z0-9]/gi,"_")}_${startYear}_${endYear}`;

  const doExport=(type)=>{
    setOpen(false);
    // With several variables (from any mix of sources) CSV and Excel export one column per variable
    const multi=getTable? getTable() : null; const useMulti=multi && multi.headers.length>3;
    if(type==="csv"){
      if(useMulti){ const q=v=>{ const t=v==null?"":String(v); return /[",\n]/.test(t)?`"${t.replace(/"/g,'""')}"`:t; }; const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([[multi.headers.map(q).join(","),...multi.rows.map(r=>r.map(q).join(","))].join("\n")],{type:"text/csv"})); a.download=`${cc.name}_${multi.headers.length-2}_variables_${startYear}_${endYear}.csv`; a.click(); return; }
      dlCSV(data.map(d=>({country:cc.name, iso2:cc.code, year:d.year, [currentVar.name]:d.value})),filename+".csv");
    } else if(type==="excel"){
      if(!canXls){onUpgradeNeeded("Excel Export");return;}
      const headers=useMulti? multi.headers : ["Year","Value","YoY Change"];
      const rows=useMulti? multi.rows : data.map((d,i)=>{
        const prev=data[i-1];
        const delta=prev&&prev.value?((d.value-prev.value)/Math.abs(prev.value)*100):null;
        return [d.year, fmtVal(d.value,fmt), delta==null?"—":`${delta>=0?"+":""}${delta.toFixed(2)}%`];
      });
      const xmlRows=[headers,...rows].map(r=>`<Row>${r.map(v=>`<Cell><Data ss:Type="String">${String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;")}</Data></Cell>`).join("")}</Row>`).join("");
      const xml=`<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="EcoScope"><Table>${xmlRows}</Table></Worksheet></Workbook>`;
      const a=document.createElement("a");
      a.href=URL.createObjectURL(new Blob([xml],{type:"application/vnd.ms-excel;charset=utf-8"}));
      a.download=filename+".xls"; a.click();
      US.log(cc.name,"Excel Export",`${currentVar.name} · ${startYear}–${endYear}`);
    } else if(type==="docx"||type==="pptx"){
      if(!canXls){onUpgradeNeeded(type==="docx"?"Word Export":"PowerPoint Export");return;}
      const rows=useMulti? multi.rows.map(r=>Object.fromEntries(multi.headers.map((h,i)=>[h,r[i]]))) : data.map((d,i)=>{ const prev=data[i-1]; const delta=prev&&prev.value?((d.value-prev.value)/Math.abs(prev.value)*100):null; return { Year:d.year, [currentVar.name]:fmtVal(d.value,fmt), "Change on previous":delta==null?"—":`${delta>=0?"+":""}${delta.toFixed(2)}%` }; });
      labExport(type,`${currentVar.name}, ${cc.name} (${source.short||source.name}) ${startYear}–${endYear}`,[{rows,name:filename}]).catch(e=>window.alert("Export failed: "+e.message));
      US.log(cc.name,type==="docx"?"Word Export":"PowerPoint Export",`${currentVar.name} · ${startYear}–${endYear}`);
    } else if(type==="pdf"){
      if(!canPdf){onUpgradeNeeded("PDF Export");return;}
      dlPDF(data,currentVar.name,cc.name,source.name,startYear,endYear,fmt);
      US.log(cc.name,"PDF Export",`${currentVar.name} · ${startYear}–${endYear}`);
    }
  };

  return(
    <div style={{position:"relative"}}>
      <button onClick={()=>setOpen(v=>!v)} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:6,border:`1px solid ${C.teal}66`,background:open?`${C.teal}18`:"transparent",color:C.teal,fontSize:11,cursor:"pointer",fontFamily:C.mono,fontWeight:600}}>
        ↓ Export {open?"▲":"▼"}
      </button>
      {open&&(
        <>
          <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:98}}/>
          <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:8,padding:8,minWidth:210,zIndex:99,boxShadow:C.shadow}}>
            <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,padding:"4px 10px 6px",textTransform:"uppercase",letterSpacing:"0.12em"}}>Choose Format</div>
            {[
              {type:"csv",icon:<Ico n="file"/>,label:"CSV",sub:"Comma separated values",free:true},
              {type:"excel",icon:<Ico n="chart"/>,label:"Excel (.xls)",sub:"Spreadsheet with formatting",free:canXls},
              {type:"pdf",icon:<Ico n="clipboard"/>,label:"PDF Report",sub:"Printable formatted report",free:canPdf},
              {type:"docx",icon:<Ico n="file"/>,label:"Word (.docx)",sub:"Table ready for a report",free:canXls},
              {type:"pptx",icon:<Ico n="chart"/>,label:"PowerPoint (.pptx)",sub:"Table on slides",free:canXls},
            ].map(({type,icon,label,sub,free})=>(
              <button key={type} onClick={()=>doExport(type)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 12px",borderRadius:6,border:"none",background:"transparent",cursor:"pointer",textAlign:"left",transition:"background .1s"}}>
                <span style={{fontSize:18,flexShrink:0}}>{icon}</span>
                <div style={{flex:1}}>
                  <div style={{color:C.text,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
                    {label}
                    {!free&&<span style={{background:`${C.gold}20`,color:C.gold,fontSize:10,fontFamily:C.mono,borderRadius:4,padding:"1px 5px",fontWeight:700}}>PRO</span>}
                  </div>
                  <div style={{color:C.dim,fontSize:11,fontFamily:C.mono}}>{sub}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
// ══════════════════════════════════════════════
// SUPPORT FORM COMPONENT
// ══════════════════════════════════════════════
// ══════════════════════════════════════════════
// SETTINGS MODAL
// ══════════════════════════════════════════════
// Section and field wrappers live at module level so inputs keep focus while typing.
const StSec = ({ title, sub, children, right }) => (
  <section style={{ marginBottom: 22 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.text }}>{title}</h3>
        {sub && <div style={{ fontSize: 12, color: C.mid, marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
    </div>
    {children}
  </section>
);
const StField = ({ label, hint, htmlFor, children }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8 }}>
      <label htmlFor={htmlFor} style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>{label}</label>
      {hint && <span style={{ color: C.dim, fontSize: 11 }}>{hint}</span>}
    </div>
    {children}
  </div>
);
// Password input with show / hide toggle
const PasswordInput = ({ id, value, onChange, placeholder, autoComplete = "current-password", invalid = false }) => {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input id={id} type={show ? "text" : "password"} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete}
        aria-invalid={invalid || undefined} style={{ ...inp, fontSize: 13, paddingRight: 42, borderColor: invalid ? C.red : undefined }} />
      <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
        style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 34, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 4, color: C.mid, cursor: "pointer" }}>
        <Ico n={show ? "eyeoff" : "eye"} s={16} />
      </button>
    </div>
  );
};
const StBanner = ({ tone = "info", children }) => { const col = tone === "ok" ? C.teal : tone === "bad" ? C.red : tone === "warn" ? C.orange : C.blue;
  return <div role={tone === "bad" ? "alert" : "status"} style={{ background: `${col}12`, border: `1px solid ${col}44`, borderRadius: 6, padding: "9px 12px", color: C.text, fontSize: 12, lineHeight: 1.55, marginBottom: 12 }}>{children}</div>; };
function ChangePassword({ user }) {
  const [cur, setCur] = useState(""); const [nw, setNw] = useState(""); const [cf, setCf] = useState("");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  const errs = nw ? checkPw(nw) : []; const mismatch = cf && nw !== cf; const same = nw && cur && nw === cur;
  const ready = cur && nw && cf && !errs.length && !mismatch && !same;
  const submit = async (e) => { e.preventDefault(); if (!ready) return; setBusy(true); setMsg(null);
    const r = await US.changePassword(user.username, cur, nw);
    setBusy(false);
    if (r.error) setMsg({ tone: "bad", text: r.error });
    else { setMsg({ tone: "ok", text: "Password updated. Use the new password next time you sign in." }); setCur(""); setNw(""); setCf(""); }
  };
  return (
    <form onSubmit={submit} noValidate>
      {msg && <StBanner tone={msg.tone}>{msg.text}</StBanner>}
      <StField label="Current password" htmlFor="pw-cur"><PasswordInput id="pw-cur" value={cur} onChange={setCur} placeholder="Enter your current password" /></StField>
      <StField label="New password" htmlFor="pw-new"><PasswordInput id="pw-new" value={nw} onChange={setNw} placeholder="At least 8 characters" autoComplete="new-password" invalid={!!nw && errs.length > 0} /></StField>
      {nw && <ul aria-label="Password requirements" style={{ listStyle: "none", margin: "-6px 0 12px", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: "2px 12px" }}>
        {pwRules.map(rl => { const ok = rl.re.test(nw); return <li key={rl.msg} style={{ fontSize: 11, color: ok ? C.teal : C.mid }}>{ok ? "✓" : "○"} {rl.msg}</li>; })}
        {same && <li style={{ fontSize: 11, color: C.red }}>✗ Must differ from the current password</li>}
      </ul>}
      <StField label="Confirm new password" htmlFor="pw-cf"><PasswordInput id="pw-cf" value={cf} onChange={setCf} placeholder="Repeat the new password" autoComplete="new-password" invalid={!!mismatch} /></StField>
      {mismatch && <div style={{ fontSize: 11, color: C.red, marginTop: -8, marginBottom: 12 }}>Passwords do not match.</div>}
      <button type="submit" disabled={!ready || busy} style={{ ...btn(), padding: "9px 18px", fontSize: 12, opacity: !ready || busy ? 0.5 : 1 }}>{busy ? "Updating…" : "Update password"}</button>
    </form>
  );
}
// Account details (saved on the server) and account deletion
function AccountManager({ user, onAccount, onDeleted, settings, onSaveSettings, part = "all" }) {
  const isMobile = useIsMobile(); const prof = (user.settings && user.settings.profile) || {};
  const init = () => ({ display_name: prof.display_name || (settings && settings.displayName) || "", email: user.email || "", country: user.country || "GH", organisation: prof.organisation || "", job_title: prof.job_title || "" });
  const [f, setF] = useState(init); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  const base = init();
  const dirty = JSON.stringify(f) !== JSON.stringify(base); const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim());
  const save = async (e) => { e.preventDefault(); if (!dirty || !emailOk) return; setBusy(true); setMsg(null);
    const r = await US.updateAccount({ ...f, email: f.email.trim() }); setBusy(false);
    if (r.error) setMsg({ tone: "bad", text: r.error });
    else { onAccount && onAccount(r.user || {}); if (f.display_name !== ((settings || {}).displayName || "")) onSaveSettings && onSaveSettings({ ...(settings || {}), displayName: f.display_name });
      setMsg({ tone: "ok", text: r.changed && r.changed.length ? `Saved: ${r.changed.join(", ")}.` : "Nothing changed." }); } };
  const [del, setDel] = useState({ open: false, pw: "", word: "", busy: false, err: "" });
  const doDelete = async (e) => { e.preventDefault(); if (del.word.trim().toUpperCase() !== "DELETE" || !del.pw) return; setDel(d => ({ ...d, busy: true, err: "" }));
    const r = await US.deleteAccount(del.pw, del.word); if (r.error) { setDel(d => ({ ...d, busy: false, err: r.error })); return; }
    try { Object.keys(localStorage).filter(k => k.startsWith("ecoscope")).forEach(k => localStorage.removeItem(k)); } catch (er) { /* storage blocked */ }
    onDeleted && onDeleted(); };
  const isMain = user.username === "admin";
  return <>
    {part !== "delete" && <StSec title="Account details" sub="Saved to your account and used across devices, in shared projects and on support tickets.">
      <form onSubmit={save} noValidate>
        {msg && <StBanner tone={msg.tone}>{msg.text}</StBanner>}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0 16px" }}>
          <StField label="Display name" htmlFor="ac-name"><input id="ac-name" value={f.display_name} onChange={e => setF(x => ({ ...x, display_name: e.target.value }))} maxLength={120} style={{ ...inp, fontSize: 13 }} placeholder={user.username} autoComplete="name" /></StField>
          <StField label="Email" htmlFor="ac-email" hint="used to sign in and for sharing"><input id="ac-email" type="email" value={f.email} onChange={e => setF(x => ({ ...x, email: e.target.value }))} aria-invalid={!emailOk} style={{ ...inp, fontSize: 13, borderColor: emailOk ? undefined : C.red }} autoComplete="email" /></StField>
          <StField label="Country" htmlFor="ac-country"><select id="ac-country" value={f.country} onChange={e => setF(x => ({ ...x, country: e.target.value }))} style={{ ...sel, fontSize: 13 }}>{!COUNTRIES.some(c => c.code === f.country) && <option value={f.country}>{f.country}</option>}{COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></StField>
          <StField label="Organisation" htmlFor="ac-org" hint="optional"><input id="ac-org" value={f.organisation} onChange={e => setF(x => ({ ...x, organisation: e.target.value }))} maxLength={120} style={{ ...inp, fontSize: 13 }} autoComplete="organization" /></StField>
          <StField label="Job title" htmlFor="ac-job" hint="optional"><input id="ac-job" value={f.job_title} onChange={e => setF(x => ({ ...x, job_title: e.target.value }))} maxLength={120} style={{ ...inp, fontSize: 13 }} autoComplete="organization-title" /></StField>
          <StField label="Username"><div style={{ ...inp, fontSize: 13, background: C.raised, color: C.mid }}>{user.username} <span style={{ fontSize: 11 }}>(cannot be changed; projects and sharing use it)</span></div></StField>
        </div>
        {!emailOk && <div style={{ fontSize: 11.5, color: C.red, margin: "-6px 0 10px" }}>Enter a valid email address.</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={!dirty || !emailOk || busy} style={{ ...btn(), padding: "9px 18px", fontSize: 12, opacity: !dirty || !emailOk || busy ? 0.5 : 1 }}>{busy ? "Saving…" : "Update account"}</button>
          <button type="button" disabled={!dirty || busy} onClick={() => { setF(base); setMsg(null); }} style={{ ...pill(false), opacity: !dirty ? 0.5 : 1 }}>Undo changes</button>
        </div>
      </form>
    </StSec>}
    {part !== "details" && <StSec title="Delete account" sub="Permanently removes your account, your projects (with their history and sharing), your support messages and your activity log. Projects others shared with you stay with their owners.">
      {isMain ? <p style={{ fontSize: 12, color: C.mid, margin: 0 }}>The main administrator account cannot be deleted.</p>
      : !del.open ? <button type="button" onClick={() => setDel(d => ({ ...d, open: true }))} style={{ ...pill(false, C.red), border: `1px solid ${C.red}`, color: C.red, fontWeight: 600 }}>Delete my account…</button>
      : <form onSubmit={doDelete} noValidate style={{ border: `1px solid ${C.red}`, borderRadius: 8, padding: "12px 14px", background: `${C.red}0d` }}>
        <p style={{ fontSize: 12.5, color: C.text, margin: "0 0 10px" }}>This cannot be undone. Export any datasets you want to keep first (Workbench → Datasets → Download CSV).</p>
        {del.err && <StBanner tone="bad">{del.err}</StBanner>}
        <StField label="Your password" htmlFor="ac-del-pw"><PasswordInput id="ac-del-pw" value={del.pw} onChange={v => setDel(d => ({ ...d, pw: v }))} placeholder="Current password" /></StField>
        <StField label="Type DELETE to confirm" htmlFor="ac-del-word"><input id="ac-del-word" value={del.word} onChange={e => setDel(d => ({ ...d, word: e.target.value }))} style={{ ...inp, fontSize: 13, maxWidth: 220 }} autoComplete="off" /></StField>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={del.busy || !del.pw || del.word.trim().toUpperCase() !== "DELETE"} style={{ ...btn(C.red), padding: "9px 18px", fontSize: 12, opacity: del.busy || !del.pw || del.word.trim().toUpperCase() !== "DELETE" ? 0.5 : 1 }}>{del.busy ? "Deleting…" : "Delete account permanently"}</button>
          <button type="button" onClick={() => setDel({ open: false, pw: "", word: "", busy: false, err: "" })} style={pill(false)}>Cancel</button>
        </div>
      </form>}
    </StSec>}
  </>;
}

export { AcceptInvite, ResetPassword, AccountManager, ChangePassword, ExportMenu, Login, PasswordInput, StBanner, StField, StSec, UpgradeModal, btn, card, csvToSeries, detectTimeColumn, ecoPanelInfo, ecoTimeCmp, inp, parseCSV, pill, sel };
