// workbench/export.js — split from App.js (code unchanged; only imports and exports were added)
import { stTexEsc, stTexKv, stTexTable, wbXlsx, wxDataUrlBytes, wxIsNum, wxSave, wxXmlEsc, wxZip } from "../ecoscript/engine";

// ── LaTeX ──
const wxTexDoc = (outs, figs) => { const parts = ["\\documentclass[11pt]{article}", "\\usepackage[utf8]{inputenc}", "\\usepackage[margin=1in]{geometry}", "\\usepackage{booktabs}", "\\usepackage{graphicx}", "\\usepackage{caption}", "\\begin{document}", ""];
  outs.forEach((o, k) => { parts.push(`\\section*{${stTexEsc(o.title)}}`); o.blocks.forEach((b, i) => { if (b.type === "table") parts.push(stTexTable(b, { caption: b.caption || "", label: `tab:${k}-${i}` })); else if (b.type === "kv") parts.push(stTexKv(b)); else if (b.type === "text") parts.push("\\begin{verbatim}\n" + b.text + "\n\\end{verbatim}"); else if (b.type === "note") parts.push(`\\noindent{\\footnotesize ${stTexEsc(b.text)}}\\par`);
    else if (b.type === "chart") { const f = figs && figs[`${k}-${i}`]; parts.push(f ? `\\begin{figure}[htbp]\\centering\n\\includegraphics[width=\\linewidth]{${f}}\n\\caption{${stTexEsc(b.title)}}\n\\end{figure}` : `% chart: ${b.title} (export it as PNG or SVG from the Results tab)`); } parts.push(""); }); });
  parts.push("\\end{document}"); return parts.join("\n"); };
// ── Excel ──
const wxCell = (c) => { const s = String(c ?? "").trim(); return wxIsNum(s) ? +s.replace(/,/g, "") : s; };
const wxBlockRows = (b) => b.type === "table" ? [...(b.caption ? [[b.caption]] : []), b.head.map(h => String(h ?? "").replace(/\n/g, " ")), ...b.rows.map(r => r.map(wxCell)), ...(b.note ? [[b.note]] : [])] : b.type === "kv" ? b.items.map(([a, v]) => [a, wxCell(v)]) : b.type === "text" ? String(b.text).split("\n").map(l => [l]) : b.type === "note" ? [[b.text]] : b.type === "chart" ? [[`Chart: ${b.title}`], b.tab.headers, ...b.tab.rows.map(r => r.map(wxCell))] : [];
const wxXlsxSave = async (sheets, name) => { const X = await wbXlsx(); const wb = X.utils.book_new(); const used = new Set();
  sheets.forEach(({ title, rows }) => { let nm = String(title || "Sheet").replace(/[\\/?*[\]:]/g, " ").slice(0, 28).trim() || "Sheet"; let q = nm, c = 2; while (used.has(q.toLowerCase())) q = `${nm.slice(0, 25)} ${c++}`; used.add(q.toLowerCase()); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows.length ? rows : [[""]]), q); });
  X.writeFile(wb, name); };
// ── Word (.docx built directly; no server needed) ──
const wxRun = (text, { b, sz = 20, mono, i: it } = {}) => { const lines = String(text ?? "").split("\n"); return `<w:r><w:rPr>${mono ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : ""}${b ? "<w:b/>" : ""}${it ? "<w:i/>" : ""}<w:sz w:val="${sz}"/></w:rPr>${lines.map((l, k) => `${k ? "<w:br/>" : ""}<w:t xml:space="preserve">${wxXmlEsc(l)}</w:t>`).join("")}</w:r>`; };
const wxPara = (text, o = {}) => `<w:p><w:pPr><w:spacing w:before="${o.before ?? 60}" w:after="${o.after ?? 60}"/>${o.jc ? `<w:jc w:val="${o.jc}"/>` : ""}</w:pPr>${wxRun(text, o)}</w:p>`;
const wxDocxTable = (head, rows, { sz = 18 } = {}) => { const n = Math.max(head.length, ...rows.map(r => r.length)); const avail = 9840;
  // widths from the longest text in each column, so numbers do not wrap
  const len = (c) => Math.max(...String(c ?? "").split("\n").map(x => x.length)); const want = Array.from({ length: n }, (_, j) => Math.min(48, Math.max(3, len(head[j]), ...rows.map(r => len(r[j])))));
  let size = sz; let per = size * 5.2; let tot = want.reduce((a, c) => a + c * per + 160, 0); if (tot > avail) { size = Math.max(13, Math.floor(sz * avail / tot)); per = size * 5.2; tot = want.reduce((a, c) => a + c * per + 160, 0); }
  const scale = tot > avail ? avail / tot : 1; const w = want.map(c => Math.round((c * per + 160) * scale));
  const cell = (c, j, hdr, last) => `<w:tc><w:tcPr><w:tcW w:w="${w[j]}" w:type="dxa"/>${hdr ? '<w:tcBorders><w:bottom w:val="single" w:sz="6" w:space="0" w:color="000000"/></w:tcBorders>' : last ? '<w:tcBorders><w:bottom w:val="single" w:sz="10" w:space="0" w:color="000000"/></w:tcBorders>' : ""}<w:tcMar><w:left w:w="50" w:type="dxa"/><w:right w:w="50" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:spacing w:before="10" w:after="10"/><w:jc w:val="${j ? "right" : "left"}"/></w:pPr>${wxRun(c, { sz: size, b: hdr })}</w:p></w:tc>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${w.reduce((a, c) => a + c, 0)}" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="10" w:space="0" w:color="000000"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${w.map(x => `<w:gridCol w:w="${x}"/>`).join("")}</w:tblGrid>`
    + `<w:tr><w:trPr><w:tblHeader/></w:trPr>${Array.from({ length: n }, (_, j) => cell(head[j] ?? "", j, true)).join("")}</w:tr>` + rows.map((r, ri) => `<w:tr>${Array.from({ length: n }, (_, j) => cell(r[j] ?? "", j, false, ri === rows.length - 1)).join("")}</w:tr>`).join("") + `</w:tbl>`; };
const wxDocxImage = (rid, id, w, h, name) => { const cx = Math.round(Math.min(6, w / 96) * 914400), cy = Math.round(cx * h / w); return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${wxXmlEsc(name)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${wxXmlEsc(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`; };
// items: [{ title, blocks }] ; imgs: { "k-i": { url, w, h } }
const wxDocxSave = async (items, imgs, name, docTitle) => { const Z = await wxZip(); const zip = new Z(); const body = []; const rels = []; let rid = 1, pid = 1;
  if (docTitle) body.push(wxPara(docTitle, { b: true, sz: 32, after: 120 }));
  items.forEach((o, k) => { body.push(wxPara(o.title, { b: true, sz: 24, before: 240, after: 80, mono: /^to_/.test(o.title) }));
    o.blocks.forEach((b, i) => { if (b.type === "table") { if (b.caption) body.push(wxPara(b.caption, { b: true, sz: 20 })); body.push(wxDocxTable(b.head.map(h => String(h ?? "")), b.rows.map(r => r.map(c => String(c ?? ""))))); if (b.note) body.push(wxPara(b.note, { sz: 16, i: true })); else body.push(wxPara("", { sz: 8, before: 0, after: 0 })); }
      else if (b.type === "kv") { body.push(wxDocxTable(["", ""], b.items.map(([a, v]) => [String(a), String(v)]))); body.push(wxPara("", { sz: 8, before: 0, after: 0 })); }
      else if (b.type === "text") body.push(wxPara(b.text, { mono: true, sz: 18 }));
      else if (b.type === "note") body.push(wxPara(b.text, { sz: 16, i: true }));
      else if (b.type === "chart") { const im = imgs && imgs[`${k}-${i}`]; if (im) { const r = `rId${++rid}`; const fn = `chart${pid}.png`; zip.file(`word/media/${fn}`, wxDataUrlBytes(im.url)); rels.push(`<Relationship Id="${r}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${fn}"/>`); body.push(wxDocxImage(r, pid++, im.w, im.h, b.title)); body.push(wxPara(b.title, { sz: 18, i: true, jc: "center" })); } else body.push(wxPara(`[Chart: ${b.title}]`, { i: true })); } }); });
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1200" w:right="1200" w:bottom="1200" w:left="1200" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  wxSave(await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), name); };
// ── PDF: a clean print view (choose "Save as PDF" in the print window) ──
const wxPdf = (items, imgs, docTitle) => { const tbl = (head, rows) => `<table><thead><tr>${head.map((h, j) => `<th class="${j ? "r" : ""}">${wxXmlEsc(h).replace(/\n/g, "<br>")}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, j) => `<td class="${j ? "r" : ""}">${wxXmlEsc(c).replace(/\n/g, "<br>")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const html = items.map((o, k) => `<section><h2>${wxXmlEsc(o.title)}</h2>${o.blocks.map((b, i) => b.type === "table" ? `${b.caption ? `<h3>${wxXmlEsc(b.caption)}</h3>` : ""}${tbl(b.head.map(String), b.rows.map(r => r.map(c => String(c ?? ""))))}${b.note ? `<p class="n">${wxXmlEsc(b.note)}</p>` : ""}` : b.type === "kv" ? tbl(["", ""], b.items.map(([a, v]) => [String(a), String(v)])) : b.type === "text" ? `<pre>${wxXmlEsc(b.text)}</pre>` : b.type === "note" ? `<p class="n">${wxXmlEsc(b.text)}</p>` : b.type === "chart" ? (imgs && imgs[`${k}-${i}`] ? `<figure><img src="${imgs[`${k}-${i}`].url}" alt="${wxXmlEsc(b.title)}"><figcaption>${wxXmlEsc(b.title)}</figcaption></figure>` : `<p class="n">[Chart: ${wxXmlEsc(b.title)}]</p>`) : "").join("")}</section>`).join("");
  const w = window.open("", "_blank"); if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${wxXmlEsc(docTitle || "EcoScript results")}</title><style>body{font-family:Georgia,"Times New Roman",serif;color:#111;margin:28px;font-size:12px}h1{font-size:18px}h2{font-family:Consolas,monospace;font-size:13px;margin:22px 0 6px;color:#333}h3{font-size:12px;margin:8px 0 4px}table{border-collapse:collapse;border-top:1.5px solid #000;border-bottom:1.5px solid #000;margin:4px 0 6px;font-size:11px}th{border-bottom:1px solid #000;padding:3px 10px;text-align:left}td{padding:2px 10px}.r{text-align:right;font-variant-numeric:tabular-nums}pre{font-size:11px;white-space:pre-wrap}.n{font-size:10px;color:#444;font-style:italic}figure{margin:8px 0;text-align:center;page-break-inside:avoid}img{max-width:100%}figcaption{font-size:10px;font-style:italic}section{page-break-inside:auto}@media print{body{margin:0}}</style></head><body>${docTitle ? `<h1>${wxXmlEsc(docTitle)}</h1>` : ""}${html}<script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script></body></html>`);
  w.document.close(); return true; };
// ══════════════════════════════════════════════
// TABLES FROM WORD (.docx) AND POWERPOINT (.pptx) FILES (v32)
// Both formats are zip files of XML; tables are read directly, so nothing is uploaded.
// ══════════════════════════════════════════════
const offCellText = (cell, ns) => { const paras = [...cell.getElementsByTagNameNS(ns, "p")]; const txt = (paras.length ? paras : [cell]).map(p => [...p.getElementsByTagNameNS(ns, "t")].map(t => t.textContent).join("")).filter(Boolean); return txt.join(" ").replace(/\s+/g, " ").trim(); };
const offGrid = (tbl, ns, rowTag, cellTag, spanAttr) => { const rows = [];
  [...tbl.getElementsByTagNameNS(ns, rowTag)].filter(r => r.parentNode === tbl || r.parentNode.parentNode === tbl).forEach(tr => { const r = [];
    [...tr.childNodes].filter(c => c.localName === cellTag).forEach(tc => { let span = 1; if (spanAttr === "gridSpan") { const g = tc.getElementsByTagNameNS(ns, "gridSpan")[0]; if (g) span = +g.getAttributeNS(ns, "val") || +g.getAttribute("w:val") || 1; }
      else { span = +tc.getAttribute("gridSpan") || 1; if (tc.getAttribute("hMerge") === "1") return; } r.push(offCellText(tc, ns)); for (let k = 1; k < span; k++) r.push(""); }); if (r.some(x => x !== "")) rows.push(r); });
  if (!rows.length) return null; const nc = Math.max(...rows.map(r => r.length)); const all = rows.map(r => [...r, ...new Array(nc - r.length).fill("")]);
  const head = all[0].map((h, j) => h || `column_${j + 1}`); const seen = {}; const headers = head.map(h => { const k = h.toLowerCase(); seen[k] = (seen[k] || 0) + 1; return seen[k] > 1 ? `${h}_${seen[k]}` : h; });
  return { headers, rows: all.slice(1) }; };
const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main", A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
// returns [{ headers, rows, from }]
const offTables = async (file) => { const Z = await wxZip(); const zip = await Z.loadAsync(await file.arrayBuffer()); const out = []; const base = file.name.replace(/\.[^.]+$/, ""); const P = new DOMParser();
  if (/\.docx$/i.test(file.name)) { const x = zip.file("word/document.xml"); if (!x) throw new Error(`${file.name} does not look like a Word document.`); const doc = P.parseFromString(await x.async("string"), "application/xml");
    [...doc.getElementsByTagNameNS(W_NS, "tbl")].filter(t => !t.parentNode || t.parentNode.localName !== "tc").forEach((t, k) => { const g = offGrid(t, W_NS, "tr", "tc", "gridSpan"); if (g && g.rows.length) out.push({ ...g, from: `${base}, table ${k + 1}` }); }); }
  else if (/\.pptx$/i.test(file.name)) { const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => +a.match(/(\d+)\.xml$/)[1] - +b.match(/(\d+)\.xml$/)[1]);
    if (!slides.length) throw new Error(`${file.name} does not look like a PowerPoint file.`);
    for (const sn of slides) { const doc = P.parseFromString(await zip.file(sn).async("string"), "application/xml"); const no = +sn.match(/(\d+)\.xml$/)[1];
      [...doc.getElementsByTagNameNS(A_NS, "tbl")].forEach((t, k) => { const g = offGrid(t, A_NS, "tr", "tc", "attr"); if (g && g.rows.length) out.push({ ...g, from: `${base}, slide ${no}${k ? ` table ${k + 1}` : ""}` }); }); } }
  else throw new Error(`${file.name}: choose a .docx (Word) or .pptx (PowerPoint) file. Older .doc and .ppt files must be saved as .docx or .pptx first.`);
  return out; };
// ══════════════════════════════════════════════
// QUALITATIVE CODING: text → segments → codes → numbers
// ══════════════════════════════════════════════
// Split a document into segments. mode: paragraph | sentence | line | turn (speaker turns "Name: ...")
const codSegment = (text, mode="paragraph") => {
  const t=String(text||"").replace(/\r\n?/g,"\n").trim(); if (!t) return [];
  let parts;
  if (mode==="line") parts=t.split(/\n/);
  else if (mode==="sentence") parts=t.replace(/\n+/g," ").match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g)||[t];
  else if (mode==="turn") { parts=[]; t.split(/\n/).forEach(l=>{ if (/^\s*[A-Z][\w .'-]{0,30}:\s/.test(l) || !parts.length) parts.push(l); else parts[parts.length-1]+="\n"+l; }); }
  else parts=t.split(/\n\s*\n/);
  return parts.map(s=>s.trim()).filter(s=>s.length>1).map((s,i)=>{ const sp=mode==="turn"? (s.match(/^\s*([A-Z][\w .'-]{0,30}):\s/)||[])[1] : null; return { i, text:s, speaker:sp||null }; });
};
// Keyword rule → RegExp. "price*, cost, too expensive" matches price/prices/pricing, cost, the phrase "too expensive"
const codRuleRe = (keywords) => { const ks=String(keywords||"").split(/[,;\n]/).map(k=>k.trim()).filter(Boolean); if (!ks.length) return null;
  const esc=(s)=>s.replace(/[.+?^${}()|[\]\\]/g,"\\$&").replace(/\*/g,"\\w*").replace(/\s+/g,"\\s+");
  try { return new RegExp(`(^|[^\\w])(${ks.map(esc).join("|")})(?=$|[^\\w])`, "i"); } catch { return null; } };
// Suggested codes for each segment from the keyword rules: {segKey: [codeId]}
const codSuggest = (segs, codes) => { const res={}; const rs=codes.map(c=>({ id:c.id, re:codRuleRe(c.keywords) })).filter(r=>r.re);
  segs.forEach(s=>{ const hit=rs.filter(r=>r.re.test(s.text)).map(r=>r.id); if (hit.length) res[s.key]=hit; }); return res; };
// Common words (for finding candidate codes)
const COD_STOP=new Set("a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves also like get got one yes yeah really think know well going said say says much many us okay ok um uh".split(" "));
const codTopWords = (segs, n=30) => { const f={}; segs.forEach(s=>{ (s.text.toLowerCase().match(/[a-zÀ-ɏ][a-zÀ-ɏ'-]{2,}/g)||[]).forEach(w=>{ w=w.replace(/'s$/,""); if (!COD_STOP.has(w)) f[w]=(f[w]||0)+1; }); });
  return Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([word,count])=>({ word, count })); };
// Inter-coder agreement per code (Cohen's kappa on presence/absence across segments coded by both coders)
const codKappa = (segKeys, A, B, codes) => {
  const both=segKeys.filter(k=>A[k]!==undefined && B[k]!==undefined); const n=both.length;
  const per=codes.map(c=>{ let a=0,b=0,cc=0,d=0; both.forEach(k=>{ const x=(A[k]||[]).includes(c.id), y=(B[k]||[]).includes(c.id); if (x&&y) a++; else if (x) b++; else if (y) cc++; else d++; });
    const po=n? (a+d)/n : NaN; const pe=n? ((a+b)*(a+cc)+(cc+d)*(b+d))/(n*n) : NaN; const k=pe<1? (po-pe)/(1-pe) : (po===1? 1 : NaN);
    return { id:c.id, name:c.name, n, agree:po, kappa:k, onlyA:b, onlyB:cc, both:a }; });
  const ks=per.filter(p=>isFinite(p.kappa)); return { n, per, mean: ks.length? ks.reduce((s,p)=>s+p.kappa,0)/ks.length : NaN }; };
const codKappaLabel = (k) => !isFinite(k)? "n/a" : k<0? "worse than chance" : k<0.2? "slight" : k<0.4? "fair" : k<0.6? "moderate" : k<0.8? "substantial" : "almost perfect";
// All segments of all documents with stable keys "docId:i"
const codAllSegments = (docs, mode) => docs.flatMap(d=>codSegment(d.text, mode).map(s=>({ ...s, key:`${d.id}:${s.i}`, docId:d.id, doc:d.name, group:d.group||"" })));
// Build datasets. level "segment": one row per segment with 0/1 per code. level "document": counts and shares per document.
const codToTable = (docs, segs, codes, assign, level="document") => {
  const safe=(nm)=>String(nm||"code").trim().replace(/[^\w]+/g,"_").replace(/^_|_$/g,"")||"code";
  const cn=codes.map(c=>safe(c.name)); const has=(k,c)=>(assign[k]||[]).includes(c.id);
  if (level==="segment"){ const anyGroup=docs.some(d=>d.group); const anySp=segs.some(s=>s.speaker);
    const headers=["document", ...(anyGroup?["group"]:[]), "segment", ...(anySp?["speaker"]:[]), "words", ...cn, "n_codes", "text"];
    const rows=segs.map(s=>{ const flags=codes.map(c=>has(s.key,c)?1:0); return [s.doc, ...(anyGroup?[s.group]:[]), s.i+1, ...(anySp?[s.speaker||""]:[]), (s.text.match(/\S+/g)||[]).length, ...flags, flags.reduce((a,b)=>a+b,0), s.text.slice(0,500)]; });
    return { headers, rows }; }
  const anyGroup=docs.some(d=>d.group);
  const headers=["document", ...(anyGroup?["group"]:[]), "segments", "words", ...cn.map(n=>`${n}_count`), ...cn.map(n=>`${n}_share`), ...cn.map(n=>`${n}_any`)];
  const rows=docs.map(d=>{ const ss=segs.filter(s=>s.docId===d.id); const cnt=codes.map(c=>ss.filter(s=>has(s.key,c)).length); const words=ss.reduce((a,s)=>a+(s.text.match(/\S+/g)||[]).length,0);
    return [d.name, ...(anyGroup?[d.group||""]:[]), ss.length, words, ...cnt, ...cnt.map(x=>ss.length? +(x/ss.length).toFixed(4) : 0), ...cnt.map(x=>x>0?1:0)]; });
  return { headers, rows }; };
// Code frequency summary {id, name, segments, documents}
const codSummary = (docs, segs, codes, assign) => codes.map(c=>{ const ks=segs.filter(s=>(assign[s.key]||[]).includes(c.id)); return { id:c.id, name:c.name, color:c.color, segments:ks.length, documents:new Set(ks.map(s=>s.docId)).size }; });
// Text from a dataset column → documents (one per row, optional id and group columns)
const codDocsFromTable = (tab, textCol, idCol, groupCol) => { const ti=tab.headers.indexOf(textCol), ii=tab.headers.indexOf(idCol), gi=tab.headers.indexOf(groupCol);
  return tab.rows.filter(r=>String(r[ti]??"").trim()).map((r,k)=>({ id:`r${k}_${Math.random().toString(36).slice(2,6)}`, name: ii>=0? String(r[ii]) : `Row ${k+1}`, group: gi>=0? String(r[gi]??"") : "", text:String(r[ti]) })); };
// ══════════════════════════════════════════════
// PROJECT STATE: what changed between two workspace snapshots (for the history list)
// ══════════════════════════════════════════════
const PRJ_DOMAINS = ["Economics","Public health","Agriculture","Education","Environment and climate","Finance and banking","Business and marketing","Political science and governance","Sociology","Energy","Development","Other"];
const PRJ_STATUS = { planning:"Planning", active:"Active", paused:"Paused", done:"Finished" };
const prjSame = (a,b) => JSON.stringify(a??null)===JSON.stringify(b??null);
const prjList = (xs, n=3) => xs.length<=n? xs.join(", ") : `${xs.slice(0,n).join(", ")} and ${xs.length-n} more`;
const prjDiff = (p, n) => {
  if (!p) return [];
  const out=[]; const add=(s)=>out.push(s);
  const lab=(b)=>(b||[]).map(v=>v.label||v.varCode);
  const pb=lab(p.varBasket), nb=lab(n.varBasket); const plus=nb.filter(x=>!pb.includes(x)), minus=pb.filter(x=>!nb.includes(x));
  if (plus.length) add(`Added ${prjList(plus)}`); if (minus.length) add(`Removed ${prjList(minus)}`);
  if (p.country!==n.country) add(`Country ${p.country||"none"} → ${n.country}`);
  if (p.startYear!==n.startYear || p.endYear!==n.endYear) add(`Years ${n.startYear}–${n.endYear}`);
  if (p.sourceId!==n.sourceId) add(`Source ${n.sourceId}`);
  if (p.dataLevel!==n.dataLevel) add(`Data level ${n.dataLevel}`);
  if (p.freq!==n.freq) add(`Frequency ${n.freq}`);
  if (p.chartType!==n.chartType || p.viewMode!==n.viewMode) add(n.viewMode==="table"? "Table view" : `Chart type ${n.chartType}`);
  if (p.appliedTransform!==n.appliedTransform) add(n.appliedTransform==="none"? "Removed transformation" : `Transformation ${n.appliedTransform}`);
  if (p.appliedImpute!==n.appliedImpute) add(n.appliedImpute==="none"? "Removed gap filling" : `Gap filling ${n.appliedImpute}`);
  if (p.cmpOn!==n.cmpOn || (n.cmpOn && p.cmpCountry!==n.cmpCountry)) add(n.cmpOn? `Compare with ${n.cmpCountry}` : "Comparison off");
  if (p.showComposite!==n.showComposite) add(n.showComposite? "Composite index on" : "Composite index off");
  else if (n.showComposite && (!prjSame(p.compWeights,n.compWeights) || p.compNorm!==n.compNorm || p.compAgg!==n.compAgg)) add("Composite settings changed");
  if (!prjSame(p.dagEdges,n.dagEdges)) { const d=(n.dagEdges||[]).length-(p.dagEdges||[]).length; add(d>0? `Added ${d} causal link${d>1?"s":""}` : d<0? `Removed ${-d} causal link${d<-1?"s":""}` : "Causal links changed"); }
  if (p.dagTreatment!==n.dagTreatment || p.dagOutcome!==n.dagOutcome) add("Treatment or outcome changed");
  const pi=p.importedRaw?.name, ni=n.importedRaw?.name; if (pi!==ni || (ni && (p.importedRaw?.rows?.length!==n.importedRaw?.rows?.length))) add(ni? `Loaded ${ni}` : "Cleared imported file");
  const pd=p.datasets||{}, nd=n.datasets||{};
  Object.keys(nd).filter(k=>!pd[k]).forEach(k=>add(`New dataset ${nd[k].name}`));
  Object.keys(pd).filter(k=>!nd[k]).forEach(k=>add(`Deleted dataset ${pd[k].name}`));
  Object.keys(nd).filter(k=>pd[k] && (pd[k].name!==nd[k].name || pd[k].updated!==nd[k].updated)).forEach(k=>add(pd[k].name!==nd[k].name? `Renamed dataset to ${nd[k].name}` : `Updated dataset ${nd[k].name}`));
  if (!prjSame(p.formulas,n.formulas)) add("Edited formulas");
  if (!prjSame(p.optim,n.optim)) add("Edited optimization model");
  if (!prjSame(p.coding,n.coding)) { const a=p.coding||{}, b=n.coding||{}; if ((b.docs||[]).length!==(a.docs||[]).length) add(`Text documents: ${(b.docs||[]).length}`); else if (!prjSame(a.codes,b.codes)) add("Edited codebook"); else add("Coded text"); }
  if ((p.notes||"")!==(n.notes||"")) add("Edited notes");
  if (p.analysisTab!==n.analysisTab && !out.length) add(`Opened ${n.analysisTab}`);
  return out;
};
// Sets ↔ arrays so snapshots survive JSON
const prjToJSON = (v) => v instanceof Set? [...v] : v;
const prjAgo = (iso) => { const s=(Date.now()-new Date(iso).getTime())/1000; if (!isFinite(s)) return ""; if (s<60) return "just now"; if (s<3600) return `${Math.floor(s/60)} min ago`; if (s<86400) return `${Math.floor(s/3600)} h ago`; if (s<7*86400) return `${Math.floor(s/86400)} d ago`; return new Date(iso).toLocaleDateString(); };
const prjUid = () => Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);
// Local copies (offline safety net): one per user and project
const prjLocalKey = (user, id) => `ecoscope_prj_${user}_${id}`;
const prjLocalSave = (user, id, state) => { try { localStorage.setItem(prjLocalKey(user,id), JSON.stringify({ at:new Date().toISOString(), state })); return true; } catch { return false; } };
const prjLocalLoad = (user, id) => { try { return JSON.parse(localStorage.getItem(prjLocalKey(user,id))||"null"); } catch { return null; } };
// CSV helpers for datasets
const wbCsv = (tab) => { const q=(v)=>{ const s=v==null? "" : String(v); return /[",\n]/.test(s)? `"${s.replace(/"/g,'""')}"` : s; }; return [tab.headers.map(q).join(","), ...tab.rows.map(r=>r.map(q).join(","))].join("\n"); };
const wbDownload = (name, text, type="text/csv") => { const b=new Blob([text],{ type }); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500); };

export { PRJ_DOMAINS, PRJ_STATUS, codAllSegments, codDocsFromTable, codKappa, codKappaLabel, codRuleRe, codSuggest, codSummary, codToTable, codTopWords, offTables, prjAgo, prjDiff, prjLocalKey, prjLocalLoad, prjLocalSave, prjSame, prjToJSON, prjUid, wbCsv, wbDownload, wxBlockRows, wxDocxSave, wxPdf, wxTexDoc, wxXlsxSave };
