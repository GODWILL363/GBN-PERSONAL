// core/theme.js — split from App.js (code unchanged; only imports and exports were added)


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
    // professional light: cool grey canvas, white cards with a visible edge, navy text, deep-blue accent (all text pairs pass WCAG AA)
    bg:"#eceff4", surface:"#ffffff", card:"#ffffff", raised:"#f3f5f9", inputBg:"#ffffff",
    border:"#d3dae5", borderHi:"#9aa7ba", pillBorder:"#c3ccd9",
    text:"#0b1424", mid:"#38475b", dim:"#5b697d",
    gold:"#1849b8", goldLt:"#2457cf", onGold:"#ffffff",
    teal:"#04704c", red:"#b42318", blue:"#0b5cad", purple:"#5b3fb5", orange:"#9a4a05", cyan:"#0b6574",
    focus:"#1849b8", shadow:"0 1px 2px rgba(11,20,36,.06), 0 2px 8px rgba(11,20,36,.07)", overlay:"rgba(11,20,36,.5)",
    series:["#1849b8","#d0700a","#0f8a5f","#c0392b","#6f42c1","#0e7490","#a16207","#be185d","#475569","#ea580c","#4d7c0f","#4338ca","#92400e","#0f766e"],
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
    border:"#e2dccd", borderHi:"#c2b9a3", pillBorder:"#cfc6b2",
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
// readable text colour on light themes: darken brand colours (yellow, cyan, lime ...) until they reach 4.5:1 on the card
const _inkMemo = new Map();
const ink = (col) => { if (!col || C.scheme !== "light" || typeof col !== "string" || !/^#[0-9a-f]{6}$/i.test(col)) return col; const key = col + C.card; if (_inkMemo.has(key)) return _inkMemo.get(key);
  const lum = (h) => { const v = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const bgL = lum(C.card); let c = col; for (let k = 0; k < 12 && (bgL + 0.05) / (lum(c) + 0.05) < 4.5; k++) c = "#" + [1, 3, 5].map(i => Math.round(parseInt(c.slice(i, i + 2), 16) * 0.85).toString(16).padStart(2, "0")).join("");
  _inkMemo.set(key, c); return c; };
function applyTheme(key){
  const k = THEMES[key] ? key : "dark";
  const th = THEMES[k];
  Object.assign(C, th, {themeKey:k, pillBorder: th.pillBorder || th.border});
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
  button:not(:disabled):hover{filter:${C.scheme==="light"?"brightness(.95)":"brightness(1.08)"};}
  ${C.scheme==="light"?`header,nav{box-shadow:0 1px 0 ${C.border};} table th{color:${C.text};} ::-webkit-scrollbar{width:10px;height:10px;} ::-webkit-scrollbar-thumb{background:${C.borderHi};border-radius:6px;border:2px solid ${C.bg};} ::-webkit-scrollbar-track{background:transparent;}`:""}
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
  dash:["M3 3h7v9H3z","M14 3h7v5h-7z","M14 12h7v9h-7z","M3 16h7v5H3z"],
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
  bell:["M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9","M13.7 21a2 2 0 0 1-3.4 0"],
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
const ISO3_TO_ISO2 = Object.fromEntries(Object.entries(ISO3).map(([a,b])=>[b,a]));
const DS_COUNTRY_SET = new Set(COUNTRIES.flatMap(c => [c.name.toLowerCase(), c.code.toLowerCase(), (ISO3[c.code] || "").toLowerCase()]).filter(Boolean));

export { ACCENT, C, COUNTRIES, CURRENT_YEAR, DS_COUNTRY_SET, ISO3, ISO3_TO_ISO2, Ico, PLANS, PRO_SOURCES, REGIONS, THEMES, YEARS, applyTheme, checkPw, checkUn, getValueColor, globalCSS, ink, pwRules };
