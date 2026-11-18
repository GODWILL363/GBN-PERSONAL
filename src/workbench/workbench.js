// workbench/workbench.js — split from App.js (code unchanged; only imports and exports were added)
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useIsMobile } from "../core/fetch";
import { C, Ico } from "../core/theme";
import { CE_ERRS, FX_ALIAS, FX_COMMANDS, FX_FUNCS, ST_CMDS, ST_GROUPS, ceAddr, ceColName, ceCycleRef, ceDeps, ceErrOf, ceEval, ceScan, ceSeries, ceShift, ceShow, fxEval, fxParse, fxRowNames, fxRunAsync, fxWrapCols, pdfCleanNumber, pdfFindTables, pdfLinesAsRows, stTexTable, wbMammoth, wbOcrPage, wbPageWords, wbPdfjs, wbSheetTable, wbXlsx, wxChartPng, wxChartSvg, wxDataUrlBytes, wxSave, wxSlug, wxZip } from "../ecoscript/engine";
import { ciParseCSV } from "../impact/estimators";
import { FX_GROUPS } from "../impact/tabs";
import { btn, card, detectTimeColumn, inp, pill, sel } from "../ui/login";
import { codAllSegments, codDocsFromTable, codKappa, codKappaLabel, codRuleRe, codSuggest, codSummary, codToTable, codTopWords, offTables, prjUid, wbCsv, wbDownload, wxBlockRows, wxDocxSave, wxPdf, wxTexDoc, wxXlsxSave } from "./export";
import { PRJ_BIG_CELLS, TE_OPS, TE_PAGE, prjCells, teBlank, teNum, teTest } from "./storage";
import { DSB_CAN3D, DsbChart, WbCombine, WbOptimize, dsbModel, dsbTypeOf } from "./tools";

// ── Cell formulas: a cell or a whole column can hold an EcoScript formula starting with = (Excel style, EcoScript names).
// d.fx = { "c:<column>": "=expr" (whole column), "r:<row index>:<column>": "=expr" (one cell) }; values recalculate after every edit.
const teFmtV = (v) => typeof v === "number" ? (isFinite(v) ? String(+v.toPrecision(12)) : "") : (v ?? "");
const teEvalCol = (H, R, expr, datasets) => { const cols = Object.fromEntries(H.map((h, j) => [h, R.map(r => r[j])])); const n = R.length;
  return fxEval(fxParse(fxWrapCols(String(expr).replace(/^=\s*/, ""), H)), { cols, n, groups: [Array.from({ length: n }, (_, i) => i)], datasets: datasets || {} }); };
const teHasA1 = (f, H) => { if (/\b(ROW|COLUMN|ROWS|COLUMNS|ADDRESS|INDIRECT)\s*\(/i.test(String(f))) return true; let hit = false; ceScan(String(f).replace(/^=\s*/, ""), H, (m, tok) => { hit = true; return tok; }); return hit; };
// recalculate: column formulas first, then one-cell formulas in dependency order; cells in a loop of references show #CIRC!
const teRecalc = (H, R, fx, datasets) => { const keys = Object.keys(fx || {}); if (!keys.length) return { rows: R, errs: [] }; let rows = R.map(r => { const x = r.slice(); while (x.length < H.length) x.push(""); return x; }); const errs = [];
  const colPass = () => keys.filter(k => k.startsWith("c:")).forEach(k => { const h = k.slice(2), j = H.indexOf(h); if (j < 0) return; const f = fx[k];
    try { if (teHasA1(f, H)) { for (let i = 0; i < rows.length; i++) { try { const r = ceEval(f, H, rows, i, { fx, datasets, col: j }); rows[i][j] = ceShow(r.v, f, r.err); } catch (e) { rows[i][j] = ceErrOf(e.message); } } }
      else { const v = teEvalCol(H, rows, f, datasets); rows.forEach((r, i) => { r[j] = teFmtV(v[i]); }); } } catch (e) { errs.push(`${h}: ${e.message}`); } });
  colPass();
  const cells = keys.filter(k => k.startsWith("r:")).map(k => { const m = k.match(/^r:(\d+):(.*)$/); return m ? { k, i: +m[1], j: H.indexOf(m[2]), f: fx[k] } : null; }).filter(c => c && c.j >= 0 && c.i < rows.length);
  if (cells.length) { const at = new Map(cells.map(c => [c.i + ":" + c.j, c])); const state = new Map(), order = [], circ = new Set();
    const visit = (c, stack) => { const st = state.get(c.k); if (st === 2) return; if (st === 1) { stack.slice(stack.indexOf(c.k)).forEach(x => circ.add(x)); return; } state.set(c.k, 1); stack.push(c.k);
      ceDeps(c.f, H, rows.length).forEach(p => { const d = at.get(p); if (d) visit(d, stack); }); stack.pop(); state.set(c.k, 2); order.push(c); };
    cells.forEach(c => visit(c, []));
    order.forEach(c => { if (circ.has(c.k)) { rows[c.i][c.j] = "#CIRC!"; return; } try { const r = ceEval(c.f, H, rows, c.i, { fx, datasets, col: c.j }); rows[c.i][c.j] = ceShow(r.v, c.f, r.err); } catch (e) { rows[c.i][c.j] = ceErrOf(e.message); } });
    if (circ.size) errs.push(`circular reference in ${[...circ].slice(0, 3).map(k => { const m = k.match(/^r:(\d+):(.*)$/); return ceAddr(+m[1], H.indexOf(m[2])); }).join(", ")} (a formula that uses its own result)`);
    if (keys.some(k => k.startsWith("c:"))) colPass(); }
  return { rows, errs }; };
// Turn one row's values into column names: blanks keep the old name, duplicates get _2, _3; optional letter before names that are numbers
const teRowToNames = (H, row, prefix, all) => fxRowNames(H, row, prefix, all);
function WbTableEditor({ d, onChange, undo, redo, canUndo, canRedo, lastLabel, datasets }) {
  const H = d.headers, R = d.rows; const [page, setPage] = useState(0); const [selR, setSelR] = useState(() => new Set()); const [selC, setSelC] = useState(() => new Set());
  const [cell, setCell] = useState(null); const cellE = cell; const [draft, setDraft] = useState(""); const [q, setQ] = useState(""); const [qd, setQd] = useState(""); const [rule, setRule] = useState({ col: "", op: "blank", val: "" }); const [tool, setTool] = useState(null); const [newCol, setNewCol] = useState({ name: "", fill: "" }); const [msg, setMsg] = useState("");
  useEffect(() => { const h = setTimeout(() => setQd(q), 300); return () => clearTimeout(h); }, [q]);
  useEffect(() => { setSelR(new Set()); setSelC(new Set()); setCell(null); }, [d.id]);
  // rows shown: all, or the ones matching the search (indices into d.rows)
  const match = useMemo(() => { if (!qd.trim()) return null; const t = qd.trim().toLowerCase(); const out = []; for (let i = 0; i < R.length; i++) { const r = R[i]; for (let j = 0; j < r.length; j++) { if (r[j] != null && String(r[j]).toLowerCase().includes(t)) { out.push(i); break; } } } return out; }, [R, qd]);
  const N = match ? match.length : R.length; const pages = Math.max(1, Math.ceil(N / TE_PAGE)); const pg = Math.min(page, pages - 1); const idx = []; for (let k = pg * TE_PAGE; k < Math.min(N, (pg + 1) * TE_PAGE); k++) idx.push(match ? match[k] : k);
  const ruleHits = useMemo(() => { if (tool !== "rule" || !rule.col) return null; const j = H.indexOf(rule.col); if (j < 0) return null; let n = 0; for (const r of R) if (teTest(rule.op, r[j], rule.val)) n++; return n; }, [tool, rule, R, H]);
  const FXM = d.fx || {}; const nFx = Object.keys(FXM).length;
  // Excel-like range selection: rg = { a: anchor cell, b: other corner }, rows are indices into d.rows
  const [rg, setRg] = useState(null); const [fillTo, setFillTo] = useState(null); const drag = useRef(null); const gridRef = useRef(null); const finRef = useRef(null); const editRef = useRef(false); const [fillMode, setFillMode] = useState("rel");
  useEffect(() => { if (!cell) editRef.current = false; }, [cell]);
  useEffect(() => { setRg(null); setFillTo(null); }, [d.id]);
  useEffect(() => { const up = () => finRef.current && finRef.current(); window.addEventListener("mouseup", up); return () => window.removeEventListener("mouseup", up); }, []);
  const box = rg ? { r0: Math.min(rg.a.i, rg.b.i), r1: Math.max(rg.a.i, rg.b.i), c0: Math.min(rg.a.j, rg.b.j), c1: Math.max(rg.a.j, rg.b.j) } : null;
  const inBox = (i, j, b = box) => !!b && i >= b.r0 && i <= b.r1 && j >= b.c0 && j <= b.c1;
  // where a fill-handle drag would fill: further along rows or columns, whichever the pointer moved more
  const fillBox = (() => { if (!box || !fillTo) return null; const dn = fillTo.i > box.r1 ? fillTo.i - box.r1 : fillTo.i < box.r0 ? fillTo.i - box.r0 : 0; const dc = fillTo.j > box.c1 ? fillTo.j - box.c1 : fillTo.j < box.c0 ? fillTo.j - box.c0 : 0;
    if (!dn && !dc) return null; if (Math.abs(dn) >= Math.abs(dc)) return dn > 0 ? { ...box, r1: fillTo.i, dir: "down", k: dn } : { ...box, r0: fillTo.i, dir: "up", k: -dn }; return dc > 0 ? { ...box, c1: fillTo.j, dir: "right", k: dc } : { ...box, c0: fillTo.j, dir: "left", k: -dc }; })();
  const selCell = (i, j, extend) => { setRg(g => extend && g ? { a: g.a, b: { i, j } } : { a: { i, j }, b: { i, j } }); const p = match ? match.indexOf(i) : i; if (p >= 0) setPage(Math.floor(p / TE_PAGE)); };
  // fill (drag handle, Ctrl+D, Ctrl+R): formulas copy with their A1 references shifted, values continue as a series (copy instead when copy=true)
  const doFill = (src, dir, k, copy) => { if (k <= 0) return; const rows = R.map(r => r.slice()); const fx = { ...FXM }; const vert = dir === "down" || dir === "up"; let skipped = 0;
    const lines = vert ? [src.c0, src.c1] : [src.r0, src.r1]; const len = vert ? src.r1 - src.r0 + 1 : src.c1 - src.c0 + 1;
    for (let L = lines[0]; L <= lines[1]; L++) { const at = (q) => vert ? { i: src.r0 + q, j: L } : { i: L, j: src.c0 + q };
      const srcCells = Array.from({ length: len }, (_, q) => at(q)); if (dir === "up" || dir === "left") srcCells.reverse();
      const anyF = srcCells.some(c => fx[`r:${c.i}:${H[c.j]}`]); const ser = anyF ? null : ceSeries(srcCells.map(c => (R[c.i] || [])[c.j] ?? ""), k, copy);
      for (let t = 0; t < k; t++) { const last = srcCells[len - 1]; const step = t + 1; const tc = vert ? { i: last.i + (dir === "down" ? step : -step), j: L } : { i: L, j: last.j + (dir === "right" ? step : -step) };
        if (tc.i < 0 || tc.j < 0 || tc.j >= H.length) continue; while (tc.i >= rows.length) rows.push(H.map(() => ""));
        if (fx[`c:${H[tc.j]}`]) { skipped++; continue; } const key = `r:${tc.i}:${H[tc.j]}`; delete fx[key];
        if (anyF && fillMode !== "val") { const s0 = srcCells[t % len]; const f = fx[`r:${s0.i}:${H[s0.j]}`]; if (f) fx[key] = fillMode === "abs" ? f : ceShift(f, tc.i - s0.i, tc.j - s0.j, H); else rows[tc.i][tc.j] = (R[s0.i] || [])[s0.j] ?? ""; }
        else if (anyF) { const s0 = srcCells[t % len]; rows[tc.i][tc.j] = (R[s0.i] || [])[s0.j] ?? ""; }
        else rows[tc.i][tc.j] = ser[t]; } }
    const dest = vert ? { r0: dir === "down" ? src.r0 : src.r0 - k, r1: dir === "down" ? src.r1 + k : src.r1, c0: src.c0, c1: src.c1 } : { r0: src.r0, r1: src.r1, c0: dir === "right" ? src.c0 : src.c0 - k, c1: dir === "right" ? src.c1 + k : src.c1 };
    const d0 = { r0: Math.max(0, dest.r0), r1: dest.r1, c0: Math.max(0, dest.c0), c1: Math.min(H.length - 1, dest.c1) };
    put(H, rows, `Filled ${dir} ${ceAddr(d0.r0, d0.c0)}:${ceAddr(d0.r1, d0.c1)}${copy ? " (copied)" : ""}${fillMode === "abs" ? " · formulas kept exactly (absolute)" : fillMode === "val" ? " · values only" : ""}${skipped ? ` · ${skipped} cells skipped because their column has a whole-column formula` : ""}`, fx); setRg({ a: { i: d0.r0, j: d0.c0 }, b: { i: d0.r1, j: d0.c1 } }); };
  const fillHint = (() => { if (!fillBox || !box) return ""; const t = fillTo; const vert = fillBox.dir === "down" || fillBox.dir === "up"; const len = vert ? box.r1 - box.r0 + 1 : box.c1 - box.c0 + 1; const step = vert ? Math.abs(t.i - (fillBox.dir === "down" ? box.r1 : box.r0)) : Math.abs(t.j - (fillBox.dir === "right" ? box.c1 : box.c0));
      const tc = vert ? { i: t.i, j: Math.min(Math.max(t.j, box.c0), box.c1) } : { i: Math.min(Math.max(t.i, box.r0), box.r1), j: t.j }; const q = (step - 1) % len; const s0 = vert ? { i: fillBox.dir === "down" ? box.r0 + q : box.r1 - q, j: tc.j } : { i: tc.i, j: fillBox.dir === "right" ? box.c0 + q : box.c1 - q };
      const f = FXM[`r:${s0.i}:${H[s0.j]}`]; if (!f || fillMode === "val") return `${ceAddr(tc.i, tc.j)} · fill ${fillBox.dir} ${fillBox.k} cell${fillBox.k === 1 ? "" : "s"}`; return `${ceAddr(tc.i, tc.j)} will be ${fillMode === "abs" ? f : ceShift(f, tc.i - s0.i, tc.j - s0.j, H)}`; })();
  finRef.current = () => { const m = drag.current; drag.current = null; if (m && m.mode === "fill" && fillBox) doFill(box, fillBox.dir, fillBox.k, !!m.copy); setFillTo(null); };
  const rangeTSV = () => { if (!box) return ""; const out = []; for (let i = box.r0; i <= box.r1; i++) { const r = R[i] || []; const line = []; for (let j = box.c0; j <= box.c1; j++) line.push(String(r[j] ?? "")); out.push(line.join("\t")); } return out.join("\n"); };
  const clearRange = () => { if (!box) return; const rows = R.slice(); const fx = { ...FXM }; let n = 0; for (let i = box.r0; i <= box.r1; i++) { const r = rows[i].slice(); for (let j = box.c0; j <= box.c1; j++) { if (fx[`c:${H[j]}`]) continue; delete fx[`r:${i}:${H[j]}`]; r[j] = ""; n++; } rows[i] = r; }
    put(H, rows, `Cleared ${n.toLocaleString()} cell${n === 1 ? "" : "s"} in ${ceAddr(box.r0, box.c0)}:${ceAddr(box.r1, box.c1)}`, fx); };
  const onGridPaste = (e) => { if (!rg || cell || (e.target && e.target.tagName === "INPUT")) return; const txt = (e.clipboardData || window.clipboardData).getData("text"); if (!txt) return; e.preventDefault();
    const lines = txt.replace(/\r/g, "").replace(/\n$/, "").split("\n").map(l => l.split("\t")); const rows = R.slice(); const fx = { ...FXM }; const a = { i: box.r0, j: box.c0 }; let n = 0;
    lines.forEach((vals, di) => { const i = a.i + di; while (i >= rows.length) rows.push(H.map(() => "")); const r = rows[i].slice(); while (r.length < H.length) r.push(""); vals.forEach((v, dj) => { const j = a.j + dj; if (j >= H.length || fx[`c:${H[j]}`]) return; const key = `r:${i}:${H[j]}`; delete fx[key]; if (/^=\s*\S/.test(v) && !/^==/.test(v)) fx[key] = v.trim(); else r[j] = v; n++; }); rows[i] = r; });
    put(H, rows, `Pasted ${n.toLocaleString()} cell${n === 1 ? "" : "s"} at ${ceAddr(a.i, a.j)}`, fx); setRg({ a, b: { i: a.i + lines.length - 1, j: Math.min(H.length - 1, a.j + Math.max(...lines.map(l => l.length)) - 1) } }); };
  const gridKey = (e) => { if (e.target && e.target.tagName === "INPUT") return; if (cell || editRef.current) { if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setDraft(x => x + e.key); } return; } const ctl = e.ctrlKey || e.metaKey; const k = e.key;
    if (ctl && (k === "a" || k === "A")) { e.preventDefault(); if (H.length && R.length) setRg({ a: { i: 0, j: 0 }, b: { i: R.length - 1, j: H.length - 1 } }); return; }
    if (!rg) { if (/^Arrow/.test(k) && idx.length && H.length) { e.preventDefault(); selCell(idx[0], 0); } return; }
    if (ctl && (k === "c" || k === "C")) { e.preventDefault(); wbCopy(rangeTSV()).then(ok => setMsg(ok ? `Copied ${ceAddr(box.r0, box.c0)}:${ceAddr(box.r1, box.c1)}` : "Copy blocked by the browser. Select the text and copy it yourself.")); return; }
    if (ctl && (k === "d" || k === "D")) { e.preventDefault(); if (match) { setMsg("Clear the search first: filling needs the rows in order."); return; } if (box.r1 > box.r0) doFill({ ...box, r1: box.r0 }, "down", box.r1 - box.r0, true); return; }
    if (ctl && (k === "r" || k === "R")) { e.preventDefault(); if (box.c1 > box.c0) doFill({ ...box, c1: box.c0 }, "right", box.c1 - box.c0, true); return; }
    if (ctl) return;
    const mv = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Tab: [0, e.shiftKey ? -1 : 1] }[k];
    if (mv) { e.preventDefault(); const from = e.shiftKey && k !== "Tab" ? rg.b : rg.a; let i = from.i; if (mv[0]) { const order = match || null; if (order) { const p = order.indexOf(i) + mv[0]; if (p >= 0 && p < order.length) i = order[p]; } else i = Math.max(0, Math.min(R.length - 1, i + mv[0])); }
      const j = Math.max(0, Math.min(H.length - 1, from.j + mv[1])); selCell(i, j, e.shiftKey && k !== "Tab"); return; }
    if (k === "Enter" || k === "F2") { e.preventDefault(); startEdit(rg.a.i, rg.a.j); return; }
    if (k === "Delete" || k === "Backspace") { e.preventDefault(); clearRange(); return; }
    if (k === "Escape") { setFillTo(null); drag.current = null; return; }
    if (k.length === 1 && !e.altKey) { e.preventDefault(); startEdit(rg.a.i, rg.a.j, k); } };
  const cellDown = (e, i, j) => { if (e.button !== 0 || (cell && cell.i === i && cell.j === j)) return; if (e.target && e.target.tagName === "INPUT") return; e.preventDefault(); if (cell) commit(); drag.current = { mode: "sel" }; selCell(i, j, e.shiftKey); if (gridRef.current) gridRef.current.focus({ preventScroll: true }); };
  const cellEnter = (i, j) => { const m = drag.current; if (!m) return; if (m.mode === "sel") setRg(g => g ? { a: g.a, b: { i, j } } : g); else if (m.mode === "fill") setFillTo({ i, j }); else if (m.mode === "col") setRg(g => g ? { a: g.a, b: { i: R.length - 1, j } } : g); else if (m.mode === "row") setRg(g => g ? { a: g.a, b: { i, j: H.length - 1 } } : g); };
  const colDown = (e, j) => { if (e.button !== 0 || !R.length) return; e.preventDefault(); drag.current = { mode: "col" }; setRg(g => e.shiftKey && g ? { a: { i: 0, j: g.a.j }, b: { i: R.length - 1, j } } : { a: { i: 0, j }, b: { i: R.length - 1, j } }); if (gridRef.current) gridRef.current.focus({ preventScroll: true }); };
  const rowDown = (e, i) => { if (e.button !== 0 || !H.length) return; e.preventDefault(); drag.current = { mode: "row" }; setRg(g => e.shiftKey && g ? { a: { i: g.a.i, j: 0 }, b: { i, j: H.length - 1 } } : { a: { i, j: 0 }, b: { i, j: H.length - 1 } }); if (gridRef.current) gridRef.current.focus({ preventScroll: true }); };
  const fillDown2 = (e) => { e.preventDefault(); e.stopPropagation(); if (match) { setMsg("Clear the search first: filling needs the rows in order."); return; } drag.current = { mode: "fill", copy: e.ctrlKey || e.metaKey }; setFillTo(null); };
  // rowsMoved: rows were deleted, inserted or reordered, so one-cell formulas (stored by row number) are turned into plain values
  const put = (headers, rows, label, fxIn, rowsMoved) => { let fx = fxIn !== undefined ? fxIn : FXM; if (rowsMoved && Object.keys(fx).some(k => k.startsWith("r:"))) { fx = Object.fromEntries(Object.entries(fx).filter(([k]) => !k.startsWith("r:"))); label += " (one-cell formulas kept their values)"; }
    fx = Object.fromEntries(Object.entries(fx).filter(([k]) => headers.includes(k.startsWith("c:") ? k.slice(2) : k.replace(/^r:\d+:/, ""))));
    if (Object.keys(fx).length && rows.length * headers.length <= 3e6) { const rc = teRecalc(headers, rows, fx, datasets); rows = rc.rows; if (rc.errs.length) label += ` · formula problem: ${rc.errs[0]}`; }
    onChange({ headers, rows, fx }, label); setSelR(new Set()); setSelC(new Set()); setCell(null); setMsg(label); setTimeout(() => setMsg(m => m === label ? "" : m), 4000); };
  const renFx = (from, to) => Object.fromEntries(Object.entries(FXM).map(([k, v]) => [k === "c:" + from ? "c:" + to : k.replace(new RegExp("^(r:\\d+:)" + from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"), "$1" + to), v]));
  const tryFx = (f, i = 0, j = 0) => { try { if (teHasA1(f, H)) { ceEval(f, H, R, Math.max(0, i), { fx: FXM, datasets, col: j }); return null; } teEvalCol(H, R, f, datasets); return null; } catch (e) { return CE_ERRS.includes(e.message) ? null : e.message; } };
  const commit = () => { if (!cell) return; const { i, j } = cell; if (i >= 0 && /^=\s*\S/.test(draft) && !/^==/.test(draft)) { const er = tryFx(draft, i, j); if (er) { setMsg(`Formula: ${er}`); return; } const k = `r:${i}:${H[j]}`; if (FXM[k] === draft.trim() || FXM[`c:${H[j]}`] === draft.trim()) { setCell(null); return; } put(H, R, `Formula in ${H[j]}, row ${i + 1}: ${draft.trim()}`, { ...FXM, [k]: draft.trim() }); return; }
    if (i >= 0 && (FXM[`r:${i}:${H[j]}`] || FXM[`c:${H[j]}`])) { const f2 = { ...FXM }; delete f2[`r:${i}:${H[j]}`]; const colF = !!f2[`c:${H[j]}`]; if (colF) delete f2[`c:${H[j]}`]; const rows = R.slice(); const row = rows[i].slice(); row[j] = draft; rows[i] = row; put(H, rows, `Edited ${H[j]} in row ${i + 1}${colF ? `; the column formula of ${H[j]} was removed (its other values stay)` : " (formula removed)"}`, f2); return; }
    if (i === -1) { const name = draft.trim(); if (!name) { setCell(null); return; } if (H.some((h, k) => k !== j && h === name)) { setMsg(`There is already a column called "${name}".`); return; } if (name !== H[j]) put(H.map((h, k) => k === j ? name : h), R, `Renamed column "${H[j]}" to "${name}"`, renFx(H[j], name)); else setCell(null); return; }
    if (String(R[i][j] ?? "") === draft) { setCell(null); return; } const rows = R.slice(); const row = rows[i].slice(); while (row.length < H.length) row.push(""); row[j] = draft; rows[i] = row; put(H, rows, `Edited ${H[j]} in row ${i + 1}`); };
  const startEdit = (i, j, init) => { editRef.current = true; setCell({ i, j }); if (i >= 0) setRg(g => g && g.a.i === i && g.a.j === j ? g : { a: { i, j }, b: { i, j } }); setDraft(init != null ? init : i === -1 ? H[j] : FXM[`r:${i}:${H[j]}`] || FXM[`c:${H[j]}`] || String((R[i] || [])[j] ?? "")); };
  const keyNav = (e) => { if (e.key === "F4" && cell && cell.i >= 0) { e.preventDefault(); const t = e.target; const r = ceCycleRef(draft, t.selectionStart ?? draft.length, H); if (r) { setDraft(r.text); setTimeout(() => { try { t.setSelectionRange(r.caret, r.caret); } catch (x) { } }, 0); } return; }
    if (e.key === "Enter") { e.preventDefault(); const c0 = cell; commit(); if (c0 && c0.i >= 0) { const order = match || null; let ni = c0.i; if (order) { const p = order.indexOf(c0.i) + (e.shiftKey ? -1 : 1); if (p >= 0 && p < order.length) ni = order[p]; } else ni = Math.max(0, Math.min(R.length - 1, c0.i + (e.shiftKey ? -1 : 1))); selCell(ni, c0.j); if (gridRef.current) gridRef.current.focus({ preventScroll: true }); } } else if (e.key === "Escape") { e.stopPropagation(); setCell(null); if (cell && cell.i >= 0 && gridRef.current) gridRef.current.focus({ preventScroll: true }); } else if (e.key === "Tab" && cell && cell.i >= 0) { e.preventDefault(); commit(); const j = cell.j + (e.shiftKey ? -1 : 1); if (j >= 0 && j < H.length) { const row = R[cell.i] || []; setTimeout(() => startEdit(cell.i, j, String(row[j] ?? "")), 0); } } };
  const delRows = (set, label) => { const rows = R.filter((_, i) => !set.has(i)); put(H, rows, label || `Deleted ${set.size.toLocaleString()} row${set.size > 1 ? "s" : ""}`, undefined, true); };
  const keepRows = (set) => put(H, R.filter((_, i) => set.has(i)), `Kept ${set.size.toLocaleString()} selected rows, deleted ${(R.length - set.size).toLocaleString()}`, undefined, true);
  const delCols = (set) => { const keep = H.map((_, j) => j).filter(j => !set.has(j)); put(keep.map(j => H[j]), R.map(r => keep.map(j => r[j])), `Deleted column${set.size > 1 ? "s" : ""} ${[...set].map(j => `"${H[j]}"`).join(", ")}`); };
  const keepCols = (set) => { const keep = H.map((_, j) => j).filter(j => set.has(j)); put(keep.map(j => H[j]), R.map(r => keep.map(j => r[j])), `Kept ${keep.length} selected columns`); };
  const moveCol = (j, dlt) => { const k = j + dlt; if (k < 0 || k >= H.length) return; const ord = H.map((_, x) => x); [ord[j], ord[k]] = [ord[k], ord[j]]; put(ord.map(x => H[x]), R.map(r => ord.map(x => r[x])), `Moved column "${H[j]}" ${dlt < 0 ? "left" : "right"}`); };
  const sortBy = (j, dir) => { const rows = R.slice().sort((a, b) => { const x = a[j], y = b[j]; if (teBlank(x) && teBlank(y)) return 0; if (teBlank(x)) return 1; if (teBlank(y)) return -1; const p = teNum(x), r = teNum(y); return (p != null && r != null ? p - r : String(x).localeCompare(String(y), undefined, { numeric: true })) * dir; }); put(H, rows, `Sorted by "${H[j]}" ${dir > 0 ? "smallest first" : "largest first"}`, undefined, true); };
  const addRow = () => { const rows = [...R, H.map(() => "")]; put(H, rows, "Added a row at the end"); setQ(""); setQd(""); setPage(Math.floor((rows.length - 1) / TE_PAGE)); setTimeout(() => startEdit(rows.length - 1, 0, ""), 30); };
  const insertRow = (i) => { const rows = R.slice(); rows.splice(i + 1, 0, H.map(() => "")); put(H, rows, `Inserted a row after row ${i + 1}`, undefined, true); setTimeout(() => startEdit(i + 1, 0, ""), 30); };
  const addCol = () => { const name = newCol.name.trim(); if (!name) return; if (H.includes(name)) { setMsg(`There is already a column called "${name}".`); return; } const isF = /^=\s*\S/.test(newCol.fill.trim());
    if (isF) { const er = tryFx(newCol.fill.trim()); if (er) { setMsg(`Formula: ${er}`); return; } }
    put([...H, name], R.map(r => { const x = r.slice(); while (x.length < H.length) x.push(""); x.push(isF ? "" : newCol.fill); return x; }), isF ? `Added column "${name}" = ${newCol.fill.trim().replace(/^=\s*/, "")}` : `Added column "${name}"`, isF ? { ...FXM, ["c:" + name]: newCol.fill.trim() } : undefined); setNewCol({ name: "", fill: "" }); setTool(null); };
  // formula bar: apply the selected cell's formula to every row of its column (fill down), or turn formulas into plain values
  const fillDown = () => { const cell = cellE && cellE.i >= 0 ? cellE : rg ? rg.a : null; if (!cell) return; const f = cellE && /^=\s*\S/.test(draft) ? draft.trim() : FXM[`r:${cell.i}:${H[cell.j]}`]; if (!f) { setMsg("Type a formula starting with = first, for example  =gdp / pop"); return; } const er = tryFx(f, cell.i, cell.j); if (er) { setMsg(`Formula: ${er}`); return; }
    const f2 = Object.fromEntries(Object.entries(FXM).filter(([k]) => !k.endsWith(":" + H[cell.j]) || !k.startsWith("r:")));
    // a formula with cell references such as =B2*C2 is copied row by row with the references shifted, as Excel's fill does
    if (teHasA1(f, H) && fillMode !== "abs") { if (R.length > 20000) { setMsg("Formula: cell-reference formulas fill up to 20,000 rows. Use column names instead, for example =gdp / pop"); return; } delete f2["c:" + H[cell.j]]; R.forEach((_, i) => { f2[`r:${i}:${H[cell.j]}`] = ceShift(f, i - cell.i, 0, H); }); put(H, R, `Filled ${H[cell.j]} with ${f.replace(/^=\s*/, "")} (cell references shifted row by row) for all ${R.length.toLocaleString()} rows`, f2); return; }
    f2["c:" + H[cell.j]] = f; put(H, R, `Column ${H[cell.j]} = ${f.replace(/^=\s*/, "")} for all ${R.length.toLocaleString()} rows`, f2); };
  const freezeFx = () => put(H, R, `Turned ${nFx} formula${nFx === 1 ? "" : "s"} into plain values`, {});
  const dedupe = () => { const seen = new Set(); const rows = R.filter(r => { const k = JSON.stringify(r); if (seen.has(k)) return false; seen.add(k); return true; }); put(H, rows, `Removed ${(R.length - rows.length).toLocaleString()} duplicate rows`, undefined, rows.length !== R.length); };
  const [hdr, setHdr] = useState({ row: 1, prefix: "", all: false });
  const hdrRow = R[Math.max(0, Math.min(R.length - 1, (+hdr.row || 1) - 1))] || []; const hdrNumeric = hdrRow.filter(v => /^[-+]?\d/.test(String(v ?? "").trim())).length;
  const applyHeaders = () => { const i = Math.round(+hdr.row || 1) - 1; if (i < 0 || i >= R.length) { setMsg(`Row ${hdr.row} does not exist.`); return; } const names = teRowToNames(H, R[i], hdr.prefix.trim(), hdr.all); put(names, R.filter((_, k) => k !== i), `Row ${i + 1} is now the column names (${names.slice(0, 4).join(", ")}${names.length > 4 ? "…" : ""}) and was removed from the data`, {}, true); setTool(null); };
  const dropBlank = () => { const rows = R.filter(r => H.every((_, j) => !teBlank(r[j]))); put(H, rows, `Removed ${(R.length - rows.length).toLocaleString()} rows with a blank cell`, undefined, rows.length !== R.length); };
  const pageAll = idx.length > 0 && idx.every(i => selR.has(i)); const huge = R.length > 200000;
  const cellSt = { ...wbCell, maxWidth: 220, padding: "4px 8px", cursor: "text" };
  return <WbMax label={`Dataset: ${d.name || "table"}`}>{(big) => <div>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
      <button type="button" style={wbSmallBtn()} onClick={undo} disabled={!canUndo} title={canUndo ? `Undo: ${lastLabel}` : "Nothing to undo"}>↶ Undo</button>
      <button type="button" style={wbSmallBtn()} onClick={redo} disabled={!canRedo}>↷ Redo</button>
      <span style={{ width: 1, height: 18, background: C.border }} />
      <button type="button" style={wbSmallBtn(C.teal)} onClick={addRow}>+ Row</button>
      <button type="button" style={wbSmallBtn(C.teal)} aria-expanded={tool === "col"} onClick={() => setTool(t => t === "col" ? null : "col")}>+ Column</button>
      <button type="button" style={wbSmallBtn()} aria-expanded={tool === "rule"} onClick={() => setTool(t => t === "rule" ? null : "rule")}>Delete rows where…</button>
      <button type="button" style={wbSmallBtn()} onClick={dedupe}>Remove duplicate rows</button>
      <button type="button" style={wbSmallBtn()} onClick={dropBlank}>Remove rows with blanks</button>
      <button type="button" style={wbSmallBtn()} aria-expanded={tool === "hdr"} onClick={() => { setTool(t => t === "hdr" ? null : "hdr"); setHdr(h => ({ ...h, prefix: "" })); }} title="Use the values in a row (usually the first) as the column names">Row → column names</button>
      <input aria-label="Search rows" value={q} onChange={e => { setQ(e.target.value); setPage(0); }} placeholder={`Search ${R.length.toLocaleString()} rows`} style={{ ...inp, width: 200, padding: "5px 9px", fontSize: 12, marginLeft: "auto" }} />
    </div>
    {tool === "hdr" && <div style={{ ...card, padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: C.text }}>
        Use row <input aria-label="Header row number" type="number" min={1} value={hdr.row} onChange={e => setHdr(h => ({ ...h, row: e.target.value }))} style={{ ...inp, width: 64, padding: "5px 8px", fontSize: 12 }} /> as the column names, and remove it from the data. Cells that are empty or hold only "-", "NA" or "." keep the current name.
        <label style={{ display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" aria-label="Put a letter before names that are numbers" checked={!!hdr.prefix} onChange={e => setHdr(h => ({ ...h, prefix: e.target.checked ? "y" : "" }))} />Put a letter before names that are numbers</label>
        {hdr.prefix && <input aria-label="Letter to put before numbers" value={hdr.prefix} onChange={e => setHdr(h => ({ ...h, prefix: e.target.value }))} style={{ ...inp, width: 50, padding: "5px 8px", fontSize: 12 }} />}
        <label style={{ display: "flex", gap: 5, alignItems: "center" }} title="Off: only columns with generic names (col3, Column 5, Unnamed: 2) are renamed, and cells like - or NA are ignored"><input type="checkbox" aria-label="Rename every column" checked={!!hdr.all} onChange={e => setHdr(h => ({ ...h, all: e.target.checked }))} />Rename every column, including ones that already have a name</label>
        <button type="button" style={btn()} onClick={applyHeaders}>Use as column names</button></div>
      <div style={{ fontSize: 11.5, color: C.mid, marginTop: 6 }}>New names: <code>{teRowToNames(H, hdrRow, hdr.prefix.trim(), hdr.all).slice(0, 12).join(", ")}{H.length > 12 ? ", …" : ""}</code></div>
      {hdrNumeric > 1 && !hdr.prefix && <div style={{ fontSize: 11.5, color: C.orange, marginTop: 4 }}>These names are numbers (like 2013). In EcoScript write them in square brackets, [2013], because a bare 2013 means the number. Or tick the box to get names like y2013.</div>}
    </div>}
    {tool === "col" && <div style={{ ...card, padding: "10px 12px", marginBottom: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input aria-label="New column name" value={newCol.name} onChange={e => setNewCol(c => ({ ...c, name: e.target.value }))} placeholder="Column name" style={{ ...inp, width: 180, padding: "6px 9px", fontSize: 12 }} onKeyDown={e => { if (e.key === "Enter") addCol(); }} />
      <input aria-label="Fill new column with" value={newCol.fill} onChange={e => setNewCol(c => ({ ...c, fill: e.target.value }))} placeholder="Fill with a value, or =formula" style={{ ...inp, width: 220, padding: "6px 9px", fontSize: 12 }} onKeyDown={e => { if (e.key === "Enter") addCol(); }} />
      <button type="button" style={btn()} disabled={!newCol.name.trim()} onClick={addCol}>Add column</button><span style={{ ...wbNote, fontSize: 11.5 }}>Start with = to calculate it from other columns, for example <code>=gdp / pop</code> or <code>=if(growth &lt; 0, "recession", "growth")</code>. It recalculates when you edit the table.</span></div>}
    {tool === "rule" && <div style={{ ...card, padding: "10px 12px", marginBottom: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ fontSize: 12, color: C.text }}>Rows where</span>
      <select aria-label="Rule column" value={rule.col} onChange={e => setRule(r => ({ ...r, col: e.target.value }))} style={{ ...sel, width: "auto", padding: "6px 9px", fontSize: 12 }}><option value="">column…</option>{H.map(h => <option key={h} value={h}>{h}</option>)}</select>
      <select aria-label="Rule test" value={rule.op} onChange={e => setRule(r => ({ ...r, op: e.target.value }))} style={{ ...sel, width: "auto", padding: "6px 9px", fontSize: 12 }}>{TE_OPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {!["blank", "notblank"].includes(rule.op) && <input aria-label="Rule value" value={rule.val} onChange={e => setRule(r => ({ ...r, val: e.target.value }))} placeholder="value" style={{ ...inp, width: 140, padding: "6px 9px", fontSize: 12 }} />}
      {ruleHits != null && <span style={{ fontSize: 12, color: C.mid }}>{ruleHits.toLocaleString()} of {R.length.toLocaleString()} rows match</span>}
      <button type="button" style={wbSmallBtn(C.red)} disabled={!ruleHits} onClick={() => { const j = H.indexOf(rule.col); const set = new Set(); R.forEach((r, i) => { if (teTest(rule.op, r[j], rule.val)) set.add(i); }); delRows(set, `Deleted ${set.size.toLocaleString()} rows where ${rule.col} ${(TE_OPS.find(o => o[0] === rule.op) || [])[1]}${["blank", "notblank"].includes(rule.op) ? "" : " " + rule.val}`); setTool(null); }}>Delete matching rows</button>
      <button type="button" style={wbSmallBtn()} disabled={!ruleHits} onClick={() => { const j = H.indexOf(rule.col); const set = new Set(); R.forEach((r, i) => { if (teTest(rule.op, r[j], rule.val)) set.add(i); }); keepRows(set); setTool(null); }}>Keep only matching rows</button></div>}
    {(selR.size > 0 || selC.size > 0) && <div role="toolbar" aria-label="Selection" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8, padding: "6px 10px", borderRadius: 6, background: `${C.gold}14`, border: `1px solid ${C.gold}55` }}>
      {selR.size > 0 && <><span style={{ fontSize: 12, color: C.text }}>{selR.size.toLocaleString()} row{selR.size > 1 ? "s" : ""} selected</span>
        <button type="button" style={wbSmallBtn(C.red)} onClick={() => delRows(selR)}>Delete rows</button><button type="button" style={wbSmallBtn()} onClick={() => keepRows(selR)}>Keep only these rows</button>
        {match && selR.size < match.length && <button type="button" style={wbSmallBtn()} onClick={() => setSelR(new Set(match))}>Select all {match.length.toLocaleString()} search results</button>}</>}
      {selC.size > 0 && <><span style={{ fontSize: 12, color: C.text, marginLeft: selR.size ? 10 : 0 }}>{selC.size} column{selC.size > 1 ? "s" : ""} selected</span>
        <button type="button" style={wbSmallBtn(C.red)} disabled={selC.size >= H.length} onClick={() => delCols(selC)}>Delete columns</button><button type="button" style={wbSmallBtn()} onClick={() => keepCols(selC)}>Keep only these columns</button></>}
      <button type="button" style={wbSmallBtn()} onClick={() => { setSelR(new Set()); setSelC(new Set()); }}>Clear selection</button></div>}
    <div role="group" aria-label="Formula bar" style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 6px", background: C.card }}>
      <span style={{ fontFamily: C.code, fontStyle: "italic", fontWeight: 700, color: C.gold, padding: "0 4px" }} aria-hidden="true">fx</span>
      <span style={{ fontSize: 11.5, color: C.mid, minWidth: 90, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cell && cell.i >= 0 ? `${ceAddr(cell.i, cell.j)} · ${H[cell.j]}` : cell ? `column name` : box ? (box.r0 === box.r1 && box.c0 === box.c1 ? `${ceAddr(box.r0, box.c0)} · ${H[box.c0]}` : `${ceAddr(box.r0, box.c0)}:${ceAddr(box.r1, box.c1)} · ${((box.r1 - box.r0 + 1) * (box.c1 - box.c0 + 1)).toLocaleString()} cells`) : "no cell"}</span>
      {cell && cell.i >= 0 && /^=/.test(draft) && <span style={{ fontSize: 10.5, color: C.dim, whiteSpace: "nowrap" }} title="F4 cycles the reference at the cursor: A1 → $A$1 → A$1 → $A1">F4: $</span>}
      <input aria-label="Formula or value of the selected cell" value={cell ? draft : rg && R[rg.a.i] ? (FXM[`r:${rg.a.i}:${H[rg.a.j]}`] || FXM[`c:${H[rg.a.j]}`] || String(R[rg.a.i][rg.a.j] ?? "")) : ""} disabled={!cell && !rg} onFocus={() => { if (!cell && rg) startEdit(rg.a.i, rg.a.j); }} onChange={e => setDraft(e.target.value)} onKeyDown={keyNav} onBlur={e => { const t = e.relatedTarget; if (t && (t === gridRef.current || (t.closest && t.closest('[aria-label="Formula bar"]')) || /^Edit row /.test(t.getAttribute("aria-label") || ""))) return; if (cell) commit(); }} placeholder="Click a cell, then type a value or a formula such as  =gdp / pop * 100  or  =B2*C2  or  =SUM(B2:B10)" style={{ ...inp, flex: 1, minWidth: 120, padding: "4px 8px", fontSize: 12.5, fontFamily: C.code, border: "none", background: "transparent" }} />
      {cell && cell.i >= 0 && <button type="button" style={wbSmallBtn(C.teal)} onMouseDown={e => e.preventDefault()} onClick={commit}>Enter</button>}
      {((cell && cell.i >= 0) || (!cell && rg && rg.a.i === rg.b.i && rg.a.j === rg.b.j && FXM[`r:${rg.a.i}:${H[rg.a.j]}`])) && <button type="button" style={wbSmallBtn()} onMouseDown={e => e.preventDefault()} onClick={fillDown} title="Use this formula for every row of the column (like dragging the fill handle in Excel)">Fill whole column ↓</button>}
      <select aria-label="Fill mode" value={fillMode} onChange={e => setFillMode(e.target.value)} title="How formulas fill when you drag the small square or use Fill whole column. Relative shifts cell references like Excel; $ in a reference keeps that part fixed (press F4 while editing to add $)." style={{ ...inp, width: "auto", padding: "3px 6px", fontSize: 11.5 }}>
        <option value="rel">Fill: relative (like Excel)</option><option value="abs">Fill: absolute (same formula)</option><option value="val">Fill: values only</option></select>
      {nFx > 0 && <button type="button" style={wbSmallBtn()} onClick={freezeFx} title="Keep the current results as plain values and stop recalculating">Formulas → values ({nFx})</button>}
    </div>
    {fillHint && <div aria-live="polite" style={{ fontSize: 12, color: C.teal, marginBottom: 4, fontFamily: C.code }}>{fillHint}</div>}
    {msg && <div role="status" style={{ fontSize: 12, color: /^Formula:|formula problem/.test(msg) ? C.red : C.teal, marginBottom: 6 }}>{msg}{canUndo && !/^Formula:/.test(msg) ? " · Undo reverses it." : ""}</div>}
    <div ref={gridRef} tabIndex={0} role="grid" aria-label="Data grid: click or drag to select, drag the small square to fill, Ctrl+C / Ctrl+V to copy and paste" aria-multiselectable="true" onKeyDown={gridKey} onPaste={onGridPaste} onMouseLeave={() => { if (drag.current && drag.current.mode === "fill") setFillTo(f => f); }} style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: "auto", maxHeight: big ? "calc(100vh - 230px)" : 480, background: C.card, outline: "none", userSelect: drag.current ? "none" : undefined }}>
      <table style={{ borderCollapse: "collapse", fontFamily: C.font, fontSize: 12 }}>
        <thead><tr>
          <th style={{ ...wbCell, position: "sticky", top: 0, left: 0, zIndex: 3, background: C.raised, minWidth: 64 }}><label style={{ display: "flex", gap: 4, alignItems: "center", fontWeight: 500, color: C.mid }}><input type="checkbox" aria-label="Select rows on this page" checked={pageAll} onChange={e => setSelR(s => { const n = new Set(s); idx.forEach(i => e.target.checked ? n.add(i) : n.delete(i)); return n; })} />row</label></th>
          {H.map((h, j) => <th key={j} scope="col" style={{ ...wbCell, position: "sticky", top: 0, zIndex: 2, background: selC.has(j) ? `${C.gold}33` : C.raised, fontWeight: 600, textAlign: "left", maxWidth: "none", whiteSpace: "nowrap", padding: "4px 6px" }}>
            <div role="button" tabIndex={-1} aria-label={`Select column ${ceColName(j)} (${h})`} title={`Column ${ceColName(j)}: click to select it, drag across to select several`} onMouseDown={e => colDown(e, j)} onMouseEnter={() => cellEnter(drag.current && drag.current.mode === "col" ? 0 : -1, j)} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 700, color: box && j >= box.c0 && j <= box.c1 ? C.text : C.dim, background: box && j >= box.c0 && j <= box.c1 ? `${C.teal}26` : "transparent", borderRadius: 3, margin: "-2px -2px 3px", padding: "1px 0", cursor: "s-resize", userSelect: "none", fontFamily: C.code }}>{ceColName(j)}</div>
            <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
              <input type="checkbox" aria-label={`Select column ${h}`} checked={selC.has(j)} onChange={() => setSelC(s => { const n = new Set(s); n.has(j) ? n.delete(j) : n.add(j); return n; })} />
              {cell && cell.i === -1 && cell.j === j ? <input autoFocus aria-label={`Rename column ${h}`} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={keyNav} style={{ ...inp, padding: "2px 5px", fontSize: 12, width: 130, fontWeight: 600 }} />
                : <button type="button" onClick={() => startEdit(-1, j)} title={FXM["c:" + h] ? `Click to rename · column formula: ${FXM["c:" + h]}` : "Click to rename"} style={{ background: "none", border: "none", color: C.text, fontWeight: 600, cursor: "text", padding: "0 2px", fontSize: 12 }}>{h}{FXM["c:" + h] && <span style={{ color: C.teal, fontStyle: "italic", fontSize: 10, marginLeft: 4 }}>fx</span>}</button>}
              <button type="button" aria-label={`Sort by ${h} smallest first`} title="Sort smallest / A first" onClick={() => sortBy(j, 1)} style={teMini()}>↑</button>
              <button type="button" aria-label={`Sort by ${h} largest first`} title="Sort largest / Z first" onClick={() => sortBy(j, -1)} style={teMini()}>↓</button>
              <button type="button" aria-label={`Move ${h} left`} title="Move left" disabled={j === 0} onClick={() => moveCol(j, -1)} style={teMini()}>◀</button>
              <button type="button" aria-label={`Move ${h} right`} title="Move right" disabled={j === H.length - 1} onClick={() => moveCol(j, 1)} style={teMini()}>▶</button>
              <button type="button" aria-label={`Delete column ${h}`} title="Delete column" disabled={H.length < 2} onClick={() => delCols(new Set([j]))} style={{ ...teMini(), color: C.red }}>✕</button></div></th>)}
        </tr></thead>
        <tbody>{idx.map(i => { const r = R[i]; return <tr key={i} style={{ background: selR.has(i) ? `${C.gold}14` : "transparent" }}>
          <td style={{ ...wbCell, position: "sticky", left: 0, background: selR.has(i) ? C.raised : C.card, zIndex: 1, whiteSpace: "nowrap", padding: "3px 6px" }}>
            <input type="checkbox" aria-label={`Select row ${i + 1}`} checked={selR.has(i)} onChange={() => setSelR(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })} style={{ verticalAlign: "middle" }} />
            <span role="button" tabIndex={-1} aria-label={`Select row ${i + 1} cells`} title="Click to select this row, drag to select several" onMouseDown={e => rowDown(e, i)} onMouseEnter={() => cellEnter(i, 0)} style={{ display: "inline-block", minWidth: 22, textAlign: "right", color: box && i >= box.r0 && i <= box.r1 ? C.text : C.dim, fontWeight: box && i >= box.r0 && i <= box.r1 ? 700 : 400, cursor: "e-resize", userSelect: "none", marginLeft: 3 }}>{i + 1}</span>
            <button type="button" aria-label={`Insert a row after row ${i + 1}`} title="Insert a row below" onClick={() => insertRow(i)} style={{ ...teMini(), marginLeft: 3 }}>+</button>
            <button type="button" aria-label={`Delete row ${i + 1}`} title="Delete row" onClick={() => delRows(new Set([i]))} style={{ ...teMini(), color: C.red }}>✕</button></td>
          {H.map((h, j) => { const on = inBox(i, j), act = rg && rg.a.i === i && rg.a.j === j, fb = fillBox && inBox(i, j, fillBox) && !on, corner = box && !match && i === box.r1 && j === box.c1 && !cell;
            return <td key={j} role="gridcell" aria-selected={on} data-cell={ceAddr(i, j)} style={{ ...cellSt, position: "relative", userSelect: "none", background: on ? (act ? `${C.teal}14` : `${C.teal}24`) : selC.has(j) ? `${C.gold}10` : "transparent", outline: act ? `2px solid ${C.teal}` : fb ? `1px dashed ${C.teal}` : undefined, outlineOffset: -2 }} onMouseDown={e => cellDown(e, i, j)} onMouseEnter={() => cellEnter(i, j)} onDoubleClick={() => startEdit(i, j)}>
            {cell && cell.i === i && cell.j === j ? <input autoFocus onFocus={e => { const t = e.target; const L = t.value.length; try { t.setSelectionRange(L, L); } catch (x) { } }} aria-label={`Edit row ${i + 1} ${h}`} value={draft} onChange={e => setDraft(e.target.value)} onBlur={e => { const t = e.relatedTarget; if (t && (t === gridRef.current || (t.closest && t.closest('[aria-label="Formula bar"]')))) return; commit(); }} onKeyDown={keyNav} style={{ ...inp, padding: "2px 5px", fontSize: 12, width: Math.max(90, Math.min(220, draft.length * 7 + 20)) }} />
              : (() => { const f = FXM[`r:${i}:${h}`] || FXM[`c:${h}`]; return <span title={f ? `Formula: ${f}` : undefined} style={{ color: teBlank(r[j]) ? C.dim : C.text, ...(f ? { borderBottom: `1px dotted ${C.teal}`, fontVariantNumeric: "tabular-nums" } : {}) }}>{f && <span aria-hidden="true" style={{ color: C.teal, fontSize: 9, marginRight: 3, fontStyle: "italic" }}>fx</span>}{teBlank(r[j]) ? "·" : String(r[j])}</span>; })()}
            {corner && <span role="button" tabIndex={-1} aria-label="Fill handle: drag to fill" title="Drag to fill down, up, left or right (numbers continue as a series; hold Ctrl to copy instead). Formulas copy with their cell references shifted." onMouseDown={fillDown2} style={{ position: "absolute", right: -1, bottom: -1, width: 7, height: 7, background: C.teal, border: `1px solid ${C.card}`, cursor: "crosshair", zIndex: 1 }} />}</td>; })}</tr>; })}</tbody></table>
      {!idx.length && <div style={{ ...wbNote, padding: 12 }}>{match ? "No rows match the search." : "This dataset has no rows. Press + Row to add one."}</div>}
    </div>
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6, fontSize: 12, color: C.mid }}>
      <button type="button" style={wbSmallBtn()} disabled={pg === 0} onClick={() => setPage(pg - 1)}>‹ Previous</button>
      <span>Rows {N ? (pg * TE_PAGE + 1).toLocaleString() : 0}–{Math.min(N, (pg + 1) * TE_PAGE).toLocaleString()} of {N.toLocaleString()}{match ? ` matching (of ${R.length.toLocaleString()})` : ""} · page {pg + 1} of {pages.toLocaleString()}</span>
      <button type="button" style={wbSmallBtn()} disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>Next ›</button>
      <span style={{ marginLeft: "auto", fontSize: 11.5 }}>Click or drag to select (column letters and row numbers select whole columns and rows). Double-click, Enter or just type to edit. Formulas can use column names or cells like =B2*C2 and =SUM(B2:B10). Drag the small square to fill. Ctrl+C / Ctrl+V copy and paste, Ctrl+D fills down, Delete clears. Changes save with the project.{huge ? " Large table: each change can take a moment." : ""}</span></div>
  </div>}</WbMax>;
}
const teMini = () => ({ background: "none", border: "none", color: C.mid, cursor: "pointer", padding: "0 3px", fontSize: 11, lineHeight: 1 });
// ══════════════════════════════════════════════
// DATA WORKBENCH (UI): datasets, PDF tables, formulas, text coding
// ══════════════════════════════════════════════
// getters so the styles follow the active theme
const wbH = { fontSize:13, fontWeight:700, get color(){ return C.text; }, margin:"0 0 8px" };
const wbNote = { fontSize:12, get color(){ return C.mid; }, lineHeight:1.55 };
const wbSmallBtn = (col=C.gold) => ({ ...pill(false, col), padding:"5px 10px", fontSize:12 });
const wbCell = { padding:"4px 8px", get borderBottom(){ return `1px solid ${C.border}`; }, fontSize:12, get color(){ return C.text; }, whiteSpace:"nowrap", maxWidth:240, overflow:"hidden", textOverflow:"ellipsis" };
const wbIdent = (h) => /^[A-Za-z_][A-Za-z0-9_.]*$/.test(h)? h : `[${h}]`;
const wbNumericShare = (tab, j) => { const v=tab.rows.map(r=>r[j]).filter(x=>x!==""&&x!=null); return v.length? v.filter(x=>isFinite(parseFloat(String(x).replace(/,/g,"")))).length/v.length : 0; };
// Read-only (or editable) grid of a {headers, rows} table
// Maximize any table to the whole screen (same component, so edits and selections are kept). Esc returns.
function WbMax({ children, label="table", inline }) {
  const [big,setBig]=useState(false);
  useEffect(()=>{ if (!big) return; const k=(e)=>{ if (e.key!=="Escape") return; const a=document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest(".wb-max")) return; e.stopImmediatePropagation(); setBig(false); }; window.addEventListener("keydown",k,true); const o=document.body.style.overflow; document.body.style.overflow="hidden"; return ()=>{ window.removeEventListener("keydown",k,true); document.body.style.overflow=o; }; },[big]);
  const btnEl=<button type="button" onClick={()=>setBig(b=>!b)} aria-pressed={big} aria-label={big? `Exit full screen ${label}` : `Maximize ${label}`} title={big? "Back to normal size (Esc)" : "Show this table on the whole screen"} style={{ ...wbSmallBtn(big? C.gold : undefined), padding:"3px 9px", fontSize:11.5 }}>{big? "✕ Exit full screen (Esc)" : "⤢ Maximize"}</button>;
  return <div className={big? "wb-max" : undefined} role={big? "dialog" : undefined} aria-modal={big? "true" : undefined} aria-label={big? `${label}, full screen` : undefined}
    style={big? { position:"fixed", inset:0, zIndex:470, background:C.bg, padding:"12px 16px", display:"flex", flexDirection:"column", overflow:"auto" } : { position:"relative" }}>
    <div style={{ display:"flex", justifyContent:"flex-end", gap:8, alignItems:"center", marginBottom:4, ...(inline && !big? { position:"absolute", right:0, top:-30 } : {}) }}>{big && <span style={{ fontSize:12, color:C.mid, marginRight:"auto" }}>{label}</span>}{btnEl}</div>
    {children(big)}
  </div>; }
const WbGrid = ({ tab, highlight=[], max=200, edit, onDelCol, onDelRow, height=360, label="table" }) => {
  if (!tab || !tab.headers) return null;
  return <WbMax label={label}>{(big)=>{ const lim=big? Math.max(max, 3000) : max; const shown=tab.rows.slice(0,lim); return (
    <div style={{ border:`1px solid ${C.border}`, borderRadius:6, overflow:"auto", maxHeight:big? "calc(100vh - 80px)" : height, background:C.card }}>
      <table style={{ borderCollapse:"collapse", width:"100%", fontFamily:C.font }}>
        <thead><tr>
          {onDelRow && <th style={{ ...wbCell, position:"sticky", top:0, background:C.raised }}/>}
          {tab.headers.map((h,j)=><th key={j} scope="col" style={{ ...wbCell, ...(edit? { maxWidth:"none" } : {}), position:"sticky", top:0, background:highlight.includes(h)? `${C.teal}33` : C.raised, fontWeight:600, textAlign:"left" }}>
            {edit? <input aria-label={`Column ${j+1} name`} value={h} onChange={e=>edit(-1,j,e.target.value)} style={{ ...inp, padding:"3px 6px", fontSize:12, width:130, fontWeight:600 }}/> : h}
            {onDelCol && <button type="button" onClick={()=>onDelCol(j)} aria-label={`Delete column ${h}`} title="Delete column" style={{ marginLeft:4, background:"none", border:"none", color:C.red, cursor:"pointer", fontSize:12 }}>✕</button>}
          </th>)}
        </tr></thead>
        <tbody>{shown.map((r,i)=><tr key={i}>
          {onDelRow && <td style={wbCell}><button type="button" onClick={()=>onDelRow(i)} aria-label={`Delete row ${i+1}`} title="Delete row" style={{ background:"none", border:"none", color:C.red, cursor:"pointer", fontSize:12 }}>✕</button></td>}
          {tab.headers.map((h,j)=><td key={j} style={{ ...wbCell, ...(edit? { maxWidth:"none" } : {}), background:highlight.includes(h)? `${C.teal}12` : "transparent" }}>
            {edit? <input aria-label={`Row ${i+1} ${h}`} value={r[j]??""} onChange={e=>edit(i,j,e.target.value)} style={{ ...inp, padding:"3px 6px", fontSize:12, width:130 }}/> : String(r[j]??"")}
          </td>)}
        </tr>)}</tbody>
      </table>
      {tab.rows.length>lim && <div style={{ ...wbNote, padding:"6px 10px" }}>Showing the first {lim.toLocaleString()} of {tab.rows.length.toLocaleString()} rows.{big? "" : " Press Maximize to see more."}</div>}
    </div>
  ); }}</WbMax>;
};
// ── Datasets ──
function WbDatasets({ datasets, setDatasets, onChart, onImpact, basketTable, isMobile, onOpen }) {
  const ids=Object.keys(datasets).sort((a,b)=>(datasets[b].updated||"").localeCompare(datasets[a].updated||""));
  const [sel,setSel]=useState(ids[0]||null); const d=sel && datasets[sel]; const [picked,setPicked]=useState(()=>new Set());
  // edit history per dataset (undo / redo); fewer steps kept for very large tables
  const ehist=useRef({}); const [,bump]=useState(0); const EH=(id)=>ehist.current[id] || (ehist.current[id]={ undo:[], redo:[] });
  const setTab=(id, t)=>setDatasets(ds=>ds[id]? ({ ...ds, [id]:{ ...ds[id], headers:t.headers, rows:t.rows, ...(t.fx!==undefined? { fx:t.fx } : {}), updated:new Date().toISOString() } }) : ds);
  const applyEdit=(t, label)=>{ const h=EH(sel); h.undo.push({ headers:d.headers, rows:d.rows, fx:d.fx||{}, label }); const cap=d.rows.length>200000? 4 : 25; while (h.undo.length>cap) h.undo.shift(); h.redo=[]; setTab(sel, t); bump(x=>x+1); };
  const undoEdit=()=>{ const h=EH(sel); const p=h.undo.pop(); if (!p) return; h.redo.push({ headers:d.headers, rows:d.rows, fx:d.fx||{}, label:p.label }); setTab(sel, p); bump(x=>x+1); };
  const redoEdit=()=>{ const h=EH(sel); const p=h.redo.pop(); if (!p) return; h.undo.push({ headers:d.headers, rows:d.rows, fx:d.fx||{}, label:p.label }); setTab(sel, p); bump(x=>x+1); };
  const delDs=(ks)=>{ const gone=new Set(ks); setDatasets(ds=>Object.fromEntries(Object.entries(ds).filter(([k])=>!gone.has(k)))); setPicked(new Set()); };
  useEffect(()=>{ if (sel && !datasets[sel]) setSel(Object.keys(datasets)[0]||null); },[datasets, sel]);
  const fileRef=useRef(null);
  const [upMsg,setUpMsg]=useState(null); const [drag,setDrag]=useState(false);
  // Several files at once: CSV / TSV / TXT, and Excel or OpenDocument workbooks (each non-empty sheet becomes a dataset)
  const addFiles=async(list)=>{ const files=[...(list||[])]; if (!files.length) return; const ok=[], bad=[]; setUpMsg({ busy:true, text:`Reading ${files.length} file${files.length>1?"s":""}…` });
    for (const f of files){ const base=f.name.replace(/\.[^.]+$/,"");
      try {
        if (/\.(xlsx|xlsm|xls|ods)$/i.test(f.name)){ const X=await wbXlsx(); const wb=X.read(new Uint8Array(await f.arrayBuffer()), { type:"array", cellDates:true }); let n=0;
          wb.SheetNames.forEach(sh=>{ const t=wbSheetTable(X, wb.Sheets[sh]); if (!t) return; n++; ok.push({ name:wb.SheetNames.length>1? `${base} – ${sh}` : base, ...t }); }); if (!n) bad.push(`${f.name}: no data in any sheet`); }
        else if (!/\.(csv|tsv|txt|tab)$/i.test(f.name)) bad.push(`${f.name}: not a CSV or Excel file (use Tables from PDF for PDFs, Text coding for documents)`);
        else { const p=ciParseCSV(await f.text()); if (p.error) bad.push(`${f.name}: ${p.error}`); else ok.push({ name:base, headers:p.headers.map((h,j)=>h||`col${j+1}`), rows:p.rows }); }
      } catch(e){ bad.push(`${f.name}: ${e?.message||"could not be read"}`); } }
    if (ok.length){ const now=new Date().toISOString(); const made=ok.map(t=>({ id:prjUid(), created:now, updated:now, source:"csv", ...t })); setDatasets(ds=>({ ...ds, ...Object.fromEntries(made.map(d=>[d.id,d])) })); setSel(made[0].id); }
    setUpMsg({ text:`${ok.length? `Added ${ok.length} dataset${ok.length>1?"s":""}: ${ok.map(t=>t.name).slice(0,6).join(", ")}${ok.length>6?"…":""}.` : ""}${bad.length? ` Not added: ${bad.join("; ")}.` : ""}`, bad:bad.length>0 }); };
  const addBasket=()=>{ const t=basketTable(); if (!t || !t.rows.length) return alert("The chart has no data yet. Load some variables first."); const id=prjUid(); const now=new Date().toISOString();
    setDatasets(ds=>({ ...ds, [id]:{ id, name:t.name, headers:t.headers, rows:t.rows, source:"basket", created:now, updated:now } })); setSel(id); };
  const SRC={ pdf:"From PDF", csv:"Uploaded file", formula:"Formula result", coding:"Coded text", basket:"From the chart", merge:"Merged", append:"Appended" };
  return (
    <div style={{ display:"grid", gridTemplateColumns:isMobile?"minmax(0,1fr)":"280px minmax(0,1fr)", gap:16 }}>
      <div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
          <button type="button" style={wbSmallBtn()} onClick={()=>fileRef.current?.click()} title="Choose one or several CSV or Excel files (hold Ctrl or Shift to pick several)">Upload files</button>
          <input ref={fileRef} type="file" multiple accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods" hidden aria-label="Upload data files" onChange={e=>{ addFiles(e.target.files); e.target.value=""; }}/>
          <button type="button" style={wbSmallBtn()} onClick={addBasket}>Save chart data</button>
          <button type="button" style={wbSmallBtn()} onClick={()=>onOpen("pdf")}>From a PDF</button>
        </div>
        <div onDragOver={e=>{ e.preventDefault(); setDrag(true); }} onDragLeave={()=>setDrag(false)} onDrop={e=>{ e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }} onClick={()=>fileRef.current?.click()} role="button" tabIndex={0} onKeyDown={e=>{ if (e.key==="Enter"||e.key===" ") fileRef.current?.click(); }}
          style={{ border:`1.5px dashed ${drag? C.gold : C.border}`, background:drag? `${C.gold}12` : "transparent", borderRadius:6, padding:"10px", textAlign:"center", fontSize:12, color:C.mid, cursor:"pointer", marginBottom:10 }}>
          Drop CSV or Excel files here, or click to choose. You can add several at once; each Excel sheet becomes its own dataset.</div>
        {upMsg && <div role="status" style={{ fontSize:12, color:upMsg.busy? C.gold : upMsg.bad? C.orange : C.teal, marginBottom:8, lineHeight:1.5 }}>{upMsg.text}</div>}
        {!ids.length && <p style={wbNote}>No datasets yet. Upload files, save the data behind the current chart, pull a table out of a PDF, or code some text. Datasets are saved with your project.</p>}
        {ids.length>0 && <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap", marginBottom:8 }}>
          <label style={{ display:"flex", gap:5, alignItems:"center", fontSize:12, color:C.mid }}><input type="checkbox" aria-label="Select all datasets" checked={picked.size>0 && picked.size===ids.length} ref={el=>{ if (el) el.indeterminate=picked.size>0 && picked.size<ids.length; }} onChange={e=>setPicked(e.target.checked? new Set(ids) : new Set())}/> Select all</label>
          {picked.size>0 && <button type="button" style={wbSmallBtn(C.red)} onClick={()=>{ if (window.confirm(`Delete ${picked.size} selected dataset${picked.size>1?"s":""}? You can bring them back from Project history (except datasets over 300 KB).`)) delDs([...picked]); }}>Delete selected ({picked.size})</button>}
        </div>}
        <div role="listbox" aria-label="Datasets" aria-multiselectable="false" style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {ids.map(k=>{ const x=datasets[k]; return <div key={k} style={{ display:"flex", gap:6, alignItems:"center" }}><input type="checkbox" aria-label={`Select ${x.name}`} checked={picked.has(k)} onChange={()=>setPicked(p=>{ const n=new Set(p); n.has(k)? n.delete(k) : n.add(k); return n; })}/><button type="button" role="option" aria-selected={sel===k} onClick={()=>setSel(k)} style={{ flex:1, minWidth:0, textAlign:"left", background:sel===k? `${C.gold}18` : C.card, border:`1px solid ${sel===k? C.gold : C.border}`, borderRadius:6, padding:"8px 10px", cursor:"pointer", color:C.text }}>
            <div style={{ fontSize:13, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{x.name}</div>
            <div style={{ fontSize:11, color:x.missing? C.orange : C.dim }}>{x.missing? "Not on this device" : x.loading? "Loading…" : `${(x.rows.length).toLocaleString()} rows`} · {x.headers.length} columns · {SRC[x.source]||x.source}{prjCells(x)>PRJ_BIG_CELLS || x.big? " · large" : ""}</div>
          </button></div>; })}
        </div>
      </div>
      <div style={{ minWidth:0 }}>
        {d ? <>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:10 }}>
            <input aria-label="Dataset name" value={d.name} onChange={e=>{ const v=e.target.value; setDatasets(ds=>({ ...ds, [sel]:{ ...ds[sel], name:v, updated:new Date().toISOString() } })); }} style={{ ...inp, maxWidth:320, fontWeight:600 }}/>
            <button type="button" style={wbSmallBtn()} onClick={()=>onChart(d)}>Chart it</button>
            <button type="button" style={wbSmallBtn()} onClick={()=>onImpact(d)}>Open in Impact Lab</button>
            <button type="button" style={wbSmallBtn()} onClick={()=>onOpen("formula", sel)}>Formulas</button>
            <button type="button" style={wbSmallBtn()} onClick={()=>wbDownload(`${d.name}.csv`, wbCsv(d))}>Download CSV</button>
            <button type="button" style={wbSmallBtn(C.red)} onClick={()=>{ if (window.confirm(`Delete "${d.name}"? You can bring it back from the project history.`)) setDatasets(ds=>{ const n={ ...ds }; delete n[sel]; return n; }); }}>Delete</button>
          </div>
          {d.missing? <div style={{ ...card, borderColor:`${C.orange}88` }}><p style={{ ...wbNote, margin:0, color:C.text }}>This large dataset ({(d.nRows||0).toLocaleString()} rows) is stored in the browser where it was added, not in the project, so it is not available here. Upload the file again on this device, or delete this entry.</p></div>
           : d.loading? <p style={wbNote}>Loading the large dataset from this device…</p>
           : <>{(prjCells(d)>PRJ_BIG_CELLS) && <p style={{ ...wbNote, marginTop:0 }}>Large dataset: it is kept in this browser (not uploaded with the project) so saving stays fast. Export it as CSV if you need it on another device.</p>}<WbTableEditor d={{ ...d, id:sel }} datasets={datasets} onChange={applyEdit} undo={undoEdit} redo={redoEdit} canUndo={EH(sel).undo.length>0} canRedo={EH(sel).redo.length>0} lastLabel={(EH(sel).undo[EH(sel).undo.length-1]||{}).label}/></>}
        </> : <p style={wbNote}>Pick a dataset to preview it.</p>}
      </div>
    </div>
  );
}
// ── PDF tables ──
function WbPdf({ addDataset, isMobile }) {
  const docsRef=useRef({}); const canvasRef=useRef(null); const fileRef=useRef(null); const offRef=useRef(null); const [offT,setOffT]=useState([]); const [offBusy,setOffBusy]=useState("");
  const openOffice=async(list)=>{ const fs=[...(list||[])]; if (!fs.length) return; setErr(""); const errs=[]; for (const f of fs) { setOffBusy(`Reading ${f.name}…`); try { const ts=await offTables(f); if (!ts.length) errs.push(`${f.name}: no tables found.`); setOffT(x=>[...x, ...ts.map(t=>({ ...t, key:prjUid() }))]); if (!name) setName(f.name.replace(/\.[^.]+$/,"")); } catch(e){ errs.push(e.message); } }
    setOffBusy(""); if (errs.length) setErr(errs.join(" ")); };
  const [files,setFiles]=useState([]); const [pages,setPages]=useState([]); const [busy,setBusy]=useState(""); const [err,setErr]=useState("");
  const [onlyTables,setOnlyTables]=useState(true); const [cur,setCur]=useState(null); const [scale,setScale]=useState(1);
  const [edit,setEdit]=useState(null); // {headers, rows, from}
  const [name,setName]=useState(""); const [drag,setDrag]=useState(null); const [ocr,setOcr]=useState(null);
  // Several PDFs can be open at once; each page is keyed "fileId:page"
  const open=async(list)=>{ const fs=[...(list||[])].filter(f=>/\.pdf$/i.test(f.name)||f.type==="application/pdf"); if (!fs.length) return; setErr(""); const errs=[];
    let lib; try { setBusy("Loading the PDF reader…"); lib=await wbPdfjs(); } catch(e){ setBusy(""); setErr(e.message); return; }
    let firstKey=null, any=false;
    for (let fi=0; fi<fs.length; fi++){ const f=fs[fi]; const fid=prjUid(); const fname=f.name.replace(/\.pdf$/i,"");
      try { const doc=await lib.getDocument({ data:new Uint8Array(await f.arrayBuffer()) }).promise; docsRef.current[fid]=doc; const N=Math.min(doc.numPages, 400); const out=[];
        setFiles(x=>[...x, { fid, name:fname, numPages:doc.numPages }]);
        for (let p=1;p<=N;p++){ setBusy(`${fs.length>1? `File ${fi+1} of ${fs.length} · ` : ""}${fname}: scanning page ${p} of ${N}…`); const pg=await doc.getPage(p); const { words, w, h }=await wbPageWords(pg);
          let tables=[]; try { tables=pdfFindTables(words); } catch(e){ tables=[]; }
          out.push({ key:`${fid}:${p}`, fid, fname, n:p, words, w, h, tables, scanned:words.length<8 }); if (p%10===0 || p===N) setPages(ps=>[...ps.filter(x=>x.fid!==fid), ...out]); }
        const ft=out.find(x=>x.tables.length); if (ft) any=true; if (!firstKey) firstKey=(ft||out[0])?.key;
        if (doc.numPages>N) errs.push(`${f.name}: only the first ${N} of ${doc.numPages} pages were scanned.`);
      } catch(e){ errs.push(`${f.name}: ${/password/i.test(e?.message||"")? "password protected; remove the password and try again" : `could not be read (${e?.message||"unknown error"})`}`); } }
    setBusy(""); if (firstKey) setCur(c=>c||firstKey); if (!any && !pages.some(x=>x.tables.length)) setOnlyTables(false); if (errs.length) setErr(errs.join(" "));
    if (!name && fs[0]) setName(fs[0].name.replace(/\.pdf$/i,"")); };
  const removeFile=(fid)=>{ const d=docsRef.current[fid]; try { d && d.destroy && d.destroy(); } catch(e){} delete docsRef.current[fid]; setFiles(x=>x.filter(f=>f.fid!==fid)); setPages(ps=>ps.filter(p=>p.fid!==fid)); setCur(c=>c && c.startsWith(fid+":")? null : c); };
  const page=pages.find(p=>p.key===cur); const multi=files.length>1; const where=(p)=>multi? `${p.fname}, page ${p.n}` : `page ${p.n}`;
  // draw the current page
  useEffect(()=>{ let cancel=false; (async()=>{ const doc=page && docsRef.current[page.fid]; if (!page || !doc || !canvasRef.current) return; const pg=await doc.getPage(page.n);
      const box=(canvasRef.current.parentElement?.parentElement?.clientWidth||620)-4; const sc=Math.min(1.6, box/page.w); const vp=pg.getViewport({ scale:sc }); const cv=canvasRef.current; if (cancel) return;
      cv.width=vp.width; cv.height=vp.height; setScale(sc); try { await pg.render({ canvasContext:cv.getContext("2d"), viewport:vp }).promise; } catch(e){} })();
    return ()=>{ cancel=true; }; },[cur, page?.key, page?.w]);
  const editRef=useRef(null); const take=(t, from)=>{ if (page && multi) setName(page.fname); setEdit({ headers:[...t.headers], rows:t.rows.map(r=>[...r]), from }); setTimeout(()=>editRef.current?.scrollIntoView({ behavior:"smooth", block:"start" }), 60); };
  const appendFrom=(t, from)=>{ setEdit(e=>{ if (!e) return { headers:[...t.headers], rows:t.rows.map(r=>[...r]), from };
    const nc=e.headers.length; const rows=t.rows.map(r=> r.length===nc? [...r] : r.length>nc? r.slice(0,nc) : [...r, ...new Array(nc-r.length).fill("")]); return { ...e, rows:[...e.rows, ...rows], from:`${e.from}, ${from}` }; }); };
  const runOcr=async()=>{ if (!page) return; setOcr(0); setErr("");
    try { const pg=await docsRef.current[page.fid].getPage(page.n); const { words }=await wbOcrPage(pg, p=>setOcr(p)); const tables=pdfFindTables(words);
      setPages(ps=>ps.map(x=>x.key===page.key? { ...x, words, tables, scanned:false, ocr:true } : x)); setOcr(null);
      if (!tables.length) setErr("OCR finished but found no clear table. Drag a box around the table on the page to pull it out."); }
    catch(e){ setOcr(null); setErr(`OCR failed. ${e?.message||""}`); } };
  // drag a box on the page to extract the words inside it
  const pt=(e)=>{ const r=e.currentTarget.getBoundingClientRect(); return { x:(e.clientX-r.left)/scale, y:(e.clientY-r.top)/scale }; };
  const endDrag=()=>{ if (!drag || !page) return setDrag(null); const x0=Math.min(drag.a.x,drag.b.x), x1=Math.max(drag.a.x,drag.b.x), y0=Math.min(drag.a.y,drag.b.y), y1=Math.max(drag.a.y,drag.b.y); setDrag(null);
    if (x1-x0<10 || y1-y0<10) return; const ws=page.words.filter(w=>w.x+w.w/2>=x0 && w.x+w.w/2<=x1 && w.y+w.h/2>=y0 && w.y+w.h/2<=y1);
    if (!ws.length) return setErr("No text inside that box. If the page is a scan, run OCR first.");
    const t=pdfFindTables(ws, { keepText:true })[0] || pdfLinesAsRows(ws); setErr(""); take(t, `${where(page)} (selected area)`); };
  const setCell=(i,j,v)=>setEdit(e=>{ if (i<0) { const h=[...e.headers]; h[j]=v; return { ...e, headers:h }; } const rows=e.rows.map(r=>[...r]); rows[i][j]=v; return { ...e, rows }; });
  const shown=pages.filter(p=>!onlyTables || p.tables.length || p.scanned);
  const nT=pages.reduce((s,p)=>s+p.tables.length,0), nScan=pages.filter(p=>p.scanned).length;
  return (
    <div>
      <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", marginBottom:12 }}>
        <button type="button" style={btn()} onClick={()=>fileRef.current?.click()} disabled={!!busy} title="Pick one or several PDFs (hold Ctrl or Shift)">{files.length? "Add more PDFs" : "Choose PDFs"}</button>
        <input ref={fileRef} type="file" multiple accept="application/pdf,.pdf" hidden aria-label="Choose PDF files" onChange={e=>{ open(e.target.files); e.target.value=""; }}/>
        {files.length>0 && <span style={{ fontSize:12.5, color:C.text }}>{files.length} PDF{files.length>1?"s":""} open</span>}
        {files.length>0 && !busy && <button type="button" style={wbSmallBtn(C.red)} onClick={()=>{ Object.keys(docsRef.current).forEach(removeFile); setCur(null); setEdit(null); }}>Close all</button>}
        <button type="button" style={btn(C.teal)} onClick={()=>offRef.current?.click()} disabled={!!offBusy} title="Tables inside Word (.docx) and PowerPoint (.pptx) files">Word or PowerPoint tables</button>
        <input ref={offRef} type="file" multiple accept=".docx,.pptx" hidden aria-label="Choose Word or PowerPoint files" onChange={e=>{ openOffice(e.target.files); e.target.value=""; }}/>
        {busy && <span role="status" style={{ fontSize:12, color:C.gold }}>{busy}</span>}
        {offBusy && <span role="status" style={{ fontSize:12, color:C.gold }}>{offBusy}</span>}
      </div>
      {offT.length>0 && <div style={{ border:`1px solid ${C.border}`, borderRadius:6, padding:10, marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}><b style={{ fontSize:13, color:C.text }}>Tables from Word and PowerPoint ({offT.length})</b><button type="button" style={{ ...wbSmallBtn(C.red), marginLeft:"auto" }} onClick={()=>setOffT([])}>Clear</button></div>
        <div style={{ display:"grid", gridTemplateColumns:isMobile? "1fr" : "repeat(auto-fill,minmax(300px,1fr))", gap:8 }}>
          {offT.map(t=><div key={t.key} style={{ border:`1px solid ${C.border}`, borderRadius:6, padding:8, background:C.raised }}>
            <div style={{ fontSize:12.5, fontWeight:600, color:C.text }}>{t.from}</div><div style={{ fontSize:11.5, color:C.dim, marginBottom:4 }}>{t.rows.length} rows × {t.headers.length} columns</div>
            <div style={{ overflow:"auto", maxHeight:110 }}><table style={{ borderCollapse:"collapse", fontSize:11 }}><thead><tr>{t.headers.slice(0,6).map((h,j)=><th key={j} style={{ textAlign:"left", padding:"2px 6px", borderBottom:`1px solid ${C.border}`, color:C.text }}>{h}</th>)}</tr></thead>
              <tbody>{t.rows.slice(0,3).map((r,i)=><tr key={i}>{r.slice(0,6).map((c,j)=><td key={j} style={{ padding:"2px 6px", color:C.mid }}>{c}</td>)}</tr>)}</tbody></table></div>
            <div style={{ display:"flex", gap:6, marginTop:6 }}><button type="button" style={wbSmallBtn()} onClick={()=>take(t, t.from)}>Use this table</button><button type="button" style={wbSmallBtn()} onClick={()=>appendFrom(t, t.from)} title="Add these rows under the table being edited">Add rows to table</button></div></div>)}
        </div></div>}
      {!pages.length && !busy && <div onDragOver={e=>e.preventDefault()} onDrop={e=>{ e.preventDefault(); open(e.dataTransfer.files); }} style={{ border:`1.5px dashed ${C.border}`, borderRadius:6, padding:"14px", marginBottom:10, fontSize:12.5, color:C.mid, textAlign:"center" }}>Drop one or several PDF files here, or use Choose PDFs.</div>}
      {!pages.length && !busy && <p style={wbNote}>EcoScope reads each PDF in your browser (the files are not uploaded), finds the pages that hold tables of numbers and lets you choose which one to use. Scanned pages can be read with OCR. If a table is missed, drag a box around it on the page.</p>}
      {err && <div role="alert" style={{ ...wbNote, color:C.orange, margin:"6px 0 10px" }}>{err}</div>}
      {pages.length>0 && <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"200px 1fr", gap:14 }}>
        <div>
          <div style={{ fontSize:12, color:C.mid, marginBottom:6 }}>{multi? `${files.length} files · ` : ""}{pages.length} pages · {nT} table{nT===1?"":"s"} found{nScan? ` · ${nScan} scanned` : ""}</div>
          <label style={{ display:"flex", gap:6, alignItems:"center", fontSize:12, color:C.mid, marginBottom:8 }}><input type="checkbox" checked={onlyTables} onChange={e=>setOnlyTables(e.target.checked)}/> Only pages with tables</label>
          <div role="listbox" aria-label="PDF pages" style={{ display:"flex", flexDirection:isMobile?"row":"column", gap:4, maxHeight:isMobile?"none":520, overflow:"auto" }}>
            {shown.map((p,ix)=><React.Fragment key={p.key}>
              {multi && (ix===0 || shown[ix-1].fid!==p.fid) && <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11.5, fontWeight:700, color:C.text, margin:ix? "8px 0 2px" : "0 0 2px", flex:"none" }}><span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }} title={p.fname}>{p.fname}</span><button type="button" aria-label={`Close ${p.fname}`} onClick={()=>removeFile(p.fid)} style={{ background:"none", border:"none", color:C.red, cursor:"pointer", fontSize:12 }}>✕</button></div>}
              <button type="button" role="option" aria-selected={cur===p.key} onClick={()=>{ setCur(p.key); setErr(""); }} style={{ ...pill(cur===p.key), textAlign:"left", display:"flex", justifyContent:"space-between", gap:8, flex:"none" }}>
              <span>Page {p.n}</span><span style={{ color:p.tables.length? C.teal : p.scanned? C.orange : C.dim }}>{p.tables.length? `${p.tables.length} table${p.tables.length>1?"s":""}` : p.scanned? "scanned" : "text"}</span></button></React.Fragment>)}
            {!shown.length && <span style={wbNote}>No pages with tables. Untick the box to see all pages.</span>}
          </div>
        </div>
        <div style={{ minWidth:0 }}>
          {page && <>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:8 }}>
              <strong style={{ fontSize:13, color:C.text }}>{multi? `${page.fname} · ` : ""}Page {page.n}{page.ocr? " (OCR)" : ""}</strong>
              {page.tables.map((t,k)=><React.Fragment key={k}>
                <button type="button" style={wbSmallBtn(C.teal)} onClick={()=>take(t, where(page))}>Use table {k+1} ({t.nRows}×{t.nCols})</button>
                {edit && <button type="button" style={wbSmallBtn()} onClick={()=>appendFrom(t, where(page))} title="Add these rows under the table you are editing (for tables that run over several pages)">Append table {k+1}</button>}
              </React.Fragment>)}
              {page.scanned && <button type="button" style={wbSmallBtn(C.orange)} disabled={ocr!=null} onClick={runOcr}>{ocr!=null? `Reading… ${Math.round(ocr*100)}%` : "Read with OCR"}</button>}
              <span style={{ fontSize:11, color:C.dim }}>Or drag a box around a table.</span>
            </div>
            {page.scanned && ocr==null && <p style={{ ...wbNote, marginTop:0 }}>This page looks like an image. OCR runs in your browser; the first run downloads about 10 MB and takes 10 to 40 seconds a page. Always check the numbers it reads.</p>}
            <div style={{ position:"relative", border:`1px solid ${C.border}`, borderRadius:6, overflow:"auto", maxHeight:560, background:"#fff" }}>
              <div style={{ position:"relative", width:"fit-content" }}>
                <canvas ref={canvasRef} style={{ display:"block" }}/>
                <div onMouseDown={e=>{ const p=pt(e); setDrag({ a:p, b:p }); }} onMouseMove={e=>{ if (drag) setDrag({ ...drag, b:pt(e) }); }} onMouseUp={endDrag} onMouseLeave={()=>drag && endDrag()}
                  style={{ position:"absolute", inset:0, cursor:"crosshair" }}>
                  {page.tables.map((t,k)=><div key={k} onMouseDown={e=>e.stopPropagation()} onClick={()=>take(t, where(page))} title={`Table ${k+1}: click to use`}
                    style={{ position:"absolute", left:t.bbox.x0*scale-4, top:t.bbox.y0*scale-4, width:(t.bbox.x1-t.bbox.x0)*scale+8, height:(t.bbox.y1-t.bbox.y0)*scale+8, border:`2px solid ${C.teal}`, background:`${C.teal}14`, borderRadius:4, cursor:"pointer" }}>
                    <span style={{ position:"absolute", top:-18, left:0, background:C.teal, color:"#fff", fontSize:10, padding:"1px 6px", borderRadius:3 }}>Table {k+1}</span></div>)}
                  {drag && <div style={{ position:"absolute", left:Math.min(drag.a.x,drag.b.x)*scale, top:Math.min(drag.a.y,drag.b.y)*scale, width:Math.abs(drag.b.x-drag.a.x)*scale, height:Math.abs(drag.b.y-drag.a.y)*scale, border:`2px dashed ${C.gold}`, background:`${C.gold}18` }}/>}
                </div>
              </div>
            </div>
          </>}
        </div>
      </div>}
      {edit && <div ref={editRef} style={{ ...card, marginTop:16 }}>
        <h3 style={wbH}>Check the table before saving</h3>
        <p style={{ ...wbNote, marginTop:0 }}>From {edit.from}. Fix any cell, rename columns, remove notes or total rows. Clean numbers turns 1,234 into 1234, (12) into -12, removes % and footnote letters, and blanks "..", "n/a" and dashes.</p>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10, alignItems:"center" }}>
          <button type="button" style={wbSmallBtn()} onClick={()=>setEdit(e=>({ ...e, rows:e.rows.map(r=>r.map((v,j)=>j===0? v : pdfCleanNumber(v))) }))}>Clean numbers</button>
          <button type="button" style={wbSmallBtn()} onClick={()=>setEdit(e=>e.rows.length? { ...e, headers:e.rows[0].map((h,j)=>String(h||e.headers[j])), rows:e.rows.slice(1) } : e)}>First row is the header</button>
          <button type="button" style={wbSmallBtn()} onClick={()=>setEdit(e=>({ ...e, headers:e.headers.map((_,j)=>j===0? "label" : `col${j+1}`), rows:[e.headers, ...e.rows] }))}>Header is a data row</button>
          <button type="button" style={wbSmallBtn()} onClick={()=>setEdit(e=>({ ...e, headers:[...e.headers, `col${e.headers.length+1}`], rows:e.rows.map(r=>[...r, ""]) }))}>Add column</button>
          <button type="button" style={wbSmallBtn()} onClick={()=>setEdit(e=>({ ...e, rows:[...e.rows, new Array(e.headers.length).fill("")] }))}>Add row</button>
          <button type="button" style={wbSmallBtn()} onClick={()=>{ const h=edit.headers, r=edit.rows; setEdit({ ...edit, headers:[h[0]||"variable", ...r.map(x=>String(x[0]))], rows:h.slice(1).map((c,j)=>[c, ...r.map(x=>x[j+1]??"")]) }); }} title="Swap rows and columns (useful when years run across the top)">Transpose</button>
        </div>
        <WbGrid tab={edit} edit={setCell} onDelCol={j=>setEdit(e=>({ ...e, headers:e.headers.filter((_,k)=>k!==j), rows:e.rows.map(r=>r.filter((_,k)=>k!==j)) }))} onDelRow={i=>setEdit(e=>({ ...e, rows:e.rows.filter((_,k)=>k!==i) }))} max={400} height={420}/>
        <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap", alignItems:"center" }}>
          <input aria-label="Dataset name" value={name} onChange={e=>setName(e.target.value)} placeholder="Dataset name" style={{ ...inp, maxWidth:300 }}/>
          <button type="button" style={btn()} onClick={()=>{ const seen={}; const headers=edit.headers.map((h,j)=>{ let x=String(h||`col${j+1}`).trim(); if (seen[x]) { seen[x]++; x=`${x}_${seen[x]}`; } else seen[x]=1; return x; });
            addDataset({ name:(name||"PDF table").trim(), headers, rows:edit.rows, source:"pdf", note:edit.from }); setEdit(null); }}>Save as dataset</button>
          <button type="button" style={wbSmallBtn(C.red)} onClick={()=>setEdit(null)}>Discard</button>
        </div>
      </div>}
    </div>
  );
}
// ── Formulas ──
// undo / redo for the EcoScript box (per dataset, for this browser session)
const FX_UNDO = new Map();
const fxAgo = (iso) => { const s=(Date.now()-new Date(iso).getTime())/1000; if (s<60) return "just now"; if (s<3600) return `${Math.floor(s/60)} min ago`; if (s<86400) return `${Math.floor(s/3600)} h ago`; return new Date(iso).toLocaleString(undefined,{ day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }); };
// ── Results panel: output of to_ commands (tables, statistics, charts in 2D or 3D) ──
// copy text: clipboard API, or a hidden textarea when the browser blocks it
const wbCopy = (text) => { const fall = () => { try { const t = document.createElement("textarea"); t.value = text; t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); t.select(); const ok = document.execCommand("copy"); document.body.removeChild(t); return ok; } catch (e) { return false; } };
  try { if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => fall()); } catch (e) { /* blocked */ } return Promise.resolve(fall()); };
const wbTsv = (b) => [b.head, ...b.rows].map(r => r.map(c => String(c ?? "").replace(/\s+/g, " ")).join("\t")).join("\n");
// plot types a result chart can switch to (the fields of the command are kept; types that do not fit say so)
const WB_PLOTS = [["", "As written"], ["bar","Column"], ["hbar","Horizontal bar"], ["stackbar","Stacked column"], ["line","Line"], ["area","Area"], ["step","Step"], ["lollipop","Lollipop"], ["scatter","Scatter"], ["box","Box plot"], ["violin","Violin"], ["strip","Dot strip"], ["hist","Histogram"], ["density","Density"], ["pie","Pie"], ["donut","Donut"], ["treemap","Treemap"], ["radar","Radar"], ["heatmap","Heat map"], ["table","Table"]];
const wbRetype = (t, k, tab) => { if (!k || k === t.type) return t; const H = tab.headers; const ys = (t.ys || []).length ? t.ys : H.filter(h => h !== t.x && h !== t.group).slice(0, 1);
  const dist = ["box", "violin", "strip", "hist", "density"].includes(k); const x = t.x || (t.group && !dist ? t.group : "") || H.find(h => !ys.includes(h)) || "";
  const group = dist ? (t.group || (t.x && dsbTypeOf(tab, t.x) !== "number" ? t.x : "")) : ["pie", "donut", "treemap", "lollipop", "radar", "table"].includes(k) ? "" : k === "heatmap" ? (t.group || H.find(h => h !== x && !ys.includes(h)) || "") : k === "scatter" ? t.group : t.group;
  return { ...t, type: k, x: dist ? "" : x, ys: dist ? ys.slice(0, group ? 1 : 4) : k === "scatter" ? ys.slice(0, 1) : ys, group, agg: t.agg || (["pie", "donut", "treemap", "stackbar"].includes(k) ? "sum" : "mean"), opts: { ...(t.opts || {}), trend: k === "scatter" ? true : (t.opts || {}).trend } }; };
function WbResultChart({ b }) {
  const [three,setThree]=useState(!!(b.t3d && /3d$/.test(b.t.type))); const [ptype,setPtype]=useState(""); const boxRef=useRef(null); const [xmsg,setXmsg]=useState("");
  const exportChart=async(kind)=>{ const name=wxSlug(b.title); if (kind==="svg") { const sv=wxChartSvg(boxRef.current); if (!sv) { setXmsg("This chart cannot be saved as SVG; try PNG."); return; } wxSave(new Blob([sv.svg],{ type:"image/svg+xml" }), name+".svg"); return; }
    const im=await wxChartPng(boxRef.current, 3); if (!im) { setXmsg("Could not capture the chart."); return; } if (kind==="png") { wxSave(new Blob([wxDataUrlBytes(im.url)],{ type:"image/png" }), name+".png"); return; }
    if (kind==="docx") { await wxDocxSave([{ title:b.title, blocks:[b] }], { "0-0":im }, name+".docx"); return; } if (kind==="pdf") { if (!wxPdf([{ title:b.title, blocks:[b] }], { "0-0":im })) setXmsg("Allow pop-ups for this site to print or save as PDF."); return; }
    if (kind==="tex") { setXmsg("Saved the PNG; put it next to your .tex file and use \\includegraphics{"+name+".png}"); wxSave(new Blob([wxDataUrlBytes(im.url)],{ type:"image/png" }), name+".png"); } };
  const base0 = b.t3d && ((three && !/3d$/.test(b.t.type)) || (!three && /3d$/.test(b.t.type))) ? b.t3d : b.t;
  const base = ptype && !(three && b.t3d) ? wbRetype(/3d$/.test(base0.type) && b.t3d ? b.t3d : base0, ptype, b.tab) : base0;
  const t = DSB_CAN3D.has(base.type)? { ...base, opts:{ ...(base.opts||{}), view3d:three } } : base;
  const is3 = /3d$/.test(t.type) || (t.opts||{}).view3d; const can = !!b.t3d || DSB_CAN3D.has(base.type);
  const m = useMemo(()=>{ try { return dsbModel(t, b.tab, null); } catch(e){ return { err:"Could not draw this chart: "+e.message }; } },[b, t.type, three, ptype]);
  return <WbMax label={b.title}>{(big)=><div>
    <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:4, flexWrap:"wrap" }}>
      <span style={{ fontSize:12.5, fontWeight:600, color:C.text }}>{b.title}</span>
      <label style={{ display:"inline-flex", gap:5, alignItems:"center", fontSize:11.5, color:C.mid, marginLeft:"auto" }}>Plot type
        <select aria-label="Plot type" value={ptype} onChange={e=>{ const k=e.target.value; setPtype(k); if (k && !DSB_CAN3D.has(k)) setThree(false); }} style={{ ...sel, width:"auto", padding:"3px 8px", fontSize:11.5 }}>{WB_PLOTS.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
      {can && <div role="group" aria-label="Chart view" style={{ display:"inline-flex", border:`1px solid ${C.border}`, borderRadius:6, overflow:"hidden" }}>
        {[["2D",false],["3D",true]].map(([l,v])=><button key={l} type="button" aria-pressed={three===v} onClick={()=>setThree(v)} style={{ padding:"3px 10px", fontSize:11.5, fontWeight:700, border:"none", cursor:"pointer", background:three===v? C.gold : "transparent", color:three===v? C.onAccent||"#fff" : C.mid }}>{l}</button>)}</div>}
      <span style={{ fontSize:11, color:C.dim }}>{is3? "Drag to turn · wheel to zoom" : "Hover for values · click legend items to hide them"}</span>
      <select aria-label={`Export chart ${b.title}`} value="" onChange={e=>{ const k=e.target.value; e.target.value=""; if (k) exportChart(k).catch(er=>setXmsg("Export failed: "+er.message)); }} style={{ ...sel, width:"auto", padding:"3px 8px", fontSize:11.5 }}>
        <option value="">Export chart…</option><option value="png">PNG image</option><option value="svg">SVG (sharp in Word and LaTeX)</option><option value="docx">Word (.docx)</option><option value="pdf">PDF (print)</option><option value="tex">For LaTeX (PNG + code)</option></select>
    </div>
    {xmsg && <p role="status" style={{ ...wbNote, margin:"0 0 4px", fontSize:11.5 }}>{xmsg}</p>}
    <div ref={boxRef}><DsbChart t={t} m={m} height={big? Math.max(360, (typeof window!=="undefined"? window.innerHeight : 800) - 140) : 340}/></div>
  </div>}</WbMax>;
}
function WbResults({ outs, onClear, addDataset, goLine }) {
  const [copied,setCopied]=useState(""); const rootRef=useRef(null); const [xmsg,setXmsg]=useState(""); const [busy,setBusy]=useState(false);
  const say=(m)=>{ setXmsg(m); setTimeout(()=>setXmsg(x=>x===m? "" : x), 5000); };
  const grabImgs=async()=>{ const imgs={}; const els=rootRef.current? [...rootRef.current.querySelectorAll("[data-wbchart]")] : []; for (const el of els) { const im=await wxChartPng(el, 2); if (im) imgs[el.getAttribute("data-wbchart")]=im; } return imgs; };
  const exportTable=async(kind,o,b)=>{ const name=wxSlug(o.title); const one={ title:o.title, blocks:[b] };
    if (kind==="texcopy") { const ok=await wbCopy(stTexTable(b,{ caption:b.caption||"" })); say(ok? "LaTeX table copied. Add \\usepackage{booktabs} to your preamble." : "Copy blocked by the browser; use LaTeX (.tex) instead."); return; }
    if (kind==="tex") { wxSave(new Blob([stTexTable(b,{ caption:b.caption||"" })+"\n"],{ type:"text/x-tex" }), name+".tex"); return; }
    if (kind==="xlsx") { await wxXlsxSave([{ title:o.title.replace(/^to_/,""), rows:wxBlockRows(b) }], name+".xlsx"); return; }
    if (kind==="docx") { await wxDocxSave([one], {}, name+".docx"); return; }
    if (kind==="pdf") { if (!wxPdf([one], {})) say("Allow pop-ups for this site to print or save as PDF."); } };
  const exportAll=async(kind)=>{ setBusy(true); try { const title="EcoScript results"; const stamp=new Date().toISOString().slice(0,10);
      if (kind==="xlsx") { await wxXlsxSave(outs.map(o=>({ title:`L${o.line} ${o.title.replace(/^to_/,"").split(/\s/)[0]}`, rows:[[o.title], ...o.blocks.flatMap(b=>[...wxBlockRows(b), []])] })), `ecoscript-results-${stamp}.xlsx`); say("Excel file saved: one sheet per result."); return; }
      const imgs=await grabImgs();
      if (kind==="docx") { await wxDocxSave(outs, imgs, `ecoscript-results-${stamp}.docx`, title); say("Word file saved with every table and chart."); return; }
      if (kind==="pdf") { if (!wxPdf(outs, imgs, title)) say("Allow pop-ups for this site, then try again."); else say("Print window opened: choose Save as PDF."); return; }
      if (kind==="tex") { const Z=await wxZip(); const zip=new Z(); const figs={}; Object.entries(imgs).forEach(([key,im],q)=>{ const fn=`figures/chart${q+1}.png`; zip.file(fn, wxDataUrlBytes(im.url)); figs[key]=fn; }); zip.file("results.tex", wxTexDoc(outs, figs)); wxSave(await zip.generateAsync({ type:"blob" }), `ecoscript-results-${stamp}.zip`); say("LaTeX .zip saved (results.tex + figures). Upload it to Overleaf as a new project."); } }
    catch(e){ say("Export failed: "+e.message); } finally { setBusy(false); } };
  if (!outs || !outs.length) return <p style={{ ...wbNote, margin:"8px 0" }}>Results of <code>to_</code> commands appear here: summaries, regression tables, tests and charts. Try <code>to_sum</code>, <code>to_reg y x1 x2, robust</code> or <code>to_scatter y x</code>, then Run.</p>;
  const num = (c) => typeof c === "string" && /^[-+]?[\d,.]+(e[-+]?\d+)?\**%?$|^\([-\d.,]+\)$|^\.$/.test(c.trim());
  return <div ref={rootRef} style={{ display:"flex", flexDirection:"column", gap:10 }}>
    <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}><span style={{ fontSize:12, color:C.mid }}>{outs.length} result{outs.length>1? "s" : ""}, in script order</span>
      <select aria-label="Export all results" value="" disabled={busy} onChange={e=>{ const k=e.target.value; e.target.value=""; if (k) exportAll(k); }} style={{ ...sel, width:"auto", padding:"4px 8px", fontSize:12, marginLeft:"auto" }}>
        <option value="">{busy? "Exporting…" : "Export all results…"}</option><option value="docx">Word (.docx), tables and charts</option><option value="pdf">PDF (print view)</option><option value="tex">LaTeX (.zip for Overleaf)</option><option value="xlsx">Excel (.xlsx), one sheet per result</option></select>
      <button type="button" style={wbSmallBtn()} onClick={onClear}>Clear results</button></div>
    {xmsg && <p role="status" style={{ ...wbNote, margin:0, fontSize:12, color:/failed|blocked|Allow/.test(xmsg)? C.red : C.teal }}>{xmsg}</p>}
    {outs.map((o,k)=><section key={k} aria-label={o.title} style={{ border:`1px solid ${C.border}`, borderRadius:8, background:C.card, overflow:"hidden" }}>
      <div style={{ display:"flex", gap:8, alignItems:"center", padding:"7px 12px", background:C.raised, borderBottom:`1px solid ${C.border}` }}>
        <button type="button" onClick={()=>goLine(o.line)} title="Select this line in the script" style={{ background:"none", border:"none", padding:0, cursor:"pointer", fontSize:11, color:C.dim, fontFamily:C.code }}>line {o.line}</button>
        <code style={{ fontSize:12.5, color:C.gold, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", minWidth:0 }}>{o.title}</code></div>
      <div style={{ padding:"10px 12px", display:"flex", flexDirection:"column", gap:10 }}>
        {o.blocks.map((b,i)=>{
          if (b.type==="kv") return <dl key={i} style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:"4px 16px", margin:0 }}>{b.items.map(([a,v],j)=><div key={j} style={{ display:"flex", justifyContent:"space-between", gap:8, borderBottom:`1px dotted ${C.border}`, padding:"2px 0" }}><dt style={{ fontSize:12, color:C.mid }}>{a}</dt><dd style={{ margin:0, fontSize:12.5, color:C.text, fontWeight:600, fontVariantNumeric:"tabular-nums", textAlign:"right" }}>{String(v)}</dd></div>)}</dl>;
          if (b.type==="text") return <pre key={i} style={{ margin:0, fontFamily:C.code, fontSize:13, color:C.text, whiteSpace:"pre-wrap" }}>{b.text}</pre>;
          if (b.type==="note") return <p key={i} style={{ ...wbNote, margin:0, fontSize:11.5 }}>{b.text}</p>;
          if (b.type==="chart") return <div key={i} data-wbchart={`${k}-${i}`}><WbResultChart b={b}/></div>;
          if (b.type==="text" && b.latex) return <div key={i}><div style={{ display:"flex", gap:6, marginBottom:4 }}><span style={{ fontSize:12, fontWeight:600 }}>LaTeX</span><button type="button" style={{ ...wbSmallBtn(C.teal), padding:"2px 8px", fontSize:11, marginLeft:"auto" }} onClick={()=>wbCopy(b.text).then(ok=>say(ok? "LaTeX copied. Paste it into Overleaf." : "Copy blocked: select the text and copy it."))}>Copy LaTeX</button><button type="button" style={{ ...wbSmallBtn(), padding:"2px 8px", fontSize:11 }} onClick={()=>wxSave(new Blob([b.text+"\n"],{ type:"text/x-tex" }), wxSlug(o.title)+".tex")}>Save .tex</button></div><pre style={{ margin:0, fontFamily:C.code, fontSize:12, color:C.text, whiteSpace:"pre", overflow:"auto", maxHeight:260, background:C.raised, padding:8, borderRadius:6 }}>{b.text}</pre></div>;
          if (b.type==="table") return <div key={i}>
            <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:4 }}>{b.caption && <span style={{ fontSize:12, fontWeight:600, color:C.text }}>{b.caption}</span>}
              <button type="button" style={{ ...wbSmallBtn(), padding:"2px 8px", fontSize:11, marginLeft:"auto" }} onClick={()=>{ wbCopy(wbTsv(b)).then(ok=>{ setCopied(ok? `${k}-${i}` : `x${k}-${i}`); setTimeout(()=>setCopied(""),2200); }); }}>{copied===`${k}-${i}`? "Copied" : copied===`x${k}-${i}`? "Copy blocked: select the table" : "Copy"}</button>
              <select aria-label={`Export table ${b.caption||o.title}`} value="" onChange={e=>{ const kd=e.target.value; e.target.value=""; if (kd) exportTable(kd,o,b).catch(er=>say("Export failed: "+er.message)); }} style={{ ...sel, width:"auto", padding:"2px 6px", fontSize:11 }}>
                <option value="">Export…</option><option value="texcopy">LaTeX (copy)</option><option value="tex">LaTeX (.tex)</option><option value="xlsx">Excel (.xlsx)</option><option value="docx">Word (.docx)</option><option value="pdf">PDF (print)</option></select>
              {addDataset && <button type="button" style={{ ...wbSmallBtn(C.teal), padding:"2px 8px", fontSize:11 }} onClick={()=>addDataset({ name:`${o.title.slice(0,50)}${b.caption? " · "+b.caption : ""}`, headers:b.head.map((h,j)=>String(h||"").replace(/\n/g," ") || (j? `col${j}` : "label")), rows:b.rows.map(r=>r.map(c=>String(c??"").replace(/\n/g," "))), source:"EcoScript result" })}>Save as dataset</button>}</div>
            <div style={{ overflow:"auto", maxHeight:420, border:`1px solid ${C.border}`, borderRadius:6 }}>
              <table style={{ borderCollapse:"collapse", width:"100%", fontSize:12.5, fontVariantNumeric:"tabular-nums" }}>
                <thead><tr>{b.head.map((h,j)=><th key={j} scope="col" style={{ padding:"5px 10px", textAlign:j? "right" : "left", background:C.raised, color:C.text, fontWeight:700, borderBottom:`2px solid ${C.borderHi||C.border}`, whiteSpace:"pre-line", position:"sticky", top:0 }}>{h}</th>)}</tr></thead>
                <tbody>{b.rows.map((r,ri)=><tr key={ri} style={{ background:ri%2? C.raised+"66" : "transparent" }}>{r.map((c,j)=><td key={j} style={{ padding:"4px 10px", textAlign:j && (b.num || num(c))? "right" : "left", color:j===0? C.text : C.text, fontWeight:j===0? 600 : 400, borderBottom:`1px solid ${C.border}`, whiteSpace:"pre-line", fontFamily:j && (b.num||num(c))? C.code : undefined }}>{String(c??"")}</td>)}</tr>)}</tbody>
              </table></div>
            {b.note && <p style={{ ...wbNote, margin:"4px 0 0", fontSize:11.5 }}>{b.note}</p>}</div>;
          return null; })}
      </div></section>)}
  </div>;
}
function WbFormulas({ datasets, setDatasets, formulas, setFormulas, addDataset, isMobile, startId }) {
  const ids=Object.keys(datasets); const [dsId,setDsId]=useState(startId && datasets[startId]? startId : ids[0]||"");
  useEffect(()=>{ if (startId && datasets[startId]) setDsId(startId); },[startId]);
  const d=datasets[dsId]; const taRef=useRef(null);
  const guess=useMemo(()=>{ if (!d) return { unit:"", time:"" }; const ti=detectTimeColumn(d.headers, d.rows); const tname=/year|date|time|period|month|quarter/i.test(ti.name) || d.rows.every(r=>/^(19|20)\d\d/.test(String(r[ti.col]))) ? ti.name : "";
    const unit=d.headers.find((h,j)=>h!==tname && wbNumericShare(d,j)<0.5 && new Set(d.rows.map(r=>r[j])).size<d.rows.length) || ""; return { unit, time:tname }; },[dsId, d?.headers?.join("|")]);
  const [unit,setUnit]=useState(""); const [time,setTime]=useState("");
  useEffect(()=>{ setUnit(guess.unit); setTime(guess.time); setRes(null); },[dsId]);
  const text=formulas[dsId] ?? "# EcoScript: one formula per line,  new_column = formula\n";
  const [,bumpU]=useState(0); const UH=()=>{ let h=FX_UNDO.get(dsId); if (!h){ h={ u:[], r:[], t:0 }; FX_UNDO.set(dsId,h); } return h; };
  // typing within 0.8 s counts as one step; loads and restores are always their own step
  const setText=(v, snap)=>{ const h=UH(); const now=Date.now(); if (v!==text){ if (snap || now-h.t>800 || !h.u.length){ h.u.push(text); if (h.u.length>300) h.u.shift(); } h.t=snap? 0 : now; h.r=[]; } setFormulas(f=>({ ...f, [dsId]:v })); bumpU(x=>x+1); };
  const undo=()=>{ const h=UH(); if (!h.u.length) return; h.r.push(text); const p=h.u.pop(); h.t=0; setFormulas(f=>({ ...f, [dsId]:p })); bumpU(x=>x+1); };
  const redo=()=>{ const h=UH(); if (!h.r.length) return; h.u.push(text); const p=h.r.pop(); h.t=0; setFormulas(f=>({ ...f, [dsId]:p })); bumpU(x=>x+1); };
  const lib=Array.isArray(formulas.__lib)? formulas.__lib : []; const runs=Array.isArray(formulas.__runs)? formulas.__runs : [];
  const [panel,setPanel]=useState(null); const [saveName,setSaveName]=useState(""); const [libMsg,setLibMsg]=useState(""); const [onlyThis,setOnlyThis]=useState(true);
  const flash=(m)=>{ setLibMsg(m); setTimeout(()=>setLibMsg(x=>x===m? "" : x), 3500); };
  const saveScript=()=>{ const name=saveName.trim() || `Script ${lib.length+1}`; const now=new Date().toISOString(); const ex=lib.find(x=>x.name.toLowerCase()===name.toLowerCase());
    const item={ id:ex? ex.id : prjUid(), name, text, at:now, ds:d?.name||"" }; setFormulas(f=>{ const L=Array.isArray(f.__lib)? f.__lib : []; return { ...f, __lib: ex? L.map(x=>x.id===ex.id? item : x) : [item, ...L] }; }); setSaveName(""); flash(ex? `Updated "${name}".` : `Saved "${name}".`); };
  const loadText=(t, label)=>{ setText(t, true); setRes(null); flash(`${label}. Undo puts back what you had.`); };
  const [res,setRes]=useState(null); const [q,setQ]=useState(""); const [view,setView]=useState("table");
  // running indicator: show it first, let the browser paint, then run (the engine works in one go)
  const [running,setRunning]=useState(null); const [lastRun,setLastRun]=useState(null); const [tick,setTick]=useState(0);
  useEffect(()=>{ if (!running) return; const h=setInterval(()=>setTick(x=>x+1),100); return ()=>clearInterval(h); },[running]);
  useEffect(()=>{ setLastRun(null); },[dsId]);
  const nCode=text.split("\n").filter(l=>l.trim() && !/^\s*(#|\*|\/\/)/.test(l)).length;
  const ctlRef=useRef(null); const [prog,setProg]=useState(null);
  const run=()=>{ if (!d || running) return; const t0=performance.now(); const ctl={ stop:false, onProgress:(k,tot,ln,note)=>setProg({ k, tot, ln, note }) }; ctlRef.current=ctl; setProg(null); setRunning({ t0, lines:nCode, rows:d.rows.length }); setLastRun(null);
    requestAnimationFrame(()=>setTimeout(async()=>{ let r; try { r=await fxRunAsync(d, text, { unit, time, datasets }, ctl); } catch(e){ r={ results:[{ line:0, ok:false, error:e.message }], headers:d.headers, rows:d.rows, created:[], outs:[] }; }
      try { runNow(r); } finally { const ms=performance.now()-t0; ctlRef.current=null; setRunning(null); setProg(null); setLastRun(lr=>({ ...(lr||{}), ms, stopped:!!r.stopped })); } }, 20)); };
  const stopRun=()=>{ if (ctlRef.current) ctlRef.current.stop=true; };
  useEffect(()=>()=>{ if (ctlRef.current) ctlRef.current.stop=true; },[]);
  const runNow=(r)=>{ setRes(r);
    if (r.outs && r.outs.some(o=>o.blocks.length)) setView("results"); else if (r.created.length || r.changed) setView("table");
    const nErr=r.results.filter(x=>!x.ok).length, nOk=r.results.length-nErr; const now=new Date().toISOString(); setLastRun({ ok:nOk, err:nErr, at:now });
    setFormulas(f=>{ const R=Array.isArray(f.__runs)? f.__runs : []; const entry={ id:prjUid(), text, at:now, ds:d.name, dsId, ok:nOk, err:nErr };
      const out= R[0] && R[0].text===text && R[0].dsId===dsId? [{ ...R[0], at:now, ok:nOk, err:nErr }, ...R.slice(1)] : [entry, ...R]; return { ...f, __runs:out.slice(0,100) }; }); };
  const nLines=text.split("\n").length; const gutRef=useRef(null);
  const lineState=useMemo(()=>{ const m={}; (res?.results||[]).forEach(r=>{ if (r.line) m[r.line]= r.ok? "ok" : "err"; }); return m; },[res]);
  const goLine=(n)=>{ const ta=taRef.current; if (!ta || !n) return; const ls=text.split("\n"); let a=0; for (let i=0;i<n-1 && i<ls.length;i++) a+=ls[i].length+1; const b=a+(ls[n-1]||"").length; ta.focus(); ta.setSelectionRange(a,b); ta.scrollTop=Math.max(0,(n-3)*20.8); if (gutRef.current) gutRef.current.scrollTop=ta.scrollTop; };
  const insert=(s)=>{ const ta=taRef.current; if (!ta) return setText(text+s); const a=ta.selectionStart, b=ta.selectionEnd; const v=text.slice(0,a)+s+text.slice(b); setText(v); setTimeout(()=>{ ta.focus(); ta.selectionStart=ta.selectionEnd=a+s.length; },0); };
  const [openG,setOpenG]=useState(()=>new Set([0]));
  const fxMatch=(k)=>{ if (!q) return true; const t=q.toLowerCase().trim(); const f=FX_FUNCS[k]; const al=Object.keys(FX_ALIAS).filter(a=>FX_ALIAS[a]===k); return (k+" "+f.d+" "+(f.xl||[]).join(" ")+" "+al.join(" ")).toLowerCase().includes(t); };
  if (!ids.length) return <p style={wbNote}>You need a dataset first. Upload a CSV, save the chart data or pull a table from a PDF in the Datasets tab.</p>;
  const ok=res && res.results.length && res.results.every(r=>r.ok);
  return (
    <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 300px", gap:16 }}>
      <div style={{ minWidth:0 }}>
        <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"2fr 1fr 1fr", gap:8, marginBottom:10 }}>
          <label style={{ fontSize:12, color:C.mid }}>Dataset<select aria-label="Formula dataset" value={dsId} onChange={e=>setDsId(e.target.value)} style={{ ...sel, marginTop:4 }}>{ids.map(k=><option key={k} value={k}>{datasets[k].name}</option>)}</select></label>
          <label style={{ fontSize:12, color:C.mid }}>Group by (unit)<select value={unit} onChange={e=>setUnit(e.target.value)} style={{ ...sel, marginTop:4 }}><option value="">None</option>{d?.headers.map(h=><option key={h} value={h}>{h}</option>)}</select></label>
          <label style={{ fontSize:12, color:C.mid }}>Time column<select value={time} onChange={e=>setTime(e.target.value)} style={{ ...sel, marginTop:4 }}><option value="">Row order</option>{d?.headers.map(h=><option key={h} value={h}>{h}</option>)}</select></label>
        </div>
        <div style={{ fontSize:11, color:C.dim, marginBottom:6 }}>Columns (click to insert): {d?.headers.map(h=><button key={h} type="button" onClick={()=>insert(wbIdent(h))} style={{ ...pill(false), padding:"2px 7px", margin:"2px 3px", fontSize:11 }}>{h}</button>)}</div>
        <div role="toolbar" aria-label="Script tools" style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center", marginBottom:6 }}>
          <button type="button" style={wbSmallBtn()} onClick={undo} disabled={!UH().u.length} title="Undo (Ctrl+Z)">↶ Undo</button>
          <button type="button" style={wbSmallBtn()} onClick={redo} disabled={!UH().r.length} title="Redo (Ctrl+Y)">↷ Redo</button>
          <span style={{ width:1, height:18, background:C.border }}/>
          <input aria-label="Script name" value={saveName} onChange={e=>setSaveName(e.target.value)} onKeyDown={e=>{ if (e.key==="Enter") saveScript(); }} placeholder="Script name" style={{ ...inp, width:150, padding:"5px 9px", fontSize:12 }}/>
          <button type="button" style={wbSmallBtn(C.teal)} onClick={saveScript} title="Save this script under a name (same name = update it)">Save script</button>
          <button type="button" style={wbSmallBtn()} aria-expanded={panel==="lib"} onClick={()=>setPanel(p=>p==="lib"? null : "lib")}>Saved scripts ({lib.length})</button>
          <button type="button" style={wbSmallBtn()} aria-expanded={panel==="hist"} onClick={()=>setPanel(p=>p==="hist"? null : "hist")}>History ({runs.length})</button>
          <button type="button" style={wbSmallBtn()} onClick={()=>loadText("# EcoScript: one formula per line,  new_column = formula\n", "Cleared the box")} title="Start an empty script (Undo brings it back)">New</button>
          {libMsg && <span role="status" style={{ fontSize:12, color:C.teal }}>{libMsg}</span>}
        </div>
        {panel==="lib" && <div style={{ ...card, padding:"8px 12px", marginBottom:8, maxHeight:260, overflowY:"auto" }}>
          {!lib.length? <p style={{ ...wbNote, margin:0 }}>No saved scripts yet. Type a name next to Save script and press it. Saved scripts are kept with the project and work on any dataset.</p>
          : lib.map(x=><div key={x.id} style={{ display:"flex", gap:8, alignItems:"center", padding:"6px 0", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ minWidth:0, flex:1 }}><div style={{ fontSize:12.5, fontWeight:600, color:C.text }}>{x.name}</div>
              <div style={{ fontSize:11, color:C.dim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{x.text.split("\n").filter(l=>l.trim() && !l.trim().startsWith("#")).length} lines · saved {fxAgo(x.at)}{x.ds? ` · made on ${x.ds}` : ""} · <code>{(x.text.split("\n").find(l=>l.trim() && !l.trim().startsWith("#"))||"").slice(0,70)}</code></div></div>
            <button type="button" style={wbSmallBtn(C.teal)} onClick={()=>loadText(x.text, `Loaded "${x.name}"`)}>Load</button>
            <button type="button" style={wbSmallBtn()} onClick={()=>{ setText(text + (text.endsWith("\n")? "" : "\n") + x.text, true); flash(`Added "${x.name}" at the end.`); }} title="Add this script below what is in the box">Add below</button>
            <button type="button" aria-label={`Delete script ${x.name}`} style={wbSmallBtn(C.red)} onClick={()=>{ setFormulas(f=>({ ...f, __lib:(f.__lib||[]).filter(y=>y.id!==x.id) })); flash(`Deleted "${x.name}".`); }}>✕</button></div>)}
        </div>}
        {panel==="hist" && <div style={{ ...card, padding:"8px 12px", marginBottom:8, maxHeight:300, overflowY:"auto" }}>
          <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:4 }}><label style={{ fontSize:12, color:C.mid, display:"flex", gap:5, alignItems:"center" }}><input type="checkbox" checked={onlyThis} onChange={e=>setOnlyThis(e.target.checked)}/>Only this dataset</label>
            <span style={{ fontSize:11, color:C.dim }}>Every run is kept here (last 100), with the project.</span>
            {runs.length>0 && <button type="button" style={{ ...wbSmallBtn(C.red), marginLeft:"auto" }} onClick={()=>{ setFormulas(f=>({ ...f, __runs:[] })); flash("History cleared."); }}>Clear history</button>}</div>
          {(()=>{ const list=runs.filter(x=>!onlyThis || x.dsId===dsId); if (!list.length) return <p style={{ ...wbNote, margin:0 }}>No runs yet{onlyThis? " for this dataset" : ""}. Each time you press Run script, the script is added here.</p>;
            return list.map(x=><div key={x.id} style={{ display:"flex", gap:8, alignItems:"center", padding:"6px 0", borderBottom:`1px solid ${C.border}` }}>
              <div style={{ minWidth:0, flex:1 }}><div style={{ fontSize:12, color:C.text }}>{fxAgo(x.at)} · {x.ds} · <span style={{ color:x.err? C.red : C.teal }}>{x.err? `${x.err} line${x.err>1?"s":""} with errors` : `${x.ok} line${x.ok===1?"":"s"} OK`}</span>{x.text===text && x.dsId===dsId? <span style={{ color:C.dim }}> · same as the box</span> : null}</div>
                <code style={{ fontSize:11, color:C.mid, display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{x.text.split("\n").filter(l=>l.trim() && !l.trim().startsWith("#")).join("  ·  ").slice(0,160)}</code></div>
              <button type="button" style={wbSmallBtn(C.teal)} disabled={x.text===text} onClick={()=>loadText(x.text, `Restored the script from ${fxAgo(x.at)}`)}>Restore</button></div>); })()}
        </div>}
        <div style={{ display:"flex", border:`1px solid ${running? C.gold : C.border}`, borderRadius:6, background:C.inputBg, overflow:"hidden", position:"relative" }}>
          {running && <div aria-hidden="true" style={{ position:"absolute", top:0, left:0, right:0, height:3, overflow:"hidden", zIndex:2 }}><div style={{ position:"absolute", top:0, width:"35%", height:3, background:C.gold, animation:"wbbar 1s ease-in-out infinite" }}/></div>}
          <div ref={gutRef} aria-hidden="true" style={{ flex:"none", minWidth:40, padding:"9px 0", overflow:"hidden", background:C.raised, borderRight:`1px solid ${C.border}`, fontFamily:C.code, fontSize:13, lineHeight:1.6, textAlign:"right", userSelect:"none" }}>
            {Array.from({ length:nLines }, (_,i)=>{ const st=lineState[i+1]; return <div key={i} onClick={()=>goLine(i+1)} title={st==="err"? "This line has an error (see below)" : st==="ok"? "This line ran" : ""} style={{ padding:"0 8px 0 6px", cursor:"pointer", color:st==="err"? "#fff" : st==="ok"? C.teal : C.dim, background:st==="err"? C.red : "transparent", fontWeight:st? 600 : 400 }}>{i+1}</div>; })}
          </div>
          <textarea ref={taRef} aria-label="Formulas" value={text} onChange={e=>setText(e.target.value)} wrap="off" onScroll={e=>{ if (gutRef.current) gutRef.current.scrollTop=e.target.scrollTop; }}
            onKeyDown={e=>{ const k=e.key.toLowerCase(); if (e.key==="Escape" && running) { e.preventDefault(); stopRun(); } else if ((e.ctrlKey||e.metaKey) && e.key==="Enter") { e.preventDefault(); run(); } else if ((e.ctrlKey||e.metaKey) && k==="z" && !e.shiftKey){ e.preventDefault(); undo(); } else if ((e.ctrlKey||e.metaKey) && (k==="y" || (k==="z" && e.shiftKey))){ e.preventDefault(); redo(); } else if ((e.ctrlKey||e.metaKey) && k==="s"){ e.preventDefault(); saveScript(); } }} spellCheck={false}
            rows={10} style={{ ...inp, border:"none", borderRadius:0, flex:1, minWidth:0, fontFamily:C.code, fontSize:13, lineHeight:1.6, resize:"vertical", whiteSpace:"pre", overflowX:"auto" }} placeholder={"gdp_pc = gdp / population\ngrowth = growth_rate(gdp)\nto_sum gdp inflation\nto_reg growth inflation, robust\nto_scatter growth inflation"}/>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:8, flexWrap:"wrap" }}>
          <button type="button" style={{ ...btn(), display:"inline-flex", gap:8, alignItems:"center", opacity:running? 0.85 : 1, cursor:running? "progress" : "pointer" }} onClick={run} disabled={!!running} aria-busy={!!running}>
            {running && <span aria-hidden="true" style={{ width:13, height:13, border:"2px solid currentColor", borderRightColor:"transparent", borderRadius:"50%", display:"inline-block", animation:"wbspin .7s linear infinite" }}/>}
            {running? "Running…" : "▶ Run script"}</button>
          {running && <button type="button" onClick={stopRun} style={{ ...btn(C.red), display:"inline-flex", gap:6, alignItems:"center" }} title="Stop the script (Esc)"><span aria-hidden="true" style={{ width:10, height:10, background:"currentColor", borderRadius:2, display:"inline-block" }}/>Stop</button>}
          <style>{"@keyframes wbspin{to{transform:rotate(360deg)}}@keyframes wbbar{0%{left:-35%}100%{left:100%}}"}</style>
          <span role="status" aria-live="polite" style={{ fontSize:12, fontWeight:600, color:running? C.gold : lastRun && lastRun.err? C.red : C.teal }}>
            {running? `Running${prog? ` line ${prog.ln}${prog.note? `: ${prog.note}` : ` (${prog.k.toLocaleString()} of ${prog.tot.toLocaleString()} steps)`}` : ` ${running.lines} line${running.lines===1?"":"s"}`} on ${running.rows.toLocaleString()} rows · ${((performance.now()-running.t0)/1000).toFixed(1)} s${tick<0? "" : ""}`
              : lastRun && lastRun.ok!=null? `${lastRun.stopped? "■ Stopped: " : ""}${lastRun.err? `✕ ${lastRun.err} line${lastRun.err>1?"s":""} with errors, ${lastRun.ok} OK` : `✓ Finished: ${lastRun.ok} line${lastRun.ok===1?"":"s"} OK`}${lastRun.ms!=null? ` in ${lastRun.ms<1000? Math.max(1,Math.round(lastRun.ms))+" ms" : (lastRun.ms/1000).toFixed(1)+" s"}` : ""}` : ""}</span><span style={{ fontSize:11, color:C.dim }}>Ctrl + Enter runs · Ctrl + Z undo · Ctrl + Y redo · Ctrl + S save script · click a line number to select that line</span>
          {res && (res.created.length>0 || res.changed) && ok && <>
            <button type="button" style={wbSmallBtn(C.teal)} onClick={()=>{ setDatasets(ds=>({ ...ds, [dsId]:{ ...ds[dsId], headers:res.headers, rows:res.rows, updated:new Date().toISOString() } })); setRes(null); }}>{res.changed? "Save changes to this dataset" : "Add columns to this dataset"}</button>
            <button type="button" style={wbSmallBtn()} onClick={()=>addDataset({ name:`${d.name} (calculated)`, headers:res.headers, rows:res.rows, source:"formula" })}>Save as a new dataset</button>
          </>}
          {res && ok && !res.created.length && !res.changed && res.results.some(r=>!r.stata) && <button type="button" style={wbSmallBtn(C.teal)} onClick={()=>{ setDatasets(ds=>({ ...ds, [dsId]:{ ...ds[dsId], headers:res.headers, rows:res.rows, updated:new Date().toISOString() } })); setRes(null); }}>Save changes to this dataset</button>}
        </div>
        {res && <div style={{ margin:"10px 0", display:"flex", flexDirection:"column", gap:3, maxHeight:180, overflowY:"auto" }} aria-live="polite">
          {res.results.map((r,i)=><div key={i} onClick={()=>goLine(r.line)} title="Click to select this line in the box" style={{ fontSize:12, color:r.ok? C.teal : C.red, cursor:"pointer" }}>Line {r.line}: {r.ok? (r.cmd? r.msg : `${r.name} ${r.created? "created" : "replaced"} · ${r.filled.toLocaleString()} of ${r.n.toLocaleString()} rows have a value`) : `${r.name? r.name+": " : ""}${r.error}`}</div>)}
          {res.results.some(r=>r.ok) && !ok && <div style={{ fontSize:12, color:C.mid }}>Fix the lines in red before saving.</div>}
        </div>}
        <div role="tablist" aria-label="Output" style={{ display:"flex", gap:4, borderBottom:`1px solid ${C.border}`, margin:"6px 0 10px" }}>
          {[["results",`Results${res && res.outs && res.outs.length? ` (${res.outs.length})` : ""}`],["table","Table"]].map(([k,l])=><button key={k} type="button" role="tab" aria-selected={view===k} onClick={()=>setView(k)} style={{ background:"none", border:"none", borderBottom:`2px solid ${view===k? C.gold : "transparent"}`, color:view===k? C.text : C.mid, fontWeight:view===k? 700 : 500, padding:"6px 12px", cursor:"pointer", fontSize:13 }}>{l}</button>)}
        </div>
        {running && <div role="status" style={{ display:"flex", gap:8, alignItems:"center", padding:"10px 12px", margin:"0 0 8px", border:`1px dashed ${C.gold}`, borderRadius:6, color:C.text, fontSize:12.5 }}><span aria-hidden="true" style={{ width:14, height:14, border:`2px solid ${C.gold}`, borderRightColor:"transparent", borderRadius:"50%", display:"inline-block", animation:"wbspin .7s linear infinite" }}/>Running your script… results will appear here.</div>}
        {view==="results"? <WbResults outs={res && res.outs} onClear={()=>setRes(r=>r? { ...r, outs:[] } : r)} addDataset={addDataset} goLine={goLine}/>
          : <WbGrid label="Formula result" tab={res && res.results.some(r=>r.ok)? res : d} highlight={res? res.results.filter(r=>r.ok).map(r=>r.name) : []} height={360}/>}
      </div>
      <aside aria-label="Function help" style={{ ...card, padding:"12px 14px", alignSelf:"start", maxHeight:640, overflow:"auto" }}>
        <h3 style={wbH}>How to write EcoScript</h3>
        <p style={{ ...wbNote, marginTop:0 }}><strong>EcoScript</strong> is EcoScope's formula language: plain-English function names that anyone can read, with Excel names accepted too.</p>
        <p style={{ ...wbNote, marginTop:0 }}>One per line: <code>new_column = formula</code>. The formula works on every row at once, so write column names, not cells like A2. Use + − * / ^ and brackets; compare with &gt; &lt; &gt;= &lt;= == (or =) and != (or &lt;&gt;); combine with <code>and</code> / <code>or</code>; join text with <code>&amp;</code>. Text goes in quotes: <code>region == "Africa"</code>. Column names with symbols, like <code>TBL_Index_(2024-13)</code>, can be typed as they are; square brackets <code>[ ]</code> also work. A new column name can have symbols too. Lines starting with # are notes. Later lines can use columns made by earlier ones.</p>
        <p style={{ ...wbNote, marginTop:0 }}>You can also tidy the table between formulas: <code>drop columns a, b</code> · <code>keep columns country, year, gdp</code> · <code>drop rows where year &lt; 2010</code> · <code>keep rows where region == "West"</code>. Nothing changes in your dataset until you press Save.</p>
        <p style={{ ...wbNote, marginTop:0 }}>Function names are plain English. Excel names work too: <code>AVERAGE</code>, <code>SUMIF</code>, <code>XLOOKUP</code>, <code>IFERROR</code>, <code>TEXT</code> and most others. With a unit chosen above, column and over-time functions work within each unit.</p>
        <p style={{ ...wbNote, marginTop:0 }}><strong>Stata users:</strong> every common Stata command has an EcoScript twin that starts with <code>to_</code>: <code>regress</code> is <code>to_reg</code>, <code>summarize</code> is <code>to_sum</code>, <code>tabulate</code> is <code>to_tab</code>. Same syntax (<code>varlist if … in … , options</code>); results, tables and 2D/3D charts open in the Results tab. Lines starting with <code>*</code> or <code>//</code> are notes, as in a do-file.</p>
        <input aria-label="Search functions" value={q} onChange={e=>setQ(e.target.value)} placeholder={`Search ${Object.keys(FX_FUNCS).filter(k=>!FX_FUNCS[k].hide).length} functions, ${Object.keys(ST_CMDS).length} to_ commands, or an Excel or Stata name`} style={{ ...inp, padding:"6px 10px", marginBottom:8 }}/>
        {(()=>{ const t=q.toLowerCase().trim(); const cs=FX_COMMANDS.filter(c=>!t || (c.ex+" "+c.d+" "+c.k).toLowerCase().includes(t)); if (!cs.length) return null; const open=!!q || openG.has("cmd");
          return <div style={{ marginBottom:6 }}>
            <button type="button" aria-expanded={open} onClick={()=>setOpenG(s0=>{ const n=new Set(s0); n.has("cmd")? n.delete("cmd") : n.add("cmd"); return n; })} style={{ display:"flex", justifyContent:"space-between", width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, padding:"6px 0", cursor:"pointer", color:C.text, fontSize:11.5, fontWeight:700, textTransform:"uppercase", letterSpacing:".04em" }}>Table commands (drop and keep)<span style={{ color:C.dim, fontWeight:500 }}>{cs.length} {open? "▾" : "▸"}</span></button>
            {open && cs.map(c=><button key={c.ex} type="button" onClick={()=>insert(c.ins)} title="Click to insert" style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, padding:"5px 0", cursor:"pointer" }}>
              <code style={{ color:C.gold, fontSize:12 }}>{c.ex}</code><div style={{ fontSize:11.5, color:C.mid }}>{c.d}</div></button>)}</div>; })()}
        {ST_GROUPS.map(g=>{ const t=q.toLowerCase().trim(); const ks=Object.keys(ST_CMDS).filter(k=>ST_CMDS[k].g===g && (!t || (`to_${k} ${ST_CMDS[k].st} ${ST_CMDS[k].d} ${ST_CMDS[k].syn}`).toLowerCase().includes(t))); if (!ks.length) return null; const key="st:"+g; const open=!!q || openG.has(key);
          return <div key={key} style={{ marginBottom:6 }}>
            <button type="button" aria-expanded={open} onClick={()=>setOpenG(s0=>{ const n=new Set(s0); n.has(key)? n.delete(key) : n.add(key); return n; })} style={{ display:"flex", justifyContent:"space-between", width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, padding:"6px 0", cursor:"pointer", color:C.text, fontSize:11.5, fontWeight:700, textTransform:"uppercase", letterSpacing:".04em" }}>Stata-style · {g}<span style={{ color:C.dim, fontWeight:500 }}>{ks.length} {open? "▾" : "▸"}</span></button>
            {open && ks.map(k=>{ const c=ST_CMDS[k]; return <button key={k} type="button" onClick={()=>insert(`to_${k} `)} title="Click to insert" style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, padding:"5px 0", cursor:"pointer" }}>
              <code style={{ color:C.gold, fontSize:12 }}>{c.syn}</code><div style={{ fontSize:11.5, color:C.mid }}>{c.d}</div><div style={{ fontSize:10.5, color:C.dim }}>Stata: {c.st}</div></button>; })}</div>; })}
        {FX_GROUPS.map((g,gi)=>{ const ks=Object.keys(FX_FUNCS).filter(k=>!FX_FUNCS[k].hide && FX_FUNCS[k].g===gi && fxMatch(k)); if (!ks.length) return null; const open=!!q || openG.has(gi);
          return <div key={g} style={{ marginBottom:6 }}>
            <button type="button" aria-expanded={open} onClick={()=>setOpenG(s0=>{ const n=new Set(s0); n.has(gi)? n.delete(gi) : n.add(gi); return n; })} style={{ display:"flex", justifyContent:"space-between", width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, padding:"6px 0", cursor:"pointer", color:C.text, fontSize:11.5, fontWeight:700, textTransform:"uppercase", letterSpacing:".04em" }}>{g}<span style={{ color:C.dim, fontWeight:500 }}>{ks.length} {open? "▾" : "▸"}</span></button>
            {open && ks.map(k=>{ const f=FX_FUNCS[k]; return <button key={k} type="button" onClick={()=>insert(`${k}(`)} title="Click to insert" style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, padding:"5px 0", cursor:"pointer" }}>
              <code style={{ color:C.gold, fontSize:12 }}>{f.ex}</code><div style={{ fontSize:11.5, color:C.mid }}>{f.d}</div>
              {f.xl && <div style={{ fontSize:10.5, color:C.dim }}>Excel: {f.xl.join(", ")}</div>}</button>; })}</div>; })}
        {q && !Object.keys(FX_FUNCS).some(k=>!FX_FUNCS[k].hide && fxMatch(k)) && !FX_COMMANDS.some(c=>(c.ex+" "+c.d+" "+c.k).toLowerCase().includes(q.toLowerCase().trim())) && !Object.keys(ST_CMDS).some(k=>(`to_${k} ${ST_CMDS[k].st} ${ST_CMDS[k].d}`).toLowerCase().includes(q.toLowerCase().trim())) && <p style={wbNote}>Nothing matches "{q}". Try another word, for example total, average, date, text or look up.</p>}
      </aside>
    </div>
  );
}
// ── Text coding ──
const COD_COLORS=["#6ea8fe","#f0a950","#3ecf8e","#f26d78","#b39ddb","#56c7d4","#e6d35a","#e38fc0","#ff8a5b","#8fd694"];
const codEmpty = () => ({ docs:[], codes:[], segMode:"paragraph", A:{}, B:{}, coder:"A", skip:"" });
function WbCoding({ coding, setCoding, datasets, addDataset, isMobile }) {
  const cd={ ...codEmpty(), ...(coding||{}) }; const set=(patch)=>setCoding(c=>({ ...codEmpty(), ...(c||{}), ...(typeof patch==="function"? patch({ ...codEmpty(), ...(c||{}) }) : patch) }));
  const [view,setView]=useState(cd.docs.length? "code" : "docs"); const [docSel,setDocSel]=useState(cd.docs[0]?.id||null); const [paste,setPaste]=useState(""); const [pname,setPname]=useState(""); const [pgroup,setPgroup]=useState("");
  const [busy,setBusy]=useState(""); const [newCode,setNewCode]=useState({ name:"", keywords:"" }); const [filter,setFilter]=useState(""); const [level,setLevel]=useState("document");
  const [tabSrc,setTabSrc]=useState({ ds:"", text:"", id:"", group:"" }); const fileRef=useRef(null);
  const [picked,setPicked]=useState(()=>new Set()); // documents ticked for removal
  const removeDocs=(ids)=>{ const gone=new Set(ids); const strip=(m)=>Object.fromEntries(Object.entries(m||{}).filter(([k])=>!gone.has(k.split(":")[0])));
    set(c=>({ docs:c.docs.filter(x=>!gone.has(x.id)), A:strip(c.A), B:strip(c.B) })); setPicked(p=>new Set([...p].filter(x=>!gone.has(x)))); if (gone.has(docSel)) setDocSel(null); };
  const skip=cd.skip.split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
  const segs=useMemo(()=>codAllSegments(cd.docs, cd.segMode).filter(s=>!s.speaker || !skip.includes(s.speaker.toLowerCase())),[cd.docs, cd.segMode, cd.skip]);
  const assign=cd[cd.coder]||{}; const other=cd.coder==="A"? cd.B : cd.A;
  const toggle=(key,cid)=>set(c=>{ const m={ ...c[c.coder] }; const cur=m[key]||[]; m[key]=cur.includes(cid)? cur.filter(x=>x!==cid) : [...cur, cid]; return { [c.coder]:m }; });
  const addDoc=(docs)=>{ set(c=>({ docs:[...c.docs, ...docs] })); setDocSel(docs[0]?.id); };
  const readFiles=async(files)=>{ setBusy("Reading files…"); const out=[];
    for (const f of files){ try { let text="";
        if (/\.pdf$/i.test(f.name)) { const lib=await wbPdfjs(); const doc=await lib.getDocument({ data:new Uint8Array(await f.arrayBuffer()) }).promise; const parts=[];
          for (let p=1;p<=Math.min(doc.numPages,300);p++){ const pg=await doc.getPage(p); const tc=await pg.getTextContent(); let last=null, line=""; const lines=[];
            tc.items.forEach(it=>{ const y=Math.round(it.transform[5]); if (last!=null && Math.abs(y-last)>2){ lines.push(line); line=""; } line+=(line && !line.endsWith(" ")? " " : "")+it.str; last=y; }); lines.push(line);
            parts.push(lines.join("\n").replace(/\n(?=[a-z])/g," ")); }
          text=parts.join("\n\n"); }
        else if (/\.docx$/i.test(f.name)) { const m=await wbMammoth(); const r=await m.extractRawText({ arrayBuffer:await f.arrayBuffer() }); text=r.value; }
        else text=await f.text();
        if (text.trim()) out.push({ id:prjUid(), name:f.name.replace(/\.[^.]+$/,""), group:"", text });
      } catch(e){ alert(`Could not read ${f.name}. ${e?.message||""}`); } }
    setBusy(""); if (out.length) { addDoc(out); setView("code"); } };
  const sug=useMemo(()=>codSuggest(segs, cd.codes),[segs, cd.codes]);
  const pending=segs.filter(s=>sug[s.key] && assign[s.key]===undefined).length;
  const acceptAll=()=>set(c=>{ const m={ ...c[c.coder] }; segs.forEach(s=>{ if (sug[s.key] && m[s.key]===undefined) m[s.key]=[...sug[s.key]]; }); return { [c.coder]:m }; });
  const summary=codSummary(cd.docs, segs, cd.codes, assign); const kap=useMemo(()=>codKappa(segs.map(s=>s.key), cd.A, cd.B, cd.codes),[segs, cd.A, cd.B, cd.codes]);
  const words=useMemo(()=>view==="codes"? codTopWords(segs, 40) : [],[view, segs]);
  const docSegs=segs.filter(s=>s.docId===docSel && (!filter || (filter==="none"? !(assign[s.key]||[]).length : (assign[s.key]||[]).includes(filter))));
  const hl=(text)=>{ const parts=[]; const res=cd.codes.map(c=>({ c, re:codRuleRe(c.keywords) })).filter(x=>x.re); if (!res.length) return text;
    const big=new RegExp(res.map(x=>x.re.source.replace(/^\(\^\|\[\^\\w\]\)/,"").replace(/\(\?=\$\|\[\^\\w\]\)$/,"")).join("|"),"gi"); let last=0; let m;
    while ((m=big.exec(text)) && parts.length<200){ if (m[0]==="") { big.lastIndex++; continue; } parts.push(text.slice(last, m.index)); const c=res.find(x=>x.re.test(" "+m[0]+" "))?.c; parts.push(<mark key={m.index} style={{ background:`${c?.color||C.gold}44`, color:"inherit", borderRadius:2 }}>{m[0]}</mark>); last=m.index+m[0].length; }
    parts.push(text.slice(last)); return parts; };
  const SEG={ paragraph:"Paragraphs", sentence:"Sentences", line:"Lines", turn:"Speaker turns (Name: …)" };
  return (
    <div>
      <div role="tablist" aria-label="Text coding steps" style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
        {[["docs",`1. Documents (${cd.docs.length})`],["codes",`2. Codebook (${cd.codes.length})`],["code","3. Code the text"],["results","4. Results and data"]].map(([k,l])=><button key={k} role="tab" aria-selected={view===k} type="button" onClick={()=>setView(k)} style={{ ...pill(view===k), padding:"7px 12px" }}>{l}</button>)}
      </div>
      {view==="docs" && <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:16 }}>
        <div style={card}>
          <h3 style={wbH}>Add documents</h3>
          <p style={{ ...wbNote, marginTop:0 }}>Interview transcripts, open survey answers, reports or field notes. Each document becomes one row in the document-level data. Upload .txt, .docx or .pdf files, or paste text.</p>
          <button type="button" style={wbSmallBtn()} onClick={()=>fileRef.current?.click()} disabled={!!busy}>Upload files</button>{busy && <span role="status" style={{ fontSize:12, color:C.gold, marginLeft:8 }}>{busy}</span>}
          <input ref={fileRef} type="file" multiple accept=".txt,.md,.docx,.pdf,text/plain" hidden onChange={e=>{ readFiles([...e.target.files]); e.target.value=""; }}/>
          <div style={{ marginTop:12, display:"grid", gap:6 }}>
            <input aria-label="Document name" value={pname} onChange={e=>setPname(e.target.value)} placeholder="Name, for example Respondent 1" style={inp}/>
            <input aria-label="Group" value={pgroup} onChange={e=>setPgroup(e.target.value)} placeholder="Group (optional), for example Farmer, Northern Region" style={inp}/>
            <textarea aria-label="Paste text" value={paste} onChange={e=>setPaste(e.target.value)} rows={6} placeholder="Paste text here" style={{ ...inp, resize:"vertical" }}/>
            <button type="button" style={btn()} disabled={!paste.trim()} onClick={()=>{ addDoc([{ id:prjUid(), name:pname.trim()||`Document ${cd.docs.length+1}`, group:pgroup.trim(), text:paste }]); setPaste(""); setPname(""); setPgroup(""); }}>Add document</button>
          </div>
          {Object.keys(datasets).length>0 && <div style={{ marginTop:14 }}>
            <h3 style={wbH}>Or use a text column from a dataset</h3>
            <div style={{ display:"grid", gap:6 }}>
              <select aria-label="Dataset" value={tabSrc.ds} onChange={e=>setTabSrc({ ds:e.target.value, text:"", id:"", group:"" })} style={sel}><option value="">Choose a dataset</option>{Object.keys(datasets).map(k=><option key={k} value={k}>{datasets[k].name}</option>)}</select>
              {tabSrc.ds && datasets[tabSrc.ds] && <>{[["text","Text column"],["id","Name or ID column (optional)"],["group","Group column (optional)"]].map(([k,l])=><select key={k} aria-label={l} value={tabSrc[k]} onChange={e=>setTabSrc(s=>({ ...s, [k]:e.target.value }))} style={sel}><option value="">{l}</option>{datasets[tabSrc.ds].headers.map(h=><option key={h} value={h}>{h}</option>)}</select>)}
                <button type="button" style={btn()} disabled={!tabSrc.text} onClick={()=>{ const docs=codDocsFromTable(datasets[tabSrc.ds], tabSrc.text, tabSrc.id, tabSrc.group); if (!docs.length) return alert("That column is empty."); addDoc(docs); setView("codes"); }}>Add one document per row</button></>}
            </div>
          </div>}
        </div>
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:8 }}>
            <h3 style={{ ...wbH, margin:0 }}>Documents</h3>
            {cd.docs.length>0 && <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
              <label style={{ display:"flex", gap:5, alignItems:"center", fontSize:12, color:C.mid }}><input type="checkbox" aria-label="Select all documents" checked={picked.size>0 && picked.size===cd.docs.length} ref={el=>{ if (el) el.indeterminate=picked.size>0 && picked.size<cd.docs.length; }} onChange={e=>setPicked(e.target.checked? new Set(cd.docs.map(d=>d.id)) : new Set())}/> Select all</label>
              {picked.size>0 && <button type="button" style={wbSmallBtn(C.red)} onClick={()=>{ if (window.confirm(`Remove ${picked.size} selected document${picked.size>1?"s":""} and their coding? You can undo this from Project history.`)) removeDocs([...picked]); }}>Remove selected ({picked.size})</button>}
              <button type="button" style={wbSmallBtn(C.red)} onClick={()=>{ if (window.confirm(`Remove all ${cd.docs.length} documents and their coding? The codebook is kept. You can undo this from Project history.`)) removeDocs(cd.docs.map(d=>d.id)); }}>Remove all</button>
            </div>}
          </div>
          {!cd.docs.length && <p style={wbNote}>None yet.</p>}
          {cd.docs.map(d=><div key={d.id} style={{ display:"flex", gap:6, alignItems:"center", marginBottom:6 }}>
            <input type="checkbox" aria-label={`Select ${d.name}`} checked={picked.has(d.id)} onChange={()=>setPicked(p=>{ const n=new Set(p); n.has(d.id)? n.delete(d.id) : n.add(d.id); return n; })}/>
            <input aria-label="Document name" value={d.name} onChange={e=>{ const v=e.target.value; set(c=>({ docs:c.docs.map(x=>x.id===d.id? { ...x, name:v } : x) })); }} style={{ ...inp, padding:"6px 8px" }}/>
            <input aria-label="Group" value={d.group||""} placeholder="Group" onChange={e=>{ const v=e.target.value; set(c=>({ docs:c.docs.map(x=>x.id===d.id? { ...x, group:v } : x) })); }} style={{ ...inp, padding:"6px 8px", maxWidth:130 }}/>
            <span style={{ fontSize:11, color:C.dim, whiteSpace:"nowrap" }}>{(d.text.match(/\S+/g)||[]).length} words</span>
            <button type="button" aria-label={`Remove ${d.name}`} onClick={()=>{ if (window.confirm(`Remove "${d.name}" and its coding?`)) removeDocs([d.id]); }} style={{ background:"none", border:"none", color:C.red, cursor:"pointer" }}>✕</button>
          </div>)}
          {cd.docs.length>0 && <div style={{ marginTop:12, display:"grid", gap:6 }}>
            <label style={{ fontSize:12, color:C.mid }}>Split each document into<select value={cd.segMode} onChange={e=>{ const v=e.target.value; if ((Object.keys(cd.A).length || Object.keys(cd.B).length) && !window.confirm("Changing how text is split clears the coding done so far. Continue?")) return; set({ segMode:v, A:{}, B:{} }); }} style={{ ...sel, marginTop:4 }}>{Object.entries(SEG).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
            {cd.segMode==="turn" && <label style={{ fontSize:12, color:C.mid }}>Speakers to leave out (comma separated)<input value={cd.skip} onChange={e=>set({ skip:e.target.value })} placeholder="Interviewer, Moderator" style={{ ...inp, marginTop:4 }}/></label>}
            <div style={{ fontSize:12, color:C.mid }}>{segs.length} segments to code.</div>
          </div>}
        </div>
      </div>}
      {view==="codes" && <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 280px", gap:16 }}>
        <div>
          <p style={{ ...wbNote, marginTop:0 }}>A code is a theme you want to count, such as "Cost of inputs" or "Access to credit". Keywords are optional: they suggest the code where the words appear (use * for word endings, so <code>price*</code> matches price, prices and pricing). You still decide on every segment.</p>
          {cd.codes.map((c,k)=><div key={c.id} style={{ display:"grid", gridTemplateColumns:"14px 1fr 2fr 24px", gap:6, alignItems:"center", marginBottom:6 }}>
            <span style={{ width:12, height:12, borderRadius:3, background:c.color }}/>
            <input aria-label="Code name" value={c.name} onChange={e=>{ const v=e.target.value; set(x=>({ codes:x.codes.map(y=>y.id===c.id? { ...y, name:v } : y) })); }} style={{ ...inp, padding:"6px 8px" }}/>
            <input aria-label="Keywords" value={c.keywords||""} placeholder="keywords, comma separated" onChange={e=>{ const v=e.target.value; set(x=>({ codes:x.codes.map(y=>y.id===c.id? { ...y, keywords:v } : y) })); }} style={{ ...inp, padding:"6px 8px" }}/>
            <button type="button" aria-label={`Delete code ${c.name}`} onClick={()=>{ if (window.confirm(`Delete the code "${c.name}"? It is removed from every segment.`)) set(x=>{ const strip=(m)=>Object.fromEntries(Object.entries(m).map(([k2,v])=>[k2, v.filter(id=>id!==c.id)])); return { codes:x.codes.filter(y=>y.id!==c.id), A:strip(x.A), B:strip(x.B) }; }); }} style={{ background:"none", border:"none", color:C.red, cursor:"pointer" }}>✕</button>
          </div>)}
          <form onSubmit={e=>{ e.preventDefault(); if (!newCode.name.trim()) return; set(x=>({ codes:[...x.codes, { id:prjUid(), name:newCode.name.trim(), keywords:newCode.keywords, color:COD_COLORS[x.codes.length%COD_COLORS.length] }] })); setNewCode({ name:"", keywords:"" }); }}
            style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 2fr auto", gap:6, marginTop:10 }}>
            <input aria-label="New code name" value={newCode.name} onChange={e=>setNewCode(n=>({ ...n, name:e.target.value }))} placeholder="New code, for example Access to credit" style={inp}/>
            <input aria-label="New code keywords" value={newCode.keywords} onChange={e=>setNewCode(n=>({ ...n, keywords:e.target.value }))} placeholder="loan*, credit, bank, susu" style={inp}/>
            <button type="submit" style={btn()}>Add code</button>
          </form>
        </div>
        <aside style={{ ...card, padding:"12px 14px" }}>
          <h3 style={wbH}>Most frequent words</h3>
          <p style={{ ...wbNote, marginTop:0 }}>Ideas for codes and keywords. Click a word to start a code with it.</p>
          <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>{words.map(w=><button key={w.word} type="button" onClick={()=>setNewCode(n=>({ name:n.name||w.word[0].toUpperCase()+w.word.slice(1), keywords:n.keywords? `${n.keywords}, ${w.word}` : w.word }))} style={{ ...pill(false), padding:"2px 7px", fontSize:11 }}>{w.word} <span style={{ color:C.dim }}>{w.count}</span></button>)}</div>
        </aside>
      </div>}
      {view==="code" && (!cd.docs.length? <p style={wbNote}>Add documents first.</p> : !cd.codes.length? <p style={wbNote}>Add at least one code in the codebook first.</p> :
        <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"220px 1fr", gap:14 }}>
          <div>
            <label style={{ fontSize:12, color:C.mid }}>Coder<select value={cd.coder} onChange={e=>set({ coder:e.target.value })} style={{ ...sel, marginTop:4 }}><option value="A">Coder A (main)</option><option value="B">Coder B (second coder)</option></select></label>
            <p style={{ ...wbNote, fontSize:11 }}>A second person can code the same text as coder B to measure agreement.</p>
            <div role="listbox" aria-label="Documents" style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:420, overflow:"auto" }}>
              {cd.docs.map(d=>{ const ss=segs.filter(s=>s.docId===d.id); const done=ss.filter(s=>assign[s.key]!==undefined).length; return <button key={d.id} type="button" role="option" aria-selected={docSel===d.id} onClick={()=>setDocSel(d.id)} style={{ ...pill(docSel===d.id), textAlign:"left" }}>
                <div style={{ overflow:"hidden", textOverflow:"ellipsis" }}>{d.name}</div><div style={{ fontSize:10.5, color:C.dim }}>{done} of {ss.length} reviewed</div></button>; })}
            </div>
          </div>
          <div style={{ minWidth:0 }}>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center", marginBottom:10 }}>
              {pending>0 && <button type="button" style={wbSmallBtn(C.teal)} onClick={acceptAll} title="Apply the keyword suggestions to every segment you have not reviewed yet">Accept {pending} keyword suggestions</button>}
              <select aria-label="Show" value={filter} onChange={e=>setFilter(e.target.value)} style={{ ...sel, width:"auto", padding:"5px 8px", fontSize:12 }}><option value="">All segments</option><option value="none">Not coded</option>{cd.codes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:560, overflow:"auto", paddingRight:4 }}>
              {docSegs.map(s=>{ const mine=assign[s.key]; const sg=sug[s.key]||[]; const rev=mine!==undefined; return (
                <div key={s.key} style={{ border:`1px solid ${rev? C.borderHi : C.border}`, borderLeft:`4px solid ${rev && mine.length? (cd.codes.find(c=>c.id===mine[0])?.color||C.gold) : C.border}`, borderRadius:6, padding:"8px 10px", background:C.card }}>
                  <div style={{ fontSize:13, color:C.text, lineHeight:1.6, whiteSpace:"pre-wrap" }}>{hl(s.text)}</div>
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:6, alignItems:"center" }}>
                    {cd.codes.map(c=>{ const on=(mine||[]).includes(c.id); const isSug=!rev && sg.includes(c.id); return <button key={c.id} type="button" aria-pressed={on} onClick={()=>{ if (!rev && sg.length) set(x=>({ [x.coder]:{ ...x[x.coder], [s.key]:[] } })); toggle(s.key, c.id); }}
                      style={{ ...pill(on, c.color), padding:"3px 8px", fontSize:11, borderStyle:isSug? "dashed" : "solid", borderColor:on||isSug? c.color : C.border, color:on||isSug? c.color : C.mid }}>{isSug? "+ " : ""}{c.name}</button>; })}
                    {!rev && <button type="button" onClick={()=>set(x=>({ [x.coder]:{ ...x[x.coder], [s.key]:[...sg] } }))} style={{ ...pill(false), padding:"3px 8px", fontSize:11 }}>{sg.length? "Accept suggestion" : "Mark as no code"}</button>}
                    {other[s.key]!==undefined && JSON.stringify([...(other[s.key]||[])].sort())!==JSON.stringify([...(mine||[])].sort()) && rev && <span style={{ fontSize:11, color:C.orange }}>Coder {cd.coder==="A"?"B":"A"} differs</span>}
                  </div>
                </div>); })}
              {!docSegs.length && <p style={wbNote}>No segments match.</p>}
            </div>
          </div>
        </div>)}
      {view==="results" && <div>
        <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:16 }}>
          <div style={card}>
            <h3 style={wbH}>Code frequency (coder {cd.coder})</h3>
            {!summary.length && <p style={wbNote}>No codes yet.</p>}
            {summary.map(s=>{ const mx=Math.max(1,...summary.map(x=>x.segments)); return <div key={s.id} style={{ marginBottom:6 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:C.text }}><span>{s.name}</span><span>{s.segments} segments · {s.documents} of {cd.docs.length} documents</span></div>
              <div style={{ height:8, background:C.raised, borderRadius:4 }}><div style={{ height:8, width:`${100*s.segments/mx}%`, background:s.color, borderRadius:4 }}/></div></div>; })}
            <div style={{ fontSize:12, color:C.mid, marginTop:8 }}>{segs.filter(s=>assign[s.key]!==undefined).length} of {segs.length} segments reviewed.</div>
          </div>
          <div style={card}>
            <h3 style={wbH}>Agreement between coders</h3>
            {kap.n<5? <p style={{ ...wbNote, marginTop:0 }}>When a second coder reviews the same segments (switch to coder B in step 3), Cohen's kappa for each code appears here. Above 0.6 is usually treated as acceptable, above 0.8 as strong.</p> : <>
              <p style={{ ...wbNote, marginTop:0 }}>{kap.n} segments coded by both. Average kappa {kap.mean.toFixed(2)} ({codKappaLabel(kap.mean)}).</p>
              <table style={{ width:"100%", borderCollapse:"collapse" }}><thead><tr>{["Code","Kappa","Agreement","Only A","Only B"].map(h=><th key={h} style={{ ...wbCell, textAlign:"left" }}>{h}</th>)}</tr></thead>
                <tbody>{kap.per.map(p=><tr key={p.id}><td style={wbCell}>{p.name}</td><td style={{ ...wbCell, color:!isFinite(p.kappa)? C.dim : p.kappa>=0.6? C.teal : p.kappa>=0.4? C.orange : C.red }}>{isFinite(p.kappa)? p.kappa.toFixed(2) : "n/a"}</td><td style={wbCell}>{(100*p.agree).toFixed(0)}%</td><td style={wbCell}>{p.onlyA}</td><td style={wbCell}>{p.onlyB}</td></tr>)}</tbody></table></>}
          </div>
        </div>
        <div style={{ ...card, marginTop:16 }}>
          <h3 style={wbH}>Turn the coding into a dataset</h3>
          <p style={{ ...wbNote, marginTop:0 }}>One row per document gives counts, shares and 0/1 "mentioned at all" columns for each code, ready for charts, regression or matching (for example: do farmers who mention credit report lower yields?). One row per segment gives a 0/1 column per code.</p>
          <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>{[["document","One row per document"],["segment","One row per segment"]].map(([k,l])=><button key={k} type="button" aria-pressed={level===k} onClick={()=>setLevel(k)} style={pill(level===k)}>{l}</button>)}</div>
          {cd.docs.length && cd.codes.length ? <>
            <WbGrid tab={codToTable(cd.docs, segs, cd.codes, assign, level)} height={300} max={100}/>
            <div style={{ display:"flex", gap:8, marginTop:10, flexWrap:"wrap" }}>
              <button type="button" style={btn()} onClick={()=>{ const t=codToTable(cd.docs, segs, cd.codes, assign, level); addDataset({ name:`Coded text (${level==="document"? "documents" : "segments"})`, headers:t.headers, rows:t.rows, source:"coding" }); }}>Save as dataset</button>
              <button type="button" style={wbSmallBtn()} onClick={()=>wbDownload("codebook.csv", wbCsv({ headers:["code","keywords","segments","documents"], rows:summary.map(s=>[s.name, cd.codes.find(c=>c.id===s.id)?.keywords||"", s.segments, s.documents]) }))}>Download codebook</button>
            </div></> : <p style={wbNote}>Add documents and codes first.</p>}
        </div>
      </div>}
    </div>
  );
}
// ── Workbench shell ──
function Workbench({ onClose, datasets, setDatasets, formulas, setFormulas, coding, setCoding, optim, setOptim, onChart, onImpact, basketTable, startTab="datasets" }) {
  const isMobile=useIsMobile(); const [tab,setTab]=useState(startTab); const [fxStart,setFxStart]=useState(null); const [toast,setToast]=useState(""); const [full,setFull]=useState(false);
  useEffect(()=>{ const k=(e)=>{ if (e.key==="Escape") onClose(); }; window.addEventListener("keydown",k); return ()=>window.removeEventListener("keydown",k); },[onClose]);
  const addDataset=(d)=>{ const id=prjUid(); const now=new Date().toISOString(); setDatasets(ds=>({ ...ds, [id]:{ id, created:now, updated:now, ...d } })); setToast(`Saved "${d.name}" to Datasets.`); setTimeout(()=>setToast(""), 3500); return id; };
  const go=(t, id)=>{ if (t==="formula") setFxStart(id); setTab(t==="formula"? "formulas" : t); };
  const TABS=[["datasets","Datasets"],["combine","Merge & append"],["pdf","Tables from PDF"],["formulas","Formulas (EcoScript)"],["optimize","Optimization"],["coding","Text coding"]];
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="wb-title" style={{ position:"fixed", inset:0, background:C.overlay, zIndex:400, display:"flex", alignItems:"stretch", justifyContent:"center", padding:isMobile||full?0:20 }}>
      <div style={{ background:C.bg, border:`1px solid ${C.borderHi}`, borderRadius:isMobile||full?0:10, width:"100%", maxWidth:full? "none" : 1320, display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:C.shadow }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, padding:isMobile?"12px 14px":"14px 20px", borderBottom:`1px solid ${C.border}`, background:C.surface, flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:30, height:30, borderRadius:6, background:C.gold, color:C.onGold, display:"flex", alignItems:"center", justifyContent:"center" }}><Ico n="sheet"/></div>
            <div><h2 id="wb-title" style={{ fontSize:16, margin:0, color:C.text }}>Data Workbench</h2><div style={{ fontSize:11, color:C.mid }}>Datasets, merge and append, tables from PDFs, formulas, optimization and text coding. Saved with the project.</div></div>
          </div>
          <div role="tablist" aria-label="Workbench sections" style={{ display:"flex", gap:6, order:isMobile?3:0, width:isMobile?"100%":"auto", overflowX:"auto" }}>
            {TABS.map(([k,l])=><button key={k} role="tab" aria-selected={tab===k} type="button" onClick={()=>setTab(k)} style={{ ...pill(tab===k), padding:"7px 12px", flex:"none" }}>{l}{k==="datasets"? ` (${Object.keys(datasets).length})` : ""}</button>)}
          </div>
          {!isMobile && <button type="button" onClick={()=>setFull(f=>!f)} aria-pressed={full} title={full? "Back to a window" : "Use the whole screen"} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, color:C.mid, cursor:"pointer", padding:"6px 10px", fontSize:12.5, marginLeft:"auto" }}>{full? "⤡ Window" : "⤢ Full screen"}</button>}
          <button type="button" onClick={onClose} aria-label="Close Data Workbench" style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, color:C.mid, cursor:"pointer", padding:"6px 10px", fontSize:13 }}>✕</button>
        </div>
        {toast && <div role="status" style={{ background:`${C.teal}22`, color:C.teal, fontSize:12, padding:"6px 20px" }}>{toast}</div>}
        <div style={{ flex:1, overflowY:"auto", padding:isMobile?12:20 }}>
          <div style={{ display:tab==="datasets"?"block":"none" }}><WbDatasets datasets={datasets} setDatasets={setDatasets} onChart={onChart} onImpact={onImpact} basketTable={basketTable} isMobile={isMobile} onOpen={go}/></div>
          <div style={{ display:tab==="pdf"?"block":"none" }}><WbPdf addDataset={addDataset} isMobile={isMobile}/></div>
          {tab==="formulas" && <WbFormulas datasets={datasets} setDatasets={setDatasets} formulas={formulas} setFormulas={setFormulas} addDataset={addDataset} isMobile={isMobile} startId={fxStart}/>}
          {tab==="combine" && <WbCombine datasets={datasets} addDataset={addDataset} basketTable={basketTable} isMobile={isMobile}/>}
          <div style={{ display:tab==="optimize"?"block":"none" }}><WbOptimize datasets={datasets} addDataset={addDataset} optim={optim} setOptim={setOptim} isMobile={isMobile}/></div>
          <div style={{ display:tab==="coding"?"block":"none" }}><WbCoding coding={coding} setCoding={setCoding} datasets={datasets} addDataset={addDataset} isMobile={isMobile}/></div>
        </div>
      </div>
    </div>
  );
}
// ══════════════════════════════════════════════
// DATA VAULT (v32): datasets the administrator prepares, documents and publishes to chosen plans or users
// AdminVault (admin panel tab) · VaultEditor (prepare, describe, document, choose who sees it, publish) · VaultBrowser (users)
// ══════════════════════════════════════════════
const VAULT_CATS = [["micro", "Micro", "Records of households, firms or people"], ["macro", "Macro", "Country, regional or sector totals"], ["qualitative", "Qualitative", "Interviews, text, codes, categories"],
  ["quantitative", "Quantitative", "Numbers and measurements"], ["primary", "Primary", "Collected first-hand"], ["secondary", "Secondary", "Compiled from other sources"]];
const VAULT_CAT = Object.fromEntries(VAULT_CATS.map(([id, label]) => [id, label]));
const VAULT_PLANS = [["free", "Free"], ["pro", "Pro"], ["enterprise", "Enterprise"]];
const vaultCall = async (method, path, body) => { const r = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch (e) { j = null; }
  if (!r.ok) throw new Error((j && j.error) || `Server error ${r.status}`); return j; };
const vaultUpload = async (id, file, note) => { const q = `name=${encodeURIComponent(file.name)}&type=${encodeURIComponent(file.type || "")}&note=${encodeURIComponent(note || "")}`;
  const r = await fetch(`/api/admin/library/${encodeURIComponent(id)}/files?${q}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file }); let j = null; try { j = await r.json(); } catch (e) { j = null; }
  if (!r.ok) throw new Error((j && j.error) || `Upload failed (${r.status})`); return j; };
const vaultFile = async (dsId, f, view) => { const r = await fetch(`/api/library/${encodeURIComponent(dsId)}/files/${encodeURIComponent(f.id)}`); if (!r.ok) { let j = null; try { j = await r.json(); } catch (e) { j = null; } throw new Error((j && j.error) || `Download failed (${r.status})`); }
  const blob = new Blob([await r.arrayBuffer()], { type: f.mime || "application/octet-stream" });
  if (view && /^(application\/pdf|image\/(png|jpe?g|gif|webp))$/.test(f.mime || "")) { const url = URL.createObjectURL(blob); const w = window.open(url, "_blank", "noopener"); setTimeout(() => URL.revokeObjectURL(url), 60000); if (w) return; }
  wxSave(blob, f.name); };
const vaultSize = (b) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b || 0} B`;
const vaultKindIcon = (k) => ({ pdf: "PDF", spreadsheet: "XLS", document: "DOC", slides: "PPT", image: "IMG" }[k] || "FILE");
const vaultWhen = (t) => { if (!t) return "—"; const d = new Date(t); return isNaN(d) ? "—" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); };
const VAULT_STATE = { live: ["Live", "teal", "Users on the chosen plans can see it"], draft: ["Draft", "dim", "Not published"], hidden: ["Hidden", "gold", "Published, but every category it is in is switched off"], no_audience: ["No audience", "gold", "Published, but no plan or user is chosen"] };
// admin storage: load a stored table, or read a stored CSV / Excel file into tables
const vaultStoreTables = async (it) => { const r = await fetch(`/api/admin/library-storage/${encodeURIComponent(it.id)}`); if (!r.ok) { let j = null; try { j = await r.json(); } catch (e) { j = null; } throw new Error((j && j.error) || `Could not open ${it.name}`); }
  if (it.kind === "table") { const j = await r.json(); return [{ name: j.name, headers: j.table_data.headers, rows: j.table_data.rows.map(x => x.map(v => v == null ? "" : String(v))) }]; }
  if (!/\.(csv|tsv|txt|xlsx|xlsm|xls|ods)$/i.test(it.name)) throw new Error(`${it.name} is not a table file. Download it, or pull its tables in the Workbench (Tables from PDF).`);
  const X = await wbXlsx(); const wb = X.read(new Uint8Array(await r.arrayBuffer()), { type: "array" }); const base = it.name.replace(/\.[^.]+$/, ""); const out = [];
  wb.SheetNames.forEach(sh => { const t = wbSheetTable(X, wb.Sheets[sh]); if (t) out.push({ name: wb.SheetNames.length > 1 ? `${base} – ${sh}` : base, ...t }); }); if (!out.length) throw new Error(`${it.name} has no table in it.`); return out; };
const vaultIsTabular = (it) => it.kind === "table" || /\.(csv|tsv|txt|xlsx|xlsm|xls|ods)$/i.test(it.name);
const vaultSaveTable = (t, folder, note) => vaultCall("POST", "/api/admin/library-storage/table", { name: t.name, folder, note, headers: t.headers, rows: t.rows });
function VSwitch({ on, onChange, label, disabled, small }) {
  const w = small ? 30 : 38, h = small ? 17 : 21;
  return <button type="button" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} title={label}
    style={{ width: w, height: h, borderRadius: h, border: `1px solid ${on ? C.teal : C.border}`, background: on ? C.teal : C.raised, position: "relative", cursor: disabled ? "not-allowed" : "pointer", padding: 0, flexShrink: 0, opacity: disabled ? 0.5 : 1, transition: "background .15s" }}>
    <span style={{ position: "absolute", top: 1, left: on ? w - h + 1 : 1, width: h - 4, height: h - 4, borderRadius: "50%", background: on ? "#fff" : C.mid, transition: "left .15s" }} /></button>;
}
const vaultChip = (txt, col, off) => <span key={txt} style={{ display: "inline-block", fontSize: 11, padding: "1px 7px", borderRadius: 10, border: `1px solid ${off ? C.border : `${col}66`}`, color: off ? C.dim : col, background: off ? "transparent" : `${col}14`, textDecoration: off ? "line-through" : "none", marginRight: 4, marginBottom: 2, whiteSpace: "nowrap" }}>{txt}</span>;
const vaultAudience = (a) => { const p = (a?.plans || []).map(x => (VAULT_PLANS.find(y => y[0] === x) || [x, x])[1]); const u = (a?.users || []).length; return [p.join(", "), u ? `${u} named user${u > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ") || "Nobody yet"; };

export { VAULT_CAT, VAULT_CATS, VAULT_PLANS, VAULT_STATE, VSwitch, WbGrid, WbMax, Workbench, vaultAudience, vaultCall, vaultChip, vaultFile, vaultIsTabular, vaultKindIcon, vaultSaveTable, vaultSize, vaultStoreTables, vaultUpload, vaultWhen, wbCell, wbCopy, wbH, wbNote, wbSmallBtn };
