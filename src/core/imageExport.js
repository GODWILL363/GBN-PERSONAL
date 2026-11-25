// core/imageExport.js — save a chart (canvas or SVG) as PNG, JPEG, WebP, SVG or PDF, copy it, or keep it in "My snapshots"

const IMG_FORMATS = [["png", "PNG image"], ["jpeg", "JPEG image"], ["webp", "WebP image"], ["svg", "SVG (vector)"], ["pdf", "PDF document"]];
const MIME = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf" };
const EXT = { png: "png", jpeg: "jpg", webp: "webp", svg: "svg", pdf: "pdf" };

const safeName = (s) => String(s || "ecoscope").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "ecoscope";
const downloadBlob = (blob, name) => { const a = document.createElement("a"); const url = URL.createObjectURL(blob); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); };
const canvasBlob = (canvas, mime, q) => new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error("This browser cannot make that image type."))), mime, q));

// JPEG has no transparency: paint the background first
const flatten = (canvas, bg) => { const c = document.createElement("canvas"); c.width = canvas.width; c.height = canvas.height; const x = c.getContext("2d"); x.fillStyle = bg || "#ffffff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(canvas, 0, 0); return c; };

// a one-page PDF holding the image (JPEG inside, no library needed); page size follows the picture
const pdfFromCanvas = async (canvas, bg, pxPerPt) => {
  const jpg = new Uint8Array(await (await canvasBlob(flatten(canvas, bg), "image/jpeg", 0.95)).arrayBuffer());
  const W = canvas.width, H = canvas.height, k = pxPerPt || 2.666; // 2× captures: 96 dpi × 2 / 72
  const pw = +(W / k).toFixed(2), ph = +(H / k).toFixed(2); const enc = new TextEncoder(); const parts = []; const offs = []; let len = 0;
  const push = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body, stream) => { offs[n] = len; push(`${n} 0 obj\n${body}\n`); if (stream) { push("stream\n"); push(stream); push("\nendstream\n"); } push("endobj\n"); };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const content = enc.encode(`q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`);
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>"); obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, `<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>`, jpg);
  obj(5, `<< /Length ${content.length} >>`, content);
  const xref = len; push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map(n => String(offs[n]).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: "application/pdf" }); };

// turn a canvas into a file of the chosen type; svgText is used for "svg" when the chart has one
const canvasToFile = async (canvas, fmt, opts = {}) => {
  if (fmt === "svg") { if (!opts.svgText) throw new Error("This chart cannot be saved as SVG; choose PNG or PDF."); return new Blob([opts.svgText], { type: MIME.svg }); }
  if (fmt === "pdf") return pdfFromCanvas(canvas, opts.bg, opts.pxPerPt);
  if (fmt === "jpeg") return canvasBlob(flatten(canvas, opts.bg), MIME.jpeg, 0.95);
  if (fmt === "webp") { const b = await canvasBlob(canvas, MIME.webp, 0.95); if (b.type !== MIME.webp) throw new Error("This browser cannot make WebP images; choose PNG or JPEG."); return b; }
  return canvasBlob(canvas, MIME.png); };
const saveCanvas = async (canvas, fmt, title, opts) => downloadBlob(await canvasToFile(canvas, fmt, opts), `${safeName(title)}.${EXT[fmt] || "png"}`);
const copyCanvas = async (canvas) => { if (!navigator.clipboard || !window.ClipboardItem) throw new Error("Copying images is not supported in this browser."); const b = await canvasBlob(canvas, MIME.png); await navigator.clipboard.write([new window.ClipboardItem({ "image/png": b })]); };

// load an image (blob or URL) into a canvas, for converting a saved snapshot to another type
const blobToCanvas = (blob) => new Promise((resolve, reject) => { const url = URL.createObjectURL(blob); const im = new Image();
  im.onload = () => { const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext("2d").drawImage(im, 0, 0); URL.revokeObjectURL(url); resolve(c); };
  im.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read the picture.")); }; im.src = url; });

// "My snapshots": stored on the server (Supabase Storage), private to the user
const SNAP = {
  async save(canvas, title, meta) { const b = await canvasBlob(canvas, MIME.png); if (b.size > 4 * 1048576) throw new Error("This snapshot is larger than 4 MB.");
    const q = new URLSearchParams({ title: String(title || "Chart").slice(0, 160), ...(meta ? { meta: JSON.stringify(meta).slice(0, 2000) } : {}) });
    const r = await fetch(`/api/snapshots?${q}`, { method: "POST", headers: { "Content-Type": "image/png" }, body: b }); const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Could not save the snapshot."); return j; },
  async list() { const r = await fetch("/api/snapshots"); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Could not load your snapshots."); return j; },
  async blob(id) { const r = await fetch(`/api/snapshots/${encodeURIComponent(id)}`); if (!r.ok) throw new Error("Could not open the snapshot."); return r.blob(); },
  async remove(id) { const r = await fetch(`/api/snapshots/${encodeURIComponent(id)}`, { method: "DELETE" }); if (!r.ok) throw new Error("Could not delete the snapshot."); },
  async rename(id, title) { const r = await fetch(`/api/snapshots/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }); if (!r.ok) throw new Error("Could not rename the snapshot."); },
};

export { EXT, IMG_FORMATS, MIME, SNAP, blobToCanvas, canvasToFile, copyCanvas, downloadBlob, pdfFromCanvas, safeName, saveCanvas };
