// ui/news.js — the bell in the top bar: what changed in EcoScope (built-in release notes + notices admins post)
import React, { useCallback, useEffect, useRef, useState } from "react";
import { US } from "../core/store";
import { C, Ico } from "../core/theme";
import { MiniMd } from "./chatkit";

// Release notes shipped with the app. Add the newest at the top with each deploy.
export const RELEASES = [
  { id: "rel-5", ts: "2026-11-25T20:45:00Z", when: "25 Nov 2026", kind: "update", version: "Update 5", title: "EcoScript: commands without to_ and spaced column names",
    body: "- In **Workbench → Formulas**, commands work with or without `to_`: `reg y x, robust`, `sum`, `scatter y x`, `twoway scatter y x || lfit y x`, `graph bar y, over(region)`, `hist x`, `ivregress 2sls y (x = z)`, `bysort country: ...`.\n- Column names with spaces or symbols, such as `GDP per Capita (USD)`, now work in every command with or without `[brackets]`. This fixes regressions that stopped at the first word of a name.\n- The missing-data notice now always agrees with the table." },
  { id: "rel-4", ts: "2026-11-25T12:00:00Z", when: "25 Nov 2026", kind: "update", version: "Update 4", title: "Better tables, missing-data alerts and this bell",
    body: "- **Table view** now lists every variable you chose, including columns from your own imported files, with full names and exact values.\n- **Missing data notice**: when any variable has gaps, EcoScope tells you how many and where, and you can fill them in one click (linear interpolation, forward fill, backward fill or mean). Filled cells show in italics, and a **Missing** row at the bottom counts gaps per column.\n- **What's new** (this bell): see each update or upgrade and what it does." },
  { id: "rel-3", ts: "2026-11-20T12:00:00Z", when: "November 2026", kind: "update", version: "Update 3", title: "Password reset, invitations, exports and project chat",
    body: "- **Forgot password** sends a reset link to your email.\n- **Invitations** to a shared project are emailed to collaborators.\n- **Charts** save as PNG, JPEG, WebP, SVG or PDF, copy to the clipboard, or go to **My snapshots**.\n- **Tables and regression results** download to Word, Excel, CSV and PowerPoint.\n- **Help assistant** answers questions about any feature and can open the right screen.\n- **Project chat**: talk live with everyone on a shared project." },
];
const KIND = { update: ["Update", () => C.teal], upgrade: ["Upgrade", () => C.gold], maintenance: ["Maintenance", () => C.orange], notice: ["Notice", () => C.blue || C.mid] };
const seenKey = (u) => `eco_news_seen:${u || "anon"}`;
const getSeenTs = (u) => { try { return localStorage.getItem(seenKey(u)) || ""; } catch (e) { return ""; } };
const putSeenTs = (u, ts) => { try { localStorage.setItem(seenKey(u), ts); } catch (e) {} };
const tsOf = (it) => it.ts || it.created_at || "";
const fmtWhen = (it) => it.when || (it.created_at ? new Date(it.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

export function NewsButton({ username, canPost = false, compact = false }) {
  const [items, setItems] = useState(RELEASES);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => getSeenTs(username));
  const [toast, setToast] = useState(null);
  const [draft, setDraft] = useState(null); // {id?, title, body, kind, version}
  const [msg, setMsg] = useState("");
  const box = useRef(null); const toasted = useRef(false);

  const load = useCallback(async () => {
    const r = await US.news(); const server = Array.isArray(r?.items) ? r.items.map((x) => ({ ...x, id: `srv-${x.id}`, sid: x.id })) : [];
    const all = [...server, ...RELEASES].sort((a, b) => String(tsOf(b)).localeCompare(String(tsOf(a))));
    setItems(all); return all;
  }, []);
  useEffect(() => { let alive = true;
    load().then((all) => { if (!alive || toasted.current) return; toasted.current = true; const s = getSeenTs(username); const top = all[0];
      if (top && s && tsOf(top) > s) setToast(top); // a returning user who has not seen the newest item
      if (!s && all.length) { putSeenTs(username, tsOf(all[all.length - 1])); setSeen(tsOf(all[all.length - 1])); } }); // first visit: only later items count as new
    const t = setInterval(() => { if (!document.hidden) load(); }, 300000);
    return () => { alive = false; clearInterval(t); }; }, [load, username]);
  useEffect(() => { setSeen(getSeenTs(username)); }, [username]);
  useEffect(() => { if (!open) return; const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); }; const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey); return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); }; }, [open]);

  const unread = items.filter((it) => seen && tsOf(it) > seen).length;
  const markRead = () => { const top = items[0]; if (top) { putSeenTs(username, tsOf(top)); setSeen(tsOf(top)); } setToast(null); };
  const toggle = () => { setOpen((v) => { if (!v) { load(); markRead(); } return !v; }); };

  const save = async () => { if (!draft?.title?.trim() || !draft?.body?.trim()) { setMsg("Add a title and a description."); return; }
    setMsg("Saving…"); const item = { title: draft.title, body: draft.body, kind: draft.kind || "update", version: draft.version || "" };
    const r = draft.sid ? await US.newsEdit(draft.sid, item) : await US.newsPost(item);
    if (r?.error) { setMsg("✗ " + r.error); return; } setMsg(draft.sid ? "Saved." : "Posted. Everyone sees it under the bell."); setDraft(null); await load(); markRead(); };
  const remove = async (it) => { if (!window.confirm(`Delete "${it.title}"? Users will no longer see it.`)) return; const r = await US.newsDelete(it.sid); if (r?.error) setMsg("✗ " + r.error); else { setMsg("Deleted."); load(); } };

  const field = { width: "100%", boxSizing: "border-box", background: C.inputBg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "7px 9px", fontSize: 12, fontFamily: C.font };
  return (
    <div ref={box} style={{ position: "relative" }}>
      <button type="button" onClick={toggle} aria-expanded={open} aria-label={`What's new${unread ? `, ${unread} new` : ""}`} title="What's new: updates and upgrades"
        style={{ display: "flex", alignItems: "center", gap: 5, background: open ? `${C.gold}18` : "none", border: `1px solid ${open ? C.gold : C.border}`, borderRadius: 6, color: C.text, cursor: "pointer", padding: compact ? "7px 9px" : "6px 10px", fontSize: 12, position: "relative" }}>
        <Ico n="bell" />{!compact && "What's new"}
        {unread > 0 && <span aria-hidden="true" style={{ position: "absolute", top: -6, right: -6, minWidth: 16, height: 16, borderRadius: 8, background: C.red, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", border: `2px solid ${C.surface}` }}>{unread > 9 ? "9+" : unread}</span>}
      </button>

      {toast && !open && (
        <div role="status" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 300, background: C.surface, border: `1px solid ${C.gold}66`, borderRadius: 8, padding: "10px 12px", boxShadow: C.shadow, zIndex: 210, fontSize: 12 }}>
          <div style={{ color: C.gold, fontWeight: 700, marginBottom: 3 }}>EcoScope has been updated</div>
          <div style={{ color: C.text, marginBottom: 8 }}>{toast.title}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => { setOpen(true); load(); markRead(); }} style={{ background: C.gold, color: C.onGold, border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>See what's new</button>
            <button type="button" onClick={markRead} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 10px", fontSize: 11, color: C.mid, cursor: "pointer" }}>Dismiss</button>
          </div>
        </div>
      )}

      {open && (
        <div role="dialog" aria-label="What's new" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: "min(380px, 92vw)", maxHeight: "72vh", overflowY: "auto", background: C.surface, border: `1px solid ${C.borderHi || C.border}`, borderRadius: 8, boxShadow: C.shadow, zIndex: 210 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.surface }}>
            <strong style={{ fontSize: 13 }}>What's new</strong>
            <div style={{ display: "flex", gap: 6 }}>
              {canPost && !draft && <button type="button" onClick={() => { setDraft({ title: "", body: "", kind: "update", version: "" }); setMsg(""); }} style={{ background: C.gold, color: C.onGold, border: "none", borderRadius: 6, padding: "4px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>+ Post</button>}
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>
          </div>
          {msg && <div role="status" style={{ padding: "6px 14px", fontSize: 11, color: msg.startsWith("✗") ? C.red : C.teal }}>{msg}</div>}
          {draft && (
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "grid", gap: 6 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <select aria-label="Type" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} style={{ ...field, width: 130 }}>{Object.entries(KIND).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
                <input aria-label="Version (optional)" placeholder="Version (optional)" value={draft.version} maxLength={40} onChange={(e) => setDraft({ ...draft, version: e.target.value })} style={field} />
              </div>
              <input aria-label="Title" placeholder="Title, e.g. New trade data for 2025" value={draft.title} maxLength={140} onChange={(e) => setDraft({ ...draft, title: e.target.value })} style={field} />
              <textarea aria-label="What it is about" placeholder={"What changed and what it means for users.\nStart lines with - for a list; **bold** works."} value={draft.body} maxLength={4000} rows={5} onChange={(e) => setDraft({ ...draft, body: e.target.value })} style={{ ...field, resize: "vertical" }} />
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => { setDraft(null); setMsg(""); }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 10px", fontSize: 11, color: C.mid, cursor: "pointer" }}>Cancel</button>
                <button type="button" onClick={save} style={{ background: C.gold, color: C.onGold, border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{draft.sid ? "Save" : "Post to everyone"}</button>
              </div>
            </div>
          )}
          {items.map((it) => { const [label, col] = KIND[it.kind] || KIND.notice;
            return (
              <article key={it.id} style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: col(), border: `1px solid ${col()}66`, borderRadius: 4, padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
                  {it.version && <span style={{ fontSize: 10, color: C.mid, fontFamily: C.mono }}>{it.version}</span>}
                  <span style={{ fontSize: 10, color: C.dim, fontFamily: C.mono, marginLeft: "auto" }}>{fmtWhen(it)}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>{it.title}</div>
                <div style={{ fontSize: 12, color: C.mid, lineHeight: 1.55 }}><MiniMd text={it.body} /></div>
                {canPost && it.sid && <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button type="button" onClick={() => { setDraft({ sid: it.sid, title: it.title, body: it.body, kind: it.kind, version: it.version || "" }); setMsg(""); }} style={{ background: "none", border: "none", color: C.blue || C.teal, cursor: "pointer", fontSize: 11, padding: 0 }}>Edit</button>
                  <button type="button" onClick={() => remove(it)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 11, padding: 0 }}>Delete</button>
                </div>}
              </article>); })}
        </div>
      )}
    </div>
  );
}
