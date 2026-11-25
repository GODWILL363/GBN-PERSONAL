// ui/chatkit.js — small pieces shared by the help assistant and the project chat
import React, { useCallback, useEffect, useRef, useState } from "react";
import { US } from "../core/store";
import { C, Ico } from "../core/theme";

// safe, minimal Markdown for assistant answers: **bold**, `code`, numbered and bulleted lists, line breaks
const inline = (t, keyBase) => { const out = []; const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g; let last = 0, m, k = 0;
  while ((m = re.exec(t))) { if (m.index > last) out.push(t.slice(last, m.index)); out.push(m[2] ? <strong key={`${keyBase}-${k++}`}>{m[2]}</strong> : <code key={`${keyBase}-${k++}`} style={{ background: C.card, borderRadius: 4, padding: "0 4px", fontSize: "0.92em" }}>{m[3]}</code>); last = re.lastIndex; }
  if (last < t.length) out.push(t.slice(last)); return out; };
function MiniMd({ text }) {
  const blocks = []; let list = null;
  String(text || "").split("\n").forEach((ln, i) => { const num = ln.match(/^\s*(\d+)[.)]\s+(.*)/), bul = ln.match(/^\s*[-*•]\s+(.*)/);
    if (num || bul) { const kind = num ? "ol" : "ul"; if (!list || list.kind !== kind) { list = { kind, items: [], key: i }; blocks.push(list); } list.items.push(inline(num ? num[2] : bul[1], i)); return; }
    list = null; if (ln.trim()) blocks.push({ kind: "p", body: inline(ln, i), key: i }); });
  return <div>{blocks.map(b => b.kind === "p" ? <p key={b.key} style={{ margin: "0 0 6px" }}>{b.body}</p>
    : React.createElement(b.kind, { key: b.key, style: { margin: "0 0 6px", paddingLeft: 20 } }, b.items.map((it, j) => <li key={j} style={{ marginBottom: 2 }}>{it}</li>)))}</div>;
}

// screens the assistant can open for the user
const HELP_ACTIONS = { open_workbench: "Open Workbench", open_formulas: "Open Formulas", open_merge: "Open Merge & append", open_optimize: "Open Optimization", open_pdf_tables: "Open PDF tables",
  open_coding: "Open Text coding", open_impact: "Open Impact Lab", open_dashboards: "Open Dashboards", open_vault: "Open Data Vault", open_projects: "Open Projects", open_snapshots: "Open My snapshots",
  open_settings: "Open Settings", open_regression: "Open Regression", open_dag: "Open DAG", open_composite: "Open Composite index", open_import: "Import your data" };
const runHelpAction = (name) => window.dispatchEvent(new CustomEvent("ecoscope-help-action", { detail: name }));

const fmtTime = (s) => { const d = new Date(s); return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };
const fmtDay = (s) => { const d = new Date(s); if (isNaN(d)) return ""; const t = new Date(); const y = new Date(Date.now() - 864e5);
  return d.toDateString() === t.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }); };
const avatarCol = (u) => ["#6ea8fe", "#3ecf8e", "#f0a950", "#b39ddb", "#56c7d4", "#e8737a"][Math.abs([...String(u || "?")].reduce((a, c) => a + c.charCodeAt(0), 0)) % 6];
const seenKey = (pid) => `ecoscope_chat_seen_${pid}`;
const getSeen = (pid) => { try { return +localStorage.getItem(seenKey(pid)) || 0; } catch (e) { return 0; } };
const setSeen = (pid, id) => { try { if (id > getSeen(pid)) localStorage.setItem(seenKey(pid), String(id)); } catch (e) { /* private mode */ } };
// show @mentions in colour; the current user's own name stands out
const withMentions = (text, me) => String(text).split(/(@[A-Za-z0-9_.-]{2,40})/g).map((part, i) => part.startsWith("@")
  ? <span key={i} style={{ color: part.slice(1).toLowerCase() === String(me).toLowerCase() ? C.gold : C.blue, fontWeight: 600 }}>{part}</span> : part);

// ── live chat for everyone who can open a project ──
function ProjectChat({ project, me, onClose, onSeen }) {
  const [msgs, setMsgs] = useState([]); const [err, setErr] = useState(""); const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState([]); const [typing, setTyping] = useState([]); const [people, setPeople] = useState([]); const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(null); const [ask, setAsk] = useState(null); const [role, setRole] = useState("");
  const lastId = useRef(0); const endRef = useRef(null); const inputRef = useRef(null); const lastTyping = useRef(0); const atBottom = useRef(true); const boxRef = useRef(null);
  const merge = (list) => setMsgs(cur => { const by = new Map(cur.map(m => [m.id, m])); list.forEach(m => by.set(m.id, m)); return [...by.values()].sort((a, b) => a.id - b.id); });
  const poll = useCallback(async (full) => {
    try { const r = await US.projectChat(project.id, full ? 0 : lastId.current); merge(r.messages || []); setOnline(r.online || []); setTyping(r.typing || []); setPeople(r.people || []); setRole(r.role || "");
      const top = (r.messages || []).reduce((m, x) => Math.max(m, x.id), lastId.current); lastId.current = top; if (top) { setSeen(project.id, top); onSeen && onSeen(top); } setErr(""); setLoaded(true); }
    catch (e) { setErr(e.message); setLoaded(true); } }, [project.id, onSeen]);
  // fast while the window is open and visible; a full reload now and then picks up edits and deletions
  useEffect(() => { lastId.current = 0; setMsgs([]); poll(true); let n = 0;
    const t = setInterval(() => { if (document.hidden) return; n++; poll(n % 10 === 0); }, 2500); return () => clearInterval(t); }, [poll]);
  useEffect(() => { if (atBottom.current) endRef.current?.scrollIntoView({ block: "end" }); }, [msgs.length, typing.length]);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); const k = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } }; window.addEventListener("keydown", k, true); return () => window.removeEventListener("keydown", k, true); }, [onClose]);
  const onType = (v) => { setText(v); if (v && Date.now() - lastTyping.current > 3000) { lastTyping.current = Date.now(); US.projectChatTyping(project.id).catch(() => {}); } };
  const send = async (e) => { e?.preventDefault(); const body = text.trim(); if (!body || busy) return; setBusy(true); setErr("");
    try { if (editing) { const m = await US.projectChatEdit(project.id, editing, body); merge([m]); setEditing(null); } else { const m = await US.projectChatSend(project.id, body); merge([m]); lastId.current = Math.max(lastId.current, m.id); setSeen(project.id, m.id); }
      setText(""); atBottom.current = true; } catch (er) { setErr(er.message); } setBusy(false); setTimeout(() => inputRef.current?.focus(), 20); };
  const del = async (m) => { setAsk(null); try { await US.projectChatDelete(project.id, m.id); merge([{ ...m, deleted: true, body: "" }]); } catch (er) { setErr(er.message); } };
  const canMod = role === "owner" || role === "admin";
  let lastDay = "";
  const mention = (u) => { setText(t => `${t}${t && !t.endsWith(" ") ? " " : ""}@${u} `); inputRef.current?.focus(); };
  return (
    <div role="dialog" aria-label={`Chat for ${project.name}`} style={{ position: "fixed", right: 18, bottom: 76, width: 400, maxWidth: "calc(100vw - 24px)", height: 560, maxHeight: "calc(100vh - 96px)", zIndex: 365, background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 12, boxShadow: C.shadow, display: "flex", flexDirection: "column", fontFamily: C.font }}>
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: C.teal, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Ico n="message" s={15} /></div>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</div>
          <div style={{ fontSize: 11, color: C.mid }}>{online.length ? <><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 4, background: "#3ecf8e", marginRight: 5 }} />{online.join(", ")} online</> : `${people.length || 1} ${people.length === 1 ? "person" : "people"} · nobody else online`}</div></div>
        <button type="button" onClick={onClose} aria-label="Close chat" style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, width: 28, height: 28, color: C.mid, cursor: "pointer" }}>✕</button>
      </div>
      {people.length > 1 && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: "6px 12px", borderBottom: `1px solid ${C.border}` }}>
        {people.filter(u => u !== me).map(u => <button key={u} type="button" onClick={() => mention(u)} title={`Mention ${u}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: C.text, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "1px 8px 1px 2px", cursor: "pointer" }}>
          <span style={{ width: 16, height: 16, borderRadius: 8, background: avatarCol(u), color: "#fff", fontSize: 9, display: "inline-flex", alignItems: "center", justifyContent: "center", position: "relative" }}>{u.slice(0, 1).toUpperCase()}
            {online.includes(u) && <span style={{ position: "absolute", right: -2, bottom: -2, width: 7, height: 7, borderRadius: 4, background: "#3ecf8e", border: `1px solid ${C.surface}` }} />}</span>{u}</button>)}</div>}
      <div ref={boxRef} onScroll={e => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }} role="log" aria-live="polite" style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        {!loaded ? <div style={{ color: C.dim, fontSize: 12, textAlign: "center", padding: 20 }}>Loading…</div>
          : !msgs.length ? <div style={{ color: C.dim, fontSize: 12, textAlign: "center", padding: 20, lineHeight: 1.6 }}>No messages yet. Everyone who can open this project sees this chat. Type @ and a name, or click a name above, to mention someone.</div>
          : msgs.map((m, i) => { const day = fmtDay(m.created_at); const showDay = day !== lastDay; lastDay = day; const mine = m.username === me; const prev = msgs[i - 1]; const grouped = !showDay && prev && prev.username === m.username && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60e3;
            return <React.Fragment key={m.id}>
              {showDay && <div style={{ textAlign: "center", fontSize: 11, color: C.dim, margin: "6px 0" }}>{day}</div>}
              <div style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "85%" }} className="pchat-msg">
                {!grouped && <div style={{ fontSize: 10.5, color: C.dim, margin: "2px 0", textAlign: mine ? "right" : "left" }}>{mine ? "You" : m.username} · {fmtTime(m.created_at)}{m.edited_at && !m.deleted ? " · edited" : ""}</div>}
                <div style={{ background: mine ? `${C.teal}22` : C.card, border: `1px solid ${mine ? C.teal + "55" : C.border}`, borderLeft: mine ? undefined : `3px solid ${avatarCol(m.username)}`, borderRadius: 8, padding: "6px 10px", color: m.deleted ? C.dim : C.text, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontStyle: m.deleted ? "italic" : "normal" }}>
                  {m.deleted ? "Message deleted" : withMentions(m.body, me)}</div>
                {!m.deleted && (mine || canMod) && <div style={{ display: "flex", gap: 8, justifyContent: mine ? "flex-end" : "flex-start", fontSize: 10.5, marginTop: 1 }}>
                  {mine && <button type="button" onClick={() => { setEditing(m.id); setText(m.body); inputRef.current?.focus(); }} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", padding: 0, fontSize: 10.5 }}>Edit</button>}
                  {ask === m.id ? <><button type="button" onClick={() => del(m)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", padding: 0, fontSize: 10.5 }}>Yes, delete</button><button type="button" onClick={() => setAsk(null)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", padding: 0, fontSize: 10.5 }}>Keep</button></>
                    : <button type="button" onClick={() => setAsk(m.id)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", padding: 0, fontSize: 10.5 }}>Delete</button>}</div>}
              </div></React.Fragment>; })}
        {typing.length > 0 && <div style={{ fontSize: 11.5, color: C.mid, fontStyle: "italic" }}>{typing.join(", ")} {typing.length > 1 ? "are" : "is"} typing…</div>}
        <div ref={endRef} />
      </div>
      {err && <div role="alert" style={{ padding: "4px 12px", color: C.red, fontSize: 12 }}>{err}</div>}
      <form onSubmit={send} style={{ borderTop: `1px solid ${C.border}`, padding: 8 }}>
        {editing && <div style={{ fontSize: 11, color: C.mid, marginBottom: 4 }}>Editing a message · <button type="button" onClick={() => { setEditing(null); setText(""); }} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", padding: 0, fontSize: 11 }}>Cancel</button></div>}
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
          <textarea ref={inputRef} value={text} onChange={e => onType(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={2} aria-label="Message"
            placeholder="Message everyone in this project… (Enter to send, Shift+Enter for a new line)" style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "7px 9px", fontSize: 13, fontFamily: C.font, resize: "none", lineHeight: 1.45 }} />
          <button type="submit" disabled={!text.trim() || busy} aria-label="Send" style={{ background: C.teal, color: "#fff", border: "none", borderRadius: 6, padding: "9px 12px", cursor: "pointer", opacity: !text.trim() || busy ? 0.5 : 1 }}><Ico n="arrowup" s={16} /></button>
        </div>
      </form>
    </div>);
}

export { HELP_ACTIONS, MiniMd, ProjectChat, getSeen, runHelpAction, setSeen };
