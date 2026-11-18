// core/fetch.js — split from App.js (code unchanged; only imports and exports were added)
import React from "react";
import { ISO3 } from "./theme";
import { MACRO_SOURCES, MICRO_SOURCES } from "../data/sources";

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
const htmlEsc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dlPDF = (data, varName0, countryName0, sourceName0, startYear0, endYear0, fmt) => {
  // names can come from imported or shared data: escape before writing them into the print window
  const varName = htmlEsc(varName0), countryName = htmlEsc(countryName0), sourceName = htmlEsc(sourceName0), startYear = htmlEsc(startYear0), endYear = htmlEsc(endYear0);
  if (!data.length) return;
  const rows = data.map((d,i) => {
    const prev = data[i-1];
    const delta = prev&&prev.value ? ((d.value-prev.value)/Math.abs(prev.value)*100) : null;
    return `<tr style="background:${i%2?"#f8faff":"#fff"}"><td>${htmlEsc(d.year)}</td><td style="text-align:right;font-weight:600">${fmtVal(d.value,fmt)}</td><td style="text-align:right;color:${delta==null?"#999":delta>=0?"#00a87a":"#e03050"}">${delta==null?"—":`${delta>=0?"+":""}${delta.toFixed(1)}%`}</td></tr>`
  }).join("");
  const html = `<html><head><title>${varName} — ${countryName}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'IBM Plex Sans',Arial,sans-serif;padding:40px;color:#101828;font-variant-numeric:tabular-nums}h1{font-size:20px;font-weight:600;margin-bottom:6px;color:#101828}h2{font-size:13px;font-weight:400;color:#666;margin-bottom:24px}.badge{display:inline-block;background:#1f4fd1;color:#fff;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:13px}th{padding:8px 14px;background:#fff;color:#101828;text-align:left;font-weight:600;border-top:2px solid #101828;border-bottom:1px solid #101828}td{padding:8px 14px;border-bottom:1px solid #eee}.footer{margin-top:24px;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:12px}@media print{body{padding:20px}}</style></head><body><div class="badge">EcoScope · ${sourceName}</div><h1>${varName}</h1><h2>${countryName} · ${startYear}–${endYear}</h2><table><thead><tr><th>Year</th><th style="text-align:right">Value</th><th style="text-align:right">YoY Change</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">Generated by EcoScope — Global Economic Intelligence Platform · ${new Date().toLocaleDateString()}</div></body></html>`;
  const win = window.open("","_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(()=>win.print(), 400);
};

export { ALL_SRCS_MAP, IMF_TO_WB, WGI_CODES, cacheClearPrefix, cacheGet, cacheSet, dlCSV, dlPDF, fetchData, fmtVal, htmlEsc, proxyFetch, useIsMobile };
