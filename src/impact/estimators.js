// impact/estimators.js — split from App.js (code unchanged; only imports and exports were added)
import { useEffect, useRef, useState } from "react";
import { IMPUTE_METHODS, TRANSFORMS, applyTransform, dagHasCycle, dagPaths, imputeData } from "../analysis/stats";
import { IMF_TO_WB, WGI_CODES, cacheGet, cacheSet, proxyFetch } from "../core/fetch";
import { C, ISO3_TO_ISO2 } from "../core/theme";
import { ALL_SOURCES } from "../data/sources";
import { dsParseTime } from "./tabs";
import { card } from "../ui/login";
import { ciChol, ciInv, ciLogit, ciNelderMead, ciQuantile, ciRng, ciSimplexProj, ciSynthW, ciVarS, meChi2Pval, meDot, meFPval, meInvNorm, meMV, meMatMul, meNormCdf, mePinv, mePval, meQF, meTPval, meTQuant, meTr, meZeros } from "../ui/settings";

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
  const lab=new Map(); const tval=(v)=>{ const p=typeof dsParseTime==="function"? dsParseTime(v) : null; if (p){ if (!lab.has(p.t)) lab.set(p.t, p.label); return p.t; } return num(v); };
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
  // monthly or quarterly data: count time in periods (months, quarters) so event time, windows and anticipation are in periods, not fractions of a year
  let step=Infinity; for (let i=1;i<times.length;i++){ const d=times[i]-times[i-1]; if (d>1e-9 && d<step) step=d; }
  if (isFinite(step) && step<0.99){ const code=(t)=>Math.round(t/step); const tLab={}; const tt=times.map(t=>{ const c=code(t); tLab[c]=lab.get(t)??String(t); return c; });
    return { ids, times:tt, Y, G:G.map(g=>isFinite(g)? code(g) : g), X, covNames:covs, notes, tLab, unit: step>0.2? "quarter" : "month" }; }
  const tLab={}; times.forEach(t=>{ if (lab.has(t)) tLab[t]=lab.get(t); });
  return { ids, times, Y, G, X, covNames:covs, notes, tLab, unit: step>=0.99? "year" : "period" };
};
const meTL = (P, t) => (P && P.tLab && P.tLab[t]!=null)? P.tLab[t] : t;
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
// Lasso path by covariance-update coordinate descent (Friedman, Hastie & Tibshirani 2010): Gram matrix once, then O(k) per coordinate update
const meLassoPath = (Z, y, lambdas) => { const n=Z.length, k=Z[0].length; const ym=meSeqMean(y); const out=[];
  const G=Array.from({length:k},()=>new Float64Array(k)); const c=new Float64Array(k);
  for (let i=0;i<n;i++){ const z=Z[i], r=y[i]-ym; for (let a=0;a<k;a++){ const za=z[a]; if (za===0) continue; c[a]+=za*r; const Ga=G[a]; for (let b2=a;b2<k;b2++) Ga[b2]+=za*z[b2]; } }
  for (let a=0;a<k;a++){ c[a]/=n; for (let b2=a;b2<k;b2++){ G[a][b2]/=n; G[b2][a]=G[a][b2]; } }
  const b=new Float64Array(k); const q=Float64Array.from(c); // q = c - G b
  for (const lam of lambdas){ for (let it=0; it<2000; it++){ let mx=0;
      for (let j=0;j<k;j++){ const gjj=G[j][j]||1; const z=q[j]+gjj*b[j]; const nb=Math.sign(z)*Math.max(0,Math.abs(z)-lam)/gjj; const d=nb-b[j];
        if (d!==0){ const Gj=G[j]; for (let l=0;l<k;l++) q[l]-=d*Gj[l]; b[j]=nb; if (Math.abs(d)>mx) mx=Math.abs(d); } }
      if (mx<1e-7) break; }
    out.push({ lam, b0: ym, b: Array.from(b) }); }
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
// L1-penalised logistic regression: IRLS outer loop, covariance-update coordinate descent on the weighted least-squares problem
const meLogitLassoFit = (Z, d, lam, init=null) => { const n=Z.length, k=Z[0].length; const pm=meSeqMean(d); let b0=init? init.b0 : Math.log((pm+1e-6)/(1-pm+1e-6)); const b=init? Float64Array.from(init.b) : new Float64Array(k);
  const G=Array.from({length:k},()=>new Float64Array(k)); const a=new Float64Array(k), sv=new Float64Array(k), v=new Float64Array(k);
  for (let outer=0; outer<30; outer++){
    let sw=0, az=0; G.forEach(r=>r.fill(0)); a.fill(0); sv.fill(0);
    for (let i=0;i<n;i++){ const z=Z[i]; let e=b0; for (let j=0;j<k;j++) e+=z[j]*b[j]; const p=1/(1+Math.exp(-e)); const w=Math.max(p*(1-p),1e-5); const zt=e+(d[i]-p)/w;
      sw+=w; az+=w*zt; for (let j=0;j<k;j++){ const wz=w*z[j]; if (wz===0) continue; a[j]+=wz*zt; sv[j]+=wz; const Gj=G[j]; for (let l=j;l<k;l++) Gj[l]+=wz*z[l]; } }
    sw/=n; az/=n; for (let j=0;j<k;j++){ a[j]/=n; sv[j]/=n; for (let l=j;l<k;l++){ G[j][l]/=n; G[l][j]=G[j][l]; } }
    for (let j=0;j<k;j++){ let s=0; for (let l=0;l<k;l++) s+=G[j][l]*b[l]; v[j]=s; } // v = G b
    let mxO=0;
    for (let it=0; it<300; it++){ let mx=0;
      let sb=0; for (let j=0;j<k;j++) sb+=sv[j]*b[j]; const nb0=(az-sb)/sw; mx=Math.max(mx,Math.abs(nb0-b0)); b0=nb0;
      for (let j=0;j<k;j++){ const gjj=G[j][j]||1; const z=a[j]-b0*sv[j]-v[j]+gjj*b[j]; const nb=Math.sign(z)*Math.max(0,Math.abs(z)-lam)/gjj; const dd=nb-b[j];
        if (dd!==0){ const Gj=G[j]; for (let l=0;l<k;l++) v[l]+=dd*Gj[l]; b[j]=nb; if (Math.abs(dd)>mx) mx=Math.abs(dd); } }
      if (mx>mxO) mxO=mx; if (mx<1e-6) break; }
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
  // fast path: no quoted fields (most exported data) → split lines and cells directly
  if (text.indexOf('"')<0){ const first=text.slice(0, text.indexOf("\n")>=0? text.indexOf("\n") : text.length); const d=(first.match(/\t/g)||[]).length>(first.match(/,/g)||[]).length? "\t" : (first.includes(";")&&!first.includes(",")? ";" : ",");
    const lines=text.split(/\r?\n/); const rows=[]; for (let i=0;i<lines.length;i++){ const l=lines[i]; if (!l || !l.trim()) continue; rows.push(l.split(d)); }
    if (rows.length<2) return { error:"The file needs a header row and at least one data row." }; const headers=rows[0].map(h=>h.trim()); return { headers, rows:rows.slice(1).filter(r=>r.length>=headers.length-1) }; }
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

export { Check, ForestPlot, LabField, LabNote, LabSec, LovePlot, ME_LEARNERS, OverlapPlot, ciDemoData, ciEcoNote, ciFmt, ciFmtP, ciFmtVal, ciItemKey, ciParseCSV, ciResolveItem, ciWBVarList, fetchItemPanel, fetchWorldBankPanel, meAI2016, meBJS, meBacon, meCSaggte, meCSattgt, meCohorts, meDML, meDMLDemo, meDagAnalysis, meDagImplications, meDidBalance, meDidDemo, meDidPanel, meDiscover, meFEReg, meHonestRM, meHullCheck, meIPWSandwich, meMICE, meOLS, meOLSRobustness, mePDS, mePO, mePenSynthCV, mePolyExpand, meResult, meRobustnessValue, meRubin, meSDID, meSDIDPlaceboSE, meStationary, meSynthCV, meTL, meTWFE, meUniformCrit, meWald, tdN, tdS, thS, useBoxWidth };
