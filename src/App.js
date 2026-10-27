import React, { useState, useEffect, useCallback, useMemo } from "react";
import { LineChart, Line, BarChart, Bar, AreaChart, Area, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine, ScatterChart, Scatter, ZAxis } from "recharts";
import { useRef } from "react";
// ══════════════════════════════════════════════
// USER STORE — Supabase via server API
// ══════════════════════════════════════════════
const US = {
  SESS: 'ecoscope_session',

  async _call(method, path, body) {
    try {
      const res = await fetch(path, {
        method,
        headers: {'Content-Type': 'application/json'},
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok) return {error: json.error || 'Server error'};
      return json;
    } catch(e) {
      console.error('API error:', e);
      return {error: 'Network error — check your connection'};
    }
  },

  hash(p){
    let h=5381;
    for(let i=0;i<p.length;i++) h=((h<<5)+h)+p.charCodeAt(i);
    return (h>>>0).toString(36)+':'+p.length;
  },

  init(){
    // No-op — server handles init
  },

  async register(username, email, password){
    const res = await this._call('POST', '/api/auth/register', {username, email, password});
    if(res.error) return {error: res.error};
    await this.log(username, 'Registered', 'New account created · Free plan');
    return {user: res.user};
  },

  async login(username, password){
    const res = await this._call('POST', '/api/auth/login', {username, password});
    if(res.error) return {error: res.error};
    localStorage.setItem(this.SESS, JSON.stringify({
      username,
      role: res.user?.role,
      plan: res.user?.plan,
      at: new Date().toISOString()
    }));
    return {user: res.user};
  },

  logout(username){
    this.log(username, 'Logout', 'Session ended');
    localStorage.removeItem(this.SESS);
  },

  async getAll(){
    const res = await this._call('GET', '/api/users');
    return Array.isArray(res) ? res : [];
  },

  getUser(username){
    // For session restore - check localStorage cache
    try {
      const sess = JSON.parse(localStorage.getItem(this.SESS) || 'null');
      return sess?.username === username ? sess : null;
    } catch { return null; }
  },

  async update(username, updates){
    const res = await this._call('PATCH', `/api/users/${encodeURIComponent(username)}`, updates);
    window.dispatchEvent(new Event('ecoscope-update'));
    return res;
  },

  async setPlan(username, plan, status='active'){
    await this._call('POST', `/api/users/${encodeURIComponent(username)}/plan`, {plan, plan_status: status});
    window.dispatchEvent(new Event('ecoscope-update'));
  },

  async deleteUser(username){
    if(username === 'admin') return false;
    await this._call('DELETE', `/api/users/${encodeURIComponent(username)}`);
    window.dispatchEvent(new Event('ecoscope-update'));
    return true;
  },

  async invite(email, role='user'){
    const res = await this._call('POST', '/api/users/invite', {email, role});
    if(res.error) return {error: res.error};
    window.dispatchEvent(new Event('ecoscope-update'));
    return {user: res.user, inviteToken: res.token};
  },

  async updateProfile(username, updates){
    return this.update(username, updates);
  },

  async log(username, action, detail=''){
    try {
      await this._call('POST', '/api/activity', {username, action, detail});
      window.dispatchEvent(new Event('ecoscope-update'));
    } catch(e) { console.error('Log error:', e); }
  },

  async getLog(){
    const res = await this._call('GET', '/api/activity');
    return Array.isArray(res) ? res : [];
  },

  async getRequests(){
    const res = await this._call('GET', '/api/requests');
    return Array.isArray(res) ? res : [];
  },

  async requestPlan(username, email, currentPlan, requestedPlan, message=''){
    const res = await this._call('POST', '/api/requests', {username, email, currentPlan, requestedPlan, message});
    if(res.error) return {error: res.error};
    return {req: res};
  },

  // Password change: the server verifies the current password before saving the new one
  async changePassword(username, currentPassword, newPassword){
    const res = await this._call('POST', '/api/auth/change-password', {username, currentPassword, newPassword});
    if(res.error) return {error: res.error};
    this.log(username, 'Password changed', 'User changed their password');
    return {ok:true};
  },

  // Support chat
  async supportMessages(username){ return this._call('GET', `/api/support/messages?username=${encodeURIComponent(username)}`); },
  async supportSend(msg){ return this._call('POST', '/api/support/messages', msg); },
  async supportThreads(){ return this._call('GET', '/api/support/threads'); },
  async supportMarkRead(username, reader){ return this._call('POST', '/api/support/read', {username, reader}); },
  async supportSetStatus(username, status){ return this._call('POST', '/api/support/status', {username, status}); },
  async supportAssistant(question, history=[]){ const r = await this._call('POST', '/api/support/assistant', {question, history}); return r && !r.error ? r : null; },

  async resolveRequest(id, action, adminNote=''){
    await this._call('PATCH', `/api/requests/${id}`, {status: action, adminNote});
    window.dispatchEvent(new Event('ecoscope-update'));
    return true;
  },
};

// ── Password & username validators
const pwRules=[
  {re:/^.{8,}$/,   msg:'At least 8 characters'},
  {re:/[A-Z]/,     msg:'At least one uppercase letter'},
  {re:/[0-9]/,     msg:'At least one number'},
  {re:/[!@#$%^&*()_+\-=\[\]{};:"\|,.<>\/?]/, msg:'At least one special character'},
];
const checkPw=(p)=>pwRules.filter(r=>!r.re.test(p)).map(r=>r.msg);
const checkUn=(u)=>{
  const e=[];
  if(u.length<3) e.push('Min 3 characters');
  if(u.length>20) e.push('Max 20 characters');
  if(!/^[a-zA-Z0-9_]+$/.test(u)) e.push('Letters, numbers and _ only');
  return e;
};


// ══════════════════════════════════════════════
// DESIGN TOKENS · THEMES
// ══════════════════════════════════════════════
// Research-grade palette. Every color in the app reads from C, and C is re-pointed
// at the active theme by applyTheme(), so all components follow the selected theme.
// Semantic roles (legacy key names kept for compatibility):
//   gold = primary accent · onGold = text on primary · teal = positive · red = negative
//   blue = link / info · purple, orange, cyan = secondary series
const FONT_SANS = "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,system-ui,sans-serif";
const FONT_MONO = "'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

const THEMES = {
  dark: {
    label:"Graphite", scheme:"dark",
    bg:"#0b0e14", surface:"#10141c", card:"#141925", raised:"#1a2030", inputBg:"#0d1119",
    border:"#252c3a", borderHi:"#3a4458",
    text:"#e7ebf3", mid:"#a6b0c2", dim:"#8a94a8",
    gold:"#6ea8fe", goldLt:"#8fbcff", onGold:"#0b0e14",
    teal:"#3ecf8e", red:"#f26d78", blue:"#7cb8ff", purple:"#b39ddb", orange:"#f0a950", cyan:"#56c7d4",
    focus:"#8fbcff", shadow:"0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.28)", overlay:"rgba(5,7,12,.72)",
    series:["#6ea8fe","#f0a950","#3ecf8e","#f26d78","#b39ddb","#56c7d4","#e6d35a","#e38fc0","#9aa5b8","#ff8a5b","#8fd694","#a0b4ff","#d4a373","#7fd1c7"],
  },
  light: {
    label:"Paper", scheme:"light",
    bg:"#f4f5f7", surface:"#ffffff", card:"#ffffff", raised:"#f1f3f6", inputBg:"#ffffff",
    border:"#dde1e8", borderHi:"#b6bfcc",
    text:"#101828", mid:"#475467", dim:"#5d6879",
    gold:"#1f4fd1", goldLt:"#2f62e8", onGold:"#ffffff",
    teal:"#0f7b55", red:"#c0283a", blue:"#0b67b0", purple:"#6d4bc4", orange:"#b35300", cyan:"#0e7280",
    focus:"#1f4fd1", shadow:"0 1px 2px rgba(16,24,40,.06), 0 4px 12px rgba(16,24,40,.06)", overlay:"rgba(16,24,40,.45)",
    series:["#1f4fd1","#b35300","#0f7b55","#c0283a","#6d4bc4","#0e7280","#8a6d00","#a3326f","#5b6576","#c2410c","#3f7d20","#3f51b5","#8c5a2b","#0f766e"],
  },
  ocean: {
    label:"Navy", scheme:"dark",
    bg:"#07111f", surface:"#0b1829", card:"#0f1e33", raised:"#14263f", inputBg:"#091424",
    border:"#1d2e47", borderHi:"#2f4668",
    text:"#e6eef8", mid:"#a3b5cb", dim:"#8497ae",
    gold:"#5ec8d8", goldLt:"#84d7e3", onGold:"#07111f",
    teal:"#3ecf8e", red:"#f26d78", blue:"#7cb8ff", purple:"#b39ddb", orange:"#f0a950", cyan:"#5ec8d8",
    focus:"#84d7e3", shadow:"0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.3)", overlay:"rgba(3,8,16,.72)",
    series:["#5ec8d8","#f0a950","#7cb8ff","#f26d78","#b39ddb","#3ecf8e","#e6d35a","#e38fc0","#9aa5b8","#ff8a5b","#8fd694","#a0b4ff","#d4a373","#7fd1c7"],
  },
  forest: {
    label:"Ledger", scheme:"light",
    bg:"#f6f4ee", surface:"#fffdf8", card:"#fffdf8", raised:"#f1ede3", inputBg:"#fffdf8",
    border:"#e2dccd", borderHi:"#c2b9a3",
    text:"#1c1a16", mid:"#4f4a40", dim:"#665f52",
    gold:"#0f5c4a", goldLt:"#16745e", onGold:"#ffffff",
    teal:"#0f7b55", red:"#b42318", blue:"#1f5fa8", purple:"#6b4fa0", orange:"#94540a", cyan:"#0e7280",
    focus:"#0f5c4a", shadow:"0 1px 2px rgba(28,26,22,.06), 0 4px 12px rgba(28,26,22,.06)", overlay:"rgba(28,26,22,.45)",
    series:["#0f5c4a","#a15c07","#1f5fa8","#b42318","#6b4fa0","#0e7280","#7a6a00","#9d3b6d","#5e5a50","#c2410c","#3f7d20","#34508f","#8c5a2b","#2f6f66"],
  },
  amber: {
    label:"Terminal", scheme:"dark",
    bg:"#000000", surface:"#0a0a0a", card:"#101010", raised:"#1a1a1a", inputBg:"#050505",
    border:"#2a2a2a", borderHi:"#454545",
    text:"#f2f2f2", mid:"#b8b8b8", dim:"#949494",
    gold:"#ffa028", goldLt:"#ffb85c", onGold:"#000000",
    teal:"#4ade80", red:"#ff5c5c", blue:"#5cb8ff", purple:"#c49bff", orange:"#ff8c42", cyan:"#22d3ee",
    focus:"#ffb85c", shadow:"0 8px 24px rgba(0,0,0,.6)", overlay:"rgba(0,0,0,.78)",
    series:["#ffa028","#5cb8ff","#4ade80","#ff5c5c","#c49bff","#22d3ee","#f5e663","#ff7ab6","#b8b8b8","#ff8c42","#a3e635","#93c5fd","#d4a373","#5eead4"],
  },
};

const C = { font:FONT_SANS, display:FONT_SANS, mono:FONT_SANS, code:FONT_MONO, ...THEMES.dark, themeKey:"dark" };
const ACCENT = [...THEMES.dark.series];

function applyTheme(key){
  const k = THEMES[key] ? key : "dark";
  const th = THEMES[k];
  Object.assign(C, th, {themeKey:k});
  ACCENT.splice(0, ACCENT.length, ...th.series);
  try{
    document.documentElement.style.colorScheme = th.scheme;
    document.documentElement.setAttribute("data-theme", k);
    if(document.body) document.body.style.background = th.bg;
  }catch(e){}
  return C;
}

// Global stylesheet, rendered by Login, Dashboard and AdminPanel.
const globalCSS = () => `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
  html,body{height:100%;width:100%;overflow:hidden;}
  #root{height:100%;width:100%;overflow:hidden;}
  body{background:${C.bg};color:${C.text};font-family:${C.font};font-size:14px;line-height:1.5;
       -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;
       font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1;}
  button,input,select,textarea{font-family:inherit;font-variant-numeric:tabular-nums;}
  h1,h2,h3,h4{font-family:${C.display};letter-spacing:-0.01em;font-weight:600;}
  table{border-collapse:collapse;font-variant-numeric:tabular-nums;}
  th{font-weight:600;}
  pre,code,kbd{font-family:${C.code};}
  button{transition:background-color .15s ease,border-color .15s ease,color .15s ease,filter .15s ease;}
  button:not(:disabled):hover{filter:brightness(1.08);}
  button:disabled{cursor:not-allowed;}
  :focus-visible{outline:2px solid ${C.focus};outline-offset:2px;}
  input:focus,select:focus,textarea:focus{border-color:${C.gold}!important;box-shadow:0 0 0 3px ${C.gold}33!important;outline:none;}
  ::placeholder{color:${C.dim};opacity:1;}
  ::selection{background:${C.gold}44;}
  .glass-card{transition:border-color .15s ease;}
  .glass-card:hover{border-color:${C.borderHi}!important;}
  *{scrollbar-width:thin;scrollbar-color:${C.borderHi} transparent;}
  ::-webkit-scrollbar{width:10px;height:10px;}
  ::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent;}
  ::-webkit-scrollbar-thumb{background:${C.border};border-radius:6px;border:3px solid transparent;background-clip:padding-box;}
  ::-webkit-scrollbar-thumb:hover{background:${C.borderHi};border:3px solid transparent;background-clip:padding-box;}
  select option{background:${C.surface};color:${C.text};}
  a{color:${C.blue};text-decoration:none;}
  a:hover{text-decoration:underline;}
  .recharts-text{font-variant-numeric:tabular-nums;}
  .recharts-tooltip-wrapper{outline:none;}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  @media (prefers-reduced-motion: reduce){
    *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important;}
  }
  @media(max-width:768px){ table{font-size:11px!important;} }
`;

// ── Icon set: monochrome line icons (Lucide-style geometry), inherit size + color from text.
const ICONS = {
  chart:["M3 3v18h18","M8 17v-6","M13 17V7","M18 17v-3"],
  search:["c:11,11,7","M20 20l-3.8-3.8"],
  clipboard:["r:8,2,8,4,1","M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2","M9 12h6","M9 16h4"],
  bank:["M3 21h18","M5 18V11","M9.5 18V11","M14.5 18V11","M19 18V11","M12 3l9 5H3z"],
  flask:["M9 3h6","M10 3v6.5L4.6 18.6A1.6 1.6 0 0 0 6 21h12a1.6 1.6 0 0 0 1.4-2.4L14 9.5V3","M7.5 15h9"],
  key:["c:7.5,15.5,4.5","M10.7 12.3L20 3","M16.5 6.5l3 3","M14.5 8.5l2 2"],
  users:["c:9,8,4","M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1","M16 3.2a4 4 0 0 1 0 7.6","M22 21v-1a6 6 0 0 0-4-5.6"],
  user:["c:12,8,4","M4 21v-1a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1"],
  globe:["c:12,12,9","M3 12h18","M12 3a14 14 0 0 1 0 18","M12 3a14 14 0 0 0 0 18"],
  lock:["r:4,11,16,10,2","M8 11V7a4 4 0 0 1 8 0v4"],
  file:["M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z","M14 3v6h6","M8 13h8","M8 17h5"],
  sheet:["r:3,3,18,18,2","M3 9h18","M3 15h18","M9 3v18"],
  image:["r:3,3,18,18,2","c:9,9,2","M21 15l-5-5L5 21"],
  camera:["M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z","c:12,13,3.5"],
  link:["M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1","M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"],
  trash:["M3 6h18","M8 6V4h8v2","M6 6l1 15h10l1-15","M10 11v6","M14 11v6"],
  eye:["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z","c:12,12,3"],
  eyeoff:["M3 3l18 18","M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2","M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6","M9.9 9.9a3 3 0 0 0 4.2 4.2"],
  mail:["r:2,4,20,16,2","M22 6l-10 7L2 6"],
  book:["M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z","M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"],
  display:["r:2,3,20,14,2","M8 21h8","M12 17v4"],
  help:["c:12,12,9","M9.2 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3","M12 17h.01"],
  card:["r:2,5,20,14,2","M2 10h20"],
  briefcase:["r:2,7,20,14,2","M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2","M2 13h20"],
  cap:["M22 10L12 5 2 10l10 5z","M6 12v5c3 3 9 3 12 0v-5"],
  building:["r:4,2,16,20,1","M9 22v-4h6v4","M8 6h.01","M12 6h.01","M16 6h.01","M8 10h.01","M12 10h.01","M16 10h.01","M8 14h.01","M12 14h.01","M16 14h.01"],
  bulb:["M9 18h6","M10 22h4","M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"],
  dollar:["M12 2v20","M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"],
  bug:["r:8,6,8,14,4","M19 7l-3 2","M5 7l3 2","M19 19l-3-2","M5 19l3-2","M20 13h-4","M4 13h4","M10 4l1 2","M14 4l-1 2"],
  sparkle:["M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"],
  message:["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
  inbox:["M22 12h-6l-2 3h-4l-2-3H2","M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"],
  settings:["c:12,12,3","M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"],
  arrowup:["M12 19V5","M5 12l7-7 7 7"],
  pencil:["M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"],
  compare:["M4 7h15","M15 3l4 4-4 4","M20 17H5","M9 13l-4 4 4 4"],
};
function Ico({n, s="1.05em", w=1.8, style}){
  const p = ICONS[n]; if(!p) return null;
  return (
    <svg aria-hidden="true" focusable="false" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"
      style={{display:"inline-block",verticalAlign:"-0.16em",flexShrink:0,...style}}>
      {p.map((d,i)=>{
        if(d.startsWith("c:")){const [cx,cy,r]=d.slice(2).split(",").map(Number);return <circle key={i} cx={cx} cy={cy} r={r}/>;}
        if(d.startsWith("r:")){const [x,y,wd,h,rx]=d.slice(2).split(",").map(Number);return <rect key={i} x={x} y={y} width={wd} height={h} rx={rx}/>;}
        return <path key={i} d={d}/>;
      })}
    </svg>
  );
}

// ══════════════════════════════════════════════
// SUBSCRIPTION PLANS
// ══════════════════════════════════════════════
const PLANS = {
  free:       {id:"free",name:"Free",price:0,priceLabel:"Free forever",get color(){return C.mid},
    sources:["worldbank","imf"],aiInsights:false,exports:["csv"],compare:false,maxYears:10,badge:"FREE",
    desc:"Basic macro data from World Bank & IMF. CSV export only."},
  pro:        {id:"pro",name:"Pro",price:9.99,priceLabel:"$9.99/month",get color(){return C.gold},
    sources:"all",aiInsights:true,exports:["csv","excel","pdf"],compare:true,maxYears:65,badge:"PRO",
    desc:"All 17 data sources, AI insights, Excel & PDF exports, country comparison."},
  enterprise: {id:"enterprise",name:"Enterprise",price:null,priceLabel:"Custom pricing",get color(){return C.teal},
    sources:"all",aiInsights:true,exports:["csv","excel","pdf"],compare:true,maxYears:65,badge:"ENT",
    desc:"Everything in Pro plus priority support, custom integrations and volume access."},
};

const PRO_SOURCES=["wdi","gse","imffsi","faostat","sdg","unicef","findex","sociology","hdi","gii","gpi","happiness","efi"];

// Color-code bars/lines by relative value
const getValueColor = (value, allValues) => {
  if (!allValues||!allValues.length) return C.gold;
  const min=Math.min(...allValues); const max=Math.max(...allValues);
  if (max===min) return C.gold;
  const pct=(value-min)/(max-min);
  if (pct>=0.75) return C.gold;         // top quartile — full strength
  if (pct>=0.5)  return C.gold+"c0";
  if (pct>=0.25) return C.gold+"88";
  return C.gold+"55";                   // bottom quartile — lightest
};

// ══════════════════════════════════════════════
// ISO2 → ISO3 (for IMF & WHO APIs)
// ══════════════════════════════════════════════
const ISO3 = {
  GH:"GHA",NG:"NGA",ZA:"ZAF",KE:"KEN",ET:"ETH",EG:"EGY",TZ:"TZA",UG:"UGA",
  SN:"SEN",CI:"CIV",MA:"MAR",TN:"TUN",RW:"RWA",AO:"AGO",CM:"CMR",ZM:"ZMB",
  ZW:"ZWE",BW:"BWA",NA:"NAM",MZ:"MOZ",MG:"MDG",MW:"MWI",DZ:"DZA",LY:"LBY",
  SD:"SDN",TD:"TCD",ML:"MLI",NE:"NER",BF:"BFA",BJ:"BEN",GN:"GIN",LS:"LSO",
  SZ:"SWZ",MU:"MUS",CV:"CPV",SC:"SYC",GA:"GAB",CG:"COG",CD:"COD",
  US:"USA",CA:"CAN",BR:"BRA",MX:"MEX",AR:"ARG",CL:"CHL",CO:"COL",PE:"PER",
  DE:"DEU",GB:"GBR",FR:"FRA",IT:"ITA",ES:"ESP",NL:"NLD",CH:"CHE",SE:"SWE",
  NO:"NOR",PL:"POL",CN:"CHN",JP:"JPN",IN:"IND",KR:"KOR",SG:"SGP",ID:"IDN",
  PK:"PAK",BD:"BGD",SA:"SAU",AE:"ARE",TR:"TUR",IL:"ISR",AU:"AUS",NZ:"NZL",
};

// ══════════════════════════════════════════════
// COUNTRIES
// ══════════════════════════════════════════════
const COUNTRIES = [
  {code:"GH",name:"Ghana",region:"Africa",flag:"🇬🇭",star:true},
  {code:"NG",name:"Nigeria",region:"Africa",flag:"🇳🇬"},
  {code:"ZA",name:"South Africa",region:"Africa",flag:"🇿🇦"},
  {code:"KE",name:"Kenya",region:"Africa",flag:"🇰🇪"},
  {code:"ET",name:"Ethiopia",region:"Africa",flag:"🇪🇹"},
  {code:"EG",name:"Egypt",region:"Africa",flag:"🇪🇬"},
  {code:"TZ",name:"Tanzania",region:"Africa",flag:"🇹🇿"},
  {code:"UG",name:"Uganda",region:"Africa",flag:"🇺🇬"},
  {code:"SN",name:"Senegal",region:"Africa",flag:"🇸🇳"},
  {code:"CI",name:"Côte d'Ivoire",region:"Africa",flag:"🇨🇮"},
  {code:"MA",name:"Morocco",region:"Africa",flag:"🇲🇦"},
  {code:"TN",name:"Tunisia",region:"Africa",flag:"🇹🇳"},
  {code:"RW",name:"Rwanda",region:"Africa",flag:"🇷🇼"},
  {code:"AO",name:"Angola",region:"Africa",flag:"🇦🇴"},
  {code:"CM",name:"Cameroon",region:"Africa",flag:"🇨🇲"},
  {code:"ZM",name:"Zambia",region:"Africa",flag:"🇿🇲"},
  {code:"ZW",name:"Zimbabwe",region:"Africa",flag:"🇿🇼"},
  {code:"BW",name:"Botswana",region:"Africa",flag:"🇧🇼"},
  {code:"NA",name:"Namibia",region:"Africa",flag:"🇳🇦"},
  {code:"MZ",name:"Mozambique",region:"Africa",flag:"🇲🇿"},
  {code:"MG",name:"Madagascar",region:"Africa",flag:"🇲🇬"},
  {code:"MW",name:"Malawi",region:"Africa",flag:"🇲🇼"},
  {code:"DZ",name:"Algeria",region:"Africa",flag:"🇩🇿"},
  {code:"LY",name:"Libya",region:"Africa",flag:"🇱🇾"},
  {code:"SD",name:"Sudan",region:"Africa",flag:"🇸🇩"},
  {code:"TD",name:"Chad",region:"Africa",flag:"🇹🇩"},
  {code:"ML",name:"Mali",region:"Africa",flag:"🇲🇱"},
  {code:"NE",name:"Niger",region:"Africa",flag:"🇳🇪"},
  {code:"BF",name:"Burkina Faso",region:"Africa",flag:"🇧🇫"},
  {code:"BJ",name:"Benin",region:"Africa",flag:"🇧🇯"},
  {code:"GN",name:"Guinea",region:"Africa",flag:"🇬🇳"},
  {code:"LS",name:"Lesotho",region:"Africa",flag:"🇱🇸"},
  {code:"SZ",name:"Eswatini",region:"Africa",flag:"🇸🇿"},
  {code:"MU",name:"Mauritius",region:"Africa",flag:"🇲🇺"},
  {code:"CV",name:"Cape Verde",region:"Africa",flag:"🇨🇻"},
  {code:"SC",name:"Seychelles",region:"Africa",flag:"🇸🇨"},
  {code:"GA",name:"Gabon",region:"Africa",flag:"🇬🇦"},
  {code:"CG",name:"Congo, Rep.",region:"Africa",flag:"🇨🇬"},
  {code:"CD",name:"Congo, Dem. Rep.",region:"Africa",flag:"🇨🇩"},
  {code:"US",name:"United States",region:"Americas",flag:"🇺🇸"},
  {code:"CA",name:"Canada",region:"Americas",flag:"🇨🇦"},
  {code:"BR",name:"Brazil",region:"Americas",flag:"🇧🇷"},
  {code:"MX",name:"Mexico",region:"Americas",flag:"🇲🇽"},
  {code:"AR",name:"Argentina",region:"Americas",flag:"🇦🇷"},
  {code:"CL",name:"Chile",region:"Americas",flag:"🇨🇱"},
  {code:"CO",name:"Colombia",region:"Americas",flag:"🇨🇴"},
  {code:"PE",name:"Peru",region:"Americas",flag:"🇵🇪"},
  {code:"DE",name:"Germany",region:"Europe",flag:"🇩🇪"},
  {code:"GB",name:"United Kingdom",region:"Europe",flag:"🇬🇧"},
  {code:"FR",name:"France",region:"Europe",flag:"🇫🇷"},
  {code:"IT",name:"Italy",region:"Europe",flag:"🇮🇹"},
  {code:"ES",name:"Spain",region:"Europe",flag:"🇪🇸"},
  {code:"NL",name:"Netherlands",region:"Europe",flag:"🇳🇱"},
  {code:"CH",name:"Switzerland",region:"Europe",flag:"🇨🇭"},
  {code:"SE",name:"Sweden",region:"Europe",flag:"🇸🇪"},
  {code:"NO",name:"Norway",region:"Europe",flag:"🇳🇴"},
  {code:"PL",name:"Poland",region:"Europe",flag:"🇵🇱"},
  {code:"CN",name:"China",region:"Asia",flag:"🇨🇳"},
  {code:"JP",name:"Japan",region:"Asia",flag:"🇯🇵"},
  {code:"IN",name:"India",region:"Asia",flag:"🇮🇳"},
  {code:"KR",name:"South Korea",region:"Asia",flag:"🇰🇷"},
  {code:"SG",name:"Singapore",region:"Asia",flag:"🇸🇬"},
  {code:"ID",name:"Indonesia",region:"Asia",flag:"🇮🇩"},
  {code:"PK",name:"Pakistan",region:"Asia",flag:"🇵🇰"},
  {code:"BD",name:"Bangladesh",region:"Asia",flag:"🇧🇩"},
  {code:"SA",name:"Saudi Arabia",region:"Middle East",flag:"🇸🇦"},
  {code:"AE",name:"UAE",region:"Middle East",flag:"🇦🇪"},
  {code:"TR",name:"Turkey",region:"Middle East",flag:"🇹🇷"},
  {code:"IL",name:"Israel",region:"Middle East",flag:"🇮🇱"},
  {code:"AU",name:"Australia",region:"Oceania",flag:"🇦🇺"},
  {code:"NZ",name:"New Zealand",region:"Oceania",flag:"🇳🇿"},
];
const REGIONS = ["All","Africa","Americas","Europe","Asia","Middle East","Oceania"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({length:CURRENT_YEAR-1960+1},(_,i)=>1960+i);

// ══════════════════════════════════════════════
// DATA SOURCES — MACRO LEVEL
// ══════════════════════════════════════════════
const MACRO_SOURCES = [
  {
    id:"worldbank", name:"World Bank", short:"WB", region:"Global", get color(){return C.blue},
    desc:"World Bank Open Data — 1,400+ global development indicators, free, no key needed.",
    url:"https://data.worldbank.org", keyRequired:false,
    vars:[
      // Output
      {code:"NY.GDP.MKTP.CD",name:"GDP (Current USD)",cat:"Output",fmt:"currency"},
      {code:"NY.GDP.PCAP.CD",name:"GDP per Capita (USD)",cat:"Output",fmt:"currency"},
      {code:"NY.GDP.MKTP.KD.ZG",name:"GDP Growth Rate (%)",cat:"Output",fmt:"pct"},
      {code:"NY.GDP.MKTP.KD",name:"GDP (Constant 2015 USD)",cat:"Output",fmt:"currency"},
      {code:"NY.GNP.MKTP.CD",name:"GNI (Current USD)",cat:"Output",fmt:"currency"},
      {code:"NY.GNP.PCAP.CD",name:"GNI per Capita (USD)",cat:"Output",fmt:"currency"},
      {code:"NY.GNP.PCAP.PP.CD",name:"GNI per Capita PPP (Intl $)",cat:"Output",fmt:"currency"},
      // Prices
      {code:"FP.CPI.TOTL.ZG",name:"Inflation Rate — CPI (%)",cat:"Prices",fmt:"pct"},
      {code:"FP.CPI.TOTL",name:"Consumer Price Index (2010=100)",cat:"Prices",fmt:"num"},
      {code:"NY.GDP.DEFL.KD.ZG",name:"Inflation — GDP Deflator (%)",cat:"Prices",fmt:"pct"},
      // Labour
      {code:"SL.UEM.TOTL.ZS",name:"Unemployment Rate (%)",cat:"Labour",fmt:"pct"},
      {code:"SL.UEM.1524.ZS",name:"Youth Unemployment Rate (%)",cat:"Labour",fmt:"pct"},
      {code:"SL.UEM.TOTL.FE.ZS",name:"Female Unemployment Rate (%)",cat:"Labour",fmt:"pct"},
      {code:"SL.TLF.ACTI.ZS",name:"Labour Force Participation Rate (%)",cat:"Labour",fmt:"pct"},
      {code:"SL.TLF.ACTI.FE.ZS",name:"Female Labour Force Participation (%)",cat:"Labour",fmt:"pct"},
      {code:"SL.EMP.TOTL.SP.ZS",name:"Employment-to-Population Ratio (%)",cat:"Labour",fmt:"pct"},
      {code:"SL.AGR.EMPL.ZS",name:"Employment in Agriculture (%)",cat:"Labour",fmt:"pct"},
      {code:"SL.SRV.EMPL.ZS",name:"Employment in Services (%)",cat:"Labour",fmt:"pct"},
      // Trade
      {code:"NE.EXP.GNFS.ZS",name:"Exports of Goods & Services % GDP",cat:"Trade",fmt:"pct"},
      {code:"NE.IMP.GNFS.ZS",name:"Imports of Goods & Services % GDP",cat:"Trade",fmt:"pct"},
      {code:"NE.EXP.GNFS.CD",name:"Exports (Current USD)",cat:"Trade",fmt:"currency"},
      {code:"NE.IMP.GNFS.CD",name:"Imports (Current USD)",cat:"Trade",fmt:"currency"},
      {code:"BN.CAB.XOKA.GD.ZS",name:"Current Account Balance % GDP",cat:"Trade",fmt:"pct"},
      {code:"NE.TRD.GNFS.ZS",name:"Trade Openness % GDP",cat:"Trade",fmt:"pct"},
      // Investment
      {code:"BX.KLT.DINV.WD.GD.ZS",name:"FDI Net Inflows % GDP",cat:"Investment",fmt:"pct"},
      {code:"BX.KLT.DINV.CD.WD",name:"FDI Net Inflows (Current USD)",cat:"Investment",fmt:"currency"},
      {code:"BM.KLT.DINV.CD.WD",name:"FDI Net Outflows (Current USD)",cat:"Investment",fmt:"currency"},
      {code:"NE.GDI.TOTL.ZS",name:"Gross Capital Formation % GDP",cat:"Investment",fmt:"pct"},
      // Fiscal
      {code:"GC.DOD.TOTL.GD.ZS",name:"Government Debt % GDP",cat:"Fiscal",fmt:"pct"},
      {code:"GC.REV.XGRT.GD.ZS",name:"Government Revenue % GDP",cat:"Fiscal",fmt:"pct"},
      {code:"GC.XPN.TOTL.GD.ZS",name:"Government Expenditure % GDP",cat:"Fiscal",fmt:"pct"},
      {code:"GC.TAX.TOTL.GD.ZS",name:"Tax Revenue % GDP",cat:"Fiscal",fmt:"pct"},
      {code:"GC.NLD.TOTL.GD.ZS",name:"Fiscal Balance (Net Lending) % GDP",cat:"Fiscal",fmt:"pct"},
      // Demographics
      {code:"SP.POP.TOTL",name:"Total Population",cat:"Demographics",fmt:"num"},
      {code:"SP.POP.GROW",name:"Population Growth Rate (%)",cat:"Demographics",fmt:"pct"},
      {code:"SP.URB.TOTL.IN.ZS",name:"Urban Population (%)",cat:"Demographics",fmt:"pct"},
      {code:"SP.DYN.LE00.IN",name:"Life Expectancy at Birth (years)",cat:"Demographics",fmt:"num"},
      {code:"SP.DYN.IMRT.IN",name:"Infant Mortality Rate (per 1,000)",cat:"Demographics",fmt:"num"},
      {code:"SP.DYN.TFRT.IN",name:"Fertility Rate (births per woman)",cat:"Demographics",fmt:"num"},
      // Finance & Money
      {code:"FM.LBL.BMNY.GD.ZS",name:"M2 Money Supply % GDP",cat:"Finance",fmt:"pct"},
      {code:"FR.INR.LEND",name:"Lending Interest Rate (%)",cat:"Finance",fmt:"pct"},
      {code:"FR.INR.DPST",name:"Deposit Interest Rate (%)",cat:"Finance",fmt:"pct"},
      {code:"FR.INR.RINR",name:"Real Interest Rate (%)",cat:"Finance",fmt:"pct"},
      {code:"PA.NUS.FCRF",name:"Official Exchange Rate (LCU per USD)",cat:"Finance",fmt:"num"},
      {code:"FS.AST.PRVT.GD.ZS",name:"Domestic Credit to Private Sector % GDP",cat:"Finance",fmt:"pct"},
      {code:"FB.AST.NPER.ZS",name:"Bank Nonperforming Loans (%)",cat:"Finance",fmt:"pct"},
      // Social
      {code:"SH.XPD.CHEX.GD.ZS",name:"Health Expenditure % GDP",cat:"Social",fmt:"pct"},
      {code:"SE.XPD.TOTL.GD.ZS",name:"Education Expenditure % GDP",cat:"Social",fmt:"pct"},
      {code:"SI.POV.GINI",name:"Gini Coefficient (Inequality)",cat:"Social",fmt:"num"},
      {code:"SI.POV.NAHC",name:"National Poverty Rate (%)",cat:"Social",fmt:"pct"},
      {code:"SI.POV.DDAY",name:"Poverty Rate < $2.15/day (%)",cat:"Social",fmt:"pct"},
      // Environment
      {code:"EN.ATM.CO2E.PC",name:"CO2 Emissions per Capita (metric tons)",cat:"Environment",fmt:"num"},
      {code:"EN.ATM.CO2E.KT",name:"Total CO2 Emissions (kt)",cat:"Environment",fmt:"num"},
      {code:"EG.USE.PCAP.KG.OE",name:"Energy Use per Capita (kg oil equiv)",cat:"Environment",fmt:"num"},
      {code:"EG.ELC.ACCS.ZS",name:"Access to Electricity (%)",cat:"Environment",fmt:"pct"},
      {code:"EG.FEC.RNEW.ZS",name:"Renewable Energy Consumption (%)",cat:"Environment",fmt:"pct"},
      {code:"AG.LND.FRST.ZS",name:"Forest Area (% of land)",cat:"Environment",fmt:"pct"},
      // Technology
      {code:"IT.NET.USER.ZS",name:"Internet Users (%)",cat:"Technology",fmt:"pct"},
      {code:"IT.CEL.SETS.P2",name:"Mobile Subscriptions per 100 people",cat:"Technology",fmt:"num"},
    ]
  },
  {
    id:"imf", name:"IMF — World Economic Outlook", short:"IMF", region:"Global", get color(){return C.teal},
    desc:"IMF WEO Database — macroeconomic projections and historical data, free, no key needed.",
    url:"https://www.imf.org/en/Publications/WEO", keyRequired:false,
    vars:[
      {code:"NGDP_RPCH",name:"Real GDP Growth (%)",cat:"Output",fmt:"pct"},
      {code:"NGDPD",name:"GDP, Current Prices (USD billions)",cat:"Output",fmt:"num"},
      {code:"NGDPDPC",name:"GDP per Capita (Current USD)",cat:"Output",fmt:"currency"},
      {code:"NGDP_D",name:"GDP Deflator Index",cat:"Prices",fmt:"num"},
      {code:"PCPIPCH",name:"Inflation, Avg Consumer Prices (%)",cat:"Prices",fmt:"pct"},
      {code:"PCPIEPCH",name:"Inflation, End of Period (%)",cat:"Prices",fmt:"pct"},
      {code:"LUR",name:"Unemployment Rate (%)",cat:"Labour",fmt:"pct"},
      {code:"LP",name:"Population (millions)",cat:"Demographics",fmt:"num"},
      {code:"BCA",name:"Current Account Balance (USD billions)",cat:"Trade",fmt:"num"},
      {code:"BCA_NGDPD",name:"Current Account Balance % GDP",cat:"Trade",fmt:"pct"},
      {code:"TM_RPCH",name:"Import Volume Growth (%)",cat:"Trade",fmt:"pct"},
      {code:"TX_RPCH",name:"Export Volume Growth (%)",cat:"Trade",fmt:"pct"},
      {code:"GGXWDG_NGDP",name:"Gross Government Debt % GDP",cat:"Fiscal",fmt:"pct"},
      {code:"GGXCNL_NGDP",name:"Fiscal Balance % GDP",cat:"Fiscal",fmt:"pct"},
      {code:"GGREV_NGDP",name:"Government Revenue % GDP",cat:"Fiscal",fmt:"pct"},
      {code:"GGEXP_NGDP",name:"Government Expenditure % GDP",cat:"Fiscal",fmt:"pct"},
      {code:"NGSD_NGDP",name:"Gross National Savings % GDP",cat:"Investment",fmt:"pct"},
      {code:"NID_NGDP",name:"Total Investment % GDP",cat:"Investment",fmt:"pct"},
    ]
  },
  {
    id:"fred", name:"Federal Reserve — FRED", short:"FRED", region:"USA", get color(){return C.red},
    desc:"St. Louis Fed — 800,000+ US & global economic time series. Requires a free FRED API key.",
    url:"https://fred.stlouisfed.org", keyRequired:true,
    keyLabel:"FRED API Key", keyLink:"https://fred.stlouisfed.org/docs/api/api_key.html",
    countryFixed:"US",
    vars:[
      {code:"GDP",name:"US GDP (Billions USD)",cat:"Output",fmt:"num"},
      {code:"GDPC1",name:"Real GDP (Billions Chained 2017 USD)",cat:"Output",fmt:"num"},
      {code:"A191RL1Q225SBEA",name:"Real GDP Growth Rate (%)",cat:"Output",fmt:"pct"},
      {code:"UNRATE",name:"Unemployment Rate (%)",cat:"Labour",fmt:"pct"},
      {code:"PAYEMS",name:"Nonfarm Payrolls (thousands)",cat:"Labour",fmt:"num"},
      {code:"CIVPART",name:"Labour Force Participation Rate (%)",cat:"Labour",fmt:"pct"},
      {code:"CPIAUCSL",name:"CPI All Items (Index 1982-84=100)",cat:"Prices",fmt:"num"},
      {code:"CPILFESL",name:"Core CPI (excl. Food & Energy)",cat:"Prices",fmt:"num"},
      {code:"PCEPI",name:"PCE Price Index",cat:"Prices",fmt:"num"},
      {code:"FEDFUNDS",name:"Federal Funds Rate (%)",cat:"Finance",fmt:"pct"},
      {code:"GS10",name:"10-Year Treasury Yield (%)",cat:"Finance",fmt:"pct"},
      {code:"GS2",name:"2-Year Treasury Yield (%)",cat:"Finance",fmt:"pct"},
      {code:"GS30",name:"30-Year Treasury Yield (%)",cat:"Finance",fmt:"pct"},
      {code:"M2SL",name:"M2 Money Supply (Billions USD)",cat:"Finance",fmt:"num"},
      {code:"DEXUSEU",name:"USD/EUR Exchange Rate",cat:"Finance",fmt:"num"},
      {code:"DEXCHUS",name:"Chinese Yuan per USD",cat:"Finance",fmt:"num"},
      {code:"DEXJPUS",name:"Japanese Yen per USD",cat:"Finance",fmt:"num"},
      {code:"HOUST",name:"Housing Starts (thousands, SAAR)",cat:"Housing",fmt:"num"},
      {code:"CSUSHPISA",name:"Case-Shiller Home Price Index",cat:"Housing",fmt:"num"},
      {code:"INDPRO",name:"Industrial Production Index",cat:"Industry",fmt:"num"},
      {code:"UMCSENT",name:"U. Michigan Consumer Sentiment",cat:"Sentiment",fmt:"num"},
      {code:"RSXFS",name:"Retail Sales excl. Food Services (M USD)",cat:"Consumption",fmt:"num"},
      {code:"DPCERAS3Q086SBEA",name:"Real Personal Consumption (B USD)",cat:"Consumption",fmt:"num"},
    ]
  },
  {
    id:"bog", name:"Bank of Ghana", short:"BoG", region:"Ghana", get color(){return C.gold},
    desc:"Bank of Ghana monetary & financial data for Ghana. Data sourced via World Bank and IMF APIs.",
    url:"https://www.bog.gov.gh/economic-data/", keyRequired:false,
    countryFixed:"GH",
    note:"Live data via World Bank & IMF. For granular monthly data visit bog.gov.gh directly.",
    vars:[
      {code:"FP.CPI.TOTL.ZG",name:"Ghana Inflation Rate — CPI (%)",cat:"Monetary",fmt:"pct",api:"worldbank"},
      {code:"FR.INR.LEND",name:"Ghana Lending Rate (%)",cat:"Monetary",fmt:"pct",api:"worldbank"},
      {code:"FR.INR.DPST",name:"Ghana Deposit Rate (%)",cat:"Monetary",fmt:"pct",api:"worldbank"},
      {code:"FR.INR.RINR",name:"Ghana Real Interest Rate (%)",cat:"Monetary",fmt:"pct",api:"worldbank"},
      {code:"PA.NUS.FCRF",name:"GHS / USD Official Exchange Rate",cat:"Monetary",fmt:"num",api:"worldbank"},
      {code:"FM.LBL.BMNY.GD.ZS",name:"M2 Money Supply % GDP",cat:"Monetary",fmt:"pct",api:"worldbank"},
      {code:"FS.AST.PRVT.GD.ZS",name:"Private Sector Credit % GDP",cat:"Monetary",fmt:"pct",api:"worldbank"},
      {code:"NY.GDP.MKTP.KD.ZG",name:"Ghana GDP Growth Rate (%)",cat:"Output",fmt:"pct",api:"worldbank"},
      {code:"NY.GDP.MKTP.CD",name:"Ghana GDP (Current USD)",cat:"Output",fmt:"currency",api:"worldbank"},
      {code:"NY.GDP.PCAP.CD",name:"Ghana GDP per Capita (USD)",cat:"Output",fmt:"currency",api:"worldbank"},
      {code:"GC.DOD.TOTL.GD.ZS",name:"Ghana Govt Debt % GDP",cat:"Fiscal",fmt:"pct",api:"worldbank"},
      {code:"GC.REV.XGRT.GD.ZS",name:"Ghana Govt Revenue % GDP",cat:"Fiscal",fmt:"pct",api:"worldbank"},
      {code:"GC.XPN.TOTL.GD.ZS",name:"Ghana Govt Expenditure % GDP",cat:"Fiscal",fmt:"pct",api:"worldbank"},
      {code:"BX.KLT.DINV.WD.GD.ZS",name:"Ghana FDI Inflows % GDP",cat:"Investment",fmt:"pct",api:"worldbank"},
      {code:"NE.EXP.GNFS.CD",name:"Ghana Total Exports (USD)",cat:"Trade",fmt:"currency",api:"worldbank"},
      {code:"NE.IMP.GNFS.CD",name:"Ghana Total Imports (USD)",cat:"Trade",fmt:"currency",api:"worldbank"},
      {code:"BN.CAB.XOKA.GD.ZS",name:"Ghana Current Account % GDP",cat:"Trade",fmt:"pct",api:"worldbank"},
      {code:"PCPIPCH",name:"Ghana Inflation — IMF Estimate (%)",cat:"Monetary",fmt:"pct",api:"imf"},
      {code:"GGXWDG_NGDP",name:"Ghana Gross Debt % GDP — IMF",cat:"Fiscal",fmt:"pct",api:"imf"},
      {code:"NGDP_RPCH",name:"Ghana Real GDP Growth — IMF (%)",cat:"Output",fmt:"pct",api:"imf"},
    ]
  },
  {
    id:"bis", name:"Bank for Intl. Settlements (BIS)", short:"BIS", region:"Global", get color(){return C.cyan},
    desc:"BIS financial stability, banking & credit statistics. Served via World Bank aligned indicators.",
    url:"https://www.bis.org/statistics/", keyRequired:false,
    vars:[
      {code:"FR.INR.LEND",name:"Lending Interest Rate (%)",cat:"Finance",fmt:"pct",api:"worldbank"},
      {code:"FR.INR.DPST",name:"Deposit Interest Rate (%)",cat:"Finance",fmt:"pct",api:"worldbank"},
      {code:"FM.LBL.BMNY.GD.ZS",name:"Broad Money M2 % GDP",cat:"Finance",fmt:"pct",api:"worldbank"},
      {code:"FS.AST.PRVT.GD.ZS",name:"Private Sector Credit % GDP",cat:"Credit",fmt:"pct",api:"worldbank"},
      {code:"FB.AST.NPER.ZS",name:"Bank Nonperforming Loans (%)",cat:"Banking",fmt:"pct",api:"worldbank"},
      {code:"FB.BNK.CAPA.ZS",name:"Bank Capital to Assets Ratio (%)",cat:"Banking",fmt:"pct",api:"worldbank"},
      {code:"FB.CBK.BRCH.P5",name:"Bank Branches per 100,000 adults",cat:"Banking",fmt:"num",api:"worldbank"},
      {code:"FX.OWN.TOTL.ZS",name:"Account Ownership at Financial Institution (%)",cat:"Banking",fmt:"pct",api:"worldbank"},
    ]
  },
  {
    id:"unctad", name:"UNCTAD — Trade & Investment", short:"UNCTAD", region:"Global", get color(){return C.orange},
    desc:"UN Conference on Trade and Development — trade, FDI and development statistics.",
    url:"https://unctad.org/statistics", keyRequired:false,
    vars:[
      {code:"NE.EXP.GNFS.CD",name:"Exports of Goods & Services (USD)",cat:"Trade",fmt:"currency",api:"worldbank"},
      {code:"NE.IMP.GNFS.CD",name:"Imports of Goods & Services (USD)",cat:"Trade",fmt:"currency",api:"worldbank"},
      {code:"NE.EXP.GNFS.ZS",name:"Exports % GDP",cat:"Trade",fmt:"pct",api:"worldbank"},
      {code:"NE.IMP.GNFS.ZS",name:"Imports % GDP",cat:"Trade",fmt:"pct",api:"worldbank"},
      {code:"NE.TRD.GNFS.ZS",name:"Trade Openness (Exports+Imports % GDP)",cat:"Trade",fmt:"pct",api:"worldbank"},
      {code:"BN.CAB.XOKA.GD.ZS",name:"Current Account Balance % GDP",cat:"Trade",fmt:"pct",api:"worldbank"},
      {code:"BX.KLT.DINV.CD.WD",name:"FDI Inflows (Current USD)",cat:"Investment",fmt:"currency",api:"worldbank"},
      {code:"BM.KLT.DINV.CD.WD",name:"FDI Outflows (Current USD)",cat:"Investment",fmt:"currency",api:"worldbank"},
      {code:"BX.KLT.DINV.WD.GD.ZS",name:"FDI Inflows % GDP",cat:"Investment",fmt:"pct",api:"worldbank"},
      {code:"DT.DOD.DECT.CD",name:"External Debt (Current USD)",cat:"Debt",fmt:"currency",api:"worldbank"},
      {code:"DT.DOD.DECT.GN.ZS",name:"External Debt % GNI",cat:"Debt",fmt:"pct",api:"worldbank"},
    ]
  },
  {
    id:"wdi", name:"World Bank WDI — Development Indicators", short:"WDI", region:"Global", get color(){return C.blue},
    desc:"World Bank World Development Indicators — the primary collection of development data, 1,400+ series.",
    url:"https://datatopics.worldbank.org/world-development-indicators/", keyRequired:false, plan:"pro",
    vars:[
      {code:"GB.XPD.RSDV.GD.ZS",name:"Research & Development Expenditure (% GDP)",cat:"Innovation",fmt:"pct",api:"worldbank"},
      {code:"IP.PAT.RESD",name:"Patent Applications — Residents",cat:"Innovation",fmt:"num",api:"worldbank"},
      {code:"IC.BUS.EASE.XQ",name:"Ease of Doing Business Score",cat:"Business",fmt:"num",api:"worldbank"},
      {code:"IC.REG.DURS",name:"Business Registration Days",cat:"Business",fmt:"num",api:"worldbank"},
      {code:"IC.TAX.TOTL.CP.ZS",name:"Total Tax & Contribution Rate (% profit)",cat:"Business",fmt:"pct",api:"worldbank"},
      {code:"IC.ELC.TIME",name:"Days to Get Electricity Connection",cat:"Infrastructure",fmt:"num",api:"worldbank"},
      {code:"IS.ROD.PAVE.ZS",name:"Paved Roads (% of total roads)",cat:"Infrastructure",fmt:"pct",api:"worldbank"},
      {code:"IS.AIR.PSGR",name:"Air Transport — Passengers Carried",cat:"Infrastructure",fmt:"num",api:"worldbank"},
      {code:"TX.VAL.MRCH.CD.WT",name:"Merchandise Exports (Current USD)",cat:"Trade",fmt:"currency",api:"worldbank"},
      {code:"TM.VAL.MRCH.CD.WT",name:"Merchandise Imports (Current USD)",cat:"Trade",fmt:"currency",api:"worldbank"},
      {code:"TX.VAL.MANF.ZS.UN",name:"Manufactures Exports (% of total)",cat:"Trade",fmt:"pct",api:"worldbank"},
      {code:"NY.GDP.MINR.RT.ZS",name:"Mineral Rents (% of GDP)",cat:"Natural Resources",fmt:"pct",api:"worldbank"},
      {code:"NY.GDP.PETR.RT.ZS",name:"Oil Rents (% of GDP)",cat:"Natural Resources",fmt:"pct",api:"worldbank"},
      {code:"NY.GDP.FRST.RT.ZS",name:"Forest Rents (% of GDP)",cat:"Natural Resources",fmt:"pct",api:"worldbank"},
      {code:"SE.SEC.ENRR",name:"Secondary School Enrollment (Gross %)",cat:"Education",fmt:"pct",api:"worldbank"},
      {code:"SE.TER.ENRR",name:"Tertiary Enrollment (Gross %)",cat:"Education",fmt:"pct",api:"worldbank"},
      {code:"SH.MED.BEDS.ZS",name:"Hospital Beds (per 1,000 people)",cat:"Health System",fmt:"num",api:"worldbank"},
      {code:"CC.EST",name:"Control of Corruption Index",cat:"Governance",fmt:"num",api:"worldbank"},
      {code:"GE.EST",name:"Government Effectiveness Index",cat:"Governance",fmt:"num",api:"worldbank"},
      {code:"RL.EST",name:"Rule of Law Index",cat:"Governance",fmt:"num",api:"worldbank"},
      {code:"VA.EST",name:"Voice & Accountability Index",cat:"Governance",fmt:"num",api:"worldbank"},
      {code:"PV.EST",name:"Political Stability Index",cat:"Governance",fmt:"num",api:"worldbank"},
      {code:"DT.ODA.ODAT.CD",name:"ODA Received (Current USD)",cat:"Aid",fmt:"currency",api:"worldbank"},
      {code:"DT.ODA.ODAT.GN.ZS",name:"ODA Received (% of GNI)",cat:"Aid",fmt:"pct",api:"worldbank"},
      {code:"BX.TRF.PWKR.CD.DT",name:"Personal Remittances Received (USD)",cat:"Remittances",fmt:"currency",api:"worldbank"},
      {code:"BX.TRF.PWKR.DT.GD.ZS",name:"Remittances Received (% of GDP)",cat:"Remittances",fmt:"pct",api:"worldbank"},
    ]
  },{
    id:"gse", name:"Ghana Financial Markets", short:"GSE", region:"Ghana", color:"#FFD700",
    desc:"Ghana banking, capital markets & monetary data via World Bank & IMF. Live GSE prices at gse.com.gh.",
    url:"https://gse.com.gh", keyRequired:false, plan:"pro", countryFixed:"GH",
    note:"Macro-financial data via WB/IMF APIs. For live equity prices visit gse.com.gh directly.",
    vars:[
      {code:"FR.INR.LEND",name:"Lending Interest Rate (%)",cat:"Monetary",fmt:"pct",api:"worldbank"},
      {code:"FR.INR.DPST",name:"Deposit Interest Rate (%)",cat:"Monetary",fmt:"pct",api:"worldbank"},
      {code:"FR.INR.RINR",name:"Real Interest Rate (%)",cat:"Monetary",fmt:"pct",api:"worldbank"},
      {code:"FM.LBL.BMNY.GD.ZS",name:"Broad Money M2 (% of GDP)",cat:"Monetary",fmt:"pct",api:"worldbank"},
      {code:"FM.LBL.MQMY.GD.ZS",name:"Narrow Money M1 (% of GDP)",cat:"Monetary",fmt:"pct",api:"worldbank"},
      {code:"FP.CPI.TOTL.ZG",name:"Inflation Rate — CPI (%)",cat:"Monetary",fmt:"pct",api:"worldbank"},
      {code:"PA.NUS.FCRF",name:"GHS / USD Exchange Rate",cat:"Monetary",fmt:"num",api:"worldbank"},
      {code:"FS.AST.PRVT.GD.ZS",name:"Private Sector Credit (% of GDP)",cat:"Banking",fmt:"pct",api:"worldbank"},
      {code:"FB.AST.NPER.ZS",name:"Bank Nonperforming Loans (%)",cat:"Banking",fmt:"pct",api:"worldbank"},
      {code:"FB.BNK.CAPA.ZS",name:"Bank Capital to Assets Ratio (%)",cat:"Banking",fmt:"pct",api:"worldbank"},
      {code:"FB.CBK.BRCH.P5",name:"Bank Branches per 100,000 Adults",cat:"Banking",fmt:"num",api:"worldbank"},
      {code:"FX.OWN.TOTL.ZS",name:"Financial Account Ownership (%)",cat:"Financial Inclusion",fmt:"pct",api:"worldbank"},
      {code:"FX.OWN.TOTL.FE.ZS",name:"Female Financial Account Ownership (%)",cat:"Financial Inclusion",fmt:"pct",api:"worldbank"},
      {code:"IC.FRM.BKWC.ZS",name:"Firms Using Banks for Investment (%)",cat:"Financial Inclusion",fmt:"pct",api:"worldbank"},
      {code:"GC.DOD.TOTL.GD.ZS",name:"Government Debt (% of GDP)",cat:"Fiscal",fmt:"pct",api:"worldbank"},
      {code:"GC.REV.XGRT.GD.ZS",name:"Government Revenue (% of GDP)",cat:"Fiscal",fmt:"pct",api:"worldbank"},
      {code:"GC.TAX.TOTL.GD.ZS",name:"Tax Revenue (% of GDP)",cat:"Fiscal",fmt:"pct",api:"worldbank"},
      {code:"BX.KLT.DINV.WD.GD.ZS",name:"FDI Net Inflows (% of GDP)",cat:"Investment",fmt:"pct",api:"worldbank"},
      {code:"PCPIPCH",name:"Inflation — IMF Estimate (%)",cat:"Monetary",fmt:"pct",api:"imf"},
      {code:"GGXWDG_NGDP",name:"Gross Debt % GDP — IMF",cat:"Fiscal",fmt:"pct",api:"imf"},
      {code:"BCA_NGDPD",name:"Current Account Balance % GDP — IMF",cat:"External",fmt:"pct",api:"imf"},
    ]
  },{
    id:"imffsi", name:"IMF Financial Soundness Indicators", short:"FSI", region:"Global", color:"#00BCD4",
    desc:"IMF FSI — banking capital adequacy, asset quality, earnings, liquidity and credit indicators.",
    url:"https://data.imf.org/?sk=51b096fa-2cd2-40c2-8d09-0699cc1764da", keyRequired:false, plan:"pro",
    vars:[
      {code:"FB.BNK.CAPA.ZS",name:"Bank Capital to Assets Ratio (%)",cat:"Capital Adequacy",fmt:"pct",api:"worldbank"},
      {code:"FB.AST.NPER.ZS",name:"Nonperforming Loans (%)",cat:"Asset Quality",fmt:"pct",api:"worldbank"},
      {code:"FR.INR.LEND",name:"Lending Interest Rate (%)",cat:"Earnings",fmt:"pct",api:"worldbank"},
      {code:"FR.INR.DPST",name:"Deposit Interest Rate (%)",cat:"Earnings",fmt:"pct",api:"worldbank"},
      {code:"FR.INR.RINR",name:"Real Interest Rate (%)",cat:"Earnings",fmt:"pct",api:"worldbank"},
      {code:"FS.AST.PRVT.GD.ZS",name:"Credit to Private Sector (% GDP)",cat:"Credit",fmt:"pct",api:"worldbank"},
      {code:"FM.LBL.BMNY.GD.ZS",name:"Broad Money M2 (% GDP)",cat:"Liquidity",fmt:"pct",api:"worldbank"},
      {code:"DT.DOD.DECT.CD",name:"External Debt Stocks (USD)",cat:"Debt",fmt:"currency",api:"worldbank"},
      {code:"DT.DOD.DECT.GN.ZS",name:"External Debt (% of GNI)",cat:"Debt",fmt:"pct",api:"worldbank"},
      {code:"DT.TDS.DECT.GN.ZS",name:"Debt Service (% of GNI)",cat:"Debt",fmt:"pct",api:"worldbank"},
      {code:"DT.TDS.DECT.EX.ZS",name:"Debt Service (% of Exports)",cat:"Debt",fmt:"pct",api:"worldbank"},
      {code:"IC.FRM.BKWC.ZS",name:"Firms Using Banks for Investment (%)",cat:"Access",fmt:"pct",api:"worldbank"},
      {code:"FX.OWN.TOTL.ZS",name:"Account Ownership at Financial Institution (%)",cat:"Access",fmt:"pct",api:"worldbank"},
    ]
  },{
    id:"faostat", name:"FAOSTAT — Agriculture & Food", short:"FAO", region:"Global", color:"#4CAF50",
    desc:"UN Food & Agriculture Organization — agricultural production, trade, food security and nutrition data.",
    url:"https://www.fao.org/faostat/en/", keyRequired:false, plan:"pro",
    vars:[
      {code:"AG.PRD.FOOD.XD",name:"Food Production Index (2014-2016=100)",cat:"Production",fmt:"num",api:"worldbank"},
      {code:"AG.PRD.CROP.XD",name:"Crop Production Index (2014-2016=100)",cat:"Production",fmt:"num",api:"worldbank"},
      {code:"AG.PRD.LVSK.XD",name:"Livestock Production Index (2014-2016=100)",cat:"Production",fmt:"num",api:"worldbank"},
      {code:"AG.YLD.CREL.KG",name:"Cereal Yield (kg per hectare)",cat:"Crops",fmt:"num",api:"worldbank"},
      {code:"AG.LND.CREL.HA",name:"Land Under Cereal Production (hectares)",cat:"Crops",fmt:"num",api:"worldbank"},
      {code:"NV.AGR.TOTL.ZS",name:"Agriculture Value Added (% of GDP)",cat:"Economic",fmt:"pct",api:"worldbank"},
      {code:"NV.AGR.TOTL.CD",name:"Agriculture Value Added (Current USD)",cat:"Economic",fmt:"currency",api:"worldbank"},
      {code:"SL.AGR.EMPL.ZS",name:"Agricultural Employment (% of total)",cat:"Labour",fmt:"pct",api:"worldbank"},
      {code:"AG.LND.ARBL.ZS",name:"Arable Land (% of land area)",cat:"Land",fmt:"pct",api:"worldbank"},
      {code:"AG.LND.ARBL.HA.PC",name:"Arable Land per Person (hectares)",cat:"Land",fmt:"num",api:"worldbank"},
      {code:"AG.LND.AGRI.ZS",name:"Agricultural Land (% of land area)",cat:"Land",fmt:"pct",api:"worldbank"},
      {code:"AG.LND.IRIG.AG.ZS",name:"Irrigated Agricultural Land (%)",cat:"Land",fmt:"pct",api:"worldbank"},
      {code:"ER.H2O.FWAG.ZS",name:"Agricultural Water Withdrawal (% of total)",cat:"Water",fmt:"pct",api:"worldbank"},
      {code:"TX.VAL.FOOD.ZS.UN",name:"Food Exports (% of merchandise exports)",cat:"Trade",fmt:"pct",api:"worldbank"},
      {code:"TM.VAL.FOOD.ZS.UN",name:"Food Imports (% of merchandise imports)",cat:"Trade",fmt:"pct",api:"worldbank"},
      {code:"SN.ITK.DEFC.ZS",name:"Prevalence of Undernourishment (%)",cat:"Food Security",fmt:"pct",api:"worldbank"},
      {code:"SN.ITK.MSFI.ZS",name:"Moderate or Severe Food Insecurity (%)",cat:"Food Security",fmt:"pct",api:"worldbank"},
      {code:"SH.STA.STNT.ZS",name:"Stunting in Children Under 5 (%)",cat:"Nutrition",fmt:"pct",api:"worldbank"},
      {code:"SH.STA.WAST.ZS",name:"Wasting in Children Under 5 (%)",cat:"Nutrition",fmt:"pct",api:"worldbank"},
      {code:"SH.STA.OWGH.ZS",name:"Overweight Children Under 5 (%)",cat:"Nutrition",fmt:"pct",api:"worldbank"},
    ]
  },{
    id:"sdg", name:"UN SDG — Sustainable Development Goals", short:"SDG", region:"Global", color:"#E53935",
    desc:"UN SDG Global Database — 231 indicators tracking progress across all 17 Sustainable Development Goals.",
    url:"https://unstats.un.org/sdgs/dataportal", keyRequired:false, plan:"pro",
    vars:[
      {code:"SI.POV.DDAY",name:"SDG 1.1 — Extreme Poverty < $2.15/day (%)",cat:"SDG 1 No Poverty",fmt:"pct",api:"worldbank"},
      {code:"SI.POV.NAHC",name:"SDG 1.2 — National Poverty Rate (%)",cat:"SDG 1 No Poverty",fmt:"pct",api:"worldbank"},
      {code:"SN.ITK.DEFC.ZS",name:"SDG 2.1 — Undernourishment (%)",cat:"SDG 2 Zero Hunger",fmt:"pct",api:"worldbank"},
      {code:"SH.STA.STNT.ZS",name:"SDG 2.2 — Child Stunting (%)",cat:"SDG 2 Zero Hunger",fmt:"pct",api:"worldbank"},
      {code:"SH.DYN.MORT",name:"SDG 3.2 — Under-5 Mortality (per 1,000)",cat:"SDG 3 Good Health",fmt:"num",api:"worldbank"},
      {code:"SH.STA.MMRT",name:"SDG 3.1 — Maternal Mortality (per 100,000)",cat:"SDG 3 Good Health",fmt:"num",api:"worldbank"},
      {code:"SH.HIV.INCD.ZS",name:"SDG 3.3 — HIV Incidence (per 1,000)",cat:"SDG 3 Good Health",fmt:"num",api:"worldbank"},
      {code:"SE.PRM.CMPT.ZS",name:"SDG 4.1 — Primary Completion Rate (%)",cat:"SDG 4 Education",fmt:"pct",api:"worldbank"},
      {code:"SE.ADT.LITR.ZS",name:"SDG 4.6 — Adult Literacy Rate (%)",cat:"SDG 4 Education",fmt:"pct",api:"worldbank"},
      {code:"SG.GEN.PARL.ZS",name:"SDG 5.5 — Women in Parliament (%)",cat:"SDG 5 Gender",fmt:"pct",api:"worldbank"},
      {code:"SH.H2O.BASW.ZS",name:"SDG 6.1 — Safe Drinking Water (%)",cat:"SDG 6 Clean Water",fmt:"pct",api:"worldbank"},
      {code:"SH.STA.BASS.ZS",name:"SDG 6.2 — Basic Sanitation (%)",cat:"SDG 6 Clean Water",fmt:"pct",api:"worldbank"},
      {code:"EG.ELC.ACCS.ZS",name:"SDG 7.1 — Access to Electricity (%)",cat:"SDG 7 Energy",fmt:"pct",api:"worldbank"},
      {code:"EG.FEC.RNEW.ZS",name:"SDG 7.2 — Renewable Energy (%)",cat:"SDG 7 Energy",fmt:"pct",api:"worldbank"},
      {code:"NY.GDP.MKTP.KD.ZG",name:"SDG 8.1 — GDP Growth Rate (%)",cat:"SDG 8 Decent Work",fmt:"pct",api:"worldbank"},
      {code:"SL.UEM.1524.ZS",name:"SDG 8.6 — Youth Unemployment (%)",cat:"SDG 8 Decent Work",fmt:"pct",api:"worldbank"},
      {code:"GB.XPD.RSDV.GD.ZS",name:"SDG 9.5 — R&D Expenditure (% GDP)",cat:"SDG 9 Innovation",fmt:"pct",api:"worldbank"},
      {code:"SI.POV.GINI",name:"SDG 10.1 — Gini Inequality Index",cat:"SDG 10 Reduced Inequalities",fmt:"num",api:"worldbank"},
      {code:"EN.ATM.CO2E.PC",name:"SDG 13 — CO2 Emissions per Capita",cat:"SDG 13 Climate",fmt:"num",api:"worldbank"},
      {code:"ER.LND.PTLD.ZS",name:"SDG 15.1 — Terrestrial Protected Areas (%)",cat:"SDG 15 Life on Land",fmt:"pct",api:"worldbank"},
      {code:"GE.EST",name:"SDG 16 — Government Effectiveness Index",cat:"SDG 16 Peace & Justice",fmt:"num",api:"worldbank"},
      {code:"RL.EST",name:"SDG 16 — Rule of Law Index",cat:"SDG 16 Peace & Justice",fmt:"num",api:"worldbank"},
      {code:"DT.ODA.ODAT.GN.ZS",name:"SDG 17.2 — ODA Received (% GNI)",cat:"SDG 17 Partnerships",fmt:"pct",api:"worldbank"},
    ]
  }
  ,{
    id:"hdi", name:"Human Development Index (UNDP)", short:"HDI", region:"Global", color:"#9C27B0",
    desc:"UNDP HDI component indicators — life expectancy, education and income. Composite index at hdr.undp.org.",
    url:"https://hdr.undp.org/data-center/human-development-index", keyRequired:false, plan:"pro",
    note:"HDI component indicators via World Bank. Official HDI scores at hdr.undp.org.",
    vars:[
      {code:"SP.DYN.LE00.IN",name:"Life Expectancy at Birth — HDI Component (years)",cat:"Health",fmt:"num",api:"worldbank"},
      {code:"SE.ADT.LITR.ZS",name:"Adult Literacy Rate — Education Component (%)",cat:"Education",fmt:"pct",api:"worldbank"},
      {code:"SE.PRM.ENRR",name:"Combined School Enrollment — Education Component (%)",cat:"Education",fmt:"pct",api:"worldbank"},
      {code:"NY.GNP.PCAP.PP.CD",name:"GNI per Capita PPP — Income Component (Intl $)",cat:"Income",fmt:"currency",api:"worldbank"},
      {code:"NY.GDP.PCAP.PP.CD",name:"GDP per Capita PPP (proxy for income component)",cat:"Income",fmt:"currency",api:"worldbank"},
      {code:"SE.SEC.ENRR",name:"Secondary Enrollment Gross — Education (%)",cat:"Education",fmt:"pct",api:"worldbank"},
      {code:"SE.TER.ENRR",name:"Tertiary Enrollment Gross — Education (%)",cat:"Education",fmt:"pct",api:"worldbank"},
      {code:"SH.XPD.CHEX.GD.ZS",name:"Health Expenditure % GDP — Health context",cat:"Health",fmt:"pct",api:"worldbank"},
      {code:"SI.POV.GINI",name:"Gini Coefficient — Inequality-adjusted context",cat:"Inequality",fmt:"num",api:"worldbank"},
      {code:"SP.DYN.IMRT.IN",name:"Infant Mortality — Health context (per 1,000)",cat:"Health",fmt:"num",api:"worldbank"},
    ]
  },{
    id:"gii", name:"Global Innovation Index (WIPO)", short:"GII", region:"Global", color:"#00BCD4",
    desc:"WIPO Global Innovation Index component indicators — R&D, technology, education and infrastructure.",
    url:"https://www.globalinnovationindex.org", keyRequired:false, plan:"pro",
    note:"GII component indicators via World Bank & IMF. Official GII scores at globalinnovationindex.org.",
    vars:[
      {code:"GB.XPD.RSDV.GD.ZS",name:"R&D Expenditure (% of GDP) — GII Input",cat:"R&D",fmt:"pct",api:"worldbank"},
      {code:"IP.PAT.RESD",name:"Patent Applications by Residents — GII Output",cat:"Innovation Output",fmt:"num",api:"worldbank"},
      {code:"IP.PAT.NRES",name:"Patent Applications by Non-Residents",cat:"Innovation Output",fmt:"num",api:"worldbank"},
      {code:"IP.TMK.TOTL",name:"Trademark Applications (total)",cat:"Innovation Output",fmt:"num",api:"worldbank"},
      {code:"IT.NET.USER.ZS",name:"Internet Users (% population) — ICT Access",cat:"ICT",fmt:"pct",api:"worldbank"},
      {code:"IT.CEL.SETS.P2",name:"Mobile Subscriptions per 100 people",cat:"ICT",fmt:"num",api:"worldbank"},
      {code:"SE.TER.ENRR",name:"Tertiary Education Enrollment (%) — Human Capital",cat:"Education",fmt:"pct",api:"worldbank"},
      {code:"SE.XPD.TOTL.GD.ZS",name:"Education Expenditure % GDP",cat:"Education",fmt:"pct",api:"worldbank"},
      {code:"IC.BUS.EASE.XQ",name:"Ease of Doing Business Score — Business Environment",cat:"Business",fmt:"num",api:"worldbank"},
      {code:"NY.GDP.MKTP.KD.ZG",name:"GDP Growth Rate — Economic Context",cat:"Economic",fmt:"pct",api:"worldbank"},
      {code:"NE.EXP.GNFS.ZS",name:"Exports of Goods & Services % GDP — Openness",cat:"Trade",fmt:"pct",api:"worldbank"},
    ]
  },{
    id:"gpi", name:"Global Peace Index (IEP)", short:"GPI", region:"Global", color:"#4CAF50",
    desc:"IEP Global Peace Index component indicators — safety, conflict, militarization and social cohesion.",
    url:"https://www.visionofhumanity.org/maps/global-peace-index/", keyRequired:false, plan:"pro",
    note:"GPI component indicators via World Bank & UN. Official GPI scores at visionofhumanity.org.",
    vars:[
      {code:"VC.IHR.PSRC.P5",name:"Intentional Homicides per 100,000 — Safety",cat:"Internal Safety",fmt:"num",api:"worldbank"},
      {code:"PV.EST",name:"Political Stability & No Violence Index",cat:"Conflict",fmt:"num",api:"worldbank"},
      {code:"VA.EST",name:"Voice & Accountability Index",cat:"Governance",fmt:"num",api:"worldbank"},
      {code:"RL.EST",name:"Rule of Law Index",cat:"Governance",fmt:"num",api:"worldbank"},
      {code:"CC.EST",name:"Control of Corruption Index",cat:"Governance",fmt:"num",api:"worldbank"},
      {code:"MS.MIL.XPND.GD.ZS",name:"Military Expenditure % GDP — Militarization",cat:"Military",fmt:"pct",api:"worldbank"},
      {code:"MS.MIL.TOTL.P1",name:"Armed Forces Personnel (total)",cat:"Military",fmt:"num",api:"worldbank"},
      {code:"MS.MIL.TOTL.TF.ZS",name:"Armed Forces % Total Labor Force",cat:"Military",fmt:"pct",api:"worldbank"},
      {code:"SM.POP.REFG",name:"Refugee Population — Conflict indicator",cat:"Conflict",fmt:"num",api:"worldbank"},
      {code:"GE.EST",name:"Government Effectiveness Index",cat:"Governance",fmt:"num",api:"worldbank"},
    ]
  },{
    id:"happiness", name:"World Happiness Index (UN)", short:"WHI", region:"Global", color:"#FF9800",
    desc:"UN World Happiness Report component indicators — GDP, social support, health, freedom, generosity and corruption.",
    url:"https://worldhappiness.report", keyRequired:false, plan:"pro",
    note:"WHI component indicators via World Bank. Official happiness scores at worldhappiness.report.",
    vars:[
      {code:"NY.GDP.PCAP.PP.CD",name:"GDP per Capita PPP — Economic Wellbeing",cat:"Economic",fmt:"currency",api:"worldbank"},
      {code:"SP.DYN.LE00.IN",name:"Life Expectancy at Birth — Healthy Life Years",cat:"Health",fmt:"num",api:"worldbank"},
      {code:"CC.EST",name:"Control of Corruption (Absence of Corruption factor)",cat:"Trust",fmt:"num",api:"worldbank"},
      {code:"VA.EST",name:"Voice & Accountability (Freedom to make choices)",cat:"Freedom",fmt:"num",api:"worldbank"},
      {code:"SI.POV.GINI",name:"Gini Inequality — Social Support context",cat:"Equality",fmt:"num",api:"worldbank"},
      {code:"SH.XPD.CHEX.GD.ZS",name:"Health Expenditure % GDP — Wellbeing context",cat:"Health",fmt:"pct",api:"worldbank"},
      {code:"SL.UEM.TOTL.ZS",name:"Unemployment Rate — Wellbeing stressor",cat:"Labour",fmt:"pct",api:"worldbank"},
      {code:"BX.TRF.PWKR.DT.GD.ZS",name:"Remittances Received % GDP — Social Support",cat:"Social",fmt:"pct",api:"worldbank"},
      {code:"SI.POV.NAHC",name:"National Poverty Rate — Deprivation indicator",cat:"Poverty",fmt:"pct",api:"worldbank"},
      {code:"GE.EST",name:"Government Effectiveness — Institutional Trust",cat:"Trust",fmt:"num",api:"worldbank"},
    ]
  },{
    id:"efi", name:"Index of Economic Freedom (Heritage)", short:"EFI", region:"Global", color:"#FF5722",
    desc:"Heritage Foundation Economic Freedom Index component indicators — trade, fiscal, monetary, investment and regulatory freedom.",
    url:"https://www.heritage.org/index/", keyRequired:false, plan:"pro",
    note:"EFI component indicators via World Bank & IMF. Official scores at heritage.org/index.",
    vars:[
      {code:"GC.TAX.TOTL.GD.ZS",name:"Tax Revenue % GDP — Fiscal Freedom",cat:"Fiscal Freedom",fmt:"pct",api:"worldbank"},
      {code:"GC.XPN.TOTL.GD.ZS",name:"Government Expenditure % GDP — Government Spending",cat:"Fiscal Freedom",fmt:"pct",api:"worldbank"},
      {code:"GC.DOD.TOTL.GD.ZS",name:"Government Debt % GDP — Fiscal Health",cat:"Fiscal Freedom",fmt:"pct",api:"worldbank"},
      {code:"FP.CPI.TOTL.ZG",name:"Inflation Rate CPI (%) — Monetary Freedom",cat:"Monetary Freedom",fmt:"pct",api:"worldbank"},
      {code:"NE.TRD.GNFS.ZS",name:"Trade Openness % GDP — Trade Freedom",cat:"Trade Freedom",fmt:"pct",api:"worldbank"},
      {code:"BX.KLT.DINV.WD.GD.ZS",name:"FDI Inflows % GDP — Investment Freedom",cat:"Investment Freedom",fmt:"pct",api:"worldbank"},
      {code:"FS.AST.PRVT.GD.ZS",name:"Credit to Private Sector % GDP — Financial Freedom",cat:"Financial Freedom",fmt:"pct",api:"worldbank"},
      {code:"IC.BUS.EASE.XQ",name:"Ease of Doing Business Score — Business Freedom",cat:"Business Freedom",fmt:"num",api:"worldbank"},
      {code:"IC.REG.DURS",name:"Days to Start a Business — Regulatory Freedom",cat:"Business Freedom",fmt:"num",api:"worldbank"},
      {code:"RL.EST",name:"Rule of Law Index — Property Rights",cat:"Property Rights",fmt:"num",api:"worldbank"},
      {code:"CC.EST",name:"Control of Corruption — Freedom from Corruption",cat:"Governance",fmt:"num",api:"worldbank"},
      {code:"RQ.EST",name:"Regulatory Quality Index — Regulatory Efficiency",cat:"Regulatory",fmt:"num",api:"worldbank"},
    ]
  },{
    id:"yahoo", name:"Yahoo Finance — Markets", short:"YF", region:"Global", color:"#7B00FF",
    desc:"Live & historical market data — stock indices, forex, commodities, crypto. Daily/weekly/monthly frequency.",
    url:"https://finance.yahoo.com", keyRequired:false, plan:"pro", isMarket:true,
    note:"Real daily market data via Yahoo Finance. Supports daily, weekly & monthly frequency (not annual-only like other sources).",
    vars:[
      {code:"^GSPC",name:"S&P 500 Index",cat:"Equity Indices",fmt:"num",api:"yahoo"},
      {code:"^DJI",name:"Dow Jones Industrial Average",cat:"Equity Indices",fmt:"num",api:"yahoo"},
      {code:"^IXIC",name:"NASDAQ Composite",cat:"Equity Indices",fmt:"num",api:"yahoo"},
      {code:"^FTSE",name:"FTSE 100 (UK)",cat:"Equity Indices",fmt:"num",api:"yahoo"},
      {code:"^N225",name:"Nikkei 225 (Japan)",cat:"Equity Indices",fmt:"num",api:"yahoo"},
      {code:"GHActrl.PR",name:"Ghana — (search ticker on finance.yahoo.com)",cat:"Equity Indices",fmt:"num",api:"yahoo"},
      {code:"GC=F",name:"Gold Futures (USD/oz)",cat:"Commodities",fmt:"currency",api:"yahoo"},
      {code:"CL=F",name:"Crude Oil WTI Futures (USD/bbl)",cat:"Commodities",fmt:"currency",api:"yahoo"},
      {code:"SI=F",name:"Silver Futures (USD/oz)",cat:"Commodities",fmt:"currency",api:"yahoo"},
      {code:"CC=F",name:"Cocoa Futures (USD/ton)",cat:"Commodities",fmt:"currency",api:"yahoo"},
      {code:"KC=F",name:"Coffee Futures (USD/lb)",cat:"Commodities",fmt:"currency",api:"yahoo"},
      {code:"GHS=X",name:"USD / Ghanaian Cedi",cat:"Forex",fmt:"num",api:"yahoo"},
      {code:"EURUSD=X",name:"EUR / USD",cat:"Forex",fmt:"num",api:"yahoo"},
      {code:"GBPUSD=X",name:"GBP / USD",cat:"Forex",fmt:"num",api:"yahoo"},
      {code:"NGN=X",name:"USD / Nigerian Naira",cat:"Forex",fmt:"num",api:"yahoo"},
      {code:"ZAR=X",name:"USD / South African Rand",cat:"Forex",fmt:"num",api:"yahoo"},
      {code:"BTC-USD",name:"Bitcoin (USD)",cat:"Crypto",fmt:"currency",api:"yahoo"},
      {code:"ETH-USD",name:"Ethereum (USD)",cat:"Crypto",fmt:"currency",api:"yahoo"},
    ]
  }
];

// ══════════════════════════════════════════════
// DATA SOURCES — MICRO LEVEL
// ══════════════════════════════════════════════
const MICRO_SOURCES = [
  {
    id:"who", name:"WHO — Global Health Observatory", short:"WHO", region:"Global", get color(){return C.purple},
    desc:"World Health Organization — health statistics, disease burden and health system indicators.",
    url:"https://www.who.int/data/gho", keyRequired:false,
    vars:[
      {code:"WHOSIS_000001",name:"Life Expectancy at Birth (years)",cat:"Mortality",fmt:"num"},
      {code:"WHOSIS_000002",name:"Healthy Life Expectancy at Birth (years)",cat:"Mortality",fmt:"num"},
      {code:"MDG_0000000001",name:"Infant Mortality Rate (per 1,000 live births)",cat:"Mortality",fmt:"num"},
      {code:"MDG_0000000003",name:"Under-5 Mortality Rate (per 1,000)",cat:"Mortality",fmt:"num"},
      {code:"MDG_0000000026",name:"Maternal Mortality Ratio (per 100,000)",cat:"Mortality",fmt:"num"},
      {code:"HIV_0000000001",name:"HIV Prevalence Adults 15-49 (%)",cat:"Infectious Disease",fmt:"pct"},
      {code:"MDG_0000000020",name:"Tuberculosis Incidence (per 100,000)",cat:"Infectious Disease",fmt:"num"},
      {code:"MALARIA_EST_INCIDENCE",name:"Malaria Incidence (per 1,000 at risk)",cat:"Infectious Disease",fmt:"num"},
      {code:"NCD_BMI_30C",name:"Obesity Prevalence — Adults (%)",cat:"NCDs",fmt:"pct"},
      {code:"NCD_HYP_PREVALENCE_A",name:"Hypertension Prevalence (%)",cat:"NCDs",fmt:"pct"},
      {code:"NCD_GLUC_04",name:"Diabetes Prevalence (%)",cat:"NCDs",fmt:"pct"},
      {code:"SA_0000001462",name:"Alcohol Consumption (litres per capita)",cat:"Risk Factors",fmt:"num"},
      {code:"M_Est_smk_curr_std",name:"Current Tobacco Use — Adults (%)",cat:"Risk Factors",fmt:"pct"},
      {code:"WSH_WATER_SAFELY_MANAGED",name:"Population using safely managed water (%)",cat:"WASH",fmt:"pct"},
      {code:"WSH_SANITATION_SAFELY_MANAGED",name:"Population using safely managed sanitation (%)",cat:"WASH",fmt:"pct"},
      {code:"HWF_0001",name:"Physicians (per 10,000 population)",cat:"Health System",fmt:"num"},
      {code:"HWF_0007",name:"Nurses & Midwives (per 10,000)",cat:"Health System",fmt:"num"},
      {code:"GHED_CHE_pc_US_SHA2011",name:"Health Spending per Capita (USD)",cat:"Health System",fmt:"currency"},
      {code:"UHC_INDEX_REPORTED",name:"UHC Service Coverage Index (0–100)",cat:"Health System",fmt:"num"},
    ]
  },
  {
    id:"ilo", name:"ILO — ILOSTAT Labour Stats", short:"ILO", region:"Global", get color(){return C.cyan},
    desc:"ILO labour market data — served via World Bank aligned indicators (ILO-sourced).",
    url:"https://ilostat.ilo.org", keyRequired:false,
    vars:[
      {code:"SL.UEM.TOTL.ZS",name:"Total Unemployment Rate (%)",cat:"Unemployment",fmt:"pct",api:"worldbank"},
      {code:"SL.UEM.1524.ZS",name:"Youth Unemployment Rate 15-24 (%)",cat:"Unemployment",fmt:"pct",api:"worldbank"},
      {code:"SL.UEM.TOTL.FE.ZS",name:"Female Unemployment Rate (%)",cat:"Unemployment",fmt:"pct",api:"worldbank"},
      {code:"SL.TLF.ACTI.ZS",name:"Labour Force Participation Rate (%)",cat:"Labour Force",fmt:"pct",api:"worldbank"},
      {code:"SL.TLF.ACTI.FE.ZS",name:"Female Labour Force Participation (%)",cat:"Labour Force",fmt:"pct",api:"worldbank"},
      {code:"SL.TLF.TOTL.IN",name:"Total Labour Force (persons)",cat:"Labour Force",fmt:"num",api:"worldbank"},
      {code:"SL.EMP.TOTL.SP.ZS",name:"Employment-to-Population Ratio (%)",cat:"Employment",fmt:"pct",api:"worldbank"},
      {code:"SL.EMP.SELF.ZS",name:"Self-Employed Workers (% of total)",cat:"Employment",fmt:"pct",api:"worldbank"},
      {code:"SL.AGR.EMPL.ZS",name:"Employment in Agriculture (%)",cat:"Employment",fmt:"pct",api:"worldbank"},
      {code:"SL.IND.EMPL.ZS",name:"Employment in Industry (%)",cat:"Employment",fmt:"pct",api:"worldbank"},
      {code:"SL.SRV.EMPL.ZS",name:"Employment in Services (%)",cat:"Employment",fmt:"pct",api:"worldbank"},
      {code:"SL.FAM.WORK.ZS",name:"Contributing Family Workers (%)",cat:"Informality",fmt:"pct",api:"worldbank"},
    ]
  },
  {
    id:"wbpov", name:"World Bank — Poverty & Inequality", short:"WB-P", region:"Global", get color(){return C.blue},
    desc:"World Bank Poverty & Inequality Platform — welfare, poverty and distributional data.",
    url:"https://pip.worldbank.org", keyRequired:false,
    vars:[
      {code:"SI.POV.DDAY",name:"Poverty Headcount < $2.15/day (%)",cat:"Poverty",fmt:"pct",api:"worldbank"},
      {code:"SI.POV.LMIC",name:"Poverty Headcount < $3.65/day (%)",cat:"Poverty",fmt:"pct",api:"worldbank"},
      {code:"SI.POV.UMIC",name:"Poverty Headcount < $6.85/day (%)",cat:"Poverty",fmt:"pct",api:"worldbank"},
      {code:"SI.POV.NAHC",name:"National Poverty Rate (%)",cat:"Poverty",fmt:"pct",api:"worldbank"},
      {code:"SI.POV.GINI",name:"Gini Coefficient (0–100, higher = more unequal)",cat:"Inequality",fmt:"num",api:"worldbank"},
      {code:"SI.DST.10TH.10",name:"Income Share — Highest 10% (%)",cat:"Inequality",fmt:"pct",api:"worldbank"},
      {code:"SI.DST.FRST.20",name:"Income Share — Lowest 20% (%)",cat:"Inequality",fmt:"pct",api:"worldbank"},
      {code:"SI.DST.05TH.20",name:"Income Share — Highest 20% (%)",cat:"Inequality",fmt:"pct",api:"worldbank"},
      {code:"SI.SPR.PCAP",name:"Survey Mean Consumption/Income (2017 PPP $)",cat:"Welfare",fmt:"currency",api:"worldbank"},
      {code:"SI.SPR.PC40",name:"Income Growth — Bottom 40% (%)",cat:"Welfare",fmt:"pct",api:"worldbank"},
    ]
  },
  {
    id:"unesco", name:"UNESCO — UIS Education Data", short:"UIS", region:"Global", get color(){return C.orange},
    desc:"UNESCO Institute for Statistics — global education monitoring data.",
    url:"https://uis.unesco.org", keyRequired:false,
    vars:[
      {code:"SE.ADT.LITR.ZS",name:"Adult Literacy Rate — 15+ (%)",cat:"Literacy",fmt:"pct",api:"worldbank"},
      {code:"SE.ADT.1524.LT.ZS",name:"Youth Literacy Rate 15-24 (%)",cat:"Literacy",fmt:"pct",api:"worldbank"},
      {code:"SE.PRM.ENRR",name:"Primary School Enrollment — Gross (%)",cat:"Enrollment",fmt:"pct",api:"worldbank"},
      {code:"SE.SEC.ENRR",name:"Secondary School Enrollment — Gross (%)",cat:"Enrollment",fmt:"pct",api:"worldbank"},
      {code:"SE.TER.ENRR",name:"Tertiary School Enrollment — Gross (%)",cat:"Enrollment",fmt:"pct",api:"worldbank"},
      {code:"SE.PRM.TENR",name:"Primary Enrollment — Net (%)",cat:"Enrollment",fmt:"pct",api:"worldbank"},
      {code:"SE.PRM.CMPT.ZS",name:"Primary Completion Rate (%)",cat:"Attainment",fmt:"pct",api:"worldbank"},
      {code:"SE.SEC.CMPT.LO.ZS",name:"Lower Secondary Completion Rate (%)",cat:"Attainment",fmt:"pct",api:"worldbank"},
      {code:"SE.XPD.TOTL.GD.ZS",name:"Education Expenditure % GDP",cat:"Finance",fmt:"pct",api:"worldbank"},
      {code:"SE.XPD.TOTL.GB.ZS",name:"Education Expenditure % Govt Spending",cat:"Finance",fmt:"pct",api:"worldbank"},
      {code:"SE.ENR.PRSC.FM.ZS",name:"Gender Parity Index — Primary",cat:"Gender",fmt:"num",api:"worldbank"},
      {code:"SE.ENR.SECO.FM.ZS",name:"Gender Parity Index — Secondary",cat:"Gender",fmt:"num",api:"worldbank"},
    ]
  },
  {
    id:"environment", name:"Climate & Environment", short:"ENV", region:"Global", get color(){return C.teal},
    desc:"Environmental indicators from World Bank, UN Environment and climate databases.",
    url:"https://data.worldbank.org/topic/environment", keyRequired:false,
    vars:[
      {code:"EN.ATM.CO2E.PC",name:"CO2 Emissions per Capita (metric tons)",cat:"Emissions",fmt:"num",api:"worldbank"},
      {code:"EN.ATM.CO2E.KT",name:"Total CO2 Emissions (kilotons)",cat:"Emissions",fmt:"num",api:"worldbank"},
      {code:"EN.ATM.CO2E.GF.ZS",name:"CO2 from Gaseous Fuel (%)",cat:"Emissions",fmt:"pct",api:"worldbank"},
      {code:"EN.ATM.METH.KT.CE",name:"Methane Emissions (kt CO2 equivalent)",cat:"Emissions",fmt:"num",api:"worldbank"},
      {code:"EG.USE.PCAP.KG.OE",name:"Energy Use per Capita (kg oil equivalent)",cat:"Energy",fmt:"num",api:"worldbank"},
      {code:"EG.ELC.ACCS.ZS",name:"Access to Electricity (%)",cat:"Energy",fmt:"pct",api:"worldbank"},
      {code:"EG.FEC.RNEW.ZS",name:"Renewable Energy Consumption (%)",cat:"Energy",fmt:"pct",api:"worldbank"},
      {code:"EG.ELC.RNEW.ZS",name:"Renewable Electricity Output (%)",cat:"Energy",fmt:"pct",api:"worldbank"},
      {code:"ER.LND.PTLD.ZS",name:"Terrestrial Protected Areas (% land)",cat:"Land",fmt:"pct",api:"worldbank"},
      {code:"AG.LND.FRST.ZS",name:"Forest Area (% of land area)",cat:"Land",fmt:"pct",api:"worldbank"},
      {code:"AG.LND.AGRI.ZS",name:"Agricultural Land (% of land)",cat:"Land",fmt:"pct",api:"worldbank"},
      {code:"SH.H2O.BASW.ZS",name:"Access to Basic Drinking Water (%)",cat:"Water",fmt:"pct",api:"worldbank"},
      {code:"ER.H2O.FWTL.ZS",name:"Freshwater Withdrawals % of Resources",cat:"Water",fmt:"pct",api:"worldbank"},
    ]
  },
  {
    id:"unicef", name:"UNICEF — Child & Social Data", short:"UNICEF", region:"Global", color:"#00AEEF",
    desc:"UNICEF global child welfare, immunisation, nutrition, education and social protection indicators.",
    url:"https://data.unicef.org", keyRequired:false, plan:"pro",
    vars:[
      {code:"SH.DYN.MORT",name:"Under-5 Mortality Rate (per 1,000 live births)",cat:"Child Health",fmt:"num",api:"worldbank"},
      {code:"SH.DYN.NMRT",name:"Neonatal Mortality Rate (per 1,000 live births)",cat:"Child Health",fmt:"num",api:"worldbank"},
      {code:"SP.DYN.IMRT.IN",name:"Infant Mortality Rate (per 1,000 live births)",cat:"Child Health",fmt:"num",api:"worldbank"},
      {code:"SH.STA.STNT.ZS",name:"Stunting — Children Under 5 (%)",cat:"Child Nutrition",fmt:"pct",api:"worldbank"},
      {code:"SH.STA.WAST.ZS",name:"Wasting — Children Under 5 (%)",cat:"Child Nutrition",fmt:"pct",api:"worldbank"},
      {code:"SH.STA.OWGH.ZS",name:"Overweight — Children Under 5 (%)",cat:"Child Nutrition",fmt:"pct",api:"worldbank"},
      {code:"SH.ANM.CHLD.ZS",name:"Anaemia Prevalence in Children (%)",cat:"Child Nutrition",fmt:"pct",api:"worldbank"},
      {code:"SH.IMM.MEAS",name:"Measles Immunisation — Children (%)",cat:"Immunisation",fmt:"pct",api:"worldbank"},
      {code:"SH.IMM.IDPT",name:"DTP Immunisation Coverage (%)",cat:"Immunisation",fmt:"pct",api:"worldbank"},
      {code:"SH.STA.BRTC.ZS",name:"Births Attended by Skilled Staff (%)",cat:"Maternal & Child",fmt:"pct",api:"worldbank"},
      {code:"SH.STA.MMRT",name:"Maternal Mortality Ratio (per 100,000)",cat:"Maternal & Child",fmt:"num",api:"worldbank"},
      {code:"SE.PRM.ENRR",name:"Primary School Enrollment — Gross (%)",cat:"Education",fmt:"pct",api:"worldbank"},
      {code:"SE.PRM.TENR",name:"Primary School Enrollment — Net (%)",cat:"Education",fmt:"pct",api:"worldbank"},
      {code:"SE.PRM.CMPT.ZS",name:"Primary School Completion Rate (%)",cat:"Education",fmt:"pct",api:"worldbank"},
      {code:"SE.ENR.PRSC.FM.ZS",name:"Gender Parity Index — Primary Education",cat:"Gender",fmt:"num",api:"worldbank"},
      {code:"SH.H2O.BASW.ZS",name:"Access to Basic Drinking Water (%)",cat:"WASH",fmt:"pct",api:"worldbank"},
      {code:"SH.STA.BASS.ZS",name:"Access to Basic Sanitation Services (%)",cat:"WASH",fmt:"pct",api:"worldbank"},
      {code:"SN.ITK.DEFC.ZS",name:"Prevalence of Undernourishment (%)",cat:"Food & Nutrition",fmt:"pct",api:"worldbank"},
      {code:"SP.DYN.CBRT.IN",name:"Crude Birth Rate (per 1,000 people)",cat:"Demographics",fmt:"num",api:"worldbank"},
      {code:"SP.DYN.TFRT.IN",name:"Total Fertility Rate (births per woman)",cat:"Demographics",fmt:"num",api:"worldbank"},
    ]
  },{
    id:"findex", name:"World Bank Global Findex", short:"FINDEX", region:"Global", color:"#7B1FA2",
    desc:"World Bank Global Findex Database — financial inclusion, digital payments and savings behaviour.",
    url:"https://www.worldbank.org/en/publication/globalfindex", keyRequired:false, plan:"pro",
    vars:[
      {code:"FX.OWN.TOTL.ZS",name:"Account Ownership — Adults (%)",cat:"Financial Inclusion",fmt:"pct",api:"worldbank"},
      {code:"FX.OWN.TOTL.FE.ZS",name:"Account Ownership — Women (%)",cat:"Financial Inclusion",fmt:"pct",api:"worldbank"},
      {code:"FX.OWN.TOTL.YG.ZS",name:"Account Ownership — Youth 15-24 (%)",cat:"Financial Inclusion",fmt:"pct",api:"worldbank"},
      {code:"FX.OWN.TOTL.PL.ZS",name:"Account Ownership — Poorest 40% (%)",cat:"Financial Inclusion",fmt:"pct",api:"worldbank"},
      {code:"FX.OWN.TOTL.OL.ZS",name:"Account Ownership — Older Adults (%)",cat:"Financial Inclusion",fmt:"pct",api:"worldbank"},
      {code:"FB.CBK.BRCH.P5",name:"Commercial Bank Branches per 100,000 Adults",cat:"Banking Access",fmt:"num",api:"worldbank"},
      {code:"FB.ATM.TOTL.P5",name:"ATMs per 100,000 Adults",cat:"Banking Access",fmt:"num",api:"worldbank"},
      {code:"FS.AST.PRVT.GD.ZS",name:"Domestic Credit to Private Sector (% GDP)",cat:"Credit",fmt:"pct",api:"worldbank"},
      {code:"FB.AST.NPER.ZS",name:"Bank Nonperforming Loans (%)",cat:"Credit Quality",fmt:"pct",api:"worldbank"},
      {code:"IC.FRM.BKWC.ZS",name:"Firms Using Banks to Finance Investment (%)",cat:"Business Finance",fmt:"pct",api:"worldbank"},
      {code:"IT.CEL.SETS.P2",name:"Mobile Cellular Subscriptions (per 100)",cat:"Digital",fmt:"num",api:"worldbank"},
      {code:"IT.NET.USER.ZS",name:"Internet Users (% of population)",cat:"Digital",fmt:"pct",api:"worldbank"},
    ]
  },{
    id:"sociology", name:"Social & Development Indicators", short:"SOCIO", region:"Global", color:"#F57C00",
    desc:"Sociological & development data: demographics, governance, gender, safety, wellbeing and business climate.",
    url:"https://data.worldbank.org/topic/social-development", keyRequired:false, plan:"pro",
    vars:[
      {code:"SP.POP.TOTL",name:"Total Population",cat:"Demographics",fmt:"num",api:"worldbank"},
      {code:"SP.POP.GROW",name:"Population Growth Rate (%)",cat:"Demographics",fmt:"pct",api:"worldbank"},
      {code:"SP.URB.TOTL.IN.ZS",name:"Urban Population (% of total)",cat:"Demographics",fmt:"pct",api:"worldbank"},
      {code:"SP.DYN.LE00.IN",name:"Life Expectancy at Birth (years)",cat:"Demographics",fmt:"num",api:"worldbank"},
      {code:"SP.DYN.TFRT.IN",name:"Total Fertility Rate (births per woman)",cat:"Demographics",fmt:"num",api:"worldbank"},
      {code:"SP.DYN.CDRT.IN",name:"Crude Death Rate (per 1,000 people)",cat:"Demographics",fmt:"num",api:"worldbank"},
      {code:"SP.POP.DPND",name:"Age Dependency Ratio (% of working-age)",cat:"Demographics",fmt:"pct",api:"worldbank"},
      {code:"SM.POP.NETM",name:"Net Migration (persons)",cat:"Migration",fmt:"num",api:"worldbank"},
      {code:"SM.POP.REFG",name:"Refugee Population by Country of Asylum",cat:"Migration",fmt:"num",api:"worldbank"},
      {code:"SI.POV.GINI",name:"Gini Inequality Coefficient (0-100)",cat:"Inequality",fmt:"num",api:"worldbank"},
      {code:"SI.POV.NAHC",name:"National Poverty Headcount Rate (%)",cat:"Poverty",fmt:"pct",api:"worldbank"},
      {code:"SI.DST.FRST.20",name:"Income Share — Bottom 20% (%)",cat:"Inequality",fmt:"pct",api:"worldbank"},
      {code:"SI.DST.05TH.20",name:"Income Share — Top 20% (%)",cat:"Inequality",fmt:"pct",api:"worldbank"},
      {code:"SG.GEN.PARL.ZS",name:"Women in National Parliament (%)",cat:"Gender",fmt:"pct",api:"worldbank"},
      {code:"SL.TLF.ACTI.FE.ZS",name:"Female Labour Force Participation (%)",cat:"Gender",fmt:"pct",api:"worldbank"},
      {code:"SL.UEM.TOTL.FE.ZS",name:"Female Unemployment Rate (%)",cat:"Gender",fmt:"pct",api:"worldbank"},
      {code:"VC.IHR.PSRC.P5",name:"Intentional Homicides (per 100,000 people)",cat:"Safety",fmt:"num",api:"worldbank"},
      {code:"CC.EST",name:"Control of Corruption Index (estimate)",cat:"Governance",fmt:"num",api:"worldbank"},
      {code:"GE.EST",name:"Government Effectiveness Index (estimate)",cat:"Governance",fmt:"num",api:"worldbank"},
      {code:"RL.EST",name:"Rule of Law Index (estimate)",cat:"Governance",fmt:"num",api:"worldbank"},
      {code:"RQ.EST",name:"Regulatory Quality Index (estimate)",cat:"Governance",fmt:"num",api:"worldbank"},
      {code:"VA.EST",name:"Voice & Accountability Index",cat:"Governance",fmt:"num",api:"worldbank"},
      {code:"PV.EST",name:"Political Stability Index",cat:"Governance",fmt:"num",api:"worldbank"},
      {code:"IC.BUS.EASE.XQ",name:"Ease of Doing Business Score",cat:"Business Climate",fmt:"num",api:"worldbank"},
      {code:"IC.REG.DURS",name:"Time to Start a Business (days)",cat:"Business Climate",fmt:"num",api:"worldbank"},
      {code:"IC.TAX.TOTL.CP.ZS",name:"Total Tax Rate (% of commercial profit)",cat:"Business Climate",fmt:"pct",api:"worldbank"},
      {code:"BX.TRF.PWKR.CD.DT",name:"Personal Remittances Received (USD)",cat:"Remittances",fmt:"currency",api:"worldbank"},
      {code:"BX.TRF.PWKR.DT.GD.ZS",name:"Remittances Received (% of GDP)",cat:"Remittances",fmt:"pct",api:"worldbank"},
    ]
  }
];

const ALL_SOURCES = { macro: MACRO_SOURCES, micro: MICRO_SOURCES };

// ── Mobile detection hook
if(typeof document!=="undefined"){let vp=document.querySelector("meta[name=viewport]");if(!vp){vp=document.createElement("meta");vp.name="viewport";document.head.appendChild(vp);}vp.content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no";}

const useIsMobile=()=>{
  const check=()=>typeof window!=="undefined"&&(window.innerWidth<768||('ontouchstart' in window&&window.innerWidth<1024));
  const [m,setM]=React.useState(check());
  React.useEffect(()=>{
    const h=()=>setM(check());
    h(); // run immediately on mount
    window.addEventListener("resize",h);
    window.addEventListener("orientationchange",h);
    return()=>{window.removeEventListener("resize",h);window.removeEventListener("orientationchange",h);};
  },[]);
  return m;
};

// ── Fast source lookup map (module-level) ────────────────────────────────────
const ALL_SRCS_MAP = (()=>{
  const m={};
  [...MACRO_SOURCES,...MICRO_SOURCES].forEach(s=>{m[s.id]=s;});
  return m;
})();

// ══════════════════════════════════════════════
// FETCH FUNCTIONS
// ══════════════════════════════════════════════


// ── In-memory data cache (5 min TTL) ────────────────────────────────────────
const _dataCache = new Map();
const _cacheTTL = 5 * 60 * 1000;
const cacheGet = (key) => {
  const entry = _dataCache.get(key);
  if(!entry) return null;
  if(Date.now() - entry.ts > _cacheTTL){ _dataCache.delete(key); return null; }
  return entry.data;
};
const cacheSet = (key, data) => _dataCache.set(key, {data, ts:Date.now()});
const cacheClearPrefix = (prefix) => { for(const k of [..._dataCache.keys()]) if(k.startsWith(prefix)) _dataCache.delete(k); };
const cacheClearAll = () => _dataCache.clear();

// Route external economic-data API calls through our own server (same-origin)
// to avoid browser CORS failures from third-party providers.
// Global concurrency gate — limits simultaneous upstream requests to avoid
// third-party rate-limiting/throttling (World Bank drops bursts of parallel calls).
let _activeRequests = 0;
const _requestQueue = [];
const MAX_CONCURRENT = 3;
const _drainQueue = () => {
  while (_activeRequests < MAX_CONCURRENT && _requestQueue.length) {
    const job = _requestQueue.shift();
    job();
  }
};
const proxyFetch = (targetUrl) => new Promise((resolve) => {
  const run = async () => {
    _activeRequests++;
    try {
      const r = await fetch(`/api/proxy-data?url=${encodeURIComponent(targetUrl)}`);
      const text = await r.text();
      // Guard against HTML error pages / empty bodies from flaky upstreams
      if (!text || (text.trim()[0] !== "[" && text.trim()[0] !== "{")) {
        resolve(null);
      } else {
        try { resolve(JSON.parse(text)); } catch { resolve(null); }
      }
    } catch (e) {
      resolve(null);
    } finally {
      _activeRequests--;
      _drainQueue();
    }
  };
  _requestQueue.push(run);
  _drainQueue();
});

// Worldwide Governance Indicators live in WB "source 3" and need &source=3
const WGI_CODES = new Set(["CC.EST","RL.EST","GE.EST","VA.EST","RQ.EST","PV.EST","CC.PER.RNK","RL.PER.RNK","GE.PER.RNK","VA.PER.RNK","RQ.PER.RNK","PV.PER.RNK"]);
const fetchWorldBank = async (cc, code, y0, y1) => {
  const ckey = `wb:${cc}:${code}:${y0}:${y1}`;
  const cached = cacheGet(ckey);
  if(cached) return cached;
  const sourceParam = WGI_CODES.has(code) ? "&source=3" : "";
  try {
    let j = await proxyFetch(`https://api.worldbank.org/v2/country/${cc}/indicator/${code}?format=json&per_page=500${sourceParam}`);
    // If invalid-format error and we didn't already try source=3, retry with it
    if ((!Array.isArray(j) || !j[1]) && !sourceParam) {
      j = await proxyFetch(`https://api.worldbank.org/v2/country/${cc}/indicator/${code}?format=json&per_page=500&source=3`);
    }
    if (!Array.isArray(j) || !j[1]) return [];
    const result = j[1]
      .filter(d => {
        const yr = parseInt(d.date);
        return !isNaN(yr) && yr >= y0 && yr <= y1;
      })
      .map(d => ({year: parseInt(d.date), value: d.value!=null ? parseFloat(d.value) : null}))
      .sort((a, b) => a.year - b.year);
    if(result.length>0) cacheSet(ckey, result);
    return result;
  } catch (e) { console.error("[EcoScope] World Bank fetch failed:", ckey, e); return []; }
};

// IMF DataMapper API is now blocked by Akamai WAF (403 for all servers).
// Fall back to World Bank equivalents for the common WEO indicators.
const IMF_TO_WB = {
  "NGDP_RPCH": "NY.GDP.MKTP.KD.ZG",   // Real GDP growth %
  "PCPIPCH":   "FP.CPI.TOTL.ZG",       // Inflation, CPI %
  "GGXWDG_NGDP":"GC.DOD.TOTL.GD.ZS",   // Govt gross debt % GDP
  "BCA_NGDPD": "BN.CAB.XOKA.GD.ZS",    // Current account balance % GDP
  "LUR":       "SL.UEM.TOTL.ZS",       // Unemployment rate
  "LP":        "SP.POP.TOTL",          // Population
  "NGDPD":     "NY.GDP.MKTP.CD",       // GDP current USD
  "NGDPDPC":   "NY.GDP.PCAP.CD",       // GDP per capita USD
};
const fetchIMF = async (cc, code, y0, y1) => {
  const ckey = `imf:${cc}:${code}:${y0}:${y1}`;
  const cached = cacheGet(ckey);
  if(cached) return cached;
  // Route to World Bank equivalent (IMF direct API is WAF-blocked server-side)
  const wbCode = IMF_TO_WB[code];
  if (wbCode) {
    const r = await fetchWorldBank(cc, wbCode, y0, y1);
    if(r.length>0) cacheSet(ckey, r);
    return r;
  }
  return [];
};

const fetchFRED = async (code, y0, y1, key) => {
  if (!key) return [];
  const ckey = `fred:${code}:${y0}:${y1}`;
  const cached = cacheGet(ckey);
  if(cached) return cached;
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${code}&api_key=${key}&file_type=json&observation_start=${y0}-01-01&observation_end=${y1}-12-31&frequency=a&aggregation_method=avg`;
    const j = await proxyFetch(url);
    if (!j?.observations) return [];
    const result = j.observations
      .filter(o => o.value !== '.' && o.value != null)
      .map(o => ({year: parseInt(o.date.substring(0, 4)), value: parseFloat(o.value)}))
      .sort((a, b) => a.year - b.year);
    if(result.length>0) cacheSet(ckey, result);
    return result;
  } catch (e) { console.error("[EcoScope] FRED fetch failed:", ckey, e); return []; }
};

const fetchWHO = async (cc, code, y0, y1) => {
  const ckey = `who:${cc}:${code}:${y0}:${y1}`;
  const cached = cacheGet(ckey);
  if(cached) return cached;
  try {
    const iso3 = ISO3[cc] || cc;
    const url = `https://ghoapi.azureedge.net/api/${code}?$filter=SpatialDim eq '${iso3}' and TimeDim ge ${y0} and TimeDim le ${y1}&$select=TimeDim,NumericValue,Dim1&$orderby=TimeDim`;
    const j = await proxyFetch(url);
    if (!j?.value) return [];
    // WHO returns one row per sex (male / female / both) for many indicators: keep "both sexes" when present
    const hasBoth = j.value.some(d => d.Dim1 === "SEX_BTSX");
    const result = j.value
      .filter(d => d.NumericValue != null && (!hasBoth || d.Dim1 === "SEX_BTSX"))
      .map(d => ({year: d.TimeDim, value: d.NumericValue}))
      .sort((a, b) => a.year - b.year);
    if(result.length>0) cacheSet(ckey, result);
    return result;
  } catch (e) { console.error("[EcoScope] WHO fetch failed:", ckey, e); return []; }
};

// Yahoo Finance — real daily/weekly/monthly market data (indices, forex, commodities, crypto)
// interval: 1d, 1wk, 1mo — returns time-stamped closes.
const fetchYahoo = async (code, y0, y1, interval="1mo") => {
  const ckey = `yf:${code}:${y0}:${y1}:${interval}`;
  const cached = cacheGet(ckey);
  if(cached) return cached;
  try {
    const p1 = Math.floor(new Date(`${y0}-01-01`).getTime()/1000);
    const p2 = Math.floor(new Date(`${y1}-12-31`).getTime()/1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code)}?period1=${p1}&period2=${p2}&interval=${interval}`;
    const j = await proxyFetch(url);
    const r = j?.chart?.result?.[0];
    if(!r?.timestamp || !r?.indicators?.quote?.[0]?.close) return [];
    const ts = r.timestamp;
    const closes = r.indicators.quote[0].close;
    const result = ts.map((t,i)=>{
      const d = new Date(t*1000);
      const val = closes[i];
      if(val==null||isNaN(val)) return null;
      // Label depends on interval
      let label;
      if(interval==="1d") label = d.toISOString().slice(0,10);
      else if(interval==="1wk") label = d.toISOString().slice(0,10);
      else if(interval==="1mo") label = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      else label = d.getFullYear();
      return {year: label, value: parseFloat(val.toFixed(4))};
    }).filter(Boolean);
    if(result.length>0) cacheSet(ckey, result);
    return result;
  } catch (e) { console.error("[EcoScope] Yahoo fetch failed:", ckey, e); return []; }
};

const fetchData = async (sourceId, varDef, cc, y0, y1, apiKeys) => {
  const api = varDef.api || sourceId;
  switch (api) {
    case "worldbank": return fetchWorldBank(cc, varDef.wbCode || varDef.code, y0, y1);
    case "imf":       return fetchIMF(cc, varDef.code, y0, y1);
    case "fred":      return fetchFRED(varDef.code, y0, y1, apiKeys.fred);
    case "who":       return fetchWHO(cc, varDef.code, y0, y1);
    case "yahoo":     return fetchYahoo(varDef.code, y0, y1, apiKeys.yahooInterval || "1mo");
    default:
      if (["worldbank","bog","bis","unctad","wbpov","ilo","unesco","environment"].includes(sourceId))
        return fetchWorldBank(cc, varDef.wbCode || varDef.code, y0, y1);
      if (sourceId === "imf") return fetchIMF(cc, varDef.code, y0, y1);
      if (sourceId === "fred") return fetchFRED(varDef.code, y0, y1, apiKeys.fred);
      if (sourceId === "who")  return fetchWHO(cc, varDef.code, y0, y1);
      return [];
  }
};

// ══════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════

const fmtVal = (v, fmt) => {
  if (v == null || isNaN(v)) return "—";
  if (fmt === "currency") {
    if (Math.abs(v) >= 1e12) return `$${(v/1e12).toFixed(2)}T`;
    if (Math.abs(v) >= 1e9)  return `$${(v/1e9).toFixed(2)}B`;
    if (Math.abs(v) >= 1e6)  return `$${(v/1e6).toFixed(2)}M`;
    return `$${Number(v).toLocaleString()}`;
  }
  if (fmt === "pct") return `${Number(v).toFixed(2)}%`;
  if (fmt === "num") {
    if (Math.abs(v) >= 1e9) return `${(v/1e9).toFixed(2)}B`;
    if (Math.abs(v) >= 1e6) return `${(v/1e6).toFixed(2)}M`;
    if (Math.abs(v) >= 1e3) return `${(v/1e3).toFixed(1)}K`;
    return Number(v).toFixed(2);
  }
  return String(v);
};

const csvCell = (v) => { if (v==null || (typeof v==="number" && !isFinite(v))) return ""; const s=String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
const dlCSV = (rows, name) => {
  if (!rows.length) return;
  const h = Object.keys(rows[0]).map(csvCell).join(",");
  const b = rows.map(r => Object.values(r).map(csvCell).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([h + "\n" + b], {type:"text/csv"}));
  a.download = name; a.click();
};

const dlExcel = (rows, name) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const xmlRows = rows.map(r =>
    `<Row>${Object.values(r).map(v => `<Cell><Data ss:Type="String">${v}</Data></Cell>`).join("")}</Row>`
  ).join("");
  const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Interior ss:Color="#1F2937" ss:Pattern="Solid"/><Font ss:Color="#FFFFFF" ss:Bold="1"/></Style></Styles><Worksheet ss:Name="EcoScope Data"><Table><Row>${headers.map(h => `<Cell ss:StyleID="h"><Data ss:Type="String">${h}</Data></Cell>`).join("")}</Row>${xmlRows}</Table></Worksheet></Workbook>`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([xml], {type:"application/vnd.ms-excel"}));
  a.download = name; a.click();
};

const dlPDF = (data, varName, countryName, sourceName, startYear, endYear, fmt) => {
  if (!data.length) return;
  const rows = data.map((d,i) => {
    const prev = data[i-1];
    const delta = prev&&prev.value ? ((d.value-prev.value)/Math.abs(prev.value)*100) : null;
    return `<tr style="background:${i%2?"#f8faff":"#fff"}"><td>${d.year}</td><td style="text-align:right;font-weight:600">${fmtVal(d.value,fmt)}</td><td style="text-align:right;color:${delta==null?"#999":delta>=0?"#00a87a":"#e03050"}">${delta==null?"—":`${delta>=0?"+":""}${delta.toFixed(1)}%`}</td></tr>`
  }).join("");
  const html = `<html><head><title>${varName} — ${countryName}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'IBM Plex Sans',Arial,sans-serif;padding:40px;color:#101828;font-variant-numeric:tabular-nums}h1{font-size:20px;font-weight:600;margin-bottom:6px;color:#101828}h2{font-size:13px;font-weight:400;color:#666;margin-bottom:24px}.badge{display:inline-block;background:#1f4fd1;color:#fff;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:13px}th{padding:8px 14px;background:#fff;color:#101828;text-align:left;font-weight:600;border-top:2px solid #101828;border-bottom:1px solid #101828}td{padding:8px 14px;border-bottom:1px solid #eee}.footer{margin-top:24px;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:12px}@media print{body{padding:20px}}</style></head><body><div class="badge">EcoScope · ${sourceName}</div><h1>${varName}</h1><h2>${countryName} · ${startYear}–${endYear}</h2><table><thead><tr><th>Year</th><th style="text-align:right">Value</th><th style="text-align:right">YoY Change</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">Generated by EcoScope — Global Economic Intelligence Platform · ${new Date().toLocaleDateString()}</div></body></html>`;
  const win = window.open("","_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(()=>win.print(), 400);
};

// ══════════════════════════════════════════════
// ANALYTICAL UTILITIES
// ══════════════════════════════════════════════

// ── Data Transformations ────────────────────────────────────────────────────
const TRANSFORMS = [
  {id:"none",    label:"None (Raw)",           formula:"x"},
  {id:"log",     label:"Natural Log",          formula:"ln(x)"},
  {id:"log10",   label:"Log Base 10",          formula:"log₁₀(x)"},
  {id:"diff",    label:"First Difference",     formula:"xₜ - xₜ₋₁"},
  {id:"pct",     label:"% Change (YoY)",       formula:"(xₜ-xₜ₋₁)/|xₜ₋₁|×100"},
  {id:"ma3",     label:"3-Period Moving Avg",  formula:"(xₜ+xₜ₋₁+xₜ₋₂)/3"},
  {id:"ma5",     label:"5-Period Moving Avg",  formula:"Σxₜ₋ᵢ/5, i=0..4"},
  {id:"zscore",  label:"Z-Score Normalise",    formula:"(x-μ)/σ"},
  {id:"minmax",  label:"Min-Max Scale (0-100)",formula:"(x-min)/(max-min)×100"},
  {id:"cumsum",  label:"Cumulative Sum",        formula:"Σxᵢ, i=1..t"},
];

const applyTransform = (data, method) => {
  const d = data.filter(x=>x.value!=null);
  if(method==="none"||!method) return data;
  if(method==="log")   return data.map(r=>({...r,value:r.value>0?Math.log(r.value):null}));
  if(method==="log10") return data.map(r=>({...r,value:r.value>0?Math.log10(r.value):null}));
  if(method==="diff")  return data.map((r,i)=>({...r,value:i===0?null:r.value!=null&&data[i-1].value!=null?r.value-data[i-1].value:null}));
  if(method==="pct")   return data.map((r,i)=>({...r,value:i===0?null:r.value!=null&&data[i-1].value?((r.value-data[i-1].value)/Math.abs(data[i-1].value)*100):null}));
  if(method==="ma3")   return data.map((r,i)=>{if(i<2)return{...r,value:null};const v=data.slice(i-2,i+1).filter(x=>x.value!=null);return{...r,value:v.length===3?v.reduce((s,x)=>s+x.value,0)/3:null};});
  if(method==="ma5")   return data.map((r,i)=>{if(i<4)return{...r,value:null};const v=data.slice(i-4,i+1).filter(x=>x.value!=null);return{...r,value:v.length===5?v.reduce((s,x)=>s+x.value,0)/5:null};});
  if(method==="zscore"){const vals=d.map(x=>x.value);const mu=vals.reduce((a,b)=>a+b,0)/vals.length;const sigma=Math.sqrt(vals.reduce((s,v)=>s+(v-mu)**2,0)/vals.length);return data.map(r=>({...r,value:r.value!=null&&sigma?(r.value-mu)/sigma:null}));}
  if(method==="minmax"){const vals=d.map(x=>x.value);const mn=Math.min(...vals),mx=Math.max(...vals);return data.map(r=>({...r,value:r.value!=null&&mx!==mn?(r.value-mn)/(mx-mn)*100:mx===mn?50:null}));}
  if(method==="cumsum"){let s=0;return data.map(r=>({...r,value:r.value!=null?(s+=r.value):null}));}
  return data;
};

// ── Missing Data Imputation ──────────────────────────────────────────────────
const IMPUTE_METHODS = [
  {id:"none",     label:"None",                  formula:"No imputation"},
  {id:"linear",   label:"Linear Interpolation",  formula:"xᵢ = x₀ + (x₁-x₀)×t/T"},
  {id:"forward",  label:"Forward Fill (LOCF)",   formula:"xₜ = xₜ₋₁ if missing"},
  {id:"backward", label:"Backward Fill (NOCB)",  formula:"xₜ = xₜ₊₁ if missing"},
  {id:"mean",     label:"Mean Imputation",        formula:"xₜ = μ(x) if missing"},
  {id:"spline",   label:"Cubic Spline",           formula:"Piecewise cubic polynomial"},
];

const imputeData = (data, method) => {
  if(method==="none"||!method) return data;
  const result=data.map(d=>({...d}));
  if(method==="forward"){let last=null;for(let d of result){if(d.value!=null)last=d.value;else if(last!=null)d.value=last;}return result;}
  if(method==="backward"){let nxt=null;for(let i=result.length-1;i>=0;i--){if(result[i].value!=null)nxt=result[i].value;else if(nxt!=null)result[i].value=nxt;}return result;}
  if(method==="mean"){const vals=result.filter(d=>d.value!=null).map(d=>d.value);const mu=vals.reduce((a,b)=>a+b,0)/vals.length;result.forEach(d=>{if(d.value==null)d.value=mu;});return result;}
  if(method==="linear"||method==="spline"){
    for(let i=0;i<result.length;i++){
      if(result[i].value==null){
        const prevI=result.slice(0,i).map((d,j)=>({...d,j})).filter(d=>d.value!=null).slice(-1)[0];
        const nextI=result.slice(i+1).map((d,j)=>({...d,j:i+1+j})).filter(d=>d.value!=null)[0];
        if(prevI&&nextI){result[i].value=prevI.value+(nextI.value-prevI.value)*(i-prevI.j)/(nextI.j-prevI.j);}
      }
    }
    return result;
  }
  return result;
};

// ── OLS Linear Regression ────────────────────────────────────────────────────
const olsRegression = (xVals, yVals) => {
  const n=xVals.length;
  if(n<3) return null;
  const sx=xVals.reduce((a,b)=>a+b,0), sy=yVals.reduce((a,b)=>a+b,0);
  const sxy=xVals.reduce((s,x,i)=>s+x*yVals[i],0), sx2=xVals.reduce((s,x)=>s+x*x,0);
  const denom=n*sx2-sx*sx;
  if(!denom) return null;
  const b=(n*sxy-sx*sy)/denom, a=(sy-b*sx)/n;
  const yMean=sy/n;
  const ssTot=yVals.reduce((s,y)=>s+(y-yMean)**2,0);
  const ssRes=xVals.reduce((s,x,i)=>s+(yVals[i]-(a+b*x))**2,0);
  const r2=ssTot?1-ssRes/ssTot:0;
  const se=Math.sqrt(ssRes/(n-2)||0);
  return {a,b,r2,se,n};
};


const FREQ_OPTIONS=[
  {id:"annual",   label:"Annual",    note:"Default — all sources"},
  {id:"quarterly",label:"Quarterly", note:"FRED + interpolated WB"},
  {id:"monthly",  label:"Monthly",   note:"FRED only"},
];

// Interpolate annual data to quarterly/monthly
const interpolateFreq=(data, freq)=>{
  if(!freq||freq==="annual"||!data.length) return data;
  const sorted=[...data].sort((a,b)=>a.year-b.year);
  const result=[];
  const n=freq==="quarterly"?4:12;
  const labels=freq==="quarterly"?["Q1","Q2","Q3","Q4"]:["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  for(let i=0;i<sorted.length-1;i++){
    const a=sorted[i], b=sorted[i+1];
    if(a.value==null||b.value==null) continue;
    for(let q=0;q<n;q++){
      const t=q/n;
      result.push({year:`${a.year} ${labels[q]}`,value:+(a.value+(b.value-a.value)*t).toFixed(4)});
    }
  }
  if(sorted[sorted.length-1]?.value!=null){
    const last=sorted[sorted.length-1];
    for(let q=0;q<n;q++) result.push({year:`${last.year} ${labels[q]}`,value:last.value});
  }
  return result;
};



// ── Summary Statistics ───────────────────────────────────────────────────────
const summaryStats = (data) => {
  const vals = data.filter(d=>d.value!=null&&!isNaN(d.value)).map(d=>d.value).sort((a,b)=>a-b);
  const n = vals.length;
  if(n===0) return null;
  const sum = vals.reduce((s,v)=>s+v,0);
  const mean = sum/n;
  const variance = vals.reduce((s,v)=>s+(v-mean)**2,0)/n;
  const std = Math.sqrt(variance);
  const median = n%2 ? vals[(n-1)/2] : (vals[n/2-1]+vals[n/2])/2;
  const q1 = vals[Math.floor(n*0.25)];
  const q3 = vals[Math.floor(n*0.75)];
  const min = vals[0], max = vals[n-1];
  const range = max-min;
  const cv = mean!==0 ? (std/Math.abs(mean))*100 : 0; // coefficient of variation
  // Skewness (Fisher-Pearson)
  const skew = std>0 ? vals.reduce((s,v)=>s+((v-mean)/std)**3,0)/n : 0;
  // Kurtosis (excess)
  const kurt = std>0 ? vals.reduce((s,v)=>s+((v-mean)/std)**4,0)/n - 3 : 0;
  return {n,mean,median,std,variance,min,max,range,q1,q3,iqr:q3-q1,cv,skew,kurt,sum};
};

// Generate normal distribution curve points for overlay
const normalCurve = (mean, std, nPoints=60) => {
  if(!std||std<=0) return [];
  const pts=[];
  const lo=mean-4*std, hi=mean+4*std;
  for(let i=0;i<nPoints;i++){
    const x=lo+(hi-lo)*i/(nPoints-1);
    const y=(1/(std*Math.sqrt(2*Math.PI)))*Math.exp(-0.5*((x-mean)/std)**2);
    pts.push({x:parseFloat(x.toFixed(4)), density:parseFloat(y.toFixed(8))});
  }
  return pts;
};

// Skew-normal curve — reflects the actual skewness of the data (shifts left/right)
const skewNormalCurve = (mean, std, skew, nPoints=80) => {
  if(!std||std<=0) return [];
  // Convert sample skewness to skew-normal shape parameter alpha (bounded for stability)
  const s = Math.max(-0.95, Math.min(0.95, skew/2));
  const absS = Math.abs(s);
  const num = absS**(2/3);
  const delta = Math.sign(s) * Math.sqrt((Math.PI/2)*num / (num + ((4-Math.PI)/2)**(2/3)));
  const alpha = delta / Math.sqrt(Math.max(1e-6, 1 - delta*delta));
  // Adjust location & scale so the plotted curve keeps the data's mean & std
  const omega = std / Math.sqrt(Math.max(1e-6, 1 - 2*delta*delta/Math.PI));
  const xi = mean - omega*delta*Math.sqrt(2/Math.PI);
  const phi = (z)=> (1/Math.sqrt(2*Math.PI))*Math.exp(-0.5*z*z);
  const Phi = (z)=> 0.5*(1+erf(z/Math.SQRT2));
  const lo=mean-4*std, hi=mean+4*std;
  const pts=[];
  for(let i=0;i<nPoints;i++){
    const x=lo+(hi-lo)*i/(nPoints-1);
    const z=(x-xi)/omega;
    const y=(2/omega)*phi(z)*Phi(alpha*z);
    pts.push({x:parseFloat(x.toFixed(4)), density:parseFloat(Math.max(0,y).toFixed(8))});
  }
  return pts;
};

// Error function approximation (Abramowitz & Stegun 7.1.26) for skew-normal CDF
function erf(x){
  const sign = x<0?-1:1; x=Math.abs(x);
  const t=1/(1+0.3275911*x);
  const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);
  return sign*y;
}

// Histogram bins for actual data distribution
const histogram = (data, bins=12) => {
  const vals=data.filter(d=>d.value!=null&&!isNaN(d.value)).map(d=>d.value);
  if(!vals.length) return [];
  const min=Math.min(...vals), max=Math.max(...vals);
  const width=(max-min)/bins || 1;
  const counts=Array(bins).fill(0);
  vals.forEach(v=>{ let b=Math.floor((v-min)/width); if(b>=bins)b=bins-1; if(b<0)b=0; counts[b]++; });
  return counts.map((c,i)=>({bin:parseFloat((min+width*(i+0.5)).toFixed(2)), count:c, freq:c/vals.length}));
};


// ══════════════════════════════════════════════
// ECOSCOPE ANALYTICS ENGINE — owned, offline, no external API
// Generates automatic quantitative insights from the selected data.
// ══════════════════════════════════════════════

// Linear trend over a time series (returns slope per period, R², direction)
const trendAnalysis = (data) => {
  const pts = data.filter(d=>d.value!=null&&!isNaN(d.value));
  if(pts.length<3) return null;
  const xs = pts.map((_,i)=>i);
  const ys = pts.map(d=>d.value);
  const reg = olsRegression(xs, ys);
  if(!reg) return null;
  const first=ys[0], last=ys[ys.length-1];
  const totalChangePct = first!==0 ? ((last-first)/Math.abs(first))*100 : 0;
  const years = pts.length;
  const cagr = (first>0&&last>0&&years>1) ? (Math.pow(last/first, 1/(years-1))-1)*100 : null;
  return {
    slope: reg.b, r2: reg.r2,
    direction: reg.b>0?"rising":reg.b<0?"falling":"flat",
    strength: reg.r2>0.8?"strong":reg.r2>0.5?"moderate":reg.r2>0.2?"weak":"no clear",
    totalChangePct, cagr,
    firstYear: pts[0].year, lastYear: pts[pts.length-1].year,
    firstVal: first, lastVal: last,
  };
};

// Outlier detection via z-score (|z|>2.5) and IQR method
const outlierAnalysis = (data) => {
  const pts = data.filter(d=>d.value!=null&&!isNaN(d.value));
  const s = summaryStats(pts);
  if(!s||!s.std) return [];
  const out=[];
  pts.forEach(d=>{
    const z=(d.value-s.mean)/s.std;
    if(Math.abs(z)>2.5) out.push({year:d.year, value:d.value, z, type:z>0?"high":"low"});
  });
  return out;
};

// Year-over-year volatility (std of % changes)
const volatilityAnalysis = (data) => {
  const pts = data.filter(d=>d.value!=null&&!isNaN(d.value));
  if(pts.length<3) return null;
  const changes=[];
  for(let i=1;i<pts.length;i++){
    if(pts[i-1].value) changes.push((pts[i].value-pts[i-1].value)/Math.abs(pts[i-1].value)*100);
  }
  if(!changes.length) return null;
  const s=summaryStats(changes.map(v=>({value:v})));
  return {avgChange:s.mean, volatility:s.std, maxJump:Math.max(...changes), maxDrop:Math.min(...changes)};
};

// Structural break detection (largest change in trend slope, simple CUSUM-like)
const breakAnalysis = (data) => {
  const pts=data.filter(d=>d.value!=null&&!isNaN(d.value));
  if(pts.length<8) return null;
  let bestYear=null, bestDiff=0;
  for(let k=3;k<pts.length-3;k++){
    const left=pts.slice(0,k), right=pts.slice(k);
    const lr=olsRegression(left.map((_,i)=>i), left.map(d=>d.value));
    const rr=olsRegression(right.map((_,i)=>i), right.map(d=>d.value));
    if(lr&&rr){
      const diff=Math.abs(rr.b-lr.b);
      if(diff>bestDiff){bestDiff=diff;bestYear=pts[k].year;}
    }
  }
  return bestYear?{year:bestYear,slopeChange:bestDiff}:null;
};

// Correlation between two aligned series
const correlationAnalysis = (dataA, dataB) => {
  const mapB={}; dataB.forEach(d=>{if(d.value!=null)mapB[d.year]=d.value;});
  const pairs=dataA.filter(d=>d.value!=null&&mapB[d.year]!=null).map(d=>[d.value,mapB[d.year]]);
  if(pairs.length<3) return null;
  const xs=pairs.map(p=>p[0]), ys=pairs.map(p=>p[1]);
  const r=_pearson(xs,ys);
  return {r, n:pairs.length,
    strength:Math.abs(r)>0.7?"strong":Math.abs(r)>0.4?"moderate":Math.abs(r)>0.2?"weak":"negligible",
    direction:r>0?"positive":"negative"};
};

// MAIN: generate a full written analysis for a set of variables
const generateEcoScopeAnalysis = (varSeriesList, countryName) => {
  // varSeriesList: [{name, fmt, data:[{year,value}]}]
  const sections=[];
  varSeriesList.forEach(v=>{
    const s=summaryStats(v.data);
    if(!s){ sections.push({name:v.name, lines:["Insufficient data to analyze."]}); return; }
    const trend=trendAnalysis(v.data);
    const outliers=outlierAnalysis(v.data);
    const vol=volatilityAnalysis(v.data);
    const brk=breakAnalysis(v.data);
    const lines=[];
    // Trend
    if(trend){
      const cagrTxt = trend.cagr!=null ? ` (CAGR ${trend.cagr>=0?"+":""}${trend.cagr.toFixed(2)}%/yr)` : "";
      lines.push(`${trend.strength.charAt(0).toUpperCase()+trend.strength.slice(1)} ${trend.direction} trend from ${trend.firstYear} to ${trend.lastYear}: ${fmtVal(trend.firstVal,v.fmt)} → ${fmtVal(trend.lastVal,v.fmt)}, a ${trend.totalChangePct>=0?"+":""}${trend.totalChangePct.toFixed(1)}% total change${cagrTxt}. (R²=${trend.r2.toFixed(2)})`);
    }
    // Distribution shape
    const shape = Math.abs(s.skew)<0.5?"approximately symmetric":s.skew>0?"right-skewed (mean above median)":"left-skewed (mean below median)";
    lines.push(`Distribution is ${shape}; mean ${fmtVal(s.mean,v.fmt)}, median ${fmtVal(s.median,v.fmt)}, σ ${fmtVal(s.std,v.fmt)} (CV ${s.cv.toFixed(1)}%).`);
    // Volatility
    if(vol){
      lines.push(`Average year-on-year change ${vol.avgChange>=0?"+":""}${vol.avgChange.toFixed(1)}% with ${vol.volatility.toFixed(1)}% volatility; sharpest rise +${vol.maxJump.toFixed(1)}%, steepest fall ${vol.maxDrop.toFixed(1)}%.`);
    }
    // Outliers
    if(outliers.length){
      lines.push(`${outliers.length} outlier${outliers.length>1?"s":""} detected: ${outliers.slice(0,4).map(o=>`${o.year} (${o.type}, z=${o.z.toFixed(1)})`).join(", ")}${outliers.length>4?"…":""}.`);
    }
    // Structural break
    if(brk){
      lines.push(`Possible structural break around ${brk.year} — the trend slope shifts notably there.`);
    }
    sections.push({name:v.name, lines});
  });
  // Cross-variable correlations
  const correlations=[];
  for(let i=0;i<varSeriesList.length;i++){
    for(let j=i+1;j<varSeriesList.length;j++){
      const c=correlationAnalysis(varSeriesList[i].data, varSeriesList[j].data);
      if(c&&Math.abs(c.r)>0.2){
        correlations.push(`${varSeriesList[i].name.substring(0,22)} & ${varSeriesList[j].name.substring(0,22)}: ${c.strength} ${c.direction} correlation (r=${c.r.toFixed(2)}, n=${c.n}).`);
      }
    }
  }
  return {sections, correlations, country:countryName};
};

// ── DAG (Directed Acyclic Graph) Causal Analysis ─────────────────────────────
// Detect cycles in a DAG using DFS
const dagHasCycle = (nodes, edges) => {
  const adj = {}; nodes.forEach(n=>adj[n]=[]);
  edges.forEach(e=>{ if(adj[e.from]) adj[e.from].push(e.to); });
  const WHITE=0, GRAY=1, BLACK=2;
  const color = {}; nodes.forEach(n=>color[n]=WHITE);
  const dfs = (u)=>{
    color[u]=GRAY;
    for(const v of (adj[u]||[])){
      if(color[v]===GRAY) return true;
      if(color[v]===WHITE && dfs(v)) return true;
    }
    color[u]=BLACK;
    return false;
  };
  for(const n of nodes){ if(color[n]===WHITE && dfs(n)) return true; }
  return false;
};

// Find all directed paths from src to dst
const dagPaths = (nodes, edges, src, dst) => {
  const adj = {}; nodes.forEach(n=>adj[n]=[]);
  edges.forEach(e=>{ if(adj[e.from]) adj[e.from].push(e.to); });
  const paths=[];
  const walk=(u, path)=>{
    if(u===dst){ paths.push([...path,u]); return; }
    for(const v of (adj[u]||[])){
      if(!path.includes(v)) walk(v,[...path,u]);
    }
  };
  walk(src,[]);
  return paths;
};

// Pearson correlation of two equal-length arrays
const _pearson = (a, b) => { const n=Math.min(a.length,b.length); if(n<3) return 0; let ma=0,mb=0; for(let i=0;i<n;i++){ ma+=a[i]/n; mb+=b[i]/n; } let num=0,da=0,db=0; for(let i=0;i<n;i++){ const x=a[i]-ma,y=b[i]-mb; num+=x*y; da+=x*x; db+=y*y; } const den=Math.sqrt(da*db); return den? num/den : 0; };

// Backdoor analysis via d-separation (meDagAnalysis): minimal valid adjustment sets, mediators, bad controls, front-door.
// Undirected edges (direction not identified) are left out of the analysis.
const dagBackdoorSet = (nodes, edges, treatment, outcome, unobserved=new Set()) => {
  const dir=edges.filter(e=>!e.undirected); const a=meDagAnalysis(nodes, dir, treatment, outcome, unobserved);
  const und=edges.filter(e=>e.undirected).length;
  if (und && !a.hasDirectPath) return { ...a, sets:[], chosen:null, confounders:[], mediators:a.mediators||[], colliders:a.colliders||[], undirected:und, note:"There is no directed path from X to Y among the oriented links. Orient the undirected links (using theory or timing) before reading off an adjustment set." };
  return { ...a, confounders: a.chosen||[], mediators: a.mediators||[], colliders: a.colliders||[], undirected: und };
};

// ── Composite Index Builder ──────────────────────────────────────────────────
const NORM_METHODS = [
  {id:"minmax", label:"Min-Max (0-100)",    formula:"(x-min)/(max-min)×100"},
  {id:"zscore", label:"Z-Score",            formula:"(x-μ)/σ×10+50"},
];
const AGG_METHODS = [
  {id:"weighted_sum",  label:"Weighted Sum",          formula:"Σ(wᵢ×xᵢ)"},
  {id:"geometric",     label:"Geometric Mean",        formula:"(Π xᵢʷⁱ)^(1/Σwᵢ)"},
  {id:"equal_weight",  label:"Equal Weight Average",  formula:"(1/n)Σxᵢ"},
];

const buildComposite = (seriesList, weights, normMethod, aggMethod) => {
  if(!seriesList.length) return [];
  // Normalize each series
  const normed = seriesList.map(({data}) => {
    const vals=data.filter(d=>d.value!=null).map(d=>d.value);
    if(!vals.length) return data;
    const mn=Math.min(...vals),mx=Math.max(...vals),mu=vals.reduce((a,b)=>a+b,0)/vals.length;
    const sigma=Math.sqrt(vals.reduce((s,v)=>s+(v-mu)**2,0)/vals.length)||1;
    return data.map(d=>({year:d.year, value:d.value!=null?(normMethod==="minmax"?mx!==mn?(d.value-mn)/(mx-mn)*100:50:(d.value-mu)/sigma*10+50):null}));
  });
  // Get union of years
  const allYears=[...new Set(seriesList.flatMap(s=>s.data.map(d=>d.year)))].sort((a,b)=>a-b);
  return allYears.map(year=>{
    const pts=normed.map((s,i)=>({v:s.find(d=>d.year===year)?.value, w:weights[i]||1/normed.length})).filter(p=>p.v!=null);
    if(!pts.length) return {year,value:null};
    const tw=pts.reduce((s,p)=>s+p.w,0);
    let val;
    if(aggMethod==="geometric") val=Math.pow(pts.reduce((p,pt)=>p*Math.pow(Math.max(pt.v,0.001),pt.w),1),1/tw);
    else val=pts.reduce((s,p)=>s+p.v*p.w,0)/tw;
    return {year, value:parseFloat(val.toFixed(4))};
  });
};

// ── Chart Export ─────────────────────────────────────────────────────────────

// ── Download DAG graph as PNG or SVG ─────────────────────────────────────────
const downloadDAG = (format) => {
  const svg = document.getElementById("dag-svg");
  if(!svg){ alert("No DAG to export — enable 'Show DAG & Analysis' first."); return; }
  const W=600, H=300, PAD=30;
  const inner=(new XMLSerializer().serializeToString(svg)).replace(/<svg[^>]*>/,'').replace('</svg>','');
  const doc=`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H+PAD}" viewBox="0 0 ${W} ${H+PAD}">
  <rect width="${W}" height="${H+PAD}" fill="${C.bg}"/>
  <text x="14" y="20" fill="${C.text}" font-size="12" font-weight="bold" font-family="IBM Plex Sans,Arial">EcoScope — Causal DAG</text>
  <g transform="translate(0,${PAD})">${inner}</g>
</svg>`;
  if(format==="svg"){
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([doc],{type:"image/svg+xml;charset=utf-8"}));
    a.download="ecoscope_dag.svg"; a.click(); return;
  }
  // PNG at 2x
  const img=new Image();
  const blob=new Blob([doc],{type:"image/svg+xml;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  img.onload=()=>{
    const c=document.createElement("canvas");
    c.width=W*2; c.height=(H+PAD)*2;
    const ctx=c.getContext("2d");
    ctx.scale(2,2);
    ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H+PAD);
    ctx.drawImage(img,0,0,W,H+PAD);
    URL.revokeObjectURL(url);
    const a=document.createElement("a");
    a.href=c.toDataURL("image/png",1.0);
    a.download="ecoscope_dag.png"; a.click();
  };
  img.onerror=()=>{URL.revokeObjectURL(url);alert("PNG export failed — try SVG.");};
  img.src=url;
};

const exportChart = async (format, title) => {
  // Load html2canvas from CDN for reliable pixel-perfect capture
  const loadHtml2Canvas = () => new Promise((res,rej)=>{
    if(window.html2canvas) return res(window.html2canvas);
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload=()=>res(window.html2canvas);
    s.onerror=()=>rej(new Error('Failed to load html2canvas'));
    document.head.appendChild(s);
  });

  const chartDiv = document.getElementById('ecoscope-chart-area');
  if(!chartDiv){ alert('No chart found — load data first'); return; }

  // SVG export: serialize the Recharts SVG directly
  if(format==='svg'){
    const svg=chartDiv.querySelector('svg');
    if(!svg){ alert('No SVG chart found'); return; }
    const W=svg.clientWidth||700, H=svg.clientHeight||350;
    const PAD=44, FOOT=20, TH=H+PAD+FOOT;
    const inner=(new XMLSerializer().serializeToString(svg))
      .replace(/<svg[^>]*>/,'').replace('</svg>','');
    const doc=`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${TH}">
  <style>text,tspan{font-family:Arial,sans-serif!important}</style>
  <rect width="${W}" height="${TH}" fill="${C.bg}"/>
  <rect width="${W}" height="${PAD}" fill="${C.surface}"/>
  <line x1="0" y1="${PAD}" x2="${W}" y2="${PAD}" stroke="${C.border}" stroke-width="1"/>
  <text x="14" y="20" fill="${C.gold}" font-size="13" font-weight="bold" font-family="IBM Plex Sans,Arial,sans-serif">${(title||'EcoScope').replace(/&/g,'&amp;').replace(/</g,'&lt;').substring(0,72)}</text>
  <text x="14" y="36" fill="${C.dim}" font-size="9" font-family="IBM Plex Sans,Arial,sans-serif">EcoScope — Global Economic Intelligence · ${new Date().toLocaleDateString()}</text>
  <g transform="translate(0,${PAD})">${inner}</g>
  <text x="14" y="${TH-6}" fill="${C.dim}" font-size="8" font-family="IBM Plex Sans,Arial,sans-serif">Source: World Bank · IMF · FRED · WHO · ILO · UNESCO · FAO · UN SDG · UNDP · Heritage · WIPO · IEP</text>
</svg>`;
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([doc],{type:'image/svg+xml;charset=utf-8'}));
    a.download=(title||'ecoscope').replace(/[^a-zA-Z0-9_-]/g,'_').substring(0,50)+'.svg';
    a.click(); return;
  }

  // PNG: use html2canvas for pixel-perfect capture
  try {
    const h2c=await loadHtml2Canvas();
    const SCALE=2;
    const PAD=56, FOOT=26;
    const cw=chartDiv.clientWidth||700;
    const ch=chartDiv.clientHeight||350;

    // Capture the chart div
    const chartCanvas=await h2c(chartDiv,{
      backgroundColor:C.bg,scale:SCALE,
      useCORS:true,allowTaint:true,
      logging:false,
    });

    // Compose final canvas with title bar + chart + footer
    const final=document.createElement('canvas');
    final.width=(cw)*SCALE;
    final.height=(ch+PAD+FOOT)*SCALE;
    const ctx=final.getContext('2d');
    ctx.scale(SCALE,SCALE);

    // Background
    ctx.fillStyle=C.bg; ctx.fillRect(0,0,cw,ch+PAD+FOOT);

    // Title bar
    ctx.fillStyle=C.surface; ctx.fillRect(0,0,cw,PAD-4);
    ctx.fillStyle=C.border; ctx.fillRect(0,PAD-4,cw,1);

    // Title text
    ctx.fillStyle=C.gold; ctx.font='600 14px "IBM Plex Sans", Arial, sans-serif';
    ctx.fillText((title||'EcoScope Chart').substring(0,70), 14, 22);

    // Subtitle
    ctx.fillStyle=C.dim; ctx.font='11px "IBM Plex Sans", Arial, sans-serif';
    ctx.fillText('EcoScope — Global Economic Intelligence Platform · '+new Date().toLocaleDateString(), 14, 40);

    // Draw chart (unscaled since h2c already scaled)
    ctx.resetTransform();
    ctx.drawImage(chartCanvas, 0, PAD*SCALE);
    ctx.scale(SCALE,SCALE);

    // Footer
    ctx.fillStyle=C.dim; ctx.font='10px "IBM Plex Sans", Arial, sans-serif';
    ctx.fillText('Source: World Bank · IMF · FRED · WHO · ILO · UNESCO · FAO · UN SDG · UNDP · Heritage · WIPO · IEP', 14, ch+PAD+FOOT-6);

    // Download
    const a=document.createElement('a');
    a.href=final.toDataURL('image/png',1.0);
    a.download=(title||'ecoscope').replace(/[^a-zA-Z0-9_-]/g,'_').substring(0,50)+'.png';
    a.click();

  } catch(e){
    console.error('Export error:',e);
    // Fallback: print dialog
    const w=window.open('','_blank','width=900,height=600');
    if(w){
      const svg=chartDiv.querySelector('svg');
      const svgHtml=svg?svg.outerHTML:'<p>No chart</p>';
      w.document.write(`<!DOCTYPE html><html><head><title>${title||'EcoScope Chart'}</title>
        <style>
          body{margin:0;background:#fff;color:#101828;font-family:'IBM Plex Sans',Arial,sans-serif;padding:24px}
          h3{color:#101828;font-weight:600;margin:0 0 8px}
          p{color:#5d6879;font-size:10px;margin:8px 0 0}
          
        </style></head><body>
        <h3>${(title||'EcoScope Chart').replace(/</g,'&lt;')}</h3>
        ${svgHtml}
        <p>Source: World Bank · IMF · FRED · WHO · ILO · UNESCO · FAO · UN SDG | EcoScope ${new Date().getFullYear()}</p>
        <script>setTimeout(()=>window.print(),600)</script>
      </body></html>`);
      w.document.close();
    }
  }
};



// ── CSV Import & Frequency Auto-Detection ────────────────────────────────────
const parseCSV = (text) => {
  const lines = text.trim().split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2) return {error:"CSV needs a header row and at least one data row."};
  const delim = lines[0].includes("\t")?"\t":(lines[0].includes(";")?";":",");
  const headers = lines[0].split(delim).map(h=>h.trim().replace(/^["']|["']$/g,""));
  const rows = lines.slice(1).map(l=>l.split(delim).map(c=>c.trim().replace(/^["']|["']$/g,"")));
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

// Convert imported CSV into EcoScope series format
const csvToSeries = (headers, rows, timeCol) => {
  const series={}; // {columnName: [{year, value}]}
  headers.forEach((h,c)=>{
    if(c===timeCol) return;
    const data=[];
    rows.forEach(r=>{
      const t=r[timeCol];
      const v=parseFloat(String(r[c]).replace(/[$,%\s]/g,""));
      if(t&&!isNaN(v)) data.push({year:t, value:v});
    });
    if(data.length) series[h]=data;
  });
  return series;
};


// ══════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════

const inp = {
  get background(){return C.inputBg}, get border(){return `1px solid ${C.border}`}, borderRadius:6,
  padding:"9px 12px", get color(){return C.text}, fontSize:13, get fontFamily(){return C.font},
  outline:"none", boxSizing:"border-box", width:"100%", transition:"border-color .15s ease, box-shadow .15s ease"};
const sel = Object.defineProperties({cursor:"pointer"}, Object.getOwnPropertyDescriptors(inp));
const pill = (active, col=C.gold) => ({padding:"5px 11px",borderRadius:4,border:"1px solid",borderColor:active?col:C.border,
  background:active?`${col}1f`:"transparent",color:active?col:C.mid,fontSize:11,fontWeight:active?600:500,cursor:"pointer",
  fontFamily:C.font,transition:"background-color .15s, border-color .15s, color .15s",whiteSpace:"nowrap"});
const btn = (col=C.gold) => ({background:col,color:C.onGold,border:`1px solid ${col}`,borderRadius:6,padding:"9px 18px",
  fontSize:13,fontWeight:600,fontFamily:C.font,cursor:"pointer",letterSpacing:"0.01em",boxShadow:"none"});
const card = {
  get background(){return C.card}, get border(){return `1px solid ${C.border}`}, borderRadius:6, padding:"16px 20px",
  get boxShadow(){return C.shadow}, position:"relative"};

// ══════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════

function Login({onLogin}){
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
      if(!email.trim()){setErr("Email required");return;}
      setLoading(true);await new Promise(r=>setTimeout(r,800));setLoading(false);
      setOk("Reset link sent (demo). Check your inbox.");return;
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

        <form onSubmit={go}>
          {mode==="forgot"?(
            <><div style={{color:C.mid,fontSize:11,fontFamily:C.mono,marginBottom:16,lineHeight:1.6}}>Enter your email to receive a reset link.</div>
            <div style={{marginBottom:16}}><div style={{color:C.mid,fontSize:10,fontFamily:C.mono,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:7}}>Email Address</div><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={{...inp,border:`1px solid ${email?C.gold:C.border}`,fontSize:13,padding:"12px 14px"}}/></div></>
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
          <span style={{color:pl.color,fontSize:11,fontFamily:C.mono,fontWeight:700,letterSpacing:"0.12em"}}>{pl.badge} PLAN REQUIRED</span>
        </div>
        <h2 style={{color:C.text,fontSize:18,fontWeight:700,margin:"0 0 10px",lineHeight:1.3}}>{feature}</h2>
        <p style={{color:C.mid,fontSize:12,fontFamily:C.mono,marginBottom:24,lineHeight:1.7}}>
          This feature requires the <strong style={{color:pl.color}}>{pl.name} plan</strong> ({pl.priceLabel}).<br/>
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
function ExportMenu({data,currentVar,cc,source,startYear,endYear,plan,onUpgradeNeeded}){
  const [open,setOpen]=useState(false);
  const canXls=plan.exports.includes("excel");
  const canPdf=plan.exports.includes("pdf");
  const fmt=currentVar.fmt;
  const filename=`${cc.name}_${currentVar.name.replace(/[^a-z0-9]/gi,"_")}_${startYear}_${endYear}`;

  const doExport=(type)=>{
    setOpen(false);
    if(type==="csv"){
      dlCSV(data.map(d=>({country:cc.name, iso2:cc.code, year:d.year, [currentVar.name]:d.value})),filename+".csv");
    } else if(type==="excel"){
      if(!canXls){onUpgradeNeeded("Excel Export");return;}
      const headers=["Year","Value","YoY Change"];
      const rows=data.map((d,i)=>{
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

function Settings({ user, settings, onSave, onClose, initialTab = "account", onRequestUpgrade, onOpenSupport }) {
  const isMobile = useIsMobile();
  const [s, setS] = useState({ ...settings });
  const [tab, setTab] = useState(initialTab);
  const isAdmin = user?.role === "admin";
  const plan = PLANS[user?.plan || "free"] || PLANS.free;
  const dirty = JSON.stringify(s) !== JSON.stringify(settings);
  useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const tabs = [
    { id: "account", icon: "user", label: "Account" },
    { id: "security", icon: "lock", label: "Password & security" },
    { id: "data", icon: "chart", label: "Data defaults" },
    { id: "sources", icon: "globe", label: "Data sources" },
    ...(isAdmin ? [{ id: "keys", icon: "key", label: "API keys" }] : []),
    { id: "theme", icon: "display", label: "Appearance" },
    { id: "plan", icon: "card", label: "Subscription" },
    { id: "support", icon: "message", label: "Support" },
    { id: "help", icon: "help", label: "Help & about" },
  ];
  const allSources = [...MACRO_SOURCES, ...MICRO_SOURCES].filter((x, i, a) => a.findIndex(y => y.id === x.id) === i);
  const proLocked = (sid) => PRO_SOURCES.includes(sid) && !plan.aiInsights;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="settings-title" style={{ position: "fixed", inset: 0, background: C.overlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: isMobile ? 0 : 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: isMobile ? 0 : 10, width: "100%", maxWidth: 860, height: isMobile ? "100%" : "min(88vh, 720px)", display: "flex", flexDirection: "column", fontFamily: C.font, boxShadow: C.shadow, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: C.gold, color: C.onGold, display: "flex", alignItems: "center", justifyContent: "center" }}><Ico n="settings" s={17} /></div>
            <div><h2 id="settings-title" style={{ margin: 0, fontSize: 16, fontWeight: 600, color: C.text }}>Settings</h2><div style={{ fontSize: 11, color: C.mid }}>Account, data and appearance</div></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close settings" style={{ background: "none", border: `1px solid ${C.border}`, color: C.mid, cursor: "pointer", width: 32, height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", flex: 1, minHeight: 0 }}>
          {/* Navigation */}
          <nav aria-label="Settings sections" style={{ width: isMobile ? "100%" : 210, background: C.card, borderRight: isMobile ? "none" : `1px solid ${C.border}`, borderBottom: isMobile ? `1px solid ${C.border}` : "none", padding: isMobile ? "8px" : "12px 8px", display: "flex", flexDirection: isMobile ? "row" : "column", gap: 2, flexShrink: 0, overflowX: isMobile ? "auto" : "visible" }}>
            {!isMobile && <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px 14px", marginBottom: 6, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: user.avatarColor || C.gold, color: "#0b0e14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{user.initials || "U"}</div>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.displayName || user.username}</div>
                <span style={{ display: "inline-block", marginTop: 2, background: plan.color, color: C.onGold, borderRadius: 4, padding: "0 6px", fontSize: 10, fontWeight: 700 }}>{plan.badge}</span></div>
            </div>}
            {tabs.map(t => { const on = tab === t.id; return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={on ? "page" : undefined}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 6, border: "none", background: on ? `${C.gold}18` : "transparent", cursor: "pointer", textAlign: "left", whiteSpace: "nowrap", color: on ? C.gold : C.mid, fontSize: 13, fontWeight: on ? 600 : 500, flexShrink: 0 }}>
                <Ico n={t.icon} s={15} />{t.label}
              </button>); })}
          </nav>
          {/* Content */}
          <div id="scroll-settings" style={{ flex: 1, overflowY: "auto", padding: isMobile ? "16px" : "20px 24px", minWidth: 0 }}>
            {tab === "account" && <>
              <StSec title="Profile">
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, flexWrap: "wrap" }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: user.avatarColor || C.gold, color: "#0b0e14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, flexShrink: 0 }}>{user.initials || "U"}</div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{s.displayName || user.username}</div>
                    <div style={{ color: C.mid, fontSize: 12 }}>{user.email || "No email on file"}</div>
                    <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>Username: {user.username}{user.role ? ` · Role: ${user.role}` : ""}</div>
                  </div>
                  <button type="button" onClick={() => setTab("plan")} style={{ ...pill(false), display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <span style={{ background: plan.color, color: C.onGold, borderRadius: 4, padding: "0 6px", fontSize: 10, fontWeight: 700 }}>{plan.badge}</span>{plan.name} plan</button>
                </div>
              </StSec>
              <StSec title="Account details" sub="Shown in the app and on support tickets.">
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0 16px" }}>
                  <StField label="Display name" htmlFor="st-name"><input id="st-name" value={s.displayName ?? user.username} onChange={e => setS(x => ({ ...x, displayName: e.target.value }))} style={{ ...inp, fontSize: 13 }} placeholder="Your display name" autoComplete="name" /></StField>
                  <StField label="Contact email" htmlFor="st-email" hint="for replies"><input id="st-email" value={s.emailPref ?? user.email ?? ""} onChange={e => setS(x => ({ ...x, emailPref: e.target.value }))} type="email" style={{ ...inp, fontSize: 13 }} placeholder="you@example.com" autoComplete="email" /></StField>
                </div>
              </StSec>
              <StSec title="Shortcuts">
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 10 }}>
                  {[["lock", "Change password", "security"], ["chart", "Data defaults", "data"], ["message", "Contact support", "support"]].map(([ic, l, t]) =>
                    <button key={t} type="button" onClick={() => setTab(t)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, cursor: "pointer", textAlign: "left" }}><Ico n={ic} s={16} />{l}</button>)}
                </div>
              </StSec>
            </>}
            {tab === "security" && <>
              <StSec title="Change password" sub="You will need your current password.">
                <ChangePassword user={user} />
              </StSec>
              <StSec title="Session">
                <div style={{ fontSize: 12, color: C.mid, lineHeight: 1.6 }}>You are signed in as <b style={{ color: C.text }}>{user.username}</b> on this browser. Signing out clears the saved session on this device.</div>
              </StSec>
            </>}
            {tab === "data" && <>
              <StSec title="Defaults for new sessions">
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0 16px" }}>
                  <StField label="Default country" htmlFor="st-country"><select id="st-country" value={s.defaultCountry || "GH"} onChange={e => setS(x => ({ ...x, defaultCountry: e.target.value }))} style={{ ...sel, fontSize: 13 }}>{COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name} ({c.region})</option>)}</select></StField>
                  <StField label="Default source" htmlFor="st-src"><select id="st-src" value={s.defaultSource || "worldbank"} onChange={e => setS(x => ({ ...x, defaultSource: e.target.value }))} style={{ ...sel, fontSize: 13 }}>{allSources.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></StField>
                  <StField label="Start year" htmlFor="st-y0"><select id="st-y0" value={s.startYear || 2000} onChange={e => setS(x => ({ ...x, startYear: +e.target.value }))} style={{ ...sel, fontSize: 13 }}>{YEARS.map(y => <option key={y} value={y}>{y}</option>)}</select></StField>
                  <StField label="End year" htmlFor="st-y1"><select id="st-y1" value={s.endYear || 2023} onChange={e => setS(x => ({ ...x, endYear: +e.target.value }))} style={{ ...sel, fontSize: 13 }}>{YEARS.map(y => <option key={y} value={y}>{y}</option>)}</select></StField>
                </div>
                <StField label="Default data level">
                  <div role="group" aria-label="Default data level" style={{ display: "flex", gap: 8 }}>
                    {[["macro", "Macro", "chart"], ["micro", "Micro", "flask"]].map(([l, t, ic]) => <button key={l} type="button" aria-pressed={(s.defaultLevel || "macro") === l} onClick={() => setS(x => ({ ...x, defaultLevel: l }))} style={{ ...pill((s.defaultLevel || "macro") === l), flex: 1, padding: "8px", display: "inline-flex", gap: 6, alignItems: "center", justifyContent: "center", fontSize: 12 }}><Ico n={ic} />{t}</button>)}
                  </div>
                </StField>
              </StSec>
            </>}
            {tab === "sources" && <>
              <StSec title="Data sources" sub={`${allSources.length} sources. Most are served through the World Bank API.`}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>{["Source", "Variables", "Access", "Coverage"].map((h, i) => <th key={h} scope="col" style={{ ...thS, textAlign: i === 1 ? "right" : "left" }}>{h}</th>)}</tr></thead>
                    <tbody>{allSources.map(x => { const locked = proLocked(x.id); return (
                      <tr key={x.id}>
                        <td style={{ ...tdS, whiteSpace: "normal" }}><span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: x.color, marginRight: 8 }} /><a href={x.url} target="_blank" rel="noreferrer" style={{ color: C.text }}>{x.name}</a></td>
                        <td style={tdN}>{(x.vars || []).length}</td>
                        <td style={tdS}>{locked ? <span style={{ color: C.orange }}><Ico n="lock" /> Pro</span> : x.keyRequired ? <span style={{ color: C.mid }}><Ico n="key" /> API key</span> : <span style={{ color: C.teal }}>✓ Open</span>}</td>
                        <td style={{ ...tdS, color: C.mid }}>{x.countryFixed ? (x.id === "fred" ? "United States" : x.region) : (x.region || "Global")}</td>
                      </tr>); })}</tbody>
                  </table>
                </div>
                {!plan.aiInsights && <div style={{ marginTop: 12 }}><StBanner tone="warn">Sources marked Pro need a Pro or Enterprise plan. <button type="button" onClick={() => setTab("plan")} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", padding: 0, fontSize: 12, textDecoration: "underline" }}>See plans</button></StBanner></div>}
              </StSec>
            </>}
            {tab === "keys" && isAdmin && <>
              <StBanner>Keys entered here are stored with your account settings and used from this browser.</StBanner>
              <StSec title="Anthropic API" right={<a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Get a key ↗</a>}>
                <StField label="API key" htmlFor="k-ant"><PasswordInput id="k-ant" value={s.anthropicKey || ""} onChange={v => setS(x => ({ ...x, anthropicKey: v }))} placeholder="sk-ant-api03-…" autoComplete="off" /></StField>
                <div style={{ fontSize: 12, color: s.anthropicKey ? C.teal : C.mid }}>{s.anthropicKey ? "✓ AI insights enabled" : "Needed for the optional AI narrative."}</div>
              </StSec>
              <StSec title="FRED (Federal Reserve)" right={<a href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Get a free key ↗</a>}>
                <StField label="API key" htmlFor="k-fred"><PasswordInput id="k-fred" value={s.fredKey || ""} onChange={v => setS(x => ({ ...x, fredKey: v }))} placeholder="Your FRED API key" autoComplete="off" /></StField>
                <div style={{ fontSize: 12, color: s.fredKey ? C.teal : C.mid }}>{s.fredKey ? "✓ FRED data enabled" : "Needed for the FRED source."}</div>
              </StSec>
            </>}
            {tab === "theme" && <>
              <StSec title="Theme">
                <div role="radiogroup" aria-label="Theme" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3,1fr)", gap: 10 }}>
                  {Object.entries(THEMES).map(([key, th]) => { const on = (s.theme || "dark") === key; return (
                    <button key={key} type="button" role="radio" aria-checked={on} onClick={() => setS(x => ({ ...x, theme: key }))} style={{ padding: "12px 14px", borderRadius: 8, border: `2px solid ${on ? C.gold : C.border}`, background: th.bg, cursor: "pointer", textAlign: "left" }}>
                      <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>{[th.surface, th.gold, th.teal, th.red].map((col, i) => <span key={i} style={{ width: 16, height: 16, borderRadius: 4, background: col, border: `1px solid ${th.borderHi}` }} />)}</div>
                      <div style={{ color: th.text, fontSize: 13, fontWeight: 600 }}>{th.label}</div>
                      <div style={{ color: th.mid, fontSize: 11 }}>{th.scheme === "dark" ? "Dark" : "Light"}{on ? " · selected" : ""}</div>
                    </button>); })}
                </div>
                <div style={{ fontSize: 11, color: C.dim, marginTop: 8 }}>The theme applies when you save.</div>
              </StSec>
              <StSec title="Charts">
                <StField label="Default chart type"><div role="group" aria-label="Default chart type" style={{ display: "flex", gap: 8 }}>{[["area", "Area"], ["line", "Line"], ["bar", "Bar"]].map(([t, l]) => <button key={t} type="button" aria-pressed={s.chartType === t} onClick={() => setS(x => ({ ...x, chartType: t }))} style={{ ...pill(s.chartType === t), flex: 1, padding: "8px", fontSize: 12 }}>{l}</button>)}</div></StField>
                <StField label="Default view"><div role="group" aria-label="Default view" style={{ display: "flex", gap: 8 }}>{[["chart", "Chart"], ["table", "Table"]].map(([v, l]) => <button key={v} type="button" aria-pressed={s.defaultView === v} onClick={() => setS(x => ({ ...x, defaultView: v }))} style={{ ...pill(s.defaultView === v), flex: 1, padding: "8px", fontSize: 12 }}>{l}</button>)}</div></StField>
              </StSec>
            </>}
            {tab === "plan" && <>
              <StSec title="Current plan">
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", border: `1px solid ${plan.color}66`, background: `${plan.color}10`, borderRadius: 8, flexWrap: "wrap" }}>
                  <span style={{ background: plan.color, color: C.onGold, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{plan.badge}</span>
                  <div style={{ flex: 1, minWidth: 160 }}><div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{plan.name}</div><div style={{ color: C.mid, fontSize: 12 }}>{plan.desc}</div></div>
                  <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{plan.priceLabel}</div>
                </div>
              </StSec>
              <StSec title="Compare plans">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><th scope="col" style={thS}>Feature</th>{Object.values(PLANS).map(p => <th key={p.id} scope="col" style={{ ...thS, textAlign: "center", color: p.id === plan.id ? C.gold : C.mid }}>{p.name}{p.id === plan.id ? " (yours)" : ""}</th>)}</tr></thead>
                    <tbody>{[
                      ["Price", p => p.priceLabel],
                      ["Data sources", p => p.sources === "all" ? "All" : `${p.sources.length}`],
                      ["AI insights", p => p.aiInsights ? "✓" : "—"],
                      ["Exports", p => p.exports.join(", ").toUpperCase()],
                      ["Country comparison", p => p.compare ? "✓" : "—"],
                      ["Years of history", p => `${p.maxYears}`],
                    ].map(([f, fn]) => <tr key={f}><td style={tdS}>{f}</td>{Object.values(PLANS).map(p => <td key={p.id} style={{ ...tdS, textAlign: "center" }}>{fn(p)}</td>)}</tr>)}</tbody>
                  </table>
                </div>
                {plan.id !== "enterprise" && <button type="button" onClick={() => { onClose(); onRequestUpgrade && onRequestUpgrade(); }} style={{ ...btn(), marginTop: 14, padding: "9px 18px", fontSize: 12 }}>Request an upgrade</button>}
                <div style={{ fontSize: 11, color: C.dim, marginTop: 8 }}>Upgrades are reviewed by an administrator.</div>
              </StSec>
            </>}
            {tab === "support" && <>
              <StSec title="Get help" sub="Ask the assistant how a feature works, or message the EcoScope team.">
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                  <button type="button" onClick={() => { onClose(); onOpenSupport && onOpenSupport("assistant"); }} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", textAlign: "left", color: C.text }}>
                    <Ico n="sparkle" s={18} /><span><b style={{ fontSize: 13 }}>Ask the assistant</b><span style={{ display: "block", fontSize: 12, color: C.mid, marginTop: 2 }}>Instant answers about features and methods.</span></span></button>
                  <button type="button" onClick={() => { onClose(); onOpenSupport && onOpenSupport("support"); }} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", textAlign: "left", color: C.text }}>
                    <Ico n="message" s={18} /><span><b style={{ fontSize: 13 }}>Message support</b><span style={{ display: "block", fontSize: 12, color: C.mid, marginTop: 2 }}>Report a bug, a data issue or a billing question. Replies appear in the chat.</span></span></button>
                </div>
              </StSec>
              <StSec title="Common questions">
                {SUPPORT_FAQ.slice(0, 6).map(f => <details key={f.q} style={{ padding: "10px 12px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 8 }}>
                  <summary style={{ cursor: "pointer", color: C.text, fontSize: 13, fontWeight: 500 }}>{f.q}</summary>
                  <div style={{ color: C.mid, fontSize: 12, lineHeight: 1.6, marginTop: 8 }}>{f.a}</div></details>)}
              </StSec>
            </>}
            {tab === "help" && <>
              <StSec title="Data providers">
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
                  {[["globe", "World Bank Open Data", "https://data.worldbank.org", "1,400+ global indicators"], ["chart", "IMF Data Mapper", "https://www.imf.org/external/datamapper", "Macro projections and history"],
                    ["bank", "FRED", "https://fred.stlouisfed.org", "US economic data"], ["flask", "WHO Global Health Observatory", "https://www.who.int/data/gho", "Health statistics"],
                    ["briefcase", "ILOSTAT", "https://ilostat.ilo.org", "Labour market data"], ["cap", "UNESCO UIS", "https://uis.unesco.org", "Education statistics"],
                    ["bank", "Bank of Ghana", "https://www.bog.gov.gh/economic-data/", "Ghana monetary data"]].map(([ic, n, u, d]) =>
                    <a key={n} href={u} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: C.card, borderRadius: 6, border: `1px solid ${C.border}`, textDecoration: "none" }}>
                      <span style={{ color: C.mid }}><Ico n={ic} s={18} /></span><span style={{ flex: 1 }}><span style={{ display: "block", color: C.text, fontSize: 13, fontWeight: 500 }}>{n}</span><span style={{ color: C.dim, fontSize: 11 }}>{d}</span></span><span style={{ color: C.dim }}>↗</span></a>)}
                </div>
              </StSec>
              <StSec title="About EcoScope">
                <div style={{ color: C.mid, fontSize: 12, lineHeight: 1.7 }}>EcoScope v2.1 · Global economic intelligence platform. Data from the World Bank, IMF, FRED, WHO, ILO, UNESCO, Bank of Ghana, BIS and UNCTAD. Causal tools: DAG builder, matching and weighting, synthetic control. Optional AI narratives powered by Claude (Anthropic).</div>
              </StSec>
            </>}
          </div>
        </div>
        {/* Footer */}
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 20px", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {dirty && <span style={{ marginRight: "auto", fontSize: 12, color: C.mid }}>Unsaved changes</span>}
          <button type="button" onClick={onClose} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "9px 18px", color: C.mid, fontSize: 12, cursor: "pointer" }}>{dirty ? "Cancel" : "Close"}</button>
          <button type="button" disabled={!dirty} onClick={() => { onSave(s); onClose(); }} style={{ ...btn(), padding: "9px 22px", fontSize: 12, opacity: dirty ? 1 : 0.5 }}>Save changes</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// TOOLTIP
// ══════════════════════════════════════════════

const CustomTip = ({active,payload,label,fmt}) => {
  if (!active||!payload?.length) return null;
  return (
    <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:6,padding:"10px 14px",fontFamily:C.mono,fontSize:11}}>
      <div style={{color:C.mid,marginBottom:6}}>{label}</div>
      {payload.map((p,i)=>(
        <div key={i} style={{color:p.stroke||p.fill||C.gold,display:"flex",gap:12,justifyContent:"space-between"}}>
          <span>{p.name}</span><span style={{fontWeight:600}}>{fmtVal(p.value,fmt)}</span>
        </div>
      ))}
    </div>
  );
};

// ══════════════════════════════════════════════
// UPGRADE REQUEST MODAL (user-facing)
// ══════════════════════════════════════════════
function UpgradeRequestModal({user,currentPlan,onClose}){
  const [plan,setPlan]=useState("pro");
  const [message,setMessage]=useState("");
  const [sent,setSent]=useState(false);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");

  const submit=async e=>{
    e.preventDefault();setErr("");
    if(plan===currentPlan){setErr("You are already on this plan.");return;}
    setLoading(true);
    await new Promise(r=>setTimeout(r,700));
    const res=await US.requestPlan(user.username,user.email,currentPlan,plan,message);
    setLoading(false);
    if(res.error){setErr(res.error);return;}
    setSent(true);
  };

  return(
    <div style={{position:"fixed",inset:0,background:C.overlay,display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}}>
      <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:6,padding:"36px 40px",width:460,fontFamily:C.font,boxShadow:C.shadow}}>
        {sent?(
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:48,marginBottom:16}}><Ico n="inbox"/></div>
            <h2 style={{color:C.teal,fontSize:18,fontWeight:700,marginBottom:10}}>Request Sent!</h2>
            <p style={{color:C.mid,fontSize:12,fontFamily:C.mono,lineHeight:1.7,marginBottom:24}}>Your upgrade request to <strong style={{color:PLANS[plan].color}}>{PLANS[plan].name}</strong> has been sent to the administrator. You will be notified once it is approved.</p>
            <button onClick={onClose} style={{...btn(),padding:"11px 28px",fontSize:12}}>Got it →</button>
          </div>
        ):(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
              <div>
                <h2 style={{color:C.text,fontSize:16,fontWeight:700,margin:"0 0 3px"}}><Ico n="arrowup"/> Request Plan Upgrade</h2>
                <div style={{color:C.mid,fontSize:11,fontFamily:C.mono}}>Current plan: <span style={{color:PLANS[currentPlan]?.color||C.mid,fontWeight:700}}>{currentPlan.toUpperCase()}</span></div>
              </div>
              <button onClick={onClose} style={{background:"none",border:"none",color:C.mid,cursor:"pointer",fontSize:18}}>✕</button>
            </div>
            <form onSubmit={submit}>
              <div style={{marginBottom:16}}>
                <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>Requested Plan</div>
                <div style={{display:"flex",gap:8}}>
                  {Object.entries(PLANS).filter(([k])=>k!=="free").map(([key,pl])=>(
                    <button key={key} type="button" onClick={()=>setPlan(key)} style={{...pill(plan===key,pl.color),flex:1,textAlign:"center",padding:"12px 8px",fontSize:12}}>
                      <div style={{fontWeight:700}}>{pl.name}</div>
                      <div style={{fontSize:10,fontFamily:C.mono,marginTop:3}}>{pl.priceLabel}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{marginBottom:16}}>
                <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>Message to Admin (optional)</div>
                <textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Briefly describe your use case or reason for upgrading..." rows={3} style={{...inp,resize:"vertical",fontSize:12,lineHeight:1.6}}/>
              </div>
              {err&&<div style={{background:`${C.red}12`,border:`1px solid ${C.red}44`,borderRadius:6,padding:"9px 12px",marginBottom:14,color:C.red,fontSize:11,fontFamily:C.mono}}>{err}</div>}
              <div style={{display:"flex",gap:10}}>
                <button type="button" onClick={onClose} style={{flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"11px",color:C.mid,fontSize:12,cursor:"pointer"}}>Cancel</button>
                <button type="submit" disabled={loading} style={{flex:2,...btn(PLANS[plan].color),padding:"11px",fontSize:12,color:plan==="pro"?"#000":"#fff",opacity:loading?.6:1}}>
                  {loading?"Sending…":"Send Request →"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════

// ══════════════════════════════════════════════
// POLICY IMPACT ENGINE — matching, weighting, synthetic control
// ══════════════════════════════════════════════
// References: DeAngelo (CGU) "Matching" lecture; Blackwell, Gov 2002 "Matching";
// Cunningham, Causal Inference: The Mixtape, ch. 5 (matching) and ch. 10 (synthetic control);
// Abadie & Imbens (2006, 2011); Iacus, King & Porro (2012); Abadie, Diamond & Hainmueller (2010).
// All functions are pure and run in the browser. Names are prefixed "ci" to avoid collisions.

// ── basic numerics ─────────────────────────────────────────────────────────────
const ciRng = (seed=12345) => { let a = seed>>>0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const ciMean = (a) => { let s=0; for (let i=0;i<a.length;i++) s+=a[i]; return a.length? s/a.length : NaN; };
const ciVarS = (a) => { const m=ciMean(a); let s=0; for (let i=0;i<a.length;i++) s+=(a[i]-m)**2; return a.length>1? s/(a.length-1) : 0; };
const ciWMean = (a, w) => { let s=0, sw=0; for (let i=0;i<a.length;i++){ s+=a[i]*w[i]; sw+=w[i]; } return sw>0? s/sw : NaN; };
const ciWVar = (a, w) => { const m=ciWMean(a,w); let s=0, sw=0, sw2=0; for (let i=0;i<a.length;i++){ s+=w[i]*(a[i]-m)**2; sw+=w[i]; sw2+=w[i]*w[i]; } const d = sw - sw2/sw; return d>0? s/d : 0; };
const ciQuantile = (sorted, q) => { if(!sorted.length) return NaN; const p=(sorted.length-1)*q, lo=Math.floor(p), hi=Math.ceil(p); return sorted[lo]+(sorted[hi]-sorted[lo])*(p-lo); };
const ciNormCdf = (z) => { const t=1/(1+0.2316419*Math.abs(z)); const d=0.3989423*Math.exp(-z*z/2); const p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274)))); return z>0? 1-p : p; };
const ciPval = (est, se) => (se>0 && isFinite(se)) ? 2*(1-ciNormCdf(Math.abs(est/se))) : NaN;

// k-th smallest (1-based) of a Float64Array copy, O(n) average (Hoare quickselect)
const ciKth = (src, k) => { const a=Float64Array.from(src); let lo=0, hi=a.length-1; k=Math.min(k,a.length)-1;
  while (lo<hi){ const piv=a[(lo+hi)>>1]; let i=lo, j=hi; while (i<=j){ while (a[i]<piv) i++; while (a[j]>piv) j--; if (i<=j){ const t=a[i]; a[i]=a[j]; a[j]=t; i++; j--; } }
    if (k<=j) hi=j; else if (k>=i) lo=i; else break; }
  return a[k]; };
// Solve A x = b (A square, row-major array of arrays). Gaussian elimination with partial pivoting.
const ciSolve = (A, b) => {
  const n=A.length; const M=A.map((r,i)=>[...r, b[i]]);
  for (let c=0;c<n;c++){
    let p=c; for (let r=c+1;r<n;r++) if (Math.abs(M[r][c])>Math.abs(M[p][c])) p=r;
    if (Math.abs(M[p][c])<1e-12) return null;
    [M[c],M[p]]=[M[p],M[c]];
    for (let r=0;r<n;r++){ if(r===c) continue; const f=M[r][c]/M[c][c]; if(f===0) continue; for (let k=c;k<=n;k++) M[r][k]-=f*M[c][k]; }
  }
  return M.map((r,i)=>r[n]/r[i]);
};
const ciInv = (A) => { const n=A.length; const cols=[]; for (let j=0;j<n;j++){ const e=new Array(n).fill(0); e[j]=1; const x=ciSolve(A,e); if(!x) return null; cols.push(x); } return A.map((_,i)=>cols.map(c=>c[i])); };
// Cholesky (lower) of a symmetric positive definite matrix
const ciChol = (A) => { const n=A.length; const L=A.map(()=>new Array(n).fill(0));
  for (let i=0;i<n;i++) for (let j=0;j<=i;j++){ let s=A[i][j]; for (let k=0;k<j;k++) s-=L[i][k]*L[j][k];
    if (i===j){ if (s<=1e-12) return null; L[i][i]=Math.sqrt(s); } else L[i][j]=s/L[j][j]; }
  return L; };

// Weighted OLS with HC1 robust SEs. X: array of rows (include intercept column yourself).
const ciOLS = (X, y, w=null) => {
  const n=X.length, k=X[0].length; const XtX=Array.from({length:k},()=>new Array(k).fill(0)); const Xty=new Array(k).fill(0);
  for (let i=0;i<n;i++){ const wi=w? w[i]:1; if(!wi) continue; const xi=X[i]; for (let a=0;a<k;a++){ Xty[a]+=wi*xi[a]*y[i]; for (let b=a;b<k;b++) XtX[a][b]+=wi*xi[a]*xi[b]; } }
  for (let a=0;a<k;a++) for (let b=0;b<a;b++) XtX[a][b]=XtX[b][a];
  const inv=ciInv(XtX); if(!inv) return null;
  const beta=inv.map(r=>r.reduce((s,v,j)=>s+v*Xty[j],0));
  const meat=Array.from({length:k},()=>new Array(k).fill(0)); let nEff=0;
  for (let i=0;i<n;i++){ const wi=w? w[i]:1; if(!wi) continue; nEff++; const xi=X[i]; const e=y[i]-xi.reduce((s,v,j)=>s+v*beta[j],0); const s2=wi*wi*e*e;
    for (let a=0;a<k;a++) for (let b=0;b<k;b++) meat[a][b]+=s2*xi[a]*xi[b]; }
  const V=inv.map(r=>inv[0].map((_,j)=>{ let s=0; for (let a=0;a<k;a++){ let t=0; for (let b=0;b<k;b++) t+=meat[a][b]*inv[b][j]; s+=r[a]*t; } return s; }));
  const adj = nEff>k? nEff/(nEff-k) : 1;
  return { beta, se: beta.map((_,j)=>Math.sqrt(Math.max(0,V[j][j]*adj))), n:nEff };
};

// Logistic regression by Newton–Raphson (covariates standardized internally, tiny ridge for stability)
const ciLogit = (X, d, opts={}) => {
  const n=X.length, k=X[0]?.length||0; const mu=new Array(k).fill(0), sd=new Array(k).fill(1);
  for (let j=0;j<k;j++){ const col=X.map(r=>r[j]); mu[j]=ciMean(col); sd[j]=Math.sqrt(ciVarS(col))||1; }
  const Z=X.map(r=>[1,...r.map((v,j)=>(v-mu[j])/sd[j])]); const p1=k+1;
  let b=opts.start? opts.start.slice() : new Array(p1).fill(0); const lam=opts.ridge??1e-6; let converged=false, it=0;
  for (it=0; it<(opts.maxIter||60); it++){
    const H=Array.from({length:p1},()=>new Array(p1).fill(0)); const g=new Array(p1).fill(0);
    for (let i=0;i<n;i++){ const z=Z[i]; let eta=0; for (let j=0;j<p1;j++) eta+=z[j]*b[j]; const p=1/(1+Math.exp(-eta)); const r=d[i]-p, wt=p*(1-p);
      for (let a=0;a<p1;a++){ g[a]+=z[a]*r; const za=z[a]*wt; for (let c=a;c<p1;c++) H[a][c]+=za*z[c]; } }
    for (let a=0;a<p1;a++){ for (let c=0;c<a;c++) H[a][c]=H[c][a]; if(a>0){ H[a][a]+=lam; g[a]-=lam*b[a]; } }
    const step=ciSolve(H,g); if(!step) break;
    let mx=0; for (let j=0;j<p1;j++){ b[j]+=step[j]; mx=Math.max(mx,Math.abs(step[j])); }
    if (mx<1e-8){ converged=true; break; }
  }
  const lin=Z.map(z=>z.reduce((s,v,j)=>s+v*b[j],0)); const ps=lin.map(e=>1/(1+Math.exp(-e)));
  const nExtreme=ps.filter(p=>p<1e-6||p>1-1e-6).length;
  return { b, ps, lin, converged, iterations:it+1, separation: nExtreme>0, nExtreme, mu, sd };
};

// ── data preparation ────────────────────────────────────────────────────────────
// rows: array of objects (strings ok). spec: {y, d, treatValue, covs:[names], squares:bool, exact:[names]}
// spec.missing: "drop" (complete cases) | "impute" (mean for numeric covariates, "(missing)" level for categorical, plus missingness indicators).
// Outcome and treatment are never imputed: a row without Y or D is dropped.
const ciPrepare = (headers, rawRows, spec) => {
  const idx = Object.fromEntries(headers.map((h,i)=>[h,i])); const imp = spec.missing==="impute";
  const num = (v) => { if (v==null) return NaN; const s=String(v).trim(); if(s===""||/^(na|nan|null|\.|-)$/i.test(s)) return NaN; return parseFloat(s.replace(/[$,%\s]/g,"")); };
  const isMiss = (v) => v==null || /^(|na|nan|null|\.|-)$/i.test(String(v).trim());
  // classify covariates: numeric vs categorical; record missingness
  const covInfo = spec.covs.map(c=>{
    const vals=rawRows.map(r=>r[idx[c]]); const nums=vals.map(num); const ok=nums.filter(v=>!isNaN(v)); const nonEmpty=vals.filter(v=>!isMiss(v)).length;
    const isNum = ok.length >= 0.95*nonEmpty; const nMiss = vals.length - nonEmpty;
    const levels=[...new Set(isNum? ok : vals.filter(v=>!isMiss(v)).map(v=>String(v).trim()))];
    if (!isNum && imp && nMiss>0) levels.push("(missing)");
    return { name:c, isNum, levels: isNum? null : levels.sort(), binary: isNum && levels.length<=2, nUnique: levels.length, nMiss, mean: isNum? ciMean(ok) : null,
             indicator: imp && isNum && nMiss>0 };
  });
  const dropped={missing:0, imputedCells:0}; const units=[];
  for (const r of rawRows){
    const y=num(r[idx[spec.y]]); const draw=String(r[idx[spec.d]]??"").trim();
    let d; if (spec.treatValue!=null && spec.treatValue!=="") d = draw===String(spec.treatValue) ? 1 : (draw===""? NaN : 0); else { const dn=num(draw); d = dn===1?1: dn===0?0: NaN; }
    if (isNaN(y)||isNaN(d)){ dropped.missing++; continue; }
    const x=[]; const xRaw={}; let bad=false; let nImp=0;
    for (const ci of covInfo){ const v=r[idx[ci.name]];
      if (ci.isNum){ let nv=num(v); let miss=0; if(isNaN(nv)){ if(!imp){ bad=true; break; } nv=ci.mean; miss=1; nImp++; }
        x.push(nv); xRaw[ci.name]=nv; if (spec.squares && !ci.binary) x.push(nv*nv); if (ci.indicator){ x.push(miss); xRaw[ci.name+" missing"]=miss; } }
      else { let sv=isMiss(v)? "" : String(v).trim(); if(!sv){ if(!imp){ bad=true; break; } sv="(missing)"; nImp++; } xRaw[ci.name]=sv; ci.levels.slice(1).forEach(l=>x.push(sv===l?1:0)); }
    }
    if (bad){ dropped.missing++; continue; }
    dropped.imputedCells+=nImp;
    units.push({ y, d, x, xRaw });
  }
  // design column labels + balance variables (numeric covs + dummies for categories + missingness indicators)
  const colNames=[]; const balNames=[];
  for (const ci of covInfo){ if (ci.isNum){ colNames.push(ci.name); balNames.push(ci.name); if (spec.squares && !ci.binary) colNames.push(ci.name+"²"); if (ci.indicator){ colNames.push(ci.name+" missing"); balNames.push(ci.name+" missing"); } }
    else ci.levels.slice(1).forEach(l=>{ colNames.push(`${ci.name}=${l}`); balNames.push(`${ci.name}=${l}`); }); }
  for (const u of units){ const b=[]; for (const ci of covInfo){ if (ci.isNum){ b.push(u.xRaw[ci.name]); if (ci.indicator) b.push(u.xRaw[ci.name+" missing"]); } else ci.levels.slice(1).forEach(l=>b.push(u.xRaw[ci.name]===l?1:0)); } u.b=b; }
  // drop constant design columns
  const keep=colNames.map((_,j)=>{ const col=units.map(u=>u.x[j]); return ciVarS(col)>1e-12; });
  for (const u of units) u.x=u.x.filter((_,j)=>keep[j]);
  const names=colNames.filter((_,j)=>keep[j]);
  const exactKeys = (spec.exact||[]).filter(e=>covInfo.some(c=>c.name===e));
  for (const u of units) u.ex = exactKeys.map(e=>String(u.xRaw[e])).join("|");
  return { units, names, balNames, covInfo, dropped, nT: units.filter(u=>u.d===1).length, nC: units.filter(u=>u.d===0).length };
};

// ── panel data for synthetic control from a user table ───────────────────────────
// format "long": one row per unit-year (unit, year, outcome, covariates).  format "wide": one row per year, one column per unit.
const ciPanelFromTable = (headers, rows, spec) => {
  const idx=Object.fromEntries(headers.map((h,i)=>[h,i])); const num=(v)=>{ const s=String(v??"").trim(); if(!s||/^(na|nan|null|\.|-)$/i.test(s)) return null; const n=parseFloat(s.replace(/[$,%\s]/g,"")); return isFinite(n)? n : null; };
  const yr=(v)=>{ const m=String(v??"").match(/(1[89]\d\d|20\d\d)/); return m? parseInt(m[1]) : null; };
  const units={};
  if (spec.format==="wide"){
    const cols=headers.filter(h=>h!==spec.time);
    for (const r of rows){ const t=yr(r[idx[spec.time]]); if (t==null) continue; cols.forEach(c=>{ const u=units[c]||(units[c]={ id:c, name:c, y:{}, cov:{} }); u.y[t]=num(r[idx[c]]); }); }
  } else {
    for (const r of rows){ const id=String(r[idx[spec.unit]]??"").trim(); const t=yr(r[idx[spec.time]]); if(!id||t==null) continue;
      const u=units[id]||(units[id]={ id, name:id, y:{}, cov:{} }); u.y[t]=num(r[idx[spec.y]]);
      (spec.covs||[]).forEach(c=>{ (u.cov[c]||(u.cov[c]={}))[t]=num(r[idx[c]]); }); }
  }
  const years=[...new Set(Object.values(units).flatMap(u=>Object.keys(u.y).map(Number)))].sort((a,b)=>a-b);
  return { units:Object.values(units), years };
};
// Fill a unit's series over `years` using EcoScope's imputation methods. Returns {vals, nImputed} or null if gaps remain.
const ciFillSeries = (years, map, method) => {
  const raw=years.map(y=>{ const v=map?.[y]; return v==null||!isFinite(v)? null : v; }); const nMiss=raw.filter(v=>v==null).length;
  if (!nMiss) return { vals:raw, nImputed:0 };
  if (method==="strict") return null;
  let vals;
  if (method==="interp") vals=ciInterp(raw);
  else { const filled=imputeData(years.map((y,i)=>({ year:y, value:raw[i] })), method); vals=filled.map(d=>d.value); }
  if (!vals || vals.some(v=>v==null||!isFinite(v))) return null;
  return { vals, nImputed:nMiss };
};

// ── propensity score ─────────────────────────────────────────────────────────────
const ciPropensity = (units, start) => { const X=units.map(u=>u.x); const d=units.map(u=>u.d); return ciLogit(X, d, start? {start}:{}) };

// ── balance diagnostics ──────────────────────────────────────────────────────────
// weights: array (0 = dropped). estimand decides the SMD denominator (ATT: treated SD; ATC: control SD; ATE: pooled).
const ciBalance = (units, balNames, weights, estimand="ATT") => {
  const T=units.filter(u=>u.d===1), Cn=units.filter(u=>u.d===0);
  return balNames.map((nm,j)=>{
    const xt=T.map(u=>u.b[j]), xc=Cn.map(u=>u.b[j]); const vt=ciVarS(xt), vc=ciVarS(xc);
    const denom = Math.sqrt(estimand==="ATT"? vt : estimand==="ATC"? vc : (vt+vc)/2) || Math.sqrt((vt+vc)/2) || 1;
    const mt=ciMean(xt), mc=ciMean(xc);
    const wt=units.map((u,i)=>u.d===1? weights[i]:0), wc=units.map((u,i)=>u.d===0? weights[i]:0); const all=units.map(u=>u.b[j]);
    const mtA=ciWMean(all,wt), mcA=ciWMean(all,wc); const vtA=ciWVar(all,wt), vcA=ciWVar(all,wc);
    return { name:nm, meanT:mt, meanC:mc, smdBefore:(mt-mc)/denom, vrBefore: vc>0? vt/vc : NaN,
             meanTAfter:mtA, meanCAfter:mcA, smdAfter:(mtA-mcA)/denom, vrAfter: vcA>0? vtA/vcA : NaN };
  });
};
// Iacus-King-Porro multivariate L1 imbalance on a fixed coarsening (quintiles for continuous)
const ciL1 = (units, weights) => {
  const k=units[0]?.b.length||0; const cuts=[];
  for (let j=0;j<k;j++){ const col=units.map(u=>u.b[j]); const uniq=[...new Set(col)]; if (uniq.length<=5){ cuts.push(null); continue; }
    const s=[...col].sort((a,b)=>a-b); cuts.push([0.2,0.4,0.6,0.8].map(q=>ciQuantile(s,q))); }
  const key=(u)=>u.b.map((v,j)=>cuts[j]? cuts[j].filter(c=>v>c).length : v).join("|");
  const fT={}, fC={}; let sT=0, sC=0;
  units.forEach((u,i)=>{ const w=weights[i]; if(!w) return; const kk=key(u); if(u.d===1){ fT[kk]=(fT[kk]||0)+w; sT+=w; } else { fC[kk]=(fC[kk]||0)+w; sC+=w; } });
  const keys=new Set([...Object.keys(fT),...Object.keys(fC)]); let L1=0; keys.forEach(kk=>{ L1+=Math.abs((fT[kk]||0)/sT-(fC[kk]||0)/sC); });
  return L1/2;
};

// ── estimators ───────────────────────────────────────────────────────────────────
const ciResult = (method, estimand, est, se, extra={}) => ({ method, estimand, est, se, lo: est-1.96*se, hi: est+1.96*se, p: ciPval(est,se), ...extra });

// 1. Simple difference in outcomes (SDO), Welch SE
const ciNaive = (units) => { const yt=units.filter(u=>u.d===1).map(u=>u.y), yc=units.filter(u=>u.d===0).map(u=>u.y);
  return ciResult("Naive difference (SDO)", "—", ciMean(yt)-ciMean(yc), Math.sqrt(ciVarS(yt)/yt.length+ciVarS(yc)/yc.length), { nT:yt.length, nC:yc.length }); };

// 2. OLS with controls, HC1
const ciRegAdj = (units) => { const X=units.map(u=>[1,u.d,...u.x]); const r=ciOLS(X, units.map(u=>u.y)); if(!r) return null;
  return ciResult("OLS with controls", "ATE*", r.beta[1], r.se[1], { nT:units.filter(u=>u.d).length, nC:units.filter(u=>!u.d).length, note:"Constant-effect linear model; extrapolates where groups do not overlap." }); };

// 3. Subclassification on the propensity score (Cochran 1968; Rosenbaum & Rubin 1984)
const ciSubclass = (units, ps, estimand="ATT", K=5) => {
  const s=[...ps].sort((a,b)=>a-b); const cuts=[...new Set(Array.from({length:K-1},(_,k)=>ciQuantile(s,(k+1)/K)))].filter(c=>c>s[0]); K=cuts.length+1;
  const stratum=ps.map(p=>cuts.filter(c=>p>=c).length);
  const strata=Array.from({length:K},(_,k)=>{ const idx=units.map((u,i)=>stratum[i]===k?i:-1).filter(i=>i>=0); const t=idx.filter(i=>units[i].d===1), c=idx.filter(i=>units[i].d===0);
    return { k, n:idx.length, nT:t.length, nC:c.length, yT:ciMean(t.map(i=>units[i].y)), yC:ciMean(c.map(i=>units[i].y)), vT:ciVarS(t.map(i=>units[i].y)), vC:ciVarS(c.map(i=>units[i].y)), lo: k? cuts[k-1]:0, hi: k<K-1? cuts[k]:1 }; });
  const usable=strata.filter(z=>z.nT>0&&z.nC>0); const unusable=strata.filter(z=>!(z.nT>0&&z.nC>0)&&z.n>0);
  const tot = usable.reduce((a,z)=>a+(estimand==="ATT"? z.nT : estimand==="ATC"? z.nC : z.n),0);
  let est=0, v=0; usable.forEach(z=>{ const w=(estimand==="ATT"? z.nT : estimand==="ATC"? z.nC : z.n)/tot; est+=w*(z.yT-z.yC); v+=w*w*((z.nT>1?z.vT/z.nT:0)+(z.nC>1?z.vC/z.nC:0)); });
  const weights=units.map((u,i)=>{ const z=strata[stratum[i]]; if(!(z.nT>0&&z.nC>0)) return 0;
    if (estimand==="ATT") return u.d? 1 : z.nT/z.nC; if (estimand==="ATC") return u.d? z.nC/z.nT : 1; return u.d? z.n/z.nT : z.n/z.nC; });
  return { ...ciResult(`PS subclassification (${K} strata)`, estimand, est, Math.sqrt(v), { nT:usable.reduce((a,z)=>a+z.nT,0), nC:usable.reduce((a,z)=>a+z.nC,0),
    note: unusable.length? `${unusable.length} stratum(s) lacked treated or control units and were dropped: the estimand is restricted to strata with common support.` : null }), strata, weights };
};

// 4. Nearest-neighbour matching (Abadie & Imbens 2006, 2011)
// opts: {estimand, M, metric:'mahalanobis'|'euclid'|'ps', ps(lin), caliper (SD of linear PS), replace, biasAdj, J (variance neighbours)}
const ciNNMatch = (units, opts) => {
  const { estimand="ATT", M=1, metric="mahalanobis", replace=true, biasAdj=true, caliper=null, J=2 } = opts; const lin=opts.lin;
  const n=units.length; const k=units[0].x.length;
  // feature space for distances
  let F;
  if (metric==="ps") F=units.map((u,i)=>[lin[i]]);
  else {
    const mu=new Array(k).fill(0); units.forEach(u=>u.x.forEach((v,j)=>mu[j]+=v/n));
    const S=Array.from({length:k},()=>new Array(k).fill(0)); units.forEach(u=>{ for (let a=0;a<k;a++) for (let b=0;b<k;b++) S[a][b]+=(u.x[a]-mu[a])*(u.x[b]-mu[b])/(n-1); });
    if (metric==="euclid"){ const sd=S.map((r,j)=>Math.sqrt(r[j])||1); F=units.map(u=>u.x.map((v,j)=>v/sd[j])); }
    else { const L=ciChol(S.map((r,i)=>r.map((v,j)=>v+(i===j?1e-9*Math.abs(S[i][i]||1):0)))); if(!L) return { error:"Covariance matrix is singular. Remove redundant covariates." };
      // whiten: z = L^{-1} x  so Euclidean(z) = Mahalanobis(x)
      F=units.map(u=>{ const z=new Array(k); for (let i=0;i<k;i++){ let s=u.x[i]; for (let j=0;j<i;j++) s-=L[i][j]*z[j]; z[i]=s/L[i][i]; } return z; }); }
  }
  const sdLin = lin? Math.sqrt(ciVarS(lin)) : 1; const cal = (caliper!=null && caliper>0 && lin)? caliper*sdLin : Infinity;
  const dist2=(a,b)=>{ let s=0; const fa=F[a], fb=F[b]; for (let j=0;j<fa.length;j++){ const t=fa[j]-fb[j]; s+=t*t; } return s; };
  const idxT=[], idxC=[]; units.forEach((u,i)=>(u.d?idxT:idxC).push(i));
  // match a set of targets to a pool
  const matchSet=(targets, pool)=>{
    const out=new Map(); const used=new Set();
    const order = replace? targets : [...targets].sort((a,b)=> (lin? lin[b]-lin[a] : 0));
    const D=new Float64Array(pool.length);
    for (const t of order){
      let nOk=0;
      for (let q=0;q<pool.length;q++){ const c=pool[q]; let ok=true; if (!replace && used.has(c)) ok=false; else if (units[c].ex!==units[t].ex) ok=false; else if (lin && Math.abs(lin[c]-lin[t])>cal) ok=false;
        D[q]= ok? dist2(t,c) : Infinity; if (ok) nOk++; }
      if (!nOk){ out.set(t,[]); continue; }
      const dM=ciKth(D, Math.min(M,nOk));
      let chosen=[]; for (let q=0;q<pool.length;q++) if (D[q]<=dM+1e-12) chosen.push([D[q],pool[q]]);
      chosen.sort((a,b)=>a[0]-b[0]); chosen = (replace? chosen : chosen.slice(0,M)).map(([,c])=>c); // ties kept when matching with replacement
      if (!replace) chosen.forEach(c=>used.add(c));
      out.set(t,chosen);
    }
    return out;
  };
  const doT = estimand!=="ATC", doC = estimand!=="ATT";
  const mT = doT? matchSet(idxT, idxC) : new Map(); const mC = doC? matchSet(idxC, idxT) : new Map();
  // bias-adjustment regressions mu_d(x) on the units used as matches (weighted by use), fallback to the whole group
  const fitMu=(matches, group)=>{ if(!biasAdj) return null; const w=new Map(); matches.forEach(js=>js.forEach(j=>w.set(j,(w.get(j)||0)+1/js.length)));
    let ids=[...w.keys()], ww=ids.map(j=>w.get(j)); if (ids.length < k+3){ ids=group; ww=group.map(()=>1); }
    const r=ciOLS(ids.map(j=>[1,...units[j].x]), ids.map(j=>units[j].y), ww); return r? r.beta : null; };
  const pred=(b,i)=> b? b[0]+units[i].x.reduce((s,v,j)=>s+v*b[j+1],0) : 0;
  const mu0 = doT? fitMu(mT, idxC) : null; const mu1 = doC? fitMu(mC, idxT) : null;
  // imputations
  const Y1=new Array(n).fill(NaN), Y0=new Array(n).fill(NaN); const use=new Array(n).fill(0); const useSq=new Array(n).fill(0); const kept=new Array(n).fill(false);
  const impute=(map, isT)=>{ map.forEach((js,t)=>{ if(!js.length) return; kept[t]=true; const m=js.length; let s=0;
      js.forEach(j=>{ s+=units[j].y + (biasAdj? (isT? pred(mu0,t)-pred(mu0,j) : pred(mu1,t)-pred(mu1,j)) : 0); use[j]+=1/m; useSq[j]+=1/(m*m); });
      if (isT){ Y1[t]=units[t].y; Y0[t]=s/m; } else { Y0[t]=units[t].y; Y1[t]=s/m; } }); };
  impute(mT, true); impute(mC, false);
  const targets = estimand==="ATT"? idxT : estimand==="ATC"? idxC : units.map((_,i)=>i);
  const tk = targets.filter(i=>kept[i]); const N1=tk.length; if(!N1) return { error:"No target unit found a match. Loosen the caliper or exact-match settings." };
  const tau = ciMean(tk.map(i=>Y1[i]-Y0[i]));
  // conditional variance sigma^2(X_i, D_i) by matching within the same group (J neighbours), only needed for units used as matches
  const sig2=new Map(); const grp=(i)=>units[i].d? idxT : idxC;
  units.forEach((u,i)=>{ if(!use[i]) return; const pool=grp(i); const Dd=new Float64Array(pool.length); let nOk=0;
    for (let q=0;q<pool.length;q++){ const j=pool[q]; if (j===i||units[j].ex!==u.ex){ Dd[q]=Infinity; continue; } Dd[q]=dist2(i,j); nOk++; }
    if (!nOk){ sig2.set(i,0); return; } const th=ciKth(Dd, Math.min(J,nOk)); const nb=[]; for (let q=0;q<pool.length && nb.length<J;q++) if (Dd[q]<=th) nb.push(units[pool[q]].y); const jn=nb.length;
    sig2.set(i, jn/(jn+1)*(u.y-ciMean(nb))**2); });
  let v1=0, v2=0;
  tk.forEach(i=>{ v1+=(Y1[i]-Y0[i]-tau)**2; });
  if (estimand==="ATE"){ units.forEach((u,i)=>{ if(use[i]) v2+=(use[i]**2 + 2*use[i] - useSq[i])*(sig2.get(i)||0); }); }
  else { units.forEach((u,i)=>{ if(use[i] && ((estimand==="ATT"&&!u.d)||(estimand==="ATC"&&u.d))) v2+=(use[i]**2 - useSq[i])*(sig2.get(i)||0); }); }
  const se=Math.sqrt((v1+v2)/(N1*N1));
  const nTarget = targets.length; const droppedTargets = nTarget-N1;
  // balance weights: targets 1, matches by usage (for ATE, both directions)
  const weights=units.map((u,i)=>{ if (estimand==="ATE") return (kept[i]?1:0)+use[i]; if (estimand==="ATT") return u.d? (kept[i]?1:0) : use[i]; return u.d? use[i] : (kept[i]?1:0); });
  const label = `NN matching (${metric==="ps"?"propensity score":metric==="euclid"?"normalized Euclidean":"Mahalanobis"}, M=${M}${replace?", with replacement":", without replacement"}${caliper?`, caliper ${caliper} SD`:""}${biasAdj?", bias-corrected":""})`;
  return { ...ciResult(label, droppedTargets? `feasible ${estimand}` : estimand, tau, se, { nT: units.filter((u,i)=>u.d&&weights[i]>0).length, nC: units.filter((u,i)=>!u.d&&weights[i]>0).length,
    note: droppedTargets? `${droppedTargets} target unit(s) had no acceptable match and were dropped, so this is the ${estimand} for the matched subsample ("moving the goalposts").` : null }),
    weights, droppedTargets, pairs: estimand!=="ATC"? [...mT.entries()].slice(0,500) : [...mC.entries()].slice(0,500) };
};

// 5. Normalized (Hájek) inverse probability weighting with optional trimming. SE by bootstrap (re-estimating the PS).
const ciIPWPoint = (units, ps, estimand) => {
  let sT=0,wT=0,sC=0,wC=0; units.forEach((u,i)=>{ const p=ps[i]; let w;
    if (estimand==="ATT") w = u.d? 1 : p/(1-p); else if (estimand==="ATC") w = u.d? (1-p)/p : 1; else w = u.d? 1/p : 1/(1-p);
    if (u.d){ sT+=w*u.y; wT+=w; } else { sC+=w*u.y; wC+=w; } });
  return sT/wT - sC/wC;
};
const ciIPWWeights = (units, ps, estimand) => units.map((u,i)=>{ const p=ps[i]; if (estimand==="ATT") return u.d? 1 : p/(1-p); if (estimand==="ATC") return u.d? (1-p)/p : 1; return u.d? 1/p : 1/(1-p); });

// 6. Augmented IPW (doubly robust). Influence-function SE.
const ciAIPW = (units, ps, estimand) => {
  const fit=(g)=>{ const s=units.filter(u=>u.d===g); const r=ciOLS(s.map(u=>[1,...u.x]), s.map(u=>u.y)); return r? r.beta:null; };
  const b1=fit(1), b0=fit(0); if(!b1||!b0) return null; const pr=(b,u)=>b[0]+u.x.reduce((s,v,j)=>s+v*b[j+1],0);
  const N=units.length; const pT=units.filter(u=>u.d).length/N; let tau, phi;
  if (estimand==="ATE"){ const a=units.map((u,i)=>{ const m1=pr(b1,u), m0=pr(b0,u), p=ps[i]; return m1-m0 + u.d*(u.y-m1)/p - (1-u.d)*(u.y-m0)/(1-p); }); tau=ciMean(a); phi=a.map(v=>v-tau); }
  else if (estimand==="ATT"){ const a=units.map((u,i)=>{ const m0=pr(b0,u), p=ps[i]; return u.d*(u.y-m0) - (1-u.d)*p/(1-p)*(u.y-m0); }); tau=ciMean(a)/pT; phi=units.map((u,i)=>(a[i]-u.d*tau)/pT); }
  else { const a=units.map((u,i)=>{ const m1=pr(b1,u), p=ps[i]; return (1-u.d)*(m1-u.y) + u.d*(1-p)/p*(u.y-m1); }); tau=ciMean(a)/(1-pT); phi=units.map((u,i)=>(a[i]-(1-u.d)*tau)/(1-pT)); }
  const se=Math.sqrt(ciMean(phi.map(v=>v*v))/N);
  return ciResult("Doubly robust (AIPW)", estimand, tau, se, { nT:units.filter(u=>u.d).length, nC:units.filter(u=>!u.d).length, note:"Consistent if either the outcome model or the propensity model is correct." });
};

// 7. Coarsened exact matching (Iacus, King & Porro 2012)
const ciCEM = (units, covInfo, estimand="ATT", nBins=null) => {
  const k=units[0].b.length; const cuts=[];
  for (let j=0;j<k;j++){ const col=units.map(u=>u.b[j]); const uniq=[...new Set(col)]; if (uniq.length<=10){ cuts.push(null); continue; }
    const nb = nBins || Math.ceil(Math.log2(units.length))+1; const lo=Math.min(...col), hi=Math.max(...col); cuts.push(Array.from({length:nb-1},(_,i)=>lo+(hi-lo)*(i+1)/nb)); }
  const key=units.map(u=>u.b.map((v,j)=>cuts[j]? cuts[j].filter(c=>v>c).length : v).join("|")+"#"+u.ex);
  const S={}; units.forEach((u,i)=>{ const s=S[key[i]]||(S[key[i]]={t:0,c:0,n:0}); u.d? s.t++ : s.c++; s.n++; });
  const matched=units.map((u,i)=>S[key[i]].t>0 && S[key[i]].c>0);
  const mT=units.filter((u,i)=>matched[i]&&u.d).length, mC=units.filter((u,i)=>matched[i]&&!u.d).length, m=mT+mC;
  if (!mT||!mC) return { error:"CEM found no strata containing both treated and control units. Use fewer covariates or coarser bins." };
  const weights=units.map((u,i)=>{ if(!matched[i]) return 0; const s=S[key[i]];
    if (estimand==="ATT") return u.d? 1 : (mC/mT)*(s.t/s.c);
    if (estimand==="ATC") return u.d? (mT/mC)*(s.c/s.t) : 1;
    return u.d? (s.n/s.t)*(mT/m) : (s.n/s.c)*(mC/m); });
  const r=ciOLS(units.map(u=>[1,u.d]), units.map(u=>u.y), weights); if(!r) return { error:"CEM regression failed." };
  const nStrata=Object.values(S).filter(s=>s.t>0&&s.c>0).length; const totT=units.filter(u=>u.d).length;
  return { ...ciResult(`Coarsened exact matching (${nStrata} matched strata)`, mT<totT && estimand!=="ATC"? `feasible ${estimand}`: estimand, r.beta[1], r.se[1], { nT:mT, nC:mC,
    note: mT<totT? `${totT-mT} treated unit(s) fell in strata without controls and were pruned.` : null }), weights };
};

// ── run the full comparison ───────────────────────────────────────────────────────
const ciRunAll = (prep, cfg) => {
  const units=prep.units; const out={ results:[], warnings:[], diagnostics:{} };
  if (prep.nT<2||prep.nC<2){ out.error="Need at least two treated and two control units after dropping missing values."; return out; }
  const lg=ciPropensity(units); const ps0=lg.ps; const lin=lg.lin;
  if (!lg.converged) out.warnings.push("Propensity-score logit did not fully converge. Check for redundant or perfectly predictive covariates.");
  if (lg.separation) out.warnings.push(`${lg.nExtreme} unit(s) have estimated propensity scores of essentially 0 or 1 (separation). Common support is violated for them.`);
  // common support (min/max rule) and optional trimming
  const psT=units.map((u,i)=>u.d?ps0[i]:null).filter(v=>v!=null), psC=units.map((u,i)=>!u.d?ps0[i]:null).filter(v=>v!=null);
  const csLo=Math.max(Math.min(...psT),Math.min(...psC)), csHi=Math.min(Math.max(...psT),Math.max(...psC));
  const offSupport=units.filter((u,i)=>ps0[i]<csLo||ps0[i]>csHi).length;
  out.diagnostics={ ps:ps0, lin, logit:lg, csLo, csHi, offSupport };
  if (csLo>=csHi) out.warnings.push("Treated and control propensity scores do not overlap at all: no control resembles any treated unit on the covariates. Matching and weighting estimates are pure extrapolation here.");
  else if (offSupport) out.warnings.push(`${offSupport} unit(s) lie outside the region of common support [${csLo.toFixed(3)}, ${csHi.toFixed(3)}].`);
  const trim=cfg.trim||0; const keepIdx=units.map((u,i)=>!(trim>0 && (ps0[i]<trim||ps0[i]>1-trim)));
  const U=units.filter((_,i)=>keepIdx[i]); const PS=ps0.filter((_,i)=>keepIdx[i]); const LIN=lin.filter((_,i)=>keepIdx[i]);
  if (trim>0) out.warnings.push(`Trimming: ${units.length-U.length} unit(s) with propensity scores outside [${trim}, ${1-trim}] were dropped before estimation (Crump et al. 2009 rule).`);
  if (U.filter(u=>u.d).length<2||U.filter(u=>!u.d).length<2){ out.error="Too few treated or control units remain after trimming."; return out; }
  const E=cfg.estimand;
  const add=(r,w)=>{ if(!r||r.error){ if(r?.error) out.warnings.push(r.error); return; } const wFull=new Array(units.length).fill(0); let j=0; units.forEach((_,i)=>{ if(keepIdx[i]){ wFull[i]=w? w[j]:1; j++; } });
    r.balance=ciBalance(units, prep.balNames, wFull, E.replace("feasible ","")); r.L1=ciL1(units, wFull); r.weightsFull=wFull; out.results.push(r); };
  add({ ...ciNaive(units), weightsUnit:true }, null);
  out.results[0].balance=ciBalance(units, prep.balNames, units.map(()=>1), E); out.results[0].L1=ciL1(units, units.map(()=>1));
  add(ciRegAdj(U), null);
  { const rv=meOLSRobustness(U); out.sens=rv; const r=out.results[out.results.length-1]; if (r && r.method==="OLS with controls") r.note=`${r.note} Robustness value (Cinelli & Hazlett 2020): ${(100*rv.rv).toFixed(1)}% (to zero), ${(100*rv.rvAlpha).toFixed(1)}% (to insignificance).`; }
  const lgU = { ps:PS, mu:lg.mu, sd:lg.sd, b:lg.b };
  if (cfg.methods.subclass) { const r=ciSubclass(U, PS, E, cfg.strata||5); add(r, r.weights); }
  if (cfg.methods.nn) { const r=ciNNMatch(U, { estimand:E, M:cfg.M||1, metric:cfg.metric||"mahalanobis", replace:cfg.replace!==false, biasAdj:cfg.biasAdj!==false, caliper:cfg.caliper||null, lin:LIN }); add(r, r.weights); }
  if (cfg.methods.psm) { const r=ciNNMatch(U, { estimand:E, M:cfg.M||1, metric:"ps", replace:cfg.replace!==false, biasAdj:false, caliper:cfg.caliper||null, lin:LIN });
    if (!r.error && (E==="ATE"||E==="ATT") && !r.droppedTargets){ const a=meAI2016(U, lgU, r.est, r.se, E); if (a && isFinite(a.se) && a.se>0){ const se0=r.se; Object.assign(r, ciResult(r.method, r.estimand, r.est, a.se), { note:`SE adjusted for estimating the propensity score (Abadie & Imbens 2016). Unadjusted Abadie–Imbens (2006) SE: ${ciFmt(se0)}.` }); r.aiAdjusted=true; } }
    else if (!r.error) r.note=[r.note, E==="ATC"? "The Abadie–Imbens (2016) adjustment is implemented for the ATE and ATT; this ATC SE treats the estimated score as known." : null].filter(Boolean).join(" ")||null;
    add(r, r.weights); }
  if (cfg.methods.ipw) { const est=ciIPWPoint(U, PS, E); const sw=meIPWSandwich(U, lgU, E);
    const r = cfg.ipwSE==="sandwich"? ciResult(`Normalized IPW${trim?` (trimmed ${trim}–${1-trim})`:""}`, E, est, sw.se, { nT:U.filter(u=>u.d).length, nC:U.filter(u=>!u.d).length, note:"Sandwich (M-estimation) SE that accounts for estimating the propensity score (Lunceford & Davidian 2004)." })
      : ciResult(`Normalized IPW${trim?` (trimmed ${trim}–${1-trim})`:""}`, E, est, NaN, { nT:U.filter(u=>u.d).length, nC:U.filter(u=>!u.d).length, pending:true, note:`SE from a bootstrap that re-estimates the propensity score in each replication. Sandwich (M-estimation) SE for comparison: ${ciFmt(sw.se)}.` });
    add(r, ciIPWWeights(U, PS, E)); if (cfg.ipwSE!=="sandwich"){ out.ipwIndex=out.results.length-1; out._ipw={U, start:lg.b}; } }
  if (cfg.methods.aipw) { add(ciAIPW(U, PS.map(p=>Math.min(Math.max(p,1e-6),1-1e-6)), E), ciIPWWeights(U, PS, E)); }
  if (cfg.methods.cem) { const r=ciCEM(U, prep.covInfo, E, cfg.cemBins||null); add(r, r.weights); }
  if (prep.nT<30) out.warnings.push(`Only ${prep.nT} treated units: matching estimates will be noisy and large-sample SEs may be unreliable.`);
  return out;
};

// Bootstrap SE for normalized IPW, run in chunks so the browser stays responsive. onProgress(done,total)
const ciBootstrapIPW = async (U, estimand, B=199, start, onProgress, seed=2026) => {
  const rng=ciRng(seed); const n=U.length; const ests=[];
  for (let b=0;b<B;b++){
    const s=[]; for (let i=0;i<n;i++) s.push(U[Math.floor(rng()*n)]);
    if (s.filter(u=>u.d).length<2||s.filter(u=>!u.d).length<2) continue;
    const lg=ciLogit(s.map(u=>u.x), s.map(u=>u.d), { start, maxIter:25 }); const ps=lg.ps.map(p=>Math.min(Math.max(p,1e-6),1-1e-6));
    const e=ciIPWPoint(s, ps, estimand); if (isFinite(e)) ests.push(e);
    if (b%10===9){ onProgress&&onProgress(b+1,B); await new Promise(r=>setTimeout(r,0)); }
  }
  const sorted=[...ests].sort((a,b)=>a-b);
  return { se:Math.sqrt(ciVarS(ests)), lo:ciQuantile(sorted,0.025), hi:ciQuantile(sorted,0.975), reps:ests.length };
};

// ── synthetic control (Abadie, Diamond & Hainmueller 2010) ────────────────────────
// Lawson–Hanson non-negative least squares: min ||A x - b|| s.t. x >= 0.  A: m x n (array of rows)
const ciNNLS = (A, b, maxIter=null) => {
  const m=A.length, n=A[0].length; const x=new Array(n).fill(0); const P=new Array(n).fill(false); const tol=1e-12;
  const resid=()=>b.map((bi,i)=>bi-A[i].reduce((s,a,j)=>s+a*x[j],0));
  const lsP=()=>{ const idx=[]; for (let j=0;j<n;j++) if(P[j]) idx.push(j); const k=idx.length; const G=Array.from({length:k},()=>new Array(k).fill(0)); const h=new Array(k).fill(0);
    for (let i=0;i<m;i++){ for (let a=0;a<k;a++){ const ai=A[i][idx[a]]; h[a]+=ai*b[i]; for (let c=a;c<k;c++) G[a][c]+=ai*A[i][idx[c]]; } }
    for (let a=0;a<k;a++){ for (let c=0;c<a;c++) G[a][c]=G[c][a]; G[a][a]+=1e-14; }
    const sol=ciSolve(G,h)||new Array(k).fill(0); const z=new Array(n).fill(0); idx.forEach((j,a)=>z[j]=sol[a]); return z; };
  for (let outer=0; outer<(maxIter||3*n); outer++){
    const r=resid(); const wv=new Array(n).fill(0); for (let j=0;j<n;j++){ let s=0; for (let i=0;i<m;i++) s+=A[i][j]*r[i]; wv[j]=s; }
    let jmax=-1, best=tol; for (let j=0;j<n;j++) if(!P[j] && wv[j]>best){ best=wv[j]; jmax=j; }
    if (jmax<0) break; P[jmax]=true;
    for (let inner=0; inner<3*n; inner++){
      const z=lsP(); let allPos=true; for (let j=0;j<n;j++) if(P[j] && z[j]<=tol){ allPos=false; break; }
      if (allPos){ for (let j=0;j<n;j++) x[j]=P[j]? z[j] : 0; break; }
      let alpha=Infinity; for (let j=0;j<n;j++) if(P[j] && z[j]<=tol){ const a=x[j]/(x[j]-z[j]); if (a<alpha) alpha=a; }
      for (let j=0;j<n;j++){ x[j]+=alpha*(z[j]-x[j]); if (P[j] && Math.abs(x[j])<=tol){ P[j]=false; x[j]=0; } }
    }
  }
  return x;
};
// Euclidean projection onto the probability simplex (Duchi et al. 2008)
const ciSimplexProj = (v) => { const u=[...v].sort((a,b)=>b-a); let css=0, th=0;
  for (let i=0;i<u.length;i++){ css+=u[i]; const t=(css-1)/(i+1); if (u[i]-t>0) th=t; } return v.map(x=>Math.max(x-th,0)); };
// min_w || z1 - Z0 w ||^2_V  s.t. w in simplex.   z1: K, Z0: K x J, v: K (diag of V)
const ciSynthW = (z1, Z0, v, iters=4000, w0=null, tol=1e-10) => {
  const K=z1.length, J=Z0[0].length; if (J===1) return [1];
  { // exact route: NNLS on [sqrt(V) Z0 ; lambda 1'] w = [sqrt(V) z1 ; lambda]
    const sv=v.map(q=>Math.sqrt(Math.max(q,0))); const A=Z0.map((row,k)=>row.map(a=>a*sv[k])); const b=z1.map((q,k)=>q*sv[k]);
    let sc=0; A.forEach(r=>r.forEach(a=>sc=Math.max(sc,Math.abs(a)))); const lam=1e4*(sc||1);
    const x=ciNNLS([...A, new Array(J).fill(lam)], [...b, lam]); const sx=x.reduce((p,q)=>p+q,0);
    if (sx>0 && isFinite(sx)){ w0=x.map(q=>q/sx); iters=Math.min(iters,300); }
  }
  // Q = Z0' V Z0, c = Z0' V z1
  const Q=Array.from({length:J},()=>new Array(J).fill(0)); const c=new Array(J).fill(0);
  for (let k=0;k<K;k++){ const vk=v[k]; const row=Z0[k]; for (let a=0;a<J;a++){ c[a]+=vk*row[a]*z1[k]; const ra=vk*row[a]; if(!ra) continue; for (let b=a;b<J;b++) Q[a][b]+=ra*row[b]; } }
  for (let a=0;a<J;a++) for (let b=0;b<a;b++) Q[a][b]=Q[b][a];
  // Lipschitz constant via power iteration
  let x=new Array(J).fill(1/Math.sqrt(J)), L=0; for (let t=0;t<60;t++){ const y=Q.map(r=>r.reduce((s,q,j)=>s+q*x[j],0)); L=Math.sqrt(y.reduce((s,q)=>s+q*q,0))||1e-12; x=y.map(q=>q/L); }
  const step=1/(2*L); let w=w0? w0.slice() : new Array(J).fill(1/J), yk=w.slice(), tk=1;
  const grad=(w)=>Q.map((r,a)=>2*(r.reduce((s,q,j)=>s+q*w[j],0)-c[a]));
  for (let it=0; it<iters; it++){
    const g=grad(yk); const wn=ciSimplexProj(yk.map((q,j)=>q-step*g[j]));
    const tn=(1+Math.sqrt(1+4*tk*tk))/2; yk=wn.map((q,j)=>q+((tk-1)/tn)*(q-w[j]));
    let diff=0; for (let j=0;j<J;j++) diff=Math.max(diff,Math.abs(wn[j]-w[j])); w=wn; tk=tn; if (diff<tol && it>30) break;
  }
  return w;
};
const ciNelderMead = (f, x0, opts={}) => { const n=x0.length; const maxIt=opts.maxIter||200*n; let simplex=[x0.slice()];
  for (let i=0;i<n;i++){ const x=x0.slice(); x[i]+= (opts.step||1); simplex.push(x); } let fv=simplex.map(f);
  for (let it=0; it<maxIt; it++){
    const ord=fv.map((v,i)=>[v,i]).sort((a,b)=>a[0]-b[0]); simplex=ord.map(([,i])=>simplex[i]); fv=ord.map(([v])=>v);
    if (Math.abs(fv[n]-fv[0]) < 1e-10*(Math.abs(fv[0])+1e-12)) break;
    const cen=new Array(n).fill(0); for (let i=0;i<n;i++) for (let j=0;j<n;j++) cen[j]+=simplex[i][j]/n;
    const xr=cen.map((c,j)=>c+(c-simplex[n][j])); const fr=f(xr);
    if (fr<fv[0]){ const xe=cen.map((c,j)=>c+2*(xr[j]-c)); const fe=f(xe); if (fe<fr){ simplex[n]=xe; fv[n]=fe; } else { simplex[n]=xr; fv[n]=fr; } }
    else if (fr<fv[n-1]){ simplex[n]=xr; fv[n]=fr; }
    else { const xc=cen.map((c,j)=>c+0.5*(simplex[n][j]-c)); const fc=f(xc);
      if (fc<fv[n]){ simplex[n]=xc; fv[n]=fc; } else { for (let i=1;i<=n;i++){ simplex[i]=simplex[i].map((v,j)=>simplex[0][j]+0.5*(v-simplex[0][j])); fv[i]=f(simplex[i]); } } }
  }
  const best=fv.indexOf(Math.min(...fv)); return { x:simplex[best], f:fv[best] };
};
// Fill interior gaps by linear interpolation; returns null if the series has missing ends inside the window
const ciInterp = (vals) => { const v=vals.slice(); const idx=v.map((x,i)=>x==null||isNaN(x)? -1 : i).filter(i=>i>=0);
  if (!idx.length || idx[0]!==0 || idx[idx.length-1]!==v.length-1) return null;
  for (let i=1;i<v.length;i++) if (v[i]==null||isNaN(v[i])){ let j=i; while(v[j]==null||isNaN(v[j])) j++; for (let t=i;t<j;t++) v[t]=v[i-1]+(v[j]-v[i-1])*(t-i+1)/(j-i+1); i=j; }
  return v; };

// panel: {units:[{id,name,y:[...], cov:{name:value}}], years:[...]}, treatedId, t0Year
// mode: 'outcome' (V = identity over every pre-period outcome) | 'nested' (covariates + outcome lags, V by Nelder–Mead)
const ciSynthFit = (Y1, Y0, preIdx, P1=null, P0=null, mode="outcome", fixedV=null) => {
  const pre=(row)=>preIdx.map(t=>row[t]);
  if (mode==="outcome" || !P1 || !P1.length){
    const z1=pre(Y1), Z0=preIdx.map(t=>Y0.map(r=>r[t])); const w=ciSynthW(z1, Z0, new Array(z1.length).fill(1)); return { w, v:null };
  }
  // predictors: rows = predictors, cols = units. scale each predictor by its SD across all units (as Synth does)
  const K=P1.length; const sd=P1.map((p,k)=>{ const a=[p,...P0[k]]; return Math.sqrt(ciVarS(a))||1; });
  const z1=P1.map((p,k)=>p/sd[k]); const Z0=P0.map((r,k)=>r.map(x=>x/sd[k]));
  const Ypre1=pre(Y1), Ypre0=preIdx.map(t=>Y0.map(r=>r[t]));
  const loss=(w)=>{ let s=0; for (let t=0;t<Ypre1.length;t++){ let yh=0; for (let j=0;j<w.length;j++) yh+=Ypre0[t][j]*w[j]; s+=(Ypre1[t]-yh)**2; } return s/Ypre1.length; };
  if (fixedV) return { w: ciSynthW(z1, Z0, fixedV), v: fixedV };
  const toV=(x)=>{ const e=[1,...x.map(Math.exp)]; const s=e.reduce((a,b)=>a+b,0); return e.map(q=>q/s); };
  const f=(x)=>loss(ciSynthW(z1, Z0, toV(x), 300, null, 1e-10));
  // start from equal weights and from "regression" style weights, keep the better
  // multi-start Nelder–Mead over log V (Synth-style): equal weights, then regression-based start (|beta| of pre-outcome mean on predictors)
  const starts=[new Array(K-1).fill(0)];
  { const yb=[ciMean(Ypre1), ...Z0[0].map((_,j)=>ciMean(Ypre0.map(r=>r[j])))]; const Xr=yb.map((_,u)=>[1, ...z1.map((q,k)=> u===0? q : Z0[k][u-1])]);
    const ols=ciOLS(Xr, yb); if (ols){ const bb=ols.beta.slice(1).map(q=>Math.abs(q)+1e-6); starts.push(bb.slice(1).map(q=>Math.log(q/bb[0]))); } }
  let r={ f:Infinity };
  for (const s0 of starts){ let rr=ciNelderMead(f, s0, { maxIter: 40*K, step: 1.5 }); const r2=ciNelderMead(f, rr.x, { maxIter: 20*K, step: 0.5 }); if (r2.f<rr.f) rr=r2; if (rr.f<r.f) r=rr; }
  const v=toV(r.x); return { w: ciSynthW(z1, Z0, v), v };
};
const ciRmspe = (a,b,idx) => Math.sqrt(ciMean(idx.map(t=>(a[t]-b[t])**2)));

// Full analysis with in-space placebos and leave-one-out
const ciSynthRun = (panel, treatedId, t0Year, opts={}) => {
  const { mode="outcome", predictors=[], placebo=true, loo=true } = opts;
  const years=panel.years; const t0=years.indexOf(t0Year); if (t0<2) return { error:"Need at least 2 pre-treatment years before the treatment year." };
  if (t0>=years.length) return { error:"Treatment year is outside the data window." };
  const preIdx=years.map((_,i)=>i).filter(i=>i<t0), postIdx=years.map((_,i)=>i).filter(i=>i>=t0);
  const units=panel.units; const tr=units.find(u=>u.id===treatedId); if(!tr) return { error:"Treated unit has no complete data in this window." };
  const donors=units.filter(u=>u.id!==treatedId); if (donors.length<2) return { error:"Need at least two donor units with complete data." };
  // predictors measured over a window of pre-period indices (whole pre-period by default; CV uses sub-windows)
  const predRow=(u, win=preIdx)=>predictors.map(p=>{ if (p.type==="lag"){ if (win===preIdx && p.year!=null) return u.y[years.indexOf(p.year)]; const pos=p.pos==="first"? 0 : p.pos==="mid"? Math.floor(win.length/2) : win.length-1; return u.y[win[pos]]; }
    if (p.type==="preMean") return ciMean(win.map(t=>u.y[t]));
    if (u.covY?.[p.name] && win!==preIdx){ const v=win.map(t=>u.covY[p.name][years[t]]).filter(x=>x!=null&&isFinite(x)); if (v.length) return ciMean(v); }
    return u.cov?.[p.name]; });
  const usePred = mode==="nested" && predictors.length>0;
  let cvInfo=null, win=preIdx, cvV=null;
  if (usePred && opts.vMethod==="cv"){ const trU=units.find(u=>u.id===treatedId); const cv=meSynthCV(trU, units.filter(u=>u.id!==treatedId), preIdx, (u,ix)=>predRow(u,ix));
    if (cv){ cvV=cv.V; win=cv.valYears; cvInfo={ train:[years[cv.trainYears[0]], years[cv.trainYears[cv.trainYears.length-1]]], val:[years[cv.valYears[0]], years[cv.valYears[cv.valYears.length-1]]], valMSPE:cv.valMSPE }; } }
  const fitFor=(tUnit, pool, fixedV)=>{ fixedV = fixedV || cvV;
    const P1=usePred? predRow(tUnit, win) : null; const P0=usePred? predictors.map((_,k)=>pool.map(u=>predRow(u, win)[k])) : null;
    const { w, v }=ciSynthFit(tUnit.y, pool.map(u=>u.y), preIdx, P1, P0, usePred? "nested":"outcome", fixedV);
    const synth=years.map((_,t)=>pool.reduce((s,u,j)=>s+u.y[t]*w[j],0));
    const gap=tUnit.y.map((y,t)=>y-synth[t]); const pre=ciRmspe(tUnit.y,synth,preIdx), post=ciRmspe(tUnit.y,synth,postIdx);
    return { w, v, synth, gap, preRMSPE:pre, postRMSPE:post, ratio: pre>0? post/pre : Infinity }; };
  const main=fitFor(tr, donors);
  const att=ciMean(postIdx.map(t=>main.gap[t]));
  const weights=donors.map((u,j)=>({ id:u.id, name:u.name, w:main.w[j] })).sort((a,b)=>b.w-a.w);
  // predictor balance
  const balRows=[]; const preMean=(u)=>ciMean(preIdx.map(t=>u.y[t]));
  balRows.push({ name:"Outcome, pre-period mean", treated:preMean(tr), synthetic:donors.reduce((s,u,j)=>s+preMean(u)*main.w[j],0), donorAvg:ciMean(donors.map(preMean)) });
  predictors.filter(p=>p.type==="cov").forEach(p=>{ const vals=donors.map(u=>u.cov?.[p.name]); balRows.push({ name:p.label||p.name, treated:tr.cov?.[p.name], synthetic:vals.reduce((s,v,j)=>s+(v??0)*main.w[j],0), donorAvg:ciMean(vals.filter(v=>v!=null)) }); });
  const res={ years, t0Year, preIdx, postIdx, treated:{ id:tr.id, name:tr.name, y:tr.y }, ...main, att, weights, balance:balRows, v:main.v, donors:donors.map(u=>u.id), placebos:[], loo:[], cv:cvInfo };
  if (placebo){
    const fixedV=main.v; // reuse the treated unit's V for placebo runs (keeps runtime manageable)
    for (const d of donors){ const pool=donors.filter(u=>u.id!==d.id); if (pool.length<2) continue; const r=fitFor(d, pool, fixedV);
      res.placebos.push({ id:d.id, name:d.name, gap:r.gap, preRMSPE:r.preRMSPE, postRMSPE:r.postRMSPE, ratio:r.ratio }); }
    const all=[{ id:tr.id, ratio:main.ratio }, ...res.placebos.map(p=>({ id:p.id, ratio:p.ratio }))].sort((a,b)=>b.ratio-a.ratio);
    res.rank=all.findIndex(a=>a.id===tr.id)+1; res.pValue=res.rank/all.length; res.nPlacebo=res.placebos.length;
  }
  if (loo){ weights.filter(x=>x.w>0.01).forEach(x=>{ const pool=donors.filter(u=>u.id!==x.id); if (pool.length<2) return; const r=fitFor(tr, pool, main.v); res.loo.push({ dropped:x.name, synth:r.synth, preRMSPE:r.preRMSPE, att:ciMean(postIdx.map(t=>r.gap[t])) }); }); }
  return res;
};
// filter placebo set by pre-period fit (ADH 2010 drop placebos with pre-MSPE > m times the treated unit's)
const ciSynthPValue = (res, mult) => { if (!res.placebos?.length) return { p:NaN, rank:NaN, n:0 };
  const keep=res.placebos.filter(p=> !mult || (p.preRMSPE**2) <= mult*(res.preRMSPE**2));
  const all=[{ id:"__t", ratio:res.ratio }, ...keep.map(p=>({ id:p.id, ratio:p.ratio }))].sort((a,b)=>b.ratio-a.ratio);
  const rank=all.findIndex(a=>a.id==="__t")+1; return { p:rank/all.length, rank, n:all.length, keep };
};

// >>> RESEARCH METHODS ENGINE (generated from engine/*.js) >>>
// ══════════════════════════════════════════════
// RESEARCH METHODS ENGINE (me*): shared numerics
// ══════════════════════════════════════════════
const meInvNorm = (p) => { // Acklam's inverse normal CDF (|rel. error| < 1.2e-9)
  if (p<=0) return -Infinity; if (p>=1) return Infinity;
  const a=[-39.69683028665376,220.9460984245205,-275.9285104469687,138.3577518672690,-30.66479806614716,2.506628277459239],
        b=[-54.47609879822406,161.5858368580409,-155.6989798598866,66.80131188771972,-13.28068155288572],
        c=[-0.007784894002430293,-0.3223964580411365,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783],
        d=[0.007784695709041462,0.3224671290700398,2.445134137142996,3.754408661907416];
  const pl=0.02425; let q,r;
  if (p<pl){ q=Math.sqrt(-2*Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  if (p>1-pl){ q=Math.sqrt(-2*Math.log(1-p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  q=p-0.5; r=q*q; return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
};
// accurate normal CDF (W. J. Cody erfc), used where tail p-values matter
const meNormCdf = (z) => { const x=Math.abs(z)/Math.SQRT2; const t=1/(1+0.5*x);
  const y=t*Math.exp(-x*x-1.26551223+t*(1.00002368+t*(0.37409196+t*(0.09678418+t*(-0.18628806+t*(0.27886807+t*(-1.13520398+t*(1.48851587+t*(-0.82215223+t*0.17087277)))))))));
  return z>=0? 1-y/2 : y/2; };
const mePval = (est, se) => (se>0 && isFinite(se) && isFinite(est)) ? Math.min(1, 2*(1-meNormCdf(Math.abs(est/se)))) : NaN;
// log-gamma and regularized incomplete beta / gamma (Numerical Recipes) for t, F and chi-square tails
const meLnGamma = (x) => { const g=[76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];
  let y=x, tmp=x+5.5; tmp-=(x+0.5)*Math.log(tmp); let ser=1.000000000190015; for (let j=0;j<6;j++) ser+=g[j]/++y; return -tmp+Math.log(2.5066282746310005*ser/x); };
const meBetaCF = (a,b,x) => { const FPMIN=1e-300; let qab=a+b, qap=a+1, qam=a-1, c=1, d=1-qab*x/qap; if (Math.abs(d)<FPMIN) d=FPMIN; d=1/d; let h=d;
  for (let m=1;m<=300;m++){ const m2=2*m; let aa=m*(b-m)*x/((qam+m2)*(a+m2)); d=1+aa*d; if (Math.abs(d)<FPMIN) d=FPMIN; c=1+aa/c; if (Math.abs(c)<FPMIN) c=FPMIN; d=1/d; h*=d*c;
    aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2)); d=1+aa*d; if (Math.abs(d)<FPMIN) d=FPMIN; c=1+aa/c; if (Math.abs(c)<FPMIN) c=FPMIN; d=1/d; const del=d*c; h*=del; if (Math.abs(del-1)<3e-14) break; }
  return h; };
const meIncBeta = (a,b,x) => { if (x<=0) return 0; if (x>=1) return 1; const bt=Math.exp(meLnGamma(a+b)-meLnGamma(a)-meLnGamma(b)+a*Math.log(x)+b*Math.log(1-x));
  return x<(a+1)/(a+b+2)? bt*meBetaCF(a,b,x)/a : 1-bt*meBetaCF(b,a,1-x)/b; };
const meTPval = (t, df) => !isFinite(t)? NaN : (!isFinite(df)||df>1e6)? 2*(1-meNormCdf(Math.abs(t))) : meIncBeta(df/2, 0.5, df/(df+t*t)); // two-sided
const meFPval = (F, d1, d2) => !(F>=0)? NaN : meIncBeta(d2/2, d1/2, d2/(d2+d1*F)); // upper tail
const meGammaP = (a,x) => { if (x<=0) return 0; if (x<a+1){ let ap=a, sum=1/a, del=sum; for (let n=0;n<500;n++){ ap++; del*=x/ap; sum+=del; if (Math.abs(del)<Math.abs(sum)*3e-15) break; } return sum*Math.exp(-x+a*Math.log(x)-meLnGamma(a)); }
  let b=x+1-a, c=1e300, d=1/b, h=d; for (let i=1;i<500;i++){ const an=-i*(i-a); b+=2; d=an*d+b; if (Math.abs(d)<1e-300) d=1e-300; c=b+an/c; if (Math.abs(c)<1e-300) c=1e-300; d=1/d; const del=d*c; h*=del; if (Math.abs(del-1)<3e-15) break; }
  return 1-Math.exp(-x+a*Math.log(x)-meLnGamma(a))*h; };
const meChi2Pval = (x, k) => !(x>=0)? NaN : 1-meGammaP(k/2, x/2);
const meTQuant = (p, df) => { if (!isFinite(df)||df>1e6) return meInvNorm(p); let lo=-50, hi=50; for (let i=0;i<100;i++){ const m=(lo+hi)/2; const cdf = m<0? meTPval(m,df)/2 : 1-meTPval(m,df)/2; if (cdf<p) lo=m; else hi=m; } return (lo+hi)/2; };

// ── small matrix helpers (arrays of rows) ──
const meZeros = (r,c) => Array.from({length:r},()=>new Array(c).fill(0));
const meMatMul = (A,B) => { const n=A.length, m=B[0].length, k=B.length; const C=meZeros(n,m); for (let i=0;i<n;i++) for (let t=0;t<k;t++){ const a=A[i][t]; if (!a) continue; const Bt=B[t]; const Ci=C[i]; for (let j=0;j<m;j++) Ci[j]+=a*Bt[j]; } return C; };
const meTr = (A) => A[0].map((_,j)=>A.map(r=>r[j]));
const meMV = (A,x) => A.map(r=>{ let s=0; for (let j=0;j<x.length;j++) s+=r[j]*x[j]; return s; });
const meDot = (a,b) => { let s=0; for (let i=0;i<a.length;i++) s+=a[i]*b[i]; return s; };
const meQF = (x,A) => meDot(x, meMV(A,x)); // x' A x
// symmetric pseudo-inverse via eigen-decomposition (Jacobi), for rank-deficient covariance matrices
const meEigSym = (A0) => { const n=A0.length; const A=A0.map(r=>r.slice()); const V=meZeros(n,n); for (let i=0;i<n;i++) V[i][i]=1;
  for (let sweep=0; sweep<100; sweep++){ let off=0; for (let p=0;p<n;p++) for (let q=p+1;q<n;q++) off+=A[p][q]*A[p][q]; if (off<1e-22) break;
    for (let p=0;p<n;p++) for (let q=p+1;q<n;q++){ if (Math.abs(A[p][q])<1e-300) continue; const th=(A[q][q]-A[p][p])/(2*A[p][q]); const t=Math.sign(th||1)/(Math.abs(th)+Math.sqrt(th*th+1)); const c=1/Math.sqrt(t*t+1), s=t*c;
      for (let k=0;k<n;k++){ const akp=A[k][p], akq=A[k][q]; A[k][p]=c*akp-s*akq; A[k][q]=s*akp+c*akq; }
      for (let k=0;k<n;k++){ const apk=A[p][k], aqk=A[q][k]; A[p][k]=c*apk-s*aqk; A[q][k]=s*apk+c*aqk; }
      for (let k=0;k<n;k++){ const vkp=V[k][p], vkq=V[k][q]; V[k][p]=c*vkp-s*vkq; V[k][q]=s*vkp+c*vkq; } } }
  return { values:A.map((r,i)=>r[i]), vectors:V }; };
const mePinv = (A, tol=1e-10) => { const { values, vectors } = meEigSym(A); const mx=Math.max(...values.map(Math.abs))||1; const n=A.length; const P=meZeros(n,n); let rank=0;
  values.forEach((l,k)=>{ if (Math.abs(l)>tol*mx){ rank++; for (let i=0;i<n;i++) for (let j=0;j<n;j++) P[i][j]+=vectors[i][k]*vectors[j][k]/l; } }); P.rank=rank; return P; };

// ── OLS with HC1 or cluster-robust (CR1) variance ──
// X: rows (include an intercept column yourself). opts: { w, cluster: array of ids, dfK: extra parameters absorbed (fixed effects), clusterAdj }
const meOLS = (X, y, opts={}) => {
  const n=X.length, k=X[0].length, w=opts.w;
  const XtX=meZeros(k,k), Xty=new Array(k).fill(0);
  for (let i=0;i<n;i++){ const wi=w? w[i] : 1; if (!wi) continue; const xi=X[i]; for (let a=0;a<k;a++){ const v=wi*xi[a]; if (!v) continue; Xty[a]+=v*y[i]; for (let b=a;b<k;b++) XtX[a][b]+=v*xi[b]; } }
  for (let a=0;a<k;a++) for (let b=0;b<a;b++) XtX[a][b]=XtX[b][a];
  const inv=mePinv(XtX, 1e-12); const beta=meMV(inv, Xty); const rank=inv.rank;
  const resid=new Array(n); let ssr=0, nEff=0; for (let i=0;i<n;i++){ resid[i]=y[i]-meDot(X[i],beta); const wi=w? w[i]:1; if (wi){ ssr+=wi*resid[i]*resid[i]; nEff++; } }
  const meat=meZeros(k,k); let G=0;
  if (opts.cluster){ const sums=new Map(); for (let i=0;i<n;i++){ const wi=w? w[i]:1; if (!wi) continue; const g=opts.cluster[i]; let s=sums.get(g); if(!s){ s=new Array(k).fill(0); sums.set(g,s); } const e=wi*resid[i]; for (let a=0;a<k;a++) s[a]+=X[i][a]*e; }
    G=sums.size; sums.forEach(s=>{ for (let a=0;a<k;a++){ if (!s[a]) continue; for (let b=0;b<k;b++) meat[a][b]+=s[a]*s[b]; } }); }
  else { for (let i=0;i<n;i++){ const wi=w? w[i]:1; if (!wi) continue; const e2=wi*wi*resid[i]*resid[i]; const xi=X[i]; for (let a=0;a<k;a++){ const v=xi[a]*e2; if (!v) continue; for (let b=0;b<k;b++) meat[a][b]+=v*xi[b]; } } }
  const K=rank+(opts.dfK||0);
  const adj = opts.cluster? (G/(G-1))*((nEff-1)/Math.max(1,nEff-K)) : nEff/Math.max(1,nEff-K);
  const V=meMatMul(meMatMul(inv,meat),inv).map(r=>r.map(v=>v*adj));
  const se=V.map((r,j)=>Math.sqrt(Math.max(0,r[j])));
  const df = opts.cluster? G-1 : nEff-K;
  return { beta, V, se, resid, n:nEff, k:rank, K, G, df, ssr, sigma2: ssr/Math.max(1,nEff-K), XtXinv:inv, t: beta.map((b,j)=>b/se[j]), p: beta.map((b,j)=>meTPval(b/se[j], df)) };
};
// Wald test of R b = 0 for selected coefficient indices; returns chi2, F, p-values
const meWald = (beta, V, idx, dfDen=Infinity) => { const b=idx.map(i=>beta[i]); const S=idx.map(i=>idx.map(j=>V[i][j])); const Si=mePinv(S); const W=meQF(b,Si); const q=Si.rank||idx.length;
  return { chi2:W, df:q, pChi2:meChi2Pval(W,q), F:W/q, pF: isFinite(dfDen)? meFPval(W/q, q, dfDen) : meChi2Pval(W,q) }; };

// ── two-way (unit, time) demeaning by alternating projections (works for unbalanced panels) ──
// cols: array of value arrays (length n). Returns demeaned copies.
const meDemean = (cols, fes, w=null, tol=1e-10, maxIter=5000) => {
  const n=cols[0]?.length||0; const out=cols.map(c=>Float64Array.from(c));
  const groups=fes.map(f=>{ const idx=new Map(); const g=new Int32Array(n); f.forEach((v,i)=>{ let k=idx.get(v); if (k==null){ k=idx.size; idx.set(v,k); } g[i]=k; }); return { g, m:idx.size }; });
  const wts=groups.map(({g,m})=>{ const s=new Float64Array(m); for (let i=0;i<n;i++) s[g[i]]+=w? w[i]:1; return s; });
  for (const c of out){
    for (let it=0; it<maxIter; it++){ let delta=0;
      groups.forEach(({g,m},f)=>{ const s=new Float64Array(m); for (let i=0;i<n;i++) s[g[i]]+=(w? w[i]:1)*c[i]; for (let q=0;q<m;q++) s[q]/=wts[f][q]||1; for (let i=0;i<n;i++){ const d=s[g[i]]; c[i]-=d; if (Math.abs(d)>delta) delta=Math.abs(d); } });
      if (fes.length===1 || delta<tol) break; }
  }
  return { cols: out.map(c=>Array.from(c)), levels: groups.map(g=>g.m) };
};
// Regression with absorbed fixed effects: y on X (no intercept) after demeaning by fes. Cluster-robust by `cluster`.
// FE nested in the cluster variable are not counted in the small-sample K (fixest "nested" convention).
const meFEReg = (y, Xcols, fes, cluster, w=null, nestedFE=[0]) => {
  const dm=meDemean([y, ...Xcols], fes, w); const yd=dm.cols[0]; const Xd=yd.map((_,i)=>dm.cols.slice(1).map(c=>c[i]));
  const all = dm.levels.reduce((s,m,f)=>s+m-(f? 1:0),0);
  // fixest convention: FE nested in the cluster variable are not counted; the remaining FE count fully, less one per extra dimension
  const nonNested = dm.levels.filter((_,f)=>!nestedFE.includes(f)); const dfK = cluster? nonNested.reduce((s,m)=>s+m,0) - Math.max(0, nonNested.length-1) - (nonNested.length===dm.levels.length? 1 : 0) : all;
  const r = meOLS(Xd, yd, { cluster, w, dfK }); r.yd=yd; r.Xd=Xd; return r;
};
const meSeqMean = (a) => { let s=0, n=0; for (const v of a){ if (v!=null && isFinite(v)){ s+=v; n++; } } return n? s/n : NaN; };
const meSd = (a) => { const m=meSeqMean(a); let s=0, n=0; for (const v of a){ if (v!=null && isFinite(v)){ s+=(v-m)**2; n++; } } return n>1? Math.sqrt(s/(n-1)) : NaN; };
const meShuffle = (arr, rng) => { const a=arr.slice(); for (let i=a.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
const meFolds = (n, K, rng, strata=null) => { // stratified by a 0/1 vector when given
  const f=new Int32Array(n); if (strata){ [0,1].forEach(s=>{ const idx=meShuffle([...Array(n).keys()].filter(i=>strata[i]===s), rng); idx.forEach((i,q)=>f[i]=q%K); }); }
  else meShuffle([...Array(n).keys()], rng).forEach((i,q)=>f[i]=q%K); return f; };
const meResult = (method, estimand, est, se, extra={}) => { const crit = extra.df && isFinite(extra.df) ? meTQuant(0.975, extra.df) : 1.959963984540054;
  return { method, estimand, est, se, lo: est-crit*se, hi: est+crit*se, p: extra.df && isFinite(extra.df)? meTPval(est/se, extra.df) : mePval(est,se), ...extra }; };

// ══════════════════════════════════════════════
// DIFFERENCE-IN-DIFFERENCES: 2x2, TWFE, event study, Callaway–Sant'Anna, imputation, Bacon decomposition
// ══════════════════════════════════════════════
// Build a unit × time panel from a long table.
// spec: { unit, time, y, treat: "first"|"dummy", g (first-treated column), d (0/1 column), covs:[...] }
const meDidPanel = (headers, rows, spec) => {
  const ix=Object.fromEntries(headers.map((h,i)=>[h,i])); const num=(v)=>{ const s=String(v??"").trim(); if(!s||/^(na|nan|null|\.|-|inf)$/i.test(s)) return null; const n=parseFloat(s.replace(/[$,%\s]/g,"")); return isFinite(n)? n : null; };
  const tval=(v)=>{ const p=typeof dsParseTime==="function"? dsParseTime(v) : null; if (p) return p.t; return num(v); };
  const U=new Map(); const T=new Set(); const notes=[];
  rows.forEach(r=>{ const id=String(r[ix[spec.unit]]??"").trim(); const t=tval(r[ix[spec.time]]); if(!id||t==null) return; T.add(t);
    let u=U.get(id); if(!u){ u={ id, y:new Map(), d:new Map(), g:null, x:new Map() }; U.set(id,u); }
    u.y.set(t, num(r[ix[spec.y]]));
    if (spec.treat==="dummy") u.d.set(t, num(r[ix[spec.d]]));
    else { const gv=String(r[ix[spec.g]]??"").trim(); const gn=tval(gv); if (u.g==null) u.g = (gn==null||gn===0)? Infinity : gn; }
    (spec.covs||[]).forEach(c=>{ const v=num(r[ix[c]]); if (v!=null && !u.x.has(c+"@"+t)) u.x.set(c+"@"+t, v); });
  });
  const times=[...T].sort((a,b)=>a-b); let nonAbs=0;
  if (spec.treat==="dummy") U.forEach(u=>{ let first=Infinity, on=false, off=false; times.forEach(t=>{ const d=u.d.get(t); if (d==1){ if (first===Infinity) first=t; on=true; } else if (d===0 && on) off=true; }); if (off) nonAbs++; u.g=first; });
  if (nonAbs) notes.push(`${nonAbs} unit(s) switch treatment off again. These designs treat the first switch-on as permanent (absorbing); for on/off treatments use de Chaisemartin–D'Haultfœuille.`);
  const ids=[...U.keys()]; const Y=ids.map(id=>times.map(t=>{ const v=U.get(id).y.get(t); return v==null? NaN : v; }));
  const G=ids.map(id=>U.get(id).g ?? Infinity);
  // covariates: value in the first period the unit is observed (pre-treatment by construction for later cohorts)
  const covs=spec.covs||[]; const X = covs.length? ids.map(id=>{ const u=U.get(id); return covs.map(c=>{ for (const t of times){ const v=u.x.get(c+"@"+t); if (v!=null) return v; } return NaN; }); }) : null;
  return { ids, times, Y, G, X, covNames:covs, notes };
};
// Keep units observed in every period (balanced panel), as did::att_gt does by default
const meDidBalance = (P) => { const keep=P.ids.map((_,i)=>P.Y[i].every(v=>isFinite(v)) && (!P.X || P.X[i].every(v=>isFinite(v))));
  const k=(a)=>a? a.filter((_,i)=>keep[i]) : a; return { ...P, ids:k(P.ids), Y:k(P.Y), G:k(P.G), X:k(P.X), dropped: keep.filter(v=>!v).length }; };
const meCohorts = (P) => { const c=new Map(); P.G.forEach(g=>c.set(g,(c.get(g)||0)+1)); return [...c.entries()].sort((a,b)=>a[0]-b[0]).map(([g,n])=>({ g, n })); };

// ── logit for DRDID (no standardisation, returns (X'WX)^-1) ──
const meLogitRaw = (X, d) => { const n=X.length, k=X[0].length; let b=new Array(k).fill(0); const mu=meSeqMean(d); b[0]=Math.log(Math.max(mu,1e-6)/Math.max(1-mu,1e-6));
  let H=null; for (let it=0; it<100; it++){ H=meZeros(k,k); const g=new Array(k).fill(0);
    for (let i=0;i<n;i++){ const eta=meDot(X[i],b); const p=1/(1+Math.exp(-eta)); const w=p*(1-p); for (let a=0;a<k;a++){ g[a]+=X[i][a]*(d[i]-p); for (let c=a;c<k;c++) H[a][c]+=w*X[i][a]*X[i][c]; } }
    for (let a=0;a<k;a++) for (let c=0;c<a;c++) H[a][c]=H[c][a];
    const step=meMV(mePinv(H,1e-13), g); let mx=0; for (let j=0;j<k;j++){ b[j]+=step[j]; mx=Math.max(mx,Math.abs(step[j])); } if (mx<1e-10) break; }
  const p=X.map(x=>1/(1+Math.exp(-meDot(x,b)))); const Hn=meZeros(k,k); for (let i=0;i<n;i++){ const w=p[i]*(1-p[i]); for (let a=0;a<k;a++) for (let c=0;c<k;c++) Hn[a][c]+=w*X[i][a]*X[i][c]; }
  return { b, p, vcov: mePinv(Hn,1e-13) }; };

// Sant'Anna & Zhao (2020) doubly robust DiD for panel data (DRDID::drdid_panel), with its influence function.
const meDRDID = (dy, D, Xint) => {
  const n=dy.length, k=Xint[0].length; const ps=meLogitRaw(Xint, D); const p=ps.p.map(v=>Math.min(v,1-1e-16));
  const trim=p.map((v,i)=> D[i]? 1 : (v<0.995? 1:0));
  const ctrl=[...Array(n).keys()].filter(i=>!D[i]); const ols=meOLS(ctrl.map(i=>Xint[i]), ctrl.map(i=>dy[i])); const beta=ols.beta;
  const od=Xint.map(x=>meDot(x,beta));
  const wT=D.map(d=>d), wC=p.map((v,i)=>trim[i]*v*(1-D[i])/(1-v));
  const aT=dy.map((y,i)=>wT[i]*(y-od[i])), aC=dy.map((y,i)=>wC[i]*(y-od[i]));
  const mwT=meSeqMean(wT), mwC=meSeqMean(wC); const etaT=meSeqMean(aT)/mwT, etaC=meSeqMean(aC)/mwC; const att=etaT-etaC;
  // influence function
  const XpX=meZeros(k,k); for (const i of ctrl) for (let a=0;a<k;a++) for (let c=0;c<k;c++) XpX[a][c]+=Xint[i][a]*Xint[i][c]/n;
  const XpXi=mePinv(XpX,1e-13);
  const linW = Xint.map((x,i)=> D[i]? new Array(k).fill(0) : meMV(XpXi, x.map(v=>v*(dy[i]-od[i])))); // asy.lin.rep.wols (rows)
  const Hps = ps.vcov.map(r=>r.map(v=>v*n));
  const linP = Xint.map((x,i)=> meMV(Hps, x.map(v=>v*(D[i]-ps.p[i])))); // asy.lin.rep.ps
  const M1=new Array(k).fill(0), M2=new Array(k).fill(0), M3=new Array(k).fill(0);
  for (let i=0;i<n;i++) for (let a=0;a<k;a++){ M1[a]+=wT[i]*Xint[i][a]/n; M2[a]+=wC[i]*(dy[i]-od[i]-etaC)*Xint[i][a]/n; M3[a]+=wC[i]*Xint[i][a]/n; }
  const inf=new Array(n);
  for (let i=0;i<n;i++){ const iT=(aT[i]-wT[i]*etaT - meDot(linW[i],M1))/mwT; const iC=(aC[i]-wC[i]*etaC + meDot(linP[i],M2) - meDot(linW[i],M3))/mwC; inf[i]=iT-iC; }
  return { att, inf };
};

// Callaway & Sant'Anna (2021) group-time ATTs with the did package's conventions.
// opts: { control:"never"|"notyet", anticipation:0, base:"varying"|"universal", useCovs:false }
const meCSattgt = (P0, opts={}) => {
  const { control="never", anticipation:ant=0, base="varying", useCovs=false } = opts; const notes=[];
  let P={ ...P0, G:P0.G.slice() }; let times=P.times.slice();
  // cohorts first treated after the last period behave as never treated
  P.G=P.G.map(g=> g>times[times.length-1]+ant? Infinity : g);
  let glist=[...new Set(P.G.filter(isFinite))].sort((a,b)=>a-b); let tKeep=times.map(()=>true);
  if (!P.G.some(g=>!isFinite(g))){ const latest=glist[glist.length-1]; const cut=latest-ant;
    notes.push(control==="never"? `No never-treated units: the last cohort (${latest}) is used as the comparison group and periods from ${cut} on are dropped.` : `No never-treated units: periods from ${cut} on are dropped and the last cohort serves only as a not-yet-treated control.`);
    tKeep=times.map(t=>t<cut); if (control==="never") P.G=P.G.map(g=>g===latest? Infinity : g); glist=glist.filter(g=>g<latest); }
  const tIdx=times.map((t,i)=>tKeep[i]? i : -1).filter(i=>i>=0); times=tIdx.map(i=>times[i]); const Ysub=P.Y.map(r=>tIdx.map(i=>r[i]));
  glist=glist.filter(g=>g>times[0]+ant);
  const firstTreated=P.G.map(g=>isFinite(g) && g<=times[0]+ant); const nFirst=firstTreated.filter(Boolean).length;
  if (nFirst) notes.push(`Dropped ${nFirst} unit(s) already treated in the first period${ant?` (anticipation ${ant})`:""}.`);
  const keepU=P.G.map((_,i)=>!firstTreated[i]); const ids=P.ids.filter((_,i)=>keepU[i]); const Y=Ysub.filter((_,i)=>keepU[i]); const G=P.G.filter((_,i)=>keepU[i]); const X=P.X? P.X.filter((_,i)=>keepU[i]) : null;
  const n=ids.length; const nT=times.length; const tfac = base==="universal"? 0 : 1; const cells=[]; const IF=[];
  for (const g of glist){
    const preIdx=times.map((t,i)=>t+ant<g? i : -1).filter(i=>i>=0); const pretG=preIdx.length? preIdx[preIdx.length-1] : null;
    if (pretG==null){ notes.push(`Cohort ${g} has no pre-treatment period and is dropped.`); continue; }
    for (let t=0; t<nT-tfac; t++){
      const cur=t+tfac; let pret = base==="universal"? pretG : t; if (g<=times[cur]) pret=pretG;
      if (base==="universal" && pret===cur){ cells.push({ g, t:times[cur], e:times[cur]-g, att:0, post:0, ref:true, n1:0 }); IF.push(new Float64Array(n)); continue; }
      const thr=times[Math.max(t,pret)+tfac]+ant;
      const inG=G.map(v=>v===g), inC=G.map(v=> control==="never"? !isFinite(v) : (!isFinite(v) || (v>thr && v!==g)));
      const sub=[...Array(n).keys()].filter(i=>inG[i]||inC[i]); const n1=sub.length;
      const dy=sub.map(i=>Y[i][cur]-Y[i][pret]); const D=sub.map(i=>inG[i]?1:0);
      if (!D.some(Boolean) || D.every(Boolean)){ cells.push({ g, t:times[cur], e:times[cur]-g, att:NaN, post: g<=times[cur]?1:0, n1 }); IF.push(new Float64Array(n)); continue; }
      const Xint=sub.map(i=>[1, ...(useCovs&&X? X[i] : [])]);
      const r=meDRDID(dy, D, Xint);
      const inf=new Float64Array(n); sub.forEach((i,q)=>inf[i]=(n/n1)*r.inf[q]);
      cells.push({ g, t:times[cur], e:times[cur]-g, att:r.att, post: g<=times[cur]?1:0, n1, base:times[pret] }); IF.push(inf);
    }
  }
  const se=IF.map(f=>{ let s=0; for (let i=0;i<n;i++) s+=f[i]*f[i]; return Math.sqrt(s/n)/Math.sqrt(n); });
  cells.forEach((c,j)=>{ c.se=c.ref? NaN : se[j]; });
  // Wald pre-test of parallel trends on pre-treatment ATT(g,t)
  const preJ=cells.map((c,j)=>(!c.post && !c.ref && isFinite(c.att))? j : -1).filter(j=>j>=0); let pretest=null;
  if (preJ.length){ const V=preJ.map(a=>preJ.map(b=>{ let s=0; for (let i=0;i<n;i++) s+=IF[a][i]*IF[b][i]; return s/n/n; })); const w=meWald(cells.map(c=>c.att), (()=>{ const M=meZeros(cells.length,cells.length); preJ.forEach((a,ia)=>preJ.forEach((b,ib)=>M[a][b]=V[ia][ib])); return M; })(), preJ); pretest={ W:w.chi2, df:w.df, p:w.pChi2 }; }
  const pg=new Map(); glist.forEach(g=>pg.set(g, G.filter(v=>v===g).length/n));
  return { cells, IF, n, G, glist, times, pg, ids, notes, pretest, opts:{ control, anticipation:ant, base, useCovs } };
};
// Aggregations (did::aggte): simple, group, dynamic, calendar. Returns estimates with analytic SEs and IFs.
const meCSaggte = (R, type, o={}) => {
  const { cells, IF, n, G, glist, pg } = R; const minE=o.minE??-Infinity, maxE=o.maxE??Infinity;
  const pgc=cells.map(c=>pg.get(c.g));
  const comb=(idx, wts, wifKeep)=>{ const f=new Float64Array(n); idx.forEach((j,q)=>{ const w=wts[q]; for (let i=0;i<n;i++) f[i]+=w*IF[j][i]; });
    if (wifKeep){ const S=idx.reduce((s,j)=>s+pgc[j],0); const cen=idx.map(j=>G.map(v=>(v===cells[j].g?1:0)-pgc[j])); const rs=new Float64Array(n); cen.forEach(c=>c.forEach((v,i)=>rs[i]+=v));
      idx.forEach((j,q)=>{ const a=cells[j].att; for (let i=0;i<n;i++) f[i]+=a*(cen[q][i]/S - rs[i]*pgc[j]/(S*S)); }); }
    return f; };
  const seOf=(f)=>{ let s=0; for (let i=0;i<n;i++) s+=f[i]*f[i]; return Math.sqrt(s/n)/Math.sqrt(n); };
  const wavg=(idx)=>{ const S=idx.reduce((s,j)=>s+pgc[j],0); return { est: idx.reduce((s,j)=>s+cells[j].att*pgc[j],0)/S, w: idx.map(j=>pgc[j]/S) }; };
  const ok=(j)=>isFinite(cells[j].att);
  const J=[...cells.keys()].filter(ok);
  if (type==="simple"){ const k=J.filter(j=>cells[j].g<=cells[j].t && cells[j].t<=cells[j].g+maxE); const a=wavg(k); const f=comb(k,a.w,true); return { overall:{ est:a.est, se:seOf(f), inf:f } }; }
  if (type==="group"){ const per=glist.map(g=>{ const k=J.filter(j=>cells[j].g===g && g<=cells[j].t && cells[j].t<=g+maxE); if (!k.length) return null; const w=k.map(()=>1/k.length); const f=comb(k,w,false); return { key:g, est:k.reduce((s,j)=>s+cells[j].att,0)/k.length, se:seOf(f), inf:f }; }).filter(Boolean);
    const S=per.reduce((s,x)=>s+pg.get(x.key),0); const est=per.reduce((s,x)=>s+x.est*pg.get(x.key),0)/S;
    const f=new Float64Array(n); per.forEach(x=>{ const w=pg.get(x.key)/S; for (let i=0;i<n;i++) f[i]+=w*x.inf[i]; });
    const cen=per.map(x=>G.map(v=>(v===x.key?1:0)-pg.get(x.key))); const rs=new Float64Array(n); cen.forEach(c=>c.forEach((v,i)=>rs[i]+=v));
    per.forEach((x,q)=>{ for (let i=0;i<n;i++) f[i]+=x.est*(cen[q][i]/S - rs[i]*pg.get(x.key)/(S*S)); });
    return { per, overall:{ est, se:seOf(f), inf:f } }; }
  if (type==="dynamic"){ const es=[...new Set(J.map(j=>cells[j].e))].filter(e=>e>=minE&&e<=maxE).sort((a,b)=>a-b);
    const per=es.map(e=>{ const k=J.filter(j=>cells[j].e===e); const a=wavg(k); const f=comb(k,a.w,true); return { key:e, est:a.est, se:seOf(f), inf:f }; });
    const pos=per.filter(x=>x.key>=0); const f=new Float64Array(n); pos.forEach(x=>{ for (let i=0;i<n;i++) f[i]+=x.inf[i]/pos.length; });
    return { per, overall:{ est: pos.reduce((s,x)=>s+x.est,0)/pos.length, se:seOf(f), inf:f } }; }
  if (type==="calendar"){ const ts=[...new Set(J.filter(j=>cells[j].g<=cells[j].t).map(j=>cells[j].t))].sort((a,b)=>a-b);
    const per=ts.map(t=>{ const k=J.filter(j=>cells[j].t===t && cells[j].g<=t); const a=wavg(k); const f=comb(k,a.w,true); return { key:t, est:a.est, se:seOf(f), inf:f }; });
    const f=new Float64Array(n); per.forEach(x=>{ for (let i=0;i<n;i++) f[i]+=x.inf[i]/per.length; });
    return { per, overall:{ est: per.reduce((s,x)=>s+x.est,0)/per.length, se:seOf(f), inf:f } }; }
  return null;
};
// Multiplier bootstrap (Mammen weights) for a simultaneous (uniform) critical value over a set of influence functions
const meUniformCrit = (infs, ses, B=999, seed=11, alpha=0.05) => { const rng=ciRng(seed); const n=infs[0].length; const k=infs.length; const a=(1-Math.sqrt(5))/2, b=(1+Math.sqrt(5))/2, pa=(Math.sqrt(5)+1)/(2*Math.sqrt(5));
  const mx=[]; const v=new Float64Array(n);
  for (let r=0;r<B;r++){ for (let i=0;i<n;i++) v[i]= rng()<pa? a : b; let m=0; for (let j=0;j<k;j++){ if (!(ses[j]>0)) continue; let s=0; const f=infs[j]; for (let i=0;i<n;i++) s+=v[i]*f[i]; const z=Math.abs(s/n)/ses[j]; if (z>m) m=z; } mx.push(m); }
  mx.sort((p,q)=>p-q); return Math.max(1.959963984540054, ciQuantile(mx, 1-alpha)); };

// ── TWFE: static and event study (relative-time dummies, reference k = -1), cluster-robust by unit ──
const meTWFE = (P, o={}) => {
  const { kMin=-Infinity, kMax=Infinity, cluster=true } = o; const N=P.ids.length, T=P.times.length;
  const obs=[]; for (let i=0;i<N;i++) for (let t=0;t<T;t++) if (isFinite(P.Y[i][t])) obs.push([i,t]);
  const y=obs.map(([i,t])=>P.Y[i][t]); const uid=obs.map(([i])=>i), tid=obs.map(([,t])=>t);
  const D=obs.map(([i,t])=> P.times[t]>=P.G[i]? 1:0);
  const stat=meFEReg(y, [D], [uid,tid], cluster? uid : null);
  const out={ static: meResult("TWFE (static)", "ATT*", stat.beta[0], stat.se[0], { df:stat.df, n:obs.length, G:stat.G }) };
  // event-time dummies
  const ev=obs.map(([i,t])=> isFinite(P.G[i])? P.times[t]-P.G[i] : null);
  const allE=[...new Set(ev.filter(e=>e!=null))].sort((a,b)=>a-b); const lo=Math.max(kMin, allE[0]), hi=Math.min(kMax, allE[allE.length-1]);
  const bin=(e)=> e==null? null : Math.max(lo, Math.min(hi, e));
  let ks=[...new Set(ev.filter(e=>e!=null).map(bin))].filter(k=>k!==-1).sort((a,b)=>a-b);
  const hasNever=P.G.some(g=>!isFinite(g)); let dropped=null;
  if (!hasNever && ks.length){ dropped=ks[0]; ks=ks.slice(1); } // without never-treated units a second normalisation is needed
  const Xcols=ks.map(k=>ev.map(e=>bin(e)===k? 1:0));
  const es=meFEReg(y, Xcols, [uid,tid], cluster? uid : null);
  const leads=ks.map((k,j)=>k<-1? j : -1).filter(j=>j>=0);
  const wald = leads.length? meWald(es.beta, es.V, leads, es.df) : null;
  out.event={ ks, coef: ks.map((k,j)=>({ k, est:es.beta[j], se:es.se[j], binned: (k===lo&&allE[0]<lo)||(k===hi&&allE[allE.length-1]>hi) })), pretrend: wald, dropped, df:es.df };
  return out;
};

// ── Borusyak, Jaravel & Spiess (2024) imputation estimator with their conservative clustered variance (eqs. 6, 8, 10),
// matching R didimputation: v* = -Z0 (Z0'Z0)^-1 Z1' w on untreated cells, residuals recentred by cohort x event-time means.
const meBJS = (P, ant=0) => {
  const N=P.ids.length, T=P.times.length; const obs=[]; for (let i=0;i<N;i++) for (let t=0;t<T;t++) if (isFinite(P.Y[i][t])) obs.push({ i, t, y:P.Y[i][t], tr: isFinite(P.G[i]) && P.times[t]>=P.G[i]-ant, e: isFinite(P.G[i])? P.times[t]-P.G[i] : null, g:P.G[i] });
  const un=obs.filter(o=>!o.tr), trd=obs.filter(o=>o.tr); if (!un.length||!trd.length) return null;
  const nU=new Float64Array(N), nT=new Float64Array(T); un.forEach(o=>{ nU[o.i]++; nT[o.t]++; });
  // solve (Z0'Z0)[a;l] = [bu;bt] by Gauss–Seidel on the two-way structure
  const solve=(bu, bt)=>{ const a=new Float64Array(N), l=new Float64Array(T);
    for (let it=0; it<5000; it++){ let d=0; const sa=Float64Array.from(bu); un.forEach(o=>sa[o.i]-=l[o.t]); for (let i=0;i<N;i++){ const v=nU[i]? sa[i]/nU[i] : 0; d=Math.max(d,Math.abs(v-a[i])); a[i]=v; }
      const sl=Float64Array.from(bt); un.forEach(o=>sl[o.t]-=a[o.i]); for (let t=0;t<T;t++){ const v=nT[t]? sl[t]/nT[t] : 0; d=Math.max(d,Math.abs(v-l[t])); l[t]=v; } if (d<1e-13) break; }
    return { a, l }; };
  // first stage: fit FE on untreated
  const bu=new Float64Array(N), bt=new Float64Array(T); un.forEach(o=>{ bu[o.i]+=o.y; bt[o.t]+=o.y; }); const fe=solve(bu,bt);
  const ok=(o)=>nU[o.i]>0 && nT[o.t]>0; obs.forEach(o=>{ o.adj = ok(o)? o.y-fe.a[o.i]-fe.l[o.t] : NaN; });
  const T1=trd.filter(o=>isFinite(o.adj)); const dropped=trd.length-T1.length;
  const est=(wts)=>{ let s=0; T1.forEach((o,q)=>s+=wts[q]*o.adj); return s; };
  const se=(wts)=>{ const wu=new Float64Array(N), wt=new Float64Array(T); T1.forEach((o,q)=>{ wu[o.i]+=wts[q]; wt[o.t]+=wts[q]; }); const z=solve(wu,wt);
    const v=new Map(); un.forEach(o=>v.set(o, -(z.a[o.i]+z.l[o.t]))); T1.forEach((o,q)=>v.set(o, wts[q]));
    const cell=new Map(); T1.forEach((o,q)=>{ const k=o.g+"|"+o.e; const c=cell.get(k)||{ s:0, w:0 }; c.s+=wts[q]*wts[q]*o.adj; c.w+=wts[q]*wts[q]; cell.set(k,c); });
    const cl=new Float64Array(N); v.forEach((vv,o)=>{ if (!isFinite(o.adj)) return; let eps=o.adj; if (o.tr){ const c=cell.get(o.g+"|"+o.e); eps = o.adj - (c&&c.w? c.s/c.w : 0); } cl[o.i]+=vv*eps; });
    let s=0; for (let i=0;i<N;i++) s+=cl[i]*cl[i]; return Math.sqrt(s); };
  const wAll=T1.map(()=>1/T1.length); const byE=[...new Set(T1.map(o=>o.e))].sort((a,b)=>a-b).map(e=>{ const n=T1.filter(o=>o.e===e).length; const w=T1.map(o=>o.e===e? 1/n : 0); return { e, est:est(w), se:se(w), n }; });
  return { att: est(wAll), se: se(wAll), byE, nTreatedObs: T1.length, dropped };
};

// ── Goodman-Bacon (2021) decomposition of the static TWFE estimate (balanced panel, no covariates) ──
const meBacon = (P) => {
  const T=P.times.length; const N=P.ids.length; if (P.Y.some(r=>r.some(v=>!isFinite(v)))) return { error:"Bacon decomposition needs a balanced panel." };
  const coh=meCohorts(P).filter(c=>c.g>P.times[0] || !isFinite(c.g)); // cohorts treated before the panel start act as always-treated
  const always=P.G.map(g=>isFinite(g) && g<=P.times[0]);
  const groups=coh.map(c=>({ g:c.g, idx:P.G.map((g,i)=>g===c.g && !always[i]? i : -1).filter(i=>i>=0) })).filter(x=>x.idx.length);
  if (always.some(Boolean)) groups.push({ g:-Infinity, idx:always.map((a,i)=>a? i:-1).filter(i=>i>=0) });
  const Dbar=(g)=> !isFinite(g)? (g<0? 1 : 0) : P.times.filter(t=>t>=g).length/T;
  const mean=(idx, t0, t1)=>{ let s=0, c=0; idx.forEach(i=>{ for (let t=t0;t<=t1;t++){ s+=P.Y[i][t]; c++; } }); return s/c; };
  const did=(tr, co, pre0, pre1, post0, post1)=> (mean(tr,post0,post1)-mean(tr,pre0,pre1)) - (mean(co,post0,post1)-mean(co,pre0,pre1));
  const comps=[]; const nAll=N;
  for (let a=0;a<groups.length;a++) for (let b=0;b<groups.length;b++){ if (a===b) continue; const k=groups[a], l=groups[b]; if (!isFinite(k.g)) continue; // k is the treated group in this 2x2
    const nk=k.idx.length/nAll, nl=l.idx.length/nAll; const Dk=Dbar(k.g), Dl=Dbar(l.g); const tk=P.times.indexOf(k.g);
    if (!isFinite(l.g)){ // l never (or always) treated
      const est=did(k.idx, l.idx, 0, tk-1, tk, T-1); const nkl=nk/(nk+nl); const s=(nk+nl)**2*nkl*(1-nkl)*Dk*(1-Dk);
      comps.push({ type: l.g<0? "Treated vs always treated" : "Treated vs never treated", treated:k.g, control:l.g, est, s }); continue; }
    const tl=P.times.indexOf(l.g); const nkl=nk/(nk+nl);
    if (k.g<l.g){ // early k treated, later l as control before l starts
      const est=did(k.idx, l.idx, 0, tk-1, tk, tl-1); const s=((nk+nl)*(1-Dl))**2*nkl*(1-nkl)*((Dk-Dl)/(1-Dl))*((1-Dk)/(1-Dl)); comps.push({ type:"Earlier vs later treated", treated:k.g, control:l.g, est, s }); }
    else { // later k treated, earlier l already treated as control (forbidden comparison)
      const est=did(k.idx, l.idx, tl, tk-1, tk, T-1); const s=((nk+nl)*Dl)**2*nkl*(1-nkl)*(Dk/Dl)*((Dl-Dk)/Dl); comps.push({ type:"Later vs earlier treated", treated:k.g, control:l.g, est, s }); }
  }
  const S=comps.reduce((s,c)=>s+c.s,0); comps.forEach(c=>c.w=c.s/S);
  const types={}; comps.forEach(c=>{ const t=types[c.type]||(types[c.type]={ w:0, wb:0 }); t.w+=c.w; t.wb+=c.w*c.est; });
  return { comps, est: comps.reduce((s,c)=>s+c.w*c.est,0), summary: Object.entries(types).map(([type,v])=>({ type, weight:v.w, avg: v.w? v.wb/v.w : NaN })) };
};

// Relative-magnitudes sensitivity (Rambachan & Roth 2023), plug-in identified set for each post event time.
// Bias bound for event time e >= 0: (e+1) * Mbar * max pre-period one-step change. CI widened by 1.96 SE (conservative, approximate).
const meHonestRM = (per, Mbars=[0,0.5,1,2]) => {
  const pre=per.filter(x=>x.key<0).sort((a,b)=>a.key-b.key); const post=per.filter(x=>x.key>=0);
  if (pre.length<2) return null; const steps=[]; for (let j=1;j<pre.length;j++) steps.push(Math.abs(pre[j].est-pre[j-1].est)); steps.push(Math.abs(0-pre[pre.length-1].est)); // to the reference/first post baseline
  const D=Math.max(...steps);
  const rows=post.map(x=>{ const b=Mbars.map(M=>{ const w=(x.key+1)*M*D; return { M, lo:x.est-w-1.96*x.se, hi:x.est+w+1.96*x.se }; });
    const lo0=x.est-1.96*x.se, hi0=x.est+1.96*x.se; // breakdown: smallest Mbar at which the widened interval reaches zero
    return { e:x.key, est:x.est, se:x.se, bands:b, breakdown: (lo0>0? lo0 : hi0<0? -hi0 : 0)/Math.max(1e-12,(x.key+1)*D) }; });
  return { maxPreStep:D, rows };
};

// Simulated staggered-adoption panel with heterogeneous, growing effects (TWFE is biased here; CS and BJS are not)
const meDidDemo = () => { const rng=ciRng(424); const g=()=>{ let u=0; while(!u) u=rng(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rng()); };
  const headers=["region","year","log_output","first_treated","log_pop"]; const rows=[]; const years=[2004,2005,2006,2007,2008,2009,2010,2011,2012,2013]; const cohorts=[2007,2009,2011,0];
  let tr=0, cnt=0;
  for (let i=0;i<300;i++){ const c=cohorts[i%4]; const a=g()*0.6+5; const lp=a/2+g()*0.3; const slope=0.02+0.005*g();
    years.forEach((y,t)=>{ const e = c? y-c : -99; const eff = c && e>=0 ? (c===2007? 0.06 : c===2009? 0.04 : 0.02)*(e+1) : 0; if (c && e>=0){ tr+=eff; cnt++; }
      const yv=a + slope*t + 0.03*Math.sin(t) + eff + g()*0.05; rows.push([`R${String(i+1).padStart(3,"0")}`, String(y), yv.toFixed(4), String(c), lp.toFixed(3)]); }); }
  return { headers, rows, name:"Simulated staggered rollout (300 regions, 2004–2013)", trueATT: tr/cnt, note:"Effects grow with time since treatment and differ by cohort, so static TWFE is biased. True ATT (average over treated region-years) = " + (tr/cnt).toFixed(4) + "." };
};

// ══════════════════════════════════════════════
// SYNTHETIC CONTROL EXTENSIONS: synthetic DiD, penalized SC, cross-validated V, backdating, convex-hull check
// ══════════════════════════════════════════════
// Frank–Wolfe solver used by the synthdid package (Arkhangelsky et al. 2021), with intercept and ridge penalty.
// Y: rows = observations (N0), cols = T0+1 (last col is the target). Returns weights over the first T0 columns.
const meSCWeightFW = (Y, zeta, intercept=true, lambda=null, minDecrease=1e-3, maxIter=1000) => {
  const n=Y.length, k=Y[0].length-1; const A=Y.map(r=>Float64Array.from(r)); 
  if (intercept){ for (let j=0;j<=k;j++){ let m=0; for (let i=0;i<n;i++) m+=A[i][j]; m/=n; for (let i=0;i<n;i++) A[i][j]-=m; } }
  const x=Float64Array.from(lambda || new Array(k).fill(1/k)); const eta=n*zeta*zeta; const Ax=new Float64Array(n), hg=new Float64Array(k);
  for (let i=0;i<n;i++){ let s=0; const r=A[i]; for (let j=0;j<k;j++) s+=r[j]*x[j]; Ax[i]=s; }
  let prev=Infinity, prev2=Infinity;
  for (let t=0; t<maxIter; t++){
    if (t>=2 && !(prev2-prev > minDecrease*minDecrease)) break;
    hg.fill(0); for (let i=0;i<n;i++){ const e=Ax[i]-A[i][k]; if (e===0) continue; const r=A[i]; for (let j=0;j<k;j++) hg[j]+=e*r[j]; } for (let j=0;j<k;j++) hg[j]+=eta*x[j];
    let im=0; for (let j=1;j<k;j++) if (hg[j]<hg[im]) im=j;
    let up=0, dd=0; for (let j=0;j<k;j++){ const d=(j===im? 1 : 0)-x[j]; up-=hg[j]*d; dd+=d*d; }
    if (dd>0){ let bot=eta*dd; for (let i=0;i<n;i++){ const de=A[i][im]-Ax[i]; bot+=de*de; }
      const step=Math.min(1,Math.max(0,up/bot)); if (step>0){ for (let j=0;j<k;j++) x[j]+=step*((j===im?1:0)-x[j]); for (let i=0;i<n;i++) Ax[i]+=step*(A[i][im]-Ax[i]); } }
    let ss=0; for (let i=0;i<n;i++){ const e=Ax[i]-A[i][k]; ss+=e*e; } let xx=0; for (let j=0;j<k;j++) xx+=x[j]*x[j];
    prev2=prev; prev=zeta*zeta*xx+ss/n; }
  return Array.from(x); };
const meSparsify = (v) => { const mx=Math.max(...v); const w=v.map(x=>x<=mx/4? 0 : x); const s=w.reduce((a,b)=>a+b,0); return w.map(x=>x/s); };
// Y: N x T matrix, first N0 rows controls, rest treated; first T0 columns pre-treatment.
// method: "sdid" | "sc" | "did". Mirrors synthdid::synthdid_estimate / sc_estimate / did_estimate (Arkhangelsky et al. 2021).
// o: { omega, lambda (initial or fixed weights), update:{omega,lambda}, zO, zL, minDec } as stored in synthdid's opts
const meSDID = (Y, N0, T0, method="sdid", o={}) => {
  const N=Y.length, T=Y[0].length, N1=N-N0, T1=T-T0;
  const diffs=[]; for (let i=0;i<N0;i++) for (let t=1;t<T0;t++) diffs.push(Y[i][t]-Y[i][t-1]); const noise=meSd(diffs);
  const Yc=[]; for (let i=0;i<N0;i++){ const r=Y[i].slice(0,T0); let s=0; for (let t=T0;t<T;t++) s+=Y[i][t]; r.push(s/T1); Yc.push(r); }
  { const r=[]; for (let t=0;t<T0;t++){ let s=0; for (let i=N0;i<N;i++) s+=Y[i][t]; r.push(s/N1); } let s=0; for (let i=N0;i<N;i++) for (let t=T0;t<T;t++) s+=Y[i][t]; r.push(s/(N1*T1)); Yc.push(r); }
  const zO = o.zO ?? (method==="sc"? 1e-6*noise : Math.pow(N1*T1,0.25)*noise), zL = o.zL ?? 1e-6*noise, minDec = o.minDec ?? 1e-5*noise;
  let omega = o.omega ?? (method==="did"? new Array(N0).fill(1/N0) : null), lambda = o.lambda ?? (method==="did"? new Array(T0).fill(1/T0) : method==="sc"? new Array(T0).fill(0) : null);
  const upO = o.update? o.update.omega : omega==null, upL = o.update? o.update.lambda : lambda==null;
  if (upL){ const l1=meSCWeightFW(Yc.slice(0,N0), zL, true, lambda, minDec, 100); lambda=meSCWeightFW(Yc.slice(0,N0), zL, true, meSparsify(l1), minDec, 10000); }
  if (upO){ const Ytr=[]; for (let t=0;t<T0;t++){ const r=[]; for (let i=0;i<=N0;i++) r.push(Yc[i][t]); Ytr.push(r); }
    const icpt = method!=="sc"; const w1=meSCWeightFW(Ytr, zO, icpt, omega, minDec, 100); omega=meSCWeightFW(Ytr, zO, icpt, meSparsify(w1), minDec, 10000); }
  const lamFull=[...lambda.map(v=>-v), ...new Array(T1).fill(1/T1)]; const omFull=[...omega.map(v=>-v), ...new Array(N1).fill(1/N1)];
  let est=0; for (let i=0;i<N;i++){ let s=0; for (let t=0;t<T;t++) s+=Y[i][t]*lamFull[t]; est+=omFull[i]*s; }
  return { est, omega, lambda, noise, opts:{ zO, zL, minDec, update:{ omega:upO, lambda:upL } }, method };
};
const meSumNorm = (x) => { const s=x.reduce((a,b)=>a+b,0); return s!==0? x.map(v=>v/s) : x.map(()=>1/x.length); };
// Placebo standard error (synthdid::placebo_se, Algorithm 4): reassign treatment among controls and re-estimate.
const meSDIDPlaceboSE = (Y, N0, T0, fit, reps=200, seed=1) => { const N1=Y.length-N0; if (N0<=N1) return NaN; const rng=ciRng(seed); const ests=[];
  for (let r=0;r<reps;r++){ const ind=meShuffle([...Array(N0).keys()], rng); const n0=N0-N1;
    ests.push(meSDID(ind.map(i=>Y[i]), n0, T0, fit.method, { ...fit.opts, omega: meSumNorm(ind.slice(0,n0).map(i=>fit.omega[i])), lambda: fit.lambda }).est); }
  return Math.sqrt((reps-1)/reps)*meSd(ests); };
// Penalized synthetic control (Abadie & L'Hour 2021): min ||z1 - Z0 w||^2 + lambda * sum_j w_j ||z1 - Z0_j||^2, w in simplex.
const mePenSynthW = (z1, Z0, lambda, iters=3000) => { const K=z1.length, J=Z0[0].length; const d=new Array(J).fill(0); for (let j=0;j<J;j++){ let s=0; for (let k=0;k<K;k++) s+=(z1[k]-Z0[k][j])**2; d[j]=s; }
  const Q=meZeros(J,J), c=new Array(J).fill(0); for (let k=0;k<K;k++){ const row=Z0[k]; for (let a=0;a<J;a++){ c[a]+=row[a]*z1[k]; for (let b=a;b<J;b++) Q[a][b]+=row[a]*row[b]; } } for (let a=0;a<J;a++) for (let b=0;b<a;b++) Q[a][b]=Q[b][a];
  let x=new Array(J).fill(1/Math.sqrt(J)), L=0; for (let t=0;t<60;t++){ const y=meMV(Q,x); L=Math.sqrt(meDot(y,y))||1e-12; x=y.map(v=>v/L); }
  const step=1/(2*L); let w=new Array(J).fill(1/J), yk=w.slice(), tk=1; const grad=(w)=>meMV(Q,w).map((v,a)=>2*(v-c[a])+lambda*d[a]);
  for (let it=0; it<iters; it++){ const g=grad(yk); const wn=ciSimplexProj(yk.map((v,j)=>v-step*g[j])); const tn=(1+Math.sqrt(1+4*tk*tk))/2; yk=wn.map((v,j)=>v+((tk-1)/tn)*(v-w[j])); let diff=0; for (let j=0;j<J;j++) diff=Math.max(diff,Math.abs(wn[j]-w[j])); w=wn; tk=tn; if (diff<1e-11 && it>30) break; }
  return w; };
// choose lambda by leave-one-out over donors: each donor plays treated, post-period MSPE averaged
const mePenSynthCV = (Y1, Y0, preIdx, postIdx, grid=[0,0.001,0.01,0.05,0.1,0.5,1]) => {
  const J=Y0.length; const scale=meSd(preIdx.flatMap(t=>Y0.map(r=>r[t])))||1; const z=(row)=>preIdx.map(t=>row[t]/scale);
  const score=grid.map(lam=>{ let s=0, c=0; for (let j=0;j<J;j++){ const pool=Y0.filter((_,q)=>q!==j); const w=mePenSynthW(z(Y0[j]), preIdx.map(t=>pool.map(r=>r[t]/scale)), lam, 800);
      postIdx.forEach(t=>{ const yh=pool.reduce((a,r,q)=>a+r[t]*w[q],0); s+=(Y0[j][t]-yh)**2; c++; }); } return s/c; });
  const best=grid[score.indexOf(Math.min(...score))]; return { lambda:best, grid, score, w: mePenSynthW(z(Y1), preIdx.map(t=>Y0.map(r=>r[t]/scale)), best) }; };

// Convex-hull diagnostic: share of pre-periods in which the treated outcome lies outside the donors' range
const meHullCheck = (Y1, Y0, preIdx) => { let out=0; const gaps=[]; preIdx.forEach(t=>{ const vals=Y0.map(r=>r[t]); const mn=Math.min(...vals), mx=Math.max(...vals); if (Y1[t]<mn||Y1[t]>mx){ out++; gaps.push(Y1[t]<mn? Y1[t]-mn : Y1[t]-mx); } });
  const m1=meSeqMean(preIdx.map(t=>Y1[t])); const ms=Y0.map(r=>meSeqMean(preIdx.map(t=>r[t]))); const rank=ms.filter(v=>v>m1).length;
  return { shareOutside: out/preIdx.length, nOutside: out, extremeMean: rank===0 || rank===ms.length, rankFromTop: rank+1, nUnits: ms.length+1 }; };

// Cross-validated predictor weights V (Abadie 2021, Sec. 3.2): train on early pre-period, validate on late pre-period.
// predFn(unit, years) -> predictor vector measured over the given pre-period years. Returns V and the final weights.
const meSynthCV = (tr, donors, preIdx, predFn) => {
  const h=Math.floor(preIdx.length/2); const trainIdx=preIdx.slice(0,h), valIdx=preIdx.slice(h); if (trainIdx.length<2||valIdx.length<1) return null;
  const P1t=predFn(tr, trainIdx), P0t=P1t.map((_,k)=>donors.map(u=>predFn(u,trainIdx)[k]));
  const K=P1t.length; const sdT=P1t.map((p,k)=>Math.sqrt(ciVarS([p,...P0t[k]]))||1);
  const z1=P1t.map((p,k)=>p/sdT[k]), Z0=P0t.map((r,k)=>r.map(v=>v/sdT[k]));
  const toV=(x)=>{ const e=[1,...x.map(Math.exp)]; const s=e.reduce((a,b)=>a+b,0); return e.map(q=>q/s); };
  const valLoss=(x)=>{ const w=ciSynthW(z1, Z0, toV(x), 300, null, 1e-10); let s=0; valIdx.forEach(t=>{ const yh=donors.reduce((a,u,j)=>a+u.y[t]*w[j],0); s+=(tr.y[t]-yh)**2; }); return s/valIdx.length; };
  let best={ f:Infinity }; for (const s0 of [new Array(K-1).fill(0), new Array(K-1).fill(1), new Array(K-1).fill(-1)]){ let r=ciNelderMead(valLoss, s0, { maxIter:40*K, step:1.5 }); const r2=ciNelderMead(valLoss, r.x, { maxIter:20*K, step:0.5 }); if (r2.f<r.f) r=r2; if (r.f<best.f) best=r; }
  const V=toV(best.x);
  // final weights: predictors measured over the validation (most recent) window with the selected V
  const P1v=predFn(tr, valIdx), P0v=P1v.map((_,k)=>donors.map(u=>predFn(u,valIdx)[k])); const sdV=P1v.map((p,k)=>Math.sqrt(ciVarS([p,...P0v[k]]))||1);
  const w=ciSynthW(P1v.map((p,k)=>p/sdV[k]), P0v.map((r,k)=>r.map(v=>v/sdV[k])), V);
  return { V, w, valMSPE: best.f, trainYears: trainIdx, valYears: valIdx };
};

// ══════════════════════════════════════════════
// HIGH-DIMENSIONAL CONTROLS: double/debiased ML (Chernozhukov et al. 2018) and post-double-selection lasso (Belloni, Chernozhukov & Hansen 2014)
// ══════════════════════════════════════════════
// ── learners: each returns { predict(Xnew) -> array } ──
const meStdz = (X) => { const k=X[0].length, n=X.length; const mu=new Array(k).fill(0), sd=new Array(k).fill(0);
  for (const r of X) for (let j=0;j<k;j++) mu[j]+=r[j]/n; for (const r of X) for (let j=0;j<k;j++) sd[j]+=(r[j]-mu[j])**2/n; for (let j=0;j<k;j++) sd[j]=Math.sqrt(sd[j])||1;
  return { mu, sd, Z: X.map(r=>r.map((v,j)=>(v-mu[j])/sd[j])) }; };
// glmnet-style lasso path (Gaussian), objective (1/2n)||y - b0 - Zb||^2 + lambda ||b||_1 on standardized Z
const meLassoPath = (Z, y, lambdas) => { const n=Z.length, k=Z[0].length; const ym=meSeqMean(y); const r=y.map(v=>v-ym); const b=new Float64Array(k); const out=[];
  const cols=Array.from({length:k},(_,j)=>Float64Array.from(Z.map(z=>z[j]))); const xx=cols.map(c=>{ let s=0; for (let i=0;i<n;i++) s+=c[i]*c[i]; return s/n; });
  for (const lam of lambdas){ for (let it=0; it<1000; it++){ let mx=0; for (let j=0;j<k;j++){ const c=cols[j]; let g=0; for (let i=0;i<n;i++) g+=c[i]*r[i]; g=g/n+xx[j]*b[j];
        const nb = Math.sign(g)*Math.max(0, Math.abs(g)-lam)/(xx[j]||1); const d=nb-b[j]; if (d!==0){ for (let i=0;i<n;i++) r[i]-=d*c[i]; b[j]=nb; mx=Math.max(mx,Math.abs(d)); } }
      if (mx<1e-7) break; } out.push({ lam, b0: ym - 0, b: Array.from(b) }); }
  // intercept: since Z is centered (standardised on full sample) b0 = mean(y) - mean(Z)b; Z means are 0 when standardised on the same rows
  return out; };
const meLassoCV = (X, y, opts={}) => { const { K=5, seed=3, nl=40 } = opts; const n=X.length; const st=meStdz(X); const Z=st.Z; const ym=meSeqMean(y);
  let lmax=0; for (let j=0;j<Z[0].length;j++){ let s=0; for (let i=0;i<n;i++) s+=Z[i][j]*(y[i]-ym); lmax=Math.max(lmax,Math.abs(s)/n); } lmax=lmax||1;
  const lams=Array.from({length:nl},(_,q)=>lmax*Math.pow(1e-3, q/(nl-1)));
  const f=meFolds(n,K,ciRng(seed)); const err=new Array(nl).fill(0);
  for (let k=0;k<K;k++){ const tr=[...Array(n).keys()].filter(i=>f[i]!==k), te=[...Array(n).keys()].filter(i=>f[i]===k);
    const s2=meStdz(tr.map(i=>X[i])); const path=meLassoPath(s2.Z, tr.map(i=>y[i]), lams); const yt=meSeqMean(tr.map(i=>y[i]));
    path.forEach((p,q)=>{ te.forEach(i=>{ let pr=yt; for (let j=0;j<p.b.length;j++) pr+=p.b[j]*(X[i][j]-s2.mu[j])/s2.sd[j]; err[q]+=(y[i]-pr)**2; }); }); }
  const q=err.indexOf(Math.min(...err)); const fit=meLassoPath(Z, y, lams.slice(0,q+1)).pop();
  const predict=(Xn)=>Xn.map(r=>{ let s=ym; for (let j=0;j<fit.b.length;j++) s+=fit.b[j]*(r[j]-st.mu[j])/st.sd[j]; return s; });
  return { predict, lambda:lams[q], nonzero: fit.b.filter(v=>v!==0).length }; };
// L1-penalised logistic regression by IRLS + coordinate descent, lambda by K-fold CV (deviance)
const meLogitLassoFit = (Z, d, lam, init=null) => { const n=Z.length, k=Z[0].length; let b0=init? init.b0 : Math.log((meSeqMean(d)+1e-6)/(1-meSeqMean(d)+1e-6)); const b=init? Float64Array.from(init.b) : new Float64Array(k);
  for (let outer=0; outer<50; outer++){ const eta=Z.map(z=>{ let s=b0; for (let j=0;j<k;j++) s+=z[j]*b[j]; return s; }); const p=eta.map(e=>1/(1+Math.exp(-e))); const w=p.map(v=>Math.max(v*(1-v),1e-5)); const zt=eta.map((e,i)=>e+(d[i]-p[i])/w[i]);
    let mxO=0; for (let it=0; it<200; it++){ let mx=0; const r=zt.map((v,i)=>{ let s=b0; for (let j=0;j<k;j++) s+=Z[i][j]*b[j]; return v-s; });
      { let sw=0, s=0; for (let i=0;i<n;i++){ sw+=w[i]; s+=w[i]*r[i]; } const d0=s/sw; b0+=d0; for (let i=0;i<n;i++) r[i]-=d0; }
      for (let j=0;j<k;j++){ let g=0, h=0; for (let i=0;i<n;i++){ const z=Z[i][j]; g+=w[i]*z*r[i]; h+=w[i]*z*z; } g=g/n+(h/n)*b[j]; const nb=Math.sign(g)*Math.max(0,Math.abs(g)-lam)/((h/n)||1); const dd=nb-b[j]; if (dd!==0){ for (let i=0;i<n;i++) r[i]-=dd*Z[i][j]; b[j]=nb; mx=Math.max(mx,Math.abs(dd)); } }
      mxO=Math.max(mxO,mx); if (mx<1e-6) break; }
    if (mxO<1e-6) break; }
  return { b0, b:Array.from(b) }; };
const meLogitLassoCV = (X, d, opts={}) => { const { K=5, seed=5, nl=20 } = opts; const n=X.length; const st=meStdz(X); const Z=st.Z; const pm=meSeqMean(d);
  let lmax=0; for (let j=0;j<Z[0].length;j++){ let s=0; for (let i=0;i<n;i++) s+=Z[i][j]*(d[i]-pm); lmax=Math.max(lmax,Math.abs(s)/n); } lmax=lmax||1;
  const lams=Array.from({length:nl},(_,q)=>lmax*Math.pow(1e-3, q/(nl-1))); const f=meFolds(n,K,ciRng(seed),d); const dev=new Array(nl).fill(0);
  for (let k=0;k<K;k++){ const tr=[...Array(n).keys()].filter(i=>f[i]!==k), te=[...Array(n).keys()].filter(i=>f[i]===k); const s2=meStdz(tr.map(i=>X[i])); let init=null;
    lams.forEach((lam,q)=>{ init=meLogitLassoFit(s2.Z, tr.map(i=>d[i]), lam, init); te.forEach(i=>{ let e=init.b0; for (let j=0;j<init.b.length;j++) e+=init.b[j]*(X[i][j]-s2.mu[j])/s2.sd[j]; const p=Math.min(Math.max(1/(1+Math.exp(-e)),1e-12),1-1e-12); dev[q]-=d[i]*Math.log(p)+(1-d[i])*Math.log(1-p); }); }); }
  const q=dev.indexOf(Math.min(...dev)); let fit=null; for (let s=0;s<=q;s++) fit=meLogitLassoFit(Z, d, lams[s], fit);
  return { predict:(Xn)=>Xn.map(r=>{ let e=fit.b0; for (let j=0;j<fit.b.length;j++) e+=fit.b[j]*(r[j]-st.mu[j])/st.sd[j]; return 1/(1+Math.exp(-e)); }), lambda:lams[q] }; };
const meOLSLearner = (X, y) => { const r=meOLS(X.map(x=>[1,...x]), y); return { predict:(Xn)=>Xn.map(x=>r.beta[0]+meDot(r.beta.slice(1),x)) }; };
const meLogitLearner = (X, d) => { const lg=ciLogit(X, d); return { predict:(Xn)=>Xn.map(x=>{ let e=lg.b[0]; for (let j=0;j<x.length;j++) e+=lg.b[j+1]*(x[j]-lg.mu[j])/lg.sd[j]; return 1/(1+Math.exp(-e)); }) }; };
// Random forest (Breiman 2001) with histogram splits; regression trees on 0/1 give a probability forest for classification
const meForest = (X, y, opts={}) => { const { nTrees=200, mtry=null, minLeaf=5, maxDepth=20, seed=17, bins=32, sampleFrac=1 } = opts; const n=X.length, p=X[0].length; const rng=ciRng(seed);
  const cuts=[]; const B=[]; for (let j=0;j<p;j++){ const s=X.map(r=>r[j]).sort((a,b)=>a-b); const c=[...new Set(Array.from({length:bins-1},(_,q)=>ciQuantile(s,(q+1)/bins)))]; cuts.push(c); const bj=new Uint8Array(n); for (let i=0;i<n;i++){ let lo=0, hi=c.length; const v=X[i][j]; while(lo<hi){ const m=(lo+hi)>>1; if (v>c[m]) lo=m+1; else hi=m; } bj[i]=lo; } B.push(bj); }
  const m=mtry||Math.max(1,Math.floor(p/3)); const trees=[];
  const build=(idx, depth)=>{ let sum=0; for (const i of idx) sum+=y[i]; const mean=sum/idx.length; if (idx.length<2*minLeaf || depth>=maxDepth) return { v:mean };
    let best=null; const feats=meShuffle([...Array(p).keys()], rng).slice(0,m);
    for (const j of feats){ const nb=cuts[j].length+1; if (nb<2) continue; const hs=new Float64Array(nb), hc=new Float64Array(nb); const bj=B[j]; for (const i of idx){ hs[bj[i]]+=y[i]; hc[bj[i]]++; }
      let ls=0, lc=0; for (let q=0;q<nb-1;q++){ ls+=hs[q]; lc+=hc[q]; const rc=idx.length-lc; if (lc<minLeaf||rc<minLeaf) continue; const rs=sum-ls; const gain=ls*ls/lc+rs*rs/rc; if (!best||gain>best.gain) best={ j, q, gain }; } }
    if (!best || best.gain<=sum*sum/idx.length+1e-12) return { v:mean };
    const L=[], R=[]; const bj=B[best.j]; for (const i of idx) (bj[i]<=best.q? L : R).push(i);
    return { j:best.j, thr: cuts[best.j][best.q], l:build(L,depth+1), r:build(R,depth+1) }; };
  const ns=Math.max(2*minLeaf, Math.round(n*sampleFrac)); for (let t=0;t<nTrees;t++){ const idx=Array.from({length:ns},()=>Math.floor(rng()*n)); trees.push(build(idx,0)); }
  const pred1=(x)=>{ let s=0; for (const tr of trees){ let nd=tr; while(nd.l) nd = x[nd.j]<=nd.thr? nd.l : nd.r; s+=nd.v; } return s/trees.length; };
  return { predict:(Xn)=>Xn.map(pred1) }; };
const ME_LEARNERS = {
  lasso: { label:"Lasso (CV)", reg:(X,y,o)=>meLassoCV(X,y,o), cls:(X,d,o)=>meLogitLassoCV(X,d,o) },
  forest: { label:"Random forest", reg:(X,y,o)=>meForest(X,y,o), cls:(X,d,o)=>{ const f=meForest(X,d,{...o, minLeaf:o?.minLeaf||5}); return { predict:(Xn)=>f.predict(Xn).map(v=>Math.min(Math.max(v,0),1)) }; } },
  linear: { label:"OLS / logit", reg:(X,y)=>meOLSLearner(X,y), cls:(X,d)=>meLogitLearner(X,d) },
};

// ── DML estimator: PLR (partialling out) and IRM (ATE / ATTE) with K-fold cross-fitting and S repetitions ──
// learners: { y:"lasso"|"forest"|"linear", d:... }, opts: { model, score, K, S, seed, trim, forest:{nTrees}, onProgress }
const meDML = async (Y, D, X, opts={}) => {
  const { model="plr", score="ATE", K=5, S=1, seed=2026, trim=0.01, learnY="lasso", learnD="lasso", forest={}, onProgress } = opts;
  const n=Y.length; const binaryD=D.every(v=>v===0||v===1); const reps=[]; const diag={ lossY:[], lossD:[] };
  const lo=(name)=>({ ...(name==="forest"? forest : {}) });
  for (let s=0;s<S;s++){ const f=meFolds(n,K,ciRng(seed+s*101), binaryD? D : null); const l=new Float64Array(n), m=new Float64Array(n), g0=new Float64Array(n), g1=new Float64Array(n);
    for (let k=0;k<K;k++){ const tr=[...Array(n).keys()].filter(i=>f[i]!==k), te=[...Array(n).keys()].filter(i=>f[i]===k); const Xte=te.map(i=>X[i]);
      if (model==="plr"){ const fy=ME_LEARNERS[learnY].reg(tr.map(i=>X[i]), tr.map(i=>Y[i]), { ...lo(learnY), seed:seed+k }); fy.predict(Xte).forEach((v,q)=>l[te[q]]=v); }
      else { [0,1].forEach(dv=>{ const tt=tr.filter(i=>D[i]===dv); const fy=ME_LEARNERS[learnY].reg(tt.map(i=>X[i]), tt.map(i=>Y[i]), { ...lo(learnY), seed:seed+k+dv }); fy.predict(Xte).forEach((v,q)=>(dv? g1 : g0)[te[q]]=v); }); }
      const fd = binaryD? ME_LEARNERS[learnD].cls(tr.map(i=>X[i]), tr.map(i=>D[i]), { ...lo(learnD), seed:seed+k+7 }) : ME_LEARNERS[learnD].reg(tr.map(i=>X[i]), tr.map(i=>D[i]), { ...lo(learnD), seed:seed+k+7 });
      fd.predict(Xte).forEach((v,q)=>m[te[q]]=v);
      onProgress&&onProgress(s*K+k+1, S*K); await new Promise(r=>setTimeout(r,0)); }
    let psiA, psiB;
    if (model==="plr"){ const u=Y.map((y,i)=>y-l[i]), v=D.map((d,i)=>d-m[i]); psiA=v.map(x=>-x*x); psiB=u.map((x,i)=>x*v[i]);
      diag.lossY.push(Math.sqrt(meSeqMean(u.map(x=>x*x)))); diag.lossD.push(Math.sqrt(meSeqMean(v.map(x=>x*x)))); }
    else { const mh=Array.from(m, v=>Math.min(Math.max(v,trim),1-trim)); const pbar=meSeqMean(D);
      if (score==="ATE"){ psiA=D.map(()=>-1); psiB=Y.map((y,i)=> g1[i]-g0[i] + D[i]*(y-g1[i])/mh[i] - (1-D[i])*(y-g0[i])/(1-mh[i])); }
      else { const w=D.map(d=>d/pbar); const wb=mh.map(v=>v/pbar); psiA=w.map(x=>-x); psiB=Y.map((y,i)=> w[i]*(g1[i]-g0[i]) + wb[i]*(D[i]*(y-g1[i])/mh[i] - (1-D[i])*(y-g0[i])/(1-mh[i]))); }
      diag.lossY.push(Math.sqrt(meSeqMean(Y.map((y,i)=>(y-(D[i]? g1[i] : g0[i]))**2))));
      diag.lossD.push(-meSeqMean(D.map((d,i)=>{ const p=Math.min(Math.max(m[i],1e-12),1-1e-12); return d*Math.log(p)+(1-d)*Math.log(1-p); })));
      diag.ps = Array.from(m); diag.nTrim = Array.from(m).filter(v=>v<trim||v>1-trim).length; }
    const J=meSeqMean(psiA); const theta=-meSeqMean(psiB)/J; const psi=psiA.map((a,i)=>a*theta+psiB[i]); const se=Math.sqrt(meSeqMean(psi.map(x=>x*x))/(J*J)/n);
    reps.push({ theta, se, resid: model==="plr"? { u:Y.map((y,i)=>y-l[i]), v:D.map((d,i)=>d-m[i]) } : null }); }
  const thetas=reps.map(r=>r.theta).sort((a,b)=>a-b); const th=ciQuantile(thetas,0.5); const ub=reps.map(r=>r.theta+1.96*r.se).sort((a,b)=>a-b); const se=(ciQuantile(ub,0.5)-th)/1.96;
  return { theta:th, se, reps, diag, binaryD, model, score };
};

// ── rigorous lasso (hdm::rlasso): BCH plug-in penalty with heteroskedasticity-robust loadings, post-lasso refits ──
// Objective: sum_i (y_i - x_i'b)^2 + sum_j lambda_j |b_j|, lambda_j = 2c sqrt(n) Phi^{-1}(1 - gamma/(2p)) * sqrt(mean(x_ij^2 e_i^2)), gamma = 0.1/log(n).
// Follows hdm 0.3: start from residuals of y on its 5 most correlated regressors, first pass with lambda/2, stop when sd(residuals) settles.
const meRlasso = (X, y, opts={}) => { const { c=1.1, post=true, maxIter=15, tol=1e-5 } = opts; const n=X.length, p=X[0].length; const gamma=opts.gamma ?? 0.1/Math.log(n);
  const mx=new Array(p).fill(0); for (const r of X) for (let j=0;j<p;j++) mx[j]+=r[j]/n; const Xc=X.map(r=>r.map((v,j)=>v-mx[j])); const ym=meSeqMean(y); const yc=y.map(v=>v-ym);
  const cols=Array.from({length:p},(_,j)=>Float64Array.from(Xc.map(r=>r[j]))); const xx=cols.map(c=>{ let s=0; for (let i=0;i<n;i++) s+=c[i]*c[i]; return s; });
  const lambda0=2*c*Math.sqrt(n)*meInvNorm(1-gamma/(2*p));
  const loadings=(e)=>cols.map(col=>{ let s=0; for (let i=0;i<n;i++) s+=col[i]*col[i]*e[i]*e[i]; return Math.sqrt(s/n); });
  const sdv=(e)=>{ const m=meSeqMean(e); return Math.sqrt(e.reduce((s,v)=>s+(v-m)**2,0)/(e.length-1)); };
  const initRes=(t, icpt)=>{ const cor=cols.map(col=>{ let sxy=0, sxx=0, syy=0; const tm=meSeqMean(t); for (let i=0;i<n;i++){ sxy+=col[i]*(t[i]-tm); sxx+=col[i]*col[i]; syy+=(t[i]-tm)**2; } return sxx&&syy? Math.abs(sxy/Math.sqrt(sxx*syy)) : 0; });
    const idx=[...Array(p).keys()].sort((a,b)=>cor[b]-cor[a]).slice(0,Math.min(5,p)); const r=meOLS(Xc.map(x=>[...(icpt?[1]:[]), ...idx.map(j=>x[j])]), t); const coef=new Array(p).fill(0); idx.forEach((j,q)=>coef[j]=r.beta[q+(icpt?1:0)]); return { e:r.resid, coef }; };
  const shoot=(lamv)=>{ const b=Float64Array.from(initRes(yc,false).coef); const r=Float64Array.from(yc); for (let j=0;j<p;j++) if (b[j]) for (let i=0;i<n;i++) r[i]-=b[j]*cols[j][i];
    for (let it=1; it<1000; it++){ let chg=0; for (let j=0;j<p;j++){ if (!xx[j]) { b[j]=0; continue; } let g=0; const c=cols[j]; for (let i=0;i<n;i++) g+=c[i]*r[i]; g+=xx[j]*b[j]; const nb=Math.sign(g)*Math.max(0,Math.abs(g)-lamv[j]/2)/xx[j]; const d=nb-b[j]; if (d!==0){ for (let i=0;i<n;i++) r[i]-=d*c[i]; b[j]=nb; chg+=Math.abs(d); } } if (chg<1e-5) break; }
    return Array.from(b, v=>Math.abs(v)<1e-6? 0 : v); };
  let lam=loadings(initRes(yc,true).e).map(v=>lambda0*v); let s0=Math.sqrt(meSeqMean(yc.map(v=>v*v))*n/(n-1)); let coef=new Array(p).fill(0), sel=[], e1=yc.slice();
  for (let mm=1; mm<=maxIter; mm++){ const b=shoot(mm===1&&post? lam.map(v=>v/2) : lam); sel=b.map((v,j)=>v!==0? j : -1).filter(j=>j>=0);
    if (!sel.length){ return { selected:[], coef:new Array(p).fill(0), resid:yc.slice(), lambda0 }; }
    if (post){ const r=meOLS(Xc.map(x=>sel.map(j=>x[j])), yc); e1=r.resid; coef=new Array(p).fill(0); sel.forEach((j,q)=>coef[j]=r.beta[q]); } else { coef=b; e1=yc.map((v,i)=>v-meDot(b,Xc[i])); }
    const s1=sdv(e1); lam=loadings(e1).map(v=>lambda0*v); if (Math.abs(s0-s1)<tol) break; s0=s1; }
  return { selected: sel, coef, resid:e1, lambda0 }; };
// Post-double-selection (hdm::rlassoEffect, method = "double selection")
const mePDS = (Y, D, X, names=[]) => { const n=Y.length; const sd=meRlasso(X, D), sy=meRlasso(X, Y); const I=[...new Set([...sd.selected, ...sy.selected])].sort((a,b)=>a-b);
  const Xf=X.map((x,i)=>[1, D[i], ...I.map(j=>x[j])]); const r1=meOLS(Xf, Y); const alpha=r1.beta[1]; const xi=r1.resid.map(e=>e*Math.sqrt(n/(n-I.length-1)));
  const r2=meOLS(X.map(x=>[1, ...I.map(j=>x[j])]), D); const v=r2.resid; const mv2=meSeqMean(v.map(a=>a*a)); const varA=(1/n)*(1/mv2)*meSeqMean(v.map((a,i)=>a*a*xi[i]*xi[i]))*(1/mv2);
  const tag=I.map(j=>({ j, name:names[j]||`x${j+1}`, byD: sd.selected.includes(j), byY: sy.selected.includes(j) }));
  return { est:alpha, se:Math.sqrt(varA), selected:tag, nD:sd.selected.length, nY:sy.selected.length, ols:r1 }; };
// Partialling-out lasso (hdm "partialling out"): regress post-lasso residuals of Y on those of D (classical OLS SE, as hdm)
const mePO = (Y, D, X) => { const ry=meRlasso(X,Y).resid, rd=meRlasso(X,D).resid; const r=meOLS(rd.map(v=>[1,v]), ry); return { est:r.beta[1], se:Math.sqrt(r.sigma2*r.XtXinv[1][1]) }; };
// Cinelli & Hazlett (2020) robustness value of an OLS treatment coefficient: share of residual variance an omitted
// confounder must explain in both D and Y to drive the estimate to zero (RV) or to insignificance at 5% (RV_alpha).
const meRobustnessValue = (t, df) => { const f=Math.abs(t)/Math.sqrt(df); const rv=(fq)=> fq<=0? 0 : 0.5*(Math.sqrt(fq**4+4*fq*fq)-fq*fq);
  const fc=meTQuant(0.975, df-1)/Math.sqrt(df-1); const fa=f-fc; return { rv: rv(f), rvAlpha: fa>0? rv(fa) : 0, partialR2: t*t/(t*t+df) }; };

// Expand numeric covariates with squares and pairwise interactions (cap on total columns)
const mePolyExpand = (X, names, degree=2, cap=400) => { if (degree<2) return { X, names }; const k=X[0].length; const nn=names.slice(); const extra=[];
  const binary=Array.from({length:k},(_,j)=>X.every(r=>r[j]===0||r[j]===1));
  for (let a=0;a<k;a++) for (let b=a;b<k;b++){ if (a===b && binary[a]) continue; if (nn.length+extra.length>=cap) break; extra.push([a,b]); }
  return { X: X.map(r=>[...r, ...extra.map(([a,b])=>r[a]*r[b])]), names:[...nn, ...extra.map(([a,b])=> a===b? `${names[a]}²` : `${names[a]}×${names[b]}`)] }; };

// Simulated high-dimensional study (Belloni et al. style): 120 candidate controls, few matter, theta = 0.5
const meDMLDemo = () => { const rng=ciRng(808); const g=()=>{ let u=0; while(!u) u=rng(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rng()); };
  const n=800, p=120; const headers=["y","d",...Array.from({length:p},(_,j)=>`x${j+1}`)]; const rows=[];
  for (let i=0;i<n;i++){ const x=[]; let prev=0; for (let j=0;j<p;j++){ const v=0.5*prev+g(); x.push(v); prev=v; }
    let conf=0; for (let j=0;j<8;j++) conf+=x[j]/(j+1);
    const d = 0.8*conf + 0.5*x[10] + g(); const y = 0.5*d + conf + 0.7*x[20] + 2*g();
    rows.push([y.toFixed(5), d.toFixed(5), ...x.map(v=>v.toFixed(5))]); }
  return { headers, rows, name:"Simulated high-dimensional study (n=800, 120 controls)", trueTheta:0.5, note:"Only about ten of the 120 candidate controls matter. The true effect of d on y is 0.5; the naive difference is badly biased." }; };

// ══════════════════════════════════════════════
// CAUSAL GRAPHS: stationarity, Granger tests, PC algorithm, d-separation, adjustment sets, testable implications
// ══════════════════════════════════════════════
// Augmented Dickey–Fuller test with a constant; lag length by AIC (statsmodels' autolag="AIC" convention).
// p-value from MacKinnon (1994/2010) response surface, as in statsmodels.tsa.stattools.adfuller.
const meMacKinnonP = (tau) => { const tauMax=2.74, tauMin=-18.83, tauStar=-1.61; if (tau>tauMax) return 1; if (tau<tauMin) return 0;
  const sp=[2.1659,1.4412,0.038269], lp=[1.7339,0.93202*1e-1,-0.12745*1e-1,-0.010368*1e-2];
  const poly=(c)=>c.reduce((s,v,i)=>s+v*Math.pow(tau,i),0); return meNormCdf(tau<=tauStar? poly(sp) : poly(lp)); };
const meADF = (x0, maxlag=null) => { const x=x0.filter(v=>isFinite(v)); const nobs=x.length; if (nobs<8) return null;
  const ml = maxlag ?? Math.min(Math.ceil(12*Math.pow(nobs/100,0.25)), Math.floor(nobs/2)-2); const dx=x.slice(1).map((v,i)=>v-x[i]);
  const build=(L, start)=>{ const rows=[], yy=[]; for (let t=start; t<dx.length; t++){ const r=[1, x[t]]; for (let j=1;j<=L;j++) r.push(dx[t-j]); rows.push(r); yy.push(dx[t]); } return { rows, yy }; };
  let best={ aic:Infinity, L:0 }; const start=Math.max(1,ml);
  for (let L=0; L<=Math.max(0,ml); L++){ const { rows, yy }=build(L, start); if (rows.length<=L+3) break; const r=meOLS(rows,yy); const nn=rows.length; const llf=-nn/2*(Math.log(2*Math.PI*r.ssr/nn)+1); const aic=-2*llf+2*(L+2); if (aic<best.aic) best={ aic, L }; }
  const { rows, yy }=build(best.L, best.L); const r=meOLS(rows,yy); const s2=r.ssr/(rows.length-rows[0].length); const se=Math.sqrt(s2*r.XtXinv[1][1]); const tau=r.beta[1]/se;
  return { stat:tau, p:meMacKinnonP(tau), lag:best.L, nobs:rows.length }; };
// Make a series stationary for causal discovery: difference until ADF rejects at 5% (max 2 differences)
const meStationary = (vals, alpha=0.05) => { let v=vals.slice(), d=0, test=meADF(v); while (test && test.p>alpha && d<2){ v=v.slice(1).map((x,i)=>x-v[i]); d++; test=meADF(v); } return { vals:v, diffs:d, adf:test }; };
// Granger causality F-test (ssr-based), lag order chosen by BIC on the unrestricted bivariate model
const meGranger = (y, x, maxLag=4, Z=[]) => { const n=y.length; let best={ bic:Infinity, p:1 };
  const mk=(p, withX, start=maxLag)=>{ const rows=[], yy=[]; for (let t=start; t<n; t++){ const r=[1]; for (let j=1;j<=p;j++) r.push(y[t-j]); if (withX) for (let j=1;j<=p;j++) r.push(x[t-j]); Z.forEach(z=>{ for (let j=1;j<=p;j++) r.push(z[t-j]); }); rows.push(r); yy.push(y[t]); } return { rows, yy }; };
  for (let p=1;p<=maxLag;p++){ const { rows, yy }=mk(p,true); if (rows.length<=rows[0].length+2) break; const r=meOLS(rows,yy); const nn=rows.length; const bic=nn*Math.log(r.ssr/nn)+rows[0].length*Math.log(nn); if (bic<best.bic) best={ bic, p }; }
  const U=mk(best.p,true,best.p), R=mk(best.p,false,best.p); if (U.rows.length<=U.rows[0].length+1) return null; const ru=meOLS(U.rows,U.yy), rr=meOLS(R.rows,R.yy);
  const df2=U.rows.length-U.rows[0].length; const F=((rr.ssr-ru.ssr)/best.p)/(ru.ssr/df2); return { F, p:meFPval(F,best.p,df2), lag:best.p, df1:best.p, df2 }; };
// Partial correlation of i and j given S from a correlation matrix, and Fisher-z p-value
const meCorrMat = (cols) => { const k=cols.length, n=cols[0].length; const st=cols.map(c=>{ const m=meSeqMean(c); const s=Math.sqrt(c.reduce((a,v)=>a+(v-m)**2,0)/(n-1))||1; return c.map(v=>(v-m)/s); });
  return Array.from({length:k},(_,a)=>Array.from({length:k},(_,b)=>{ let s=0; for (let i=0;i<n;i++) s+=st[a][i]*st[b][i]; return s/(n-1); })); };
const mePartialCorr = (R, i, j, S) => { const idx=[i,j,...S]; const sub=idx.map(a=>idx.map(b=>R[a][b])); const P=mePinv(sub,1e-12); return -P[0][1]/Math.sqrt(P[0][0]*P[1][1]); };
const meFisherZ = (r, n, k) => { const rr=Math.max(-0.9999999,Math.min(0.9999999,r)); const z=0.5*Math.log((1+rr)/(1-rr))*Math.sqrt(Math.max(1,n-k-3)); return 2*(1-meNormCdf(Math.abs(z))); };
// PC-stable algorithm (Colombo & Maathuis 2014) with Fisher-z tests, then v-structures and Meek rules 1–3.
// Returns { directed:[[a,b]], undirected:[[a,b]], sepsets, tests }
const mePC = (cols, alpha=0.05, maxCond=3) => { const k=cols.length, n=cols[0].length; const R=meCorrMat(cols);
  const adj=Array.from({length:k},(_,a)=>Array.from({length:k},(_,b)=>a!==b)); const sep={}; const tests=[];
  const combos=(arr, l)=>{ const out=[]; const rec=(s, st)=>{ if (st.length===l){ out.push(st.slice()); return; } for (let q=s;q<arr.length;q++){ st.push(arr[q]); rec(q+1,st); st.pop(); } }; rec(0,[]); return out; };
  for (let l=0; l<=maxCond; l++){ const nb=adj.map(r=>r.map((v,b)=>v? b : -1).filter(b=>b>=0)); let any=false;
    for (let a=0;a<k;a++) for (const b of nb[a]){ if (!adj[a][b]) continue; const cand=nb[a].filter(c=>c!==b); if (cand.length<l) continue; any=true;
      for (const S of combos(cand,l)){ const pc=mePartialCorr(R,a,b,S); const p=meFisherZ(pc,n,S.length); tests.push({ a, b, S, r:pc, p }); if (p>alpha){ adj[a][b]=adj[b][a]=false; sep[a+","+b]=sep[b+","+a]=S; break; } } }
    if (!any) break; }
  // orientation: dir[a][b] = true means a -> b; undirected when both adj and neither oriented
  const dir=Array.from({length:k},()=>new Array(k).fill(false));
  for (let c=0;c<k;c++){ const nb=[...Array(k).keys()].filter(a=>adj[a][c]); for (let x=0;x<nb.length;x++) for (let y=x+1;y<nb.length;y++){ const a=nb[x], b=nb[y]; if (adj[a][b]) continue; const S=sep[a+","+b]||[]; if (!S.includes(c)){ dir[a][c]=true; dir[b][c]=true; } } }
  // remove conflicting double orientations (keep as undirected)
  for (let a=0;a<k;a++) for (let b=0;b<k;b++) if (dir[a][b]&&dir[b][a]){ dir[a][b]=dir[b][a]=false; }
  const isUnd=(a,b)=>adj[a][b] && !dir[a][b] && !dir[b][a];
  let changed=true; while (changed){ changed=false;
    for (let a=0;a<k;a++) for (let b=0;b<k;b++){ if (!isUnd(a,b)) continue;
      // R1: c -> a, a - b, c not adj b  => a -> b
      if ([...Array(k).keys()].some(c=>dir[c][a] && !dir[a][c] && !adj[c][b] && c!==b)){ dir[a][b]=true; changed=true; continue; }
      // R2: a -> c -> b and a - b => a -> b
      if ([...Array(k).keys()].some(c=>dir[a][c]&&!dir[c][a]&&dir[c][b]&&!dir[b][c])){ dir[a][b]=true; changed=true; continue; }
      // R3: a - c -> b, a - d -> b, c,d non-adjacent => a -> b
      const cs=[...Array(k).keys()].filter(c=>isUnd(a,c)&&dir[c][b]&&!dir[b][c]); if (cs.some((c,i)=>cs.slice(i+1).some(d=>!adj[c][d]))){ dir[a][b]=true; changed=true; } } }
  const directed=[], undirected=[]; for (let a=0;a<k;a++) for (let b=0;b<k;b++){ if (!adj[a][b]) continue; if (dir[a][b]&&!dir[b][a]) directed.push([a,b]); else if (a<b && isUnd(a,b)) undirected.push([a,b]); }
  return { directed, undirected, sepsets:sep, tests, R }; };

// ── d-separation (via the moralised ancestral graph) and adjustment ──
const meParents = (nodes, edges) => { const p={}; nodes.forEach(n=>p[n]=[]); edges.forEach(e=>{ if (p[e.to]) p[e.to].push(e.from); }); return p; };
const meChildren = (nodes, edges) => { const c={}; nodes.forEach(n=>c[n]=[]); edges.forEach(e=>{ if (c[e.from]) c[e.from].push(e.to); }); return c; };
const meAncestors = (nodes, edges, set) => { const p=meParents(nodes,edges); const out=new Set(set); const st=[...set]; while (st.length){ const v=st.pop(); for (const u of p[v]||[]) if (!out.has(u)){ out.add(u); st.push(u); } } return out; };
const meDescendants = (nodes, edges, v) => { const c=meChildren(nodes,edges); const out=new Set(); const st=[v]; while (st.length){ const a=st.pop(); for (const b of c[a]||[]) if (!out.has(b)){ out.add(b); st.push(b); } } return out; };
const meDSep = (nodes, edges, X, Y, Z) => { // are sets X and Y d-separated given Z?
  const anc=meAncestors(nodes, edges, [...X, ...Y, ...Z]); const p=meParents(nodes,edges); const und={}; anc.forEach(v=>und[v]=new Set());
  anc.forEach(v=>{ const ps=(p[v]||[]).filter(u=>anc.has(u)); ps.forEach(u=>{ und[u].add(v); und[v].add(u); }); for (let i=0;i<ps.length;i++) for (let j=i+1;j<ps.length;j++){ und[ps[i]].add(ps[j]); und[ps[j]].add(ps[i]); } });
  const Zs=new Set(Z); const seen=new Set(X.filter(x=>!Zs.has(x))); const st=[...seen]; const Ys=new Set(Y);
  while (st.length){ const v=st.pop(); if (Ys.has(v)) return false; for (const u of und[v]||[]) if (!seen.has(u) && !Zs.has(u)){ seen.add(u); st.push(u); } }
  return true; };
// Backdoor criterion: Z has no descendant of X, and Z d-separates X and Y once X's outgoing edges are removed
const meIsBackdoor = (nodes, edges, X, Y, Z) => { const dX=meDescendants(nodes,edges,X); if (Z.some(z=>dX.has(z))) return false; const g=edges.filter(e=>e.from!==X); return meDSep(nodes, g, [X], [Y], Z); };
// All minimal valid adjustment sets among observed candidates (exhaustive for up to ~14 candidates)
const meAdjustmentSets = (nodes, edges, X, Y, unobserved=new Set()) => {
  const dX=meDescendants(nodes,edges,X); const cand=nodes.filter(v=>v!==X&&v!==Y&&!dX.has(v)&&!unobserved.has(v)); const valid=[];
  const k=cand.length; if (k>16) return { sets:[], tooMany:true };
  const bitCount=(m)=>{ let c=0; while(m){ c+=m&1; m>>=1; } return c; };
  const masks=[...Array(1<<k).keys()].sort((a,b)=>bitCount(a)-bitCount(b));
  for (const m of masks){ if (valid.some(v=>(v&m)===v)) continue; const Z=cand.filter((_,j)=>m&(1<<j)); if (meIsBackdoor(nodes,edges,X,Y,Z)) valid.push(m); }
  return { sets: valid.map(m=>cand.filter((_,j)=>m&(1<<j))), candidates:cand }; };
// Front-door criterion (Pearl 2009, Def. 3.3.3) for a set M
const meIsFrontDoor = (nodes, edges, X, Y, M) => { if (!M.length) return false;
  const paths=dagPaths(nodes, edges, X, Y); if (!paths.length || !paths.every(pth=>pth.slice(1,-1).some(v=>M.includes(v)))) return false; // intercepts all directed paths
  if (!meIsBackdoorSet(nodes, edges, X, M, [])) return false; // no unblocked back-door path X -> M
  return M.every(m=>meIsBackdoor(nodes, edges, m, Y, [X])); };
const meIsBackdoorSet = (nodes, edges, X, Ms, Z) => Ms.every(m=>{ const g=edges.filter(e=>e.from!==X); return meDSep(nodes, g, [X], [m], Z); });
// Full causal-role analysis used by the DAG view
const meDagAnalysis = (nodes, edges, X, Y, unobserved=new Set()) => {
  if (!X||!Y||X===Y) return { note:"Select distinct treatment (X) and outcome (Y).", sets:[] };
  const dX=meDescendants(nodes,edges,X); const paths=dagPaths(nodes,edges,X,Y); const mediators=[...new Set(paths.flatMap(p=>p.slice(1,-1)))];
  const adj=meAdjustmentSets(nodes, edges, X, Y, unobserved); const sets=adj.sets; const chosen=sets[0]||null;
  const anyAdj = meAdjustmentSets(nodes, edges, X, Y, new Set()).sets; // ignoring which nodes are observed
  const p=meParents(nodes,edges);
  const colliders=nodes.filter(v=>v!==X&&v!==Y&&(p[v]||[]).length>=2&&!mediators.includes(v));
  // classify other observed nodes relative to the chosen set: adding them keeps validity (neutral) or breaks it (bad control)
  const roles={}; nodes.filter(v=>v!==X&&v!==Y).forEach(v=>{ if (unobserved.has(v)) roles[v]="unobserved"; else if (chosen&&chosen.includes(v)) roles[v]="adjust"; else if (mediators.includes(v)) roles[v]="mediator";
    else if (dX.has(v)) roles[v]="descendant"; else if (chosen && !meIsBackdoor(nodes,edges,X,Y,[...chosen,v])) roles[v]="bad"; else roles[v]="neutral"; });
  const frontDoor = !sets.length? (()=>{ const cands=nodes.filter(v=>v!==X&&v!==Y&&!unobserved.has(v)); for (let m=1;m<(1<<Math.min(cands.length,10));m++){ const M=cands.filter((_,j)=>m&(1<<j)); if (meIsFrontDoor(nodes,edges,X,Y,M)) return M; } return null; })() : null;
  let note;
  if (!paths.length) note="The graph has no directed path from X to Y, so it implies a zero causal effect.";
  else if (sets.length && !sets[0].length) note="No adjustment is needed: every back-door path is already blocked (for example by a collider). Adjusting for colliders or descendants of X would add bias.";
  else if (sets.length) note=`Adjusting for {${sets[0].join(", ")}} satisfies the back-door criterion, so the effect is identified by regression, matching or weighting on that set.`;
  else if (frontDoor) note=`No valid back-door set is observed, but {${frontDoor.join(", ")}} satisfies the front-door criterion: the effect is identified through the mediator(s).`;
  else if (anyAdj.length) note="Every valid adjustment set includes an unobserved variable, so the effect is not identified by adjustment. Consider an instrument, a front-door design, or a quasi-experiment.";
  else note="No adjustment set exists for this graph.";
  return { sets, chosen, mediators, colliders, roles, frontDoor, note, hasDirectPath: paths.length>0, identified: sets.length>0 || !!frontDoor };
};
// Testable implications: each non-adjacent pair (a, b) with a not a descendant of b is independent of b given b's parents
// (local Markov property). Tested with Fisher-z partial correlations on the supplied data columns.
const meDagImplications = (nodes, edges, colsByNode) => { const p=meParents(nodes,edges); const out=[]; const avail=nodes.filter(v=>colsByNode[v]);
  const n=Math.min(...avail.map(v=>colsByNode[v].length)); if (!isFinite(n)||n<8) return out; const cols=avail.map(v=>colsByNode[v].slice(-n)); const R=meCorrMat(cols); const ix=Object.fromEntries(avail.map((v,i)=>[v,i]));
  for (const b of avail){ const desc=meDescendants(nodes,edges,b); const pa=(p[b]||[]).filter(v=>ix[v]!=null); if (pa.length!==(p[b]||[]).length) continue;
    for (const a of avail){ if (a===b||desc.has(a)||pa.includes(a)) continue; if (out.some(o=>o.a===b&&o.b===a&&o.S.join()===pa.join())) continue; const r=mePartialCorr(R, ix[a], ix[b], pa.map(v=>ix[v])); out.push({ a, b, S:pa, r, p:meFisherZ(r,n,pa.length) }); } }
  return out; };
// Causal discovery for the DAG builder. Series are aligned on common years, made stationary (ADF), then either
// PC (conditional independence, Fisher z) with Granger tests orienting edges PC leaves undirected, or pairwise Granger tests.
const meDiscover = (nodes, seriesMap, o={}) => { const { method="pc", alpha=0.05, stationary=true, maxLag=2 } = o; const notes=[];
  const maps=nodes.map(n=>{ const m={}; (seriesMap[n]||[]).forEach(d=>{ if (d.value!=null&&isFinite(d.value)) m[d.year]=d.value; }); return m; });
  const years=Object.keys(maps[0]||{}).map(Number).filter(y=>maps.every(m=>m[y]!=null)).sort((a,b)=>a-b);
  if (years.length<12) return { edges:[], scores:[], diag:{ error:`Only ${years.length} years have data for every variable; at least 12 are needed for these tests.` } };
  const tr=nodes.map((_,i)=>{ const v=years.map(y=>maps[i][y]); return stationary? meStationary(v, 0.05) : { vals:v, diffs:0, adf:meADF(v) }; });
  const L=Math.min(...tr.map(x=>x.vals.length)); const cols=tr.map(x=>x.vals.slice(-L));
  const stat=nodes.map((n,i)=>({ node:n, diffs:tr[i].diffs, p:tr[i].adf?.p, stationary: tr[i].adf? tr[i].adf.p<=0.05 : null }));
  if (stat.some(s=>s.stationary===false)) notes.push("Some series are still non-stationary after two differences; tests on them can find spurious links.");
  const lagMax=Math.max(1,Math.min(maxLag, Math.floor((L-4)/4)));
  const gr={}; for (let a=0;a<nodes.length;a++) for (let b=0;b<nodes.length;b++){ if (a===b) continue; const g=meGranger(cols[b], cols[a], lagMax); if (g) gr[a+">"+b]=g; }
  const edges=[], scores=[];
  if (method==="granger"){
    const cand=[]; for (let a=0;a<nodes.length;a++) for (let b=0;b<nodes.length;b++){ const g=gr[a+">"+b]; if (g&&g.p<alpha) cand.push({ a, b, p:g.p, F:g.F, lag:g.lag }); }
    cand.sort((x,y)=>x.p-y.p); const kept=[];
    cand.forEach(c=>{ const rev=kept.find(k=>k.a===c.b&&k.b===c.a); if (rev){ notes.push(`Feedback between ${nodes[c.a]} and ${nodes[c.b]}: both directions are significant; the stronger one is kept.`); return; }
      const test=[...kept, c].map(k=>({ from:nodes[k.a], to:nodes[k.b] })); if (!dagHasCycle(nodes, test)) kept.push(c); });
    kept.forEach(k=>{ edges.push({ from:nodes[k.a], to:nodes[k.b], how:"granger" }); scores.push({ pair:`${nodes[k.a]} → ${nodes[k.b]}`, stat:`F=${k.F.toFixed(2)}, lag ${k.lag}`, p:k.p }); });
  } else {
    const pc=mePC(cols, alpha, Math.min(3, nodes.length-2));
    pc.directed.forEach(([a,b])=>{ edges.push({ from:nodes[a], to:nodes[b], how:"pc" }); scores.push({ pair:`${nodes[a]} → ${nodes[b]}`, stat:"oriented by PC (v-structure / Meek rules)", p:null }); });
    pc.undirected.forEach(([a,b])=>{ const ab=gr[a+">"+b], ba=gr[b+">"+a]; const sa=ab&&ab.p<alpha, sb=ba&&ba.p<alpha;
      if (sa&&!sb) { edges.push({ from:nodes[a], to:nodes[b], how:"pc+granger" }); scores.push({ pair:`${nodes[a]} → ${nodes[b]}`, stat:`adjacent by PC; direction from Granger (F=${ab.F.toFixed(2)})`, p:ab.p }); }
      else if (sb&&!sa) { edges.push({ from:nodes[b], to:nodes[a], how:"pc+granger" }); scores.push({ pair:`${nodes[b]} → ${nodes[a]}`, stat:`adjacent by PC; direction from Granger (F=${ba.F.toFixed(2)})`, p:ba.p }); }
      else { edges.push({ from:nodes[a], to:nodes[b], undirected:true, how:"pc" }); scores.push({ pair:`${nodes[a]} — ${nodes[b]}`, stat:"adjacent; direction not identified by the data", p:null }); } });
    // drop orientations that would create a cycle (turn them back into undirected)
    const dir=[]; edges.forEach(e=>{ if (e.undirected) return; if (dagHasCycle(nodes, [...dir, e])){ e.undirected=true; notes.push(`${e.from} → ${e.to} would create a cycle and is left undirected.`); } else dir.push(e); });
  }
  return { edges, scores, diag:{ method, alpha, n:L, years:[years[years.length-L], years[years.length-1]], stat, notes, lagMax } };
};

// ══════════════════════════════════════════════
// MATCHING EXTENSIONS: Abadie–Imbens (2016) adjustment, sandwich IPW SEs, multiple imputation (PMM + Rubin's rules)
// ══════════════════════════════════════════════
// Abadie & Imbens (2016): variance of matching on the ESTIMATED propensity score.
// units: [{y,d,x}], lg: ciLogit output for these units (standardised design Z = [1, (x-mu)/sd]), est/se: AI(2006) results of PS matching.
const meAI2016 = (units, lg, est, se, estimand="ATT", L=2) => {
  const N=units.length; const p=lg.ps.map(v=>Math.min(Math.max(v,1e-10),1-1e-10)); const f=p.map(v=>v*(1-v));
  const Z=units.map(u=>[1, ...u.x.map((v,j)=>(v-lg.mu[j])/lg.sd[j])]); const k=Z[0].length; const Y=units.map(u=>u.y), W=units.map(u=>u.d);
  const arm=[[],[]]; units.forEach((u,i)=>arm[u.d].push(i)); arm.forEach(a=>a.sort((i,j)=>p[i]-p[j])); const pa=arm.map(a=>a.map(i=>p[i]));
  // L nearest by |p_i - p_j| within an arm (optionally excluding i), ties broken by order
  const nearest=(i, w, Lk, excl)=>{ const a=arm[w], pv=pa[w]; let lo=0, hi=a.length; while(lo<hi){ const m=(lo+hi)>>1; if (pv[m]<p[i]) lo=m+1; else hi=m; }
    const out=[]; let l=lo-1, r=lo; while (out.length<Lk && (l>=0||r<a.length)){ const dl=l>=0? p[i]-pv[l] : Infinity, dr=r<a.length? pv[r]-p[i] : Infinity; let j; if (dl<=dr){ j=a[l]; l--; } else { j=a[r]; r++; } if (excl && j===i) continue; out.push(j); } return out; };
  const cov=(set)=>{ const Lk=set.length; if (Lk<2) return new Array(k).fill(0); const zb=new Array(k).fill(0); let yb=0; set.forEach(j=>{ yb+=Y[j]/Lk; for (let a=0;a<k;a++) zb[a]+=Z[j][a]/Lk; });
    const c=new Array(k).fill(0); set.forEach(j=>{ const dy=Y[j]-yb; for (let a=0;a<k;a++) c[a]+=(Z[j][a]-zb[a])*dy/(Lk-1); }); return c; };
  const cv=[[],[]]; for (let i=0;i<N;i++) for (const w of [0,1]) cv[w][i]=cov(W[i]===w? nearest(i,w,L,false) : nearest(i,w,L,false));
  const I=meZeros(k,k); for (let i=0;i<N;i++) for (let a=0;a<k;a++) for (let b=0;b<k;b++) I[a][b]+=f[i]*f[i]/(p[i]*(1-p[i]))*Z[i][a]*Z[i][b]/N; const Ii=mePinv(I,1e-12);
  if (estimand==="ATE"){ const c=new Array(k).fill(0); for (let i=0;i<N;i++) for (let a=0;a<k;a++) c[a]+=(cv[1][i][a]/p[i]+cv[0][i][a]/(1-p[i]))*f[i]/N;
    const adj=meQF(c,Ii); const v=se*se-adj/N; return { se: Math.sqrt(Math.max(v, 0)), adjust:-adj/N, ok: v>0 }; }
  if (estimand!=="ATT") return null; // ATC by symmetry is not implemented
  const N1=W.filter(Boolean).length;
  const mu=(i,w)=>{ const set= W[i]===w? nearest(i,w,1,true) : nearest(i,w,1,false); return set.length? Y[set[0]] : NaN; };
  // Euclidean nearest opposite-arm unit on standardised covariates
  const nnX=(i)=>{ let best=Infinity, bj=-1; for (const j of arm[1-W[i]]){ let s=0; for (let a=1;a<k;a++){ const t=Z[i][a]-Z[j][a]; s+=t*t; if (s>=best) break; } if (s<best){ best=s; bj=j; } } return bj; };
  const ct=new Array(k).fill(0), dt=new Array(k).fill(0);
  for (let i=0;i<N;i++){ const m1=mu(i,1), m0=mu(i,0); const j=nnX(i); const r=(2*W[i]-1)*(Y[i]-Y[j]);
    for (let a=0;a<k;a++){ ct[a]+=Z[i][a]*f[i]*(m1-m0-est)/N1 + (cv[1][i][a] + p[i]/(1-p[i])*cv[0][i][a])*f[i]/N1; dt[a]+=Z[i][a]*f[i]*(r-est)/N1; } }
  const adj=-meQF(ct,Ii)+meQF(dt,Ii); const v=se*se+adj/N; return { se: Math.sqrt(Math.max(v,0)), adjust:adj/N, ok: v>0 };
};

// Sandwich (M-estimation) standard error for normalised IPW that accounts for the estimated propensity score
// (Lunceford & Davidian 2004). Stacked moments: logit score, then the two weighted means. Jacobian by central differences.
const meIPWSandwich = (units, lg, estimand="ATT") => {
  const n=units.length; const Z=units.map(u=>[1, ...u.x.map((v,j)=>(v-lg.mu[j])/lg.sd[j])]); const k=Z[0].length;
  const wOf=(p,d)=> estimand==="ATT"? (d? 1 : p/(1-p)) : estimand==="ATC"? (d? (1-p)/p : 1) : (d? 1/p : 1/(1-p));
  const mom=(th)=>{ const b=th.slice(0,k), m1=th[k], m0=th[k+1]; return units.map((u,i)=>{ const p=1/(1+Math.exp(-meDot(Z[i],b))); const g=Z[i].map(z=>z*(u.d-p)); const w=wOf(p,u.d);
      return [...g, u.d*w*(u.y-m1), (1-u.d)*w*(u.y-m0)]; }); };
  const ps=lg.ps; let s1=0,w1=0,s0=0,w0=0; units.forEach((u,i)=>{ const w=wOf(ps[i],u.d); if (u.d){ s1+=w*u.y; w1+=w; } else { s0+=w*u.y; w0+=w; } });
  const th=[...lg.b, s1/w1, s0/w0]; const q=th.length; const mean=(G)=>G[0].map((_,a)=>G.reduce((s,r)=>s+r[a],0)/n);
  const A=meZeros(q,q); for (let c=0;c<q;c++){ const h=1e-6*Math.max(1,Math.abs(th[c])); const tp=th.slice(), tm=th.slice(); tp[c]+=h; tm[c]-=h; const gp=mean(mom(tp)), gm=mean(mom(tm)); for (let a=0;a<q;a++) A[a][c]=(gp[a]-gm[a])/(2*h); }
  const G=mom(th); const B=meZeros(q,q); G.forEach(r=>{ for (let a=0;a<q;a++) for (let b=0;b<q;b++) B[a][b]+=r[a]*r[b]/n; });
  const Ai=ciInv(A); if (!Ai) return { est:NaN, se:NaN }; const V=meMatMul(meMatMul(Ai,B),meTr(Ai)).map(r=>r.map(v=>v/n));
  const vt=V[k][k]+V[k+1][k+1]-2*V[k][k+1]; return { est: th[k]-th[k+1], se: Math.sqrt(Math.max(vt,0)) }; };

// ── Multiple imputation by chained equations with predictive mean matching (van Buuren 2018; mice defaults) ──
// headers/rows: raw table; cols: covariates to impute (numeric only; categorical keep a "(missing)" level); aux: always-observed columns used as predictors (Y, D).
const meMICE = (headers, rows, cols, aux, M=10, iters=10, seed=91, donors=5) => {
  const ix=Object.fromEntries(headers.map((h,i)=>[h,i])); const num=(v)=>{ const s=String(v??"").trim(); if(!s||/^(na|nan|null|\.|-)$/i.test(s)) return NaN; return parseFloat(s.replace(/[$,%\s]/g,"")); };
  const n=rows.length; const V=cols.map(c=>rows.map(r=>num(r[ix[c]]))); const A=aux.map(c=>rows.map(r=>num(r[ix[c]])));
  const miss=V.map(col=>col.map(v=>!isFinite(v))); const target=cols.map((_,j)=>miss[j].some(Boolean));
  const rng=ciRng(seed); const gauss=()=>{ let u=0; while(!u) u=rng(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rng()); };
  const chi2=(df)=>{ let s=0; for (let i=0;i<df;i++){ const z=gauss(); s+=z*z; } return s; };
  const okRow=(i)=>A.every(a=>isFinite(a[i]));
  const out=[]; const fmiCols={};
  for (let m=0;m<M;m++){
    const cur=V.map((col)=>{ const obs=col.filter(v=>isFinite(v)); return col.map(v=>isFinite(v)? v : obs[Math.floor(rng()*obs.length)]); }); // random start
    for (let it=0; it<iters; it++) cols.forEach((c,j)=>{ if (!target[j]) return;
      const pred=(i)=>[1, ...cur.filter((_,q)=>q!==j).map(col=>col[i]), ...A.map(a=>a[i])];
      const obsI=[...Array(n).keys()].filter(i=>!miss[j][i] && okRow(i)); const misI=[...Array(n).keys()].filter(i=>miss[j][i]);
      if (obsI.length<5||!misI.length) return; const X=obsI.map(pred), y=obsI.map(i=>cur[j][i]); const r=meOLS(X,y); const kk=X[0].length;
      const s2=r.ssr/Math.max(1,obsI.length-kk); const sStar=s2*(obsI.length-kk)/Math.max(1e-9,chi2(Math.max(1,obsI.length-kk)));
      const Lc=ciChol(r.XtXinv.map((row,a)=>row.map((v,b)=>v*sStar+(a===b?1e-12:0)))); const z=new Array(kk).fill(0).map(gauss); const bStar=r.beta.map((b,a)=>b+(Lc? Lc[a].reduce((s,v,q)=>s+v*z[q],0) : 0));
      const yhatObs=obsI.map((i,q)=>meDot(X[q],r.beta)); const order=obsI.map((_,q)=>q).sort((a,b)=>yhatObs[a]-yhatObs[b]); const sorted=order.map(q=>yhatObs[q]);
      misI.forEach(i=>{ const xi=pred(i); if (xi.some(v=>!isFinite(v))) return; const t=meDot(xi,bStar); let lo=0, hi=sorted.length; while(lo<hi){ const md=(lo+hi)>>1; if (sorted[md]<t) lo=md+1; else hi=md; }
        const cand=[]; let l=lo-1, rr=lo; while (cand.length<donors && (l>=0||rr<sorted.length)){ const dl=l>=0? t-sorted[l] : Infinity, dr=rr<sorted.length? sorted[rr]-t : Infinity; if (dl<=dr){ cand.push(order[l]); l--; } else { cand.push(order[rr]); rr++; } }
        cur[j][i]=y[cand[Math.floor(rng()*cand.length)]]; }); });
    const filled=rows.map((r,i)=>{ const nr=r.slice(); cols.forEach((c,j)=>{ if (miss[j][i]) nr[ix[c]]=String(cur[j][i]); }); return nr; }); out.push(filled);
  }
  cols.forEach((c,j)=>fmiCols[c]=miss[j].filter(Boolean).length);
  return { datasets: out, missingByCol: fmiCols };
};
// Rubin's (1987) rules with the Barnard–Rubin (1999) small-sample degrees of freedom
const meRubin = (ests, ses, dfCom=Infinity) => { const M=ests.length; const Q=meSeqMean(ests); const U=meSeqMean(ses.map(s=>s*s)); const B=M>1? ests.reduce((s,v)=>s+(v-Q)**2,0)/(M-1) : 0;
  const T=U+(1+1/M)*B; const lam=T>0? (1+1/M)*B/T : 0; const nuOld= B>0? (M-1)/(lam*lam) : Infinity; const nuObs= isFinite(dfCom)? (dfCom+1)/(dfCom+3)*dfCom*(1-lam) : Infinity;
  const nu = isFinite(nuOld)&&isFinite(nuObs)? nuOld*nuObs/(nuOld+nuObs) : Math.min(nuOld,nuObs); const r=U>0? (1+1/M)*B/U : 0; const fmi=(r+2/((isFinite(nu)?nu:1e9)+3))/(r+1);
  return { est:Q, se:Math.sqrt(T), df:nu, fmi, within:U, between:B }; };
// Robustness value for the OLS-with-controls estimate (classical t, as in sensemakr)
const meOLSRobustness = (units) => { const X=units.map(u=>[1,u.d,...u.x]); const r=meOLS(X, units.map(u=>u.y)); const se=Math.sqrt(r.sigma2*r.XtXinv[1][1]); const t=r.beta[1]/se; return { t, df:r.n-r.k, ...meRobustnessValue(t, r.n-r.k) }; };

// <<< RESEARCH METHODS ENGINE <<<

// ══════════════════════════════════════════════
// POLICY IMPACT LAB (UI)
// ══════════════════════════════════════════════
const WB_FETCH_SOURCES = ["worldbank","bog","bis","unctad","wbpov","ilo","unesco","environment"];
const ciWBVarList = () => {
  const seen=new Set(); const out=[];
  [...ALL_SOURCES.macro, ...ALL_SOURCES.micro].forEach(s=>(s.vars||[]).forEach(v=>{
    const api=v.api||s.id; let code=null;
    if (api==="worldbank" || (!v.api && WB_FETCH_SOURCES.includes(s.id))) code=v.wbCode||v.code;
    else if (api==="imf" && IMF_TO_WB[v.code]) code=IMF_TO_WB[v.code];
    if (!code || seen.has(code) || WGI_CODES.has(code)) return; seen.add(code);
    out.push({ code, name:v.name, cat:v.cat||"", src:s.short, fmt:v.fmt });
  }));
  return out.sort((a,b)=>a.name.localeCompare(b.name));
};
// Many countries in one World Bank call: {ISO2: {year: value}}
const fetchWorldBankPanel = async (codes, indicator, y0, y1) => {
  const out={}; const chunks=[]; for (let i=0;i<codes.length;i+=40) chunks.push(codes.slice(i,i+40));
  await Promise.all(chunks.map(async ch=>{
    const ckey=`wbp:${ch.join(";")}:${indicator}:${y0}:${y1}`; let rows=cacheGet(ckey);
    if (!rows){ const j=await proxyFetch(`https://api.worldbank.org/v2/country/${ch.join(";")}/indicator/${indicator}?format=json&per_page=20000&date=${y0}:${y1}`);
      rows = Array.isArray(j)&&Array.isArray(j[1]) ? j[1].map(d=>({ c:d.country?.id, y:parseInt(d.date), v:d.value==null? null : parseFloat(d.value) })) : [];
      if (rows.length) cacheSet(ckey, rows); }
    rows.forEach(r=>{ if(!r.c) return; (out[r.c]||(out[r.c]={}))[r.y]=r.v; });
  }));
  return out;
};
// ── EcoScope selection → cross-country panels ──
const ciItemKey = (it) => `${it.sourceId}:${it.varCode}`;
// How a basket item can be fetched for many countries at once
const ciResolveItem = (it) => {
  if (it.sourceId==="__imported__") return { route:"none", reason:"imported CSV (use ‘Use EcoScope import’)" };
  const s=[...ALL_SOURCES.macro, ...ALL_SOURCES.micro].find(x=>x.id===it.sourceId); const v=s?.vars?.find(x=>x.code===it.varCode);
  if (!s||!v) return { route:"none", reason:"unknown variable" };
  const api=v.api||s.id;
  if (api==="worldbank" || (!v.api && WB_FETCH_SOURCES.includes(s.id))) return { route:"wb", code:v.wbCode||v.code, fmt:v.fmt };
  if (api==="imf") return IMF_TO_WB[v.code]? { route:"wb", code:IMF_TO_WB[v.code], fmt:v.fmt } : { route:"none", reason:"IMF series without a World Bank equivalent" };
  if (api==="who") return { route:"who", code:v.code, fmt:v.fmt };
  if (api==="fred") return { route:"none", reason:"FRED covers the United States only" };
  if (api==="yahoo") return { route:"none", reason:"market series, not country panels" };
  return { route:"none", reason:"source has no multi-country API" };
};
const ISO3_TO_ISO2 = Object.fromEntries(Object.entries(ISO3).map(([a,b])=>[b,a]));
const fetchWHOPanel = async (codes, indicator, y0, y1) => {
  const ckey=`whop:${indicator}:${y0}:${y1}`; let rows=cacheGet(ckey);
  if (!rows){ const j=await proxyFetch(`https://ghoapi.azureedge.net/api/${indicator}?$filter=TimeDim ge ${y0} and TimeDim le ${y1}&$select=SpatialDim,TimeDim,NumericValue,Dim1`);
    rows=Array.isArray(j?.value)? j.value.filter(d=>d.NumericValue!=null).map(d=>({ c:d.SpatialDim, y:d.TimeDim, v:d.NumericValue, s:d.Dim1 })) : []; if (rows.length) cacheSet(ckey, rows); }
  const want=new Set(codes); const both=rows.some(r=>r.s==="SEX_BTSX"); const out={};
  rows.forEach(r=>{ if (both && r.s!=="SEX_BTSX") return; const c2=ISO3_TO_ISO2[r.c]; if(!c2||!want.has(c2)) return; (out[c2]||(out[c2]={}))[r.y]=r.v; });
  return out;
};
// {ISO2: {year: value}} for one basket item, optionally passed through EcoScope's imputation and transform
const fetchItemPanel = async (it, codes, y0, y1, eco=null) => {
  const rs=ciResolveItem(it); if (rs.route==="none") return null;
  const pad = eco && eco.transform && eco.transform!=="none" ? 5 : 0; // extra years so lag-based transforms are defined at the window start
  const P = rs.route==="wb" ? await fetchWorldBankPanel(codes, rs.code, y0-pad, y1) : await fetchWHOPanel(codes, rs.code, y0-pad, y1);
  if (!eco) return P;
  const out={}; const yrs=Array.from({length:y1-y0+pad+1},(_,i)=>y0-pad+i);
  Object.entries(P).forEach(([c,m])=>{ let ser=yrs.map(y=>({ year:y, value: m[y]==null? null : m[y] }));
    if (eco.impute && eco.impute!=="none") ser=imputeData(ser, eco.impute); if (eco.transform && eco.transform!=="none") ser=applyTransform(ser, eco.transform);
    out[c]=Object.fromEntries(ser.filter(d=>d.year>=y0).map(d=>[d.year, d.value])); });
  return out;
};
const ciEcoNote = (eco) => { const t=TRANSFORMS.find(x=>x.id===eco?.transform)?.label, m=IMPUTE_METHODS.find(x=>x.id===eco?.impute)?.label;
  return [eco?.transform&&eco.transform!=="none"? `transform: ${t||eco.transform}` : null, eco?.impute&&eco.impute!=="none"? `imputation: ${m||eco.impute}` : null].filter(Boolean).join(" · ") || "no transform or imputation set"; };

// CSV parser that respects quoted fields
const ciParseCSV = (text) => {
  const rows=[]; let row=[], cur="", q=false; const delim = (text.split(/\r?\n/)[0].match(/\t/g)||[]).length > (text.split(/\r?\n/)[0].match(/,/g)||[]).length ? "\t" : (text.split(/\r?\n/)[0].includes(";") && !text.split(/\r?\n/)[0].includes(",") ? ";" : ",");
  for (let i=0;i<text.length;i++){ const ch=text[i];
    if (q){ if (ch==='"'){ if (text[i+1]==='"'){ cur+='"'; i++; } else q=false; } else cur+=ch; }
    else if (ch==='"') q=true; else if (ch===delim){ row.push(cur); cur=""; }
    else if (ch==="\n"||ch==="\r"){ if (ch==="\r"&&text[i+1]==="\n") i++; row.push(cur); cur=""; if (row.some(c=>c!=="")) rows.push(row); row=[]; }
    else cur+=ch; }
  row.push(cur); if (row.some(c=>c!=="")) rows.push(row);
  if (rows.length<2) return { error:"The file needs a header row and at least one data row." };
  const headers=rows[0].map(h=>h.trim()); return { headers, rows: rows.slice(1).filter(r=>r.length>=headers.length-1) };
};
// Simulated job-training study for demonstration (true ATT is known)
const ciDemoData = () => {
  const rng=ciRng(99); const g=()=>{ let u=0; while(!u) u=rng(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rng()); };
  const headers=["earnings_post","trained","age","educ_years","female","married","region","earnings_prior"]; const rows=[]; let att=0, nT=0;
  const regions=["North","South","Coast","Capital"];
  for (let i=0;i<1500;i++){
    const age=Math.round(20+Math.abs(g())*12+rng()*10), educ=Math.max(6,Math.min(18,Math.round(11+g()*2.5))), female=rng()<0.45?1:0, married=rng()<0.4?1:0;
    const region=regions[Math.floor(rng()*4)]; const prior=Math.max(0, 6000+ (educ-11)*900 + (age-30)*120 + g()*3500);
    const lp=-1.2 -0.04*(age-30) -0.12*(educ-11) +0.4*female -0.00018*(prior-6000) + (region==="North"?0.5:0); const d=rng()<1/(1+Math.exp(-lp))?1:0;
    const tau=1800 - 60*(educ-11); const y0=Math.max(0, 4000 + 0.55*prior + 350*(educ-11) + 80*(age-30) - 900*female + 700*married + (region==="Capital"?1500:0) + g()*3000);
    const y=y0 + d*tau; if (d){ att+=tau; nT++; }
    rows.push([y.toFixed(0), d, age, educ, female, married, region, prior.toFixed(0)].map(String));
  }
  return { headers, rows, trueATT: att/nT, name:"Simulated job-training study (n=1,500)" };
};

const ciFmt = (v, d=2) => v==null||!isFinite(v) ? "—" : Math.abs(v)>=1e5 ? v.toExponential(2) : Number(v).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
const useBoxWidth = (init=560) => { const ref=useRef(null); const [w,setW]=useState(init);
  useEffect(()=>{ if(!ref.current) return; const el=ref.current; const ro=new ResizeObserver(es=>{ const cw=Math.round(es[0].contentRect.width); if (cw>0) setW(cw); }); ro.observe(el); return ()=>ro.disconnect(); },[]);
  return [ref,w]; };
// signed number formatting with the variable's unit
const ciFmtVal = (v, fmt) => { if (v==null||!isFinite(v)) return "—"; const sg=v<0?"−":""; const a=Math.abs(v);
  if (fmt==="currency"){ if(a>=1e12) return `${sg}$${(a/1e12).toFixed(2)}T`; if(a>=1e9) return `${sg}$${(a/1e9).toFixed(2)}B`; if(a>=1e6) return `${sg}$${(a/1e6).toFixed(2)}M`; return `${sg}$${a.toLocaleString(undefined,{maximumFractionDigits:a<100?2:0})}`; }
  if (fmt==="pct") return `${sg}${a.toFixed(2)}%`;
  if (a>=1e9) return `${sg}${(a/1e9).toFixed(2)}B`; if (a>=1e6) return `${sg}${(a/1e6).toFixed(2)}M`; return `${sg}${a.toLocaleString(undefined,{maximumFractionDigits:2})}`; };
const ciFmtP = (p) => !isFinite(p) ? "—" : p<0.001 ? "<0.001" : p.toFixed(3);

// ── small presentational pieces ──
const LabSec = ({title, sub, right, children}) => (
  <div style={{...card, padding:"16px 18px"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:12,flexWrap:"wrap"}}>
      <div><div style={{fontSize:14,fontWeight:600,color:C.text}}>{title}</div>{sub&&<div style={{fontSize:12,color:C.mid,marginTop:2}}>{sub}</div>}</div>{right}
    </div>
    {children}
  </div>
);
// group = true for fields holding several controls (checkbox lists, button rows): rendered as a labelled group, not a <label>
const LabField = ({label, hint, children, group=false}) => { const Tag = group? "div" : "label";
  return (
  <Tag role={group?"group":undefined} aria-label={group?label:undefined} style={{display:"block",marginBottom:12}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:8,marginBottom:5}}><span style={{fontSize:11,color:C.mid,textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:600}}>{label}</span>{hint&&<span style={{fontSize:11,color:C.dim}}>{hint}</span>}</div>
    {children}
  </Tag>
); };
const LabNote = ({tone="info", children}) => { const col = tone==="warn"? C.orange : tone==="bad"? C.red : C.blue;
  return <div role={tone==="info"?"note":"alert"} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"9px 12px",border:`1px solid ${col}55`,background:`${col}12`,borderRadius:6,fontSize:12,color:C.text,lineHeight:1.55}}>
    <span aria-hidden="true" style={{color:col,fontWeight:700}}>{tone==="info"?"i":"!"}</span><div>{children}</div></div>; };
const Check = ({checked, onChange, label, sub}) => (
  <label style={{display:"flex",gap:8,alignItems:"flex-start",padding:"5px 0",cursor:"pointer",fontSize:12,color:C.text}}>
    <input type="checkbox" checked={!!checked} onChange={e=>onChange(e.target.checked)} style={{marginTop:2,accentColor:C.gold}}/>
    <span>{label}{sub&&<span style={{display:"block",color:C.dim,fontSize:11}}>{sub}</span>}</span>
  </label>
);
// theme-reactive table cell styles (getters read the active theme at render time)
const thS = { textAlign:"left", padding:"7px 10px", fontSize:11, get color(){return C.mid}, fontWeight:600, get borderBottom(){return `1px solid ${C.borderHi}`}, whiteSpace:"nowrap", position:"sticky", top:0, get background(){return C.card} };
const tdS = { padding:"7px 10px", fontSize:12, get color(){return C.text}, get borderBottom(){return `1px solid ${C.border}`}, whiteSpace:"nowrap" };
const tdN = Object.defineProperties({ textAlign:"right", fontVariantNumeric:"tabular-nums" }, Object.getOwnPropertyDescriptors(tdS));

// Forest plot of estimates with 95% CIs
const ForestPlot = ({ results, selected, onSelect }) => {
  const [ref,W0]=useBoxWidth(640);
  const rows=results.filter(r=>isFinite(r.est)); if (!rows.length) return null;
  const lo=Math.min(0,...rows.map(r=>isFinite(r.lo)?r.lo:r.est)), hi=Math.max(0,...rows.map(r=>isFinite(r.hi)?r.hi:r.est)); const pad=(hi-lo)*0.08||1; const a=lo-pad, b=hi+pad;
  const W=Math.max(W0,320), L=Math.min(260,W*0.42), R=16, H=rows.length*30+34; const x=(v)=>L+(v-a)/(b-a)*(W-L-R); const maxCh=Math.floor(L/6.4);
  const ticks=Array.from({length:5},(_,i)=>a+(b-a)*i/4);
  return (
    <div ref={ref} style={{width:"100%"}}><svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Forest plot of treatment-effect estimates with 95% confidence intervals" style={{display:"block"}}>
      {ticks.map((t,i)=>{ const rg=b-a; const dec=rg<0.05?4: rg<0.5?3: rg<5?2: rg<50?1:0; return <g key={i}><line x1={x(t)} x2={x(t)} y1={8} y2={H-24} stroke={C.border}/><text x={x(t)} y={H-8} textAnchor="middle" fontSize="10" fill={C.mid}>{ciFmt(t,dec)}</text></g>; })}
      <line x1={x(0)} x2={x(0)} y1={6} y2={H-24} stroke={C.mid} strokeDasharray="3 3"/>
      {rows.map((r,i)=>{ const y=22+i*30; const sel=selected===results.indexOf(r); const col=sel? C.gold : C.text;
        return <g key={i} onClick={()=>onSelect&&onSelect(results.indexOf(r))} style={{cursor:"pointer"}}>
          <rect x={0} y={y-14} width={W} height={28} fill={sel?`${C.gold}14`:"transparent"}/>
          <text x={8} y={y+4} fontSize="11" fill={col}><title>{r.method}</title>{r.method.length>maxCh? r.method.slice(0,maxCh-1)+"…" : r.method}</text>
          {isFinite(r.lo)&&isFinite(r.hi)&&<line x1={x(r.lo)} x2={x(r.hi)} y1={y} y2={y} stroke={col} strokeWidth="2"/>}
          <circle cx={x(r.est)} cy={y} r="4.5" fill={col}/>
        </g>; })}
    </svg></div>
  );
};
// Love plot: |SMD| before vs after
const LovePlot = ({ balance }) => {
  const [ref,W0]=useBoxWidth(560); if (!balance?.length) return null; const W=Math.max(W0,280), L=Math.min(170,W*0.38), R=16, rowH=22, H=balance.length*rowH+40;
  const mx=Math.max(0.3,...balance.flatMap(b=>[Math.abs(b.smdBefore),Math.abs(b.smdAfter)]).filter(isFinite)); const x=(v)=>L+Math.min(v,mx)/mx*(W-L-R);
  return (
    <div ref={ref} style={{width:"100%"}}><svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Love plot of absolute standardized mean differences before and after adjustment" style={{display:"block"}}>
      {[0,0.1,0.25,0.5,1,2,4].filter(t=>t<=mx).filter((t,i,arr)=>i===0||t===0.1||x(t)-x(arr[i-1])>=28).map(t=><g key={t}><line x1={x(t)} x2={x(t)} y1={6} y2={H-26} stroke={t===0.1?C.orange:C.border} strokeDasharray={t?"4 3":""}/><text x={x(t)} y={H-10} textAnchor="middle" fontSize="10" fill={C.mid}>{t}</text></g>)}
      {balance.map((b,i)=>{ const y=16+i*rowH; return <g key={i}>
        <text x={8} y={y+4} fontSize="11" fill={C.text}>{b.name.length>24? b.name.slice(0,23)+"…" : b.name}</text>
        <line x1={x(Math.abs(b.smdBefore))} x2={x(Math.abs(b.smdAfter))} y1={y} y2={y} stroke={C.border}/>
        <circle cx={x(Math.abs(b.smdBefore))} cy={y} r="4" fill="none" stroke={C.red} strokeWidth="1.6"/>
        <circle cx={x(Math.abs(b.smdAfter))} cy={y} r="4" fill={C.teal}/>
      </g>; })}
    </svg></div>
  );
};
// Propensity-score overlap: mirrored histogram (treated up, control down)
const OverlapPlot = ({ ps, d, lo, hi }) => {
  const bins=25; const ht=new Array(bins).fill(0), hc=new Array(bins).fill(0);
  ps.forEach((p,i)=>{ const b=Math.min(bins-1,Math.floor(p*bins)); d[i]? ht[b]++ : hc[b]++; });
  const nt=d.filter(Boolean).length||1, nc=d.length-nt||1; const ft=ht.map(v=>v/nt), fc=hc.map(v=>v/nc); const mx=Math.max(...ft,...fc)||1;
  const [ref,W0]=useBoxWidth(560); const W=Math.max(W0,280), H=220, L=12, R=12, mid=H/2; const bw=(W-L-R)/bins; const sy=(v)=>v/mx*(mid-22);
  return (
    <div ref={ref} style={{width:"100%"}}><svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Distribution of estimated propensity scores for treated and control units" style={{display:"block"}}>
      {isFinite(lo)&&isFinite(hi)&&<rect x={L+lo*(W-L-R)} y={8} width={(hi-lo)*(W-L-R)} height={H-30} fill={`${C.gold}10`} stroke={`${C.gold}55`} strokeDasharray="3 3"/>}
      {ft.map((v,i)=><rect key={"t"+i} x={L+i*bw+1} y={mid-sy(v)} width={bw-2} height={sy(v)} fill={C.gold}/>)}
      {fc.map((v,i)=><rect key={"c"+i} x={L+i*bw+1} y={mid} width={bw-2} height={sy(v)} fill={C.mid} opacity="0.7"/>)}
      <line x1={L} x2={W-R} y1={mid} y2={mid} stroke={C.borderHi}/>
      {[0,0.25,0.5,0.75,1].map(t=><text key={t} x={L+t*(W-L-R)} y={H-6} textAnchor="middle" fontSize="10" fill={C.mid}>{t}</text>)}
      <text x={W-R} y={20} textAnchor="end" fontSize="11" fill={C.gold}>▲ Treated ({nt})</text>
      <text x={W-R} y={H-30} textAnchor="end" fontSize="11" fill={C.mid}>▼ Control ({nc})</text>
    </svg></div>
  );
};

// ── Matching tab ──
function MatchingTab({ isMobile, imported, basket=[], eco, years, defaultCountry, incoming }) {
  const [data,setData]=useState(null); const [fileErr,setFileErr]=useState("");
  const [cfg,setCfg]=useState({ y:"", d:"", treatValue:"", covs:[], exact:[], squares:false, missing:"drop", estimand:"ATT", trim:0, M:1, metric:"mahalanobis", replace:true, biasAdj:true, caliper:0, strata:5, cemBins:0, B:199, ipwSE:"bootstrap", miM:10,
    methods:{ subclass:true, nn:true, psm:true, ipw:true, aipw:true, cem:true } });
  const [out,setOut]=useState(null); const [busy,setBusy]=useState(false); const [boot,setBoot]=useState(null); const [pick,setPick]=useState(null);
  const resRef=useRef(null); useEffect(()=>{ if (isMobile && out?.results && resRef.current) resRef.current.scrollIntoView({behavior:"smooth",block:"start"}); },[out?.results?.length, isMobile]);
  const set=(k,v)=>setCfg(c=>({...c,[k]:v}));
  const load=(parsed, name, trueATT=null, pre=null)=>{ if (parsed.error){ setFileErr(parsed.error); return; } setFileErr(""); setOut(null); setBoot(null);
    const h=parsed.headers; const guessY=pre?.y||h.find(x=>/re78|earn|wage|income|outcome|^y$/i.test(x))||h[0]; const guessD=pre?.d||h.find(x=>/treat|trained|program|^d$|policy/i.test(x))||h[1];
    setData({ ...parsed, name, trueATT, note:pre?.note||null });
    setCfg(c=>({...c, y:guessY, d:guessD, treatValue:"", covs: pre?.covs || h.filter(x=>x!==guessY&&x!==guessD).slice(0,12), exact:[], missing: pre?.missing||c.missing })); };
  // ── build a country-level dataset from the variables selected in EcoScope ──
  const ecoItems = useMemo(()=>basket.map(it=>({ key:ciItemKey(it), name:it.label, src:it.sourceName, item:it, ...ciResolveItem(it) })),[basket]);
  const ecoUsable = ecoItems.filter(x=>x.route!=="none");
  const midYear = years? Math.round((years[0]+years[1])/2) : 2010;
  const [bld,setBld]=useState(()=>({ open:false, y:ecoUsable[0]?.key||"", measure:"post", y0:years?.[0]??2000, t0:midYear, y1:Math.min(years?.[1]??CURRENT_YEAR, CURRENT_YEAR-1), mode:"pick", treated:defaultCountry? [defaultCountry] : [], ruleVar:ecoUsable[1]?.key||ecoUsable[0]?.key||"", op:">=", thr:"", region:"All", covs:ecoUsable.slice(1).map(x=>x.key), applyEco:true, busy:"" }));
  const setB=(k,v)=>setBld(b=>({...b,[k]:v}));
  const buildEco=async ()=>{
    const b=bld; if (!b.y) return; if (b.t0<=b.y0 || b.t0>b.y1){ setFileErr("Policy year must fall after the start year and no later than the end year."); return; }
    const ctry=COUNTRIES.filter(c=>b.region==="All"||c.region===b.region); const codes=ctry.map(c=>c.code); const ecoOpt=b.applyEco? eco : null;
    const need=[...new Set([b.y, ...b.covs, ...(b.mode==="rule"&&b.ruleVar? [b.ruleVar] : [])])];
    const P={}; for (const k of need){ const x=ecoItems.find(e=>e.key===k); setB("busy",`Downloading ${x?.name} for ${codes.length} countries…`); P[k]=await fetchItemPanel(x.item, codes, b.y0, b.y1, ecoOpt)||{}; }
    const avg=(m,a,z)=>{ const v=[]; for (let y=a;y<=z;y++){ const q=m?.[y]; if (q!=null&&isFinite(q)) v.push(q); } return v.length? ciMean(v) : null; };
    const yName=ecoItems.find(e=>e.key===b.y)?.name||"outcome"; const covNames=b.covs.map(k=>`${ecoItems.find(e=>e.key===k)?.name} (pre-avg)`);
    const headers=["country","iso2","region","treated", b.measure==="post"? `${yName} (post-avg)` : `${yName} (change)`, ...covNames];
    const rows=ctry.map(c=>{ const post=avg(P[b.y]?.[c.code], b.t0, b.y1), pre=avg(P[b.y]?.[c.code], b.y0, b.t0-1);
      const out = b.measure==="post"? post : (post!=null&&pre!=null? post-pre : null);
      let d; if (b.mode==="pick") d = b.treated.includes(c.code)? 1 : 0; else { const rv=avg(P[b.ruleVar]?.[c.code], b.y0, b.t0-1); const t=parseFloat(b.thr); d = rv==null||!isFinite(t)? "" : ((b.op===">="? rv>=t : rv<=t)? 1 : 0); }
      return [c.name, c.code, c.region, d, out, ...b.covs.map(k=>avg(P[k]?.[c.code], b.y0, b.t0-1))].map(v=>v==null? "" : String(v)); });
    const nT=rows.filter(r=>r[3]==="1").length, nC=rows.filter(r=>r[3]==="0").length;
    setB("busy","");
    const ruleInCovs = b.mode==="rule" && b.covs.includes(b.ruleVar);
    if (nT<2||nC<2){ setFileErr(`The treatment rule gives ${nT} treated and ${nC} control countries. You need at least two of each.`); return; }
    load({ headers, rows }, `EcoScope selection · ${ctry.length} countries · policy ${b.t0}`, null,
      { y:headers[4], d:"treated", covs:covNames, missing:"drop",
        note:`Units are countries. Outcome = ${b.measure==="post"? `average ${b.t0}–${b.y1}` : `average ${b.t0}–${b.y1} minus average ${b.y0}–${b.t0-1}`}; covariates = averages ${b.y0}–${b.t0-1}${b.applyEco? ` (${ciEcoNote(eco)})` : ""}. Treated: ${b.mode==="pick"? b.treated.map(c=>COUNTRIES.find(x=>x.code===c)?.name).join(", ") : `pre-period ${ecoItems.find(e=>e.key===b.ruleVar)?.name} ${b.op} ${b.thr}`}.${ruleInCovs? " Warning: treatment is a deterministic cutoff on a covariate, so treated and controls cannot overlap on it. A threshold design calls for regression discontinuity, not matching." : ""}` });
    setB("open",false);
  };
  useEffect(()=>{ if (incoming?.table) load(incoming.table, incoming.name); // data handed over from Data structure
  },[incoming?.id]);
  const onFile=(f)=>{ if(!f) return; if (f.size>25*1024*1024){ setFileErr("File is larger than 25 MB. Upload a sample or fewer columns."); return; }
    const r=new FileReader(); r.onload=()=>load(ciParseCSV(String(r.result)), f.name); r.readAsText(f); };
  const dVals = useMemo(()=>{ if(!data||!cfg.d) return []; const i=data.headers.indexOf(cfg.d); return [...new Set(data.rows.map(r=>String(r[i]??"").trim()))].filter(Boolean).slice(0,12); },[data,cfg.d]);
  const needTreatValue = dVals.length>0 && !(dVals.every(v=>v==="0"||v==="1"));
  const run=()=>{ if(!data) return; setBusy(true); setOut(null); setBoot(null); setPick(null);
    setTimeout(async ()=>{
      try{
        const tv = needTreatValue? (cfg.treatValue||dVals[0]) : null;
        if (cfg.missing==="mi"){ // multiple imputation: impute numeric covariates M times (PMM), run every method on each, pool with Rubin's rules
          const ix=Object.fromEntries(data.headers.map((h,i)=>[h,i])); const isNum=(c)=>data.rows.slice(0,400).every(r=>{ const v=String(r[ix[c]]??"").trim(); return !v||/^(na|nan|null|\.|-)$/i.test(v)||!isNaN(parseFloat(v.replace(/[$,%\s]/g,""))); });
          const yOK=data.rows.filter(r=>{ const y=parseFloat(String(r[ix[cfg.y]]??"").replace(/[$,%\s]/g,"")); const dv=String(r[ix[cfg.d]]??"").trim(); return isFinite(y) && dv!==""; });
          const numCovs=cfg.covs.filter(isNum); const anyMiss=numCovs.some(c=>yOK.some(r=>{ const v=String(r[ix[c]]??"").trim(); return !v||/^(na|nan|null|\.|-)$/i.test(v); }));
          if (!anyMiss){ setBoot(null); const prep0=ciPrepare(data.headers, data.rows, { y:cfg.y, d:cfg.d, treatValue:tv, covs:cfg.covs, squares:cfg.squares, exact:cfg.exact, missing:"impute" }); const o0=ciRunAll(prep0, { ...cfg, ipwSE:"sandwich", caliper: cfg.caliper||null, cemBins: cfg.cemBins||null });
            o0.warnings.unshift("No numeric covariate has missing values, so multiple imputation is not needed: results are the complete-data estimates (IPW with sandwich SEs).");
            o0.prep={ n:prep0.units.length, nT:prep0.nT, nC:prep0.nC, dropped:prep0.dropped.missing, imputedCells:prep0.dropped.imputedCells, names:prep0.names, covInfo:prep0.covInfo, d:prep0.units.map(u=>u.d) };
            setOut(o0); setPick(o0.results.length>2? 3 : o0.results.length-1); setBusy(false); return; }
          const mi=meMICE(data.headers, yOK, numCovs, [cfg.y, ...(isNum(cfg.d)? [cfg.d] : [])], cfg.miM||10, 10, 91);
          const runs=[]; for (let m=0;m<mi.datasets.length;m++){ const pm=ciPrepare(data.headers, mi.datasets[m], { y:cfg.y, d:cfg.d, treatValue:tv, covs:cfg.covs, squares:cfg.squares, exact:cfg.exact, missing:"impute" });
            runs.push({ prep:pm, out:ciRunAll(pm, { ...cfg, ipwSE:"sandwich", caliper: cfg.caliper||null, cemBins: cfg.cemBins||null }) }); setBoot({ k:m+1, n:mi.datasets.length, label:"Imputation" }); await new Promise(r=>setTimeout(r,0)); }
          const base=runs[0]; const o=base.out; if (o.error){ setOut(o); setBusy(false); setBoot(null); return; }
          const dfCom=Math.max(1, base.prep.units.length - base.prep.names.length - 2);
          o.results=o.results.map((r,i)=>{ const ests=runs.map(x=>x.out.results[i]?.est), ses=runs.map(x=>x.out.results[i]?.se); if (ests.some(v=>!isFinite(v))||ses.some(v=>!isFinite(v))) return r;
            const R=meRubin(ests, ses, dfCom); return { ...r, ...ciResult(r.method, r.estimand, R.est, R.se), lo:R.est-meTQuant(0.975,R.df)*R.se, hi:R.est+meTQuant(0.975,R.df)*R.se, p:meTPval(R.est/R.se,R.df), fmi:R.fmi,
              note:[r.note, `Pooled over ${runs.length} imputations (Rubin's rules, Barnard–Rubin df = ${isFinite(R.df)? R.df.toFixed(0) : "∞"}). Fraction of missing information: ${(100*R.fmi).toFixed(0)}%.`].filter(Boolean).join(" ") }; });
          const nMiss=Object.values(mi.missingByCol).reduce((a,b)=>a+b,0);
          o.warnings=[...new Set(runs.flatMap(x=>x.out.warnings))].filter(w=>!/imputed/.test(w));
          o.warnings.unshift(`Multiple imputation: ${nMiss.toLocaleString()} missing value(s) in ${Object.values(mi.missingByCol).filter(Boolean).length} numeric covariate(s) were imputed ${runs.length} times by predictive mean matching (chained equations using the outcome and the other covariates). Estimates and SEs are pooled with Rubin's rules; balance and overlap below are from the first imputed dataset.${cfg.covs.length>numCovs.length? " Categorical covariates keep a \"(missing)\" level." : ""}`);
          o.prep={ n:base.prep.units.length, nT:base.prep.nT, nC:base.prep.nC, dropped:data.rows.length-yOK.length, imputedCells:nMiss, names:base.prep.names, covInfo:base.prep.covInfo, d:base.prep.units.map(u=>u.d), mi:runs.length };
          setOut(o); setPick(o.results.length>2? 3 : o.results.length-1); setBusy(false); setBoot(null); return; }
        const prep=ciPrepare(data.headers, data.rows, { y:cfg.y, d:cfg.d, treatValue: tv, covs:cfg.covs, squares:cfg.squares, exact:cfg.exact, missing:cfg.missing });
        if (!prep.units.length){ setOut({ error:"No usable rows: check that the outcome is numeric and the treatment has two values." }); setBusy(false); return; }
        const o=ciRunAll(prep, { ...cfg, caliper: cfg.caliper||null, cemBins: cfg.cemBins||null });
        if (prep.dropped.imputedCells) o.warnings.push(`${prep.dropped.imputedCells.toLocaleString()} missing covariate value(s) were imputed. Standard errors treat them as observed, so they understate uncertainty; compare with the complete-case run.`);
        o.prep={ n:prep.units.length, nT:prep.nT, nC:prep.nC, dropped:prep.dropped.missing, imputedCells:prep.dropped.imputedCells, names:prep.names, covInfo:prep.covInfo, d:prep.units.map(u=>u.d) };
        setOut(o); setPick(o.results.length>2? 3 : o.results.length-1); setBusy(false);
        if (o.ipwIndex!=null){ const b=await ciBootstrapIPW(o._ipw.U, cfg.estimand, cfg.B, o._ipw.start, (k,n)=>setBoot({k,n}));
          setOut(prev=>{ if(!prev) return prev; const res=[...prev.results]; const r=res[prev.ipwIndex]; res[prev.ipwIndex]={...r, se:b.se, lo:b.lo, hi:b.hi, p:ciPval(r.est,b.se), pending:false, note:`${r.note} Percentile 95% CI from ${b.reps} bootstrap replications.`}; return {...prev, results:res}; });
          setBoot(null); }
      }catch(e){ console.error(e); setOut({ error:"The analysis failed: "+e.message }); setBusy(false); }
    }, 30); };
  const exportCSV=()=>{ if(!out?.results) return; dlCSV(out.results.map(r=>({ method:r.method, estimand:r.estimand, estimate:r.est, se:r.se, ci_low:r.lo, ci_high:r.hi, p_value:r.p, n_treated:r.nT, n_control:r.nC, max_abs_smd_after: Math.max(...(r.balance||[]).map(b=>Math.abs(b.smdAfter))), L1:r.L1 })), "ecoscope_matching_estimates.csv");
    const r=out.results[pick]; if (r?.balance) dlCSV(r.balance.map(b=>({ covariate:b.name, mean_treated:b.meanT, mean_control_before:b.meanC, smd_before:b.smdBefore, mean_treated_after:b.meanTAfter, mean_control_after:b.meanCAfter, smd_after:b.smdAfter, var_ratio_after:b.vrAfter })), "ecoscope_balance.csv"); };
  const H=data?.headers||[]; const cur=out?.results?.[pick];
  const numericCovs = useMemo(()=>{ if(!data) return {}; const m={}; H.forEach((h,i)=>{ const vals=data.rows.slice(0,400).map(r=>r[i]).filter(v=>v!=null&&String(v).trim()!==""); const uniq=new Set(vals); m[h]={ num: vals.every(v=>!isNaN(parseFloat(String(v).replace(/[$,%\s]/g,"")))), uniq:uniq.size }; }); return m; },[data]);

  return (
    <div style={{display:"grid",gridTemplateColumns:isMobile?"minmax(0,1fr)":"320px minmax(0,1fr)",gap:16,alignItems:"start"}}>
      {/* configuration */}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <LabSec title="1. Data" sub="Unit-level data: one row per person, firm or household.">
          <input id="ci-file" type="file" accept=".csv,.tsv,.txt" onChange={e=>onFile(e.target.files?.[0])} style={{display:"none"}}/>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <label htmlFor="ci-file" style={{...btn(C.gold),display:"inline-flex",alignItems:"center",gap:6,fontSize:12,padding:"8px 14px"}}><Ico n="file"/> Upload CSV</label>
            <button type="button" onClick={()=>{ const d=ciDemoData(); load(d, d.name, d.trueATT); }} style={{...pill(false),padding:"8px 12px",fontSize:12}}>Load demo data</button>
            {imported&&<button type="button" onClick={()=>load({ headers:imported.headers, rows:imported.rows }, imported.name)} style={{...pill(false),padding:"8px 12px",fontSize:12}}>Use EcoScope import</button>}
            <button type="button" onClick={()=>setB("open",!bld.open)} aria-expanded={bld.open} style={{...pill(bld.open),padding:"8px 12px",fontSize:12}}>Build from my selection</button>
          </div>
          {bld.open&&<div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
            {!ecoUsable.length? <LabNote tone="warn">None of the variables in your EcoScope basket can be downloaded for many countries. Add World Bank–based, IMF or WHO variables to the basket first.</LabNote> : <>
              <div style={{fontSize:11,color:C.dim,lineHeight:1.55,marginBottom:10}}>Turns your basket into a country-level dataset: one row per country, outcome measured after the policy year, covariates averaged before it.</div>
              <LabField label="Outcome"><select value={bld.y} onChange={e=>{ setB("y",e.target.value); setB("covs",bld.covs.filter(k=>k!==e.target.value)); }} style={sel}>{ecoItems.map(x=><option key={x.key} value={x.key} disabled={x.route==="none"}>{x.name}{x.route==="none"?` (${x.reason})`:""}</option>)}</select></LabField>
              <LabField label="Outcome measure"><select value={bld.measure} onChange={e=>setB("measure",e.target.value)} style={sel}><option value="post">Average after the policy year</option><option value="change">Change: post-average minus pre-average</option></select></LabField>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                <LabField label="From"><select value={bld.y0} onChange={e=>setB("y0",+e.target.value)} style={{...sel,padding:"8px"}}>{YEARS.filter(y=>y<bld.t0).map(y=><option key={y}>{y}</option>)}</select></LabField>
                <LabField label="Policy year"><select value={bld.t0} onChange={e=>setB("t0",+e.target.value)} style={{...sel,padding:"8px"}}>{YEARS.filter(y=>y>bld.y0&&y<=bld.y1).map(y=><option key={y}>{y}</option>)}</select></LabField>
                <LabField label="To"><select value={bld.y1} onChange={e=>setB("y1",+e.target.value)} style={{...sel,padding:"8px"}}>{YEARS.filter(y=>y>=bld.t0&&y<=CURRENT_YEAR).map(y=><option key={y}>{y}</option>)}</select></LabField>
              </div>
              <LabField label="Countries"><select value={bld.region} onChange={e=>setB("region",e.target.value)} style={sel}>{REGIONS.map(r=><option key={r} value={r}>{r==="All"?"All countries":r}</option>)}</select></LabField>
              <LabField group label="Who is treated?">
                <div style={{display:"flex",gap:6,marginBottom:8}}>{[["pick","Countries I pick"],["rule","Threshold rule"]].map(([k,l])=><button key={k} type="button" onClick={()=>setB("mode",k)} style={{...pill(bld.mode===k),flex:1,padding:"6px 4px"}}>{l}</button>)}</div>
                {bld.mode==="pick"? <div style={{maxHeight:150,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px"}}>
                    {COUNTRIES.filter(c=>bld.region==="All"||c.region===bld.region).map(c=><Check key={c.code} checked={bld.treated.includes(c.code)} onChange={v=>setB("treated", v? [...bld.treated,c.code] : bld.treated.filter(x=>x!==c.code))} label={c.name}/>)}
                  </div> :
                  <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 64px 90px",gap:6}}>
                    <select aria-label="Rule variable" value={bld.ruleVar} onChange={e=>setB("ruleVar",e.target.value)} style={{...sel,padding:"7px"}}>{ecoUsable.map(x=><option key={x.key} value={x.key}>{x.name}</option>)}</select>
                    <select aria-label="Rule operator" value={bld.op} onChange={e=>setB("op",e.target.value)} style={{...sel,padding:"7px"}}><option value=">=">≥</option><option value="<=">≤</option></select>
                    <input aria-label="Threshold" type="number" value={bld.thr} onChange={e=>setB("thr",e.target.value)} placeholder="value" style={{...inp,padding:"7px"}}/>
                    <div style={{gridColumn:"1 / -1",fontSize:11,color:C.dim}}>Measured as the country's average before the policy year.</div>
                  </div>}
              </LabField>
              <LabField group label="Covariates" hint="pre-period averages">
                <div style={{border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px"}}>
                  {ecoUsable.filter(x=>x.key!==bld.y).map(x=><Check key={x.key} checked={bld.covs.includes(x.key)} onChange={v=>setB("covs", v? [...bld.covs,x.key] : bld.covs.filter(k=>k!==x.key))} label={x.name}/>)}
                  {ecoUsable.filter(x=>x.key!==bld.y).length===0&&<div style={{fontSize:11,color:C.dim,padding:"6px 0"}}>Add more variables to your basket to use as covariates.</div>}
                </div>
              </LabField>
              <Check checked={bld.applyEco} onChange={v=>setB("applyEco",v)} label="Apply my EcoScope transform & imputation" sub={ciEcoNote(eco)}/>
              <button type="button" onClick={buildEco} disabled={!!bld.busy||!bld.y||(bld.mode==="pick"&&!bld.treated.length)} style={{...btn(C.gold),width:"100%",marginTop:8,opacity:bld.busy?0.55:1}}>{bld.busy? "Building…" : "Build dataset"}</button>
              {bld.busy&&<div style={{fontSize:11,color:C.mid,marginTop:6}}>{bld.busy}</div>}
            </>}
          </div>}
          {fileErr&&<div style={{marginTop:8}}><LabNote tone="bad">{fileErr}</LabNote></div>}
          {data&&<div style={{marginTop:10,fontSize:12,color:C.mid}}><b style={{color:C.text}}>{data.name}</b> · {data.rows.length.toLocaleString()} rows · {H.length} columns
            {data.trueATT!=null&&<div style={{marginTop:4,color:C.dim}}>Simulated data. True ATT = {ciFmt(data.trueATT,0)}.</div>}
            {data.note&&<div style={{marginTop:6,color:C.dim,lineHeight:1.5}}>{data.note}</div>}</div>}
        </LabSec>
        {data&&<LabSec title="2. Model">
          <LabField label="Outcome (Y)"><select value={cfg.y} onChange={e=>set("y",e.target.value)} style={sel}>{H.map(h=><option key={h} value={h}>{h}</option>)}</select></LabField>
          <LabField label="Treatment (D)"><select value={cfg.d} onChange={e=>{ set("d",e.target.value); set("treatValue",""); }} style={sel}>{H.map(h=><option key={h} value={h}>{h}</option>)}</select></LabField>
          {needTreatValue&&<LabField label="Treated value" hint="all other values = control"><select value={cfg.treatValue||dVals[0]} onChange={e=>set("treatValue",e.target.value)} style={sel}>{dVals.map(v=><option key={v} value={v}>{v}</option>)}</select></LabField>}
          <LabField group label="Covariates (X)" hint={`${cfg.covs.length} selected`}>
            <div style={{maxHeight:180,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px"}}>
              {H.filter(h=>h!==cfg.y&&h!==cfg.d).map(h=><Check key={h} checked={cfg.covs.includes(h)} onChange={v=>set("covs", v? [...cfg.covs,h] : cfg.covs.filter(x=>x!==h))}
                label={h} sub={numericCovs[h]? (numericCovs[h].num? (numericCovs[h].uniq<=2?"binary":"numeric") : `categorical · ${numericCovs[h].uniq} levels`) : null}/>)}
            </div>
          </LabField>
          <div style={{fontSize:11,color:C.dim,marginTop:-4,marginBottom:10,lineHeight:1.5}}>Use only pre-treatment variables. Conditioning on outcomes or colliders can create bias.</div>
          <Check checked={cfg.squares} onChange={v=>set("squares",v)} label="Add squared terms of continuous covariates" sub="Used in the propensity model and distances"/>
          <LabField group label="Exact-match on" hint="optional">
            <div style={{maxHeight:110,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px"}}>
              {cfg.covs.filter(h=>numericCovs[h] && (!numericCovs[h].num || numericCovs[h].uniq<=6)).map(h=><Check key={h} checked={cfg.exact.includes(h)} onChange={v=>set("exact", v? [...cfg.exact,h] : cfg.exact.filter(x=>x!==h))} label={h}/>)}
              {!cfg.covs.some(h=>numericCovs[h] && (!numericCovs[h].num || numericCovs[h].uniq<=6))&&<div style={{fontSize:11,color:C.dim,padding:"6px 0"}}>No categorical covariates selected.</div>}
            </div>
          </LabField>
          <LabField label="Missing covariates">
            <select value={cfg.missing} onChange={e=>set("missing",e.target.value)} style={sel}><option value="drop">Drop rows (complete cases)</option><option value="mi">Multiple imputation (PMM, pooled with Rubin's rules)</option><option value="impute">Single imputation: mean / "(missing)" level + indicators</option></select>
          </LabField>
          {cfg.missing==="mi"&&<div style={{display:"flex",gap:8,alignItems:"center",marginTop:-4,marginBottom:10}}><select aria-label="Number of imputations" value={cfg.miM} onChange={e=>set("miM",+e.target.value)} style={{...sel,width:"auto",padding:"5px 8px",fontSize:12}}>{[5,10,20].map(m=><option key={m} value={m}>M = {m} imputations</option>)}</select><span style={{fontSize:11,color:C.dim,lineHeight:1.45}}>SEs include imputation uncertainty. IPW uses sandwich SEs in this mode.</span></div>}
          {cfg.missing==="impute"&&<div style={{fontSize:11,color:C.dim,marginTop:-4,marginBottom:10,lineHeight:1.5}}>Each imputed covariate gets a 0/1 missingness indicator that is matched and balanced on. Rows missing the outcome or treatment are always dropped.</div>}
          <LabField group label="Estimand">
            <div style={{display:"flex",gap:6}}>{[["ATT","Treated"],["ATE","Everyone"],["ATC","Controls"]].map(([k,l])=><button key={k} type="button" onClick={()=>set("estimand",k)} style={{...pill(cfg.estimand===k),flex:1,padding:"7px 4px"}} title={l}>{k}</button>)}</div>
          </LabField>
          <LabField label="Common support" hint="trim on propensity score">
            <select value={cfg.trim} onChange={e=>set("trim",parseFloat(e.target.value))} style={sel}><option value={0}>No trimming</option><option value={0.05}>Keep 0.05 – 0.95</option><option value={0.1}>Keep 0.10 – 0.90 (Crump et al.)</option></select>
          </LabField>
        </LabSec>}
        {data&&<LabSec title="3. Methods">
          <Check checked={cfg.methods.subclass} onChange={v=>set("methods",{...cfg.methods,subclass:v})} label="Subclassification on the propensity score"/>
          {cfg.methods.subclass&&<div style={{paddingLeft:24,marginBottom:6}}><select aria-label="Number of strata" value={cfg.strata} onChange={e=>set("strata",+e.target.value)} style={{...sel,width:"auto",padding:"5px 8px",fontSize:12}}>{[3,5,10].map(k=><option key={k} value={k}>{k} strata</option>)}</select></div>}
          <Check checked={cfg.methods.nn} onChange={v=>set("methods",{...cfg.methods,nn:v})} label="Nearest-neighbour matching on covariates"/>
          {cfg.methods.nn&&<div style={{paddingLeft:24,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:6}}>
            <select aria-label="Distance metric" value={cfg.metric} onChange={e=>set("metric",e.target.value)} style={{...sel,padding:"5px 8px",fontSize:12,gridColumn:"1 / -1"}}><option value="mahalanobis">Mahalanobis distance</option><option value="euclid">Normalized Euclidean</option></select>
            <Check checked={cfg.biasAdj} onChange={v=>set("biasAdj",v)} label="Bias correction"/>
          </div>}
          <Check checked={cfg.methods.psm} onChange={v=>set("methods",{...cfg.methods,psm:v})} label="Propensity-score matching"/>
          <div style={{paddingLeft:24,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:6}}>
            <select aria-label="Matches per unit" value={cfg.M} onChange={e=>set("M",+e.target.value)} style={{...sel,padding:"5px 8px",fontSize:12}}>{[1,2,3,4,5].map(m=><option key={m} value={m}>M = {m}</option>)}</select>
            <select aria-label="Caliper" value={cfg.caliper} onChange={e=>set("caliper",parseFloat(e.target.value))} style={{...sel,padding:"5px 8px",fontSize:12}}><option value={0}>No caliper</option><option value={0.1}>Caliper 0.1 SD</option><option value={0.2}>Caliper 0.2 SD</option><option value={0.5}>Caliper 0.5 SD</option></select>
            <div style={{gridColumn:"1 / -1"}}><Check checked={cfg.replace} onChange={v=>set("replace",v)} label="Match with replacement" sub="Better matches, order-independent"/></div>
          </div>
          <Check checked={cfg.methods.ipw} onChange={v=>set("methods",{...cfg.methods,ipw:v})} label="Inverse probability weighting (normalized)"/>
          {cfg.methods.ipw&&<div style={{paddingLeft:24,marginBottom:6,display:"flex",gap:8,flexWrap:"wrap"}}><select aria-label="IPW standard error" value={cfg.ipwSE} onChange={e=>set("ipwSE",e.target.value)} style={{...sel,width:"auto",padding:"5px 8px",fontSize:12}}><option value="bootstrap">SE: bootstrap</option><option value="sandwich">SE: sandwich (M-estimation)</option></select>{cfg.ipwSE==="bootstrap"&&<select aria-label="Bootstrap replications" value={cfg.B} onChange={e=>set("B",+e.target.value)} style={{...sel,width:"auto",padding:"5px 8px",fontSize:12}}>{[99,199,499,999].map(b=><option key={b} value={b}>{b} reps</option>)}</select>}</div>}
          <Check checked={cfg.methods.aipw} onChange={v=>set("methods",{...cfg.methods,aipw:v})} label="Doubly robust (AIPW)"/>
          <Check checked={cfg.methods.cem} onChange={v=>set("methods",{...cfg.methods,cem:v})} label="Coarsened exact matching"/>
          {cfg.methods.cem&&<div style={{paddingLeft:24,marginBottom:6}}><select aria-label="CEM bins" value={cfg.cemBins} onChange={e=>set("cemBins",+e.target.value)} style={{...sel,width:"auto",padding:"5px 8px",fontSize:12}}><option value={0}>Bins: Sturges rule</option>{[3,5,8].map(b=><option key={b} value={b}>{b} bins</option>)}</select></div>}
          <button type="button" onClick={run} disabled={busy||!cfg.covs.length||!cfg.y||!cfg.d||cfg.y===cfg.d} style={{...btn(C.gold),width:"100%",marginTop:10,opacity:busy||!cfg.covs.length?0.55:1}}>{busy?"Estimating…":"Run analysis"}</button>
          {!cfg.covs.length&&<div style={{fontSize:11,color:C.dim,marginTop:6}}>Select at least one covariate.</div>}
        </LabSec>}
      </div>

      {/* results */}
      <div ref={resRef} style={{display:"flex",flexDirection:"column",gap:12,minWidth:0}}>
        {!data&&<LabSec title="Matching and weighting" sub="Estimate the effect of a binary treatment when selection is on observables.">
          <div style={{fontSize:13,color:C.mid,lineHeight:1.7}}>
            Upload a unit-level CSV with an outcome, a 0/1 treatment and pre-treatment covariates, or load the demo study. EcoScope fits the propensity score, runs each method side by side, and reports balance, overlap and standard errors.
            <div style={{marginTop:10}}><LabNote>Every method here identifies a causal effect only under <b>conditional independence</b> (no unmeasured confounders) and <b>common support</b>. Matching does not make conditional independence more plausible. It only reduces dependence on a parametric outcome model.</LabNote></div>
          </div>
        </LabSec>}
        {busy&&<LabSec title="Estimating…"><div style={{fontSize:12,color:C.mid}}>Fitting the propensity score and running matching estimators.</div></LabSec>}
        {out?.error&&<LabNote tone="bad">{out.error}</LabNote>}
        {out?.results&&<>
          <LabNote>Estimates are causal only if treatment is as good as random once you condition on the selected covariates (CIA), and treated and control units overlap. CIA cannot be tested; overlap and balance can, below.</LabNote>
          {out.warnings.map((w,i)=><LabNote key={i} tone="warn">{w}</LabNote>)}
          <LabSec title="Estimates across methods" sub={`${out.prep.n.toLocaleString()} units used (${out.prep.nT.toLocaleString()} treated, ${out.prep.nC.toLocaleString()} control)${out.prep.dropped?` · ${out.prep.dropped} rows dropped for missing values`:""}${out.prep.imputedCells?` · ${out.prep.imputedCells.toLocaleString()} covariate values imputed`:""}. ${out.prep.mi?` · pooled over ${out.prep.mi} imputations`:""}. Large disagreement across methods signals model dependence.`}
            right={<button type="button" onClick={exportCSV} style={{...pill(false),display:"inline-flex",gap:6,alignItems:"center"}}><Ico n="file"/> Export CSV</button>}>
            {boot&&<div role="status" style={{fontSize:11,color:C.mid,marginBottom:8}}>{boot.label==="Imputation"? "Analysing imputed dataset" : "Bootstrapping IPW standard error…"} {boot.k}/{boot.n}</div>}
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["Method","Estimand","Estimate","SE","95% CI","p","N treated","N control","Max |SMD|"].map((h,i)=><th key={h} scope="col" style={{...thS,textAlign:i>=2?"right":"left"}}>{h}</th>)}</tr></thead>
                <tbody>{out.results.map((r,i)=>{ const mx=Math.max(...(r.balance||[]).map(b=>Math.abs(b.smdAfter)).filter(isFinite)); const s=pick===i;
                  return <tr key={i} onClick={()=>setPick(i)} tabIndex={0} onKeyDown={e=>{ if(e.key==="Enter") setPick(i); }} aria-selected={s} style={{cursor:"pointer",background:s?`${C.gold}14`:"transparent"}}>
                    <td style={{...tdS,whiteSpace:"normal",minWidth:220,fontWeight:s?600:400}}>{r.method}</td><td style={tdS}>{r.estimand}</td>
                    <td style={{...tdN,fontWeight:600}}>{ciFmt(r.est)}</td><td style={tdN}>{r.pending? "…" : ciFmt(r.se)}</td>
                    <td style={tdN}>{r.pending? "…" : `[${ciFmt(r.lo)}, ${ciFmt(r.hi)}]`}</td><td style={tdN}>{r.pending? "…" : ciFmtP(r.p)}</td>
                    <td style={tdN}>{r.nT?.toLocaleString()}</td><td style={tdN}>{r.nC?.toLocaleString()}</td>
                    <td style={{...tdN,color: mx>0.25? C.red : mx>0.1? C.orange : C.teal}}>{isFinite(mx)? mx.toFixed(2) : "—"}</td></tr>; })}</tbody>
              </table>
            </div>
            <div style={{marginTop:12}}><ForestPlot results={out.results} selected={pick} onSelect={setPick}/></div>
            <div style={{fontSize:11,color:C.dim,marginTop:6,lineHeight:1.6}}>
              Click a row to inspect its balance. Max |SMD| above 0.1 (amber) or 0.25 (red) indicates remaining imbalance. "OLS with controls" assumes a constant, linear effect (ATE*). NN matching SEs follow Abadie &amp; Imbens (2006); the bootstrap is not valid for them. {out.results.some(r=>r.aiAdjusted)&&"Propensity-score matching SEs include the Abadie–Imbens (2016) correction for the estimated score. "}IPW SEs account for estimating the propensity score (bootstrap or sandwich).
              {data?.trueATT!=null&&<b style={{color:C.text}}> Demo: true ATT = {ciFmt(data.trueATT,0)}.</b>}
            </div>
          </LabSec>
          {out.sens&&<LabSec title="Sensitivity to an unobserved confounder" sub="Cinelli & Hazlett (2020), based on the OLS-with-controls estimate">
            <div style={{display:"grid",gridTemplateColumns:isMobile?"minmax(0,1fr)":"repeat(3,minmax(0,1fr))",gap:10}}>
              {[["Robustness value", `${(100*out.sens.rv).toFixed(1)}%`, "share of residual variance of both D and Y a confounder must explain to bring the estimate to zero"],
                ["Robustness value (5%)", `${(100*out.sens.rvAlpha).toFixed(1)}%`, "…to make it statistically insignificant"],
                ["Partial R² of D with Y", `${(100*out.sens.partialR2).toFixed(1)}%`, "an extreme confounder explaining all residual Y variance would need this much of D"]].map(([l,v,d])=>
                <div key={l} style={{border:`1px solid ${C.border}`,borderRadius:6,padding:"10px 12px"}}><div style={{fontSize:11,color:C.mid,textTransform:"uppercase",letterSpacing:"0.05em"}}>{l}</div><div style={{fontSize:18,fontWeight:600,color:C.text,margin:"3px 0",fontVariantNumeric:"tabular-nums"}}>{v}</div><div style={{fontSize:11,color:C.dim,lineHeight:1.45}}>{d}</div></div>)}
            </div>
            <div style={{fontSize:11,color:C.dim,marginTop:8,lineHeight:1.55}}>Compare these numbers with how much of D and Y your strongest observed covariate explains. A confounder weaker than that could not overturn the result.</div>
          </LabSec>}
          {cur&&<div style={{display:"grid",gridTemplateColumns:isMobile?"minmax(0,1fr)":"minmax(0,1.2fr) minmax(0,1fr)",gap:12}}>
            <LabSec title="Covariate balance" sub={`${cur.method}${isFinite(cur.L1)?` · multivariate L1 = ${cur.L1.toFixed(3)} (before ${out.results[0].L1.toFixed(3)})`:""}`}>
              <div style={{overflowX:"auto",maxHeight:360}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr>{["Covariate","Mean T","Mean C (raw)","SMD raw","Mean C (adj.)","SMD adj.","Var. ratio"].map((h,i)=><th key={h} scope="col" style={{...thS,textAlign:i?"right":"left"}}>{h}</th>)}</tr></thead>
                  <tbody>{cur.balance.map(b=><tr key={b.name}><td style={tdS}>{b.name}</td><td style={tdN}>{ciFmt(b.meanTAfter)}</td><td style={tdN}>{ciFmt(b.meanC)}</td>
                    <td style={{...tdN,color:Math.abs(b.smdBefore)>0.1?C.orange:C.text}}>{ciFmt(b.smdBefore)}</td><td style={tdN}>{ciFmt(b.meanCAfter)}</td>
                    <td style={{...tdN,fontWeight:600,color:Math.abs(b.smdAfter)>0.25?C.red:Math.abs(b.smdAfter)>0.1?C.orange:C.teal}}>{ciFmt(b.smdAfter)}</td><td style={tdN}>{ciFmt(b.vrAfter)}</td></tr>)}</tbody>
                </table>
              </div>
              {cur.note&&<div style={{marginTop:10}}><LabNote tone="warn">{cur.note}</LabNote></div>}
            </LabSec>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <LabSec title="Love plot" sub={<span><span style={{color:C.red}}>○</span> raw · <span style={{color:C.teal}}>●</span> adjusted · |standardized mean difference|</span>}><LovePlot balance={cur.balance}/></LabSec>
              <LabSec title="Propensity-score overlap" sub={`Common support: [${out.diagnostics.csLo.toFixed(3)}, ${out.diagnostics.csHi.toFixed(3)}] (shaded) · ${out.diagnostics.offSupport} units outside`}>
                <OverlapPlot ps={out.diagnostics.ps} d={out.prep.d} lo={out.diagnostics.csLo} hi={out.diagnostics.csHi}/>
              </LabSec>
            </div>
          </div>}
        </>}
      </div>
    </div>
  );
}

// ── Synthetic control tab ──
function SynthTab({ defaultCountry, defaultVar, isMobile, imported, basket=[], eco, years, incoming }) {
  const vars=useMemo(()=>ciWBVarList(),[]);
  const initVar = vars.find(v=>v.code===defaultVar)?.code || vars.find(v=>v.code==="NY.GDP.PCAP.KD")?.code || vars[0]?.code;
  const ecoItems = useMemo(()=>basket.map(it=>({ key:ciItemKey(it), name:it.label, src:it.sourceName, ...ciResolveItem(it) })),[basket]);
  const ecoUsable = ecoItems.filter(x=>x.route!=="none");
  const [ecoY,setEcoY]=useState(()=>ecoUsable[0]?.key||""); const [applyEco,setApplyEco]=useState(true);
  const [cfg,setCfg]=useState({ src:"wb", y:initVar, treated:defaultCountry||"GH", t0: 2005, y0: 1995, y1: Math.min(CURRENT_YEAR-2, 2023), region:"All", exclude:[], mode:"outcome", covs:[], lags:true, mult:5, fill:"interp", vMethod:"mspe", sdid:true, pen:false, backdate:0, reps:100 });
  const [table,setTable]=useState(null); const [map,setMap]=useState({ format:"long", unit:"", time:"", y:"", covs:[] }); const [fileErr,setFileErr]=useState("");
  const [res,setRes]=useState(null); const [busy,setBusy]=useState(""); const [err,setErr]=useState(""); const [info,setInfo]=useState(null); const [panelOut,setPanelOut]=useState(null); const [extra,setExtra]=useState(null);
  const resRef=useRef(null); useEffect(()=>{ if (isMobile && res && resRef.current) resRef.current.scrollIntoView({behavior:"smooth",block:"start"}); },[res, isMobile]);
  const set=(k,v)=>setCfg(c=>({...c,[k]:v})); const setM=(k,v)=>setMap(m=>({...m,[k]:v}));
  // load a user table (uploaded file or the dataset imported into EcoScope) and guess its layout
  const loadTable=(parsed, name)=>{ if (parsed.error){ setFileErr(parsed.error); return; } setFileErr(""); setRes(null);
    const h=parsed.headers; const time=h.find(x=>/^(year|yr|date|time|period)$/i.test(x.trim()))||h.find(x=>/year|date|time|period/i.test(x))||h[0];
    const unit=h.find(x=>x!==time && /country|state|unit|region|iso|name|id|firm|district/i.test(x));
    const firstRow=parsed.rows[0]||[]; const numericOthers=h.filter(x=>x!==time && !isNaN(parseFloat(String(firstRow[h.indexOf(x)]??"").replace(/[$,%\s]/g,""))));
    const format = unit? "long" : (numericOthers.length>=3? "wide" : "long");
    const y = h.find(x=>x!==time&&x!==unit&&numericOthers.includes(x))||"";
    setTable({ ...parsed, name }); setMap({ format, unit:unit||"", time, y, covs:[] });
    setCfg(c=>({...c, src:"csv", covs:[], exclude:[]})); };
  const onFile=(f)=>{ if(!f) return; const r=new FileReader(); r.onload=()=>loadTable(ciParseCSV(String(r.result)), f.name); r.readAsText(f); };
  useEffect(()=>{ if (incoming?.table) loadTable(incoming.table, incoming.name); // data handed over from Data structure
  },[incoming?.id]);
  const panel = useMemo(()=>{ if (cfg.src!=="csv"||!table) return null; if (map.format==="long" && (!map.unit||!map.time||!map.y)) return null; if (!map.time) return null;
    return ciPanelFromTable(table.headers, table.rows, map); },[cfg.src, table, map]);
  // when a new panel (file or column mapping) is loaded: use its full year range and a valid treated unit
  const panelKey = panel? `${table?.name}|${map.format}|${map.unit}|${map.time}|${map.y}` : "";
  useEffect(()=>{ if (!panel?.years?.length) return; const ys=panel.years; const y0=ys[0], y1=ys[ys.length-1];
    const t0=ys.find(y=>y>=y0+Math.round((y1-y0)*0.6)&&y>y0+2&&y<=y1) ?? y1;
    setCfg(c=>({ ...c, y0, y1, t0, treated: panel.units.some(u=>u.id===c.treated)? c.treated : panel.units[0]?.id, exclude:[] }));
  },[panelKey]);
  const isCountry = cfg.src!=="csv"; const ecoY_ = ecoItems.find(x=>x.key===ecoY);
  const yVar = cfg.src==="wb"? vars.find(v=>v.code===cfg.y) : cfg.src==="eco"? { name: ecoY_?.name + (applyEco && eco?.transform && eco.transform!=="none" ? ` (${TRANSFORMS.find(t=>t.id===eco.transform)?.label})` : ""), fmt: applyEco && eco?.transform && eco.transform!=="none"? "num" : (ecoY_?.fmt||"num") } : { name: map.format==="wide"? "Outcome" : map.y, fmt:"num" };
  const unitList = isCountry ? COUNTRIES.map(c=>({ id:c.code, name:c.name, region:c.region })) : (panel?.units||[]).map(u=>({ id:u.id, name:u.name }));
  const pool = unitList.filter(u=>u.id!==cfg.treated && (!isCountry||cfg.region==="All"||u.region===cfg.region) && !cfg.exclude.includes(u.id));
  const yearOpts = isCountry? YEARS : (panel?.years||[]);
  const covOptions = cfg.src==="wb" ? vars.filter(v=>v.code!==cfg.y).map(v=>({ id:v.code, name:v.name })) : cfg.src==="eco" ? ecoUsable.filter(x=>x.key!==ecoY).map(x=>({ id:x.key, name:x.name })) : (table? table.headers.filter(h=>h!==map.unit&&h!==map.time&&h!==map.y).map(h=>({ id:h, name:h })) : []);
  const run=async ()=>{
    setErr(""); setRes(null); setInfo(null); setPanelOut(null); setExtra(null);
    if (cfg.t0<=cfg.y0+2 || cfg.t0>cfg.y1){ setErr("Treatment year must leave at least 3 pre-treatment years and fall inside the window."); return; }
    try{
      let years=Array.from({length:cfg.y1-cfg.y0+1},(_,i)=>cfg.y0+i); let preYears=years.filter(y=>y<cfg.t0);
      let raw=[]; // [{id,name,y:{year:v}, cov:{name:{year:v}}}]
      if (cfg.src==="wb"){
        setBusy("Downloading outcome panel from the World Bank…");
        const codes=[cfg.treated, ...pool.map(c=>c.id)];
        const Yp=await fetchWorldBankPanel(codes, cfg.y, cfg.y0, cfg.y1);
        const covP={}; if (cfg.mode==="nested") for (const cv of cfg.covs){ setBusy(`Downloading predictor: ${vars.find(v=>v.code===cv)?.name||cv}…`); covP[cv]=await fetchWorldBankPanel(codes, cv, cfg.y0, cfg.t0-1); }
        raw=codes.map(code=>({ id:code, name:COUNTRIES.find(x=>x.code===code)?.name||code, y:Yp[code]||{}, cov:Object.fromEntries(cfg.covs.map(cv=>[cv, covP[cv]?.[code]||{}])) }));
      } else if (cfg.src==="eco"){
        const it=basket.find(b=>ciItemKey(b)===ecoY); if (!it){ setErr("Choose an outcome from your EcoScope selection."); return; }
        const ecoOpt = applyEco? eco : null; const codes=[cfg.treated, ...pool.map(c=>c.id)];
        setBusy(`Downloading ${it.label} for ${codes.length} countries…`);
        const Yp=await fetchItemPanel(it, codes, cfg.y0, cfg.y1, ecoOpt); if (!Yp){ setErr(`${it.label} cannot be downloaded for many countries (${ciResolveItem(it).reason}).`); setBusy(""); return; }
        const covP={}; if (cfg.mode==="nested") for (const k of cfg.covs){ const ci=basket.find(b=>ciItemKey(b)===k); if(!ci) continue; setBusy(`Downloading predictor: ${ci.label}…`); covP[k]=await fetchItemPanel(ci, codes, cfg.y0, cfg.t0-1, ecoOpt)||{}; }
        raw=codes.map(code=>({ id:code, name:COUNTRIES.find(x=>x.code===code)?.name||code, y:Yp[code]||{}, cov:Object.fromEntries(cfg.covs.map(k=>[k, covP[k]?.[code]||{}])) }));
      } else {
        if (!panel) { setErr("Map the columns of your panel first."); return; }
        const keep=new Set([cfg.treated, ...pool.map(u=>u.id)]); raw=panel.units.filter(u=>keep.has(u.id));
      }
      // trim the window to the years the treated unit actually reports (recent years are often not yet published)
      let trimmed=null; { const tr=raw.find(u=>u.id===cfg.treated); const have=years.filter(y=>tr?.y?.[y]!=null&&isFinite(tr.y[y]));
        if (have.length){ const a=Math.max(cfg.y0, have[0]), z=Math.min(cfg.y1, have[have.length-1]);
          if (z<cfg.t0){ setErr(`${tr.name} has no data for this outcome from ${cfg.t0} onward (last year with data: ${have[have.length-1]}). Choose an earlier policy year.`); setBusy(""); return; }
          if (cfg.t0-a<3){ setErr(`${tr.name} has data only from ${a}, which leaves fewer than 3 pre-policy years. Choose a later policy year.`); setBusy(""); return; }
          if (a>cfg.y0||z<cfg.y1){ trimmed={ from:a, to:z }; years=years.filter(y=>y>=a&&y<=z); preYears=years.filter(y=>y<cfg.t0); } } }
      const units=[]; const dropped=[]; const imputed=[];
      for (const u of raw){
        const f=ciFillSeries(years, u.y, cfg.fill); if (!f){ dropped.push(u.name); continue; }
        const cov={}; let ok=true;
        const covY={};
        for (const cv of (cfg.mode==="nested"? cfg.covs : [])){ const vals=preYears.map(yy=>u.cov?.[cv]?.[yy]).filter(v=>v!=null&&isFinite(v)); if(!vals.length){ ok=false; break; } cov[cv]=ciMean(vals); covY[cv]=u.cov?.[cv]||{}; }
        if (!ok){ dropped.push(u.name); continue; }
        if (f.nImputed) imputed.push({ id:u.id, name:u.name, n:f.nImputed, pre: preYears.filter(yy=>u.y?.[yy]==null||!isFinite(u.y?.[yy])).length });
        units.push({ id:u.id, name:u.name, y:f.vals, cov, covY, rawY:years.map(yy=>u.y?.[yy]??null) });
      }
      const tName=unitList.find(u=>u.id===cfg.treated)?.name||cfg.treated;
      if (!units.find(u=>u.id===cfg.treated)){ setErr(`${tName} has missing outcome data in ${cfg.y0}–${cfg.y1} that the selected missing-data rule cannot fill. Narrow the window or choose a different rule.`); setBusy(""); return; }
      if (units.length<4){ setErr("Fewer than three donors have usable data for this window. Widen the donor pool, shorten the window, or choose a missing-data rule that fills gaps."); setBusy(""); return; }
      const mkPred=(pys)=> cfg.mode==="nested" ? [ ...cfg.covs.map(cv=>({ type:"cov", name:cv, label:covOptions.find(o=>o.id===cv)?.name||cv })),
        ...(cfg.lags? [["first",pys[0]], ["mid",pys[Math.floor(pys.length/2)]], ["last",pys[pys.length-1]]].filter((v,i,a)=>a.findIndex(x=>x[1]===v[1])===i).map(([pos,y])=>({ type:"lag", year:y, pos, label:`Outcome ${y}` })) : [{ type:"preMean", label:"Outcome pre-period mean" }]) ] : [];
      const predictors = mkPred(preYears);
      setBusy(`Fitting synthetic ${tName} and ${units.length-2} placebo runs…`);
      await new Promise(r=>setTimeout(r,30));
      const r=ciSynthRun({ years, units }, cfg.treated, cfg.t0, { mode:cfg.mode, predictors, vMethod:cfg.vMethod });
      if (r.error){ setErr(r.error); setBusy(""); return; }
      setRes(r); setInfo({ dropped, imputed, trimmed, nDonors:units.length-1, treatedImp: imputed.find(x=>x.id===cfg.treated) }); setPanelOut({ years, units });
      // ── robustness: convex hull, synthetic DiD comparison, penalized SC, in-time placebo ──
      const trU=units.find(u=>u.id===cfg.treated), dons=units.filter(u=>u.id!==cfg.treated); const ex={ hull: meHullCheck(trU.y, dons.map(u=>u.y), r.preIdx), est:[] };
      if (cfg.backdate>0 && r.preIdx.length-cfg.backdate>=3){ const realT=r.preIdx.length; const yB=years.slice(0,realT); const t0b=yB[realT-cfg.backdate];
        const preB=yB.filter(y=>y<t0b); const covB=(u)=>Object.fromEntries(Object.entries(u.covY||{}).map(([k,m])=>[k, ciMean(preB.map(y=>m?.[y]).filter(v=>v!=null&&isFinite(v)))]));
        const rb=ciSynthRun({ years:yB, units:units.map(u=>({ ...u, y:u.y.slice(0,realT), cov:{ ...u.cov, ...covB(u) } })) }, cfg.treated, t0b, { mode:cfg.mode, predictors:mkPred(yB.filter(y=>y<t0b)), vMethod:cfg.vMethod, placebo:false, loo:false });
        if (!rb.error){ const full=years.map((_,t)=>dons.reduce((s,u,j)=>s+u.y[t]*(rb.w[dons.length===rb.w.length? j : 0]||0),0));
          ex.backdate={ t0b, gapAvg: ciMean(rb.postIdx.map(t=>rb.gap[t])), preRMSPE: rb.preRMSPE, path: years.map((y,t)=>({ year:y, actual:trU.y[t], synthetic:full[t] })), ratio: rb.ratio }; } }
      if (cfg.pen){ setBusy("Choosing the penalty for penalized synthetic control by leave-one-out over donors…"); await new Promise(rr=>setTimeout(rr,20));
        const pc=mePenSynthCV(trU.y, dons.map(u=>u.y), r.preIdx, r.postIdx); const syn=years.map((_,t)=>dons.reduce((s,u,j)=>s+u.y[t]*pc.w[j],0));
        ex.pen={ lambda:pc.lambda, att: ciMean(r.postIdx.map(t=>trU.y[t]-syn[t])), preRMSPE: ciRmspe(trU.y, syn, r.preIdx), nUsed: pc.w.filter(v=>v>0.001).length, weights: dons.map((u,j)=>({ name:u.name, w:pc.w[j] })).filter(x=>x.w>0.001).sort((a,b)=>b.w-a.w) }; }
      if (cfg.sdid){ const Ym=[...dons.map(u=>u.y), trU.y]; const N0=dons.length, T0=r.preIdx.length;
        ["sc","sdid","did"].forEach(m=>{ const f=meSDID(Ym, N0, T0, m); ex.est.push({ key:m, fit:f, est:f.est, se:NaN, pending:true }); });
        setExtra({ ...ex }); setBusy("");
        for (const e of ex.est){ const se=await new Promise(res=>setTimeout(()=>res(meSDIDPlaceboSE(Ym, N0, T0, e.fit, cfg.reps, 2026)),20)); e.se=se; e.pending=false; setExtra({ ...ex, est:[...ex.est] }); } }
      else { setExtra(ex); setBusy(""); }
    }catch(e){ console.error(e); setErr("Synthetic control failed: "+e.message); setBusy(""); }
  };
  const downloadPanel=()=>{ if(!panelOut) return; const rows=[];
    panelOut.units.forEach(u=>panelOut.years.forEach((y,t)=>{ const row={ unit:u.name, unit_id:u.id, year:y, outcome:u.y[t], imputed: u.rawY[t]==null? 1 : 0 }; Object.entries(u.cov||{}).forEach(([k,v])=>row[`${k} (pre-mean)`]=v); rows.push(row); }));
    dlCSV(rows, `ecoscope_synth_panel_${cfg.src==="wb"? cfg.y : cfg.src==="eco"? "selection" : "upload"}.csv`); };
  const pv = res? ciSynthPValue(res, cfg.mult) : null;
  const pathData = res? res.years.map((y,t)=>({ year:y, actual:res.treated.y[t], synthetic:res.synth[t] })) : [];
  const gapData = res? res.years.map((y,t)=>{ const row={ year:y, treated:res.gap[t] }; (pv?.keep||[]).forEach((p,i)=>row["p"+i]=p.gap[t]); return row; }) : [];
  const looData = res? res.years.map((y,t)=>{ const row={ year:y, actual:res.treated.y[t], synthetic:res.synth[t] }; res.loo.forEach((l,i)=>row["l"+i]=l.synth[t]); return row; }) : [];
  const fmtY = (v)=>ciFmtVal(v, yVar?.fmt||"num");
  const exportCSV=()=>{ if(!res) return; dlCSV(res.years.map((y,t)=>({ year:y, treated:res.treated.y[t], synthetic:res.synth[t], gap:res.gap[t] })), `ecoscope_synth_${res.treated.id}_${cfg.y}.csv`);
    dlCSV(res.weights.map(w=>({ donor:w.name, weight:w.w })), `ecoscope_synth_weights_${res.treated.id}.csv`); };
  const axis={ tick:{fill:C.mid,fontSize:11}, axisLine:{stroke:C.border}, tickLine:false };
  return (
    <div style={{display:"grid",gridTemplateColumns:isMobile?"minmax(0,1fr)":"320px minmax(0,1fr)",gap:16,alignItems:"start"}}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <LabSec title="1. Data" sub="Use World Bank data live, or your own panel.">
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button type="button" onClick={()=>{ setCfg(c=>({...c,src:"wb",covs:[],treated:COUNTRIES.some(x=>x.code===c.treated)? c.treated : (defaultCountry||"GH"),exclude:[]})); setRes(null); }} style={{...pill(cfg.src==="wb"),flex:1,padding:"7px 6px"}}>World Bank</button>
            <button type="button" onClick={()=>{ setCfg(c=>({...c,src:"eco",covs:[],treated:COUNTRIES.some(x=>x.code===c.treated)? c.treated : (defaultCountry||"GH"),exclude:[], ...(years? { y0:Math.min(years[0], c.t0-3), y1:Math.min(CURRENT_YEAR-1, Math.max(years[1], c.t0)) } : {}) })); setRes(null); }} style={{...pill(cfg.src==="eco"),flex:1,padding:"7px 6px"}} title="Variables in your EcoScope basket">My selection</button>
            <button type="button" onClick={()=>{ if(table) set("src","csv"); else document.getElementById("ci-synth-file")?.click(); }} style={{...pill(cfg.src==="csv"),flex:1,padding:"7px 6px"}}>Your panel</button>
          </div>
          {cfg.src==="eco"&&<div style={{marginTop:10}}>
            {!ecoUsable.length? <LabNote tone="warn">None of the variables in your EcoScope basket can be downloaded for many countries. Add World Bank–based variables (most sources), IMF or WHO indicators to the basket, then reopen the Lab.</LabNote> : <>
              <LabField label="Outcome" hint="from your basket"><select value={ecoY} onChange={e=>{ setEcoY(e.target.value); set("covs",cfg.covs.filter(k=>k!==e.target.value)); }} style={sel}>{ecoItems.map(x=><option key={x.key} value={x.key} disabled={x.route==="none"}>{x.name} · {x.src}{x.route==="none"? ` (${x.reason})` : ""}</option>)}</select></LabField>
              <Check checked={applyEco} onChange={setApplyEco} label="Apply my EcoScope transform & imputation" sub={ciEcoNote(eco)}/>
              {ecoItems.some(x=>x.route==="none")&&<div style={{fontSize:11,color:C.dim,marginTop:4,lineHeight:1.5}}>Greyed-out variables have no multi-country source (e.g. FRED is US-only).</div>}
            </>}
          </div>}
          <input id="ci-synth-file" type="file" accept=".csv,.tsv,.txt" onChange={e=>onFile(e.target.files?.[0])} style={{display:"none"}}/>
          {cfg.src==="csv"&&<div style={{marginTop:10}}>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
              <label htmlFor="ci-synth-file" style={{...pill(false),display:"inline-flex",alignItems:"center",gap:6,padding:"6px 10px",cursor:"pointer"}}><Ico n="file"/> Upload CSV</label>
              {imported&&<button type="button" onClick={()=>loadTable({ headers:imported.headers, rows:imported.rows }, imported.name)} style={{...pill(false),padding:"6px 10px"}}>Use EcoScope import</button>}
            </div>
            {fileErr&&<LabNote tone="bad">{fileErr}</LabNote>}
            {table&&<>
              <div style={{fontSize:12,color:C.mid,marginBottom:8}}><b style={{color:C.text}}>{table.name}</b> · {table.rows.length.toLocaleString()} rows</div>
              <LabField label="Layout"><select value={map.format} onChange={e=>setM("format",e.target.value)} style={sel}><option value="long">Long: one row per unit-year</option><option value="wide">Wide: one row per year, one column per unit</option></select></LabField>
              <LabField label="Year column"><select value={map.time} onChange={e=>setM("time",e.target.value)} style={sel}>{table.headers.map(h=><option key={h} value={h}>{h}</option>)}</select></LabField>
              {map.format==="long"&&<>
                <LabField label="Unit column" hint="country, state, firm…"><select value={map.unit} onChange={e=>setM("unit",e.target.value)} style={sel}><option value="">Choose…</option>{table.headers.filter(h=>h!==map.time).map(h=><option key={h} value={h}>{h}</option>)}</select></LabField>
                <LabField label="Outcome column"><select value={map.y} onChange={e=>setM("y",e.target.value)} style={sel}><option value="">Choose…</option>{table.headers.filter(h=>h!==map.time&&h!==map.unit).map(h=><option key={h} value={h}>{h}</option>)}</select></LabField>
              </>}
              {panel&&<div style={{fontSize:11,color:C.dim}}>{panel.units.length} units · {panel.years[0]}–{panel.years[panel.years.length-1]}</div>}
            </>}
            {!table&&<div style={{fontSize:11,color:C.dim,lineHeight:1.55}}>Long format: columns for unit, year, outcome and optional covariates. Wide format: a year column plus one column per unit. EcoScope's panel download (after a run) is already in long format.</div>}
          </div>}
        </LabSec>
        <LabSec title="2. Design" sub="One unit receives the policy; the rest form the donor pool.">
          {cfg.src==="wb"&&<LabField label="Outcome"><select value={cfg.y} onChange={e=>set("y",e.target.value)} style={sel}>{vars.map(v=><option key={v.code} value={v.code}>{v.name} · {v.src}</option>)}</select></LabField>}
          <LabField label={isCountry?"Treated country":"Treated unit"}><select value={cfg.treated} onChange={e=>set("treated",e.target.value)} style={sel}>{unitList.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></LabField>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            <LabField label="From"><select value={cfg.y0} onChange={e=>set("y0",+e.target.value)} style={{...sel,padding:"8px"}}>{yearOpts.filter(y=>y<cfg.t0).map(y=><option key={y}>{y}</option>)}</select></LabField>
            <LabField label="Policy year"><select value={cfg.t0} onChange={e=>set("t0",+e.target.value)} style={{...sel,padding:"8px"}}>{yearOpts.filter(y=>y>cfg.y0+2&&y<=cfg.y1).map(y=><option key={y}>{y}</option>)}</select></LabField>
            <LabField label="To"><select value={cfg.y1} onChange={e=>set("y1",+e.target.value)} style={{...sel,padding:"8px"}}>{yearOpts.filter(y=>y>=cfg.t0&&y<=CURRENT_YEAR).map(y=><option key={y}>{y}</option>)}</select></LabField>
          </div>
          {isCountry&&<LabField label="Donor pool" hint={`${pool.length} countries`}><select value={cfg.region} onChange={e=>set("region",e.target.value)} style={sel}>{REGIONS.map(r=><option key={r} value={r}>{r==="All"?"All countries":r}</option>)}</select></LabField>}
          <details style={{fontSize:12,color:C.mid,marginBottom:8}}><summary style={{cursor:"pointer",color:C.text}}>Exclude donors ({cfg.exclude.length}) · {pool.length} in pool</summary>
            <div style={{fontSize:11,color:C.dim,margin:"6px 0"}}>Drop units hit by the same or a similar policy, or by large idiosyncratic shocks.</div>
            <div style={{maxHeight:150,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px"}}>{unitList.filter(c=>c.id!==cfg.treated&&(!isCountry||cfg.region==="All"||c.region===cfg.region)).map(c=><Check key={c.id} checked={cfg.exclude.includes(c.id)} onChange={v=>set("exclude", v? [...cfg.exclude,c.id] : cfg.exclude.filter(x=>x!==c.id))} label={c.name}/>)}</div>
          </details>
          <LabField label="Missing years" hint="EcoScope imputation">
            <select value={cfg.fill} onChange={e=>set("fill",e.target.value)} style={sel}>
              <option value="strict">Drop any unit with a missing year</option>
              <option value="interp">Interpolate interior gaps, else drop</option>
              <option value="linear">Linear interpolation (EcoScope)</option>
              <option value="forward">Forward fill (EcoScope)</option>
              <option value="backward">Backward fill (EcoScope)</option>
              <option value="mean">Mean imputation (EcoScope)</option>
            </select>
          </LabField>
          {cfg.fill!=="strict"&&<div style={{fontSize:11,color:C.dim,lineHeight:1.5,marginTop:-4}}>Filled values are treated as data. Imputed pre-policy years make the fit look better than it is.</div>}
        </LabSec>
        <LabSec title="3. Predictors">
          <div style={{display:"flex",gap:6,marginBottom:10}}>{[["outcome","Outcome path"],["nested","Covariates + lags"]].map(([k,l])=><button key={k} type="button" onClick={()=>set("mode",k)} style={{...pill(cfg.mode===k),flex:1,padding:"7px 4px"}}>{l}</button>)}</div>
          <div style={{fontSize:11,color:C.dim,lineHeight:1.55,marginBottom:8}}>{cfg.mode==="outcome"? "Weights minimize the pre-treatment gap in every year of the outcome (V = identity)." : "Weights match pre-period covariate means and outcome lags; predictor importance V is chosen to minimize pre-treatment outcome error (Abadie, Diamond & Hainmueller 2010)."}</div>
          {cfg.mode==="nested"&&<>
            {cfg.src==="csv"&&map.format==="wide"? <div style={{fontSize:11,color:C.dim,marginBottom:8}}>Wide files hold one variable, so only outcome lags are available. Use a long file to add covariates.</div> :
            <LabField group label="Covariates" hint={`${cfg.covs.length}/5`}>
              <select value="" onChange={e=>{ const v=e.target.value; if(v&&!cfg.covs.includes(v)&&cfg.covs.length<5){ set("covs",[...cfg.covs,v]); if (cfg.src==="csv") setM("covs",[...map.covs,v]); } }} style={sel}><option value="">Add a covariate…</option>{covOptions.filter(o=>!cfg.covs.includes(o.id)).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>
            </LabField>}
            {cfg.covs.map(cv=><div key={cv} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,padding:"4px 0",color:C.text}}>{covOptions.find(o=>o.id===cv)?.name||cv}<button type="button" aria-label="Remove covariate" onClick={()=>{ set("covs",cfg.covs.filter(x=>x!==cv)); setM("covs",map.covs.filter(x=>x!==cv)); }} style={{background:"none",border:"none",color:C.mid,cursor:"pointer",fontSize:14}}>✕</button></div>)}
            <Check checked={cfg.lags} onChange={v=>set("lags",v)} label="Include outcome lags (first, middle, last pre-year)" sub="Otherwise uses the pre-period mean"/>
            <LabField label="Predictor weights V">
              <select value={cfg.vMethod} onChange={e=>set("vMethod",e.target.value)} style={sel}><option value="mspe">Minimize pre-period fit (ADH 2010)</option><option value="cv">Cross-validation: train early, validate late (Abadie 2021)</option></select>
            </LabField>
            {cfg.vMethod==="cv"&&<div style={{fontSize:11,color:C.dim,lineHeight:1.55,marginTop:-4,marginBottom:8}}>V is chosen to predict the second half of the pre-period from predictors measured in the first half; final weights use predictors from the second half. This avoids overfitting V to the same years used to judge fit.</div>}
          </>}
        </LabSec>
        <LabSec title="4. Robustness" sub="Recommended checks (Abadie 2021; Arkhangelsky et al. 2021)">
          <Check checked={cfg.sdid} onChange={v=>set("sdid",v)} label="Compare with synthetic DiD and DiD" sub="synthdid estimators with placebo standard errors"/>
          {cfg.sdid&&<div style={{paddingLeft:24,marginBottom:6}}><select aria-label="Placebo replications" value={cfg.reps} onChange={e=>set("reps",+e.target.value)} style={{...sel,width:"auto",padding:"5px 8px",fontSize:12}}>{[50,100,200].map(b=><option key={b} value={b}>{b} placebo reps</option>)}</select></div>}
          <Check checked={cfg.pen} onChange={v=>set("pen",v)} label="Penalized synthetic control" sub="Abadie & L'Hour (2021): unique, sparse weights; penalty chosen by leave-one-out"/>
          <LabField label="In-time placebo (backdating)">
            <select value={cfg.backdate} onChange={e=>set("backdate",+e.target.value)} style={sel}><option value={0}>Off</option>{[2,3,5,8,10].map(k=><option key={k} value={k}>Pretend the policy started {k} years earlier</option>)}</select>
          </LabField>
          <button type="button" onClick={run} disabled={!!busy||pool.length<2||(cfg.src==="csv"&&!panel)||(cfg.src==="eco"&&!ecoUsable.length)} style={{...btn(C.gold),width:"100%",marginTop:8,opacity:busy||(cfg.src==="csv"&&!panel)?0.55:1}}>{busy?"Running…":"Run synthetic control"}</button>
        </LabSec>
      </div>
      <div ref={resRef} style={{display:"flex",flexDirection:"column",gap:12,minWidth:0}}>
        {!res&&!busy&&!err&&<LabSec title="Synthetic control" sub="Comparative case study for one treated country (Abadie & Gardeazabal 2003; Abadie, Diamond & Hainmueller 2010).">
          <div style={{fontSize:13,color:C.mid,lineHeight:1.7}}>The method builds a weighted average of untreated countries that tracks the treated country before the policy. The gap after the policy is the estimated effect. Inference comes from re-running the method on every donor (placebos) and asking how unusual the treated country's post/pre fit ratio is.
            <div style={{marginTop:10}}><LabNote>Assumptions: no anticipation before the policy year, no spillovers to donors, donors not exposed to similar shocks, and the treated unit lies within the range the donors can reproduce (convex hull). Poor pre-treatment fit means the estimate should not be trusted.</LabNote></div></div>
        </LabSec>}
        {busy&&<LabSec title="Working…"><div style={{fontSize:12,color:C.mid}}>{busy}</div></LabSec>}
        {err&&<LabNote tone="bad">{err}</LabNote>}
        {res&&<>
          {info?.trimmed&&<LabNote>Window set to {info.trimmed.from}–{info.trimmed.to}, the years {res.treated.name} reports for this outcome.</LabNote>}
          {info?.dropped?.length>0&&<LabNote tone="warn">{info.dropped.length} donor(s) dropped because the missing-data rule could not fill their gaps: {info.dropped.slice(0,12).join(", ")}{info.dropped.length>12?"…":""}.</LabNote>}
          {info?.imputed?.length>0&&<LabNote tone={info.treatedImp?.pre? "warn":"info"}>Imputed values used for {info.imputed.length} unit(s) ({info.imputed.reduce((a,b)=>a+b.n,0)} unit-years).{info.treatedImp? ` ${res.treated.name}: ${info.treatedImp.n} imputed year(s), ${info.treatedImp.pre} before the policy.` : ""} Imputed values are treated as observed, so fit statistics and the placebo p-value are optimistic.</LabNote>}
          {res.preRMSPE > 0.1*Math.abs(ciMean(res.preIdx.map(t=>res.treated.y[t])))&&<LabNote tone="warn">Pre-treatment fit is weak (RMSPE is more than 10% of the pre-period mean). The treated country may lie outside the donors' convex hull; treat the estimate with caution.</LabNote>}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,minmax(0,1fr))":"repeat(4,minmax(0,1fr))",gap:12}}>
            {[["Average post-policy gap", fmtY(res.att), `${res.years[res.postIdx[0]]}–${res.years[res.years.length-1]}`],
              ["Pre-period RMSPE", fmtY(res.preRMSPE), "fit before the policy"],
              ["Post/pre RMSPE ratio", ciFmt(res.ratio), `rank ${pv.rank} of ${pv.n}`],
              ["Placebo p-value", ciFmtP(pv.p), cfg.mult? `placebos with pre-MSPE ≤ ${cfg.mult}× treated` : "all placebos"]].map(([l,v,s])=>
              <div key={l} style={{...card,padding:"12px 14px"}}><div style={{fontSize:11,color:C.mid,textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}</div><div style={{fontSize:20,fontWeight:600,color:C.text,margin:"4px 0 2px"}}>{v}</div><div style={{fontSize:11,color:C.dim}}>{s}</div></div>)}
          </div>
          {extra?.hull&&(extra.hull.shareOutside>0.2||extra.hull.extremeMean)&&<LabNote tone="warn">Convex-hull check: {res.treated.name}'s outcome lies outside the donors' range in {extra.hull.nOutside} of {res.preIdx.length} pre-policy years{extra.hull.extremeMean? `, and its pre-period average is the ${extra.hull.rankFromTop===1? "highest" : "lowest"} of all ${extra.hull.nUnits} units` : ""}. Non-negative weights cannot reproduce an extreme unit, so the synthetic control will be biased. Consider synthetic DiD (allows a level shift), a demeaned or differenced outcome, or a different donor pool.</LabNote>}
          {extra?.est?.length>0&&<LabSec title="Estimator comparison" sub="Same panel, different weighting schemes (synthdid conventions). Agreement across rows is reassuring; large gaps point to level differences or poor fit.">
            <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Estimator","Average post-policy effect","Placebo SE","95% CI","What it assumes"].map((h,i)=><th key={h} scope="col" style={{...thS,textAlign:i===1||i===2||i===3?"right":"left"}}>{h}</th>)}</tr></thead>
              <tbody>
                <tr><td style={{...tdS,fontWeight:600}}>Synthetic control (as specified)</td><td style={{...tdN,fontWeight:600}}>{fmtY(res.att)}</td><td style={tdN}>—</td><td style={tdN}>placebo p = {ciFmtP(pv.p)}</td><td style={{...tdS,whiteSpace:"normal",minWidth:220,color:C.mid}}>Weights on donors only; no level shift; inference by permutation.</td></tr>
                {extra.est.map(e=>{ const lab={ sc:"Synthetic control (synthdid)", sdid:"Synthetic DiD (Arkhangelsky et al. 2021)", did:"Difference-in-differences" }[e.key]; const what={ sc:"Outcome-path weights, no intercept, no time weights.", sdid:"Unit weights plus an intercept (level shift allowed) and pre-period time weights.", did:"Equal weights on all donors and pre-periods: parallel trends." }[e.key];
                  return <tr key={e.key}><td style={{...tdS,fontWeight:e.key==="sdid"?600:400,whiteSpace:"normal"}}>{lab}</td><td style={{...tdN,fontWeight:e.key==="sdid"?600:400}}>{fmtY(e.est)}</td><td style={tdN}>{e.pending? "…" : fmtY(e.se)}</td><td style={tdN}>{e.pending? "…" : `[${fmtY(e.est-1.96*e.se)}, ${fmtY(e.est+1.96*e.se)}]`}</td><td style={{...tdS,whiteSpace:"normal",minWidth:220,color:C.mid}}>{what}</td></tr>; })}
                {extra.pen&&<tr><td style={{...tdS,whiteSpace:"normal"}}>Penalized SC (λ = {extra.pen.lambda})</td><td style={tdN}>{fmtY(extra.pen.att)}</td><td style={tdN}>—</td><td style={tdN}>pre-RMSPE {fmtY(extra.pen.preRMSPE)}</td><td style={{...tdS,whiteSpace:"normal",minWidth:220,color:C.mid}}>Abadie & L'Hour (2021): penalizes distant donors; {extra.pen.nUsed} donors used ({extra.pen.weights.slice(0,4).map(w=>`${w.name} ${w.w.toFixed(2)}`).join(", ")}).</td></tr>}
              </tbody></table></div>
            <div style={{fontSize:11,color:C.dim,marginTop:8,lineHeight:1.55}}>Placebo SEs re-assign the policy to donors and re-estimate the weights each time (Arkhangelsky et al. 2021, Algorithm 4); they assume treatment assignment is exchangeable across units. The synthdid rows use the outcome path only; the first row uses your predictor specification.</div>
          </LabSec>}
          {extra?.pen&&!extra?.est?.length&&<LabNote>Penalized synthetic control (λ = {extra.pen.lambda}): average post-policy gap {fmtY(extra.pen.att)}, pre-period RMSPE {fmtY(extra.pen.preRMSPE)}, {extra.pen.nUsed} donors used.</LabNote>}
          <LabSec title={`${res.treated.name} vs synthetic ${res.treated.name}`} sub={yVar?.name} right={<div style={{display:"flex",gap:6,flexWrap:"wrap"}}><button type="button" onClick={exportCSV} style={{...pill(false),display:"inline-flex",gap:6,alignItems:"center"}}><Ico n="file"/> Results CSV</button><button type="button" onClick={downloadPanel} style={{...pill(false),display:"inline-flex",gap:6,alignItems:"center"}} title="The panel used in this run, in long format, with an imputed flag"><Ico n="sheet"/> Panel CSV</button></div>}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={pathData} margin={{top:8,right:16,left:8,bottom:4}}>
                <CartesianGrid stroke={C.border} strokeOpacity={0.8} vertical={false}/>
                <XAxis dataKey="year" {...axis}/><YAxis {...axis} width={72} tickFormatter={fmtY} domain={["auto","auto"]}/>
                <Tooltip content={<CustomTip fmt={yVar?.fmt}/>}/>
                <ReferenceLine x={cfg.t0} stroke={C.mid} strokeDasharray="4 3" label={{value:"policy",fill:C.mid,fontSize:11,position:"insideTopLeft"}}/>
                <Line type="monotone" dataKey="actual" name={res.treated.name} stroke={C.gold} strokeWidth={2.4} dot={false} isAnimationActive={false}/>
                <Line type="monotone" dataKey="synthetic" name={`Synthetic ${res.treated.name}`} stroke={C.text} strokeWidth={1.8} strokeDasharray="6 4" dot={false} isAnimationActive={false}/>
                <Legend wrapperStyle={{fontSize:12,color:C.mid}}/>
              </LineChart>
            </ResponsiveContainer>
          </LabSec>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"minmax(0,1fr)":"minmax(0,1.3fr) minmax(0,1fr)",gap:12}}>
            <LabSec title="Gap and in-space placebos" sub={<span>Treated gap (bold) against {pv.keep.length} donor placebos · filter
              <select aria-label="Placebo pre-fit filter" value={cfg.mult} onChange={e=>set("mult",+e.target.value)} style={{...sel,width:"auto",display:"inline-block",padding:"2px 6px",fontSize:11,marginLeft:6}}><option value={0}>none</option><option value={2}>2×</option><option value={5}>5×</option><option value={20}>20×</option></select></span>}>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={gapData} margin={{top:8,right:16,left:8,bottom:4}}>
                  <CartesianGrid stroke={C.border} strokeOpacity={0.8} vertical={false}/>
                  <XAxis dataKey="year" {...axis}/><YAxis {...axis} width={70} tickFormatter={fmtY}/>
                  <ReferenceLine y={0} stroke={C.mid}/><ReferenceLine x={cfg.t0} stroke={C.mid} strokeDasharray="4 3"/>
                  {(pv.keep||[]).map((p,i)=><Line key={i} type="monotone" dataKey={"p"+i} stroke={C.mid} strokeOpacity={0.35} strokeWidth={1} dot={false} isAnimationActive={false}/>)}
                  <Line type="monotone" dataKey="treated" name="Treated gap" stroke={C.gold} strokeWidth={2.6} dot={false} isAnimationActive={false}/>
                </LineChart>
              </ResponsiveContainer>
            </LabSec>
            <LabSec title="Donor weights" sub={`${res.weights.filter(w=>w.w>0.001).length} of ${res.weights.length} donors used`}>
              <div style={{maxHeight:260,overflowY:"auto"}}>
                {res.weights.filter(w=>w.w>0.001).map(w=><div key={w.id} style={{display:"grid",gridTemplateColumns:"120px 1fr 52px",gap:8,alignItems:"center",padding:"4px 0",fontSize:12}}>
                  <span style={{color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{w.name}</span>
                  <div style={{height:8,background:C.raised,borderRadius:4}}><div style={{width:`${w.w*100}%`,height:"100%",background:C.gold,borderRadius:4}}/></div>
                  <span style={{textAlign:"right",color:C.mid,fontVariantNumeric:"tabular-nums"}}>{w.w.toFixed(3)}</span></div>)}
              </div>
            </LabSec>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"minmax(0,1fr)":"minmax(0,1fr) minmax(0,1fr)",gap:12}}>
            <LabSec title="Predictor balance" sub="Pre-treatment characteristics">
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["Predictor","Treated","Synthetic","Donor avg."].map((h,i)=><th key={h} scope="col" style={{...thS,textAlign:i?"right":"left"}}>{h}</th>)}</tr></thead>
                <tbody>{res.balance.map(b=><tr key={b.name}><td style={{...tdS,whiteSpace:"normal"}}>{b.name}</td><td style={tdN}>{ciFmt(b.treated)}</td><td style={tdN}>{ciFmt(b.synthetic)}</td><td style={tdN}>{ciFmt(b.donorAvg)}</td></tr>)}</tbody>
              </table>
              {res.v&&!res.cv&&<div style={{fontSize:11,color:C.dim,marginTop:8}}>Predictor weights V minimize pre-period fit (Nelder–Mead) and need not be unique, so they can differ from Stata/R synth runs. Use cross-validated V or the outcome-path mode for a unique, reproducible answer.</div>}
              {res.cv&&<div style={{fontSize:11,color:C.dim,marginTop:8}}>V chosen by cross-validation: trained on {res.cv.train[0]}–{res.cv.train[1]}, validated on {res.cv.val[0]}–{res.cv.val[1]} (validation RMSPE {fmtY(Math.sqrt(res.cv.valMSPE))}). Predictors in the table are measured over the whole pre-period; the weights use the validation window.</div>}
            </LabSec>
            <LabSec title="Leave-one-out" sub="Re-estimates after dropping each donor with weight > 0.01">
              {res.loo.length? <ResponsiveContainer width="100%" height={220}>
                <LineChart data={looData} margin={{top:8,right:16,left:8,bottom:4}}>
                  <CartesianGrid stroke={C.border} strokeOpacity={0.8} vertical={false}/>
                  <XAxis dataKey="year" {...axis}/><YAxis {...axis} width={70} tickFormatter={fmtY} domain={["auto","auto"]}/>
                  <ReferenceLine x={cfg.t0} stroke={C.mid} strokeDasharray="4 3"/>
                  {res.loo.map((l,i)=><Line key={i} type="monotone" dataKey={"l"+i} stroke={C.mid} strokeOpacity={0.5} strokeWidth={1} dot={false} isAnimationActive={false}/>)}
                  <Line type="monotone" dataKey="synthetic" stroke={C.text} strokeDasharray="6 4" strokeWidth={1.6} dot={false} isAnimationActive={false}/>
                  <Line type="monotone" dataKey="actual" stroke={C.gold} strokeWidth={2.4} dot={false} isAnimationActive={false}/>
                </LineChart>
              </ResponsiveContainer> : <div style={{fontSize:12,color:C.dim}}>Only one donor carries weight.</div>}
              {res.loo.length>0&&<div style={{fontSize:11,color:C.dim}}>Average post gap ranges from {fmtY(Math.min(...res.loo.map(l=>l.att)))} to {fmtY(Math.max(...res.loo.map(l=>l.att)))}.</div>}
            </LabSec>
          </div>
          {extra?.backdate&&<LabSec title={`In-time placebo: policy moved to ${extra.backdate.t0b}`} sub={`Weights fitted only on years before ${extra.backdate.t0b}. Between ${extra.backdate.t0b} and ${cfg.t0} nothing happened, so the gap should stay near zero.`}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={extra.backdate.path} margin={{top:8,right:16,left:8,bottom:4}}>
                <CartesianGrid stroke={C.border} strokeOpacity={0.8} vertical={false}/>
                <XAxis dataKey="year" {...axis}/><YAxis {...axis} width={72} tickFormatter={fmtY} domain={["auto","auto"]}/>
                <Tooltip content={<CustomTip fmt={yVar?.fmt}/>}/>
                <ReferenceLine x={extra.backdate.t0b} stroke={C.orange} strokeDasharray="4 3" label={{value:"placebo date",fill:C.orange,fontSize:11,position:"insideTopLeft"}}/>
                <ReferenceLine x={cfg.t0} stroke={C.mid} strokeDasharray="4 3" label={{value:"actual policy",fill:C.mid,fontSize:11,position:"insideTopRight"}}/>
                <Line type="monotone" dataKey="actual" name={res.treated.name} stroke={C.gold} strokeWidth={2.4} dot={false} isAnimationActive={false}/>
                <Line type="monotone" dataKey="synthetic" name="Synthetic (backdated weights)" stroke={C.text} strokeWidth={1.8} strokeDasharray="6 4" dot={false} isAnimationActive={false}/>
                <Legend wrapperStyle={{fontSize:12,color:C.mid}}/>
              </LineChart>
            </ResponsiveContainer>
            <div style={{fontSize:12,color:C.mid,marginTop:6}}>Average gap {extra.backdate.t0b}–{cfg.t0-1}: <b style={{color:C.text}}>{fmtY(extra.backdate.gapAvg)}</b> (pre-placebo RMSPE {fmtY(extra.backdate.preRMSPE)}). {Math.abs(extra.backdate.gapAvg) > 2*extra.backdate.preRMSPE? "The gap opens before the real policy date: anticipation, an earlier shock or poor fit may be driving the main estimate." : "No effect appears before the real policy date, which supports the timing assumption."}</div>
          </LabSec>}
        </>}
      </div>
    </div>
  );
}

// >>> RESEARCH METHODS UI (generated from engine/ui_*.jsx) >>>
// ── Event-study plot: estimates and 95% intervals by event time; several estimators offset horizontally ──
const EV_SHAPES = ["circle","square","diamond"];
const EventPlot = ({ series, height=310, label="Event-study estimates by years since treatment" }) => {
  const [ref,W0]=useBoxWidth(640); const W=Math.max(W0,300), H=height, L=58, R=14, T=44, B=34;
  const all=series.flatMap(s=>s.pts).filter(p=>isFinite(p.est)); if (!all.length) return null;
  const es=[...new Set(all.map(p=>p.e))].sort((a,b)=>a-b); const e0=es[0], e1=es[es.length-1];
  const ys=all.flatMap(p=>[p.lo,p.hi,p.ulo,p.uhi,p.est]).filter(v=>v!=null&&isFinite(v)); let y0=Math.min(0,...ys), y1=Math.max(0,...ys); const pad=(y1-y0)*0.08||1; y0-=pad; y1+=pad;
  const span=e1-e0+1; const x=(e)=>L+(e-e0+0.5)/span*(W-L-R); const y=(v)=>T+(y1-v)/(y1-y0)*(H-T-B); const bw=(W-L-R)/span; const off=(i)=>(i-(series.length-1)/2)*Math.min(9,bw/(series.length+1));
  const ticks=Array.from({length:5},(_,i)=>y0+(y1-y0)*i/4); const step=Math.max(1,Math.ceil(span/(W<480?8:16)));
  const mark=(shape,cx,cy,col)=> shape==="square"? <rect x={cx-4} y={cy-4} width={8} height={8} fill={col}/> : shape==="diamond"? <path d={`M${cx},${cy-5} L${cx+5},${cy} L${cx},${cy+5} L${cx-5},${cy} Z`} fill={col}/> : <circle cx={cx} cy={cy} r={4.2} fill={col}/>;
  return (
    <div ref={ref} style={{width:"100%"}}><svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label} style={{display:"block"}}>
      {ticks.map((t,i)=><g key={i}><line x1={L} x2={W-R} y1={y(t)} y2={y(t)} stroke={C.border}/><text x={L-6} y={y(t)+4} textAnchor="end" fontSize="10" fill={C.mid}>{ciFmt(t, Math.abs(y1-y0)<1? 3 : Math.abs(y1-y0)<10? 2 : 0)}</text></g>)}
      <line x1={L} x2={W-R} y1={y(0)} y2={y(0)} stroke={C.mid}/>
      {e0<0&&e1>=0&&<g><line x1={x(-0.5)} x2={x(-0.5)} y1={T-6} y2={H-B} stroke={C.mid} strokeDasharray="4 3"/><text x={x(-0.5)+4} y={H-B-6} fontSize="10" fill={C.mid}>treatment starts</text></g>}
      {es.filter((e,i)=>i%step===0||e===0).map(e=><text key={e} x={x(e)} y={H-B+14} textAnchor="middle" fontSize="10" fill={C.mid}>{e}</text>)}
      <text x={(L+W-R)/2} y={H-4} textAnchor="middle" fontSize="10" fill={C.mid}>years relative to treatment (event time)</text>
      {series.map((s,si)=><g key={s.name}>{s.pts.filter(p=>isFinite(p.est)).map(p=>{ const cx=x(p.e)+off(si);
        return <g key={p.e}>
          {p.ulo!=null&&isFinite(p.ulo)&&<rect x={cx-3.5} y={y(p.uhi)} width={7} height={Math.max(1,y(p.ulo)-y(p.uhi))} fill={s.color} opacity="0.16"/>}
          {isFinite(p.lo)&&isFinite(p.hi)&&<line x1={cx} x2={cx} y1={y(p.lo)} y2={y(p.hi)} stroke={s.color} strokeWidth="1.6" strokeDasharray={s.dash||""}/>}
          {mark(EV_SHAPES[si%3], cx, y(p.est), p.ref? C.dim : s.color)}
          <title>{`${s.name}, e=${p.e}: ${ciFmt(p.est,4)}${isFinite(p.lo)? ` [${ciFmt(p.lo,4)}, ${ciFmt(p.hi,4)}]` : ""}`}</title></g>; })}</g>)}
      <g transform={`translate(${L},${12})`}>{series.map((s,si)=><g key={s.name} transform={`translate(${si*Math.min(190,(W-L-R)/series.length)},0)`}>{mark(EV_SHAPES[si%3],5,0,s.color)}<text x={14} y={4} fontSize="11" fill={C.text}>{s.name}</text></g>)}</g>
    </svg></div>
  );
};
// Treatment rollout: cohorts (rows) by period (columns)
const RolloutGrid = ({ cohorts, times }) => (
  <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",fontSize:11}} aria-label="Treatment rollout by cohort and period">
    <thead><tr><th scope="col" style={{...thS,position:"static"}}>Cohort</th><th scope="col" style={{...thS,position:"static",textAlign:"right"}}>Units</th>{times.map(t=><th key={t} scope="col" style={{...thS,position:"static",padding:"6px 4px",textAlign:"center",fontWeight:500}}>{String(t).slice(-2)}</th>)}</tr></thead>
    <tbody>{cohorts.map(c=><tr key={c.g}><td style={{...tdS,padding:"4px 8px"}}>{isFinite(c.g)? `First treated ${c.g}` : "Never treated"}</td><td style={{...tdN,padding:"4px 8px"}}>{c.n}</td>
      {times.map(t=>{ const on=isFinite(c.g)&&t>=c.g; return <td key={t} title={on?"treated":"not treated"} style={{padding:2}}><div style={{width:"100%",minWidth:14,height:14,borderRadius:2,background:on? C.gold : C.raised,border:`1px solid ${on? C.gold : C.border}`}}/></td>; })}</tr>)}</tbody>
  </table></div>
);

function DidTab({ isMobile, imported, basket=[], eco, years, defaultCountry, incoming }) {
  const [data,setData]=useState(null); const [fileErr,setFileErr]=useState("");
  const [map,setMap]=useState({ unit:"", time:"", y:"", treat:"first", g:"", d:"", covs:[] });
  const [cfg,setCfg]=useState({ control:"never", ant:0, base:"varying", useCovs:false, twfe:true, cs:true, bjs:true, bacon:true, honest:true, kMin:-6, kMax:6, });
  const [out,setOut]=useState(null); const [busy,setBusy]=useState("");
  const resRef=useRef(null); useEffect(()=>{ if (isMobile && out && resRef.current) resRef.current.scrollIntoView({behavior:"smooth",block:"start"}); },[out, isMobile]);
  const set=(k,v)=>setCfg(c=>({...c,[k]:v})); const setM=(k,v)=>setMap(m=>({...m,[k]:v}));
  const load=(parsed, name, extra={})=>{ if (parsed.error){ setFileErr(parsed.error); return; } setFileErr(""); setOut(null); const h=parsed.headers;
    const f=(re, ex=[])=>h.find(x=>re.test(x)&&!ex.includes(x))||"";
    const time=f(/^(year|yr|period|time|date|t)$/i)||f(/year|period|date|time/i); const unit=f(/^(country|state|county|region|unit|id|countyreal|firm|district|iso2?|name)$/i,[time])||f(/country|state|county|region|unit|id|firm/i,[time]);
    const g=f(/first.?treat|cohort|treat.?year|adopt|^g$|first_treated|gname/i,[time,unit]); const d=g? "" : f(/^(treat|treated|d|post|policy|treatment)$/i,[time,unit]);
    const num=h.filter(x=>![time,unit,g,d].includes(x) && parsed.rows.slice(0,50).every(r=>{ const v=String(r[h.indexOf(x)]??"").trim(); return !v||!isNaN(parseFloat(v)); }));
    setData({ ...parsed, name, ...extra }); setMap({ unit, time, y: extra.y || num[0] || "", treat: g? "first" : "dummy", g, d, covs:[] }); };
  useEffect(()=>{ if (incoming?.table) load(incoming.table, incoming.name); },[incoming?.id]);
  const onFile=(f)=>{ if(!f) return; if (f.size>40*1024*1024){ setFileErr("File is larger than 40 MB."); return; } const r=new FileReader(); r.onload=()=>load(ciParseCSV(String(r.result)), f.name); r.readAsText(f); };
  // ── build a staggered country panel from the EcoScope basket ──
  const ecoItems = useMemo(()=>basket.map(it=>({ key:ciItemKey(it), name:it.label, item:it, ...ciResolveItem(it) })),[basket]); const ecoUsable=ecoItems.filter(x=>x.route!=="none");
  const [bld,setBld]=useState(()=>({ open:false, y:ecoUsable[0]?.key||"", y0:years?.[0]??2000, y1:Math.min(years?.[1]??CURRENT_YEAR, CURRENT_YEAR-1), region:"All", treated:defaultCountry? { [defaultCountry]: Math.round(((years?.[0]??2000)+(years?.[1]??2020))/2) } : {}, covs:ecoUsable.slice(1).map(x=>x.key), applyEco:true, busy:"" }));
  const setB=(k,v)=>setBld(b=>({...b,[k]:v}));
  const buildEco=async ()=>{ const b=bld; const ctry=COUNTRIES.filter(c=>b.region==="All"||c.region===b.region||b.treated[c.code]!=null); const codes=ctry.map(c=>c.code);
    if (!Object.keys(b.treated).length){ setFileErr("Pick at least one treated country and its first treatment year."); return; }
    const P={}; for (const k of [...new Set([b.y, ...b.covs])]){ const x=ecoItems.find(e=>e.key===k); setB("busy",`Downloading ${x?.name} for ${codes.length} countries…`); P[k]=await fetchItemPanel(x.item, codes, b.y0, b.y1, b.applyEco? eco : null)||{}; }
    const minG=Math.min(...Object.values(b.treated)); const yName=ecoItems.find(e=>e.key===b.y)?.name||"outcome"; const covNames=b.covs.map(k=>`${ecoItems.find(e=>e.key===k)?.name} (baseline)`);
    const base=(m)=>{ const v=[]; for (let yy=b.y0; yy<Math.min(minG,b.y0+3); yy++){ const q=m?.[yy]; if (q!=null&&isFinite(q)) v.push(q); } return v.length? ciMean(v) : null; };
    const headers=["country","iso2","year",yName,"first_treated",...covNames]; const rows=[];
    ctry.forEach(c=>{ const cv=b.covs.map(k=>base(P[k]?.[c.code])); for (let yy=b.y0; yy<=b.y1; yy++){ const v=P[b.y]?.[c.code]?.[yy]; rows.push([c.name, c.code, String(yy), v==null? "" : String(v), String(b.treated[c.code]??0), ...cv.map(x=>x==null? "" : String(x))]); } });
    setB("busy",""); load({ headers, rows }, `EcoScope selection · ${ctry.length} countries · staggered`, { y:yName, note:`Outcome: ${yName}${b.applyEco? ` (${ciEcoNote(eco)})` : ""}. Treated: ${Object.entries(b.treated).map(([c,g])=>`${COUNTRIES.find(x=>x.code===c)?.name} (${g})`).join(", ")}. All other countries in the pool are never treated. Baseline covariates are averages over the first years before any treatment.` });
    setMap(m=>({ ...m, unit:"country", time:"year", y:yName, treat:"first", g:"first_treated", covs:covNames })); setB("open",false); };

  const run=()=>{ if (!data) return; setBusy("Building the panel…"); setOut(null);
    setTimeout(async ()=>{ try{
      const P0=meDidPanel(data.headers, data.rows, { ...map, covs: cfg.useCovs? map.covs : [] }); const P=meDidBalance(P0); const notes=[...P0.notes];
      if (P.dropped) notes.push(`${P.dropped} unit(s) with a missing outcome${cfg.useCovs?" or covariate":""} in some period were dropped to balance the panel (did package default).`);
      if (P.ids.length<4){ setOut({ error:"Fewer than four complete units. Check the column mapping and missing values." }); setBusy(""); return; }
      const cohorts=meCohorts(P); const nNever=P.G.filter(g=>!isFinite(g)).length; const treatedCoh=cohorts.filter(c=>isFinite(c.g)&&c.g>P.times[0]);
      if (!treatedCoh.length){ setOut({ error:"No unit switches into treatment inside the sample window, so there is nothing to estimate." }); setBusy(""); return; }
      const res={ P, cohorts, nNever, notes, rows:[], times:P.times };
      const staggered=treatedCoh.length>1; res.staggered=staggered;
      if (cfg.twfe){ const tw=meTWFE(P,{ kMin:cfg.kMin, kMax:cfg.kMax }); res.twfe=tw; res.rows.push({ ...tw.static, method:"TWFE, static (unit and year fixed effects)", note: staggered? "Weighted average of all 2×2 comparisons, including already-treated units as controls; biased when effects vary over time or by cohort." : "With a single adoption date this equals the canonical DiD." }); }
      if (cfg.cs){ setBusy("Estimating group-time ATTs (Callaway & Sant'Anna)…"); await new Promise(r=>setTimeout(r,10));
        const R=meCSattgt(P,{ control:cfg.control, anticipation:cfg.ant, base:cfg.base, useCovs:cfg.useCovs&&map.covs.length>0 }); notes.push(...R.notes); res.cs=R;
        if (R.cells.some(c=>isFinite(c.att))){ const ag={ simple:meCSaggte(R,"simple"), group:meCSaggte(R,"group"), dynamic:meCSaggte(R,"dynamic"), calendar:meCSaggte(R,"calendar") }; res.agg=ag;
          const dyn=ag.dynamic.per.filter(x=>x.key>=cfg.kMin&&x.key<=cfg.kMax); res.crit=meUniformCrit(dyn.map(x=>x.inf), dyn.map(x=>x.se), 999, 11);
          const lab={ group:"Callaway–Sant'Anna: average over cohorts (headline)", simple:"Callaway–Sant'Anna: simple weighted ATT", dynamic:"Callaway–Sant'Anna: average of event-time effects (e ≥ 0)", calendar:"Callaway–Sant'Anna: average over calendar years" };
          ["group","simple","dynamic","calendar"].forEach(k=>res.rows.push({ ...meResult(lab[k], "ATT", ag[k].overall.est, ag[k].overall.se), headline:k==="group" }));
          if (cfg.honest) res.honest=meHonestRM(ag.dynamic.per.filter(x=>x.key>=cfg.kMin&&x.key<=cfg.kMax)); } }
      if (cfg.bacon){ if (!cfg.useCovs) { const b=meBacon(P); if (!b.error) res.bacon=b; } }
      if (cfg.bjs){ const bj=meBJS(P, cfg.ant); if (bj){ res.bjs=bj; res.rows.push({ ...meResult("Imputation estimator (Borusyak, Jaravel & Spiess 2024)", "ATT", bj.att, bj.se), note:"Unit and year effects fitted on untreated observations only; conservative clustered SE (their eq. 8, as R didimputation)." }); } }
      res.notes=notes; setOut({ ...res }); setBusy("");
    }catch(e){ console.error(e); setOut({ error:"The analysis failed: "+e.message }); setBusy(""); } }, 30); };

  const H=data?.headers||[]; const fmt=(v)=>ciFmt(v, Math.abs(v)<10? 4 : 2);
  const evSeries = useMemo(()=>{ if (!out) return []; const S=[]; const inWin=(e)=>e>=cfg.kMin&&e<=cfg.kMax;
    if (out.agg) S.push({ name:"Callaway–Sant'Anna", color:C.gold, pts: out.agg.dynamic.per.filter(x=>inWin(x.key)).map(x=>({ e:x.key, est:x.est, lo:x.est-1.96*x.se, hi:x.est+1.96*x.se, ulo:x.est-out.crit*x.se, uhi:x.est+out.crit*x.se })) });
    if (out.twfe) S.push({ name:"TWFE event study", color:C.purple, dash:"3 2", pts:[...out.twfe.event.coef.filter(c=>inWin(c.k)).map(c=>({ e:c.k, est:c.est, lo:c.est-1.96*c.se, hi:c.est+1.96*c.se })), ...(inWin(-1)? [{ e:-1, est:0, lo:NaN, hi:NaN, ref:true }] : [])] });
    if (out.bjs) S.push({ name:"Imputation (BJS)", color:C.teal, pts: out.bjs.byE.filter(x=>inWin(x.e)&&x.e>=0).map(x=>({ e:x.e, est:x.est, lo:x.est-1.96*x.se, hi:x.est+1.96*x.se })) });
    return S; },[out, cfg.kMin, cfg.kMax]);
  const exportCSV=()=>{ if (!out?.cs) return; dlCSV(out.cs.cells.map(c=>({ cohort:c.g, period:c.t, event_time:c.e, att:c.att, se:c.se, post:c.post, base_period:c.base??"" })), "ecoscope_att_gt.csv");
    if (out.agg) dlCSV(out.agg.dynamic.per.map(x=>({ event_time:x.key, att:x.est, se:x.se, ci_low:x.est-1.96*x.se, ci_high:x.est+1.96*x.se, uniform_low:x.est-out.crit*x.se, uniform_high:x.est+out.crit*x.se })), "ecoscope_event_study.csv"); };

  return (
    <div style={{display:"grid",gridTemplateColumns:isMobile?"minmax(0,1fr)":"320px minmax(0,1fr)",gap:16,alignItems:"start"}}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <LabSec title="1. Data" sub="A panel: units observed over several periods, some switching into treatment.">
          <input id="did-file" type="file" accept=".csv,.tsv,.txt" onChange={e=>onFile(e.target.files?.[0])} style={{display:"none"}}/>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <label htmlFor="did-file" style={{...btn(C.gold),display:"inline-flex",alignItems:"center",gap:6,fontSize:12,padding:"8px 14px"}}><Ico n="file"/> Upload CSV</label>
            <button type="button" onClick={()=>{ const d=meDidDemo(); load(d, d.name, { trueATT:d.trueATT, note:d.note }); }} style={{...pill(false),padding:"8px 12px",fontSize:12}}>Load demo data</button>
            {imported&&<button type="button" onClick={()=>load({ headers:imported.headers, rows:imported.rows }, imported.name)} style={{...pill(false),padding:"8px 12px",fontSize:12}}>Use EcoScope import</button>}
            <button type="button" onClick={()=>setB("open",!bld.open)} aria-expanded={bld.open} style={{...pill(bld.open),padding:"8px 12px",fontSize:12}}>Build from my selection</button>
          </div>
          {bld.open&&<div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
            {!ecoUsable.length? <LabNote tone="warn">None of the variables in your basket can be downloaded for many countries. Add World Bank–based, IMF or WHO variables first.</LabNote> : <>
              <div style={{fontSize:11,color:C.dim,lineHeight:1.55,marginBottom:10}}>Builds a country-year panel. Each treated country can start in a different year (staggered adoption); every other country in the pool is a never-treated comparison.</div>
              <LabField label="Outcome"><select value={bld.y} onChange={e=>setB("y",e.target.value)} style={sel}>{ecoItems.map(x=><option key={x.key} value={x.key} disabled={x.route==="none"}>{x.name}{x.route==="none"?` (${x.reason})`:""}</option>)}</select></LabField>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <LabField label="From"><select value={bld.y0} onChange={e=>setB("y0",+e.target.value)} style={{...sel,padding:"8px"}}>{YEARS.filter(y=>y<bld.y1-2).map(y=><option key={y}>{y}</option>)}</select></LabField>
                <LabField label="To"><select value={bld.y1} onChange={e=>setB("y1",+e.target.value)} style={{...sel,padding:"8px"}}>{YEARS.filter(y=>y>bld.y0+2&&y<=CURRENT_YEAR).map(y=><option key={y}>{y}</option>)}</select></LabField>
              </div>
              <LabField label="Comparison pool"><select value={bld.region} onChange={e=>setB("region",e.target.value)} style={sel}>{REGIONS.map(r=><option key={r} value={r}>{r==="All"?"All countries":r}</option>)}</select></LabField>
              <LabField group label="Treated countries and first treatment year">
                <select value="" onChange={e=>{ const c=e.target.value; if (c) setB("treated",{ ...bld.treated, [c]: Math.round((bld.y0+bld.y1)/2) }); }} style={sel}><option value="">Add a treated country…</option>{COUNTRIES.filter(c=>bld.treated[c.code]==null).map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</select>
                {Object.entries(bld.treated).map(([c,g])=><div key={c} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 90px 28px",gap:6,alignItems:"center",marginTop:6}}>
                  <span style={{fontSize:12,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{COUNTRIES.find(x=>x.code===c)?.name||c}</span>
                  <select aria-label={`First treatment year for ${c}`} value={g} onChange={e=>setB("treated",{ ...bld.treated, [c]:+e.target.value })} style={{...sel,padding:"5px 6px",fontSize:12}}>{YEARS.filter(y=>y>bld.y0&&y<=bld.y1).map(y=><option key={y}>{y}</option>)}</select>
                  <button type="button" aria-label={`Remove ${c}`} onClick={()=>{ const t={...bld.treated}; delete t[c]; setB("treated",t); }} style={{background:"none",border:"none",color:C.mid,cursor:"pointer",fontSize:14}}>✕</button></div>)}
              </LabField>
              <LabField group label="Baseline covariates" hint="optional">
                <div style={{border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px"}}>{ecoUsable.filter(x=>x.key!==bld.y).map(x=><Check key={x.key} checked={bld.covs.includes(x.key)} onChange={v=>setB("covs", v? [...bld.covs,x.key] : bld.covs.filter(k=>k!==x.key))} label={x.name}/>)}{ecoUsable.filter(x=>x.key!==bld.y).length===0&&<div style={{fontSize:11,color:C.dim,padding:"6px 0"}}>Add more basket variables to use as covariates.</div>}</div>
              </LabField>
              <Check checked={bld.applyEco} onChange={v=>setB("applyEco",v)} label="Apply my EcoScope transform & imputation" sub={ciEcoNote(eco)}/>
              <button type="button" onClick={buildEco} disabled={!!bld.busy||!bld.y} style={{...btn(C.gold),width:"100%",marginTop:8,opacity:bld.busy?0.55:1}}>{bld.busy? "Building…" : "Build panel"}</button>
              {bld.busy&&<div role="status" style={{fontSize:11,color:C.mid,marginTop:6}}>{bld.busy}</div>}
            </>}
          </div>}
          {fileErr&&<div style={{marginTop:8}}><LabNote tone="bad">{fileErr}</LabNote></div>}
          {data&&<div style={{marginTop:10,fontSize:12,color:C.mid}}><b style={{color:C.text}}>{data.name}</b> · {data.rows.length.toLocaleString()} rows
            {data.note&&<div style={{marginTop:6,color:C.dim,lineHeight:1.5}}>{data.note}</div>}</div>}
        </LabSec>
        {data&&<LabSec title="2. Panel structure">
          <LabField label="Unit"><select value={map.unit} onChange={e=>setM("unit",e.target.value)} style={sel}><option value="">Choose…</option>{H.map(h=><option key={h} value={h}>{h}</option>)}</select></LabField>
          <LabField label="Time"><select value={map.time} onChange={e=>setM("time",e.target.value)} style={sel}><option value="">Choose…</option>{H.map(h=><option key={h} value={h}>{h}</option>)}</select></LabField>
          <LabField label="Outcome"><select value={map.y} onChange={e=>setM("y",e.target.value)} style={sel}><option value="">Choose…</option>{H.map(h=><option key={h} value={h}>{h}</option>)}</select></LabField>
          <LabField group label="Treatment is given as">
            <div style={{display:"flex",gap:6}}>{[["first","First-treated period"],["dummy","0/1 indicator"]].map(([k,l])=><button key={k} type="button" onClick={()=>setM("treat",k)} style={{...pill(map.treat===k),flex:1,padding:"6px 4px"}}>{l}</button>)}</div>
          </LabField>
          {map.treat==="first"? <LabField label="First-treated column" hint="0 or blank = never"><select value={map.g} onChange={e=>setM("g",e.target.value)} style={sel}><option value="">Choose…</option>{H.map(h=><option key={h} value={h}>{h}</option>)}</select></LabField>
            : <LabField label="Treatment indicator" hint="1 from adoption on"><select value={map.d} onChange={e=>setM("d",e.target.value)} style={sel}><option value="">Choose…</option>{H.map(h=><option key={h} value={h}>{h}</option>)}</select></LabField>}
          <LabField group label="Covariates" hint="pre-treatment, time-invariant">
            <div style={{maxHeight:140,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px"}}>
              {H.filter(h=>![map.unit,map.time,map.y,map.g,map.d].includes(h)).map(h=><Check key={h} checked={map.covs.includes(h)} onChange={v=>setM("covs", v? [...map.covs,h] : map.covs.filter(x=>x!==h))} label={h}/>)}
            </div>
          </LabField>
          <Check checked={cfg.useCovs} onChange={v=>set("useCovs",v)} label="Condition parallel trends on covariates" sub="Doubly robust DiD (Sant'Anna & Zhao 2020); values from each unit's first period"/>
        </LabSec>}
        {data&&<LabSec title="3. Design and estimators">
          <LabField group label="Comparison group">
            <div style={{display:"flex",gap:6}}>{[["never","Never treated"],["notyet","Not yet treated"]].map(([k,l])=><button key={k} type="button" onClick={()=>set("control",k)} style={{...pill(cfg.control===k),flex:1,padding:"6px 4px"}}>{l}</button>)}</div>
          </LabField>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <LabField label="Anticipation"><select value={cfg.ant} onChange={e=>set("ant",+e.target.value)} style={{...sel,padding:"8px"}}>{[0,1,2].map(a=><option key={a} value={a}>{a? `${a} period${a>1?"s":""}` : "None"}</option>)}</select></LabField>
            <LabField label="Base period"><select value={cfg.base} onChange={e=>set("base",e.target.value)} style={{...sel,padding:"8px"}}><option value="varying">Varying</option><option value="universal">Universal (g−1)</option></select></LabField>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <LabField label="Event window from"><select value={cfg.kMin} onChange={e=>set("kMin",+e.target.value)} style={{...sel,padding:"8px"}}>{[-2,-3,-4,-5,-6,-8,-10,-15].map(k=><option key={k} value={k}>{k}</option>)}</select></LabField>
            <LabField label="to"><select value={cfg.kMax} onChange={e=>set("kMax",+e.target.value)} style={{...sel,padding:"8px"}}>{[2,3,4,5,6,8,10,15].map(k=><option key={k} value={k}>{k}</option>)}</select></LabField>
          </div>
          <Check checked={cfg.cs} onChange={v=>set("cs",v)} label="Callaway & Sant'Anna (2021)" sub="Group-time ATTs, aggregated; robust to staggered timing"/>
          <Check checked={cfg.bjs} onChange={v=>set("bjs",v)} label="Imputation estimator (Borusyak et al. 2024)" sub="Conservative clustered SE"/>
          <Check checked={cfg.twfe} onChange={v=>set("twfe",v)} label="Two-way fixed effects (static and event study)" sub="Benchmark; clustered by unit"/>
          <Check checked={cfg.bacon} onChange={v=>set("bacon",v)} label="Goodman-Bacon decomposition of TWFE" sub="Balanced panels without covariates"/>
          <Check checked={cfg.honest} onChange={v=>set("honest",v)} label="Sensitivity to parallel-trend violations" sub="Relative-magnitude bounds (Rambachan & Roth 2023)"/>
          <button type="button" onClick={run} disabled={!!busy||!map.unit||!map.time||!map.y||!(map.treat==="first"? map.g : map.d)} style={{...btn(C.gold),width:"100%",marginTop:10,opacity:busy?0.55:1}}>{busy? "Estimating…" : "Run DiD analysis"}</button>
        </LabSec>}
      </div>
      <div ref={resRef} style={{display:"flex",flexDirection:"column",gap:12,minWidth:0}}>
        {!out&&!busy&&<LabSec title="Difference-in-differences and event studies" sub="For policies adopted by many units, at one date or at different dates.">
          <div style={{fontSize:13,color:C.mid,lineHeight:1.7}}>Compare how outcomes change in treated units with how they change in comparable untreated units. With staggered adoption, the classic two-way fixed-effects regression can use already-treated units as controls and give misleading answers, so EcoScope reports heterogeneity-robust estimators (Callaway–Sant'Anna, imputation) next to the TWFE benchmark, an event study with simultaneous confidence bands, a Goodman-Bacon decomposition and a sensitivity analysis for parallel trends.
            <div style={{marginTop:10}}><LabNote>Identification rests on parallel trends (untreated outcomes would have moved together), no anticipation, no spillovers and an absorbing treatment. Pre-treatment estimates near zero support parallel trends but do not prove it.</LabNote></div></div>
        </LabSec>}
        {busy&&<LabSec title="Working…"><div role="status" style={{fontSize:12,color:C.mid}}>{busy}</div></LabSec>}
        {out?.error&&<LabNote tone="bad">{out.error}</LabNote>}
        {out&&!out.error&&<>
          {out.notes.map((n,i)=><LabNote key={i} tone="warn">{n}</LabNote>)}
          <LabSec title="Treatment rollout" sub={`${out.P.ids.length.toLocaleString()} units · ${out.times.length} periods (${out.times[0]}–${out.times[out.times.length-1]}) · ${out.nNever} never treated · ${out.cohorts.filter(c=>isFinite(c.g)).length} cohort(s)`}>
            <RolloutGrid cohorts={out.cohorts} times={out.times}/>
            {out.nNever===0&&<div style={{fontSize:11,color:C.orange,marginTop:6}}>No never-treated units: comparisons rely on not-yet-treated units.</div>}
          </LabSec>
          <LabSec title="Average effect on the treated" sub={out.staggered? "Staggered adoption: rely on the heterogeneity-robust rows; TWFE is shown as a benchmark." : "Single adoption date: all estimators target the same ATT."}
            right={out.cs&&<button type="button" onClick={exportCSV} style={{...pill(false),display:"inline-flex",gap:6,alignItems:"center"}}><Ico n="file"/> Export CSV</button>}>
            <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Estimator","Estimate","SE","95% CI","p"].map((h,i)=><th key={h} scope="col" style={{...thS,textAlign:i?"right":"left"}}>{h}</th>)}</tr></thead>
              <tbody>{out.rows.map((r,i)=><tr key={i} style={{background:r.headline?`${C.gold}12`:"transparent"}}><td style={{...tdS,whiteSpace:"normal",minWidth:230,fontWeight:r.headline?600:400}}>{r.method}{r.note&&<div style={{fontSize:11,color:C.dim,fontWeight:400,marginTop:2}}>{r.note}</div>}</td>
                <td style={{...tdN,fontWeight:600}}>{fmt(r.est)}</td><td style={tdN}>{fmt(r.se)}</td><td style={tdN}>[{fmt(r.lo)}, {fmt(r.hi)}]</td><td style={tdN}>{ciFmtP(r.p)}</td></tr>)}</tbody></table></div>
            <div style={{marginTop:12}}><ForestPlot results={out.rows.map(r=>({ ...r, method:r.method.replace("Callaway–Sant'Anna","CS") }))}/></div>
            {data?.trueATT!=null&&<div style={{fontSize:12,color:C.text,marginTop:6}}><b>Demo:</b> the true ATT is {fmt(data.trueATT)}.</div>}
          </LabSec>
          {evSeries.length>0&&<LabSec title="Event study" sub="Effects by years since adoption. Bars: 95% pointwise intervals; shaded: 95% simultaneous band for Callaway–Sant'Anna (multiplier bootstrap). Reference period e = −1.">
            <EventPlot series={evSeries}/>
            <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:12,color:C.mid,marginTop:8}}>
              {out.cs?.pretest&&<span>CS pre-trend test (all pre-treatment ATT(g,t) = 0): χ²({out.cs.pretest.df}) = {out.cs.pretest.W.toFixed(2)}, p = {ciFmtP(out.cs.pretest.p)}</span>}
              {out.twfe?.event?.pretrend&&<span>TWFE leads jointly zero: F({out.twfe.event.pretrend.df}, {out.twfe.event.df}) = {out.twfe.event.pretrend.F.toFixed(2)}, p = {ciFmtP(out.twfe.event.pretrend.pF)}</span>}
            </div>
            <div style={{fontSize:11,color:C.dim,marginTop:6,lineHeight:1.55}}>A pre-test is a diagnostic, not a pass/fail gate (Roth 2022). Treat flat pre-period estimates as supportive evidence and use the sensitivity analysis below.{out.twfe?.event?.dropped!=null&&` Without never-treated units, TWFE event time ${out.twfe.event.dropped} was also normalised to zero.`}</div>
            <details style={{marginTop:8}}><summary style={{cursor:"pointer",fontSize:12,color:C.text}}>Event-study table</summary>
              <div style={{overflowX:"auto",marginTop:6}}><table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["Event time","CS","CS SE","CS uniform band","TWFE","TWFE SE","Imputation"].map((h,i)=><th key={h} scope="col" style={{...thS,position:"static",textAlign:i?"right":"left"}}>{h}</th>)}</tr></thead>
                <tbody>{[...new Set(evSeries.flatMap(s=>s.pts.map(p=>p.e)))].sort((a,b)=>a-b).map(e=>{ const c=evSeries.find(s=>s.name==="Callaway–Sant'Anna")?.pts.find(p=>p.e===e); const t=evSeries.find(s=>s.name==="TWFE event study")?.pts.find(p=>p.e===e); const b=evSeries.find(s=>s.name==="Imputation (BJS)")?.pts.find(p=>p.e===e);
                  return <tr key={e}><td style={tdS}>{e}</td><td style={tdN}>{c? fmt(c.est):"—"}</td><td style={tdN}>{c? fmt((c.hi-c.est)/1.96):"—"}</td><td style={tdN}>{c? `[${fmt(c.ulo)}, ${fmt(c.uhi)}]`:"—"}</td><td style={tdN}>{t? fmt(t.est):"—"}</td><td style={tdN}>{t&&isFinite(t.hi)? fmt((t.hi-t.est)/1.96):"—"}</td><td style={tdN}>{b? fmt(b.est):"—"}</td></tr>; })}</tbody></table></div>
            </details>
          </LabSec>}
          {(out.bacon||out.honest)&&<div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr)",gap:12}}>
            {out.bacon&&<LabSec title="Goodman-Bacon decomposition" sub={`TWFE = ${fmt(out.bacon.est)} is a weighted average of 2×2 DiDs`}>
              <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["Comparison","Weight","Avg. estimate"].map((h,i)=><th key={h} scope="col" style={{...thS,position:"static",textAlign:i?"right":"left"}}>{h}</th>)}</tr></thead>
                <tbody>{out.bacon.summary.map(r=><tr key={r.type}><td style={{...tdS,whiteSpace:"normal",color:r.type.startsWith("Later vs earlier")?C.orange:C.text}}>{r.type}</td><td style={tdN}>{(100*r.weight).toFixed(1)}%</td><td style={tdN}>{fmt(r.avg)}</td></tr>)}</tbody></table>
              <div style={{fontSize:11,color:C.dim,marginTop:8,lineHeight:1.55}}>"Later vs earlier treated" comparisons use already-treated units as controls. When effects grow over time these terms are biased and can even turn negative, which is why the static TWFE estimate can mislead.</div>
            </LabSec>}
            {out.honest&&<LabSec title="Sensitivity: how large a trend violation overturns the result?" sub={`Relative magnitudes: post-period violations up to M̄ × the largest pre-period change (${fmt(out.honest.maxPreStep)})`}>
              <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th scope="col" style={{...thS,position:"static"}}>e</th>{out.honest.rows[0]?.bands.map(b=><th key={b.M} scope="col" style={{...thS,position:"static",textAlign:"right"}}>M̄ = {b.M}</th>)}<th scope="col" style={{...thS,position:"static",textAlign:"right"}}>Breakdown M̄</th></tr></thead>
                <tbody>{out.honest.rows.map(r=><tr key={r.e}><td style={tdS}>{r.e}</td>{r.bands.map(b=>{ const z=b.lo<=0&&b.hi>=0; return <td key={b.M} style={{...tdN,color:z?C.dim:C.text}}>[{fmt(b.lo)}, {fmt(b.hi)}]</td>; })}<td style={{...tdN,fontWeight:600}}>{r.breakdown.toFixed(2)}</td></tr>)}</tbody></table></div>
              <div style={{fontSize:11,color:C.dim,marginTop:8,lineHeight:1.55}}>Each interval adds the worst-case bias allowed by M̄ to the 95% CI (a conservative approximation). The breakdown value is the M̄ at which the interval first includes zero: below 1 means a violation no larger than those seen before treatment could explain the effect. For formal robust intervals use the HonestDiD package.</div>
            </LabSec>}
          </div>}
          {out.cs&&<details><summary style={{cursor:"pointer",fontSize:13,color:C.text,padding:"6px 0"}}>Group-time ATTs ({out.cs.cells.length} cells)</summary>
            <div style={{overflowX:"auto",maxHeight:360,marginTop:6}}><table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Cohort","Period","Event time","ATT(g,t)","SE","Base period","N in 2×2"].map((h,i)=><th key={h} scope="col" style={{...thS,textAlign:i>2?"right":"left"}}>{h}</th>)}</tr></thead>
              <tbody>{out.cs.cells.map((c,i)=><tr key={i} style={{opacity:c.post?1:0.75}}><td style={tdS}>{c.g}</td><td style={tdS}>{c.t}</td><td style={tdS}>{c.e}</td><td style={tdN}>{c.ref? "0 (ref.)" : fmt(c.att)}</td><td style={tdN}>{fmt(c.se)}</td><td style={tdN}>{c.base??"—"}</td><td style={tdN}>{c.n1||"—"}</td></tr>)}</tbody></table></div>
          </details>}
        </>}
      </div>
    </div>
  );
}

function HighDimTab({ isMobile, imported, incoming }) {
  const [data,setData]=useState(null); const [fileErr,setFileErr]=useState("");
  const [cfg,setCfg]=useState({ y:"", d:"", treatValue:"", covs:[], expand:false, pds:true, po:true, plr:true, irm:true, score:"ATE", learnY:"lasso", learnD:"lasso", K:5, S:3, trees:200 });
  const [out,setOut]=useState(null); const [busy,setBusy]=useState(""); const [prog,setProg]=useState(null);
  const resRef=useRef(null); useEffect(()=>{ if (isMobile && out && resRef.current) resRef.current.scrollIntoView({behavior:"smooth",block:"start"}); },[out, isMobile]);
  const set=(k,v)=>setCfg(c=>({...c,[k]:v}));
  const load=(parsed, name, extra={})=>{ if (parsed.error){ setFileErr(parsed.error); return; } setFileErr(""); setOut(null); const h=parsed.headers;
    const y=extra.y||h.find(x=>/^(y|outcome)$|earn|wage|income|outcome|growth/i.test(x))||h[0]; const d=extra.d||h.find(x=>x!==y&&/^(d|treat|treated|treatment|policy|program)$/i.test(x))||h.find(x=>x!==y)||h[1];
    setData({ ...parsed, name, ...extra }); setCfg(c=>({ ...c, y, d, treatValue:"", covs:h.filter(x=>x!==y&&x!==d) })); };
  useEffect(()=>{ if (incoming?.table) load(incoming.table, incoming.name); },[incoming?.id]);
  const onFile=(f)=>{ if(!f) return; if (f.size>25*1024*1024){ setFileErr("File is larger than 25 MB."); return; } const r=new FileReader(); r.onload=()=>load(ciParseCSV(String(r.result)), f.name); r.readAsText(f); };
  const H=data?.headers||[];
  const dVals=useMemo(()=>{ if(!data||!cfg.d) return []; const i=H.indexOf(cfg.d); return [...new Set(data.rows.map(r=>String(r[i]??"").trim()))].filter(Boolean).slice(0,12); },[data,cfg.d]);
  const dNumeric = dVals.every(v=>!isNaN(parseFloat(v))); const needTreatValue = dVals.length>0 && !dNumeric;
  const run=()=>{ if (!data) return; setBusy("Preparing data…"); setOut(null); setProg(null);
    setTimeout(async ()=>{ try{
      const ix=Object.fromEntries(H.map((h,i)=>[h,i])); const num=(v)=>{ const s=String(v??"").trim(); if(!s||/^(na|nan|null|\.|-)$/i.test(s)) return NaN; return parseFloat(s.replace(/[$,%\s]/g,"")); };
      // design: numeric covariates as is, categorical as dummies (first level dropped)
      const covInfo=cfg.covs.map(c=>{ const vals=data.rows.map(r=>r[ix[c]]); const isNum=vals.filter(v=>String(v??"").trim()!=="").every(v=>!isNaN(num(v))); return { c, isNum, levels: isNum? null : [...new Set(vals.map(v=>String(v??"").trim()).filter(Boolean))].sort().slice(1) }; });
      const names=covInfo.flatMap(ci=>ci.isNum? [ci.c] : ci.levels.map(l=>`${ci.c}=${l}`)); let Y=[], D=[], X=[]; let dropped=0;
      data.rows.forEach(r=>{ const y=num(r[ix[cfg.y]]); const dr=String(r[ix[cfg.d]]??"").trim(); const d = needTreatValue? (dr? (dr===(cfg.treatValue||dVals[0])?1:0) : NaN) : num(dr);
        const x=covInfo.flatMap(ci=>ci.isNum? [num(r[ix[ci.c]])] : ci.levels.map(l=>String(r[ix[ci.c]]??"").trim()===l?1:0));
        if (!isFinite(y)||!isFinite(d)||x.some(v=>!isFinite(v))){ dropped++; return; } Y.push(y); D.push(d); X.push(x); });
      if (Y.length<30){ setOut({ error:"Fewer than 30 complete rows. Check the variable choices and missing values." }); setBusy(""); return; }
      let nm=names; const keep=nm.map((_,j)=>ciVarS(X.map(x=>x[j]))>1e-12); X=X.map(x=>x.filter((_,j)=>keep[j])); nm=nm.filter((_,j)=>keep[j]);
      if (cfg.expand){ const e=mePolyExpand(X, nm, 2, 600); X=e.X; nm=e.names; }
      const n=Y.length, p=nm.length; const binary=D.every(v=>v===0||v===1); const rows=[]; const res={ n, p, binary, dropped, rows, notes:[], D };
      // benchmarks
      const naive=meOLS(D.map(v=>[1,v]), Y); rows.push({ ...meResult("Naive regression (no controls)", "—", naive.beta[1], naive.se[1]), group:"bench" });
      if (p < n-5){ const full=meOLS(X.map((x,i)=>[1,D[i],...x]), Y); rows.push({ ...meResult(`OLS with all ${p} controls`, "—", full.beta[1], full.se[1]), group:"bench", note: p>n/5? "Many controls relative to n: unbiased under linearity but imprecise and prone to overfitting." : null }); }
      else res.notes.push(`OLS with all ${p} controls is not identified (p ≥ n). Selection or regularisation is required.`);
      if (cfg.pds){ setBusy("Post-double-selection lasso…"); await new Promise(r=>setTimeout(r,10)); const r=mePDS(Y,D,X,nm); res.pds=r;
        res.rv=meRobustnessValue(r.ols.beta[1]/Math.sqrt(r.ols.sigma2*r.ols.XtXinv[1][1]), r.ols.n-r.ols.k);
        rows.push({ ...meResult("Post-double-selection lasso (Belloni, Chernozhukov & Hansen 2014)", "β", r.est, r.se), headline:true, note:`${r.selected.length} control(s) kept: ${r.nY} from the outcome lasso, ${r.nD} from the treatment lasso (union). Heteroskedasticity-robust SE.` }); }
      if (cfg.po){ const r=mePO(Y,D,X); rows.push({ ...meResult("Partialling-out lasso", "β", r.est, r.se), note:"Residualises Y and D on their own post-lasso fits, then regresses residual on residual." }); }
      const forest={ nTrees:cfg.trees, minLeaf:5 };
      const runDML=async (model, score)=>{ const t0=Date.now(); const r=await meDML(Y,D,X,{ model, score, K:cfg.K, S:cfg.S, seed:2026, learnY:cfg.learnY, learnD:cfg.learnD, forest, onProgress:(k,N)=>setProg({ k, n:N, label: model==="plr"? "DML partially linear model" : `DML interactive model (${score})` }) });
        res.dml=res.dml||{}; res.dml[model]=r; const lab=`${ME_LEARNERS[cfg.learnY].label} / ${ME_LEARNERS[cfg.learnD].label}`;
        rows.push({ ...meResult(model==="plr"? "DML: partially linear model" : `DML: interactive model, ${score==="ATE"?"ATE":"ATT"}`, model==="plr"? "θ" : score==="ATE"? "ATE" : "ATT", r.theta, r.se),
          note:`${cfg.K}-fold cross-fitting × ${cfg.S} split${cfg.S>1?"s":""} (median aggregation). Learners: ${lab}. ${((Date.now()-t0)/1000).toFixed(1)} s.` }); };
      if (cfg.plr){ await runDML("plr"); }
      if (cfg.irm && binary){ await runDML("irm", cfg.score); } else if (cfg.irm) res.notes.push("The interactive (IRM) model needs a 0/1 treatment; it was skipped.");
      setProg(null); setOut(res); setBusy("");
    }catch(e){ console.error(e); setOut({ error:"The analysis failed: "+e.message }); setBusy(""); setProg(null); } }, 30); };
  const fmt=(v)=>ciFmt(v, Math.abs(v)<10? 4 : 2);
  const exportCSV=()=>{ if (!out?.rows) return; dlCSV(out.rows.map(r=>({ method:r.method, estimate:r.est, se:r.se, ci_low:r.lo, ci_high:r.hi, p_value:r.p })), "ecoscope_highdim_estimates.csv");
    if (out.pds) dlCSV(out.pds.selected.map(s=>({ control:s.name, selected_by_outcome_lasso:s.byY?1:0, selected_by_treatment_lasso:s.byD?1:0 })), "ecoscope_pds_selected_controls.csv"); };
  return (
    <div style={{display:"grid",gridTemplateColumns:isMobile?"minmax(0,1fr)":"320px minmax(0,1fr)",gap:16,alignItems:"start"}}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <LabSec title="1. Data" sub="Unit-level data with an outcome, a treatment and many candidate controls.">
          <input id="hd-file" type="file" accept=".csv,.tsv,.txt" onChange={e=>onFile(e.target.files?.[0])} style={{display:"none"}}/>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <label htmlFor="hd-file" style={{...btn(C.gold),display:"inline-flex",alignItems:"center",gap:6,fontSize:12,padding:"8px 14px"}}><Ico n="file"/> Upload CSV</label>
            <button type="button" onClick={()=>{ const d=meDMLDemo(); load(d, d.name, { trueTheta:d.trueTheta, note:d.note, y:"y", d:"d" }); }} style={{...pill(false),padding:"8px 12px",fontSize:12}}>Load demo data</button>
            {imported&&<button type="button" onClick={()=>load({ headers:imported.headers, rows:imported.rows }, imported.name)} style={{...pill(false),padding:"8px 12px",fontSize:12}}>Use EcoScope import</button>}
          </div>
          {fileErr&&<div style={{marginTop:8}}><LabNote tone="bad">{fileErr}</LabNote></div>}
          {data&&<div style={{marginTop:10,fontSize:12,color:C.mid}}><b style={{color:C.text}}>{data.name}</b> · {data.rows.length.toLocaleString()} rows · {H.length} columns{data.note&&<div style={{marginTop:6,color:C.dim,lineHeight:1.5}}>{data.note}</div>}</div>}
        </LabSec>
        {data&&<LabSec title="2. Model">
          <LabField label="Outcome (Y)"><select value={cfg.y} onChange={e=>set("y",e.target.value)} style={sel}>{H.map(h=><option key={h} value={h}>{h}</option>)}</select></LabField>
          <LabField label="Treatment (D)" hint="binary or continuous"><select value={cfg.d} onChange={e=>{ set("d",e.target.value); set("treatValue",""); }} style={sel}>{H.map(h=><option key={h} value={h}>{h}</option>)}</select></LabField>
          {needTreatValue&&<LabField label="Treated value"><select value={cfg.treatValue||dVals[0]} onChange={e=>set("treatValue",e.target.value)} style={sel}>{dVals.map(v=><option key={v} value={v}>{v}</option>)}</select></LabField>}
          <LabField group label="Candidate controls (X)" hint={`${cfg.covs.length} selected`}>
            <div style={{display:"flex",gap:6,marginBottom:6}}><button type="button" onClick={()=>set("covs",H.filter(h=>h!==cfg.y&&h!==cfg.d))} style={{...pill(false),padding:"4px 8px",fontSize:11}}>All</button><button type="button" onClick={()=>set("covs",[])} style={{...pill(false),padding:"4px 8px",fontSize:11}}>None</button></div>
            <div style={{maxHeight:180,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px"}}>{H.filter(h=>h!==cfg.y&&h!==cfg.d).map(h=><Check key={h} checked={cfg.covs.includes(h)} onChange={v=>set("covs", v? [...cfg.covs,h] : cfg.covs.filter(x=>x!==h))} label={h}/>)}</div>
          </LabField>
          <div style={{fontSize:11,color:C.dim,marginTop:-4,marginBottom:8,lineHeight:1.5}}>Use only pre-treatment variables. These methods choose among controls; they do not fix bad controls or unmeasured confounding.</div>
          <Check checked={cfg.expand} onChange={v=>set("expand",v)} label="Add squares and pairwise interactions" sub="Flexible functional form; capped at 600 columns"/>
        </LabSec>}
        {data&&<LabSec title="3. Estimators">
          <Check checked={cfg.pds} onChange={v=>set("pds",v)} label="Post-double-selection lasso" sub="BCH plug-in penalty (as R hdm::rlassoEffect)"/>
          <Check checked={cfg.po} onChange={v=>set("po",v)} label="Partialling-out lasso"/>
          <Check checked={cfg.plr} onChange={v=>set("plr",v)} label="Double ML: partially linear model" sub="Y = θD + g(X) + ε; any treatment"/>
          <Check checked={cfg.irm} onChange={v=>set("irm",v)} label="Double ML: interactive model" sub="Heterogeneous effects; binary treatment"/>
          {cfg.irm&&<div style={{paddingLeft:24,display:"flex",gap:6,marginBottom:6}}>{[["ATE","ATE"],["ATTE","ATT"]].map(([k,l])=><button key={k} type="button" onClick={()=>set("score",k)} style={{...pill(cfg.score===k),padding:"5px 10px"}}>{l}</button>)}</div>}
          {(cfg.plr||cfg.irm)&&<>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:6}}>
              <LabField label="Learner for Y"><select value={cfg.learnY} onChange={e=>set("learnY",e.target.value)} style={{...sel,padding:"7px"}}>{Object.entries(ME_LEARNERS).map(([k,l])=><option key={k} value={k}>{l.label}</option>)}</select></LabField>
              <LabField label="Learner for D"><select value={cfg.learnD} onChange={e=>set("learnD",e.target.value)} style={{...sel,padding:"7px"}}>{Object.entries(ME_LEARNERS).map(([k,l])=><option key={k} value={k}>{l.label}</option>)}</select></LabField>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              <LabField label="Folds"><select value={cfg.K} onChange={e=>set("K",+e.target.value)} style={{...sel,padding:"7px"}}>{[2,3,5,10].map(k=><option key={k} value={k}>{k}</option>)}</select></LabField>
              <LabField label="Splits"><select value={cfg.S} onChange={e=>set("S",+e.target.value)} style={{...sel,padding:"7px"}}>{[1,3,5,10].map(k=><option key={k} value={k}>{k}</option>)}</select></LabField>
              <LabField label="Trees"><select value={cfg.trees} onChange={e=>set("trees",+e.target.value)} style={{...sel,padding:"7px"}} disabled={cfg.learnY!=="forest"&&cfg.learnD!=="forest"}>{[100,200,500].map(k=><option key={k} value={k}>{k}</option>)}</select></LabField>
            </div>
          </>}
          <button type="button" onClick={run} disabled={!!busy||!cfg.covs.length||cfg.y===cfg.d} style={{...btn(C.gold),width:"100%",marginTop:8,opacity:busy?0.55:1}}>{busy? "Estimating…" : "Run analysis"}</button>
        </LabSec>}
      </div>
      <div ref={resRef} style={{display:"flex",flexDirection:"column",gap:12,minWidth:0}}>
        {!out&&!busy&&<LabSec title="Many controls: double machine learning and double selection" sub="Chernozhukov et al. (2018); Belloni, Chernozhukov & Hansen (2014)">
          <div style={{fontSize:13,color:C.mid,lineHeight:1.7}}>When there are more candidate controls than you can include by hand, selecting them on the outcome alone can drop confounders and give falsely precise answers. Double selection keeps every control that predicts either the outcome or the treatment. Double machine learning uses flexible learners for both, with orthogonal scores and cross-fitting so that learner errors do not bias the effect.
            <div style={{marginTop:10}}><LabNote>Both still assume selection on observables (no unmeasured confounding) and overlap. They help choose and model controls; they cannot create identification that the data do not have.</LabNote></div></div>
        </LabSec>}
        {(busy||prog)&&<LabSec title="Working…"><div role="status" style={{fontSize:12,color:C.mid}}>{prog? `${prog.label}: fold ${prog.k} of ${prog.n}` : busy}</div></LabSec>}
        {out?.error&&<LabNote tone="bad">{out.error}</LabNote>}
        {out?.rows&&<>
          {out.notes.map((n,i)=><LabNote key={i} tone="warn">{n}</LabNote>)}
          <LabSec title="Estimates" sub={`${out.n.toLocaleString()} observations · ${out.p} candidate controls${out.dropped?` · ${out.dropped} rows dropped for missing values`:""} · ${out.binary? "binary" : "continuous"} treatment`}
            right={<button type="button" onClick={exportCSV} style={{...pill(false),display:"inline-flex",gap:6,alignItems:"center"}}><Ico n="file"/> Export CSV</button>}>
            <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Method","Estimate","SE","95% CI","p"].map((h,i)=><th key={h} scope="col" style={{...thS,textAlign:i?"right":"left"}}>{h}</th>)}</tr></thead>
              <tbody>{out.rows.map((r,i)=><tr key={i} style={{background:r.headline?`${C.gold}12`:"transparent"}}><td style={{...tdS,whiteSpace:"normal",minWidth:230,color:r.group==="bench"?C.mid:C.text,fontWeight:r.headline?600:400}}>{r.method}{r.note&&<div style={{fontSize:11,color:C.dim,fontWeight:400,marginTop:2}}>{r.note}</div>}</td>
                <td style={{...tdN,fontWeight:600}}>{fmt(r.est)}</td><td style={tdN}>{fmt(r.se)}</td><td style={tdN}>[{fmt(r.lo)}, {fmt(r.hi)}]</td><td style={tdN}>{ciFmtP(r.p)}</td></tr>)}</tbody></table></div>
            <div style={{marginTop:12}}><ForestPlot results={out.rows.map(r=>({ ...r, method:r.method.replace(" (Belloni, Chernozhukov & Hansen 2014)","") }))}/></div>
            {data?.trueTheta!=null&&<div style={{fontSize:12,color:C.text,marginTop:6}}><b>Demo:</b> the true effect is {data.trueTheta}.</div>}
            <div style={{fontSize:11,color:C.dim,marginTop:6,lineHeight:1.6}}>Grey rows are benchmarks. If the double-selection and DML estimates agree with each other but not with the naive regression, the controls matter and are being handled. A large gap between DML learners suggests the nuisance functions are hard to learn; check the fit diagnostics below.</div>
          </LabSec>
          {out.pds&&<div style={{display:"grid",gridTemplateColumns:isMobile?"minmax(0,1fr)":"minmax(0,1.2fr) minmax(0,1fr)",gap:12}}>
            <LabSec title="Controls selected by double selection" sub="Y: predicts the outcome · D: predicts the treatment. Only the union enters the final regression.">
              {out.pds.selected.length? <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{out.pds.selected.map(s=><span key={s.name} style={{border:`1px solid ${C.border}`,borderRadius:4,padding:"3px 8px",fontSize:12,color:C.text,background:C.raised}}>{s.name} <span style={{color:C.mid,fontSize:11}}>{[s.byY&&"Y",s.byD&&"D"].filter(Boolean).join("+")}</span></span>)}</div>
                : <div style={{fontSize:12,color:C.dim}}>No control passed the penalty in either equation, so the final regression has no controls.</div>}
              <div style={{fontSize:11,color:C.dim,marginTop:8,lineHeight:1.55}}>Controls picked only by the treatment lasso are the ones a single outcome-only selection would have dropped; leaving them out is the omitted-variable bias double selection prevents.</div>
            </LabSec>
            {out.rv&&<LabSec title="Sensitivity to an unobserved confounder" sub="Cinelli & Hazlett (2020), final double-selection regression">
              <div style={{fontSize:13,color:C.text,lineHeight:1.7}}>Robustness value: <b>{(100*out.rv.rv).toFixed(1)}%</b> · at 5% significance: <b>{(100*out.rv.rvAlpha).toFixed(1)}%</b></div>
              <div style={{fontSize:11,color:C.dim,marginTop:6,lineHeight:1.55}}>An omitted confounder would have to explain at least this share of the residual variance of both the treatment and the outcome to remove the effect (or its significance).</div>
            </LabSec>}
          </div>}
          {out.dml&&<LabSec title="DML diagnostics" sub="Out-of-fold fit of the nuisance functions (first split)">
            <div style={{display:"grid",gridTemplateColumns:isMobile?"minmax(0,1fr)":"repeat(2,minmax(0,1fr))",gap:12}}>
              {Object.entries(out.dml).map(([k,r])=><div key={k} style={{border:`1px solid ${C.border}`,borderRadius:6,padding:"10px 12px",fontSize:12,color:C.text,lineHeight:1.65}}>
                <div style={{fontWeight:600,marginBottom:4}}>{k==="plr"? "Partially linear" : "Interactive"}</div>
                <div>Outcome model RMSE: {ciFmt(r.diag.lossY[0],4)}</div>
                <div>{r.binaryD||k==="irm"? `Treatment model log-loss: ${ciFmt(r.diag.lossD[0],4)}` : `Treatment model RMSE: ${ciFmt(r.diag.lossD[0],4)}`}</div>
                {r.reps.length>1&&<div>Estimates across splits: {ciFmt(Math.min(...r.reps.map(x=>x.theta)),4)} to {ciFmt(Math.max(...r.reps.map(x=>x.theta)),4)}</div>}
                {k==="irm"&&r.diag.nTrim>0&&<div style={{color:C.orange}}>{r.diag.nTrim} propensity score(s) clipped to [0.01, 0.99]: overlap is thin.</div>}
              </div>)}
            </div>
            {out.dml.irm?.diag?.ps&&<div style={{marginTop:12}}><div style={{fontSize:12,color:C.mid,marginBottom:4}}>Cross-fitted propensity scores</div><OverlapPlot ps={out.dml.irm.diag.ps} d={out.D} lo={NaN} hi={NaN}/></div>}
          </LabSec>}
        </>}
      </div>
    </div>
  );
}

// <<< RESEARCH METHODS UI <<<

const METHOD_CARDS = [
  ["Choosing a design", "Selection on observables (you can name every confounder): matching, weighting, DML. A policy adopted by many units at known dates: difference-in-differences and event studies. One treated country or region: synthetic control or synthetic DiD. Unobserved confounding with a valid instrument or a cutoff: IV or regression discontinuity (not yet in EcoScope)."],
  ["Identification for matching", "Conditional independence (Y⁰, Y¹) ⊥ D | X and common support 0 < P(D=1|X) < 1. For the ATT only Y⁰ ⊥ D | X and P(D=1|X) < 1 are needed. CIA is assumed, not tested; overlap and balance are checked."],
  ["Matching estimators", "Nearest-neighbour matching (Mahalanobis or normalized Euclidean) with Abadie–Imbens (2006) SEs and bias correction (2011). Propensity-score matching SEs include the Abadie–Imbens (2016) correction for the estimated score. Subclassification, CEM (Iacus, King & Porro 2012)."],
  ["Weighting", "Normalized (Hájek) IPW, with bootstrap or sandwich (M-estimation) SEs that account for the estimated propensity score, and doubly robust AIPW. Trim to [0.1, 0.9] when overlap is poor (Crump et al. 2009)."],
  ["Missing covariates", "Multiple imputation by chained equations with predictive mean matching (van Buuren 2018), M datasets, pooled with Rubin's rules and Barnard–Rubin degrees of freedom. Single mean imputation is kept only as a quick check: it understates uncertainty."],
  ["Sensitivity to hidden confounding", "Cinelli & Hazlett (2020) robustness value: the share of residual variance of both treatment and outcome an omitted confounder must explain to remove the estimate (or its significance)."],
  ["Difference-in-differences", "Compares changes in treated and comparison units. Requires parallel trends, no anticipation, no spillovers and an absorbing treatment. Standard errors are clustered by unit (Bertrand, Duflo & Mullainathan 2004)."],
  ["Staggered adoption", "With different adoption dates and effects that change over time, static TWFE mixes in comparisons with already-treated units (Goodman-Bacon 2021) and can even flip sign. EcoScope reports Callaway & Sant'Anna (2021) group-time ATTs with never- or not-yet-treated controls and the imputation estimator of Borusyak, Jaravel & Spiess (2024), with TWFE as a benchmark and the Bacon decomposition as a diagnostic."],
  ["Event studies and pre-trends", "Effects by years since adoption with pointwise CIs and a simultaneous band from the multiplier bootstrap. Pre-period estimates near zero support parallel trends but a pre-test is not a gate (Roth 2022). The relative-magnitudes bounds (Rambachan & Roth 2023) show how large a violation would overturn the result."],
  ["Synthetic control", "One treated aggregate unit; non-negative weights that sum to one, so no extrapolation. Predictor weights V by pre-period fit or by cross-validation (Abadie 2021). Inference from in-space placebos (RMSPE ratio rank), plus leave-one-out, backdating and a convex-hull check."],
  ["Synthetic DiD and penalized SC", "Synthetic DiD (Arkhangelsky et al. 2021) adds unit and time weights and a level shift; it reproduces the published Proposition 99 estimate of −15.6. Penalized SC (Abadie & L'Hour 2021) gives unique, sparse weights. Placebo SEs re-estimate the weights for each placebo."],
  ["Many controls", "Post-double-selection lasso (Belloni, Chernozhukov & Hansen 2014) keeps every control that predicts the outcome or the treatment, then runs OLS with robust SEs. Double/debiased ML (Chernozhukov et al. 2018) fits outcome and treatment with lasso or random forests, uses Neyman-orthogonal scores and K-fold cross-fitting, and aggregates repeated splits by the median."],
  ["Causal graphs (DAG)", "Adjustment sets come from d-separation: EcoScope lists every minimal set satisfying the back-door criterion, flags bad controls (colliders, descendants of X) and checks the front-door criterion. The graph's testable implications are tested on the data."],
  ["Causal discovery", "Series are differenced until an ADF test rejects a unit root, then the PC-stable algorithm (Fisher-z tests) finds the skeleton and v-structures; Granger F-tests (lag order by BIC) orient remaining edges. With annual data these tests have low power, so results are hypotheses."],
];
const MethodsGuide = () => (
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12}}>
    {METHOD_CARDS.map(([t,b])=><div key={t} style={{...card,padding:"14px 16px"}}><div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:6}}>{t}</div><div style={{fontSize:12,color:C.mid,lineHeight:1.65}}>{b}</div></div>)}
    <div style={{...card,padding:"14px 16px",gridColumn:"1 / -1"}}><div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:6}}>Validation</div>
      <div style={{fontSize:12,color:C.mid,lineHeight:1.7}}>Each estimator was checked against the reference implementation: Callaway–Sant'Anna against R did (mpdta, 8 specifications, identical to 5 decimals); imputation against R didimputation; TWFE and event studies against fixest; the Bacon decomposition against bacondecomp; synthetic DiD, SC and DiD against the published Proposition 99 results; double selection and partialling out against R hdm (Barro–Lee growth data); DML against Python DoubleML; ADF and Granger tests against statsmodels.</div></div>
    <div style={{...card,padding:"14px 16px",gridColumn:"1 / -1"}}><div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:6}}>Sources</div>
      <div style={{fontSize:12,color:C.mid,lineHeight:1.7}}>Abadie & Gardeazabal (2003); Abadie, Diamond & Hainmueller (2010); Abadie (2021, JEL); Abadie & L'Hour (2021); Abadie & Imbens (2006, 2011, 2016); Arkhangelsky, Athey, Hirshberg, Imbens & Wager (2021); Belloni, Chernozhukov & Hansen (2014); Borusyak, Jaravel & Spiess (2024); Callaway & Sant'Anna (2021); Chernozhukov et al. (2018); Cinelli & Hazlett (2020); Colombo & Maathuis (2014); Crump, Hotz, Imbens & Mitnik (2009); Goodman-Bacon (2021); Iacus, King & Porro (2012); Lunceford & Davidian (2004); Pearl (2009); Rambachan & Roth (2023); Roth (2022); Rubin (1987); Sant'Anna & Zhao (2020); van Buuren (2018). Teaching sources: DeAngelo, "Matching" (CGU); Blackwell (2015); Cunningham, <a href="https://mixtape.scunning.com/" target="_blank" rel="noreferrer">Causal Inference: The Mixtape</a>.</div></div>
  </div>
);

// ══════════════════════════════════════════════
// DATA STRUCTURING: detect cross-section / time series / panel, then reshape
// ══════════════════════════════════════════════
// Parse a cell or header as a time value. Returns {t, label, freq} or null.
const dsParseTime = (v) => {
  const s = String(v ?? "").trim(); if (!s) return null;
  let m;
  if ((m = s.match(/^(1[89]\d\d|20\d\d)(?:\s*\[YR\d{4}\])?$/))) return { t: +m[1], label: m[1], freq: "annual" };
  if ((m = s.match(/^YR(1[89]\d\d|20\d\d)$/i))) return { t: +m[1], label: m[1], freq: "annual" };
  if ((m = s.match(/^(1[89]\d\d|20\d\d)\s*[-_ ]?\s*Q([1-4])$/i)) || (m = s.match(/^Q([1-4])\s*[-_ ]?\s*(1[89]\d\d|20\d\d)$/i))) {
    const y = +(m[1].length === 4 ? m[1] : m[2]), q = +(m[1].length === 4 ? m[2] : m[1]); return { t: y + (q - 1) / 4, label: `${y}-Q${q}`, freq: "quarterly" }; }
  if ((m = s.match(/^(1[89]\d\d|20\d\d)[-/M](0?[1-9]|1[0-2])$/))) return { t: +m[1] + (+m[2] - 1) / 12, label: `${m[1]}-${String(+m[2]).padStart(2, "0")}`, freq: "monthly" };
  if ((m = s.match(/^(1[89]\d\d|20\d\d)-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/))) { const d = new Date(+m[1], +m[2] - 1, +m[3]); if (!isNaN(d)) return { t: d.getTime() / 864e5, label: `${m[1]}-${String(+m[2]).padStart(2, "0")}-${String(+m[3]).padStart(2, "0")}`, freq: "daily" }; }
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { const d = new Date(+m[3], +m[1] - 1, +m[2]); if (!isNaN(d)) return { t: d.getTime() / 864e5, label: d.toISOString().slice(0, 10), freq: "daily" }; }
  return null;
};
const dsNum = (v) => { const s = String(v ?? "").trim(); if (!s || /^(na|n\/a|nan|null|\.|-|\.\.)$/i.test(s)) return null; const n = parseFloat(s.replace(/[$,%\s]/g, "")); return isFinite(n) && /^[-+]?[$]?\d|^[-+]?\.\d/.test(s.replace(/\s/g, "")) ? n : null; };
const DS_TIME_HINT = /^(year|yr|date|time|period|quarter|month|day|t)$|year|date|period|quarter|month/i;
const DS_UNIT_HINT = /country|state|province|region|district|unit|^id$|_id$|^iso|code|name|firm|company|household|person|respondent|school|county|city|entity|economy/i;
const DS_VAR_HINT = /^(variable|indicator|series|measure|var|item|series name|indicator name)$|indicator|series name|variable/i;
const DS_VAL_HINT = /^(value|val|obs|observation|amount)$/i;
const DS_COUNTRY_SET = new Set(COUNTRIES.flatMap(c => [c.name.toLowerCase(), c.code.toLowerCase(), (ISO3[c.code] || "").toLowerCase()]).filter(Boolean));

// Profile each column
const dsProfile = (headers, rows) => headers.map((h, j) => {
  const vals = rows.map(r => r[j]).filter(v => v != null && String(v).trim() !== "");
  const n = vals.length || 1; const uniq = new Set(vals.map(v => String(v).trim()));
  const nNum = vals.filter(v => dsNum(v) != null).length; const tm = vals.map(dsParseTime).filter(Boolean);
  const freqs = {}; tm.forEach(x => freqs[x.freq] = (freqs[x.freq] || 0) + 1); const freq = Object.entries(freqs).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const countryShare = [...uniq].filter(u => DS_COUNTRY_SET.has(u.toLowerCase())).length / (uniq.size || 1);
  return { name: h, j, n: vals.length, uniq: uniq.size, numShare: nNum / n, timeShare: tm.length / n, freq, countryShare, headerTime: dsParseTime(h) };
});

// Automatic detection. Returns a spec that dsToTidy understands plus a human explanation.
const dsDetect = (headers, rows) => {
  const P = dsProfile(headers, rows); const N = rows.length; const reasons = [];
  const timeHeaders = P.filter(p => p.headerTime);
  // A. wide by time: many headers are years/quarters
  if (timeHeaders.length >= 3) {
    const ids = P.filter(p => !p.headerTime);
    const varCol = ids.find(p => DS_VAR_HINT.test(p.name)) || null;
    const unitCol = ids.filter(p => p !== varCol && p.numShare < 0.5).sort((a, b) => (DS_UNIT_HINT.test(b.name) - DS_UNIT_HINT.test(a.name)) || (b.countryShare - a.countryShare) || (b.uniq - a.uniq))[0] || null;
    const nUnits = unitCol ? unitCol.uniq : 1;
    reasons.push(`${timeHeaders.length} column headers are time periods (${timeHeaders[0].name} … ${timeHeaders[timeHeaders.length - 1].name}), so the table is wide by time.`);
    if (unitCol) reasons.push(`"${unitCol.name}" identifies ${nUnits} unit${nUnits === 1 ? "" : "s"}.`);
    if (varCol) reasons.push(`"${varCol.name}" names the variable in each row.`);
    return { layout: "wideTime", unitCol: unitCol?.name || "", varCol: varCol?.name || "", timeCols: timeHeaders.map(p => p.name), type: nUnits > 1 ? "panel" : "timeseries", freq: timeHeaders[0].headerTime.freq, reasons, profile: P };
  }
  // B. a time column
  const timeCol = P.filter(p => p.timeShare >= 0.9 && p.n > 0).sort((a, b) => (DS_TIME_HINT.test(b.name) - DS_TIME_HINT.test(a.name)) || (b.timeShare - a.timeShare) || (a.uniq - b.uniq))[0] || null;
  const valueCols = P.filter(p => p !== timeCol && p.numShare >= 0.8);
  let unitCol = P.filter(p => p !== timeCol && (p.numShare < 0.5 || (DS_UNIT_HINT.test(p.name) && p.uniq < N)) && !DS_VAR_HINT.test(p.name))
                 .sort((a, b) => (DS_UNIT_HINT.test(b.name) - DS_UNIT_HINT.test(a.name)) || (b.countryShare - a.countryShare) || (b.uniq - a.uniq))[0] || null;
  const varCol = P.find(p => p !== timeCol && p !== unitCol && DS_VAR_HINT.test(p.name) && p.numShare < 0.5) || null;
  const valCol = varCol ? (P.find(p => DS_VAL_HINT.test(p.name) && p.numShare >= 0.8) || valueCols.find(p => p !== unitCol) || null) : null;
  if (timeCol) {
    reasons.push(`"${timeCol.name}" holds ${timeCol.freq || "time"} values in ${Math.round(timeCol.timeShare * 100)}% of rows.`);
    const nT = timeCol.uniq;
    // wide by unit: time column plus columns named after countries/units
    const unitNamedCols = valueCols.filter(p => DS_COUNTRY_SET.has(p.name.trim().toLowerCase()));
    if (!unitCol && unitNamedCols.length >= 3 && unitNamedCols.length >= valueCols.length * 0.6) {
      reasons.push(`${unitNamedCols.length} value columns are named after countries, so the table is wide by unit.`);
      return { layout: "wideUnit", timeCol: timeCol.name, unitCols: unitNamedCols.map(p => p.name), varName: "value", type: "panel", freq: timeCol.freq, reasons, profile: P };
    }
    if (unitCol) {
      const nU = unitCol.uniq; const ti = headers.indexOf(timeCol.name), ui = headers.indexOf(unitCol.name);
      const pairs = new Set(rows.map(r => `${r[ui]}|${r[ti]}`)); const dup = rows.length - pairs.size;
      reasons.push(`"${unitCol.name}" identifies ${nU} unit${nU === 1 ? "" : "s"}${unitCol.countryShare > 0.5 ? " (mostly country names or codes)" : ""}.`);
      if (varCol) reasons.push(`"${varCol.name}" and "${valCol?.name}" hold variable names and values (long format).`);
      let type = nU > 1 && nT > 1 ? "panel" : nU > 1 ? "cross" : "timeseries";
      if (dup > 0 && !varCol) reasons.push(`${dup} unit-period combination${dup === 1 ? " appears" : "s appear"} more than once.`);
      return { layout: varCol ? "longlong" : "long", timeCol: timeCol.name, unitCol: unitCol.name, varCol: varCol?.name || "", valCol: valCol?.name || "", type, freq: timeCol.freq, reasons, profile: P };
    }
    const repeats = N - nT;
    if (repeats > N * 0.2) { reasons.push(`Time values repeat (${N} rows, ${nT} distinct periods) and no unit column was found: repeated cross-sections (each row is a different unit).`);
      return { layout: "long", timeCol: timeCol.name, unitCol: "", rowUnits: true, type: "pooled", freq: timeCol.freq, reasons, profile: P }; }
    reasons.push("No unit column, one row per period: a single time series.");
    return { layout: "long", timeCol: timeCol.name, unitCol: "", type: "timeseries", freq: timeCol.freq, reasons, profile: P };
  }
  reasons.push("No column or header looks like time, so each row is one unit observed once.");
  // in a cross-section the identifier is unique on every row
  const idCol = P.filter(p => p.uniq === N && p.n === N).sort((a, b) => (DS_UNIT_HINT.test(b.name) - DS_UNIT_HINT.test(a.name)) || (a.numShare - b.numShare))[0] || null;
  if (idCol) reasons.push(`"${idCol.name}" is unique on every row, so it identifies the units.`); else reasons.push("No column is unique on every row, so rows are numbered as units.");
  return { layout: "long", timeCol: "", unitCol: idCol?.name || "", type: "cross", reasons, profile: P };
};

// Convert any supported layout to tidy records {unit, t, tl, v, val}
const dsToTidy = (headers, rows, spec) => {
  const ix = Object.fromEntries(headers.map((h, i) => [h, i])); const out = []; const tLab = {};
  const T = (raw) => { const p = dsParseTime(raw); if (p) { tLab[p.t] = p.label; return p.t; } const s = String(raw ?? "").trim(); return s ? s : null; };
  const val = (raw) => { const n = dsNum(raw); return n != null ? n : (String(raw ?? "").trim() || null); };
  const unitOf = (r) => spec.unitCol ? String(r[ix[spec.unitCol]] ?? "").trim() : (spec.singleUnit || "All");
  if (spec.layout === "wideTime") {
    const tcols = spec.timeCols.map(c => ({ c, t: T(c) }));
    rows.forEach(r => { const u = unitOf(r); if (!u) return; const v = spec.varCol ? String(r[ix[spec.varCol]] ?? "").trim() || "value" : (spec.varName || "value");
      tcols.forEach(({ c, t }) => out.push({ unit: u, t, v, val: val(r[ix[c]]) })); });
  } else if (spec.layout === "wideUnit") {
    rows.forEach(r => { const t = T(r[ix[spec.timeCol]]); if (t == null) return; spec.unitCols.forEach(c => out.push({ unit: c, t, v: spec.varName || "value", val: val(r[ix[c]]) })); });
  } else if (spec.layout === "longlong") {
    rows.forEach(r => { const u = unitOf(r); const t = spec.timeCol ? T(r[ix[spec.timeCol]]) : "—"; const v = String(r[ix[spec.varCol]] ?? "").trim(); if (!u || t == null || !v) return; out.push({ unit: u, t, v, val: val(r[ix[spec.valCol]]) }); });
  } else {
    const skip = new Set([spec.unitCol, spec.timeCol].filter(Boolean)); const vcols = headers.filter(h => !skip.has(h));
    rows.forEach((r, i) => { const u = spec.unitCol ? unitOf(r) : (spec.timeCol && !spec.rowUnits ? (spec.singleUnit || "All") : `row ${i + 1}`); const t = spec.timeCol ? T(r[ix[spec.timeCol]]) : "—"; if (!u || t == null) return;
      vcols.forEach(c => out.push({ unit: u, t, v: c, val: val(r[ix[c]]) })); });
  }
  Object.keys(tLab).forEach(k => tLab[k] = tLab[k]);
  return dsSummarize(out, tLab);
};
// Tidy from EcoScope basket panels: panels = [{name, data:{ISO2:{year:value}}}]
const dsFromPanels = (panels, codes, y0, y1) => {
  const out = []; const tLab = {};
  codes.forEach(c => { const nm = COUNTRIES.find(x => x.code === c)?.name || c;
    for (let y = y0; y <= y1; y++) { tLab[y] = String(y); panels.forEach(p => out.push({ unit: nm, t: y, v: p.name, val: p.data?.[c]?.[y] ?? null })); } });
  return dsSummarize(out, tLab);
};
const dsSummarize = (recs, tLab) => {
  const units = [...new Set(recs.map(r => r.unit))]; const times = [...new Set(recs.map(r => r.t))].sort((a, b) => (typeof a === "number" && typeof b === "number") ? a - b : String(a).localeCompare(String(b)));
  const vars = [...new Set(recs.map(r => r.v))]; const keyCount = {}; recs.forEach(r => { const k = `${r.unit}|${r.t}|${r.v}`; keyCount[k] = (keyCount[k] || 0) + 1; });
  const dups = Object.values(keyCount).filter(c => c > 1).length; const present = new Set(recs.filter(r => r.val != null).map(r => `${r.unit}|${r.t}`));
  const perUnit = {}; recs.forEach(r => { if (r.val != null) (perUnit[r.unit] || (perUnit[r.unit] = new Set())).add(r.t); });
  const balanced = units.every(u => (perUnit[u]?.size || 0) === times.length);
  const missing = recs.filter(r => r.val == null).length;
  return { recs, units, times, vars, tLab, dups, balanced, missing, cells: present.size };
};
const dsTypeOf = (td) => td.units.length > 1 && td.times.length > 1 ? "panel" : td.units.length > 1 ? "cross" : "timeseries";
const DS_TYPES = { cross: "Cross-section", timeseries: "Time series", panel: "Panel", pooled: "Pooled cross-sections" };

// Aggregate duplicates and produce the target table {headers, rows}
const dsReshape = (td, target, o = {}) => {
  const agg = o.agg || "mean"; const tl = (t) => td.tLab[t] ?? String(t);
  // cell map unit|t|v -> value
  const acc = {}; td.recs.forEach(r => { if (o.units && !o.units.includes(r.unit)) return; const k = `${r.unit}\u0001${r.t}\u0001${r.v}`; const a = acc[k] || (acc[k] = { s: 0, n: 0, first: undefined, str: null });
    if (r.val == null) return; if (typeof r.val === "number") { a.s += r.val; a.n++; if (a.first === undefined) a.first = r.val; } else if (a.str == null) a.str = r.val; });
  const get = (u, t, v) => { const a = acc[`${u}\u0001${t}\u0001${v}`]; if (!a) return ""; if (a.n) return agg === "sum" ? a.s : agg === "first" ? a.first : a.s / a.n; return a.str ?? ""; };
  let units = o.units || td.units; const times = td.times; const vars = o.vars || td.vars;
  if (o.balancedOnly) { const full = units.filter(u => times.every(t => vars.some(v => get(u, t, v) !== ""))); units = full; }
  const H = [], R = [];
  if (target === "panelLong") { H.push("unit", "time", ...vars); units.forEach(u => times.forEach(t => { const vals = vars.map(v => get(u, t, v)); if (o.dropEmpty && vals.every(x => x === "")) return; R.push([u, tl(t), ...vals]); })); }
  else if (target === "tidyLong") { H.push("unit", "time", "variable", "value"); units.forEach(u => times.forEach(t => vars.forEach(v => { const x = get(u, t, v); if (o.dropEmpty && x === "") return; R.push([u, tl(t), v, x]); }))); }
  else if (target === "wideTime") { H.push("unit", ...(vars.length > 1 ? vars.flatMap(v => times.map(t => `${v}_${tl(t)}`)) : times.map(tl))); units.forEach(u => R.push([u, ...vars.flatMap(v => times.map(t => get(u, t, v)))])); }
  else if (target === "wideUnit") { const v = o.variable || vars[0]; H.push("time", ...units); times.forEach(t => R.push([tl(t), ...units.map(u => get(u, t, v))])); }
  else if (target === "cross") { const ts = times.filter(t => o.tFrom == null || (t >= o.tFrom && t <= o.tTo)); H.push("unit", ...vars.map(v => ts.length > 1 ? `${v} (avg ${tl(ts[0])}–${tl(ts[ts.length - 1])})` : v));
    units.forEach(u => R.push([u, ...vars.map(v => { const xs = ts.map(t => get(u, t, v)).filter(x => typeof x === "number"); return xs.length ? ciMean(xs) : (ts.map(t => get(u, t, v)).find(x => x !== "") ?? ""); })])); }
  else if (target === "series") { const u = o.unit; H.push("time", ...vars); times.forEach(t => R.push([tl(t), ...vars.map(v => { if (u && u !== "__avg__") return get(u, t, v); const xs = units.map(uu => get(uu, t, v)).filter(x => typeof x === "number"); return xs.length ? ciMean(xs) : ""; })])); }
  return { headers: H, rows: R.map(r => r.map(x => typeof x === "number" ? (Number.isInteger(x) ? String(x) : String(+x.toPrecision(10))) : String(x ?? ""))) };
};
const DS_TARGETS = {
  panelLong: { label: "Long panel", sub: "One row per unit and period, one column per variable. Standard for panel regressions and synthetic control." },
  tidyLong: { label: "Long (tidy)", sub: "One row per unit, period and variable. Best for pivot tables, R tidyverse and Stata reshape." },
  wideTime: { label: "Wide by period", sub: "One row per unit, one column per period (per variable)." },
  wideUnit: { label: "Wide by unit", sub: "One row per period, one column per unit, for one variable. Matches the wide panel upload." },
  cross: { label: "Cross-section", sub: "One row per unit: a single period or the average over a range." },
  series: { label: "Time series", sub: "One row per period for one unit, or the average across units." },
};

function DataStructureTab({ isMobile, imported, basket = [], eco, years, defaultCountry, onSend, onChart }) {
  const [src, setSrc] = useState(imported ? "import" : "eco"); const [table, setTable] = useState(null); const [fileErr, setFileErr] = useState("");
  const [det, setDet] = useState(null); const [spec, setSpec] = useState(null); const [manual, setManual] = useState(false);
  const [tidy, setTidy] = useState(null); const [target, setTarget] = useState("panelLong"); const [opt, setOpt] = useState({ agg: "mean", balancedOnly: false, dropEmpty: true, variable: "", unit: "__avg__", tFrom: null, tTo: null });
  const ecoItems = useMemo(() => basket.map(it => ({ key: ciItemKey(it), name: it.label, item: it, ...ciResolveItem(it) })), [basket]);
  const [eSel, setESel] = useState({ countries: defaultCountry ? [defaultCountry] : ["GH"], region: "All", y0: years?.[0] ?? 2000, y1: Math.min(years?.[1] ?? CURRENT_YEAR, CURRENT_YEAR - 1), applyEco: true, items: ecoItems.filter(x => x.route !== "none").map(x => x.key) });
  const [busy, setBusy] = useState("");
  const setO = (k, v) => setOpt(o => ({ ...o, [k]: v }));
  const loadTable = (parsed, name) => { if (parsed.error) { setFileErr(parsed.error); return; } setFileErr(""); const d = dsDetect(parsed.headers, parsed.rows); setTable({ ...parsed, name }); setDet(d); setSpec(d); setManual(false); };
  const onFile = (f) => { if (!f) return; const r = new FileReader(); r.onload = () => loadTable(ciParseCSV(String(r.result)), f.name); r.readAsText(f); };
  // rebuild tidy data whenever the table or spec changes
  useEffect(() => { if (src === "eco" || !table || !spec) return; try { setTidy(dsToTidy(table.headers, table.rows, spec)); } catch (e) { console.error(e); setTidy(null); } }, [table, spec, src]);
  const fetchEco = async () => { const chosen = ecoItems.filter(x => eSel.items.includes(x.key) && x.route !== "none"); if (!chosen.length || !eSel.countries.length) return;
    const ecoOpt = eSel.applyEco ? eco : null; const panels = [];
    for (const x of chosen) { setBusy(`Downloading ${x.name}…`); panels.push({ name: x.name, data: await fetchItemPanel(x.item, eSel.countries, eSel.y0, eSel.y1, ecoOpt) || {} }); }
    setBusy(""); const td = dsFromPanels(panels, eSel.countries, eSel.y0, eSel.y1); setTidy(td); setTable(null);
    const ty = dsTypeOf(td); setDet({ type: ty, layout: "eco", reasons: [`${td.units.length} countr${td.units.length === 1 ? "y" : "ies"} × ${td.times.length} years × ${td.vars.length} variable${td.vars.length === 1 ? "" : "s"} from your EcoScope selection${eSel.applyEco ? ` (${ciEcoNote(eco)})` : ""}.`] });
    setTarget(ty === "panel" ? "panelLong" : ty === "cross" ? "cross" : "series"); };
  const type = tidy ? (det?.type === "pooled" ? "pooled" : (manual && spec?.forceType) ? spec.forceType : dsTypeOf(tidy)) : det?.type;
  useEffect(() => { if (!tidy) return; setOpt(o => ({ ...o, variable: o.variable && tidy.vars.includes(o.variable) ? o.variable : tidy.vars[0], tFrom: typeof tidy.times[0] === "number" ? tidy.times[0] : null, tTo: typeof tidy.times[tidy.times.length - 1] === "number" ? tidy.times[tidy.times.length - 1] : null })); }, [tidy]);
  const validTargets = type === "panel" ? ["panelLong", "tidyLong", "wideTime", "wideUnit", "cross", "series"] : type === "timeseries" ? ["series", "tidyLong", "wideTime"] : type === "pooled" ? ["tidyLong", "panelLong", "series", "cross"] : ["cross", "tidyLong"];
  useEffect(() => { if (type && !validTargets.includes(target)) setTarget(validTargets[0]);
  }, [type]);
  const result = useMemo(() => { if (!tidy) return null; try { return dsReshape(tidy, target, { ...opt, unit: type === "timeseries" ? tidy.units[0] : opt.unit }); } catch (e) { console.error(e); return null; } }, [tidy, target, opt, type]);
  const H = table?.headers || [];
  const setRole = (k, v) => setSpec(s => ({ ...s, [k]: v }));
  const applyManualType = (ty) => { setManual(true);
    if (ty === "cross") setSpec(s => ({ ...s, forceType: "cross", layout: s.layout === "wideTime" || s.layout === "wideUnit" ? "long" : s.layout, timeCol: "" }));
    else if (ty === "timeseries") setSpec(s => ({ ...s, forceType: "timeseries", unitCol: "", layout: s.layout === "longlong" ? "longlong" : s.layout === "wideTime" ? "wideTime" : "long", timeCol: s.timeCol || H.find(h => DS_TIME_HINT.test(h)) || "" }));
    else setSpec(s => ({ ...s, forceType: "panel" })); };
  const outName = `${(table?.name || "ecoscope_selection").replace(/\.[a-z]+$/i, "")}_${target}`;
  const send = (where) => { if (!result) return; onSend && onSend(where, { headers: result.headers, rows: result.rows }, `${outName} (${DS_TARGETS[target].label})`, { unit: result.headers[0] === "unit" ? "unit" : "", time: result.headers.includes("time") ? "time" : "" }); };
  const rowsShown = result ? result.rows.slice(0, 40) : [];
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "330px minmax(0,1fr)", gap: 16, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <LabSec title="1. Data" sub="Your imported data, a new file, or your EcoScope selection.">
          <div role="group" aria-label="Data source" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[["eco", "My selection"], ...(imported ? [["import", "EcoScope import"]] : []), ["file", "Upload CSV"]].map(([k, l]) => <button key={k} type="button" aria-pressed={src === k} onClick={() => { setSrc(k); setTidy(null); setDet(null); setTable(null); if (k === "import") loadTable({ headers: imported.headers, rows: imported.rows }, imported.name); if (k === "file") setTimeout(() => document.getElementById("ds-file")?.click(), 0); }} style={{ ...pill(src === k), flex: 1, padding: "7px 6px" }}>{l}</button>)}
          </div>
          <input id="ds-file" type="file" accept=".csv,.tsv,.txt" onChange={e => onFile(e.target.files?.[0])} style={{ display: "none" }} />
          {fileErr && <div style={{ marginTop: 8 }}><LabNote tone="bad">{fileErr}</LabNote></div>}
          {src === "file" && <div style={{ marginTop: 10 }}><label htmlFor="ds-file" style={{ ...pill(false), display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer", padding: "6px 10px" }}><Ico n="file" /> {table ? "Choose another file" : "Choose a CSV file"}</label></div>}
          {table && <div style={{ fontSize: 12, color: C.mid, marginTop: 8 }}><b style={{ color: C.text }}>{table.name}</b> · {table.rows.length.toLocaleString()} rows · {H.length} columns</div>}
          {src === "eco" && <div style={{ marginTop: 10 }}>
            {!ecoItems.some(x => x.route !== "none") ? <LabNote tone="warn">Add World Bank–based, IMF or WHO variables to your basket first. FRED, market and imported series cannot be downloaded for many countries.</LabNote> : <>
              <LabField group label="Variables" hint={`${eSel.items.length} selected`}><div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px" }}>
                {ecoItems.map(x => <Check key={x.key} checked={eSel.items.includes(x.key)} onChange={v => setESel(e => ({ ...e, items: v ? [...e.items, x.key] : e.items.filter(k => k !== x.key) }))} label={x.name} sub={x.route === "none" ? x.reason : null} />)}</div></LabField>
              <LabField group label="Countries" hint={`${eSel.countries.length} selected`}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <select aria-label="Region" value={eSel.region} onChange={e => setESel(s => ({ ...s, region: e.target.value }))} style={{ ...sel, padding: "6px 8px", fontSize: 12 }}>{REGIONS.map(r => <option key={r} value={r}>{r === "All" ? "All regions" : r}</option>)}</select>
                  <button type="button" onClick={() => setESel(s => ({ ...s, countries: [...new Set([...s.countries, ...COUNTRIES.filter(c => s.region === "All" || c.region === s.region).map(c => c.code)])] }))} style={{ ...pill(false), whiteSpace: "nowrap" }}>Add all</button>
                  <button type="button" onClick={() => setESel(s => ({ ...s, countries: [] }))} style={{ ...pill(false) }}>Clear</button>
                </div>
                <div style={{ maxHeight: 140, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px" }}>
                  {COUNTRIES.filter(c => eSel.region === "All" || c.region === eSel.region).map(c => <Check key={c.code} checked={eSel.countries.includes(c.code)} onChange={v => setESel(s => ({ ...s, countries: v ? [...s.countries, c.code] : s.countries.filter(x => x !== c.code) }))} label={c.name} />)}
                </div>
              </LabField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <LabField label="From"><select value={eSel.y0} onChange={e => setESel(s => ({ ...s, y0: +e.target.value }))} style={{ ...sel, padding: 8 }}>{YEARS.filter(y => y < eSel.y1).map(y => <option key={y}>{y}</option>)}</select></LabField>
                <LabField label="To"><select value={eSel.y1} onChange={e => setESel(s => ({ ...s, y1: +e.target.value }))} style={{ ...sel, padding: 8 }}>{YEARS.filter(y => y > eSel.y0 && y <= CURRENT_YEAR).map(y => <option key={y}>{y}</option>)}</select></LabField>
              </div>
              <Check checked={eSel.applyEco} onChange={v => setESel(s => ({ ...s, applyEco: v }))} label="Apply my EcoScope transform & imputation" sub={ciEcoNote(eco)} />
              <button type="button" onClick={fetchEco} disabled={!!busy || !eSel.items.length || !eSel.countries.length} style={{ ...btn(), width: "100%", marginTop: 8, opacity: busy ? 0.55 : 1 }}>{busy || "Load data"}</button>
            </>}
          </div>}
        </LabSec>
        {det && <LabSec title="2. Structure" sub={manual ? "Set manually" : "Detected automatically"} right={manual && src !== "eco" ? <button type="button" onClick={() => { setSpec(det); setManual(false); }} style={pill(false)}>Reset to auto</button> : null}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ background: C.gold, color: C.onGold, borderRadius: 4, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>{DS_TYPES[type] || "—"}</span>
            {tidy && <span style={{ fontSize: 12, color: C.mid }}>{type === "panel" ? (tidy.balanced ? "balanced" : "unbalanced") : ""}{det.freq ? ` · ${det.freq}` : ""}</span>}
          </div>
          <ul style={{ margin: "0 0 10px 16px", padding: 0, fontSize: 12, color: C.mid, lineHeight: 1.55 }}>{(det.reasons || []).map((r, i) => <li key={i}>{r}</li>)}</ul>
          {src !== "eco" && <>
            <LabField group label="Data type (manual override)">
              <div style={{ display: "flex", gap: 6 }}>{[["cross", "Cross-section"], ["timeseries", "Time series"], ["panel", "Panel"]].map(([k, l]) => <button key={k} type="button" aria-pressed={type === k} onClick={() => applyManualType(k)} style={{ ...pill(type === k), flex: 1, padding: "6px 4px", fontSize: 11.5 }}>{l}</button>)}</div>
            </LabField>
            <LabField label="Layout of the file"><select value={spec.layout} onChange={e => { setManual(true); setRole("layout", e.target.value); }} style={sel}>
              <option value="long">Long: one row per unit (and period)</option><option value="longlong">Long: unit, period, variable, value</option><option value="wideTime">Wide: periods as columns</option><option value="wideUnit">Wide: units as columns</option></select></LabField>
            {spec.layout !== "wideUnit" && <LabField label="Unit column" hint={type === "timeseries" ? "optional" : ""}><select value={spec.unitCol || ""} onChange={e => { setManual(true); setRole("unitCol", e.target.value); }} style={sel}><option value="">(none: one unit)</option>{H.filter(h => !(spec.timeCols || []).includes(h)).map(h => <option key={h} value={h}>{h}</option>)}</select></LabField>}
            {spec.layout !== "wideTime" && <LabField label="Time column" hint={type === "cross" ? "optional" : ""}><select value={spec.timeCol || ""} onChange={e => { setManual(true); setRole("timeCol", e.target.value); }} style={sel}><option value="">(none)</option>{H.map(h => <option key={h} value={h}>{h}</option>)}</select></LabField>}
            {spec.layout === "longlong" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <LabField label="Variable column"><select value={spec.varCol || ""} onChange={e => { setManual(true); setRole("varCol", e.target.value); }} style={sel}>{H.map(h => <option key={h} value={h}>{h}</option>)}</select></LabField>
              <LabField label="Value column"><select value={spec.valCol || ""} onChange={e => { setManual(true); setRole("valCol", e.target.value); }} style={sel}>{H.map(h => <option key={h} value={h}>{h}</option>)}</select></LabField></div>}
            {spec.layout === "wideTime" && <LabField label="Variable column" hint="optional"><select value={spec.varCol || ""} onChange={e => { setManual(true); setRole("varCol", e.target.value); }} style={sel}><option value="">(single variable)</option>{H.filter(h => !(spec.timeCols || []).includes(h)).map(h => <option key={h} value={h}>{h}</option>)}</select></LabField>}
          </>}
        </LabSec>}
        {tidy && <LabSec title="3. Target structure">
          <div role="radiogroup" aria-label="Target structure" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {validTargets.map(k => <button key={k} type="button" role="radio" aria-checked={target === k} onClick={() => setTarget(k)} style={{ textAlign: "left", padding: "8px 10px", borderRadius: 6, border: `1px solid ${target === k ? C.gold : C.border}`, background: target === k ? `${C.gold}14` : "transparent", cursor: "pointer" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: target === k ? C.gold : C.text }}>{DS_TARGETS[k].label}</div><div style={{ fontSize: 11, color: C.mid, lineHeight: 1.45 }}>{DS_TARGETS[k].sub}</div></button>)}
          </div>
          <div style={{ marginTop: 10 }}>
            {target === "wideUnit" && <LabField label="Variable"><select value={opt.variable} onChange={e => setO("variable", e.target.value)} style={sel}>{tidy.vars.map(v => <option key={v} value={v}>{v}</option>)}</select></LabField>}
            {target === "cross" && typeof tidy.times[0] === "number" && tidy.times.length > 1 && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <LabField label="From"><select value={opt.tFrom ?? ""} onChange={e => setO("tFrom", +e.target.value)} style={{ ...sel, padding: 8 }}>{tidy.times.map(t => <option key={t} value={t}>{tidy.tLab[t] ?? t}</option>)}</select></LabField>
              <LabField label="To" hint="same = one period"><select value={opt.tTo ?? ""} onChange={e => setO("tTo", +e.target.value)} style={{ ...sel, padding: 8 }}>{tidy.times.filter(t => t >= opt.tFrom).map(t => <option key={t} value={t}>{tidy.tLab[t] ?? t}</option>)}</select></LabField></div>}
            {target === "series" && tidy.units.length > 1 && <LabField label="Unit"><select value={opt.unit} onChange={e => setO("unit", e.target.value)} style={sel}><option value="__avg__">Average across units</option>{tidy.units.map(u => <option key={u} value={u}>{u}</option>)}</select></LabField>}
            {tidy.dups > 0 && <LabField label={`Duplicates (${tidy.dups})`}><select value={opt.agg} onChange={e => setO("agg", e.target.value)} style={sel}><option value="mean">Average duplicates</option><option value="sum">Sum duplicates</option><option value="first">Keep first</option></select></LabField>}
            {type === "panel" && ["panelLong", "tidyLong", "wideTime"].includes(target) && <Check checked={opt.balancedOnly} onChange={v => setO("balancedOnly", v)} label="Keep only units observed in every period" sub="Makes the panel balanced" />}
            {["panelLong", "tidyLong"].includes(target) && <Check checked={opt.dropEmpty} onChange={v => setO("dropEmpty", v)} label="Drop rows with no values" />}
          </div>
        </LabSec>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        {!tidy && !busy && <LabSec title="Data structuring" sub="Know your data's shape before you analyse it.">
          <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.7 }}>EcoScope reads the table and decides whether it is a <b>cross-section</b> (many units, one period), a <b>time series</b> (one unit, many periods) or a <b>panel</b> (many units over many periods). It explains why, and you can override it. Then pick the layout you need (long, wide, cross-section or a single series), check the preview, and download it or send it to Matching or Synthetic control.</div>
        </LabSec>}
        {busy && <LabSec title="Loading…"><div style={{ fontSize: 12, color: C.mid }}>{busy}</div></LabSec>}
        {tidy && <>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,minmax(0,1fr))" : "repeat(5,minmax(0,1fr))", gap: 10 }}>
            {[["Type", DS_TYPES[type] || "—"], ["Units", tidy.units.length.toLocaleString()], ["Periods", tidy.times.length.toLocaleString()], ["Variables", tidy.vars.length.toLocaleString()], ["Missing cells", `${Math.round(100 * tidy.missing / Math.max(1, tidy.recs.length))}%`]].map(([l, v]) =>
              <div key={l} style={{ ...card, padding: "10px 12px" }}><div style={{ fontSize: 11, color: C.mid, textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div><div style={{ fontSize: 17, fontWeight: 600, color: C.text, marginTop: 2 }}>{v}</div></div>)}
          </div>
          {type === "panel" && !tidy.balanced && <LabNote tone="warn">The panel is unbalanced: some units are missing some periods. Synthetic control needs complete series; matching on period averages does not.</LabNote>}
          {tidy.dups > 0 && <LabNote tone="warn">{tidy.dups} unit-period-variable combination{tidy.dups === 1 ? " appears" : "s appear"} more than once. They are {opt.agg === "mean" ? "averaged" : opt.agg === "sum" ? "summed" : "reduced to the first value"} in the output.</LabNote>}
          {type === "pooled" && <LabNote>Pooled (repeated) cross-sections: different units in each period, so there is no unit column to follow over time. Use difference-in-means by period, or collapse to a cross-section.</LabNote>}
          <LabSec title={`Preview: ${DS_TARGETS[target].label}`} sub={result ? `${result.rows.length.toLocaleString()} rows × ${result.headers.length} columns${result.rows.length > 40 ? " · first 40 rows shown" : ""}` : ""}
            right={result && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" onClick={() => dlCSV(result.rows.map(r => Object.fromEntries(result.headers.map((h, i) => [h, r[i]]))), `${outName}.csv`)} style={{ ...pill(false), display: "inline-flex", gap: 6, alignItems: "center" }}><Ico n="file" /> Download CSV</button>
            </div>}>
            {result && <div style={{ overflow: "auto", maxHeight: 380, border: `1px solid ${C.border}`, borderRadius: 6 }}>
              <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
                <thead><tr>{result.headers.map(h => <th key={h} scope="col" style={{ ...thS, textAlign: "left" }}>{h}</th>)}</tr></thead>
                <tbody>{rowsShown.map((r, i) => <tr key={i}>{r.map((x, j) => { const idCol = ["unit", "time"].includes(result.headers[j]); const isNum = !idCol && dsNum(x) != null;
                  return <td key={j} style={isNum ? tdN : tdS}>{x === "" ? <span style={{ color: C.dim }}>·</span> : isNum ? ciFmt(+x, Math.abs(+x) >= 1000 ? 0 : 2) : x}</td>; })}</tr>)}</tbody>
              </table>
            </div>}
          </LabSec>
          {result && <LabSec title="Use this data" sub="Send the structured table straight into an analysis.">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => send("match")} disabled={!["cross", "panelLong", "tidyLong"].includes(target) || target === "tidyLong"} style={{ ...btn(), padding: "9px 14px", fontSize: 12, opacity: ["cross", "panelLong"].includes(target) ? 1 : 0.5 }}>Use in Matching</button>
              <button type="button" onClick={() => send("synth")} disabled={!["panelLong", "wideUnit"].includes(target)} style={{ ...btn(), padding: "9px 14px", fontSize: 12, opacity: ["panelLong", "wideUnit"].includes(target) ? 1 : 0.5 }}>Use in Synthetic control</button>
              <button type="button" onClick={() => send("did")} disabled={target !== "panelLong"} style={{ ...btn(), padding: "9px 14px", fontSize: 12, opacity: target === "panelLong" ? 1 : 0.5 }}>Use in DiD</button>
              <button type="button" onClick={() => send("hd")} disabled={target !== "cross"} style={{ ...btn(), padding: "9px 14px", fontSize: 12, opacity: target === "cross" ? 1 : 0.5 }}>Use in DML</button>
              {onChart && <button type="button" onClick={() => onChart({ headers: result.headers, rows: result.rows }, `${outName}.csv`)} disabled={!["series", "wideUnit"].includes(target)} style={{ ...pill(false), padding: "9px 14px", opacity: ["series", "wideUnit"].includes(target) ? 1 : 0.5 }}>Chart in EcoScope</button>}
            </div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 8, lineHeight: 1.55 }}>Matching and DML take a cross-section (one row per unit). DiD takes a long panel; add a first-treated-period or 0/1 treatment column to it. Synthetic control takes a long panel or a wide-by-unit table. Charting takes a time series or a wide-by-unit table.</div>
          </LabSec>}
        </>}
      </div>
    </div>
  );
}

function ImpactLab({ onClose, defaultCountry, defaultVar, imported, basket=[], eco, years, onChart }) {
  const isMobile=useIsMobile(); const [tab,setTab]=useState("data"); const [incoming,setIncoming]=useState(null);
  const handOff=(where, table, name)=>{ setIncoming({ where, table, name, id:Date.now() }); setTab(where); document.getElementById("impact-scroll")?.scrollTo({top:0}); };
  useEffect(()=>{ const k=(e)=>{ if(e.key==="Escape") onClose(); }; window.addEventListener("keydown",k); return ()=>window.removeEventListener("keydown",k); },[onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="impact-title" style={{position:"fixed",inset:0,background:C.overlay,zIndex:400,display:"flex",alignItems:"stretch",justifyContent:"center",padding:isMobile?0:20}}>
      <div style={{background:C.bg,border:`1px solid ${C.borderHi}`,borderRadius:isMobile?0:10,width:"100%",maxWidth:1320,display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:C.shadow}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:isMobile?"12px 14px":"14px 20px",borderBottom:`1px solid ${C.border}`,background:C.surface,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:30,height:30,borderRadius:6,background:C.gold,color:C.onGold,display:"flex",alignItems:"center",justifyContent:"center"}}><Ico n="compare"/></div>
            <div><h2 id="impact-title" style={{fontSize:16,margin:0,color:C.text}}>Policy Impact Lab</h2><div style={{fontSize:11,color:C.mid}}>Matching, difference-in-differences, synthetic control and double machine learning</div></div>
          </div>
          <div role="tablist" aria-label="Impact Lab sections" style={{display:"flex",gap:6,order:isMobile?3:0,width:isMobile?"100%":"auto",overflowX:"auto",flexWrap:isMobile?"nowrap":"wrap",paddingBottom:isMobile?2:0}}>
            {[["data","Data structure"],["match","Matching"],["did","DiD & event study"],["synth","Synthetic control"],["hd","Many controls (DML)"],["guide","Methods guide"]].map(([k,l])=><button key={k} role="tab" aria-selected={tab===k} type="button" onClick={()=>setTab(k)} style={{...pill(tab===k),padding:"7px 12px",flex:"none",whiteSpace:"nowrap"}}>{l}</button>)}
          </div>
          <button type="button" onClick={onClose} aria-label="Close Policy Impact Lab" style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,color:C.mid,cursor:"pointer",padding:"6px 10px",fontSize:13}}>✕</button>
        </div>
        <div id="impact-scroll" style={{flex:1,overflowY:"auto",padding:isMobile?12:20}}>
          <div style={{display:tab==="data"?"block":"none"}}><DataStructureTab isMobile={isMobile} imported={imported} basket={basket} eco={eco} years={years} defaultCountry={defaultCountry} onSend={handOff} onChart={onChart? (t,n)=>{ onChart(t,n); onClose(); } : null}/></div>
          <div style={{display:tab==="match"?"block":"none"}}><MatchingTab isMobile={isMobile} imported={imported} basket={basket} eco={eco} years={years} defaultCountry={defaultCountry} incoming={incoming?.where==="match"? incoming : null}/></div>
          <div style={{display:tab==="did"?"block":"none"}}><DidTab isMobile={isMobile} imported={imported} basket={basket} eco={eco} years={years} defaultCountry={defaultCountry} incoming={incoming?.where==="did"? incoming : null}/></div>
          <div style={{display:tab==="hd"?"block":"none"}}><HighDimTab isMobile={isMobile} imported={imported} incoming={incoming?.where==="hd"? incoming : null}/></div>
          <div style={{display:tab==="synth"?"block":"none"}}><SynthTab isMobile={isMobile} defaultCountry={defaultCountry} defaultVar={defaultVar} imported={imported} basket={basket} eco={eco} years={years} incoming={incoming?.where==="synth"? incoming : null}/></div>
          {tab==="guide"&&<MethodsGuide/>}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// HELP ASSISTANT + SUPPORT CHAT
// ══════════════════════════════════════════════
// Built-in knowledge base. The assistant first asks the server (AI answer grounded in this guide);
// if that is unavailable it answers from these entries by keyword match.
const SUPPORT_FAQ = [
  { q: "Why is my chart empty?", k: "empty chart blank no data nothing shows missing", a: "The source has no data for that country, variable or year range. Widen the years in the sidebar, pick another country, or try the World Bank version of the indicator. Recent years are often not published yet." },
  { q: "Why won't a data source load?", k: "source not loading locked pro fred who imf error fail", a: "Sources marked with a lock need a Pro or Enterprise plan (Settings → Subscription). FRED needs an API key and covers the United States only. Some IMF series have no World Bank equivalent and return nothing. If a source still fails, send us the source and variable name from the Support tab." },
  { q: "How do I compare countries?", k: "compare comparison two countries second country", a: "Tick Compare countries at the bottom of the left sidebar and choose a second country. Comparison is part of the Pro plan." },
  { q: "How do I export data or charts?", k: "export download csv excel xls pdf png svg save", a: "Use the Export button above the chart: CSV (raw numbers, re-usable as a panel), Excel and PDF report. Snapshot saves the chart as PNG or SVG. Excel and PDF need a Pro plan." },
  { q: "How do I add more variables to the chart?", k: "basket add variable multiple series several variables", a: "Click variables in the list on the left. Each one joins your basket (numbered badges) and is drawn as a separate series. Click again to remove it." },
  { q: "How do transforms work?", k: "transform log growth percent change difference moving average zscore index", a: "Open the Transform tab under the variable list and pick log, first difference, % change, moving average, z-score, min-max or cumulative sum. The transform applies to every series in the basket and carries into the Impact Lab if you choose." },
  { q: "How do I fill missing years?", k: "impute imputation missing gaps interpolate forward fill mean", a: "Use the Impute tab: linear interpolation, forward fill, backward fill or mean. Imputed values are treated as data, so causal estimates using them show a warning." },
  { q: "How do I build a composite index?", k: "composite index weights normalize aggregate", a: "Open the Composite tab, choose min-max or z-score normalization and a weighted sum, geometric mean or equal-weight average. Set weights per variable." },
  { q: "How do I import my own data?", k: "import upload csv my own data file", a: "Click Import your data at the top of the sidebar. The first column should be time (year, date or quarter); other columns are variables. Imported tables can also be used in the Impact Lab and the Data Structuring tool." },
  { q: "What is the causal DAG tool?", k: "dag causal graph confounder mediator collider backdoor granger discover", a: "In the Dag tab you draw arrows between basket variables and mark the treatment X and outcome Y. EcoScope uses d-separation to list every minimal adjustment set (back-door criterion), flags bad controls and checks the front-door criterion, and tests the graph's implied independencies on your data. Auto-discover makes the series stationary (ADF tests), runs the PC algorithm and orients links with Granger tests; treat the result as a hypothesis." },
  { q: "What is the Policy Impact Lab?", k: "impact lab policy effect causal matching synthetic control treatment", a: "Click Impact Lab in the chart toolbar. Matching estimates the effect of a 0/1 treatment on unit-level data. DiD & event study handles policies adopted by many units, including staggered adoption (Callaway–Sant'Anna, imputation, TWFE benchmark). Synthetic control (with synthetic DiD) handles one treated country or region. Many controls (DML) uses double selection and double machine learning when there are many candidate controls." },
  { q: "Which DiD estimator should I report?", k: "did difference in differences event study staggered twfe callaway santanna imputation bacon parallel trends", a: "With one adoption date all estimators agree. With staggered adoption report Callaway–Sant'Anna (the cohort average is the headline) or the imputation estimator, show the event study, and use TWFE and the Bacon decomposition only as diagnostics. Check the pre-period estimates and the sensitivity table." },
  { q: "What is double machine learning?", k: "dml double machine learning lasso post double selection many controls high dimensional random forest", a: "When there are many candidate controls, Many controls (DML) runs post-double-selection lasso (keeps controls that predict the outcome or the treatment) and double/debiased ML with lasso or random forests and cross-fitting. Both still assume no unmeasured confounding." },
  { q: "Which matching method should I use?", k: "matching nearest neighbour propensity score ipw aipw cem method which choose", a: "Run them side by side, which is the default. If the estimates agree and balance is good (max |SMD| under 0.1), the result is not driven by one model. Nearest-neighbour with bias correction is a good main specification; IPW and AIPW use all units; CEM is transparent but drops units." },
  { q: "What do ATT, ATE and ATC mean?", k: "att ate atc estimand average treatment effect treated controls", a: "ATT is the average effect on units that were treated. ATE is the average effect across everyone. ATC is the effect if the untreated were treated. 'Feasible ATT' means some treated units had no acceptable match and were dropped." },
  { q: "How do I read the synthetic control results?", k: "synthetic control rmspe placebo p-value donor weights gap", a: "Good pre-policy fit (small RMSPE) is essential. The average post-policy gap is the estimated effect. The placebo p-value ranks your country's post/pre RMSPE ratio among all donors; small values mean the effect is unusual compared with placebos." },
  { q: "What is data structuring?", k: "structure cross section time series panel long wide reshape pivot detect", a: "Impact Lab → Data structure detects whether a table is cross-sectional, time series or panel, lets you override it, and reshapes it to long, wide or other layouts. You can download the result or send it straight to Matching or Synthetic control." },
  { q: "How do I change my password?", k: "password change reset forgot security", a: "Settings → Password & security. Enter your current password and a new one twice. If you forgot your password, sign out and use Forgot password on the sign-in screen, or message support." },
  { q: "How do I change the theme?", k: "theme dark light appearance colour color", a: "Settings → Appearance. Choose Graphite, Paper, Navy, Ledger or Terminal and press Save changes." },
  { q: "How do I upgrade my plan?", k: "upgrade plan pro enterprise billing subscription price", a: "Settings → Subscription → Request an upgrade, or Request plan upgrade in the account menu. An administrator reviews the request." },
  { q: "What are AI insights?", k: "ai insight claude anthropic narrative deep analysis", a: "Analyze Data gives a free built-in statistical summary. Deep Analysis sends the computed statistics to Claude for a written interpretation and needs a Pro plan." },
  { q: "Why are some years marked as interpolated?", k: "quarterly monthly frequency interpolated annual", a: "Most sources publish annual data. When you switch to quarterly or monthly, EcoScope interpolates between annual values and labels them as estimates." },
];
const ciTok = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9%\s]/g, " ").split(/\s+/).filter(w => w.length > 2 && !["the", "and", "how", "what", "why", "can", "does", "with", "for", "you", "your", "are", "this", "that", "into", "from", "have", "use", "using"].includes(w)).map(w => w.replace(/(ing|ed|es|s)$/, ""));
const ciKbAnswer = (question) => {
  const qt = ciTok(question); if (!qt.length) return null;
  const scored = SUPPORT_FAQ.map(f => { const kt = new Set([...ciTok(f.k), ...ciTok(f.q)]); let sc = 0; qt.forEach(w => { if (kt.has(w)) sc += 1; else if ([...kt].some(k => k.startsWith(w) || w.startsWith(k))) sc += 0.5; }); return { f, sc }; }).sort((a, b) => b.sc - a.sc);
  if (scored[0].sc < 1) return null;
  return { answer: scored[0].f.a, title: scored[0].f.q, related: scored.slice(1, 3).filter(x => x.sc >= 1).map(x => x.f.q) };
};
const ciFmtTime = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); };
const ciFmtDay = (iso) => { const d = new Date(iso); if (isNaN(d)) return ""; const t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Today"; if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", year: "numeric", month: "short", day: "numeric" }); };
const SUPPORT_CATS = [["question", "Question"], ["bug", "Bug"], ["data", "Data issue"], ["feature", "Feature request"], ["billing", "Billing"], ["other", "Other"]];

// Message list with day separators and timestamps
const ChatLog = ({ msgs, me = "user", emptyText }) => {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);
  if (!msgs.length) return <div style={{ padding: 20, color: C.dim, fontSize: 12, textAlign: "center", lineHeight: 1.6 }}>{emptyText}</div>;
  let lastDay = "";
  return (
    <div role="log" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 12px 4px" }}>
      {msgs.map((m, i) => { const day = ciFmtDay(m.created_at); const showDay = day !== lastDay; lastDay = day; const mine = m.sender === me;
        const col = m.sender === "bot" ? C.purple : m.sender === "admin" ? C.teal : C.gold;
        return <React.Fragment key={m.id || i}>
          {showDay && <div style={{ textAlign: "center", fontSize: 11, color: C.dim, margin: "6px 0" }}>{day}</div>}
          <div style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "86%" }}>
            <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 2, textAlign: mine ? "right" : "left" }}>
              {m.sender === "bot" ? "Assistant" : m.sender === "admin" ? "EcoScope support" : (m.username || "You")}{m.category ? ` · ${SUPPORT_CATS.find(c => c[0] === m.category)?.[1] || m.category}` : ""} · {ciFmtTime(m.created_at)}
            </div>
            <div style={{ background: mine ? `${col}22` : C.card, border: `1px solid ${mine ? col + "55" : C.border}`, borderRadius: 8, padding: "8px 11px", color: C.text, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.body}</div>
            {m.related?.length > 0 && <div style={{ fontSize: 11, color: C.mid, marginTop: 4 }}>Related: {m.related.join(" · ")}</div>}
          </div>
        </React.Fragment>; })}
      <div ref={endRef} />
    </div>
  );
};

function SupportChat({ user, open, setOpen, mode, setMode }) {
  const isMobile = useIsMobile();
  const [aMsgs, setAMsgs] = useState([]); const [sMsgs, setSMsgs] = useState([]); const [text, setText] = useState(""); const [cat, setCat] = useState("question");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [unread, setUnread] = useState(0);
  const inputRef = useRef(null);
  const loadThread = useCallback(async () => { const r = await US.supportMessages(user.username); if (Array.isArray(r)) { setSMsgs(r.filter(m => m.channel !== "assistant")); setUnread(r.filter(m => m.sender === "admin" && !m.read_by_user).length); } }, [user.username]);
  useEffect(() => { loadThread(); const t = setInterval(loadThread, open && mode === "support" ? 8000 : 30000); return () => clearInterval(t); }, [loadThread, open, mode]);
  useEffect(() => { if (open && mode === "support" && unread) { US.supportMarkRead(user.username, "user").then(loadThread); } }, [open, mode, unread, user.username, loadThread]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open, mode]);
  const now = () => new Date().toISOString();
  const send = async (e) => { e?.preventDefault(); const body = text.trim(); if (!body || busy) return; setErr(""); setText("");
    if (mode === "assistant") {
      const q = { sender: "user", body, created_at: now(), username: "You" }; setAMsgs(m => [...m, q]); setBusy(true);
      let ans = await US.supportAssistant(body, aMsgs.slice(-8).map(m => ({ role: m.sender === "bot" ? "assistant" : "user", content: m.body })));
      if (!ans?.answer) { const kb = ciKbAnswer(body); ans = kb ? { answer: kb.answer, related: kb.related } : { answer: "I don't have a good answer for that. Use “Send to support” below and the EcoScope team will reply here." }; }
      setAMsgs(m => [...m, { sender: "bot", body: ans.answer, related: ans.related, created_at: now() }]); setBusy(false);
      US.supportSend({ username: user.username, email: user.email, sender: "user", channel: "assistant", body }).catch(() => {});
      US.supportSend({ username: user.username, email: user.email, sender: "bot", channel: "assistant", body: ans.answer }).catch(() => {});
    } else {
      setBusy(true); const r = await US.supportSend({ username: user.username, email: user.email, sender: "user", channel: "support", category: cat, body }); setBusy(false);
      if (r?.error) { setErr(r.error); setText(body); } else loadThread();
    } };
  const escalate = () => { const lastQ = [...aMsgs].reverse().find(m => m.sender === "user"); setMode("support"); if (lastQ) setText(lastQ.body); };
  const W = isMobile ? "100vw" : 390, H = isMobile ? "100dvh" : 580;
  return (
    <>
      {!open && <button type="button" onClick={() => setOpen(true)} aria-label={`Help and support${unread ? `, ${unread} new repl${unread > 1 ? "ies" : "y"}` : ""}`}
        style={{ position: "fixed", right: 18, bottom: 18, zIndex: 350, height: 46, padding: "0 16px 0 14px", borderRadius: 23, border: "none", background: C.gold, color: C.onGold, display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: C.shadow }}>
        <Ico n="message" s={18} /> {!isMobile && "Help"}
        {unread > 0 && <span style={{ background: C.red, color: "#fff", borderRadius: 10, minWidth: 20, height: 20, fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{unread}</span>}
      </button>}
      {open && <div role="dialog" aria-label="Help and support" style={{ position: "fixed", right: isMobile ? 0 : 18, bottom: isMobile ? 0 : 18, width: W, height: H, maxHeight: isMobile ? "100dvh" : "calc(100vh - 36px)", zIndex: 360, background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: isMobile ? 0 : 12, boxShadow: C.shadow, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 6, background: C.gold, color: C.onGold, display: "flex", alignItems: "center", justifyContent: "center" }}><Ico n={mode === "assistant" ? "sparkle" : "message"} s={16} /></div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{mode === "assistant" ? "EcoScope assistant" : "EcoScope support"}</div>
            <div style={{ fontSize: 11, color: C.mid }}>{mode === "assistant" ? "Answers about features and methods" : "Messages go to the EcoScope team"}</div></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close help" style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, width: 30, height: 30, color: C.mid, cursor: "pointer" }}>✕</button>
        </div>
        <div role="tablist" aria-label="Help mode" style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
          {[["assistant", "Assistant"], ["support", `Support${unread ? ` (${unread})` : ""}`]].map(([k, l]) => <button key={k} role="tab" type="button" aria-selected={mode === k} onClick={() => setMode(k)} style={{ ...pill(mode === k), flex: 1, padding: "6px" }}>{l}</button>)}
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {mode === "assistant"
            ? <>
                <ChatLog msgs={aMsgs} emptyText="Ask how any feature works, for example “How do I compare two countries?” or “What does ATT mean?”" />
                {!aMsgs.length && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 12px 12px" }}>{SUPPORT_FAQ.slice(0, 5).map(f => <button key={f.q} type="button" onClick={() => setText(f.q)} style={{ ...pill(false), fontSize: 11.5 }}>{f.q}</button>)}</div>}
                {busy && <div style={{ padding: "0 14px 10px", fontSize: 12, color: C.mid }}>Assistant is typing…</div>}
              </>
            : <ChatLog msgs={sMsgs} emptyText="Describe a problem, a data issue or a request. The team's replies will appear here, and you can come back to this conversation any time." />}
        </div>
        {mode === "assistant" && aMsgs.length > 0 && <div style={{ padding: "6px 12px", borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.mid }}>Still stuck? <button type="button" onClick={escalate} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", padding: 0, fontSize: 12, textDecoration: "underline" }}>Send to support</button></div>}
        {err && <div role="alert" style={{ padding: "6px 12px", color: C.red, fontSize: 12 }}>{err}</div>}
        <form onSubmit={send} style={{ borderTop: `1px solid ${C.border}`, padding: 10 }}>
          {mode === "support" && <div role="group" aria-label="Topic" style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>{SUPPORT_CATS.map(([k, l]) => <button key={k} type="button" aria-pressed={cat === k} onClick={() => setCat(k)} style={{ ...pill(cat === k), fontSize: 11, padding: "3px 8px" }}>{l}</button>)}</div>}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea ref={inputRef} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={2} aria-label={mode === "assistant" ? "Ask the assistant" : "Message to support"}
              placeholder={mode === "assistant" ? "Ask a question…" : "Write your message…"} style={{ ...inp, fontSize: 13, resize: "none", lineHeight: 1.45 }} />
            <button type="submit" disabled={!text.trim() || busy} aria-label="Send" style={{ ...btn(), padding: "9px 14px", opacity: !text.trim() || busy ? 0.5 : 1 }}><Ico n="arrowup" s={16} /></button>
          </div>
        </form>
      </div>}
    </>
  );
}

// Admin inbox: every conversation with dates and times, replies, status
function AdminSupportInbox({ admin }) {
  const isMobile = useIsMobile();
  const [threads, setThreads] = useState([]); const [sel, setSel] = useState(null); const [msgs, setMsgs] = useState([]);
  const [q, setQ] = useState(""); const [filter, setFilter] = useState("open"); const [showBot, setShowBot] = useState(false);
  const [reply, setReply] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const loadThreads = useCallback(async () => { const r = await US.supportThreads(); if (Array.isArray(r)) setThreads(r); else if (r?.error) setErr(r.error); }, []);
  const loadMsgs = useCallback(async (u) => { if (!u) return; const r = await US.supportMessages(u); if (Array.isArray(r)) setMsgs(r); }, []);
  useEffect(() => { loadThreads(); const t = setInterval(loadThreads, 15000); return () => clearInterval(t); }, [loadThreads]);
  useEffect(() => { if (!sel) return; loadMsgs(sel); US.supportMarkRead(sel, "admin").then(loadThreads); const t = setInterval(() => loadMsgs(sel), 8000); return () => clearInterval(t); }, [sel, loadMsgs, loadThreads]);
  const shown = threads.filter(t => (filter === "all" || (t.status || "open") === filter) && (!q || `${t.username} ${t.email || ""} ${t.last_body || ""}`.toLowerCase().includes(q.toLowerCase())));
  const cur = threads.find(t => t.username === sel);
  const send = async (e) => { e.preventDefault(); const body = reply.trim(); if (!body) return; setBusy(true); setErr("");
    const r = await US.supportSend({ username: sel, sender: "admin", channel: "support", body, admin: admin.username }); setBusy(false);
    if (r?.error) setErr(r.error); else { setReply(""); loadMsgs(sel); loadThreads(); } };
  const setStatus = async (st) => { await US.supportSetStatus(sel, st); loadThreads(); };
  const exportThread = () => dlCSV(msgs.map(m => ({ date: new Date(m.created_at).toLocaleString(), from: m.sender === "admin" ? `support (${m.admin || "admin"})` : m.sender === "bot" ? "assistant" : m.username, channel: m.channel, category: m.category || "", message: m.body })), `support_${sel}.csv`);
  const visible = msgs.filter(m => showBot || m.channel !== "assistant");
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "320px minmax(0,1fr)", gap: 14, minHeight: 520 }}>
      <div style={{ ...card, padding: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: 12, borderBottom: `1px solid ${C.border}` }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search users or messages" aria-label="Search conversations" style={{ ...inp, fontSize: 12, marginBottom: 8 }} />
          <div role="group" aria-label="Filter" style={{ display: "flex", gap: 6 }}>{[["open", "Open"], ["resolved", "Resolved"], ["all", "All"]].map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} style={{ ...pill(filter === k), flex: 1, padding: "5px" }}>{l}</button>)}</div>
        </div>
        <div style={{ overflowY: "auto", flex: 1, maxHeight: 560 }}>
          {err && <div role="alert" style={{ padding: 12, color: C.red, fontSize: 12 }}>{err}</div>}
          {!shown.length && <div style={{ padding: 16, fontSize: 12, color: C.dim }}>No conversations{filter !== "all" ? ` marked ${filter}` : ""}.</div>}
          {shown.map(t => { const on = t.username === sel; return (
            <button key={t.username} type="button" onClick={() => setSel(t.username)} aria-current={on ? "true" : undefined}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderBottom: `1px solid ${C.border}`, background: on ? `${C.gold}14` : "transparent", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: C.text, fontSize: 13, fontWeight: t.unread ? 700 : 500 }}>{t.username}</span>
                <span style={{ color: C.dim, fontSize: 11, whiteSpace: "nowrap" }}>{ciFmtDay(t.last_at)} {ciFmtTime(t.last_at)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
                <span style={{ color: C.mid, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.last_sender === "admin" ? "You: " : ""}{t.last_body}</span>
                {t.unread > 0 && <span style={{ background: C.gold, color: C.onGold, borderRadius: 10, minWidth: 18, height: 18, fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px", flexShrink: 0 }}>{t.unread}</span>}
              </div>
              <div style={{ fontSize: 10.5, color: (t.status || "open") === "open" ? C.orange : C.teal, marginTop: 3 }}>{(t.status || "open") === "open" ? "Open" : "Resolved"} · {t.count} message{t.count === 1 ? "" : "s"}</div>
            </button>); })}
        </div>
      </div>
      <div style={{ ...card, padding: 0, display: "flex", flexDirection: "column", minHeight: 520 }}>
        {!sel ? <div style={{ margin: "auto", color: C.dim, fontSize: 13, padding: 20, textAlign: "center" }}>Select a conversation to read and reply.</div> : <>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160 }}><div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{sel}</div><div style={{ color: C.mid, fontSize: 12 }}>{cur?.email || "—"} · started {cur?.first_at ? `${ciFmtDay(cur.first_at)} ${ciFmtTime(cur.first_at)}` : "—"}</div></div>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: C.mid }}><input type="checkbox" checked={showBot} onChange={e => setShowBot(e.target.checked)} style={{ accentColor: C.gold }} /> Show assistant chats</label>
            {(cur?.status || "open") === "open" ? <button type="button" onClick={() => setStatus("resolved")} style={{ ...pill(false), color: C.teal }}>Mark resolved</button> : <button type="button" onClick={() => setStatus("open")} style={pill(false)}>Reopen</button>}
            <button type="button" onClick={exportThread} style={{ ...pill(false), display: "inline-flex", gap: 6, alignItems: "center" }}><Ico n="file" /> Export</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", maxHeight: 470 }}><ChatLog msgs={visible} me="admin" emptyText="No messages yet." /></div>
          <form onSubmit={send} style={{ borderTop: `1px solid ${C.border}`, padding: 10, display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(e); }} rows={2} placeholder={`Reply to ${sel}… (Ctrl+Enter to send)`} aria-label="Reply" style={{ ...inp, fontSize: 13, resize: "vertical" }} />
            <button type="submit" disabled={!reply.trim() || busy} style={{ ...btn(), padding: "9px 16px", opacity: !reply.trim() || busy ? 0.5 : 1 }}>{busy ? "Sending…" : "Send"}</button>
          </form>
        </>}
      </div>
    </div>
  );
}

function Dashboard({user, onLogout}) {
  const [settings,setSettings]=useState(user.settings||{defaultCountry:"GH",fredKey:"",anthropicKey:"",theme:"dark"});
  const [showSettings,setShowSettings]=useState(false);
  const [showUserMenu,setShowUserMenu]=useState(false);
  const [upgradeModal,setUpgradeModal]=useState(null); // {feature, requiredPlan}
  const [showUpgradeReq,setShowUpgradeReq]=useState(false);
  const [settingsTab,setSettingsTab]=useState("account");
  // Load a {headers, rows} table into the dashboard as imported series (used by the CSV import and by Data structure)
  const importTable=(parsed, name)=>{
    const timeInfo=detectTimeColumn(parsed.headers,parsed.rows);
    const series=csvToSeries(parsed.headers,parsed.rows,timeInfo.col);
    if(Object.keys(series).length===0){alert("No numeric data columns found.");return false;}
    setImportedData({series,freq:timeInfo.freq,timeName:timeInfo.name});
    setImportedRaw({headers:parsed.headers, rows:parsed.rows, name});
    setFreq(timeInfo.freq==="daily"?"monthly":timeInfo.freq);
    const maxV=plan.aiInsights?10:4;
    const cols=Object.keys(series).slice(0,maxV);
    setVarBasket(cols.map((nm,i)=>({sourceId:"__imported__",varCode:nm,label:nm,fmt:"num",sourceColor:ACCENT[i%ACCENT.length],sourceName:"CSV"})));
    return true;
  };
  const openSettings=(t="account")=>{ setSettingsTab(t); setShowSettings(true); setShowUserMenu(false); };
  const [chatOpen,setChatOpen]=useState(false); const [chatMode,setChatMode]=useState("assistant");
  const openSupport=(m="assistant")=>{ setChatMode(m); setChatOpen(true); setShowUserMenu(false); };

  // Sync plan from UserStore (admin may have changed it)
  const [liveUser,setLiveUser]=useState(user);
  useEffect(()=>{
    const refresh=async()=>{
      try{
        const users=await US.getAll();
        const fresh=users.find(u=>u.username===user.username);
        if(fresh) setLiveUser(f=>({...f,...fresh,plan:fresh.plan||f.plan,planStatus:fresh.plan_status||fresh.planStatus||f.planStatus}));
      }catch(e){}
    };
    refresh();
    window.addEventListener('ecoscope-update',refresh);
    return ()=>window.removeEventListener('ecoscope-update',refresh);
  },[user.username]);
  const [sidebarWidth,setSidebarWidth]=useState(268);
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const isMobile=useIsMobile();
  const isResizing=useRef(false);
  const T=useMemo(()=>({...applyTheme(settings.theme||"dark")}), [settings.theme]);
  const plan=PLANS[liveUser.plan||"free"]||PLANS.free;

  const startResize=useCallback((e)=>{
    isResizing.current=true;
    const onMove=(ev)=>{if(!isResizing.current)return;setSidebarWidth(Math.min(Math.max(ev.clientX,160),520));};
    const onUp=()=>{isResizing.current=false;document.removeEventListener("mousemove",onMove);document.removeEventListener("mouseup",onUp);};
    document.addEventListener("mousemove",onMove);
    document.addEventListener("mouseup",onUp);
  },[]);

  // Source browser (for navigation only)
  const [dataLevel,setDataLevel]=useState("macro");
  const [sourceId,setSourceId]=useState("worldbank");

  // Variable basket — cross-source, up to 4 items
  // Each: {sourceId, varCode, label, fmt, sourceColor, sourceName}
  const [varBasket,setVarBasket]=useState([{
    sourceId:"worldbank", varCode:"NY.GDP.MKTP.CD",
    label:"GDP (Current USD)", fmt:"currency",
    sourceColor:C.blue, sourceName:"World Bank"
  }]);
  // Keep backward-compat aliases
  const varCodes=varBasket.map(v=>v.varCode);
  const varCode=varBasket[0]?.varCode||"NY.GDP.MKTP.CD";
  const [varSearch,setVarSearch]=useState("");

  // Country
  const [country,setCountry]=useState(settings.defaultCountry||"GH");
  const [regionFilter,setRegionFilter]=useState("Africa");
  const [countrySearch,setCountrySearch]=useState("");

  // Time
  const [startYear,setStartYear]=useState(CURRENT_YEAR-23);
  const [endYear,setEndYear]=useState(CURRENT_YEAR);

  // Chart
  const [chartType,setChartType]=useState(settings.chartType||"area");
  useEffect(()=>{ if (settings.chartType) setChartType(settings.chartType); },[settings.chartType]);
  const [distVar,setDistVar]=useState(0);
  const [animate,setAnimate]=useState(false);
  const [animTick,setAnimTick]=useState(0);
  const [engineAnalysis,setEngineAnalysis]=useState(null);
  const [distCurveType,setDistCurveType]=useState("normal"); // normal | skew | histogram
  const [viewMode,setViewMode]=useState("chart");

  // Compare
  const [cmpOn,setCmpOn]=useState(false);
  const [cmpCountry,setCmpCountry]=useState("NG");

  // Analysis tools
  const [transform,setTransform]=useState("none");
  const [appliedTransform,setAppliedTransform]=useState("none");
  const [showOriginal,setShowOriginal]=useState(false);
  const [imputeMethod,setImputeMethod]=useState("none");
  const [appliedImpute,setAppliedImpute]=useState("none");
  const [missingAlert,setMissingAlert]=useState(null);
  const [noDataVars,setNoDataVars]=useState(new Set()); // {count, total, varName}
  const [freq,setFreq]=useState("annual"); // annual|quarterly|monthly
  const [showRegression,setShowRegression]=useState(false);
  const [depVar,setDepVar]=useState(0);   // index into varCodes
  const [indepVar,setIndepVar]=useState(1);
  const [showComposite,setShowComposite]=useState(false);
  const [compWeights,setCompWeights]=useState([1]);
  const [compNorm,setCompNorm]=useState("minmax");
  const [compAgg,setCompAgg]=useState("weighted_sum");
  const [compBasis,setCompBasis]=useState("raw"); // raw|zscore|normalized
  const [analysisTab,setAnalysisTab]=useState("transform");
  // DAG causal analysis
  const [dagEdges,setDagEdges]=useState([]); // [{from, to}]
  const [dagTreatment,setDagTreatment]=useState(0); // index into basket
  const [dagOutcome,setDagOutcome]=useState(1);
  const [dagFrom,setDagFrom]=useState(0);
  const [dagTo,setDagTo]=useState(1);
  const [showDag,setShowDag]=useState(false);
  const [hiddenChartVars,setHiddenChartVars]=useState(new Set());
  const [unobservedNodes,setUnobservedNodes]=useState(new Set());
  const [dagPositions,setDagPositions]=useState({});
  const [dragNode,setDragNode]=useState(null);
  // Data import
  const [importedData,setImportedData]=useState(null); // {series:{name:[{year,value}]}, freq, timeName}
  const [showImport,setShowImport]=useState(false);
  const [showImpact,setShowImpact]=useState(false);
  const [importedRaw,setImportedRaw]=useState(null); // raw table of the last CSV imported into EcoScope (for the Impact Lab)
  const [dagMode,setDagMode]=useState("manual"); // manual|auto
  const [dagOpt,setDagOpt]=useState({ method:"pc", alpha:0.05, stationary:true, maxLag:2 }); const [dagDiag,setDagDiag]=useState(null);
  const [dagScores,setDagScores]=useState([]); // transform|impute|regression|composite

  // Multi-variable data store
  const [multiData,setMultiData]=useState({});
  const [cmpMultiData,setCmpMultiData]=useState({});
  const [data,setData]=useState([]);
  const [rawData,setRawData]=useState([]);
  const [cmpRawData,setCmpRawData]=useState([]);
  const [cmpData,setCmpData]=useState([]);
  const [loading,setLoading]=useState(false);

  // AI
  const [insight,setInsight]=useState("");
  const [aiLoading,setAiLoading]=useState(false);
  const [aiError,setAiError]=useState("");

  // Derived
  const sources = dataLevel==="macro" ? MACRO_SOURCES : MICRO_SOURCES;
  const source  = sources.find(s=>s.id===sourceId)||sources[0];
  const effCountry = (ALL_SRCS_MAP[varBasket[0]?.sourceId]||source).countryFixed||country;
  const cc  = COUNTRIES.find(x=>x.code===effCountry)||COUNTRIES[0];
  const cmpC = COUNTRIES.find(x=>x.code===cmpCountry)||COUNTRIES[1];

  const filteredVars = useMemo(()=>{
    const q=varSearch.toLowerCase();
    return source.vars.filter(v=>!q||v.name.toLowerCase().includes(q)||v.cat.toLowerCase().includes(q)||v.code.toLowerCase().includes(q));
  },[source,varSearch]);

  const groupedVars = useMemo(()=>{
    const g={};
    filteredVars.forEach(v=>{if(!g[v.cat])g[v.cat]=[];g[v.cat].push(v);});
    return g;
  },[filteredVars]);

  const _primarySrc0 = ALL_SRCS_MAP[varBasket[0]?.sourceId]||source;
  const currentVar = varBasket.length
    ? (varBasket[0].sourceId==="__imported__"
        ? {code:varBasket[0].varCode, name:varBasket[0].label, fmt:"num", cat:"Imported"}
        : (_primarySrc0.vars.find(v=>v.code===varBasket[0].varCode)||_primarySrc0.vars[0]||source.vars[0]))
    : source.vars[0];

  const filteredCountries = COUNTRIES.filter(c=>{
    const rOk=regionFilter==="All"||c.region===regionFilter;
    const sOk=!countrySearch||c.name.toLowerCase().includes(countrySearch.toLowerCase())||c.code.toLowerCase().includes(countrySearch.toLowerCase());
    return rOk&&sOk;
  });

  // Reset var when source changes
  useEffect(()=>{
    setMultiData({});setCmpMultiData({});setData([]);
  },[sourceId]);

  // Reset source when level changes
  useEffect(()=>{
    const srcs=dataLevel==="macro"?MACRO_SOURCES:MICRO_SOURCES;
    const firstSrc=srcs[0];
    setSourceId(firstSrc.id);
    const firstVar=firstSrc.vars[0];
    setVarBasket([{sourceId:firstSrc.id,varCode:firstVar.code,label:firstVar.name,fmt:firstVar.fmt,sourceColor:firstSrc.color,sourceName:firstSrc.short}]);
    setVarSearch("");setMultiData({});setCmpMultiData({});setData([]);
  },[dataLevel]);

  // Load data
    // Fetches RAW data over the network only — never depends on transform/impute
  // (those are pure client-side reprocessing of already-fetched data, applied separately below)
  const loadData = useCallback(async()=>{
    if(!varBasket.length) return;
    setLoading(true);
    const yfInterval = freq==="daily"?"1d":freq==="weekly"?"1wk":freq==="monthly"?"1mo":freq==="annual"?"1mo":"1mo";
    const apiKeys={fred:settings.fredKey||"",anthropic:settings.anthropicKey||"",yahooInterval:yfInterval};

    const fetchBasketItem = async (item, countryCode) => {
      if(item.sourceId==="__imported__"){
        return importedData?.series?.[item.varCode] || [];
      }
      const src = ALL_SRCS_MAP[item.sourceId];
      if(!src) return [];
      const vd = src.vars.find(v=>v.code===item.varCode);
      if(!vd) return [];
      const cc2 = src.countryFixed || countryCode;
      return fetchData(src.id, vd, cc2, startYear, endYear, apiKeys);
    };

    const primaryResults = await Promise.all(varBasket.map(item=>fetchBasketItem(item, effCountry)));
    const newMultiData = {};
    const emptyVars=new Set();
    varBasket.forEach((item,i)=>{
      const key=`${item.sourceId}:${item.varCode}`;
      const result=primaryResults[i]||[];
      newMultiData[key] = result;
      if(Array.isArray(primaryResults[i])&&primaryResults[i].length===0) emptyVars.add(key);
    });
    setNoDataVars(emptyVars);
    setMultiData(newMultiData);
    setRawData(primaryResults[0]||[]);

    if(cmpOn){
      const cmpResults = await Promise.all(varBasket.map(item=>fetchBasketItem(item, cmpCountry)));
      const newCmpMulti = {};
      varBasket.forEach((item,i)=>{
        newCmpMulti[`${item.sourceId}:${item.varCode}`] = cmpResults[i]||[];
      });
      setCmpMultiData(newCmpMulti);
      setCmpRawData(cmpResults[0]||[]);
    } else { setCmpRawData([]); setCmpMultiData({}); }

    setLoading(false);
  },[varBasket,effCountry,startYear,endYear,cmpOn,cmpCountry,settings.fredKey,importedData,freq]);

  useEffect(()=>{loadData();},[loadData]);

  // Force refresh: clears cached entries for the current basket/country/range and refetches
  const forceRefresh = useCallback(()=>{
    varBasket.forEach(item=>{
      if(item.sourceId==="__imported__") return;
      const src2 = ALL_SRCS_MAP[item.sourceId];
      const vd = src2?.vars.find(v=>v.code===item.varCode);
      const api = vd?.api || item.sourceId;
      const cc2 = src2?.countryFixed || effCountry;
      cacheClearPrefix(`${api}:${cc2}:`);
      cacheClearPrefix(`${api}:${item.varCode}:`); // for FRED (no country in key)
      if(cmpOn) cacheClearPrefix(`${api}:${cmpCountry}:`);
    });
    setNoDataVars(new Set());
    loadData();
  },[varBasket,effCountry,cmpOn,cmpCountry,loadData]);

  // Build series list for the built-in analytics engine (respects transforms/impute)
  const allVarDefsForEngine = () => {
    return varBasket.map(item=>{
      const s2 = ALL_SRCS_MAP[item.sourceId];
      const vd = item.sourceId==="__imported__" ? {name:item.label,fmt:"num"} : (s2?.vars.find(v=>v.code===item.varCode));
      const dk = `${item.sourceId}:${item.varCode}`;
      const data = applyTransform(imputeData(multiData[dk]||[],appliedImpute),appliedTransform);
      return vd && data.length ? {name:item.label||vd.name, fmt:vd.fmt||"num", data} : null;
    }).filter(Boolean);
  };

  // Reprocess (transform/impute) purely client-side — NO network calls, instant on Apply
  useEffect(()=>{
    setData(applyTransform(imputeData(rawData, appliedImpute), appliedTransform));
    const missing=rawData.filter(d=>d.value==null).length;
    if(missing>0&&appliedImpute==="none"&&rawData.length>0){
      setMissingAlert({count:missing,total:rawData.length,varName:varBasket[0]?.label||"variable"});
    } else setMissingAlert(null);
  },[rawData, appliedImpute, appliedTransform]);

  useEffect(()=>{
    setCmpData(applyTransform(imputeData(cmpRawData, appliedImpute), appliedTransform));
  },[cmpRawData, appliedImpute, appliedTransform]);

  useEffect(()=>{setInsight("");setAiError("");},[sourceId,varCode,effCountry,startYear,endYear]);

  // Chart merge
  const chartData = data.map(d=>{
    const row={year:d.year,[cc.name]:d.value};
    if (cmpOn&&!source.countryFixed) {
      const x=cmpData.find(z=>z.year===d.year);
      if (x) row[cmpC.name]=x.value;
    }
    return row;
  });

  const latest=data.length?data[data.length-1]:null;
  const prev=data.length>1?data[data.length-2]:null;
  const chg=latest&&prev&&prev.value?((latest.value-prev.value)/Math.abs(prev.value)*100):null;

  const kpis=[
    {lbl:"Source",     val:source.short,            sub:source.name.split("—")[0].trim()},
    {lbl:"Country",    val:`${cc.flag} ${cc.name}`, sub:cc.region},
    {lbl:"Indicator",  val:currentVar.name.split("(")[0].trim().substring(0,22), sub:currentVar.cat},
    {lbl:"Latest",     val:latest?fmtVal(latest.value,currentVar.fmt):"—", sub:latest?`year ${latest.year}`:"No data"},
    {lbl:"YoY Change", val:chg!=null?`${chg>=0?"+":""}${chg.toFixed(1)}%`:"—", sub:"vs previous year", pos:chg>0,neg:chg<0&&chg!=null},
  ];

  const renderChart=()=>{
    // Build multi-variable chart data from basket
    const allVarDefs = varBasket.map(item=>{
      if(item.sourceId==="__imported__"){
        return {code:item.varCode,name:item.label,fmt:"num",cat:"Imported",_sourceId:"__imported__",_sourceColor:item.sourceColor,_sourceName:"CSV"};
      }
      const src2=ALL_SRCS_MAP[item.sourceId];
      const vd=src2?.vars.find(v=>v.code===item.varCode);
      return vd?{...vd,_sourceId:item.sourceId,_sourceColor:item.sourceColor,_sourceName:item.sourceName}:null;
    }).filter(Boolean);
    const dataKey = item => `${item._sourceId||item.sourceId||source.id}:${item.code}`;
    const allYears = [...new Set([
      ...Object.values(multiData).flatMap(arr=>arr.filter(d=>d.year!=null).map(d=>d.year)),
      ...Object.values(cmpMultiData).flatMap(arr=>arr.filter(d=>d.year!=null).map(d=>d.year)),
    ])].sort((a,b)=>+a-+b);

    // ── Scatter + Regression ──────────────────────────────────────────────────
    if(chartType==="scatter"&&varBasket.length>=2){
      const xi=indepVar<allVarDefs.length?indepVar:0;
      const yi=depVar!==xi&&depVar<allVarDefs.length?depVar:(xi===0?1:0);
      const xDef=allVarDefs[xi]||allVarDefs[0];
      const yDef=allVarDefs[yi]||allVarDefs[1];

      // Pair data by year
      const xKey=dataKey(xDef); const yKey=dataKey(yDef);
      const xSeries=applyTransform(imputeData(multiData[xKey]||multiData[xDef?.code]||[],imputeMethod),transform);
      const ySeries=applyTransform(imputeData(multiData[yKey]||multiData[yDef?.code]||[],imputeMethod),transform);
      const pts=[];
      xSeries.forEach(xp=>{
        if(xp.value==null||isNaN(xp.value)) return;
        const yp=ySeries.find(d=>d.year===xp.year);
        if(yp?.value!=null&&!isNaN(yp.value)) pts.push({year:xp.year,x:xp.value,y:yp.value});
      });

      // Comparison country scatter points
      const cmpPts=[];
      if(cmpOn&&(cmpMultiData[xKey]||cmpMultiData[xDef?.code])&&(cmpMultiData[yKey]||cmpMultiData[yDef?.code])){
        const cxS=applyTransform(imputeData(cmpMultiData[xKey]||cmpMultiData[xDef?.code]||[],imputeMethod),transform);
        const cyS=applyTransform(imputeData(cmpMultiData[yKey]||cmpMultiData[yDef?.code]||[],imputeMethod),transform);
        cxS.forEach(xp=>{
          if(xp.value==null||isNaN(xp.value)) return;
          const yp=cyS.find(d=>d.year===xp.year);
          if(yp?.value!=null&&!isNaN(yp.value)) cmpPts.push({year:xp.year,x:xp.value,y:yp.value});
        });
      }

      if(!pts.length) return(
        <div style={{height:320,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,color:C.dim,fontFamily:C.mono}}>
          <span style={{fontSize:28}}>◌</span>
          <span>No overlapping data for these variables.</span>
          <span style={{fontSize:11}}>Make sure both variables have data in the selected time range.</span>
        </div>
      );

      const xArr=pts.map(p=>p.x), yArr=pts.map(p=>p.y);
      const reg=pts.length>=3?olsRegression(xArr,yArr):null;
      const xMin=Math.min(...xArr), xMax=Math.max(...xArr);
      const scaleWarn=xArr.length&&yArr.length&&
        Math.abs(Math.log10(Math.max(0.001,Math.abs(xArr.reduce((a,b)=>a+b,0)/xArr.length)))-
                 Math.log10(Math.max(0.001,Math.abs(yArr.reduce((a,b)=>a+b,0)/yArr.length))))>2;

      // Build regression line as 60 evenly-spaced points (reliable rendering)
      const regLineData = reg ? Array.from({length:60},(_,i)=>{
        const x = xMin + (xMax-xMin)*i/59;
        return {x:parseFloat(x.toFixed(8)), y:parseFloat((reg.a+reg.b*x).toFixed(8)), _regLine:true};
      }) : [];

      return(
        <div>
          {/* Regression stats bar */}
          {reg&&(
            <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:"5px 16px",padding:"8px 14px",background:C.surface,borderRadius:6,border:`1px solid ${C.borderHi}`,marginBottom:10,fontFamily:C.mono}}>
              <span style={{color:C.dim,fontSize:10,textTransform:"uppercase",letterSpacing:"0.1em"}}>OLS Linear Regression</span>
              <span style={{fontSize:11}}>
                <span style={{color:C.dim}}>Ŷ = </span>
                <span style={{color:C.gold,fontWeight:700}}>{reg.a>=0?"+":""}{Number(reg.a).toExponential(3)}</span>
                <span style={{color:C.gold}}> {reg.b>=0?"+":""}{Number(reg.b).toExponential(3)}X</span>
              </span>
              <span style={{fontSize:11}}>
                <span style={{color:C.dim}}>R² = </span>
                <span style={{fontWeight:700,color:reg.r2>0.7?C.teal:reg.r2>0.4?C.gold:C.red}}>{reg.r2.toFixed(4)}</span>
              </span>
              <span style={{fontSize:11}}><span style={{color:C.dim}}>n = </span><span style={{color:C.text}}>{reg.n}</span></span>
              <span style={{fontSize:11}}><span style={{color:C.dim}}>SE = </span><span style={{color:C.text}}>{Number(reg.se).toExponential(3)}</span></span>
              <span style={{padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700,
                background:reg.r2>0.7?`${C.teal}18`:reg.r2>0.4?`${C.gold}18`:`${C.red}18`,
                color:reg.r2>0.7?C.teal:reg.r2>0.4?C.gold:C.red,
                border:`1px solid ${reg.r2>0.7?C.teal:reg.r2>0.4?C.gold:C.red}55`}}>
                {reg.r2>0.7?"● Strong fit":reg.r2>0.4?"● Moderate fit":reg.r2>0.15?"● Weak fit":"● No fit"}
              </span>
              {scaleWarn&&(
                <span style={{padding:"2px 8px",borderRadius:4,fontSize:10,color:C.orange,background:`${C.orange}15`,border:`1px solid ${C.orange}44`}}>
                  ⚠︎ Scale mismatch — use Min-Max transform
                </span>
              )}
            </div>
          )}
          {/* Scatter chart using ComposedChart for reliable regression line */}
          <ResponsiveContainer width="100%" height={310}>
            <ScatterChart margin={{top:10,right:24,left:10,bottom:36}}>
              <CartesianGrid stroke={T.border} strokeOpacity={0.8}/>
              <XAxis
                type="number" dataKey="x" name={xDef.name.substring(0,28)}
                tick={{fill:T.mid,fontSize:10,fontFamily:C.mono}}
                axisLine={{stroke:T.border}} tickLine={false}
                tickFormatter={v=>fmtVal(v,xDef.fmt)}
                label={{value:`${xDef.name.substring(0,38)} (X — Independent)`,position:"insideBottom",offset:-22,fill:T.mid,fontSize:10,fontFamily:C.mono}}
                domain={["auto","auto"]}
              />
              <YAxis
                type="number" dataKey="y" name={yDef.name.substring(0,28)}
                tick={{fill:T.mid,fontSize:10,fontFamily:C.mono}}
                axisLine={false} tickLine={false} width={80}
                tickFormatter={v=>fmtVal(v,yDef.fmt)}
                label={{value:`${yDef.name.substring(0,22)} (Y — Dep.)`,angle:-90,position:"insideLeft",offset:10,fill:T.mid,fontSize:10,fontFamily:C.mono}}
              />
              <ZAxis range={[45,45]}/>
              <Tooltip cursor={{strokeDasharray:"3 3",stroke:C.gold+"55"}}
                content={({payload})=>{
                  if(!payload?.length) return null;
                  const d=payload[0]?.payload;
                  if(!d) return null;
                  return(
                    <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:6,padding:"10px 14px",fontFamily:C.mono,fontSize:11}}>
                      <div style={{color:C.gold,fontWeight:700,marginBottom:6}}>Year {d.year}</div>
                      <div style={{marginBottom:3}}><span style={{color:ACCENT[0]}}>X: </span><span style={{color:C.text,fontWeight:600}}>{fmtVal(d.x,xDef.fmt)}</span></div>
                      <div style={{marginBottom:3}}><span style={{color:ACCENT[1]}}>Y: </span><span style={{color:C.text,fontWeight:600}}>{fmtVal(d.y,yDef.fmt)}</span></div>
                      {reg&&<div style={{color:C.dim,marginTop:4,paddingTop:4,borderTop:`1px solid ${C.border}`}}>Predicted Ŷ: {fmtVal(reg.a+reg.b*d.x,yDef.fmt)}</div>}
                      {reg&&<div style={{color:C.dim}}>Residual: {fmtVal(d.y-(reg.a+reg.b*d.x),yDef.fmt)}</div>}
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{color:T.mid,fontSize:11,fontFamily:C.mono,paddingTop:6}} iconType="circle"/>
              {/* Main scatter — observations */}
              <Scatter
                name={`${cc.name} · ${pts.length} obs`}
                data={pts} fill={C.gold} opacity={0.85}
                shape={(props)=>{
                  const{cx,cy}=props;
                  if(!cx||!cy) return null;
                  return<circle cx={cx} cy={cy} r={5} fill={C.gold} stroke={C.surface} strokeWidth={1.5} opacity={0.85}/>;
                }}
              />
              {/* Comparison country scatter */}
              {cmpPts.length>0&&(
                <Scatter
                  name={`${cmpC.name} · ${cmpPts.length} obs`}
                  data={cmpPts} fill={C.teal} opacity={0.75}
                  shape={(props)=>{
                    const{cx,cy}=props;
                    if(!cx||!cy) return null;
                    return<circle cx={cx} cy={cy} r={5} fill={C.teal} stroke={C.surface} strokeWidth={1.5} opacity={0.75}/>;
                  }}
                />
              )}
              {/* Regression line — 60 interpolated points rendered as connected line */}
              {regLineData.length>0&&(
                <Scatter
                  name={`OLS Fit (R²=${reg.r2.toFixed(3)})`}
                  data={regLineData}
                  fill="none"
                  line={{stroke:C.red, strokeWidth:2.5, strokeDasharray:"none"}}
                  lineType="fitting"
                  shape={()=>null}
                  legendType="line"
                  isAnimationActive={false}
                />
              )}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // Composite index mode
    if(showComposite&&varBasket.length>=2&&["area","line","bar"].includes(chartType)){
      const seriesList=allVarDefs.map(vd=>{const dk=dataKey?dataKey(vd):`${vd._sourceId||source.id}:${vd.code}`;return{name:vd.name.substring(0,18)+" ["+(vd._sourceName||source.short)+"]",data:applyTransform(imputeData(multiData[dk]||multiData[vd.code]||[],imputeMethod),transform)};});
      const compositeData=buildComposite(seriesList,compWeights.slice(0,varBasket.length),compNorm,compAgg);
      const chartD=compositeData.map(d=>({year:d.year,"Composite Index":d.value}));
      const ax={x:<XAxis dataKey="year" tick={{fill:T.mid,fontSize:11,fontFamily:C.mono}} axisLine={{stroke:T.border}} tickLine={false}/>,y:<YAxis tick={{fill:T.mid,fontSize:11,fontFamily:C.mono}} axisLine={false} tickLine={false} width={60}/>,g:<CartesianGrid stroke={T.border} strokeOpacity={0.8} vertical={false}/>,t:<Tooltip contentStyle={{background:C.surface,border:`1px solid ${C.borderHi}`,fontFamily:C.mono,fontSize:11}}/>,l:<Legend wrapperStyle={{color:T.mid,fontSize:11,fontFamily:C.mono}}/>};
      const anim={ isAnimationActive:animate, animationDuration:animate?1400:0 };
      if (chartType==="bar") return(<BarChart data={chartD} margin={{top:10,right:16,left:0,bottom:0}}>{ax.g}{ax.x}{ax.y}{ax.t}{ax.l}<Bar dataKey="Composite Index" fill={C.purple} radius={[4,4,0,0]} {...anim}/></BarChart>);
      if (chartType==="line") return(<LineChart data={chartD} margin={{top:10,right:16,left:0,bottom:0}}>{ax.g}{ax.x}{ax.y}{ax.t}{ax.l}<Line dataKey="Composite Index" stroke={C.purple} strokeWidth={2.5} dot={false} {...anim}/></LineChart>);
      return(<AreaChart data={chartD} margin={{top:10,right:16,left:0,bottom:0}}>{ax.g}{ax.x}{ax.y}{ax.t}{ax.l}<defs><linearGradient id="compGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.purple} stopOpacity={.3}/><stop offset="95%" stopColor={C.purple} stopOpacity={0}/></linearGradient></defs><Area dataKey="Composite Index" stroke={C.purple} fill="url(#compGrad)" strokeWidth={2.5} dot={false} {...anim}/></AreaChart>);
    }

    // Standard multi-variable chart
    const multiChartData = allYears.map(year=>{
      const row={year};
      allVarDefs.forEach(vd=>{
        const dk=dataKey(vd);
        // Primary country
        const primarySeries=applyTransform(imputeData(multiData[dk]||[],imputeMethod),transform);
        const pt=primarySeries.find(d=>d.year===year);
        const primaryKey=`${cc.flag} ${cc.name}: ${vd.name.substring(0,18)} [${vd._sourceName||source.short}]`;
        row[primaryKey]=pt?.value??null;
        // Comparison country
        if(cmpOn&&cmpMultiData[dk]){
          const cmpSeries=applyTransform(imputeData(cmpMultiData[dk]||[],imputeMethod),transform);
          const cmpPt=cmpSeries.find(d=>d.year===year);
          const cmpKey=`${cmpC.flag} ${cmpC.name}: ${vd.name.substring(0,18)} [${vd._sourceName||source.short}]`;
          row[cmpKey]=cmpPt?.value??null;
        }
      });
      return row;
    });

    const allKeys=[];
    allVarDefs.forEach((vd,i)=>{
      const dk=dataKey(vd);
      const primaryKey=`${cc.flag} ${cc.name}: ${vd.name.substring(0,18)} [${vd._sourceName||source.short}]`;
      allKeys.push(primaryKey);
      if(cmpOn&&cmpMultiData[dk]){
        const cmpKey=`${cmpC.flag} ${cmpC.name}: ${vd.name.substring(0,18)} [${vd._sourceName||source.short}]`;
        allKeys.push(cmpKey);
      }
    });

    const allVals=multiChartData.flatMap(d=>allKeys.map(k=>d[k]||0)).filter(v=>v!=null&&!isNaN(v));
    const avgVal=allVals.length?allVals.reduce((a,b)=>a+b,0)/allVals.length:0;
    const maxVal=allVals.length?Math.max(...allVals):0;
    const minVal=allVals.length?Math.min(...allVals):0;

    const ax={
      x:<XAxis dataKey="year" tick={{fill:T.mid,fontSize:11,fontFamily:C.mono}} axisLine={{stroke:T.border}} tickLine={false}/>,
      y:<YAxis tick={{fill:T.mid,fontSize:11,fontFamily:C.mono}} axisLine={false} tickLine={false} tickFormatter={v=>fmtVal(v,currentVar.fmt)} width={74}/>,
      g:<CartesianGrid stroke={T.border} strokeOpacity={0.8} vertical={false}/>,
      t:<Tooltip content={<CustomTip fmt={currentVar.fmt}/>}/>,
      l:<Legend wrapperStyle={{color:T.mid,fontSize:10,fontFamily:C.mono,paddingTop:8}} iconType="circle"
          formatter={(value)=>value.replace("RAW","Original").replace(/:/g,": ").substring(0,40)}/>,
      refAvg:<ReferenceLine y={avgVal} stroke={C.gold} strokeDasharray="6 3" strokeWidth={1} label={{value:`avg`,fill:C.gold,fontSize:10,fontFamily:C.mono}}/>,
      refMax:<ReferenceLine y={maxVal} stroke={C.teal} strokeDasharray="4 4" strokeWidth={1} label={{value:`max`,fill:C.teal,fontSize:10,fontFamily:C.mono}}/>,
      refMin:<ReferenceLine y={minVal} stroke={C.red}  strokeDasharray="4 4" strokeWidth={1} label={{value:`min`,fill:C.red,fontSize:10,fontFamily:C.mono}}/>,
    };
    const chartFmt=currentVar.fmt;

    // ── Summary Statistics view ──────────────────────────────────────────────
    if(chartType==="stats"){
      const statsRows=allVarDefs.map((vd,i)=>{
        const dk=dataKey(vd);
        const series=applyTransform(imputeData(multiData[dk]||[],appliedImpute),appliedTransform);
        const s=summaryStats(series);
        return {name:vd.name,color:ACCENT[i%ACCENT.length],fmt:vd.fmt,stats:s};
      }).filter(r=>r.stats);
      if(!statsRows.length) return <div style={{height:260,display:"flex",alignItems:"center",justifyContent:"center",color:C.dim,fontFamily:C.mono}}>No data to summarize</div>;
      // Bar chart comparing means with error bars (std)
      const meanData=statsRows.map((r,i)=>({
        name:r.name.substring(0,14),
        fullName:r.name,
        mean:r.stats.mean,
        std:r.stats.std,
        fmt:r.fmt,
        color:ACCENT[i%ACCENT.length],
        // Normalized bar height (0-100) so tiny-unit vars still show a visible bar
        normHeight: r.stats.max!==0 ? Math.abs(r.stats.mean)/Math.abs(r.stats.max)*100 : 0,
      }));
      return(
        <div>
          {/* Stats table - SPSS style */}
          <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.1em"}}>Descriptive Statistics</div>
          <div style={{overflowX:"auto",marginBottom:16,border:`1px solid ${C.border}`,borderRadius:6}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontFamily:C.mono,fontSize:11,minWidth:640}}>
              <thead>
                <tr style={{background:C.surface}}>
                  <th rowSpan={2} style={{color:C.mid,padding:"8px 10px",textAlign:"left",fontSize:10,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,verticalAlign:"bottom"}}>Variable</th>
                  <th rowSpan={2} style={{color:C.mid,padding:"8px 10px",textAlign:"right",fontSize:10,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,verticalAlign:"bottom"}}>N</th>
                  <th rowSpan={2} style={{color:C.mid,padding:"8px 10px",textAlign:"right",fontSize:10,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,verticalAlign:"bottom"}}>Minimum</th>
                  <th rowSpan={2} style={{color:C.mid,padding:"8px 10px",textAlign:"right",fontSize:10,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,verticalAlign:"bottom"}}>Maximum</th>
                  <th rowSpan={2} style={{color:C.mid,padding:"8px 10px",textAlign:"right",fontSize:10,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,verticalAlign:"bottom"}}>Mean</th>
                  <th rowSpan={2} style={{color:C.mid,padding:"8px 10px",textAlign:"right",fontSize:10,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,verticalAlign:"bottom"}}>Std. Dev.</th>
                  <th colSpan={2} style={{color:C.gold,padding:"6px 10px",textAlign:"center",fontSize:10,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,borderLeft:`1px solid ${C.border}`}}>Skewness</th>
                  <th colSpan={2} style={{color:C.orange,padding:"6px 10px",textAlign:"center",fontSize:10,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`,borderLeft:`1px solid ${C.border}`}}>Kurtosis</th>
                </tr>
                <tr style={{background:C.surface}}>
                  <th style={{color:C.dim,padding:"4px 10px",textAlign:"right",fontSize:10,borderBottom:`1px solid ${C.border}`,borderLeft:`1px solid ${C.border}`}}>Statistic</th>
                  <th style={{color:C.dim,padding:"4px 10px",textAlign:"right",fontSize:10,borderBottom:`1px solid ${C.border}`}}>Std. Error</th>
                  <th style={{color:C.dim,padding:"4px 10px",textAlign:"right",fontSize:10,borderBottom:`1px solid ${C.border}`,borderLeft:`1px solid ${C.border}`}}>Statistic</th>
                  <th style={{color:C.dim,padding:"4px 10px",textAlign:"right",fontSize:10,borderBottom:`1px solid ${C.border}`}}>Std. Error</th>
                </tr>
              </thead>
              <tbody>
                {statsRows.map((r,i)=>{
                  const seSkew=r.stats.n>0?Math.sqrt(6/r.stats.n):0;
                  const seKurt=r.stats.n>0?Math.sqrt(24/r.stats.n):0;
                  return(
                  <tr key={i} style={{background:i%2?`${C.surface}88`:"transparent"}}>
                    <td style={{padding:"7px 10px",color:r.color,fontWeight:600,whiteSpace:"nowrap"}}>● {r.name.substring(0,22)}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:C.text}}>{r.stats.n}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:C.text}}>{fmtVal(r.stats.min,r.fmt)}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:C.text}}>{fmtVal(r.stats.max,r.fmt)}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:C.text,fontWeight:600}}>{fmtVal(r.stats.mean,r.fmt)}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:C.text}}>{fmtVal(r.stats.std,r.fmt)}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:Math.abs(r.stats.skew)>1?C.red:C.text,borderLeft:`1px solid ${C.border}`}}>{r.stats.skew.toFixed(3)}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:C.mid}}>{seSkew.toFixed(3)}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:Math.abs(r.stats.kurt)>1?C.orange:C.text,borderLeft:`1px solid ${C.border}`}}>{r.stats.kurt.toFixed(3)}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:C.mid}}>{seKurt.toFixed(3)}</td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
          {/* Extra stats row: Median, Q1, Q3, CV */}
          <div style={{overflowX:"auto",marginBottom:16}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontFamily:C.mono,fontSize:11,minWidth:500}}>
              <thead><tr style={{background:C.surface}}>
                {["Variable","Median","Q1","Q3","IQR","CV%"].map(h=>(
                  <th key={h} style={{color:C.dim,padding:"6px 10px",textAlign:h==="Variable"?"left":"right",fontSize:10,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {statsRows.map((r,i)=>(
                  <tr key={i} style={{background:i%2?`${C.surface}88`:"transparent"}}>
                    <td style={{padding:"6px 10px",color:r.color,fontWeight:600,whiteSpace:"nowrap"}}>● {r.name.substring(0,22)}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.text}}>{fmtVal(r.stats.median,r.fmt)}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.text}}>{fmtVal(r.stats.q1,r.fmt)}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.text}}>{fmtVal(r.stats.q3,r.fmt)}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.text}}>{fmtVal(r.stats.iqr,r.fmt)}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.teal}}>{r.stats.cv.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mean comparison — normalized so every variable's bar is visible regardless of unit */}
          <div style={{color:C.text,fontSize:11,fontFamily:C.mono,marginBottom:2,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700}}>Mean Comparison</div>
          <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,marginBottom:8}}>Bars scaled to each variable's own range (mixed units) — hover for actual values</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={meanData} margin={{top:20,right:16,left:0,bottom:0}}>
              <CartesianGrid stroke={T.border} strokeOpacity={0.8} vertical={false}/>
              <XAxis dataKey="name" tick={{fill:T.text,fontSize:10,fontFamily:C.mono}} axisLine={{stroke:T.border}} interval={0} angle={0}/>
              <YAxis tick={{fill:T.mid,fontSize:10,fontFamily:C.mono}} axisLine={false} tickLine={false} width={44} domain={[0,100]} tickFormatter={v=>v+"%"} label={{value:"% of variable max",angle:-90,position:"insideLeft",fill:T.mid,fontSize:10,fontFamily:C.mono}}/>
              <Tooltip cursor={{fill:`${C.gold}11`}} content={({payload})=>{
                if(!payload?.length) return null;
                const d=payload[0]?.payload; if(!d) return null;
                return(
                  <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:6,padding:"10px 14px",fontFamily:C.mono,fontSize:11}}>
                    <div style={{color:d.color,fontWeight:700,marginBottom:5}}>{d.fullName.substring(0,30)}</div>
                    <div style={{color:C.text}}>Mean: <b>{fmtVal(d.mean,d.fmt)}</b></div>
                    <div style={{color:C.mid}}>Std Dev: {fmtVal(d.std,d.fmt)}</div>
                  </div>
                );
              }}/>
              <Bar dataKey="normHeight" radius={[4,4,0,0]} label={{position:"top",fill:T.text,fontSize:10,fontFamily:C.mono,formatter:(v)=>""}}>
                {meanData.map((e,i)=><Cell key={i} fill={e.color}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* Real value labels under chart */}
          <div style={{display:"flex",flexWrap:"wrap",gap:10,marginTop:8,justifyContent:"center"}}>
            {meanData.map((d,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:5,fontFamily:C.mono,fontSize:10}}>
                <span style={{width:8,height:8,borderRadius:2,background:d.color,flexShrink:0}}/>
                <span style={{color:C.text}}>{d.name}: <b style={{color:d.color}}>{fmtVal(d.mean,d.fmt)}</b></span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // ── Distribution / Normal curve view (bell-curve style) ──────────────────
    if(chartType==="dist"){
      const di=distVar<allVarDefs.length?distVar:0;
      const vd=allVarDefs[di];
      if(!vd) return <div style={{height:260,display:"flex",alignItems:"center",justifyContent:"center",color:C.dim,fontFamily:C.mono}}>Select a variable</div>;
      const dk=dataKey(vd);
      const series=applyTransform(imputeData(multiData[dk]||[],appliedImpute),appliedTransform);
      const s=summaryStats(series);
      if(!s||!s.std) return <div style={{height:260,display:"flex",alignItems:"center",justifyContent:"center",color:C.dim,fontFamily:C.mono}}>No data to plot</div>;
      const vcolor=ACCENT[di%ACCENT.length];
      // Choose curve based on selected type
      const normal=normalCurve(s.mean,s.std,120);
      const skewed=skewNormalCurve(s.mean,s.std,s.skew,120);
      const activeCurve = distCurveType==="skew" ? skewed : normal;
      const maxDens=Math.max(...activeCurve.map(c=>c.density),0.0001);
      const curveData=activeCurve.map(c=>({x:c.x, y:c.density}));
      // Histogram (for histogram type) — merge bars + fitted curve into ONE aligned dataset
      const hist=histogram(series,20);
      const maxCount=Math.max(...hist.map(h=>h.count),1);
      const binWidth = hist.length>1 ? (hist[1].bin-hist[0].bin) : s.std;
      // For each histogram bin, compute the fitted-curve height at that bin center (scaled to counts)
      const fitCurve = distCurveType==="skew"?skewed:normal;
      const curveAt = (x)=>{
        // nearest curve point density
        let nearest=fitCurve[0], best=Infinity;
        for(const c of fitCurve){ const d=Math.abs(c.x-x); if(d<best){best=d;nearest=c;} }
        return (nearest.density/maxDens)*maxCount;
      };
      const histData = hist.map(h=>({x:h.bin, count:h.count, curve:curveAt(h.bin)}));
      const sigmaMarks=[-3,-2,-1,0,1,2,3].map(k=>({
        k, x:s.mean+k*s.std,
        label:k===0?"Mean (μ)":`μ ${k>0?"+":"-"} ${Math.abs(k)}σ`,
      }));
      return(
        <div>
          {/* Variable selector */}
          {allVarDefs.length>1&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
              <span style={{color:C.dim,fontSize:10,fontFamily:C.mono,textTransform:"uppercase",letterSpacing:"0.1em",width:"100%",marginBottom:2}}>Variable:</span>
              {allVarDefs.map((v,i)=>(
                <button key={i} onClick={()=>setDistVar(i)} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:6,cursor:"pointer",fontFamily:C.mono,fontSize:10,border:`1px solid ${i===di?ACCENT[i%ACCENT.length]:C.border}`,background:i===di?`${ACCENT[i%ACCENT.length]}22`:"transparent",color:i===di?ACCENT[i%ACCENT.length]:C.mid,fontWeight:i===di?700:400}}>
                  <span style={{width:8,height:8,borderRadius:"50%",background:ACCENT[i%ACCENT.length],flexShrink:0}}/>
                  {v.name.substring(0,16)}
                </button>
              ))}
            </div>
          )}
          {/* Curve type + animate controls */}
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8,alignItems:"center"}}>
            <span style={{color:C.dim,fontSize:10,fontFamily:C.mono,textTransform:"uppercase",letterSpacing:"0.1em"}}>Curve:</span>
            {[["normal","Normal Bell"],["skew","Skew-adjusted"],["histogram","Histogram + Curve"]].map(([id,label])=>(
              <button key={id} onClick={()=>setDistCurveType(id)} style={{padding:"4px 10px",borderRadius:6,cursor:"pointer",fontFamily:C.mono,fontSize:10,border:`1px solid ${distCurveType===id?C.teal:C.border}`,background:distCurveType===id?`${C.teal}22`:"transparent",color:distCurveType===id?C.teal:C.mid,fontWeight:distCurveType===id?700:400}}>{label}</button>
            ))}
            <button onClick={()=>{setAnimate(true);setAnimTick(t=>t+1);}} style={{marginLeft:"auto",padding:"4px 12px",borderRadius:6,cursor:"pointer",fontFamily:C.mono,fontSize:10,border:`1px solid ${C.gold}`,background:`${C.gold}22`,color:C.gold,fontWeight:700}}>▶ {animTick>0?"Replay":"Animate"}</button>
          </div>
          {/* Stats bar */}
          <div style={{display:"flex",flexWrap:"nowrap",alignItems:"center",gap:10,marginBottom:10,padding:"7px 12px",background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:6,fontFamily:C.mono,fontSize:11,overflowX:"auto",whiteSpace:"nowrap"}}>
            <span style={{color:vcolor,fontWeight:700,flexShrink:0}}>{vd.name.substring(0,20)}</span>
            <span style={{flexShrink:0}}><span style={{color:C.dim}}>μ=</span><span style={{color:C.text}}>{fmtVal(s.mean,vd.fmt)}</span></span>
            <span style={{flexShrink:0}}><span style={{color:C.dim}}>σ=</span><span style={{color:C.text}}>{fmtVal(s.std,vd.fmt)}</span></span>
            <span style={{flexShrink:0}}><span style={{color:C.dim}}>skew=</span><span style={{color:Math.abs(s.skew)>1?C.red:C.text}}>{s.skew.toFixed(3)}</span></span>
            <span style={{padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700,flexShrink:0,background:Math.abs(s.skew)<0.5?`${C.teal}18`:`${C.orange}18`,color:Math.abs(s.skew)<0.5?C.teal:C.orange}}>{Math.abs(s.skew)<0.5?"≈ Symmetric":s.skew>0?"→ Right-skewed":"← Left-skewed"}</span>
          </div>
          <div style={{background:C.bg,borderRadius:6,padding:"16px 10px 8px",border:`1px solid ${C.border}`}}>
            {distCurveType==="histogram" ? (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={histData} margin={{top:20,right:20,left:10,bottom:10}}>
                  <CartesianGrid stroke={C.border} strokeOpacity={0.8} vertical={false}/>
                  <XAxis dataKey="x" type="number" scale="linear" domain={["dataMin","dataMax"]} tick={{fill:C.text,fontSize:10,fontFamily:C.mono}} axisLine={{stroke:C.border}} tickLine={false} tickFormatter={v=>fmtVal(v,vd.fmt)} height={36}/>
                  <YAxis tick={{fill:C.mid,fontSize:10,fontFamily:C.mono}} axisLine={false} tickLine={false} width={40} label={{value:"Frequency",angle:-90,position:"insideLeft",fill:C.mid,fontSize:10,fontFamily:C.mono}}/>
                  <Tooltip contentStyle={{background:C.surface,border:`1px solid ${C.borderHi}`,fontFamily:C.mono,fontSize:11}} labelFormatter={v=>`x = ${fmtVal(v,vd.fmt)}`}/>
                  <Bar dataKey="count" name="Observed frequency" fill={vcolor} opacity={0.85} isAnimationActive={animate} animationDuration={animate?1200:0} maxBarSize={40}/>
                  <Line dataKey="curve" name="Fitted curve" stroke={C.teal} strokeWidth={2.5} dot={false} type="monotone" isAnimationActive={animate} animationDuration={animate?1600:0}/>
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={curveData} margin={{top:20,right:20,left:10,bottom:10}}>
                  <defs>
                    <linearGradient id="bellGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={distCurveType==="skew"?C.orange:C.teal} stopOpacity={0.25}/>
                      <stop offset="100%" stopColor={distCurveType==="skew"?C.orange:C.teal} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="x" type="number" domain={["dataMin","dataMax"]} ticks={sigmaMarks.map(m=>m.x)} tickFormatter={(v)=>{const m=sigmaMarks.find(mm=>Math.abs(mm.x-v)<0.001);return m?fmtVal(v,vd.fmt):"";}} tick={{fill:C.text,fontSize:10,fontFamily:C.mono}} axisLine={{stroke:C.border}} tickLine={false} height={40}/>
                  <YAxis hide domain={[0,maxDens*1.15]}/>
                  <Area type="monotone" dataKey="y" stroke={distCurveType==="skew"?C.orange:C.teal} strokeWidth={2.5} fill="url(#bellGrad)" isAnimationActive={animate} animationDuration={animate?1600:0} dot={false}/>
                  <ReferenceLine x={s.mean} stroke="#fff" strokeWidth={1.5} strokeDasharray="4 3"/>
                  {distCurveType==="skew"&&<ReferenceLine x={s.median} stroke={C.gold} strokeWidth={1.5} strokeDasharray="4 3" label={{value:"median",fill:C.gold,fontSize:10,position:"top"}}/>}
                </ComposedChart>
              </ResponsiveContainer>
            )}
            <div style={{textAlign:"center",marginTop:10,color:C.mid,fontSize:10,fontFamily:C.mono}}>
              {distCurveType==="skew"
                ? <>Skew-adjusted curve · mean (white) vs median (gold) shows the {s.skew>0?"right":"left"} shift · skewness = {s.skew.toFixed(3)}</>
                : distCurveType==="histogram"
                ? <>Observed histogram with fitted {Math.abs(s.skew)<0.5?"normal":"reference"} curve · μ = {fmtVal(s.mean,vd.fmt)} · σ = {fmtVal(s.std,vd.fmt)}</>
                : <>Normal (symmetric) curve · μ = {fmtVal(s.mean,vd.fmt)} · σ = {fmtVal(s.std,vd.fmt)}</>}
            </div>
          </div>
        </div>
      );
    }

    if(chartType==="bar") return(
      <BarChart data={multiChartData} margin={{top:10,right:16,left:0,bottom:0}}>
        {ax.g}{ax.x}{ax.y}{ax.t}{ax.l}{ax.refAvg}{ax.refMax}{ax.refMin}
        {allKeys.map((k,i)=>{
          const dn3=k.replace("RAW","(Orig)").substring(0,30);
          return<Bar key={k} dataKey={k} radius={[4,4,0,0]} name={dn3} opacity={k.includes("RAW")?0.4:1} isAnimationActive={animate} animationDuration={animate?1400:0}>
            {multiChartData.map((entry,idx)=><Cell key={idx} fill={i===0?getValueColor(entry[k],allVals):ACCENT[(i+1)%ACCENT.length]}/>)}
          </Bar>;
        })}
      </BarChart>
    );
    if(chartType==="area") return(
      <AreaChart data={multiChartData} margin={{top:10,right:16,left:0,bottom:0}}>
        <defs>{allKeys.map((k,i)=><linearGradient key={k} id={`ag${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={ACCENT[i%ACCENT.length]} stopOpacity={.3}/><stop offset="95%" stopColor={ACCENT[i%ACCENT.length]} stopOpacity={0}/></linearGradient>)}</defs>
        {ax.g}{ax.x}{ax.y}{ax.t}{ax.l}{ax.refAvg}{ax.refMax}{ax.refMin}
        {allKeys.map((k,i)=>{
          const isRaw2=k.includes("RAW");
          const dn2=k.replace("RAW","Original").substring(0,30);
          return<Area key={k} dataKey={k} isAnimationActive={animate} animationDuration={animate?1400:0} stroke={isRaw2?ACCENT[i%ACCENT.length]+"66":ACCENT[i%ACCENT.length]} fill={isRaw2?"transparent":`url(#ag${i})`} strokeWidth={isRaw2?1.5:2.5} strokeDasharray={isRaw2?"5 3":undefined} name={dn2} dot={isRaw2?false:(props)=>{const{cx,cy,value}=props;const col=getValueColor(value,allVals);return<circle key={cx+cy} cx={cx} cy={cy} r={3.5} fill={col} stroke={T.surface} strokeWidth={1.5}/>;}} />;
        })}
      </AreaChart>
    );
    return(
      <LineChart data={multiChartData} margin={{top:10,right:16,left:0,bottom:0}}>
        {ax.g}{ax.x}{ax.y}{ax.t}{ax.l}{ax.refAvg}{ax.refMax}{ax.refMin}
        {allKeys.map((k,i)=>{
          const isRaw=k.includes("RAW");
          const displayName=k.replace("RAW","Original").substring(0,35);
          return<Line key={k} dataKey={k} isAnimationActive={animate} animationDuration={animate?1400:0} stroke={isRaw?ACCENT[i%ACCENT.length]+"66":ACCENT[i%ACCENT.length]} strokeWidth={isRaw?1.5:2.5} strokeDasharray={isRaw?"5 3":undefined} name={displayName} dot={isRaw?false:(props)=>{const{cx,cy,value}=props;const col=getValueColor(value,allVals);return<circle key={cx+cy} cx={cx} cy={cy} r={4} fill={col} stroke={T.surface} strokeWidth={2}/>;}} />;
        })}
      </LineChart>
    );
  };

  // AI Insight
  const getInsight=async()=>{
    if(!data.length) return;
    setAiLoading(true);setInsight("");setAiError("");
    try{
      const summary=data.slice(-15).map(d=>`${d.year}:${fmtVal(d.value,currentVar.fmt)}`).join(", ");
      const sr=await fetch("/api/insight",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({country:cc.name,indicator:currentVar.name,source:source.name,startYear,endYear,dataPoints:summary})
      });
      const j=await sr.json();
      if(!sr.ok) throw new Error(j?.error?.message||"Server error");
      if(j.error) throw new Error(j.error.message||"API error");
      setInsight(j.content?.[0]?.text||"Analysis unavailable.");
    }catch(e){
      setAiError("AI error: "+e.message);
    }
    setAiLoading(false);
  };

  return (
    <div style={{background:T.bgGrad||T.bg,minHeight:"100vh",fontFamily:C.font,color:T.text,display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden"}}>

      {/* HEADER */}
      <header style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:isMobile?"10px 12px":"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:isMobile?8:12}}>
          {isMobile&&<button onClick={()=>setSidebarOpen(o=>!o)} style={{background:C.gold,border:"none",cursor:"pointer",padding:9,borderRadius:6,display:"flex",flexDirection:"column",gap:4,flexShrink:0}}><span style={{display:"block",width:18,height:2,background:C.onGold,borderRadius:2}}/><span style={{display:"block",width:18,height:2,background:C.onGold,borderRadius:2}}/><span style={{display:"block",width:18,height:2,background:C.onGold,borderRadius:2}}/></button>}
          <div style={{width:32,height:32,background:`${C.gold}`,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,color:C.onGold,fontWeight:700}}>◈</div>
          <div>
            <div style={{fontSize:15,fontWeight:700,letterSpacing:"-0.3px",lineHeight:1}}>EcoScope</div>
            {!isMobile&&<div style={{fontSize:10,color:C.dim,fontFamily:C.mono,letterSpacing:"0.08em"}}>GLOBAL ECONOMIC INTELLIGENCE</div>}
          </div>
          <div style={{width:1,height:28,background:C.border,margin:"0 6px"}}/>
          {!isMobile&&<div style={{fontSize:11,color:C.dim,fontFamily:C.mono}}>{source.short} · {cc.flag} {cc.name} · {currentVar.name.substring(0,30)} · {startYear}–{endYear}</div>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,position:"relative"}}>
          {/* Global reload button */}
          <button onClick={forceRefresh} disabled={loading} title="Reload data" style={{background:"none",border:`1px solid ${loading?C.teal:C.border}`,borderRadius:6,color:loading?C.teal:C.mid,cursor:loading?"wait":"pointer",padding:isMobile?"7px 9px":"7px 11px",fontSize:isMobile?13:12,display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <span style={{display:"inline-block",animation:loading?"spin 0.8s linear infinite":"none"}}>↻</span>
            {!isMobile&&<span style={{fontFamily:C.mono,fontSize:11}}>{loading?"Loading…":"Reload"}</span>}
          </button>
          {/* User avatar button */}
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowUserMenu(v=>!v)} style={{display:"flex",alignItems:"center",gap:8,background:C.card,border:`1px solid ${showUserMenu?C.gold:C.border}`,borderRadius:6,padding:"5px 14px 5px 6px",cursor:"pointer",transition:"border-color .15s"}}>
              <div style={{width:26,height:26,borderRadius:"50%",background:user.avatarColor||C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#0b0e14",flexShrink:0}}>{user.initials||"U"}</div>
              <span style={{color:T.text,fontSize:12,fontFamily:C.mono,fontWeight:600}}>{user.username}</span>
              <span style={{background:plan.color,color:C.onGold,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700,fontFamily:C.mono,marginLeft:4}}>{plan.badge}</span>
              <span style={{color:C.mid,fontSize:10,marginLeft:2}}>{showUserMenu?"▲":"▼"}</span>
            </button>
            {showUserMenu&&(
              <div style={{position:"fixed",top:60,right:isMobile?8:20,left:isMobile?8:"auto",background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:8,padding:"6px",minWidth:isMobile?"auto":220,boxShadow:C.shadow,zIndex:300}}>
                {/* Signed in as */}
                <div style={{padding:"10px 14px 10px",borderBottom:`1px solid ${C.border}`,marginBottom:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                    <div style={{width:34,height:34,borderRadius:"50%",background:user.avatarColor||C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#0b0e14",flexShrink:0}}>{user.initials||"U"}</div>
                    <div><div style={{color:C.text,fontSize:12,fontWeight:700}}>{user.username}</div><div style={{color:C.mid,fontSize:11,fontFamily:C.mono}}>{user.email||"demo@ecoscope.app"}</div></div>
                  </div>
                </div>
                {/* Menu items */}
                {[
                  {icon:<Ico n="user"/>,label:"Account",action:()=>openSettings("account")},
                  {icon:<Ico n="lock"/>,label:"Password & security",action:()=>openSettings("security")},
                  {icon:<Ico n="globe"/>,label:"Data sources",action:()=>openSettings("sources")},
                  {icon:<Ico n="display"/>,label:"Appearance",action:()=>openSettings("theme")},
                  {icon:<Ico n="settings"/>,label:"All settings",action:()=>openSettings("data")},
                  null,
                  {icon:<Ico n="arrowup"/>,label:"Request plan upgrade",action:()=>{setShowUpgradeReq(true);setShowUserMenu(false);}},
                  {icon:<Ico n="message"/>,label:"Help & support chat",action:()=>openSupport("assistant")},
                  null,
                  {icon:"←",label:"Sign Out",action:onLogout,danger:true},
                ].map((item,i)=> item===null
                  ? <div key={i} style={{height:1,background:C.border,margin:"4px 6px"}}/>
                  : <button key={i} onClick={item.action} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 14px",borderRadius:6,border:"none",background:"transparent",cursor:"pointer",textAlign:"left",transition:"background .1s",color:item.danger?C.red:C.text}}>
                      <span style={{fontSize:13,width:18,textAlign:"center"}}>{item.icon}</span>
                      <span style={{fontSize:12,fontFamily:C.font,fontWeight:500}}>{item.label}</span>
                    </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>

        {/* Mobile overlay */}
        {isMobile&&sidebarOpen&&<div onClick={()=>setSidebarOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:98}}/>}
        {/* SIDEBAR - hidden overlay on mobile, fixed panel on desktop */}
        <aside id="scroll-sidebar" style={{
          background:T.surface,
          borderRight:`1px solid ${T.border}`,
          display:"flex",
          flexDirection:"column",
          overflowY:"auto",
          flexShrink:0,
          // Mobile: fixed drawer, hidden by default
          ...(isMobile ? {
            position:"fixed",
            top:0, left:0, bottom:0,
            width:"85vw", maxWidth:320,
            zIndex:99,
            transform:sidebarOpen?"translateX(0)":"translateX(-105%)",
            transition:"transform 0.3s ease",
            boxShadow:sidebarOpen?"8px 0 40px rgba(0,0,0,0.7)":"none",
          } : {
            // Desktop: normal flow
            position:"relative",
            width:sidebarWidth,
            minWidth:sidebarWidth,
          })
        }}>

          {isMobile&&<div style={{padding:"10px 12px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"flex-end"}}><button onClick={()=>setSidebarOpen(false)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,color:C.mid,cursor:"pointer",padding:"5px 12px",fontSize:12,fontFamily:C.mono}}>✕ Close</button></div>}
          {/* IMPORT DATA BUTTON */}
          <div style={{padding:"12px 10px 4px"}}>
            <button onClick={()=>setShowImport(true)} style={{...btn(C.gold),background:"transparent",color:C.text,border:`1px solid ${C.borderHi}`,width:"100%",padding:"8px",fontSize:12}}><Ico n="arrowup"/> Import Your Data</button>
            {importedData&&<div style={{marginTop:6,padding:"6px 8px",background:`${C.cyan}12`,border:`1px solid ${C.cyan}33`,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={{color:C.cyan,fontSize:10,fontFamily:C.mono}}>✓ {Object.keys(importedData.series).length} cols · {importedData.freq}</span><button onClick={()=>{setImportedData(null);}} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:11}}>✕</button></div>}
          </div>

          {/* DATA LEVEL TOGGLE */}
          <div style={{padding:"12px 10px 6px"}}>
            <div style={{fontSize:10,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>Data Level</div>
            <div style={{display:"flex",gap:5}}>
              {["macro","micro"].map(lvl=>(
                <button key={lvl} onClick={()=>setDataLevel(lvl)} style={{...pill(dataLevel===lvl),flex:1,textAlign:"center",textTransform:"capitalize",fontSize:11,padding:"6px 0"}}>
                  {lvl==="macro"?<><Ico n="chart"/> Macro</>:<><Ico n="flask"/> Micro</>}
                </button>
              ))}
            </div>
          </div>

          {/* SOURCE SELECTOR */}
          <div style={{padding:"6px 10px 10px"}}>
            <div style={{fontSize:10,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:7}}>Data Source</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
              {sources.map(s=>{
                const locked=PRO_SOURCES.includes(s.id)&&!plan.aiInsights;
                return(
                  <button key={s.id} onClick={()=>{
                    if(locked){setUpgradeModal({feature:`${s.name} data source`,requiredPlan:"pro"});return;}
                    setSourceId(s.id);
                  }} style={{...pill(sourceId===s.id,s.color),fontSize:11,padding:"4px 9px",opacity:locked?.6:1,position:"relative"}}>
                    {s.short}{locked&&<span style={{fontSize:9,marginLeft:3}}><Ico n="lock"/></span>}
                  </button>
                );
              })}
            </div>
            {source.note && <p style={{color:C.dim,fontSize:10,fontFamily:C.mono,margin:"7px 0 0",lineHeight:1.5}}>{source.note}</p>}
            {source.keyRequired&&!settings.fredKey&&(
              <div style={{background:`${C.red}15`,border:`1px solid ${C.red}44`,borderRadius:6,padding:"6px 9px",marginTop:7}}>
                <p style={{color:C.red,fontSize:10,fontFamily:C.mono,margin:0}}>⚠︎ API key required. Add in ⚙ Settings.</p>
              </div>
            )}
          </div>

          {/* VARIABLE BASKET */}
          {varBasket.length>0&&(
            <div style={{borderTop:`1px solid ${C.border}`,padding:"8px 10px",flexShrink:0,background:`${C.purple}06`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{fontSize:10,color:C.purple,fontFamily:C.mono,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700}}>⊕ Variable Basket ({varBasket.length}/{plan.aiInsights?10:4})</div>
                {varBasket.length>1&&<button onClick={()=>setVarBasket(vb=>vb.slice(0,1))} style={{background:"none",border:"none",color:C.red,fontSize:10,cursor:"pointer",fontFamily:C.mono}}>Clear</button>}
              </div>
              {varBasket.map((item,i)=>(
                <div key={`${item.sourceId}:${item.varCode}`} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 8px",marginBottom:3,background:`${item.sourceColor}14`,border:`1px solid ${item.sourceColor}33`,borderRadius:6}}>
                  <div style={{width:15,height:15,borderRadius:3,background:item.sourceColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:C.onGold,fontWeight:700,flexShrink:0}}>{i+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:T.text,fontSize:10,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.label.substring(0,26)}</div>
                    <div style={{color:item.sourceColor,fontSize:9,fontFamily:C.mono,opacity:.8}}>{item.sourceName}</div>
                  </div>
                  {varBasket.length>1&&<button onClick={()=>setVarBasket(vb=>vb.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:13,lineHeight:1,padding:"0 2px",flexShrink:0}}>×</button>}
                </div>
              ))}
            </div>
          )}

          {/* VARIABLE SEARCH + LIST */}
          <div style={{flex:"0 0 auto",maxHeight:"34%",display:"flex",flexDirection:"column",borderTop:`1px solid ${C.border}`,overflow:"hidden"}}>
            <div style={{padding:"9px 10px 6px",flexShrink:0}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                <div style={{fontSize:10,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase"}}>Variables <span style={{color:C.dim}}>({source.vars.length} total)</span></div>

              </div>
              <input value={varSearch} onChange={e=>setVarSearch(e.target.value)} placeholder="Search variables..." style={{...inp,fontSize:11,padding:"7px 10px"}}/>
            </div>
            <div id="scroll-varlist" style={{overflowY:"auto",flex:1,padding:"0 6px 8px"}}>
              {Object.entries(groupedVars).map(([cat,vars])=>(
                <div key={cat}>
                  <div style={{fontSize:10,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",padding:"6px 6px 3px"}}>{cat}</div>
                  {vars.map(v=>{
                    const active=varBasket.some(b=>b.sourceId===source.id&&b.varCode===v.code);
                    const inBasket=active;
                    return(
                      <button key={v.code} onClick={()=>{
                        if(isMobile) setSidebarOpen(false);
                        if(isMobile)setTimeout(()=>setSidebarOpen(false),200);
                        if(inBasket){
                          if(varBasket.length>1) setVarBasket(vb=>vb.filter(b=>!(b.sourceId===source.id&&b.varCode===v.code)));
                        } else {
                          const maxVars=plan.aiInsights?10:4; if(varBasket.length>=maxVars){setUpgradeModal({feature:`Maximum ${maxVars} variables reached`,requiredPlan:"pro"});return;}
                          if(varBasket.length>=1&&!plan.compare){setUpgradeModal({feature:"Multi-variable analysis requires Pro",requiredPlan:"pro"});return;}
                          setVarBasket(vb=>[...vb,{sourceId:source.id,varCode:v.code,label:v.name,fmt:v.fmt,sourceColor:source.color,sourceName:source.short}]);
                        }
                      }} style={{width:"100%",display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:6,border:"none",borderLeft:`2px solid ${active?source.color:"transparent"}`,background:active?`${source.color}12`:"transparent",cursor:"pointer",textAlign:"left",marginBottom:1,transition:"all .1s"}}>
                        <div style={{flex:1}}>
                          <div style={{color:active?source.color:C.text,fontSize:11,lineHeight:1.3}}>{v.name}</div>
                          <div style={{display:"flex",gap:6,alignItems:"center"}}><div style={{color:C.dim,fontSize:10,fontFamily:C.mono}}>{v.fmt}</div><div style={{color:source.color,fontSize:10,fontFamily:C.mono,opacity:.7}}>{source.short}</div></div>
                        </div>
                        {noDataVars.has(`${source.id}:${v.code}`)&&!loading&&<span style={{fontSize:9,color:C.red,fontFamily:C.mono,flexShrink:0,background:`${C.red}15`,borderRadius:3,padding:"1px 4px"}}>N/A</span>}
                        {inBasket&&<div style={{width:18,height:18,borderRadius:4,background:source.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:C.onGold,fontWeight:700,flexShrink:0}}>{varBasket.findIndex(b=>b.sourceId===source.id&&b.varCode===v.code)+1}</div>}
                      </button>
                    );
                  })}
                </div>
              ))}
              {Object.keys(groupedVars).length===0&&<p style={{color:C.dim,fontSize:11,fontFamily:C.mono,padding:"8px 6px"}}>No variables match "{varSearch}"</p>}
            </div>
          </div>

          {/* COUNTRY SELECTOR */}
          {!source.countryFixed && (
            <div style={{flex:"0 0 auto",maxHeight:"32%",display:"flex",flexDirection:"column",borderTop:`1px solid ${C.border}`,overflow:"hidden"}}>
              <div style={{padding:"9px 10px 6px",flexShrink:0}}>
                <div style={{fontSize:10,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:7}}>Country</div>
                <input value={countrySearch} onChange={e=>setCountrySearch(e.target.value)} placeholder="Search countries..." style={{...inp,fontSize:11,padding:"7px 10px"}}/>
                <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:6}}>
                  {["All","Africa","Americas","Europe","Asia","Middle East","Oceania"].map(r=>(
                    <button key={r} onClick={()=>setRegionFilter(r)} style={{...pill(regionFilter===r),fontSize:10,padding:"2px 7px"}}>{r}</button>
                  ))}
                </div>
              </div>
              <div id="scroll-countrylist" style={{overflowY:"auto",flex:1,padding:"0 6px 8px"}}>
                <div style={{fontSize:10,color:C.dim,fontFamily:C.mono,padding:"3px 6px 4px"}}>{filteredCountries.length} countr{filteredCountries.length===1?"y":"ies"}</div>
                {filteredCountries.map(c=>{
                  const active=country===c.code;
                  return(
                    <button key={c.code} onClick={()=>setCountry(c.code)} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:6,border:"none",borderLeft:`2px solid ${active?C.gold:"transparent"}`,background:active?`${C.gold}12`:"transparent",cursor:"pointer",textAlign:"left",marginBottom:1,transition:"all .1s"}}>
                      <span style={{fontSize:15,lineHeight:1}}>{c.flag}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:active?C.gold:C.text,fontSize:11,fontWeight:active?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</div>
                        <div style={{color:C.dim,fontSize:10,fontFamily:C.mono}}>{c.code}</div>
                      </div>
                      {c.star&&<span style={{fontSize:9,background:C.gold,color:C.onGold,borderRadius:3,padding:"1px 4px",fontWeight:700,fontFamily:C.mono}}>★</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {source.countryFixed && (
            <div style={{padding:"10px 12px",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
              <div style={{fontSize:10,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6}}>Country (Fixed)</div>
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:`${source.color}12`,border:`1px solid ${source.color}44`,borderRadius:6}}>
                <span style={{fontSize:17}}>{cc.flag}</span>
                <span style={{color:source.color,fontSize:12,fontWeight:600}}>{cc.name}</span>
              </div>
            </div>
          )}

          {/* ANALYSIS TOOLS PANEL */}
          <div style={{borderTop:`1px solid ${C.border}`,flexShrink:0}}>
            <div style={{padding:"8px 12px 6px",display:"flex",gap:4,flexWrap:"wrap"}}>
              {[
                {id:"transform",icon:"⟳",color:C.gold},
                {id:"impute",icon:"◎",color:C.teal},
                {id:"composite",icon:"⊕",color:C.purple},
                {id:"frequency",icon:"◷",color:C.blue},
                {id:"dag",icon:"⚸",color:C.cyan},
              ].map(t=>(
                <button key={t.id} onClick={()=>setAnalysisTab(t.id)} style={{
                  fontSize:10,padding:"4px 8px",whiteSpace:"nowrap",textTransform:"capitalize",flexShrink:0,
                  borderRadius:6,cursor:"pointer",fontFamily:C.mono,fontWeight:analysisTab===t.id?700:400,
                  border:`1px solid ${analysisTab===t.id?t.color:C.border}`,
                  background:analysisTab===t.id?`${t.color}22`:"transparent",
                  color:analysisTab===t.id?t.color:C.mid,
                  transition:"all .15s",
                }}>
                  <span style={{color:t.color}}>{t.icon}</span> {t.id}
                </button>
              ))}
            </div>

            {/* Transform */}
            {analysisTab==="transform"&&(
              <div style={{padding:"6px 12px 10px"}}>
                <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6}}>Data Transform</div>
                <select value={transform} onChange={e=>setTransform(e.target.value)} style={{...sel,fontSize:11,padding:"5px 8px",marginBottom:6}}>
                  {TRANSFORMS.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                {transform!=="none"&&<div style={{color:C.purple,fontSize:10,fontFamily:C.mono,marginBottom:6}}>Formula: {TRANSFORMS.find(t=>t.id===transform)?.formula}</div>}
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>{setAppliedTransform(transform);loadData();}} style={{flex:2,...btn(),padding:"7px",fontSize:11}}>▶ Apply</button>
                  {appliedTransform!=="none"&&<button onClick={()=>{setAppliedTransform("none");setTransform("none");loadData();}} style={{flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"7px",color:C.dim,fontSize:11,cursor:"pointer"}}>✕ Clear</button>}
                </div>
                {appliedTransform!=="none"&&(
                  <div style={{marginTop:6}}>
                    <div style={{color:C.teal,fontSize:10,fontFamily:C.mono,marginBottom:4}}>Applied: {TRANSFORMS.find(t=>t.id===appliedTransform)?.label}</div>
                    <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
                      <input type="checkbox" checked={showOriginal} onChange={e=>setShowOriginal(e.target.checked)} style={{accentColor:C.gold}}/>
                      <span style={{color:C.text,fontSize:11}}>Show original alongside</span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Imputation */}
            {analysisTab==="impute"&&(
              <div style={{padding:"6px 12px 10px"}}>
                <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6}}>Missing Data Imputation</div>
                <select value={imputeMethod} onChange={e=>setImputeMethod(e.target.value)} style={{...sel,fontSize:11,padding:"5px 8px",marginBottom:6}}>
                  {IMPUTE_METHODS.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                {imputeMethod!=="none"&&<div style={{color:C.teal,fontSize:10,fontFamily:C.mono,marginBottom:6}}>Formula: {IMPUTE_METHODS.find(m=>m.id===imputeMethod)?.formula}</div>}
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>{setAppliedImpute(imputeMethod);loadData();}} style={{flex:2,...btn(),padding:"7px",fontSize:11}}>▶ Apply</button>
                  {appliedImpute!=="none"&&<button onClick={()=>{setAppliedImpute("none");setImputeMethod("none");loadData();}} style={{flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"7px",color:C.dim,fontSize:11,cursor:"pointer"}}>✕ Clear</button>}
                </div>
                {appliedImpute!=="none"&&(
                  <div style={{marginTop:6}}>
                    <div style={{color:C.teal,fontSize:10,fontFamily:C.mono,marginBottom:4}}>Applied: {IMPUTE_METHODS.find(m=>m.id===appliedImpute)?.label}</div>
                    <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
                      <input type="checkbox" checked={showOriginal} onChange={e=>setShowOriginal(e.target.checked)} style={{accentColor:C.gold}}/>
                      <span style={{color:C.text,fontSize:11}}>Show original alongside</span>
                    </label>
                  </div>
                )}
              </div>
            )}


            {/* Frequency */}
            {analysisTab==="frequency"&&(()=>{
              // Determine what the primary basket source actually supports
              const primarySrc = ALL_SRCS_MAP[varBasket[0]?.sourceId];
              const isYahoo = varBasket[0]?.sourceId==="yahoo";
              const isFred = varBasket[0]?.sourceId==="fred" || primarySrc?.vars?.find(v=>v.code===varBasket[0]?.varCode)?.api==="fred";
              const freqDefs = isYahoo ? [
                {id:"annual",label:"Annual",note:"Yearly close",real:true},
                {id:"monthly",label:"Monthly",note:"Real monthly close",real:true},
                {id:"weekly",label:"Weekly",note:"Real weekly close",real:true},
                {id:"daily",label:"Daily",note:"Real daily close",real:true},
              ] : isFred ? [
                {id:"annual",label:"Annual",note:"Real annual",real:true},
                {id:"monthly",label:"Monthly",note:"Real FRED monthly",real:true},
                {id:"quarterly",label:"Quarterly",note:"Real FRED quarterly",real:true},
              ] : [
                {id:"annual",label:"Annual",note:"Real — as published",real:true},
                {id:"quarterly",label:"Quarterly",note:"Interpolated estimate",real:false},
                {id:"monthly",label:"Monthly",note:"Interpolated estimate",real:false},
              ];
              return(
              <div style={{padding:"6px 12px 10px"}}>
                <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:2}}>Time Frequency</div>
                <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,marginBottom:8}}>{isYahoo?"Yahoo Finance: real market data":isFred?"FRED: real sub-annual data":primarySrc?.short+": annual source"}</div>
                {freqDefs.map(f=>(
                  <label key={f.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,cursor:"pointer"}}>
                    <input type="radio" name="freq" value={f.id} checked={freq===f.id} onChange={()=>setFreq(f.id)} style={{accentColor:C.gold}}/>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{color:freq===f.id?C.gold:C.text,fontSize:11,fontWeight:freq===f.id?700:400}}>{f.label}</span>
                        {f.real?<span style={{fontSize:9,color:C.teal,background:`${C.teal}18`,borderRadius:3,padding:"1px 5px",fontFamily:C.mono}}>REAL</span>:<span style={{fontSize:9,color:C.orange,background:`${C.orange}18`,borderRadius:3,padding:"1px 5px",fontFamily:C.mono}}>EST</span>}
                      </div>
                      <div style={{color:C.dim,fontSize:10,fontFamily:C.mono}}>{f.note}</div>
                    </div>
                  </label>
                ))}
                {freqDefs.find(f=>f.id===freq&&!f.real)&&(
                  <div style={{background:`${C.orange}12`,border:`1px solid ${C.orange}33`,borderRadius:6,padding:"7px 10px",marginTop:4}}>
                    <div style={{color:C.orange,fontSize:10,fontFamily:C.mono,lineHeight:1.5}}>⚠︎ This source only publishes annual data. Sub-annual points are linearly interpolated estimates — not real observations. For real market frequency, use the Yahoo Finance source.</div>
                  </div>
                )}
              </div>
              );
            })()}

            {/* DAG Causal Analysis */}
            {analysisTab==="dag"&&(
              <div style={{padding:"6px 12px 10px"}}>
                <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6}}>Causal DAG Builder</div>
                {/* Mode toggle */}
                {varBasket.length>=2&&(
                  <div style={{display:"flex",gap:4,marginBottom:8}}>
                    <button onClick={()=>setDagMode("manual")} style={{...pill(dagMode==="manual",C.purple),flex:1,textAlign:"center",fontSize:10,padding:"5px"}}>✍︎ Manual</button>
                    <button onClick={()=>setDagMode("auto")} style={{...pill(dagMode==="auto",C.cyan),flex:1,textAlign:"center",fontSize:10,padding:"5px"}}><Ico n="search"/> Auto-Discover</button>
                  </div>
                )}
                {/* Auto-discover controls */}
                {varBasket.length>=2&&dagMode==="auto"&&(
                  <div style={{marginBottom:10,padding:"8px 10px",background:`${C.cyan}0e`,border:`1px solid ${C.cyan}33`,borderRadius:6}}>
                    <div style={{color:C.cyan,fontSize:10,fontFamily:C.mono,marginBottom:6}}>Causal discovery</div>
                    <select aria-label="Discovery method" value={dagOpt.method} onChange={e=>setDagOpt(o=>({...o,method:e.target.value}))} style={{...sel,fontSize:10,padding:"4px 6px",marginBottom:6}}><option value="pc">PC algorithm + Granger orientation</option><option value="granger">Granger causality only</option></select>
                    <div style={{display:"flex",gap:4,marginBottom:6}}>
                      <select aria-label="Significance level" value={dagOpt.alpha} onChange={e=>setDagOpt(o=>({...o,alpha:+e.target.value}))} style={{...sel,fontSize:10,padding:"4px 6px",flex:1}}>{[0.01,0.05,0.1].map(a=><option key={a} value={a}>α = {a}</option>)}</select>
                      <select aria-label="Maximum lag" value={dagOpt.maxLag} onChange={e=>setDagOpt(o=>({...o,maxLag:+e.target.value}))} style={{...sel,fontSize:10,padding:"4px 6px",flex:1}}>{[1,2,3,4].map(a=><option key={a} value={a}>max lag {a}</option>)}</select>
                    </div>
                    <label style={{display:"flex",alignItems:"center",gap:6,fontSize:10,color:C.mid,fontFamily:C.mono,marginBottom:8,cursor:"pointer"}}><input type="checkbox" checked={dagOpt.stationary} onChange={e=>setDagOpt(o=>({...o,stationary:e.target.checked}))} style={{accentColor:C.cyan}}/>Difference until stationary (ADF)</label>
                    <button onClick={()=>{
                      const nodes=varBasket.map(v=>v.label);
                      const seriesMap={};
                      varBasket.forEach(item=>{
                        const dk=`${item.sourceId}:${item.varCode}`;
                        seriesMap[item.label]=applyTransform(imputeData(multiData[dk]||[],appliedImpute),appliedTransform);
                      });
                      const result=meDiscover(nodes,seriesMap,dagOpt);
                      setDagEdges(result.edges);
                      setDagScores(result.scores); setDagDiag(result.diag);
                      setShowDag(true);
                    }} style={{...btn(C.cyan),width:"100%",padding:"7px",fontSize:11,color:C.onGold}}><Ico n="search"/> Discover Causal Structure</button>
                    <div style={{color:C.dim,fontSize:9,fontFamily:C.mono,marginTop:6,lineHeight:1.5}}>Series are aligned on common years and differenced until an ADF test rejects a unit root. PC finds the skeleton from conditional-independence tests; Granger F-tests orient edges PC leaves open. Results are hypotheses to check against theory, not proof. Edit them afterwards.</div>
                    {dagDiag?.error&&<div style={{color:C.orange,fontSize:10,fontFamily:C.mono,marginTop:6}}>{dagDiag.error}</div>}
                  </div>
                )}
                {varBasket.length<2?(
                  <div style={{color:C.red,fontSize:10,fontFamily:C.mono}}>Select ≥2 variables to build a causal graph</div>
                ):(
                  <>
                    {/* Add edge - manual mode only */}
                    {dagMode==="manual"&&<div style={{marginBottom:8}}>
                      <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,marginBottom:4}}>Add Causal Link (cause → effect)</div>
                      <div style={{display:"flex",gap:4,alignItems:"center"}}>
                        <select value={dagFrom} onChange={e=>setDagFrom(+e.target.value)} style={{...sel,fontSize:10,padding:"4px 6px",flex:1}}>
                          {varBasket.map((item,i)=><option key={i} value={i}>{item.label.substring(0,14)}</option>)}
                        </select>
                        <span style={{color:C.purple,fontSize:12}}>→</span>
                        <select value={dagTo} onChange={e=>setDagTo(+e.target.value)} style={{...sel,fontSize:10,padding:"4px 6px",flex:1}}>
                          {varBasket.map((item,i)=><option key={i} value={i}>{item.label.substring(0,14)}</option>)}
                        </select>
                      </div>
                      <button onClick={()=>{
                        if(dagFrom===dagTo){return;}
                        const fromLabel=varBasket[dagFrom]?.label; const toLabel=varBasket[dagTo]?.label;
                        if(dagEdges.some(e=>e.from===fromLabel&&e.to===toLabel)) return;
                        const newEdges=[...dagEdges,{from:fromLabel,to:toLabel}];
                        // check for cycle
                        const nodes=varBasket.map(v=>v.label);
                        if(dagHasCycle(nodes,newEdges)){alert("That link would create a cycle — DAGs must be acyclic.");return;}
                        setDagEdges(newEdges);
                      }} style={{...btn(C.purple),width:"100%",padding:"6px",fontSize:10,marginTop:5,color:"#fff"}}>+ Add Link</button>
                    </div>}

                    {/* Edge list */}
                    {dagEdges.length>0&&(
                      <div style={{marginBottom:8}}>
                        <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,marginBottom:4}}>Causal Links ({dagEdges.length})</div>
                        {dagEdges.map((e,i)=>(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 6px",marginBottom:3,background:`${C.purple}12`,borderRadius:5,fontSize:10,fontFamily:C.mono}}>
                            <span style={{color:C.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.from.substring(0,12)} {e.undirected?"—":"→"} {e.to.substring(0,12)}</span>
                            {e.undirected&&<><button type="button" title="Orient left to right" aria-label={`Orient ${e.from} to ${e.to}`} onClick={()=>{ const ne=dagEdges.map((x,j)=>j===i? { from:e.from, to:e.to } : x); if (dagHasCycle(varBasket.map(v=>v.label), ne.filter(x=>!x.undirected))){ alert("That direction would create a cycle."); return; } setDagEdges(ne); }} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:3,color:C.cyan,cursor:"pointer",fontSize:10,padding:"0 4px"}}>→</button>
                              <button type="button" title="Orient right to left" aria-label={`Orient ${e.to} to ${e.from}`} onClick={()=>{ const ne=dagEdges.map((x,j)=>j===i? { from:e.to, to:e.from } : x); if (dagHasCycle(varBasket.map(v=>v.label), ne.filter(x=>!x.undirected))){ alert("That direction would create a cycle."); return; } setDagEdges(ne); }} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:3,color:C.cyan,cursor:"pointer",fontSize:10,padding:"0 4px"}}>←</button></>}
                            <button onClick={()=>setDagEdges(dagEdges.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:11}}>×</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Treatment / Outcome for backdoor analysis */}
                    <div style={{borderTop:`1px solid ${C.border}`,paddingTop:8,marginBottom:8}}>
                      <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,marginBottom:4}}>Effect of Interest</div>
                      <div style={{marginBottom:5}}>
                        <div style={{color:C.dim,fontSize:10,marginBottom:2}}>Treatment (X)</div>
                        <select value={dagTreatment} onChange={e=>setDagTreatment(+e.target.value)} style={{...sel,fontSize:10,padding:"4px 6px"}}>
                          {varBasket.map((item,i)=><option key={i} value={i}>{item.label.substring(0,18)}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{color:C.dim,fontSize:10,marginBottom:2}}>Outcome (Y)</div>
                        <select value={dagOutcome} onChange={e=>setDagOutcome(+e.target.value)} style={{...sel,fontSize:10,padding:"4px 6px"}}>
                          {varBasket.map((item,i)=><option key={i} value={i}>{item.label.substring(0,18)}</option>)}
                        </select>
                      </div>
                    </div>

                    <label style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",marginBottom:6}}>
                      <input type="checkbox" checked={showDag} onChange={e=>setShowDag(e.target.checked)} style={{accentColor:C.purple}}/>
                      <span style={{color:C.text,fontSize:11}}>Show DAG & Analysis</span>
                    </label>
                    <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,lineHeight:1.5}}>Draw your causal assumptions. The app identifies confounders to control for using backdoor criterion.</div>
                  </>
                )}
              </div>
            )}

            {/* Composite */}
            {analysisTab==="composite"&&(
              <div style={{padding:"6px 12px 10px"}}>
                <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6}}>Composite Index</div>
                {varBasket.length<2?(
                  <div style={{color:C.red,fontSize:10,fontFamily:C.mono}}>Select ≥2 variables</div>
                ):(
                  <>
                    <div style={{marginBottom:6}}>
                      <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,marginBottom:4}}>Normalisation</div>
                      <select value={compNorm} onChange={e=>setCompNorm(e.target.value)} style={{...sel,fontSize:11,padding:"5px 8px"}}>
                        {NORM_METHODS.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                    </div>
                    <div style={{marginBottom:6}}>
                      <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,marginBottom:4}}>Statistical Basis</div>
                      <select value={compBasis} onChange={e=>setCompBasis(e.target.value)} style={{...sel,fontSize:11,padding:"5px 8px"}}>
                        <option value="raw">Raw values</option>
                        <option value="zscore">Z-score standardised</option>
                      </select>
                      <div style={{color:C.dim,fontSize:9,fontFamily:C.mono,marginTop:3}}>Z-score uses each variable's mean & std for fair weighting</div>
                    </div>
                    <div style={{marginBottom:6}}>
                      <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,marginBottom:4}}>Aggregation</div>
                      <select value={compAgg} onChange={e=>setCompAgg(e.target.value)} style={{...sel,fontSize:11,padding:"5px 8px"}}>
                        {AGG_METHODS.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                    </div>
                    {varBasket.map((item,i)=>{const vd={name:item.label,code:item.varCode};return(
                      <div key={`w${i}`} style={{marginBottom:5}}>
                        <div style={{color:ACCENT[i%ACCENT.length],fontSize:10,fontFamily:C.mono,marginBottom:2}}>{item.label.substring(0,20)} [{item.sourceName}] — w={compWeights[i]||1}</div>
                        <input type="range" min={0.1} max={5} step={0.1} value={compWeights[i]||1} onChange={e=>setCompWeights(w=>{const nw=[...w];nw[i]=+e.target.value;return nw;})} style={{width:"100%",accentColor:ACCENT[i%ACCENT.length]}}/>
                      </div>
                    );})}
                    <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,marginBottom:6}}>Formula: {AGG_METHODS.find(m=>m.id===compAgg)?.formula}</div>
                    <label style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer"}}>
                      <input type="checkbox" checked={showComposite} onChange={e=>setShowComposite(e.target.checked)} style={{accentColor:C.purple}}/>
                      <span style={{color:C.text,fontSize:11}}>Show Composite Index</span>
                    </label>
                  </>
                )}
              </div>
            )}
          </div>

          {/* YEAR RANGE */}
          <div style={{padding:"10px 12px",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
            <div style={{fontSize:10,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:7}}>Year Range</div>
            <div style={{display:"flex",gap:7,alignItems:"center"}}>
              <select value={startYear} onChange={e=>setStartYear(+e.target.value)} style={{...sel,padding:"6px 7px",fontSize:11,flex:1}}>
                {YEARS.map(y=><option key={y} value={y}>{y}</option>)}
              </select>
              <span style={{color:C.dim,fontSize:11,fontFamily:C.mono}}>→</span>
              <select value={endYear} onChange={e=>setEndYear(+e.target.value)} style={{...sel,padding:"6px 7px",fontSize:11,flex:1}}>
                {YEARS.map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* COMPARE */}
          {!source.countryFixed && (
            <div style={{padding:"10px 12px",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:cmpOn?9:0}} onClick={e=>{if(!plan.compare){e.preventDefault();setUpgradeModal({feature:"Country Comparison",requiredPlan:"pro"});}}}>
                <input type="checkbox" checked={cmpOn} onChange={e=>{if(!plan.compare){setUpgradeModal({feature:"Country Comparison",requiredPlan:"pro"});return;}setCmpOn(e.target.checked);}} style={{accentColor:C.gold,width:13,height:13}}/>
                <span style={{color:cmpOn?C.text:C.mid,fontSize:12,fontWeight:cmpOn?600:400}}>Compare Countries {!plan.compare&&<span style={{background:`${C.gold}20`,color:C.gold,fontSize:10,fontFamily:C.mono,borderRadius:3,padding:"1px 5px",fontWeight:700}}>PRO</span>}</span>
              </label>
              {cmpOn&&(
                <select value={cmpCountry} onChange={e=>setCmpCountry(e.target.value)} style={{...sel,padding:"6px 9px",fontSize:11}}>
                  {COUNTRIES.filter(c=>c.code!==country).map(c=><option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                </select>
              )}
            </div>
          )}
        </aside>

        {/* MAIN CONTENT */}
        {/* DRAG HANDLE */}
        <div onMouseDown={startResize} style={{width:isMobile?0:4,cursor:"col-resize",background:"transparent",borderLeft:`1px solid ${T.border}`,flexShrink:0,transition:"background .15s",display:isMobile?"none":"flex",alignItems:"center",justifyContent:"center"}} onMouseEnter={e=>e.currentTarget.style.background=C.gold} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><div style={{width:2,height:40,borderRadius:2,background:"transparent"}}/></div>
        <main id="scroll-main" style={{flex:1,overflowY:"auto",padding:18,display:"flex",flexDirection:"column",gap:16,background:T.bg}}>

          {/* Source info banner */}
          <div style={{display:"flex",alignItems:isMobile?"flex-start":"center",gap:isMobile?6:12,padding:isMobile?"8px 12px":"10px 16px",background:`${source.color}0f`,border:`1px solid ${source.color}33`,borderRadius:6,flexDirection:isMobile?"column":"row"}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:source.color,flexShrink:0}}/>
            <div style={{flex:1}}>
              <span style={{color:source.color,fontWeight:700,fontSize:12}}>{source.name}</span>
              <span style={{color:C.mid,fontSize:11,fontFamily:C.mono,marginLeft:10}}>{source.desc}</span>
            </div>
            <a href={source.url} target="_blank" rel="noreferrer" style={{color:source.color,fontSize:11,fontFamily:C.mono,textDecoration:"none"}}>Visit ↗</a>
          </div>

          {/* KPI Cards */}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,minmax(0,1fr))":"repeat(5,minmax(0,1fr))",gap:12}}>
            {kpis.map((k,i)=>(
              <div key={i} className="glass-card" style={{...card,padding:"13px 16px"}}>
                <div style={{fontSize:10,color:C.dim,fontFamily:C.mono,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:7}}>{k.lbl}</div>
                <div style={{fontSize:16,fontWeight:700,color:k.pos?C.teal:k.neg?C.red:C.text,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={k.val}>{k.val}</div>
                <div style={{fontSize:10,color:C.mid,fontFamily:C.mono}}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Plan Badge */}
          {plan.id==="free"&&(
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 16px",background:`${C.gold}10`,border:`1px solid ${C.gold}44`,borderRadius:6}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:14}}>⬡</span>
                <span style={{color:C.gold,fontSize:11,fontFamily:C.mono}}>You are on the <strong>Free plan</strong> — limited to {PLANS.free.sources.length} sources, no AI Insights, CSV only.</span>
              </div>
              <button onClick={()=>{setSettings(s=>({...s,plan:"pro"}));}} style={{background:C.gold,color:C.onGold,border:"none",borderRadius:6,padding:"5px 14px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:C.mono}}>Upgrade to Pro →</button>
            </div>
          )}

          {/* Chart */}
          <div className="glass-card" style={{...card,padding:"20px 22px",background:T.card,border:`1px solid ${T.border}`}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
              <div>
                <h2 style={{margin:0,fontSize:14,fontWeight:700,color:C.text}}>{currentVar.name}</h2>
                <p style={{margin:"4px 0 0",fontSize:11,color:C.mid,fontFamily:C.mono}}>
                  {source.short} · {cc.flag} {cc.name}{cmpOn&&!source.countryFixed?` vs ${cmpC.flag} ${cmpC.name}`:""} · {startYear}–{endYear}
                </p>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                {[["area","◭"],["line","╱"],["bar","▮"],["stats","Σ"],["dist","∿"]].map(([t,ic])=>(
                  <button key={t} type="button" aria-pressed={viewMode==="chart"&&chartType===t} onClick={()=>{ setChartType(t); setViewMode("chart"); }} style={{...pill(viewMode==="chart"&&chartType===t),textTransform:"capitalize",fontSize:11}}>
                    {ic} {t==="dist"?"distribution":t}
                  </button>
                ))}
                {(chartType==="area"||chartType==="line"||chartType==="bar")&&(
                  <button onClick={()=>{setAnimate(true);setAnimTick(t=>t+1);}} style={{...pill(animate,C.gold),fontSize:11}}>▶ {animate?"Replay":"Animate"}</button>
                )}
                {varCodes.length>1&&(
                  <div style={{background:`${C.purple}20`,border:`1px solid ${C.purple}44`,borderRadius:6,padding:"3px 9px",fontSize:10,color:C.purple,fontFamily:C.mono,fontWeight:700}}>
                    {varCodes.length} vars
                  </div>
                )}
                <div style={{width:1,height:16,background:C.border}}/>
                <button type="button" aria-pressed={viewMode==="table"} onClick={()=>setViewMode(v=>v==="chart"?"table":"chart")} style={pill(viewMode==="table")}>
                  {viewMode==="chart"?"⊞ Table":"◫ Chart"}
                </button>
                <button onClick={()=>setShowImpact(true)} style={{...pill(true),display:"inline-flex",alignItems:"center",gap:5}} title="Matching, weighting and synthetic control"><Ico n="compare"/> Impact Lab</button>
                <div style={{display:"flex",gap:5,alignItems:"center"}}>
                  <button onClick={forceRefresh} disabled={loading} style={{...pill(false),color:C.teal,borderColor:`${C.teal}44`,fontSize:11,opacity:loading?0.5:1,cursor:loading?"wait":"pointer"}}>{loading?"⟳":"↻"} Refresh</button>
                  <ExportMenu data={data} currentVar={currentVar} cc={cc} source={source} startYear={startYear} endYear={endYear} plan={plan} onUpgradeNeeded={(f)=>setUpgradeModal({feature:f,requiredPlan:"pro"})}/>
                  <div style={{position:"relative"}}>
                    <button onClick={()=>document.getElementById("chartExportMenu").style.display==="none"?document.getElementById("chartExportMenu").style.display="block":document.getElementById("chartExportMenu").style.display="none"} style={{...pill(false),color:C.blue,borderColor:`${C.blue}44`,fontSize:11}}><Ico n="camera"/> Snapshot</button>
                    <div id="chartExportMenu" style={{display:"none",position:"absolute",right:0,top:"calc(100% + 6px)",background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:6,padding:6,minWidth:180,zIndex:99,boxShadow:C.shadow}}>
                      <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,padding:"4px 10px 6px",textTransform:"uppercase",letterSpacing:"0.1em"}}>Export Chart</div>
                      {[[<><Ico n="image"/> PNG (High-Res)</>,"png"],["◈ SVG (Vector)","svg"]].map(([label,fmt])=>(
                        <button key={fmt} onClick={()=>{
                          const title=`${currentVar.name} — ${cc.name} (${source.short}) ${startYear}–${endYear}${transform!=="none"?` · ${TRANSFORMS.find(t=>t.id===transform)?.label}`:""}`;
                          exportChart(fmt,title);
                          document.getElementById("chartExportMenu").style.display="none";
                        }} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"9px 12px",borderRadius:6,border:"none",background:"transparent",cursor:"pointer",color:C.text,fontSize:11,fontFamily:C.mono}}>
                          {label}
                        </button>
                      ))}
                      <div style={{borderTop:`1px solid ${C.border}`,margin:"4px 0",padding:"4px 10px 0"}}>
                        <div style={{color:C.dim,fontSize:10,fontFamily:C.mono}}>Includes title, legend & attribution</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {loading ? (
              <div style={{height:320,display:"flex",alignItems:"center",justifyContent:"center",color:C.mid,fontFamily:C.mono,fontSize:12,gap:10}}>
                <span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</span> Fetching from {source.name}…
              </div>
            ) : !data.length ? (
              <div style={{height:320,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:C.dim,fontFamily:C.mono,fontSize:12,gap:10}}>
                <span style={{fontSize:30}}>◌</span>
                <span>No data available for this selection</span>
                {source.keyRequired&&!settings.fredKey&&<span style={{color:C.red,fontSize:11}}>⚠︎ FRED API key required — add in Settings</span>}
                <button onClick={forceRefresh} disabled={loading} style={{...btn(C.teal),padding:"8px 18px",fontSize:11,marginTop:4,opacity:loading?0.6:1,cursor:loading?"wait":"pointer"}}>{loading?"⟳ Retrying…":"↻ Retry Now"}</button>
                <span style={{fontSize:10,color:C.dim,marginTop:2}}>If this persists, open DevTools (F12) → Console for the exact error</span>
              </div>
            ) : viewMode==="chart" ? (
              <div>
                {/* Series show/hide toggles - only when >1 variable */}
                {varBasket.length>1&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10,padding:"8px 10px",background:C.surface,borderRadius:6,border:`1px solid ${C.border}`}}>
                    <span style={{color:C.dim,fontSize:10,fontFamily:C.mono,textTransform:"uppercase",letterSpacing:"0.1em",width:"100%",marginBottom:2}}>Chart Series ({varBasket.length-hiddenChartVars.size}/{varBasket.length} shown)</span>
                    {varBasket.map((item,i)=>{
                      const dk=`${item.sourceId}:${item.varCode}`;
                      const hidden=hiddenChartVars.has(dk);
                      const col=ACCENT[i%ACCENT.length];
                      return(
                        <button key={dk} onClick={()=>{
                          setHiddenChartVars(prev=>{const n=new Set(prev);if(n.has(dk))n.delete(dk);else n.add(dk);return n;});
                        }} style={{
                          display:"flex",alignItems:"center",gap:5,padding:"4px 9px",borderRadius:6,cursor:"pointer",fontFamily:C.mono,fontSize:10,
                          border:`1px solid ${hidden?C.border:col}`,
                          background:hidden?"transparent":`${col}18`,
                          color:hidden?C.dim:col,
                          textDecoration:hidden?"line-through":"none",
                          opacity:hidden?0.5:1,
                        }}>
                          <span style={{width:8,height:8,borderRadius:"50%",background:hidden?C.dim:col,flexShrink:0}}/>
                          {item.label.substring(0,16)}
                        </button>
                      );
                    })}
                  </div>
                )}
              <div id="ecoscope-chart-area" key={chartType+[...hiddenChartVars].join()+":"+animTick+":"+distCurveType+":"+distVar} style={{overflow:"hidden",maxWidth:"100%"}}>
                {(chartType==="stats"||chartType==="dist")?(
                  <div id="scroll-statsview" style={{maxHeight:isMobile?360:440,overflowY:"auto",overflowX:"hidden"}}>{renderChart()}</div>
                ):(
                  <ResponsiveContainer width="100%" height={isMobile?220:chartType==="scatter"?320:300}>{renderChart()}</ResponsiveContainer>
                )}
              </div>
              </div>
            ) : (
              <div id="scroll-table" style={{maxHeight:360,overflowY:"auto",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
                {/* Multi-variable table */}
                {(()=>{
                  const allVarDefs2=varBasket.map(item=>{
                    const s2=ALL_SRCS_MAP[item.sourceId]||source;
                    const vd2=s2.vars.find(v=>v.code===item.varCode);
                    return vd2?{...vd2,_dk:`${item.sourceId}:${item.varCode}`,_sourceColor:item.sourceColor,_sourceName:item.sourceName}:null;
                  }).filter(Boolean);
                  const allYears2=[...new Set([
                    ...Object.values(multiData).flatMap(arr=>arr.map(d=>d.year)),
                    ...Object.values(cmpMultiData).flatMap(arr=>arr.map(d=>d.year)),
                  ])].sort((a,b)=>a-b);
                  if(!allYears2.length) return <div style={{padding:"20px",textAlign:"center",color:C.dim,fontFamily:C.mono}}>No data</div>;
                  return(
                    <table style={{width:"100%",borderCollapse:"collapse",fontFamily:C.mono,fontSize:11,minWidth:500}}>
                      <thead>
                        <tr style={{background:C.surface,position:"sticky",top:0,zIndex:1}}>
                          <th style={{color:C.dim,padding:"8px 12px",borderBottom:`1px solid ${C.border}`,fontWeight:500,textAlign:"left",fontSize:10,textTransform:"uppercase",letterSpacing:"0.1em"}}>Year</th>
                          {allVarDefs2.map((vd,i)=>(
                            <React.Fragment key={vd.code}>
                              <th style={{color:ACCENT[i%ACCENT.length],padding:"8px 10px",borderBottom:`1px solid ${C.border}`,fontWeight:600,textAlign:"right",fontSize:10,maxWidth:130,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}} title={vd.name}>
                                ●{i+1} {vd.name.substring(0,14)} [{vd._sourceName||source.short}]
                              </th>
                              {showOriginal&&(appliedTransform!=="none"||appliedImpute!=="none")&&(
                                <th style={{color:C.dim,padding:"8px 10px",borderBottom:`1px solid ${C.border}`,fontWeight:400,textAlign:"right",fontSize:10}}>●{i+1} RAW</th>
                              )}
                            </React.Fragment>
                          ))}
                          {cmpOn&&!source.countryFixed&&<th style={{color:C.teal,padding:"8px 10px",borderBottom:`1px solid ${C.border}`,fontWeight:600,textAlign:"right",fontSize:10}}>vs {cmpC.name}</th>}
                          <th style={{color:C.dim,padding:"8px 10px",borderBottom:`1px solid ${C.border}`,fontWeight:500,textAlign:"right",fontSize:10,textTransform:"uppercase"}}>Δ YoY (Primary)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allYears2.map((year,i)=>{
                          const prec=allYears2[i-1];
                          const primarySeries=applyTransform(imputeData(multiData[varCode]||[],imputeMethod),transform);
                          const cur=primarySeries.find(d=>d.year===year);
                          const prev=primarySeries.find(d=>d.year===prec);
                          const delta=cur?.value!=null&&prev?.value?((cur.value-prev.value)/Math.abs(prev.value)*100):null;
                          return(
                            <tr key={year} style={{background:i%2?`${T.surface}88`:"transparent"}}>
                              <td style={{color:T.mid,padding:"6px 12px",fontWeight:600}}>{year}</td>
                              {allVarDefs2.map((vd,vi)=>{
                                const dk2=vd._dk||`${varBasket[vi]?.sourceId||source.id}:${vd.code}`;
                              const rawS=multiData[dk2]||multiData[vd.code]||[];
                              const series=applyTransform(imputeData(rawS,appliedImpute),appliedTransform);
                              const rawSeries2=rawS;
                                const pt=series.find(d=>d.year===year);
                                const pt2=series.find(d=>String(d.year)===String(year));
                              const rawPt2=showOriginal?(rawSeries2.find(d=>String(d.year)===String(year))):null;
                              return(<React.Fragment key={vd.code}>
                                <td style={{color:ACCENT[vi%ACCENT.length],textAlign:"right",padding:"6px 10px",fontWeight:600}}>{pt2?.value!=null?fmtVal(pt2.value,vd.fmt):<span style={{color:C.dim}}>—</span>}</td>
                                {showOriginal&&(appliedTransform!=="none"||appliedImpute!=="none")&&<td style={{color:C.dim,textAlign:"right",padding:"6px 10px",fontSize:10}}>{rawPt2?.value!=null?fmtVal(rawPt2.value,vd.fmt):<span style={{color:C.dim}}>—</span>}</td>}
                              </React.Fragment>);
                              })}
                              {cmpOn&&!source.countryFixed&&<td style={{color:C.teal,textAlign:"right",padding:"6px 10px"}}>{cmpData.find(d=>d.year===year)?fmtVal(cmpData.find(d=>d.year===year).value,currentVar.fmt):"—"}</td>}
                              <td style={{color:delta==null?C.dim:delta>=0?C.teal:C.red,textAlign:"right",padding:"6px 10px",fontWeight:600}}>
                                {delta==null?"—":`${delta>=0?"+":""}${delta.toFixed(2)}%`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            )}
          </div>

          {/* DAG CAUSAL ANALYSIS VIEW */}
          {showDag&&varBasket.length>=2&&(()=>{
            const nodes=varBasket.map(v=>v.label);
            const tName=varBasket[dagTreatment]?.label;
            const oName=varBasket[dagOutcome]?.label;
            const analysis=dagBackdoorSet(nodes,dagEdges,tName,oName,unobservedNodes);
            // Auto-layout in circle, override with custom dragged positions
            const cx=300, cy=150, r=110;
            const positions={};
            nodes.forEach((n,i)=>{
              if(dagPositions[n]){ positions[n]=dagPositions[n]; }
              else {
                const angle=(2*Math.PI*i/nodes.length)-Math.PI/2;
                positions[n]={x:cx+r*Math.cos(angle),y:cy+r*Math.sin(angle)};
              }
            });
            // SVG drag handlers
            const svgPoint=(evt,svg)=>{
              const pt=svg.createSVGPoint();
              const touch=evt.touches?evt.touches[0]:evt;
              pt.x=touch.clientX; pt.y=touch.clientY;
              const ctm=svg.getScreenCTM();
              if(!ctm) return {x:0,y:0};
              const p=pt.matrixTransform(ctm.inverse());
              return {x:p.x, y:p.y};
            };
            return(
              <div className="glass-card" style={{...card,background:T.card,border:`1px solid ${C.purple}44`}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                  <div style={{width:22,height:22,background:`${C.purple}`,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11}}>⚸</div>
                  <h3 style={{margin:0,fontSize:14,fontWeight:700,color:C.text}}>Causal DAG Analysis</h3>
                  <div style={{marginLeft:"auto",display:"flex",gap:6}}>
                    <button onClick={()=>downloadDAG("png")} style={{...pill(false),color:C.blue,borderColor:`${C.blue}44`,fontSize:10}}><Ico n="camera"/> PNG</button>
                    <button onClick={()=>downloadDAG("svg")} style={{...pill(false),color:C.teal,borderColor:`${C.teal}44`,fontSize:10}}>◈ SVG</button>
                    <button onClick={()=>{setDagPositions({});}} style={{...pill(false),color:C.dim,fontSize:10}}>↺ Reset</button>
                  </div>
                </div>

                {/* SVG DAG */}
                <div style={{background:C.bg,borderRadius:6,padding:10,marginBottom:12,overflowX:"auto"}}>
                  <svg id="dag-svg" viewBox="0 0 600 300" style={{width:"100%",minWidth:400,height:280,touchAction:"none"}}
                    onMouseMove={(evt)=>{
                      if(!dragNode) return;
                      const svg=evt.currentTarget;
                      const pt=svgPoint(evt,svg);
                      setDagPositions(prev=>({...prev,[dragNode]:{x:pt.x,y:pt.y}}));
                    }}
                    onMouseUp={()=>setDragNode(null)}
                    onMouseLeave={()=>setDragNode(null)}
                    onTouchMove={(evt)=>{
                      if(!dragNode) return;
                      const svg=evt.currentTarget;
                      const pt=svgPoint(evt,svg);
                      setDagPositions(prev=>({...prev,[dragNode]:{x:pt.x,y:pt.y}}));
                    }}
                    onTouchEnd={()=>setDragNode(null)}
                  >
                    <defs>
                      <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L0,6 L9,3 z" fill={C.mid}/>
                      </marker>
                      <marker id="arrowTeal" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L0,6 L9,3 z" fill={C.teal}/>
                      </marker>
                      <marker id="arrowRed" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L0,6 L9,3 z" fill={C.red}/>
                      </marker>
                      <marker id="arrowOrange" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L0,6 L9,3 z" fill={C.orange}/>
                      </marker>
                    </defs>
                    {/* Edges - color-coded by causal role */}
                    {dagEdges.map((e,i)=>{
                      const p1=positions[e.from], p2=positions[e.to];
                      if(!p1||!p2) return null;
                      const dx=p2.x-p1.x, dy=p2.y-p1.y;
                      const len=Math.sqrt(dx*dx+dy*dy)||1;
                      const ux=dx/len, uy=dy/len;
                      const x1=p1.x+ux*32, y1=p1.y+uy*32;
                      const x2=p2.x-ux*36, y2=p2.y-uy*36;
                      // Determine edge role
                      const isDirect=(e.from===tName&&e.to===oName); // direct X→Y causal effect
                      const fromConf=analysis.confounders.includes(e.from); // edge originates from confounder
                      const toXY=(e.to===tName||e.to===oName);
                      const isConfEdge=fromConf&&toXY; // confounder → X or Y (backdoor path)
                      const isMedEdge=analysis.mediators.includes(e.from)||analysis.mediators.includes(e.to); // mediator edge
                      const isUnobserved=unobservedNodes.has(e.from)||unobservedNodes.has(e.to);
                      // Color logic
                      let edgeColor=C.mid, marker="url(#arrow)";
                      if(isDirect){edgeColor=C.teal;marker="url(#arrowTeal)";}
                      else if(isConfEdge){edgeColor=C.red;marker="url(#arrowRed)";}
                      else if(isMedEdge){edgeColor=C.orange;marker="url(#arrowOrange)";}
                      return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={e.undirected?C.cyan:edgeColor} strokeWidth={isDirect?3:2}
                        strokeDasharray={e.undirected?"2 4":isUnobserved?"6 4":"none"}
                        markerEnd={e.undirected?undefined:marker}/>;
                    })}
                    {/* Nodes */}
                    {nodes.map((n,i)=>{
                      const p=positions[n];
                      const isT=n===tName, isO=n===oName;
                      const isConf=analysis.confounders.includes(n);
                      const isMed=analysis.mediators.includes(n);
                      const isUnobs=unobservedNodes.has(n);
                      const col=isT?C.gold:isO?C.teal:isConf?C.red:isMed?C.orange:C.blue;
                      return(
                        <g key={i} style={{cursor:dragNode===n?"grabbing":"grab"}}
                          onMouseDown={(evt)=>{evt.stopPropagation();setDragNode(n);}}
                          onTouchStart={(evt)=>{setDragNode(n);}}
                          onDoubleClick={()=>{
                            if(isT||isO) return;
                            setUnobservedNodes(prev=>{const s=new Set(prev);if(s.has(n))s.delete(n);else s.add(n);return s;});
                          }}>
                          <circle cx={p.x} cy={p.y} r={30} fill={isUnobs?"transparent":`${col}22`} stroke={col} strokeWidth={2} strokeDasharray={isUnobs?"5 3":"none"}/>
                          <text x={p.x} y={p.y-2} textAnchor="middle" fill={col} fontSize={9} fontFamily="monospace" fontWeight="bold">{isT?"X":isO?"Y":n.substring(0,6)}</text>
                          <text x={p.x} y={p.y+9} textAnchor="middle" fill={C.mid} fontSize={6} fontFamily="monospace">{n.substring(0,14)}</text>
                          {isUnobs&&<text x={p.x} y={p.y+20} textAnchor="middle" fill={C.dim} fontSize={5} fontFamily="monospace">unobserved</text>}
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Legend */}
                <div style={{marginBottom:12}}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:6,fontSize:10,fontFamily:C.mono}}>
                    <span style={{color:C.dim,fontSize:10,textTransform:"uppercase"}}>Nodes:</span>
                    <span style={{color:C.gold}}>● X Treatment</span>
                    <span style={{color:C.teal}}>● Y Outcome</span>
                    <span style={{color:C.red}}>● Confounder</span>
                    <span style={{color:C.orange}}>● Mediator</span>
                    <span style={{color:C.blue}}>● Other</span>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:12,fontSize:10,fontFamily:C.mono,alignItems:"center"}}>
                    <span style={{color:C.dim,fontSize:10,textTransform:"uppercase"}}>Edges:</span>
                    <span style={{display:"flex",alignItems:"center",gap:4}}><svg width="24" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke={C.teal} strokeWidth="3"/></svg><span style={{color:C.teal}}>Direct effect</span></span>
                    <span style={{display:"flex",alignItems:"center",gap:4}}><svg width="24" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke={C.red} strokeWidth="2"/></svg><span style={{color:C.red}}>Backdoor (confounder)</span></span>
                    <span style={{display:"flex",alignItems:"center",gap:4}}><svg width="24" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke={C.orange} strokeWidth="2"/></svg><span style={{color:C.orange}}>Mediating path</span></span>
                    <span style={{display:"flex",alignItems:"center",gap:4}}><svg width="24" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke={C.mid} strokeWidth="2" strokeDasharray="4 2"/></svg><span style={{color:C.mid}}>Unobserved</span></span>
                    <span style={{display:"flex",alignItems:"center",gap:4}}><svg width="24" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke={C.cyan} strokeWidth="2" strokeDasharray="2 4"/></svg><span style={{color:C.cyan}}>Direction unknown</span></span>
                  </div>
                  <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,marginTop:6,fontStyle:"italic"}}><Ico n="bulb"/> Drag nodes to rearrange · Double-click a node (except X/Y) to mark it unobserved (dashed = latent confounder).</div>
                </div>

                {/* Analysis result */}
                <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:6,padding:"12px 14px"}}>
                  <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Backdoor Criterion Analysis</div>
                  <div style={{color:C.text,fontSize:12,marginBottom:6,fontFamily:C.mono}}>Effect: <span style={{color:C.gold}}>{tName?.substring(0,20)}</span> → <span style={{color:C.teal}}>{oName?.substring(0,20)}</span></div>
                  {(()=>{
                    const tItem=varBasket[dagTreatment], oItem=varBasket[dagOutcome];
                    const tS=tItem?summaryStats(applyTransform(imputeData(multiData[`${tItem.sourceId}:${tItem.varCode}`]||[],appliedImpute),appliedTransform)):null;
                    const oS=oItem?summaryStats(applyTransform(imputeData(multiData[`${oItem.sourceId}:${oItem.varCode}`]||[],appliedImpute),appliedTransform)):null;
                    if(!tS||!oS) return null;
                    return <div style={{display:"flex",gap:14,marginBottom:10,fontSize:10,fontFamily:C.mono,flexWrap:"wrap"}}>
                      <span style={{color:C.gold}}>X: μ={tS.mean.toFixed(1)} σ={tS.std.toFixed(1)}</span>
                      <span style={{color:C.teal}}>Y: μ={oS.mean.toFixed(1)} σ={oS.std.toFixed(1)}</span>
                    </div>;
                  })()}
                  {analysis.undirected>0&&<div style={{color:C.orange,fontSize:11,fontFamily:C.mono,marginBottom:8,lineHeight:1.5}}>{analysis.undirected} link(s) have no direction yet and are ignored here. Orient them in the link list using theory or timing.</div>}
                  {analysis.sets?.length>0&&(
                    <div style={{marginBottom:8}}>
                      <div style={{color:C.red,fontSize:11,fontFamily:C.mono,fontWeight:700,marginBottom:4}}>Minimal adjustment set{analysis.sets.length>1?"s (any one is enough)":""}:</div>
                      {analysis.sets.slice(0,6).map((st,i)=><div key={i} style={{color:C.text,fontSize:11,fontFamily:C.mono,paddingLeft:12}}>• {st.length? `{ ${st.join(", ")} }` : "{ } (no adjustment needed)"}</div>)}
                    </div>
                  )}
                  {analysis.roles&&Object.entries(analysis.roles).some(([,r])=>r==="bad"||r==="descendant")&&(
                    <div style={{marginBottom:8}}>
                      <div style={{color:C.orange,fontSize:11,fontFamily:C.mono,fontWeight:700,marginBottom:4}}>✗ Bad controls (adjusting would open a biasing path or block the effect):</div>
                      {Object.entries(analysis.roles).filter(([,r])=>r==="bad"||r==="descendant").map(([v,r])=><div key={v} style={{color:C.mid,fontSize:11,fontFamily:C.mono,paddingLeft:12}}>• {v} <span style={{color:C.dim}}>({r==="bad"? "collider or opens a back-door path" : "descendant of X"})</span></div>)}
                    </div>
                  )}
                  {analysis.frontDoor&&<div style={{color:C.teal,fontSize:11,fontFamily:C.mono,marginBottom:8}}>Front-door set: {analysis.frontDoor.join(", ")}</div>}
                  {analysis.mediators.length>0&&(
                    <div style={{marginBottom:8}}>
                      <div style={{color:C.orange,fontSize:11,fontFamily:C.mono,fontWeight:700,marginBottom:4}}>✗ Do NOT control (mediators — they carry the effect):</div>
                      {analysis.mediators.map((m,i)=><div key={i} style={{color:C.mid,fontSize:11,fontFamily:C.mono,paddingLeft:12}}>• {m}</div>)}
                    </div>
                  )}
                  {(()=>{
                    const unobsConf=analysis.confounders.filter(c=>unobservedNodes.has(c));
                    return(<>
                      {unobsConf.length>0&&(
                        <div style={{background:`${C.red}15`,border:`1px solid ${C.red}44`,borderRadius:6,padding:"8px 12px",marginTop:8,marginBottom:8}}>
                          <div style={{color:C.red,fontSize:11,fontFamily:C.mono,fontWeight:700,marginBottom:3}}>⚠︎ Unobserved confounder(s): {unobsConf.join(", ")}</div>
                          <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,lineHeight:1.5}}>These cannot be controlled for because they're not measured. The causal effect of X on Y is <strong style={{color:C.red}}>not identifiable</strong> from this data alone — consider an instrumental variable or natural experiment.</div>
                        </div>
                      )}
                      <div style={{color:analysis.confounders.length>0?C.gold:C.teal,fontSize:11,fontFamily:C.mono,lineHeight:1.6,marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`}}>{analysis.note}</div>
                    </>);
                  })()}
                  {(()=>{ // testable implications of the drawn graph (local Markov property), on stationary versions of the series
                    const dir=dagEdges.filter(e=>!e.undirected); if (!dir.length) return null; const colsByNode={};
                    const maps=varBasket.map(item=>{ const m={}; applyTransform(imputeData(multiData[`${item.sourceId}:${item.varCode}`]||[],appliedImpute),appliedTransform).forEach(d=>{ if(d.value!=null&&isFinite(d.value)) m[d.year]=d.value; }); return m; });
                    const yrs=Object.keys(maps[0]||{}).map(Number).filter(y=>maps.every(m=>m[y]!=null)).sort((a,b)=>a-b); if (yrs.length<12) return null;
                    const st=maps.map(m=>meStationary(yrs.map(y=>m[y])).vals); const L=Math.min(...st.map(v=>v.length)); varBasket.forEach((item,i)=>{ colsByNode[item.label]=st[i].slice(-L); });
                    const imp=meDagImplications(nodes, dir, colsByNode).slice(0,12); if (!imp.length) return null;
                    return <div style={{marginTop:10,paddingTop:8,borderTop:`1px solid ${C.border}`}}>
                      <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>Testable implications of this graph</div>
                      {imp.map((t,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:10,fontFamily:C.mono,color:t.p<0.05?C.red:C.mid,padding:"2px 0"}}><span>{t.a.substring(0,14)} ⊥ {t.b.substring(0,14)}{t.S.length?` | ${t.S.map(x=>x.substring(0,10)).join(", ")}`:""}</span><span>r={t.r.toFixed(2)} p={t.p<0.001?"<0.001":t.p.toFixed(3)}{t.p<0.05?" ✗":""}</span></div>)}
                      <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,marginTop:4,lineHeight:1.5}}>Each line is an independence the graph implies (partial correlations on stationary series, n={L}). Red lines are rejected by the data at 5%: the graph is missing a link there.</div>
                    </div>; })()}
                  {analysis.confounders.length>0&&(
                    <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,marginTop:8,lineHeight:1.5}}>
                      Adjusted model: <span style={{color:C.text}}>{oName?.substring(0,15)} ~ {tName?.substring(0,15)}{analysis.confounders.filter(c=>!unobservedNodes.has(c)).length>0?" + "+analysis.confounders.filter(c=>!unobservedNodes.has(c)).map(c=>c.substring(0,10)).join(" + "):""}</span>
                    </div>
                  )}
                </div>
                {/* Discovery scores */}
                {dagScores.length>0&&(
                  <div style={{background:`${C.cyan}0e`,border:`1px solid ${C.cyan}33`,borderRadius:6,padding:"12px 14px",marginTop:10}}>
                    <div style={{color:C.cyan,fontSize:10,fontFamily:C.mono,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}><Ico n="search"/> Discovered Edge Strengths</div>
                    {dagScores.map((s,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:5,fontSize:11,fontFamily:C.mono,flexWrap:"wrap"}}>
                        <span style={{color:C.text,minWidth:140}}>{s.pair}</span>
                        <span style={{color:C.mid,flex:1,fontSize:10}}>{s.stat}</span>
                        {s.p!=null&&<span style={{color:C.cyan}}>p={s.p<0.001?"<0.001":s.p.toFixed(3)}</span>}
                      </div>
                    ))}
                    {dagDiag&&!dagDiag.error&&<div style={{color:C.dim,fontSize:10,fontFamily:C.mono,marginTop:6,lineHeight:1.6}}>
                      {dagDiag.method==="pc"?"PC-stable with Fisher-z tests":"Pairwise Granger F-tests"} · α={dagDiag.alpha} · {dagDiag.n} observations ({dagDiag.years[0]}–{dagDiag.years[1]}) · lag order by BIC up to {dagDiag.lagMax}
                      <div>Stationarity: {dagDiag.stat.map(x=>`${x.node.substring(0,12)} ${x.diffs?`Δ${x.diffs>1?"²":""}`:"level"}${x.p!=null?` (ADF p=${x.p.toFixed(2)})`:""}`).join(" · ")}</div>
                      {dagDiag.notes.map((n,i)=><div key={i} style={{color:C.orange}}>{n}</div>)}
                      <div>Annual series give few observations, so these tests have low power. Treat missing links as "not detected", not "absent".</div>
                    </div>}
                  </div>
                )}
              </div>
            );
          })()}

          {/* MISSING DATA TOAST */}
          {missingAlert&&(
            <div style={{background:`${C.orange}18`,border:`1px solid ${C.orange}55`,borderRadius:6,padding:"10px 16px",display:"flex",alignItems:"center",gap:12,marginBottom:0}}>
              <span style={{fontSize:18}}>⚠︎</span>
              <div style={{flex:1}}>
                <div style={{color:C.orange,fontSize:12,fontWeight:700}}>Missing Data Detected</div>
                <div style={{color:C.mid,fontSize:11,fontFamily:C.mono}}>{missingAlert.varName}: {missingAlert.count} of {missingAlert.total} values are missing</div>
              </div>
              <button onClick={()=>{setAnalysisTab("impute");}} style={{background:C.orange,color:C.onGold,border:"none",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>Apply Imputation →</button>
              <button onClick={()=>setMissingAlert(null)} style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:14}}>✕</button>
            </div>
          )}

          {/* ECOSCOPE AI — owned statistical engine (free, offline) */}
          <div className="glass-card" style={{...card,background:T.card,border:`1px solid ${C.teal}44`}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <div style={{width:22,height:22,background:`${C.teal}`,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>⬡</div>
                  <h3 style={{margin:0,fontSize:14,fontWeight:700,color:C.text}}>EcoScope AI</h3>
                  <span style={{fontSize:9,color:C.teal,background:`${C.teal}18`,borderRadius:4,padding:"2px 6px",fontFamily:C.mono,fontWeight:700}}>BUILT-IN</span>
                </div>
                <p style={{margin:0,fontSize:11,color:C.mid,fontFamily:C.mono}}>Automatic quantitative analysis · trends, outliers, volatility, correlations · {cc.flag} {cc.name}</p>
              </div>
              <button onClick={()=>{
                const list=allVarDefsForEngine();
                if(!list.length){setEngineAnalysis({error:"No data loaded to analyze."});return;}
                setEngineAnalysis(generateEcoScopeAnalysis(list, cc.name));
              }} disabled={!data.length} style={{...btn(C.gold),opacity:!data.length?.5:1,cursor:!data.length?"not-allowed":"pointer",fontSize:11,padding:"9px 18px"}}>
                ⬡ Analyze Data
              </button>
            </div>
            {engineAnalysis&&engineAnalysis.error&&(
              <div style={{background:`${C.red}12`,border:`1px solid ${C.red}44`,borderRadius:6,padding:"12px 14px",marginTop:14}}>
                <p style={{color:C.red,fontSize:11,fontFamily:C.mono,margin:0}}>{engineAnalysis.error}</p>
              </div>
            )}
            {engineAnalysis&&!engineAnalysis.error&&(
              <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:12}}>
                {engineAnalysis.sections.map((sec,i)=>(
                  <div key={i} style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:6,padding:"12px 16px"}}>
                    <div style={{color:ACCENT[i%ACCENT.length],fontSize:11,fontFamily:C.mono,fontWeight:700,marginBottom:8}}>● {sec.name}</div>
                    <ul style={{margin:0,paddingLeft:16,display:"flex",flexDirection:"column",gap:6}}>
                      {sec.lines.map((ln,j)=><li key={j} className="mono-relax" style={{color:C.text,fontSize:11.5,fontFamily:C.mono}}>{ln}</li>)}
                    </ul>
                  </div>
                ))}
                {engineAnalysis.correlations.length>0&&(
                  <div style={{background:`${C.purple}0e`,border:`1px solid ${C.purple}33`,borderRadius:6,padding:"12px 16px"}}>
                    <div style={{color:C.purple,fontSize:11,fontFamily:C.mono,fontWeight:700,marginBottom:8}}>⟷ Cross-Variable Correlations</div>
                    <ul style={{margin:0,paddingLeft:16,display:"flex",flexDirection:"column",gap:6}}>
                      {engineAnalysis.correlations.map((c,j)=><li key={j} className="mono-relax" style={{color:C.text,fontSize:11.5,fontFamily:C.mono}}>{c}</li>)}
                    </ul>
                  </div>
                )}
                <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,textAlign:"right"}}>Generated by EcoScope's built-in analytics engine — no external service, computed on your data.</div>
              </div>
            )}
            {!engineAnalysis&&(
              <p style={{color:C.dim,fontSize:11,fontFamily:C.mono,marginTop:12,marginBottom:0}}>
                Click "Analyze Data" for instant automatic analysis — trends, growth rates, outliers, volatility, distribution shape and correlations. Free, built-in, works on any loaded data.
              </p>
            )}
          </div>

          {/* AI INSIGHT */}
          <div className="glass-card" style={{...card,background:T.card,border:`1px solid ${T.border}`}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <div style={{width:22,height:22,background:`${C.gold}`,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:C.onGold,fontWeight:700}}>◈</div>
                  <h3 style={{margin:0,fontSize:14,fontWeight:700,color:C.text}}>EcoScope AI — Deep Analysis</h3>
                  <span style={{fontSize:9,color:C.gold,background:`${C.gold}18`,borderRadius:4,padding:"2px 6px",fontFamily:C.mono,fontWeight:700}}>OPTIONAL · PRO</span>
                </div>
                <p style={{margin:0,fontSize:11,color:C.mid,fontFamily:C.mono}}>Optional narrative AI analysis · {cc.flag} {cc.name} · {currentVar.name.substring(0,36)}</p>
              </div>
              <button onClick={()=>{if(!plan.aiInsights){setUpgradeModal({feature:"AI Economic Insights",requiredPlan:"pro"});return;}getInsight();}} disabled={aiLoading||!data.length} style={{...btn(plan.aiInsights?C.gold:C.dim),background:"transparent",color:plan.aiInsights?C.gold:C.dim,opacity:aiLoading||!data.length?.5:1,cursor:aiLoading||!data.length?"not-allowed":"pointer",fontSize:11,padding:"9px 18px",position:"relative"}}>
                {aiLoading?"◌ Analysing…":"✦ Deep Analysis"}
                {!plan.aiInsights&&<span style={{position:"absolute",top:-6,right:-6,background:C.gold,color:C.onGold,fontSize:9,fontWeight:700,borderRadius:4,padding:"2px 4px",fontFamily:C.mono}}>PRO</span>}
              </button>
            </div>
            {aiError&&(
              <div style={{background:`${C.red}12`,border:`1px solid ${C.red}44`,borderRadius:6,padding:"12px 14px",marginTop:14}}>
                <p style={{color:C.red,fontSize:11,fontFamily:C.mono,margin:0}}>{aiError}</p>
              </div>
            )}
            {insight&&(
              <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:6,padding:"14px 16px",marginTop:14}}>
                <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>Analysis — {source.name} · {cc.name} · {currentVar.name}</div>
                <p className="mono-relax" style={{color:C.text,fontSize:12.5,lineHeight:1.85,margin:0,fontFamily:C.mono,whiteSpace:"pre-wrap"}}>{insight}</p>
              </div>
            )}
            {!insight&&!aiLoading&&!aiError&&(
              <p style={{color:C.dim,fontSize:11,fontFamily:C.mono,marginTop:12,marginBottom:0}}>
                Optional narrative analysis powered by an external AI model, written in prose. The built-in EcoScope AI above already gives you full quantitative analysis for free.
              </p>
            )}
          </div>

          {/* Footer */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
            <span style={{color:C.dim,fontSize:10,fontFamily:C.mono}}>Sources: World Bank · IMF · FRED · WHO GHO · Bank of Ghana · BIS · UNCTAD · ILO · UNESCO · UN Environment</span>
            <span style={{color:C.dim,fontSize:10,fontFamily:C.mono}}>EcoScope v2.0 · {new Date().getFullYear()}</span>
          </div>
        </main>
      </div>

      {showSettings&&<Settings user={liveUser} settings={settings} initialTab={settingsTab} onRequestUpgrade={()=>setShowUpgradeReq(true)} onOpenSupport={openSupport}
        onSave={ns=>{setSettings(ns);US.update(liveUser.username,{settings:ns}).catch(console.error);}} onClose={()=>setShowSettings(false)}/>}
      <SupportChat user={liveUser} open={chatOpen} setOpen={setChatOpen} mode={chatMode} setMode={setChatMode}/>
      {/* DATA IMPORT MODAL */}
      {showImpact&&<ImpactLab onClose={()=>setShowImpact(false)} defaultCountry={country} defaultVar={varCode} imported={importedRaw}
        basket={varBasket} eco={{ impute:appliedImpute, transform:appliedTransform }} years={[startYear,endYear]} onChart={importTable}/>}
      {showImport&&(
        <div style={{position:"fixed",inset:0,background:C.overlay,display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:16}}>
          <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:8,padding:"28px 32px",width:520,maxWidth:"100%",maxHeight:"85vh",overflowY:"auto",fontFamily:C.font}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <h2 style={{color:C.text,fontSize:16,fontWeight:700,margin:0}}><Ico n="arrowup"/> Import Your Data</h2>
              <button onClick={()=>setShowImport(false)} style={{background:"none",border:"none",color:C.mid,cursor:"pointer",fontSize:18}}>✕</button>
            </div>
            <div style={{color:C.mid,fontSize:11,fontFamily:C.mono,lineHeight:1.7,marginBottom:16}}>
              Upload a CSV file. First column should be time (year, date, or quarter). Other columns are your variables. The app auto-detects frequency and lets you chart, transform, impute, build composites and DAGs from it.
            </div>
            <div style={{background:C.card,border:`1px dashed ${C.cyan}55`,borderRadius:6,padding:"24px",textAlign:"center",marginBottom:16}}>
              <input type="file" accept=".csv,.tsv,.txt" id="csv-upload" style={{display:"none"}} onChange={(e)=>{
                const file=e.target.files?.[0]; if(!file) return;
                const reader=new FileReader();
                reader.onload=(ev)=>{
                  const parsed=parseCSV(ev.target.result);
                  if(parsed.error){alert(parsed.error);return;}
                  if(importTable(parsed, file.name)) setShowImport(false);
                };
                reader.readAsText(file);
              }}/>
              <label htmlFor="csv-upload" style={{cursor:"pointer",display:"block"}}>
                <div style={{fontSize:36,marginBottom:10}}><Ico n="file"/></div>
                <div style={{color:C.cyan,fontSize:13,fontWeight:700,marginBottom:4}}>Click to choose CSV file</div>
                <div style={{color:C.dim,fontSize:11,fontFamily:C.mono}}>or drag & drop · .csv .tsv .txt</div>
              </label>
            </div>
            <div style={{background:`${C.gold}0e`,border:`1px solid ${C.gold}33`,borderRadius:6,padding:"10px 12px"}}>
              <div style={{color:C.gold,fontSize:10,fontFamily:C.mono,marginBottom:4}}>Example format:</div>
              <pre style={{color:C.mid,fontSize:10,fontFamily:C.mono,margin:0,lineHeight:1.5}}>{`Year,GDP,Inflation,Unemployment
2018,65.5,7.8,6.2
2019,68.3,8.4,6.5
2020,70.1,9.9,7.1`}</pre>
            </div>
          </div>
        </div>
      )}

      {upgradeModal&&<UpgradeModal feature={upgradeModal.feature} requiredPlan={upgradeModal.requiredPlan||"pro"} onClose={()=>setUpgradeModal(null)} onUpgrade={()=>{setUpgradeModal(null);setShowUpgradeReq(true);}}/>}
      {showUpgradeReq&&<UpgradeRequestModal user={liveUser} currentPlan={liveUser.plan||"free"} onClose={()=>setShowUpgradeReq(false)}/>}

      <style>{globalCSS()}</style>
    </div>
  );
}

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

  useEffect(()=>{
    try{
      const sess=JSON.parse(localStorage.getItem(US.SESS)||"null");
      if(sess?.username){
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
  if(!user) return <Login onLogin={u=>{const nu={...u,role:u.role||(u.username==="admin"?"admin":"user")};localStorage.setItem(US.SESS,JSON.stringify(nu));setUser(nu);}}/>;
  if(user.role==="admin"||user.username==="admin") return <AdminPanel user={user} onLogout={()=>{US.logout(user.username);setUser(null);}}/>;
  return <ErrBoundary><Dashboard user={user} onLogout={()=>{US.logout(user.username);setUser(null);}}/></ErrBoundary>;
}

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
              <button onClick={()=>{navigator.clipboard.writeText(inviteLink);}} style={{background:C.gold,color:'#000',border:'none',borderRadius:6,padding:'7px 16px',fontSize:11,fontWeight:700,cursor:'pointer'}}><Ico n="clipboard"/> Copy Link</button>
            </div>
            <div style={{color:C.dim,fontSize:11,fontFamily:C.mono,lineHeight:1.6}}>Share this link with {email}. They can use it to log in — their account is ready.</div>
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
                        <span style={{color:s.color,fontSize:12,fontWeight:700,fontFamily:C.mono}}>{s.short}</span>
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
                          <td style={{padding:"9px 14px"}}><span style={{background:`${pl.color}20`,color:pl.color,borderRadius:5,padding:"2px 8px",fontSize:10,fontWeight:700}}>{pl.badge}</span></td>
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
                      <button onClick={()=>pingSource(i)} disabled={pingLoading[i]} style={{background:`${s.color}15`,border:`1px solid ${s.color}44`,borderRadius:6,padding:"7px 16px",color:s.color,fontSize:11,cursor:"pointer",fontFamily:C.mono,opacity:pingLoading[i]?.6:1}}>
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
