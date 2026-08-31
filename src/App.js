import React, { useState, useEffect, useCallback, useMemo } from "react";
import { LineChart, Line, BarChart, Bar, AreaChart, Area, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
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
// PALETTE
// ══════════════════════════════════════════════
const C = {
  bg:"#05070f", surface:"#0b0e1c", card:"#0f1221",
  border:"#182038", borderHi:"#243060",
  gold:"#f0a500", goldLt:"#ffcc5c",
  teal:"#00c9a7", red:"#ff4c6a", blue:"#4f8cff",
  purple:"#b05cff", orange:"#ff8c42", cyan:"#00d4e8",
  text:"#dde3f5", mid:"#7a88b0", dim:"#3a4565",
  font:"'Syne',sans-serif", mono:"'IBM Plex Mono',monospace",
};
const ACCENT = ["#f0a500","#00c9a7","#4f8cff","#ff4c6a","#b05cff","#ff8c42","#00d4e8"];

// ══════════════════════════════════════════════
// THEMES
// ══════════════════════════════════════════════
const THEMES = {
  dark:   {bg:"#05070f",surface:"#0b0e1c",card:"#0f1221",border:"#182038",borderHi:"#243060",text:"#dde3f5",mid:"#7a88b0",dim:"#3a4565",label:"Dark Terminal"},
  light:  {bg:"#f0f4ff",surface:"#ffffff",card:"#f8faff",border:"#dde3f5",borderHi:"#b0c4f0",text:"#0f1221",mid:"#4a5580",dim:"#8090b0",label:"Light Mode"},
  ocean:  {bg:"#020d1a",surface:"#051525",card:"#071e33",border:"#0a2d4a",borderHi:"#0e3d66",text:"#d0eaff",mid:"#5590b0",dim:"#2a4a60",label:"Ocean Deep"},
  forest: {bg:"#050f08",surface:"#0a1a0d",card:"#0f2415",border:"#1a3a20",borderHi:"#255030",text:"#d5f0dc",mid:"#55906a",dim:"#2a4a35",label:"Forest Night"},
  amber:  {bg:"#0f0800",surface:"#1a1000",card:"#241800",border:"#3a2a00",borderHi:"#503a00",text:"#fff0d0",mid:"#c09040",dim:"#604820",label:"Amber Glow"},
};

// ══════════════════════════════════════════════
// SUBSCRIPTION PLANS
// ══════════════════════════════════════════════
const PLANS = {
  free:       {id:"free",name:"Free",price:0,priceLabel:"Free forever",color:"#7a88b0",
    sources:["worldbank","imf"],aiInsights:false,exports:["csv"],compare:false,maxYears:10,badge:"FREE",
    desc:"Basic macro data from World Bank & IMF. CSV export only."},
  pro:        {id:"pro",name:"Pro",price:9.99,priceLabel:"$9.99/month",color:"#f0a500",
    sources:"all",aiInsights:true,exports:["csv","excel","pdf"],compare:true,maxYears:65,badge:"PRO",
    desc:"All 17 data sources, AI insights, Excel & PDF exports, country comparison."},
  enterprise: {id:"enterprise",name:"Enterprise",price:null,priceLabel:"Custom pricing",color:"#00c9a7",
    sources:"all",aiInsights:true,exports:["csv","excel","pdf"],compare:true,maxYears:65,badge:"ENT",
    desc:"Everything in Pro plus priority support, custom integrations and volume access."},
};

const PRO_SOURCES=["wdi","gse","imffsi","faostat","sdg","unicef","findex","sociology","hdi","gii","gpi","happiness","efi"];

// Color-code bars/lines by relative value
const getValueColor = (value, allValues) => {
  if (!allValues||!allValues.length) return ACCENT[0];
  const min=Math.min(...allValues); const max=Math.max(...allValues);
  if (max===min) return ACCENT[0];
  const pct=(value-min)/(max-min);
  if (pct>=0.75) return "#00c9a7";  // high — teal
  if (pct>=0.5)  return "#f0a500";  // mid-high — gold
  if (pct>=0.25) return "#ff8c42";  // mid-low — orange
  return "#ff4c6a";                  // low — red
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
const YEARS = Array.from({length:65},(_,i)=>1960+i);

// ══════════════════════════════════════════════
// DATA SOURCES — MACRO LEVEL
// ══════════════════════════════════════════════
const MACRO_SOURCES = [
  {
    id:"worldbank", name:"World Bank", short:"WB", region:"Global", color:"#4f8cff",
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
    id:"imf", name:"IMF — World Economic Outlook", short:"IMF", region:"Global", color:"#00c9a7",
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
    id:"fred", name:"Federal Reserve — FRED", short:"FRED", region:"USA", color:"#ff4c6a",
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
    id:"bog", name:"Bank of Ghana", short:"BoG", region:"Ghana", color:"#f0a500",
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
    id:"bis", name:"Bank for Intl. Settlements (BIS)", short:"BIS", region:"Global", color:"#00d4e8",
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
    id:"unctad", name:"UNCTAD — Trade & Investment", short:"UNCTAD", region:"Global", color:"#ff8c42",
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
    id:"wdi", name:"World Bank WDI — Development Indicators", short:"WDI", region:"Global", color:"#4f8cff",
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
  }
];

// ══════════════════════════════════════════════
// DATA SOURCES — MICRO LEVEL
// ══════════════════════════════════════════════
const MICRO_SOURCES = [
  {
    id:"who", name:"WHO — Global Health Observatory", short:"WHO", region:"Global", color:"#b05cff",
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
    id:"ilo", name:"ILO — ILOSTAT Labour Stats", short:"ILO", region:"Global", color:"#00d4e8",
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
    id:"wbpov", name:"World Bank — Poverty & Inequality", short:"WB-P", region:"Global", color:"#4f8cff",
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
    id:"unesco", name:"UNESCO — UIS Education Data", short:"UIS", region:"Global", color:"#ff8c42",
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
    id:"environment", name:"Climate & Environment", short:"ENV", region:"Global", color:"#00c9a7",
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

const fetchWorldBank = async (cc, code, y0, y1) => {
  const ckey = `wb:${cc}:${code}:${y0}:${y1}`;
  const cached = cacheGet(ckey);
  if(cached) return cached;
  try {
    const r = await fetch(`https://api.worldbank.org/v2/country/${cc}/indicator/${code}?format=json&date=${y0}:${y1}&per_page=100`);
    const j = await r.json();
    if (!j?.[1]) { cacheSet(ckey,[]); return []; }
    const result = j[1]
      .filter(d => parseInt(d.date) >= y0 && parseInt(d.date) <= y1)
      .map(d => ({year: parseInt(d.date), value: d.value!=null ? parseFloat(d.value) : null}))
      .sort((a, b) => a.year - b.year);
    cacheSet(ckey, result);
    return result;
  } catch { return []; }
};

const fetchIMF = async (cc, code, y0, y1) => {
  try {
    const iso3 = ISO3[cc] || cc;
    const r = await fetch(`https://www.imf.org/external/datamapper/api/v1/${code}/${iso3}`);
    const j = await r.json();
    const data = j?.values?.[code]?.[iso3];
    if (!data) return [];
    return Object.entries(data)
      .filter(([y, v]) => +y >= y0 && +y <= y1 && v != null)
      .map(([y, v]) => ({year: parseInt(y), value: parseFloat(v)}))
      .sort((a, b) => a.year - b.year);
  } catch { return []; }
};

const fetchFRED = async (code, y0, y1, key) => {
  if (!key) return [];
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${code}&api_key=${key}&file_type=json&observation_start=${y0}-01-01&observation_end=${y1}-12-31&frequency=a&aggregation_method=avg`;
    const r = await fetch(url);
    const j = await r.json();
    if (!j?.observations) return [];
    return j.observations
      .filter(o => o.value !== '.' && o.value != null)
      .map(o => ({year: parseInt(o.date.substring(0, 4)), value: parseFloat(o.value)}))
      .sort((a, b) => a.year - b.year);
  } catch { return []; }
};

const fetchWHO = async (cc, code, y0, y1) => {
  try {
    const iso3 = ISO3[cc] || cc;
    const url = `https://ghoapi.azureedge.net/api/${code}?$filter=SpatialDim eq '${iso3}' and TimeDim ge ${y0} and TimeDim le ${y1}&$select=TimeDim,NumericValue&$orderby=TimeDim`;
    const r = await fetch(url);
    const j = await r.json();
    if (!j?.value) return [];
    return j.value
      .filter(d => d.NumericValue != null)
      .map(d => ({year: d.TimeDim, value: d.NumericValue}))
      .sort((a, b) => a.year - b.year);
  } catch { return []; }
};

const fetchData = async (sourceId, varDef, cc, y0, y1, apiKeys) => {
  const api = varDef.api || sourceId;
  switch (api) {
    case "worldbank": return fetchWorldBank(cc, varDef.wbCode || varDef.code, y0, y1);
    case "imf":       return fetchIMF(cc, varDef.code, y0, y1);
    case "fred":      return fetchFRED(varDef.code, y0, y1, apiKeys.fred);
    case "who":       return fetchWHO(cc, varDef.code, y0, y1);
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

const dlCSV = (rows, name) => {
  if (!rows.length) return;
  const h = Object.keys(rows[0]).join(",");
  const b = rows.map(r => Object.values(r).join(",")).join("\n");
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
  const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#1a2040" ss:Pattern="Solid"/><Font ss:Color="#f0a500" ss:Bold="1"/></Style></Styles><Worksheet ss:Name="EcoScope Data"><Table><Row>${headers.map(h => `<Cell ss:StyleID="h"><Data ss:Type="String">${h}</Data></Cell>`).join("")}</Row>${xmlRows}</Table></Worksheet></Workbook>`;
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
  const html = `<html><head><title>${varName} — ${countryName}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:40px;color:#111}h1{font-size:20px;margin-bottom:6px;color:#0f1221}h2{font-size:13px;font-weight:400;color:#666;margin-bottom:24px}.badge{display:inline-block;background:#f0a500;color:#000;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:13px}th{padding:10px 14px;background:#0f1221;color:#f0a500;text-align:left;font-weight:600}td{padding:8px 14px;border-bottom:1px solid #eee}.footer{margin-top:24px;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:12px}@media print{body{padding:20px}}</style></head><body><div class="badge">EcoScope · ${sourceName}</div><h1>${varName}</h1><h2>${countryName} · ${startYear}–${endYear}</h2><table><thead><tr><th>Year</th><th style="text-align:right">Value</th><th style="text-align:right">YoY Change</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">Generated by EcoScope — Global Economic Intelligence Platform · ${new Date().toLocaleDateString()}</div></body></html>`;
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
  <rect width="${W}" height="${TH}" fill="#05070f"/>
  <rect width="${W}" height="${PAD}" fill="#0b0e1c"/>
  <line x1="0" y1="${PAD}" x2="${W}" y2="${PAD}" stroke="#182038" stroke-width="1"/>
  <text x="14" y="20" fill="#f0a500" font-size="13" font-weight="bold" font-family="Arial,sans-serif">${(title||'EcoScope').replace(/&/g,'&amp;').replace(/</g,'&lt;').substring(0,72)}</text>
  <text x="14" y="36" fill="#3a4565" font-size="9" font-family="Arial,sans-serif">EcoScope — Global Economic Intelligence · ${new Date().toLocaleDateString()}</text>
  <g transform="translate(0,${PAD})">${inner}</g>
  <text x="14" y="${TH-6}" fill="#3a4565" font-size="8" font-family="Arial,sans-serif">Source: World Bank · IMF · FRED · WHO · ILO · UNESCO · FAO · UN SDG · UNDP · Heritage · WIPO · IEP</text>
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
      backgroundColor:'#05070f',scale:SCALE,
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
    ctx.fillStyle='#05070f'; ctx.fillRect(0,0,cw,ch+PAD+FOOT);

    // Title bar
    ctx.fillStyle='#0b0e1c'; ctx.fillRect(0,0,cw,PAD-4);
    ctx.fillStyle='#182038'; ctx.fillRect(0,PAD-4,cw,1);

    // Title text
    ctx.fillStyle='#f0a500'; ctx.font='bold 14px Arial, sans-serif';
    ctx.fillText((title||'EcoScope Chart').substring(0,70), 14, 22);

    // Subtitle
    ctx.fillStyle='#3a4565'; ctx.font='10px Arial, sans-serif';
    ctx.fillText('EcoScope — Global Economic Intelligence Platform · '+new Date().toLocaleDateString(), 14, 40);

    // Draw chart (unscaled since h2c already scaled)
    ctx.resetTransform();
    ctx.drawImage(chartCanvas, 0, PAD*SCALE);
    ctx.scale(SCALE,SCALE);

    // Footer
    ctx.fillStyle='#3a4565'; ctx.font='8px Arial, sans-serif';
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
          body{margin:0;background:#05070f;color:#dde3f5;font-family:Arial,sans-serif;padding:20px}
          h3{color:#f0a500;margin:0 0 8px}
          p{color:#3a4565;font-size:10px;margin:8px 0 0}
          @media print{body{background:#fff} h3{color:#b07000}}
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


// ══════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════

const inp = {background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",color:C.text,fontSize:12,fontFamily:C.mono,outline:"none",boxSizing:"border-box",width:"100%"};
const sel = {...inp, cursor:"pointer"};
const pill = (active, col=C.gold) => ({padding:"4px 11px",borderRadius:20,border:"1px solid",borderColor:active?col:C.border,background:active?`${col}1a`:"transparent",color:active?col:C.mid,fontSize:10,cursor:"pointer",fontFamily:C.mono,transition:"all .15s",whiteSpace:"nowrap"});
const btn = (col=C.gold) => ({background:col,color:col===C.gold?"#000":"#fff",border:"none",borderRadius:8,padding:"10px 20px",fontSize:12,fontWeight:700,fontFamily:C.font,cursor:"pointer",letterSpacing:"0.04em"});
const card = {background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"18px 22px"};

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
  const avatarColor=["#f0a500","#00c9a7","#4f8cff","#b05cff","#ff4c6a"][Math.abs(u.charCodeAt(0)||0)%5];

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
      const avatarColor=["#f0a500","#00c9a7","#4f8cff","#b05cff","#ff4c6a"][Math.abs(u.charCodeAt(0)||0)%5];
      onLogin({...res.user,initials,avatarColor});
    } else {
      if(!u.trim()||!p){setErr("Both fields required");return;}
      setLoading(true);await new Promise(r=>setTimeout(r,600));setLoading(false);
      const res=await US.login(u.trim(),p);
      if(res.error){setErr(res.error);return;}
      const initials=res.user.username.slice(0,2).toUpperCase();
      const avatarColor=["#f0a500","#00c9a7","#4f8cff","#b05cff","#ff4c6a"][Math.abs(res.user.username.charCodeAt(0)||0)%5];
      onLogin({...res.user,initials,avatarColor});
    }
  };

  const Tab=({id,label})=>(<button onClick={()=>{setMode(id);setErr("");setOk("");}} style={{background:"none",border:"none",padding:"10px 0",fontSize:11,fontFamily:C.mono,cursor:"pointer",color:mode===id?C.gold:C.mid,borderBottom:`2px solid ${mode===id?C.gold:"transparent"}`,transition:"all .15s",letterSpacing:"0.08em",textTransform:"uppercase",flex:1}}>{label}</button>);

  const PwStrength=({pw})=>{
    const errs=checkPw(pw);
    const score=pwRules.length-errs.length;
    const cols=["#ff4c6a","#ff8c42","#f0a500","#00c9a7"];
    return pw?(
      <div style={{marginTop:8}}>
        <div style={{display:"flex",gap:3,marginBottom:5}}>
          {pwRules.map((_,i)=><div key={i} style={{flex:1,height:3,borderRadius:2,background:i<score?cols[Math.min(score-1,3)]:C.border,transition:"background .2s"}}/>)}
        </div>
        {errs.map((e,i)=><div key={i} style={{color:C.red,fontSize:9,fontFamily:C.mono}}>✗ {e}</div>)}
        {!errs.length&&<div style={{color:C.teal,fontSize:9,fontFamily:C.mono}}>✓ Strong password</div>}
      </div>
    ):null;
  };

  return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:C.font,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(${C.border}44 1px,transparent 1px),linear-gradient(90deg,${C.border}44 1px,transparent 1px)`,backgroundSize:"48px 48px",pointerEvents:"none"}}/>
      <div style={{position:"absolute",width:700,height:700,borderRadius:"50%",background:`radial-gradient(circle,${C.gold}0d 0%,transparent 70%)`,top:"50%",left:"50%",transform:"translate(-50%,-50%)",pointerEvents:"none"}}/>
      <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:22,padding:"40px 44px 32px",width:440,position:"relative",boxShadow:`0 32px 80px rgba(0,0,0,.6)`}}>
        <div style={{textAlign:"center",marginBottom:22}}>
          <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:54,height:54,background:`linear-gradient(135deg,${C.gold},${C.goldLt})`,borderRadius:16,fontSize:24,marginBottom:12,boxShadow:`0 8px 24px ${C.gold}44`}}>◈</div>
          <h1 style={{color:C.text,fontSize:24,fontWeight:800,margin:"0 0 3px",letterSpacing:"-0.5px"}}>EcoScope</h1>
          <p style={{color:C.dim,fontSize:9,margin:0,fontFamily:C.mono,letterSpacing:"0.18em"}}>GLOBAL ECONOMIC INTELLIGENCE PLATFORM</p>
        </div>

        {u.trim()&&mode!=="forgot"&&(
          <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
            <div style={{width:38,height:38,borderRadius:"50%",background:avatarColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#000",boxShadow:`0 0 0 3px ${C.surface},0 0 0 5px ${avatarColor}55`}}>{initials}</div>
          </div>
        )}

        {mode!=="forgot"&&(<div style={{display:"flex",gap:0,borderBottom:`1px solid ${C.border}`,marginBottom:20}}><Tab id="login" label="Sign In"/><Tab id="register" label="Create Account"/></div>)}

        {ok&&<div style={{background:`${C.teal}15`,border:`1px solid ${C.teal}44`,borderRadius:8,padding:"10px 13px",marginBottom:14,color:C.teal,fontSize:11,fontFamily:C.mono}}>{ok}</div>}

        <form onSubmit={go}>
          {mode==="forgot"?(
            <><div style={{color:C.mid,fontSize:11,fontFamily:C.mono,marginBottom:16,lineHeight:1.6}}>Enter your email to receive a reset link.</div>
            <div style={{marginBottom:16}}><div style={{color:C.mid,fontSize:9,fontFamily:C.mono,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:7}}>Email Address</div><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={{...inp,border:`1px solid ${email?C.gold:C.border}`,fontSize:13,padding:"12px 14px"}}/></div></>
          ):(
            <>
              <div style={{marginBottom:12}}>
                <div style={{color:C.mid,fontSize:9,fontFamily:C.mono,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:7}}>Username</div>
                <input type="text" value={u} onChange={e=>setU(e.target.value)} placeholder="Enter your username" style={{...inp,border:`1px solid ${u&&!unErrs.length?C.teal:u&&unErrs.length?C.red:C.border}`,fontSize:13,padding:"12px 14px"}}/>
                {mode==="register"&&u&&unErrs.map((e,i)=><div key={i} style={{color:C.red,fontSize:9,fontFamily:C.mono,marginTop:4}}>✗ {e}</div>)}
                {mode==="register"&&u&&!unErrs.length&&<div style={{color:C.teal,fontSize:9,fontFamily:C.mono,marginTop:4}}>✓ Username available</div>}
              </div>
              {mode==="register"&&(
                <div style={{marginBottom:12}}>
                  <div style={{color:C.mid,fontSize:9,fontFamily:C.mono,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:7}}>Email Address</div>
                  <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={{...inp,border:`1px solid ${email?C.gold:C.border}`,fontSize:13,padding:"12px 14px"}}/>
                </div>
              )}
              <div style={{marginBottom:mode==="register"?8:6}}>
                <div style={{color:C.mid,fontSize:9,fontFamily:C.mono,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:7}}>Password</div>
                <div style={{position:"relative"}}>
                  <input type={showPw?"text":"password"} value={p} onChange={e=>setP(e.target.value)} placeholder={mode==="login"?"Enter password":"Min 8 chars, uppercase, number, symbol"} style={{...inp,border:`1px solid ${p&&mode==="register"?(!pwErrs.length?C.teal:C.red):p?C.gold:C.border}`,fontSize:13,padding:"12px 40px 12px 14px"}}/>
                  <button type="button" onClick={()=>setShowPw(v=>!v)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.mid,cursor:"pointer",fontSize:12}}>{showPw?"🙈":"👁"}</button>
                </div>
                {mode==="register"&&<PwStrength pw={p}/>}
              </div>
              {mode==="register"&&(
                <div style={{marginBottom:8}}>
                  <div style={{color:C.mid,fontSize:9,fontFamily:C.mono,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:7}}>Confirm Password</div>
                  <input type="password" value={p2} onChange={e=>setP2(e.target.value)} placeholder="Repeat password" style={{...inp,border:`1px solid ${p2?(p===p2?C.teal:C.red):C.border}`,fontSize:13,padding:"12px 14px"}}/>
                  {p2&&p!==p2&&<div style={{color:C.red,fontSize:9,fontFamily:C.mono,marginTop:4}}>✗ Passwords do not match</div>}
                  {p2&&p===p2&&<div style={{color:C.teal,fontSize:9,fontFamily:C.mono,marginTop:4}}>✓ Passwords match</div>}
                </div>
              )}
              {mode==="login"&&<div style={{textAlign:"right",marginBottom:14}}><button type="button" onClick={()=>{setMode("forgot");setErr("");setOk("");}} style={{background:"none",border:"none",color:C.blue,fontSize:10,fontFamily:C.mono,cursor:"pointer"}}>Forgot password?</button></div>}
            </>
          )}
          {err&&<div style={{background:`${C.red}12`,border:`1px solid ${C.red}44`,borderRadius:7,padding:"9px 12px",marginBottom:12,color:C.red,fontSize:11,fontFamily:C.mono}}>{err}</div>}
          <button type="submit" disabled={loading} style={{...btn(),width:"100%",padding:"13px",fontSize:13,opacity:loading?.6:1,marginTop:4}}>
            {loading?"PROCESSING…":mode==="login"?"SIGN IN →":mode==="register"?"CREATE ACCOUNT →":"SEND RESET LINK →"}
          </button>
        </form>
        {mode==="forgot"&&<button onClick={()=>{setMode("login");setOk("");setErr("");}} style={{background:"none",border:"none",color:C.mid,fontSize:11,fontFamily:C.mono,cursor:"pointer",width:"100%",textAlign:"center",marginTop:14}}>← Back to Sign In</button>}
        <div style={{borderTop:`1px solid ${C.border}`,marginTop:20,paddingTop:14,display:"flex",justifyContent:"center",gap:22}}>
          {[["🌍","World Bank"],["📊","IMF"],["🏦","FRED"],["🔬","WHO"]].map(([ic,nm])=>(
            <div key={nm} style={{textAlign:"center"}}><div style={{fontSize:16,marginBottom:2}}>{ic}</div><div style={{color:C.dim,fontSize:8,fontFamily:C.mono}}>{nm}</div></div>
          ))}
        </div>
        <p style={{textAlign:"center",color:C.dim,fontSize:9,marginTop:10,fontFamily:C.mono}}>EcoScope · Real accounts required</p>
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
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,backdropFilter:"blur(8px)"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,border:`2px solid ${pl.color}55`,borderRadius:20,padding:"40px 44px",width:430,textAlign:"center",boxShadow:`0 32px 80px rgba(0,0,0,.7),0 0 0 1px ${pl.color}22`}}>
        <div style={{fontSize:40,marginBottom:14}}>🔒</div>
        <div style={{background:`${pl.color}18`,border:`1px solid ${pl.color}44`,borderRadius:8,padding:"4px 14px",display:"inline-block",marginBottom:14}}>
          <span style={{color:pl.color,fontSize:10,fontFamily:C.mono,fontWeight:800,letterSpacing:"0.12em"}}>{pl.badge} PLAN REQUIRED</span>
        </div>
        <h2 style={{color:C.text,fontSize:18,fontWeight:800,margin:"0 0 10px",lineHeight:1.3}}>{feature}</h2>
        <p style={{color:C.mid,fontSize:12,fontFamily:C.mono,marginBottom:24,lineHeight:1.7}}>
          This feature requires the <strong style={{color:pl.color}}>{pl.name} plan</strong> ({pl.priceLabel}).<br/>
          Upgrade to unlock AI Insights, all 10 data sources, Excel & PDF exports, and country comparison.
        </p>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={onClose} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:9,padding:"11px 22px",color:C.mid,fontSize:12,cursor:"pointer",fontFamily:C.font}}>Maybe later</button>
          <button onClick={onUpgrade} style={{background:`linear-gradient(135deg,${pl.color},${C.goldLt})`,border:"none",borderRadius:9,padding:"11px 26px",color:"#000",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:C.font}}>Upgrade to {pl.name} →</button>
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
      dlCSV(data.map(d=>({Year:d.year,[currentVar.name]:fmtVal(d.value,fmt)})),filename+".csv");
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
      <button onClick={()=>setOpen(v=>!v)} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:8,border:`1px solid ${C.teal}66`,background:open?`${C.teal}18`:"transparent",color:C.teal,fontSize:11,cursor:"pointer",fontFamily:C.mono,fontWeight:600}}>
        ↓ Export {open?"▲":"▼"}
      </button>
      {open&&(
        <>
          <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:98}}/>
          <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:12,padding:8,minWidth:210,zIndex:99,boxShadow:"0 12px 36px rgba(0,0,0,.6)"}}>
            <div style={{color:C.dim,fontSize:9,fontFamily:C.mono,padding:"4px 10px 6px",textTransform:"uppercase",letterSpacing:"0.12em"}}>Choose Format</div>
            {[
              {type:"csv",icon:"📄",label:"CSV",sub:"Comma separated values",free:true},
              {type:"excel",icon:"📊",label:"Excel (.xls)",sub:"Spreadsheet with formatting",free:canXls},
              {type:"pdf",icon:"📋",label:"PDF Report",sub:"Printable formatted report",free:canPdf},
            ].map(({type,icon,label,sub,free})=>(
              <button key={type} onClick={()=>doExport(type)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 12px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",textAlign:"left",transition:"background .1s"}}>
                <span style={{fontSize:18,flexShrink:0}}>{icon}</span>
                <div style={{flex:1}}>
                  <div style={{color:C.text,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
                    {label}
                    {!free&&<span style={{background:`${C.gold}20`,color:C.gold,fontSize:8,fontFamily:C.mono,borderRadius:4,padding:"1px 5px",fontWeight:700}}>PRO</span>}
                  </div>
                  <div style={{color:C.dim,fontSize:10,fontFamily:C.mono}}>{sub}</div>
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
function SupportForm({user}) {
  const [type,setType]=useState("bug");
  const [msg,setMsg]=useState("");
  const [sent,setSent]=useState(false);
  const [loading,setLoading]=useState(false);
  const submit=async(e)=>{
    e.preventDefault();
    if(!msg.trim())return;
    setLoading(true);
    await new Promise(r=>setTimeout(r,900));
    setLoading(false);setSent(true);
  };
  if(sent) return(
    <div style={{background:`${C.teal}12`,border:`1px solid ${C.teal}44`,borderRadius:10,padding:"20px",textAlign:"center"}}>
      <div style={{fontSize:28,marginBottom:10}}>✓</div>
      <div style={{color:C.teal,fontSize:13,fontWeight:600,marginBottom:6}}>Ticket submitted!</div>
      <div style={{color:C.mid,fontSize:11,fontFamily:C.mono}}>We'll reply to {user.email||user.username+"@ecoscope.app"} within 24 hours.</div>
      <button onClick={()=>{setSent(false);setMsg("");}} style={{marginTop:14,background:"none",border:`1px solid ${C.border}`,borderRadius:7,padding:"7px 16px",color:C.mid,fontSize:11,cursor:"pointer",fontFamily:C.mono}}>Submit another</button>
    </div>
  );
  return(
    <form onSubmit={submit}>
      <div style={{marginBottom:14}}>
        <div style={{color:C.mid,fontSize:9,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>Ticket Type</div>
        <div style={{display:"flex",gap:6}}>
          {[["bug","🐛 Bug Report"],["feature","✨ Feature Request"],["data","📊 Data Issue"],["other","💬 Other"]].map(([v,l])=>(
            <button key={v} type="button" onClick={()=>setType(v)} style={{...pill(type===v),fontSize:10,padding:"5px 10px"}}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{marginBottom:14}}>
        <div style={{color:C.mid,fontSize:9,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>Your Email</div>
        <input type="email" value={user.email||""} readOnly style={{...inp,fontSize:12,opacity:.7}}/>
      </div>
      <div style={{marginBottom:14}}>
        <div style={{color:C.mid,fontSize:9,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>Message</div>
        <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Describe your issue or request in detail..." rows={5} style={{...inp,resize:"vertical",fontSize:12,lineHeight:1.6}}/>
      </div>
      <button type="submit" disabled={loading||!msg.trim()} style={{background:C.gold,color:"#000",border:"none",borderRadius:8,padding:"10px 20px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:C.font,opacity:loading||!msg.trim()?.5:1}}>
        {loading?"Sending…":"Submit Ticket →"}
      </button>
      <div style={{marginTop:16,padding:"11px 14px",background:C.card,borderRadius:9,border:`1px solid ${C.border}`}}>
        <div style={{color:C.mid,fontSize:10,fontFamily:C.mono}}>📧 Direct: <span style={{color:C.blue}}>support@ecoscope.app</span></div>
        <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,marginTop:4}}>📚 Docs: <span style={{color:C.blue}}>docs.ecoscope.app</span></div>
      </div>
    </form>
  );
}

// ══════════════════════════════════════════════
// SETTINGS MODAL
// ══════════════════════════════════════════════

function Settings({user, settings, onSave, onClose}) {
  const [s,setS]=useState({...settings});
  const [tab,setTab]=useState("account");
  // Admin sees API Keys tab; regular users do not
  const isAdmin=user?.role==="admin";
  const tabs=[
    {id:"account",icon:"👤",label:"Account"},
    {id:"data",icon:"📊",label:"Data Defaults"},
    ...(isAdmin?[{id:"keys",icon:"🔑",label:"API Keys"}]:[]),
    {id:"theme",icon:"🎨",label:"Themes"},
    {id:"plan",icon:"⬡",label:"Subscription"},
    {id:"support",icon:"🛟",label:"Support"},
    {id:"help",icon:"❓",label:"Help"},
  ];
  const Sec=({title,children})=>(<div style={{marginBottom:20}}><div style={{color:C.gold,fontSize:9,fontFamily:C.mono,letterSpacing:"0.13em",textTransform:"uppercase",marginBottom:12,paddingBottom:7,borderBottom:`1px solid ${C.border}`}}>{title}</div>{children}</div>);
  const Field=({label,hint,children})=>(<div style={{marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><div style={{color:C.text,fontSize:12,fontWeight:600}}>{label}</div>{hint&&<span style={{color:C.dim,fontSize:10,fontFamily:C.mono}}>{hint}</span>}</div>{children}</div>);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.82)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,backdropFilter:"blur(8px)"}}>
      <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:18,width:620,maxHeight:"88vh",display:"flex",flexDirection:"column",fontFamily:C.font,boxShadow:`0 32px 80px rgba(0,0,0,.7)`}}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 24px 16px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg,${C.gold},${C.goldLt})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>◈</div>
            <div><div style={{fontSize:15,fontWeight:700,color:C.text}}>Settings</div><div style={{fontSize:9,color:C.dim,fontFamily:C.mono}}>EcoScope Preferences</div></div>
          </div>
          <button onClick={onClose} style={{background:`${C.border}`,border:"none",color:C.mid,cursor:"pointer",fontSize:14,width:28,height:28,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        <div style={{display:"flex",flex:1,overflow:"hidden"}}>
          {/* Sidebar tabs */}
          <div style={{width:160,background:C.card,borderRight:`1px solid ${C.border}`,padding:"12px 8px",display:"flex",flexDirection:"column",gap:2,flexShrink:0}}>
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px",borderRadius:8,border:"none",background:tab===t.id?`${C.gold}15`:"transparent",cursor:"pointer",textAlign:"left",borderLeft:`2px solid ${tab===t.id?C.gold:"transparent"}`,transition:"all .12s"}}>
                <span style={{fontSize:14}}>{t.icon}</span>
                <span style={{color:tab===t.id?C.gold:C.mid,fontSize:12,fontWeight:tab===t.id?600:400}}>{t.label}</span>
              </button>
            ))}
          </div>
          {/* Content */}
          <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>
            {tab==="account"&&(
              <>
                <Sec title="Profile">
                  <div style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",background:C.card,borderRadius:10,marginBottom:14,border:`1px solid ${C.border}`}}>
                    <div style={{width:44,height:44,borderRadius:"50%",background:user.avatarColor||C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"#000",flexShrink:0}}>{user.initials||"U"}</div>
                    <div><div style={{color:C.text,fontSize:13,fontWeight:700}}>{user.username}</div><div style={{color:C.mid,fontSize:11,fontFamily:C.mono}}>{user.email||"—"}</div></div>
                  </div>
                </Sec>
                <Sec title="Account Details">
                  <Field label="Display Name"><input value={s.displayName||user.username} onChange={e=>setS(x=>({...x,displayName:e.target.value}))} style={{...inp,fontSize:12}} placeholder="Your display name"/></Field>
                  <Field label="Email Address"><input value={s.emailPref||user.email||""} onChange={e=>setS(x=>({...x,emailPref:e.target.value}))} type="email" style={{...inp,fontSize:12}} placeholder="your@email.com"/></Field>
                </Sec>
                <Sec title="Security">
                  <Field label="Change Password" hint="Demo mode"><input type="password" placeholder="New password (demo only)" style={{...inp,fontSize:12,opacity:.6}} disabled/></Field>
                  <div style={{background:`${C.teal}10`,border:`1px solid ${C.teal}33`,borderRadius:8,padding:"10px 13px"}}>
                    <div style={{color:C.teal,fontSize:11,fontFamily:C.mono}}>✓ Demo mode — credentials are not persisted</div>
                  </div>
                </Sec>
              </>
            )}
            {tab==="data"&&(
              <>
                <Sec title="Data Defaults">
                  <Field label="Default Country"><select value={s.defaultCountry||"GH"} onChange={e=>setS(x=>({...x,defaultCountry:e.target.value}))} style={{...sel,fontSize:12}}>{COUNTRIES.map(c=><option key={c.code} value={c.code}>{c.flag} {c.name} ({c.region})</option>)}</select></Field>
                  <Field label="Default Data Level">
                    <div style={{display:"flex",gap:8}}>
                      {["macro","micro"].map(l=>(<button key={l} onClick={()=>setS(x=>({...x,defaultLevel:l}))} style={{...pill(s.defaultLevel===l),flex:1,textAlign:"center",padding:"8px",textTransform:"capitalize",fontSize:11}}>{l==="macro"?"📊 Macro":"🔬 Micro"}</button>))}
                    </div>
                  </Field>
                  <Field label="Default Source">
                    <select value={s.defaultSource||"worldbank"} onChange={e=>setS(x=>({...x,defaultSource:e.target.value}))} style={{...sel,fontSize:12}}>
                      {[...MACRO_SOURCES,...MICRO_SOURCES].map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </Field>
                </Sec>
                <Sec title="Default Time Range">
                  <div style={{display:"flex",gap:10,alignItems:"center"}}>
                    <div style={{flex:1}}><Field label="Start Year"><select value={s.startYear||2000} onChange={e=>setS(x=>({...x,startYear:+e.target.value}))} style={{...sel,fontSize:12}}>{YEARS.map(y=><option key={y} value={y}>{y}</option>)}</select></Field></div>
                    <div style={{color:C.dim,fontSize:12,fontFamily:C.mono,paddingTop:14}}>→</div>
                    <div style={{flex:1}}><Field label="End Year"><select value={s.endYear||2023} onChange={e=>setS(x=>({...x,endYear:+e.target.value}))} style={{...sel,fontSize:12}}>{YEARS.map(y=><option key={y} value={y}>{y}</option>)}</select></Field></div>
                  </div>
                </Sec>
              </>
            )}
            {tab==="keys"&&isAdmin&&(
              <>
                <div style={{background:`${C.gold}0e`,border:`1px solid ${C.gold}33`,borderRadius:9,padding:"11px 14px",marginBottom:18}}>
                  <div style={{color:C.gold,fontSize:11,fontFamily:C.mono}}>🔑 Keys are stored in your browser session only and never sent to any third party.</div>
                </div>
                <Sec title="Anthropic Claude API">
                  <Field label="API Key" hint={<a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{color:C.blue,fontFamily:C.mono,fontSize:10}}>Get key ↗</a>}>
                    <input type="password" value={s.anthropicKey||""} onChange={e=>setS(x=>({...x,anthropicKey:e.target.value}))} placeholder="sk-ant-api03-..." style={{...inp,fontSize:12}}/>
                    <p style={{color:s.anthropicKey?C.teal:C.red,fontSize:10,fontFamily:C.mono,marginTop:6,marginBottom:0}}>{s.anthropicKey?"✓ Key entered — AI Insights enabled":"⚠ Required for AI Insights"}</p>
                  </Field>
                </Sec>
                <Sec title="FRED (Federal Reserve)">
                  <Field label="API Key" hint={<a href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noreferrer" style={{color:C.blue,fontFamily:C.mono,fontSize:10}}>Get free key ↗</a>}>
                    <input type="password" value={s.fredKey||""} onChange={e=>setS(x=>({...x,fredKey:e.target.value}))} placeholder="Your FRED API key..." style={{...inp,fontSize:12}}/>
                    <p style={{color:s.fredKey?C.teal:C.red,fontSize:10,fontFamily:C.mono,marginTop:6,marginBottom:0}}>{s.fredKey?"✓ Key entered — Federal Reserve data enabled":"⚠ Required for FRED data source"}</p>
                  </Field>
                </Sec>
                <Sec title="Data Sources — No Key Required">
                  <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                    {["World Bank","IMF WEO","WHO GHO","ILO STAT","UNESCO UIS","UNCTAD","BIS","UN Environment"].map(s=>(<div key={s} style={{background:`${C.teal}12`,border:`1px solid ${C.teal}33`,borderRadius:6,padding:"5px 10px",color:C.teal,fontSize:10,fontFamily:C.mono}}>✓ {s}</div>))}
                  </div>
                </Sec>
              </>
            )}
            {tab==="theme"&&(
              <>
                <Sec title="Dashboard Theme">
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
                    {Object.entries(THEMES).map(([key,th])=>(
                      <button key={key} onClick={()=>setS(x=>({...x,theme:key}))} style={{padding:"14px 16px",borderRadius:10,border:`2px solid ${s.theme===key?C.gold:C.border}`,background:th.bg,cursor:"pointer",textAlign:"left",transition:"border-color .15s"}}>
                        <div style={{display:"flex",gap:6,marginBottom:8}}>
                          {[th.surface,th.card,th.border].map((col,i)=><div key={i} style={{width:18,height:18,borderRadius:4,background:col,border:`1px solid ${th.borderHi}`}}/>)}
                        </div>
                        <div style={{color:th.text,fontSize:12,fontWeight:600}}>{th.label}</div>
                        <div style={{color:th.mid,fontSize:9,fontFamily:C.mono,marginTop:2}}>{key}</div>
                        {s.theme===key&&<div style={{color:C.gold,fontSize:9,fontFamily:C.mono,marginTop:4}}>✓ Active</div>}
                      </button>
                    ))}
                  </div>
                </Sec>
                <Sec title="Chart Preferences">
                  <Field label="Default Chart Type">
                    <div style={{display:"flex",gap:7}}>
                      {[["area","◭ Area"],["line","╱ Line"],["bar","▮ Bar"]].map(([t,l])=>(<button key={t} onClick={()=>setS(x=>({...x,chartType:t}))} style={{...pill(s.chartType===t),flex:1,textAlign:"center",padding:"8px",fontSize:11}}>{l}</button>))}
                    </div>
                  </Field>
                  <Field label="Default View">
                    <div style={{display:"flex",gap:7}}>
                      {[["chart","◫ Chart"],["table","⊞ Table"]].map(([v,l])=>(<button key={v} onClick={()=>setS(x=>({...x,defaultView:v}))} style={{...pill(s.defaultView===v),flex:1,textAlign:"center",padding:"8px",fontSize:11}}>{l}</button>))}
                    </div>
                  </Field>
                </Sec>
              </>
            )}
            {tab==="plan"&&(
              <>
                <Sec title="Your Current Plan">
                  <div style={{background:C.card,border:`2px solid ${PLANS[s.plan||"pro"].color}55`,borderRadius:12,padding:"16px 18px",marginBottom:16}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                      <div style={{background:PLANS[s.plan||"pro"].color,color:"#000",borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:800,fontFamily:C.mono}}>{PLANS[s.plan||"pro"].badge}</div>
                      <div style={{color:PLANS[s.plan||"pro"].color,fontSize:14,fontWeight:700}}>{PLANS[s.plan||"pro"].name}</div>
                      <div style={{color:C.mid,fontSize:11,fontFamily:C.mono,marginLeft:"auto"}}>{PLANS[s.plan||"pro"].priceLabel}</div>
                    </div>
                  </div>
                </Sec>
                <Sec title="Available Plans">
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {Object.entries(PLANS).map(([key,pl])=>(
                      <div key={key} onClick={()=>setS(x=>({...x,plan:key}))} style={{padding:"14px 16px",borderRadius:10,border:`2px solid ${(s.plan||"pro")===key?pl.color:C.border}`,background:(s.plan||"pro")===key?`${pl.color}10`:C.card,cursor:"pointer",transition:"all .15s"}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{background:pl.color,color:"#000",borderRadius:5,padding:"2px 8px",fontSize:10,fontWeight:800,fontFamily:C.mono}}>{pl.badge}</div>
                            <span style={{color:pl.color,fontSize:13,fontWeight:700}}>{pl.name}</span>
                          </div>
                          <span style={{color:C.mid,fontSize:12,fontFamily:C.mono,fontWeight:600}}>{pl.priceLabel}</span>
                        </div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                          {[
                            pl.sources==="all"?"All 10 sources":`${pl.sources.length} sources`,
                            pl.aiInsights?"AI Insights ✓":"No AI Insights",
                            `Exports: ${pl.exports.join(", ").toUpperCase()}`,
                            pl.compare?"Country compare ✓":"No compare",
                          ].map((f,i)=><span key={i} style={{background:C.surface,borderRadius:5,padding:"3px 8px",color:C.mid,fontSize:9,fontFamily:C.mono}}>{f}</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                </Sec>
                <div style={{background:`${C.teal}10`,border:`1px solid ${C.teal}33`,borderRadius:8,padding:"11px 14px"}}>
                  <div style={{color:C.teal,fontSize:11,fontFamily:C.mono}}>💳 Demo mode — plan switching is free. In production, integrate Stripe or Paystack for billing.</div>
                </div>
              </>
            )}
            {tab==="support"&&(
              <>
                <Sec title="Submit a Support Ticket">
                  <SupportForm user={user}/>
                </Sec>
                <Sec title="Quick Help">
                  {[
                    {q:"Why is my chart empty?",a:"No data exists for the selected country/indicator/year range. Try expanding the year range or switching to World Bank source."},
                    {q:"AI Insights not working?",a:"Add your Anthropic API key in the API Keys tab. The key starts with sk-ant-api03-."},
                    {q:"How do I compare countries?",a:"Enable the Compare Countries checkbox at the bottom of the left sidebar, then select a second country."},
                    {q:"Can I export to Excel?",a:"Yes — click the XLS button above the chart. PDF is also available via the PDF button."},
                    {q:"How do I resize the sidebar?",a:"Drag the thin vertical line between the sidebar and the chart area left or right."},
                    {q:"What's the difference between Macro and Micro data?",a:"Macro covers GDP, trade, fiscal and monetary data. Micro covers health, labour, education and environment indicators."},
                  ].map(({q,a},i)=>(
                    <div key={i} style={{marginBottom:12,padding:"11px 14px",background:C.card,borderRadius:9,border:`1px solid ${C.border}`}}>
                      <div style={{color:C.gold,fontSize:12,fontWeight:600,marginBottom:5}}>Q: {q}</div>
                      <div style={{color:C.mid,fontSize:11,fontFamily:C.mono,lineHeight:1.6}}>{a}</div>
                    </div>
                  ))}
                </Sec>
              </>
            )}
            {tab==="help"&&(
              <>
                <Sec title="Documentation & Links">
                  {[{icon:"🌍",name:"World Bank Open Data",url:"https://data.worldbank.org",desc:"1,400+ global indicators"},
                    {icon:"📊",name:"IMF Data Mapper",url:"https://www.imf.org/external/datamapper",desc:"Macro projections & history"},
                    {icon:"🏦",name:"FRED Economic Data",url:"https://fred.stlouisfed.org",desc:"800K+ US & global series"},
                    {icon:"🔬",name:"WHO Global Health Observatory",url:"https://www.who.int/data/gho",desc:"Global health statistics"},
                    {icon:"💼",name:"ILO STAT",url:"https://ilostat.ilo.org",desc:"Labour market data"},
                    {icon:"🎓",name:"UNESCO UIS",url:"https://uis.unesco.org",desc:"Education statistics"},
                    {icon:"🏛",name:"Bank of Ghana",url:"https://www.bog.gov.gh/economic-data/",desc:"Ghana monetary data"},
                  ].map(r=>(<a key={r.name} href={r.url} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:12,padding:"10px 13px",background:C.card,borderRadius:9,marginBottom:8,border:`1px solid ${C.border}`,textDecoration:"none",transition:"border-color .15s"}}>
                    <span style={{fontSize:20}}>{r.icon}</span>
                    <div><div style={{color:C.text,fontSize:12,fontWeight:600}}>{r.name}</div><div style={{color:C.dim,fontSize:10,fontFamily:C.mono}}>{r.desc}</div></div>
                    <span style={{marginLeft:"auto",color:C.dim,fontSize:11}}>↗</span>
                  </a>))}
                </Sec>
                <Sec title="About EcoScope">
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:9,padding:"13px 15px"}}>
                    <div style={{color:C.text,fontSize:12,marginBottom:4,fontWeight:600}}>EcoScope v2.0</div>
                    <div style={{color:C.mid,fontSize:11,fontFamily:C.mono,lineHeight:1.7}}>Global Economic Intelligence Platform. Data from World Bank, IMF, FRED, WHO, ILO, UNESCO, Bank of Ghana, BIS and UNCTAD. AI insights powered by Claude (Anthropic).</div>
                  </div>
                </Sec>
              </>
            )}
          </div>
        </div>
        {/* Footer */}
        <div style={{borderTop:`1px solid ${C.border}`,padding:"14px 24px",display:"flex",justifyContent:"flex-end",gap:10,flexShrink:0}}>
          <button onClick={onClose} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 18px",color:C.mid,fontSize:12,cursor:"pointer",fontFamily:C.font}}>Cancel</button>
          <button onClick={()=>{onSave(s);onClose();}} style={{...btn(),padding:"9px 24px",fontSize:12}}>Save Changes</button>
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
    <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:8,padding:"10px 14px",fontFamily:C.mono,fontSize:11}}>
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
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,backdropFilter:"blur(8px)"}}>
      <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:20,padding:"36px 40px",width:460,fontFamily:C.font,boxShadow:"0 32px 80px rgba(0,0,0,.7)"}}>
        {sent?(
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:48,marginBottom:16}}>📬</div>
            <h2 style={{color:C.teal,fontSize:18,fontWeight:800,marginBottom:10}}>Request Sent!</h2>
            <p style={{color:C.mid,fontSize:12,fontFamily:C.mono,lineHeight:1.7,marginBottom:24}}>Your upgrade request to <strong style={{color:PLANS[plan].color}}>{PLANS[plan].name}</strong> has been sent to the administrator. You will be notified once it is approved.</p>
            <button onClick={onClose} style={{...btn(),padding:"11px 28px",fontSize:12}}>Got it →</button>
          </div>
        ):(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
              <div>
                <h2 style={{color:C.text,fontSize:16,fontWeight:800,margin:"0 0 3px"}}>⬆ Request Plan Upgrade</h2>
                <div style={{color:C.mid,fontSize:11,fontFamily:C.mono}}>Current plan: <span style={{color:PLANS[currentPlan]?.color||C.mid,fontWeight:700}}>{currentPlan.toUpperCase()}</span></div>
              </div>
              <button onClick={onClose} style={{background:"none",border:"none",color:C.mid,cursor:"pointer",fontSize:18}}>✕</button>
            </div>
            <form onSubmit={submit}>
              <div style={{marginBottom:16}}>
                <div style={{color:C.mid,fontSize:9,fontFamily:C.mono,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:8}}>Requested Plan</div>
                <div style={{display:"flex",gap:8}}>
                  {Object.entries(PLANS).filter(([k])=>k!=="free").map(([key,pl])=>(
                    <button key={key} type="button" onClick={()=>setPlan(key)} style={{...pill(plan===key,pl.color),flex:1,textAlign:"center",padding:"12px 8px",fontSize:12}}>
                      <div style={{fontWeight:700}}>{pl.name}</div>
                      <div style={{fontSize:9,fontFamily:C.mono,marginTop:3}}>{pl.priceLabel}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{marginBottom:16}}>
                <div style={{color:C.mid,fontSize:9,fontFamily:C.mono,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:8}}>Message to Admin (optional)</div>
                <textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Briefly describe your use case or reason for upgrading..." rows={3} style={{...inp,resize:"vertical",fontSize:12,lineHeight:1.6}}/>
              </div>
              {err&&<div style={{background:`${C.red}12`,border:`1px solid ${C.red}44`,borderRadius:7,padding:"9px 12px",marginBottom:14,color:C.red,fontSize:11,fontFamily:C.mono}}>{err}</div>}
              <div style={{display:"flex",gap:10}}>
                <button type="button" onClick={onClose} style={{flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:9,padding:"11px",color:C.mid,fontSize:12,cursor:"pointer"}}>Cancel</button>
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

function Dashboard({user, onLogout}) {
  const [settings,setSettings]=useState(user.settings||{defaultCountry:"GH",fredKey:"",anthropicKey:"",theme:"dark"});
  const [showSettings,setShowSettings]=useState(false);
  const [showUserMenu,setShowUserMenu]=useState(false);
  const [upgradeModal,setUpgradeModal]=useState(null); // {feature, requiredPlan}
  const [showUpgradeReq,setShowUpgradeReq]=useState(false);

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
  const T=useMemo(()=>({...C,...(THEMES[settings.theme||"dark"]||{})}), [settings.theme]);
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
    sourceColor:"#4f8cff", sourceName:"World Bank"
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
  const [startYear,setStartYear]=useState(2000);
  const [endYear,setEndYear]=useState(2023);

  // Chart
  const [chartType,setChartType]=useState("area");
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
  const [analysisTab,setAnalysisTab]=useState("transform"); // transform|impute|regression|composite

  // Multi-variable data store
  const [multiData,setMultiData]=useState({});
  const [cmpMultiData,setCmpMultiData]=useState({});
  const [data,setData]=useState([]);
  const [rawData,setRawData]=useState([]);
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
    ? (_primarySrc0.vars.find(v=>v.code===varBasket[0].varCode)||_primarySrc0.vars[0]||source.vars[0])
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
  const loadData = useCallback(async()=>{
    if(!varBasket.length) return;
    setLoading(true);
    const apiKeys={fred:settings.fredKey||"",anthropic:settings.anthropicKey||""};

    // Fetch each basket item from its own source
    const fetchBasketItem = async (item, countryCode) => {
      const src = ALL_SRCS_MAP[item.sourceId];
      if(!src) return [];
      const vd = src.vars.find(v=>v.code===item.varCode);
      if(!vd) return [];
      const cc2 = src.countryFixed || countryCode;
      return fetchData(src.id, vd, cc2, startYear, endYear, apiKeys);
    };

    // Primary country
    const primaryResults = await Promise.all(varBasket.map(item=>fetchBasketItem(item, effCountry)));
    const newMultiData = {};
    const emptyVars=new Set();
    varBasket.forEach((item,i)=>{
      const key=`${item.sourceId}:${item.varCode}`;
      const result=primaryResults[i]||[];
      newMultiData[key] = result;
      // Only mark N/A if result is genuinely empty array (not null/error)
      if(Array.isArray(primaryResults[i])&&primaryResults[i].length===0) emptyVars.add(key);
    });
    setNoDataVars(emptyVars);
    setMultiData(newMultiData);
    const primaryData = primaryResults[0]||[];
    const rawD=primaryData; setRawData(rawD);
    const processedD=applyTransform(imputeData(rawD, appliedImpute), appliedTransform);
    setData(processedD);

    // Comparison country
    if(cmpOn){
      const cmpResults = await Promise.all(varBasket.map(item=>fetchBasketItem(item, cmpCountry)));
      const newCmpMulti = {};
      varBasket.forEach((item,i)=>{
        newCmpMulti[`${item.sourceId}:${item.varCode}`] = cmpResults[i]||[];
      });
      setCmpMultiData(newCmpMulti);
      setCmpData(applyTransform(imputeData(cmpResults[0]||[], appliedImpute), appliedTransform));
    } else { setCmpData([]); setCmpMultiData({}); }

    setLoading(false);
  },[varBasket,effCountry,startYear,endYear,cmpOn,cmpCountry,settings.fredKey,imputeMethod,transform]);

  useEffect(()=>{loadData();},[loadData]);
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
          <span style={{fontSize:10}}>Make sure both variables have data in the selected time range.</span>
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
            <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:"5px 16px",padding:"8px 14px",background:C.surface,borderRadius:8,border:`1px solid ${C.borderHi}`,marginBottom:10,fontFamily:C.mono}}>
              <span style={{color:C.dim,fontSize:9,textTransform:"uppercase",letterSpacing:"0.1em"}}>OLS Linear Regression</span>
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
              <span style={{padding:"2px 8px",borderRadius:4,fontSize:9,fontWeight:700,
                background:reg.r2>0.7?`${C.teal}18`:reg.r2>0.4?`${C.gold}18`:`${C.red}18`,
                color:reg.r2>0.7?C.teal:reg.r2>0.4?C.gold:C.red,
                border:`1px solid ${reg.r2>0.7?C.teal:reg.r2>0.4?C.gold:C.red}55`}}>
                {reg.r2>0.7?"● Strong fit":reg.r2>0.4?"● Moderate fit":reg.r2>0.15?"● Weak fit":"● No fit"}
              </span>
              {scaleWarn&&(
                <span style={{padding:"2px 8px",borderRadius:4,fontSize:9,color:C.orange,background:`${C.orange}15`,border:`1px solid ${C.orange}44`}}>
                  ⚠ Scale mismatch — use Min-Max transform
                </span>
              )}
            </div>
          )}
          {/* Scatter chart using ComposedChart for reliable regression line */}
          <ResponsiveContainer width="100%" height={310}>
            <ScatterChart margin={{top:10,right:24,left:10,bottom:36}}>
              <CartesianGrid stroke={T.border} strokeDasharray="3 3"/>
              <XAxis
                type="number" dataKey="x" name={xDef.name.substring(0,28)}
                tick={{fill:T.mid,fontSize:9,fontFamily:C.mono}}
                axisLine={{stroke:T.border}} tickLine={false}
                tickFormatter={v=>fmtVal(v,xDef.fmt)}
                label={{value:`${xDef.name.substring(0,38)} (X — Independent)`,position:"insideBottom",offset:-22,fill:T.mid,fontSize:9,fontFamily:C.mono}}
                domain={["auto","auto"]}
              />
              <YAxis
                type="number" dataKey="y" name={yDef.name.substring(0,28)}
                tick={{fill:T.mid,fontSize:9,fontFamily:C.mono}}
                axisLine={false} tickLine={false} width={80}
                tickFormatter={v=>fmtVal(v,yDef.fmt)}
                label={{value:`${yDef.name.substring(0,22)} (Y — Dep.)`,angle:-90,position:"insideLeft",offset:10,fill:T.mid,fontSize:9,fontFamily:C.mono}}
              />
              <ZAxis range={[45,45]}/>
              <Tooltip cursor={{strokeDasharray:"3 3",stroke:C.gold+"55"}}
                content={({payload})=>{
                  if(!payload?.length) return null;
                  const d=payload[0]?.payload;
                  if(!d) return null;
                  return(
                    <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:8,padding:"10px 14px",fontFamily:C.mono,fontSize:10}}>
                      <div style={{color:C.gold,fontWeight:700,marginBottom:6}}>Year {d.year}</div>
                      <div style={{marginBottom:3}}><span style={{color:ACCENT[0]}}>X: </span><span style={{color:C.text,fontWeight:600}}>{fmtVal(d.x,xDef.fmt)}</span></div>
                      <div style={{marginBottom:3}}><span style={{color:ACCENT[1]}}>Y: </span><span style={{color:C.text,fontWeight:600}}>{fmtVal(d.y,yDef.fmt)}</span></div>
                      {reg&&<div style={{color:C.dim,marginTop:4,paddingTop:4,borderTop:`1px solid ${C.border}`}}>Predicted Ŷ: {fmtVal(reg.a+reg.b*d.x,yDef.fmt)}</div>}
                      {reg&&<div style={{color:C.dim}}>Residual: {fmtVal(d.y-(reg.a+reg.b*d.x),yDef.fmt)}</div>}
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{color:T.mid,fontSize:10,fontFamily:C.mono,paddingTop:6}} iconType="circle"/>
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
    if(showComposite&&varBasket.length>=2){
      const seriesList=allVarDefs.map(vd=>{const dk=dataKey?dataKey(vd):`${vd._sourceId||source.id}:${vd.code}`;return{name:vd.name.substring(0,18)+" ["+(vd._sourceName||source.short)+"]",data:applyTransform(imputeData(multiData[dk]||multiData[vd.code]||[],imputeMethod),transform)};});
      const compositeData=buildComposite(seriesList,compWeights.slice(0,varBasket.length),compNorm,compAgg);
      const chartD=compositeData.map(d=>({year:d.year,"Composite Index":d.value}));
      const ax={x:<XAxis dataKey="year" tick={{fill:T.mid,fontSize:10,fontFamily:C.mono}} axisLine={{stroke:T.border}} tickLine={false}/>,y:<YAxis tick={{fill:T.mid,fontSize:10,fontFamily:C.mono}} axisLine={false} tickLine={false} width={60}/>,g:<CartesianGrid stroke={T.border} strokeDasharray="3 3" vertical={false}/>,t:<Tooltip contentStyle={{background:C.surface,border:`1px solid ${C.borderHi}`,fontFamily:C.mono,fontSize:11}}/>,l:<Legend wrapperStyle={{color:T.mid,fontSize:10,fontFamily:C.mono}}/>};
      return(
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartD} margin={{top:10,right:16,left:0,bottom:0}}>{ax.g}{ax.x}{ax.y}{ax.t}{ax.l}<defs><linearGradient id="compGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.purple} stopOpacity={.3}/><stop offset="95%" stopColor={C.purple} stopOpacity={0}/></linearGradient></defs><Area dataKey="Composite Index" stroke={C.purple} fill="url(#compGrad)" strokeWidth={2.5} dot={false}/></AreaChart>
        </ResponsiveContainer>
      );
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
      x:<XAxis dataKey="year" tick={{fill:T.mid,fontSize:10,fontFamily:C.mono}} axisLine={{stroke:T.border}} tickLine={false}/>,
      y:<YAxis tick={{fill:T.mid,fontSize:10,fontFamily:C.mono}} axisLine={false} tickLine={false} tickFormatter={v=>fmtVal(v,currentVar.fmt)} width={74}/>,
      g:<CartesianGrid stroke={T.border} strokeDasharray="3 3" vertical={false}/>,
      t:<Tooltip content={<CustomTip fmt={currentVar.fmt}/>}/>,
      l:<Legend wrapperStyle={{color:T.mid,fontSize:9,fontFamily:C.mono,paddingTop:8}} iconType="circle"
          formatter={(value)=>value.replace("RAW","Original").replace(/:/g,": ").substring(0,40)}/>,
      refAvg:<ReferenceLine y={avgVal} stroke={C.gold} strokeDasharray="6 3" strokeWidth={1} label={{value:`avg`,fill:C.gold,fontSize:9,fontFamily:C.mono}}/>,
      refMax:<ReferenceLine y={maxVal} stroke={C.teal} strokeDasharray="4 4" strokeWidth={1} label={{value:`max`,fill:C.teal,fontSize:9,fontFamily:C.mono}}/>,
      refMin:<ReferenceLine y={minVal} stroke={C.red}  strokeDasharray="4 4" strokeWidth={1} label={{value:`min`,fill:C.red,fontSize:9,fontFamily:C.mono}}/>,
    };
    const chartFmt=currentVar.fmt;

    if(chartType==="bar") return(
      <BarChart data={multiChartData} margin={{top:10,right:16,left:0,bottom:0}}>
        {ax.g}{ax.x}{ax.y}{ax.t}{ax.l}{ax.refAvg}{ax.refMax}{ax.refMin}
        {allKeys.map((k,i)=>{
          const dn3=k.replace("RAW","(Orig)").substring(0,30);
          return<Bar key={k} dataKey={k} radius={[4,4,0,0]} name={dn3} opacity={k.includes("RAW")?0.4:1}>
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
          return<Area key={k} dataKey={k} stroke={isRaw2?ACCENT[i%ACCENT.length]+"66":ACCENT[i%ACCENT.length]} fill={isRaw2?"transparent":`url(#ag${i})`} strokeWidth={isRaw2?1.5:2.5} strokeDasharray={isRaw2?"5 3":undefined} name={dn2} dot={isRaw2?false:(props)=>{const{cx,cy,value}=props;const col=getValueColor(value,allVals);return<circle key={cx+cy} cx={cx} cy={cy} r={3.5} fill={col} stroke={T.surface} strokeWidth={1.5}/>;}} />;
        })}
      </AreaChart>
    );
    return(
      <LineChart data={multiChartData} margin={{top:10,right:16,left:0,bottom:0}}>
        {ax.g}{ax.x}{ax.y}{ax.t}{ax.l}{ax.refAvg}{ax.refMax}{ax.refMin}
        {allKeys.map((k,i)=>{
          const isRaw=k.includes("RAW");
          const displayName=k.replace("RAW","Original").substring(0,35);
          return<Line key={k} dataKey={k} stroke={isRaw?ACCENT[i%ACCENT.length]+"66":ACCENT[i%ACCENT.length]} strokeWidth={isRaw?1.5:2.5} strokeDasharray={isRaw?"5 3":undefined} name={displayName} dot={isRaw?false:(props)=>{const{cx,cy,value}=props;const col=getValueColor(value,allVals);return<circle key={cx+cy} cx={cx} cy={cy} r={4} fill={col} stroke={T.surface} strokeWidth={2}/>;}} />;
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
    <div style={{background:T.bg,minHeight:"100vh",fontFamily:C.font,color:T.text,display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden",maxWidth:"100vw"}}>

      {/* HEADER */}
      <header style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:isMobile?"10px 12px":"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:isMobile?8:12}}>
          {isMobile&&<button onClick={()=>setSidebarOpen(o=>!o)} style={{background:C.gold,border:"none",cursor:"pointer",padding:9,borderRadius:7,display:"flex",flexDirection:"column",gap:4,flexShrink:0}}><span style={{display:"block",width:18,height:2,background:"#000",borderRadius:2}}/><span style={{display:"block",width:18,height:2,background:"#000",borderRadius:2}}/><span style={{display:"block",width:18,height:2,background:"#000",borderRadius:2}}/></button>}
          <div style={{width:32,height:32,background:`linear-gradient(135deg,${C.gold},${C.goldLt})`,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>◈</div>
          <div>
            <div style={{fontSize:15,fontWeight:800,letterSpacing:"-0.3px",lineHeight:1}}>EcoScope</div>
            <div style={{fontSize:8,color:C.dim,fontFamily:C.mono,letterSpacing:"0.14em"}}>GLOBAL ECONOMIC INTELLIGENCE</div>
          </div>
          <div style={{width:1,height:28,background:C.border,margin:"0 6px"}}/>
          <div style={{fontSize:10,color:C.dim,fontFamily:C.mono}}>{source.short} · {cc.flag} {cc.name} · {currentVar.name.substring(0,30)} · {startYear}–{endYear}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,position:"relative"}}>
          {/* User avatar button */}
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowUserMenu(v=>!v)} style={{display:"flex",alignItems:"center",gap:8,background:C.card,border:`1px solid ${showUserMenu?C.gold:C.border}`,borderRadius:20,padding:"5px 14px 5px 6px",cursor:"pointer",transition:"border-color .15s"}}>
              <div style={{width:26,height:26,borderRadius:"50%",background:user.avatarColor||C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#000",flexShrink:0}}>{user.initials||"U"}</div>
              <span style={{color:T.text,fontSize:12,fontFamily:C.mono,fontWeight:600}}>{user.username}</span>
              <span style={{background:plan.color,color:"#000",borderRadius:4,padding:"1px 6px",fontSize:8,fontWeight:800,fontFamily:C.mono,marginLeft:4}}>{plan.badge}</span>
              <span style={{color:C.mid,fontSize:8,marginLeft:2}}>{showUserMenu?"▲":"▼"}</span>
            </button>
            {showUserMenu&&(
              <div style={{position:"absolute",top:"calc(100% + 8px)",right:0,background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:13,padding:"6px",minWidth:220,boxShadow:`0 16px 48px rgba(0,0,0,.7)`,zIndex:200}}>
                {/* Signed in as */}
                <div style={{padding:"10px 14px 10px",borderBottom:`1px solid ${C.border}`,marginBottom:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                    <div style={{width:34,height:34,borderRadius:"50%",background:user.avatarColor||C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#000",flexShrink:0}}>{user.initials||"U"}</div>
                    <div><div style={{color:C.text,fontSize:12,fontWeight:700}}>{user.username}</div><div style={{color:C.mid,fontSize:10,fontFamily:C.mono}}>{user.email||"demo@ecoscope.app"}</div></div>
                  </div>
                </div>
                {/* Menu items */}
                {[
                  {icon:"⚙",label:"Settings",action:()=>{setShowSettings(true);setShowUserMenu(false);}},
                  {icon:"📊",label:"Data Sources",action:()=>{setShowSettings(true);setShowUserMenu(false);}},
                  
                  {icon:"⬆",label:"Request Plan Upgrade",action:()=>{setShowUpgradeReq(true);setShowUserMenu(false);}},
                  {icon:"❓",label:"Help & Support",action:()=>{setShowSettings(true);setShowUserMenu(false);}},
                  null,
                  {icon:"←",label:"Sign Out",action:onLogout,danger:true},
                ].map((item,i)=> item===null
                  ? <div key={i} style={{height:1,background:C.border,margin:"4px 6px"}}/>
                  : <button key={i} onClick={item.action} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 14px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",textAlign:"left",transition:"background .1s",color:item.danger?C.red:C.text}}>
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
        <aside style={{
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
          {/* DATA LEVEL TOGGLE */}
          <div style={{padding:"12px 10px 6px"}}>
            <div style={{fontSize:9,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>Data Level</div>
            <div style={{display:"flex",gap:5}}>
              {["macro","micro"].map(lvl=>(
                <button key={lvl} onClick={()=>setDataLevel(lvl)} style={{...pill(dataLevel===lvl),flex:1,textAlign:"center",textTransform:"capitalize",fontSize:11,padding:"6px 0"}}>
                  {lvl==="macro"?"📊 Macro":"🔬 Micro"}
                </button>
              ))}
            </div>
          </div>

          {/* SOURCE SELECTOR */}
          <div style={{padding:"6px 10px 10px"}}>
            <div style={{fontSize:9,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:7}}>Data Source</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
              {sources.map(s=>{
                const locked=PRO_SOURCES.includes(s.id)&&!plan.aiInsights;
                return(
                  <button key={s.id} onClick={()=>{
                    if(locked){setUpgradeModal({feature:`${s.name} data source`,requiredPlan:"pro"});return;}
                    setSourceId(s.id);
                  }} style={{...pill(sourceId===s.id,s.color),fontSize:10,padding:"4px 9px",opacity:locked?.6:1,position:"relative"}}>
                    {s.short}{locked&&<span style={{fontSize:7,marginLeft:3}}>🔒</span>}
                  </button>
                );
              })}
            </div>
            {source.note && <p style={{color:C.dim,fontSize:9,fontFamily:C.mono,margin:"7px 0 0",lineHeight:1.5}}>{source.note}</p>}
            {source.keyRequired&&!settings.fredKey&&(
              <div style={{background:`${C.red}15`,border:`1px solid ${C.red}44`,borderRadius:6,padding:"6px 9px",marginTop:7}}>
                <p style={{color:C.red,fontSize:9,fontFamily:C.mono,margin:0}}>⚠ API key required. Add in ⚙ Settings.</p>
              </div>
            )}
          </div>

          {/* VARIABLE BASKET */}
          {varBasket.length>0&&(
            <div style={{borderTop:`1px solid ${C.border}`,padding:"8px 10px",flexShrink:0,background:`${C.purple}06`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{fontSize:9,color:C.purple,fontFamily:C.mono,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700}}>⊕ Variable Basket ({varBasket.length}/4)</div>
                {varBasket.length>1&&<button onClick={()=>setVarBasket(vb=>vb.slice(0,1))} style={{background:"none",border:"none",color:C.red,fontSize:9,cursor:"pointer",fontFamily:C.mono}}>Clear</button>}
              </div>
              {varBasket.map((item,i)=>(
                <div key={`${item.sourceId}:${item.varCode}`} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 8px",marginBottom:3,background:`${item.sourceColor}14`,border:`1px solid ${item.sourceColor}33`,borderRadius:7}}>
                  <div style={{width:15,height:15,borderRadius:3,background:item.sourceColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#000",fontWeight:800,flexShrink:0}}>{i+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:T.text,fontSize:9,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.label.substring(0,26)}</div>
                    <div style={{color:item.sourceColor,fontSize:7,fontFamily:C.mono,opacity:.8}}>{item.sourceName}</div>
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
                <div style={{fontSize:9,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase"}}>Variables <span style={{color:C.dim}}>({source.vars.length} total)</span></div>

              </div>
              <input value={varSearch} onChange={e=>setVarSearch(e.target.value)} placeholder="🔍 Search variables..." style={{...inp,fontSize:11,padding:"7px 10px"}}/>
            </div>
            <div style={{overflowY:"auto",flex:1,padding:"0 6px 8px"}}>
              {Object.entries(groupedVars).map(([cat,vars])=>(
                <div key={cat}>
                  <div style={{fontSize:8,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",padding:"6px 6px 3px"}}>{cat}</div>
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
                          if(varBasket.length>=4){setUpgradeModal({feature:"Maximum 4 variables — upgrade for more analysis",requiredPlan:"pro"});return;}
                          if(varBasket.length>=1&&!plan.compare){setUpgradeModal({feature:"Multi-variable analysis requires Pro",requiredPlan:"pro"});return;}
                          setVarBasket(vb=>[...vb,{sourceId:source.id,varCode:v.code,label:v.name,fmt:v.fmt,sourceColor:source.color,sourceName:source.short}]);
                        }
                      }} style={{width:"100%",display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:6,border:"none",borderLeft:`2px solid ${active?source.color:"transparent"}`,background:active?`${source.color}12`:"transparent",cursor:"pointer",textAlign:"left",marginBottom:1,transition:"all .1s"}}>
                        <div style={{flex:1}}>
                          <div style={{color:active?source.color:C.text,fontSize:11,lineHeight:1.3}}>{v.name}</div>
                          <div style={{display:"flex",gap:6,alignItems:"center"}}><div style={{color:C.dim,fontSize:9,fontFamily:C.mono}}>{v.fmt}</div><div style={{color:source.color,fontSize:8,fontFamily:C.mono,opacity:.7}}>{source.short}</div></div>
                        </div>
                        {noDataVars.has(`${source.id}:${v.code}`)&&!loading&&<span style={{fontSize:7,color:C.red,fontFamily:C.mono,flexShrink:0,background:`${C.red}15`,borderRadius:3,padding:"1px 4px"}}>N/A</span>}
                        {inBasket&&<div style={{width:18,height:18,borderRadius:4,background:source.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#000",fontWeight:800,flexShrink:0}}>{varBasket.findIndex(b=>b.sourceId===source.id&&b.varCode===v.code)+1}</div>}
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
                <div style={{fontSize:9,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:7}}>Country</div>
                <input value={countrySearch} onChange={e=>setCountrySearch(e.target.value)} placeholder="🔍 Search countries..." style={{...inp,fontSize:11,padding:"7px 10px"}}/>
                <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:6}}>
                  {["All","Africa","Americas","Europe","Asia","Middle East","Oceania"].map(r=>(
                    <button key={r} onClick={()=>setRegionFilter(r)} style={{...pill(regionFilter===r),fontSize:8,padding:"2px 7px"}}>{r}</button>
                  ))}
                </div>
              </div>
              <div style={{overflowY:"auto",flex:1,padding:"0 6px 8px"}}>
                <div style={{fontSize:9,color:C.dim,fontFamily:C.mono,padding:"3px 6px 4px"}}>{filteredCountries.length} countr{filteredCountries.length===1?"y":"ies"}</div>
                {filteredCountries.map(c=>{
                  const active=country===c.code;
                  return(
                    <button key={c.code} onClick={()=>setCountry(c.code)} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:7,border:"none",borderLeft:`2px solid ${active?C.gold:"transparent"}`,background:active?`${C.gold}12`:"transparent",cursor:"pointer",textAlign:"left",marginBottom:1,transition:"all .1s"}}>
                      <span style={{fontSize:15,lineHeight:1}}>{c.flag}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:active?C.gold:C.text,fontSize:11,fontWeight:active?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</div>
                        <div style={{color:C.dim,fontSize:8,fontFamily:C.mono}}>{c.code}</div>
                      </div>
                      {c.star&&<span style={{fontSize:7,background:C.gold,color:"#000",borderRadius:3,padding:"1px 4px",fontWeight:800,fontFamily:C.mono}}>★</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {source.countryFixed && (
            <div style={{padding:"10px 12px",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
              <div style={{fontSize:9,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6}}>Country (Fixed)</div>
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:`${source.color}12`,border:`1px solid ${source.color}44`,borderRadius:7}}>
                <span style={{fontSize:17}}>{cc.flag}</span>
                <span style={{color:source.color,fontSize:12,fontWeight:600}}>{cc.name}</span>
              </div>
            </div>
          )}

          {/* ANALYSIS TOOLS PANEL */}
          <div style={{borderTop:`1px solid ${C.border}`,flexShrink:0}}>
            <div style={{padding:"8px 12px 6px",display:"flex",gap:4,overflowX:"auto"}}>
              {["transform","impute","composite","frequency"].map(t=>(
                <button key={t} onClick={()=>setAnalysisTab(t)} style={{...pill(analysisTab===t,C.purple),fontSize:8,padding:"3px 7px",whiteSpace:"nowrap",textTransform:"capitalize",flexShrink:0}}>
                  {t==="transform"?"⟳":t==="impute"?"◎":t==="regression"?"↗":"⊕"} {t}
                </button>
              ))}
            </div>

            {/* Transform */}
            {analysisTab==="transform"&&(
              <div style={{padding:"6px 12px 10px"}}>
                <div style={{color:C.dim,fontSize:8,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6}}>Data Transform</div>
                <select value={transform} onChange={e=>setTransform(e.target.value)} style={{...sel,fontSize:10,padding:"5px 8px",marginBottom:6}}>
                  {TRANSFORMS.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                {transform!=="none"&&<div style={{color:C.purple,fontSize:9,fontFamily:C.mono,marginBottom:6}}>Formula: {TRANSFORMS.find(t=>t.id===transform)?.formula}</div>}
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>{setAppliedTransform(transform);loadData();}} style={{flex:2,...btn(),padding:"7px",fontSize:10}}>▶ Apply</button>
                  {appliedTransform!=="none"&&<button onClick={()=>{setAppliedTransform("none");setTransform("none");loadData();}} style={{flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:7,padding:"7px",color:C.dim,fontSize:10,cursor:"pointer"}}>✕ Clear</button>}
                </div>
                {appliedTransform!=="none"&&(
                  <div style={{marginTop:6}}>
                    <div style={{color:C.teal,fontSize:8,fontFamily:C.mono,marginBottom:4}}>Applied: {TRANSFORMS.find(t=>t.id===appliedTransform)?.label}</div>
                    <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
                      <input type="checkbox" checked={showOriginal} onChange={e=>setShowOriginal(e.target.checked)} style={{accentColor:C.gold}}/>
                      <span style={{color:C.text,fontSize:10}}>Show original alongside</span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Imputation */}
            {analysisTab==="impute"&&(
              <div style={{padding:"6px 12px 10px"}}>
                <div style={{color:C.dim,fontSize:8,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6}}>Missing Data Imputation</div>
                <select value={imputeMethod} onChange={e=>setImputeMethod(e.target.value)} style={{...sel,fontSize:10,padding:"5px 8px",marginBottom:6}}>
                  {IMPUTE_METHODS.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                {imputeMethod!=="none"&&<div style={{color:C.teal,fontSize:9,fontFamily:C.mono,marginBottom:6}}>Formula: {IMPUTE_METHODS.find(m=>m.id===imputeMethod)?.formula}</div>}
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>{setAppliedImpute(imputeMethod);loadData();}} style={{flex:2,...btn(),padding:"7px",fontSize:10}}>▶ Apply</button>
                  {appliedImpute!=="none"&&<button onClick={()=>{setAppliedImpute("none");setImputeMethod("none");loadData();}} style={{flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:7,padding:"7px",color:C.dim,fontSize:10,cursor:"pointer"}}>✕ Clear</button>}
                </div>
                {appliedImpute!=="none"&&(
                  <div style={{marginTop:6}}>
                    <div style={{color:C.teal,fontSize:8,fontFamily:C.mono,marginBottom:4}}>Applied: {IMPUTE_METHODS.find(m=>m.id===appliedImpute)?.label}</div>
                    <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
                      <input type="checkbox" checked={showOriginal} onChange={e=>setShowOriginal(e.target.checked)} style={{accentColor:C.gold}}/>
                      <span style={{color:C.text,fontSize:10}}>Show original alongside</span>
                    </label>
                  </div>
                )}
              </div>
            )}


            {/* Frequency */}
            {analysisTab==="frequency"&&(
              <div style={{padding:"6px 12px 10px"}}>
                <div style={{color:C.dim,fontSize:8,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6}}>Time Frequency</div>
                {FREQ_OPTIONS.map(f=>(
                  <label key={f.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,cursor:"pointer"}}>
                    <input type="radio" name="freq" value={f.id} checked={freq===f.id} onChange={()=>setFreq(f.id)} style={{accentColor:C.gold}}/>
                    <div>
                      <div style={{color:freq===f.id?C.gold:C.text,fontSize:11,fontWeight:freq===f.id?700:400}}>{f.label}</div>
                      <div style={{color:C.dim,fontSize:8,fontFamily:C.mono}}>{f.note}</div>
                    </div>
                  </label>
                ))}
                {freq!=="annual"&&(
                  <div style={{background:`${C.orange}12`,border:`1px solid ${C.orange}33`,borderRadius:7,padding:"7px 10px",marginTop:4}}>
                    <div style={{color:C.orange,fontSize:9,fontFamily:C.mono}}>⚠ Non-annual frequencies use linear interpolation between annual data points for most sources. FRED supports native monthly data.</div>
                  </div>
                )}
              </div>
            )}

            {/* Composite */}
            {analysisTab==="composite"&&(
              <div style={{padding:"6px 12px 10px"}}>
                <div style={{color:C.dim,fontSize:8,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6}}>Composite Index</div>
                {varBasket.length<2?(
                  <div style={{color:C.red,fontSize:9,fontFamily:C.mono}}>Select ≥2 variables</div>
                ):(
                  <>
                    <div style={{marginBottom:6}}>
                      <div style={{color:C.mid,fontSize:8,fontFamily:C.mono,marginBottom:4}}>Normalisation</div>
                      <select value={compNorm} onChange={e=>setCompNorm(e.target.value)} style={{...sel,fontSize:10,padding:"5px 8px"}}>
                        {NORM_METHODS.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                    </div>
                    <div style={{marginBottom:6}}>
                      <div style={{color:C.mid,fontSize:8,fontFamily:C.mono,marginBottom:4}}>Aggregation</div>
                      <select value={compAgg} onChange={e=>setCompAgg(e.target.value)} style={{...sel,fontSize:10,padding:"5px 8px"}}>
                        {AGG_METHODS.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                    </div>
                    {varBasket.map((item,i)=>{const vd={name:item.label,code:item.varCode};return(
                      <div key={`w${i}`} style={{marginBottom:5}}>
                        <div style={{color:ACCENT[i%ACCENT.length],fontSize:8,fontFamily:C.mono,marginBottom:2}}>{item.label.substring(0,20)} [{item.sourceName}] — w={compWeights[i]||1}</div>
                        <input type="range" min={0.1} max={5} step={0.1} value={compWeights[i]||1} onChange={e=>setCompWeights(w=>{const nw=[...w];nw[i]=+e.target.value;return nw;})} style={{width:"100%",accentColor:ACCENT[i%ACCENT.length]}}/>
                      </div>
                    );})}
                    <div style={{color:C.dim,fontSize:8,fontFamily:C.mono,marginBottom:6}}>Formula: {AGG_METHODS.find(m=>m.id===compAgg)?.formula}</div>
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
            <div style={{fontSize:9,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:7}}>Year Range</div>
            <div style={{display:"flex",gap:7,alignItems:"center"}}>
              <select value={startYear} onChange={e=>setStartYear(+e.target.value)} style={{...sel,padding:"6px 7px",fontSize:11,flex:1}}>
                {YEARS.map(y=><option key={y} value={y}>{y}</option>)}
              </select>
              <span style={{color:C.dim,fontSize:10,fontFamily:C.mono}}>→</span>
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
                <span style={{color:cmpOn?C.text:C.mid,fontSize:12,fontWeight:cmpOn?600:400}}>Compare Countries {!plan.compare&&<span style={{background:`${C.gold}20`,color:C.gold,fontSize:8,fontFamily:C.mono,borderRadius:3,padding:"1px 5px",fontWeight:700}}>PRO</span>}</span>
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
        <div onMouseDown={startResize} style={{width:isMobile?0:5,cursor:"col-resize",background:T.border,flexShrink:0,transition:"background .15s",display:isMobile?"none":"flex",alignItems:"center",justifyContent:"center"}} onMouseEnter={e=>e.currentTarget.style.background=C.gold} onMouseLeave={e=>e.currentTarget.style.background=T.border}><div style={{width:2,height:40,borderRadius:2,background:"transparent"}}/></div>
        <main style={{flex:1,overflowY:"auto",padding:18,display:"flex",flexDirection:"column",gap:16,background:T.bg}}>

          {/* Source info banner */}
          <div style={{display:"flex",alignItems:isMobile?"flex-start":"center",gap:isMobile?6:12,padding:isMobile?"8px 12px":"10px 16px",background:`${source.color}0f`,border:`1px solid ${source.color}33`,borderRadius:9,flexDirection:isMobile?"column":"row"}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:source.color,flexShrink:0}}/>
            <div style={{flex:1}}>
              <span style={{color:source.color,fontWeight:700,fontSize:12}}>{source.name}</span>
              <span style={{color:C.mid,fontSize:11,fontFamily:C.mono,marginLeft:10}}>{source.desc}</span>
            </div>
            <a href={source.url} target="_blank" rel="noreferrer" style={{color:source.color,fontSize:10,fontFamily:C.mono,textDecoration:"none"}}>Visit ↗</a>
          </div>

          {/* KPI Cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:11}}>
            {kpis.map((k,i)=>(
              <div key={i} style={{...card,padding:"13px 16px"}}>
                <div style={{fontSize:9,color:C.dim,fontFamily:C.mono,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:7}}>{k.lbl}</div>
                <div style={{fontSize:16,fontWeight:700,color:k.pos?C.teal:k.neg?C.red:C.text,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={k.val}>{k.val}</div>
                <div style={{fontSize:9,color:C.mid,fontFamily:C.mono}}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Plan Badge */}
          {plan.id==="free"&&(
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 16px",background:`${C.gold}10`,border:`1px solid ${C.gold}44`,borderRadius:9}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:14}}>⬡</span>
                <span style={{color:C.gold,fontSize:11,fontFamily:C.mono}}>You are on the <strong>Free plan</strong> — limited to {PLANS.free.sources.length} sources, no AI Insights, CSV only.</span>
              </div>
              <button onClick={()=>{setSettings(s=>({...s,plan:"pro"}));}} style={{background:C.gold,color:"#000",border:"none",borderRadius:7,padding:"5px 14px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:C.mono}}>Upgrade to Pro →</button>
            </div>
          )}

          {/* Chart */}
          <div style={{...card,padding:"20px 22px",background:T.card,border:`1px solid ${T.border}`}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
              <div>
                <h2 style={{margin:0,fontSize:14,fontWeight:700,color:C.text}}>{currentVar.name}</h2>
                <p style={{margin:"4px 0 0",fontSize:10,color:C.mid,fontFamily:C.mono}}>
                  {source.short} · {cc.flag} {cc.name}{cmpOn&&!source.countryFixed?` vs ${cmpC.flag} ${cmpC.name}`:""} · {startYear}–{endYear}
                </p>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                {["area","line","bar"].map(t=>(
                  <button key={t} onClick={()=>setChartType(t)} style={{...pill(chartType===t),textTransform:"capitalize",fontSize:10}}>
                    {t==="area"?"◭":t==="line"?"╱":t==="bar"?"▮":"⊙"} {t}
                  </button>
                ))}
                {varCodes.length>1&&(
                  <div style={{background:`${C.purple}20`,border:`1px solid ${C.purple}44`,borderRadius:20,padding:"3px 9px",fontSize:9,color:C.purple,fontFamily:C.mono,fontWeight:700}}>
                    {varCodes.length} vars
                  </div>
                )}
                <div style={{width:1,height:16,background:C.border}}/>
                <button onClick={()=>setViewMode(v=>v==="chart"?"table":"chart")} style={pill(false)}>
                  {viewMode==="chart"?"⊞ Table":"◫ Chart"}
                </button>
                <div style={{display:"flex",gap:5,alignItems:"center"}}>
                  <ExportMenu data={data} currentVar={currentVar} cc={cc} source={source} startYear={startYear} endYear={endYear} plan={plan} onUpgradeNeeded={(f)=>setUpgradeModal({feature:f,requiredPlan:"pro"})}/>
                  <div style={{position:"relative"}}>
                    <button onClick={()=>document.getElementById("chartExportMenu").style.display==="none"?document.getElementById("chartExportMenu").style.display="block":document.getElementById("chartExportMenu").style.display="none"} style={{...pill(false),color:C.blue,borderColor:`${C.blue}44`,fontSize:10}}>📷 Snapshot</button>
                    <div id="chartExportMenu" style={{display:"none",position:"absolute",right:0,top:"calc(100% + 6px)",background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:10,padding:6,minWidth:180,zIndex:99,boxShadow:"0 8px 24px rgba(0,0,0,.6)"}}>
                      <div style={{color:C.dim,fontSize:9,fontFamily:C.mono,padding:"4px 10px 6px",textTransform:"uppercase",letterSpacing:"0.1em"}}>Export Chart</div>
                      {[["🖼 PNG (High-Res)","png"],["◈ SVG (Vector)","svg"]].map(([label,fmt])=>(
                        <button key={fmt} onClick={()=>{
                          const title=`${currentVar.name} — ${cc.name} (${source.short}) ${startYear}–${endYear}${transform!=="none"?` · ${TRANSFORMS.find(t=>t.id===transform)?.label}`:""}`;
                          exportChart(fmt,title);
                          document.getElementById("chartExportMenu").style.display="none";
                        }} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"9px 12px",borderRadius:7,border:"none",background:"transparent",cursor:"pointer",color:C.text,fontSize:11,fontFamily:C.mono}}>
                          {label}
                        </button>
                      ))}
                      <div style={{borderTop:`1px solid ${C.border}`,margin:"4px 0",padding:"4px 10px 0"}}>
                        <div style={{color:C.dim,fontSize:9,fontFamily:C.mono}}>Includes title, legend & attribution</div>
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
              <div style={{height:320,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:C.dim,fontFamily:C.mono,fontSize:12,gap:8}}>
                <span style={{fontSize:30}}>◌</span>
                <span>No data available for this selection</span>
                {source.keyRequired&&!settings.fredKey&&<span style={{color:C.red,fontSize:11}}>⚠ FRED API key required — add in Settings</span>}
              </div>
            ) : viewMode==="chart" ? (
              <div id="ecoscope-chart-area">
                <ResponsiveContainer width="100%" height={isMobile?220:chartType==="scatter"?320:300}>{renderChart()}</ResponsiveContainer>
              </div>
            ) : (
              <div style={{maxHeight:360,overflowY:"auto",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
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
                          <th style={{color:C.dim,padding:"8px 12px",borderBottom:`1px solid ${C.border}`,fontWeight:500,textAlign:"left",fontSize:9,textTransform:"uppercase",letterSpacing:"0.1em"}}>Year</th>
                          {allVarDefs2.map((vd,i)=>(
                            <React.Fragment key={vd.code}>
                              <th style={{color:ACCENT[i%ACCENT.length],padding:"8px 10px",borderBottom:`1px solid ${C.border}`,fontWeight:600,textAlign:"right",fontSize:9,maxWidth:130,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}} title={vd.name}>
                                ●{i+1} {vd.name.substring(0,14)} [{vd._sourceName||source.short}]
                              </th>
                              {showOriginal&&(appliedTransform!=="none"||appliedImpute!=="none")&&(
                                <th style={{color:C.dim,padding:"8px 10px",borderBottom:`1px solid ${C.border}`,fontWeight:400,textAlign:"right",fontSize:8}}>●{i+1} RAW</th>
                              )}
                            </React.Fragment>
                          ))}
                          {cmpOn&&!source.countryFixed&&<th style={{color:C.teal,padding:"8px 10px",borderBottom:`1px solid ${C.border}`,fontWeight:600,textAlign:"right",fontSize:9}}>vs {cmpC.name}</th>}
                          <th style={{color:C.dim,padding:"8px 10px",borderBottom:`1px solid ${C.border}`,fontWeight:500,textAlign:"right",fontSize:9,textTransform:"uppercase"}}>Δ YoY (Primary)</th>
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
                                {showOriginal&&(appliedTransform!=="none"||appliedImpute!=="none")&&<td style={{color:C.dim,textAlign:"right",padding:"6px 10px",fontSize:9}}>{rawPt2?.value!=null?fmtVal(rawPt2.value,vd.fmt):<span style={{color:C.dim}}>—</span>}</td>}
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

          {/* MISSING DATA TOAST */}
          {missingAlert&&(
            <div style={{background:`${C.orange}18`,border:`1px solid ${C.orange}55`,borderRadius:10,padding:"10px 16px",display:"flex",alignItems:"center",gap:12,marginBottom:0}}>
              <span style={{fontSize:18}}>⚠</span>
              <div style={{flex:1}}>
                <div style={{color:C.orange,fontSize:12,fontWeight:700}}>Missing Data Detected</div>
                <div style={{color:C.mid,fontSize:10,fontFamily:C.mono}}>{missingAlert.varName}: {missingAlert.count} of {missingAlert.total} values are missing</div>
              </div>
              <button onClick={()=>{setAnalysisTab("impute");}} style={{background:C.orange,color:"#000",border:"none",borderRadius:7,padding:"6px 12px",fontSize:10,fontWeight:700,cursor:"pointer",flexShrink:0}}>Apply Imputation →</button>
              <button onClick={()=>setMissingAlert(null)} style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:14}}>✕</button>
            </div>
          )}

          {/* AI INSIGHT */}
          <div style={{...card,background:T.card,border:`1px solid ${T.border}`}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <div style={{width:22,height:22,background:`linear-gradient(135deg,${C.gold},${C.goldLt})`,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11}}>◈</div>
                  <h3 style={{margin:0,fontSize:14,fontWeight:700,color:C.text}}>AI Economic Insight</h3>
                </div>
                <p style={{margin:0,fontSize:10,color:C.mid,fontFamily:C.mono}}>Powered by Claude · {source.short} · {cc.flag} {cc.name} · {currentVar.name.substring(0,40)}</p>
              </div>
              <button onClick={()=>{if(!plan.aiInsights){setUpgradeModal({feature:"AI Economic Insights",requiredPlan:"pro"});return;}getInsight();}} disabled={aiLoading||!data.length} style={{...btn(plan.aiInsights?C.gold:C.dim),opacity:aiLoading||!data.length?.5:1,cursor:aiLoading||!data.length?"not-allowed":"pointer",fontSize:11,padding:"9px 18px",position:"relative"}}>
                {aiLoading?"◌ Analysing…":"✦ Generate Insight"}
                {!plan.aiInsights&&<span style={{position:"absolute",top:-6,right:-6,background:C.gold,color:"#000",fontSize:7,fontWeight:800,borderRadius:4,padding:"2px 4px",fontFamily:C.mono}}>PRO</span>}
              </button>
            </div>
            {aiError&&(
              <div style={{background:`${C.red}12`,border:`1px solid ${C.red}44`,borderRadius:8,padding:"12px 14px",marginTop:14}}>
                <p style={{color:C.red,fontSize:11,fontFamily:C.mono,margin:0}}>{aiError}</p>
              </div>
            )}
            {insight&&(
              <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:9,padding:"14px 16px",marginTop:14}}>
                <div style={{color:C.mid,fontSize:9,fontFamily:C.mono,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>Analysis — {source.name} · {cc.name} · {currentVar.name}</div>
                <p style={{color:C.text,fontSize:12.5,lineHeight:1.85,margin:0,fontFamily:C.mono,whiteSpace:"pre-wrap"}}>{insight}</p>
              </div>
            )}
            {!insight&&!aiLoading&&!aiError&&(
              <p style={{color:C.dim,fontSize:11,fontFamily:C.mono,marginTop:12,marginBottom:0}}>
                Click "Generate Insight" for an AI-powered analysis of the selected data. Contact your administrator to enable AI insights.
              </p>
            )}
          </div>

          {/* Footer */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
            <span style={{color:C.dim,fontSize:9,fontFamily:C.mono}}>Sources: World Bank · IMF · FRED · WHO GHO · Bank of Ghana · BIS · UNCTAD · ILO · UNESCO · UN Environment</span>
            <span style={{color:C.dim,fontSize:9,fontFamily:C.mono}}>EcoScope v2.0 · {new Date().getFullYear()}</span>
          </div>
        </main>
      </div>

      {showSettings&&<Settings user={liveUser} settings={settings} onSave={ns=>{setSettings(ns);US.update(liveUser.username,{settings:ns}).catch(console.error);}} onClose={()=>setShowSettings(false)}/>}
      {upgradeModal&&<UpgradeModal feature={upgradeModal.feature} requiredPlan={upgradeModal.requiredPlan||"pro"} onClose={()=>setUpgradeModal(null)} onUpgrade={()=>{setUpgradeModal(null);setShowUpgradeReq(true);}}/>}
      {showUpgradeReq&&<UpgradeRequestModal user={liveUser} currentPlan={liveUser.plan||"free"} onClose={()=>setShowUpgradeReq(false)}/>}

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-track{background:${C.bg};}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}
        ::-webkit-scrollbar-thumb:hover{background:${C.gold}55;}
        select option{background:${C.card};color:${C.text};}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        a{text-decoration:none;}
      `}</style>
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
      <div style={{background:"#05070f",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"monospace",color:"#dde3f5",gap:16,padding:20}}>
        <div style={{fontSize:32}}>⚠</div>
        <div style={{color:"#f0a500",fontSize:16,fontWeight:700}}>EcoScope encountered an error</div>
        <div style={{color:"#7a88b0",fontSize:12,maxWidth:500,textAlign:"center"}}>{this.state.err.message}</div>
        <button onClick={()=>{localStorage.clear();window.location.reload();}} style={{background:"#f0a500",color:"#000",border:"none",borderRadius:8,padding:"10px 20px",fontSize:12,fontWeight:700,cursor:"pointer",marginTop:8}}>
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
        const avatarColor=["#f0a500","#00c9a7","#4f8cff","#b05cff","#ff4c6a"][Math.abs((sess.username.charCodeAt(0)||0))%5];
        setUser({...sess,initials,avatarColor,
          settings:{defaultCountry:"GH",theme:"dark",fredKey:"",anthropicKey:""},
          plan:sess.plan||"free",role:sess.role||"user"});
      }
    }catch(_){}
    setBooting(false);
  },[]);

  if(booting) return(
    <div style={{background:"#05070f",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#f0a500",fontFamily:"monospace",fontSize:14}}>◈ Loading EcoScope…</div>
    </div>
  );
  if(!user) return <Login onLogin={u=>{localStorage.setItem(US.SESS,JSON.stringify(u));setUser(u);}}/>;
  if(user.role==="admin") return <AdminPanel user={user} onLogout={()=>{US.logout(user.username);setUser(null);}}/>;
  return <ErrBoundary><Dashboard user={user} onLogout={()=>{US.logout(user.username);setUser(null);}}/></ErrBoundary>;
}

// ══════════════════════════════════════════════
// MOCK DATA FOR ADMIN
// ══════════════════════════════════════════════
const SOURCE_STATUS = [
  {name:"World Bank",short:"WB",url:"https://api.worldbank.org/v2/country/GH/indicator/NY.GDP.MKTP.CD?format=json",status:"live",latency:"210ms",uptime:"99.9%",color:"#4f8cff"},
  {name:"IMF DataMapper",short:"IMF",url:"https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/GHA",status:"live",latency:"380ms",uptime:"99.4%",color:"#00c9a7"},
  {name:"FRED (St. Louis Fed)",short:"FRED",url:null,status:"key-required",latency:"—",uptime:"99.8%",color:"#ff4c6a"},
  {name:"WHO GHO",short:"WHO",url:"https://ghoapi.azureedge.net/api/WHOSIS_000001?$top=1",status:"live",latency:"290ms",uptime:"98.7%",color:"#b05cff"},
  {name:"Bank of Ghana",short:"BoG",url:null,status:"proxied",latency:"—",uptime:"99.9%",color:"#f0a500"},
  {name:"BIS",short:"BIS",url:null,status:"proxied",latency:"—",uptime:"99.5%",color:"#00d4e8"},
  {name:"UNCTAD",short:"UNCTAD",url:null,status:"proxied",latency:"—",uptime:"99.2%",color:"#ff8c42"},
  {name:"ILO STAT",short:"ILO",url:null,status:"proxied",latency:"—",uptime:"99.1%",color:"#00d4e8"},
  {name:"UNESCO UIS",short:"UIS",url:null,status:"proxied",latency:"—",uptime:"98.9%",color:"#ff8c42"},
  {name:"UN Environment",short:"ENV",url:null,status:"proxied",latency:"—",uptime:"99.0%",color:"#00c9a7"},
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
      <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:18,padding:'36px 40px',width:420,fontFamily:C.font,boxShadow:'0 32px 80px rgba(0,0,0,.7)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
          <h2 style={{color:C.text,fontSize:16,fontWeight:700,margin:0}}>✉ Invite User</h2>
          <button onClick={onClose} style={{background:'none',border:'none',color:C.mid,cursor:'pointer',fontSize:18}}>✕</button>
        </div>
        {sent?(
          <div style={{padding:'10px 0'}}>
            <div style={{textAlign:'center',marginBottom:16}}>
              <div style={{fontSize:36,marginBottom:8}}>🔗</div>
              <div style={{color:C.teal,fontSize:14,fontWeight:600}}>User created!</div>
              <div style={{color:C.mid,fontSize:11,fontFamily:C.mono,marginTop:4}}>{email} added as {role}</div>
            </div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'12px 14px',marginBottom:14}}>
              <div style={{color:C.dim,fontSize:9,fontFamily:C.mono,textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6}}>Share this invite link:</div>
              <div style={{color:C.text,fontSize:10,fontFamily:C.mono,wordBreak:'break-all',marginBottom:10}}>{inviteLink}</div>
              <button onClick={()=>{navigator.clipboard.writeText(inviteLink);}} style={{background:C.gold,color:'#000',border:'none',borderRadius:7,padding:'7px 16px',fontSize:11,fontWeight:700,cursor:'pointer'}}>📋 Copy Link</button>
            </div>
            <div style={{color:C.dim,fontSize:10,fontFamily:C.mono,lineHeight:1.6}}>Share this link with {email}. They can use it to log in — their account is ready.</div>
            <button onClick={onClose} style={{...btn(),width:'100%',marginTop:14,padding:'10px',fontSize:12}}>Done</button>
          </div>
        ):(
          <form onSubmit={send}>
            <div style={{marginBottom:16}}>
              <div style={{color:C.mid,fontSize:9,fontFamily:C.mono,letterSpacing:'0.14em',textTransform:'uppercase',marginBottom:7}}>Email Address</div>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="user@example.com" style={{...inp,fontSize:13,padding:'11px 14px',border:`1px solid ${email?C.gold:C.border}`}}/>
            </div>
            <div style={{marginBottom:20}}>
              <div style={{color:C.mid,fontSize:9,fontFamily:C.mono,letterSpacing:'0.14em',textTransform:'uppercase',marginBottom:7}}>Role</div>
              <div style={{display:'flex',gap:8}}>
                {['user','analyst','admin'].map(r=>(
                  <button key={r} type="button" onClick={()=>setRole(r)} style={{...pill(role===r),flex:1,textAlign:'center',padding:'8px',textTransform:'capitalize',fontSize:11}}>{r}</button>
                ))}
              </div>
            </div>
            {err&&<div style={{background:`${C.red}12`,border:`1px solid ${C.red}44`,borderRadius:7,padding:'9px 12px',marginBottom:14,color:C.red,fontSize:11,fontFamily:C.mono}}>{err}</div>}
            <div style={{display:'flex',gap:10}}>
              <button type="button" onClick={onClose} style={{flex:1,background:'none',border:`1px solid ${C.border}`,borderRadius:9,padding:'11px',color:C.mid,fontSize:12,cursor:'pointer'}}>Cancel</button>
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
      <div style={{color:C.mid,fontSize:9,fontFamily:C.mono,letterSpacing:'0.14em',textTransform:'uppercase',marginBottom:7}}>{label}</div>
      {children}
    </div>
  );
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,backdropFilter:'blur(6px)'}}>
      <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:18,padding:'32px 36px',width:500,fontFamily:C.font,maxHeight:'85vh',overflowY:'auto',boxShadow:'0 32px 80px rgba(0,0,0,.7)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
          <div><h2 style={{color:C.text,fontSize:16,fontWeight:700,margin:'0 0 3px'}}>✏ Edit User</h2><div style={{color:C.mid,fontSize:11,fontFamily:C.mono}}>@{u.username}</div></div>
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
        {err&&<div style={{background:`${C.red}12`,border:`1px solid ${C.red}44`,borderRadius:7,padding:'9px 12px',marginBottom:14,color:C.red,fontSize:11,fontFamily:C.mono}}>{err}</div>}
        <div style={{display:'flex',gap:10,marginTop:8}}>
          <button onClick={onClose} style={{flex:1,background:'none',border:`1px solid ${C.border}`,borderRadius:9,padding:'11px',color:C.mid,fontSize:12,cursor:'pointer'}}>Cancel</button>
          <button onClick={save} style={{flex:2,...btn(),padding:'11px',fontSize:12}}>Save Changes →</button>
        </div>
      </div>
    </div>
  );
}

function AdminPanel({user, onLogout}) {
  const isMobile=useIsMobile();
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [tab,setTab]=useState("overview");
  const [showUserMenu,setShowUserMenu]=useState(false);
  const [sourceStatuses,setSourceStatuses]=useState([{name:'World Bank',short:'WB',url:'https://api.worldbank.org/v2/country/GH/indicator/NY.GDP.MKTP.CD?format=json',status:'live',latency:'—',uptime:'99.9%',color:'#4f8cff'},{name:'IMF DataMapper',short:'IMF',url:'https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/GHA',status:'live',latency:'—',uptime:'99.4%',color:'#00c9a7'},{name:'FRED',short:'FRED',url:null,status:'key-required',latency:'—',uptime:'99.8%',color:'#ff4c6a'},{name:'WHO GHO',short:'WHO',url:'https://ghoapi.azureedge.net/api/WHOSIS_000001?$top=1',status:'live',latency:'—',uptime:'98.7%',color:'#b05cff'},{name:'Bank of Ghana',short:'BoG',url:null,status:'proxied',latency:'—',uptime:'99.9%',color:'#f0a500'},{name:'BIS',short:'BIS',url:null,status:'proxied',latency:'—',uptime:'99.5%',color:'#00d4e8'},{name:'UNCTAD',short:'UNCTAD',url:null,status:'proxied',latency:'—',uptime:'99.2%',color:'#ff8c42'},{name:'ILO',short:'ILO',url:null,status:'proxied',latency:'—',uptime:'99.1%',color:'#00d4e8'},{name:'UNESCO',short:'UIS',url:null,status:'proxied',latency:'—',uptime:'98.9%',color:'#ff8c42'},{name:'UN Environment',short:'ENV',url:null,status:'proxied',latency:'—',uptime:'99.0%',color:'#00c9a7'}]);
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
    {id:"users",icon:"👥",label:"User Management"},
    {id:"subscriptions",icon:"⬡",label:"Subscriptions"},
    {id:"sources",icon:"🌐",label:"Data Sources"},
    {id:"apikeys",icon:"🔑",label:"API Keys"},
    {id:"activity",icon:"📋",label:"Activity Log"},
    {id:"config",icon:"⚙",label:"System Config"},
  ];


  const statusBadge=(s)=>{
    const map={live:[C.teal,"●"],error:[C.red,"●"],"key-required":[C.gold,"◌"],proxied:[C.blue,"◎"]};
    const [col,ic]=map[s]||[C.dim,"●"];
    return <span style={{color:col,fontSize:9,fontFamily:C.mono}}>{ic} {s}</span>;
  };

  return (
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:C.font,color:C.text,display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden"}}>

      {/* NOTIFICATION */}
      {notif&&(
        <div style={{position:"fixed",top:16,right:16,zIndex:9999,background:notif.type==="success"?`${C.teal}18`:notif.type==="error"?`${C.red}18`:`${C.blue}18`,border:`1px solid ${notif.type==="success"?C.teal:notif.type==="error"?C.red:C.blue}55`,borderRadius:9,padding:"11px 18px",color:notif.type==="success"?C.teal:notif.type==="error"?C.red:C.blue,fontSize:12,fontFamily:C.mono,boxShadow:`0 8px 24px rgba(0,0,0,.5)`}}>
          {notif.msg}
        </div>
      )}

      {/* HEADER */}
      <header style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:isMobile?"10px 12px":"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:isMobile?8:12}}>
          {isMobile&&<button onClick={()=>setSidebarOpen(o=>!o)} style={{background:C.gold,border:"none",cursor:"pointer",padding:9,borderRadius:7,display:"flex",flexDirection:"column",gap:4,flexShrink:0}}><span style={{display:"block",width:18,height:2,background:"#000",borderRadius:2}}/><span style={{display:"block",width:18,height:2,background:"#000",borderRadius:2}}/><span style={{display:"block",width:18,height:2,background:"#000",borderRadius:2}}/></button>}
          <div style={{width:32,height:32,background:`linear-gradient(135deg,${C.gold},${C.goldLt})`,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>◈</div>
          <div>
            <div style={{fontSize:15,fontWeight:800,letterSpacing:"-0.3px",lineHeight:1}}>EcoScope</div>
            <div style={{fontSize:8,color:C.dim,fontFamily:C.mono,letterSpacing:"0.14em"}}>GLOBAL ECONOMIC INTELLIGENCE</div>
          </div>
          <div style={{width:1,height:28,background:C.border,margin:"0 6px"}}/>
          <div style={{background:`${C.gold}18`,border:`1px solid ${C.gold}55`,borderRadius:6,padding:"3px 10px",display:"flex",alignItems:"center",gap:5}}>
            <span style={{fontSize:8,color:C.gold}}>⬡</span>
            <span style={{color:C.gold,fontSize:10,fontFamily:C.mono,fontWeight:700,letterSpacing:"0.1em"}}>ADMIN PANEL</span>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button id="eco-hamburger" onClick={()=>setSidebarOpen(o=>!o)} style={{background:"none",border:"none",color:C.text,cursor:"pointer",padding:6,flexDirection:"column",gap:5,flexShrink:0}}><span style={{display:"block",width:20,height:2,background:C.text,borderRadius:2}}/><span style={{display:"block",width:20,height:2,background:C.text,borderRadius:2}}/><span style={{display:"block",width:20,height:2,background:C.text,borderRadius:2}}/></button>
          <div style={{display:"flex",gap:6,fontFamily:C.mono,fontSize:10}}>
            <span style={{color:C.teal}}>● {activeUsers} active</span>
            <span style={{color:C.dim}}>·</span>
            <span style={{color:C.mid}}>{totalQueries} queries today</span>
          </div>
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowUserMenu(v=>!v)} style={{display:"flex",alignItems:"center",gap:8,background:C.card,border:`1px solid ${showUserMenu?C.gold:C.border}`,borderRadius:20,padding:"5px 14px 5px 6px",cursor:"pointer",transition:"border-color .15s"}}>
              <div style={{width:26,height:26,borderRadius:"50%",background:user.avatarColor||C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#000"}}>{user.initials||"A"}</div>
              <span style={{color:C.text,fontSize:12,fontFamily:C.mono,fontWeight:600}}>{user.username}</span>
              <span style={{color:C.mid,fontSize:8}}>{showUserMenu?"▲":"▼"}</span>
            </button>
            {showUserMenu&&(
              <div style={{position:"absolute",top:"calc(100% + 8px)",right:0,background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:13,padding:"6px",minWidth:220,boxShadow:`0 16px 48px rgba(0,0,0,.7)`,zIndex:200}}>
                <div style={{padding:"10px 14px 10px",borderBottom:`1px solid ${C.border}`,marginBottom:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                    <div style={{width:34,height:34,borderRadius:"50%",background:user.avatarColor||C.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#000"}}>{user.initials||"A"}</div>
                    <div><div style={{color:C.text,fontSize:12,fontWeight:700}}>{user.username}</div><div style={{color:C.mid,fontSize:10,fontFamily:C.mono}}>{user.email||"admin@ecoscope.app"}</div></div>
                  </div>
                  <div style={{background:`${C.gold}18`,border:`1px solid ${C.gold}44`,borderRadius:5,padding:"3px 9px",display:"inline-block"}}><span style={{color:C.gold,fontSize:9,fontFamily:C.mono,fontWeight:700}}>⬡ ADMINISTRATOR</span></div>
                </div>
                {[
                  {icon:"◈",label:"Switch to Dashboard",action:()=>{onLogout();},special:true},
                  null,
                  {icon:"⚙",label:"System Config",action:()=>{setTab("config");setShowUserMenu(false);}},
                  {icon:"👥",label:"User Management",action:()=>{setTab("users");setShowUserMenu(false);}},
                  {icon:"🌐",label:"Data Sources",action:()=>{setTab("sources");setShowUserMenu(false);}},
                  null,
                  {icon:"←",label:"Sign Out",action:onLogout,danger:true},
                ].map((item,i)=>item===null
                  ?<div key={i} style={{height:1,background:C.border,margin:"4px 6px"}}/>
                  :<button key={i} onClick={item.action} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 14px",borderRadius:8,border:"none",background:item.special?`${C.gold}12`:"transparent",cursor:"pointer",textAlign:"left",color:item.danger?C.red:item.special?C.gold:C.text}}>
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
        <div id="eco-overlay" className={sidebarOpen&&isMobile&&<div onClick={()=>setSidebarOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:98}}/>}
        {false&&<div style={{}}/>

        {/* ADMIN SIDEBAR NAV */}
        <nav style={{background:C.surface,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",padding:"12px 8px",...(isMobile?{position:"fixed",top:0,left:0,bottom:0,width:"80vw",maxWidth:280,zIndex:99,transform:sidebarOpen?"translateX(0)":"translateX(-105%)",transition:"transform 0.3s ease",boxShadow:sidebarOpen?"8px 0 40px rgba(0,0,0,0.7)":"none",overflowY:"auto"}:{width:200,flexShrink:0})}}>
          {isMobile&&<div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}><button onClick={()=>setSidebarOpen(false)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,color:C.mid,cursor:"pointer",padding:"5px 12px",fontSize:12,fontFamily:C.mono}}>✕ Close</button></div>}
          {navItems.map(n=>(
            <button key={n.id} onClick={()=>{setTab(n.id);if(isMobile) setSidebarOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:9,border:"none",background:tab===n.id?`${C.gold}15`:"transparent",cursor:"pointer",textAlign:"left",borderLeft:`2px solid ${tab===n.id?C.gold:"transparent"}`,marginBottom:2,transition:"all .12s",width:"100%"}}>
              <span style={{fontSize:15}}>{n.icon}</span>
              <span style={{color:tab===n.id?C.gold:C.mid,fontSize:12,fontWeight:tab===n.id?700:400,flex:1}}>{n.label}</span>
              {n.badge>0&&<span style={{background:C.red,color:"#fff",fontSize:9,fontWeight:800,borderRadius:10,padding:"2px 6px",fontFamily:C.mono}}>{n.badge}</span>}
            </button>
          ))}
          <div style={{flex:1}}/>
          <button onClick={()=>setTab("overview")} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:9,border:`1px solid ${C.border}`,background:"transparent",cursor:"pointer",textAlign:"left",marginTop:8}}>
            <span style={{fontSize:13}}>◫</span>
            <span style={{color:C.mid,fontSize:11,fontFamily:C.mono}}>v2.0 · Admin</span>
          </button>
        </nav>

        {/* MAIN CONTENT */}
        <main style={{flex:1,overflowY:"auto",padding:20,display:"flex",flexDirection:"column",gap:16}}>

          {/* ── OVERVIEW ── */}
          {tab==="overview"&&(
            <>
              <div>
                <h1 style={{fontSize:20,fontWeight:800,color:C.text,margin:"0 0 4px"}}>Welcome back, {user.username} 👋</h1>
                <p style={{color:C.mid,fontSize:11,fontFamily:C.mono,margin:0}}>EcoScope Admin Dashboard · {new Date().toLocaleDateString("en-GB",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
              </div>
              {/* KPI row */}
              <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)",gap:isMobile?8:12}}>
                {[
                  {icon:"👥",label:"Total Users",val:users.length,sub:`${activeUsers} active`,col:C.blue},
                  {icon:"📊",label:"Total Queries",val:totalQueries.toLocaleString(),sub:"session total",col:C.gold},
                  {icon:"◈",label:"AI Insights",val:`${aiEnabled}/${users.length}`,sub:"users with key",col:C.purple},
                  {icon:"🌍",label:"Ghana Users",val:ghanaUsers,sub:`${Math.round(ghanaUsers/users.length*100)}% of base`,col:C.teal},
                ].map((k,i)=>(
                  <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 18px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                      <span style={{fontSize:22}}>{k.icon}</span>
                      <div style={{width:8,height:8,borderRadius:"50%",background:k.col}}/>
                    </div>
                    <div style={{fontSize:26,fontWeight:800,color:k.col,marginBottom:3}}>{k.val}</div>
                    <div style={{fontSize:9,color:C.dim,fontFamily:C.mono,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:2}}>{k.label}</div>
                    <div style={{fontSize:10,color:C.mid,fontFamily:C.mono}}>{k.sub}</div>
                  </div>
                ))}
              </div>
              {/* Sources status grid */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"18px 20px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <h3 style={{margin:0,fontSize:13,fontWeight:700,color:C.text}}>🌐 Data Source Health</h3>
                  <span style={{color:C.teal,fontSize:10,fontFamily:C.mono}}>● {sourceStatuses.filter(s=>s.status==="live").length}/{sourceStatuses.length} live</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
                  {sourceStatuses.map((s,i)=>(
                    <div key={i} style={{background:C.surface,border:`1px solid ${s.status==="live"?`${s.color}44`:s.status==="error"?`${C.red}44`:C.border}`,borderRadius:8,padding:"10px 12px"}}>
                      <div style={{display:"flex",justify:"space-between",alignItems:"center",marginBottom:5}}>
                        <span style={{color:s.color,fontSize:12,fontWeight:700,fontFamily:C.mono}}>{s.short}</span>
                        {statusBadge(s.status)}
                      </div>
                      <div style={{color:C.mid,fontSize:9,fontFamily:C.mono}}>{s.latency!=="—"?s.latency:"proxied"}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Recent activity */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"18px 20px"}}>
                <h3 style={{margin:"0 0 14px",fontSize:13,fontWeight:700,color:C.text}}>📋 Recent Activity</h3>
                {activity.slice(0,5).map((a,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:i<4?`1px solid ${C.border}`:"none"}}>
                    <span style={{color:C.dim,fontSize:10,fontFamily:C.mono,width:36,flexShrink:0}}>{a.time}</span>
                    <span style={{color:C.gold,fontSize:11,fontFamily:C.mono,width:120,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.user}</span>
                    <span style={{color:C.teal,fontSize:10,fontFamily:C.mono,width:140,flexShrink:0}}>{a.action}</span>
                    <span style={{color:C.mid,fontSize:10,fontFamily:C.mono,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.detail}</span>
                  </div>
                ))}
                <button onClick={()=>setTab("activity")} style={{marginTop:12,background:"none",border:`1px solid ${C.border}`,borderRadius:7,padding:"7px 16px",color:C.mid,fontSize:11,cursor:"pointer",fontFamily:C.mono}}>View all activity →</button>
              </div>
            </>
          )}

          {/* ── USERS ── */}
          {tab==="users"&&(
            <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><h2 style={{margin:0,fontSize:16,fontWeight:800,color:C.text}}>👥 User Management</h2><p style={{margin:"3px 0 0",color:C.mid,fontSize:11,fontFamily:C.mono}}>{users.length} users · Real accounts</p></div>
                <button onClick={()=>setShowInvite(true)} style={{background:C.gold,color:"#000",border:"none",borderRadius:8,padding:"9px 18px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:C.font}}>+ Invite User</button>
              </div>
              {/* Filters */}
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input value={userSearch} onChange={e=>setUserSearch(e.target.value)} placeholder="🔍 Search users..." style={{...inp,width:240,fontSize:12,padding:"8px 12px"}}/>
                <div style={{display:"flex",gap:5}}>
                  {["all","admin","analyst","user"].map(r=>(
                    <button key={r} onClick={()=>setRoleFilter(r)} style={{...pill(roleFilter===r),textTransform:"capitalize",padding:"5px 12px",fontSize:10}}>{r}</button>
                  ))}
                </div>
              </div>
              {/* Table */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontFamily:C.mono,fontSize:11}}>
                  <thead>
                    <tr style={{background:C.surface}}>
                      {["User","Email","Role","Status","Joined","Last Seen","Queries","API Keys","Actions"].map(h=>(
                        <th key={h} style={{color:C.dim,padding:"11px 14px",fontWeight:500,textAlign:"left",fontSize:9,textTransform:"uppercase",letterSpacing:"0.1em",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u,i)=>(
                      <tr key={u.id} style={{background:i%2?`${C.surface}55`:"transparent",cursor:"pointer"}} onClick={()=>setSelectedUser(selectedUser?.id===u.id?null:u)}>
                        <td style={{padding:"10px 14px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{width:28,height:28,borderRadius:"50%",background:u.role==="admin"?C.gold:u.role==="analyst"?C.teal:C.blue,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#000"}}>{u.username.slice(0,2).toUpperCase()}</div>
                            <span style={{color:C.text,fontWeight:600}}>{u.username}</span>
                          </div>
                        </td>
                        <td style={{padding:"10px 14px",color:C.mid}}>{u.email}</td>
                        <td style={{padding:"10px 14px"}}>
                          <span style={{background:u.role==="admin"?`${C.gold}20`:u.role==="analyst"?`${C.teal}20`:`${C.blue}20`,color:u.role==="admin"?C.gold:u.role==="analyst"?C.teal:C.blue,borderRadius:5,padding:"2px 8px",fontSize:9,fontWeight:700,textTransform:"uppercase"}}>{u.role}</span>
                        </td>
                        <td style={{padding:"10px 14px"}}><span style={{color:u.planStatus==="active"?C.teal:u.planStatus==="suspended"?C.red:C.blue,fontSize:9}}>● {u.planStatus}</span></td>
                        <td style={{padding:"10px 14px",color:C.mid}}>{u.createdAt?u.createdAt.slice(0,10):"—"}</td>
                        <td style={{padding:"10px 14px",color:C.mid}}>{u.lastLogin?new Date(u.lastLogin).toLocaleString():"Never"}</td>
                        <td style={{padding:"10px 14px",color:C.gold,fontWeight:600}}>{activity.filter(a=>a.username===u.username).length}</td>
                        <td style={{padding:"10px 14px"}}>
                          <div style={{display:"flex",gap:4}}>
                            <span style={{color:u.settings?.anthropicKey?C.teal:C.dim,fontSize:9}} title="Anthropic">◈</span>
                            <span style={{color:u.settings?.fredKey?C.red:C.dim,fontSize:9}} title="FRED">🏦</span>
                          </div>
                        </td>
                        <td style={{padding:"10px 14px"}}>
                          <div style={{display:"flex",gap:4}}>
                            <button onClick={e=>{e.stopPropagation();setEditUser(u);}} style={{background:`${C.blue}18`,border:`1px solid ${C.blue}44`,borderRadius:5,padding:"4px 9px",color:C.blue,fontSize:9,cursor:"pointer"}}>✏ Edit</button>
                            {u.role!=="admin"&&<button onClick={e=>{e.stopPropagation();setConfirmDelete(u);}} style={{background:`${C.red}18`,border:`1px solid ${C.red}44`,borderRadius:5,padding:"4px 9px",color:C.red,fontSize:9,cursor:"pointer"}}>🗑 Delete</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedUser&&(
                <div style={{background:C.card,border:`1px solid ${C.gold}44`,borderRadius:12,padding:"18px 20px"}}>
                  <h3 style={{margin:"0 0 14px",fontSize:13,fontWeight:700,color:C.gold}}>👤 {selectedUser.username} — Details</h3>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                    {[{l:"Email",v:selectedUser.email||'—'},{l:"Role",v:selectedUser.role},{l:"Plan",v:selectedUser.plan},{l:"Status",v:selectedUser.planStatus},{l:"Country",v:selectedUser.country||'—'},{l:"Joined",v:selectedUser.createdAt?selectedUser.createdAt.slice(0,10):'—'},{l:"Last Login",v:selectedUser.lastLogin?new Date(selectedUser.lastLogin).toLocaleString():'Never'},{l:"User ID",v:selectedUser.id}].map(({l,v})=>(
                      <div key={l} style={{background:C.surface,borderRadius:8,padding:"10px 13px"}}>
                        <div style={{color:C.dim,fontSize:9,fontFamily:C.mono,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>{l}</div>
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
                <div><h2 style={{margin:0,fontSize:16,fontWeight:800,color:C.text}}>⬡ Subscription Management</h2><p style={{margin:"3px 0 0",color:C.mid,fontSize:11,fontFamily:C.mono}}>User plans, revenue and billing</p></div>
              </div>
              {/* Revenue KPIs */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                {[
                  {icon:"💰",label:"MRR",val:`$${(users.filter(u=>u.plan==="pro"&&u.planStatus==="active").length*9.99).toFixed(2)}`,sub:"monthly recurring",col:C.teal},
                  {icon:"⬡",label:"Pro Users",val:users.filter(u=>u.plan==="pro"&&u.planStatus==="active").length,sub:"active subscriptions",col:C.gold},
                  {icon:"🏢",label:"Enterprise",val:users.filter(u=>u.plan==="enterprise").length,sub:"accounts",col:C.purple},
                  {icon:"👤",label:"Free Tier",val:users.filter(u=>u.plan==="free").length,sub:"users",col:C.mid},
                ].map((k,i)=>(
                  <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px"}}>
                    <div style={{fontSize:20,marginBottom:8}}>{k.icon}</div>
                    <div style={{fontSize:22,fontWeight:800,color:k.col,marginBottom:2}}>{k.val}</div>
                    <div style={{fontSize:9,color:C.dim,fontFamily:C.mono,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:1}}>{k.label}</div>
                    <div style={{fontSize:10,color:C.mid,fontFamily:C.mono}}>{k.sub}</div>
                  </div>
                ))}
              </div>
              {/* Subscriptions table */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontFamily:C.mono,fontSize:11}}>
                  <thead>
                    <tr style={{background:C.surface}}>
                      {["User","Plan","Status","Since","Expires","Revenue/mo","Actions"].map(h=>(
                        <th key={h} style={{color:C.dim,padding:"11px 14px",fontWeight:500,textAlign:"left",fontSize:9,textTransform:"uppercase",letterSpacing:"0.1em",borderBottom:`1px solid ${C.border}`}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u,i)=>{ const s={user:u.username,email:u.email,plan:u.plan,status:u.planStatus,since:u.createdAt?u.createdAt.slice(0,10):"—",lastLogin:u.lastLogin?new Date(u.lastLogin).toLocaleString():"Never",revenue:u.plan==="pro"?9.99:0};
                      const pl=PLANS[s.plan]||PLANS.free;
                      return(
                        <tr key={i} style={{background:i%2?`${C.surface}55`:"transparent"}}>
                          <td style={{padding:"9px 14px",color:C.gold,fontWeight:600}}>{s.user}</td>
                          <td style={{padding:"9px 14px"}}><span style={{background:`${pl.color}20`,color:pl.color,borderRadius:5,padding:"2px 8px",fontSize:9,fontWeight:700}}>{pl.badge}</span></td>
                          <td style={{padding:"9px 14px"}}><span style={{color:s.status==="active"?C.teal:C.red,fontSize:9}}>● {s.status}</span></td>
                          <td style={{padding:"9px 14px",color:C.mid}}>{s.since}</td>
                          <td style={{padding:"9px 14px",color:C.mid}}>{s.expires||"—"}</td>
                          <td style={{padding:"9px 14px",color:s.revenue>0?C.teal:C.dim,fontWeight:s.revenue>0?600:400}}>{s.revenue>0?`$${s.revenue.toFixed(2)}`:"Free"}</td>
                          <td style={{padding:"9px 14px"}}>
                            <div style={{display:"flex",gap:5}}>
                              {s.plan!=="enterprise"&&s.plan!=="pro"&&<button onClick={()=>{changePlan(u.username,'pro');}} style={{background:`${C.gold}18`,border:`1px solid ${C.gold}44`,borderRadius:5,padding:"3px 8px",color:C.gold,fontSize:9,cursor:"pointer"}}>→ Pro</button>}
                              
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
              <div><h2 style={{margin:0,fontSize:16,fontWeight:800,color:C.text}}>🌐 Data Source Management</h2><p style={{margin:"3px 0 0",color:C.mid,fontSize:11,fontFamily:C.mono}}>Monitor and test all connected data APIs</p></div>
              {sourceStatuses.map((s,i)=>(
                <div key={i} style={{background:C.card,border:`1px solid ${s.status==="live"?`${s.color}44`:s.status==="error"?`${C.red}44`:C.border}`,borderRadius:12,padding:"16px 20px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:s.status==="live"?C.teal:s.status==="error"?C.red:s.status==="key-required"?C.gold:C.blue,flexShrink:0}}/>
                      <div>
                        <div style={{color:C.text,fontSize:13,fontWeight:700}}>{s.name}</div>
                        <div style={{display:"flex",gap:14,marginTop:3}}>
                          <span style={{color:C.mid,fontSize:10,fontFamily:C.mono}}>Latency: {s.latency}</span>
                          <span style={{color:C.mid,fontSize:10,fontFamily:C.mono}}>Uptime: {s.uptime}</span>
                          {statusBadge(s.status)}
                        </div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      {s.status==="key-required"&&<span style={{color:C.gold,fontSize:10,fontFamily:C.mono}}>⚠ Requires API key from users</span>}
                      {s.status==="proxied"&&<span style={{color:C.blue,fontSize:10,fontFamily:C.mono}}>◎ Data via World Bank / IMF proxy</span>}
                      <button onClick={()=>pingSource(i)} disabled={pingLoading[i]} style={{background:`${s.color}15`,border:`1px solid ${s.color}44`,borderRadius:7,padding:"7px 16px",color:s.color,fontSize:11,cursor:"pointer",fontFamily:C.mono,opacity:pingLoading[i]?.6:1}}>
                        {pingLoading[i]?"Pinging…":"Ping →"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── ACTIVITY ── */}
          {tab==="activity"&&(
            <>
              <div><h2 style={{margin:0,fontSize:16,fontWeight:800,color:C.text}}>📋 Activity Log</h2><p style={{margin:"3px 0 0",color:C.mid,fontSize:11,fontFamily:C.mono}}>All user actions — today</p></div>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontFamily:C.mono,fontSize:11}}>
                  <thead>
                    <tr style={{background:C.surface}}>
                      {["Time","User","Action","Detail"].map(h=>(
                        <th key={h} style={{color:C.dim,padding:"11px 16px",fontWeight:500,textAlign:"left",fontSize:9,textTransform:"uppercase",letterSpacing:"0.1em",borderBottom:`1px solid ${C.border}`}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((a,i)=>(
                      <tr key={i} style={{background:i%2?`${C.surface}55`:"transparent"}}>
                        <td style={{padding:"9px 16px",color:C.dim,whiteSpace:"nowrap"}}>{a.time}</td>
                        <td style={{padding:"9px 16px",color:C.gold,fontWeight:600}}>{a.user}</td>
                        <td style={{padding:"9px 16px"}}><span style={{background:`${C.teal}18`,color:C.teal,borderRadius:5,padding:"2px 8px",fontSize:9}}>{a.action}</span></td>
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
                <h2 style={{margin:0,fontSize:16,fontWeight:800,color:C.text}}>🔑 API Keys Management</h2>
                <p style={{margin:"3px 0 0",color:C.mid,fontSize:11,fontFamily:C.mono}}>Configure platform-wide API keys — admin only</p>
              </div>

              <div style={{background:`${C.gold}0e`,border:`1px solid ${C.gold}33`,borderRadius:10,padding:"13px 16px"}}>
                <div style={{color:C.gold,fontSize:11,fontFamily:C.mono}}>🔒 Keys are stored securely. Users inherit the platform Anthropic key for AI Insights. Individual users can override with their own keys in Settings.</div>
              </div>

              {/* Anthropic Key */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px 22px"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                  <div style={{width:36,height:36,background:`${C.purple}20`,border:`1px solid ${C.purple}44`,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>◈</div>
                  <div>
                    <div style={{color:C.text,fontSize:14,fontWeight:700}}>Anthropic Claude API</div>
                    <div style={{color:C.mid,fontSize:10,fontFamily:C.mono}}>Powers AI Insights for all Pro users</div>
                  </div>
                  <div style={{marginLeft:"auto"}}>
                    {apiKeys.anthropic?(
                      <span style={{background:`${C.teal}18`,border:`1px solid ${C.teal}44`,borderRadius:6,padding:"4px 10px",color:C.teal,fontSize:10,fontFamily:C.mono,fontWeight:700}}>✓ Configured</span>
                    ):(
                      <span style={{background:`${C.red}18`,border:`1px solid ${C.red}44`,borderRadius:6,padding:"4px 10px",color:C.red,fontSize:10,fontFamily:C.mono,fontWeight:700}}>✗ Not set</span>
                    )}
                  </div>
                </div>
                <div style={{marginBottom:8}}>
                  <div style={{color:C.dim,fontSize:9,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:7}}>API Key</div>
                  <input
                    type="password"
                    value={apiKeys.anthropic}
                    onChange={e=>setApiKeys(k=>({...k,anthropic:e.target.value}))}
                    placeholder="sk-ant-api03-..."
                    style={{...inp,fontSize:12,fontFamily:C.mono}}
                  />
                  {apiKeys.anthropic&&<div style={{color:C.teal,fontSize:10,fontFamily:C.mono,marginTop:6}}>✓ Key entered ({apiKeys.anthropic.length} chars) · AI Insights enabled for Pro users</div>}
                </div>
                <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{color:C.blue,fontSize:10,fontFamily:C.mono}}>Get API key at console.anthropic.com ↗</a>
              </div>

              {/* FRED Key */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px 22px"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                  <div style={{width:36,height:36,background:`${C.red}20`,border:`1px solid ${C.red}44`,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🏦</div>
                  <div>
                    <div style={{color:C.text,fontSize:14,fontWeight:700}}>FRED — Federal Reserve Economic Data</div>
                    <div style={{color:C.mid,fontSize:10,fontFamily:C.mono}}>Enables 800K+ US economic series for all users</div>
                  </div>
                  <div style={{marginLeft:"auto"}}>
                    {apiKeys.fred?(
                      <span style={{background:`${C.teal}18`,border:`1px solid ${C.teal}44`,borderRadius:6,padding:"4px 10px",color:C.teal,fontSize:10,fontFamily:C.mono,fontWeight:700}}>✓ Configured</span>
                    ):(
                      <span style={{background:`${C.orange}18`,border:`1px solid ${C.orange}44`,borderRadius:6,padding:"4px 10px",color:C.orange,fontSize:10,fontFamily:C.mono,fontWeight:700}}>⚠ Optional</span>
                    )}
                  </div>
                </div>
                <div style={{marginBottom:8}}>
                  <div style={{color:C.dim,fontSize:9,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:7}}>API Key</div>
                  <input
                    type="password"
                    value={apiKeys.fred}
                    onChange={e=>setApiKeys(k=>({...k,fred:e.target.value}))}
                    placeholder="Your FRED API key..."
                    style={{...inp,fontSize:12,fontFamily:C.mono}}
                  />
                  {apiKeys.fred&&<div style={{color:C.teal,fontSize:10,fontFamily:C.mono,marginTop:6}}>✓ Key entered · FRED data source unlocked for all users</div>}
                </div>
                <a href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noreferrer" style={{color:C.blue,fontSize:10,fontFamily:C.mono}}>Get free FRED key ↗</a>
              </div>

              {/* Free sources */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"18px 20px"}}>
                <div style={{color:C.gold,fontSize:9,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}}>Sources With No Key Required</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {["World Bank","IMF WEO","WHO GHO","ILO ILOSTAT","UNESCO UIS","UNCTAD","BIS","UN SDG","FAO","UN Environment"].map(s=>(
                    <div key={s} style={{background:`${C.teal}12`,border:`1px solid ${C.teal}33`,borderRadius:6,padding:"5px 12px",color:C.teal,fontSize:10,fontFamily:C.mono}}>✓ {s}</div>
                  ))}
                </div>
              </div>

              {/* Save button */}
              <div style={{display:"flex",gap:10}}>
                <button onClick={saveApiKeys} style={{...btn(),padding:"11px 28px",fontSize:12}}>
                  {apiKeySaved?"✓ Saved!":"Save API Keys"}
                </button>
                <button onClick={()=>{setApiKeys({anthropic:'',fred:''});localStorage.removeItem('admin_anthropic_key');localStorage.removeItem('admin_fred_key');notify('API keys cleared','error');}} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:9,padding:"11px 20px",color:C.dim,fontSize:12,cursor:"pointer"}}>Clear All</button>
              </div>
            </>
          )}

          {/* ── CONFIG ── */}
          {tab==="config"&&(
            <>
              <div><h2 style={{margin:0,fontSize:16,fontWeight:800,color:C.text}}>⚙ System Configuration</h2><p style={{margin:"3px 0 0",color:C.mid,fontSize:11,fontFamily:C.mono}}>Platform-wide settings — admin only</p></div>
              {/* Platform */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"18px 20px"}}>
                <div style={{color:C.gold,fontSize:9,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:14,paddingBottom:9,borderBottom:`1px solid ${C.border}`}}>Platform Settings</div>
                {[{l:"Platform Name",v:"EcoScope"},{l:"Version",v:"v2.0"},{l:"Environment",v:"Development"},{l:"Base URL",v:"http://localhost:3000"}].map(({l,v})=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                    <span style={{color:C.mid,fontSize:12,fontFamily:C.mono}}>{l}</span>
                    <span style={{color:C.text,fontSize:12,fontFamily:C.mono,fontWeight:600}}>{v}</span>
                  </div>
                ))}
              </div>
              {/* Access control */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"18px 20px"}}>
                <div style={{color:C.gold,fontSize:9,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:14,paddingBottom:9,borderBottom:`1px solid ${C.border}`}}>Access Control</div>
                {[{l:"Open Registration",v:true},{l:"Require Email Verification",v:false},{l:"Allow Guest Access",v:true},{l:"Total Registered Users",v:users.length}].map(({l,v},i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                    <span style={{color:C.mid,fontSize:12,fontFamily:C.mono}}>{l}</span>
                    {typeof v==="boolean"?<span style={{color:v?C.teal:C.red,fontSize:12,fontFamily:C.mono,fontWeight:600}}>{v?"● Enabled":"○ Disabled"}</span>:<span style={{color:C.text,fontSize:12,fontFamily:C.mono,fontWeight:600}}>{v}</span>
                    }
                  </div>
                ))}
              </div>
              {/* Roles */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"18px 20px"}}>
                <div style={{color:C.gold,fontSize:9,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:14,paddingBottom:9,borderBottom:`1px solid ${C.border}`}}>Role Permissions</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                  {[
                    {role:"Admin",col:C.gold,perms:["Full platform access","User management","System config","All data sources","AI Insights","Activity logs"]},
                    {role:"Analyst",col:C.teal,perms:["All data sources","AI Insights","CSV export","Compare countries","Save charts","View activity (own)"]},
                    {role:"User",col:C.blue,perms:["All data sources","CSV export","Compare countries","Basic charts","Own settings","—"]},
                  ].map(({role,col,perms})=>(
                    <div key={role} style={{background:C.surface,border:`1px solid ${col}33`,borderRadius:9,padding:"13px 15px"}}>
                      <div style={{color:col,fontWeight:700,fontSize:12,marginBottom:10}}>{role}</div>
                      {perms.map((p,i)=><div key={i} style={{color:p==="—"?C.dim:C.mid,fontSize:10,fontFamily:C.mono,padding:"3px 0",borderBottom:i<perms.length-1?`1px solid ${C.border}`:"none"}}>{p!=="—"?"✓ ":""}{p}</div>)}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Footer */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderTop:`1px solid ${C.border}`,marginTop:4,flexShrink:0}}>
            <span style={{color:C.dim,fontSize:9,fontFamily:C.mono}}>EcoScope Admin Panel · v2.0 · {users.length} registered users · {sourceStatuses.filter(s=>s.status==="live").length} live sources</span>
            <span style={{color:C.dim,fontSize:9,fontFamily:C.mono}}>{new Date().toLocaleTimeString()}</span>
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
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}::-webkit-scrollbar{width:4px;height:4px;}::-webkit-scrollbar-track{background:${C.bg};}::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}::-webkit-scrollbar-thumb:hover{background:${C.gold}55;}select option{background:${C.card};color:${C.text};}@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}a{text-decoration:none;}`}</style>

      {/* Invite Modal */}
      {showInvite&&<InviteModal onClose={()=>setShowInvite(false)} onDone={()=>{refresh();notify("User invited successfully");}}/>}

      {/* Edit User Modal */}
      {editUser&&<EditUserModal user={editUser} onClose={()=>setEditUser(null)} onSave={()=>{refresh();notify(`${editUser.username} updated`);setEditUser(null);}}/>}

      {/* Confirm Delete */}
      {confirmDelete&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,backdropFilter:"blur(6px)"}}>
          <div style={{background:C.surface,border:`2px solid ${C.red}55`,borderRadius:18,padding:"36px 40px",width:400,textAlign:"center",fontFamily:C.font}}>
            <div style={{fontSize:40,marginBottom:16}}>🗑</div>
            <h2 style={{color:C.text,fontSize:17,fontWeight:800,marginBottom:10}}>Delete User?</h2>
            <p style={{color:C.mid,fontSize:12,fontFamily:C.mono,marginBottom:8,lineHeight:1.7}}>
              You are about to permanently delete <strong style={{color:C.gold}}>{confirmDelete.username}</strong> ({confirmDelete.email}).
            </p>
            <p style={{color:C.red,fontSize:11,fontFamily:C.mono,marginBottom:24}}>⚠ This action cannot be undone.</p>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button onClick={()=>setConfirmDelete(null)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:9,padding:"11px 22px",color:C.mid,fontSize:12,cursor:"pointer"}}>Cancel</button>
              <button onClick={()=>{US.deleteUser(confirmDelete.username);refresh();notify(`${confirmDelete.username} deleted`,"error");setConfirmDelete(null);setSelectedUser(null);}} style={{background:C.red,border:"none",borderRadius:9,padding:"11px 26px",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Delete Permanently</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
