// ui/snapshots.js — "My snapshots": saved charts, downloadable in any picture type
import { useEffect, useState } from "react";
import { EXT, IMG_FORMATS, SNAP, blobToCanvas, canvasToFile, downloadBlob, safeName } from "../core/imageExport";
import { C } from "../core/theme";

function SnapThumb({ id, alt }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let u = null, live = true; SNAP.blob(id).then(b => { if (!live) return; u = URL.createObjectURL(b); setUrl(u); }).catch(() => {}); return () => { live = false; if (u) URL.revokeObjectURL(u); }; }, [id]);
  return url ? <img src={url} alt={alt} style={{ width: "100%", height: 130, objectFit: "contain", background: C.bg, borderRadius: 6, display: "block" }} />
    : <div style={{ height: 130, background: C.card, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: C.dim, fontSize: 12 }}>Loading…</div>;
}

function SnapshotGallery({ onClose }) {
  const [list, setList] = useState(null); const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(""); const [ask, setAsk] = useState(null);
  const load = () => SNAP.list().then(j => setList(j.snapshots || [])).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  useEffect(() => { const k = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } }; window.addEventListener("keydown", k, true); return () => window.removeEventListener("keydown", k, true); }, [onClose]);
  const download = async (s, fmt) => { setBusy(s.id); setErr(""); try { const b = await SNAP.blob(s.id);
      if (fmt === "png") downloadBlob(b, `${safeName(s.title)}.png`); else downloadBlob(await canvasToFile(await blobToCanvas(b), fmt, { bg: "#ffffff" }), `${safeName(s.title)}.${EXT[fmt]}`); }
    catch (e) { setErr(e.message); } setBusy(""); };
  const sel = { background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 6px", fontSize: 11.5 };
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="snap-title" style={{ position: "fixed", inset: 0, background: C.overlay || "rgba(0,0,0,.6)", zIndex: 440, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 10, width: "100%", maxWidth: 900, maxHeight: "90vh", overflow: "auto", padding: "18px 20px", boxShadow: C.shadow }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 id="snap-title" style={{ fontSize: 16, margin: 0, color: C.text }}>My snapshots</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, color: C.mid, cursor: "pointer", padding: "4px 9px" }}>✕</button>
        </div>
        <p style={{ color: C.mid, fontSize: 12, margin: "6px 0 12px" }}>Charts you saved with "Save to My snapshots". They are private to your account. Download each one as PNG, JPEG, WebP or PDF.</p>
        {err && <div role="alert" style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{err}</div>}
        {msg && <div role="status" style={{ color: C.teal, fontSize: 12, marginBottom: 8 }}>{msg}</div>}
        {!list ? <div style={{ color: C.mid, fontSize: 13 }}>Loading…</div> : !list.length ? <div style={{ color: C.mid, fontSize: 13 }}>No snapshots yet. Open a chart's export menu and choose "Save to My snapshots".</div> :
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 12 }}>
            {list.map(s => <div key={s.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 8, background: C.card }}>
              <SnapThumb id={s.id} alt={s.title} />
              <div style={{ fontSize: 12.5, color: C.text, fontWeight: 600, margin: "6px 0 2px", overflowWrap: "anywhere" }}>{s.title}</div>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 6 }}>{new Date(s.created_at).toLocaleString()} · {Math.max(1, Math.round((s.size_bytes || 0) / 1024))} KB</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <select aria-label={`Download ${s.title}`} value="" disabled={busy === s.id} onChange={e => { const f = e.target.value; e.target.value = ""; if (f) download(s, f); }} style={sel}>
                  <option value="">{busy === s.id ? "Preparing…" : "Download as…"}</option>{IMG_FORMATS.filter(([f]) => f !== "svg").map(([f, l]) => <option key={f} value={f}>{l}</option>)}</select>
                <button type="button" onClick={async () => { const t = window.prompt("New name", s.title); if (!t) return; try { await SNAP.rename(s.id, t); setMsg("Renamed."); load(); } catch (e) { setErr(e.message); } }} style={{ ...sel, cursor: "pointer" }}>Rename</button>
                {ask === s.id ? <><button type="button" onClick={async () => { setAsk(null); try { await SNAP.remove(s.id); setMsg("Deleted."); load(); } catch (e) { setErr(e.message); } }} style={{ ...sel, cursor: "pointer", color: C.red }}>Yes, delete</button>
                  <button type="button" onClick={() => setAsk(null)} style={{ ...sel, cursor: "pointer" }}>Keep</button></>
                  : <button type="button" onClick={() => setAsk(s.id)} style={{ ...sel, cursor: "pointer", color: C.red }}>Delete</button>}
              </div></div>)}
          </div>}
      </div>
    </div>);
}

export { SnapshotGallery };
