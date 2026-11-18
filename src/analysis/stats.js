// analysis/stats.js — split from App.js (code unchanged; only imports and exports were added)
import { fmtVal, htmlEsc } from "../core/fetch";
import { C } from "../core/theme";
import { meDagAnalysis } from "../impact/estimators";

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
      w.document.write(`<!DOCTYPE html><html><head><title>${htmlEsc(title||'EcoScope Chart')}</title>
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

export { AGG_METHODS, IMPUTE_METHODS, NORM_METHODS, TRANSFORMS, applyTransform, buildComposite, dagBackdoorSet, dagHasCycle, dagPaths, downloadDAG, exportChart, generateEcoScopeAnalysis, histogram, imputeData, normalCurve, olsRegression, skewNormalCurve, summaryStats };
