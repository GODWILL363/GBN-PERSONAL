// vault/vault.js — split from App.js (code unchanged; only imports and exports were added)
import { useCallback, useEffect, useRef, useState } from "react";
import { openIesgi } from "../core/store";
import { C } from "../core/theme";
import { wxSave, wxSlug } from "../ecoscript/engine";
import { btn, inp, pill, sel } from "../ui/login";
import { prjUid, wxXlsxSave } from "../workbench/export";
import { VAULT_CAT, VAULT_CATS, VAULT_PLANS, VAULT_STATE, VSwitch, Workbench, vaultAudience, vaultCall, vaultChip, vaultFile, vaultIsTabular, vaultKindIcon, vaultSaveTable, vaultSize, vaultStoreTables, vaultUpload, vaultWhen, wbCopy, wbNote, wbSmallBtn } from "../workbench/workbench";

// ── Administrator: the Data Vault tab ──
function AdminVault({ users, notify }) {
  const [data, setData] = useState(null); const [err, setErr] = useState(""); const [editing, setEditing] = useState(null); const [q, setQ] = useState(""); const [cat, setCat] = useState("all");
  const [name, setName] = useState(""); const [confirm, setConfirm] = useState(null); const [busy, setBusy] = useState(""); const [view, setView] = useState("datasets"); const [preset, setPreset] = useState(null);
  const load = useCallback(async () => { try { const d = await vaultCall("GET", "/api/admin/library"); setData(d); setName(d.settings.name); setErr(""); } catch (e) { setErr(e.message); } }, []);
  useEffect(() => { load(); }, [load]);
  const saveSettings = async (patch, msg) => { setBusy("settings"); try { const s = await vaultCall("PATCH", "/api/admin/library-settings", patch); notify(msg); setData(d => d ? { ...d, settings: s } : d); await load(); } catch (e) { notify(e.message, "error"); } setBusy(""); };
  const setPublished = async (d, on) => { setBusy(d.id); try { await vaultCall("PATCH", `/api/admin/library/${d.id}`, { published: on }); notify(on ? `Published “${d.title}”` : `“${d.title}” is now a draft`); await load(); } catch (e) { notify(e.message, "error"); } setBusy(""); };
  const remove = async (d) => { setBusy(d.id); try { await vaultCall("DELETE", `/api/admin/library/${d.id}`); notify(`Deleted “${d.title}”`); setConfirm(null); await load(); } catch (e) { notify(e.message, "error"); } setBusy(""); };
  if (err && !data) return <div style={{ padding: 20 }}><p style={{ color: C.red, fontSize: 13 }}>Could not load the Data Vault: {err}</p><p style={wbNote}>If this is the first time, run supabase_library.sql in Supabase → SQL Editor, then reload.</p><button type="button" style={wbSmallBtn()} onClick={load}>Try again</button></div>;
  if (!data) return <div style={{ padding: 20, color: C.mid, fontSize: 13 }} role="status">Loading the Data Vault…</div>;
  const S = data.settings; const ds = data.datasets;
  const count = (c) => ({ live: ds.filter(d => d.categories.includes(c) && d.state === "live").length, all: ds.filter(d => d.categories.includes(c)).length });
  const shown = ds.filter(d => (cat === "all" || d.categories.includes(cat)) && (!q || `${d.title} ${d.source_name || ""} ${d.description || ""}`.toLowerCase().includes(q.toLowerCase())));
  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 14 };
  return <div style={{ padding: "4px 0" }}>
    <div style={card}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px" }}><label htmlFor="vault-name" style={{ fontSize: 12, color: C.mid, display: "block", marginBottom: 4 }}>Section name users see in their sidebar</label>
          <input id="vault-name" value={name} maxLength={60} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} onBlur={() => { if (name.trim() && name.trim() !== S.name) saveSettings({ name: name.trim() }, `Section renamed to “${name.trim()}”`); }} style={{ ...inp, maxWidth: 360 }} /></div>
        <button type="button" style={btn()} onClick={() => setEditing("new")}>+ New dataset</button>
      </div>
      <p style={{ ...wbNote, margin: "8px 0 0" }}>This section is separate from the Macro and Micro data sources. Prepare a dataset, attach the documents that back it, choose which plans or users may see it, then switch it to Published.</p>
    </div>
    <div role="tablist" aria-label="Data Vault views" style={{ display: "flex", gap: 6, marginBottom: 12 }}>
      {[["datasets", `Datasets (${ds.length})`], ["storage", "Storage (admin only)"]].map(([v, l]) => <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} style={{ ...pill(view === v, C.gold), fontSize: 12.5, padding: "6px 14px" }}>{l}</button>)}</div>
    {view === "storage" && <AdminStorage notify={notify} onPublish={(t) => { setPreset({ table: { headers: t.headers, rows: t.rows }, title: t.name }); setEditing("new"); }} />}
    {view === "datasets" && <>
    <div style={card}>
      <h3 style={{ margin: "0 0 4px", fontSize: 14, color: C.text }}>Categories</h3>
      <p style={{ ...wbNote, margin: "0 0 10px" }}>Switch a category off to hide it from every user. A dataset stays visible while at least one of its categories is on.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 8 }}>
        {VAULT_CATS.map(([id, label, desc]) => { const on = S.categories[id]; const c = count(id); return <div key={id} style={{ border: `1px solid ${on ? `${C.teal}66` : C.border}`, borderRadius: 8, padding: "10px 12px", background: on ? `${C.teal}0c` : C.raised }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><b style={{ fontSize: 13, color: on ? C.text : C.dim, flex: 1 }}>{label}</b><VSwitch on={on} disabled={busy === "settings"} label={`${label} category ${on ? "on" : "off"}`} onChange={v => saveSettings({ categories: { [id]: v } }, `${label} ${v ? "switched on" : "switched off"} for users`)} /></div>
          <div style={{ fontSize: 11.5, color: C.dim, margin: "2px 0 4px" }}>{desc}</div>
          <div style={{ fontSize: 11.5, color: on ? C.teal : C.gold }}>{on ? `${c.live} live of ${c.all} dataset${c.all === 1 ? "" : "s"}` : `Off: users do not see ${label}`}</div></div>; })}
      </div>
    </div>
    <div style={card}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: C.text, flex: "1 1 auto" }}>Datasets and where they are published ({ds.length})</h3>
        <select aria-label="Filter by category" value={cat} onChange={e => setCat(e.target.value)} style={{ ...sel, width: "auto", padding: "5px 8px", fontSize: 12 }}><option value="all">All categories</option>{VAULT_CATS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
        <input aria-label="Search datasets" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} style={{ ...inp, width: 180, padding: "5px 8px", fontSize: 12 }} />
      </div>
      {!ds.length && <p style={wbNote}>No datasets yet. Press + New dataset to prepare the first one.</p>}
      {ds.length > 0 && <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead><tr style={{ textAlign: "left", color: C.mid }}>{["Dataset", "Published in", "Who can see it", "Docs", "Status", "Updated", ""].map(h => <th key={h} style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}`, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
        <tbody>{shown.map(d => { const st = VAULT_STATE[d.state] || VAULT_STATE.draft; return <tr key={d.id} style={{ borderBottom: `1px solid ${C.border}` }}>
          <td style={{ padding: "8px", minWidth: 180 }}><button type="button" onClick={() => setEditing(d.id)} style={{ background: "none", border: "none", padding: 0, color: C.text, fontWeight: 600, cursor: "pointer", textAlign: "left", fontSize: 13 }}>{d.title}</button>
            <div style={{ fontSize: 11.5, color: C.dim }}>{d.n_rows.toLocaleString()} rows × {d.n_cols} columns{d.source_name ? ` · ${d.source_name}` : ""}</div></td>
          <td style={{ padding: "8px", minWidth: 170 }}><div style={{ fontSize: 11, color: C.dim, marginBottom: 2 }}>{S.name} ›</div>{d.categories.length ? d.categories.map(c => vaultChip(VAULT_CAT[c] || c, C.blue || C.teal, !S.categories[c])) : <span style={{ color: C.gold, fontSize: 11.5 }}>No category chosen</span>}</td>
          <td style={{ padding: "8px", color: C.mid, minWidth: 130 }}>{vaultAudience(d.audience)}</td>
          <td style={{ padding: "8px", color: C.mid }}>{(d.files || []).length}</td>
          <td style={{ padding: "8px", minWidth: 150 }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><VSwitch small on={d.published} disabled={busy === d.id} label={`Published: ${d.title}`} onChange={v => setPublished(d, v)} />
            <span title={st[2]} style={{ fontSize: 11.5, fontWeight: 600, color: C[st[1]] || C.mid }}>{st[0]}</span></div></td>
          <td style={{ padding: "8px", color: C.dim, whiteSpace: "nowrap" }}>{vaultWhen(d.updated_at)}</td>
          <td style={{ padding: "8px", whiteSpace: "nowrap" }}><button type="button" style={wbSmallBtn()} onClick={() => setEditing(d.id)}>Edit</button> <button type="button" style={wbSmallBtn(C.red)} aria-label={`Delete ${d.title}`} onClick={() => setConfirm(d)}>Delete</button></td></tr>; })}</tbody></table></div>}
    </div>
    </>}
    {confirm && <div role="dialog" aria-modal="true" aria-label="Delete dataset" style={{ position: "fixed", inset: 0, background: C.overlay, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ ...card, maxWidth: 420, marginBottom: 0 }}><h3 style={{ marginTop: 0, fontSize: 15, color: C.text }}>Delete “{confirm.title}”?</h3><p style={wbNote}>Its data and {(confirm.files || []).length} document(s) are removed for everyone. This cannot be undone.</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button type="button" style={wbSmallBtn()} onClick={() => setConfirm(null)}>Cancel</button><button type="button" style={btn(C.red)} disabled={busy === confirm.id} onClick={() => remove(confirm)}>Delete</button></div></div></div>}
    {editing && <VaultEditor id={editing === "new" ? null : editing} initial={editing === "new" ? preset : null} settings={S} users={users} notify={notify} onClose={() => { setEditing(null); setPreset(null); }} onSaved={load} />}
  </div>;
}
// ── Administrator: prepare, describe, document, choose who sees it, publish ──
const VAULT_BLANK = { title: "", description: "", categories: [], source_name: "", source_url: "", citation: "", license: "", coverage: "", notes: "", audience: { plans: ["pro", "enterprise"], users: [] }, allow_download: true, published: false };
function VaultEditor({ id, initial, settings, users, notify, onClose, onSaved }) {
  const blank = VAULT_BLANK;
  const [d, setD] = useState(id ? null : blank); const [curId, setCurId] = useState(id); const [table, setTable] = useState(null); const [dirtyData, setDirtyData] = useState(false); const [files, setFiles] = useState([]);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(""); const [wb, setWb] = useState(false); const [wbDs, setWbDs] = useState({}); const [wbF, setWbF] = useState({}); const [wbC, setWbC] = useState(null); const [wbO, setWbO] = useState(null);
  const [store, setStore] = useState([]); const [spick, setSpick] = useState("");
  useEffect(() => { vaultCall("GET", "/api/admin/library-storage").then(x => setStore(Array.isArray(x) ? x.filter(vaultIsTabular) : [])).catch(() => {}); }, []);
  useEffect(() => { if (initial && initial.table) { setTable(initial.table); setDirtyData(true); setChanged(true); setD(x => x ? { ...x, title: x.title || initial.title || "" } : x); } }, [initial]);
  const fromStore = async () => { const it = store.find(x => x.id === spick); if (!it) return; setBusy(`Opening ${it.name}…`); try { const ts = await vaultStoreTables(it); const now = new Date().toISOString(); const add = {};
      ts.forEach(t => { const nid = prjUid(); add[nid] = { id: nid, name: t.name, headers: t.headers, rows: t.rows, created: now, updated: now, source: "storage" }; }); setWbDs(x => ({ ...x, ...add }));
      if (ts.length === 1) { setTable({ headers: ts[0].headers, rows: ts[0].rows }); setDirtyData(true); setChanged(true); if (!d.title) set("title", ts[0].name); notify(`Using “${ts[0].name}” from storage`); }
      else notify(`${ts.length} tables from ${it.name} are in the Workbench list; choose one.`); } catch (e) { setErr(e.message); } setBusy(""); };
  const toStore = async () => { const x = wbDs[pick]; if (!x) return; setBusy(`Saving ${x.name} to storage…`); try { const m = await vaultSaveTable(x, "", "from the dataset editor"); setStore(s2 => [m, ...s2]); notify(`Saved “${x.name}” to storage`); } catch (e) { setErr(e.message); } setBusy(""); };
  const [pick, setPick] = useState(""); const [who, setWho] = useState(""); const [note, setNote] = useState(""); const fileRef = useRef(null); const [changed, setChanged] = useState(false);
  useEffect(() => { if (!id) return; let alive = true; (async () => { try { const x = await vaultCall("GET", `/api/admin/library/${id}`); if (!alive) return; const { headers, rows, files: fl, ...m } = x;
      setD({ ...VAULT_BLANK, ...m, audience: m.audience || VAULT_BLANK.audience }); setTable(headers && headers.length ? { headers, rows } : null); setFiles(fl || []); } catch (e) { setErr(e.message); } })(); return () => { alive = false; };
  }, [id]);
  const set = (k, v) => { setD(x => ({ ...x, [k]: v })); setChanged(true); };
  const wbList = Object.values(wbDs).filter(x => x && Array.isArray(x.headers));
  const takeWb = (dsId) => { const x = wbDs[dsId]; if (!x) return; setTable({ headers: [...x.headers], rows: x.rows.map(r => [...r]) }); setDirtyData(true); setChanged(true); if (!d.title) set("title", x.name || ""); notify(`Using “${x.name}”: ${x.rows.length.toLocaleString()} rows`); };
  const openWb = () => { if (table && !Object.keys(wbDs).length) { const nid = prjUid(); const now = new Date().toISOString(); setWbDs({ [nid]: { id: nid, name: d.title || "Vault dataset", headers: table.headers, rows: table.rows, created: now, updated: now, source: "vault" } }); setPick(nid); } setWb(true); };
  const save = async (publish) => { setErr(""); if (!d.title.trim()) { setErr("Give the dataset a title."); return null; } const wantPub = publish === undefined ? d.published : publish;
    if (wantPub && !table) { setErr("Add the data (step 1) before publishing."); return null; } if (wantPub && !d.categories.length) { setErr("Choose at least one category (step 2) before publishing, so users can find it."); return null; }
    setBusy("save"); try { const body = { title: d.title, description: d.description, categories: d.categories, source_name: d.source_name, source_url: d.source_url, citation: d.citation, license: d.license, coverage: d.coverage, notes: d.notes, audience: d.audience, allow_download: d.allow_download, published: wantPub, ...(dirtyData && table ? { data: table } : {}) };
      const out = curId ? await vaultCall("PATCH", `/api/admin/library/${curId}`, body) : await vaultCall("POST", "/api/admin/library", body);
      setCurId(out.id); setD(x => ({ ...x, published: out.published, state: out.state })); setDirtyData(false); setChanged(false); onSaved && onSaved();
      notify(wantPub ? `Published “${d.title}” to ${settings.name} › ${d.categories.map(c => VAULT_CAT[c]).join(", ")}` : `Saved “${d.title}” as a draft`); setBusy(""); return out.id; }
    catch (e) { setErr(e.message); setBusy(""); return null; } };
  const addFiles = async (list) => { const fs = [...(list || [])]; if (!fs.length) return; let target = curId; if (!target) { target = await save(false); if (!target) return; }
    for (const f of fs) { if (f.size > 15 * 1048576) { setErr(`${f.name} is ${vaultSize(f.size)}; each document can be up to 15 MB.`); continue; } setBusy(`Uploading ${f.name}…`);
      try { const m = await vaultUpload(target, f, note); setFiles(x => [...x, m]); } catch (e) { setErr(`${f.name}: ${e.message}`); } } setBusy(""); setNote(""); onSaved && onSaved(); };
  const delFile = async (f) => { try { await vaultCall("DELETE", `/api/admin/library/${curId}/files/${f.id}`); setFiles(x => x.filter(y => y.id !== f.id)); onSaved && onSaved(); } catch (e) { setErr(e.message); } };
  const addWho = () => { const u = who.trim(); if (!u) return; if (!users.some(x => x.username === u)) { setErr(`No user called ${u}. Pick a username from the list.`); return; } set("audience", { ...d.audience, users: [...new Set([...(d.audience.users || []), u])] }); setWho(""); setErr(""); };
  const close = () => { if (changed && !window.confirm("Close without saving your changes?")) return; onClose(); };
  const sec = { border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 12, background: C.card }; const h = (n, t) => <h3 style={{ margin: "0 0 8px", fontSize: 14, color: C.text }}><span style={{ color: C.gold, marginRight: 6 }}>{n}</span>{t}</h3>;
  const lab = (t, el, hint) => <label style={{ display: "block", marginBottom: 8 }}><span style={{ display: "block", fontSize: 12, color: C.mid, marginBottom: 3 }}>{t}</span>{el}{hint && <span style={{ display: "block", fontSize: 11, color: C.dim, marginTop: 2 }}>{hint}</span>}</label>;
  const where = d && d.categories.length ? `${settings.name} › ${d.categories.map(c => `${VAULT_CAT[c]}${settings.categories[c] ? "" : " (switched off)"}`).join(", ")}` : `${settings.name} › (choose a category)`;
  return <div role="dialog" aria-modal="true" aria-label={id ? "Edit Vault dataset" : "New Vault dataset"} style={{ position: "fixed", inset: 0, background: C.overlay, zIndex: 300, display: "flex", justifyContent: "center", alignItems: "stretch", padding: 16 }}>
    <div style={{ background: C.bg || C.card, border: `1px solid ${C.border}`, borderRadius: 10, width: "100%", maxWidth: 1000, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
        <h2 style={{ margin: 0, fontSize: 16, color: C.text, flex: 1 }}>{id ? "Edit dataset" : "New dataset"}{d && d.title ? `: ${d.title}` : ""}</h2>
        {busy && <span role="status" style={{ fontSize: 12, color: C.gold }}>{busy === "save" ? "Saving…" : busy}</span>}
        <button type="button" style={wbSmallBtn()} onClick={close} aria-label="Close editor">✕</button></div>
      {!d ? <div style={{ padding: 20, color: C.mid }} role="status">{err || "Loading…"}</div> : <div style={{ overflow: "auto", padding: 16, flex: 1 }}>
        <div style={sec}>{h("1", "Data")}
          {table ? <div><p style={{ fontSize: 12.5, color: C.text, margin: "0 0 6px" }}><b>{table.rows.length.toLocaleString()}</b> rows × <b>{table.headers.length}</b> columns{dirtyData ? <span style={{ color: C.gold }}> · not saved yet</span> : ""}</p>
            <div style={{ overflow: "auto", maxHeight: 180, border: `1px solid ${C.border}`, borderRadius: 6 }}><table style={{ borderCollapse: "collapse", fontSize: 11.5 }}><thead><tr>{table.headers.slice(0, 12).map((x, j) => <th key={j} style={{ textAlign: "left", padding: "4px 8px", borderBottom: `1px solid ${C.border}`, color: C.text, position: "sticky", top: 0, background: C.card }}>{x}</th>)}</tr></thead>
              <tbody>{table.rows.slice(0, 8).map((r, i) => <tr key={i}>{r.slice(0, 12).map((c, j) => <td key={j} style={{ padding: "3px 8px", color: C.mid, whiteSpace: "nowrap" }}>{String(c ?? "")}</td>)}</tr>)}</tbody></table></div></div>
            : <p style={wbNote}>No data yet. Open the Workbench to upload CSV or Excel files, pull tables out of PDFs, Word or PowerPoint files, then merge, append and clean them. Come back here and choose the finished dataset.</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
            <button type="button" style={btn(C.teal)} onClick={openWb}>{table ? "Edit or replace in Workbench" : "Prepare data in Workbench"}</button>
            {wbList.length > 0 && <><select aria-label="Workbench dataset to use" value={pick} onChange={e => setPick(e.target.value)} style={{ ...sel, width: "auto", padding: "6px 8px", fontSize: 12.5 }}><option value="">Choose a Workbench dataset…</option>{wbList.map(x => <option key={x.id} value={x.id}>{x.name} ({x.rows.length.toLocaleString()} rows)</option>)}</select>
              <button type="button" style={wbSmallBtn()} disabled={!pick} onClick={() => takeWb(pick)}>Use this dataset</button>
              <button type="button" style={wbSmallBtn()} disabled={!pick || !!busy} onClick={toStore} title="Keep this Workbench dataset in admin storage to finish later">Save to storage</button></>}
          </div>
          {store.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
            <select aria-label="Table from storage" value={spick} onChange={e => setSpick(e.target.value)} style={{ ...sel, width: "auto", padding: "6px 8px", fontSize: 12.5 }}><option value="">Or load from storage…</option>{store.map(x => <option key={x.id} value={x.id}>{x.folder ? `${x.folder} / ` : ""}{x.name}{x.n_rows != null ? ` (${x.n_rows.toLocaleString()} rows)` : ""}</option>)}</select>
            <button type="button" style={wbSmallBtn()} disabled={!spick || !!busy} onClick={fromStore}>Load</button></div>}
        </div>
        <div style={sec}>{h("2", "Details and source")}
          {lab("Title", <input value={d.title} maxLength={160} onChange={e => set("title", e.target.value)} style={inp} />)}
          {lab("Description", <textarea value={d.description || ""} rows={3} maxLength={4000} onChange={e => set("description", e.target.value)} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />, "What the data covers and how it can be used.")}
          <div style={{ marginBottom: 8 }}><span style={{ display: "block", fontSize: 12, color: C.mid, marginBottom: 4 }}>Categories (where users find it)</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{VAULT_CATS.map(([cid, l]) => { const on = d.categories.includes(cid); return <button key={cid} type="button" aria-pressed={on} onClick={() => set("categories", on ? d.categories.filter(x => x !== cid) : [...d.categories, cid])} style={{ ...pill(on, C.teal), fontSize: 12 }}>{l}{!settings.categories[cid] ? " (off)" : ""}</button>; })}</div>
            <span style={{ display: "block", fontSize: 11.5, color: C.dim, marginTop: 4 }}>Published in: <b style={{ color: C.text }}>{where}</b></span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "0 12px" }}>
            {lab("Source (organisation or survey)", <input value={d.source_name || ""} maxLength={200} onChange={e => set("source_name", e.target.value)} style={inp} placeholder="Ghana Statistical Service" />)}
            {lab("Source link", <input value={d.source_url || ""} maxLength={500} onChange={e => set("source_url", e.target.value)} style={inp} placeholder="https://…" />)}
            {lab("Licence or terms", <input value={d.license || ""} maxLength={200} onChange={e => set("license", e.target.value)} style={inp} placeholder="CC BY 4.0, for research only…" />)}
            {lab("Coverage", <input value={d.coverage || ""} maxLength={300} onChange={e => set("coverage", e.target.value)} style={inp} placeholder="Ghana, 2010 to 2024, 16 regions" />)}
          </div>
          {lab("How to cite", <textarea value={d.citation || ""} rows={2} maxLength={1200} onChange={e => set("citation", e.target.value)} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />)}
          {lab("Notes on method, cleaning and variables", <textarea value={d.notes || ""} rows={3} maxLength={4000} onChange={e => set("notes", e.target.value)} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />)}
        </div>
        <div style={sec}>{h("3", "Supporting documents")}
          <p style={{ ...wbNote, margin: "0 0 8px" }}>Attach the report, questionnaire, codebook or original tables so users can check the data. PDF, Excel, Word, PowerPoint, CSV or images, up to 15 MB each.{!curId ? " The dataset is saved as a draft when you add the first document." : ""}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input aria-label="Note for the next document" placeholder="Note (optional), e.g. Survey questionnaire" value={note} onChange={e => setNote(e.target.value)} style={{ ...inp, maxWidth: 320, padding: "6px 8px", fontSize: 12.5 }} />
            <button type="button" style={btn()} disabled={!!busy} onClick={() => fileRef.current?.click()}>Add documents</button>
            <input ref={fileRef} type="file" multiple hidden aria-label="Choose supporting documents" accept=".pdf,.xlsx,.xlsm,.xls,.ods,.csv,.tsv,.docx,.doc,.odt,.rtf,.txt,.md,.pptx,.ppt,.odp,.png,.jpg,.jpeg,.gif,.webp" onChange={e => { addFiles(e.target.files); e.target.value = ""; }} /></div>
          {files.length > 0 && <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>{files.map(f => <li key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: `1px solid ${C.border}`, fontSize: 12.5 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.gold, border: `1px solid ${C.gold}55`, borderRadius: 4, padding: "1px 5px" }}>{vaultKindIcon(f.kind)}</span>
            <span style={{ color: C.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}{f.note ? <span style={{ color: C.dim }}> · {f.note}</span> : ""}</span><span style={{ color: C.dim }}>{vaultSize(f.size_bytes)}</span>
            <button type="button" style={wbSmallBtn()} onClick={() => vaultFile(curId, f, true).catch(e => setErr(e.message))}>Open</button>
            <button type="button" style={wbSmallBtn(C.red)} aria-label={`Remove ${f.name}`} onClick={() => delFile(f)}>Remove</button></li>)}</ul>}
        </div>
        <div style={sec}>{h("4", "Who can see it")}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 8 }}>{VAULT_PLANS.map(([pid, l]) => <label key={pid} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: C.text }}>
            <input type="checkbox" checked={d.audience.plans.includes(pid)} onChange={e => set("audience", { ...d.audience, plans: e.target.checked ? [...d.audience.plans, pid] : d.audience.plans.filter(x => x !== pid) })} />Everyone on {l}</label>)}</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><input aria-label="Add a specific user" list="vault-users" placeholder="Also give access to a user…" value={who} onChange={e => setWho(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addWho(); } }} style={{ ...inp, maxWidth: 260, padding: "6px 8px", fontSize: 12.5 }} />
            <datalist id="vault-users">{(users || []).filter(u => u.role !== "admin").map(u => <option key={u.username} value={u.username}>{u.email} · {u.plan}</option>)}</datalist>
            <button type="button" style={wbSmallBtn()} onClick={addWho}>Add user</button></div>
          {(d.audience.users || []).length > 0 && <div style={{ marginTop: 8 }}>{d.audience.users.map(u => <span key={u} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, padding: "2px 4px 2px 9px", borderRadius: 12, border: `1px solid ${C.border}`, marginRight: 6, marginBottom: 4, color: C.text }}>{u}<button type="button" aria-label={`Remove ${u}`} onClick={() => set("audience", { ...d.audience, users: d.audience.users.filter(x => x !== u) })} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button></span>)}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}><VSwitch on={d.allow_download} label="Users may download the data" onChange={v => set("allow_download", v)} /><span style={{ fontSize: 12.5, color: C.text }}>Users may download the data as CSV or Excel</span></div>
          <p style={{ ...wbNote, margin: "6px 0 0" }}>Seen by: <b style={{ color: C.text }}>{vaultAudience(d.audience)}</b>. Administrators always see everything.</p>
        </div>
        <div style={{ ...sec, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 260px" }}><VSwitch on={d.published} label="Published" onChange={v => set("published", v)} /><span style={{ fontSize: 13, color: C.text }}>{d.published ? <>Published in <b>{where}</b></> : "Draft: users cannot see it"}</span></div>
          {err && <span role="alert" style={{ color: C.red, fontSize: 12.5, flexBasis: "100%" }}>{err}</span>}
          <button type="button" style={wbSmallBtn()} onClick={close}>Close</button>
          <button type="button" style={btn()} disabled={busy === "save"} onClick={() => save()}>Save</button>
        </div>
      </div>}
    </div>
    {wb && <Workbench startTab="datasets" onClose={() => setWb(false)} datasets={wbDs} setDatasets={setWbDs} formulas={wbF} setFormulas={setWbF} coding={wbC} setCoding={setWbC} optim={wbO} setOptim={setWbO}
      onChart={() => notify("Charts are made from the user dashboard. Here, choose the finished dataset with Use this dataset.")} onImpact={() => notify("The Impact Lab is on the user dashboard.")} basketTable={() => null} />}
  </div>;
}
// ── Administrator: storage for raw files and work in progress (never shown to users) ──
function AdminStorage({ notify, onPublish }) {
  const [items, setItems] = useState(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(""); const [folder, setFolder] = useState(""); const [note, setNote] = useState(""); const [filt, setFilt] = useState("all"); const [q, setQ] = useState("");
  const [wb, setWb] = useState(false); const [wbDs, setWbDs] = useState({}); const [wbF, setWbF] = useState({}); const [wbC, setWbC] = useState(null); const [wbO, setWbO] = useState(null); const [pick, setPick] = useState(""); const [confirm, setConfirm] = useState(null); const fileRef = useRef(null);
  const load = useCallback(async () => { try { setItems(await vaultCall("GET", "/api/admin/library-storage")); setErr(""); } catch (e) { setErr(e.message); } }, []);
  useEffect(() => { load(); }, [load]);
  const upload = async (list) => { const fs = [...(list || [])]; for (const f of fs) { if (f.size > 15 * 1048576) { setErr(`${f.name} is ${vaultSize(f.size)}; files can be up to 15 MB. Open big CSV or Excel files in the Workbench and save the table instead.`); continue; }
      setBusy(`Uploading ${f.name}…`); try { const q2 = `name=${encodeURIComponent(f.name)}&type=${encodeURIComponent(f.type || "")}&folder=${encodeURIComponent(folder)}&note=${encodeURIComponent(note)}`;
        const r = await fetch(`/api/admin/library-storage/file?${q2}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: f }); let j = null; try { j = await r.json(); } catch (e) { j = null; } if (!r.ok) throw new Error((j && j.error) || `Upload failed (${r.status})`); }
      catch (e) { setErr(`${f.name}: ${e.message}`); } } setBusy(""); if (fs.length) notify(`Saved ${fs.length} file${fs.length > 1 ? "s" : ""} to storage`); load(); };
  const wbList = Object.values(wbDs).filter(x => x && Array.isArray(x.headers));
  const saveWb = async () => { const x = wbDs[pick]; if (!x) return; setBusy(`Saving ${x.name}…`); try { await vaultSaveTable(x, folder, note); notify(`Saved “${x.name}” (${x.rows.length.toLocaleString()} rows) to storage`); load(); } catch (e) { setErr(e.message); } setBusy(""); };
  const toWb = async (it) => { setBusy(`Opening ${it.name}…`); try { const ts = await vaultStoreTables(it); const now = new Date().toISOString(); const add = {}; ts.forEach(t => { const nid = prjUid(); add[nid] = { id: nid, name: t.name, headers: t.headers, rows: t.rows, created: now, updated: now, source: "storage" }; });
      setWbDs(x => ({ ...x, ...add })); setPick(Object.keys(add)[0]); setWb(true); } catch (e) { setErr(e.message); } setBusy(""); };
  const publish = async (it) => { setBusy(`Opening ${it.name}…`); try { const ts = await vaultStoreTables(it); onPublish(ts[0]); if (ts.length > 1) notify(`${it.name} has ${ts.length} sheets; the first one was used. Open it in the Workbench to pick another.`); } catch (e) { setErr(e.message); } setBusy(""); };
  const download = async (it) => { try { if (it.kind === "table") { const [t] = await vaultStoreTables(it); const esc = (v) => { const s2 = String(v ?? ""); return /[",\n]/.test(s2) ? `"${s2.replace(/"/g, '""')}"` : s2; }; wxSave(new Blob(["\ufeff" + [t.headers, ...t.rows].map(r => r.map(esc).join(",")).join("\n")], { type: "text/csv" }), wxSlug(it.name) + ".csv"); return; }
      const r = await fetch(`/api/admin/library-storage/${encodeURIComponent(it.id)}`); if (!r.ok) throw new Error(`Download failed (${r.status})`); const blob = new Blob([await r.arrayBuffer()], { type: it.mime || "application/octet-stream" });
      if (/^(application\/pdf|image\/)/.test(it.mime || "")) { const url = URL.createObjectURL(blob); const w = window.open(url, "_blank", "noopener"); setTimeout(() => URL.revokeObjectURL(url), 60000); if (w) return; } wxSave(blob, it.name); } catch (e) { setErr(e.message); } };
  const edit = async (it, field) => { const cur = it[field] || ""; const v = window.prompt(field === "name" ? "New name" : field === "folder" ? "Folder (leave empty for none)" : "Note", cur); if (v === null || v === cur) return;
    try { await vaultCall("PATCH", `/api/admin/library-storage/${it.id}`, { [field]: v }); load(); } catch (e) { setErr(e.message); } };
  const del = async (it) => { try { await vaultCall("DELETE", `/api/admin/library-storage/${it.id}`); setConfirm(null); notify(`Deleted “${it.name}” from storage`); load(); } catch (e) { setErr(e.message); } };
  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 14 };
  if (err && !items) return <div style={card}><p style={{ color: C.red, fontSize: 13 }}>Could not open storage: {err}</p><p style={wbNote}>If this is the first time, run supabase_library_storage.sql in Supabase → SQL Editor, then reload.</p><button type="button" style={wbSmallBtn()} onClick={load}>Try again</button></div>;
  const folders = items ? [...new Set(items.map(x => x.folder).filter(Boolean))].sort() : [];
  const shown = (items || []).filter(x => (filt === "all" || (filt === "" ? !x.folder : x.folder === filt)) && (!q || `${x.name} ${x.note || ""} ${x.folder || ""}`.toLowerCase().includes(q.toLowerCase())));
  return <div>
    <div style={card}>
      <h3 style={{ margin: "0 0 4px", fontSize: 14, color: C.text }}>Storage</h3>
      <p style={{ ...wbNote, margin: "0 0 10px" }}>Keep raw files and tables you are still working on. Nothing here is ever shown to users. When a table is ready, press Make Vault dataset to describe, document and publish it.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input aria-label="Folder for new items" list="vault-folders" placeholder="Folder (optional)" value={folder} onChange={e => setFolder(e.target.value)} style={{ ...inp, width: 170, padding: "6px 8px", fontSize: 12.5 }} /><datalist id="vault-folders">{folders.map(f => <option key={f} value={f} />)}</datalist>
        <input aria-label="Note for new items" placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} style={{ ...inp, width: 220, padding: "6px 8px", fontSize: 12.5 }} />
        <button type="button" style={btn()} disabled={!!busy} onClick={() => fileRef.current?.click()}>Upload files</button>
        <input ref={fileRef} type="file" multiple hidden aria-label="Choose files for storage" onChange={e => { upload(e.target.files); e.target.value = ""; }} />
        <button type="button" style={btn(C.teal)} onClick={() => setWb(true)}>Open Workbench</button>
        {wbList.length > 0 && <><select aria-label="Workbench dataset to keep" value={pick} onChange={e => setPick(e.target.value)} style={{ ...sel, width: "auto", padding: "6px 8px", fontSize: 12.5 }}><option value="">Choose a Workbench dataset…</option>{wbList.map(x => <option key={x.id} value={x.id}>{x.name} ({x.rows.length.toLocaleString()} rows)</option>)}</select>
          <button type="button" style={wbSmallBtn()} disabled={!pick || !!busy} onClick={saveWb}>Save to storage</button></>}
        {busy && <span role="status" style={{ fontSize: 12, color: C.gold }}>{busy}</span>}
      </div>
      {err && <p role="alert" style={{ color: C.red, fontSize: 12.5, margin: "8px 0 0" }}>{err} <button type="button" style={{ ...wbSmallBtn(), padding: "1px 6px", fontSize: 11 }} onClick={() => setErr("")}>OK</button></p>}
    </div>
    <div style={card}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: C.text, flex: 1 }}>Stored items ({(items || []).length})</h3>
        <select aria-label="Filter by folder" value={filt} onChange={e => setFilt(e.target.value)} style={{ ...sel, width: "auto", padding: "5px 8px", fontSize: 12 }}><option value="all">All folders</option><option value="">No folder</option>{folders.map(f => <option key={f} value={f}>{f}</option>)}</select>
        <input aria-label="Search storage" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} style={{ ...inp, width: 180, padding: "5px 8px", fontSize: 12 }} /></div>
      {!items ? <p style={wbNote} role="status">Loading…</p> : !items.length ? <p style={wbNote}>Storage is empty. Upload files, or save tables from the Workbench.</p> :
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead><tr style={{ textAlign: "left", color: C.mid }}>{["Name", "Type", "Folder", "Size", "Updated", ""].map(h => <th key={h} style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{h}</th>)}</tr></thead>
        <tbody>{shown.map(it => <tr key={it.id} style={{ borderBottom: `1px solid ${C.border}` }}>
          <td style={{ padding: 8, minWidth: 180 }}><button type="button" onClick={() => edit(it, "name")} title="Rename" style={{ background: "none", border: "none", padding: 0, color: C.text, fontWeight: 600, cursor: "pointer", textAlign: "left", fontSize: 13 }}>{it.name}</button>
            <div style={{ fontSize: 11.5, color: C.dim, cursor: "pointer" }} onClick={() => edit(it, "note")} title="Edit note">{it.note || "add a note"}</div></td>
          <td style={{ padding: 8 }}><span style={{ fontSize: 10, fontWeight: 700, color: it.kind === "table" ? C.teal : C.gold, border: `1px solid ${it.kind === "table" ? C.teal : C.gold}55`, borderRadius: 4, padding: "1px 5px" }}>{it.kind === "table" ? "TABLE" : vaultKindIcon(it.kind)}</span></td>
          <td style={{ padding: 8 }}><button type="button" onClick={() => edit(it, "folder")} title="Move to a folder" style={{ background: "none", border: "none", padding: 0, color: it.folder ? C.text : C.dim, cursor: "pointer", fontSize: 12.5 }}>{it.folder || "—"}</button></td>
          <td style={{ padding: 8, color: C.mid, whiteSpace: "nowrap" }}>{it.kind === "table" ? `${(it.n_rows || 0).toLocaleString()} × ${it.n_cols}` : vaultSize(it.size_bytes)}</td>
          <td style={{ padding: 8, color: C.dim, whiteSpace: "nowrap" }}>{vaultWhen(it.updated_at)}</td>
          <td style={{ padding: 8, whiteSpace: "nowrap" }}>
            {vaultIsTabular(it) && <><button type="button" style={wbSmallBtn()} onClick={() => toWb(it)}>Open in Workbench</button> <button type="button" style={wbSmallBtn(C.teal)} onClick={() => publish(it)}>Make Vault dataset</button> </>}
            <button type="button" style={wbSmallBtn()} onClick={() => download(it)}>{/^(pdf|image)$/.test(it.kind) ? "View" : "Download"}</button> <button type="button" style={wbSmallBtn(C.red)} aria-label={`Delete ${it.name}`} onClick={() => setConfirm(it)}>Delete</button></td></tr>)}</tbody></table></div>}
    </div>
    {confirm && <div role="dialog" aria-modal="true" aria-label="Delete from storage" style={{ position: "fixed", inset: 0, background: C.overlay, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ ...card, maxWidth: 400, marginBottom: 0 }}><h3 style={{ marginTop: 0, fontSize: 15, color: C.text }}>Delete “{confirm.name}” from storage?</h3><p style={wbNote}>This cannot be undone. Published Vault datasets are not affected.</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button type="button" style={wbSmallBtn()} onClick={() => setConfirm(null)}>Cancel</button><button type="button" style={btn(C.red)} onClick={() => del(confirm)}>Delete</button></div></div></div>}
    {wb && <Workbench startTab="datasets" onClose={() => setWb(false)} datasets={wbDs} setDatasets={setWbDs} formulas={wbF} setFormulas={setWbF} coding={wbC} setCoding={setWbC} optim={wbO} setOptim={setWbO}
      onChart={() => notify("Charts are made from the user dashboard. Save the table to storage instead.")} onImpact={() => notify("The Impact Lab is on the user dashboard.")} basketTable={() => null} />}
  </div>;
}
// ── Users: browse the Vault ──
function VaultBrowser({ onClose, onOpen, isMobile, startId }) {
  const [lib, setLib] = useState(null); const [err, setErr] = useState(""); const [cat, setCat] = useState("all"); const [q, setQ] = useState(""); const [selId, setSelId] = useState(startId || null); const [full, setFull] = useState(null); const [busy, setBusy] = useState(""); const [page, setPage] = useState(0); const [msg, setMsg] = useState("");
  useEffect(() => { vaultCall("GET", "/api/library").then(setLib).catch(e => setErr(e.message)); }, []);
  useEffect(() => { if (!selId) return; let alive = true; setFull(null); setPage(0); setBusy("Loading the data…"); vaultCall("GET", `/api/library/${selId}`).then(x => { if (alive) { setFull(x); setBusy(""); } }).catch(e => { if (alive) { setErr(e.message); setBusy(""); } }); return () => { alive = false; }; }, [selId]);
  const list = lib ? lib.datasets.filter(d => (cat === "all" || d.categories.includes(cat)) && (!q || `${d.title} ${d.source_name || ""} ${d.description || ""} ${d.coverage || ""}`.toLowerCase().includes(q.toLowerCase()))) : [];
  const meta = lib && selId ? lib.datasets.find(d => d.id === selId) : null;
  const PER = 100; const nPages = full ? Math.max(1, Math.ceil(full.rows.length / PER)) : 1;
  const download = async (kind) => { if (!full) return; const nm = wxSlug(full.title);
    if (kind === "csv") { const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }; wxSave(new Blob(["﻿" + [full.headers, ...full.rows].map(r => r.map(esc).join(",")).join("\n")], { type: "text/csv" }), nm + ".csv"); }
    else await wxXlsxSave([{ title: full.title, rows: [full.headers, ...full.rows] }], nm + ".xlsx"); };
  const copyCite = async () => { const ok = await wbCopy(full.citation || ""); setMsg(ok ? "Citation copied." : "Copy blocked: select the text and copy it."); setTimeout(() => setMsg(""), 3000); };
  return <div role="dialog" aria-modal="true" aria-labelledby="vault-title" style={{ position: "fixed", inset: 0, background: C.overlay, zIndex: 380, display: "flex", justifyContent: "center", alignItems: "stretch", padding: isMobile ? 0 : 20 }}>
    <div style={{ background: C.bg || C.card, border: `1px solid ${C.border}`, borderRadius: isMobile ? 0 : 10, width: "100%", maxWidth: 1240, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
        <h2 id="vault-title" style={{ margin: 0, fontSize: 17, color: C.text, flex: 1 }}>◆ {lib ? lib.name : "Data Vault"}</h2>
        {busy && <span role="status" style={{ fontSize: 12, color: C.gold }}>{busy}</span>}
        <button type="button" style={wbSmallBtn()} onClick={onClose} aria-label="Close">✕</button></div>
      {!lib ? <div style={{ padding: 20, color: err ? C.red : C.mid, fontSize: 13 }} role="status">{err || "Loading…"}</div> :
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", flex: 1, minHeight: 0 }}>
        <div style={{ width: isMobile ? "auto" : 330, borderRight: isMobile ? "none" : `1px solid ${C.border}`, display: "flex", flexDirection: "column", minHeight: 0, ...(isMobile && selId ? { display: "none" } : {}) }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${C.border}` }}>
            <div role="tablist" aria-label="Categories" style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
              {[["all", "All"], ...VAULT_CATS.filter(([cid]) => lib.categories.includes(cid) && lib.datasets.some(d => d.categories.includes(cid)))].map(([cid, l]) => { const n = cid === "all" ? lib.datasets.length : lib.datasets.filter(d => d.categories.includes(cid)).length;
                return <button key={cid} type="button" role="tab" aria-selected={cat === cid} onClick={() => setCat(cid)} style={{ ...pill(cat === cid, C.teal), fontSize: 11.5, padding: "4px 9px" }}>{l} <span style={{ opacity: .7 }}>{n}</span></button>; })}</div>
            <input aria-label="Search the Vault" placeholder="Search title, source, coverage…" value={q} onChange={e => setQ(e.target.value)} style={{ ...inp, padding: "6px 8px", fontSize: 12.5 }} /></div>
          <div style={{ overflow: "auto", flex: 1 }}>
            {!lib.datasets.length && <p style={{ ...wbNote, padding: 12 }}>Nothing is available on your plan yet. Upgrade or contact support to request access.</p>}
            {lib.datasets.length > 0 && !list.length && <p style={{ ...wbNote, padding: 12 }}>No dataset matches.</p>}
            {list.map(d => <button key={d.id} type="button" onClick={() => setSelId(d.id)} aria-current={selId === d.id} style={{ display: "block", width: "100%", textAlign: "left", background: selId === d.id ? `${C.teal}14` : "transparent", border: "none", borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${selId === d.id ? C.teal : "transparent"}`, padding: "10px 12px", cursor: "pointer" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{d.title}</div>
              <div style={{ fontSize: 11.5, color: C.dim, margin: "2px 0 4px" }}>{d.source_name || "Source not given"} · {d.n_rows.toLocaleString()} rows{(d.files || []).length ? ` · ${(d.files || []).length} document${d.files.length > 1 ? "s" : ""}` : ""}</div>
              <div>{d.categories.map(c => vaultChip(VAULT_CAT[c] || c, C.teal))}</div></button>)}
          </div></div>
        <div style={{ flex: 1, overflow: "auto", padding: 16, minWidth: 0 }}>
          {!meta ? <p style={wbNote}>Choose a dataset to see its source, supporting documents and data.</p> : <div>
            {isMobile && <button type="button" style={{ ...wbSmallBtn(), marginBottom: 8 }} onClick={() => setSelId(null)}>← All datasets</button>}
            <h3 style={{ margin: "0 0 4px", fontSize: 18, color: C.text }}>{meta.title}</h3>
            <div style={{ marginBottom: 8 }}>{meta.categories.map(c => vaultChip(VAULT_CAT[c] || c, C.teal))}<span style={{ fontSize: 11.5, color: C.dim }}> Updated {vaultWhen(meta.updated_at)}</span>{meta.iesgi && meta.iesgi.public && meta.current_version > 0 && <button type="button" onClick={() => openIesgi(`/data/d/${encodeURIComponent(meta.id)}`)} style={{ ...wbSmallBtn(), padding: "2px 8px", fontSize: 11, marginLeft: 8 }} title="Open the public, citable version on the IESGI platform">View on IESGI · v{meta.current_version} ↗</button>}</div>
            {meta.description && <p style={{ fontSize: 13.5, color: C.text, lineHeight: 1.55, whiteSpace: "pre-wrap", margin: "0 0 12px" }}>{meta.description}</p>}
            <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 14px", fontSize: 12.5, margin: "0 0 12px" }}>
              <dt style={{ color: C.mid }}>Source</dt><dd style={{ margin: 0, color: C.text }}>{meta.source_name || "—"}{meta.source_url && <> · <a href={meta.source_url} target="_blank" rel="noopener noreferrer" style={{ color: C.teal }}>{meta.source_url.replace(/^https?:\/\//, "").slice(0, 60)}</a></>}</dd>
              {meta.coverage && <><dt style={{ color: C.mid }}>Coverage</dt><dd style={{ margin: 0, color: C.text }}>{meta.coverage}</dd></>}
              {meta.license && <><dt style={{ color: C.mid }}>Licence</dt><dd style={{ margin: 0, color: C.text }}>{meta.license}</dd></>}
              <dt style={{ color: C.mid }}>Size</dt><dd style={{ margin: 0, color: C.text }}>{meta.n_rows.toLocaleString()} rows × {meta.n_cols} columns</dd></dl>
            {meta.citation && <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", marginBottom: 12 }}><div style={{ display: "flex", alignItems: "center", marginBottom: 2 }}><b style={{ fontSize: 12, color: C.mid, flex: 1 }}>How to cite</b><button type="button" style={{ ...wbSmallBtn(), padding: "2px 8px", fontSize: 11 }} onClick={copyCite}>Copy</button></div><div style={{ fontSize: 12.5, color: C.text }}>{meta.citation}</div></div>}
            {meta.notes && <details style={{ marginBottom: 12 }}><summary style={{ cursor: "pointer", fontSize: 12.5, color: C.text, fontWeight: 600 }}>Notes on method and variables</summary><p style={{ fontSize: 12.5, color: C.mid, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{meta.notes}</p></details>}
            <h4 style={{ margin: "0 0 6px", fontSize: 13.5, color: C.text }}>Supporting documents</h4>
            {!(meta.files || []).length ? <p style={{ ...wbNote, marginTop: 0 }}>No documents attached.</p> : <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px" }}>{meta.files.map(f => <li key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: `1px solid ${C.border}`, fontSize: 12.5 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.gold, border: `1px solid ${C.gold}55`, borderRadius: 4, padding: "1px 5px" }}>{vaultKindIcon(f.kind)}</span>
              <span style={{ color: C.text, flex: 1, minWidth: 0 }}>{f.name}{f.note ? <span style={{ color: C.dim }}> · {f.note}</span> : ""}</span><span style={{ color: C.dim, whiteSpace: "nowrap" }}>{vaultSize(f.size_bytes)}</span>
              {/^(pdf|image)$/.test(f.kind) && <button type="button" style={wbSmallBtn()} onClick={() => vaultFile(meta.id, f, true).catch(e => setMsg(e.message))}>View</button>}
              <button type="button" style={wbSmallBtn()} onClick={() => vaultFile(meta.id, f, false).catch(e => setMsg(e.message))}>Download</button></li>)}</ul>}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "6px 0 8px" }}><h4 style={{ margin: 0, fontSize: 13.5, color: C.text, flex: 1 }}>Data</h4>
              <button type="button" style={btn()} disabled={!full} onClick={() => full && onOpen(full)}>Open in Workbench</button>
              {full && full.allow_download && <><button type="button" style={wbSmallBtn()} onClick={() => download("csv")}>Download CSV</button><button type="button" style={wbSmallBtn()} onClick={() => download("xlsx").catch(e => setMsg(e.message))}>Download Excel</button></>}</div>
            {msg && <p role="status" style={{ fontSize: 12, color: C.teal, margin: "0 0 6px" }}>{msg}</p>}
            {full && <div><div style={{ overflow: "auto", maxHeight: 420, border: `1px solid ${C.border}`, borderRadius: 6 }}><table style={{ borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr><th style={{ padding: "5px 8px", position: "sticky", top: 0, background: C.card, color: C.dim, borderBottom: `1px solid ${C.border}` }}>#</th>{full.headers.map((x, j) => <th key={j} style={{ textAlign: "left", padding: "5px 8px", position: "sticky", top: 0, background: C.card, color: C.text, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{x}</th>)}</tr></thead>
              <tbody>{full.rows.slice(page * PER, page * PER + PER).map((r, i) => <tr key={i}><td style={{ padding: "3px 8px", color: C.dim }}>{page * PER + i + 1}</td>{full.headers.map((_, j) => <td key={j} style={{ padding: "3px 8px", color: C.mid, whiteSpace: "nowrap", textAlign: typeof r[j] === "number" || /^-?\d+([.,]\d+)?$/.test(String(r[j] ?? "")) ? "right" : "left" }}>{String(r[j] ?? "")}</td>)}</tr>)}</tbody></table></div>
              {nPages > 1 && <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, fontSize: 12, color: C.mid }}><button type="button" style={wbSmallBtn()} disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Previous</button>Rows {(page * PER + 1).toLocaleString()} to {Math.min(full.rows.length, page * PER + PER).toLocaleString()} of {full.rows.length.toLocaleString()}<button type="button" style={wbSmallBtn()} disabled={page >= nPages - 1} onClick={() => setPage(p => p + 1)}>Next ›</button></div>}
              {!full.allow_download && <p style={{ ...wbNote, marginTop: 6 }}>Download is switched off for this dataset; you can still analyse it in the Workbench.</p>}</div>}
          </div>}
        </div>
      </div>}
    </div></div>;
}

export { AdminVault, VaultBrowser };
