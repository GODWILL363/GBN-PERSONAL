// impact/tabs.js — split from App.js (code unchanged; only imports and exports were added)
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TRANSFORMS } from "../analysis/stats";
import { dlCSV, useIsMobile } from "../core/fetch";
import { US } from "../core/store";
import { C, COUNTRIES, CURRENT_YEAR, DS_COUNTRY_SET, Ico, REGIONS, YEARS } from "../core/theme";
import { Check, ForestPlot, LabField, LabNote, LabSec, LovePlot, ME_LEARNERS, OverlapPlot, ciDemoData, ciEcoNote, ciFmt, ciFmtP, ciFmtVal, ciItemKey, ciParseCSV, ciResolveItem, ciWBVarList, fetchItemPanel, fetchWorldBankPanel, meBJS, meBacon, meCSaggte, meCSattgt, meCohorts, meDML, meDMLDemo, meDidBalance, meDidDemo, meDidPanel, meHonestRM, meHullCheck, meMICE, meOLS, mePDS, mePO, mePenSynthCV, mePolyExpand, meResult, meRobustnessValue, meRubin, meSDID, meSDIDPlaceboSE, meTL, meTWFE, meUniformCrit, tdN, tdS, thS, useBoxWidth } from "./estimators";
import { btn, card, inp, pill, sel } from "../ui/login";
import { CustomTip, ciBootstrapIPW, ciFillSeries, ciMean, ciPanelFromTable, ciPrepare, ciPval, ciResult, ciRmspe, ciRunAll, ciSynthPValue, ciSynthRun, ciVarS, meTPval, meTQuant } from "../ui/settings";
import { WbMax } from "../workbench/workbench";

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
            <div style={{display:"flex",gap:6,marginBottom:6}}><button type="button" onClick={()=>set("covs",H.filter(h=>h!==cfg.y&&h!==cfg.d))} style={{...pill(false),padding:"4px 8px",fontSize:11}}>All</button><button type="button" onClick={()=>set("covs",[])} style={{...pill(false),padding:"4px 8px",fontSize:11}}>None</button></div>
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
  const [exQ,setExQ]=useState("");
  const yearOpts = isCountry? YEARS : (panel?.years||[]);
  const tl = (y)=> (!isCountry && panel?.tLab && panel.tLab[y]!=null)? panel.tLab[y] : y; const pWord = !isCountry && panel?.period==="month"? "month" : !isCountry && panel?.period==="quarter"? "quarter" : "year";
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
            <button type="button" onClick={()=>{ if(table||imported) set("src","csv"); else document.getElementById("ci-synth-file")?.click(); }} style={{...pill(cfg.src==="csv"),flex:1,padding:"7px 6px"}}>Your panel</button>
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
              {panel&&<div style={{fontSize:11,color:C.dim}}>{panel.units.length} units · {tl(panel.years[0])}–{tl(panel.years[panel.years.length-1])}{panel.period!=="year"? ` · ${panel.period}ly` : ""}</div>}
              {panel?.subAnnual&&<LabNote tone="warn">This table has several rows per unit in the same year (monthly, quarterly or daily data). Synthetic control here works with yearly data, so only one value per year would be kept. Go to Data structure, set Change frequency to Yearly (prices: last value; returns: compound), and send the yearly panel here.</LabNote>}
            </>}
            {!table&&<div style={{fontSize:11,color:C.dim,lineHeight:1.55}}>Long format: columns for unit, year, outcome and optional covariates. Wide format: a year column plus one column per unit. EcoScope's panel download (after a run) is already in long format.</div>}
          </div>}
        </LabSec>
        <LabSec title="2. Design" sub="One unit receives the policy; the rest form the donor pool.">
          {cfg.src==="wb"&&<LabField label="Outcome"><select value={cfg.y} onChange={e=>set("y",e.target.value)} style={sel}>{vars.map(v=><option key={v.code} value={v.code}>{v.name} · {v.src}</option>)}</select></LabField>}
          <LabField label={isCountry?"Treated country":"Treated unit"}><select value={cfg.treated} onChange={e=>set("treated",e.target.value)} style={sel}>{unitList.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></LabField>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            <LabField label="From"><select value={cfg.y0} onChange={e=>set("y0",+e.target.value)} style={{...sel,padding:"8px"}}>{yearOpts.filter(y=>y<cfg.t0).map(y=><option key={y} value={y}>{tl(y)}</option>)}</select></LabField>
            <LabField label={pWord==="year"? "Policy year" : `Policy ${pWord}`}><select value={cfg.t0} onChange={e=>set("t0",+e.target.value)} style={{...sel,padding:"8px"}}>{yearOpts.filter(y=>y>cfg.y0+2&&y<=cfg.y1).map(y=><option key={y} value={y}>{tl(y)}</option>)}</select></LabField>
            <LabField label="To"><select value={cfg.y1} onChange={e=>set("y1",+e.target.value)} style={{...sel,padding:"8px"}}>{yearOpts.filter(y=>y>=cfg.t0&&(!isCountry||y<=CURRENT_YEAR)).map(y=><option key={y} value={y}>{tl(y)}</option>)}</select></LabField>
          </div>
          {isCountry&&<LabField label="Donor pool" hint={`${pool.length} countries`}><select value={cfg.region} onChange={e=>set("region",e.target.value)} style={sel}>{REGIONS.map(r=><option key={r} value={r}>{r==="All"?"All countries":r}</option>)}</select></LabField>}
          <details style={{fontSize:12,color:C.mid,marginBottom:8}}><summary style={{cursor:"pointer",color:C.text}}>Exclude donors ({cfg.exclude.length}) · {pool.length} in pool</summary>
            <div style={{fontSize:11,color:C.dim,margin:"6px 0"}}>Drop units hit by the same or a similar policy, or by large idiosyncratic shocks.</div>
            <input aria-label="Search donors to exclude" value={exQ} onChange={e=>setExQ(e.target.value)} placeholder="Search units" style={{...inp,padding:"6px 10px",fontSize:12,marginBottom:6}}/>
            <div style={{maxHeight:150,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px"}}>{unitList.filter(c=>c.id!==cfg.treated&&(!isCountry||cfg.region==="All"||c.region===cfg.region)&&(!exQ||String(c.name).toLowerCase().includes(exQ.toLowerCase())||cfg.exclude.includes(c.id))).map(c=><Check key={c.id} checked={cfg.exclude.includes(c.id)} onChange={v=>set("exclude", v? [...cfg.exclude,c.id] : cfg.exclude.filter(x=>x!==c.id))} label={c.name}/>)}</div>
          </details>
          <LabField label={pWord==="year"? "Missing years" : "Missing periods"} hint="EcoScope imputation">
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
            {[["Average post-policy gap", fmtY(res.att), `${tl(res.years[res.postIdx[0]])}–${tl(res.years[res.years.length-1])}`],
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
                <XAxis dataKey="year" {...axis} tickFormatter={tl}/><YAxis {...axis} width={72} tickFormatter={fmtY} domain={["auto","auto"]}/>
                <Tooltip content={<CustomTip fmt={yVar?.fmt} lab={tl}/>}/>
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
                  <XAxis dataKey="year" {...axis} tickFormatter={tl}/><YAxis {...axis} width={70} tickFormatter={fmtY}/>
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
                  <XAxis dataKey="year" {...axis} tickFormatter={tl}/><YAxis {...axis} width={70} tickFormatter={fmtY} domain={["auto","auto"]}/>
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
                <XAxis dataKey="year" {...axis} tickFormatter={tl}/><YAxis {...axis} width={72} tickFormatter={fmtY} domain={["auto","auto"]}/>
                <Tooltip content={<CustomTip fmt={yVar?.fmt} lab={tl}/>}/>
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
const EventPlot = ({ series, height=310, label="Event-study estimates by years since treatment", unit="year" }) => {
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
      <text x={(L+W-R)/2} y={H-4} textAnchor="middle" fontSize="10" fill={C.mid}>{unit==="month"? "months" : unit==="quarter"? "quarters" : unit==="period"? "periods" : "years"} relative to treatment (event time)</text>
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
const RolloutGrid = ({ cohorts, times, P }) => (
  <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",fontSize:11}} aria-label="Treatment rollout by cohort and period">
    <thead><tr><th scope="col" style={{...thS,position:"static"}}>Cohort</th><th scope="col" style={{...thS,position:"static",textAlign:"right"}}>Units</th>{times.map(t=><th key={t} scope="col" title={String(meTL(P,t))} style={{...thS,position:"static",padding:"6px 4px",textAlign:"center",fontWeight:500}}>{String(meTL(P,t)).slice(-2)}</th>)}</tr></thead>
    <tbody>{cohorts.map(c=><tr key={c.g}><td style={{...tdS,padding:"4px 8px"}}>{isFinite(c.g)? `First treated ${meTL(P,c.g)}` : "Never treated"}</td><td style={{...tdN,padding:"4px 8px"}}>{c.n}</td>
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
    const g=f(/first.?treat|cohort|treat.?year|adopt|^g$|first_treated|gname/i,[time,unit]); const d=g? "" : (f(/^(treat|treated|treatment|d|did|treat_post|treated_post)$/i,[time,unit]) || f(/^(policy|post)$/i,[time,unit])); // a unit-by-period treatment column first; "post" alone is a period marker
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
  const exportCSV=()=>{ if (!out?.cs) return; dlCSV(out.cs.cells.map(c=>({ cohort:meTL(out.P,c.g), period:meTL(out.P,c.t), event_time:c.e, att:c.att, se:c.se, post:c.post, base_period:c.base??"" })), "ecoscope_att_gt.csv");
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
          <LabSec title="Treatment rollout" sub={`${out.P.ids.length.toLocaleString()} units · ${out.times.length} ${out.P.unit==='month'? 'months' : out.P.unit==='quarter'? 'quarters' : 'periods'} (${meTL(out.P,out.times[0])}–${meTL(out.P,out.times[out.times.length-1])}) · ${out.nNever} never treated · ${out.cohorts.filter(c=>isFinite(c.g)).length} cohort(s)`}>
            <RolloutGrid cohorts={out.cohorts} times={out.times} P={out.P}/>
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
          {evSeries.length>0&&<LabSec title="Event study" sub={`Effects by ${out.P.unit==="month"? "months" : out.P.unit==="quarter"? "quarters" : "years"} since adoption. Bars: 95% pointwise intervals; shaded: 95% simultaneous band for Callaway–Sant'Anna (multiplier bootstrap). Reference period e = −1.`}>
            <EventPlot series={evSeries} unit={out.P.unit}/>
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
              <tbody>{out.cs.cells.map((c,i)=><tr key={i} style={{opacity:c.post?1:0.75}}><td style={tdS}>{meTL(out.P,c.g)}</td><td style={tdS}>{meTL(out.P,c.t)}</td><td style={tdS}>{c.e}</td><td style={tdN}>{c.ref? "0 (ref.)" : fmt(c.att)}</td><td style={tdN}>{fmt(c.se)}</td><td style={tdN}>{c.base??"—"}</td><td style={tdN}>{c.n1||"—"}</td></tr>)}</tbody></table></div>
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
const _dsTC = new Map(); const dsParseTimeC = (v) => { const k = String(v ?? ""); let r = _dsTC.get(k); if (r === undefined) { if (_dsTC.size > 300000) _dsTC.clear(); r = dsParseTime(k); _dsTC.set(k, r); } return r; };
const dsNum = (v) => { const s = String(v ?? "").trim(); if (!s || /^(na|n\/a|nan|null|\.|-|\.\.)$/i.test(s)) return null; const n = parseFloat(s.replace(/[$,%\s]/g, "")); return isFinite(n) && /^[-+]?[$]?\d|^[-+]?\.\d/.test(s.replace(/\s/g, "")) ? n : null; };
const DS_TIME_HINT = /^(year|yr|date|time|period|quarter|month|day|t)$|year|date|period|quarter|month/i;
const DS_UNIT_HINT = /country|state|province|region|district|unit|^id$|_id$|^iso|code|name|firm|company|household|person|respondent|school|county|city|entity|economy/i;
const DS_VAR_HINT = /^(variable|indicator|series|measure|var|item|series name|indicator name)$|indicator|series name|variable/i;
const DS_VAL_HINT = /^(value|val|obs|observation|amount)$/i;
// Profile each column
const dsProfile = (headers, rows) => headers.map((h, j) => {
  const vals = []; const uniq = new Set(); for (let i = 0; i < rows.length; i++) { const v = rows[i][j]; if (v == null) continue; const t = typeof v === "string" ? v.trim() : String(v); if (t === "") continue; vals.push(v); uniq.add(t); }
  const n = vals.length || 1;
  // shares are estimated on an even sample for large files (exact for up to 20,000 values)
  const smp = vals.length > 20000 ? vals.filter((_, i) => i % Math.ceil(vals.length / 20000) === 0) : vals; const sn = smp.length || 1;
  const nNum = smp.filter(v => dsNum(v) != null).length * n / sn; const tm0 = smp.map(dsParseTimeC).filter(Boolean); const tm = { length: tm0.length * n / sn, forEach: (f) => tm0.forEach(f) };
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
const dsToTidy = (headers, rows, spec, col = null) => {
  const ix = Object.fromEntries(headers.map((h, i) => [h, i])); let out = []; const tLab = {};
  // optional change of frequency (daily → month/quarter/year, monthly → quarter/year): periods are mapped to buckets and values aggregated per variable
  const bucketOf = (p) => { if (!col || !col.freq || col.freq === "keep") return null; let y, m;
    if (p.freq === "daily") { const d = new Date(Math.round(p.t * 864e5)); y = d.getFullYear(); m = d.getMonth() + 1; } else if (p.freq === "monthly") { y = Math.floor(p.t + 1e-9); m = Math.round((p.t - y) * 12) + 1; } else if (p.freq === "quarterly") { y = Math.floor(p.t + 1e-9); m = Math.round((p.t - y) * 4) * 3 + 1; } else return null;
    if (col.freq === "month") return { t: y + (m - 1) / 12, label: `${y}-${String(m).padStart(2, "0")}` }; if (col.freq === "quarter") { const q = Math.ceil(m / 3); return { t: y + (q - 1) / 4, label: `${y}-Q${q}` }; } return { t: y, label: String(y) }; };
  const T = (raw) => { const p = dsParseTimeC(raw); if (p) { const b = bucketOf(p); if (b) { tLab[b.t] = b.label; return b.t; } tLab[p.t] = p.label; return p.t; } const s = String(raw ?? "").trim(); return s ? s : null; };
  const rawT = col && col.freq && col.freq !== "keep" ? (raw) => { const p = dsParseTimeC(raw); return p ? p.t : null; } : null;
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
    if (rawT && spec.timeCol) { // aggregate while reading: one record per unit, period bucket and variable
      const cells = new Map(); const vj = vcols.map(c => ix[c]); const tj = ix[spec.timeCol];
      rows.forEach((r, i) => { const u = spec.unitCol ? unitOf(r) : (spec.rowUnits ? `row ${i + 1}` : (spec.singleUnit || "All")); const raw = r[tj]; const t = T(raw); if (!u || t == null) return; const t0 = rawT(raw);
        vcols.forEach((c, q) => { const k = `${u}\u0001${t}\u0001${q}`; let a = cells.get(k); if (!a) { a = { u, t, q, s: 0, n: 0, p: 1, fT: Infinity, f: null, lT: -Infinity, l: null, mn: Infinity, mx: -Infinity, str: null, any: false }; cells.set(k, a); }
          const x = val(r[vj[q]]); if (x == null) return; a.any = true; if (typeof x !== "number") { if (a.str == null) a.str = x; return; }
          a.s += x; a.n++; a.p *= (1 + x); if (t0 < a.fT) { a.fT = t0; a.f = x; } if (t0 >= a.lT) { a.lT = t0; a.l = x; } if (x < a.mn) a.mn = x; if (x > a.mx) a.mx = x; }); });
      cells.forEach(a => { const how = (col.how && col.how[vcols[a.q]]) || "mean"; let v = null;
        if (a.n) v = how === "sum" ? a.s : how === "last" ? a.l : how === "first" ? a.f : how === "min" ? a.mn : how === "max" ? a.mx : how === "compound" ? a.p - 1 : a.s / a.n; else if (a.str != null) v = a.str;
        out.push({ unit: a.u, t: a.t, v: vcols[a.q], val: v }); });
      Object.keys(tLab).forEach(k => tLab[k] = tLab[k]); return dsSummarize(out, tLab); }
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
  const uI = new Map(), tI = new Map(), vI = new Map(); recs.forEach(r => { if (!uI.has(r.unit)) uI.set(r.unit, uI.size); if (!tI.has(r.t)) tI.set(r.t, tI.size); if (!vI.has(r.v)) vI.set(r.v, vI.size); });
  const units = [...uI.keys()]; const times = [...tI.keys()].sort((a, b) => (typeof a === "number" && typeof b === "number") ? a - b : String(a).localeCompare(String(b))); const vars = [...vI.keys()];
  const nT = tI.size + 1, nV = vI.size + 1; const keyCount = new Map(); const present = new Set(); const perUnit = new Map(); let missing = 0;
  recs.forEach(r => { const ui = uI.get(r.unit), ti = tI.get(r.t); const k = (ui * nT + ti) * nV + vI.get(r.v); keyCount.set(k, (keyCount.get(k) || 0) + 1);
    if (r.val != null) { present.add(ui * nT + ti); let su = perUnit.get(ui); if (!su) { su = new Set(); perUnit.set(ui, su); } su.add(ti); } else missing++; });
  let dups = 0; keyCount.forEach(c => { if (c > 1) dups++; });
  const balanced = units.every((u, i) => (perUnit.get(i)?.size || 0) === times.length);
  return { recs, units, times, vars, tLab, dups, balanced, missing, cells: present.size };
};
const dsTypeOf = (td) => td.units.length > 1 && td.times.length > 1 ? "panel" : td.units.length > 1 ? "cross" : "timeseries";
const DS_TYPES = { cross: "Cross-section", timeseries: "Time series", panel: "Panel", pooled: "Pooled cross-sections" };
// Aggregate duplicates and produce the target table {headers, rows}
const dsReshape = (td, target, o = {}) => {
  const agg = o.agg || "mean"; const tl = (t) => td.tLab[t] ?? String(t);
  // cell map unit|t|v -> value
  const uI = new Map(td.units.map((u, i) => [u, i])), tI = new Map(td.times.map((t, i) => [t, i])), vI = new Map(td.vars.map((v, i) => [v, i])); const nT = td.times.length + 1, nV = td.vars.length + 1;
  const kOf = (u, t, v) => (uI.get(u) * nT + tI.get(t)) * nV + vI.get(v); const onlyU = o.units ? new Set(o.units) : null;
  const acc = new Map(); td.recs.forEach(r => { if (onlyU && !onlyU.has(r.unit)) return; const k = kOf(r.unit, r.t, r.v); let a = acc.get(k); if (!a) { a = { s: 0, n: 0, first: undefined, str: null }; acc.set(k, a); }
    if (r.val == null) return; if (typeof r.val === "number") { a.s += r.val; a.n++; if (a.first === undefined) a.first = r.val; } else if (a.str == null) a.str = r.val; });
  const get = (u, t, v) => { const a = acc.get(kOf(u, t, v)); if (!a) return ""; if (a.n) return agg === "sum" ? a.s : agg === "first" ? a.first : a.s / a.n; return a.str ?? ""; };
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
function DataStructureTab({ isMobile, imported, basket = [], eco, years, defaultCountry, onSend, onChart, onSave }) {
  const [src, setSrc] = useState(imported ? "import" : "eco"); const [table, setTable] = useState(null); const [fileErr, setFileErr] = useState("");
  const [det, setDet] = useState(null); const [spec, setSpec] = useState(null); const [manual, setManual] = useState(false);
  const [tidy, setTidy] = useState(null); const [target, setTarget] = useState("panelLong"); const [opt, setOpt] = useState({ agg: "mean", balancedOnly: false, dropEmpty: true, variable: "", unit: "__avg__", tFrom: null, tTo: null });
  const ecoItems = useMemo(() => basket.map(it => ({ key: ciItemKey(it), name: it.label, item: it, ...ciResolveItem(it) })), [basket]);
  const [eSel, setESel] = useState({ countries: defaultCountry ? [defaultCountry] : ["GH"], region: "All", y0: years?.[0] ?? 2000, y1: Math.min(years?.[1] ?? CURRENT_YEAR, CURRENT_YEAR - 1), applyEco: true, items: ecoItems.filter(x => x.route !== "none").map(x => x.key) });
  const [busy, setBusy] = useState("");
  const setO = (k, v) => setOpt(o => ({ ...o, [k]: v }));
  // change of frequency: {freq: keep|month|quarter|year, how: {variable: mean|last|first|sum|compound|min|max}}
  const [col, setCol] = useState({ freq: "keep", how: {} }); const [saved, setSaved] = useState("");
  const dsDefaultHow = (h) => /(^|_)(ret|rets|return|returns|r)$|return/i.test(h) ? "compound" : /price|close|^px|index|level|stock|balance|debt/i.test(h) ? "last" : "mean";
  const loadTable = (parsed, name) => { if (parsed.error) { setFileErr(parsed.error); return; } setFileErr(""); setBusy(`Analysing ${parsed.rows.length.toLocaleString()} rows…`);
    setTimeout(() => { try { const d = dsDetect(parsed.headers, parsed.rows); const vcols = parsed.headers.filter(h => h !== d.unitCol && h !== d.timeCol);
      setCol({ freq: d.freq === "daily" && parsed.rows.length > 200000 ? "month" : "keep", how: Object.fromEntries(vcols.map(h => [h, dsDefaultHow(h)])) });
      setTable({ ...parsed, name }); setDet(d); setSpec(d); setManual(false); } catch (e) { setFileErr(`Could not analyse this table. ${e.message}`); } setBusy(""); }, 30); };
  const onFile = (f) => { if (!f) return; setBusy("Reading the file…"); const r = new FileReader(); r.onload = () => loadTable(ciParseCSV(String(r.result)), f.name); r.readAsText(f); };
  // rebuild tidy data whenever the table, spec or frequency changes (deferred so the "working" note can show)
  useEffect(() => { if (src === "eco" || !table || !spec) return; setBusy("Arranging the data…"); const id = setTimeout(() => { try { setTidy(dsToTidy(table.headers, table.rows, spec, spec.layout === "long" && spec.timeCol ? col : null)); } catch (e) { console.error(e); setTidy(null); } setBusy(""); }, 30); return () => clearTimeout(id); }, [table, spec, src, col]);
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
  useEffect(() => { setSaved(""); }, [result]);
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
          {src !== "eco" && spec?.layout === "long" && spec?.timeCol && ["daily", "monthly", "quarterly"].includes(det?.freq) && <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
            <LabField label="Change frequency" hint={`data are ${det.freq}`}><select aria-label="Change frequency" value={col.freq} onChange={e => setCol(c => ({ ...c, freq: e.target.value }))} style={sel}>
              <option value="keep">Keep {det.freq}{table && table.rows.length > 200000 ? " (slow for a file this large)" : ""}</option>
              {det.freq === "daily" && <option value="month">Monthly</option>}{det.freq !== "quarterly" && <option value="quarter">Quarterly</option>}<option value="year">Yearly</option></select></LabField>
            {col.freq !== "keep" && <div style={{ display: "grid", gap: 6 }}>{Object.keys(col.how).map(v => <label key={v} style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 6, alignItems: "center", fontSize: 12, color: C.text }}>{v}
              <select aria-label={`Combine ${v}`} value={col.how[v]} onChange={e => setCol(c => ({ ...c, how: { ...c.how, [v]: e.target.value } }))} style={{ ...sel, padding: "5px 8px", fontSize: 12 }}>
                <option value="mean">Average</option><option value="last">Last value (end of period)</option><option value="first">First value</option><option value="sum">Sum</option><option value="compound">Compound returns (1+r)</option><option value="min">Minimum</option><option value="max">Maximum</option></select></label>)}
              <div style={{ fontSize: 11, color: C.mid, lineHeight: 1.5 }}>Prices and index levels: last value. Returns stored as decimals (0.01 = 1%): compound. Flows such as sales: sum. Rates and averages: average.</div></div>}
          </div>}
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
            {result && <WbMax label={`Preview: ${DS_TARGETS[target].label}`}>{(big) => <div style={{ overflow: "auto", maxHeight: big ? "calc(100vh - 80px)" : 380, border: `1px solid ${C.border}`, borderRadius: 6 }}>
              <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
                <thead><tr>{result.headers.map(h => <th key={h} scope="col" style={{ ...thS, textAlign: "left" }}>{h}</th>)}</tr></thead>
                <tbody>{(big ? result.rows.slice(0, 3000) : rowsShown).map((r, i) => <tr key={i}>{r.map((x, j) => { const idCol = ["unit", "time"].includes(result.headers[j]); const isNum = !idCol && dsNum(x) != null;
                  return <td key={j} style={isNum ? tdN : tdS}>{x === "" ? <span style={{ color: C.dim }}>·</span> : isNum ? ciFmt(+x, Math.abs(+x) >= 1000 ? 0 : 2) : x}</td>; })}</tr>)}</tbody>
              </table>
            </div>}</WbMax>}
          </LabSec>
          {result && <LabSec title="Use this data" sub="Send the structured table straight into an analysis.">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => send("match")} disabled={!["cross", "panelLong", "tidyLong"].includes(target) || target === "tidyLong"} style={{ ...btn(), padding: "9px 14px", fontSize: 12, opacity: ["cross", "panelLong"].includes(target) ? 1 : 0.5 }}>Use in Matching</button>
              <button type="button" onClick={() => send("synth")} disabled={!["panelLong", "wideUnit"].includes(target)} style={{ ...btn(), padding: "9px 14px", fontSize: 12, opacity: ["panelLong", "wideUnit"].includes(target) ? 1 : 0.5 }}>Use in Synthetic control</button>
              <button type="button" onClick={() => send("did")} disabled={target !== "panelLong"} style={{ ...btn(), padding: "9px 14px", fontSize: 12, opacity: target === "panelLong" ? 1 : 0.5 }}>Use in DiD</button>
              <button type="button" onClick={() => send("hd")} disabled={target !== "cross"} style={{ ...btn(), padding: "9px 14px", fontSize: 12, opacity: target === "cross" ? 1 : 0.5 }}>Use in DML</button>
              {onChart && <button type="button" onClick={() => onChart({ headers: result.headers, rows: result.rows }, `${outName}.csv`)} disabled={!["series", "wideUnit"].includes(target)} style={{ ...pill(false), padding: "9px 14px", opacity: ["series", "wideUnit"].includes(target) ? 1 : 0.5 }}>Chart in EcoScope</button>}
              {onSave && <button type="button" onClick={() => { onSave({ headers: result.headers, rows: result.rows }, `${outName.replace(/_[A-Za-z]+$/, "")} (${DS_TARGETS[target].label.toLowerCase()}${col.freq !== "keep" && table ? `, ${col.freq === "month" ? "monthly" : col.freq === "quarter" ? "quarterly" : "yearly"}` : ""})`); setSaved("Saved to Data Workbench → Datasets. Add columns there with Formulas, then use Open in Impact Lab."); }} style={{ ...pill(false), padding: "9px 14px" }}>Save to Data Workbench</button>}
            </div>
            {saved && <div style={{ marginTop: 8 }}><LabNote>{saved}</LabNote></div>}
            <div style={{ fontSize: 11, color: C.dim, marginTop: 8, lineHeight: 1.55 }}>Matching and DML take a cross-section (one row per unit). DiD takes a long panel; add a first-treated-period or 0/1 treatment column to it. Synthetic control takes a long panel or a wide-by-unit table. Charting takes a time series or a wide-by-unit table.</div>
          </LabSec>}
        </>}
      </div>
    </div>
  );
}
function ImpactLab({ onClose, defaultCountry, defaultVar, imported, basket=[], eco, years, onChart, onSave }) {
  const isMobile=useIsMobile(); const [tab,setTab]=useState("data"); const [incoming,setIncoming]=useState(null); const [full,setFull]=useState(false);
  const handOff=(where, table, name)=>{ setIncoming({ where, table, name, id:Date.now() }); setTab(where); document.getElementById("impact-scroll")?.scrollTo({top:0}); };
  useEffect(()=>{ const k=(e)=>{ if(e.key==="Escape") onClose(); }; window.addEventListener("keydown",k); return ()=>window.removeEventListener("keydown",k); },[onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="impact-title" style={{position:"fixed",inset:0,background:C.overlay,zIndex:400,display:"flex",alignItems:"stretch",justifyContent:"center",padding:isMobile||full?0:20}}>
      <div style={{background:C.bg,border:`1px solid ${C.borderHi}`,borderRadius:isMobile||full?0:10,width:"100%",maxWidth:full?"none":1320,display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:C.shadow}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:isMobile?"12px 14px":"14px 20px",borderBottom:`1px solid ${C.border}`,background:C.surface,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:30,height:30,borderRadius:6,background:C.gold,color:C.onGold,display:"flex",alignItems:"center",justifyContent:"center"}}><Ico n="compare"/></div>
            <div><h2 id="impact-title" style={{fontSize:16,margin:0,color:C.text}}>Policy Impact Lab</h2><div style={{fontSize:11,color:C.mid}}>Matching, difference-in-differences, synthetic control and double machine learning</div></div>
          </div>
          <div role="tablist" aria-label="Impact Lab sections" style={{display:"flex",gap:6,order:isMobile?3:0,width:isMobile?"100%":"auto",overflowX:"auto",flexWrap:isMobile?"nowrap":"wrap",paddingBottom:isMobile?2:0}}>
            {[["data","Data structure"],["match","Matching"],["did","DiD & event study"],["synth","Synthetic control"],["hd","Many controls (DML)"],["guide","Methods guide"]].map(([k,l])=><button key={k} role="tab" aria-selected={tab===k} type="button" onClick={()=>setTab(k)} style={{...pill(tab===k),padding:"7px 12px",flex:"none",whiteSpace:"nowrap"}}>{l}</button>)}
          </div>
          {!isMobile && <button type="button" onClick={()=>setFull(f=>!f)} aria-pressed={full} title={full? "Back to a window" : "Use the whole screen"} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,color:C.mid,cursor:"pointer",padding:"6px 10px",fontSize:12.5,marginLeft:"auto"}}>{full? "⤡ Window" : "⤢ Full screen"}</button>}
          <button type="button" onClick={onClose} aria-label="Close Policy Impact Lab" style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,color:C.mid,cursor:"pointer",padding:"6px 10px",fontSize:13}}>✕</button>
        </div>
        <div id="impact-scroll" style={{flex:1,overflowY:"auto",padding:isMobile?12:20}}>
          <div style={{display:tab==="data"?"block":"none"}}><DataStructureTab isMobile={isMobile} imported={imported} basket={basket} eco={eco} years={years} defaultCountry={defaultCountry} onSend={handOff} onChart={onChart? (t,n)=>{ onChart(t,n); onClose(); } : null} onSave={onSave}/></div>
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
  { q: "How do I get a table out of a PDF?", k: "pdf table extract import page scanned ocr report document", a: "Open Data Workbench (sidebar, under Import Your Data) → Tables from PDF and choose the file. EcoScope lists the pages that contain tables; click a highlighted table or drag a box around one. Check the cells, press Clean numbers, then Save as dataset. For scanned pages press Read with OCR and check the numbers carefully." },
  { q: "How do I write formulas on my data?", k: "formula calculate new column compute expression variable create generate lag growth excel function", a: "Data Workbench → Formulas (EcoScript). Pick a dataset and write one EcoScript formula per line: new_column = formula, for example gdp_pc = gdp / population or band = if(growth < 0, \"falling\", \"rising\"). The formula works on every row, so you write column names, not cells like A2. Put names with spaces in square brackets. There are 158 functions with plain-English names in 10 groups (maths and rounding, across columns, whole-column statistics, conditional totals, logic, text, dates, lookup, over time, finance); search the list on the right and click one to insert it. Excel names such as AVERAGE, SUMIF, XLOOKUP, IFERROR and TEXT also work. Set Group by to the country column and Time to the year column so over-time functions work within each country. Run, then add the columns to the dataset." },
  { q: "How do I turn interviews or open answers into numbers?", k: "qualitative coding code text interview transcript open ended themes kappa nvivo", a: "Data Workbench → Text coding. Add documents (files, pasted text or a text column), create codes with optional keywords, code each segment, and save the result as a dataset with counts, shares and 0/1 columns per document. A second coder can code the same text to get Cohen's kappa." },
  { q: "How do projects and history work?", k: "project save progress history restore undo revert checkpoint workspace", a: "Your work saves to the current project a few seconds after each change. Click the briefcase button at the top to create, open, duplicate, export or import projects. The History tab lists every change; Restore takes you back to that point, and Save checkpoint names an important moment." },
  { q: "Can I add several datasets or Excel files at once?", k: "several multiple datasets files upload import excel xlsx sheets workbook drag drop many", a: "Yes. Open Data Workbench → Datasets and click Upload files (hold Ctrl or Shift to pick several) or drag the files onto the drop box. CSV, TSV and Excel files (.xlsx, .xls, .ods) are accepted; each Excel sheet with data becomes its own dataset. You can then merge or append them in Merge & append." },
  { q: "How do I delete a project?", k: "delete remove project projects workspace erase", a: "Click the briefcase button at the top, find the project under My projects and press Delete. You can delete the project that is open too: EcoScope then opens your next project, or a new empty workspace if it was the last one. Deleting removes its history and cannot be undone, so use Export first if you may need it." },
  { q: "Can I read tables from several PDFs at once?", k: "several multiple pdf pdfs files tables at once batch", a: "Yes. Data Workbench → Tables from PDF → Choose PDFs, and pick several files (hold Ctrl or Shift), or drag them in. Pages are grouped by file; click a page, use a table and save it. Add more PDFs later, or close one with the ✕ next to its name." },
  { q: "Why does my formula not work (name with brackets, average of several columns)?", k: "formula error not work name brackets symbols backticks mean average across columns rowmean rowsum row index unknown function cell A2 range", a: "Common causes. 1) Every line needs a new column name, then =, then the formula: index_2dp = round_to([TBL_Index (2024-13)], 2). Names with brackets, dashes or spaces can be typed as they are, or in [ ], backticks or quotes. 2) To average several columns in each row, use average_across(col4, col6, col8) (or AVERAGE with several columns); column_average(x) gives one average for the whole column. 3) Cells and ranges like A2 or A2:A10 do not exist here: write the column name. 4) Text needs quotes: region == \"West\". 5) For an unknown function, the message suggests the closest name; search the list on the right. Each red line says what to fix." },
  { q: "How do I get the trend (slope) of each row when years are across the columns?", k: "slope trend row across columns years wide regression line per row change per year r squared", a: "Use slope_across with the year columns in order, for example trend = slope_across(col2, col4, col6, col8, col10, col12). It fits a straight line through each row and gives the change per column; with one column per year that is the change per year (the same as Excel SLOPE against the years). Blanks are skipped. r_squared_across(...) shows how well the line fits (0 to 1). If the first row holds the years themselves, remove it with: drop rows where row_number() == 1. To use the actual years in a fixed row of the table (like Excel SLOPE with $ on the year row), use slope_against_row(1, col3, col5, …, col25), where 1 is the row that holds the years; r_squared_against_row works the same way." },
  { q: "How do I rename columns or variables?", k: "rename column variable name change relabel header several many at once ecoscript", a: "Click a column name in Data Workbench → Datasets to rename one. To rename many at once, write in Formulas (EcoScript): rename LTA(2013-24) to LTA, STA(2024-21) to STA, MTA(2024-19) to MTA. Columns keep their place. * matches any text, so rename y* to score_* turns y2013 into score_2013. You can mix rename lines with formulas that create new variables in the same script, then press Save changes to this dataset." },
  { q: "How do I make the first row the column names?", k: "header first row column names col1 col2 col3 variable names rename promote titles years as names", a: "In Data Workbench → Datasets, press Row → column names, check that row 1 is chosen, and press Use as column names: the values in that row become the column names and the row is removed (Undo reverses it). Names that are numbers, like 2013, must be written in brackets in EcoScript, [2013]; tick Put a letter before names that are numbers to get y2013 instead. In EcoScript you can also write: use row 1 as column names (or ... with prefix y). After that, slope_against_names([2013], [2014], …) gives each row's trend using the years in the names." },
  { q: "Can I keep a value, row or column fixed (like $ in Excel)?", k: "fixed constant absolute reference dollar anchor lock keep value row column cell base year", a: "Yes. Column names are always fixed, so no $ is needed. A value: rate = 0.05, then gdp * (1 + rate). One cell: value_at_row(gdp, 1). One labelled row: look_up(\"Ghana\", country, gdp). A base year: base = average_if(gdp, year == 2015). A fixed row of years for a trend: slope_against_row(1, col3, col5, …). With Group by (unit) set, column functions such as average_if give one fixed value per unit; choose None for one value for the whole table. Remove a helper column at the end with drop columns rate." },
  { q: "Can I save, undo or get back an earlier EcoScript script?", k: "save script undo redo history restore previous version line numbers formulas lost back", a: "Yes. In Formulas (EcoScript): Undo and Redo (or Ctrl+Z and Ctrl+Y) step through your edits. Type a name next to Save script and press it (or Ctrl+S) to keep the script; Saved scripts lists them with Load, Add below and delete, and they work on any dataset. History lists every script you ran (last 100) with the time, dataset and whether it had errors; Restore puts it back in the box, and Undo reverses a restore. Line numbers sit on the left: after a run, red numbers mark lines with errors; click a number or a red message to jump to that line. Scripts and history are saved with the project." },
  { q: "Can I use Stata commands in EcoScript?", k: "stata regress reg summarize tabulate do file to_reg to_sum econometrics regression robust cluster fixed effects logit probit ivreg ttest anova", a: "Yes. Every common Stata command has an EcoScript twin starting with to_ and the same syntax: to_reg y x1 x2, robust (regress), to_sum (summarize), to_tab (tabulate), to_corr, to_xtset id year then to_xtreg y x, fe, to_reghdfe y x, absorb(country year), to_logit, to_probit, to_ivreg y (x = z), to_ttest, to_anova, to_predict, to_test, to_esttab, to_gen, to_replace, to_egen, to_collapse, to_reshape and more. Type to_help in Formulas to see all 50. Results open in the Results tab below the script." },
  { q: "How do I get graphs from EcoScript, in 2D or 3D?", k: "graph chart scatter histogram bar line box 3d 2d interactive to_scatter to_bar plot", a: "Write a graph command such as to_scatter y x, to_line gdp year, over(country), to_bar y, over(region) by(year), to_hist x or to_heatmap y, over(a b) and press Run script. The chart opens in the Results tab with a 2D / 3D switch, hover values and Maximize. A scatter with three variables (to_scatter y x1 x2) is 3D." },
  { q: "Can I type formulas in table cells like Excel?", k: "cell formula excel equals = fill down formula bar fx calculate cell value A1 B2 reference range sum select highlight drag fill handle copy paste series", a: "Yes. In Workbench → Datasets the table works like Excel. Click a cell to select it, drag or Shift+arrows to select a range, and click a column letter or row number to select a whole column or row. Double-click or just type to edit. A formula starts with = and can use column names (=gdp / pop * 100) or cells (=B2*C2, =SUM(B2:B10), =$B$1*2). Drag the small square at the corner of the selection to fill down, up or sideways: numbers and dates continue as a series (hold Ctrl to copy), formulas shift their references. Ctrl+C and Ctrl+V copy and paste (also from Excel), Ctrl+D fills down, Delete clears. Errors show as #DIV/0!, #REF!, #N/A and the like; #CIRC! means a formula uses its own result." },
  { q: "How do I keep a cell reference fixed when I drag a formula (absolute vs relative)?", k: "absolute relative reference dollar $ F4 fixed lock anchor drag fill copy formula excel indirect row column address", a: "Like Excel. While editing a formula, put the cursor on a reference and press F4: A1 → $A$1 → A$1 → $A1. The part with $ stays fixed when you drag the fill handle; the rest moves with each cell it reaches. The Fill menu in the formula bar switches dragging between relative (Excel's way), absolute (the same formula in every cell) and values only. ROW(), COLUMN(), ADDRESS() and INDIRECT(\"B2\") also work; INDIRECT never shifts." },
  { q: "What is the Data Vault?", k: "data vault curated premium datasets subscription published source documents citation micro macro qualitative quantitative primary secondary", a: "The Data Vault (◆ under Data Level in the sidebar) holds datasets prepared and checked by the EcoScope team, with their source, how to cite them and the supporting documents (reports, questionnaires, original tables) so you can check the data. Pick a category, open a dataset, then view it, open it in the Workbench or download it if allowed. What you see depends on your plan; if the button is missing, nothing is published for your plan yet." },
  { q: "How do I export results to Word, Excel, PDF or LaTeX?", k: "export download save word docx excel xlsx pdf latex tex overleaf table chart png svg esttab report", a: "In Formulas (EcoScript) → Results: each table has Export… (LaTeX copy or .tex, Excel, Word, PDF), each chart has Export chart… (PNG, SVG, Word, PDF), and Export all results… at the top saves everything in one Word file, a PDF, an Excel file (one sheet per result) or a LaTeX .zip ready for Overleaf. In a script, to_esttab m1 m2, latex prints a booktabs table you can copy." },
  { q: "Can EcoScript bootstrap standard errors?", k: "bootstrap standard errors replications reps seed cluster resample two stage 2sls control function", a: "Yes: to_bootstrap, reps(200) seed(1) cluster(county): to_reg dlearn z1 i.year ; to_predict dhat ; to_reg dlafdc dhat i.year. Commands after the colon are separated by ; and the last model's coefficients are bootstrapped. cluster() resamples whole units so panel lags stay correct. A counter shows progress and Stop works." },
  { q: "How do I stop a script that is running?", k: "stop terminate quit cancel abort running script ecoscript long slow escape", a: "Press the red Stop button next to Run script, or Esc inside the script box. EcoScope finishes the line it is on and stops; the Results show what ran before that. Nothing is saved to the dataset until you press Save." },
  { q: "How do I change my email or delete my account?", k: "account delete remove close account update email name profile organisation", a: "Settings → Account. Change display name, email, country, organisation or job title and press Update account. To delete the account, go to the bottom of Account, enter your password, type DELETE and confirm. Everything you own is removed and cannot be recovered, so download any datasets you need first." },
  { q: "Which technical indicators can I calculate?", k: "rsi macd ema bollinger atr stochastic obv volatility returns drawdown stock price technical analysis", a: "In Formulas: ema(close, 20), rsi(close, 14), macd(close), macd_signal(close), bollinger_upper(close, 20, 2), rolling_sd(returns, 20), log_return(close), drawdown(close), true_range(high, low, close), atr(high, low, close, 14), stochastic_k(high, low, close, 14) and on_balance_volume(close, volume). They follow TA-Lib definitions and work within each unit (ticker) in time order." },
  { q: "Can I drop columns or rows with EcoScript?", k: "drop delete remove keep columns rows where filter subset formula ecoscript command", a: "Yes. In Formulas (EcoScript), mix these commands with your formulas, one per line: drop columns a, b, [TBL_Index (2024-13)] · keep columns country, year, gdp · drop rows where year < 2010 or is_blank(gdp) · keep rows where region == \"West Africa\". They run in order, so later lines see the smaller table, and each line reports what it did (for example dropped 48 of 200 rows). Nothing changes in the dataset until you press Save changes to this dataset, or Save as a new dataset to keep the original. Rows whose condition cannot be checked because of blanks are kept by drop rows and dropped by keep rows." },
  { q: "Which language do formulas use? Can I use Excel functions?", k: "language ecoscript script excel functions sumif vlookup xlookup iferror text concatenate plain english names own function", a: "Formulas are written in EcoScript, EcoScope's own simple formula language with plain-English names, such as average_across, total_if, look_up, days_between, join_text and loan_payment. Most Excel names also work with the same arguments: SUM, AVERAGE, IF, IFS, IFERROR, AND, OR, SUMIF(S), COUNTIF(S), AVERAGEIF(S), XLOOKUP, MATCH, INDEX, LEFT, RIGHT, MID, TEXT, DATE, EOMONTH, DATEDIF, PMT, FV, PV, NPV, IRR and more. VLOOKUP is replaced by look_up (same table) or look_up_from (another dataset). Join text with &. You cannot define new named functions yet, but you can build any calculation in steps, one line per step." },
  { q: "How do I make the table or window bigger (full screen)?", k: "maximize maximise full screen bigger enlarge expand table view window workbench impact lab", a: "Press ⤢ Full screen at the top right of Data Workbench or Policy Impact Lab to use the whole browser window (⤡ Window goes back). To see one table on the whole screen, press ⤢ Maximize above it: the dataset editor, the Formulas result, merge and PDF previews and the Impact Lab data preview all have it. Editing tools keep working. Esc or ✕ Exit full screen returns. For even more room, also press F11 for the browser's own full screen." },
  { q: "How do I edit a dataset (delete rows or columns, change cells)?", k: "edit dataset table delete row column remove rename cell change value sort move add insert undo duplicates blank clean", a: "Open Data Workbench → Datasets and pick a dataset. Click any cell or column name to change it (Enter saves, Esc cancels, Tab moves right). Use ✕ beside a row number or in a column header to delete it, + beside a row to insert one below, ↑ ↓ to sort and ◀ ▶ to move a column. Tick several rows or columns, then Delete or Keep only these. + Row and + Column add new ones. Delete rows where… removes rows by a rule (for example year is less than 2010, or price is blank). Remove duplicate rows and Remove rows with blanks clean the table in one click. Search finds rows, and Undo / Redo reverse changes. Everything saves with the project." },
  { q: "How do I build a dashboard?", k: "dashboard dashboards chart charts summary heatmap pie bar pyramid histogram box violin treemap sankey kpi gauge correlation calendar visual", a: "Press Dashboards (next to Workbench above the chart, or in the account menu). Data summary lists every table you have worked on: the current chart, an imported file and each Workbench dataset, with rows, columns, date range, missing values and a profile of every variable (mean, spread, min, median, max, shape). Press Build a dashboard on a table for a starter set of charts, or + Add chart. In Chart settings choose the data, one of 38 chart types (column, bar, stacked, lollipop, dumbbell, waterfall, radar, population pyramid, line, area, step, column + line, pie, donut, treemap, waffle, funnel, radial bar, Sankey, histogram, density, box, violin, dot strip, scatter, bubble, matrix heatmap, correlation heatmap, calendar heatmap, year × month heatmap, highlight table, 2-D density, KPI card, gauge, table), the fields and how rows are combined (sum, average, median, count and more). Dashboards save with the project." },
  { q: "Can I make 3D charts or change the dashboard background?", k: "3d three dimensional 2d surface rotate turn spin background colour color gradient theme style cards", a: "Yes. In Chart settings, the 3D group has 3D columns, 3D surface, 3D lines (ribbons) and 3D scatter. Column, bar, line and area charts also have a 3D button in their top bar to show the same chart in 3D (press 2D to go back). Drag to turn, use the mouse wheel to zoom, double-click to reset, and press Spin to rotate it slowly. For the background, open a dashboard and press Background: pick a preset (Ocean, Forest, Kente, Paper and more), your own colour or a two-colour gradient, and a chart card style (Solid, See-through, Floating or Flat). Each dashboard keeps its own look." },
  { q: "How do I delete or rename a dashboard?", k: "delete remove rename dashboard tab summary", a: "On the Data summary page, Your dashboards lists each dashboard with Open, Rename, Duplicate and Delete. You can also press the ✕ next to a dashboard's tab at the top, or Delete dashboard inside it. Deleting a dashboard does not delete your data; data cards on the summary have their own Delete button for datasets." },
  { q: "How do dashboard filters and interactions work?", k: "dashboard filter click cross filter zoom legend expand export png svg csv print pdf", a: "Click a bar, slice, cell or calendar day to filter every chart on the dashboard to that value; click it again or press ✕ on the filter to clear it. + Add filter filters by a list of values or a range (for example year 2015 to 2024). Hover for exact values, click legend names to hide a series, use the zoom slider on time charts, and press ⤢ to expand a chart. The ⋯ menu downloads a chart as PNG or SVG or its data as CSV, and changes size or order. Print / save as PDF prints the whole dashboard." },
  { q: "Can I share a project or invite someone?", k: "share invite collaborate team colleague member join workspace project editor viewer access", a: "Yes. Open Projects (briefcase button at the top), find your project under My projects and press Share. Type the other person's EcoScope username or email, choose Can edit or Can view, and press Invite. EcoScope confirms which account it shared with. They need their own account and must be signed in as that account: the project appears under Shared with me in their Projects within a minute, with a notice. Your project card lists who it is shared with. To stop sharing, press Share / remove people, then Remove and Yes, remove next to the person. Editors' changes save to the same project and History shows who made each change. Viewers can explore, but nothing they do is saved; they can press Make my own copy. Only the owner can rename, share or delete the project." },
  { q: "What happens when two people edit the same project?", k: "conflict overwrite two people same time shared edit changes lost their version keep mine", a: "EcoScope checks for changes from others every 30 seconds. If someone else saved and you have no unsaved changes, your screen updates with their version. If you both changed it, an orange notice appears: Load their version (drops your unsaved changes) or Keep mine (saves yours over theirs; their version stays in History and can be restored). Large tables over about 150,000 cells stay in the browser they were added in, so other people see them as Not on this device; export and send those as CSV." },
  { q: "How do I leave a project someone shared with me?", k: "leave shared project remove myself stop sharing unshare", a: "Open Projects, find it under Shared with me and press Leave. It disappears from your list; the owner can share it again. To keep a copy first, press Copy to my projects. Owners stop sharing by opening Share and pressing the ✕ next to a person." },
  { q: "Why is a large file slow, and how do I handle it?", k: "slow large big file million rows freeze hang performance panel firms tickers", a: "A file with very many rows per date (for example 500 firms × 10 years of daily prices) is a long panel. When you import it, EcoScope asks what to chart: one unit, several units side by side, or the average. The full file is kept in Data Workbench in this browser's storage (not uploaded with the project), so the app stays fast. Use Formulas or Merge & append there to filter or summarise it." },
  { q: "Why is no variable selected when I start?", k: "no variable empty start begin first variable blank chart", a: "EcoScope now starts with an empty basket so you choose what to look at. Pick a source on the left and click a variable; add more from any source to compare them. Remove one with × or empty the basket with Clear." },
  { q: "How do I merge two datasets?", k: "merge join combine link add columns key match master using left inner outer full m:1 1:1 many one", a: "Data Workbench → Merge & append → Merge. Pick the first table and the second table, choose the key variables (country and year for a panel; Suggest keys helps), check the merge type EcoScope suggests (1:1, m:1, 1:m), choose which rows to keep (all of the first table is the usual choice) and what to do with columns that exist in both. Read the match report and unmatched examples, then Save as dataset. Show the same step gives Stata, SAS, R and Python code. Press Merge and save as dataset at the top of the result; it is greyed out until a key is chosen. If the key columns have different names (country and name), press Suggest keys or pick them yourself." },
  { q: "How do I append (stack) datasets?", k: "append stack rows bind concat combine years add observations union", a: "Data Workbench → Merge & append → Append. Tick two or more tables in the order you want, choose Keep all columns or Only columns in every table, tick Match column names ignoring case if needed, keep the source column, and tick key columns such as country and year to check for overlapping rows. Then Save as dataset. Press Append and save as dataset at the top of the result once two or more tables are ticked." },
  { q: "Why did my merge not match some rows?", k: "unmatched not matched merge missing blank match rate spelling codes", a: "Usually the key values differ: spelling (Cote d'Ivoire vs Côte d'Ivoire), codes (GH vs GHA), upper/lower case, extra spaces, or years outside the other table's range. Look at the unmatched examples under the result, tick Ignore upper/lower case in Key options, or fix the codes with Formulas before merging." },
  { q: "How do I run linear programming or optimization?", k: "optimization optimise optimize linear programming lp simplex maximize minimize constraint allocation integer binary solver", a: "Data Workbench → Optimization. From a dataset: each row is a decision; choose Maximize or Minimize the total of a column, the decision type (amount, whole number or yes/no) and add limits such as total land ≤ 10. Or Write a model, e.g.  max: 3x + 5y  then  c1: x + 2y <= 14. Press Solve to see the best values, binding limits and shadow prices, then save the plan as a dataset." },
  { q: "What is a shadow price?", k: "shadow price dual value binding slack reduced cost sensitivity", a: "In Optimization results, the shadow price of a limit is how much the best objective would change if that limit were one unit larger, for small changes. Binding limits are fully used (slack 0); limits with slack have a shadow price of 0. Reduced cost shows how much the objective would change if a zero-valued decision were forced up by one unit. Integer models do not report shadow prices." },
  { q: "Can I mix variables from different sources on one chart?", k: "different sources mix world bank imf fred combine variables basket two axes scale units index", a: "Yes. Add a variable, click another source (IMF, FRED, WHO…) and add more: the basket keeps them all and the chart, table, stats and exports use every variable. When units differ, use Scale next to the vars badge: Auto or Two axes puts the second unit on a right-hand axis; Index sets each series to 100 in its first year." },
  { q: "How do I delete several datasets or documents at once?", k: "delete remove several multiple select all clear documents datasets", a: "In Data Workbench → Datasets, tick the boxes (or Select all) and press Delete selected. In Text coding → 1. Documents, tick documents and press Remove selected, or Remove all. Every deletion is in Project history, so you can restore it." },
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
        if (m.category === "reset") return <div key={m.id || i} style={{ textAlign: "center", fontSize: 11, color: C.dim, margin: "8px 0", borderTop: `1px dashed ${C.border}`, paddingTop: 6 }}>User started a new conversation · {ciFmtDay(m.created_at)} {ciFmtTime(m.created_at)}</div>;
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
      if (!ans?.answer) { const kb = ciKbAnswer(body); ans = kb ? { answer: kb.answer, related: kb.related } : { answer: "I don't have a good answer for that. You can start over with a different question, or send it to the EcoScope team, who will reply here.", unanswered: true }; }
      else if (/support tab|can(no|')t help|not able to help|don't know|outside (what|the scope)/i.test(ans.answer)) ans.unanswered = true;
      setAMsgs(m => [...m, { sender: "bot", body: ans.answer, related: ans.related, created_at: now(), unanswered: !!ans.unanswered }]); setBusy(false);
      US.supportSend({ username: user.username, email: user.email, sender: "user", channel: "assistant", body }).catch(() => {});
      US.supportSend({ username: user.username, email: user.email, sender: "bot", channel: "assistant", category: ans.unanswered ? "unanswered" : null, body: ans.answer }).catch(() => {});
    } else {
      setBusy(true); const r = await US.supportSend({ username: user.username, email: user.email, sender: "user", channel: "support", category: cat, body }); setBusy(false);
      if (r?.error) { setErr(r.error); setText(body); } else loadThread();
    } };
  const escalate = () => { const lastQ = [...aMsgs].reverse().find(m => m.sender === "user"); setMode("support"); if (lastQ) setText(lastQ.body); };
  // Start over: clear the assistant screen back to the welcome view. The conversation stays in the admin's history.
  const startOver = () => { if (aMsgs.length) US.supportSend({ username: user.username, email: user.email, sender: "bot", channel: "assistant", category: "reset", body: "User started a new conversation." }).catch(() => {});
    setAMsgs([]); setText(""); setErr(""); setTimeout(() => inputRef.current?.focus(), 30); };
  const lastBot = [...aMsgs].reverse().find(m => m.sender === "bot");
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
          {mode === "assistant" && aMsgs.length > 0 && <button type="button" onClick={startOver} title="Start over" aria-label="Start a new conversation" style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, height: 30, padding: "0 9px", color: C.mid, cursor: "pointer", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}>↺ Start over</button>}
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
        {mode === "assistant" && aMsgs.length > 0 && !busy && (lastBot?.unanswered
          ? <div role="status" style={{ padding: "8px 12px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: C.mid }}>
              <span style={{ flex: "1 1 100%" }}>The assistant could not answer that.</span>
              <button type="button" onClick={startOver} style={{ ...pill(false), fontSize: 12 }}>↺ Start over</button>
              <button type="button" onClick={escalate} style={{ ...btn(), padding: "6px 12px", fontSize: 12 }}>Send to support</button>
            </div>
          : <div style={{ padding: "6px 12px", borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.mid }}>Still stuck? <button type="button" onClick={escalate} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", padding: 0, fontSize: 12, textDecoration: "underline" }}>Send to support</button> or <button type="button" onClick={startOver} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", padding: 0, fontSize: 12, textDecoration: "underline" }}>start over</button></div>)}
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
  const shown = threads.filter(t => (filter === "all" || (filter === "unanswered" ? t.unanswered > 0 : (t.status || "open") === filter)) && (!q || `${t.username} ${t.email || ""} ${t.last_body || ""}`.toLowerCase().includes(q.toLowerCase())));
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
          <div role="group" aria-label="Filter" style={{ display: "flex", gap: 6 }}>{[["open", "Open"], ["unanswered", "Bot gaps"], ["resolved", "Resolved"], ["all", "All"]].map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => { setFilter(k); if (k === "unanswered") setShowBot(true); }} title={k === "unanswered" ? "Users whose questions the assistant could not answer" : undefined} style={{ ...pill(filter === k), flex: 1, padding: "5px", fontSize: 11 }}>{l}</button>)}</div>
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
              <div style={{ fontSize: 10.5, color: (t.status || "open") === "open" ? C.orange : C.teal, marginTop: 3 }}>{(t.status || "open") === "open" ? "Open" : "Resolved"} · {t.count} message{t.count === 1 ? "" : "s"}{t.unanswered > 0 && <span style={{ color: C.red }}> · {t.unanswered} unanswered by bot</span>}</div>
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
// >>> WORKBENCH AND PROJECTS (generated from engine/wb_*.js, ui_workbench.jsx, ui_projects.jsx) >>>
// ══════════════════════════════════════════════
// ECOSCRIPT (formula engine): safe spreadsheet-style formulas over a table (no eval)
// Each line:  new_column = expression        Lines run in order; later lines can use earlier results.
// Values can be numbers, text or blank. Function names are plain English; Excel names also work.
// ══════════════════════════════════════════════
const FX_GROUPS = ["Maths and rounding", "Across columns (row by row)", "Whole-column statistics", "Conditional totals and counts", "Logic and checks", "Text", "Dates", "Lookup", "Over time", "Finance"];

export { AdminSupportInbox, FX_GROUPS, ImpactLab, SUPPORT_FAQ, SupportChat, ciFmtDay, ciFmtTime, dsParseTime };
