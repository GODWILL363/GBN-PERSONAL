// dashboard/Dashboard.js — split from App.js (code unchanged; only imports and exports were added)
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { AGG_METHODS, IMPUTE_METHODS, NORM_METHODS, TRANSFORMS, applyTransform, buildComposite, dagBackdoorSet, dagHasCycle, downloadDAG, exportChart, generateEcoScopeAnalysis, histogram, imputeData, normalCurve, olsRegression, skewNormalCurve, summaryStats } from "../analysis/stats";
import { ALL_SRCS_MAP, cacheClearPrefix, fetchData, fmtVal, useIsMobile } from "../core/fetch";
import { US, openIesgi } from "../core/store";
import { ACCENT, C, COUNTRIES, CURRENT_YEAR, Ico, PLANS, PRO_SOURCES, YEARS, applyTheme, getValueColor, globalCSS, ink } from "../core/theme";
import { MACRO_SOURCES, MICRO_SOURCES } from "../data/sources";
import { meDagImplications, meDiscover, meStationary } from "../impact/estimators";
import { ImpactLab, SupportChat, ciFmtDay, ciFmtTime } from "../impact/tabs";
import { ExportMenu, UpgradeModal, btn, card, csvToSeries, detectTimeColumn, ecoPanelInfo, ecoTimeCmp, inp, parseCSV, pill, sel } from "../ui/login";
import { CustomTip, Settings, UpgradeRequestModal } from "../ui/settings";
import { VaultBrowser } from "../vault/vault";
import { prjDiff, prjLocalKey, prjLocalLoad, prjLocalSave, prjSame, prjToJSON, prjUid, wbDownload } from "../workbench/export";
import { PRJ_BIG_CELLS, prjBigKey, prjCells, prjIdb, prjLite } from "../workbench/storage";
import { DashStudio, PanelImportModal, ProjectsModal } from "../workbench/tools";
import { Workbench } from "../workbench/workbench";

// <<< WORKBENCH AND PROJECTS <<<

function Dashboard({user, onLogout}) {
  const [settings,setSettings]=useState(user.settings||{defaultCountry:"GH",fredKey:"",anthropicKey:"",theme:"dark"});
  const [showSettings,setShowSettings]=useState(false);
  const [showUserMenu,setShowUserMenu]=useState(false);
  const [upgradeModal,setUpgradeModal]=useState(null); // {feature, requiredPlan}
  const [showUpgradeReq,setShowUpgradeReq]=useState(false);
  const [settingsTab,setSettingsTab]=useState("account");
  // Load a {headers, rows} table into the dashboard as imported series (used by the CSV import and by Data structure)
  const [panelPick,setPanelPick]=useState(null); // long panel file waiting for the user to choose units
  const importTable=(parsed, name, opt={})=>{
    const timeInfo=detectTimeColumn(parsed.headers,parsed.rows);
    if(!opt.skipPanel){ const pi=ecoPanelInfo(parsed,timeInfo.col); if(pi){ setPanelPick({ parsed, name, tcol:timeInfo.col, fromWorkbench:!!opt.fromWorkbench, ...pi }); return true; } }
    const series=csvToSeries(parsed.headers,parsed.rows,timeInfo.col);
    if(Object.keys(series).length===0){alert("No numeric data columns found.");return false;}
    setImportedData({series,freq:timeInfo.freq,timeName:timeInfo.name});
    setImportedRaw({headers:parsed.headers, rows:parsed.rows, name, id:prjUid()});
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
        const fresh=await US.me();
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
  const [varBasket,setVarBasket]=useState([]); // starts empty: the user picks the first variable
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
  const [axisMode,setAxisMode]=useState("auto"); // auto|shared|dual|index — how series in different units share the chart
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
  // forget hidden marks for variables no longer in the basket
  useEffect(()=>{ setHiddenChartVars(prev=>{ const keep=new Set(varBasket.map(it=>`${it.sourceId}:${it.varCode}`)); const n=new Set([...prev].filter(k=>keep.has(k))); return n.size===prev.size? prev : n; }); },[varBasket]);
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
  // Country-fixed sources (e.g. FRED = United States) keep their own country per variable; the selected country applies to the rest
  const effCountry = varBasket.length && varBasket.every(b=>ALL_SRCS_MAP[b.sourceId]?.countryFixed) ? ALL_SRCS_MAP[varBasket[0].sourceId].countryFixed : country;
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

  // Switching the source or level only changes which variable list is browsed.
  // The basket keeps variables from any source (World Bank, IMF, FRED, micro sources…), so nothing is cleared here.
  useEffect(()=>{
    const srcs=dataLevel==="macro"?MACRO_SOURCES:MICRO_SOURCES;
    if(!srcs.some(x=>x.id===sourceId)) setSourceId(srcs[0].id);
    setVarSearch("");
  },[dataLevel]);

  // Load data
    // Fetches RAW data over the network only — never depends on transform/impute
  // (those are pure client-side reprocessing of already-fetched data, applied separately below)
  const loadData = useCallback(async()=>{
    if(!varBasket.length){ setMultiData({}); setCmpMultiData({}); setRawData([]); setCmpRawData([]); setNoDataVars(new Set()); setLoading(false); return; }
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
      const out = await fetchData(src.id, vd, cc2, startYear, endYear, apiKeys);
      // Monthly/daily market series (Yahoo) are averaged to years when the chart is annual, so they line up with annual sources
      if(freq==="annual" && Array.isArray(out) && out.some(d=>typeof d.year==="string" && /^\d{4}-/.test(d.year))){
        const by={}; out.forEach(d=>{ const y=parseInt(String(d.year).slice(0,4)); if(d.value!=null&&!isNaN(d.value)){ (by[y]=by[y]||[]).push(d.value); } });
        return Object.keys(by).map(Number).sort((a,b)=>a-b).map(y=>({year:y, value:+(by[y].reduce((s,v)=>s+v,0)/by[y].length).toFixed(4)}));
      }
      return out;
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
    {lbl:"Source",     val:varBasket[0]?.sourceId==="__imported__"?"CSV":_primarySrc0.short, sub:varBasket.length&&varBasket.every(b=>b.sourceId==="__imported__")?(importedRaw?.name||"Your file"):new Set(varBasket.map(b=>b.sourceId)).size>1?`+ ${new Set(varBasket.map(b=>b.sourceId)).size-1} more source${new Set(varBasket.map(b=>b.sourceId)).size>2?"s":""}`:_primarySrc0.name.split("—")[0].trim()},
    {lbl:"Country",    val:`${cc.flag} ${cc.name}`, sub:cc.region},
    {lbl:"Indicator",  val:varBasket.length? currentVar.name.split("(")[0].trim().substring(0,22) : "None yet", sub:varBasket.length? currentVar.cat : "pick a variable"},
    {lbl:"Latest",     val:latest?fmtVal(latest.value,currentVar.fmt):"—", sub:latest?`year ${latest.year}`:"No data"},
    {lbl:"YoY Change", val:chg!=null?`${chg>=0?"+":""}${chg.toFixed(1)}%`:"—", sub:"vs previous year", pos:chg>0,neg:chg<0&&chg!=null},
  ];

  const renderChart=()=>{
    // Build multi-variable chart data from basket; series switched off under Chart Series are left out
    const visBasket = varBasket.filter(item=>!hiddenChartVars.has(`${item.sourceId}:${item.varCode}`));
    if (varBasket.length && !visBasket.length) return (
      <div style={{height:300,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,color:C.mid,fontSize:13}}>
        <span>All series are switched off.</span><button type="button" onClick={()=>setHiddenChartVars(new Set())} style={pill(false)}>Show all series</button></div>);
    const allVarDefs = visBasket.map(item=>{
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
    ])].sort(ecoTimeCmp);

    // ── Scatter + Regression ──────────────────────────────────────────────────
    if(chartType==="scatter"&&allVarDefs.length>=2){
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
    // transform each series once and look values up by year (fast even for long series)
    const yMap=(arr)=>{ const m=new Map(); arr.forEach(d=>{ if(!m.has(d.year)) m.set(d.year,d.value); }); return m; };
    const prepared=allVarDefs.map(vd=>{ const dk=dataKey(vd); return { vd,
      p:yMap(applyTransform(imputeData(multiData[dk]||[],imputeMethod),transform)), pk:`${cc.flag} ${cc.name}: ${vd.name.substring(0,18)} [${vd._sourceName||source.short}]`,
      c:cmpOn&&cmpMultiData[dk]? yMap(applyTransform(imputeData(cmpMultiData[dk]||[],imputeMethod),transform)) : null, ck:`${cmpC.flag} ${cmpC.name}: ${vd.name.substring(0,18)} [${vd._sourceName||source.short}]` }; });
    const multiChartData = allYears.map(year=>{
      const row={year};
      prepared.forEach(P=>{ row[P.pk]=P.p.get(year)??null; if(P.c) row[P.ck]=P.c.get(year)??null; });
      return row;
    });

    const allKeys=[]; const keyVd={};
    allVarDefs.forEach((vd,i)=>{
      const dk=dataKey(vd);
      const primaryKey=`${cc.flag} ${cc.name}: ${vd.name.substring(0,18)} [${vd._sourceName||source.short}]`;
      allKeys.push(primaryKey); keyVd[primaryKey]=vd;
      if(cmpOn&&cmpMultiData[dk]){
        const cmpKey=`${cmpC.flag} ${cmpC.name}: ${vd.name.substring(0,18)} [${vd._sourceName||source.short}]`;
        allKeys.push(cmpKey); keyVd[cmpKey]=vd;
      }
    });
    // ── Scale for variables in different units (e.g. GDP in $ from World Bank + inflation in % from IMF) ──
    // auto: a second axis on the right when units or magnitudes differ · shared: one axis · dual: always split · index: each series = 100 in its first year
    const medAbs=(k)=>{ const v=multiChartData.map(d=>Math.abs(d[k])).filter(x=>isFinite(x)&&x>0).sort((a,b)=>a-b); return v.length? v[Math.floor(v.length/2)] : null; };
    const k0=allKeys[0]; const m0=k0? medAbs(k0) : null; const f0=keyVd[k0]?.fmt;
    const differs=(k)=>{ const m=medAbs(k); return keyVd[k]?.fmt!==f0 || (m&&m0&&Math.abs(Math.log10(m/m0))>1.3); };
    const mixedUnits=allKeys.slice(1).some(differs);
    const axisEff = chartType==="bar"&&axisMode==="dual"? "dual" : axisMode==="auto"? (mixedUnits?"dual":"shared") : axisMode;
    const rightKeys=new Set(axisEff==="dual"? allKeys.filter((k,i)=>i>0 && differs(k)) : []);
    if(axisEff==="index"){ const base={}; allKeys.forEach(k=>{ const r=multiChartData.find(d=>d[k]!=null&&isFinite(d[k])&&d[k]!==0); base[k]=r?r[k]:null; });
      multiChartData.forEach(d=>allKeys.forEach(k=>{ if(d[k]!=null&&base[k]) d[k]=+(d[k]/base[k]*100).toFixed(4); })); }
    const fmtOf=(k)=> axisEff==="index"? "num" : (keyVd[k]?.fmt||currentVar.fmt);
    const rightFmt=rightKeys.size? fmtOf([...rightKeys][0]) : null;
    const leftKeys=allKeys.filter(k=>!rightKeys.has(k));

    const allVals=multiChartData.flatMap(d=>leftKeys.map(k=>d[k]||0)).filter(v=>v!=null&&!isNaN(v));
    const avgVal=allVals.length?allVals.reduce((a,b)=>a+b,0)/allVals.length:0;
    const maxVal=allVals.length?Math.max(...allVals):0;
    const minVal=allVals.length?Math.min(...allVals):0;

    const ax={
      x:<XAxis dataKey="year" tick={{fill:T.mid,fontSize:11,fontFamily:C.mono}} axisLine={{stroke:T.border}} tickLine={false}/>,
      y:<><YAxis yAxisId="left" tick={{fill:T.mid,fontSize:11,fontFamily:C.mono}} axisLine={false} tickLine={false} tickFormatter={v=>fmtVal(v,axisEff==="index"?"num":fmtOf(leftKeys[0]))} width={74}/>
         {rightKeys.size>0&&<YAxis yAxisId="right" orientation="right" tick={{fill:ACCENT[allKeys.indexOf([...rightKeys][0])%ACCENT.length],fontSize:11,fontFamily:C.mono}} axisLine={false} tickLine={false} tickFormatter={v=>fmtVal(v,rightFmt)} width={74}/>}</>,
      g:<CartesianGrid yAxisId="left" stroke={T.border} strokeOpacity={0.8} vertical={false}/>,
      t:<Tooltip content={<CustomTip fmt={currentVar.fmt} fmtOf={fmtOf}/>}/>,
      l:<Legend wrapperStyle={{color:T.mid,fontSize:10,fontFamily:C.mono,paddingTop:8}} iconType="circle"
          formatter={(value)=>value.replace("RAW","Original").replace(/:/g,": ").substring(0,60)}/>,
      refAvg:<ReferenceLine yAxisId="left" y={avgVal} stroke={C.gold} strokeDasharray="6 3" strokeWidth={1} label={{value:`avg`,fill:C.gold,fontSize:10,fontFamily:C.mono}}/>,
      refMax:<ReferenceLine yAxisId="left" y={maxVal} stroke={C.teal} strokeDasharray="4 4" strokeWidth={1} label={{value:`max`,fill:C.teal,fontSize:10,fontFamily:C.mono}}/>,
      refMin:<ReferenceLine yAxisId="left" y={minVal} stroke={C.red}  strokeDasharray="4 4" strokeWidth={1} label={{value:`min`,fill:C.red,fontSize:10,fontFamily:C.mono}}/>,
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
                    <td style={{padding:"7px 10px",color:ink(r.color),fontWeight:600,whiteSpace:"nowrap"}}>● {r.name.substring(0,22)}</td>
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
                    <td style={{padding:"6px 10px",color:ink(r.color),fontWeight:600,whiteSpace:"nowrap"}}>● {r.name.substring(0,22)}</td>
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
                    <div style={{color:ink(d.color),fontWeight:700,marginBottom:5}}>{d.fullName.substring(0,30)}</div>
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
                <span style={{color:C.text}}>{d.name}: <b style={{color:ink(d.color)}}>{fmtVal(d.mean,d.fmt)}</b></span>
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
          const dn3=k.replace("RAW","(Orig)").substring(0,30)+(rightKeys.has(k)?" (right axis)":"");
          return<Bar key={k} yAxisId={rightKeys.has(k)?"right":"left"} dataKey={k} radius={[4,4,0,0]} name={dn3} opacity={k.includes("RAW")?0.4:1} isAnimationActive={animate} animationDuration={animate?1400:0}>
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
          const dn2=k.replace("RAW","Original").substring(0,30)+(rightKeys.has(k)?" (right axis)":"");
          return<Area key={k} yAxisId={rightKeys.has(k)?"right":"left"} dataKey={k} isAnimationActive={animate} animationDuration={animate?1400:0} stroke={isRaw2?ACCENT[i%ACCENT.length]+"66":ACCENT[i%ACCENT.length]} fill={isRaw2?"transparent":`url(#ag${i})`} strokeWidth={isRaw2?1.5:2.5} strokeDasharray={isRaw2?"5 3":undefined} name={dn2} dot={(isRaw2||multiChartData.length>240)?false:(props)=>{const{cx,cy,value}=props;const col=getValueColor(value,allVals);return<circle key={cx+cy} cx={cx} cy={cy} r={3.5} fill={col} stroke={T.surface} strokeWidth={1.5}/>;}} />;
        })}
      </AreaChart>
    );
    return(
      <LineChart data={multiChartData} margin={{top:10,right:16,left:0,bottom:0}}>
        {ax.g}{ax.x}{ax.y}{ax.t}{ax.l}{ax.refAvg}{ax.refMax}{ax.refMin}
        {allKeys.map((k,i)=>{
          const isRaw=k.includes("RAW");
          const displayName=k.replace("RAW","Original").substring(0,35)+(rightKeys.has(k)?" (right axis)":"");
          return<Line key={k} yAxisId={rightKeys.has(k)?"right":"left"} dataKey={k} isAnimationActive={animate} animationDuration={animate?1400:0} stroke={isRaw?ACCENT[i%ACCENT.length]+"66":ACCENT[i%ACCENT.length]} strokeWidth={isRaw?1.5:2.5} strokeDasharray={isRaw?"5 3":undefined} name={displayName} dot={(isRaw||multiChartData.length>240)?false:(props)=>{const{cx,cy,value}=props;const col=getValueColor(value,allVals);return<circle key={cx+cy} cx={cx} cy={cy} r={4} fill={col} stroke={T.surface} strokeWidth={2}/>;}} />;
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

  // >>> PROJECT STATE (generated from engine/dash_projects.jsx) >>>
  // ══ PROJECTS, HISTORY AND WORKBENCH STATE ══
  const [datasets,setDatasets]=useState({}); const [impactSeed,setImpactSeed]=useState(null); const [formulas,setFormulas]=useState({}); const [coding,setCoding]=useState(null); const [optim,setOptim]=useState(null);
  const [showWorkbench,setShowWorkbench]=useState(null); // null | tab name
  // Data Vault: datasets the administrator publishes to this user's plan (or to this user)
  const [vaultInfo,setVaultInfo]=useState(null);
  // "Analyse in EcoScope" on the IESGI platform opens /?vault=<dataset id>
  const [vaultStart]=useState(()=>{ try { const v=new URLSearchParams(window.location.search).get("vault"); if(v){ const u=new URL(window.location.href); u.searchParams.delete("vault"); window.history.replaceState(null,"",u.pathname+u.search+u.hash); } return v||null; } catch(e){ return null; } });
  const [showVault,setShowVault]=useState(!!vaultStart);
  useEffect(()=>{ let alive=true; const get=()=>fetch("/api/library").then(r=>r.ok?r.json():null).then(j=>{ if(alive&&j) setVaultInfo({ name:j.name, n:(j.datasets||[]).length }); }).catch(()=>{});
    get(); const t=setInterval(get,300000); return ()=>{ alive=false; clearInterval(t); }; },[]);
  const [dash,setDash]=useState(null); const [showDash,setShowDash]=useState(false); // dashboards: { boards:[{id,name,tiles,filters,cols}], active }
  const [showProjects,setShowProjects]=useState(null);   // null | "projects" | "history"
  const [projects,setProjects]=useState([]); const [activeId,setActiveId]=useState(null); const [saveState,setSaveState]=useState("Loading project…");
  const [activeRole,setActiveRole]=useState("owner"); const [conflict,setConflict]=useState(null); const [prjToast,setPrjToast]=useState(""); const [hideViewBar,setHideViewBar]=useState(null); const lastServer=useRef(null); const roleRef=useRef("owner"); roleRef.current=activeRole;
  const prjReady=useRef(false); const lastSaved=useRef(null); const applying=useRef(false); const saveTimer=useRef(null); const blankState=useRef(null);
  // big tables are referenced (stored in IndexedDB on this device) so saving stays fast
  const datasetsLite=useMemo(()=>Object.fromEntries(Object.entries(datasets).map(([k,d])=>[k,prjLite(d)])),[datasets]);
  const importedLite=useMemo(()=>prjLite(importedRaw),[importedRaw]);
  const bigSig=useRef({});
  useEffect(()=>{ const all=[...Object.values(datasets), ...(importedRaw? [{ ...importedRaw, id:importedRaw.id||"imp_"+(importedRaw.name||"") }] : [])];
    all.forEach(t=>{ if (!t || t.loading || t.missing || !Array.isArray(t.rows) || prjCells(t)<=PRJ_BIG_CELLS) return; const sig=`${t.rows.length}|${t.headers.length}|${t.updated||""}|${t.name||""}`; if (bigSig.current[t.id]===sig) return; bigSig.current[t.id]=sig;
      prjIdb.put(prjBigKey(user.username, t.id), { name:t.name, headers:t.headers, rows:t.rows }).catch(()=>{ bigSig.current[t.id]=null; setSaveState("A large table could not be stored on this device"); }); }); },[datasets, importedRaw, user.username]);
  const hydrate=(id, onRows, onMissing)=>{ prjIdb.get(prjBigKey(user.username, id)).then(v=>{ if (v && v.rows){ bigSig.current[id]=null; onRows(v); } else onMissing(); }).catch(onMissing); };
  const snapshot=useMemo(()=>({ v:1, dataLevel, sourceId, varBasket, country, regionFilter, startYear, endYear, chartType, axisMode, viewMode, cmpOn, cmpCountry,
    transform, appliedTransform, imputeMethod, appliedImpute, freq, showComposite, compWeights, compNorm, compAgg, compBasis, analysisTab,
    dagEdges, dagTreatment, dagOutcome, dagPositions, dagMode, dagOpt, unobservedNodes:prjToJSON(unobservedNodes), hiddenChartVars:prjToJSON(hiddenChartVars),
    importedRaw:importedLite, datasets:datasetsLite, formulas, coding, optim, dash }),
    [dataLevel, sourceId, varBasket, country, regionFilter, startYear, endYear, chartType, axisMode, viewMode, cmpOn, cmpCountry, transform, appliedTransform, imputeMethod, appliedImpute, freq,
     showComposite, compWeights, compNorm, compAgg, compBasis, analysisTab, dagEdges, dagTreatment, dagOutcome, dagPositions, dagMode, dagOpt, unobservedNodes, hiddenChartVars, importedLite, datasetsLite, formulas, coding, optim, dash]);
  if (!blankState.current) blankState.current={ ...snapshot, importedRaw:null, datasets:{}, formulas:{}, coding:null, optim:null, dash:null, dagEdges:[], dagPositions:{} };
  const snapRef=useRef(snapshot); snapRef.current=snapshot;
  const applySnapshot=(s0)=>{ const s={ ...blankState.current, ...(s0||{}) }; applying.current=true;
    const loadImported=(raw)=>{ const ti=detectTimeColumn(raw.headers, raw.rows); setImportedData({ series:csvToSeries(raw.headers, raw.rows, ti.col), freq:ti.freq, timeName:ti.name }); setImportedRaw(raw); };
    if (s.importedRaw && s.importedRaw.big && !Array.isArray(s.importedRaw.rows)){ const m=s.importedRaw; setImportedData(null); setImportedRaw({ ...m, rows:[], loading:true });
      hydrate(m.id||"imp_"+(m.name||""), v=>loadImported({ ...m, rows:v.rows, headers:v.headers||m.headers }), ()=>setImportedRaw({ ...m, rows:[], missing:true })); }
    else if (s.importedRaw && s.importedRaw.headers && !s.importedRaw.ref) loadImported(s.importedRaw);
    else if (!s.importedRaw){ setImportedData(null); setImportedRaw(null); }
    setDataLevel(s.dataLevel); setSourceId(s.sourceId); setVarBasket(s.varBasket?.length? s.varBasket : blankState.current.varBasket); setCountry(s.country); setRegionFilter(s.regionFilter);
    setStartYear(s.startYear); setEndYear(s.endYear); setChartType(s.chartType); setAxisMode(s.axisMode||"auto"); setViewMode(s.viewMode); setCmpOn(!!s.cmpOn); setCmpCountry(s.cmpCountry);
    setTransform(s.transform); setAppliedTransform(s.appliedTransform); setImputeMethod(s.imputeMethod); setAppliedImpute(s.appliedImpute); setFreq(s.freq);
    setShowComposite(!!s.showComposite); setCompWeights(s.compWeights||[1]); setCompNorm(s.compNorm); setCompAgg(s.compAgg); setCompBasis(s.compBasis||"raw"); setAnalysisTab(s.analysisTab);
    setDagEdges(s.dagEdges||[]); setDagTreatment(s.dagTreatment??0); setDagOutcome(s.dagOutcome??1); setDagPositions(s.dagPositions||{}); setDagMode(s.dagMode||"manual"); if (s.dagOpt) setDagOpt(s.dagOpt);
    setUnobservedNodes(new Set(s.unobservedNodes||[])); setHiddenChartVars(new Set(s.hiddenChartVars||[]));
    const ds0=s.datasets||{}; setDatasets(Object.fromEntries(Object.entries(ds0).map(([k,d])=>[k, d && d.big && !Array.isArray(d.rows)? { ...d, rows:[], loading:true } : d])));
    Object.entries(ds0).forEach(([k,d])=>{ if (d && d.big && !Array.isArray(d.rows)) hydrate(d.id||k, v=>setDatasets(cur=>cur[k]? { ...cur, [k]:{ ...cur[k], rows:v.rows, headers:v.headers||cur[k].headers, loading:false } } : cur), ()=>setDatasets(cur=>cur[k]? { ...cur, [k]:{ ...cur[k], loading:false, missing:true } } : cur)); });
    setFormulas(s.formulas||{}); setCoding(s.coding||null); setOptim(s.optim||null); setDash(s.dash||null);
    setTimeout(()=>{ applying.current=false; }, 0); };
  const actKey=`ecoscope_active_project_${user.username}`;
  const flushSave=useCallback(async(action, detail, force)=>{ // save now (used before switching, restoring and for checkpoints)
    if (!activeId) return; clearTimeout(saveTimer.current); if (roleRef.current==="viewer"){ setSaveState("View only"); return; }
    const st=snapRef.current; const labels=prjDiff(lastSaved.current, st);
    const a=action || (labels.length? labels.slice(0,2).join("; ") : null); prjLocalSave(user.username, activeId, st);
    if (!a && prjSame(lastSaved.current, st)) return;
    try { const r=await US.projectSave(activeId, { state:st, base:lastServer.current, force:!!force, history:a? { action:a, detail:detail || labels.slice(action?0:2).join("; ") } : undefined });
      lastSaved.current=st; if (r && r.updated_at) lastServer.current=r.updated_at; setConflict(null); setSaveState("All changes saved"); }
    catch(e){ if (e.code==="conflict"){ setConflict({ by:e.data?.updated_by, at:e.data?.updated_at }); setSaveState("Not saved: someone else changed this project"); return; }
      if (e.code==="view_only"){ setActiveRole("viewer"); setSaveState("View only"); return; } throw e; }
  },[activeId, user.username]);
  const loadProject=async(id, serverOnly)=>{ setSaveState("Opening project…"); const p=await US.projectGet(id);
    // a local copy is used only for my own unsynced work; if someone else saved last, their version wins
    if (serverOnly || (p.updated_by && p.updated_by!==user.username)) { try { localStorage.removeItem(prjLocalKey(user.username,id)); } catch(e){} }
    const local=(p.role==="viewer" || serverOnly || (p.updated_by && p.updated_by!==user.username))? null : prjLocalLoad(user.username, id);
    lastServer.current=p.updated_at||null; setActiveRole(p.role||"owner"); roleRef.current=p.role||"owner"; setConflict(null);
    let st=p.state && Object.keys(p.state).length? p.state : null;
    if (local && local.state && (!p.updated_at || new Date(local.at) > new Date(p.updated_at).getTime()+5000)) st=local.state; // unsynced work on this device
    prjReady.current=false; applySnapshot(st||blankState.current); lastSaved.current=p.state && Object.keys(p.state).length? p.state : null;
    setActiveId(id); try { localStorage.setItem(actKey, id); } catch(e){}
    setTimeout(()=>{ prjReady.current=true; setSaveState(p.role==="viewer"? "View only" : st===local?.state && st!==p.state? "Unsynced changes from this device" : "All changes saved"); }, 50); };
  const reloadProjects=async()=>{ const ps=await US.projectList(); setProjects(Array.isArray(ps)? ps : []); return ps; };
  // boot: open the last project, or create a first one from the current workspace
  useEffect(()=>{ let dead=false; (async()=>{ try {
      let ps=await reloadProjects(); if (dead) return; let id=null; try { id=localStorage.getItem(actKey); } catch(e){}
      if (!ps.find(p=>p.id===id)) id=(ps.find(p=>!p.role || p.role==="owner")||{}).id; // a shared project opens only when chosen
      if (!id){ const p=await US.projectCreate({ name:"My workspace", domain:"", description:"Created automatically. Rename it in Projects.", state:snapRef.current }); ps=await reloadProjects(); id=p.id; }
      if (!dead) await loadProject(id);
    } catch(e){ setSaveState("Saving is off: "+(e.message||"project store unavailable")); } })();
    return ()=>{ dead=true; }; },[user.username]);
  // autosave a few seconds after the last change
  const snapJson=useMemo(()=>JSON.stringify(snapshot),[snapshot]);
  useEffect(()=>{ if (!prjReady.current || applying.current || !activeId) return; if (lastSaved.current && JSON.stringify(lastSaved.current)===snapJson) return;
    if (roleRef.current==="viewer"){ setSaveState("View only: changes are not saved"); return; } if (conflict) return;
    setSaveState("Unsaved changes"); clearTimeout(saveTimer.current); prjLocalSave(user.username, activeId, snapRef.current);
    saveTimer.current=setTimeout(async()=>{ setSaveState("Saving…"); try { await flushSave(); } catch(e){ setSaveState("Saved on this device only (will retry)"); } }, 2500);
    return ()=>clearTimeout(saveTimer.current); },[snapJson, activeId, conflict]);
  // shared projects: look for other people's saves every 30 seconds
  // new invitations: refresh the list every minute and when the tab comes back into view, and say when something new was shared
  const seenShared=useRef(null);
  useEffect(()=>{ const ids=projects.filter(p=>p.role && p.role!=="owner"); if (seenShared.current===null){ if (projects.length || activeId) seenShared.current=new Set(ids.map(p=>p.id)); return; }
    const fresh=ids.filter(p=>!seenShared.current.has(p.id)); ids.forEach(p=>seenShared.current.add(p.id));
    if (fresh.length){ setPrjToast(fresh.length===1? `${fresh[0].owner} shared "${fresh[0].name}" with you. Open Projects → Shared with me.` : `${fresh.length} projects were shared with you. Open Projects → Shared with me.`); setTimeout(()=>setPrjToast(""), 9000); } },[projects, activeId]);
  useEffect(()=>{ const tick=()=>{ if (document.visibilityState==="visible") reloadProjects().catch(()=>{}); };
    const t=setInterval(tick, 60000); document.addEventListener("visibilitychange", tick); window.addEventListener("focus", tick);
    return ()=>{ clearInterval(t); document.removeEventListener("visibilitychange", tick); window.removeEventListener("focus", tick); }; },[user.username]);
  const activeMeta=projects.find(p=>p.id===activeId); const isShared=!!activeMeta && (activeMeta.role!=="owner" || (activeMeta.members||0)>0);
  useEffect(()=>{ if (!isShared || !activeId) return; const t=setInterval(async()=>{ try { const ps=await reloadProjects(); const m=ps.find(p=>p.id===activeId);
        if (!m){ setPrjToast("This project is no longer shared with you."); return; }
        if (m.updated_by && m.updated_by!==user.username && lastServer.current && new Date(m.updated_at) > new Date(lastServer.current)){
          const clean=/saved$|^View only/i.test(saveStateRef.current);
          if (clean){ await loadProject(activeId); setPrjToast(`Updated with ${m.updated_by}'s changes.`); setTimeout(()=>setPrjToast(""), 5000); }
          else setConflict({ by:m.updated_by, at:m.updated_at }); } } catch(e){} }, 30000); return ()=>clearInterval(t); },[isShared, activeId]);
  const saveStateRef=useRef(saveState); saveStateRef.current=saveState;
  useEffect(()=>{ const h=(e)=>{ if (saveState==="Unsaved changes" || saveState==="Saving…"){ e.preventDefault(); e.returnValue=""; } }; window.addEventListener("beforeunload",h); return ()=>window.removeEventListener("beforeunload",h); },[saveState]);
  const prj={
    open: async(id)=>{ try { await flushSave(); } catch(e){} await loadProject(id); await reloadProjects(); setShowProjects(null); },
    create: async(m)=>{ try { await flushSave(); } catch(e){} const p=await US.projectCreate({ ...m, state:blankState.current }); await reloadProjects(); await loadProject(p.id); setShowProjects(null); },
    updateMeta: async(id, m)=>{ await US.projectSave(id, { meta:m, history:{ action:"Edited project details", detail:m.name } }); await reloadProjects(); },
    leave: async(id)=>{ await US.projectRemoveMember(id, user.username); if (id===activeId){ prjReady.current=false; const ps=await reloadProjects(); let next=((ps||[]).find(p=>!p.role || p.role==="owner")||{}).id; if (!next){ const p=await US.projectCreate({ name:"My workspace", domain:"", description:"Created automatically. Rename it in Projects.", state:blankState.current }); next=p.id; await reloadProjects(); } await loadProject(next); } else await reloadProjects(); },
    reloadTheirs: async()=>{ setConflict(null); clearTimeout(saveTimer.current); await loadProject(activeId, true); },
    keepMine: async()=>{ setConflict(null); setSaveState("Saving…"); try { await flushSave("Overwrote changes by "+(conflict?.by||"another user"), null, true); } catch(e){ setSaveState("Saved on this device only (will retry)"); } },
    remove: async(id)=>{
      if (id===activeId){ // deleting the open project: stop saving to it, delete it, then open the next one (or a fresh workspace)
        clearTimeout(saveTimer.current); prjReady.current=false; const others=projects.filter(p=>p.id!==id);
        await US.projectDelete(id); try { localStorage.removeItem(prjLocalKey(user.username,id)); } catch(e){}
        let next=(others.find(p=>!p.role || p.role==="owner")||{}).id; if (!next){ const p=await US.projectCreate({ name:"My workspace", domain:"", description:"Created automatically. Rename it in Projects.", state:blankState.current }); next=p.id; }
        await loadProject(next); await reloadProjects(); return; }
      await US.projectDelete(id); try { localStorage.removeItem(prjLocalKey(user.username,id)); } catch(e){} await reloadProjects(); },
    duplicate: async(id, open)=>{ if (id===activeId) { try { await flushSave(); } catch(e){} } const p=await US.projectGet(id); const c=await US.projectCreate({ name:`${p.name} (copy)`, domain:p.domain, description:p.description, question:p.question, status:p.status, tags:p.tags, state:p.state }); await reloadProjects(); if (open && c?.id) await loadProject(c.id); return c; },
    exportJson: async(id)=>{ if (id===activeId) await flushSave(); const p=await US.projectGet(id); const rest={ ...p }; delete rest.owner;
      wbDownload(`${(p.name||"project").replace(/[^\w-]+/g,"_")}.ecoscope.json`, JSON.stringify({ ecoscope_project:1, exported_at:new Date().toISOString(), project:rest }), "application/json"); },
    importJson: async(file)=>{ let j; try { j=JSON.parse(await file.text()); } catch(e){ throw new Error("That file is not an EcoScope project file."); } const p=j.project||j; if (!p.state && !p.name) throw new Error("That file is not an EcoScope project file.");
      try { await flushSave(); } catch(e){} const c=await US.projectCreate({ name:p.name||file.name, domain:p.domain, description:p.description, question:p.question, status:p.status, tags:p.tags, state:p.state||{} }); await reloadProjects(); await loadProject(c.id); setShowProjects(null); },
    checkpoint: async(name)=>{ await flushSave(`Checkpoint: ${name}`, prjDiff(lastSaved.current, snapRef.current).join("; ")); },
    restore: async(h)=>{ const e=await US.projectHistoryEntry(activeId, h.id); if (!e || !e.state) throw new Error("This entry has no saved workspace.");
      await flushSave("Before restore", `About to restore "${h.action}"`); const st={ ...e.state }; const cur=snapRef.current; const missing=[];
      if (st.datasets) st.datasets=Object.fromEntries(Object.entries(st.datasets).map(([k,d])=>{ if (d && d.ref){ if (cur.datasets[k]) return [k, cur.datasets[k]]; missing.push(d.name); return null; } return [k,d]; }).filter(Boolean));
      if (st.importedRaw && st.importedRaw.ref) st.importedRaw=cur.importedRaw;
      prjReady.current=false; applySnapshot(st);
      setTimeout(async()=>{ prjReady.current=true; try { await flushSave(`Restored: ${h.action}`, `From ${ciFmtDay(h.created_at)} ${ciFmtTime(h.created_at)}${missing.length? `. Large datasets not kept in history: ${missing.join(", ")}` : ""}`); } catch(err){} }, 80);
      if (missing.length) alert(`Restored. These large datasets were not stored in the history and could not be brought back: ${missing.join(", ")}.`); },
  };
  const activeProject=projects.find(p=>p.id===activeId);
  // the data behind the current chart as a table (year + one column per basket variable)
  const basketTable=()=>{ const cols=varBasket.map(item=>({ name:varBasket.some(o=>o!==item && (o.label||o.varCode)===(item.label||item.varCode))? `${item.label||item.varCode} (${item.sourceName})` : (item.label||item.varCode), data:applyTransform(imputeData(multiData[`${item.sourceId}:${item.varCode}`]||[], appliedImpute), appliedTransform) }));
    const years=[...new Set(cols.flatMap(c=>c.data.map(d=>d.year)))].sort((a,b)=>String(a).localeCompare(String(b),undefined,{ numeric:true }));
    return { name:`${cc.name} ${startYear}-${endYear}`, headers:["country","year",...cols.map(c=>c.name)], rows:years.map(y=>[cc.name, y, ...cols.map(c=>{ const v=c.data.find(d=>d.year===y)?.value; return v==null? "" : v; })]) }; };

  // tables for Dashboards: the current chart, an imported file and every Workbench dataset
  const dashBasket=useMemo(()=>{ if (!showDash || !varBasket.length) return null; try { const t=basketTable(); return t.rows.length? t : null; } catch(e){ return null; } },[showDash, varBasket, multiData, appliedImpute, appliedTransform, startYear, endYear, cc]);
  const dashSources=useMemo(()=>{ const out=[];
    if (dashBasket) out.push({ ...dashBasket, id:"basket", name:`Current chart: ${dashBasket.name}`, kindLabel:"Variables chosen on the main screen" });
    if (importedRaw && importedRaw.headers) out.push({ ...importedRaw, id:"imported", name:importedRaw.name||"Imported file", kindLabel:"Imported file", rows:Array.isArray(importedRaw.rows)? importedRaw.rows : [] });
    Object.values(datasets).forEach(d=>{ if (d && d.headers) out.push({ ...d, kindLabel:"Workbench dataset", rows:Array.isArray(d.rows)? d.rows : [] }); });
    return out; },[dashBasket, importedRaw, datasets]);
  // <<< PROJECT STATE <<<

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
          {!isMobile&&<div style={{fontSize:11,color:C.dim,fontFamily:C.mono}}>{[...new Set(varBasket.map(b=>b.sourceName))].join(" + ")} · {cc.flag} {cc.name} · {varBasket.length? currentVar.name.substring(0,30) : "no variable selected"}{varBasket.length>1?` +${varBasket.length-1}`:""} · {startYear}–{endYear}</div>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,position:"relative"}}>
          {/* Project chip: current project and save status */}
          <button type="button" onClick={()=>setShowProjects("projects")} title={`Project: ${activeProject?.name||"none"} · ${saveState}. Click for projects and history.`} aria-label={`Projects. Current project ${activeProject?.name||"none"}. ${saveState}`}
            style={{display:"flex",alignItems:"center",gap:6,background:"none",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,cursor:"pointer",padding:isMobile?"7px 9px":"6px 10px",fontSize:12,maxWidth:isMobile?120:260}}>
            <Ico n="briefcase"/>{!isMobile&&<span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeProject?.name||"Project"}</span>}
            {!isMobile&&activeProject&&(activeProject.role!=="owner"||activeProject.members>0)&&<span style={{fontSize:10,color:C.mid,border:`1px solid ${C.border}`,borderRadius:3,padding:"0 4px",whiteSpace:"nowrap"}}>{activeProject.role==="viewer"? "view only" : activeProject.role==="editor"? "shared · edit" : `shared · ${activeProject.members}`}</span>}
            <span aria-hidden="true" style={{width:7,height:7,borderRadius:4,flex:"none",background:/^View only/.test(saveState)?C.mid:/saved$/i.test(saveState)?C.teal:/Saving|Unsaved|Opening|Loading/.test(saveState)?C.orange:C.red}}/>
          </button>
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
                  {icon:<Ico n="briefcase"/>,label:"Projects",action:()=>{setShowProjects("projects");setShowUserMenu(false);}},
                  {icon:<Ico n="clipboard"/>,label:"History and restore",action:()=>{setShowProjects("history");setShowUserMenu(false);}},
                  {icon:<Ico n="sheet"/>,label:"Data Workbench",action:()=>{setShowWorkbench("datasets");setShowUserMenu(false);}},
                  {icon:<Ico n="dash"/>,label:"Dashboards",action:()=>{setShowDash(true);setShowUserMenu(false);}},
                  null,
                  {icon:<Ico n="arrowup"/>,label:"Request plan upgrade",action:()=>{setShowUpgradeReq(true);setShowUserMenu(false);}},
                  {icon:<Ico n="message"/>,label:"Help & support chat",action:()=>openSupport("assistant")},
                  null,
                  {icon:<Ico n="globe"/>,label:"IESGI open data",action:()=>{openIesgi("/data");setShowUserMenu(false);}},
                  {icon:<Ico n="sheet"/>,label:"Contribute data to IESGI",action:()=>{openIesgi("/data/contribute");setShowUserMenu(false);}},
                  {icon:<Ico n="settings"/>,label:"IESGI API keys and organisations",action:()=>{openIesgi("/data/me");setShowUserMenu(false);}},
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
            <button type="button" onClick={()=>setShowWorkbench("pdf")} style={{...btn(C.gold),background:"transparent",color:C.text,border:`1px solid ${C.border}`,width:"100%",padding:"7px",fontSize:12,marginTop:6}} title="Tables from PDFs, formulas, qualitative coding, saved datasets"><Ico n="sheet"/> Data Workbench</button>
            {importedData&&<div style={{marginTop:6,padding:"6px 8px",background:`${C.cyan}12`,border:`1px solid ${C.cyan}33`,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={{color:C.cyan,fontSize:10,fontFamily:C.mono}}>✓ {Object.keys(importedData.series).length} cols · {importedData.freq}</span><button onClick={()=>{setImportedData(null);}} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:11}}>✕</button></div>}
          </div>

          {/* DATA LEVEL TOGGLE */}
          <div style={{padding:"12px 10px 6px"}}>
            <div style={{fontSize:10,color:C.dim,fontFamily:C.mono,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>Data Level</div>
            <div style={{display:"flex",gap:5}}>
              {vaultInfo&&vaultInfo.n>0&&<button type="button" onClick={()=>setShowVault(true)} title={`${vaultInfo.n} curated dataset${vaultInfo.n>1?"s":""} with sources and documents`} style={{...pill(showVault,C.teal),flex:1,textAlign:"center",fontSize:11,padding:"6px 0",order:3}}>◆ {vaultInfo.name}</button>}
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
                <button onClick={()=>setVarBasket([])} title="Remove every variable" style={{background:"none",border:"none",color:C.red,fontSize:10,cursor:"pointer",fontFamily:C.mono}}>Clear</button>
              </div>
              {varBasket.map((item,i)=>(
                <div key={`${item.sourceId}:${item.varCode}`} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 8px",marginBottom:3,background:`${item.sourceColor}14`,border:`1px solid ${item.sourceColor}33`,borderRadius:6}}>
                  <div style={{width:15,height:15,borderRadius:3,background:item.sourceColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:C.onGold,fontWeight:700,flexShrink:0}}>{i+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:T.text,fontSize:10,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.label.substring(0,26)}</div>
                    <div style={{color:item.sourceColor,fontSize:9,fontFamily:C.mono,opacity:.8}}>{item.sourceName}</div>
                  </div>
                  {<button aria-label={`Remove ${item.label}`} onClick={()=>setVarBasket(vb=>vb.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:13,lineHeight:1,padding:"0 2px",flexShrink:0}}>×</button>}
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
                          setVarBasket(vb=>vb.filter(b=>!(b.sourceId===source.id&&b.varCode===v.code)));
                        } else {
                          const maxVars=plan.aiInsights?10:4; if(varBasket.length>=maxVars){setUpgradeModal({feature:`Maximum ${maxVars} variables reached`,requiredPlan:"pro"});return;}
                          if(varBasket.length>=1&&!plan.compare){setUpgradeModal({feature:"Multi-variable analysis requires Pro",requiredPlan:"pro"});return;}
                          setVarBasket(vb=>[...vb,{sourceId:source.id,varCode:v.code,label:v.name,fmt:v.fmt,sourceColor:source.color,sourceName:source.short}]);
                        }
                      }} style={{width:"100%",display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:6,border:"none",borderLeft:`2px solid ${active?source.color:"transparent"}`,background:active?`${source.color}12`:"transparent",cursor:"pointer",textAlign:"left",marginBottom:1,transition:"all .1s"}}>
                        <div style={{flex:1}}>
                          <div style={{color:active?source.color:C.text,fontSize:11,lineHeight:1.3}}>{v.name}</div>
                          <div style={{display:"flex",gap:6,alignItems:"center"}}><div style={{color:C.dim,fontSize:10,fontFamily:C.mono}}>{v.fmt}</div><div style={{color:ink(source.color),fontSize:10,fontFamily:C.mono,opacity:.7}}>{source.short}</div></div>
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
                <span style={{color:ink(source.color),fontSize:12,fontWeight:600}}>{cc.name}</span>
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
                <button key={t.id} aria-pressed={analysisTab===t.id} onClick={()=>setAnalysisTab(t.id)} style={{
                  fontSize:10,padding:"4px 8px",whiteSpace:"nowrap",textTransform:"capitalize",flexShrink:0,
                  borderRadius:6,cursor:"pointer",fontFamily:C.mono,fontWeight:analysisTab===t.id?700:400,
                  border:`1px solid ${analysisTab===t.id?t.color:C.border}`,
                  background:analysisTab===t.id?`${t.color}22`:"transparent",
                  color:analysisTab===t.id?t.color:C.mid,
                  transition:"all .15s",
                }}>
                  <span style={{color:ink(t.color)}}>{t.icon}</span> {t.id}
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
              <span style={{color:ink(source.color),fontWeight:700,fontSize:12}}>{source.name}</span>
              <span style={{color:C.mid,fontSize:11,fontFamily:C.mono,marginLeft:10}}>{source.desc}</span>
            </div>
            <a href={source.url} target="_blank" rel="noreferrer" style={{color:ink(source.color),fontSize:11,fontFamily:C.mono,textDecoration:"none"}}>Visit ↗</a>
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
                <h2 style={{margin:0,fontSize:14,fontWeight:700,color:C.text}}>{varBasket.length? currentVar.name : "No variable selected"}</h2>
                <p style={{margin:"4px 0 0",fontSize:11,color:C.mid,fontFamily:C.mono}}>
                  {[...new Set(varBasket.map(b=>b.sourceName))].join(" + ")} · {cc.flag} {cc.name}{cmpOn&&!source.countryFixed?` vs ${cmpC.flag} ${cmpC.name}`:""} · {startYear}–{endYear}
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
                {varCodes.length>1&&viewMode==="chart"&&["area","line","bar"].includes(chartType)&&!showComposite&&(
                  <label style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,color:C.mid}} title="How variables in different units share the chart">Scale
                    <select aria-label="Chart scale" value={axisMode} onChange={e=>setAxisMode(e.target.value)} style={{...sel,width:"auto",padding:"4px 8px",fontSize:11}}>
                      <option value="auto">Auto</option><option value="shared">One axis</option><option value="dual">Two axes</option><option value="index">Index (first year = 100)</option>
                    </select>
                  </label>
                )}
                <div style={{width:1,height:16,background:C.border}}/>
                <button type="button" aria-pressed={viewMode==="table"} onClick={()=>setViewMode(v=>v==="chart"?"table":"chart")} style={pill(viewMode==="table")}>
                  {viewMode==="chart"?"⊞ Table":"◫ Chart"}
                </button>
                <button onClick={()=>setShowImpact(true)} style={{...pill(true),display:"inline-flex",alignItems:"center",gap:5}} title="Matching, weighting and synthetic control"><Ico n="compare"/> Impact Lab</button>
                <button type="button" onClick={()=>setShowWorkbench("datasets")} style={{...pill(false),display:"inline-flex",alignItems:"center",gap:5}} title="Datasets, tables from PDFs, formulas and text coding"><Ico n="sheet"/> Workbench</button>
                <button type="button" onClick={()=>setShowDash(true)} style={{...pill(false),display:"inline-flex",alignItems:"center",gap:5}} title="Summaries of all your data and interactive charts"><Ico n="dash"/> Dashboards</button>
                <div style={{display:"flex",gap:5,alignItems:"center"}}>
                  <button onClick={forceRefresh} disabled={loading||!varBasket.length} title={varBasket.length?"Fetch the latest data again (ignores the cache)":"Pick a variable first"} style={{...pill(false),color:C.teal,borderColor:`${C.teal}44`,fontSize:11,opacity:loading||!varBasket.length?0.5:1,cursor:loading?"wait":"pointer"}}>{loading?"⟳":"↻"} Refresh</button>
                  <ExportMenu getTable={basketTable} data={data} currentVar={currentVar} cc={cc} source={source} startYear={startYear} endYear={endYear} plan={plan} onUpgradeNeeded={(f)=>setUpgradeModal({feature:f,requiredPlan:"pro"})}/>
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

            {!varBasket.length ? (
              <div style={{height:320,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,color:C.mid,textAlign:"center",padding:"0 20px"}}>
                <span style={{fontSize:30,color:C.gold}}><Ico n="chart"/></span>
                <strong style={{color:C.text,fontSize:15}}>Choose a variable to start</strong>
                <span style={{fontSize:12.5,maxWidth:460,lineHeight:1.6}}>Pick a data source on the left, then click a variable (for example GDP growth). Add more variables from any source to compare them, or use Import Your Data or the Data Workbench to bring in your own files.</span>
                {isMobile&&<button type="button" onClick={()=>setSidebarOpen(true)} style={{...btn(),marginTop:6}}>Open the variable list</button>}
              </div>
            ) : loading ? (
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
                    <span style={{color:C.dim,fontSize:10,fontFamily:C.mono,textTransform:"uppercase",letterSpacing:"0.1em",width:"100%",marginBottom:2}}>Chart Series ({varBasket.filter(it=>!hiddenChartVars.has(`${it.sourceId}:${it.varCode}`)).length}/{varBasket.length} shown · click to hide or show)</span>
                    {varBasket.map((item,i)=>{
                      const dk=`${item.sourceId}:${item.varCode}`;
                      const hidden=hiddenChartVars.has(dk);
                      const vi=varBasket.filter(it=>!hiddenChartVars.has(`${it.sourceId}:${it.varCode}`)).findIndex(it=>it===item);
                      const col=ink(ACCENT[(vi<0?i:vi)%ACCENT.length]);
                      return(
                        <button key={dk} type="button" aria-pressed={!hidden} title={hidden?"Hidden: click to show on the chart":"Shown: click to hide from the chart"} onClick={()=>{
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
                  ])].sort(ecoTimeCmp);
                  const _tc=new Map(); const tSeries=(raw,imp,tr)=>{ const k=raw; let e=_tc.get(k); if(!e){ const arr=applyTransform(imputeData(raw,imp),tr); e={ m:new Map(arr.map(d=>[String(d.year),d])), r:new Map(raw.map(d=>[String(d.year),d])) }; _tc.set(k,e); } return e; }; // computed once per series, looked up by year
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
                          const _ps=tSeries(multiData[varCode]||[],imputeMethod,transform).m;
                          const cur=_ps.get(String(year));
                          const prev=_ps.get(String(prec));
                          const delta=cur?.value!=null&&prev?.value?((cur.value-prev.value)/Math.abs(prev.value)*100):null;
                          return(
                            <tr key={year} style={{background:i%2?`${T.surface}88`:"transparent"}}>
                              <td style={{color:T.mid,padding:"6px 12px",fontWeight:600}}>{year}</td>
                              {allVarDefs2.map((vd,vi)=>{
                                const dk2=vd._dk||`${varBasket[vi]?.sourceId||source.id}:${vd.code}`;
                              const rawS=multiData[dk2]||multiData[vd.code]||[];
                              const _e=tSeries(rawS,appliedImpute,appliedTransform);
                                const pt2=_e.m.get(String(year));
                              const rawPt2=showOriginal?_e.r.get(String(year)):null;
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
        onSave={ns=>{setSettings(ns);US.update(liveUser.username,{settings:ns}).catch(console.error);}} onClose={()=>setShowSettings(false)}
        onAccount={u=>setLiveUser(x=>({...x,...u}))} onDeleted={()=>{ setShowSettings(false); onLogout(); }}/>}
      <SupportChat user={liveUser} open={chatOpen} setOpen={setChatOpen} mode={chatMode} setMode={setChatMode}/>
      {/* DATA IMPORT MODAL */}
      {showVault&&<VaultBrowser isMobile={isMobile} startId={vaultStart} onClose={()=>setShowVault(false)} onOpen={(d)=>{ const id=prjUid(); const now=new Date().toISOString(); setDatasets(ds=>({ ...ds, [id]:{ id, name:d.title, headers:[...d.headers], rows:d.rows.map(r=>r.map(v=>v==null?"":String(v))), created:now, updated:now, source:"vault", note:[d.source_name, d.citation].filter(Boolean).join(" · ") } })); setShowVault(false); setShowWorkbench("datasets"); }}/>}
      {showWorkbench&&<Workbench startTab={showWorkbench} onClose={()=>setShowWorkbench(null)} datasets={datasets} setDatasets={setDatasets} formulas={formulas} setFormulas={setFormulas} coding={coding} setCoding={setCoding} optim={optim} setOptim={setOptim}
        basketTable={basketTable} onChart={d=>{ if (importTable({ headers:d.headers, rows:d.rows }, d.name, { fromWorkbench:true })) setShowWorkbench(null); }} onImpact={d=>{ setImpactSeed({ headers:d.headers, rows:d.rows, name:d.name }); setShowWorkbench(null); setShowImpact(true); }}/>}
      {panelPick&&<PanelImportModal pick={panelPick} maxVars={plan.aiInsights?10:4} onClose={()=>setPanelPick(null)}
        onKeep={t=>{ const id=prjUid(), now=new Date().toISOString(); setDatasets(ds=>({ ...ds, [id]:{ id, ...t, source:"csv", created:now, updated:now } })); }}
        onChart={(t,n)=>{ setPanelPick(null); importTable(t, n, { skipPanel:true }); }}/>}
      {showProjects&&<ProjectsModal startTab={showProjects} projects={projects} activeId={activeId} activeRole={activeRole} me={liveUser.username} saveState={saveState} onClose={()=>setShowProjects(null)} reload={reloadProjects}
        onOpen={prj.open} onCreate={prj.create} onUpdateMeta={prj.updateMeta} onDelete={prj.remove} onLeave={prj.leave} onDuplicate={prj.duplicate} onExport={prj.exportJson} onImport={prj.importJson} onRestore={prj.restore} onCheckpoint={prj.checkpoint}/>}
      {(conflict||prjToast||(activeRole==="viewer"&&hideViewBar!==activeId))&&<div role="status" style={{position:"fixed",top:62,left:"50%",transform:"translateX(-50%)",zIndex:350,maxWidth:"min(680px, calc(100vw - 24px))",background:C.surface,border:`1px solid ${conflict? C.orange : C.borderHi}`,borderRadius:8,boxShadow:C.shadow,padding:"8px 12px",display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",fontSize:12.5,color:C.text}}>
        {conflict? <><span><strong style={{color:C.orange}}>{conflict.by||"Someone"}</strong> saved changes to this project{conflict.at? ` at ${ciFmtTime(conflict.at)}` : ""}. Your latest changes are not saved yet.</span>
            <button type="button" onClick={()=>prj.reloadTheirs()} style={{...pill(true),padding:"5px 10px"}}>Load their version</button>
            <button type="button" onClick={()=>{ if (window.confirm(`Overwrite ${conflict.by||"the other person"}'s changes with yours? Their version stays in History, so it can be restored.`)) prj.keepMine(); }} style={{...pill(false),padding:"5px 10px"}}>Keep mine</button></>
          : prjToast? <><span>{prjToast}</span><button type="button" aria-label="Dismiss" onClick={()=>setPrjToast("")} style={{background:"none",border:"none",color:C.mid,cursor:"pointer"}}>✕</button></>
          : <><span><strong>View only.</strong> {activeProject? `${activeProject.owner} shared "${activeProject.name}" with you.` : ""} You can explore, but changes are not saved.</span>
            <button type="button" onClick={async()=>{ try { await prj.duplicate(activeId, true); } catch(e){ alert(e.message); } }} style={{...pill(true),padding:"5px 10px"}}>Make my own copy</button><button type="button" aria-label="Hide this notice" onClick={()=>setHideViewBar(activeId)} style={{background:"none",border:"none",color:C.mid,cursor:"pointer"}}>✕</button></>}
      </div>}
      {showDash&&<DashStudio onClose={()=>setShowDash(false)} sources={dashSources} dash={dash} setDash={setDash} readOnly={activeRole==="viewer"} onDeleteSource={(src)=>{ if (src.id==="imported"){ setImportedRaw(null); setImportedData(null); } else setDatasets(ds=>{ const n={ ...ds }; delete n[src.id]; return n; }); }}/>}
      {showImpact&&<ImpactLab onClose={()=>{ setShowImpact(false); setImpactSeed(null); }} defaultCountry={country} defaultVar={varCode} imported={impactSeed||importedRaw}
        basket={varBasket} eco={{ impute:appliedImpute, transform:appliedTransform }} years={[startYear,endYear]} onChart={importTable}
        onSave={(t,n)=>{ const id=prjUid(), now=new Date().toISOString(); setDatasets(ds=>({ ...ds, [id]:{ id, name:n, headers:t.headers, rows:t.rows, source:"csv", created:now, updated:now } })); }}/>}
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

export { Dashboard };
