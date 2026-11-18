// ui/settings.js — split from App.js (code unchanged; only imports and exports were added)
import { useEffect, useState } from "react";
import { imputeData } from "../analysis/stats";
import { fmtVal, useIsMobile } from "../core/fetch";
import { US } from "../core/store";
import { C, COUNTRIES, Ico, PLANS, PRO_SOURCES, THEMES, YEARS } from "../core/theme";
import { MACRO_SOURCES, MICRO_SOURCES } from "../data/sources";
import { ciFmt, meAI2016, meIPWSandwich, meOLSRobustness, meSynthCV, tdN, tdS, thS } from "../impact/estimators";
import { SUPPORT_FAQ, dsParseTime } from "../impact/tabs";
import { AccountManager, ChangePassword, PasswordInput, StBanner, StField, StSec, btn, inp, pill, sel } from "./login";

function Settings({ user, settings, onSave, onClose, initialTab = "account", onRequestUpgrade, onOpenSupport, onAccount, onDeleted }) {
  const isMobile = useIsMobile();
  const [s, setS] = useState({ ...settings });
  const [tab, setTab] = useState(initialTab);
  const isAdmin = user?.role === "admin";
  const plan = PLANS[user?.plan || "free"] || PLANS.free;
  const dirty = JSON.stringify(s) !== JSON.stringify(settings);
  useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const tabs = [
    { id: "account", icon: "user", label: "Account" },
    { id: "security", icon: "lock", label: "Password & security" },
    { id: "data", icon: "chart", label: "Data defaults" },
    { id: "sources", icon: "globe", label: "Data sources" },
    ...(isAdmin ? [{ id: "keys", icon: "key", label: "API keys" }] : []),
    { id: "theme", icon: "display", label: "Appearance" },
    { id: "plan", icon: "card", label: "Subscription" },
    { id: "support", icon: "message", label: "Support" },
    { id: "help", icon: "help", label: "Help & about" },
  ];
  const allSources = [...MACRO_SOURCES, ...MICRO_SOURCES].filter((x, i, a) => a.findIndex(y => y.id === x.id) === i);
  const proLocked = (sid) => PRO_SOURCES.includes(sid) && !plan.aiInsights;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="settings-title" style={{ position: "fixed", inset: 0, background: C.overlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: isMobile ? 0 : 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: isMobile ? 0 : 10, width: "100%", maxWidth: 860, height: isMobile ? "100%" : "min(88vh, 720px)", display: "flex", flexDirection: "column", fontFamily: C.font, boxShadow: C.shadow, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: C.gold, color: C.onGold, display: "flex", alignItems: "center", justifyContent: "center" }}><Ico n="settings" s={17} /></div>
            <div><h2 id="settings-title" style={{ margin: 0, fontSize: 16, fontWeight: 600, color: C.text }}>Settings</h2><div style={{ fontSize: 11, color: C.mid }}>Account, data and appearance</div></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close settings" style={{ background: "none", border: `1px solid ${C.border}`, color: C.mid, cursor: "pointer", width: 32, height: 32, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", flex: 1, minHeight: 0 }}>
          {/* Navigation */}
          <nav aria-label="Settings sections" style={{ width: isMobile ? "100%" : 210, background: C.card, borderRight: isMobile ? "none" : `1px solid ${C.border}`, borderBottom: isMobile ? `1px solid ${C.border}` : "none", padding: isMobile ? "8px" : "12px 8px", display: "flex", flexDirection: isMobile ? "row" : "column", gap: 2, flexShrink: 0, overflowX: isMobile ? "auto" : "visible" }}>
            {!isMobile && <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px 14px", marginBottom: 6, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: user.avatarColor || C.gold, color: "#0b0e14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{user.initials || "U"}</div>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.displayName || user.username}</div>
                <span style={{ display: "inline-block", marginTop: 2, background: plan.color, color: C.onGold, borderRadius: 4, padding: "0 6px", fontSize: 10, fontWeight: 700 }}>{plan.badge}</span></div>
            </div>}
            {tabs.map(t => { const on = tab === t.id; return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={on ? "page" : undefined}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 6, border: "none", background: on ? `${C.gold}18` : "transparent", cursor: "pointer", textAlign: "left", whiteSpace: "nowrap", color: on ? C.gold : C.mid, fontSize: 13, fontWeight: on ? 600 : 500, flexShrink: 0 }}>
                <Ico n={t.icon} s={15} />{t.label}
              </button>); })}
          </nav>
          {/* Content */}
          <div id="scroll-settings" style={{ flex: 1, overflowY: "auto", padding: isMobile ? "16px" : "20px 24px", minWidth: 0 }}>
            {tab === "account" && <>
              <StSec title="Profile">
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, flexWrap: "wrap" }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: user.avatarColor || C.gold, color: "#0b0e14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, flexShrink: 0 }}>{user.initials || "U"}</div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{s.displayName || user.username}</div>
                    <div style={{ color: C.mid, fontSize: 12 }}>{user.email || "No email on file"}</div>
                    <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>Username: {user.username}{user.role ? ` · Role: ${user.role}` : ""}</div>
                  </div>
                  <button type="button" onClick={() => setTab("plan")} style={{ ...pill(false), display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <span style={{ background: plan.color, color: C.onGold, borderRadius: 4, padding: "0 6px", fontSize: 10, fontWeight: 700 }}>{plan.badge}</span>{plan.name} plan</button>
                </div>
              </StSec>
              <AccountManager part="details" user={user} settings={settings} onSaveSettings={(ns) => { setS(ns); onSave(ns); }} onAccount={onAccount} onDeleted={onDeleted} />
              <StSec title="Shortcuts">
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 10 }}>
                  {[["lock", "Change password", "security"], ["chart", "Data defaults", "data"], ["message", "Contact support", "support"]].map(([ic, l, t]) =>
                    <button key={t} type="button" onClick={() => setTab(t)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, cursor: "pointer", textAlign: "left" }}><Ico n={ic} s={16} />{l}</button>)}
                </div>
              </StSec>
              <AccountManager part="delete" user={user} settings={settings} onDeleted={onDeleted} />
            </>}
            {tab === "security" && <>
              <StSec title="Change password" sub="You will need your current password.">
                <ChangePassword user={user} />
              </StSec>
              <StSec title="Session">
                <div style={{ fontSize: 12, color: C.mid, lineHeight: 1.6 }}>You are signed in as <b style={{ color: C.text }}>{user.username}</b> on this browser. Signing out clears the saved session on this device.</div>
              </StSec>
            </>}
            {tab === "data" && <>
              <StSec title="Defaults for new sessions">
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0 16px" }}>
                  <StField label="Default country" htmlFor="st-country"><select id="st-country" value={s.defaultCountry || "GH"} onChange={e => setS(x => ({ ...x, defaultCountry: e.target.value }))} style={{ ...sel, fontSize: 13 }}>{COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name} ({c.region})</option>)}</select></StField>
                  <StField label="Default source" htmlFor="st-src"><select id="st-src" value={s.defaultSource || "worldbank"} onChange={e => setS(x => ({ ...x, defaultSource: e.target.value }))} style={{ ...sel, fontSize: 13 }}>{allSources.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></StField>
                  <StField label="Start year" htmlFor="st-y0"><select id="st-y0" value={s.startYear || 2000} onChange={e => setS(x => ({ ...x, startYear: +e.target.value }))} style={{ ...sel, fontSize: 13 }}>{YEARS.map(y => <option key={y} value={y}>{y}</option>)}</select></StField>
                  <StField label="End year" htmlFor="st-y1"><select id="st-y1" value={s.endYear || 2023} onChange={e => setS(x => ({ ...x, endYear: +e.target.value }))} style={{ ...sel, fontSize: 13 }}>{YEARS.map(y => <option key={y} value={y}>{y}</option>)}</select></StField>
                </div>
                <StField label="Default data level">
                  <div role="group" aria-label="Default data level" style={{ display: "flex", gap: 8 }}>
                    {[["macro", "Macro", "chart"], ["micro", "Micro", "flask"]].map(([l, t, ic]) => <button key={l} type="button" aria-pressed={(s.defaultLevel || "macro") === l} onClick={() => setS(x => ({ ...x, defaultLevel: l }))} style={{ ...pill((s.defaultLevel || "macro") === l), flex: 1, padding: "8px", display: "inline-flex", gap: 6, alignItems: "center", justifyContent: "center", fontSize: 12 }}><Ico n={ic} />{t}</button>)}
                  </div>
                </StField>
              </StSec>
            </>}
            {tab === "sources" && <>
              <StSec title="Data sources" sub={`${allSources.length} sources. Most are served through the World Bank API.`}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>{["Source", "Variables", "Access", "Coverage"].map((h, i) => <th key={h} scope="col" style={{ ...thS, textAlign: i === 1 ? "right" : "left" }}>{h}</th>)}</tr></thead>
                    <tbody>{allSources.map(x => { const locked = proLocked(x.id); return (
                      <tr key={x.id}>
                        <td style={{ ...tdS, whiteSpace: "normal" }}><span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: x.color, marginRight: 8 }} /><a href={x.url} target="_blank" rel="noreferrer" style={{ color: C.text }}>{x.name}</a></td>
                        <td style={tdN}>{(x.vars || []).length}</td>
                        <td style={tdS}>{locked ? <span style={{ color: C.orange }}><Ico n="lock" /> Pro</span> : x.keyRequired ? <span style={{ color: C.mid }}><Ico n="key" /> API key</span> : <span style={{ color: C.teal }}>✓ Open</span>}</td>
                        <td style={{ ...tdS, color: C.mid }}>{x.countryFixed ? (x.id === "fred" ? "United States" : x.region) : (x.region || "Global")}</td>
                      </tr>); })}</tbody>
                  </table>
                </div>
                {!plan.aiInsights && <div style={{ marginTop: 12 }}><StBanner tone="warn">Sources marked Pro need a Pro or Enterprise plan. <button type="button" onClick={() => setTab("plan")} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", padding: 0, fontSize: 12, textDecoration: "underline" }}>See plans</button></StBanner></div>}
              </StSec>
            </>}
            {tab === "keys" && isAdmin && <>
              <StBanner>Keys entered here are stored with your account settings and used from this browser.</StBanner>
              <StSec title="Anthropic API" right={<a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Get a key ↗</a>}>
                <StField label="API key" htmlFor="k-ant"><PasswordInput id="k-ant" value={s.anthropicKey || ""} onChange={v => setS(x => ({ ...x, anthropicKey: v }))} placeholder="sk-ant-api03-…" autoComplete="off" /></StField>
                <div style={{ fontSize: 12, color: s.anthropicKey ? C.teal : C.mid }}>{s.anthropicKey ? "✓ AI insights enabled" : "Needed for the optional AI narrative."}</div>
              </StSec>
              <StSec title="FRED (Federal Reserve)" right={<a href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Get a free key ↗</a>}>
                <StField label="API key" htmlFor="k-fred"><PasswordInput id="k-fred" value={s.fredKey || ""} onChange={v => setS(x => ({ ...x, fredKey: v }))} placeholder="Your FRED API key" autoComplete="off" /></StField>
                <div style={{ fontSize: 12, color: s.fredKey ? C.teal : C.mid }}>{s.fredKey ? "✓ FRED data enabled" : "Needed for the FRED source."}</div>
              </StSec>
            </>}
            {tab === "theme" && <>
              <StSec title="Theme">
                <div role="radiogroup" aria-label="Theme" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3,1fr)", gap: 10 }}>
                  {Object.entries(THEMES).map(([key, th]) => { const on = (s.theme || "dark") === key; return (
                    <button key={key} type="button" role="radio" aria-checked={on} onClick={() => setS(x => ({ ...x, theme: key }))} style={{ padding: "12px 14px", borderRadius: 8, border: `2px solid ${on ? C.gold : C.border}`, background: th.bg, cursor: "pointer", textAlign: "left" }}>
                      <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>{[th.surface, th.gold, th.teal, th.red].map((col, i) => <span key={i} style={{ width: 16, height: 16, borderRadius: 4, background: col, border: `1px solid ${th.borderHi}` }} />)}</div>
                      <div style={{ color: th.text, fontSize: 13, fontWeight: 600 }}>{th.label}</div>
                      <div style={{ color: th.mid, fontSize: 11 }}>{th.scheme === "dark" ? "Dark" : "Light"}{on ? " · selected" : ""}</div>
                    </button>); })}
                </div>
                <div style={{ fontSize: 11, color: C.dim, marginTop: 8 }}>The theme applies when you save.</div>
              </StSec>
              <StSec title="Charts">
                <StField label="Default chart type"><div role="group" aria-label="Default chart type" style={{ display: "flex", gap: 8 }}>{[["area", "Area"], ["line", "Line"], ["bar", "Bar"]].map(([t, l]) => <button key={t} type="button" aria-pressed={s.chartType === t} onClick={() => setS(x => ({ ...x, chartType: t }))} style={{ ...pill(s.chartType === t), flex: 1, padding: "8px", fontSize: 12 }}>{l}</button>)}</div></StField>
                <StField label="Default view"><div role="group" aria-label="Default view" style={{ display: "flex", gap: 8 }}>{[["chart", "Chart"], ["table", "Table"]].map(([v, l]) => <button key={v} type="button" aria-pressed={s.defaultView === v} onClick={() => setS(x => ({ ...x, defaultView: v }))} style={{ ...pill(s.defaultView === v), flex: 1, padding: "8px", fontSize: 12 }}>{l}</button>)}</div></StField>
              </StSec>
            </>}
            {tab === "plan" && <>
              <StSec title="Current plan">
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", border: `1px solid ${plan.color}66`, background: `${plan.color}10`, borderRadius: 8, flexWrap: "wrap" }}>
                  <span style={{ background: plan.color, color: C.onGold, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{plan.badge}</span>
                  <div style={{ flex: 1, minWidth: 160 }}><div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{plan.name}</div><div style={{ color: C.mid, fontSize: 12 }}>{plan.desc}</div></div>
                  <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{plan.priceLabel}</div>
                </div>
              </StSec>
              <StSec title="Compare plans">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><th scope="col" style={thS}>Feature</th>{Object.values(PLANS).map(p => <th key={p.id} scope="col" style={{ ...thS, textAlign: "center", color: p.id === plan.id ? C.gold : C.mid }}>{p.name}{p.id === plan.id ? " (yours)" : ""}</th>)}</tr></thead>
                    <tbody>{[
                      ["Price", p => p.priceLabel],
                      ["Data sources", p => p.sources === "all" ? "All" : `${p.sources.length}`],
                      ["AI insights", p => p.aiInsights ? "✓" : "—"],
                      ["Exports", p => p.exports.join(", ").toUpperCase()],
                      ["Country comparison", p => p.compare ? "✓" : "—"],
                      ["Years of history", p => `${p.maxYears}`],
                    ].map(([f, fn]) => <tr key={f}><td style={tdS}>{f}</td>{Object.values(PLANS).map(p => <td key={p.id} style={{ ...tdS, textAlign: "center" }}>{fn(p)}</td>)}</tr>)}</tbody>
                  </table>
                </div>
                {plan.id !== "enterprise" && <button type="button" onClick={() => { onClose(); onRequestUpgrade && onRequestUpgrade(); }} style={{ ...btn(), marginTop: 14, padding: "9px 18px", fontSize: 12 }}>Request an upgrade</button>}
                <div style={{ fontSize: 11, color: C.dim, marginTop: 8 }}>Upgrades are reviewed by an administrator.</div>
              </StSec>
            </>}
            {tab === "support" && <>
              <StSec title="Get help" sub="Ask the assistant how a feature works, or message the EcoScope team.">
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                  <button type="button" onClick={() => { onClose(); onOpenSupport && onOpenSupport("assistant"); }} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", textAlign: "left", color: C.text }}>
                    <Ico n="sparkle" s={18} /><span><b style={{ fontSize: 13 }}>Ask the assistant</b><span style={{ display: "block", fontSize: 12, color: C.mid, marginTop: 2 }}>Instant answers about features and methods.</span></span></button>
                  <button type="button" onClick={() => { onClose(); onOpenSupport && onOpenSupport("support"); }} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", textAlign: "left", color: C.text }}>
                    <Ico n="message" s={18} /><span><b style={{ fontSize: 13 }}>Message support</b><span style={{ display: "block", fontSize: 12, color: C.mid, marginTop: 2 }}>Report a bug, a data issue or a billing question. Replies appear in the chat.</span></span></button>
                </div>
              </StSec>
              <StSec title="Common questions">
                {SUPPORT_FAQ.slice(0, 6).map(f => <details key={f.q} style={{ padding: "10px 12px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 8 }}>
                  <summary style={{ cursor: "pointer", color: C.text, fontSize: 13, fontWeight: 500 }}>{f.q}</summary>
                  <div style={{ color: C.mid, fontSize: 12, lineHeight: 1.6, marginTop: 8 }}>{f.a}</div></details>)}
              </StSec>
            </>}
            {tab === "help" && <>
              <StSec title="Data providers">
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
                  {[["globe", "World Bank Open Data", "https://data.worldbank.org", "1,400+ global indicators"], ["chart", "IMF Data Mapper", "https://www.imf.org/external/datamapper", "Macro projections and history"],
                    ["bank", "FRED", "https://fred.stlouisfed.org", "US economic data"], ["flask", "WHO Global Health Observatory", "https://www.who.int/data/gho", "Health statistics"],
                    ["briefcase", "ILOSTAT", "https://ilostat.ilo.org", "Labour market data"], ["cap", "UNESCO UIS", "https://uis.unesco.org", "Education statistics"],
                    ["bank", "Bank of Ghana", "https://www.bog.gov.gh/economic-data/", "Ghana monetary data"]].map(([ic, n, u, d]) =>
                    <a key={n} href={u} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: C.card, borderRadius: 6, border: `1px solid ${C.border}`, textDecoration: "none" }}>
                      <span style={{ color: C.mid }}><Ico n={ic} s={18} /></span><span style={{ flex: 1 }}><span style={{ display: "block", color: C.text, fontSize: 13, fontWeight: 500 }}>{n}</span><span style={{ color: C.dim, fontSize: 11 }}>{d}</span></span><span style={{ color: C.dim }}>↗</span></a>)}
                </div>
              </StSec>
              <StSec title="About EcoScope">
                <div style={{ color: C.mid, fontSize: 12, lineHeight: 1.7 }}>EcoScope v2.1 · Global economic intelligence platform. Data from the World Bank, IMF, FRED, WHO, ILO, UNESCO, Bank of Ghana, BIS and UNCTAD. Causal tools: DAG builder, matching and weighting, synthetic control. Optional AI narratives powered by Claude (Anthropic).</div>
              </StSec>
            </>}
          </div>
        </div>
        {/* Footer */}
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 20px", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {dirty && <span style={{ marginRight: "auto", fontSize: 12, color: C.mid }}>Unsaved changes</span>}
          <button type="button" onClick={onClose} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "9px 18px", color: C.mid, fontSize: 12, cursor: "pointer" }}>{dirty ? "Cancel" : "Close"}</button>
          <button type="button" disabled={!dirty} onClick={() => { onSave(s); onClose(); }} style={{ ...btn(), padding: "9px 22px", fontSize: 12, opacity: dirty ? 1 : 0.5 }}>Save changes</button>
        </div>
      </div>
    </div>
  );
}
// ══════════════════════════════════════════════
// TOOLTIP
// ══════════════════════════════════════════════

const CustomTip = ({active,payload,label,fmt,fmtOf,lab}) => {
  if (!active||!payload?.length) return null;
  return (
    <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:6,padding:"10px 14px",fontFamily:C.mono,fontSize:11}}>
      <div style={{color:C.mid,marginBottom:6}}>{lab? lab(label) : label}</div>
      {payload.map((p,i)=>(
        <div key={i} style={{color:p.stroke||p.fill||C.gold,display:"flex",gap:12,justifyContent:"space-between"}}>
          <span>{p.name}</span><span style={{fontWeight:600}}>{fmtVal(p.value,(fmtOf&&fmtOf(p.dataKey))||fmt)}</span>
        </div>
      ))}
    </div>
  );
};
// ══════════════════════════════════════════════
// UPGRADE REQUEST MODAL (user-facing)
// ══════════════════════════════════════════════
function UpgradeRequestModal({user,currentPlan,onClose}){
  const [plan,setPlan]=useState("pro");
  const [message,setMessage]=useState("");
  const [sent,setSent]=useState(false);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");

  const submit=async e=>{
    e.preventDefault();setErr("");
    if(plan===currentPlan){setErr("You are already on this plan.");return;}
    setLoading(true);
    await new Promise(r=>setTimeout(r,700));
    const res=await US.requestPlan(user.username,user.email,currentPlan,plan,message);
    setLoading(false);
    if(res.error){setErr(res.error);return;}
    setSent(true);
  };

  return(
    <div style={{position:"fixed",inset:0,background:C.overlay,display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}}>
      <div style={{background:C.surface,border:`1px solid ${C.borderHi}`,borderRadius:6,padding:"36px 40px",width:460,fontFamily:C.font,boxShadow:C.shadow}}>
        {sent?(
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:48,marginBottom:16}}><Ico n="inbox"/></div>
            <h2 style={{color:C.teal,fontSize:18,fontWeight:700,marginBottom:10}}>Request Sent!</h2>
            <p style={{color:C.mid,fontSize:12,fontFamily:C.mono,lineHeight:1.7,marginBottom:24}}>Your upgrade request to <strong style={{color:PLANS[plan].color}}>{PLANS[plan].name}</strong> has been sent to the administrator. You will be notified once it is approved.</p>
            <button onClick={onClose} style={{...btn(),padding:"11px 28px",fontSize:12}}>Got it →</button>
          </div>
        ):(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
              <div>
                <h2 style={{color:C.text,fontSize:16,fontWeight:700,margin:"0 0 3px"}}><Ico n="arrowup"/> Request Plan Upgrade</h2>
                <div style={{color:C.mid,fontSize:11,fontFamily:C.mono}}>Current plan: <span style={{color:PLANS[currentPlan]?.color||C.mid,fontWeight:700}}>{currentPlan.toUpperCase()}</span></div>
              </div>
              <button onClick={onClose} style={{background:"none",border:"none",color:C.mid,cursor:"pointer",fontSize:18}}>✕</button>
            </div>
            <form onSubmit={submit}>
              <div style={{marginBottom:16}}>
                <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>Requested Plan</div>
                <div style={{display:"flex",gap:8}}>
                  {Object.entries(PLANS).filter(([k])=>k!=="free").map(([key,pl])=>(
                    <button key={key} type="button" onClick={()=>setPlan(key)} style={{...pill(plan===key,pl.color),flex:1,textAlign:"center",padding:"12px 8px",fontSize:12}}>
                      <div style={{fontWeight:700}}>{pl.name}</div>
                      <div style={{fontSize:10,fontFamily:C.mono,marginTop:3}}>{pl.priceLabel}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{marginBottom:16}}>
                <div style={{color:C.mid,fontSize:10,fontFamily:C.mono,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>Message to Admin (optional)</div>
                <textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Briefly describe your use case or reason for upgrading..." rows={3} style={{...inp,resize:"vertical",fontSize:12,lineHeight:1.6}}/>
              </div>
              {err&&<div style={{background:`${C.red}12`,border:`1px solid ${C.red}44`,borderRadius:6,padding:"9px 12px",marginBottom:14,color:C.red,fontSize:11,fontFamily:C.mono}}>{err}</div>}
              <div style={{display:"flex",gap:10}}>
                <button type="button" onClick={onClose} style={{flex:1,background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"11px",color:C.mid,fontSize:12,cursor:"pointer"}}>Cancel</button>
                <button type="submit" disabled={loading} style={{flex:2,...btn(PLANS[plan].color),padding:"11px",fontSize:12,color:plan==="pro"?"#000":"#fff",opacity:loading?.6:1}}>
                  {loading?"Sending…":"Send Request →"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
// ══════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════

// ══════════════════════════════════════════════
// POLICY IMPACT ENGINE — matching, weighting, synthetic control
// ══════════════════════════════════════════════
// References: DeAngelo (CGU) "Matching" lecture; Blackwell, Gov 2002 "Matching";
// Cunningham, Causal Inference: The Mixtape, ch. 5 (matching) and ch. 10 (synthetic control);
// Abadie & Imbens (2006, 2011); Iacus, King & Porro (2012); Abadie, Diamond & Hainmueller (2010).
// All functions are pure and run in the browser. Names are prefixed "ci" to avoid collisions.

// ── basic numerics ─────────────────────────────────────────────────────────────
const ciRng = (seed=12345) => { let a = seed>>>0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const ciMean = (a) => { let s=0; for (let i=0;i<a.length;i++) s+=a[i]; return a.length? s/a.length : NaN; };
const ciVarS = (a) => { const m=ciMean(a); let s=0; for (let i=0;i<a.length;i++) s+=(a[i]-m)**2; return a.length>1? s/(a.length-1) : 0; };
const ciWMean = (a, w) => { let s=0, sw=0; for (let i=0;i<a.length;i++){ s+=a[i]*w[i]; sw+=w[i]; } return sw>0? s/sw : NaN; };
const ciWVar = (a, w) => { const m=ciWMean(a,w); let s=0, sw=0, sw2=0; for (let i=0;i<a.length;i++){ s+=w[i]*(a[i]-m)**2; sw+=w[i]; sw2+=w[i]*w[i]; } const d = sw - sw2/sw; return d>0? s/d : 0; };
const ciQuantile = (sorted, q) => { if(!sorted.length) return NaN; const p=(sorted.length-1)*q, lo=Math.floor(p), hi=Math.ceil(p); return sorted[lo]+(sorted[hi]-sorted[lo])*(p-lo); };
const ciNormCdf = (z) => { const t=1/(1+0.2316419*Math.abs(z)); const d=0.3989423*Math.exp(-z*z/2); const p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274)))); return z>0? 1-p : p; };
const ciPval = (est, se) => (se>0 && isFinite(se)) ? 2*(1-ciNormCdf(Math.abs(est/se))) : NaN;
// k-th smallest (1-based) of a Float64Array copy, O(n) average (Hoare quickselect)
const ciKth = (src, k) => { const a=Float64Array.from(src); let lo=0, hi=a.length-1; k=Math.min(k,a.length)-1;
  while (lo<hi){ const piv=a[(lo+hi)>>1]; let i=lo, j=hi; while (i<=j){ while (a[i]<piv) i++; while (a[j]>piv) j--; if (i<=j){ const t=a[i]; a[i]=a[j]; a[j]=t; i++; j--; } }
    if (k<=j) hi=j; else if (k>=i) lo=i; else break; }
  return a[k]; };
// Solve A x = b (A square, row-major array of arrays). Gaussian elimination with partial pivoting.
const ciSolve = (A, b) => {
  const n=A.length; const M=A.map((r,i)=>[...r, b[i]]);
  for (let c=0;c<n;c++){
    let p=c; for (let r=c+1;r<n;r++) if (Math.abs(M[r][c])>Math.abs(M[p][c])) p=r;
    if (Math.abs(M[p][c])<1e-12) return null;
    [M[c],M[p]]=[M[p],M[c]];
    for (let r=0;r<n;r++){ if(r===c) continue; const f=M[r][c]/M[c][c]; if(f===0) continue; for (let k=c;k<=n;k++) M[r][k]-=f*M[c][k]; }
  }
  return M.map((r,i)=>r[n]/r[i]);
};
const ciInv = (A) => { const n=A.length; const cols=[]; for (let j=0;j<n;j++){ const e=new Array(n).fill(0); e[j]=1; const x=ciSolve(A,e); if(!x) return null; cols.push(x); } return A.map((_,i)=>cols.map(c=>c[i])); };
// Cholesky (lower) of a symmetric positive definite matrix
const ciChol = (A) => { const n=A.length; const L=A.map(()=>new Array(n).fill(0));
  for (let i=0;i<n;i++) for (let j=0;j<=i;j++){ let s=A[i][j]; for (let k=0;k<j;k++) s-=L[i][k]*L[j][k];
    if (i===j){ if (s<=1e-12) return null; L[i][i]=Math.sqrt(s); } else L[i][j]=s/L[j][j]; }
  return L; };
// Weighted OLS with HC1 robust SEs. X: array of rows (include intercept column yourself).
const ciOLS = (X, y, w=null) => {
  const n=X.length, k=X[0].length; const XtX=Array.from({length:k},()=>new Array(k).fill(0)); const Xty=new Array(k).fill(0);
  for (let i=0;i<n;i++){ const wi=w? w[i]:1; if(!wi) continue; const xi=X[i]; for (let a=0;a<k;a++){ Xty[a]+=wi*xi[a]*y[i]; for (let b=a;b<k;b++) XtX[a][b]+=wi*xi[a]*xi[b]; } }
  for (let a=0;a<k;a++) for (let b=0;b<a;b++) XtX[a][b]=XtX[b][a];
  const inv=ciInv(XtX); if(!inv) return null;
  const beta=inv.map(r=>r.reduce((s,v,j)=>s+v*Xty[j],0));
  const meat=Array.from({length:k},()=>new Array(k).fill(0)); let nEff=0;
  for (let i=0;i<n;i++){ const wi=w? w[i]:1; if(!wi) continue; nEff++; const xi=X[i]; const e=y[i]-xi.reduce((s,v,j)=>s+v*beta[j],0); const s2=wi*wi*e*e;
    for (let a=0;a<k;a++) for (let b=0;b<k;b++) meat[a][b]+=s2*xi[a]*xi[b]; }
  const V=inv.map(r=>inv[0].map((_,j)=>{ let s=0; for (let a=0;a<k;a++){ let t=0; for (let b=0;b<k;b++) t+=meat[a][b]*inv[b][j]; s+=r[a]*t; } return s; }));
  const adj = nEff>k? nEff/(nEff-k) : 1;
  return { beta, se: beta.map((_,j)=>Math.sqrt(Math.max(0,V[j][j]*adj))), n:nEff };
};
// Logistic regression by Newton–Raphson (covariates standardized internally, tiny ridge for stability)
const ciLogit = (X, d, opts={}) => {
  const n=X.length, k=X[0]?.length||0; const mu=new Array(k).fill(0), sd=new Array(k).fill(1);
  for (let j=0;j<k;j++){ const col=X.map(r=>r[j]); mu[j]=ciMean(col); sd[j]=Math.sqrt(ciVarS(col))||1; }
  const Z=X.map(r=>[1,...r.map((v,j)=>(v-mu[j])/sd[j])]); const p1=k+1;
  let b=opts.start? opts.start.slice() : new Array(p1).fill(0); const lam=opts.ridge??1e-6; let converged=false, it=0;
  for (it=0; it<(opts.maxIter||60); it++){
    const H=Array.from({length:p1},()=>new Array(p1).fill(0)); const g=new Array(p1).fill(0);
    for (let i=0;i<n;i++){ const z=Z[i]; let eta=0; for (let j=0;j<p1;j++) eta+=z[j]*b[j]; const p=1/(1+Math.exp(-eta)); const r=d[i]-p, wt=p*(1-p);
      for (let a=0;a<p1;a++){ g[a]+=z[a]*r; const za=z[a]*wt; for (let c=a;c<p1;c++) H[a][c]+=za*z[c]; } }
    for (let a=0;a<p1;a++){ for (let c=0;c<a;c++) H[a][c]=H[c][a]; if(a>0){ H[a][a]+=lam; g[a]-=lam*b[a]; } }
    const step=ciSolve(H,g); if(!step) break;
    let mx=0; for (let j=0;j<p1;j++){ b[j]+=step[j]; mx=Math.max(mx,Math.abs(step[j])); }
    if (mx<1e-8){ converged=true; break; }
  }
  const lin=Z.map(z=>z.reduce((s,v,j)=>s+v*b[j],0)); const ps=lin.map(e=>1/(1+Math.exp(-e)));
  const nExtreme=ps.filter(p=>p<1e-6||p>1-1e-6).length;
  return { b, ps, lin, converged, iterations:it+1, separation: nExtreme>0, nExtreme, mu, sd };
};
// ── data preparation ────────────────────────────────────────────────────────────
// rows: array of objects (strings ok). spec: {y, d, treatValue, covs:[names], squares:bool, exact:[names]}
// spec.missing: "drop" (complete cases) | "impute" (mean for numeric covariates, "(missing)" level for categorical, plus missingness indicators).
// Outcome and treatment are never imputed: a row without Y or D is dropped.
const ciPrepare = (headers, rawRows, spec) => {
  const idx = Object.fromEntries(headers.map((h,i)=>[h,i])); const imp = spec.missing==="impute";
  const num = (v) => { if (v==null) return NaN; const s=String(v).trim(); if(s===""||/^(na|nan|null|\.|-)$/i.test(s)) return NaN; return parseFloat(s.replace(/[$,%\s]/g,"")); };
  const isMiss = (v) => v==null || /^(|na|nan|null|\.|-)$/i.test(String(v).trim());
  // classify covariates: numeric vs categorical; record missingness
  const covInfo = spec.covs.map(c=>{
    const vals=rawRows.map(r=>r[idx[c]]); const nums=vals.map(num); const ok=nums.filter(v=>!isNaN(v)); const nonEmpty=vals.filter(v=>!isMiss(v)).length;
    const isNum = ok.length >= 0.95*nonEmpty; const nMiss = vals.length - nonEmpty;
    const levels=[...new Set(isNum? ok : vals.filter(v=>!isMiss(v)).map(v=>String(v).trim()))];
    if (!isNum && imp && nMiss>0) levels.push("(missing)");
    return { name:c, isNum, levels: isNum? null : levels.sort(), binary: isNum && levels.length<=2, nUnique: levels.length, nMiss, mean: isNum? ciMean(ok) : null,
             indicator: imp && isNum && nMiss>0 };
  });
  const dropped={missing:0, imputedCells:0}; const units=[];
  for (const r of rawRows){
    const y=num(r[idx[spec.y]]); const draw=String(r[idx[spec.d]]??"").trim();
    let d; if (spec.treatValue!=null && spec.treatValue!=="") d = draw===String(spec.treatValue) ? 1 : (draw===""? NaN : 0); else { const dn=num(draw); d = dn===1?1: dn===0?0: NaN; }
    if (isNaN(y)||isNaN(d)){ dropped.missing++; continue; }
    const x=[]; const xRaw={}; let bad=false; let nImp=0;
    for (const ci of covInfo){ const v=r[idx[ci.name]];
      if (ci.isNum){ let nv=num(v); let miss=0; if(isNaN(nv)){ if(!imp){ bad=true; break; } nv=ci.mean; miss=1; nImp++; }
        x.push(nv); xRaw[ci.name]=nv; if (spec.squares && !ci.binary) x.push(nv*nv); if (ci.indicator){ x.push(miss); xRaw[ci.name+" missing"]=miss; } }
      else { let sv=isMiss(v)? "" : String(v).trim(); if(!sv){ if(!imp){ bad=true; break; } sv="(missing)"; nImp++; } xRaw[ci.name]=sv; ci.levels.slice(1).forEach(l=>x.push(sv===l?1:0)); }
    }
    if (bad){ dropped.missing++; continue; }
    dropped.imputedCells+=nImp;
    units.push({ y, d, x, xRaw });
  }
  // design column labels + balance variables (numeric covs + dummies for categories + missingness indicators)
  const colNames=[]; const balNames=[];
  for (const ci of covInfo){ if (ci.isNum){ colNames.push(ci.name); balNames.push(ci.name); if (spec.squares && !ci.binary) colNames.push(ci.name+"²"); if (ci.indicator){ colNames.push(ci.name+" missing"); balNames.push(ci.name+" missing"); } }
    else ci.levels.slice(1).forEach(l=>{ colNames.push(`${ci.name}=${l}`); balNames.push(`${ci.name}=${l}`); }); }
  for (const u of units){ const b=[]; for (const ci of covInfo){ if (ci.isNum){ b.push(u.xRaw[ci.name]); if (ci.indicator) b.push(u.xRaw[ci.name+" missing"]); } else ci.levels.slice(1).forEach(l=>b.push(u.xRaw[ci.name]===l?1:0)); } u.b=b; }
  // drop constant design columns
  const keep=colNames.map((_,j)=>{ const col=units.map(u=>u.x[j]); return ciVarS(col)>1e-12; });
  for (const u of units) u.x=u.x.filter((_,j)=>keep[j]);
  const names=colNames.filter((_,j)=>keep[j]);
  const exactKeys = (spec.exact||[]).filter(e=>covInfo.some(c=>c.name===e));
  for (const u of units) u.ex = exactKeys.map(e=>String(u.xRaw[e])).join("|");
  return { units, names, balNames, covInfo, dropped, nT: units.filter(u=>u.d===1).length, nC: units.filter(u=>u.d===0).length };
};
// ── panel data for synthetic control from a user table ───────────────────────────
// format "long": one row per unit-year (unit, year, outcome, covariates).  format "wide": one row per year, one column per unit.
const ciPanelFromTable = (headers, rows, spec) => {
  const idx=Object.fromEntries(headers.map((h,i)=>[h,i])); const num=(v)=>{ const s=String(v??"").trim(); if(!s||/^(na|nan|null|\.|-)$/i.test(s)) return null; const n=parseFloat(s.replace(/[$,%\s]/g,"")); return isFinite(n)? n : null; };
  const yr0=(v)=>{ const m=String(v??"").match(/(1[89]\d\d|20\d\d)/); return m? parseInt(m[1]) : null; };
  // monthly or quarterly time values become consecutive period numbers (year*12+month or year*4+quarter) with readable labels
  const tcol=spec.format==="wide"? spec.time : spec.time; const sample=rows.slice(0, 400).map(r=>r[idx[tcol]]); const fq={}; sample.forEach(v=>{ const p=typeof dsParseTime==="function"? dsParseTime(v) : null; if (p) fq[p.freq]=(fq[p.freq]||0)+1; });
  const mode=(fq.monthly||0)>sample.length*0.6? "month" : (fq.quarterly||0)>sample.length*0.6? "quarter" : "year"; const tLab={};
  const yr = mode==="year"? yr0 : (v)=>{ const p=dsParseTime(v); if (!p || (mode==="month" && p.freq!=="monthly") || (mode==="quarter" && p.freq!=="quarterly")) return null; const c=Math.round(p.t*(mode==="month"? 12 : 4)); tLab[c]=p.label; return c; };
  const units={}; let collide=0;
  if (spec.format==="wide"){
    const cols=headers.filter(h=>h!==spec.time);
    for (const r of rows){ const t=yr(r[idx[spec.time]]); if (t==null) continue; cols.forEach(c=>{ const u=units[c]||(units[c]={ id:c, name:c, y:{}, cov:{} }); u.y[t]=num(r[idx[c]]); }); }
  } else {
    for (const r of rows){ const id=String(r[idx[spec.unit]]??"").trim(); const t=yr(r[idx[spec.time]]); if(!id||t==null) continue;
      const u=units[id]||(units[id]={ id, name:id, y:{}, cov:{} }); if (t in u.y) collide++; u.y[t]=num(r[idx[spec.y]]);
      (spec.covs||[]).forEach(c=>{ (u.cov[c]||(u.cov[c]={}))[t]=num(r[idx[c]]); }); }
  }
  const years=[...new Set(Object.values(units).flatMap(u=>Object.keys(u.y).map(Number)))].sort((a,b)=>a-b);
  // several rows per unit and year (monthly, quarterly or daily data) would silently overwrite each other: report it
  return { units:Object.values(units), years, subAnnual: collide>0, tLab: mode==="year"? null : tLab, period: mode };
};
// Fill a unit's series over `years` using EcoScope's imputation methods. Returns {vals, nImputed} or null if gaps remain.
const ciFillSeries = (years, map, method) => {
  const raw=years.map(y=>{ const v=map?.[y]; return v==null||!isFinite(v)? null : v; }); const nMiss=raw.filter(v=>v==null).length;
  if (!nMiss) return { vals:raw, nImputed:0 };
  if (method==="strict") return null;
  let vals;
  if (method==="interp") vals=ciInterp(raw);
  else { const filled=imputeData(years.map((y,i)=>({ year:y, value:raw[i] })), method); vals=filled.map(d=>d.value); }
  if (!vals || vals.some(v=>v==null||!isFinite(v))) return null;
  return { vals, nImputed:nMiss };
};
// ── propensity score ─────────────────────────────────────────────────────────────
const ciPropensity = (units, start) => { const X=units.map(u=>u.x); const d=units.map(u=>u.d); return ciLogit(X, d, start? {start}:{}) };
// ── balance diagnostics ──────────────────────────────────────────────────────────
// weights: array (0 = dropped). estimand decides the SMD denominator (ATT: treated SD; ATC: control SD; ATE: pooled).
const ciBalance = (units, balNames, weights, estimand="ATT") => {
  const T=units.filter(u=>u.d===1), Cn=units.filter(u=>u.d===0);
  return balNames.map((nm,j)=>{
    const xt=T.map(u=>u.b[j]), xc=Cn.map(u=>u.b[j]); const vt=ciVarS(xt), vc=ciVarS(xc);
    const denom = Math.sqrt(estimand==="ATT"? vt : estimand==="ATC"? vc : (vt+vc)/2) || Math.sqrt((vt+vc)/2) || 1;
    const mt=ciMean(xt), mc=ciMean(xc);
    const wt=units.map((u,i)=>u.d===1? weights[i]:0), wc=units.map((u,i)=>u.d===0? weights[i]:0); const all=units.map(u=>u.b[j]);
    const mtA=ciWMean(all,wt), mcA=ciWMean(all,wc); const vtA=ciWVar(all,wt), vcA=ciWVar(all,wc);
    return { name:nm, meanT:mt, meanC:mc, smdBefore:(mt-mc)/denom, vrBefore: vc>0? vt/vc : NaN,
             meanTAfter:mtA, meanCAfter:mcA, smdAfter:(mtA-mcA)/denom, vrAfter: vcA>0? vtA/vcA : NaN };
  });
};
// Iacus-King-Porro multivariate L1 imbalance on a fixed coarsening (quintiles for continuous)
const ciL1 = (units, weights) => {
  const k=units[0]?.b.length||0; const cuts=[];
  for (let j=0;j<k;j++){ const col=units.map(u=>u.b[j]); const uniq=[...new Set(col)]; if (uniq.length<=5){ cuts.push(null); continue; }
    const s=[...col].sort((a,b)=>a-b); cuts.push([0.2,0.4,0.6,0.8].map(q=>ciQuantile(s,q))); }
  const key=(u)=>u.b.map((v,j)=>cuts[j]? cuts[j].filter(c=>v>c).length : v).join("|");
  const fT={}, fC={}; let sT=0, sC=0;
  units.forEach((u,i)=>{ const w=weights[i]; if(!w) return; const kk=key(u); if(u.d===1){ fT[kk]=(fT[kk]||0)+w; sT+=w; } else { fC[kk]=(fC[kk]||0)+w; sC+=w; } });
  const keys=new Set([...Object.keys(fT),...Object.keys(fC)]); let L1=0; keys.forEach(kk=>{ L1+=Math.abs((fT[kk]||0)/sT-(fC[kk]||0)/sC); });
  return L1/2;
};
// ── estimators ───────────────────────────────────────────────────────────────────
const ciResult = (method, estimand, est, se, extra={}) => ({ method, estimand, est, se, lo: est-1.96*se, hi: est+1.96*se, p: ciPval(est,se), ...extra });
// 1. Simple difference in outcomes (SDO), Welch SE
const ciNaive = (units) => { const yt=units.filter(u=>u.d===1).map(u=>u.y), yc=units.filter(u=>u.d===0).map(u=>u.y);
  return ciResult("Naive difference (SDO)", "—", ciMean(yt)-ciMean(yc), Math.sqrt(ciVarS(yt)/yt.length+ciVarS(yc)/yc.length), { nT:yt.length, nC:yc.length }); };
// 2. OLS with controls, HC1
const ciRegAdj = (units) => { const X=units.map(u=>[1,u.d,...u.x]); const r=ciOLS(X, units.map(u=>u.y)); if(!r) return null;
  return ciResult("OLS with controls", "ATE*", r.beta[1], r.se[1], { nT:units.filter(u=>u.d).length, nC:units.filter(u=>!u.d).length, note:"Constant-effect linear model; extrapolates where groups do not overlap." }); };
// 3. Subclassification on the propensity score (Cochran 1968; Rosenbaum & Rubin 1984)
const ciSubclass = (units, ps, estimand="ATT", K=5) => {
  const s=[...ps].sort((a,b)=>a-b); const cuts=[...new Set(Array.from({length:K-1},(_,k)=>ciQuantile(s,(k+1)/K)))].filter(c=>c>s[0]); K=cuts.length+1;
  const stratum=ps.map(p=>cuts.filter(c=>p>=c).length);
  const strata=Array.from({length:K},(_,k)=>{ const idx=units.map((u,i)=>stratum[i]===k?i:-1).filter(i=>i>=0); const t=idx.filter(i=>units[i].d===1), c=idx.filter(i=>units[i].d===0);
    return { k, n:idx.length, nT:t.length, nC:c.length, yT:ciMean(t.map(i=>units[i].y)), yC:ciMean(c.map(i=>units[i].y)), vT:ciVarS(t.map(i=>units[i].y)), vC:ciVarS(c.map(i=>units[i].y)), lo: k? cuts[k-1]:0, hi: k<K-1? cuts[k]:1 }; });
  const usable=strata.filter(z=>z.nT>0&&z.nC>0); const unusable=strata.filter(z=>!(z.nT>0&&z.nC>0)&&z.n>0);
  const tot = usable.reduce((a,z)=>a+(estimand==="ATT"? z.nT : estimand==="ATC"? z.nC : z.n),0);
  let est=0, v=0; usable.forEach(z=>{ const w=(estimand==="ATT"? z.nT : estimand==="ATC"? z.nC : z.n)/tot; est+=w*(z.yT-z.yC); v+=w*w*((z.nT>1?z.vT/z.nT:0)+(z.nC>1?z.vC/z.nC:0)); });
  const weights=units.map((u,i)=>{ const z=strata[stratum[i]]; if(!(z.nT>0&&z.nC>0)) return 0;
    if (estimand==="ATT") return u.d? 1 : z.nT/z.nC; if (estimand==="ATC") return u.d? z.nC/z.nT : 1; return u.d? z.n/z.nT : z.n/z.nC; });
  return { ...ciResult(`PS subclassification (${K} strata)`, estimand, est, Math.sqrt(v), { nT:usable.reduce((a,z)=>a+z.nT,0), nC:usable.reduce((a,z)=>a+z.nC,0),
    note: unusable.length? `${unusable.length} stratum(s) lacked treated or control units and were dropped: the estimand is restricted to strata with common support.` : null }), strata, weights };
};
// 4. Nearest-neighbour matching (Abadie & Imbens 2006, 2011)
// opts: {estimand, M, metric:'mahalanobis'|'euclid'|'ps', ps(lin), caliper (SD of linear PS), replace, biasAdj, J (variance neighbours)}
const ciNNMatch = (units, opts) => {
  const { estimand="ATT", M=1, metric="mahalanobis", replace=true, biasAdj=true, caliper=null, J=2 } = opts; const lin=opts.lin;
  const n=units.length; const k=units[0].x.length;
  // feature space for distances
  let F;
  if (metric==="ps") F=units.map((u,i)=>[lin[i]]);
  else {
    const mu=new Array(k).fill(0); units.forEach(u=>u.x.forEach((v,j)=>mu[j]+=v/n));
    const S=Array.from({length:k},()=>new Array(k).fill(0)); units.forEach(u=>{ for (let a=0;a<k;a++) for (let b=0;b<k;b++) S[a][b]+=(u.x[a]-mu[a])*(u.x[b]-mu[b])/(n-1); });
    if (metric==="euclid"){ const sd=S.map((r,j)=>Math.sqrt(r[j])||1); F=units.map(u=>u.x.map((v,j)=>v/sd[j])); }
    else { const L=ciChol(S.map((r,i)=>r.map((v,j)=>v+(i===j?1e-9*Math.abs(S[i][i]||1):0)))); if(!L) return { error:"Covariance matrix is singular. Remove redundant covariates." };
      // whiten: z = L^{-1} x  so Euclidean(z) = Mahalanobis(x)
      F=units.map(u=>{ const z=new Array(k); for (let i=0;i<k;i++){ let s=u.x[i]; for (let j=0;j<i;j++) s-=L[i][j]*z[j]; z[i]=s/L[i][i]; } return z; }); }
  }
  const sdLin = lin? Math.sqrt(ciVarS(lin)) : 1; const cal = (caliper!=null && caliper>0 && lin)? caliper*sdLin : Infinity;
  const dist2=(a,b)=>{ let s=0; const fa=F[a], fb=F[b]; for (let j=0;j<fa.length;j++){ const t=fa[j]-fb[j]; s+=t*t; } return s; };
  const idxT=[], idxC=[]; units.forEach((u,i)=>(u.d?idxT:idxC).push(i));
  // match a set of targets to a pool
  const matchSet=(targets, pool)=>{
    const out=new Map(); const used=new Set();
    const order = replace? targets : [...targets].sort((a,b)=> (lin? lin[b]-lin[a] : 0));
    const D=new Float64Array(pool.length);
    for (const t of order){
      let nOk=0;
      for (let q=0;q<pool.length;q++){ const c=pool[q]; let ok=true; if (!replace && used.has(c)) ok=false; else if (units[c].ex!==units[t].ex) ok=false; else if (lin && Math.abs(lin[c]-lin[t])>cal) ok=false;
        D[q]= ok? dist2(t,c) : Infinity; if (ok) nOk++; }
      if (!nOk){ out.set(t,[]); continue; }
      const dM=ciKth(D, Math.min(M,nOk));
      let chosen=[]; for (let q=0;q<pool.length;q++) if (D[q]<=dM+1e-12) chosen.push([D[q],pool[q]]);
      chosen.sort((a,b)=>a[0]-b[0]); chosen = (replace? chosen : chosen.slice(0,M)).map(([,c])=>c); // ties kept when matching with replacement
      if (!replace) chosen.forEach(c=>used.add(c));
      out.set(t,chosen);
    }
    return out;
  };
  const doT = estimand!=="ATC", doC = estimand!=="ATT";
  const mT = doT? matchSet(idxT, idxC) : new Map(); const mC = doC? matchSet(idxC, idxT) : new Map();
  // bias-adjustment regressions mu_d(x) on the units used as matches (weighted by use), fallback to the whole group
  const fitMu=(matches, group)=>{ if(!biasAdj) return null; const w=new Map(); matches.forEach(js=>js.forEach(j=>w.set(j,(w.get(j)||0)+1/js.length)));
    let ids=[...w.keys()], ww=ids.map(j=>w.get(j)); if (ids.length < k+3){ ids=group; ww=group.map(()=>1); }
    const r=ciOLS(ids.map(j=>[1,...units[j].x]), ids.map(j=>units[j].y), ww); return r? r.beta : null; };
  const pred=(b,i)=> b? b[0]+units[i].x.reduce((s,v,j)=>s+v*b[j+1],0) : 0;
  const mu0 = doT? fitMu(mT, idxC) : null; const mu1 = doC? fitMu(mC, idxT) : null;
  // imputations
  const Y1=new Array(n).fill(NaN), Y0=new Array(n).fill(NaN); const use=new Array(n).fill(0); const useSq=new Array(n).fill(0); const kept=new Array(n).fill(false);
  const impute=(map, isT)=>{ map.forEach((js,t)=>{ if(!js.length) return; kept[t]=true; const m=js.length; let s=0;
      js.forEach(j=>{ s+=units[j].y + (biasAdj? (isT? pred(mu0,t)-pred(mu0,j) : pred(mu1,t)-pred(mu1,j)) : 0); use[j]+=1/m; useSq[j]+=1/(m*m); });
      if (isT){ Y1[t]=units[t].y; Y0[t]=s/m; } else { Y0[t]=units[t].y; Y1[t]=s/m; } }); };
  impute(mT, true); impute(mC, false);
  const targets = estimand==="ATT"? idxT : estimand==="ATC"? idxC : units.map((_,i)=>i);
  const tk = targets.filter(i=>kept[i]); const N1=tk.length; if(!N1) return { error:"No target unit found a match. Loosen the caliper or exact-match settings." };
  const tau = ciMean(tk.map(i=>Y1[i]-Y0[i]));
  // conditional variance sigma^2(X_i, D_i) by matching within the same group (J neighbours), only needed for units used as matches
  const sig2=new Map(); const grp=(i)=>units[i].d? idxT : idxC;
  units.forEach((u,i)=>{ if(!use[i]) return; const pool=grp(i); const Dd=new Float64Array(pool.length); let nOk=0;
    for (let q=0;q<pool.length;q++){ const j=pool[q]; if (j===i||units[j].ex!==u.ex){ Dd[q]=Infinity; continue; } Dd[q]=dist2(i,j); nOk++; }
    if (!nOk){ sig2.set(i,0); return; } const th=ciKth(Dd, Math.min(J,nOk)); const nb=[]; for (let q=0;q<pool.length && nb.length<J;q++) if (Dd[q]<=th) nb.push(units[pool[q]].y); const jn=nb.length;
    sig2.set(i, jn/(jn+1)*(u.y-ciMean(nb))**2); });
  let v1=0, v2=0;
  tk.forEach(i=>{ v1+=(Y1[i]-Y0[i]-tau)**2; });
  if (estimand==="ATE"){ units.forEach((u,i)=>{ if(use[i]) v2+=(use[i]**2 + 2*use[i] - useSq[i])*(sig2.get(i)||0); }); }
  else { units.forEach((u,i)=>{ if(use[i] && ((estimand==="ATT"&&!u.d)||(estimand==="ATC"&&u.d))) v2+=(use[i]**2 - useSq[i])*(sig2.get(i)||0); }); }
  const se=Math.sqrt((v1+v2)/(N1*N1));
  const nTarget = targets.length; const droppedTargets = nTarget-N1;
  // balance weights: targets 1, matches by usage (for ATE, both directions)
  const weights=units.map((u,i)=>{ if (estimand==="ATE") return (kept[i]?1:0)+use[i]; if (estimand==="ATT") return u.d? (kept[i]?1:0) : use[i]; return u.d? use[i] : (kept[i]?1:0); });
  const label = `NN matching (${metric==="ps"?"propensity score":metric==="euclid"?"normalized Euclidean":"Mahalanobis"}, M=${M}${replace?", with replacement":", without replacement"}${caliper?`, caliper ${caliper} SD`:""}${biasAdj?", bias-corrected":""})`;
  return { ...ciResult(label, droppedTargets? `feasible ${estimand}` : estimand, tau, se, { nT: units.filter((u,i)=>u.d&&weights[i]>0).length, nC: units.filter((u,i)=>!u.d&&weights[i]>0).length,
    note: droppedTargets? `${droppedTargets} target unit(s) had no acceptable match and were dropped, so this is the ${estimand} for the matched subsample ("moving the goalposts").` : null }),
    weights, droppedTargets, pairs: estimand!=="ATC"? [...mT.entries()].slice(0,500) : [...mC.entries()].slice(0,500) };
};
// 5. Normalized (Hájek) inverse probability weighting with optional trimming. SE by bootstrap (re-estimating the PS).
const ciIPWPoint = (units, ps, estimand) => {
  let sT=0,wT=0,sC=0,wC=0; units.forEach((u,i)=>{ const p=ps[i]; let w;
    if (estimand==="ATT") w = u.d? 1 : p/(1-p); else if (estimand==="ATC") w = u.d? (1-p)/p : 1; else w = u.d? 1/p : 1/(1-p);
    if (u.d){ sT+=w*u.y; wT+=w; } else { sC+=w*u.y; wC+=w; } });
  return sT/wT - sC/wC;
};
const ciIPWWeights = (units, ps, estimand) => units.map((u,i)=>{ const p=ps[i]; if (estimand==="ATT") return u.d? 1 : p/(1-p); if (estimand==="ATC") return u.d? (1-p)/p : 1; return u.d? 1/p : 1/(1-p); });
// 6. Augmented IPW (doubly robust). Influence-function SE.
const ciAIPW = (units, ps, estimand) => {
  const fit=(g)=>{ const s=units.filter(u=>u.d===g); const r=ciOLS(s.map(u=>[1,...u.x]), s.map(u=>u.y)); return r? r.beta:null; };
  const b1=fit(1), b0=fit(0); if(!b1||!b0) return null; const pr=(b,u)=>b[0]+u.x.reduce((s,v,j)=>s+v*b[j+1],0);
  const N=units.length; const pT=units.filter(u=>u.d).length/N; let tau, phi;
  if (estimand==="ATE"){ const a=units.map((u,i)=>{ const m1=pr(b1,u), m0=pr(b0,u), p=ps[i]; return m1-m0 + u.d*(u.y-m1)/p - (1-u.d)*(u.y-m0)/(1-p); }); tau=ciMean(a); phi=a.map(v=>v-tau); }
  else if (estimand==="ATT"){ const a=units.map((u,i)=>{ const m0=pr(b0,u), p=ps[i]; return u.d*(u.y-m0) - (1-u.d)*p/(1-p)*(u.y-m0); }); tau=ciMean(a)/pT; phi=units.map((u,i)=>(a[i]-u.d*tau)/pT); }
  else { const a=units.map((u,i)=>{ const m1=pr(b1,u), p=ps[i]; return (1-u.d)*(m1-u.y) + u.d*(1-p)/p*(u.y-m1); }); tau=ciMean(a)/(1-pT); phi=units.map((u,i)=>(a[i]-(1-u.d)*tau)/(1-pT)); }
  const se=Math.sqrt(ciMean(phi.map(v=>v*v))/N);
  return ciResult("Doubly robust (AIPW)", estimand, tau, se, { nT:units.filter(u=>u.d).length, nC:units.filter(u=>!u.d).length, note:"Consistent if either the outcome model or the propensity model is correct." });
};
// 7. Coarsened exact matching (Iacus, King & Porro 2012)
const ciCEM = (units, covInfo, estimand="ATT", nBins=null) => {
  const k=units[0].b.length; const cuts=[];
  for (let j=0;j<k;j++){ const col=units.map(u=>u.b[j]); const uniq=[...new Set(col)]; if (uniq.length<=10){ cuts.push(null); continue; }
    const nb = nBins || Math.ceil(Math.log2(units.length))+1; const lo=Math.min(...col), hi=Math.max(...col); cuts.push(Array.from({length:nb-1},(_,i)=>lo+(hi-lo)*(i+1)/nb)); }
  const key=units.map(u=>u.b.map((v,j)=>cuts[j]? cuts[j].filter(c=>v>c).length : v).join("|")+"#"+u.ex);
  const S={}; units.forEach((u,i)=>{ const s=S[key[i]]||(S[key[i]]={t:0,c:0,n:0}); u.d? s.t++ : s.c++; s.n++; });
  const matched=units.map((u,i)=>S[key[i]].t>0 && S[key[i]].c>0);
  const mT=units.filter((u,i)=>matched[i]&&u.d).length, mC=units.filter((u,i)=>matched[i]&&!u.d).length, m=mT+mC;
  if (!mT||!mC) return { error:"CEM found no strata containing both treated and control units. Use fewer covariates or coarser bins." };
  const weights=units.map((u,i)=>{ if(!matched[i]) return 0; const s=S[key[i]];
    if (estimand==="ATT") return u.d? 1 : (mC/mT)*(s.t/s.c);
    if (estimand==="ATC") return u.d? (mT/mC)*(s.c/s.t) : 1;
    return u.d? (s.n/s.t)*(mT/m) : (s.n/s.c)*(mC/m); });
  const r=ciOLS(units.map(u=>[1,u.d]), units.map(u=>u.y), weights); if(!r) return { error:"CEM regression failed." };
  const nStrata=Object.values(S).filter(s=>s.t>0&&s.c>0).length; const totT=units.filter(u=>u.d).length;
  return { ...ciResult(`Coarsened exact matching (${nStrata} matched strata)`, mT<totT && estimand!=="ATC"? `feasible ${estimand}`: estimand, r.beta[1], r.se[1], { nT:mT, nC:mC,
    note: mT<totT? `${totT-mT} treated unit(s) fell in strata without controls and were pruned.` : null }), weights };
};
// ── run the full comparison ───────────────────────────────────────────────────────
const ciRunAll = (prep, cfg) => {
  const units=prep.units; const out={ results:[], warnings:[], diagnostics:{} };
  if (prep.nT<2||prep.nC<2){ out.error="Need at least two treated and two control units after dropping missing values."; return out; }
  const lg=ciPropensity(units); const ps0=lg.ps; const lin=lg.lin;
  if (!lg.converged) out.warnings.push("Propensity-score logit did not fully converge. Check for redundant or perfectly predictive covariates.");
  if (lg.separation) out.warnings.push(`${lg.nExtreme} unit(s) have estimated propensity scores of essentially 0 or 1 (separation). Common support is violated for them.`);
  // common support (min/max rule) and optional trimming
  const psT=units.map((u,i)=>u.d?ps0[i]:null).filter(v=>v!=null), psC=units.map((u,i)=>!u.d?ps0[i]:null).filter(v=>v!=null);
  const csLo=Math.max(Math.min(...psT),Math.min(...psC)), csHi=Math.min(Math.max(...psT),Math.max(...psC));
  const offSupport=units.filter((u,i)=>ps0[i]<csLo||ps0[i]>csHi).length;
  out.diagnostics={ ps:ps0, lin, logit:lg, csLo, csHi, offSupport };
  if (csLo>=csHi) out.warnings.push("Treated and control propensity scores do not overlap at all: no control resembles any treated unit on the covariates. Matching and weighting estimates are pure extrapolation here.");
  else if (offSupport) out.warnings.push(`${offSupport} unit(s) lie outside the region of common support [${csLo.toFixed(3)}, ${csHi.toFixed(3)}].`);
  const trim=cfg.trim||0; const keepIdx=units.map((u,i)=>!(trim>0 && (ps0[i]<trim||ps0[i]>1-trim)));
  const U=units.filter((_,i)=>keepIdx[i]); const PS=ps0.filter((_,i)=>keepIdx[i]); const LIN=lin.filter((_,i)=>keepIdx[i]);
  if (trim>0) out.warnings.push(`Trimming: ${units.length-U.length} unit(s) with propensity scores outside [${trim}, ${1-trim}] were dropped before estimation (Crump et al. 2009 rule).`);
  if (U.filter(u=>u.d).length<2||U.filter(u=>!u.d).length<2){ out.error="Too few treated or control units remain after trimming."; return out; }
  const E=cfg.estimand;
  const add=(r,w)=>{ if(!r||r.error){ if(r?.error) out.warnings.push(r.error); return; } const wFull=new Array(units.length).fill(0); let j=0; units.forEach((_,i)=>{ if(keepIdx[i]){ wFull[i]=w? w[j]:1; j++; } });
    r.balance=ciBalance(units, prep.balNames, wFull, E.replace("feasible ","")); r.L1=ciL1(units, wFull); r.weightsFull=wFull; out.results.push(r); };
  add({ ...ciNaive(units), weightsUnit:true }, null);
  out.results[0].balance=ciBalance(units, prep.balNames, units.map(()=>1), E); out.results[0].L1=ciL1(units, units.map(()=>1));
  add(ciRegAdj(U), null);
  { const rv=meOLSRobustness(U); out.sens=rv; const r=out.results[out.results.length-1]; if (r && r.method==="OLS with controls") r.note=`${r.note} Robustness value (Cinelli & Hazlett 2020): ${(100*rv.rv).toFixed(1)}% (to zero), ${(100*rv.rvAlpha).toFixed(1)}% (to insignificance).`; }
  const lgU = { ps:PS, mu:lg.mu, sd:lg.sd, b:lg.b };
  if (cfg.methods.subclass) { const r=ciSubclass(U, PS, E, cfg.strata||5); add(r, r.weights); }
  if (cfg.methods.nn) { const r=ciNNMatch(U, { estimand:E, M:cfg.M||1, metric:cfg.metric||"mahalanobis", replace:cfg.replace!==false, biasAdj:cfg.biasAdj!==false, caliper:cfg.caliper||null, lin:LIN }); add(r, r.weights); }
  if (cfg.methods.psm) { const r=ciNNMatch(U, { estimand:E, M:cfg.M||1, metric:"ps", replace:cfg.replace!==false, biasAdj:false, caliper:cfg.caliper||null, lin:LIN });
    if (!r.error && (E==="ATE"||E==="ATT") && !r.droppedTargets){ const a=meAI2016(U, lgU, r.est, r.se, E); if (a && isFinite(a.se) && a.se>0){ const se0=r.se; Object.assign(r, ciResult(r.method, r.estimand, r.est, a.se), { note:`SE adjusted for estimating the propensity score (Abadie & Imbens 2016). Unadjusted Abadie–Imbens (2006) SE: ${ciFmt(se0)}.` }); r.aiAdjusted=true; } }
    else if (!r.error) r.note=[r.note, E==="ATC"? "The Abadie–Imbens (2016) adjustment is implemented for the ATE and ATT; this ATC SE treats the estimated score as known." : null].filter(Boolean).join(" ")||null;
    add(r, r.weights); }
  if (cfg.methods.ipw) { const est=ciIPWPoint(U, PS, E); const sw=meIPWSandwich(U, lgU, E);
    const r = cfg.ipwSE==="sandwich"? ciResult(`Normalized IPW${trim?` (trimmed ${trim}–${1-trim})`:""}`, E, est, sw.se, { nT:U.filter(u=>u.d).length, nC:U.filter(u=>!u.d).length, note:"Sandwich (M-estimation) SE that accounts for estimating the propensity score (Lunceford & Davidian 2004)." })
      : ciResult(`Normalized IPW${trim?` (trimmed ${trim}–${1-trim})`:""}`, E, est, NaN, { nT:U.filter(u=>u.d).length, nC:U.filter(u=>!u.d).length, pending:true, note:`SE from a bootstrap that re-estimates the propensity score in each replication. Sandwich (M-estimation) SE for comparison: ${ciFmt(sw.se)}.` });
    add(r, ciIPWWeights(U, PS, E)); if (cfg.ipwSE!=="sandwich"){ out.ipwIndex=out.results.length-1; out._ipw={U, start:lg.b}; } }
  if (cfg.methods.aipw) { add(ciAIPW(U, PS.map(p=>Math.min(Math.max(p,1e-6),1-1e-6)), E), ciIPWWeights(U, PS, E)); }
  if (cfg.methods.cem) { const r=ciCEM(U, prep.covInfo, E, cfg.cemBins||null); add(r, r.weights); }
  if (prep.nT<30) out.warnings.push(`Only ${prep.nT} treated units: matching estimates will be noisy and large-sample SEs may be unreliable.`);
  return out;
};
// Bootstrap SE for normalized IPW, run in chunks so the browser stays responsive. onProgress(done,total)
const ciBootstrapIPW = async (U, estimand, B=199, start, onProgress, seed=2026) => {
  const rng=ciRng(seed); const n=U.length; const ests=[];
  for (let b=0;b<B;b++){
    const s=[]; for (let i=0;i<n;i++) s.push(U[Math.floor(rng()*n)]);
    if (s.filter(u=>u.d).length<2||s.filter(u=>!u.d).length<2) continue;
    const lg=ciLogit(s.map(u=>u.x), s.map(u=>u.d), { start, maxIter:25 }); const ps=lg.ps.map(p=>Math.min(Math.max(p,1e-6),1-1e-6));
    const e=ciIPWPoint(s, ps, estimand); if (isFinite(e)) ests.push(e);
    if (b%10===9){ onProgress&&onProgress(b+1,B); await new Promise(r=>setTimeout(r,0)); }
  }
  const sorted=[...ests].sort((a,b)=>a-b);
  return { se:Math.sqrt(ciVarS(ests)), lo:ciQuantile(sorted,0.025), hi:ciQuantile(sorted,0.975), reps:ests.length };
};
// ── synthetic control (Abadie, Diamond & Hainmueller 2010) ────────────────────────
// Lawson–Hanson non-negative least squares: min ||A x - b|| s.t. x >= 0.  A: m x n (array of rows)
const ciNNLS = (A, b, maxIter=null) => {
  const m=A.length, n=A[0].length; const x=new Array(n).fill(0); const P=new Array(n).fill(false); const tol=1e-12;
  const resid=()=>b.map((bi,i)=>bi-A[i].reduce((s,a,j)=>s+a*x[j],0));
  const lsP=()=>{ const idx=[]; for (let j=0;j<n;j++) if(P[j]) idx.push(j); const k=idx.length; const G=Array.from({length:k},()=>new Array(k).fill(0)); const h=new Array(k).fill(0);
    for (let i=0;i<m;i++){ for (let a=0;a<k;a++){ const ai=A[i][idx[a]]; h[a]+=ai*b[i]; for (let c=a;c<k;c++) G[a][c]+=ai*A[i][idx[c]]; } }
    for (let a=0;a<k;a++){ for (let c=0;c<a;c++) G[a][c]=G[c][a]; G[a][a]+=1e-14; }
    const sol=ciSolve(G,h)||new Array(k).fill(0); const z=new Array(n).fill(0); idx.forEach((j,a)=>z[j]=sol[a]); return z; };
  for (let outer=0; outer<(maxIter||3*n); outer++){
    const r=resid(); const wv=new Array(n).fill(0); for (let j=0;j<n;j++){ let s=0; for (let i=0;i<m;i++) s+=A[i][j]*r[i]; wv[j]=s; }
    let jmax=-1, best=tol; for (let j=0;j<n;j++) if(!P[j] && wv[j]>best){ best=wv[j]; jmax=j; }
    if (jmax<0) break; P[jmax]=true;
    for (let inner=0; inner<3*n; inner++){
      const z=lsP(); let allPos=true; for (let j=0;j<n;j++) if(P[j] && z[j]<=tol){ allPos=false; break; }
      if (allPos){ for (let j=0;j<n;j++) x[j]=P[j]? z[j] : 0; break; }
      let alpha=Infinity; for (let j=0;j<n;j++) if(P[j] && z[j]<=tol){ const a=x[j]/(x[j]-z[j]); if (a<alpha) alpha=a; }
      for (let j=0;j<n;j++){ x[j]+=alpha*(z[j]-x[j]); if (P[j] && Math.abs(x[j])<=tol){ P[j]=false; x[j]=0; } }
    }
  }
  return x;
};
// Euclidean projection onto the probability simplex (Duchi et al. 2008)
const ciSimplexProj = (v) => { const u=[...v].sort((a,b)=>b-a); let css=0, th=0;
  for (let i=0;i<u.length;i++){ css+=u[i]; const t=(css-1)/(i+1); if (u[i]-t>0) th=t; } return v.map(x=>Math.max(x-th,0)); };
// min_w || z1 - Z0 w ||^2_V  s.t. w in simplex.   z1: K, Z0: K x J, v: K (diag of V)
const ciSynthW = (z1, Z0, v, iters=4000, w0=null, tol=1e-10) => {
  const K=z1.length, J=Z0[0].length; if (J===1) return [1];
  { // exact route: NNLS on [sqrt(V) Z0 ; lambda 1'] w = [sqrt(V) z1 ; lambda]
    const sv=v.map(q=>Math.sqrt(Math.max(q,0))); const A=Z0.map((row,k)=>row.map(a=>a*sv[k])); const b=z1.map((q,k)=>q*sv[k]);
    let sc=0; A.forEach(r=>r.forEach(a=>sc=Math.max(sc,Math.abs(a)))); const lam=1e4*(sc||1);
    const x=ciNNLS([...A, new Array(J).fill(lam)], [...b, lam]); const sx=x.reduce((p,q)=>p+q,0);
    if (sx>0 && isFinite(sx)){ w0=x.map(q=>q/sx); iters=Math.min(iters,300); }
  }
  // Q = Z0' V Z0, c = Z0' V z1
  const Q=Array.from({length:J},()=>new Array(J).fill(0)); const c=new Array(J).fill(0);
  for (let k=0;k<K;k++){ const vk=v[k]; const row=Z0[k]; for (let a=0;a<J;a++){ c[a]+=vk*row[a]*z1[k]; const ra=vk*row[a]; if(!ra) continue; for (let b=a;b<J;b++) Q[a][b]+=ra*row[b]; } }
  for (let a=0;a<J;a++) for (let b=0;b<a;b++) Q[a][b]=Q[b][a];
  // Lipschitz constant via power iteration
  let x=new Array(J).fill(1/Math.sqrt(J)), L=0; for (let t=0;t<60;t++){ const y=Q.map(r=>r.reduce((s,q,j)=>s+q*x[j],0)); L=Math.sqrt(y.reduce((s,q)=>s+q*q,0))||1e-12; x=y.map(q=>q/L); }
  const step=1/(2*L); let w=w0? w0.slice() : new Array(J).fill(1/J), yk=w.slice(), tk=1;
  const grad=(w)=>Q.map((r,a)=>2*(r.reduce((s,q,j)=>s+q*w[j],0)-c[a]));
  for (let it=0; it<iters; it++){
    const g=grad(yk); const wn=ciSimplexProj(yk.map((q,j)=>q-step*g[j]));
    const tn=(1+Math.sqrt(1+4*tk*tk))/2; yk=wn.map((q,j)=>q+((tk-1)/tn)*(q-w[j]));
    let diff=0; for (let j=0;j<J;j++) diff=Math.max(diff,Math.abs(wn[j]-w[j])); w=wn; tk=tn; if (diff<tol && it>30) break;
  }
  return w;
};
const ciNelderMead = (f, x0, opts={}) => { const n=x0.length; const maxIt=opts.maxIter||200*n; let simplex=[x0.slice()];
  for (let i=0;i<n;i++){ const x=x0.slice(); x[i]+= (opts.step||1); simplex.push(x); } let fv=simplex.map(f);
  for (let it=0; it<maxIt; it++){
    const ord=fv.map((v,i)=>[v,i]).sort((a,b)=>a[0]-b[0]); simplex=ord.map(([,i])=>simplex[i]); fv=ord.map(([v])=>v);
    if (Math.abs(fv[n]-fv[0]) < 1e-10*(Math.abs(fv[0])+1e-12)) break;
    const cen=new Array(n).fill(0); for (let i=0;i<n;i++) for (let j=0;j<n;j++) cen[j]+=simplex[i][j]/n;
    const xr=cen.map((c,j)=>c+(c-simplex[n][j])); const fr=f(xr);
    if (fr<fv[0]){ const xe=cen.map((c,j)=>c+2*(xr[j]-c)); const fe=f(xe); if (fe<fr){ simplex[n]=xe; fv[n]=fe; } else { simplex[n]=xr; fv[n]=fr; } }
    else if (fr<fv[n-1]){ simplex[n]=xr; fv[n]=fr; }
    else { const xc=cen.map((c,j)=>c+0.5*(simplex[n][j]-c)); const fc=f(xc);
      if (fc<fv[n]){ simplex[n]=xc; fv[n]=fc; } else { for (let i=1;i<=n;i++){ simplex[i]=simplex[i].map((v,j)=>simplex[0][j]+0.5*(v-simplex[0][j])); fv[i]=f(simplex[i]); } } }
  }
  const best=fv.indexOf(Math.min(...fv)); return { x:simplex[best], f:fv[best] };
};
// Fill interior gaps by linear interpolation; returns null if the series has missing ends inside the window
const ciInterp = (vals) => { const v=vals.slice(); const idx=v.map((x,i)=>x==null||isNaN(x)? -1 : i).filter(i=>i>=0);
  if (!idx.length || idx[0]!==0 || idx[idx.length-1]!==v.length-1) return null;
  for (let i=1;i<v.length;i++) if (v[i]==null||isNaN(v[i])){ let j=i; while(v[j]==null||isNaN(v[j])) j++; for (let t=i;t<j;t++) v[t]=v[i-1]+(v[j]-v[i-1])*(t-i+1)/(j-i+1); i=j; }
  return v; };
// panel: {units:[{id,name,y:[...], cov:{name:value}}], years:[...]}, treatedId, t0Year
// mode: 'outcome' (V = identity over every pre-period outcome) | 'nested' (covariates + outcome lags, V by Nelder–Mead)
const ciSynthFit = (Y1, Y0, preIdx, P1=null, P0=null, mode="outcome", fixedV=null) => {
  const pre=(row)=>preIdx.map(t=>row[t]);
  if (mode==="outcome" || !P1 || !P1.length){
    const z1=pre(Y1), Z0=preIdx.map(t=>Y0.map(r=>r[t])); const w=ciSynthW(z1, Z0, new Array(z1.length).fill(1)); return { w, v:null };
  }
  // predictors: rows = predictors, cols = units. scale each predictor by its SD across all units (as Synth does)
  const K=P1.length; const sd=P1.map((p,k)=>{ const a=[p,...P0[k]]; return Math.sqrt(ciVarS(a))||1; });
  const z1=P1.map((p,k)=>p/sd[k]); const Z0=P0.map((r,k)=>r.map(x=>x/sd[k]));
  const Ypre1=pre(Y1), Ypre0=preIdx.map(t=>Y0.map(r=>r[t]));
  const loss=(w)=>{ let s=0; for (let t=0;t<Ypre1.length;t++){ let yh=0; for (let j=0;j<w.length;j++) yh+=Ypre0[t][j]*w[j]; s+=(Ypre1[t]-yh)**2; } return s/Ypre1.length; };
  if (fixedV) return { w: ciSynthW(z1, Z0, fixedV), v: fixedV };
  const toV=(x)=>{ const e=[1,...x.map(Math.exp)]; const s=e.reduce((a,b)=>a+b,0); return e.map(q=>q/s); };
  const f=(x)=>loss(ciSynthW(z1, Z0, toV(x), 300, null, 1e-10));
  // start from equal weights and from "regression" style weights, keep the better
  // multi-start Nelder–Mead over log V (Synth-style): equal weights, then regression-based start (|beta| of pre-outcome mean on predictors)
  const starts=[new Array(K-1).fill(0)];
  { const yb=[ciMean(Ypre1), ...Z0[0].map((_,j)=>ciMean(Ypre0.map(r=>r[j])))]; const Xr=yb.map((_,u)=>[1, ...z1.map((q,k)=> u===0? q : Z0[k][u-1])]);
    const ols=ciOLS(Xr, yb); if (ols){ const bb=ols.beta.slice(1).map(q=>Math.abs(q)+1e-6); starts.push(bb.slice(1).map(q=>Math.log(q/bb[0]))); } }
  let r={ f:Infinity };
  for (const s0 of starts){ let rr=ciNelderMead(f, s0, { maxIter: 40*K, step: 1.5 }); const r2=ciNelderMead(f, rr.x, { maxIter: 20*K, step: 0.5 }); if (r2.f<rr.f) rr=r2; if (rr.f<r.f) r=rr; }
  const v=toV(r.x); return { w: ciSynthW(z1, Z0, v), v };
};
const ciRmspe = (a,b,idx) => Math.sqrt(ciMean(idx.map(t=>(a[t]-b[t])**2)));
// Full analysis with in-space placebos and leave-one-out
const ciSynthRun = (panel, treatedId, t0Year, opts={}) => {
  const { mode="outcome", predictors=[], placebo=true, loo=true } = opts;
  const years=panel.years; const t0=years.indexOf(t0Year); if (t0<2) return { error:"Need at least 2 pre-treatment years before the treatment year." };
  if (t0>=years.length) return { error:"Treatment year is outside the data window." };
  const preIdx=years.map((_,i)=>i).filter(i=>i<t0), postIdx=years.map((_,i)=>i).filter(i=>i>=t0);
  const units=panel.units; const tr=units.find(u=>u.id===treatedId); if(!tr) return { error:"Treated unit has no complete data in this window." };
  const donors=units.filter(u=>u.id!==treatedId); if (donors.length<2) return { error:"Need at least two donor units with complete data." };
  // predictors measured over a window of pre-period indices (whole pre-period by default; CV uses sub-windows)
  const predRow=(u, win=preIdx)=>predictors.map(p=>{ if (p.type==="lag"){ if (win===preIdx && p.year!=null) return u.y[years.indexOf(p.year)]; const pos=p.pos==="first"? 0 : p.pos==="mid"? Math.floor(win.length/2) : win.length-1; return u.y[win[pos]]; }
    if (p.type==="preMean") return ciMean(win.map(t=>u.y[t]));
    if (u.covY?.[p.name] && win!==preIdx){ const v=win.map(t=>u.covY[p.name][years[t]]).filter(x=>x!=null&&isFinite(x)); if (v.length) return ciMean(v); }
    return u.cov?.[p.name]; });
  const usePred = mode==="nested" && predictors.length>0;
  let cvInfo=null, win=preIdx, cvV=null;
  if (usePred && opts.vMethod==="cv"){ const trU=units.find(u=>u.id===treatedId); const cv=meSynthCV(trU, units.filter(u=>u.id!==treatedId), preIdx, (u,ix)=>predRow(u,ix));
    if (cv){ cvV=cv.V; win=cv.valYears; cvInfo={ train:[years[cv.trainYears[0]], years[cv.trainYears[cv.trainYears.length-1]]], val:[years[cv.valYears[0]], years[cv.valYears[cv.valYears.length-1]]], valMSPE:cv.valMSPE }; } }
  const fitFor=(tUnit, pool, fixedV)=>{ fixedV = fixedV || cvV;
    const P1=usePred? predRow(tUnit, win) : null; const P0=usePred? predictors.map((_,k)=>pool.map(u=>predRow(u, win)[k])) : null;
    const { w, v }=ciSynthFit(tUnit.y, pool.map(u=>u.y), preIdx, P1, P0, usePred? "nested":"outcome", fixedV);
    const synth=years.map((_,t)=>pool.reduce((s,u,j)=>s+u.y[t]*w[j],0));
    const gap=tUnit.y.map((y,t)=>y-synth[t]); const pre=ciRmspe(tUnit.y,synth,preIdx), post=ciRmspe(tUnit.y,synth,postIdx);
    return { w, v, synth, gap, preRMSPE:pre, postRMSPE:post, ratio: pre>0? post/pre : Infinity }; };
  const main=fitFor(tr, donors);
  const att=ciMean(postIdx.map(t=>main.gap[t]));
  const weights=donors.map((u,j)=>({ id:u.id, name:u.name, w:main.w[j] })).sort((a,b)=>b.w-a.w);
  // predictor balance
  const balRows=[]; const preMean=(u)=>ciMean(preIdx.map(t=>u.y[t]));
  balRows.push({ name:"Outcome, pre-period mean", treated:preMean(tr), synthetic:donors.reduce((s,u,j)=>s+preMean(u)*main.w[j],0), donorAvg:ciMean(donors.map(preMean)) });
  predictors.filter(p=>p.type==="cov").forEach(p=>{ const vals=donors.map(u=>u.cov?.[p.name]); balRows.push({ name:p.label||p.name, treated:tr.cov?.[p.name], synthetic:vals.reduce((s,v,j)=>s+(v??0)*main.w[j],0), donorAvg:ciMean(vals.filter(v=>v!=null)) }); });
  const res={ years, t0Year, preIdx, postIdx, treated:{ id:tr.id, name:tr.name, y:tr.y }, ...main, att, weights, balance:balRows, v:main.v, donors:donors.map(u=>u.id), placebos:[], loo:[], cv:cvInfo };
  if (placebo){
    const fixedV=main.v; // reuse the treated unit's V for placebo runs (keeps runtime manageable)
    for (const d of donors){ const pool=donors.filter(u=>u.id!==d.id); if (pool.length<2) continue; const r=fitFor(d, pool, fixedV);
      res.placebos.push({ id:d.id, name:d.name, gap:r.gap, preRMSPE:r.preRMSPE, postRMSPE:r.postRMSPE, ratio:r.ratio }); }
    const all=[{ id:tr.id, ratio:main.ratio }, ...res.placebos.map(p=>({ id:p.id, ratio:p.ratio }))].sort((a,b)=>b.ratio-a.ratio);
    res.rank=all.findIndex(a=>a.id===tr.id)+1; res.pValue=res.rank/all.length; res.nPlacebo=res.placebos.length;
  }
  if (loo){ weights.filter(x=>x.w>0.01).forEach(x=>{ const pool=donors.filter(u=>u.id!==x.id); if (pool.length<2) return; const r=fitFor(tr, pool, main.v); res.loo.push({ dropped:x.name, synth:r.synth, preRMSPE:r.preRMSPE, att:ciMean(postIdx.map(t=>r.gap[t])) }); }); }
  return res;
};
// filter placebo set by pre-period fit (ADH 2010 drop placebos with pre-MSPE > m times the treated unit's)
const ciSynthPValue = (res, mult) => { if (!res.placebos?.length) return { p:NaN, rank:NaN, n:0 };
  const keep=res.placebos.filter(p=> !mult || (p.preRMSPE**2) <= mult*(res.preRMSPE**2));
  const all=[{ id:"__t", ratio:res.ratio }, ...keep.map(p=>({ id:p.id, ratio:p.ratio }))].sort((a,b)=>b.ratio-a.ratio);
  const rank=all.findIndex(a=>a.id==="__t")+1; return { p:rank/all.length, rank, n:all.length, keep };
};
// >>> RESEARCH METHODS ENGINE (generated from engine/*.js) >>>
// ══════════════════════════════════════════════
// RESEARCH METHODS ENGINE (me*): shared numerics
// ══════════════════════════════════════════════
const meInvNorm = (p) => { // Acklam's inverse normal CDF (|rel. error| < 1.2e-9)
  if (p<=0) return -Infinity; if (p>=1) return Infinity;
  const a=[-39.69683028665376,220.9460984245205,-275.9285104469687,138.3577518672690,-30.66479806614716,2.506628277459239],
        b=[-54.47609879822406,161.5858368580409,-155.6989798598866,66.80131188771972,-13.28068155288572],
        c=[-0.007784894002430293,-0.3223964580411365,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783],
        d=[0.007784695709041462,0.3224671290700398,2.445134137142996,3.754408661907416];
  const pl=0.02425; let q,r;
  if (p<pl){ q=Math.sqrt(-2*Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  if (p>1-pl){ q=Math.sqrt(-2*Math.log(1-p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  q=p-0.5; r=q*q; return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
};
// accurate normal CDF (W. J. Cody erfc), used where tail p-values matter
const meNormCdf = (z) => { const x=Math.abs(z)/Math.SQRT2; const t=1/(1+0.5*x);
  const y=t*Math.exp(-x*x-1.26551223+t*(1.00002368+t*(0.37409196+t*(0.09678418+t*(-0.18628806+t*(0.27886807+t*(-1.13520398+t*(1.48851587+t*(-0.82215223+t*0.17087277)))))))));
  return z>=0? 1-y/2 : y/2; };
const mePval = (est, se) => (se>0 && isFinite(se) && isFinite(est)) ? Math.min(1, 2*(1-meNormCdf(Math.abs(est/se)))) : NaN;
// log-gamma and regularized incomplete beta / gamma (Numerical Recipes) for t, F and chi-square tails
const meLnGamma = (x) => { const g=[76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];
  let y=x, tmp=x+5.5; tmp-=(x+0.5)*Math.log(tmp); let ser=1.000000000190015; for (let j=0;j<6;j++) ser+=g[j]/++y; return -tmp+Math.log(2.5066282746310005*ser/x); };
const meBetaCF = (a,b,x) => { const FPMIN=1e-300; let qab=a+b, qap=a+1, qam=a-1, c=1, d=1-qab*x/qap; if (Math.abs(d)<FPMIN) d=FPMIN; d=1/d; let h=d;
  for (let m=1;m<=300;m++){ const m2=2*m; let aa=m*(b-m)*x/((qam+m2)*(a+m2)); d=1+aa*d; if (Math.abs(d)<FPMIN) d=FPMIN; c=1+aa/c; if (Math.abs(c)<FPMIN) c=FPMIN; d=1/d; h*=d*c;
    aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2)); d=1+aa*d; if (Math.abs(d)<FPMIN) d=FPMIN; c=1+aa/c; if (Math.abs(c)<FPMIN) c=FPMIN; d=1/d; const del=d*c; h*=del; if (Math.abs(del-1)<3e-14) break; }
  return h; };
const meIncBeta = (a,b,x) => { if (x<=0) return 0; if (x>=1) return 1; const bt=Math.exp(meLnGamma(a+b)-meLnGamma(a)-meLnGamma(b)+a*Math.log(x)+b*Math.log(1-x));
  return x<(a+1)/(a+b+2)? bt*meBetaCF(a,b,x)/a : 1-bt*meBetaCF(b,a,1-x)/b; };
const meTPval = (t, df) => !isFinite(t)? NaN : (!isFinite(df)||df>1e6)? 2*(1-meNormCdf(Math.abs(t))) : meIncBeta(df/2, 0.5, df/(df+t*t)); // two-sided
const meFPval = (F, d1, d2) => !(F>=0)? NaN : meIncBeta(d2/2, d1/2, d2/(d2+d1*F)); // upper tail
const meGammaP = (a,x) => { if (x<=0) return 0; if (x<a+1){ let ap=a, sum=1/a, del=sum; for (let n=0;n<500;n++){ ap++; del*=x/ap; sum+=del; if (Math.abs(del)<Math.abs(sum)*3e-15) break; } return sum*Math.exp(-x+a*Math.log(x)-meLnGamma(a)); }
  let b=x+1-a, c=1e300, d=1/b, h=d; for (let i=1;i<500;i++){ const an=-i*(i-a); b+=2; d=an*d+b; if (Math.abs(d)<1e-300) d=1e-300; c=b+an/c; if (Math.abs(c)<1e-300) c=1e-300; d=1/d; const del=d*c; h*=del; if (Math.abs(del-1)<3e-15) break; }
  return 1-Math.exp(-x+a*Math.log(x)-meLnGamma(a))*h; };
const meChi2Pval = (x, k) => !(x>=0)? NaN : 1-meGammaP(k/2, x/2);
const meTQuant = (p, df) => { if (!isFinite(df)||df>1e6) return meInvNorm(p); let lo=-50, hi=50; for (let i=0;i<100;i++){ const m=(lo+hi)/2; const cdf = m<0? meTPval(m,df)/2 : 1-meTPval(m,df)/2; if (cdf<p) lo=m; else hi=m; } return (lo+hi)/2; };
// ── small matrix helpers (arrays of rows) ──
const meZeros = (r,c) => Array.from({length:r},()=>new Array(c).fill(0));
const meMatMul = (A,B) => { const n=A.length, m=B[0].length, k=B.length; const C=meZeros(n,m); for (let i=0;i<n;i++) for (let t=0;t<k;t++){ const a=A[i][t]; if (!a) continue; const Bt=B[t]; const Ci=C[i]; for (let j=0;j<m;j++) Ci[j]+=a*Bt[j]; } return C; };
const meTr = (A) => A[0].map((_,j)=>A.map(r=>r[j]));
const meMV = (A,x) => A.map(r=>{ let s=0; for (let j=0;j<x.length;j++) s+=r[j]*x[j]; return s; });
const meDot = (a,b) => { let s=0; for (let i=0;i<a.length;i++) s+=a[i]*b[i]; return s; };
const meQF = (x,A) => meDot(x, meMV(A,x)); // x' A x
// symmetric pseudo-inverse via eigen-decomposition (Jacobi), for rank-deficient covariance matrices
const meEigSym = (A0) => { const n=A0.length; const A=A0.map(r=>r.slice()); const V=meZeros(n,n); for (let i=0;i<n;i++) V[i][i]=1;
  for (let sweep=0; sweep<100; sweep++){ let off=0; for (let p=0;p<n;p++) for (let q=p+1;q<n;q++) off+=A[p][q]*A[p][q]; if (off<1e-22) break;
    for (let p=0;p<n;p++) for (let q=p+1;q<n;q++){ if (Math.abs(A[p][q])<1e-300) continue; const th=(A[q][q]-A[p][p])/(2*A[p][q]); const t=Math.sign(th||1)/(Math.abs(th)+Math.sqrt(th*th+1)); const c=1/Math.sqrt(t*t+1), s=t*c;
      for (let k=0;k<n;k++){ const akp=A[k][p], akq=A[k][q]; A[k][p]=c*akp-s*akq; A[k][q]=s*akp+c*akq; }
      for (let k=0;k<n;k++){ const apk=A[p][k], aqk=A[q][k]; A[p][k]=c*apk-s*aqk; A[q][k]=s*apk+c*aqk; }
      for (let k=0;k<n;k++){ const vkp=V[k][p], vkq=V[k][q]; V[k][p]=c*vkp-s*vkq; V[k][q]=s*vkp+c*vkq; } } }
  return { values:A.map((r,i)=>r[i]), vectors:V }; };
const mePinv = (A, tol=1e-10) => { const { values, vectors } = meEigSym(A); const mx=Math.max(...values.map(Math.abs))||1; const n=A.length; const P=meZeros(n,n); let rank=0;
  values.forEach((l,k)=>{ if (Math.abs(l)>tol*mx){ rank++; for (let i=0;i<n;i++) for (let j=0;j<n;j++) P[i][j]+=vectors[i][k]*vectors[j][k]/l; } }); P.rank=rank; return P; };

export { CustomTip, Settings, UpgradeRequestModal, ciBootstrapIPW, ciChol, ciFillSeries, ciInv, ciLogit, ciMean, ciNelderMead, ciPanelFromTable, ciPrepare, ciPval, ciQuantile, ciResult, ciRmspe, ciRng, ciRunAll, ciSimplexProj, ciSynthPValue, ciSynthRun, ciSynthW, ciVarS, meChi2Pval, meDot, meFPval, meInvNorm, meLnGamma, meMV, meMatMul, meNormCdf, mePinv, mePval, meQF, meTPval, meTQuant, meTr, meZeros };
