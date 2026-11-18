// workbench/storage.js — split from App.js (code unchanged; only imports and exports were added)


// ── Large tables: kept in the browser's IndexedDB (no size limit worth worrying about) instead of the project record ──
const PRJ_BIG_CELLS = 150000; // above this (~2-5 MB) a table is stored on this device and the project keeps a reference
const prjCells = (t) => t && Array.isArray(t.rows)? t.rows.length*Math.max(1,(t.headers||[]).length) : 0;
const prjLite = (t) => { if (!t) return t; if (t.big && (!Array.isArray(t.rows) || t.missing || t.loading)) { const { rows, loading, missing, ...m }=t; return { ...m, big:true }; }
  if (prjCells(t)>PRJ_BIG_CELLS){ const { rows, loading, missing, ...m }=t; return { ...m, big:true, nRows:t.rows.length }; } return t; };
const prjIdb = (()=>{ let dbp=null; const open=()=>dbp||(dbp=new Promise((res,rej)=>{ if (!window.indexedDB) return rej(new Error("This browser cannot store large tables.")); const r=indexedDB.open("ecoscope",1); r.onupgradeneeded=()=>r.result.createObjectStore("tables"); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }));
  const run=(mode,fn)=>open().then(db=>new Promise((res,rej)=>{ const t=db.transaction("tables",mode); const q=fn(t.objectStore("tables")); t.oncomplete=()=>res(q? q.result : undefined); t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error); }));
  return { put:(k,v)=>run("readwrite",s=>s.put(v,k)), get:(k)=>run("readonly",s=>s.get(k)), del:(k)=>run("readwrite",s=>s.delete(k)) }; })();
const prjBigKey = (user, id) => `${user}|table|${id}`;
// ══════════════════════════════════════════════
// MERGE AND APPEND (engine). Tables are {headers, rows} with string or number cells.
// ══════════════════════════════════════════════
const CMB_BLANK = (v) => v==null || String(v).trim()==="" || /^(na|n\/a|nan|null|\.)$/i.test(String(v).trim());
const cmbNorm = (v, o={}) => { let s=v==null? "" : String(v); if (o.trim!==false) s=s.trim().replace(/\s+/g," "); if (o.ci) s=s.toLowerCase();
  if (o.numeric!==false && /^[-+]?\d+(\.\d+)?$/.test(s)) s=String(+s); return s; };
const cmbIsNum = (v) => !CMB_BLANK(v) && isFinite(+String(v).replace(/,/g,""));
// Key values for each row; null when every key part is blank (such rows never match)
const cmbKeys = (tab, cols, o) => { const idx=cols.map(c=>tab.headers.indexOf(c)); return tab.rows.map(r=>{ const parts=idx.map(j=>r[j]); if (parts.every(CMB_BLANK)) return null; return parts.map(p=>cmbNorm(p,o)).join("\u0001"); }); };
const cmbShowKey = (k) => k==null? "(blank)" : k.split("\u0001").join(" · ");
// first original spelling of each normalized key (for messages)
const cmbRawMap = (tab, cols, keys) => { const idx=cols.map(c=>tab.headers.indexOf(c)); const m=new Map(); keys.forEach((k,i)=>{ if (k!=null && !m.has(k)) m.set(k, idx.map(j=>String(tab.rows[i][j]??"").trim()).join(" · ")); }); return m; };
const cmbCount = (keys) => { const m=new Map(); keys.forEach(k=>{ if (k!=null) m.set(k,(m.get(k)||0)+1); }); return m; };
// Is this combination of columns unique in the table? Returns {unique, dups:[{key,n}], blank}
const cmbUniq = (tab, cols, o) => { const ks=cmbKeys(tab, cols, o); const m=cmbCount(ks); const raw=cmbRawMap(tab, cols, ks); const dups=[...m].filter(([,n])=>n>1).sort((a,b)=>b[1]-a[1]).map(([k,n])=>({ key:raw.get(k)||cmbShowKey(k), n }));
  return { unique:!dups.length, dups, blank:ks.filter(k=>k==null).length }; };
// Columns that look like keys (same name in both tables, or id/code/year-like)
const cmbGuessKeys = (L, R) => { const lower=(s)=>String(s).toLowerCase(); const common=L.headers.filter(h=>R.headers.some(g=>lower(g)===lower(h)));
  const pref=common.filter(h=>/^(id|.*_id|code|iso.*|country.*|year|date|time|period|quarter|month|region|district|household|hh.*|casenum|person.*|firm.*|name)$/i.test(h));
  const pick=(pref.length? pref : common).slice(0,3); if (pick.length) return pick.map(h=>({ l:h, r:R.headers.find(g=>lower(g)===lower(h)) }));
  // no shared names: pair the columns whose values overlap most (country ↔ name, iso ↔ code)
  const vals=(T,j,max)=>{ const set=new Set(); const st=Math.max(1, Math.floor(T.rows.length/20000)); for (let i=0;i<T.rows.length && set.size<max;i+=st){ const v=String(T.rows[i][j]??"").trim().toLowerCase(); if (v) set.add(v); } return set; };
  let best=null; L.headers.forEach((h,jl)=>{ const A=vals(L,jl,5000); if (A.size<2) return; R.headers.forEach((g,jr)=>{ const B=vals(R,jr,5000); if (B.size<2) return; let hit=0; A.forEach(v=>{ if (B.has(v)) hit++; }); const sc=hit/Math.min(A.size,B.size); if (hit>=2 && sc>=0.5 && (!best || sc>best.sc || (sc===best.sc && hit>best.hit))) best={ l:h, r:g, sc, hit }; }); });
  return best? [{ l:best.l, r:best.r }] : []; };
/* Merge (adds columns).
   cfg = { keys:[{l,r}], type:"1:1"|"m:1"|"1:m"|"m:m", how:"inner"|"left"|"right"|"full"|"anti_left"|"anti_right",
           overlap:"suffix"|"master"|"using"|"update"|"replace", suffix:"_using", indicator:true, norm:{trim,ci,numeric}, bring:[R columns] } */
const cmbMerge = (L, R, cfg) => {
  const o=cfg.norm||{}; const keys=cfg.keys||[]; const warn=[];
  if (!keys.length) return { error:"Choose at least one key variable that links the two tables." };
  for (const k of keys){ if (!L.headers.includes(k.l)) return { error:`Key "${k.l}" is not in the first table.` }; if (!R.headers.includes(k.r)) return { error:`Key "${k.r}" is not in the second table.` }; }
  const lk=keys.map(k=>k.l), rk=keys.map(k=>k.r);
  const kL=cmbKeys(L, lk, o), kR=cmbKeys(R, rk, o); const cL=cmbCount(kL), cR=cmbCount(kR);
  const dupL=[...cL].filter(([,n])=>n>1), dupR=[...cR].filter(([,n])=>n>1);
  const rawL=cmbRawMap(L, lk, kL), rawR=cmbRawMap(R, rk, kR);
  const show=(d)=>d.slice(0,5).map(([k,n])=>`${rawL.get(k)||rawR.get(k)||cmbShowKey(k)} (${n}×)`).join(", ");
  const type=cfg.type||"1:1";
  if ((type==="1:1"||type==="1:m") && dupL.length) return { error:`The key is not unique in the first table, so a ${type} merge is not valid. ${dupL.length} key value${dupL.length>1?"s are":" is"} repeated, e.g. ${show(dupL)}. Add another key (e.g. year) or choose ${type==="1:1"?"m:1":"m:m"}.`, dupL:dupL.length };
  if ((type==="1:1"||type==="m:1") && dupR.length) return { error:`The key is not unique in the second table, so a ${type} merge is not valid. ${dupR.length} key value${dupR.length>1?"s are":" is"} repeated, e.g. ${show(dupR)}. Add another key (e.g. year) or choose ${type==="1:1"?"1:m":"m:m"}.`, dupR:dupR.length };
  if (type==="m:m") warn.push("Many-to-many: every row in the first table is paired with every row in the second that has the same key. Check that this is what you want; the number of rows can grow quickly.");
  // key type mismatch check
  const numShare=(tab,c)=>{ const j=tab.headers.indexOf(c); const v=tab.rows.map(r=>r[j]).filter(x=>!CMB_BLANK(x)); return v.length? v.filter(cmbIsNum).length/v.length : 0; };
  keys.forEach(k=>{ const a=numShare(L,k.l), b=numShare(R,k.r); if (Math.abs(a-b)>0.5) warn.push(`Key "${k.l}" is mostly ${a>0.5?"numbers":"text"} in the first table but "${k.r}" is mostly ${b>0.5?"numbers":"text"} in the second. Codes may differ (for example GH vs Ghana).`); });
  const blankL=kL.filter(k=>k==null).length, blankR=kR.filter(k=>k==null).length;
  if (blankL||blankR) warn.push(`${blankL+blankR} row${blankL+blankR>1?"s have":" has"} a blank key and cannot match (${blankL} in the first table, ${blankR} in the second).`);
  // output columns
  const rKeySet=new Set(rk);
  const bring=(cfg.bring && cfg.bring.length? cfg.bring : R.headers).filter(h=>!rKeySet.has(h)); // key values are already in the first table's key columns
  const overlap=bring.filter(h=>L.headers.includes(h) && !rKeySet.has(h)); const pol=cfg.overlap||"suffix"; const sfx=cfg.suffix||"_using";
  const outR=[]; // [{src index in R, out name, mode}]
  bring.forEach(h=>{ const j=R.headers.indexOf(h); const isOv=overlap.includes(h);
    if (!isOv){ let nm=h; if (L.headers.includes(nm)) nm=`${h}${sfx}`; outR.push({ j, name:nm, mode:"add" }); return; }
    if (pol==="suffix") outR.push({ j, name:`${h}${sfx}`, mode:"add" }); else if (pol!=="master") outR.push({ j, name:h, mode:pol, li:L.headers.indexOf(h) }); });
  const added=outR.filter(c=>c.mode==="add");
  const headers=[...L.headers, ...added.map(c=>c.name)]; const ind=cfg.indicator!==false; if (ind){ let nm="_merge"; while (headers.includes(nm)) nm="_"+nm; headers.push(nm); }
  const lkIdx=lk.map(c=>L.headers.indexOf(c)), rkIdx=rk.map(c=>R.headers.indexOf(c));
  const byR=new Map(); kR.forEach((k,i)=>{ if (k==null) return; if (!byR.has(k)) byR.set(k,[]); byR.get(k).push(i); });
  const usedR=new Set(); const rows=[]; let mMatched=0, mOnly=0, updated=0, conflicts=0;
  const makeRow=(lr, rr, code)=>{ const out=lr? [...lr] : new Array(L.headers.length).fill("");
    if (!lr && rr) lkIdx.forEach((li,q)=>{ out[li]=rr[rkIdx[q]]; }); // using-only rows: key values come from the second table
    if (rr) outR.filter(c=>c.mode!=="add").forEach(c=>{ const v=rr[c.j], cur=out[c.li];
      if (c.mode==="using") { if (lr && !CMB_BLANK(cur) && !CMB_BLANK(v) && String(cur)!==String(v)) conflicts++; out[c.li]=v; }
      else if (c.mode==="update") { if (CMB_BLANK(cur) && !CMB_BLANK(v)) { out[c.li]=v; if (lr) updated++; } else if (lr && !CMB_BLANK(cur) && !CMB_BLANK(v) && String(cur)!==String(v)) conflicts++; }
      else if (c.mode==="replace") { if (!CMB_BLANK(v)) { if (lr && String(cur)!==String(v)) updated++; out[c.li]=v; } } });
    added.forEach(c=>out.push(rr? rr[c.j] : "")); if (ind) out.push(code); return out; };
  const how=cfg.how||"left";
  L.rows.forEach((lr,i)=>{ const k=kL[i]; const ms=k!=null? byR.get(k) : null;
    if (ms && ms.length){ mMatched++; ms.forEach(j=>usedR.add(j)); if (how==="inner"||how==="left"||how==="full"||how==="right") ms.forEach(j=>rows.push(makeRow(lr, R.rows[j], "3 matched"))); }
    else { mOnly++; if (how==="left"||how==="full"||how==="anti_left") rows.push(makeRow(lr, null, "1 first table only")); } });
  const uOnlyIdx=R.rows.map((_,j)=>j).filter(j=>!usedR.has(j));
  if (how==="right"||how==="full"||how==="anti_right") uOnlyIdx.forEach(j=>rows.push(makeRow(null, R.rows[j], "2 second table only")));
  // right join keeps the order of the second table
  if (how==="right"){ const pos=new Map(); kR.forEach((k,j)=>{ if (k!=null && !pos.has(k)) pos.set(k,j); }); const kOut=cmbKeys({ headers, rows }, lk, o); const ord=rows.map((r,i)=>({ r, p:kOut[i]!=null && pos.has(kOut[i])? pos.get(kOut[i]) : 1e9+i })); ord.sort((a,b)=>a.p-b.p); rows.splice(0, rows.length, ...ord.map(x=>x.r)); }
  // near misses: unmatched keys that would match with case/space-insensitive comparison
  let near=0; if (!o.ci){ const loose={ ...o, ci:true, trim:true }; const kR2=new Set(cmbKeys(R, rk, loose).filter(Boolean)); const kL2=cmbKeys(L, lk, loose); kL.forEach((k,i)=>{ if (k!=null && !byR.has(k) && kL2[i] && kR2.has(kL2[i])) near++; }); }
  if (near) warn.push(`${near} unmatched row${near>1?"s":""} would match if upper/lower case were ignored. Tick "Ignore case" under key options.`);
  if (overlap.length && pol==="master") warn.push(`Kept the first table's values for ${overlap.join(", ")} (they also exist in the second table).`);
  if (conflicts) warn.push(`${conflicts} cell${conflicts>1?"s":""} had different non-blank values in the two tables for the shared column${overlap.length>1?"s":""} ${overlap.join(", ")}.`);
  const raw=(tab,idx,i)=>idx.map(j=>String(tab.rows[i][j]??"").trim()).join(" · ");
  const unmatchedL=[...new Set(L.rows.map((_,i)=>i).filter(i=>kL[i]!=null && !byR.has(kL[i])).map(i=>raw(L,lkIdx,i)))].slice(0,8);
  const unmatchedR=[...new Set(uOnlyIdx.filter(j=>kR[j]!=null).map(j=>raw(R,rkIdx,j)))].slice(0,8);
  return { headers, rows, warn, report:{ type, how, nL:L.rows.length, nR:R.rows.length, nOut:rows.length, masterMatched:mMatched, masterOnly:mOnly, usingMatched:R.rows.length-uOnlyIdx.length, usingOnly:uOnlyIdx.length,
    dupL:dupL.length, dupR:dupR.length, overlap, policy:pol, updated, conflicts, unmatchedL, unmatchedR, matchRate:L.rows.length? mMatched/L.rows.length : 0 } };
};
/* Append (stacks rows).
   tables = [{name, headers, rows}], cfg = { match:"union"|"intersection", ci:false, source:"source"|"" , keyCheck:[cols] } */
const cmbAppend = (tables, cfg={}) => {
  if (!tables || tables.length<2) return { error:"Choose at least two tables to append." };
  const canon=(h)=>cfg.ci? String(h).trim().toLowerCase() : String(h).trim();
  const order=[]; const disp={}; tables.forEach(t=>t.headers.forEach(h=>{ const c=canon(h); if (!disp[c]){ disp[c]=String(h).trim(); order.push(c); } }));
  let cols=order; if (cfg.match==="intersection") cols=order.filter(c=>tables.every(t=>t.headers.some(h=>canon(h)===c)));
  if (!cols.length) return { error:"The tables have no column names in common. Rename columns so they match, or use \"Keep all columns\"." };
  const warn=[]; const perTable=tables.map(t=>{ const have=new Set(t.headers.map(canon)); return { name:t.name, rows:t.rows.length, missing:cols.filter(c=>!have.has(c)).map(c=>disp[c]), dropped:t.headers.filter(h=>!cols.includes(canon(h))) }; });
  const src=cfg.source===undefined? "source" : cfg.source; let srcName=src; if (src) while (cols.some(c=>disp[c]===srcName)) srcName="_"+srcName;
  const headers=[...cols.map(c=>disp[c]), ...(src? [srcName] : [])]; const rows=[];
  tables.forEach(t=>{ const idx=cols.map(c=>t.headers.findIndex(h=>canon(h)===c)); t.rows.forEach(r=>rows.push([...idx.map(j=>j>=0? r[j] : ""), ...(src? [t.name] : [])])); });
  // a column that is numeric in one table and text in another usually means different codes
  cols.forEach(c=>{ const kinds=tables.map(t=>{ const j=t.headers.findIndex(h=>canon(h)===c); if (j<0) return null; const v=t.rows.map(r=>r[j]).filter(x=>!CMB_BLANK(x)); if (!v.length) return null; return v.filter(cmbIsNum).length/v.length>0.8? "number" : "text"; }).filter(Boolean);
    if (new Set(kinds).size>1) warn.push(`"${disp[c]}" holds numbers in one table and text in another. Check that the codes mean the same thing.`); });
  if (cfg.ci){ const renamed=tables.flatMap(t=>t.headers.filter(h=>String(h).trim()!==disp[canon(h)]).map(h=>`${h} → ${disp[canon(h)]}`)); if (renamed.length) warn.push(`Matched column names ignoring case: ${[...new Set(renamed)].slice(0,6).join(", ")}.`); }
  perTable.forEach(p=>{ if (p.missing.length) warn.push(`${p.name}: no ${p.missing.slice(0,6).join(", ")}${p.missing.length>6?"…":""}; those cells are left blank.`); if (p.dropped.length && cfg.match==="intersection") warn.push(`${p.name}: dropped ${p.dropped.slice(0,6).join(", ")}${p.dropped.length>6?"…":""} (not in every table).`); });
  let dupKeys=0, dupEx=[]; if (cfg.keyCheck && cfg.keyCheck.length){ const u=cmbUniq({ headers, rows }, cfg.keyCheck, {}); dupKeys=u.dups.length; dupEx=u.dups.slice(0,5);
    if (dupKeys) warn.push(`After appending, ${dupKeys} value${dupKeys>1?"s":""} of ${cfg.keyCheck.join(" + ")} appear more than once (e.g. ${dupEx.map(d=>`${d.key} ${d.n}×`).join(", ")}). The tables may overlap.`); }
  return { headers, rows, warn, report:{ n:rows.length, tables:perTable, columns:headers.length, dupKeys } };
};
// ══════════════════════════════════════════════
// LINEAR AND INTEGER PROGRAMMING (engine)
// Model: { sense:"max"|"min", obj:{v:c}, objConst, cons:[{name, coefs:{v:a}, op:"<="|">="|"=", rhs}], bounds:{v:{lo,hi}}, ints:[v], vars:[v] }
// Default bounds are x >= 0 (as in lp_solve and most textbooks); write "free x" or "x >= -inf" to allow negatives.
// ══════════════════════════════════════════════
const LP_EPS = 1e-9;
const lpIdent = (s) => /^[A-Za-z_][A-Za-z0-9_.\[\]]*$/.test(s);
// "3x + 2.5 y - z + 4" → { coefs:{x:3,y:2.5,z:-1}, c:4 }
const lpLinear = (src, lineNo) => {
  const s=src.replace(/\s+/g," ").trim(); const out={ coefs:{}, c:0 }; if (!s) return out;
  const re=/\s*([+-])?\s*((?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)?\s*(\*)?\s*([A-Za-z_][A-Za-z0-9_.\[\]]*)?\s*/y; let i=0, first=true;
  while (i<s.length){ re.lastIndex=i; const m=re.exec(s); if (!m || m[0].length===0) throw new Error(`Line ${lineNo}: cannot read "${s.slice(i)}"`);
    const [, sign, num, star, v]=m; if (!sign && !first && (num||v)) throw new Error(`Line ${lineNo}: missing + or - before "${(num||"")+(v||"")}"`);
    if (!num && !v) throw new Error(`Line ${lineNo}: a sign without a number or variable near "${s.slice(i)}"`);
    if (star && (!num || !v)) throw new Error(`Line ${lineNo}: "*" must sit between a number and a variable`);
    const k=(sign==="-"? -1 : 1)*(num? parseFloat(num) : 1); if (v) out.coefs[v]=(out.coefs[v]||0)+k; else out.c+=k; i=re.lastIndex; first=false; }
  return out; };
const lpNum = (t) => { const s=t.trim().toLowerCase(); if (/^[-+]?(inf|infinity|1e30)$/.test(s)) return s.startsWith("-")? -Infinity : Infinity; const v=Number(s); return isFinite(v)? v : NaN; };
// Parse the text format (one statement per line; ";" also ends a statement)
const lpParse = (text) => {
  const m={ sense:null, obj:{}, objConst:0, cons:[], bounds:{}, ints:[], vars:[] }; const errors=[]; const seen=new Set(); const note=(v)=>{ if (!seen.has(v)){ seen.add(v); m.vars.push(v); } };
  const stmts=[]; String(text||"").split(/\r?\n/).forEach((raw,li)=>{ raw.replace(/(#|\/\/).*$/,"").split(";").forEach(p=>{ if (p.trim()) stmts.push({ s:p.trim(), line:li+1 }); }); });
  let auto=0;
  for (const { s, line } of stmts){
    try {
      let mm;
      if ((mm=s.match(/^(max|maximi[sz]e|min|minimi[sz]e)\s*:?\s*(.*)$/i))){ if (m.sense) throw new Error(`Line ${line}: only one objective is allowed`);
        m.sense=/^max/i.test(mm[1])? "max" : "min"; const e=lpLinear(mm[2], line); m.obj=e.coefs; m.objConst=e.c; Object.keys(e.coefs).forEach(note); continue; }
      if ((mm=s.match(/^(int|integer|bin|binary|free)\s+(.+)$/i))){ const vs=mm[2].split(/[\s,]+/).filter(Boolean); vs.forEach(v=>{ if (!lpIdent(v)) throw new Error(`Line ${line}: "${v}" is not a valid variable name`); note(v);
          const b=m.bounds[v]||(m.bounds[v]={ lo:0, hi:Infinity }); if (/^bin/i.test(mm[1])){ b.lo=Math.max(b.lo,0); b.hi=Math.min(b.hi,1); if (!m.ints.includes(v)) m.ints.push(v); } else if (/^free/i.test(mm[1])){ b.lo=-Infinity; } else if (!m.ints.includes(v)) m.ints.push(v); }); continue; }
      let name=null; if ((mm=s.match(/^([A-Za-z_][A-Za-z0-9_.\[\]]*)\s*:(?!=)\s*(.*)$/))){ name=mm[1]; } const body=name? mm[2] : s;
      const parts=body.split(/(<=|>=|=<|=>|==|<|>|=)/).map(x=>x.trim()); if (parts.length<3) throw new Error(`Line ${line}: expected an objective (max:/min:) or a constraint with <=, >= or =`);
      const opN=(o)=>o==="=<"||o==="<"? "<=" : o==="=>"||o===">"? ">=" : o==="=="? "=" : o;
      // range: a <= expr <= b
      const pieces=[]; for (let k=0;k<parts.length;k+=2) pieces.push(parts[k]); const ops=[]; for (let k=1;k<parts.length;k+=2) ops.push(opN(parts[k]));
      const pairs=ops.map((op,k)=>({ lhs:pieces[k], op, rhs:pieces[k+1] }));
      for (const p of pairs){ const L=/^[-+]?(inf|infinity)$/i.test(p.lhs.trim())? { coefs:{}, c:lpNum(p.lhs) } : lpLinear(p.lhs, line); const R=/^[-+]?(inf|infinity)$/i.test(p.rhs.trim())? { coefs:{}, c:lpNum(p.rhs) } : lpLinear(p.rhs, line);
        const coefs={ ...L.coefs }; Object.entries(R.coefs).forEach(([v,a])=>{ coefs[v]=(coefs[v]||0)-a; }); Object.keys(coefs).forEach(v=>{ if (Math.abs(coefs[v])<1e-15) delete coefs[v]; });
        const rhs=R.c-L.c; const vs=Object.keys(coefs); vs.forEach(note);
        if (!vs.length){ if (!isFinite(rhs)) continue; const ok=p.op==="<="? 0<=rhs+1e-9 : p.op===">="? 0>=rhs-1e-9 : Math.abs(rhs)<1e-9; if (!ok) throw new Error(`Line ${line}: this line has no variables and is never true`); continue; }
        // a single unnamed variable is a bound (like lp_solve); give it a name to make it a constraint with a shadow price
        if (vs.length===1 && !name){ const v=vs[0], a=coefs[v]; let op=p.op; let val=rhs/a; if (a<0) op=op==="<="? ">=" : op===">="? "<=" : op; const b=m.bounds[v]||(m.bounds[v]={ lo:0, hi:Infinity });
          if (op==="<=") b.hi=Math.min(b.hi,val); else if (op===">=") b.lo=(isFinite(val)||val===-Infinity)? (b.lo===0 && val<0? val : Math.max(b.lo,val)) : b.lo; else { b.lo=val; b.hi=val; } continue; }
        if (!isFinite(rhs)) continue; m.cons.push({ name:name? (pairs.length>1? `${name}_${pairs.indexOf(p)+1}` : name) : `R${++auto}`, coefs, op:p.op, rhs, line }); }
    } catch(e){ errors.push(e.message); }
  }
  if (!m.sense) errors.push("Add an objective line, for example  max: 3x + 2y  or  min: cost");
  const names=new Set(); m.cons.forEach(c=>{ if (names.has(c.name)) errors.push(`Constraint name "${c.name}" is used twice`); names.add(c.name); });
  Object.entries(m.bounds).forEach(([v,b])=>{ if (b.lo>b.hi+1e-12) errors.push(`Bounds for ${v} are impossible (${b.lo} > ${b.hi})`); });
  return { model:m, errors };
};
// Dense two-phase simplex with Bland's rule. Solves min c'z s.t. Az = b (b >= 0), z >= 0.
// Returns { status, z, obj, y (duals per row), iters }
const lpSimplex = (A, b, c, maxIter=20000) => {
  const m=A.length, n=c.length; const W=n+m; // columns: z (n), artificials (m)
  const T=A.map((row,i)=>{ const r=new Float64Array(W+1); row.forEach((v,j)=>{ r[j]=v; }); r[n+i]=1; r[W]=b[i]; return r; });
  const basis=Array.from({ length:m },(_,i)=>n+i); let iters=0;
  const pivot=(r,col)=>{ const pr=T[r], pv=pr[col]; for (let j=0;j<=W;j++) pr[j]/=pv; for (let i=0;i<m;i++){ if (i===r) continue; const f=T[i][col]; if (Math.abs(f)<1e-15) continue; const ri=T[i]; for (let j=0;j<=W;j++) ri[j]-=f*pr[j]; } basis[r]=col; };
  const run=(cost, allowed)=>{ // cost: Float64Array(W)
    for (;;){ if (++iters>maxIter) return "iteration_limit";
      // reduced costs d_j = c_j - c_B B^-1 A_j
      let enter=-1; for (let j=0;j<W;j++){ if (!allowed(j) || basis.includes(j)) continue; let d=cost[j]; for (let i=0;i<m;i++) d-=cost[basis[i]]*T[i][j]; if (d< -1e-9){ enter=j; break; } }
      if (enter<0) return "optimal";
      let leave=-1, best=Infinity; for (let i=0;i<m;i++){ const a=T[i][enter]; if (a>1e-9){ const ratio=T[i][W]/a; if (ratio<best-1e-12 || (Math.abs(ratio-best)<=1e-12 && basis[i]<basis[leave])){ best=ratio; leave=i; } } }
      if (leave<0) return "unbounded"; pivot(leave, enter); } };
  // Phase 1: minimise the sum of artificials
  const c1=new Float64Array(W); for (let i=0;i<m;i++) c1[n+i]=1;
  const s1=run(c1, ()=>true); if (s1==="iteration_limit") return { status:"iteration_limit", iters };
  const infeas=basis.reduce((s,bj,i)=>s+(bj>=n? T[i][W] : 0),0); if (infeas>1e-7*Math.max(1,b.reduce((s,v)=>s+Math.abs(v),0))) return { status:"infeasible", iters };
  // drive artificials out of the basis; rows where that is impossible are redundant
  const dead=new Set(); for (let i=0;i<m;i++){ if (basis[i]<n) continue; let col=-1; for (let j=0;j<n;j++){ if (Math.abs(T[i][j])>1e-9 && !basis.includes(j)){ col=j; break; } } if (col>=0) pivot(i,col); else dead.add(i); }
  // Phase 2 (artificial columns stay in the tableau but may not enter: their reduced costs give the duals)
  const c2=new Float64Array(W); for (let j=0;j<n;j++) c2[j]=c[j];
  const s2=run(c2, (j)=>j<n); if (s2!=="optimal") return { status:s2, iters };
  const z=new Array(n).fill(0); basis.forEach((bj,i)=>{ if (bj<n) z[bj]=T[i][W]; });
  // y_i = c_B B^-1 e_i = cost of artificial i minus its reduced cost = -(reduced cost) since its cost is 0
  const y=new Array(m).fill(0); for (let k=0;k<m;k++){ if (dead.has(k)) continue; let d=0; for (let i=0;i<m;i++) d-=c2[basis[i]]*T[i][n+k]; y[k]=-d; }
  const obj=z.reduce((s,v,j)=>s+v*c[j],0); return { status:"optimal", z, obj, y, iters };
};
// Solve a continuous LP (integrality ignored). Returns values, objective, duals, slacks, reduced costs.
const lpSolveLP = (M, boundOverride) => {
  const vars=M.vars.slice(); const B=(v)=>({ lo:0, hi:Infinity, ...(M.bounds[v]||{}), ...((boundOverride||{})[v]||{}) });
  // x_v = off + sum mult*z
  const map=[]; let nz=0; const ub=[];
  vars.forEach(v=>{ const { lo, hi }=B(v); if (lo>hi+1e-12) { map.push(null); return; }
    if (isFinite(lo)){ const k=nz++; map.push({ off:lo, terms:[[k,1]] }); if (isFinite(hi)) ub.push({ k, cap:hi-lo, v }); }
    else if (isFinite(hi)){ const k=nz++; map.push({ off:hi, terms:[[k,-1]] }); }
    else { const k1=nz++, k2=nz++; map.push({ off:0, terms:[[k1,1],[k2,-1]] }); } });
  if (map.some(x=>x==null)) return { status:"infeasible" };
  const vi=Object.fromEntries(vars.map((v,i)=>[v,i]));
  const rows=[]; // {a: dense over z, op, rhs, src}
  M.cons.forEach((c,ci)=>{ const a=new Array(nz).fill(0); let rhs=c.rhs; Object.entries(c.coefs).forEach(([v,co])=>{ const mp=map[vi[v]]; rhs-=co*mp.off; mp.terms.forEach(([k,s])=>{ a[k]+=co*s; }); }); rows.push({ a, op:c.op, rhs, src:ci }); });
  ub.forEach(u=>{ const a=new Array(nz).fill(0); a[u.k]=1; rows.push({ a, op:"<=", rhs:u.cap, src:-1 }); });
  // slacks
  const nS=rows.filter(r=>r.op!=="=").length; const N=nz+nS; const A=[], b=[], flip=[]; let s=0;
  rows.forEach(r=>{ const row=new Array(N).fill(0); r.a.forEach((v,j)=>{ row[j]=v; }); if (r.op==="<=") row[nz+s++]=1; else if (r.op===">=") row[nz+s++]=-1; let rhs=r.rhs; let f=1; if (rhs<0){ for (let j=0;j<N;j++) row[j]=-row[j]; rhs=-rhs; f=-1; } A.push(row); b.push(rhs); flip.push(f); });
  const sign=M.sense==="max"? -1 : 1; const c=new Array(N).fill(0); let objOff=M.objConst||0;
  Object.entries(M.obj).forEach(([v,co])=>{ const mp=map[vi[v]]; if (!mp) return; objOff+=co*mp.off; mp.terms.forEach(([k,sg])=>{ c[k]+=sign*co*sg; }); });
  if (!A.length){ // no constraints: optimum at bounds
    const z=new Array(N).fill(0); for (let j=0;j<nz;j++){ if (c[j]< -LP_EPS) return { status:"unbounded" }; } const x={}; vars.forEach((v,i)=>{ const mp=map[i]; x[v]=mp.off; });
    return { status:"optimal", x, obj:objOff, duals:{}, slack:{}, reduced:{}, iters:0, z }; }
  const r=lpSimplex(A, b, c); if (r.status!=="optimal") return { status:r.status, iters:r.iters };
  const x={}; vars.forEach((v,i)=>{ const mp=map[i]; x[v]=mp.off+mp.terms.reduce((acc,[k,sg])=>acc+sg*r.z[k],0); x[v]=Math.abs(x[v])<1e-10? 0 : +x[v].toPrecision(12); });
  const obj=+(objOff+sign*r.obj).toPrecision(12);
  // dual in the user's sense: change in the objective per one-unit increase of the right-hand side
  const duals={}, slack={}, lhs={}; rows.forEach((row,i)=>{ if (row.src<0) return; const c0=M.cons[row.src]; const y=r.y[i]*flip[i]*sign; duals[c0.name]=Math.abs(y)<1e-10? 0 : +y.toPrecision(12);
    const L=Object.entries(c0.coefs).reduce((acc,[v,co])=>acc+co*x[v],0); lhs[c0.name]=L; slack[c0.name]=c0.op==="="? 0 : (c0.op==="<="? c0.rhs-L : L-c0.rhs); });
  const reduced={}; vars.forEach(v=>{ let d=M.obj[v]||0; M.cons.forEach(c0=>{ d-=(duals[c0.name]||0)*(c0.coefs[v]||0); }); reduced[v]=Math.abs(d)<1e-10? 0 : d; });
  return { status:"optimal", x, obj, duals, slack, lhs, reduced, iters:r.iters };
};
// Branch and bound for integer / binary variables (depth-first, most fractional variable, incumbent pruning)
const lpSolve = (M, opts={}) => {
  const t0=Date.now(); const maxNodes=opts.maxNodes||3000, maxMs=opts.maxMs||8000; const ints=M.ints||[];
  if (!M.vars.length) return { status:"error", message:"The model has no variables." };
  const root=lpSolveLP(M); if (root.status!=="optimal" || !ints.length) return { ...root, nodes:1, isMIP:false };
  const better=(a,b)=>M.sense==="max"? a>b+1e-9 : a<b-1e-9; let best=null, nodes=0, limited=false; const tol=1e-6;
  const stack=[{ bo:{}, relax:root }];
  while (stack.length){ if (nodes>=maxNodes || Date.now()-t0>maxMs){ limited=true; break; } const node=stack.pop(); nodes++;
    const r=node.relax||lpSolveLP(M, node.bo); if (r.status!=="optimal") continue; if (best && !better(r.obj, best.obj)) continue;
    let pick=null, frac=0; ints.forEach(v=>{ const val=r.x[v], f=Math.abs(val-Math.round(val)); if (f>tol && f>frac){ frac=f; pick=v; } });
    if (!pick){ const x={ ...r.x }; ints.forEach(v=>{ x[v]=Math.round(x[v]); }); best={ ...r, x }; continue; }
    const val=r.x[pick]; const cur=node.bo[pick]||{}; const B0={ lo:0, hi:Infinity, ...(M.bounds[pick]||{}), ...cur };
    const down={ ...node.bo, [pick]:{ ...B0, hi:Math.floor(val) } }, up={ ...node.bo, [pick]:{ ...B0, lo:Math.ceil(val) } };
    // explore the branch nearer the relaxed value first
    if (val-Math.floor(val)>0.5){ stack.push({ bo:down }); stack.push({ bo:up }); } else { stack.push({ bo:up }); stack.push({ bo:down }); } }
  if (!best) return { status:limited? "no_integer_solution_found" : "infeasible", nodes, isMIP:true, limited };
  // recompute slacks with the integer solution; duals of an integer model are not meaningful
  const slack={}, lhs={}; M.cons.forEach(c0=>{ const L=Object.entries(c0.coefs).reduce((acc,[v,co])=>acc+co*best.x[v],0); lhs[c0.name]=L; slack[c0.name]=c0.op==="="? 0 : (c0.op==="<="? c0.rhs-L : L-c0.rhs); });
  return { status:limited? "feasible" : "optimal", x:best.x, obj:best.obj, slack, lhs, duals:null, reduced:null, nodes, isMIP:true, limited, relaxObj:root.obj, gap: root.obj!==0? Math.abs(root.obj-best.obj)/Math.max(1e-9,Math.abs(root.obj)) : 0 };
};
// Model → text (for showing and editing a model built from a dataset)
const lpFmtNum = (v) => { const r=+(+v).toPrecision(10); return String(r); };
const lpExprText = (coefs) => { const es=Object.entries(coefs).filter(([,a])=>a!==0); if (!es.length) return "0"; return es.map(([v,a],i)=>{ const s=a<0? "-" : "+"; const k=Math.abs(a); const t=(k===1? "" : lpFmtNum(k)+" ")+v; return i===0? (a<0? "-"+t : t) : ` ${s} ${t}`; }).join(""); };
const lpToText = (M) => { const L=[]; L.push(`${M.sense}: ${lpExprText(M.obj)}${M.objConst? ` ${M.objConst<0?"-":"+"} ${lpFmtNum(Math.abs(M.objConst))}` : ""}`); L.push("");
  M.cons.forEach(c=>L.push(`${c.name}: ${lpExprText(c.coefs)} ${c.op} ${lpFmtNum(c.rhs)}`));
  const bl=[]; M.vars.forEach(v=>{ const b=M.bounds[v]; if (!b || (M.ints.includes(v) && b.lo===0 && b.hi===1)) return; if (b.lo===-Infinity && b.hi===Infinity) bl.push(`free ${v}`); else { if (b.lo!==0) bl.push(`${v} >= ${b.lo===-Infinity? "-inf" : lpFmtNum(b.lo)}`); if (b.hi!==Infinity) bl.push(`${v} <= ${lpFmtNum(b.hi)}`); } });
  if (bl.length){ L.push(""); bl.forEach(x=>L.push(x)); }
  const bins=M.ints.filter(v=>M.bounds[v] && M.bounds[v].lo===0 && M.bounds[v].hi===1), ints=M.ints.filter(v=>!bins.includes(v));
  if (ints.length) L.push(`int ${ints.join(", ")}`); if (bins.length) L.push(`bin ${bins.join(", ")}`); return L.join("\n"); };
/* Build a model from a dataset: one decision variable per row.
   cfg = { nameCol, objCol, sense, varType:"cont"|"int"|"bin", lowerCol, upperCol, lower, upper,
           cons:[{ label, coefCol ("__count" = 1 per row), whereCol, whereVal, op, rhs }] } */
const lpFromTable = (tab, cfg) => {
  const H=tab.headers; const col=(c)=>H.indexOf(c); const num=(v)=>{ const x=parseFloat(String(v??"").replace(/[,$%\s]/g,"")); return isFinite(x)? x : NaN; };
  if (tab.rows.length>3000) return { error:`This dataset has ${tab.rows.length.toLocaleString()} rows. The in-browser solver handles up to 3,000 decisions; filter or aggregate the data first (for example with Merge & append or Formulas).` };
  const oj=col(cfg.objCol); if (oj<0) return { error:"Choose the column that holds each row's objective value (profit, cost, return…)." };
  const nj=col(cfg.nameCol); const used=new Set(); const names=tab.rows.map((r,i)=>{ let base=nj>=0? String(r[nj]??"").trim().replace(/[^A-Za-z0-9_]+/g,"_").replace(/^_+|_+$/g,"") : ""; if (!base || !/^[A-Za-z_]/.test(base)) base="x"+(base? "_"+base : String(i+1)); let v=base, k=2; while (used.has(v)) v=`${base}_${k++}`; used.add(v); return v; });
  const M={ sense:cfg.sense||"max", obj:{}, objConst:0, cons:[], bounds:{}, ints:[], vars:[] }; const skipped=[];
  tab.rows.forEach((r,i)=>{ const c=num(r[oj]); if (!isFinite(c)){ skipped.push(i+1); return; } const v=names[i]; M.vars.push(v); M.obj[v]=c;
    let lo=cfg.lowerCol? num(r[col(cfg.lowerCol)]) : (cfg.lower===""||cfg.lower==null? 0 : +cfg.lower); let hi=cfg.upperCol? num(r[col(cfg.upperCol)]) : (cfg.upper===""||cfg.upper==null? Infinity : +cfg.upper);
    if (!isFinite(lo)) lo=0; if (isNaN(hi)) hi=Infinity; if (cfg.varType==="bin"){ lo=0; hi=1; } M.bounds[v]={ lo, hi }; if (cfg.varType!=="cont") M.ints.push(v); });
  const errs=[]; (cfg.cons||[]).forEach((c,k)=>{ const rhs=+c.rhs; if (!isFinite(rhs)){ errs.push(`Constraint ${k+1}: enter a number for the limit.`); return; }
    const cj=c.coefCol==="__count"? -2 : col(c.coefCol); if (cj===-1){ errs.push(`Constraint ${k+1}: choose a column.`); return; } const wj=c.whereCol? col(c.whereCol) : -1;
    const coefs={}; tab.rows.forEach((r,i)=>{ const v=names[i]; if (!(v in M.obj)) return; if (wj>=0 && String(r[wj]??"").trim()!==String(c.whereVal??"").trim()) return; const a=cj===-2? 1 : num(r[cj]); if (isFinite(a) && a!==0) coefs[v]=a; });
    if (!Object.keys(coefs).length){ errs.push(`Constraint ${k+1} (${c.label||c.coefCol}) has no rows with a value; it was left out.`); return; }
    const nm=(c.label||`${c.coefCol==="__count"? "count" : c.coefCol}${c.whereCol? `_${c.whereVal}` : ""}`).replace(/[^A-Za-z0-9_]+/g,"_").replace(/^_+|_+$/g,"")||`C${k+1}`; let name=/^[A-Za-z_]/.test(nm)? nm : "C_"+nm; let q=2; while (M.cons.some(x=>x.name===name)) name=`${nm}_${q++}`;
    M.cons.push({ name, coefs, op:c.op, rhs }); });
  if (skipped.length) errs.push(`${skipped.length} row${skipped.length>1?"s have":" has"} no number in "${cfg.objCol}" and ${skipped.length>1?"were":"was"} left out (rows ${skipped.slice(0,8).join(", ")}${skipped.length>8?"…":""}).`);
  return { model:M, names, warn:errs };
};
const LP_STATUS = { optimal:"Optimal solution found", feasible:"Good solution found (search stopped at the time or node limit, so it may not be the best)", infeasible:"No solution satisfies all constraints (infeasible)", unbounded:"The objective can grow without limit (unbounded). A limit is missing.", iteration_limit:"Stopped at the iteration limit", no_integer_solution_found:"No whole-number solution found within the search limit", error:"Error" };
// ══════════════════════════════════════════════
// DATASET EDITOR: edit cells, add, delete, move, rename and sort rows and columns, with undo
// ══════════════════════════════════════════════
const TE_PAGE = 100;
const teBlank = (v) => v == null || String(v).trim() === "";
const teNum = (v) => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isFinite(n) && /^\s*[-+]?[\d.,]+(e[-+]?\d+)?\s*%?$/i.test(String(v ?? "")) ? n : null; };
const TE_OPS = [["blank", "is blank"], ["notblank", "is not blank"], ["eq", "equals"], ["ne", "does not equal"], ["contains", "contains"], ["gt", "is greater than"], ["lt", "is less than"], ["ge", "is at least"], ["le", "is at most"]];
const teTest = (op, v, val) => { const s = String(v ?? "").trim(), t = String(val ?? "").trim();
  switch (op) { case "blank": return teBlank(v); case "notblank": return !teBlank(v); case "eq": { const a = teNum(s), b = teNum(t); return a != null && b != null ? a === b : s.toLowerCase() === t.toLowerCase(); }
    case "ne": { const a = teNum(s), b = teNum(t); return a != null && b != null ? a !== b : s.toLowerCase() !== t.toLowerCase(); } case "contains": return s.toLowerCase().includes(t.toLowerCase());
    default: { const a = teNum(s), b = teNum(t); if (a == null || b == null) return false; return op === "gt" ? a > b : op === "lt" ? a < b : op === "ge" ? a >= b : a <= b; } } };

export { LP_STATUS, PRJ_BIG_CELLS, TE_OPS, TE_PAGE, cmbAppend, cmbGuessKeys, cmbMerge, cmbUniq, lpFromTable, lpParse, lpSolve, lpToText, prjBigKey, prjCells, prjIdb, prjLite, teBlank, teNum, teTest };
