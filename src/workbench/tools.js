// workbench/tools.js — split from App.js (code unchanged; only imports and exports were added)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, Bar, BarChart, Brush, CartesianGrid, Cell, ComposedChart, Funnel, FunnelChart, LabelList, Legend, Line, LineChart, Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, RadialBar, RadialBarChart, ReferenceLine, Sankey, Scatter, ScatterChart, Tooltip, Treemap, XAxis, YAxis, ZAxis } from "recharts";
import { useIsMobile } from "../core/fetch";
import { US } from "../core/store";
import { C, Ico } from "../core/theme";
import { ciFmtDay, ciFmtTime } from "../impact/tabs";
import { btn, card, csvToSeries, ecoTimeCmp, inp, pill, sel } from "../ui/login";
import { PRJ_DOMAINS, PRJ_STATUS, prjAgo, wbCsv, wbDownload } from "./export";
import { LP_STATUS, cmbAppend, cmbGuessKeys, cmbMerge, cmbUniq, lpFromTable, lpParse, lpSolve, lpToText } from "./storage";
import { WbGrid, wbCell, wbH, wbNote, wbSmallBtn } from "./workbench";

// ══════════════════════════════════════════════
// MERGE AND APPEND (UI)
// ══════════════════════════════════════════════
const CMB_TYPES = [
  ["1:1","One-to-one","Each key appears once in both tables (country-year to country-year)."],
  ["m:1","Many-to-one","Key repeats in the first table, unique in the second (country-year panel ← country facts; persons ← household)."],
  ["1:m","One-to-many","Key unique in the first table, repeats in the second (household → its persons)."],
  ["m:m","Many-to-many (all pairs)","Every row is paired with every row that has the same key. Rarely right; check the row count."],
];
const CMB_HOW = [
  ["left","All rows of the first table","Rows without a match get blanks. The usual choice.","keep(master match)","if a;","left_join()","how='left'"],
  ["inner","Matched rows only","Drops rows that are not in both tables.","keep(match)","if a and b;","inner_join()","how='inner'"],
  ["right","All rows of the second table","Rows of the first table without a match are dropped.","keep(using match)","if b;","right_join()","how='right'"],
  ["full","Everything","All rows of both tables, matched where possible.","(default)","(no IF)","full_join()","how='outer'"],
  ["anti_left","First-table rows with no match","Use this to find what did not merge.","keep if _merge==1","if a and not b;","anti_join(a, b)","indicator, left_only"],
  ["anti_right","Second-table rows with no match","Rows of the second table that found no partner.","keep if _merge==2","if b and not a;","anti_join(b, a)","indicator, right_only"],
];
const CMB_OVERLAP = [
  ["suffix","Keep both (second table's copy gets a suffix)"],
  ["master","Keep the first table's values"],
  ["using","Use the second table's values"],
  ["update","Fill blanks in the first table from the second (Stata update)"],
  ["replace","Replace with the second table's value where it is not blank (update replace)"],
];
const cmbCode = (mode, cfg, nameA, nameB) => {
  const sn=(s)=>String(s||"data").replace(/[^A-Za-z0-9_]+/g,"_");
  if (mode==="append"){ const ts=(cfg.names||[]).map(sn); return [
    `* Stata\nuse ${ts[0]}, clear\nappend using ${ts.slice(1).join(" ")}${cfg.source?`, gen(${cfg.source})`:""}${cfg.match==="intersection"? "\n* then drop the variables that are not in every file" : ""}`,
    `/* SAS */\ndata combined;\n  set ${ts.join(" ")};\nrun;`,
    `# R (dplyr)\ncombined <- bind_rows(${ts.map(t=>`${t} = ${t}`).join(", ")}${cfg.source?`, .id = "${cfg.source}"`:""})`,
    `# Python (pandas)\ncombined = pd.concat([${ts.join(", ")}]${cfg.match==="intersection"?", join='inner'":""}, ignore_index=True)`].join("\n\n"); }
  const lk=cfg.keys.map(k=>k.l), rk=cfg.keys.map(k=>k.r); const h=CMB_HOW.find(x=>x[0]===cfg.how)||CMB_HOW[0]; const A=sn(nameA), B=sn(nameB);
  const same=cfg.keys.every(k=>k.l===k.r); const stataKeep=h[3].startsWith("keep(")? `, ${h[3]}` : "";
  return [
    `* Stata${same?"":"  (rename the keys first so they have the same names)"}\nuse ${A}, clear\nmerge ${cfg.type} ${lk.join(" ")} using ${B}${stataKeep}${h[3].startsWith("keep if")? `\n${h[3]}` : ""}\ntab _merge`,
    `/* SAS */\nproc sort data=${A}; by ${lk.join(" ")}; run;\nproc sort data=${B}; by ${rk.join(" ")}; run;\ndata merged;\n  merge ${A}(in=a) ${B}(in=b${same?"":` rename=(${cfg.keys.filter(k=>k.l!==k.r).map(k=>`${k.r}=${k.l}`).join(" ")})`});\n  by ${lk.join(" ")};\n  ${h[4]}\nrun;`,
    `# R (dplyr)\nmerged <- ${cfg.how==="anti_right"? `anti_join(${B}, ${A}` : cfg.how==="anti_left"? `anti_join(${A}, ${B}` : `${h[5].replace("()","")}(${A}, ${B}`}, by = c(${cfg.keys.map(k=>k.l===k.r? `"${k.l}"` : `"${k.l}" = "${k.r}"`).join(", ")})${cfg.how.startsWith("anti")? "" : `, relationship = "${{ "1:1":"one-to-one","m:1":"many-to-one","1:m":"one-to-many","m:m":"many-to-many" }[cfg.type]}"`})`,
    `# Python (pandas)\nmerged = pd.merge(${A}, ${B}, ${same? `on=[${lk.map(k=>`'${k}'`).join(", ")}]` : `left_on=[${lk.map(k=>`'${k}'`).join(", ")}], right_on=[${rk.map(k=>`'${k}'`).join(", ")}]`}, how='${{ left:"left", inner:"inner", right:"right", full:"outer", anti_left:"left", anti_right:"right" }[cfg.how]}',\n                  validate='${{ "1:1":"one_to_one","m:1":"many_to_one","1:m":"one_to_many","m:m":"many_to_many" }[cfg.type]}', indicator=True)`].join("\n\n"); };
const WbStat = ({ label, value, tone }) => <div style={{ ...card, padding:"8px 12px", minWidth:110 }}><div style={{ fontSize:10.5, color:C.dim, textTransform:"uppercase", letterSpacing:".04em" }}>{label}</div><div style={{ fontSize:18, fontWeight:700, color:tone||C.text }}>{value}</div></div>;
const WbChoice = ({ on, onClick, title, sub, extra }) => <button type="button" aria-pressed={on} onClick={onClick} style={{ textAlign:"left", background:on? `${C.gold}18` : C.card, border:`1px solid ${on? C.gold : C.border}`, borderRadius:6, padding:"8px 10px", cursor:"pointer", color:C.text }}>
  <div style={{ fontSize:12.5, fontWeight:600, color:on? C.gold : C.text }}>{title}</div>{sub && <div style={{ fontSize:11, color:C.mid, lineHeight:1.45, marginTop:2 }}>{sub}</div>}{extra}</button>;
function WbCombine({ datasets, addDataset, basketTable, isMobile }) {
  const [mode,setMode]=useState("merge"); const [showCode,setShowCode]=useState(false); const [name,setName]=useState("");
  const srcs=useMemo(()=>{ const o=Object.values(datasets).map(d=>({ id:d.id, name:d.name, tab:d })); return o; },[datasets]);
  const [extraChart,setExtraChart]=useState(null); // the chart data, added on request
  const all=extraChart? [...srcs, { id:"__chart", name:extraChart.name+" (chart data)", tab:extraChart }] : srcs;
  const T=(id)=>all.find(s=>s.id===id)?.tab;
  // ── merge state
  const [a,setA]=useState(""); const [b,setB]=useState(""); const [keys,setKeys]=useState([]); const [type,setType]=useState("1:1"); const [how,setHow]=useState("left");
  const [overlap,setOverlap]=useState("suffix"); const [norm,setNorm]=useState({ trim:true, ci:false, numeric:true }); const [ind,setInd]=useState(true); const [bring,setBring]=useState(null); const [typeTouched,setTypeTouched]=useState(false);
  useEffect(()=>{ if (!a && all[0]) setA(all[0].id); if (!b && all[1]) setB(all[1].id); },[all.length]);
  const L=T(a), R=T(b);
  useEffect(()=>{ if (L && R){ setKeys(cmbGuessKeys(L,R)); setBring(null); setTypeTouched(false); } },[a,b]);
  const uniq=useMemo(()=>{ if (!L||!R||!keys.length||keys.some(k=>!k.l||!k.r)) return null; return { L:cmbUniq(L,keys.map(k=>k.l),norm), R:cmbUniq(R,keys.map(k=>k.r),norm) }; },[L,R,keys,norm]);
  const suggested=uniq? (uniq.L.unique&&uniq.R.unique? "1:1" : uniq.R.unique? "m:1" : uniq.L.unique? "1:m" : "m:m") : null;
  useEffect(()=>{ if (suggested && !typeTouched) setType(suggested==="m:m"? "m:1" : suggested); },[suggested]);
  const overlapCols=L&&R? R.headers.filter(h=>L.headers.includes(h) && !keys.some(k=>k.r===h)) : [];
  const big=(L?.rows.length||0)+(R?.rows.length||0)>300000;
  const [force,setForce]=useState(0);
  const res=useMemo(()=>{ if (mode!=="merge" || !L || !R || !keys.length || keys.some(k=>!k.l||!k.r)) return null; if (big && !force) return { pending:true };
    try { return cmbMerge(L, R, { keys, type, how, overlap, norm, indicator:ind, bring:bring||undefined }); } catch(e){ return { error:e.message }; } },[mode,L,R,keys,type,how,overlap,norm,ind,bring,force]);
  // ── append state
  const [picked,setPicked]=useState([]); const [match,setMatch]=useState("union"); const [ciNames,setCiNames]=useState(false); const [srcCol,setSrcCol]=useState("source"); const [dupCols,setDupCols]=useState([]);
  const appendCols=useMemo(()=>{ const seen=new Set(); return picked.flatMap(id=>T(id)?.headers||[]).filter(h=>{ const k=ciNames? String(h).trim().toLowerCase() : String(h).trim(); if (seen.has(k)) return false; seen.add(k); return true; }); },[picked, all.length, ciNames]);
  const [forceA,setForceA]=useState(0); const bigA=picked.reduce((n,id)=>n+(T(id)?.rows.length||0),0)>300000;
  const ares=useMemo(()=>{ if (mode!=="append" || picked.length<2) return null; if (bigA && !forceA) return { pending:true }; try { return cmbAppend(picked.map(id=>({ name:all.find(s=>s.id===id)?.name||id, ...T(id) })), { match, ci:ciNames, source:srcCol.trim(), keyCheck:dupCols }); } catch(e){ return { error:e.message }; } },[mode,picked,match,ciNames,srcCol,dupCols,all.length,forceA]);
  const out=mode==="merge"? res : ares;
  const defName=mode==="merge"? `${all.find(s=>s.id===a)?.name||"A"} + ${all.find(s=>s.id===b)?.name||"B"}` : `Appended (${picked.length} tables)`;
  const lab={ fontSize:12, color:C.mid, display:"block" };
  if (all.length<1) return <div><p style={wbNote}>You need at least two datasets. Add them in the Datasets tab (upload CSV files, save the chart data or pull tables from PDFs).</p><button type="button" style={wbSmallBtn()} onClick={()=>{ const t=basketTable(); if (t?.rows?.length) setExtraChart(t); }}>Use the current chart data</button></div>;
  return (
    <div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:12 }}>
        <div role="tablist" aria-label="Combine mode" style={{ display:"flex", gap:6 }}>
          <button type="button" role="tab" aria-selected={mode==="merge"} onClick={()=>setMode("merge")} style={{ ...pill(mode==="merge"), padding:"7px 12px" }}>Merge: add columns</button>
          <button type="button" role="tab" aria-selected={mode==="append"} onClick={()=>setMode("append")} style={{ ...pill(mode==="append"), padding:"7px 12px" }}>Append: add rows</button>
        </div>
        {!extraChart && <button type="button" style={wbSmallBtn()} onClick={()=>{ const t=basketTable(); if (t?.rows?.length) setExtraChart(t); else alert("The chart has no data yet."); }}>+ Use the current chart data</button>}
        <span style={{ fontSize:11.5, color:C.dim }}>{mode==="merge"? "Like Stata merge, SAS MERGE … BY, SQL JOIN, dplyr *_join, pandas merge." : "Like Stata append, SAS SET a b, dplyr bind_rows, pandas concat."}</span>
      </div>

      {mode==="merge" && <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"minmax(300px,420px) 1fr", gap:16 }}>
        <div style={{ display:"grid", gap:12, alignContent:"start" }}>
          <div style={{ ...card, padding:"12px 14px", display:"grid", gap:8 }}>
            <label style={lab}>First table (master)<select value={a} onChange={e=>setA(e.target.value)} style={{ ...sel, marginTop:4 }}>{all.map(s=><option key={s.id} value={s.id}>{s.name} ({s.tab.rows.length} rows)</option>)}</select></label>
            <label style={lab}>Second table (using)<select value={b} onChange={e=>setB(e.target.value)} style={{ ...sel, marginTop:4 }}>{all.map(s=><option key={s.id} value={s.id}>{s.name} ({s.tab.rows.length} rows)</option>)}</select></label>
            {a===b && <div style={{ fontSize:12, color:C.orange }}>Both are the same table. That is allowed (a self-merge) but usually a mistake.</div>}
          </div>
          {L && R && <div style={{ ...card, padding:"12px 14px" }}>
            <h3 style={wbH}>1. Key variables</h3>
            <p style={{ ...wbNote, marginTop:0 }}>The columns that link a row in one table to a row in the other. A panel usually needs two keys, such as country and year.</p>
            {keys.map((k,i)=><div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 18px 1fr 24px", gap:6, alignItems:"center", marginBottom:6 }}>
              <select aria-label={`Key ${i+1} in first table`} value={k.l} onChange={e=>setKeys(ks=>ks.map((x,j)=>j===i? { ...x, l:e.target.value, r:x.r||(R.headers.includes(e.target.value)? e.target.value : "") } : x))} style={{ ...sel, padding:"6px 8px" }}><option value="">Choose…</option>{L.headers.map(h=><option key={h} value={h}>{h}</option>)}</select>
              <span style={{ textAlign:"center", color:C.dim }}>=</span>
              <select aria-label={`Key ${i+1} in second table`} value={k.r} onChange={e=>setKeys(ks=>ks.map((x,j)=>j===i? { ...x, r:e.target.value } : x))} style={{ ...sel, padding:"6px 8px" }}><option value="">Choose…</option>{R.headers.map(h=><option key={h} value={h}>{h}</option>)}</select>
              <button type="button" aria-label={`Remove key ${i+1}`} onClick={()=>setKeys(ks=>ks.filter((_,j)=>j!==i))} style={{ background:"none", border:"none", color:C.red, cursor:"pointer" }}>✕</button>
            </div>)}
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              <button type="button" style={wbSmallBtn()} onClick={()=>setKeys(ks=>[...ks, { l:"", r:"" }])}>+ Add key</button>
              <button type="button" style={wbSmallBtn()} onClick={()=>setKeys(cmbGuessKeys(L,R))}>Suggest keys</button>
            </div>
            <details style={{ marginTop:8 }}><summary style={{ fontSize:12, color:C.mid, cursor:"pointer" }}>Key options</summary>
              <div style={{ display:"grid", gap:4, marginTop:6 }}>
                {[["trim","Ignore extra spaces"],["ci","Ignore upper/lower case (Ghana = GHANA)"],["numeric","Treat 2020 and 2020.0 as the same"]].map(([k,l])=><label key={k} style={{ fontSize:12, color:C.text, display:"flex", gap:6, alignItems:"center" }}><input type="checkbox" checked={norm[k]!==false && !!norm[k]} onChange={e=>setNorm(n=>({ ...n, [k]:e.target.checked }))}/>{l}</label>)}
              </div></details>
            {uniq && <div style={{ marginTop:10, fontSize:12, lineHeight:1.6 }}>
              <div style={{ color:uniq.L.unique? C.teal : C.orange }}>{uniq.L.unique? "✓ Unique in the first table" : `Repeats in the first table: ${uniq.L.dups.length} value${uniq.L.dups.length>1?"s":""} (e.g. ${uniq.L.dups.slice(0,3).map(d=>`${d.key} ${d.n}×`).join(", ")})`}</div>
              <div style={{ color:uniq.R.unique? C.teal : C.orange }}>{uniq.R.unique? "✓ Unique in the second table" : `Repeats in the second table: ${uniq.R.dups.length} value${uniq.R.dups.length>1?"s":""} (e.g. ${uniq.R.dups.slice(0,3).map(d=>`${d.key} ${d.n}×`).join(", ")})`}</div>
              {(uniq.L.blank+uniq.R.blank)>0 && <div style={{ color:C.orange }}>{uniq.L.blank+uniq.R.blank} row{uniq.L.blank+uniq.R.blank>1?"s have":" has"} a blank key.</div>}
              <div style={{ color:C.mid }}>Suggested merge type: <strong style={{ color:C.text }}>{suggested}</strong>{suggested==="m:m"? " (the key repeats in both tables; add a key such as year, or use many-to-many on purpose)" : ""}</div>
            </div>}
          </div>}
          {L && R && <div style={{ ...card, padding:"12px 14px" }}>
            <h3 style={wbH}>2. Merge type</h3>
            <div style={{ display:"grid", gap:6 }}>{CMB_TYPES.map(([k,t,s])=><WbChoice key={k} on={type===k} onClick={()=>{ setType(k); setTypeTouched(true); }} title={`${k}  ${t}${suggested===k?"  · suggested":""}`} sub={s}/>)}</div>
          </div>}
        </div>
        <div style={{ display:"grid", gap:12, alignContent:"start", minWidth:0 }}>
          {L && R && <div style={{ ...card, padding:"12px 14px" }}>
            <h3 style={wbH}>3. Which rows to keep</h3>
            <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr 1fr", gap:6 }}>{CMB_HOW.map(([k,t,s,st])=><WbChoice key={k} on={how===k} onClick={()=>setHow(k)} title={t} sub={s} extra={<div style={{ fontSize:10.5, color:C.dim, marginTop:3, fontFamily:C.code }}>Stata: {st}</div>}/>)}</div>
            {overlapCols.length>0 && <div style={{ marginTop:12 }}>
              <h3 style={wbH}>Columns in both tables: {overlapCols.join(", ")}</h3>
              <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:6 }}>{CMB_OVERLAP.map(([k,t])=><WbChoice key={k} on={overlap===k} onClick={()=>setOverlap(k)} title={t}/>)}</div>
            </div>}
            <details style={{ marginTop:10 }}><summary style={{ fontSize:12, color:C.mid, cursor:"pointer" }}>Columns to bring from the second table ({(bring||R.headers.filter(h=>!keys.some(k=>k.r===h))).length})</summary>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:6 }}>{R.headers.filter(h=>!keys.some(k=>k.r===h)).map(h=>{ const cur=bring||R.headers.filter(x=>!keys.some(k=>k.r===x)); const on=cur.includes(h);
                return <label key={h} style={{ fontSize:12, color:C.text, display:"flex", gap:4, alignItems:"center", border:`1px solid ${C.border}`, borderRadius:4, padding:"2px 6px" }}><input type="checkbox" checked={on} onChange={()=>setBring(on? cur.filter(x=>x!==h) : [...cur, h])}/>{h}</label>; })}</div></details>
            <label style={{ fontSize:12, color:C.text, display:"flex", gap:6, alignItems:"center", marginTop:8 }}><input type="checkbox" checked={ind} onChange={e=>setInd(e.target.checked)}/> Add a _merge column (1 first table only, 2 second table only, 3 matched)</label>
          </div>}
          <WbCombineResult out={out} pending={res?.pending} onRun={()=>setForce(f=>f+1)} name={name} setName={setName} defName={defName} addDataset={(t)=>addDataset({ ...t, source:"merge" })} showCode={showCode} setShowCode={setShowCode}
            code={L&&R&&keys.length? cmbCode("merge",{ keys, type, how }, all.find(s=>s.id===a)?.name, all.find(s=>s.id===b)?.name) : ""} mode="merge"/>
        </div>
      </div>}

      {mode==="append" && <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"minmax(300px,420px) 1fr", gap:16 }}>
        <div style={{ display:"grid", gap:12, alignContent:"start" }}>
          <div style={{ ...card, padding:"12px 14px" }}>
            <h3 style={wbH}>1. Tables to stack (in order)</h3>
            {all.map(s=>{ const k=picked.indexOf(s.id); return <label key={s.id} style={{ display:"flex", gap:8, alignItems:"center", fontSize:12.5, color:C.text, padding:"4px 0" }}>
              <input type="checkbox" aria-label={`Append ${s.name}`} checked={k>=0} onChange={()=>setPicked(p=>k>=0? p.filter(x=>x!==s.id) : [...p, s.id])}/>{k>=0 && <span style={{ fontSize:11, color:C.gold, minWidth:14 }}>{k+1}</span>}
              <span style={{ flex:1 }}>{s.name}</span><span style={{ fontSize:11, color:C.dim }}>{s.tab.rows.length} rows · {s.tab.headers.length} cols</span></label>; })}
          </div>
          <div style={{ ...card, padding:"12px 14px", display:"grid", gap:8 }}>
            <h3 style={wbH}>2. Columns</h3>
            <WbChoice on={match==="union"} onClick={()=>setMatch("union")} title="Keep all columns" sub="A column missing from one table is left blank for its rows (Stata append)."/>
            <WbChoice on={match==="intersection"} onClick={()=>setMatch("intersection")} title="Only columns in every table" sub="Drops columns that are not in all tables."/>
            <label style={{ fontSize:12, color:C.text, display:"flex", gap:6, alignItems:"center" }}><input type="checkbox" checked={ciNames} onChange={e=>setCiNames(e.target.checked)}/> Match column names ignoring case (Year = year)</label>
            <label style={lab}>Column that records which table each row came from (leave blank for none)<input value={srcCol} onChange={e=>setSrcCol(e.target.value)} style={{ ...inp, marginTop:4 }}/></label>
          </div>
          {appendCols.length>0 && <div style={{ ...card, padding:"12px 14px" }}>
            <h3 style={wbH}>3. Check for duplicate rows (optional)</h3>
            <p style={{ ...wbNote, marginTop:0 }}>Pick the columns that should identify a row, such as country and year, to catch overlapping periods.</p>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>{appendCols.map(h=><label key={h} style={{ fontSize:12, color:C.text, display:"flex", gap:4, alignItems:"center", border:`1px solid ${C.border}`, borderRadius:4, padding:"2px 6px" }}><input type="checkbox" aria-label={`Check duplicates on ${h}`} checked={dupCols.includes(h)} onChange={()=>setDupCols(d=>d.includes(h)? d.filter(x=>x!==h) : [...d, h])}/>{h}</label>)}</div>
          </div>}
        </div>
        <div style={{ minWidth:0 }}>
          {<WbCombineResult out={picked.length<2? null : out} pending={ares?.pending} onRun={()=>setForceA(f=>f+1)} name={name} setName={setName} defName={defName} addDataset={(t)=>addDataset({ ...t, source:"append" })} showCode={showCode} setShowCode={setShowCode}
            code={cmbCode("append",{ names:picked.map(id=>all.find(s=>s.id===id)?.name), source:srcCol.trim(), match })} mode="append"/>}
        </div>
      </div>}
    </div>
  );
}
function WbCombineResult({ out, pending, onRun, name, setName, defName, addDataset, showCode, setShowCode, code, mode }) {
  const verb = mode==="merge"? "Merge" : "Append";
  if (pending) return <div style={card}><p style={{ ...wbNote, marginTop:0 }}>These tables are large, so the result is not worked out until you ask.</p><button type="button" style={btn()} onClick={onRun}>Run the {mode}</button></div>;
  if (!out) return <div style={card}><div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", marginBottom:8 }}><button type="button" style={{ ...btn(), opacity:0.5, cursor:"not-allowed" }} disabled title="Finish the settings on the left first">{verb} and save as dataset</button><span style={{ fontSize:12, color:C.orange }}>{mode==="merge"? "Choose a key column first (step 1)." : "Tick at least two tables first."}</span></div><p style={{ ...wbNote, margin:0 }}>{mode==="merge"? <>On the left: 1) pick the first and the second table, 2) pick the key column in each (the column that identifies a row, such as country or country and year), or press <strong>Suggest keys</strong>. The button then turns on and a preview of the result appears here.</> : <>Tick two or more tables on the left. The button then turns on and a preview of the result appears here.</>}</p></div>;
  if (out.error) return <div role="alert" style={{ ...card, borderColor:C.red }}><h3 style={{ ...wbH, color:C.red }}>Cannot {mode} yet</h3><p style={{ ...wbNote, margin:0, color:C.text }}>{out.error}</p></div>;
  const r=out.report; const pct=(x)=>`${(100*x).toFixed(0)}%`;
  return (
    <div style={{ display:"grid", gap:12 }}>
      <div style={{ ...card, padding:"12px 14px", borderColor:`${C.gold}88`, display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        <input aria-label="New dataset name" value={name} onChange={e=>setName(e.target.value)} placeholder={defName} style={{ ...inp, maxWidth:300, flex:"1 1 200px" }}/>
        <button type="button" style={btn()} disabled={!out.rows.length} onClick={()=>addDataset({ name:(name||defName).trim(), headers:out.headers, rows:out.rows })}>{verb} and save as dataset</button>
        <span style={{ fontSize:11.5, color:C.mid, flex:"1 1 220px" }}>Preview of the result below ({out.rows.length.toLocaleString()} rows). It updates as you change the settings; nothing is saved until you press the button. Your original tables are not changed.</span>
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {mode==="merge"? <>
          <WbStat label="First table" value={r.nL}/><WbStat label="Second table" value={r.nR}/><WbStat label="Result rows" value={r.nOut}/>
          <WbStat label="Matched (first)" value={`${r.masterMatched} · ${pct(r.matchRate)}`} tone={r.matchRate>0.9? C.teal : r.matchRate>0.5? C.orange : C.red}/>
          <WbStat label="First only" value={r.masterOnly} tone={r.masterOnly? C.orange : C.teal}/><WbStat label="Second only" value={r.usingOnly} tone={r.usingOnly? C.orange : C.teal}/>
        </> : <><WbStat label="Rows" value={r.n}/><WbStat label="Columns" value={r.columns}/>{r.tables.map(t=><WbStat key={t.name} label={t.name} value={`${t.rows} rows`}/>)}{r.dupKeys>0 && <WbStat label="Duplicate keys" value={r.dupKeys} tone={C.orange}/>}</>}
      </div>
      {out.warn.length>0 && <div style={{ ...card, padding:"10px 14px", borderColor:`${C.orange}88` }}>{out.warn.map((w,i)=><div key={i} style={{ fontSize:12, color:C.text, lineHeight:1.55, marginBottom:3 }}><span style={{ color:C.orange }}>! </span>{w}</div>)}</div>}
      {mode==="merge" && (r.unmatchedL.length>0 || r.unmatchedR.length>0) && <div style={{ ...card, padding:"10px 14px", fontSize:12, color:C.mid, lineHeight:1.6 }}>
        {r.unmatchedL.length>0 && <div><strong style={{ color:C.text }}>No match in the second table:</strong> {r.unmatchedL.join("; ")}{r.masterOnly>r.unmatchedL.length? " …" : ""}</div>}
        {r.unmatchedR.length>0 && <div><strong style={{ color:C.text }}>No match in the first table:</strong> {r.unmatchedR.join("; ")}{r.usingOnly>r.unmatchedR.length? " …" : ""}</div>}
        <div style={{ color:C.dim }}>Common causes: different spellings or codes (Côte d'Ivoire / Cote d'Ivoire, GH / GHA), years outside the other table's range, or rows that truly have no partner.</div>
      </div>}
      <WbGrid tab={out} highlight={mode==="merge"? out.headers.filter(h=>h==="_merge") : []} max={150} height={340}/>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        <button type="button" style={wbSmallBtn()} onClick={()=>setShowCode(v=>!v)}>{showCode? "Hide" : "Show"} the same step in Stata, SAS, R and Python</button>
      </div>
      {showCode && <pre style={{ ...card, padding:"10px 14px", fontFamily:C.code, fontSize:11.5, color:C.text, whiteSpace:"pre-wrap", margin:0 }}>{code}</pre>}
    </div>
  );
}
// ══════════════════════════════════════════════
// LONG PANEL IMPORT: the file has many units (firms, countries…) per date; choose what to chart
// ══════════════════════════════════════════════
const ecoPanelSlice = (P, tcol, ucol, unit) => ({ headers:P.headers.filter((_,j)=>j!==ucol), rows:P.rows.filter(r=>String(r[ucol])===unit).map(r=>r.filter((_,j)=>j!==ucol)) });
const ecoPanelWide = (P, tcol, ucol, vcol, units) => { const want=new Set(units); const by=new Map(); P.rows.forEach(r=>{ const u=String(r[ucol]); if (!want.has(u)) return; const t=r[tcol]; if (!by.has(t)) by.set(t,{}); by.get(t)[u]=r[vcol]; });
  const ts=[...by.keys()].sort(ecoTimeCmp); return { headers:[P.headers[tcol], ...units.map(u=>`${P.headers[vcol]} · ${u}`)], rows:ts.map(t=>[t, ...units.map(u=>by.get(t)[u]??"")]) }; };
const ecoPanelMean = (P, tcol) => { const ser=csvToSeries(P.headers, P.rows, tcol); const cols=Object.keys(ser); const by=new Map(); cols.forEach((c,k)=>ser[c].forEach(d=>{ if (!by.has(d.year)) by.set(d.year,new Array(cols.length).fill("")); by.get(d.year)[k]=+d.value.toPrecision(8); }));
  const ts=[...by.keys()].sort(ecoTimeCmp); return { headers:[P.headers[tcol], ...cols.map(c=>`${c} (average)`)], rows:ts.map(t=>[t, ...by.get(t)]) }; };
function PanelImportModal({ pick, maxVars, onChart, onKeep, onClose }) {
  const { parsed:P, name, tcol, unitCol, unitName, units, nTimes, nRows, fromWorkbench }=pick;
  const numCols=P.headers.map((h,j)=>j).filter(j=>j!==tcol && j!==unitCol && P.rows.slice(0,400).filter(r=>isFinite(parseFloat(String(r[j]).replace(/[$,%\s]/g,"")))).length>40);
  const [mode,setMode]=useState("one"); const [q,setQ]=useState(""); const [unit,setUnit]=useState(units[0]?.u||""); const [picks,setPicks]=useState(units.slice(0,Math.min(3,maxVars)).map(x=>x.u)); const [vcol,setVcol]=useState(numCols[0]??-1); const [keep,setKeep]=useState(!fromWorkbench);
  const list=units.filter(x=>!q || x.u.toLowerCase().includes(q.toLowerCase())).slice(0,300);
  useEffect(()=>{ const k=(e)=>{ if (e.key==="Escape") onClose(); }; window.addEventListener("keydown",k); return ()=>window.removeEventListener("keydown",k); },[onClose]);
  const go=()=>{ if (keep) onKeep({ name, headers:P.headers, rows:P.rows });
    if (mode==="one") onChart(ecoPanelSlice(P, tcol, unitCol, unit), `${name} – ${unit}`);
    else if (mode==="compare") onChart(ecoPanelWide(P, tcol, unitCol, vcol, picks), `${name} – ${P.headers[vcol]}`);
    else onChart(ecoPanelMean(P, tcol), `${name} – average`); };
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="panel-title" style={{ position:"fixed", inset:0, background:C.overlay, zIndex:450, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:C.surface, border:`1px solid ${C.borderHi}`, borderRadius:10, width:"100%", maxWidth:620, maxHeight:"90vh", overflow:"auto", padding:"20px 22px", boxShadow:C.shadow }}>
        <h2 id="panel-title" style={{ fontSize:16, margin:"0 0 4px", color:C.text }}>This file holds many {unitName} values per date</h2>
        <p style={{ ...wbNote, marginTop:0 }}>{nRows.toLocaleString()} rows: {units.length.toLocaleString()} {unitName} values × {nTimes.toLocaleString()} {P.headers[tcol]} values. Charting every row at once would be unreadable and slow, so choose what to show.</p>
        <div style={{ display:"grid", gap:6, marginBottom:12 }}>
          <WbChoice on={mode==="one"} onClick={()=>setMode("one")} title={`One ${unitName}`} sub="All variables for a single unit (e.g. one firm or one country)."/>
          <WbChoice on={mode==="compare"} onClick={()=>setMode("compare")} title={`Compare several ${unitName} values`} sub={`One variable, up to ${maxVars} units side by side.`}/>
          <WbChoice on={mode==="mean"} onClick={()=>setMode("mean")} title={`Average across all ${unitName} values`} sub="One series per variable: the mean for each date (an equal-weighted index)."/>
        </div>
        {mode==="compare" && numCols.length>0 && <label style={{ fontSize:12, color:C.mid, display:"block", marginBottom:8 }}>Variable<select value={vcol} onChange={e=>setVcol(+e.target.value)} style={{ ...sel, marginTop:4 }}>{numCols.map(j=><option key={j} value={j}>{P.headers[j]}</option>)}</select></label>}
        {mode!=="mean" && <>
          <input aria-label={`Search ${unitName}`} value={q} onChange={e=>setQ(e.target.value)} placeholder={`Search ${units.length} ${unitName} values`} style={{ ...inp, marginBottom:6 }}/>
          <div style={{ maxHeight:220, overflow:"auto", border:`1px solid ${C.border}`, borderRadius:6, padding:6 }}>
            {list.map(x=>mode==="one"? <label key={x.u} style={{ display:"flex", gap:6, alignItems:"center", fontSize:12.5, color:C.text, padding:"2px 4px" }}><input type="radio" name="panel-unit" checked={unit===x.u} onChange={()=>setUnit(x.u)}/>{x.u}<span style={{ marginLeft:"auto", color:C.dim, fontSize:11 }}>{x.n} rows</span></label>
              : <label key={x.u} style={{ display:"flex", gap:6, alignItems:"center", fontSize:12.5, color:C.text, padding:"2px 4px" }}><input type="checkbox" checked={picks.includes(x.u)} disabled={!picks.includes(x.u) && picks.length>=maxVars} onChange={()=>setPicks(s=>s.includes(x.u)? s.filter(y=>y!==x.u) : [...s, x.u])}/>{x.u}<span style={{ marginLeft:"auto", color:C.dim, fontSize:11 }}>{x.n} rows</span></label>)}
            {units.length>300 && !q && <div style={{ fontSize:11, color:C.dim, padding:4 }}>Showing the 300 largest. Search to find others.</div>}
          </div>
          {mode==="compare" && <div style={{ fontSize:11.5, color:C.mid, marginTop:4 }}>{picks.length} of {maxVars} chosen: {picks.join(", ")}</div>}
        </>}
        {!fromWorkbench && <label style={{ display:"flex", gap:6, alignItems:"center", fontSize:12, color:C.text, marginTop:10 }}><input type="checkbox" checked={keep} onChange={e=>setKeep(e.target.checked)}/> Also keep the full file in Data Workbench (for merging, formulas and the Impact Lab)</label>}
        <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:14 }}>
          <button type="button" onClick={onClose} style={{ ...pill(false), padding:"8px 14px" }}>Cancel</button>
          <button type="button" style={btn()} disabled={(mode==="one" && !unit) || (mode==="compare" && (!picks.length || vcol<0))} onClick={go}>Chart it</button>
        </div>
      </div>
    </div>
  );
}
// ══════════════════════════════════════════════
// OPTIMIZATION: linear and integer programming (UI)
// ══════════════════════════════════════════════
const LP_EXAMPLES = [
  ["farm","Farm plan (land and labour)",`# How many hectares of each crop on a 10 ha farm? Profit is in GH₵ per hectare (illustrative numbers).
max: 3000 maize + 9000 cocoa + 4000 cassava + 5000 yam

land:   maize + cocoa + cassava + yam <= 10            # hectares
labour: 20 maize + 60 cocoa + 25 cassava + 40 yam <= 400   # person-days
food:   maize + cassava >= 3                           # keep 3 ha for household food`],
  ["production","Production mix (Wyndor)",`# Two products made in three plants (Hillier and Lieberman's textbook example).
# Profit per batch: doors 3, windows 5. Hours available per week in each plant.
max: 3 doors + 5 windows

plant1: doors <= 4
plant2: 2 windows <= 12
plant3: 3 doors + 2 windows <= 18`],
  ["diet","Least-cost diet",`# Cheapest daily food basket that meets nutrition targets (illustrative numbers, cost per serving).
min: 0.6 rice + 0.35 beans + 0.8 fish + 0.25 gari

protein: 4 rice + 15 beans + 20 fish + 1 gari >= 60    # grams
energy:  200 rice + 220 beans + 150 fish + 350 gari >= 2000   # kcal
iron:    0.4 rice + 3 beans + 1 fish + 0.5 gari >= 12  # mg
gari <= 3            # at most 3 servings of gari`],
  ["projects","Project selection (yes/no)",`# Which district projects to fund with a budget of 140 (benefit score, cost in GH₵ 1,000s).
max: 120 road + 80 school + 150 clinic + 60 borehole + 90 market

budget: 50 road + 30 school + 70 clinic + 15 borehole + 40 market <= 140
health: clinic + borehole >= 1        # fund at least one health project
bin road, school, clinic, borehole, market`],
  ["transport","Transport (least-cost shipping)",`# Ship maize (tonnes) from two warehouses to three markets at the lowest cost per tonne.
min: 4 tam_acc + 6 tam_kum + 9 tam_tak + 5 tec_acc + 3 tec_kum + 7 tec_tak

supply_tamale:   tam_acc + tam_kum + tam_tak <= 300
supply_techiman: tec_acc + tec_kum + tec_tak <= 250
demand_accra:    tam_acc + tec_acc >= 200
demand_kumasi:   tam_kum + tec_kum >= 180
demand_takoradi: tam_tak + tec_tak >= 120`],
  ["staffing","Staff rostering (whole numbers)",`# Nurses starting a 8-hour shift at each time; cover the minimum needed in every 4-hour block.
min: s0 + s4 + s8 + s12 + s16 + s20

b0:  s20 + s0  >= 6
b4:  s0  + s4  >= 8
b8:  s4  + s8  >= 12
b12: s8  + s12 >= 10
b16: s12 + s16 >= 9
b20: s16 + s20 >= 7
int s0, s4, s8, s12, s16, s20`],
];
const lpEmptyCfg = () => ({ ds:"", nameCol:"", objCol:"", sense:"max", varType:"cont", lower:"0", upper:"", lowerCol:"", upperCol:"", cons:[] });
const lpFmt = (v, d=4) => v==null || !isFinite(v)? "—" : Math.abs(v)>=1e6? v.toExponential(3) : String(+(+v).toFixed(d));
function WbOptimize({ datasets, addDataset, optim, setOptim, isMobile }) {
  const st={ mode:"table", text:LP_EXAMPLES[0][2], cfg:lpEmptyCfg(), ...(optim||{}) }; const set=(p)=>setOptim(o=>({ mode:"table", text:LP_EXAMPLES[0][2], cfg:lpEmptyCfg(), ...(o||{}), ...p }));
  const cfg={ ...lpEmptyCfg(), ...st.cfg }; const setCfg=(p)=>set({ cfg:{ ...cfg, ...p } });
  const ids=Object.keys(datasets); const D=datasets[cfg.ds]; const H=D?.headers||[];
  const numCols=useMemo(()=>D? H.filter((h,j)=>{ const v=D.rows.map(r=>r[j]).filter(x=>x!==""&&x!=null); return v.length && v.filter(x=>isFinite(parseFloat(String(x).replace(/[,$%\s]/g,"")))).length/v.length>0.8; }) : [],[cfg.ds, D?.headers?.join("|"), D?.rows?.length]);
  const catCols=H.filter(h=>!numCols.includes(h));
  useEffect(()=>{ if (!cfg.ds && ids[0]) setCfg({ ds:ids[0] }); },[ids.length]);
  useEffect(()=>{ if (D && !cfg.objCol && numCols[0]) setCfg({ objCol:numCols[0], nameCol:catCols[0]||"" }); },[cfg.ds]);
  const [res,setRes]=useState(null); const [busy,setBusy]=useState(false); const taRef=useRef(null);
  const built=useMemo(()=>{ if (st.mode!=="table" || !D || !cfg.objCol) return null; try { return lpFromTable(D, cfg); } catch(e){ return { error:e.message }; } },[st.mode, D, JSON.stringify(cfg)]);
  const parsed=useMemo(()=>st.mode==="text"? lpParse(st.text) : null,[st.mode, st.text]);
  const solve=()=>{ setBusy(true); setRes(null); setTimeout(()=>{ try {
      const model=st.mode==="table"? built?.model : parsed?.model; if (!model) { setBusy(false); return; }
      if (st.mode==="text" && parsed.errors.length){ setRes({ status:"error", message:parsed.errors.join("\n") }); setBusy(false); return; }
      const t0=performance.now(); const r=lpSolve(model); setRes({ ...r, model, ms:performance.now()-t0, mode:st.mode, names:built?.names, ds:cfg.ds });
    } catch(e){ setRes({ status:"error", message:e.message }); } setBusy(false); }, 20); };
  const consRow=(c,i)=>(
    <div key={i} style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"1.3fr 1.2fr 0.9fr 64px 0.8fr 1fr 24px", gap:6, alignItems:"center", marginBottom:6 }}>
      <select aria-label={`Constraint ${i+1} uses`} value={c.coefCol} onChange={e=>setCfg({ cons:cfg.cons.map((x,j)=>j===i? { ...x, coefCol:e.target.value } : x) })} style={{ ...sel, padding:"6px 8px" }}><option value="">Uses (column)…</option><option value="__count">Number of rows chosen</option>{numCols.map(h=><option key={h} value={h}>{h}</option>)}</select>
      <select aria-label={`Constraint ${i+1} only rows where`} value={c.whereCol||""} onChange={e=>setCfg({ cons:cfg.cons.map((x,j)=>j===i? { ...x, whereCol:e.target.value, whereVal:"" } : x) })} style={{ ...sel, padding:"6px 8px" }}><option value="">All rows</option>{catCols.map(h=><option key={h} value={h}>Only where {h} =</option>)}</select>
      {c.whereCol? <select aria-label={`Constraint ${i+1} value`} value={c.whereVal||""} onChange={e=>setCfg({ cons:cfg.cons.map((x,j)=>j===i? { ...x, whereVal:e.target.value } : x) })} style={{ ...sel, padding:"6px 8px" }}><option value="">Value…</option>{[...new Set(D.rows.map(r=>String(r[H.indexOf(c.whereCol)]??"").trim()))].slice(0,200).map(v=><option key={v} value={v}>{v}</option>)}</select> : <span/>}
      <select aria-label={`Constraint ${i+1} sign`} value={c.op} onChange={e=>setCfg({ cons:cfg.cons.map((x,j)=>j===i? { ...x, op:e.target.value } : x) })} style={{ ...sel, padding:"6px 4px" }}><option value="<=">≤</option><option value=">=">≥</option><option value="=">=</option></select>
      <input aria-label={`Constraint ${i+1} limit`} value={c.rhs} onChange={e=>setCfg({ cons:cfg.cons.map((x,j)=>j===i? { ...x, rhs:e.target.value } : x) })} placeholder="Limit" style={{ ...inp, padding:"6px 8px" }}/>
      <input aria-label={`Constraint ${i+1} name`} value={c.label||""} onChange={e=>setCfg({ cons:cfg.cons.map((x,j)=>j===i? { ...x, label:e.target.value } : x) })} placeholder="Name (optional)" style={{ ...inp, padding:"6px 8px" }}/>
      <button type="button" aria-label={`Remove constraint ${i+1}`} onClick={()=>setCfg({ cons:cfg.cons.filter((_,j)=>j!==i) })} style={{ background:"none", border:"none", color:C.red, cursor:"pointer" }}>✕</button>
    </div>);
  const lab={ fontSize:12, color:C.mid, display:"block" };
  return (
    <div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:12 }}>
        <div role="tablist" aria-label="Optimization mode" style={{ display:"flex", gap:6 }}>
          <button type="button" role="tab" aria-selected={st.mode==="table"} onClick={()=>{ set({ mode:"table" }); setRes(null); }} style={{ ...pill(st.mode==="table"), padding:"7px 12px" }}>From a dataset</button>
          <button type="button" role="tab" aria-selected={st.mode==="text"} onClick={()=>{ set({ mode:"text" }); setRes(null); }} style={{ ...pill(st.mode==="text"), padding:"7px 12px" }}>Write a model</button>
        </div>
        <span style={{ fontSize:11.5, color:C.dim }}>Linear programming (simplex) with shadow prices, plus whole-number and yes/no decisions (branch and bound).</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"minmax(340px,1.1fr) 1fr", gap:16 }}>
        <div style={{ minWidth:0 }}>
          {st.mode==="table" && (!ids.length? <p style={wbNote}>Add a dataset first. Each row becomes one decision (a crop, product, project or asset), and its columns give the profit or cost and how much of each resource it uses.</p> : <div style={{ display:"grid", gap:12 }}>
            <div style={{ ...card, padding:"12px 14px", display:"grid", gap:8 }}>
              <h3 style={{ ...wbH, margin:0 }}>1. The decisions</h3>
              <p style={{ ...wbNote, margin:0 }}>EcoScope chooses a value for every row (how much of it, or whether to pick it).</p>
              <label style={lab}>Dataset<select aria-label="Optimization dataset" value={cfg.ds} onChange={e=>setCfg({ ...lpEmptyCfg(), ds:e.target.value })} style={{ ...sel, marginTop:4 }}>{ids.map(k=><option key={k} value={k}>{datasets[k].name} ({datasets[k].rows.length} rows)</option>)}</select></label>
              <label style={lab}>Row names (for the results)<select value={cfg.nameCol} onChange={e=>setCfg({ nameCol:e.target.value })} style={{ ...sel, marginTop:4 }}><option value="">Row number</option>{H.map(h=><option key={h} value={h}>{h}</option>)}</select></label>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <label style={lab}>Goal<select value={cfg.sense} onChange={e=>setCfg({ sense:e.target.value })} style={{ ...sel, marginTop:4 }}><option value="max">Maximize</option><option value="min">Minimize</option></select></label>
                <label style={lab}>the total of<select value={cfg.objCol} onChange={e=>setCfg({ objCol:e.target.value })} style={{ ...sel, marginTop:4 }}><option value="">Choose…</option>{numCols.map(h=><option key={h} value={h}>{h}</option>)}</select></label>
              </div>
              <label style={lab}>Each decision is<select value={cfg.varType} onChange={e=>setCfg({ varType:e.target.value })} style={{ ...sel, marginTop:4 }}><option value="cont">An amount (can be fractional, e.g. hectares, tonnes)</option><option value="int">A whole number (e.g. trucks, staff)</option><option value="bin">Yes or no (pick the row or not)</option></select></label>
              {cfg.varType!=="bin" && <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <label style={lab}>Smallest amount<select value={cfg.lowerCol? "col:"+cfg.lowerCol : "num"} onChange={e=>setCfg({ lowerCol:e.target.value.startsWith("col:")? e.target.value.slice(4) : "" })} style={{ ...sel, marginTop:4 }}><option value="num">A number</option>{numCols.map(h=><option key={h} value={"col:"+h}>From column {h}</option>)}</select>{!cfg.lowerCol && <input aria-label="Smallest amount" value={cfg.lower} onChange={e=>setCfg({ lower:e.target.value })} style={{ ...inp, marginTop:4 }}/>}</label>
                <label style={lab}>Largest amount<select value={cfg.upperCol? "col:"+cfg.upperCol : "num"} onChange={e=>setCfg({ upperCol:e.target.value.startsWith("col:")? e.target.value.slice(4) : "" })} style={{ ...sel, marginTop:4 }}><option value="num">A number (blank = no limit)</option>{numCols.map(h=><option key={h} value={"col:"+h}>From column {h}</option>)}</select>{!cfg.upperCol && <input aria-label="Largest amount" value={cfg.upper} onChange={e=>setCfg({ upper:e.target.value })} placeholder="no limit" style={{ ...inp, marginTop:4 }}/>}</label>
              </div>}
            </div>
            <div style={{ ...card, padding:"12px 14px" }}>
              <h3 style={wbH}>2. Limits (constraints)</h3>
              <p style={{ ...wbNote, marginTop:0 }}>Each limit adds up a column over the chosen amounts, e.g. total land ≤ 10, total labour ≤ 400, at most 3 projects, or at most 6 ha in the South region.</p>
              {cfg.cons.map(consRow)}
              <button type="button" style={wbSmallBtn()} onClick={()=>setCfg({ cons:[...cfg.cons, { coefCol:numCols.find(h=>h!==cfg.objCol)||"__count", op:"<=", rhs:"", label:"" }] })}>+ Add limit</button>
            </div>
            {built?.error && <div role="alert" style={{ ...card, padding:"10px 14px", borderColor:`${C.red}88`, fontSize:12.5, color:C.text }}>{built.error}</div>}
            {built?.warn?.length>0 && <div style={{ ...card, padding:"10px 14px", borderColor:`${C.orange}88` }}>{built.warn.map((w,i)=><div key={i} style={{ fontSize:12, color:C.text }}><span style={{ color:C.orange }}>! </span>{w}</div>)}</div>}
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <button type="button" style={btn()} disabled={!built?.model || busy} onClick={solve}>{busy? "Solving…" : "Solve"}</button>
              <button type="button" style={wbSmallBtn()} disabled={!built?.model} onClick={()=>{ set({ mode:"text", text:`# Built from the dataset "${D?.name}". Edit freely, then Solve.\n`+lpToText(built.model) }); setRes(null); }}>Open as model text</button>
            </div>
          </div>)}
          {st.mode==="text" && <div style={{ display:"grid", gap:10 }}>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
              <label style={{ fontSize:12, color:C.mid }}>Start from an example <select aria-label="Examples" value="" onChange={e=>{ const ex=LP_EXAMPLES.find(x=>x[0]===e.target.value); if (ex){ set({ text:ex[2] }); setRes(null); } }} style={{ ...sel, width:"auto", padding:"5px 8px", fontSize:12 }}><option value="">Choose…</option>{LP_EXAMPLES.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
            </div>
            <textarea ref={taRef} aria-label="Model" value={st.text} onChange={e=>set({ text:e.target.value })} onKeyDown={e=>{ if ((e.ctrlKey||e.metaKey) && e.key==="Enter"){ e.preventDefault(); solve(); } }} spellCheck={false} rows={14}
              style={{ ...inp, fontFamily:C.code, fontSize:13, lineHeight:1.6, resize:"vertical" }}/>
            {parsed && parsed.errors.length>0 && <div role="alert" style={{ fontSize:12, color:C.red, lineHeight:1.6 }}>{parsed.errors.map((e,i)=><div key={i}>{e}</div>)}</div>}
            {parsed && !parsed.errors.length && <div style={{ fontSize:11.5, color:C.dim }}>{parsed.model.vars.length} variables · {parsed.model.cons.length} constraints{parsed.model.ints.length? ` · ${parsed.model.ints.length} whole-number or yes/no` : ""}</div>}
            <div style={{ display:"flex", gap:8, alignItems:"center" }}><button type="button" style={btn()} disabled={busy} onClick={solve}>{busy? "Solving…" : "Solve"}</button><span style={{ fontSize:11, color:C.dim }}>Ctrl + Enter</span></div>
            <details><summary style={{ fontSize:12, color:C.mid, cursor:"pointer" }}>How to write a model</summary>
              <div style={{ ...wbNote, marginTop:6 }}>
                <div>One statement per line. Lines starting with # are notes.</div>
                <div><code>max: 3x + 5y</code> or <code>min: cost_a + 2 cost_b</code> is the goal (one only).</div>
                <div><code>land: x + y &lt;= 10</code> is a named limit. Use <code>&lt;=</code>, <code>&gt;=</code> or <code>=</code>; variables may appear on both sides.</div>
                <div><code>2 &lt;= x + y &lt;= 8</code> sets a range.</div>
                <div><code>x &lt;= 4</code> on its own (no name) is a bound on one variable. Give it a name to get its shadow price.</div>
                <div>Variables are 0 or more unless you write <code>x &gt;= -5</code> or <code>free x</code>.</div>
                <div><code>int x, y</code> makes whole numbers; <code>bin a, b</code> makes yes/no (0 or 1).</div>
              </div></details>
          </div>}
        </div>
        <div style={{ minWidth:0 }}><LpResult res={res} D={st.mode==="table"? D : null} cfg={cfg} addDataset={addDataset}/></div>
      </div>
    </div>
  );
}
function LpResult({ res, D, cfg, addDataset }) {
  if (!res) return <div style={{ ...card, padding:"14px 16px" }}><h3 style={wbH}>Results</h3><p style={{ ...wbNote, margin:0 }}>Set up the problem and press Solve. You will see the best values, the objective, which limits are binding and how much one more unit of each limit is worth (shadow price).</p></div>;
  if (res.status==="error") return <div role="alert" style={{ ...card, borderColor:C.red }}><h3 style={{ ...wbH, color:C.red }}>The model has errors</h3><pre style={{ ...wbNote, whiteSpace:"pre-wrap", margin:0, color:C.text }}>{res.message}</pre></div>;
  const ok=res.status==="optimal"||res.status==="feasible"; const M=res.model;
  const vars=M.vars.map(v=>({ v, val:res.x? res.x[v] : null, c:M.obj[v]||0, rc:res.reduced? res.reduced[v] : null }));
  const nz=vars.filter(x=>Math.abs(x.val||0)>1e-9);
  const cons=M.cons.map(c=>({ ...c, lhs:res.lhs? res.lhs[c.name] : null, slack:res.slack? res.slack[c.name] : null, dual:res.duals? res.duals[c.name] : null, binding:res.slack? Math.abs(res.slack[c.name])<1e-7*Math.max(1,Math.abs(c.rhs)) : false }));
  const unit=cfg?.objCol||"objective";
  const saveTable=()=>{ if (D && res.names){ const vals=res.names.map(v=>res.x[v]); const oj=D.headers.indexOf(cfg.objCol);
      addDataset({ name:`${D.name} (optimal plan)`, headers:[...D.headers, "optimal_value", "contribution"], rows:D.rows.map((r,i)=>{ const v=vals[i]; const c=parseFloat(String(r[oj]??"").replace(/[,$%\s]/g,"")); return [...r, v==null? "" : lpFmt(v,6), v==null||!isFinite(c)? "" : lpFmt(v*c,6)]; }), source:"formula" }); }
    else addDataset({ name:"Optimization result", headers:["variable","value","objective_coefficient","reduced_cost"], rows:vars.map(x=>[x.v, lpFmt(x.val,6), x.c, x.rc==null? "" : lpFmt(x.rc,6)]), source:"formula" }); };
  return (
    <div style={{ display:"grid", gap:12 }}>
      <div style={{ ...card, padding:"12px 16px", borderColor:ok? `${C.teal}88` : `${C.red}88` }}>
        <div style={{ fontSize:12.5, fontWeight:700, color:ok? C.teal : C.red }}>{LP_STATUS[res.status]||res.status}</div>
        {ok && <div style={{ fontSize:26, fontWeight:700, color:C.text, marginTop:2 }}>{lpFmt(res.obj)}</div>}
        {ok && <div style={{ fontSize:11.5, color:C.mid }}>{M.sense==="max"? "Maximum" : "Minimum"} {D? `total ${unit}` : "objective"} · {M.vars.length} variables · {M.cons.length} constraints · {res.isMIP? `${res.nodes} branch-and-bound nodes` : `${res.iters} simplex steps`} · {res.ms<1? "<1" : res.ms.toFixed(0)} ms</div>}
        {res.status==="infeasible" && <p style={{ ...wbNote, marginBottom:0 }}>Some limits contradict each other (for example "at least 3" and "at most 2" of the same thing), or a minimum is above what the resources allow. Loosen or remove a limit and solve again.</p>}
        {res.status==="unbounded" && <p style={{ ...wbNote, marginBottom:0 }}>Nothing stops the objective from growing. Add a limit on a resource or an upper bound on the decisions.</p>}
        {res.isMIP && ok && <p style={{ ...wbNote, marginBottom:0 }}>Whole-number or yes/no decisions: shadow prices are not reported because they are not meaningful for integer models. The best fractional answer was {lpFmt(res.relaxObj)}{res.limited? "; the search stopped early" : ""}.</p>}
      </div>
      {ok && <div style={{ ...card, padding:"10px 14px" }}>
        <h3 style={wbH}>Decisions ({nz.length} of {vars.length} not zero)</h3>
        <div style={{ maxHeight:260, overflow:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse" }}><thead><tr>{["Variable","Value","Objective coefficient",...(res.reduced? ["Reduced cost"] : [])].map(h=><th key={h} style={{ ...wbCell, textAlign:"left", position:"sticky", top:0, background:C.raised }}>{h}</th>)}</tr></thead>
          <tbody>{vars.map(x=><tr key={x.v} style={{ opacity:Math.abs(x.val||0)>1e-9? 1 : 0.55 }}><td style={wbCell}>{x.v}</td><td style={{ ...wbCell, fontWeight:600 }}>{lpFmt(x.val)}</td><td style={wbCell}>{lpFmt(x.c)}</td>{res.reduced && <td style={wbCell} title="How much the objective would change if this variable were forced up by one unit">{lpFmt(x.rc)}</td>}</tr>)}</tbody></table></div>
      </div>}
      {ok && cons.length>0 && <div style={{ ...card, padding:"10px 14px" }}>
        <h3 style={wbH}>Limits</h3>
        <div style={{ maxHeight:260, overflow:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse" }}><thead><tr>{["Limit","Used","","Available","Slack",...(res.duals? ["Shadow price"] : [])].map((h,i)=><th key={i} style={{ ...wbCell, textAlign:"left", position:"sticky", top:0, background:C.raised }}>{h}</th>)}</tr></thead>
          <tbody>{cons.map(c=><tr key={c.name}><td style={wbCell}>{c.name}{c.binding && <span style={{ marginLeft:6, fontSize:10, color:C.gold, border:`1px solid ${C.gold}`, borderRadius:3, padding:"0 4px" }}>binding</span>}</td><td style={wbCell}>{lpFmt(c.lhs)}</td><td style={wbCell}>{c.op==="<="? "≤" : c.op===">="? "≥" : "="}</td><td style={wbCell}>{lpFmt(c.rhs)}</td><td style={wbCell}>{lpFmt(c.slack)}</td>{res.duals && <td style={{ ...wbCell, color:c.dual? C.gold : C.dim }}>{lpFmt(c.dual)}</td>}</tr>)}</tbody></table></div>
        {res.duals && cons.some(c=>c.dual) && <div style={{ ...wbNote, marginTop:8 }}>
          {cons.filter(c=>c.dual).slice(0,4).map(c=><div key={c.name}>One more unit of <strong style={{ color:C.text }}>{c.name}</strong> would {c.dual>0? "raise" : "lower"} the {M.sense==="max"? "maximum" : "minimum"} by about {lpFmt(Math.abs(c.dual))}.</div>)}
          <div style={{ color:C.dim, marginTop:4 }}>Shadow prices hold for small changes; a large change can alter which limits bind. Limits with slack have a shadow price of zero.</div>
        </div>}
      </div>}
      {ok && <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}><button type="button" style={btn()} onClick={saveTable}>{D? "Save the plan as a dataset" : "Save results as a dataset"}</button></div>}
    </div>
  );
}
// ══════════════════════════════════════════════
// PROJECTS AND HISTORY (UI)
// ══════════════════════════════════════════════
const prjEmptyMeta = () => ({ name:"", domain:"", question:"", description:"", status:"active", tags:"" });
function ProjectForm({ initial, onSave, onCancel, saving }) {
  const [m,setM]=useState({ ...prjEmptyMeta(), ...initial, tags:Array.isArray(initial?.tags)? initial.tags.join(", ") : (initial?.tags||"") });
  const f=(k)=>(e)=>setM(x=>({ ...x, [k]:e.target.value }));
  const L=({ children, label, hint })=><label style={{ display:"block", fontSize:12, color:C.mid, marginBottom:10 }}>{label}{hint && <span style={{ color:C.dim }}> · {hint}</span>}<div style={{ marginTop:4 }}>{children}</div></label>;
  return (
    <form onSubmit={e=>{ e.preventDefault(); if (!m.name.trim()) return; onSave({ ...m, name:m.name.trim(), tags:m.tags.split(",").map(t=>t.trim()).filter(Boolean) }); }}>
      {L({ label:"Project name", children:<input required autoFocus value={m.name} onChange={f("name")} placeholder="For example: Fertilizer subsidy and maize yields" style={inp}/> })}
      {L({ label:"Field or domain", children:<><input list="prj-domains" value={m.domain} onChange={f("domain")} placeholder="Economics, Public health, Agriculture…" style={inp}/><datalist id="prj-domains">{PRJ_DOMAINS.map(d=><option key={d} value={d}/>)}</datalist></> })}
      {L({ label:"Research question", hint:"optional", children:<textarea value={m.question} onChange={f("question")} rows={2} placeholder="What do you want to find out?" style={{ ...inp, resize:"vertical" }}/> })}
      {L({ label:"Description or notes", hint:"optional", children:<textarea value={m.description} onChange={f("description")} rows={3} placeholder="Data sources, partners, deadlines, anything you want to remember" style={{ ...inp, resize:"vertical" }}/> })}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        {L({ label:"Status", children:<select value={m.status} onChange={f("status")} style={sel}>{Object.entries(PRJ_STATUS).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select> })}
        {L({ label:"Tags", hint:"comma separated", children:<input value={m.tags} onChange={f("tags")} placeholder="thesis, Ghana, panel" style={inp}/> })}
      </div>
      <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
        {onCancel && <button type="button" onClick={onCancel} style={{ ...pill(false), padding:"8px 14px" }}>Cancel</button>}
        <button type="submit" disabled={saving} style={btn()}>{saving? "Saving…" : "Save project"}</button>
      </div>
    </form>
  );
}
function ProjectsModal({ projects, activeId, activeRole="owner", me, startTab="projects", saveState, onClose, onOpen, onCreate, onUpdateMeta, onDelete, onLeave, onDuplicate, onExport, onImport, onRestore, onCheckpoint, reload }) {
  const [share,setShare]=useState(null); // project being shared
  const [asking,setAsking]=useState(null); const askBox=(text, yes, fn)=>setAsking({ text, yes, fn }); // in-app confirmation (browser pop-ups can be blocked)
  useEffect(()=>{ if (reload) reload().catch(()=>{}); },[]); // fetch the latest list (new invitations) each time Projects opens
  const isMobile=useIsMobile(); const [tab,setTab]=useState(startTab); const [form,setForm]=useState(null); // null | "new" | project
  const [busy,setBusy]=useState(false); const [q,setQ]=useState(""); const [err,setErr]=useState("");
  const [hist,setHist]=useState(null); const [hErr,setHErr]=useState(""); const [cp,setCp]=useState(""); const [restoring,setRestoring]=useState(null); const fileRef=useRef(null);
  useEffect(()=>{ const k=(e)=>{ if (e.key==="Escape") onClose(); }; window.addEventListener("keydown",k); return ()=>window.removeEventListener("keydown",k); },[onClose]);
  const loadHist=useCallback(async()=>{ if (!activeId) return; setHErr(""); try { setHist(await US.projectHistory(activeId)); } catch(e){ setHErr(e.message||"Could not load the history."); setHist([]); } },[activeId]);
  useEffect(()=>{ if (tab==="history") loadHist(); },[tab, loadHist]);
  const act=projects.find(p=>p.id===activeId);
  const list=projects.filter(p=>!q || `${p.name} ${p.domain||""} ${(p.tags||[]).join(" ")} ${p.description||""}`.toLowerCase().includes(q.toLowerCase()));
  const wrap=async(fn)=>{ setBusy(true); setErr(""); try { await fn(); } catch(e){ setErr(e.message||"Something went wrong."); } setBusy(false); };
  const byDay={}; (hist||[]).forEach(h=>{ const d=ciFmtDay(h.created_at); (byDay[d]=byDay[d]||[]).push(h); });
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="prj-title" style={{ position:"fixed", inset:0, background:C.overlay, zIndex:420, display:"flex", alignItems:isMobile?"stretch":"flex-start", justifyContent:"center", padding:isMobile?0:"40px 20px", overflowY:"auto" }}>
      <div style={{ background:C.surface, border:`1px solid ${C.borderHi}`, borderRadius:isMobile?0:10, width:"100%", maxWidth:900, boxShadow:C.shadow, display:"flex", flexDirection:"column", maxHeight:isMobile?"100%":"calc(100vh - 80px)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"14px 20px", borderBottom:`1px solid ${C.border}`, flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:30, height:30, borderRadius:6, background:C.gold, color:C.onGold, display:"flex", alignItems:"center", justifyContent:"center" }}><Ico n="briefcase"/></div>
            <div><h2 id="prj-title" style={{ fontSize:16, margin:0, color:C.text }}>{tab==="history"? "Project history" : "Projects"}</h2>
              <div style={{ fontSize:11, color:C.mid }}>{act? <>Working in <strong style={{ color:C.text }}>{act.name}</strong> · {saveState}</> : "Your work is saved to a project automatically."}</div></div>
          </div>
          <div role="tablist" style={{ display:"flex", gap:6 }}>{[["projects","My projects"],["history","History"]].map(([k,l])=><button key={k} role="tab" aria-selected={tab===k} type="button" onClick={()=>{ setTab(k); setForm(null); }} style={{ ...pill(tab===k), padding:"7px 12px" }}>{l}</button>)}</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, color:C.mid, cursor:"pointer", padding:"6px 10px" }}>✕</button>
        </div>
        <div style={{ padding:isMobile?14:20, overflowY:"auto" }}>
          {err && <div role="alert" style={{ color:C.red, fontSize:12, marginBottom:10 }}>{err}</div>}
          {tab==="projects" && (form? <div style={{ maxWidth:620 }}>
              <h3 style={wbH}>{form==="new"? "New project" : `Edit ${form.name}`}</h3>
              {form==="new" && <p style={{ ...wbNote, marginTop:0 }}>A new project starts from a clean workspace. Your current project stays as it is.</p>}
              <ProjectForm initial={form==="new"? null : form} saving={busy} onCancel={()=>setForm(null)} onSave={m=>wrap(async()=>{ if (form==="new") await onCreate(m); else await onUpdateMeta(form.id, m); setForm(null); })}/>
            </div> : <>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14 }}>
              <button type="button" style={btn()} onClick={()=>setForm("new")}>New project</button>
              <input aria-label="Search projects" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search projects" style={{ ...inp, maxWidth:240 }}/>
              <button type="button" style={wbSmallBtn()} onClick={()=>fileRef.current?.click()}>Import project file</button>
              <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e=>{ const f=e.target.files[0]; e.target.value=""; if (f) wrap(()=>onImport(f)); }}/>
            </div>
            {!projects.length && <p style={wbNote}>No projects yet.</p>}
            {[["mine","My projects", list.filter(p=>!p.role || p.role==="owner")], ["shared","Shared with me", list.filter(p=>p.role && p.role!=="owner")]].map(([key, title, items])=> <div key={key} style={{ marginBottom:14 }}>
            <h3 style={{ ...wbH, marginTop:4 }}>{title} <span style={{ color:C.dim, fontWeight:500 }}>({items.length})</span></h3>
            {key==="mine" && !items.length && <p style={wbNote}>None yet.</p>}
            {key==="shared" && !items.length && <p style={wbNote}>Nothing shared with you yet. You are signed in as <strong>{me}</strong>. When someone shares a project with this username, or with the email on this account, it appears here within a minute.</p>}
            <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:10 }}>
              {items.map(p=>{ const on=p.id===activeId; const mineP=!p.role || p.role==="owner"; return (
                <div key={p.id} style={{ ...card, padding:"12px 14px", borderColor:on? C.gold : C.border }}>
                  <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:C.text, overflow:"hidden", textOverflow:"ellipsis" }}>{p.name}</div>
                      <div style={{ fontSize:11.5, color:C.mid }}>{[p.domain, PRJ_STATUS[p.status]||p.status, `edited ${prjAgo(p.updated_at)}${p.updated_by && p.updated_by!==me? ` by ${p.updated_by}` : ""}`].filter(Boolean).join(" · ")}</div>
                      {!mineP && <div style={{ fontSize:11.5, color:C.text, marginTop:2 }}>Shared by <strong>{p.owner}</strong> · {p.role==="editor"? "you can edit" : "view only"}</div>}
                      {mineP && p.members>0 && <div style={{ fontSize:11.5, color:C.teal, marginTop:2 }}>Shared with {(p.memberNames||[]).length? p.memberNames.map(m=>`${m.username} (${m.role==="editor"? "can edit" : "can view"})`).join(", ") : `${p.members} ${p.members===1? "person" : "people"}`}</div>}
                    </div>
                    {on && <button type="button" onClick={onClose} title="You are working in this project now. Click to go back to it." aria-label={`${p.name} is open now. Go back to it`} style={{ fontSize:11, color:C.teal, background:`${C.teal}14`, border:`1px solid ${C.teal}66`, borderRadius:5, padding:"3px 8px", height:"fit-content", whiteSpace:"nowrap", display:"inline-flex", alignItems:"center", gap:5, cursor:"pointer" }}><span style={{ width:7, height:7, borderRadius:"50%", background:C.teal }}/>Open now · go back to it</button>}
                  </div>
                  {p.question && <div style={{ fontSize:12, color:C.text, marginTop:6, lineHeight:1.5 }}>{p.question}</div>}
                  {(p.tags||[]).length>0 && <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:6 }}>{p.tags.map(t=><span key={t} style={{ fontSize:10.5, color:C.mid, background:C.raised, borderRadius:3, padding:"1px 6px" }}>{t}</span>)}</div>}
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:10 }}>
                    {!on && <button type="button" aria-label={`Open ${p.name}${mineP? "" : ` (shared by ${p.owner})`}`} style={wbSmallBtn(C.teal)} disabled={busy} onClick={()=>wrap(()=>onOpen(p.id))}>Open</button>}
                    {mineP && <button type="button" style={wbSmallBtn(C.teal)} onClick={()=>setShare(p)}>{p.members>0? "Manage sharing" : "Share"}</button>}
                    {mineP && <button type="button" style={wbSmallBtn()} onClick={()=>setForm(p)}>Edit details</button>}
                    <button type="button" style={wbSmallBtn()} disabled={busy} onClick={()=>wrap(()=>onDuplicate(p.id))} title={mineP? "" : "Make your own copy that you can change freely"}>{mineP? "Duplicate" : "Copy to my projects"}</button>
                    <button type="button" style={wbSmallBtn()} disabled={busy} onClick={()=>wrap(()=>onExport(p.id))}>Export</button>
                    {mineP? <button type="button" style={wbSmallBtn(C.red)} disabled={busy} onClick={()=>{ const nxt=projects.find(x=>x.id!==p.id); askBox(`Delete "${p.name}" and all its history?${p.members? ` The ${p.members} ${p.members===1?"person":"people"} you shared it with will lose access.` : ""} This cannot be undone. Export it first if you may need it.${on? `\n\nThis is the project open now. EcoScope will open ${nxt? `"${nxt.name}"` : "a new empty workspace"} afterwards.` : ""}`, "Delete", ()=>wrap(()=>onDelete(p.id))); }}>Delete</button>
                      : <button type="button" style={wbSmallBtn(C.red)} disabled={busy} onClick={()=>{ askBox(`Leave "${p.name}"? It disappears from your list. ${p.owner} can share it with you again.`, "Leave", ()=>wrap(()=>onLeave(p.id))); }}>Leave</button>}
                  </div>
                </div>); })}
            </div></div>)}
          </>)}
          {tab==="history" && <div>
            <p style={{ ...wbNote, marginTop:0 }}>Every change you make in <strong>{act?.name||"this project"}</strong> is recorded here: variables, countries, years, settings, datasets, formulas and coding. Restore takes the workspace back to that point. The current state is recorded first, so a restore can itself be undone.</p>
            <form onSubmit={e=>{ e.preventDefault(); if (!cp.trim()) return; wrap(async()=>{ await onCheckpoint(cp.trim()); setCp(""); await loadHist(); }); }} style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
              <input aria-label="Checkpoint name" value={cp} onChange={e=>setCp(e.target.value)} placeholder="Name this point, for example Before adding controls" style={{ ...inp, maxWidth:380 }}/>
              <button type="submit" style={wbSmallBtn()} disabled={busy || !cp.trim()}>Save checkpoint</button>
              <button type="button" style={wbSmallBtn()} onClick={()=>{ reload && reload(); loadHist(); }}>Refresh</button>
            </form>
            {hErr && <div role="alert" style={{ color:C.orange, fontSize:12, marginBottom:8 }}>{hErr}</div>}
            {!hist && <div style={wbNote}>Loading…</div>}
            {hist && !hist.length && !hErr && <div style={wbNote}>No history yet. Changes appear here a few seconds after you make them.</div>}
            {Object.entries(byDay).map(([day, hs])=><div key={day} style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.mid, textTransform:"uppercase", letterSpacing:".04em", marginBottom:6 }}>{day}</div>
              <ol style={{ listStyle:"none", margin:0, padding:0, borderLeft:`2px solid ${C.border}` }}>
                {hs.map((h,i)=>{ const cpnt=/^Checkpoint/.test(h.action); const latest=hist[0]?.id===h.id; return (
                  <li key={h.id} style={{ position:"relative", padding:"6px 0 6px 14px", display:"flex", gap:10, alignItems:"flex-start", justifyContent:"space-between" }}>
                    <span style={{ position:"absolute", left:-6, top:11, width:10, height:10, borderRadius:5, background:cpnt? C.gold : latest? C.teal : C.borderHi }}/>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:13, color:C.text, fontWeight:cpnt?700:500 }}>{h.action}</div>
                      {h.detail && <div style={{ fontSize:11.5, color:C.mid, lineHeight:1.5 }}>{h.detail}</div>}
                      <div style={{ fontSize:10.5, color:C.dim }}>{ciFmtTime(h.created_at)}{h.author? ` · ${h.author===me? "you" : h.author}` : ""}{latest? " · current" : ""}</div>
                    </div>
                    {!latest && activeRole!=="viewer" && !/^(Shared with |Removed |.+ left the project$)/.test(h.action) && <button type="button" style={{ ...wbSmallBtn(), flex:"none" }} disabled={restoring!=null} onClick={()=>{ askBox(`Restore the workspace to "${h.action}" (${ciFmtDay(h.created_at)} ${ciFmtTime(h.created_at)})? This can be undone from History.`, "Restore", ()=>{ setRestoring(h.id); wrap(async()=>{ await onRestore(h); await loadHist(); }).finally(()=>setRestoring(null)); }); }}>{restoring===h.id? "Restoring…" : "Restore"}</button>}
                  </li>); })}
              </ol>
            </div>)}
          </div>}
        </div>
      </div>
      {asking && <div role="alertdialog" aria-modal="true" aria-label="Please confirm" style={{ position:"fixed", inset:0, background:C.overlay, zIndex:440, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
        <div style={{ background:C.surface, border:`1px solid ${C.borderHi}`, borderRadius:10, maxWidth:440, width:"100%", padding:"18px 20px", boxShadow:C.shadow }}>
          <p style={{ fontSize:13.5, color:C.text, lineHeight:1.55, margin:"0 0 14px", whiteSpace:"pre-line" }}>{asking.text}</p>
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}><button type="button" style={wbSmallBtn()} onClick={()=>setAsking(null)} autoFocus>Cancel</button>
            <button type="button" style={{ ...btn(asking.yes==="Restore"? C.gold : C.red), padding:"7px 16px" }} onClick={()=>{ const f=asking.fn; setAsking(null); f(); }}>{asking.yes}</button></div></div></div>}
      {share && <ShareDialog project={share} me={me} onClose={()=>{ setShare(null); reload && reload(); }}/>}
    </div>
  );
}
// Share a project: invite by username or email as viewer or editor, change roles, remove people
function ShareDialog({ project, me, onClose }) {
  const [data,setData]=useState(null); const [err,setErr]=useState(""); const [who,setWho]=useState(""); const [role,setRole]=useState("editor"); const [busy,setBusy]=useState(false); const [ok,setOk]=useState(""); const [ask,setAsk]=useState(null);
  const load=useCallback(async()=>{ try { setData(await US.projectMembers(project.id)); } catch(e){ setErr(e.message); } },[project.id]);
  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ const k=(e)=>{ if (e.key==="Escape"){ e.stopImmediatePropagation(); onClose(); } }; window.addEventListener("keydown",k,true); return ()=>window.removeEventListener("keydown",k,true); },[onClose]);
  const act=async(fn, msg)=>{ setBusy(true); setErr(""); setOk(""); try { const r=await fn(); const m=typeof msg==="function"? msg(r) : msg; if (m) setOk(m); await load(); } catch(e){ setErr(e.message); } setBusy(false); };
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="share-title" style={{ position:"fixed", inset:0, background:C.overlay, zIndex:430, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:C.surface, border:`1px solid ${C.borderHi}`, borderRadius:10, width:"100%", maxWidth:520, maxHeight:"90vh", overflow:"auto", padding:"18px 20px", boxShadow:C.shadow }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
          <h2 id="share-title" style={{ fontSize:16, margin:0, color:C.text }}>Share "{project.name}"</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, color:C.mid, cursor:"pointer", padding:"4px 9px" }}>✕</button>
        </div>
        <p style={{ ...wbNote, margin:"6px 0 12px" }}>Invite people who have an EcoScope account. <strong>Can edit</strong>: they open the project and their changes are saved to it. <strong>Can view</strong>: they can open and explore, but nothing they do is saved. Only you can rename, share or delete it.</p>
        <form onSubmit={e=>{ e.preventDefault(); if (!who.trim()) return; act(async()=>{ const r=await US.projectInvite(project.id, who.trim(), role); setWho(""); return r; }, (r)=>`Shared with the account "${r && r.username || who.trim()}"${r && r.email? ` (${r.email})` : ""}. When they sign in as ${r && r.username || who.trim()} and open Projects, it is under "Shared with me".`); }}
          style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:6 }}>
          <input aria-label="Username or email" value={who} onChange={e=>setWho(e.target.value)} placeholder="Username or email" style={{ ...inp, padding:"8px 10px" }}/>
          <select aria-label="Access" value={role} onChange={e=>setRole(e.target.value)} style={{ ...sel, width:"auto", padding:"8px 10px" }}><option value="editor">Can edit</option><option value="viewer">Can view</option></select>
          <button type="submit" disabled={busy || !who.trim()} style={btn()}>Invite</button>
        </form>
        {err && <div role="alert" style={{ color:C.red, fontSize:12, marginTop:8 }}>{err}</div>}
        {ok && <div role="status" style={{ color:C.teal, fontSize:12, marginTop:8 }}>{ok}</div>}
        <h3 style={{ ...wbH, marginTop:16 }}>People with access</h3>
        {!data? <div style={wbNote}>Loading…</div> : <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:C.text, padding:"6px 0", borderBottom:`1px solid ${C.border}` }}><span>{data.owner}{data.owner===me? " (you)" : ""}</span><span style={{ color:C.mid }}>Owner</span></div>
          {data.members.map(m=><div key={m.username} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, fontSize:13, color:C.text, padding:"4px 0", borderBottom:`1px solid ${C.border}` }}>
            <span style={{ minWidth:0 }}><strong>{m.username}</strong>{m.email? <span style={{ fontSize:11, color:C.mid }}> · {m.email}</span> : null}{m.invited_by? <span style={{ fontSize:11, color:C.dim }}> · added by {m.invited_by}</span> : null}</span>
            <span style={{ display:"flex", gap:6, alignItems:"center" }}>
              <select aria-label={`Access for ${m.username}`} value={m.role} disabled={busy} onChange={e=>{ const r=e.target.value; act(()=>US.projectSetRole(project.id, m.username, r), `${m.username} ${r==="editor"? "can now edit" : "can now only view"}.`); }} style={{ ...sel, width:"auto", padding:"4px 8px", fontSize:12 }}><option value="editor">Can edit</option><option value="viewer">Can view</option></select>
              {ask===m.username? <><span style={{ fontSize:12, color:C.text }}>Remove?</span><button type="button" aria-label={`Yes, remove ${m.username}`} disabled={busy} onClick={()=>{ setAsk(null); act(()=>US.projectRemoveMember(project.id, m.username), `Removed ${m.username}. The project is no longer shared with them.`); }} style={{ ...wbSmallBtn(C.red), background:`${C.red}22` }}>Yes, remove</button><button type="button" onClick={()=>setAsk(null)} style={wbSmallBtn()}>Cancel</button></>
                : <button type="button" aria-label={`Remove ${m.username}`} disabled={busy} onClick={()=>setAsk(m.username)} style={wbSmallBtn(C.red)}>Remove</button>}
            </span></div>)}
          {!data.members.length && <div style={wbNote}>Not shared with anyone yet.</div>}
        </div>}
        <p style={{ ...wbNote, fontSize:11.5, marginTop:12, marginBottom:0 }}>Large datasets (over about 150,000 cells) stay in the browser where they were added, so the people you share with will see them as "Not on this device". Export them as CSV and send them, or keep shared projects to smaller tables. When two people edit at the same time, EcoScope warns before one version overwrites the other.</p>
      </div>
    </div>
  );
}
// ══════════════════════════════════════════════
// DASHBOARD STUDIO (engine): profiling, filtering, aggregation and chart data
// ══════════════════════════════════════════════
const DSB_BLANK = (v) => { if (v == null) return true; if (typeof v !== "string") return typeof v === "number" ? !isFinite(v) : false; const n = v.length; if (!n) return true; if (n > 4) { const c = v.charCodeAt(0); if (c !== 32 && c !== 9) return false; } return /^\s*(na|n\/a|nan|null|\.|-|–)?\s*$/i.test(v); };
const dsbNum = (v) => { if (typeof v === "number") return isFinite(v) ? v : null; if (typeof v === "string" && v.length && v.length < 25) { const c = v.charCodeAt(0); if ((c >= 48 && c <= 57) || c === 45 || c === 46) { const f = +v; if (f === f && isFinite(f) && !/^-?0[xbo]/i.test(v)) return f; if (v.indexOf(",") < 0 && v.indexOf("%") < 0 && v.charCodeAt(v.length - 1) > 32) return null; } } if (DSB_BLANK(v)) return null; const s0 = String(v).trim(), c0 = s0.charCodeAt(0); if (!((c0 >= 48 && c0 <= 57) || c0 === 45 || c0 === 43 || c0 === 46)) return null; const s = s0.replace(/,/g, "").replace(/%$/, ""); if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null; const n = +s; return isFinite(n) ? n : null; };
const DSB_MON = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12 };
const _dsbTC = new Map();
// time value -> { k: sortable fractional year, y, m, d, kind: year|quarter|month|day, label }
const dsbTime = (v) => {
  const s = String(v ?? "").trim(); if (!s) return null;
  let r = _dsbTC.get(s); if (r !== undefined) return r; if (_dsbTC.size > 400000) _dsbTC.clear();
  let m; r = null;
  const day = (y, mo, d) => { const dt = new Date(Date.UTC(y, mo - 1, d)); if (isNaN(dt) || dt.getUTCMonth() !== mo - 1) return null; const doy = (dt - Date.UTC(y, 0, 1)) / 864e5; return { k: y + doy / 366, y, m: mo, d, kind: "day", label: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`, dow: dt.getUTCDay() }; };
  if ((m = s.match(/^(1[5-9]\d\d|20\d\d|2100)(?:\.0)?$/))) r = { k: +m[1], y: +m[1], m: 1, d: 1, kind: "year", label: m[1] };
  else if ((m = s.match(/^(1[89]\d\d|20\d\d)\s*[-_ ]?\s*Q([1-4])$/i)) || (m = s.match(/^Q([1-4])\s*[-_ ]?\s*(1[89]\d\d|20\d\d)$/i))) { const y = +(m[1].length === 4 ? m[1] : m[2]), q = +(m[1].length === 4 ? m[2] : m[1]); r = { k: y + (q - 1) / 4, y, m: q * 3 - 2, d: 1, q, kind: "quarter", label: `${y}-Q${q}` }; }
  else if ((m = s.match(/^(1[89]\d\d|20\d\d)\s*[-/M]\s*(0?[1-9]|1[0-2])$/))) r = { k: +m[1] + (+m[2] - 1) / 12, y: +m[1], m: +m[2], d: 1, kind: "month", label: `${m[1]}-${String(+m[2]).padStart(2, "0")}` };
  else if ((m = s.match(/^(1[89]\d\d|20\d\d)[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/))) r = day(+m[1], +m[2], +m[3]);
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) r = day(+m[3], +m[1], +m[2]);
  else if ((m = s.match(/^([A-Za-z]{3,9})\.?[\s-]+(1[89]\d\d|20\d\d)$/))) { const mo = DSB_MON[m[1].toLowerCase()] || DSB_MON[m[1].slice(0, 3).toLowerCase()]; if (mo) r = { k: +m[2] + (mo - 1) / 12, y: +m[2], m: mo, d: 1, kind: "month", label: `${m[2]}-${String(mo).padStart(2, "0")}` }; }
  _dsbTC.set(s, r); return r;
};
const DSB_TIME_HINT = /^(year|yr|date|time|period|month|quarter|day|week|fecha|annee|jahr|t)$|(^|_|\s)(date|year|period|month|quarter)($|_|\s)/i;
// ── column caches: each column is parsed once per table (numbers, time keys, labels) ──
const _dsbC = new WeakMap();
const dsbCache = (tab) => { const h = tab.headers.join("\u0001"); let c = _dsbC.get(tab.rows); if (!c || c.h !== h) { c = { h, num: {}, tk: {}, lab: {}, prof: null }; _dsbC.set(tab.rows, c); } return c; };
const dsbNumCol = (tab, j) => { const c = dsbCache(tab); if (c.num[j]) return c.num[j]; const R = tab.rows, a = new Float64Array(R.length); for (let i = 0; i < R.length; i++) { const x = dsbNum(R[i][j]); a[i] = x == null ? NaN : x; } return (c.num[j] = a); };
const dsbTkCol = (tab, j) => { const c = dsbCache(tab); if (c.tk[j]) return c.tk[j]; const R = tab.rows, a = new Float64Array(R.length); for (let i = 0; i < R.length; i++) { const t = dsbTime(R[i][j]); a[i] = t ? t.k : NaN; } return (c.tk[j] = a); };
// labels: trimmed text, or the normalised time label for time columns; null for blanks
const dsbLabCol = (tab, j, type) => { const c = dsbCache(tab); const key = j + type; if (c.lab[key]) return c.lab[key]; const R = tab.rows, a = new Array(R.length);
  for (let i = 0; i < R.length; i++) { const v = R[i][j]; if (DSB_BLANK(v)) { a[i] = null; continue; } if (type === "time") { const t = dsbTime(v); a[i] = t ? t.label : String(v).trim(); } else a[i] = typeof v === "string" ? v.trim() : String(v); } return (c.lab[key] = a); };
const dsbN = (tab, idx) => idx ? idx.length : tab.rows.length;
const dsbAt = (idx, ii) => idx ? idx[ii] : ii;
// column profile: type, counts and summary statistics (quantiles from a sample on very large tables)
const dsbProfileCol = (tab, j) => {
  const name = tab.headers[j], rows = tab.rows, N = rows.length; const X = dsbNumCol(tab, j); let miss = 0, nNum = 0, nTime = 0, nInt = 0, nS = 0;
  const step = N > 60000 ? Math.ceil(N / 60000) : 1; const nums = []; const uniq = new Map(); let sum = 0, sum2 = 0, mn = Infinity, mx = -Infinity;
  let tMin = null, tMax = null, kind = null;
  for (let i = 0; i < N; i++) {
    const x = X[i]; if (x === x) { nNum++; sum += x; sum2 += x * x; if (x < mn) mn = x; if (x > mx) mx = x; if (Number.isInteger(x)) nInt++; if (i % step === 0) nums.push(x); }
    else if (DSB_BLANK(rows[i][j])) { miss++; continue; }
    if (i % step === 0) { const v = rows[i][j]; nS++; const k = String(v).trim(); if (uniq.size < 5000 || uniq.has(k)) uniq.set(k, (uniq.get(k) || 0) + 1);
      const t = dsbTime(v); if (t) { nTime++; if (!tMin || t.k < tMin.k) tMin = t; if (!tMax || t.k > tMax.k) tMax = t; kind = kind || t.kind; } }
  }
  const nn = N - miss; const numShare = nn ? nNum / nn : 0, timeShare = nS ? nTime / nS : 0;
  const yearLike = numShare > 0.95 && nInt === nNum && mn >= 1500 && mx <= 2100;
  let type = "text";
  if (nn && (timeShare >= 0.9 && (numShare < 0.95 || (yearLike && (DSB_TIME_HINT.test(name) || uniq.size <= 300))))) type = "time";
  else if (nn && numShare >= 0.8) type = "number";
  const p = { name, j, type, n: nn, missing: miss, unique: uniq.size, uniqueCapped: uniq.size >= 5000 };
  if (type === "number" || (type === "time" && numShare > 0.95)) {
    nums.sort((a, b) => a - b); const q = (f) => nums.length ? dsbQuantSorted(nums, f) : null;
    Object.assign(p, { mean: nNum ? sum / nNum : null, sd: nNum > 1 ? Math.sqrt(Math.max(0, (sum2 - sum * sum / nNum) / (nNum - 1))) : null, min: nNum ? mn : null, max: nNum ? mx : null, q1: q(0.25), median: q(0.5), q3: q(0.75), sum, sample: nums.length > 2000 ? nums.filter((_, i) => i % Math.ceil(nums.length / 2000) === 0) : nums });
  }
  if (type === "time") Object.assign(p, { tMin: tMin && tMin.label, tMax: tMax && tMax.label, kind });
  if (type === "text") p.top = [...uniq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, c]) => ({ k, c: c * step }));
  return p;
};
const dsbQuantSorted = (s, f) => { if (!s.length) return null; const h = (s.length - 1) * f, lo = Math.floor(h), hi = Math.ceil(h); return s[lo] + (s[hi] - s[lo]) * (h - lo); };
const dsbProfile = (tab) => { if (!tab || !Array.isArray(tab.rows)) return []; const c = dsbCache(tab); if (!c.prof) c.prof = tab.headers.map((h, j) => dsbProfileCol(tab, j)); return c.prof; };
const dsbTypeOf = (tab, col) => (dsbProfile(tab).find(p => p.name === col) || {}).type || "text";
// ── filters: [{ col, values:[...] }] (category) or { col, min, max } (number/time range) -> row index list, or null for all rows ──
const dsbFilter = (tab, filters) => {
  const fs = (filters || []).map(f => { const j = tab.headers.indexOf(f.col); if (j < 0) return null; const type = dsbTypeOf(tab, f.col);
    if (f.values) return { j, set: new Set(f.values.map(String)), lab: dsbLabCol(tab, j, type) };
    return { j, min: f.min, max: f.max, X: type === "time" ? dsbTkCol(tab, j) : dsbNumCol(tab, j) }; }).filter(Boolean);
  if (!fs.length) return null; const out = [];
  for (let i = 0; i < tab.rows.length; i++) { let ok = true; for (const f of fs) { if (f.set) { const l = f.lab[i]; if (!f.set.has(l == null ? "(blank)" : l)) { ok = false; break; } } else { const x = f.X[i]; if (!(x === x) || (f.min != null && x < f.min) || (f.max != null && x > f.max)) { ok = false; break; } } } if (ok) out.push(i); }
  return Int32Array.from(out);
};
// ── aggregation ──
const DSB_AGGS = [["sum", "Sum"], ["mean", "Average"], ["median", "Median"], ["count", "Count rows"], ["distinct", "Count distinct"], ["min", "Minimum"], ["max", "Maximum"], ["first", "First"], ["last", "Last"], ["sd", "Std. deviation"]];
const DSB_ADDITIVE = { sum: 1, count: 1 };
const dsbAggNew = () => ({ n: 0, k: 0, s: 0, s2: 0, mn: Infinity, mx: -Infinity, f: null, l: null, vals: null, set: null });
const dsbAggAdd = (a, x, raw, how) => { a.n++; if (how === "distinct") { (a.set || (a.set = new Set())).add(String(raw)); return; } if (x == null || x !== x) return; a.k++; a.s += x; a.s2 += x * x; if (x < a.mn) a.mn = x; if (x > a.mx) a.mx = x; if (a.f == null) a.f = x; a.l = x; if (how === "median") (a.vals || (a.vals = [])).push(x); };
const dsbAggMerge = (o, a) => { o.n += a.n; o.k += a.k; o.s += a.s; o.s2 += a.s2; o.mn = Math.min(o.mn, a.mn); o.mx = Math.max(o.mx, a.mx); if (a.vals) (o.vals || (o.vals = [])).push(...a.vals); if (a.set) { o.set = o.set || new Set(); a.set.forEach(v => o.set.add(v)); } if (o.f == null) o.f = a.f; if (a.l != null) o.l = a.l; };
const dsbAggOut = (a, how) => { const k = a.k; switch (how) {
  case "count": return a.n; case "distinct": return a.set ? a.set.size : 0; case "sum": return k ? a.s : null; case "mean": return k ? a.s / k : null;
  case "median": { if (!a.vals || !a.vals.length) return null; a.vals.sort((p, q) => p - q); return dsbQuantSorted(a.vals, 0.5); }
  case "min": return k ? a.mn : null; case "max": return k ? a.mx : null; case "first": return a.f; case "last": return a.l;
  case "sd": return k > 1 ? Math.sqrt(Math.max(0, (a.s2 - a.s * a.s / k) / (k - 1))) : null; default: return k ? a.s : null; } };
const dsbSortX = (labels, type) => { if (type === "time") return labels.sort((a, b) => ((dsbTime(a) || {}).k ?? 0) - ((dsbTime(b) || {}).k ?? 0));
  if (type === "number") return labels.sort((a, b) => (dsbNum(a) ?? 0) - (dsbNum(b) ?? 0)); return labels; };
// time bucketing for long daily series: keep | year | quarter | month
const dsbBucket = (label, by) => { if (!by || by === "keep") return label; const t = dsbTime(label); if (!t) return label;
  if (by === "year") return String(t.y); if (by === "quarter") return `${t.y}-Q${Math.ceil(t.m / 3)}`; if (by === "month") return `${t.y}-${String(t.m).padStart(2, "0")}`; return label; };
// group rows by x (and optionally a split column) -> { data:[{__x, key:value}], keys, xType }
const dsbGroup = (tab, idx, o) => {
  const H = tab.headers; const jx = o.x ? H.indexOf(o.x) : -1, jg = o.group ? H.indexOf(o.group) : -1; const how = o.agg || "sum";
  const ys = (o.ys || []).filter(c => H.includes(c)); const Y = ys.map(c => dsbNumCol(tab, H.indexOf(c))); const R = tab.rows; const yJ = ys.map(c => H.indexOf(c));
  const xType = jx >= 0 ? dsbTypeOf(tab, o.x) : "text"; const XL = jx >= 0 ? dsbLabCol(tab, jx, xType) : null; const GL = jg >= 0 ? dsbLabCol(tab, jg, dsbTypeOf(tab, o.group)) : null;
  const bmemo = new Map(); const bucket = (l) => { if (!(xType === "time" && o.bucket && o.bucket !== "keep")) return l; let b = bmemo.get(l); if (b === undefined) { b = dsbBucket(l, o.bucket); bmemo.set(l, b); } return b; };
  const cells = new Map(); const order = []; const gTot = new Map(); const N = dsbN(tab, idx); const useHow = (jg >= 0 ? (ys.length ? how : "count") : (ys.length ? how : "count"));
  for (let ii = 0; ii < N; ii++) { const i = dsbAt(idx, ii);
    let xk = XL ? XL[i] : "All"; if (xk == null) continue; xk = bucket(xk);
    let row = cells.get(xk); if (!row) { row = new Map(); cells.set(xk, row); order.push(xk); }
    if (GL) { const g = GL[i] == null ? "(blank)" : GL[i]; let a = row.get(g); if (!a) row.set(g, a = dsbAggNew()); if (ys.length) { const x = Y[0][i]; dsbAggAdd(a, x, how === "distinct" ? R[i][yJ[0]] : x, how); gTot.set(g, (gTot.get(g) || 0) + (x === x ? Math.abs(x) : 0)); } else { dsbAggAdd(a, 1, 1, "count"); gTot.set(g, (gTot.get(g) || 0) + 1); } }
    else if (!ys.length) { let a = row.get("Count"); if (!a) row.set("Count", a = dsbAggNew()); dsbAggAdd(a, 1, 1, "count"); }
    else for (let q = 0; q < ys.length; q++) { let a = row.get(ys[q]); if (!a) row.set(ys[q], a = dsbAggNew()); const x = Y[q][i]; dsbAggAdd(a, x, how === "distinct" ? R[i][yJ[q]] : x, how); }
  }
  let keys = GL ? [...gTot.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]) : (ys.length ? ys : ["Count"]);
  const maxG = o.maxGroups || 12; let other = null; if (GL && keys.length > maxG) { other = new Set(keys.slice(maxG - 1)); keys = [...keys.slice(0, maxG - 1), "Other"]; }
  const out = order.map(xk => { const row = cells.get(xk); const d = { __x: xk };
    if (other) { const oa = dsbAggNew(); let any = false; row.forEach((a, g) => { if (other.has(g)) { any = true; dsbAggMerge(oa, a); } }); if (any) d.Other = dsbAggOut(oa, useHow); }
    row.forEach((a, g) => { if (!other || !other.has(g)) d[g] = dsbAggOut(a, useHow); }); return d; });
  if (xType === "time" || xType === "number") { const lab = dsbSortX(out.map(d => d.__x), xType); const pos = new Map(lab.map((l, i) => [l, i])); out.sort((a, b) => pos.get(a.__x) - pos.get(b.__x)); }
  else if (o.sort !== "none") { const tot = (d) => keys.reduce((s, k) => s + (+d[k] || 0), 0);
    if (o.sort === "asc") out.sort((a, b) => tot(a) - tot(b)); else if (o.sort === "label") out.sort((a, b) => String(a.__x).localeCompare(String(b.__x), undefined, { numeric: true })); else out.sort((a, b) => tot(b) - tot(a)); }
  let data = out; if (o.top && xType === "text" && data.length > o.top) { const rest = data.slice(o.top); data = data.slice(0, o.top);
    if (o.lumpOther !== false && DSB_ADDITIVE[useHow]) { const oth = { __x: `Other (${rest.length})` }; keys.forEach(k => { oth[k] = rest.reduce((s, d) => s + (+d[k] || 0), 0); }); data.push(oth); } }
  return { data, keys, xType, how: useHow, nX: out.length };
};
// ── distributions ──
const dsbColVals = (tab, idx, c) => { const j = tab.headers.indexOf(c); if (j < 0) return []; const X = dsbNumCol(tab, j); const v = []; const N = dsbN(tab, idx); for (let ii = 0; ii < N; ii++) { const x = X[dsbAt(idx, ii)]; if (x === x) v.push(x); } return v; };
const dsbNiceStep = (span, n) => { const raw = span / Math.max(1, n); const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; };
const dsbHist = (vals, bins, lo, hi) => { if (!vals.length) return []; let mn = Infinity, mx = -Infinity; for (const v of vals) { if (v < mn) mn = v; if (v > mx) mx = v; } if (lo != null) mn = lo; if (hi != null) mx = hi;
  if (!bins || bins === "auto") bins = Math.min(60, Math.max(5, Math.ceil(Math.log2(vals.length) + 1) * 2));
  if (mn === mx) return [{ __x: dsbFmt(mn), lo: mn, hi: mx, Count: vals.length, share: 1 }];
  const step = dsbNiceStep(mx - mn, +bins); const lo0 = Math.floor(mn / step) * step; const nb = Math.max(1, Math.ceil((mx - lo0) / step + 1e-9)); const c = new Array(nb).fill(0);
  for (const v of vals) { let i = Math.floor((v - lo0) / step); if (i >= nb) i = nb - 1; if (i < 0) i = 0; c[i]++; }
  const dg = Math.max(0, -Math.floor(Math.log10(step)) + (step / Math.pow(10, Math.floor(Math.log10(step))) % 1 ? 1 : 0));
  return c.map((n, i) => ({ __x: Math.abs(lo0 + i * step) >= 1e4 ? dsbFmt(lo0 + i * step) : (lo0 + i * step).toFixed(Math.min(6, dg)), lo: lo0 + i * step, hi: lo0 + (i + 1) * step, Count: n, share: n / vals.length }));
};
const dsbKde = (vals, n = 120, lo, hi) => { if (vals.length < 2) return []; const s = vals.length > 20000 ? vals.filter((_, i) => i % Math.ceil(vals.length / 20000) === 0).sort((a, b) => a - b) : [...vals].sort((a, b) => a - b); const N = s.length; const mean = s.reduce((a, b) => a + b, 0) / N;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / (N - 1)); const iqr = dsbQuantSorted(s, 0.75) - dsbQuantSorted(s, 0.25);
  const h = 0.9 * Math.min(sd, iqr / 1.34 || sd) * Math.pow(N, -0.2) || 1; if (lo == null) lo = s[0] - 2 * h; if (hi == null) hi = s[N - 1] + 2 * h; const sub = N > 3000 ? s.filter((_, i) => i % Math.ceil(N / 3000) === 0) : s;
  const out = []; for (let i = 0; i < n; i++) { const x = lo + (hi - lo) * i / (n - 1); let d = 0; for (const v of sub) { const z = (x - v) / h; if (z > -6 && z < 6) d += Math.exp(-0.5 * z * z); } out.push({ x, y: d / (sub.length * h * Math.sqrt(2 * Math.PI)) }); } return out; };
const dsbBox = (vals) => { if (!vals.length) return null; const s = [...vals].sort((a, b) => a - b); const q1 = dsbQuantSorted(s, 0.25), med = dsbQuantSorted(s, 0.5), q3 = dsbQuantSorted(s, 0.75), iqr = q3 - q1;
  const loF = q1 - 1.5 * iqr, hiF = q3 + 1.5 * iqr; let lo = q1, hi = q3; for (const v of s) { if (v >= loF) { lo = v; break; } } for (let i = s.length - 1; i >= 0; i--) { if (s[i] <= hiF) { hi = s[i]; break; } }
  const out = s.filter(v => v < loF || v > hiF);
  return { n: s.length, min: s[0], max: s[s.length - 1], q1, med, q3, lo, hi, mean: s.reduce((a, b) => a + b, 0) / s.length, out: out.length > 300 ? out.filter((_, i) => i % Math.ceil(out.length / 300) === 0) : out, nOut: out.length }; };
// one distribution per group (box, violin) or per column
const dsbDists = (tab, idx, o, maxG = 16) => { const ys = (o.ys || []).filter(c => tab.headers.includes(c)); const N = dsbN(tab, idx);
  if (o.group && ys.length && tab.headers.includes(o.group)) { const gt = dsbTypeOf(tab, o.group); const GL = dsbLabCol(tab, tab.headers.indexOf(o.group), gt), Y = dsbNumCol(tab, tab.headers.indexOf(ys[0])); const m = new Map();
    for (let ii = 0; ii < N; ii++) { const i = dsbAt(idx, ii); const x = Y[i]; if (!(x === x)) continue; const g = GL[i] == null ? "(blank)" : GL[i]; let a = m.get(g); if (!a) m.set(g, a = []); a.push(x); }
    let ents = [...m.entries()]; if (gt === "time" || gt === "number") { const lab = dsbSortX(ents.map(e => e[0]), gt); const pos = new Map(lab.map((l, i) => [l, i])); ents.sort((a, b) => pos.get(a[0]) - pos.get(b[0])); } else ents.sort((a, b) => b[1].length - a[1].length);
    return ents.slice(0, maxG).map(([g, v]) => ({ name: g, vals: v })); }
  return ys.slice(0, maxG).map(c => ({ name: c, vals: dsbColVals(tab, idx, c) })); };
// ── relationships ──
const dsbSampleIdx = (tab, idx, max) => { const N = dsbN(tab, idx); if (N <= max) return idx; const st = N / max, out = new Int32Array(max); for (let k = 0; k < max; k++) out[k] = dsbAt(idx, Math.floor(k * st)); return out; };
const dsbCorr = (tab, idx, cols, method = "pearson") => { idx = dsbSampleIdx(tab, idx, 200000); const N = dsbN(tab, idx); const k = cols.length; const M = [];
  const X = cols.map(c => { const A = dsbNumCol(tab, tab.headers.indexOf(c)); const a = new Float64Array(N); for (let ii = 0; ii < N; ii++) a[ii] = A[dsbAt(idx, ii)]; return a; });
  const rank = (arr) => { const p = []; for (let i = 0; i < arr.length; i++) p.push([arr[i], i]); p.sort((a, b) => a[0] - b[0]); const rk = new Float64Array(arr.length); for (let i = 0; i < p.length;) { let e = i; while (e + 1 < p.length && p[e + 1][0] === p[i][0]) e++; const avg = (i + e) / 2 + 1; for (let t = i; t <= e; t++) rk[p[t][1]] = avg; i = e + 1; } return rk; };
  for (let a = 0; a < k; a++) { M.push([]); for (let b = 0; b < k; b++) {
    if (b < a) { M[a].push(M[b][a]); continue; } if (a === b) { let n = 0; for (let i = 0; i < N; i++) if (X[a][i] === X[a][i]) n++; M[a].push({ r: 1, n }); continue; }
    let xs = [], ys = []; for (let i = 0; i < N; i++) { const u = X[a][i], v = X[b][i]; if (u === u && v === v) { xs.push(u); ys.push(v); } }
    if (method === "spearman") { xs = rank(xs); ys = rank(ys); }
    const n = xs.length; if (n < 3) { M[a].push({ r: null, n }); continue; } let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; } mx /= n; my /= n; let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    M[a].push({ r: sxx && syy ? sxy / Math.sqrt(sxx * syy) : null, n }); } }
  return M; };
// order columns so similar ones sit together (greedy nearest neighbour on |r|)
const dsbCorrOrder = (M) => { const k = M.length; if (k < 3) return [...Array(k).keys()]; const used = new Set([0]), ord = [0];
  while (ord.length < k) { const last = ord[ord.length - 1]; let best = -1, bv = -2; for (let j = 0; j < k; j++) if (!used.has(j)) { const v = Math.abs(M[last][j].r ?? 0); if (v > bv) { bv = v; best = j; } } used.add(best); ord.push(best); } return ord; };
const dsbOls = (pts) => { const n = pts.length; if (n < 2) return null; let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0; for (const p of pts) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y; }
  const d = n * sxx - sx * sx; if (!d) return null; const b = (n * sxy - sx * sy) / d, a = (sy - b * sx) / n; const r = (n * sxy - sx * sy) / Math.sqrt(d * (n * syy - sy * sy) || 1); return { a, b, r2: r * r, n }; };
const dsbPoints = (tab, idx, o, max = 4000) => { const H = tab.headers; const jx = H.indexOf(o.x), jy = H.indexOf((o.ys || [])[0]); if (jx < 0 || jy < 0) return { groups: [], n: 0 };
  const xt = dsbTypeOf(tab, o.x); const X = xt === "time" ? dsbTkCol(tab, jx) : dsbNumCol(tab, jx), Y = dsbNumCol(tab, jy);
  const GL = o.group && H.includes(o.group) ? dsbLabCol(tab, H.indexOf(o.group), dsbTypeOf(tab, o.group)) : null; const Z = o.size && H.includes(o.size) ? dsbNumCol(tab, H.indexOf(o.size)) : null; const jl = o.label ? H.indexOf(o.label) : -1;
  const g = new Map(); let n = 0; const N = dsbN(tab, idx);
  for (let ii = 0; ii < N; ii++) { const i = dsbAt(idx, ii); const x = X[i], y = Y[i]; if (!(x === x) || !(y === y)) continue; n++;
    const k = GL ? (GL[i] == null ? "(blank)" : GL[i]) : o.ys[0]; const p = { x, y }; if (Z) p.z = Z[i] === Z[i] ? Z[i] : 0; if (jl >= 0) p.label = String(tab.rows[i][jl] ?? ""); let a = g.get(k); if (!a) g.set(k, a = []); a.push(p); }
  let groups = [...g.entries()].sort((a, b) => b[1].length - a[1].length); if (groups.length > 12) { const rest = groups.slice(11).flatMap(e => e[1]); groups = [...groups.slice(0, 11), ["Other", rest]]; }
  const stride = n > max ? Math.ceil(n / max) : 1; groups = groups.map(([k, pts]) => ({ name: k, pts: stride > 1 ? pts.filter((_, i) => i % stride === 0) : pts, all: pts }));
  return { groups, n, sampled: stride > 1, xTime: xt === "time" }; };
// ── heatmaps ──
// matrix: rows = group column, columns = x column, cell = agg(value)
const dsbMatrix = (tab, idx, o) => { const r = dsbGroup(tab, idx, { ...o, maxGroups: o.maxRows || 40, sort: r0sort(o) }); let xs = r.data.map(d => d.__x);
  if (r.xType === "text" && xs.length > (o.maxCols || 60)) xs = xs.slice(0, o.maxCols || 60); const xset = new Set(xs);
  const ys = r.keys; const cells = []; let mn = Infinity, mx = -Infinity; r.data.forEach(d => { if (!xset.has(d.__x)) return; ys.forEach(k => { const v = d[k]; if (v == null || !isFinite(v)) return; cells.push({ x: d.__x, y: k, v }); if (v < mn) mn = v; if (v > mx) mx = v; }); });
  return { xs, ys, cells, min: mn, max: mx, xType: r.xType }; };
const r0sort = (o) => o.sort || "label";
// daily values (calendar) and year x month grid
const dsbDaily = (tab, idx, o) => { const H = tab.headers, jd = H.indexOf(o.x); if (jd < 0) return []; const L = dsbLabCol(tab, jd, "time"); const yc = (o.ys || [])[0]; const Y = yc && H.includes(yc) ? dsbNumCol(tab, H.indexOf(yc)) : null; const how = Y ? (o.agg || "sum") : "count"; const m = new Map(); const N = dsbN(tab, idx);
  for (let ii = 0; ii < N; ii++) { const i = dsbAt(idx, ii); const l = L[i]; if (l == null) continue; let a = m.get(l); if (!a) m.set(l, a = dsbAggNew()); const x = Y ? Y[i] : 1; dsbAggAdd(a, x, x, how === "distinct" ? "count" : how); }
  const out = []; m.forEach((a, l) => { const t = dsbTime(l); if (!t) return; const v = dsbAggOut(a, how === "distinct" ? "count" : how); if (v != null) out.push({ t, v }); }); return out.sort((a, b) => a.t.k - b.t.k); };
const dsbTimeGrid = (tab, idx, o) => { const how = o.agg || "sum"; const H = tab.headers, jd = H.indexOf(o.x); if (jd < 0) return { xs: [], ys: [], cells: [] }; const L = dsbLabCol(tab, jd, "time"); const yc = (o.ys || [])[0]; const Y = yc && H.includes(yc) ? dsbNumCol(tab, H.indexOf(yc)) : null; const h2 = Y ? how : "count";
  const memo = new Map(); let kind = null; const m = new Map(); const N = dsbN(tab, idx); const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let ii = 0; ii < N; ii++) { const i = dsbAt(idx, ii); const l = L[i]; if (l == null) continue; let t = memo.get(l); if (t === undefined) { t = dsbTime(l); memo.set(l, t); } if (!t) continue; kind = kind || t.kind;
    const c = t.kind === "quarter" ? `Q${Math.ceil(t.m / 3)}` : MON[t.m - 1]; const k = t.y + "|" + c; let a = m.get(k); if (!a) m.set(k, a = dsbAggNew()); const x = Y ? Y[i] : 1; dsbAggAdd(a, x, x, h2 === "distinct" ? "count" : h2); }
  const cols = kind === "quarter" ? ["Q1", "Q2", "Q3", "Q4"] : MON; const years = new Set(); const cells = []; let mn = Infinity, mx = -Infinity;
  m.forEach((a, k) => { const [y, c] = k.split("|"); years.add(y); const v = dsbAggOut(a, h2 === "distinct" ? "count" : h2); if (v == null) return; cells.push({ x: c, y, v }); if (v < mn) mn = v; if (v > mx) mx = v; });
  return { xs: cols, ys: [...years].sort(), cells, min: mn, max: mx, kind }; };
// 2-D density: bin two numeric columns
const dsbBin2d = (tab, idx, o, nb = 26) => { const P = dsbPoints(tab, dsbSampleIdx(tab, idx, 300000), o, Infinity); const pts = P.groups.flatMap(g => g.all); if (!pts.length) return null;
  const xs = pts.map(p => p.x).sort((a, b) => a - b), ys = pts.map(p => p.y).sort((a, b) => a - b); const trim = o.trim === false ? 0 : 0.005;
  const x0 = dsbQuantSorted(xs, trim), x1 = dsbQuantSorted(xs, 1 - trim), y0 = dsbQuantSorted(ys, trim), y1 = dsbQuantSorted(ys, 1 - trim);
  const nx = nb, ny = nb, dx = (x1 - x0) / nx || 1, dy = (y1 - y0) / ny || 1; const c = new Map(); let used = 0;
  pts.forEach(p => { if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) return; used++; const i = Math.min(nx - 1, Math.floor((p.x - x0) / dx)), j = Math.min(ny - 1, Math.floor((p.y - y0) / dy)); const k = i * 10000 + j; c.set(k, (c.get(k) || 0) + 1); });
  let mx = 0; const cells = []; c.forEach((v, k) => { const i = Math.floor(k / 10000), j = k % 10000; cells.push({ i, j, v }); if (v > mx) mx = v; }); return { x0, x1, y0, y1, nx, ny, dx, dy, cells, max: mx, n: pts.length, used }; };
// ── flows ──
const dsbSankey = (tab, idx, o) => { const r = dsbGroup(tab, idx, { x: o.x, group: o.group, ys: o.ys, agg: o.agg || "sum", maxGroups: 10, sort: "desc" }); const rows = r.data.slice(0, 10); const src = rows.map(d => d.__x);
  const tgt = r.keys; const nodes = [...src.map(s => ({ name: s })), ...tgt.map(t => ({ name: src.includes(t) ? t + " →" : t }))]; const links = [];
  rows.forEach((d, i) => tgt.forEach((t, k) => { const v = +d[t]; if (v > 0) links.push({ source: i, target: src.length + k, value: v }); })); return { nodes, links }; };
const dsbWaterfall = (data, key) => { let run = 0; const out = data.map(d => { const v = +d[key] || 0; const base = v >= 0 ? run : run + v; run += v; return { __x: d.__x, base, up: v >= 0 ? v : 0, down: v < 0 ? -v : 0, v, end: run }; });
  out.push({ __x: "Total", base: Math.min(0, run), up: run >= 0 ? run : 0, down: run < 0 ? -run : 0, v: run, end: run, total: true }); return out; };
// ── formatting and colour ──
const dsbFmt = (v, d) => { if (v == null || !isFinite(v)) return "–"; const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(2).replace(/\.?0+$/, "") + "T"; if (a >= 1e9) return (v / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B"; if (a >= 1e6) return (v / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M"; if (a >= 1e4) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  if (d != null) return v.toFixed(d); if (a >= 100) return v.toFixed(0); if (a >= 1) return v.toFixed(2).replace(/\.?0+$/, ""); if (a === 0) return "0"; return v.toPrecision(3); };
const dsbHex = (h) => { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const dsbMix = (a, b, t) => { const A = dsbHex(a), B = dsbHex(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); };
const DSB_SCALES = { blues: ["#eff6ff", "#93c5fd", "#2563eb", "#1e3a8a"], greens: ["#f0fdf4", "#86efac", "#16a34a", "#14532d"], oranges: ["#fff7ed", "#fdba74", "#ea580c", "#7c2d12"], purples: ["#faf5ff", "#c4b5fd", "#7c3aed", "#3b0764"],
  viridis: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"], magma: ["#000004", "#51127c", "#b73779", "#fc8961", "#fcfdbf"], heat: ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"], redblue: ["#b2182b", "#ef8a62", "#f7f7f7", "#67a9cf", "#2166ac"], greenred: ["#1a9850", "#91cf60", "#f7f7f7", "#fc8d59", "#d73027"] };
const DSB_SCALE_NAMES = [["blues", "Blues"], ["greens", "Greens"], ["oranges", "Oranges"], ["purples", "Purples"], ["viridis", "Viridis"], ["magma", "Magma"], ["heat", "Heat"], ["redblue", "Red to blue (diverging)"], ["greenred", "Green to red (diverging)"]];
const dsbColor = (scale, t) => { const s = DSB_SCALES[scale] || DSB_SCALES.blues; if (t == null || !isFinite(t)) return null; t = Math.max(0, Math.min(1, t)); const p = t * (s.length - 1), i = Math.min(s.length - 2, Math.floor(p)); return dsbMix(s[i], s[i + 1], p - i); };
const dsbInk = (hex) => { if (!hex) return "#000"; const [r, g, b] = dsbHex(hex); return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#111827" : "#f9fafb"; };
// ── chart catalogue ──
// fields: x, ys (one|many|two), group, size; kinds: cat (any), num, time
const DSB_TYPES = [
  // comparison
  { k: "bar", fam: "Compare", label: "Column", desc: "Compare values across categories or years.", f: { x: "Category or time", ys: "Values (one or more)", group: "Split by (optional)" }, agg: true, opts: ["sort", "top", "labels", "stack0", "brush", "log"] },
  { k: "hbar", fam: "Compare", label: "Bar (horizontal)", desc: "Long category names, ranked lists.", f: { x: "Category", ys: "Values", group: "Split by (optional)" }, agg: true, opts: ["sort", "top", "labels"] },
  { k: "stackbar", fam: "Compare", label: "Stacked column", desc: "Totals and their parts.", f: { x: "Category or time", ys: "Values (two or more) or one value", group: "Split by" }, agg: true, opts: ["sort", "top", "brush"] },
  { k: "stack100", fam: "Compare", label: "100% stacked column", desc: "Shares of the total in each category.", f: { x: "Category or time", ys: "Values", group: "Split by" }, agg: true, opts: ["sort", "top"] },
  { k: "lollipop", fam: "Compare", label: "Lollipop", desc: "A cleaner ranked bar chart.", f: { x: "Category", ys: "Value (one)" }, agg: true, opts: ["sort", "top"] },
  { k: "dumbbell", fam: "Compare", label: "Dumbbell", desc: "Gap between two values per category (before and after).", f: { x: "Category", ys: "Two values (start, end)" }, agg: true, opts: ["sort", "top"] },
  { k: "waterfall", fam: "Compare", label: "Waterfall", desc: "How positive and negative pieces add up to a total.", f: { x: "Step or category", ys: "Value (one)" }, agg: true, opts: [] },
  { k: "radar", fam: "Compare", label: "Radar", desc: "Profiles across several measures.", f: { x: "Category (axes)", ys: "Values (series)", group: "Split by (optional)" }, agg: true, opts: ["top"] },
  { k: "pyramid", fam: "Compare", label: "Pyramid (population)", desc: "Two groups back to back, e.g. male and female by age band.", f: { x: "Bands (e.g. age group)", ys: "Left value, right value" }, agg: true, opts: [] },
  // trend
  { k: "line", fam: "Trend", label: "Line", desc: "Change over time.", f: { x: "Time or ordered category", ys: "Values (one or more)", group: "Split by (optional)" }, agg: true, opts: ["bucket", "brush", "dots", "log", "smooth"] },
  { k: "area", fam: "Trend", label: "Area", desc: "Change over time with volume.", f: { x: "Time", ys: "Values", group: "Split by (optional)" }, agg: true, opts: ["bucket", "brush", "log"] },
  { k: "stackarea", fam: "Trend", label: "Stacked area", desc: "Parts of a total over time.", f: { x: "Time", ys: "Values", group: "Split by" }, agg: true, opts: ["bucket", "brush"] },
  { k: "stream100", fam: "Trend", label: "100% stacked area", desc: "Shares over time.", f: { x: "Time", ys: "Values", group: "Split by" }, agg: true, opts: ["bucket", "brush"] },
  { k: "step", fam: "Trend", label: "Step line", desc: "Values that change in jumps (rates, prices set by policy).", f: { x: "Time", ys: "Values", group: "Split by (optional)" }, agg: true, opts: ["bucket", "brush"] },
  { k: "combo", fam: "Trend", label: "Column + line (two axes)", desc: "One value as columns, another as a line on its own axis.", f: { x: "Time or category", ys: "Column value, line value" }, agg: true, opts: ["bucket", "brush"] },
  // part to whole
  { k: "pie", fam: "Parts", label: "Pie", desc: "Share of a whole (best with 6 or fewer slices).", f: { x: "Category", ys: "Value (blank = count rows)" }, agg: true, opts: ["top", "labels"] },
  { k: "donut", fam: "Parts", label: "Donut", desc: "Pie with the total in the middle.", f: { x: "Category", ys: "Value (blank = count rows)" }, agg: true, opts: ["top", "labels"] },
  { k: "treemap", fam: "Parts", label: "Treemap", desc: "Many categories sized by value.", f: { x: "Category", ys: "Value (blank = count rows)" }, agg: true, opts: ["top"] },
  { k: "waffle", fam: "Parts", label: "Waffle", desc: "Shares shown as 100 squares.", f: { x: "Category", ys: "Value (blank = count rows)" }, agg: true, opts: ["top"] },
  { k: "funnel", fam: "Parts", label: "Funnel", desc: "Stages that narrow (applications to approvals).", f: { x: "Stage", ys: "Value" }, agg: true, opts: [] },
  { k: "radial", fam: "Parts", label: "Radial bar", desc: "Progress rings per category.", f: { x: "Category", ys: "Value" }, agg: true, opts: ["top"] },
  { k: "sankey", fam: "Parts", label: "Sankey (flows)", desc: "Flows from one category to another (exports by origin to destination).", f: { x: "From", group: "To", ys: "Amount (blank = count rows)" }, agg: true, opts: [] },
  // distribution
  { k: "hist", fam: "Distribution", label: "Histogram", desc: "How values are spread.", f: { ys: "Numeric variable", group: "Split by (optional)" }, opts: ["bins", "density"] },
  { k: "density", fam: "Distribution", label: "Density curve", desc: "Smoothed distribution; compare groups.", f: { ys: "Numeric variable(s)", group: "Split by (optional)" }, opts: [] },
  { k: "box", fam: "Distribution", label: "Box plot", desc: "Median, quartiles and outliers by group.", f: { ys: "Numeric variable(s)", group: "Split by (optional)" }, opts: ["points"] },
  { k: "violin", fam: "Distribution", label: "Violin", desc: "Box plot with the full distribution shape.", f: { ys: "Numeric variable(s)", group: "Split by (optional)" }, opts: [] },
  { k: "strip", fam: "Distribution", label: "Dot strip", desc: "Every observation as a dot, by group.", f: { ys: "Numeric variable", group: "Split by (optional)" }, opts: [] },
  // relationship
  { k: "scatter", fam: "Relationship", label: "Scatter", desc: "Relationship between two numbers, with a fitted line.", f: { x: "X (number)", ys: "Y (number)", group: "Colour by (optional)", label: "Point label (optional)" }, opts: ["trend", "log"] },
  { k: "bubble", fam: "Relationship", label: "Bubble", desc: "Scatter with a third number as bubble size.", f: { x: "X (number)", ys: "Y (number)", size: "Bubble size", group: "Colour by (optional)", label: "Point label (optional)" }, opts: ["log"] },
  // heatmaps
  { k: "heatmap", fam: "Heatmap", label: "Heatmap (matrix)", desc: "Two categories (or category and year) with colour for the value.", f: { x: "Columns (category or time)", group: "Rows (category)", ys: "Value (blank = count rows)" }, agg: true, opts: ["scale", "values", "bucket"] },
  { k: "corr", fam: "Heatmap", label: "Correlation heatmap", desc: "How every pair of numeric variables moves together.", f: { ys: "Numeric variables (two or more; blank = all)" }, opts: ["method", "cluster", "values", "lower"] },
  { k: "calendar", fam: "Heatmap", label: "Calendar heatmap", desc: "Daily values on a calendar (activity, returns, rainfall).", f: { x: "Date (daily)", ys: "Value (blank = count rows)" }, agg: true, opts: ["scale"] },
  { k: "timegrid", fam: "Heatmap", label: "Year × month heatmap", desc: "Seasonality: years down, months across.", f: { x: "Date or month", ys: "Value" }, agg: true, opts: ["scale", "values"] },
  { k: "tableheat", fam: "Heatmap", label: "Highlight table", desc: "Table with each column shaded from low to high.", f: { x: "Row label", ys: "Numeric columns" }, agg: true, opts: ["scale", "top"] },
  { k: "density2d", fam: "Heatmap", label: "2-D density", desc: "Where points cluster when a scatter is too crowded.", f: { x: "X (number)", ys: "Y (number)" }, opts: ["scale"] },
  // indicators
  { k: "kpi", fam: "Indicator", label: "KPI card", desc: "One headline number with change and a sparkline.", f: { ys: "Value", x: "Time (optional, for change)" }, agg: true, opts: ["bucket"] },
  { k: "gauge", fam: "Indicator", label: "Gauge", desc: "A number against a target range.", f: { ys: "Value" }, agg: true, opts: ["range"] },
  { k: "table", fam: "Indicator", label: "Table", desc: "Summary table you can sort.", f: { x: "Group by (optional)", ys: "Columns" }, agg: true, opts: ["top"] },
  // 3D (drag to turn, wheel to zoom)
  { k: "bar3d", fam: "3D", label: "3D columns", desc: "Columns on a grid: a category or year across, another category in depth, the value as height. Drag to turn.", f: { x: "Across (category or time)", group: "Depth (category)", ys: "Height (value; blank = count rows)" }, agg: true, opts: ["bucket", "scale", "spin"] },
  { k: "surface3d", fam: "3D", label: "3D surface", desc: "A landscape of values over two categories or years. Drag to turn.", f: { x: "Across (category or time)", group: "Depth (category)", ys: "Height (value; blank = count rows)" }, agg: true, opts: ["bucket", "scale", "spin"] },
  { k: "line3d", fam: "3D", label: "3D lines (ribbons)", desc: "One line per group, set one behind another. Drag to turn.", f: { x: "Time or ordered category", group: "Lines (category)", ys: "Value" }, agg: true, opts: ["bucket", "spin"] },
  { k: "scatter3d", fam: "3D", label: "3D scatter", desc: "Three numbers at once: X, Y and Z (height). Drag to turn.", f: { x: "X (number)", ys: "Y (number)", size: "Z (number, height)", group: "Colour by (optional)", label: "Point label (optional)" }, opts: ["spin"] },
];
const DSB_FAMS = ["Compare", "Trend", "Parts", "Distribution", "Relationship", "Heatmap", "3D", "Indicator"];
const dsbType = (k) => DSB_TYPES.find(t => t.k === k) || DSB_TYPES[0];
const dsbUid = () => "t" + Math.random().toString(36).slice(2, 9);
// suggest a starter dashboard for one table
const dsbSuggest = (tab, src) => { const P = dsbProfile(tab); const num = P.filter(p => p.type === "number"), tim = P.find(p => p.type === "time"), cat = P.filter(p => p.type === "text" && p.unique >= 2 && p.unique <= 60), catAny = P.filter(p => p.type === "text" && p.unique >= 2 && !p.uniqueCapped);
  const T = []; const add = (t) => T.push({ id: dsbUid(), src, agg: "sum", w: 1, ...t });
  if (num[0]) add({ type: "kpi", ys: [num[0].name], x: tim ? tim.name : "", agg: tim ? "mean" : "mean", title: `${num[0].name} (average)`, opts: { bucket: tim && tim.kind === "day" ? "month" : "keep" } });
  if (num[1]) add({ type: "kpi", ys: [num[1].name], x: tim ? tim.name : "", agg: "mean", title: `${num[1].name} (average)`, opts: { bucket: tim && tim.kind === "day" ? "month" : "keep" } });
  if (tim && num[0]) add({ type: "line", x: tim.name, ys: (cat.length ? num.slice(0, 1) : num.slice(0, 3).filter(p => { const a = Math.abs(p.median || p.mean || 0), b = Math.abs(num[0].median || num[0].mean || 0); return p === num[0] || (a && b && a / b < 10 && b / a < 10); })).map(p => p.name), group: cat[0] && cat[0].unique <= 12 ? cat[0].name : "", agg: "mean", w: 2, title: `${num[0].name} over time`, opts: { bucket: tim.kind === "day" ? "month" : "keep", brush: true } });
  const cb = cat[0] || catAny[0]; if (cb && num[0]) add({ type: "hbar", x: cb.name, ys: [num[0].name], agg: "mean", title: `${num[0].name} by ${cb.name}${cb.unique > 15 ? " (top 15)" : ""}`, opts: { top: 15, sort: "desc", other: false } });
  if (num[0]) add({ type: "hist", ys: [num[0].name], title: `Distribution of ${num[0].name}`, opts: { bins: "auto" } });
  if (num.length >= 3) add({ type: "corr", ys: num.slice(0, 10).map(p => p.name), title: "Correlations", opts: { values: true, scale: "redblue" } });
  if (tim && num[0] && cat[0] && cat[0].unique <= 40) add({ type: "heatmap", x: tim.name, group: cat[0].name, ys: [num[0].name], agg: "mean", w: 2, title: `${num[0].name} by ${cat[0].name} and time`, opts: { bucket: tim.kind === "day" ? "year" : "keep", scale: "viridis" } });
  if (cat[0] && !num.length) add({ type: "donut", x: cat[0].name, ys: [], agg: "count", title: `Rows by ${cat[0].name}`, opts: { top: 6 } });
  if (num[1] && num[0]) add({ type: "scatter", x: num[0].name, ys: [num[1].name], title: `${num[1].name} vs ${num[0].name}`, opts: { trend: true } });
  return T; };
// ── dashboard backgrounds ──
const DSB_BGS = [
  { k: "theme", label: "App theme", css: null },
  { k: "midnight", label: "Midnight", css: "linear-gradient(160deg, #0b1220 0%, #1e293b 100%)", dark: true },
  { k: "ocean", label: "Ocean", css: "linear-gradient(160deg, #0f2027 0%, #203a43 50%, #2c5364 100%)", dark: true },
  { k: "forest", label: "Forest", css: "linear-gradient(160deg, #0b2b22 0%, #14532d 100%)", dark: true },
  { k: "dusk", label: "Dusk", css: "linear-gradient(160deg, #2b1d3f 0%, #5b3a6b 100%)", dark: true },
  { k: "kente", label: "Kente", css: "linear-gradient(135deg, #7a5200 0%, #0b5d2c 50%, #7a1018 100%)", dark: true },
  { k: "blueprint", label: "Blueprint", css: "linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px) 0 0 / 24px 24px, linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px) 0 0 / 24px 24px, #0b3d91", dark: true },
  { k: "paper", label: "Paper", css: "#f5f2ea", dark: false },
  { k: "mist", label: "Mist", css: "linear-gradient(160deg, #eef2f7 0%, #d9e2ec 100%)", dark: false },
  { k: "sand", label: "Sand", css: "linear-gradient(160deg, #f7efe2 0%, #e9dcc5 100%)", dark: false },
  { k: "dots", label: "Dots", css: "radial-gradient(rgba(0,0,0,.12) 1px, transparent 1px) 0 0 / 18px 18px, #f4f6f9", dark: false },
];
const dsbIsDark = (hex) => { try { const [r, g, b] = dsbHex(hex); return (0.299 * r + 0.587 * g + 0.114 * b) < 140; } catch (e) { return true; } };
const dsbBgCss = (bg) => { if (!bg || bg.k === "theme" || !bg.k) return null; if (bg.k === "color") return { css: bg.c1 || "#0b1220", dark: dsbIsDark(bg.c1 || "#0b1220") };
  if (bg.k === "gradient") return { css: `linear-gradient(${bg.angle || 160}deg, ${bg.c1 || "#0b1220"} 0%, ${bg.c2 || "#1e293b"} 100%)`, dark: dsbIsDark(bg.c1 || "#0b1220") && dsbIsDark(bg.c2 || "#1e293b") };
  const p = DSB_BGS.find(x => x.k === bg.k); return p && p.css ? { css: p.css, dark: p.dark } : null; };
// ══════════════════════════════════════════════
// DASHBOARD STUDIO (UI): data summaries, chart tiles, filters, export
// ══════════════════════════════════════════════
const _dsbRowsId = new WeakMap(); let _dsbRowsSeq = 0;
const dsbTabKey = (tab) => { if (!tab || !Array.isArray(tab.rows)) return "none"; let k = _dsbRowsId.get(tab.rows); if (!k) { k = ++_dsbRowsSeq; _dsbRowsId.set(tab.rows, k); } return k + "|" + tab.headers.join("\u0001"); };
function useDsbWidth() { const ref = useRef(null); const [w, setW] = useState(0);
  useEffect(() => { const el = ref.current; if (!el) return; setW(Math.floor(el.getBoundingClientRect().width)); if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(e => { const cw = Math.floor(e[0].contentRect.width); setW(x => Math.abs(x - cw) > 2 ? cw : x); }); ro.observe(el); return () => ro.disconnect(); }, []);
  return [ref, w]; }
const dsbTicks = (mn, mx, n = 5) => { if (!isFinite(mn) || !isFinite(mx)) return []; if (mn === mx) { mn -= 1; mx += 1; } const st = dsbNiceStep(mx - mn, n); const out = []; for (let v = Math.ceil(mn / st) * st; v <= mx + st * 1e-9; v += st) out.push(Math.abs(v) < st * 1e-6 ? 0 : +v.toPrecision(12)); return out; };
const dsbCol = (i) => C.series[i % C.series.length];
const dsbAxis = () => ({ tick: { fill: C.mid, fontSize: 11 }, stroke: C.border, tickLine: false });
const dsbShort = (s, n = 16) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
// sensible fields when a chart type is picked
const dsbDefaults = (type, tab, prev = {}) => {
  const P = dsbProfile(tab); const has = (c) => c && tab.headers.includes(c); const num = P.filter(p => p.type === "number").map(p => p.name), tim = P.filter(p => p.type === "time").map(p => p.name), cat = P.filter(p => p.type === "text" && p.unique >= 2 && p.unique <= 400).map(p => p.name);
  const T = dsbType(type); const o = { x: has(prev.x) ? prev.x : "", ys: (prev.ys || []).filter(has), group: has(prev.group) ? prev.group : "", size: has(prev.size) ? prev.size : "", label: has(prev.label) ? prev.label : "" };
  const typeOf = (c) => (P.find(p => p.name === c) || {}).type; const pickX = (pref) => { for (const k of pref) { const list = k === "time" ? tim : k === "num" ? num : cat; if (list.length) return o.x && list.includes(o.x) ? o.x : list[0]; } return ""; };
  const numYs = (n) => { const ys = o.ys.filter(c => typeOf(c) === "number"); for (const c of num) { if (ys.length >= n) break; if (!ys.includes(c) && c !== o.x) ys.push(c); } return ys.slice(0, Math.max(n, ys.length)); };
  if (["line", "area", "stackarea", "stream100", "step", "combo", "calendar", "timegrid", "bar3d", "surface3d", "line3d"].includes(type)) o.x = pickX(["time", "cat"]);
  else if (["scatter", "bubble", "density2d", "scatter3d"].includes(type)) o.x = num.includes(o.x) ? o.x : (num[0] || "");
  else if (["hist", "density", "box", "violin", "strip", "corr", "gauge"].includes(type)) o.x = "";
  else if (type === "kpi") o.x = tim.includes(o.x) ? o.x : (tim[0] || "");
  else if (type === "table") o.x = o.x || cat[0] || "";
  else o.x = pickX(["cat", "time"]);
  if (["scatter", "bubble", "density2d", "scatter3d"].includes(type)) { const y = o.ys.find(c => typeOf(c) === "number" && c !== o.x) || num.find(c => c !== o.x) || ""; o.ys = y ? [y] : []; }
  else if (["dumbbell", "pyramid", "combo"].includes(type)) o.ys = numYs(2).slice(0, 2);
  else if (type === "corr") o.ys = o.ys.filter(c => typeOf(c) === "number").length >= 2 ? o.ys.filter(c => typeOf(c) === "number") : num.slice(0, 10);
  else if (["tableheat", "table"].includes(type)) o.ys = o.ys.filter(c => typeOf(c) === "number").length ? o.ys.filter(c => typeOf(c) === "number") : num.slice(0, 6);
  else if (["pie", "donut", "treemap", "waffle", "funnel", "radial", "sankey", "heatmap", "calendar", "bar3d", "surface3d", "line3d"].includes(type)) o.ys = o.ys.filter(c => typeOf(c) === "number").slice(0, 1);
  else if (["hist", "density", "box", "violin", "strip"].includes(type)) o.ys = numYs(1).slice(0, type === "hist" || type === "strip" ? 1 : 6);
  else if (["lollipop", "waterfall", "gauge", "kpi"].includes(type)) o.ys = numYs(1).slice(0, 1);
  else o.ys = numYs(1);
  if (["stackbar", "stack100", "stackarea", "stream100"].includes(type) && o.ys.length < 2 && !o.group) o.group = cat.find(c => c !== o.x && (P.find(p => p.name === c) || {}).unique <= 12) || "";
  if (type === "heatmap") o.group = cat.find(c => c !== o.x) || (o.group !== o.x ? o.group : "") || "";
  if (type === "sankey") { o.x = cat[0] || ""; o.group = cat.find(c => c !== o.x) || ""; }
  if (["bar3d", "surface3d", "line3d"].includes(type)) o.group = cat.find(c => c !== o.x && (P.find(p => p.name === c) || {}).unique <= 40) || cat.find(c => c !== o.x) || "";
  if (type === "bubble" || type === "scatter3d") o.size = num.find(c => c !== o.x && !o.ys.includes(c)) || num[0] || "";
  if (["corr", "gauge", "calendar", "timegrid", "density2d", "combo", "dumbbell", "pyramid", "waterfall", "lollipop", "funnel", "tableheat", "table", "kpi"].includes(type)) o.group = "";
  const sumLike = ["pie", "donut", "treemap", "waffle", "funnel", "sankey", "stackbar", "stack100", "stackarea", "stream100", "waterfall", "radial", "pyramid"].includes(type);
  o.agg = !o.ys.length ? "count" : prev.agg && prev.agg !== "count" ? prev.agg : (sumLike ? "sum" : "mean");
  return o;
};
const dsbNeeds = (t) => { const T = dsbType(t.type); const miss = [];
  if (T.f.x && !/optional/i.test(T.f.x) && !t.x) miss.push(T.f.x);
  if (T.f.ys && !/blank/i.test(T.f.ys) && !(t.ys || []).length) miss.push(T.f.ys);
  if (["dumbbell", "pyramid", "combo"].includes(t.type) && (t.ys || []).length < 2) miss.push("a second value");
  if (t.type === "corr" && (t.ys || []).length === 1) miss.push("at least two numeric variables");
  if ((t.type === "heatmap" || t.type === "sankey") && !t.group) miss.push(T.f.group);
  if (t.type === "bubble" && !t.size) miss.push("Bubble size");
  if (t.type === "scatter3d" && !t.size) miss.push("Z (number, height)");
  if (["bar3d", "surface3d", "line3d"].includes(t.type) && !t.group) miss.push(T.f.group);
  return miss; };
// compute the data a tile needs
const dsbModel = (t, tab, idx) => {
  const miss = dsbNeeds(t); if (miss.length) return { err: `Choose ${miss.join(", ")} in the chart settings.` };
  const o = { ...(t.opts || {}) }; const base = { x: t.x, ys: t.ys, group: t.group, agg: t.agg, bucket: o.bucket, sort: o.sort, top: o.top ? +o.top : 0 }; const N = dsbN(tab, idx);
  if (!N) return { err: "No rows match the current filters." };
  switch (t.type) {
    case "hist": { const D = dsbDists(tab, idx, t, 8); const all = D.flatMap(d => d.vals); if (!all.length) return { err: "No numeric values to plot." }; let lo = Infinity, hi = -Infinity; for (const v of all) { if (v < lo) lo = v; if (v > hi) hi = v; }
      if (o.trim !== false && all.length > 50) { const s = [...all].sort((a, b) => a - b); lo = dsbQuantSorted(s, 0.001); hi = dsbQuantSorted(s, 0.999); }
      const H = D.map(d => dsbHist(d.vals.filter(v => v >= lo && v <= hi), o.bins || "auto", lo, hi)); const data = H[0].map((b, i) => { const r = { __x: b.__x, lo: b.lo, hi: b.hi }; D.forEach((d, k) => { const c = H[k][i]; r[d.name] = c ? (o.density ? c.share * 100 : c.Count) : 0; }); return r; });
      return { kind: "bars", data, keys: D.map(d => d.name), hist: true, n: all.length, yLab: o.density ? "% of values" : "Count" }; }
    case "density": { const D = dsbDists(tab, idx, t, 8).filter(d => d.vals.length > 1); if (!D.length) return { err: "Need at least two numeric values." }; const all = D.flatMap(d => d.vals).sort((a, b) => a - b);
      const lo = dsbQuantSorted(all, 0.002), hi = dsbQuantSorted(all, 0.998); const K = D.map(d => dsbKde(d.vals.filter(v => v >= lo && v <= hi), 120, lo, hi)); const data = K[0].map((p, i) => { const r = { x: p.x }; D.forEach((d, k) => { r[d.name] = K[k][i] ? K[k][i].y : 0; }); return r; });
      return { kind: "density", data, keys: D.map(d => d.name) }; }
    case "box": case "violin": case "strip": { const D = dsbDists(tab, idx, t, t.type === "strip" ? 12 : 16).filter(d => d.vals.length); if (!D.length) return { err: "No numeric values to plot." };
      return { kind: t.type, groups: D.map(d => ({ name: d.name, box: dsbBox(d.vals), kde: t.type === "violin" ? null : null, vals: d.vals })) }; }
    case "scatter": case "bubble": case "density2d": {
      if (t.type === "density2d") { const B = dsbBin2d(tab, idx, t); if (!B) return { err: "No pairs of numbers to plot." }; return { kind: "density2d", B }; }
      const P = dsbPoints(tab, idx, t, 3000); if (!P.n) return { err: "No pairs of numbers to plot." };
      const fit = o.trend !== false && t.type === "scatter" ? dsbOls(P.groups.flatMap(g => g.all)) : null; return { kind: "scatter", P, fit }; }
    case "bar3d": case "surface3d": case "line3d": { const M = dsbMatrix(tab, idx, { ...base, maxRows: t.type === "line3d" ? 12 : 25, maxCols: t.type === "bar3d" ? 30 : 60 }); if (!M.cells.length) return { err: "No values for this combination." }; return { kind: "3d", mode: t.type, M }; }
    case "scatter3d": { const P = dsbPoints(tab, idx, t, 2500); if (!P.n) return { err: "No rows with all three numbers." }; return { kind: "3d", mode: "scatter3d", P }; }
    case "heatmap": { const M = dsbMatrix(tab, idx, { ...base, maxRows: 40, maxCols: 60 }); if (!M.cells.length) return { err: "No values for this combination." }; return { kind: "grid", M }; }
    case "corr": { const cols = (t.ys || []).length ? t.ys : dsbProfile(tab).filter(p => p.type === "number").map(p => p.name).slice(0, 20); if (cols.length < 2) return { err: "Need at least two numeric variables." };
      const R = dsbCorr(tab, idx, cols, o.method || "pearson"); const ord = o.cluster ? dsbCorrOrder(R) : cols.map((_, i) => i); const cells = []; ord.forEach((a, ia) => ord.forEach((b, ib) => { if (o.lower && ib > ia) return; const c = R[a][b]; if (c.r != null) cells.push({ x: cols[b], y: cols[a], v: c.r, n: c.n }); }));
      return { kind: "grid", M: { xs: ord.map(i => cols[i]), ys: ord.map(i => cols[i]), cells, min: -1, max: 1, corr: true }, sampled: N > 200000 }; }
    case "calendar": { const D = dsbDaily(tab, idx, t); if (!D.length) return { err: "No dates found in this column." }; if (D[0].t.kind !== "day") return { err: "The calendar needs daily dates (like 2024-03-15). Use the Year × month heatmap for monthly or yearly data." }; return { kind: "calendar", D }; }
    case "timegrid": { const M = dsbTimeGrid(tab, idx, t); if (!M.cells.length) return { err: "No dates found in this column." }; if (M.kind === "year") return { err: "This column only has years. Use a column chart or the matrix heatmap instead." }; return { kind: "grid", M }; }
    case "sankey": { const S = dsbSankey(tab, idx, t); if (!S.links.length) return { err: "No flows to show (amounts must be positive)." }; return { kind: "sankey", S }; }
    default: break; }
  // grouped kinds
  const top = base.top || (["pie", "donut", "waffle", "radial"].includes(t.type) ? 8 : ["treemap"].includes(t.type) ? 30 : ["radar"].includes(t.type) ? 12 : ["hbar", "lollipop", "dumbbell", "funnel"].includes(t.type) ? 25 : ["bar", "stackbar", "stack100"].includes(t.type) ? 30 : ["tableheat", "table"].includes(t.type) ? 50 : 0);
  if (t.type === "kpi" || t.type === "gauge") { const all = dsbGroup(tab, idx, { ys: t.ys, agg: t.agg }); const v = all.data[0] ? all.data[0][all.keys[0]] : null; let series = null, change = null;
    if (t.type === "kpi" && t.x) { const s = dsbGroup(tab, idx, { x: t.x, ys: t.ys, agg: t.agg, bucket: o.bucket }); series = s.data.map(d => ({ x: d.__x, v: d[s.keys[0]] })).filter(d => d.v != null); if (series.length > 1) { const a = series[series.length - 2].v, b = series[series.length - 1].v; change = { from: series[series.length - 2].x, to: series[series.length - 1].x, last: b, pct: a ? (b - a) / Math.abs(a) * 100 : null, diff: b - a }; } }
    const pr = dsbProfile(tab).find(p => p.name === (t.ys || [])[0]) || {}; return { kind: t.type, v, series, change, n: N, colMin: pr.min, colMax: pr.max }; }
  const G = dsbGroup(tab, idx, { ...base, top, sort: base.sort || (["line", "area", "stackarea", "stream100", "step", "combo", "radar", "waterfall", "funnel", "pyramid"].includes(t.type) ? "none" : "desc"), lumpOther: o.other !== false && ["pie", "donut", "treemap", "waffle", "bar", "hbar", "stackbar", "stack100"].includes(t.type) });
  if (!G.data.length) return { err: "No values for this combination." };
  if (t.type === "stack100" || t.type === "stream100") G.data = G.data.map(d => { const tot = G.keys.reduce((s, k) => s + Math.abs(+d[k] || 0), 0); const r = { __x: d.__x }; G.keys.forEach(k => { r[k] = tot ? (+d[k] || 0) / tot * 100 : 0; }); return r; });
  if (t.type === "waterfall") return { kind: "waterfall", data: dsbWaterfall(G.data, G.keys[0]), key: G.keys[0] };
  if (t.type === "pyramid") return { kind: "pyramid", data: G.data.map(d => ({ __x: d.__x, L: -(Math.abs(+d[G.keys[0]] || 0)), R: Math.abs(+d[G.keys[1]] || 0) })), keys: G.keys };
  return { kind: "grouped", ...G, pct: t.type === "stack100" || t.type === "stream100" };
};
// ── tooltip shell for custom SVG charts ──
function DsbTipBox({ tp }) { if (!tp) return null; return <div style={{ position: "absolute", left: Math.min(tp.x + 12, (tp.w || 9999) - 180), top: Math.max(0, tp.y - 10), pointerEvents: "none", background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 6, padding: "6px 9px", fontSize: 11.5, color: C.text, zIndex: 5, boxShadow: C.shadow, maxWidth: 240, whiteSpace: "nowrap" }}>{tp.lines.map((l, i) => <div key={i} style={{ color: i ? C.text : C.mid, fontWeight: i ? 600 : 400 }}>{l}</div>)}</div>; }
const DsbRTip = ({ active, payload, label, xLab, fmt, abs }) => { if (!active || !payload || !payload.length) return null; return <div style={{ background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 6, padding: "7px 10px", fontSize: 11.5, color: C.text, boxShadow: C.shadow }}>
  <div style={{ color: C.mid, marginBottom: 3 }}>{xLab ? xLab(label, payload) : label}</div>{payload.filter(p => p.dataKey !== "base" && p.value != null).map((p, i) => <div key={i} style={{ display: "flex", gap: 12, justifyContent: "space-between", color: p.color || p.fill || C.text }}><span>{p.name}</span><strong>{(fmt || dsbFmt)(abs ? Math.abs(p.value) : p.value, p)}</strong></div>)}</div>; };
// legend that toggles series
function DsbLegend({ keys, hidden, onToggle, colorOf }) { if (!keys || keys.length < 2) return null; return <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", justifyContent: "center", fontSize: 11, marginTop: 2 }}>
  {keys.map((k, i) => <button key={k} type="button" onClick={() => onToggle(k)} title="Show or hide" style={{ background: "none", border: "none", cursor: "pointer", color: hidden.has(k) ? C.dim : C.text, textDecoration: hidden.has(k) ? "line-through" : "none", display: "inline-flex", alignItems: "center", gap: 4, padding: 0, fontSize: 11 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: hidden.has(k) ? C.border : (colorOf ? colorOf(k, i) : dsbCol(i)) }} />{dsbShort(k, 22)}</button>)}</div>; }
// ── generic colour grid (matrix heatmap, correlation, year x month) ──
function DsbGridChart({ M, w, h, scale, values, onPick, tip, fmt }) {
  const xs = M.xs, ys = M.ys; const left = Math.min(150, Math.max(40, Math.max(...ys.map(y => String(y).length)) * 6.4 + 10)); const maxL = Math.min(14, Math.max(...xs.map(x => String(x).length))); const rot = (w - left - 8) / Math.max(1, xs.length) < maxL * 6.4 + 6; const bottom = rot ? Math.min(90, Math.max(...xs.map(x => String(x).length)) * 5.6 + 12) : 22;
  const cw = Math.max(4, (w - left - 8) / Math.max(1, xs.length)), ch = Math.max(8, Math.min(40, (h - bottom - 6) / Math.max(1, ys.length))); const H = ch * ys.length + bottom + 6;
  const xi = new Map(xs.map((x, i) => [x, i])), yi = new Map(ys.map((y, i) => [y, i])); const div = M.corr || (/redblue|greenred/.test(scale) && M.min < 0 && M.max > 0);
  const lim = div ? Math.max(Math.abs(M.min), Math.abs(M.max)) || 1 : 0; const tpos = (v) => div ? (M.corr ? (v + 1) / 2 : (v + lim) / (2 * lim)) : (M.max === M.min ? 0.5 : (v - M.min) / (M.max - M.min));
  const sc = scale || (M.corr ? "redblue" : "blues"); const vLab = (v) => M.corr ? v.toFixed(2) : dsbFmt(v); const showV = values && ch >= 14 && M.cells.every(c => vLab(c.v).length * 6 + 4 <= cw); const every = Math.ceil(xs.length / Math.max(1, Math.floor((w - left) / (rot ? 14 : 46))));
  return <svg width={w} height={H} role="img" aria-label="Heatmap">
    {ys.map((y, i) => <text key={"y" + i} x={left - 6} y={i * ch + ch / 2 + 4} textAnchor="end" fontSize={Math.min(11, ch - 1)} fill={C.mid}>{dsbShort(y, 22)}</text>)}
    {M.cells.map((c, k) => { const i = xi.get(c.x), j = yi.get(c.y); if (i == null || j == null) return null; const col = dsbColor(sc, tpos(c.v)); return <g key={k}>
      <rect x={left + i * cw} y={j * ch} width={Math.max(1, cw - 1)} height={Math.max(1, ch - 1)} fill={col} rx={1.5} style={{ cursor: onPick ? "pointer" : "default" }}
        onMouseMove={e => tip(e, [`${c.y} · ${c.x}`, `${M.corr ? "r = " + c.v.toFixed(3) : (fmt || dsbFmt)(c.v)}${c.n ? `  (n = ${c.n.toLocaleString()})` : ""}`])} onClick={() => onPick && onPick(c)} />
      {showV && <text x={left + i * cw + cw / 2 - 0.5} y={j * ch + ch / 2 + 3.5} textAnchor="middle" fontSize={10.5} fill={dsbInk(col)} pointerEvents="none">{vLab(c.v)}</text>}</g>; })}
    {xs.map((x, i) => i % every ? null : <text key={"x" + i} transform={`translate(${left + i * cw + cw / 2},${ys.length * ch + 12}) rotate(${rot ? -45 : 0})`} textAnchor={rot ? "end" : "middle"} fontSize={10.5} fill={C.mid}>{dsbShort(x, 14)}</text>)}
  </svg>; }
function DsbScaleBar({ scale, min, max, corr, label }) { const st = DSB_SCALES[scale] || DSB_SCALES.blues; return <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: C.mid, justifyContent: "flex-end", marginTop: 2 }}>
  {label && <span>{label}</span>}<span>{corr ? "−1" : dsbFmt(min)}</span><span style={{ width: 120, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${st.join(",")})` }} /><span>{corr ? "+1" : dsbFmt(max)}</span></div>; }
// ── calendar heatmap ──
function DsbCalendar({ D, w, scale, tip, onPick }) { const years = [...new Set(D.map(d => d.t.y))].sort(); const shown = years.slice(-8); const map = new Map(D.map(d => [d.t.label, d]));
  const vals = D.map(d => d.v).sort((a, b) => a - b); const lo = dsbQuantSorted(vals, 0.02), hi = dsbQuantSorted(vals, 0.98); const div = /redblue|greenred/.test(scale) && lo < 0 && hi > 0; const lim = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
  const pos = (v) => div ? (Math.max(-lim, Math.min(lim, v)) + lim) / (2 * lim) : hi === lo ? 0.5 : (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo);
  const cs = Math.max(5, Math.min(15, (w - 34) / 54)); const rowH = cs * 7 + 18; const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return <div>{years.length > shown.length && <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>Showing the last {shown.length} of {years.length} years. Filter by date to see earlier years.</div>}
    <svg width={w} height={rowH * shown.length + 4} role="img" aria-label="Calendar heatmap">{shown.map((y, r) => { const jan1 = Date.UTC(y, 0, 1), off = new Date(jan1).getUTCDay(); const days = (Date.UTC(y + 1, 0, 1) - jan1) / 864e5; const top = r * rowH + 14; const cells = [];
      for (let d = 0; d < days; d++) { const dt = new Date(jan1 + d * 864e5); const lab = dt.toISOString().slice(0, 10); const e = map.get(lab); const wk = Math.floor((d + off) / 7), dw = dt.getUTCDay();
        cells.push(<rect key={d} x={30 + wk * cs} y={top + dw * cs} width={cs - 1.5} height={cs - 1.5} rx={2} fill={e ? dsbColor(scale || "greens", pos(e.v)) : C.raised} onMouseMove={ev => tip(ev, [lab, e ? dsbFmt(e.v) : "no data"])} onClick={() => e && onPick && onPick(e)} style={{ cursor: e && onPick ? "pointer" : "default" }} />); }
      return <g key={y}><text x={0} y={top + cs * 3.8} fontSize={11} fill={C.text} fontWeight={600}>{y}</text>{MON.map((m, i) => { const d = (Date.UTC(y, i, 1) - jan1) / 864e5; return <text key={m} x={30 + Math.floor((d + off) / 7) * cs} y={top - 3} fontSize={9.5} fill={C.dim}>{m}</text>; })}{cells}</g>; })}</svg></div>; }
// ── box, violin and strip ──
function DsbDistChart({ m, w, h, tip, kind, opts }) { const G = m.groups; const left = 52, bottom = 34, top = 8; const iw = w - left - 10, ih = h - bottom - top; const bw = iw / G.length;
  let lo = Infinity, hi = -Infinity; G.forEach(g => { const b = g.box; const a = kind === "box" ? Math.min(b.lo, ...(b.out.length ? [b.out[0]] : [])) : b.q1 - 3 * (b.q3 - b.q1 || Math.abs(b.med) * 0.1 || 1); const z = kind === "box" ? Math.max(b.hi, ...(b.out.length ? [b.out[b.out.length - 1]] : [])) : b.q3 + 3 * (b.q3 - b.q1 || Math.abs(b.med) * 0.1 || 1); lo = Math.min(lo, Math.max(a, b.min)); hi = Math.max(hi, Math.min(z, b.max)); });
  if (kind === "box") G.forEach(g => { if (g.box.out.length) { lo = Math.min(lo, g.box.out[0]); hi = Math.max(hi, g.box.out[g.box.out.length - 1]); } });
  const tk = dsbTicks(lo, hi, 5); lo = Math.min(lo, tk[0] ?? lo); hi = Math.max(hi, tk[tk.length - 1] ?? hi); const Y = (v) => top + ih - (v - lo) / ((hi - lo) || 1) * ih;
  return <svg width={w} height={h} role="img" aria-label={kind + " plot"}>
    {tk.map(v => <g key={v}><line x1={left} x2={w - 8} y1={Y(v)} y2={Y(v)} stroke={C.border} strokeDasharray="3 3" /><text x={left - 6} y={Y(v) + 3.5} textAnchor="end" fontSize={10.5} fill={C.mid}>{dsbFmt(v)}</text></g>)}
    {G.map((g, i) => { const cx = left + bw * i + bw / 2, b = g.box, col = dsbCol(i), half = Math.min(36, bw * 0.32); const lines = [g.name, `n ${b.n.toLocaleString()} · median ${dsbFmt(b.med)}`, `Q1 ${dsbFmt(b.q1)} · Q3 ${dsbFmt(b.q3)}`, `mean ${dsbFmt(b.mean)}${b.nOut ? ` · ${b.nOut} outliers` : ""}`];
      let shape = null;
      if (kind === "violin") { const vv = g.vals.filter(v => v >= lo && v <= hi); const K = dsbKde(vv.length ? vv : g.vals, 60, lo, hi); const mx = Math.max(...K.map(p => p.y)) || 1; const pts = K.map(p => [Y(p.x), p.y / mx * half]);
        const d = "M" + pts.map(([y, r]) => `${cx + r},${y}`).join(" L") + " L" + pts.reverse().map(([y, r]) => `${cx - r},${y}`).join(" L") + "Z"; shape = <path d={d} fill={col} fillOpacity={0.35} stroke={col} />; }
      if (kind === "strip") { const st = g.vals.length > 1500 ? Math.ceil(g.vals.length / 1500) : 1; shape = <g>{g.vals.filter((_, k) => k % st === 0).map((v, k) => v < lo || v > hi ? null : <circle key={k} cx={cx + (((k * 9301 + 49297) % 233280) / 233280 - 0.5) * half * 1.6} cy={Y(v)} r={2.2} fill={col} fillOpacity={0.45} />)}</g>; }
      return <g key={i} onMouseMove={e => tip(e, lines)}>
        <rect x={left + bw * i} y={top} width={bw} height={ih} fill="transparent" />
        {shape}
        {kind !== "strip" && <><line x1={cx} x2={cx} y1={Y(b.lo)} y2={Y(b.hi)} stroke={kind === "box" ? col : C.text} strokeWidth={1.2} />
          <rect x={cx - (kind === "box" ? half : 5)} y={Y(b.q3)} width={(kind === "box" ? half : 5) * 2} height={Math.max(1, Y(b.q1) - Y(b.q3))} fill={kind === "box" ? col : C.text} fillOpacity={kind === "box" ? 0.28 : 0.85} stroke={kind === "box" ? col : C.text} rx={2} />
          <line x1={cx - (kind === "box" ? half : 5)} x2={cx + (kind === "box" ? half : 5)} y1={Y(b.med)} y2={Y(b.med)} stroke={kind === "box" ? col : C.bg} strokeWidth={2.2} /></>}
        {kind === "strip" && <line x1={cx - half} x2={cx + half} y1={Y(b.med)} y2={Y(b.med)} stroke={C.text} strokeWidth={2} />}
        {kind === "box" && b.out.map((v, k) => <circle key={k} cx={cx} cy={Y(v)} r={2.4} fill="none" stroke={col} strokeOpacity={0.7} />)}
        {kind === "box" && opts && opts.points && g.vals.length <= 800 && g.vals.map((v, k) => <circle key={"p" + k} cx={cx + (((k * 9301 + 49297) % 233280) / 233280 - 0.5) * half} cy={Y(v)} r={1.6} fill={col} fillOpacity={0.35} />)}
        <text x={cx} y={h - bottom + 14} textAnchor="middle" fontSize={10.5} fill={C.mid}>{dsbShort(g.name, Math.max(4, Math.floor(bw / 6.2)))}</text></g>; })}
  </svg>; }
// ── lollipop and dumbbell (horizontal) ──
function DsbDots({ m, w, h, tip, kind, onPick }) { const rows = m.data; const k0 = m.keys[0], k1 = m.keys[1]; const left = Math.min(160, Math.max(50, Math.max(...rows.map(r => String(r.__x).length)) * 6.3 + 10)); const rh = Math.max(14, Math.min(30, (h - 26) / rows.length)); const H = rows.length * rh + 26;
  const vals = rows.flatMap(r => kind === "dumbbell" ? [+r[k0], +r[k1]] : [+r[k0], 0]).filter(v => isFinite(v)); const tk = dsbTicks(Math.min(...vals), Math.max(...vals), 5); const lo = Math.min(...vals, tk[0]), hi = Math.max(...vals, tk[tk.length - 1]); const X = (v) => left + (v - lo) / ((hi - lo) || 1) * (w - left - 14);
  return <svg width={w} height={H} role="img" aria-label={kind}>{tk.map(v => <g key={v}><line x1={X(v)} x2={X(v)} y1={0} y2={rows.length * rh} stroke={C.border} strokeDasharray="3 3" /><text x={X(v)} y={rows.length * rh + 14} textAnchor="middle" fontSize={10.5} fill={C.mid}>{dsbFmt(v)}</text></g>)}
    {rows.map((r, i) => { const y = i * rh + rh / 2; const a = +r[k0], b = +r[k1]; return <g key={i} style={{ cursor: onPick ? "pointer" : "default" }} onClick={() => onPick && onPick(r.__x)} onMouseMove={e => tip(e, kind === "dumbbell" ? [r.__x, `${k0}: ${dsbFmt(a)}`, `${k1}: ${dsbFmt(b)}`, `change: ${dsbFmt(b - a)}`] : [r.__x, `${k0}: ${dsbFmt(a)}`])}>
      <rect x={0} y={i * rh} width={w} height={rh} fill="transparent" /><text x={left - 8} y={y + 3.5} textAnchor="end" fontSize={11} fill={C.text}>{dsbShort(r.__x, 24)}</text>
      {kind === "dumbbell" ? <><line x1={X(a)} x2={X(b)} y1={y} y2={y} stroke={C.borderHi} strokeWidth={3} /><circle cx={X(a)} cy={y} r={5} fill={dsbCol(0)} /><circle cx={X(b)} cy={y} r={5} fill={dsbCol(1)} /></>
        : <><line x1={X(Math.max(lo, 0))} x2={X(a)} y1={y} y2={y} stroke={dsbCol(0)} strokeWidth={2} /><circle cx={X(a)} cy={y} r={5} fill={dsbCol(0)} /></>}</g>; })}</svg>; }
// ── 2-D density ──
function DsbBin2d({ B, w, h, scale, tip, xLab, yLab }) { const left = 52, bottom = 30; const iw = w - left - 10, ih = h - bottom - 6; const cw = iw / B.nx, ch = ih / B.ny; const tx = dsbTicks(B.x0, B.x1, 5), ty = dsbTicks(B.y0, B.y1, 5);
  const X = (v) => left + (v - B.x0) / ((B.x1 - B.x0) || 1) * iw, Y = (v) => 6 + ih - (v - B.y0) / ((B.y1 - B.y0) || 1) * ih;
  return <svg width={w} height={h} role="img" aria-label="2-D density">{B.cells.map((c, k) => <rect key={k} x={left + c.i * cw} y={6 + ih - (c.j + 1) * ch} width={cw + 0.5} height={ch + 0.5} fill={dsbColor(scale || "viridis", Math.sqrt(c.v / B.max))} onMouseMove={e => tip(e, [`${xLab} ${dsbFmt(B.x0 + c.i * B.dx)} to ${dsbFmt(B.x0 + (c.i + 1) * B.dx)}`, `${yLab} ${dsbFmt(B.y0 + c.j * B.dy)} to ${dsbFmt(B.y0 + (c.j + 1) * B.dy)}`, `${c.v.toLocaleString()} points`])} />)}
    <line x1={left} x2={w - 10} y1={6 + ih} y2={6 + ih} stroke={C.border} /><line x1={left} x2={left} y1={6} y2={6 + ih} stroke={C.border} />
    {tx.filter(v => v >= B.x0 && v <= B.x1).map(v => <text key={"x" + v} x={X(v)} y={h - bottom + 14} textAnchor="middle" fontSize={10.5} fill={C.mid}>{dsbFmt(v)}</text>)}{ty.filter(v => v >= B.y0 && v <= B.y1).map(v => <text key={"y" + v} x={left - 6} y={Y(v) + 3.5} textAnchor="end" fontSize={10.5} fill={C.mid}>{dsbFmt(v)}</text>)}
    <text x={left + iw / 2} y={h - 3} textAnchor="middle" fontSize={11} fill={C.text}>{xLab}</text></svg>; }
// ── gauge, waffle, KPI ──
function DsbGauge({ m, w, h, opts }) { const lo = opts.min !== "" && opts.min != null ? +opts.min : Math.min(0, m.colMin ?? 0), hi = opts.max !== "" && opts.max != null ? +opts.max : (m.colMax ?? 100); const v = m.v ?? 0; const r = Math.max(30, Math.min((w / 2 - 14) / 1.1, (h - 56) / 1.1)); const cx = w / 2, cy = r * 1.1 + 6;
  const ang = (x) => Math.PI * (1 - Math.max(0, Math.min(1, (x - lo) / ((hi - lo) || 1)))); const pt = (a, rr) => [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]; const arc = (a0, a1, rr) => { const [x0, y0] = pt(a0, rr), [x1, y1] = pt(a1, rr); return `M${x0},${y0} A${rr},${rr} 0 0 1 ${x1},${y1}`; };
  const target = opts.target !== "" && opts.target != null ? +opts.target : null; const good = target == null ? C.gold : v >= target ? C.teal : C.orange;
  return <svg width={w} height={cy + 40} role="img" aria-label="Gauge"><path d={arc(Math.PI, 0, r)} stroke={C.raised} strokeWidth={Math.max(10, r * 0.18)} fill="none" strokeLinecap="round" /><path d={arc(Math.PI, ang(v), r)} stroke={good} strokeWidth={Math.max(10, r * 0.18)} fill="none" strokeLinecap="round" />
    {target != null && (() => { const [x0, y0] = pt(ang(target), r - r * 0.16), [x1, y1] = pt(ang(target), r + r * 0.16); return <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={C.text} strokeWidth={2.5} />; })()}
    <text x={cx} y={cy - 6} textAnchor="middle" fontSize={Math.max(16, r * 0.26)} fontWeight={700} fill={C.text}>{dsbFmt(v)}</text>
    <text x={cx - r} y={cy + 18} textAnchor="middle" fontSize={11} fill={C.mid}>{dsbFmt(lo)}</text><text x={cx + r} y={cy + 18} textAnchor="middle" fontSize={11} fill={C.mid}>{dsbFmt(hi)}</text>
    {target != null && <text x={cx} y={cy + 20} textAnchor="middle" fontSize={11} fill={C.mid}>target {dsbFmt(target)}</text>}</svg>; }
function DsbWaffle({ m, w, tip, onPick }) { const k = m.keys[0]; const rows = m.data.filter(d => (+d[k] || 0) > 0); const tot = rows.reduce((s, d) => s + (+d[k] || 0), 0); let cells = []; let acc = 0;
  rows.forEach((d, i) => { const share = (+d[k] || 0) / tot; const n = Math.round((acc + share) * 100) - Math.round(acc * 100); acc += share; for (let j = 0; j < n; j++) cells.push({ i, d, share }); }); cells = cells.slice(0, 100);
  const side = Math.min(w * 0.55, 260); const cs = side / 10; return <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}><svg width={side} height={side} role="img" aria-label="Waffle chart">{cells.map((c, n) => <rect key={n} x={(n % 10) * cs} y={Math.floor(n / 10) * cs} width={cs - 2} height={cs - 2} rx={2} fill={dsbCol(c.i)} onMouseMove={e => tip(e, [c.d.__x, `${(c.share * 100).toFixed(1)}%  (${dsbFmt(+c.d[k])})`])} onClick={() => onPick && onPick(c.d.__x)} style={{ cursor: onPick ? "pointer" : "default" }} />)}</svg>
    <div style={{ fontSize: 11.5, display: "flex", flexDirection: "column", gap: 3 }}>{rows.map((d, i) => <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", color: C.text }}><span style={{ width: 10, height: 10, borderRadius: 2, background: dsbCol(i) }} />{dsbShort(d.__x, 22)} <span style={{ color: C.mid }}>{((+d[k] || 0) / tot * 100).toFixed(1)}%</span></div>)}</div></div>; }
function DsbKpi({ m, t, w, h }) { const ch = m.change; const up = ch && ch.diff >= 0; const s = m.series || []; const sw = Math.max(80, w - 8), sh = Math.max(30, Math.min(90, h - 110));
  let path = null; if (s.length > 1) { const vs = s.map(p => p.v); const lo = Math.min(...vs), hi = Math.max(...vs); const X = (i) => i / (s.length - 1) * sw, Y = (v) => sh - 2 - (v - lo) / ((hi - lo) || 1) * (sh - 4); const d = s.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(""); path = <svg width={sw} height={sh} aria-hidden="true"><path d={d + `L${sw},${sh}L0,${sh}Z`} fill={C.gold} fillOpacity={0.12} /><path d={d} stroke={C.gold} strokeWidth={1.8} fill="none" /></svg>; }
  const aggL = (DSB_AGGS.find(a => a[0] === t.agg) || [])[1] || ""; return <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", gap: 4 }}>
    <div style={{ fontSize: 11.5, color: C.mid }}>{aggL} of {(t.ys || [])[0] || "rows"} · {m.n.toLocaleString()} rows</div>
    <div style={{ fontSize: Math.max(24, Math.min(44, w / 7)), fontWeight: 700, color: C.text, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{dsbFmt(m.v)}</div>
    {ch && <div style={{ fontSize: 12, color: up ? C.teal : C.red }}>{up ? "▲" : "▼"} {dsbFmt(Math.abs(ch.diff))}{ch.pct != null && isFinite(ch.pct) ? ` (${ch.pct >= 0 ? "+" : ""}${ch.pct.toFixed(1)}%)` : ""} <span style={{ color: C.mid }}>{ch.to} vs {ch.from} · latest {dsbFmt(ch.last)}</span></div>}
    {path}</div>; }
function DsbTable({ m, t, heat, scale }) { const [sort, setSort] = useState(null); const keys = m.keys; let rows = m.data; if (sort) { const { k, d } = sort; rows = [...rows].sort((a, b) => { const x = k === "__x" ? a.__x : +a[k], y = k === "__x" ? b.__x : +b[k]; return (x > y ? 1 : x < y ? -1 : 0) * d; }); }
  const ext = {}; keys.forEach(k => { const v = m.data.map(d => +d[k]).filter(isFinite); ext[k] = [Math.min(...v), Math.max(...v)]; });
  const th = (k, l) => <th key={k} onClick={() => setSort(s => ({ k, d: s && s.k === k ? -s.d : -1 }))} style={{ position: "sticky", top: 0, background: C.surface, color: C.mid, fontWeight: 600, padding: "6px 8px", textAlign: k === "__x" ? "left" : "right", cursor: "pointer", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{l}{sort && sort.k === k ? (sort.d > 0 ? " ▲" : " ▼") : ""}</th>;
  return <div style={{ overflow: "auto", height: "100%" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, fontVariantNumeric: "tabular-nums" }}><thead><tr>{th("__x", t.x || "")}{keys.map(k => th(k, k))}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}><td style={{ padding: "5px 8px", color: C.text, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{r.__x}</td>{keys.map(k => { const v = +r[k]; const [a, b] = ext[k]; const bg = heat && isFinite(v) ? dsbColor(scale || "blues", b === a ? 0.5 : (v - a) / (b - a)) : null;
      return <td key={k} style={{ padding: "5px 8px", textAlign: "right", borderBottom: `1px solid ${C.border}`, background: bg || "transparent", color: bg ? dsbInk(bg) : C.text }}>{r[k] == null ? "–" : dsbFmt(v)}</td>; })}</tr>)}</tbody></table></div>; }
// ── 3D charts: orthographic view, drag to turn, wheel to zoom ──
function Dsb3D({ m, t, w, h, tip }) {
  const o = t.opts || {}; const [view, setView] = useState({ az: -0.65, el: 0.5, zoom: 1 }); const [spin, setSpin] = useState(!!o.spin); const drag = useRef(null); const svgRef = useRef(null);
  useEffect(() => { setSpin(!!o.spin); }, [o.spin]);
  useEffect(() => { if (!spin) return; let raf; let last = performance.now(); const step = (now) => { const dt = Math.min(64, now - last); last = now; setView(v => ({ ...v, az: v.az + dt * 0.0005 })); raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf); }, [spin]);
  useEffect(() => { const el = svgRef.current; if (!el) return; const wh = (e) => { e.preventDefault(); setView(v => ({ ...v, zoom: Math.max(0.4, Math.min(3, v.zoom * (e.deltaY < 0 ? 1.1 : 0.9))) })); }; el.addEventListener("wheel", wh, { passive: false }); return () => el.removeEventListener("wheel", wh); }, []);
  const { az, el, zoom } = view; const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
  const H = Math.max(160, h - 26), cx = w / 2, cy = H / 2 + H * 0.08, S = Math.min(w * 0.36, H * 0.42) * zoom;
  const P = (x, y, z) => { const x1 = x * ca - y * sa, y1 = x * sa + y * ca; return [cx + x1 * S, cy - (z * ce + y1 * se) * S, -y1 * ce + z * se]; };
  const vis = (nx, ny, nz) => nx * (-sa * ce) + ny * (-ca * ce) + nz * se > 0; // face points at the viewer
  const pts = (arr) => arr.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const shade = (hex, f) => dsbMix(hex, f > 0 ? "#ffffff" : "#000000", Math.abs(f));
  const items = []; let floor = null, axes = [];
  const ZH = 1.1; // height of the box
  if (m.mode === "scatter3d") { const all = m.P.groups.flatMap(g => g.pts); const ext = (k) => { let a = Infinity, b = -Infinity; all.forEach(p => { if (p[k] < a) a = p[k]; if (p[k] > b) b = p[k]; }); return [a, b === a ? a + 1 : b]; };
    const [x0, x1] = ext("x"), [y0, y1] = ext("y"), [z0, z1] = ext("z"); const nx = (v) => (v - x0) / (x1 - x0) * 2 - 1, ny = (v) => (v - y0) / (y1 - y0) * 2 - 1, nz = (v) => (v - z0) / (z1 - z0) * ZH;
    m.P.groups.forEach((g, gi) => g.pts.forEach(p => { const q = P(nx(p.x), ny(p.y), nz(p.z)); const sh = P(nx(p.x), ny(p.y), 0); items.push({ d: q[2], el: <g key={items.length}><line x1={sh[0]} y1={sh[1]} x2={q[0]} y2={q[1]} stroke={dsbCol(gi)} strokeOpacity={0.18} /><circle cx={q[0]} cy={q[1]} r={3.6} fill={dsbCol(gi)} fillOpacity={0.85} stroke={C.card} strokeWidth={0.6} onMouseMove={e => tip(e, [p.label || g.name, `${t.x}: ${dsbFmt(p.x)}`, `${t.ys[0]}: ${dsbFmt(p.y)}`, `${t.size}: ${dsbFmt(p.z)}`])} /></g> }); }));
    axes = [{ lp: [0, -1.45, 0], a: [-1, -1, 0], b: [1, -1, 0], lab: t.x, ticks: [[x0, -1], [x1, 1]].map(([v, u]) => ({ p: [u, -1.12, 0], t: dsbFmt(v) })) }, { lp: [-1.5, 0, 0], a: [-1, -1, 0], b: [-1, 1, 0], lab: t.ys[0], ticks: [[y0, -1], [y1, 1]].map(([v, u]) => ({ p: [-1.12, u, 0], t: dsbFmt(v) })) }, { lp: [-1, 1, ZH * 1.18], a: [-1, 1, 0], b: [-1, 1, ZH], lab: t.size, ticks: [[z0, 0], [z1, ZH]].map(([v, u]) => ({ p: [-1.08, 1.08, u], t: dsbFmt(v) })) }];
  } else { const M = m.M; const nxs = M.xs.length, nys = M.ys.length; const lo = Math.min(0, M.min), hi = M.max === lo ? lo + 1 : M.max; const nz = (v) => (v - lo) / (hi - lo) * ZH;
    const X = (i) => nxs < 2 ? 0 : i / (nxs - 1) * 2 - 1, Y = (j) => nys < 2 ? 0 : j / (nys - 1) * 1.6 - 0.8; const val = new Map(M.cells.map(c => [c.x + "\u0001" + c.y, c.v]));
    const sc = o.scale || "viridis"; const colOf = (v) => dsbColor(sc, (v - M.min) / ((M.max - M.min) || 1));
    if (m.mode === "bar3d") { const bw = Math.min(0.9 / Math.max(1, nxs - 1), 0.25), bd = Math.min(0.7 / Math.max(1, nys - 1), 0.25);
      M.ys.forEach((yk, j) => M.xs.forEach((xk, i) => { const v = val.get(xk + "\u0001" + yk); if (v == null) return; const x = X(i), y = Y(j), z0 = nz(Math.max(lo, Math.min(0, v))), z1 = nz(Math.max(0, v) || v); const top = Math.max(z0, z1), bot = Math.min(z0, z1);
        const c = [[x - bw, y - bd], [x + bw, y - bd], [x + bw, y + bd], [x - bw, y + bd]]; const base = colOf(v); const faces = [];
        const side = (a, b, n) => { if (!vis(...n)) return; faces.push(<polygon key={faces.length} points={pts([P(...c[a], bot), P(...c[b], bot), P(...c[b], top), P(...c[a], top)])} fill={shade(base, n[0] !== 0 ? -0.28 : -0.14)} stroke={C.card} strokeWidth={0.4} />); };
        side(0, 1, [0, -1, 0]); side(1, 2, [1, 0, 0]); side(2, 3, [0, 1, 0]); side(3, 0, [-1, 0, 0]);
        faces.push(<polygon key="top" points={pts(c.map(p => P(...p, top)))} fill={shade(base, 0.12)} stroke={C.card} strokeWidth={0.4} />);
        items.push({ d: P(x, y, (top + bot) / 2)[2], el: <g key={items.length} onMouseMove={e => tip(e, [`${yk} · ${xk}`, dsbFmt(v)])}>{faces}</g> }); })); }
    if (m.mode === "surface3d") { for (let j = 0; j < nys - 1; j++) for (let i = 0; i < nxs - 1; i++) { const q = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, b]) => val.get(M.xs[a] + "\u0001" + M.ys[b])); if (q.some(v => v == null)) continue;
        const mean = q.reduce((a, b) => a + b, 0) / 4; const cs = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, b], k) => P(X(a), Y(b), nz(q[k])));
        items.push({ d: cs.reduce((a, p) => a + p[2], 0) / 4, el: <polygon key={items.length} points={pts(cs)} fill={colOf(mean)} fillOpacity={0.92} stroke={C.card} strokeWidth={0.5} onMouseMove={e => tip(e, [`${M.ys[j]}–${M.ys[j + 1]} · ${M.xs[i]}–${M.xs[i + 1]}`, `average ${dsbFmt(mean)}`])} /> }); }
      if (nys < 2 || nxs < 2) items.push({ d: 0, el: <text key="few" x={cx} y={cy} textAnchor="middle" fill={C.mid} fontSize={12}>A surface needs at least two values across and two in depth.</text> }); }
    if (m.mode === "line3d") { M.ys.forEach((yk, j) => { const ps = M.xs.map((xk, i) => { const v = val.get(xk + "\u0001" + yk); return v == null ? null : [X(i), Y(j), nz(v), v, xk]; }).filter(Boolean); if (ps.length < 2) return; const col = dsbCol(j);
        const top = ps.map(p => P(p[0], p[1], p[2])), bot = ps.map(p => P(p[0], p[1], nz(Math.max(lo, 0)))).reverse();
        items.push({ d: P(0, Y(j), 0)[2], el: <g key={items.length}><polygon points={pts([...top, ...bot])} fill={col} fillOpacity={0.22} /><polyline points={pts(top)} fill="none" stroke={col} strokeWidth={2.2} />{ps.map((p, k) => <circle key={k} cx={top[k][0]} cy={top[k][1]} r={3} fill={col} onMouseMove={e => tip(e, [`${yk} · ${p[4]}`, dsbFmt(p[3])])} />)}</g> }); }); }
    const xt = M.xs.map((xk, i) => ({ p: [X(i), -1.02 - (nys < 2 ? 0.1 : 0), 0], t: dsbShort(xk, 10) })), step = Math.ceil(nxs / Math.max(2, Math.floor(w / 70)));
    axes = [{ lp: [0, -1.3, 0], a: [-1, -0.8, 0], b: [1, -0.8, 0], lab: t.x, ticks: xt.filter((_, i) => i % step === 0).map(x => ({ ...x, p: [x.p[0], -0.98, 0] })) },
      { lp: [1.75, 0, 0], a: [1, -0.8, 0], b: [1, 0.8, 0], lab: t.group, ticks: M.ys.filter((_, j) => j % Math.ceil(nys / 8) === 0).map((yk) => ({ p: [1.1, Y(M.ys.indexOf(yk)), 0], t: dsbShort(yk, 12) })) },
      { lp: [-1, 0.8, ZH * 1.18], a: [-1, 0.8, 0], b: [-1, 0.8, ZH], lab: (t.ys || [])[0] || "Count", ticks: dsbTicks(lo, hi, 4).map(v => ({ p: [-1.06, 0.86, nz(v)], t: dsbFmt(v) })) }]; }
  floor = [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]].map(([x, y]) => P(x, m.mode === "scatter3d" ? y : y * 0.8, 0));
  items.sort((a, b) => a.d - b.d);
  const onDown = (e) => { drag.current = { x: e.clientX, y: e.clientY, v: view }; setSpin(false); e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = (e) => { const d = drag.current; if (!d) return; setView({ ...d.v, az: d.v.az + (e.clientX - d.x) * 0.01, el: Math.max(0.03, Math.min(1.5, d.v.el + (e.clientY - d.y) * 0.01)) }); };
  return <div style={{ position: "relative" }}>
    <svg ref={svgRef} width={w} height={H} role="img" aria-label={`3D chart. Drag to turn, wheel to zoom.`} style={{ cursor: drag.current ? "grabbing" : "grab", touchAction: "none", userSelect: "none" }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }} onDoubleClick={() => setView({ az: -0.65, el: 0.5, zoom: 1 })}>
      <polygon points={pts(floor)} fill={C.raised} fillOpacity={0.55} stroke={C.border} />
      {axes.map((ax, k) => { const a = P(...ax.a), b = P(...ax.b); return <g key={"ax" + k}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={C.borderHi} />
        {ax.ticks.map((tk, q) => { const p = P(...tk.p); return <text key={q} x={p[0]} y={p[1] + 3} fontSize={10} fill={C.mid} textAnchor="middle">{tk.t}</text>; })}
        </g>; })}
      {items.map(x => x.el)}
      {axes.map((ax, k) => { if (!ax.lab) return null; const mid = P(...(ax.lp || ax.a.map((v, q) => (v + ax.b[q]) / 2))); return <text key={"lab" + k} x={mid[0]} y={mid[1] + 4} fontSize={11} fontWeight={600} fill={C.text} textAnchor="middle" paintOrder="stroke" stroke={C.card} strokeWidth={3} pointerEvents="none">{dsbShort(ax.lab, 22)}</text>; })}
    </svg>
    <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end", fontSize: 10.5, color: C.dim }}>
      <span>Drag to turn · wheel to zoom · double-click to reset</span>
      <button type="button" onClick={() => setSpin(v => !v)} aria-pressed={spin} style={{ ...wbSmallBtn(spin ? C.gold : undefined), padding: "2px 8px", fontSize: 11 }}>{spin ? "■ Stop" : "↻ Spin"}</button>
      <button type="button" onClick={() => { setSpin(false); setView({ az: -0.65, el: 0.5, zoom: 1 }); }} style={{ ...wbSmallBtn(), padding: "2px 8px", fontSize: 11 }}>Reset view</button>
    </div>
    {m.kind === "3d" && m.mode !== "line3d" && m.mode !== "scatter3d" && <DsbScaleBar scale={o.scale || "viridis"} min={m.M.min} max={m.M.max} label={(t.ys || [])[0] || "Count"} />}
  </div>;
}
// ── one chart ──
const DSB_CAN3D = new Set(["bar", "hbar", "stackbar", "line", "area", "step"]);
function DsbChart({ t, m: m0, height, onPick, sel }) {
  let m = m0;
  const dim = (x) => sel && sel.size && !sel.has(String(x));
  const [box, w] = useDsbWidth(); const [tp, setTp] = useState(null); const [hidden, setHidden] = useState(() => new Set()); const toggle = (k) => setHidden(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const tip = (e, lines) => { const r = box.current && box.current.getBoundingClientRect(); if (r) setTp({ x: e.clientX - r.left, y: e.clientY - r.top, lines, w: r.width }); };
  const o = t.opts || {}; const pick = (v) => onPick && v != null && onPick(v);
  if (o.view3d && DSB_CAN3D.has(t.type) && m.kind === "grouped" && m.data && m.keys) { const cells = []; let mn = Infinity, mx = -Infinity; m.data.forEach(d => m.keys.forEach(k => { const v = +d[k]; if (d[k] == null || !isFinite(v)) return; cells.push({ x: d.__x, y: k, v }); if (v < mn) mn = v; if (v > mx) mx = v; }));
    if (cells.length) m = { kind: "3d", mode: ["line", "area", "step"].includes(t.type) ? "line3d" : "bar3d", M: { xs: m.data.map(d => d.__x), ys: m.keys, cells, min: mn, max: mx } }; }
  if (m.err) return <div ref={box} style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: C.mid, fontSize: 12.5, textAlign: "center", padding: 16 }}>{m.err}</div>;
  const ax = dsbAxis(); const grid = <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />; const yAx = (p = {}) => <YAxis {...ax} width={56} tickFormatter={v => dsbFmt(v)} scale={o.log ? "log" : "auto"} domain={o.log ? ["auto", "auto"] : undefined} allowDataOverflow={!!o.log} {...p} />;
  const xAx = (p = {}) => <XAxis dataKey="__x" {...ax} tickFormatter={v => dsbShort(v, 14)} minTickGap={8} {...p} />; const legH = 22;
  let body = null; const ch = Math.max(120, height - (m.keys && m.keys.length > 1 ? legH : 0));
  const clickBar = (d) => { if (d && d.activeLabel != null) pick(d.activeLabel); };
  const brush = o.brush && m.data && m.data.length > 12 ? <Brush dataKey="__x" height={16} stroke={C.gold} fill={C.surface} travellerWidth={8} tickFormatter={v => dsbShort(v, 10)} /> : null;
  const pct = m.pct ? (v) => v.toFixed(1) + "%" : null;
  if (w > 0) switch (m.kind) {
    case "grouped": { const ks = m.keys, D = m.data; const vis = ks.filter(k => !hidden.has(k)); const rtip = <Tooltip content={<DsbRTip fmt={pct || undefined} />} cursor={{ fill: C.raised, fillOpacity: 0.5 }} />;
      switch (t.type) {
        case "bar": case "stackbar": case "stack100": body = <BarChart width={w} height={ch} data={D} onClick={clickBar} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>{grid}{xAx()}{yAx(pct ? { tickFormatter: v => v + "%", domain: [0, 100] } : {})}{rtip}{brush}
          {ks.map((k, i) => <Bar key={k} dataKey={k} name={k} hide={hidden.has(k)} stackId={t.type === "bar" && !o.stack0 ? undefined : "s"} fill={dsbCol(i)} radius={t.type === "bar" && !o.stack0 ? [3, 3, 0, 0] : 0} maxBarSize={60} isAnimationActive={false}>{sel && sel.size ? D.map((d, j) => <Cell key={j} fillOpacity={dim(d.__x) ? 0.3 : 1} />) : null}{o.labels && vis.length === 1 ? <LabelList dataKey={k} position="top" formatter={v => dsbFmt(v)} style={{ fill: C.mid, fontSize: 10 }} /> : null}</Bar>)}</BarChart>; break;
        case "hbar": { const left = Math.min(170, Math.max(60, Math.max(...D.map(d => String(d.__x).length)) * 6.3 + 12)); const hh = Math.max(ch, D.length * (ks.length > 1 ? 26 : 20) + 30);
          body = <div style={{ maxHeight: ch, overflowY: hh > ch ? "auto" : "visible" }}><BarChart width={w - (hh > ch ? 12 : 0)} height={hh} data={D} layout="vertical" onClick={clickBar} margin={{ top: 4, right: 26, left: 0, bottom: 0 }}><CartesianGrid stroke={C.border} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" {...ax} tickFormatter={v => dsbFmt(v)} /><YAxis type="category" dataKey="__x" {...ax} width={left} tickFormatter={v => dsbShort(v, 26)} interval={0} />{rtip}
            {ks.map((k, i) => <Bar key={k} dataKey={k} name={k} hide={hidden.has(k)} fill={dsbCol(i)} radius={[0, 3, 3, 0]} maxBarSize={22} isAnimationActive={false}>{sel && sel.size ? D.map((d, j) => <Cell key={j} fillOpacity={dim(d.__x) ? 0.3 : 1} />) : null}{o.labels ? <LabelList dataKey={k} position="right" formatter={v => dsbFmt(v)} style={{ fill: C.mid, fontSize: 10 }} /> : null}</Bar>)}</BarChart></div>; break; }
        case "line": case "step": case "area": case "stackarea": case "stream100": { const isA = t.type !== "line" && t.type !== "step"; const Ch = isA ? AreaChart : LineChart; const dots = o.dots && D.length <= 120; const curve = t.type === "step" ? "stepAfter" : o.smooth ? "monotone" : "linear";
          body = <Ch width={w} height={ch} data={D} onClick={clickBar} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>{grid}{xAx()}{yAx(pct ? { tickFormatter: v => v + "%", domain: [0, 100] } : {})}<Tooltip content={<DsbRTip fmt={pct || undefined} />} />{brush}
            {ks.map((k, i) => isA ? <Area key={k} type={curve} dataKey={k} name={k} hide={hidden.has(k)} stackId={t.type === "area" ? undefined : "s"} stroke={dsbCol(i)} fill={dsbCol(i)} fillOpacity={t.type === "area" ? 0.15 : 0.55} strokeWidth={1.8} isAnimationActive={false} connectNulls />
              : <Line key={k} type={curve} dataKey={k} name={k} hide={hidden.has(k)} stroke={dsbCol(i)} strokeWidth={2} dot={dots ? { r: 2.5 } : false} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />)}</Ch>; break; }
        case "combo": body = <ComposedChart width={w} height={ch} data={D} onClick={clickBar} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>{grid}{xAx()}<YAxis yAxisId="l" {...ax} width={56} tickFormatter={v => dsbFmt(v)} /><YAxis yAxisId="r" orientation="right" {...ax} width={52} tickFormatter={v => dsbFmt(v)} /><Tooltip content={<DsbRTip />} />{brush}
          <Bar yAxisId="l" dataKey={ks[0]} name={ks[0]} hide={hidden.has(ks[0])} fill={dsbCol(0)} fillOpacity={0.8} maxBarSize={40} isAnimationActive={false} /><Line yAxisId="r" dataKey={ks[1]} name={ks[1] + " (right axis)"} hide={hidden.has(ks[1])} stroke={dsbCol(1)} strokeWidth={2.2} dot={false} isAnimationActive={false} connectNulls /></ComposedChart>; break;
        case "radar": body = <RadarChart width={w} height={ch} data={D} outerRadius={Math.min(w, ch) / 2 - 34}><PolarGrid stroke={C.border} /><PolarAngleAxis dataKey="__x" tick={{ fill: C.mid, fontSize: 10.5 }} tickFormatter={v => dsbShort(v, 12)} /><PolarRadiusAxis tick={{ fill: C.dim, fontSize: 9 }} tickFormatter={v => dsbFmt(v)} axisLine={false} /><Tooltip content={<DsbRTip />} />
          {ks.map((k, i) => <Radar key={k} dataKey={k} name={k} hide={hidden.has(k)} stroke={dsbCol(i)} fill={dsbCol(i)} fillOpacity={0.2} isAnimationActive={false} />)}</RadarChart>; break;
        case "pie": case "donut": { const k = ks[0]; const P = D.map((d, i) => ({ name: d.__x, value: Math.abs(+d[k] || 0), i })).filter(d => d.value > 0); const tot = P.reduce((s, d) => s + d.value, 0); const r = Math.min(w * 0.42, ch / 2 - 14);
          body = <PieChart width={w} height={ch}><Tooltip content={({ active, payload }) => active && payload && payload[0] ? <DsbRTip active label={payload[0].name} payload={[{ ...payload[0], name: `${(payload[0].value / tot * 100).toFixed(1)}% of total`, color: C.text }]} /> : null} />
            <Pie data={P} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={r} innerRadius={t.type === "donut" ? r * 0.58 : 0} paddingAngle={P.length > 1 ? 1 : 0} isAnimationActive={false} onClick={(d) => pick(d && d.name)}
              label={o.labels !== false && r > 70 ? ({ name, percent }) => percent > 0.04 ? `${dsbShort(name, 12)} ${(percent * 100).toFixed(0)}%` : "" : false} labelLine={false} style={{ cursor: onPick ? "pointer" : "default", fontSize: 10.5 }}>
              {P.map((d) => <Cell key={d.name} fill={dsbCol(d.i)} fillOpacity={dim(d.name) ? 0.3 : 1} stroke={C.card} />)}</Pie>
            {t.type === "donut" && <text x={w / 2} y={ch / 2} textAnchor="middle" dominantBaseline="middle" fill={C.text} fontSize={Math.max(14, r * 0.22)} fontWeight={700}>{dsbFmt(tot)}</text>}
            {t.type === "donut" && <text x={w / 2} y={ch / 2 + Math.max(14, r * 0.22)} textAnchor="middle" fill={C.mid} fontSize={10.5}>total</text>}</PieChart>; break; }
        case "treemap": { const k = ks[0]; const P = D.map((d, i) => ({ name: d.__x, size: Math.abs(+d[k] || 0), i })).filter(d => d.size > 0); const tot = P.reduce((s, d) => s + d.size, 0);
          body = <Treemap width={w} height={ch} data={P} dataKey="size" nameKey="name" isAnimationActive={false} content={(p) => { const { x, y, width: ww, height: hh, name, index, size } = p; if (ww < 1 || hh < 1 || p.depth !== 1) return null; const col = dsbCol(index); return <g style={{ cursor: onPick ? "pointer" : "default" }} onClick={() => pick(name)} onMouseMove={e => tip(e, [name, `${dsbFmt(size)} · ${(size / tot * 100).toFixed(1)}%`])}>
            <rect x={x} y={y} width={ww} height={hh} fill={col} stroke={C.card} strokeWidth={2} />{ww > 46 && hh > 22 && <text x={x + 6} y={y + 15} fontSize={11} fill={dsbInk(col)}>{dsbShort(name, Math.floor(ww / 7))}</text>}{ww > 46 && hh > 38 && <text x={x + 6} y={y + 29} fontSize={10.5} fill={dsbInk(col)} fillOpacity={0.85}>{(size / tot * 100).toFixed(1)}%</text>}</g>; }} />; break; }
        case "funnel": { const k = ks[0]; const P = D.map((d, i) => ({ name: d.__x, value: Math.abs(+d[k] || 0), fill: dsbCol(i) })); body = <FunnelChart width={w} height={ch}><Tooltip content={<DsbRTip />} /><Funnel dataKey="value" data={P} isAnimationActive={false} onClick={(d) => pick(d && d.name)}><LabelList position="right" dataKey="name" fill={C.text} stroke="none" fontSize={11} formatter={v => dsbShort(v, 18)} /><LabelList position="center" dataKey="value" fill="#fff" stroke="none" fontSize={11} formatter={v => dsbFmt(v)} /></Funnel></FunnelChart>; break; }
        case "radial": { const k = ks[0]; const P = D.map((d, i) => ({ name: d.__x, value: Math.abs(+d[k] || 0), fill: dsbCol(i) })).reverse(); body = <RadialBarChart width={w} height={ch} innerRadius="18%" outerRadius="95%" data={P} startAngle={90} endAngle={-270}><RadialBar dataKey="value" background={{ fill: C.raised }} isAnimationActive={false} onClick={(d) => pick(d && d.name)} /><Tooltip content={<DsbRTip />} /><Legend iconSize={9} layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11, color: C.text }} formatter={v => dsbShort(v, 16)} /></RadialBarChart>; break; }
        case "waffle": body = <DsbWaffle m={m} w={w} tip={tip} onPick={onPick ? pick : null} />; break;
        case "lollipop": case "dumbbell": body = <div style={{ maxHeight: ch, overflowY: "auto" }}><DsbDots m={m} w={w - 6} h={ch} tip={tip} kind={t.type} onPick={onPick ? pick : null} /></div>; break;
        case "table": case "tableheat": body = <div style={{ height: ch }}><DsbTable m={m} t={t} heat={t.type === "tableheat"} scale={o.scale} /></div>; break;
        default: body = null; }
      break; }
    case "bars": body = <BarChart width={w} height={ch} data={m.data} barCategoryGap={1} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>{grid}{xAx({ interval: "preserveStartEnd" })}{yAx({ tickFormatter: v => o.density ? v.toFixed(1) + "%" : dsbFmt(v) })}
      <Tooltip content={<DsbRTip xLab={(l, p) => p && p[0] ? `${dsbFmt(p[0].payload.lo)} to ${dsbFmt(p[0].payload.hi)}` : l} fmt={o.density ? (v) => v.toFixed(2) + "%" : (v) => Math.round(v).toLocaleString()} />} cursor={{ fill: C.raised, fillOpacity: 0.5 }} />
      {m.keys.map((k, i) => <Bar key={k} dataKey={k} name={m.keys.length > 1 ? k : m.yLab} hide={hidden.has(k)} fill={dsbCol(i)} fillOpacity={m.keys.length > 1 ? 0.7 : 0.9} isAnimationActive={false} />)}</BarChart>; break;
    case "density": body = <AreaChart width={w} height={ch} data={m.data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>{grid}<XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} {...ax} tickFormatter={v => dsbFmt(v)} /><YAxis {...ax} width={56} tickFormatter={v => dsbFmt(v)} /><Tooltip content={<DsbRTip xLab={l => dsbFmt(l)} fmt={v => v.toPrecision(3)} />} />
      {m.keys.map((k, i) => <Area key={k} dataKey={k} name={k} hide={hidden.has(k)} type="monotone" stroke={dsbCol(i)} fill={dsbCol(i)} fillOpacity={0.18} strokeWidth={2} isAnimationActive={false} />)}</AreaChart>; break;
    case "waterfall": body = <BarChart width={w} height={ch} data={m.data} onClick={clickBar} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>{grid}{xAx()}{yAx()}<Tooltip content={({ active, payload, label }) => active && payload && payload[0] ? <DsbRTip active label={label} payload={[{ name: payload[0].payload.total ? "Total" : "Change", value: payload[0].payload.v, color: C.text }, { name: "Running total", value: payload[0].payload.end, color: C.mid }]} /> : null} />
      <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} /><Bar dataKey="up" stackId="w" isAnimationActive={false}>{m.data.map((d, i) => <Cell key={i} fill={d.total ? C.gold : C.teal} />)}</Bar><Bar dataKey="down" stackId="w" fill={C.red} isAnimationActive={false} /></BarChart>; break;
    case "pyramid": { const left = Math.min(120, Math.max(44, Math.max(...m.data.map(d => String(d.__x).length)) * 6.3 + 10)); const mx = Math.max(...m.data.map(d => Math.max(-d.L, d.R))) || 1;
      body = <BarChart width={w} height={ch} data={m.data} layout="vertical" stackOffset="sign" barCategoryGap={2} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}><CartesianGrid stroke={C.border} strokeDasharray="3 3" horizontal={false} /><XAxis type="number" {...ax} domain={[-mx, mx]} tickFormatter={v => dsbFmt(Math.abs(v))} /><YAxis type="category" dataKey="__x" {...ax} width={left} interval={0} tickFormatter={v => dsbShort(v, 18)} />
        <Tooltip content={<DsbRTip abs />} /><ReferenceLine x={0} stroke={C.borderHi} /><Bar dataKey="L" name={m.keys[0]} hide={hidden.has(m.keys[0])} stackId="p" fill={dsbCol(0)} isAnimationActive={false} /><Bar dataKey="R" name={m.keys[1]} hide={hidden.has(m.keys[1])} stackId="p" fill={dsbCol(1)} isAnimationActive={false} /></BarChart>; break; }
    case "scatter": { const G = m.P.groups; const bub = t.type === "bubble"; const zs = bub ? G.flatMap(g => g.pts.map(p => p.z)) : []; const zr = bub ? [Math.min(...zs), Math.max(...zs)] : null; const xs = G.flatMap(g => g.pts.map(p => p.x)); const x0 = Math.min(...xs), x1 = Math.max(...xs);
      body = <ScatterChart width={w} height={ch} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}><CartesianGrid stroke={C.border} strokeDasharray="3 3" /><XAxis type="number" dataKey="x" name={t.x} {...ax} domain={["auto", "auto"]} tickFormatter={v => m.P.xTime ? String(Math.floor(v)) : dsbFmt(v)} scale={o.log ? "log" : "auto"} allowDataOverflow={!!o.log} /><YAxis type="number" dataKey="y" name={t.ys[0]} {...ax} width={56} domain={["auto", "auto"]} tickFormatter={v => dsbFmt(v)} scale={o.log ? "log" : "auto"} allowDataOverflow={!!o.log} />
        {bub && <ZAxis type="number" dataKey="z" range={[20, 900]} domain={zr} />}
        <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => { if (!active || !payload || !payload[0]) return null; const p = payload[0].payload; return <DsbRTip active label={p.label || payload[0].name || ""} payload={[{ name: t.x, value: p.x, color: C.text }, { name: t.ys[0], value: p.y, color: C.text }, ...(bub ? [{ name: t.size, value: p.z, color: C.mid }] : [])]} />; }} />
        {G.map((g, i) => <Scatter key={g.name} name={g.name} data={g.pts} hide={hidden.has(g.name)} fill={dsbCol(i)} fillOpacity={bub ? 0.55 : 0.7} isAnimationActive={false} onClick={() => t.group && pick(g.name)} />)}
        {m.fit && <Scatter data={[{ x: x0, y: m.fit.a + m.fit.b * x0 }, { x: x1, y: m.fit.a + m.fit.b * x1 }]} line={{ stroke: C.text, strokeWidth: 1.5, strokeDasharray: "5 4" }} shape={() => null} legendType="none" isAnimationActive={false} name="Fitted line" />}</ScatterChart>; break; }
    case "grid": { const M = m.M; body = <div style={{ maxHeight: ch, overflowY: "auto" }}><DsbGridChart M={M} w={w - 4} h={ch - 18} scale={o.scale || (M.corr ? "redblue" : "viridis")} values={o.values !== false} tip={tip} onPick={onPick && !M.corr && t.type === "heatmap" ? (c) => pick({ x: c.x, g: c.y }) : null} /></div>; break; }
    case "calendar": body = <div style={{ maxHeight: ch, overflowY: "auto" }}><DsbCalendar D={m.D} w={w - 8} scale={o.scale || "greens"} tip={tip} onPick={onPick ? (e) => pick(e.t.label) : null} /></div>; break;
    case "density2d": body = <DsbBin2d B={m.B} w={w} h={ch} scale={o.scale} tip={tip} xLab={t.x} yLab={t.ys[0]} />; break;
    case "box": case "violin": case "strip": body = <DsbDistChart m={m} w={w} h={ch} tip={tip} kind={m.kind} opts={o} />; break;
    case "sankey": body = <Sankey width={w} height={ch} data={m.S} nodePadding={14} nodeWidth={10} margin={{ top: 6, right: 120, bottom: 6, left: 4 }} link={{ stroke: C.gold, strokeOpacity: 0.25 }} iterations={32}
      node={(p) => { const { x, y, width: ww, height: hh, index, payload } = p; return <g><rect x={x} y={y} width={ww} height={hh} fill={dsbCol(index)} /><text x={x + ww + 5} y={y + hh / 2 + 4} fontSize={11} fill={C.text}>{dsbShort(payload.name, 18)} <tspan fill={C.mid}>{dsbFmt(payload.value)}</tspan></text></g>; }}><Tooltip content={<DsbRTip />} /></Sankey>; break;
    case "3d": body = <Dsb3D m={m} t={t} w={w} h={ch} tip={tip} />; break;
    case "kpi": body = <DsbKpi m={m} t={t} w={w} h={height} />; break;
    case "gauge": body = <DsbGauge m={m} w={w} h={ch} opts={o} />; break;
    default: body = null; }
  const legKeys = m.kind === "3d" ? (m.mode === "line3d" ? m.M.ys : m.mode === "scatter3d" && m.P.groups.length > 1 ? m.P.groups.map(g => g.name) : null) : m.kind === "scatter" ? (m.P.groups.length > 1 ? m.P.groups.map(g => g.name) : null) : m.kind === "pyramid" ? m.keys : ["grouped", "bars", "density"].includes(m.kind) && !["pie", "donut", "treemap", "funnel", "radial", "waffle", "table", "tableheat", "lollipop"].includes(t.type) ? m.keys : null;
  return <div ref={box} style={{ position: "relative", width: "100%" }} onMouseLeave={() => setTp(null)} data-dsb-legend={legKeys ? JSON.stringify(legKeys.slice(0, 14).map((k, i) => [k, dsbCol(i)])) : ""}>
    {body}{legKeys && <DsbLegend keys={legKeys} hidden={hidden} onToggle={toggle} />}
    {m.kind === "grid" && <DsbScaleBar scale={o.scale || (m.M.corr ? "redblue" : "viridis")} min={m.M.min} max={m.M.max} corr={m.M.corr} label={m.M.corr ? (o.method === "spearman" ? "Spearman" : "Pearson") + " correlation" + (m.sampled ? " · 200,000-row sample" : "") : ""} />}
    {m.kind === "scatter" && <div style={{ fontSize: 10.5, color: C.dim, textAlign: "right" }}>{m.P.n.toLocaleString()} points{m.P.sampled ? ", a sample is drawn" : ""}{m.fit ? ` · slope ${dsbFmt(m.fit.b)} · R² ${m.fit.r2.toFixed(3)}` : ""}</div>}
    {m.kind === "density2d" && <div style={{ fontSize: 10.5, color: C.dim, textAlign: "right" }}>{m.B.used.toLocaleString()} points in view (extreme 0.5% trimmed on each side). Brighter = more points.</div>}
    <DsbTipBox tp={tp} /></div>;
}
// ── tile shell: computes in the background so the page stays responsive ──
function DsbTile({ t, tab, filters, height, editing, onEdit, onRemove, onDup, onMove, onResize, onPick, picked, readOnly, expand, look }) {
  const [m, setM] = useState(null); const [busy, setBusy] = useState(false); const el = useRef(null); const [menu, setMenu] = useState(false);
  const own = (filters || []).filter(f => !(f.from === t.id)); const key = dsbTabKey(tab) + "|" + JSON.stringify([t.type, t.x, t.ys, t.group, t.size, t.label, t.agg, t.opts, own]);
  useEffect(() => { if (!tab || tab.loading) return; let dead = false; setBusy(true); const h = setTimeout(() => { let r; try { const idx = dsbFilter(tab, own); r = dsbModel(t, tab, idx); } catch (e) { r = { err: "Could not draw this chart: " + (e.message || e) }; } if (!dead) { setM(r); setBusy(false); } }, 15); return () => { dead = true; clearTimeout(h); };
  }, [key]);
  const T = dsbType(t.type); const title = t.title || `${T.label}${(t.ys || []).length ? ": " + t.ys.slice(0, 3).join(", ") : ""}${t.x ? " by " + t.x : ""}`;
  const dl = (fmt) => { setMenu(false); dsbExport(el.current, title, fmt, m, t); };
  const lookSt = look === "glass" ? { background: `${C.card}d9`, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" } : look === "flat" ? { boxShadow: "none" } : look === "float" ? { boxShadow: "0 10px 30px rgba(0,0,0,.35)", borderColor: "transparent" } : {};
  return <div ref={el} className="dsb-tile" style={{ ...card, ...lookSt, padding: "10px 12px 8px", gridColumn: `span ${t.w || 1}`, borderColor: editing ? C.gold : C.border, minWidth: 0, display: "flex", flexDirection: "column", breakInside: "avoid" }}>
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 6 }}>
      <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={title}>{title}</div>
        <div style={{ fontSize: 10.5, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tab ? tab.name : "Data not available"}{own.length ? ` · ${own.length} filter${own.length > 1 ? "s" : ""}` : ""}{picked ? " · click again to clear" : ""}</div></div>
      <div className="dsb-noprint" style={{ display: "flex", gap: 2, flex: "none", position: "relative" }}>
        {busy && <span style={{ fontSize: 10.5, color: C.mid, alignSelf: "center", marginRight: 4 }}>working…</span>}
        {!readOnly && <button type="button" aria-label={`Edit chart ${title}`} title="Edit" onClick={onEdit} style={dsbIconBtn()}><Ico n="pencil" /></button>}
        {!readOnly && DSB_CAN3D.has(t.type) && <button type="button" aria-pressed={!!(t.opts || {}).view3d} aria-label={`Show ${title} in ${(t.opts || {}).view3d ? "2D" : "3D"}`} title={(t.opts || {}).view3d ? "Back to a flat chart" : "Show in 3D (drag to turn)"} onClick={() => onResize({ opts: { ...(t.opts || {}), view3d: !(t.opts || {}).view3d } })} style={{ ...dsbIconBtn(), fontSize: 11, fontWeight: 700, color: (t.opts || {}).view3d ? C.gold : C.mid }}>{(t.opts || {}).view3d ? "2D" : "3D"}</button>}
        <button type="button" aria-label={`Expand chart ${title}`} title="Expand" onClick={expand} style={dsbIconBtn()}>⤢</button>
        <button type="button" aria-label={`More actions for ${title}`} aria-expanded={menu} onClick={() => setMenu(v => !v)} style={dsbIconBtn()}>⋯</button>
        {menu && <div role="menu" style={{ position: "absolute", right: 0, top: 28, zIndex: 20, background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 8, boxShadow: C.shadow, padding: 4, minWidth: 170 }} onMouseLeave={() => setMenu(false)}>
          {[["Download PNG", () => dl("png")], ["Download SVG", () => dl("svg")], ["Download data (CSV)", () => dl("csv")], ...(readOnly ? [] : [["Duplicate", () => { setMenu(false); onDup(); }], ["Move earlier", () => { setMenu(false); onMove(-1); }], ["Move later", () => { setMenu(false); onMove(1); }],
            ["Width: narrow", () => { setMenu(false); onResize({ w: 1 }); }], ["Width: wide", () => { setMenu(false); onResize({ w: 2 }); }], ["Width: full row", () => { setMenu(false); onResize({ w: 4 }); }], ["Height: short", () => { setMenu(false); onResize({ h: "s" }); }], ["Height: medium", () => { setMenu(false); onResize({ h: "m" }); }], ["Height: tall", () => { setMenu(false); onResize({ h: "l" }); }],
            ["Delete chart", () => { setMenu(false); onRemove(); }, C.red]])].map(([l, f, col]) => <button key={l} role="menuitem" type="button" onClick={f} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", color: col || C.text, fontSize: 12, padding: "6px 9px", cursor: "pointer", borderRadius: 4 }}>{l}</button>)}</div>}
      </div></div>
    <div style={{ flex: 1, minHeight: height }}>{!tab ? <div style={{ color: C.mid, fontSize: 12.5, padding: 20 }}>The data for this chart is not available. It may have been deleted, or it is a large table stored on another device.</div>
      : tab.loading ? <div style={{ color: C.mid, fontSize: 12.5, padding: 20 }}>Loading data…</div> : !m ? <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: C.mid, fontSize: 12 }}>Preparing chart…</div>
      : <DsbChart t={t} m={m} height={height} onPick={onPick} sel={new Set((filters || []).filter(f => f.from === t.id && f.values).flatMap(f => f.values))} />}</div>
  </div>;
}
const dsbIconBtn = () => ({ background: "none", border: `1px solid transparent`, borderRadius: 5, color: C.mid, cursor: "pointer", padding: "3px 6px", fontSize: 13, lineHeight: 1 });
// ── export a tile ──
const dsbExport = (el, title, fmt, m, t) => {
  const safe = (title || "chart").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "chart";
  if (fmt === "csv") { let headers = [], rows = [];
    if (!m || m.err) return; if (m.data && m.keys) { headers = [t.x || "category", ...m.keys]; rows = m.data.map(d => [d.__x, ...m.keys.map(k => d[k] ?? "")]); }
    else if (m.data && m.kind === "waterfall") { headers = [t.x, "change", "running total"]; rows = m.data.map(d => [d.__x, d.v, d.end]); }
    else if (m.data && m.kind === "pyramid") { headers = [t.x, ...m.keys]; rows = m.data.map(d => [d.__x, -d.L, d.R]); }
    else if (m.kind === "density") { headers = ["x", ...m.keys]; rows = m.data.map(d => [d.x, ...m.keys.map(k => d[k])]); }
    else if (m.M) { headers = ["row", "column", "value"]; rows = m.M.cells.map(c => [c.y, c.x, c.v]); }
    else if (m.D) { headers = ["date", "value"]; rows = m.D.map(d => [d.t.label, d.v]); }
    else if (m.groups) { headers = ["group", "n", "min", "q1", "median", "q3", "max", "mean"]; rows = m.groups.map(g => [g.name, g.box.n, g.box.min, g.box.q1, g.box.med, g.box.q3, g.box.max, g.box.mean]); }
    else if (m.P) { headers = ["group", t.x, t.ys[0], ...(t.size ? [t.size] : [])]; rows = m.P.groups.flatMap(g => g.all.map(p => [g.name, p.x, p.y, ...(t.size ? [p.z] : [])])); }
    else if (m.S) { headers = ["from", "to", "value"]; rows = m.S.links.map(l => [m.S.nodes[l.source].name, m.S.nodes[l.target].name, l.value]); }
    else if (m.B) { headers = ["x_from", "y_from", "count"]; rows = m.B.cells.map(c => [m.B.x0 + c.i * m.B.dx, m.B.y0 + c.j * m.B.dy, c.v]); }
    else if (m.v != null) { headers = ["value"]; rows = [[m.v]]; if (m.series) { headers = ["period", "value"]; rows = m.series.map(s => [s.x, s.v]); } }
    wbDownload(safe + ".csv", wbCsv({ headers, rows })); return; }
  const svgs = [...el.querySelectorAll("svg")].filter(s => !s.closest("button") && s.getAttribute("aria-hidden") !== "true" || s.closest(".recharts-wrapper"));
  const main = svgs.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
  if (!main) { window.alert("This chart type has no picture to export. Use Download data (CSV)."); return; }
  const r = main.getBoundingClientRect(); const W = Math.ceil(r.width), Hc = Math.ceil(r.height); let leg = []; try { const holder = main.closest("[data-dsb-legend]"); leg = holder && holder.dataset.dsbLegend ? JSON.parse(holder.dataset.dsbLegend) : []; } catch (e) { leg = []; }
  const legRows = leg.length ? Math.ceil(leg.length / Math.max(1, Math.floor(W / 150))) : 0; const H = Hc + 34 + legRows * 18 + 10; const perRow = Math.max(1, Math.floor(W / 150));
  const clone = main.cloneNode(true); clone.setAttribute("x", "0"); clone.setAttribute("y", "30"); clone.setAttribute("width", W); clone.setAttribute("height", Hc);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Inter, Arial, sans-serif"><rect width="100%" height="100%" fill="${C.card}"/><text x="4" y="20" font-size="14" font-weight="700" fill="${C.text}">${esc(title)}</text>${new XMLSerializer().serializeToString(clone)}${leg.map(([k, c], i) => `<g transform="translate(${4 + (i % perRow) * 150},${Hc + 40 + Math.floor(i / perRow) * 18})"><rect width="10" height="10" rx="2" fill="${c}"/><text x="15" y="9.5" font-size="11" fill="${C.text}">${esc(dsbShort(k, 20))}</text></g>`).join("")}</svg>`;
  if (fmt === "svg") { const b = new Blob([svg], { type: "image/svg+xml" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = safe + ".svg"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); return; }
  const img = new Image(); const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  img.onload = () => { const cv = document.createElement("canvas"); cv.width = W * 2; cv.height = H * 2; const ctx = cv.getContext("2d"); ctx.scale(2, 2); ctx.drawImage(img, 0, 0); URL.revokeObjectURL(url); cv.toBlob(b => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = safe + ".png"; document.body.appendChild(a); a.click(); a.remove(); }, "image/png"); };
  img.onerror = () => { URL.revokeObjectURL(url); window.alert("The PNG could not be made in this browser. Try Download SVG."); }; img.src = url;
};
// ── chart settings panel ──
function DsbEditor({ t, sources, onChange, onClose, onDelete, isMobile }) {
  const tab = sources.find(s => s.id === t.src); const P = tab && !tab.loading && !tab.missing ? dsbProfile(tab) : []; const T = dsbType(t.type); const o = t.opts || {};
  const set = (p) => onChange({ ...t, ...p }); const setO = (p) => onChange({ ...t, opts: { ...o, ...p } });
  const colOpts = (kinds) => P.filter(p => !kinds || kinds.includes(p.type)).map(p => <option key={p.name} value={p.name}>{p.name} ({p.type === "number" ? "number" : p.type === "time" ? "time" : "text"})</option>);
  const xKinds = ["scatter", "bubble", "density2d"].includes(t.type) ? ["number", "time"] : ["calendar", "timegrid"].includes(t.type) ? ["time", "text"] : null;
  const yMulti = /one or more|Values|variables|columns|Numeric variable\(s\)/i.test(T.f.ys || "") && !["scatter", "bubble", "density2d", "hist", "strip", "lollipop", "waterfall", "gauge", "kpi", "pie", "donut", "treemap", "waffle", "funnel", "radial", "sankey", "heatmap", "calendar", "timegrid"].includes(t.type);
  const lab = (s) => <div style={{ fontSize: 11.5, color: C.mid, margin: "10px 0 4px", fontWeight: 600 }}>{s}</div>; const fieldSel = { ...sel, padding: "7px 9px", fontSize: 12.5 };
  const changeType = (k) => { const nt = { ...t, type: k }; if (tab && !tab.loading) Object.assign(nt, dsbDefaults(k, tab, t)); onChange(nt); };
  const yNum = P.filter(p => p.type === "number");
  return <div className="dsb-noprint" style={{ width: isMobile ? "100%" : 340, maxWidth: "100%", flex: "none", borderLeft: isMobile ? "none" : `1px solid ${C.border}`, background: C.surface, overflowY: "auto", padding: "12px 14px", ...(isMobile ? { position: "fixed", inset: 0, zIndex: 425 } : {}) }} role="region" aria-label="Chart settings">
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h3 style={{ ...wbH, margin: 0 }}>Chart settings</h3><button type="button" onClick={onClose} style={wbSmallBtn()}>Done</button></div>
    {lab("Title")}<input aria-label="Chart title" value={t.title || ""} placeholder="Automatic" onChange={e => set({ title: e.target.value })} style={{ ...inp, padding: "7px 9px", fontSize: 12.5 }} />
    {lab("Data")}<select aria-label="Chart data" value={t.src || ""} onChange={e => { const s = sources.find(x => x.id === e.target.value); const nt = { ...t, src: e.target.value }; if (s && !s.loading && !s.missing) Object.assign(nt, dsbDefaults(t.type, s, {})); onChange(nt); }} style={fieldSel}>
      {!tab && <option value="">Choose data…</option>}{sources.map(s => <option key={s.id} value={s.id} disabled={s.missing}>{s.name}{s.missing ? " (not on this device)" : ""}</option>)}</select>
    {lab("Chart type")}<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{DSB_FAMS.map(f => <div key={f}><div style={{ fontSize: 10.5, color: C.dim, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>{f}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{DSB_TYPES.filter(x => x.fam === f).map(x => <button key={x.k} type="button" aria-pressed={t.type === x.k} title={x.desc} onClick={() => changeType(x.k)} style={{ ...pill(t.type === x.k), padding: "4px 8px", fontSize: 11 }}>{x.label}</button>)}</div></div>)}</div>
    <p style={{ ...wbNote, fontSize: 11.5, margin: "8px 0 0" }}>{T.desc}</p>
    {tab && <>
      {T.f.x && <>{lab(T.f.x)}<select aria-label="X field" value={t.x || ""} onChange={e => set({ x: e.target.value })} style={fieldSel}><option value="">{/optional/i.test(T.f.x) ? "None" : "Choose…"}</option>{colOpts(xKinds)}</select></>}
      {T.f.ys && <>{lab(T.f.ys)}{yMulti ? <div style={{ maxHeight: 160, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px" }}>{yNum.map(p => <label key={p.name} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: C.text, padding: "2px 0" }}>
          <input type="checkbox" aria-label={`Value ${p.name}`} checked={(t.ys || []).includes(p.name)} onChange={e => set({ ys: e.target.checked ? [...(t.ys || []), p.name] : (t.ys || []).filter(c => c !== p.name) })} />{p.name}</label>)}{!yNum.length && <span style={wbNote}>No numeric columns.</span>}</div>
        : ["dumbbell", "pyramid", "combo"].includes(t.type) ? [0, 1].map(i => <select key={i} aria-label={`Value ${i + 1}`} value={(t.ys || [])[i] || ""} onChange={e => { const ys = [...(t.ys || [])]; ys[i] = e.target.value; set({ ys: ys.filter(Boolean) }); }} style={{ ...fieldSel, marginBottom: 4 }}><option value="">Choose…</option>{colOpts(["number"])}</select>)
        : <select aria-label="Value field" value={(t.ys || [])[0] || ""} onChange={e => set({ ys: e.target.value ? [e.target.value] : [], agg: !e.target.value ? "count" : t.agg === "count" ? "sum" : t.agg })} style={fieldSel}><option value="">{/blank/i.test(T.f.ys) ? "None (count rows)" : "Choose…"}</option>{colOpts(["number"])}</select>}</>}
      {T.f.group && <>{lab(T.f.group)}<select aria-label="Split field" value={t.group || ""} onChange={e => set({ group: e.target.value })} style={fieldSel}><option value="">None</option>{colOpts(["text", "time"])}</select></>}
      {T.f.size && <>{lab(T.f.size)}<select aria-label="Size field" value={t.size || ""} onChange={e => set({ size: e.target.value })} style={fieldSel}><option value="">Choose…</option>{colOpts(["number"])}</select></>}
      {T.f.label && <>{lab(T.f.label)}<select aria-label="Label field" value={t.label || ""} onChange={e => set({ label: e.target.value })} style={fieldSel}><option value="">None</option>{colOpts(null)}</select></>}
      {T.agg && <>{lab("Combine rows with")}<select aria-label="Aggregation" value={t.agg || "sum"} onChange={e => set({ agg: e.target.value })} style={fieldSel}>{DSB_AGGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></>}
      {lab("Options")}<div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: C.text }}>
        {T.opts.includes("bucket") && <label style={{ display: "flex", gap: 6, alignItems: "center" }}>Time steps<select aria-label="Time steps" value={o.bucket || "keep"} onChange={e => setO({ bucket: e.target.value })} style={{ ...fieldSel, width: "auto" }}><option value="keep">As in the data</option><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Yearly</option></select></label>}
        {T.opts.includes("sort") && <label style={{ display: "flex", gap: 6, alignItems: "center" }}>Order<select aria-label="Order" value={o.sort || "desc"} onChange={e => setO({ sort: e.target.value })} style={{ ...fieldSel, width: "auto" }}><option value="desc">Largest first</option><option value="asc">Smallest first</option><option value="label">A to Z</option><option value="none">As in the data</option></select></label>}
        {T.opts.includes("top") && <label style={{ display: "flex", gap: 6, alignItems: "center" }}>Show top<input aria-label="Show top" type="number" min={0} value={o.top ?? ""} placeholder="all" onChange={e => setO({ top: e.target.value === "" ? "" : Math.max(0, +e.target.value) })} style={{ ...inp, width: 80, padding: "6px 8px", fontSize: 12 }} /><span style={{ color: C.dim }}>others grouped</span></label>}
        {T.opts.includes("bins") && <label style={{ display: "flex", gap: 6, alignItems: "center" }}>Bins<select aria-label="Bins" value={o.bins || "auto"} onChange={e => setO({ bins: e.target.value })} style={{ ...fieldSel, width: "auto" }}>{["auto", 5, 10, 20, 30, 50, 80].map(b => <option key={b} value={b}>{b === "auto" ? "Automatic" : b}</option>)}</select></label>}
        {T.opts.includes("scale") && <label style={{ display: "flex", gap: 6, alignItems: "center" }}>Colours<select aria-label="Colour scale" value={o.scale || (t.type === "corr" ? "redblue" : t.type === "calendar" ? "greens" : "viridis")} onChange={e => setO({ scale: e.target.value })} style={{ ...fieldSel, width: "auto" }}>{DSB_SCALE_NAMES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
        {T.opts.includes("method") && <label style={{ display: "flex", gap: 6, alignItems: "center" }}>Method<select aria-label="Correlation method" value={o.method || "pearson"} onChange={e => setO({ method: e.target.value })} style={{ ...fieldSel, width: "auto" }}><option value="pearson">Pearson (linear)</option><option value="spearman">Spearman (rank)</option></select></label>}
        {T.opts.includes("range") && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{[["min", "Min"], ["max", "Max"], ["target", "Target"]].map(([k, l]) => <label key={k} style={{ display: "flex", gap: 4, alignItems: "center" }}>{l}<input aria-label={`Gauge ${l}`} type="number" value={o[k] ?? ""} placeholder="auto" onChange={e => setO({ [k]: e.target.value })} style={{ ...inp, width: 74, padding: "6px 8px", fontSize: 12 }} /></label>)}</div>}
        {DSB_CAN3D.has(t.type) && <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" aria-label="Show in 3D" checked={!!o.view3d} onChange={e => setO({ view3d: e.target.checked })} />Show in 3D (drag to turn)</label>}
        {[["spin", "Turn slowly on its own"], ["labels", "Show value labels"], ["stack0", "Stack the columns"], ["brush", "Zoom slider"], ["dots", "Show points"], ["smooth", "Smooth lines"], ["log", "Log scale"], ["density", "Show percentages, not counts"], ["points", "Show every observation"], ["trend", "Fitted line", true], ["values", "Show numbers in cells", true], ["cluster", "Group similar variables together"], ["lower", "Lower triangle only"]].filter(([k]) => T.opts.includes(k)).map(([k, l, def]) =>
          <label key={k} style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" aria-label={l} checked={o[k] == null ? !!def : !!o[k]} onChange={e => setO({ [k]: e.target.checked })} />{l}</label>)}
        {["pie", "donut", "treemap", "waffle", "bar", "hbar", "stackbar", "stack100"].includes(t.type) && o.top ? <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" aria-label="Group the rest as Other" checked={o.other !== false} onChange={e => setO({ other: e.target.checked })} />Group the rest as "Other"</label> : null}
      </div></>}
    <button type="button" onClick={onDelete} style={{ ...wbSmallBtn(C.red), marginTop: 16 }}>Delete chart</button>
  </div>;
}
// ── data summary ──
function DsbSpark({ p }) { if (!p.sample || p.sample.length < 3) return null; const H = dsbHist(p.sample, 16); const mx = Math.max(...H.map(b => b.Count)) || 1; return <svg width={80} height={22} aria-hidden="true">{H.map((b, i) => <rect key={i} x={i * 5} y={22 - b.Count / mx * 21} width={4} height={b.Count / mx * 21} fill={C.gold} fillOpacity={0.75} />)}</svg>; }
function DsbSummary({ sources, onBuild, onAdd, isMobile, boards = [], onOpenBoard, onDupBoard, onDelBoard, onNewBoard, onDelSource, onRenameBoard, readOnly }) {
  const [ren, setRen] = useState(null);
  const [open, setOpen] = useState(null); const [prof, setProf] = useState({}); const [busy, setBusy] = useState(null);
  const ready = sources.filter(s => !s.loading && !s.missing && Array.isArray(s.rows));
  const load = (s) => { const k = dsbTabKey(s); if (prof[k]) return; setBusy(s.id); setTimeout(() => { const P = dsbProfile(s); setProf(x => ({ ...x, [k]: P })); setBusy(null); }, 20); };
  useEffect(() => { const small = ready.filter(s => s.rows.length * s.headers.length <= 200000 && !prof[dsbTabKey(s)]); if (!small.length) return; const h = setTimeout(() => { const add = {}; small.forEach(s => { add[dsbTabKey(s)] = dsbProfile(s); }); setProf(x => ({ ...x, ...add })); }, 20); return () => clearTimeout(h); }, [sources]);
  const totals = { tables: ready.length, rows: ready.reduce((s, t) => s + t.rows.length, 0), cols: ready.reduce((s, t) => s + t.headers.length, 0) };
  if (!sources.length) return <div style={{ ...card, textAlign: "center", padding: 30 }}><h3 style={wbH}>No data yet</h3><p style={wbNote}>Pick variables on the main screen, upload a file, or add datasets in the Data Workbench. Everything you work on is summarised here.</p></div>;
  return <div>
    <div style={{ ...card, padding: "12px 14px", marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: boards.length ? 8 : 0 }}><h3 style={{ ...wbH, margin: 0 }}>Your dashboards ({boards.length})</h3>{!readOnly && <button type="button" style={wbSmallBtn(C.teal)} onClick={onNewBoard}>+ New dashboard</button>}</div>
      {!boards.length ? <p style={{ ...wbNote, margin: "6px 0 0" }}>None yet. Press Build a dashboard on a table below for a starter set of charts, or + New dashboard to start empty.</p>
        : <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>{boards.map(b => { const bgc = dsbBgCss(b.bg); return <div key={b.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", background: bgc ? bgc.css : C.raised }}>
          <div style={{ background: C.surface, borderRadius: 6, padding: "6px 8px" }}>{ren && ren.id === b.id ? <form onSubmit={e => { e.preventDefault(); if (ren.name.trim()) onRenameBoard(b, ren.name.trim()); setRen(null); }} style={{ display: "flex", gap: 4 }}><input autoFocus aria-label={`New name for ${b.name}`} value={ren.name} onChange={e => setRen({ ...ren, name: e.target.value })} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setRen(null); } }} style={{ ...inp, padding: "4px 7px", fontSize: 12.5 }} /><button type="submit" style={wbSmallBtn(C.teal)}>OK</button></form> : <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{b.name}</div>}<div style={{ fontSize: 11, color: C.mid }}>{b.tiles.length} chart{b.tiles.length === 1 ? "" : "s"}{(b.filters || []).length ? ` · ${(b.filters || []).length} filter${b.filters.length === 1 ? "" : "s"}` : ""}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}><button type="button" style={wbSmallBtn(C.teal)} onClick={() => onOpenBoard(b)} aria-label={`Open dashboard ${b.name}`}>Open</button>
              {!readOnly && <button type="button" style={wbSmallBtn()} onClick={() => setRen({ id: b.id, name: b.name })} aria-label={`Rename dashboard ${b.name}`}>Rename</button>}
              {!readOnly && <button type="button" style={wbSmallBtn()} onClick={() => onDupBoard(b)}>Duplicate</button>}
              {!readOnly && <button type="button" style={wbSmallBtn(C.red)} onClick={() => onDelBoard(b)} aria-label={`Delete dashboard ${b.name}`}>Delete</button>}</div></div></div>; })}</div>}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
      {[["Tables", totals.tables], ["Rows", totals.rows.toLocaleString()], ["Columns", totals.cols], ["Not on this device", sources.filter(s => s.missing).length]].map(([l, v]) => <div key={l} style={{ ...card, padding: "12px 14px" }}><div style={{ fontSize: 11.5, color: C.mid }}>{l}</div><div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{v}</div></div>)}</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{sources.map(s => { const k = dsbTabKey(s); const P = prof[k]; const isOpen = open === s.id; const n = s.rows ? s.rows.length : 0;
      const num = P ? P.filter(p => p.type === "number").length : null, tim = P ? P.find(p => p.type === "time") : null; const miss = P ? P.reduce((a, p) => a + p.missing, 0) / Math.max(1, n * s.headers.length) : null;
      return <div key={s.id} style={{ ...card, padding: "12px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{s.name}</div>
            <div style={{ fontSize: 11.5, color: C.mid }}>{s.kindLabel} · {s.missing ? "not on this device" : s.loading ? "loading…" : `${n.toLocaleString()} rows × ${s.headers.length} columns`}{P ? ` · ${num} numeric` : ""}{tim ? ` · ${tim.name} ${tim.tMin} to ${tim.tMax}` : ""}{miss != null ? ` · ${(miss * 100).toFixed(1)}% missing` : ""}{s.updated ? ` · updated ${prjAgo(s.updated)}` : ""}</div></div>
          {!s.missing && !s.loading && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" style={wbSmallBtn()} aria-expanded={isOpen} onClick={() => { setOpen(isOpen ? null : s.id); if (!isOpen) load(s); }}>{isOpen ? "Hide variables" : "Variables"}</button>
            <button type="button" style={wbSmallBtn(C.teal)} onClick={() => onAdd(s)}>Add a chart</button>
            <button type="button" style={wbSmallBtn(C.teal)} onClick={() => onBuild(s)}>Build a dashboard</button>
            {onDelSource && s.id !== "basket" && !readOnly && <button type="button" style={wbSmallBtn(C.red)} aria-label={`${s.id === "imported" ? "Remove" : "Delete"} ${s.name}`} onClick={() => onDelSource(s)}>{s.id === "imported" ? "Remove" : "Delete"}</button>}</div>}
          {s.missing && onDelSource && !readOnly && <button type="button" style={wbSmallBtn(C.red)} onClick={() => onDelSource(s)}>Delete</button>}</div>
        {isOpen && (busy === s.id || !P ? <div style={{ ...wbNote, marginTop: 8 }}>Summarising {n.toLocaleString()} rows…</div> : <div style={{ overflowX: "auto", marginTop: 10 }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
          <thead><tr>{["Variable", "Type", "Filled", "Missing", "Distinct", "Mean", "Std. dev.", "Min", "Median", "Max", "Shape / top values"].map(h => <th key={h} style={{ textAlign: h === "Variable" || h === "Type" || h === "Shape / top values" ? "left" : "right", color: C.mid, fontWeight: 600, padding: "5px 8px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
          <tbody>{P.map(p => <tr key={p.name}>{[p.name, p.type === "number" ? "Number" : p.type === "time" ? `Time (${p.kind || ""})` : "Text", p.n.toLocaleString(), p.missing ? `${p.missing.toLocaleString()} (${(p.missing / Math.max(1, n) * 100).toFixed(1)}%)` : "0", (p.uniqueCapped ? "5,000+" : p.unique.toLocaleString()),
            p.mean != null && p.type === "number" ? dsbFmt(p.mean) : "", p.sd != null && p.type === "number" ? dsbFmt(p.sd) : "", p.type === "number" ? dsbFmt(p.min) : p.type === "time" ? p.tMin : "", p.type === "number" ? dsbFmt(p.median) : "", p.type === "number" ? dsbFmt(p.max) : p.type === "time" ? p.tMax : ""].map((v, i) =>
            <td key={i} style={{ padding: "5px 8px", borderBottom: `1px solid ${C.border}`, color: i ? C.text : C.text, fontWeight: i ? 400 : 600, textAlign: i < 2 ? "left" : "right", whiteSpace: "nowrap" }}>{v}</td>)}
            <td style={{ padding: "3px 8px", borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.mid }}>{p.type === "number" ? <DsbSpark p={p} /> : p.top ? p.top.slice(0, 3).map(x => `${dsbShort(x.k, 14)} (${x.c.toLocaleString()})`).join(", ") : ""}</td></tr>)}</tbody></table>
          {n > 60000 && <p style={{ ...wbNote, fontSize: 11 }}>Medians, distinct counts and shapes use an even sample of 60,000 rows. Means, totals, minimums and maximums use every row.</p>}</div>)}
      </div>; })}</div></div>;
}
// ── filter bar ──
function DsbFilters({ filters, setFilters, sources, readOnly }) {
  const [adding, setAdding] = useState(false); const [src, setSrc] = useState(""); const [col, setCol] = useState(""); const [vals, setVals] = useState([]); const [rng, setRng] = useState({ min: "", max: "" }); const [q, setQ] = useState("");
  const tab = sources.find(s => s.id === src) || sources.find(s => !s.missing && !s.loading); const P = tab ? dsbProfile(tab) : []; const p = P.find(x => x.name === col);
  const values = useMemo(() => { if (!tab || !p || p.type === "number") return []; const L = dsbLabCol(tab, p.j, p.type); const c = new Map(); for (const v of L) { const k = v == null ? "(blank)" : v; c.set(k, (c.get(k) || 0) + 1); } let e = [...c.entries()]; if (p.type === "time") e = e.sort((a, b) => ((dsbTime(a[0]) || {}).k || 0) - ((dsbTime(b[0]) || {}).k || 0)); else e.sort((a, b) => b[1] - a[1]); return e; }, [tab, p]);
  const add = () => { let f; if (p.type === "number" || (p.type === "time" && (rng.min !== "" || rng.max !== "") && !vals.length)) { const tk = (v) => { if (v === "") return null; const n = dsbNum(v); if (n != null && p.type === "number") return n; const t = dsbTime(v); return t ? t.k : n; }; f = { col, min: tk(rng.min), max: tk(rng.max), label: `${col} ${rng.min || "…"} to ${rng.max || "…"}` }; }
    else f = { col, values: vals, label: `${col}: ${vals.slice(0, 3).join(", ")}${vals.length > 3 ? ` +${vals.length - 3}` : ""}` };
    setFilters([...(filters || []).filter(x => x.col !== col), f]); setAdding(false); setVals([]); setRng({ min: "", max: "" }); setCol(""); };
  return <div className="dsb-noprint" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
    <span style={{ fontSize: 12, color: C.mid }}>Filters:</span>
    {(filters || []).length ? filters.map((f, i) => <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: `${C.gold}1f`, border: `1px solid ${C.gold}66`, color: C.text, borderRadius: 14, padding: "3px 4px 3px 10px", fontSize: 11.5 }}>{f.label || f.col}
      {!readOnly && <button type="button" aria-label={`Remove filter ${f.label || f.col}`} onClick={() => setFilters(filters.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: C.mid, cursor: "pointer", fontSize: 12 }}>✕</button>}</span>) : <span style={{ fontSize: 12, color: C.dim }}>none (click a bar, slice or cell to filter every chart)</span>}
    {(filters || []).length > 1 && !readOnly && <button type="button" style={wbSmallBtn()} onClick={() => setFilters([])}>Clear all</button>}
    {!readOnly && <button type="button" style={wbSmallBtn(C.teal)} onClick={() => setAdding(a => !a)} aria-expanded={adding}>+ Add filter</button>}
    {adding && <div style={{ ...card, width: "100%", padding: "10px 12px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
      <select aria-label="Filter data" value={tab ? tab.id : ""} onChange={e => { setSrc(e.target.value); setCol(""); }} style={{ ...sel, width: "auto", padding: "6px 9px", fontSize: 12 }}>{sources.filter(s => !s.missing && !s.loading).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select aria-label="Filter column" value={col} onChange={e => { setCol(e.target.value); setVals([]); setQ(""); }} style={{ ...sel, width: "auto", padding: "6px 9px", fontSize: 12 }}><option value="">Column…</option>{P.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}</select>
      {p && (p.type === "number" || p.type === "time") && <span style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12, color: C.text }}>from<input aria-label="Filter from" value={rng.min} onChange={e => setRng(r => ({ ...r, min: e.target.value }))} placeholder={p.type === "time" ? p.tMin : dsbFmt(p.min)} style={{ ...inp, width: 110, padding: "6px 8px", fontSize: 12 }} />to<input aria-label="Filter to" value={rng.max} onChange={e => setRng(r => ({ ...r, max: e.target.value }))} placeholder={p.type === "time" ? p.tMax : dsbFmt(p.max)} style={{ ...inp, width: 110, padding: "6px 8px", fontSize: 12 }} /></span>}
      {p && p.type !== "number" && <div style={{ minWidth: 220, flex: 1 }}><input aria-label="Search values" value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${values.length.toLocaleString()} values`} style={{ ...inp, padding: "6px 8px", fontSize: 12, marginBottom: 4 }} />
        <div style={{ maxHeight: 150, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 8px" }}>{values.filter(([v]) => !q || v.toLowerCase().includes(q.toLowerCase())).slice(0, 300).map(([v, c]) => <label key={v} style={{ display: "flex", gap: 6, fontSize: 12, color: C.text, padding: "1px 0" }}><input type="checkbox" checked={vals.includes(v)} onChange={e => setVals(x => e.target.checked ? [...x, v] : x.filter(y => y !== v))} />{v}<span style={{ color: C.dim }}>{c.toLocaleString()}</span></label>)}</div></div>}
      <button type="button" style={btn()} disabled={!p || (p.type === "text" && !vals.length) || (p.type === "number" && rng.min === "" && rng.max === "") || (p.type === "time" && !vals.length && rng.min === "" && rng.max === "")} onClick={add}>Apply filter</button>
      <p style={{ ...wbNote, fontSize: 11, width: "100%", margin: 0 }}>A filter applies to every chart whose data has a column with this name.</p></div>}
  </div>;
}
// ── dashboard background and tile style ──
function DsbBgPanel({ board, setBoard, onClose }) { const bg = board.bg || { k: "theme" }; const setBg = (p) => setBoard(b => ({ ...b, bg: { ...(b.bg || {}), ...p } }));
  const sw = (k, css, label) => <button key={k} type="button" aria-pressed={bg.k === k} title={label} onClick={() => setBg({ k })} style={{ width: 74, height: 50, borderRadius: 8, border: `2px solid ${bg.k === k ? C.gold : C.border}`, background: css || C.bg, cursor: "pointer", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 0, overflow: "hidden" }}><span style={{ fontSize: 10.5, background: "rgba(0,0,0,.55)", color: "#fff", width: "100%", padding: "2px 0" }}>{label}</span></button>;
  return <div className="dsb-noprint" style={{ ...card, padding: "12px 14px", marginBottom: 12 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><h3 style={{ ...wbH, margin: 0 }}>Background</h3><button type="button" style={wbSmallBtn()} onClick={onClose}>Done</button></div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{DSB_BGS.map(p => sw(p.k, p.css, p.label))}
      {sw("color", bg.k === "color" ? (bg.c1 || "#0b1220") : "conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444)", "Your colour")}
      {sw("gradient", `linear-gradient(${bg.angle || 160}deg, ${bg.c1 || "#0b1220"}, ${bg.c2 || "#1e3a8a"})`, "Your gradient")}</div>
    {(bg.k === "color" || bg.k === "gradient") && <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10, fontSize: 12, color: C.text }}>
      <label style={{ display: "flex", gap: 5, alignItems: "center" }}>{bg.k === "gradient" ? "From" : "Colour"}<input type="color" aria-label="Background colour" value={bg.c1 || "#0b1220"} onChange={e => setBg({ c1: e.target.value })} style={{ width: 38, height: 28, border: "none", background: "none", cursor: "pointer" }} /></label>
      {bg.k === "gradient" && <><label style={{ display: "flex", gap: 5, alignItems: "center" }}>To<input type="color" aria-label="Second background colour" value={bg.c2 || "#1e3a8a"} onChange={e => setBg({ c2: e.target.value })} style={{ width: 38, height: 28, border: "none", background: "none", cursor: "pointer" }} /></label>
        <label style={{ display: "flex", gap: 5, alignItems: "center" }}>Direction<input type="range" aria-label="Gradient direction" min={0} max={360} step={15} value={bg.angle || 160} onChange={e => setBg({ angle: +e.target.value })} /></label></>}</div>}
    <h3 style={{ ...wbH, margin: "14px 0 6px" }}>Chart cards</h3>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{[["solid", "Solid"], ["glass", "See-through"], ["float", "Floating (deep shadow)"], ["flat", "Flat (no shadow)"]].map(([k, l]) => <button key={k} type="button" aria-pressed={(board.look || "solid") === k} onClick={() => setBoard(b => ({ ...b, look: k }))} style={{ ...pill((board.look || "solid") === k), padding: "6px 11px" }}>{l}</button>)}</div>
    <p style={{ ...wbNote, fontSize: 11.5, margin: "8px 0 0" }}>Each dashboard keeps its own background, saved with the project. Chart cards stay readable on any background. Light or dark text inside the cards follows the app theme (Settings → Appearance).</p>
  </div>; }
// ── studio shell ──
const DSB_H = { s: 200, m: 290, l: 420 };
const DSB_PICKABLE = new Set(["bar", "hbar", "stackbar", "stack100", "pie", "donut", "treemap", "waffle", "funnel", "radial", "lollipop", "dumbbell", "heatmap", "calendar", "scatter", "bubble", "waterfall", "pyramid", "radar"]);
function DashStudio({ onClose, sources, dash, setDash, readOnly, onDeleteSource }) {
  const isMobile = useIsMobile(); const D = dash && dash.boards ? dash : { boards: [], active: "summary" }; const active = D.active || "summary"; const board = D.boards.find(b => b.id === active);
  const [edit, setEdit] = useState(null); const [big, setBig] = useState(null); const [cols, setCols] = useState(null); const [ask, setAsk] = useState(null); const [bgOpen, setBgOpen] = useState(false);
  const askBox = (text, yes, fn) => setAsk({ text, yes, fn });
  const deleteBoard = (b) => askBox(`Delete the dashboard "${b.name}" and its ${b.tiles.length} chart${b.tiles.length === 1 ? "" : "s"}? Your data is not deleted.`, "Delete dashboard", () => { put(c => ({ ...c, boards: c.boards.filter(x => x.id !== b.id), active: c.active === b.id ? "summary" : c.active })); setEdit(null); });
  const dupBoard = (b) => { const id = newBoard(b.name + " (copy)", b.tiles.map(t => ({ ...t, id: dsbUid() }))); setBoard(id, x => ({ ...x, filters: [...(b.filters || [])].map(f => ({ ...f, from: undefined })), cols: b.cols, bg: b.bg, look: b.look })); }; const ncol = isMobile ? 1 : (board && board.cols) || cols || 2;
  useEffect(() => { const k = (e) => { if (e.key === "Escape") { if (ask) setAsk(null); else if (bgOpen) setBgOpen(false); else if (big) setBig(null); else if (edit) setEdit(null); else onClose(); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose, big, edit, ask, bgOpen]);
  const put = (fn) => setDash(cur => { const c = cur && cur.boards ? cur : { boards: [], active: "summary" }; return fn(c); });
  const setBoard = (id, fn) => put(c => ({ ...c, boards: c.boards.map(b => b.id === id ? fn(b) : b) }));
  const newBoard = (name, tiles = []) => { const id = "b" + Math.random().toString(36).slice(2, 8); put(c => ({ ...c, boards: [...c.boards, { id, name, tiles, filters: [], cols: 2 }], active: id })); return id; };
  const addTile = (s, type = "bar") => { const base = { id: dsbUid(), src: s ? s.id : (sources.find(x => !x.missing) || {}).id, type, w: 1, h: "m", opts: {} }; const tab = sources.find(x => x.id === base.src); if (tab && !tab.loading && !tab.missing) Object.assign(base, dsbDefaults(type, tab, {}));
    if (!board) { const id = newBoard("Dashboard " + (D.boards.length + 1), [base]); setEdit(base.id); return id; } setBoard(board.id, b => ({ ...b, tiles: [...b.tiles, base] })); setEdit(base.id); };
  const build = (s) => { const tiles = dsbSuggest(s, s.id).map(t => ({ ...t, h: t.type === "kpi" ? "s" : "m" })); newBoard(dsbShort(s.name, 30), tiles); };
  const editing = board && board.tiles.find(t => t.id === edit);
  const pick = (t) => (v) => { if (readOnly || !board) return; const tab = sources.find(s => s.id === t.src); let col, val;
    if (v && typeof v === "object") { col = t.group; val = v.g; } else { col = ["sankey"].includes(t.type) ? t.x : t.type === "scatter" || t.type === "bubble" ? t.group : t.type === "calendar" ? t.x : t.x; val = v; }
    if (!col || val == null || String(val).startsWith("Other")) return; const xt = tab ? dsbTypeOf(tab, col) : "text";
    setBoard(board.id, b => { const fs = b.filters || []; const ex = fs.find(f => f.col === col && f.values && f.values.length === 1 && f.values[0] === String(val)); if (ex) return { ...b, filters: fs.filter(f => f !== ex) };
      const bk = (t.opts || {}).bucket; if (xt === "time" && col === t.x && bk && bk !== "keep") { const t0 = dsbTime(val); if (t0) { const span = bk === "year" ? 1 : bk === "quarter" ? 0.25 : 1 / 12; const ex2 = fs.find(f => f.from === t.id && f.min === t0.k); if (ex2) return { ...b, filters: fs.filter(f => f !== ex2) }; return { ...b, filters: [...fs.filter(f => f.col !== col), { col, min: t0.k, max: t0.k + span - 1e-6, from: t.id, label: `${col}: ${val}` }] }; } }
      return { ...b, filters: [...fs.filter(f => f.col !== col), { col, values: [String(val)], from: t.id, label: `${col}: ${val}`, xt }] }; }); };
  const tileProps = (t, i) => ({ t, tab: sources.find(s => s.id === t.src) || null, filters: board.filters, height: DSB_H[t.h || "m"], editing: edit === t.id, readOnly, picked: (board.filters || []).some(f => f.from === t.id),
    onEdit: () => setEdit(t.id), onRemove: () => { setBoard(board.id, b => ({ ...b, tiles: b.tiles.filter(x => x.id !== t.id), filters: (b.filters || []).filter(f => f.from !== t.id) })); if (edit === t.id) setEdit(null); },
    onDup: () => setBoard(board.id, b => { const k = b.tiles.findIndex(x => x.id === t.id); const c = { ...t, id: dsbUid(), title: t.title ? t.title + " (copy)" : "" }; const ts = [...b.tiles]; ts.splice(k + 1, 0, c); return { ...b, tiles: ts }; }),
    onMove: (d) => setBoard(board.id, b => { const ts = [...b.tiles]; const k = ts.findIndex(x => x.id === t.id); const j = k + d; if (j < 0 || j >= ts.length) return b; [ts[k], ts[j]] = [ts[j], ts[k]]; return { ...b, tiles: ts }; }),
    onResize: (p) => setBoard(board.id, b => ({ ...b, tiles: b.tiles.map(x => x.id === t.id ? { ...x, ...p } : x) })), onPick: DSB_PICKABLE.has(t.type) && !(t.type === "scatter" && !t.group) ? pick(t) : null, expand: () => setBig(t.id) });
  const bigT = board && board.tiles.find(t => t.id === big);
  return <div className="dsb-root" role="dialog" aria-modal="true" aria-labelledby="dsb-title" style={{ position: "fixed", inset: 0, background: C.overlay, zIndex: 400, display: "flex", alignItems: "stretch", justifyContent: "center", padding: isMobile ? 0 : 14 }}>
    <style>{`@media print { body * { visibility:hidden !important; } .dsb-print, .dsb-print * { visibility:visible !important; } .dsb-print { position:absolute !important; left:0; top:0; width:100% !important; background:#fff; } .dsb-root, .dsb-scroll, .dsb-shell { position:static !important; overflow:visible !important; height:auto !important; display:block !important; } .dsb-noprint { display:none !important; } .dsb-tile { break-inside:avoid; } }`}</style>
    <div className="dsb-shell" style={{ background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: isMobile ? 0 : 10, width: "100%", maxWidth: 1600, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: C.shadow }}>
      <div className="dsb-noprint" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: isMobile ? "10px 12px" : "12px 18px", borderBottom: `1px solid ${C.border}`, background: C.surface, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 30, height: 30, borderRadius: 6, background: C.gold, color: C.onGold, display: "flex", alignItems: "center", justifyContent: "center" }}><Ico n="dash" /></div>
          <div><h2 id="dsb-title" style={{ fontSize: 16, margin: 0, color: C.text }}>Dashboards</h2><div style={{ fontSize: 11, color: C.mid }}>A summary of all your data and interactive charts. Saved with the project.</div></div></div>
        <div role="tablist" aria-label="Dashboards" style={{ display: "flex", gap: 6, overflowX: "auto", order: isMobile ? 3 : 0, width: isMobile ? "100%" : "auto", flex: isMobile ? "none" : 1, justifyContent: isMobile ? "flex-start" : "center" }}>
          <button role="tab" type="button" aria-selected={active === "summary"} onClick={() => { put(c => ({ ...c, active: "summary" })); setEdit(null); }} style={{ ...pill(active === "summary"), padding: "7px 12px", flex: "none" }}>Data summary</button>
          {D.boards.map(b => <span key={b.id} style={{ display: "inline-flex", flex: "none", alignItems: "stretch" }}><button role="tab" type="button" aria-selected={active === b.id} onClick={() => { put(c => ({ ...c, active: b.id })); setEdit(null); }} style={{ ...pill(active === b.id), padding: "7px 10px", borderTopRightRadius: readOnly ? 4 : 0, borderBottomRightRadius: readOnly ? 4 : 0 }}>{dsbShort(b.name, 24)} ({b.tiles.length})</button>
            {!readOnly && <button type="button" aria-label={`Delete dashboard ${b.name}`} title="Delete this dashboard" onClick={() => deleteBoard(b)} style={{ ...pill(active === b.id), padding: "7px 7px", borderLeft: "none", borderTopLeftRadius: 0, borderBottomLeftRadius: 0, color: C.mid }}>✕</button>}</span>)}
          {!readOnly && <button type="button" onClick={() => newBoard("Dashboard " + (D.boards.length + 1))} style={{ ...pill(false, C.teal), padding: "7px 12px", flex: "none" }}>+ New dashboard</button>}</div>
        <button type="button" onClick={onClose} aria-label="Close Dashboards" style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, color: C.mid, cursor: "pointer", padding: "6px 10px", fontSize: 13 }}>✕</button></div>
      <div style={{ flex: 1, display: "flex", minHeight: 0, flexDirection: isMobile ? "column" : "row" }}>
        <div className="dsb-scroll" style={{ flex: 1, overflowY: "auto", padding: isMobile ? 12 : 18, minWidth: 0 }}>
          {active === "summary" || !board ? <DsbSummary sources={sources} isMobile={isMobile} onBuild={readOnly ? () => {} : build} onAdd={readOnly ? () => {} : (s) => addTile(s, "bar")} readOnly={readOnly}
              boards={D.boards} onOpenBoard={(b) => put(c => ({ ...c, active: b.id }))} onDupBoard={dupBoard} onDelBoard={deleteBoard} onRenameBoard={(b, name) => setBoard(b.id, x => ({ ...x, name }))} onNewBoard={() => newBoard("Dashboard " + (D.boards.length + 1))}
              onDelSource={onDeleteSource ? (src) => { const used = D.boards.reduce((a, b) => a + b.tiles.filter(t => t.src === src.id).length, 0); askBox(src.id === "imported" ? `Remove the imported file "${src.name}" from this project?${used ? ` ${used} chart${used === 1 ? "" : "s"} that use it will show "data not available".` : ""} A copy saved in Datasets is not affected.` : `Delete the dataset "${src.name}"?${used ? ` ${used} chart${used === 1 ? "" : "s"} that use it will show "data not available".` : ""} You can bring it back from the project History.`, src.id === "imported" ? "Remove" : "Delete dataset", () => onDeleteSource(src)); } : null} />
            : <div className="dsb-print" style={dsbBgCss(board.bg) ? { background: dsbBgCss(board.bg).css, margin: isMobile ? -12 : -18, padding: isMobile ? 12 : 18, minHeight: "100%" } : undefined}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10, ...(dsbBgCss(board.bg) ? { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" } : {}) }}>
                {readOnly ? <h3 style={{ ...wbH, fontSize: 16, margin: 0 }}>{board.name}</h3> : <input aria-label="Dashboard name" value={board.name} onChange={e => setBoard(board.id, b => ({ ...b, name: e.target.value }))} style={{ ...inp, width: 260, fontSize: 15, fontWeight: 700, padding: "6px 10px" }} />}
                <div className="dsb-noprint" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {!readOnly && <button type="button" style={btn()} onClick={() => addTile(null, "bar")}>+ Add chart</button>}
                  {!isMobile && <label style={{ fontSize: 12, color: C.mid, display: "flex", gap: 5, alignItems: "center" }}>Columns<select aria-label="Columns" value={ncol} onChange={e => { const v = +e.target.value; setCols(v); if (!readOnly) setBoard(board.id, b => ({ ...b, cols: v })); }} style={{ ...sel, width: "auto", padding: "5px 8px", fontSize: 12 }}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}</select></label>}
                  {!readOnly && <button type="button" style={wbSmallBtn()} aria-expanded={bgOpen} onClick={() => setBgOpen(v => !v)}>🎨 Background</button>}
                  <button type="button" style={wbSmallBtn()} onClick={() => window.print()}>Print / save as PDF</button>
                  {!readOnly && <button type="button" style={wbSmallBtn()} onClick={() => dupBoard(board)}>Duplicate</button>}
                  {!readOnly && <button type="button" style={wbSmallBtn(C.red)} onClick={() => deleteBoard(board)}>Delete dashboard</button>}</div></div>
              {bgOpen && !readOnly && <DsbBgPanel board={board} setBoard={(fn) => setBoard(board.id, fn)} onClose={() => setBgOpen(false)} />}
              <div style={dsbBgCss(board.bg) ? { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px 0", marginBottom: 12 } : undefined}><DsbFilters filters={board.filters || []} setFilters={(fs) => setBoard(board.id, b => ({ ...b, filters: fs }))} sources={sources} readOnly={readOnly} /></div>
              {!board.tiles.length ? <div style={{ ...card, textAlign: "center", padding: 30 }}><h3 style={wbH}>This dashboard is empty</h3><p style={wbNote}>Press <strong>+ Add chart</strong>, or go to <strong>Data summary</strong> and press <strong>Build a dashboard</strong> to get a starter set of charts for one table.</p></div>
                : <div style={{ display: "grid", gridTemplateColumns: `repeat(${ncol}, minmax(0, 1fr))`, gap: 12, alignItems: "start" }}>{board.tiles.map((t, i) => <DsbTile key={t.id} look={board.look} {...tileProps({ ...t, w: Math.min(ncol, t.w || 1) }, i)} />)}</div>}
            </div>}
        </div>
        {editing && !readOnly && <DsbEditor isMobile={isMobile} t={editing} sources={sources} onClose={() => setEdit(null)} onChange={(nt) => setBoard(board.id, b => ({ ...b, tiles: b.tiles.map(x => x.id === nt.id ? nt : x) }))}
          onDelete={() => { setBoard(board.id, b => ({ ...b, tiles: b.tiles.filter(x => x.id !== editing.id) })); setEdit(null); }} />}
      </div></div>
    {bigT && <div role="dialog" aria-modal="true" aria-label="Expanded chart" style={{ position: "fixed", inset: 0, zIndex: 420, background: C.overlay, display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? 6 : 30 }} onClick={e => { if (e.target === e.currentTarget) setBig(null); }}>
      <div style={{ width: "100%", maxWidth: 1300, position: "relative" }}><button type="button" aria-label="Close expanded chart" onClick={() => setBig(null)} style={{ position: "absolute", right: 10, top: -34, ...wbSmallBtn() }}>✕ Close</button>
        <DsbTile {...tileProps({ ...bigT, w: 1 }, 0)} height={Math.max(300, (typeof window !== "undefined" ? window.innerHeight : 800) - 200)} expand={() => setBig(null)} /></div></div>}
    {ask && <div role="alertdialog" aria-modal="true" aria-label="Please confirm" style={{ position: "fixed", inset: 0, background: C.overlay, zIndex: 440, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 10, maxWidth: 440, width: "100%", padding: "18px 20px", boxShadow: C.shadow }}>
        <p style={{ fontSize: 13.5, color: C.text, lineHeight: 1.55, margin: "0 0 14px" }}>{ask.text}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button type="button" style={wbSmallBtn()} onClick={() => setAsk(null)} autoFocus>Cancel</button>
          <button type="button" style={{ ...btn(C.red), padding: "7px 16px" }} onClick={() => { const f = ask.fn; setAsk(null); f(); }}>{ask.yes}</button></div></div></div>}
  </div>;
}

export { DSB_CAN3D, DashStudio, DsbChart, PanelImportModal, ProjectsModal, WbCombine, WbOptimize, dsbModel, dsbTypeOf };
