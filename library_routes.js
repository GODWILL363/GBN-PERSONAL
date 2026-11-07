// library_routes.js  —  EcoScope Data Vault: datasets the administrator prepares, documents and publishes to chosen plans or users
// Usage in server.js, after require("./auth_projects")(...):   require("./library_routes")(app, { sbFetch });
// Run supabase_library.sql once in Supabase → SQL Editor before deploying.
//
// Rules
//  · Only administrators can create, edit, publish or delete Vault datasets and their documents.
//  · A signed-in user sees a dataset only when ALL of these hold:
//      it is published · at least one of its categories is switched on · the user's plan is in its audience
//      (with an active plan) or the user is named in its audience.
//  · Supporting documents are downloadable by anyone who can see the dataset.

const crypto = require("crypto");
const express = require("express");

const CATS = ["micro", "macro", "qualitative", "quantitative", "primary", "secondary"];
const PLANS = ["free", "pro", "enterprise"];
const FILE_MAX = 15 * 1024 * 1024;
const DATA_MAX = 20 * 1024 * 1024;
const META = "id,title,description,categories,source_name,source_url,citation,license,coverage,notes,audience,allow_download,published,n_rows,n_cols,size_bytes,created_at,updated_at,updated_by,published_at";
const FILE_META = "id,dataset_id,name,mime,kind,note,size_bytes,created_at,uploaded_by";

module.exports = function registerLibrary(app, { sbFetch }) {
  const enc = encodeURIComponent; const clean = (s, n) => String(s ?? "").trim().slice(0, n);
  const deny = (res, code, msg, kind) => res.status(code).json({ error: msg, code: kind });
  const bad = (r) => !Array.isArray(r);
  const fail = (res, e, what = "the Data Vault") => { console.error("[library]", e?.message || e); res.status(500).json({ error: `Could not reach ${what}. Please try again.` }); };
  const big = express.json({ limit: "25mb" });
  const raw = express.raw({ type: () => true, limit: FILE_MAX + 1024 });
  const adminOnly = (req, res) => { if (!req.auth || !req.auth.admin) { deny(res, 403, "Administrator access only.", "forbidden"); return false; } return true; };
  const logAct = async (username, action, detail) => { try { await sbFetch("POST", "ecoscope_activity", { username, action, detail, ip: "", ts: new Date().toISOString() }); } catch (e) { /* activity is best-effort */ } };

  // ── settings: which categories are on, and the section's name ──
  const DEFAULT_SETTINGS = { name: "Data Vault", categories: Object.fromEntries(CATS.map(c => [c, true])) };
  let cache = null, cacheAt = 0;
  const getSettings = async (fresh) => {
    if (!fresh && cache && Date.now() - cacheAt < 15000) return cache;
    try { const r = await sbFetch("GET", "ecoscope_library_settings", null, "?key=eq.vault&select=value"); const v = Array.isArray(r) && r[0] ? r[0].value || {} : {};
      cache = { name: clean(v.name, 60) || DEFAULT_SETTINGS.name, categories: Object.fromEntries(CATS.map(c => [c, v.categories && typeof v.categories[c] === "boolean" ? v.categories[c] : true])) };
    } catch (e) { cache = cache || DEFAULT_SETTINGS; }
    cacheAt = Date.now(); return cache; };

  const normAudience = (a) => { a = a && typeof a === "object" ? a : {}; return { plans: (Array.isArray(a.plans) ? a.plans : []).filter(p => PLANS.includes(p)), users: [...new Set((Array.isArray(a.users) ? a.users : []).map(u => clean(u, 40)).filter(Boolean))].slice(0, 500) }; };
  const meta = (b) => { const out = {};
    if (b.title !== undefined) out.title = clean(b.title, 160) || "Untitled dataset";
    ["description:4000", "source_name:200", "source_url:500", "citation:1200", "license:200", "coverage:300", "notes:4000"].forEach(x => { const [k, n] = x.split(":"); if (b[k] !== undefined) out[k] = clean(b[k], +n) || null; });
    if (out.source_url && !/^https?:\/\//i.test(out.source_url)) out.source_url = "https://" + out.source_url;
    if (b.categories !== undefined) out.categories = [...new Set((Array.isArray(b.categories) ? b.categories : []).filter(c => CATS.includes(c)))];
    if (b.audience !== undefined) out.audience = normAudience(b.audience);
    if (b.allow_download !== undefined) out.allow_download = !!b.allow_download;
    return out; };
  const tableOf = (b) => { if (!b.data) return null; const h = Array.isArray(b.data.headers) ? b.data.headers.map(x => clean(x, 200)) : null; const rows = Array.isArray(b.data.rows) ? b.data.rows : null;
    if (!h || !h.length || !rows) throw Object.assign(new Error("The dataset needs column names and rows."), { http: 400 });
    const r2 = rows.map(r => (Array.isArray(r) ? r : []).slice(0, h.length).map(v => v == null ? "" : typeof v === "number" ? v : String(v).slice(0, 2000)));
    const size = Buffer.byteLength(JSON.stringify({ headers: h, rows: r2 })); if (size > DATA_MAX) throw Object.assign(new Error(`The dataset is ${(size / 1048576).toFixed(1)} MB; the limit is ${DATA_MAX / 1048576} MB. Keep fewer columns or rows.`), { http: 413 });
    return { headers: h, rows: r2, n_rows: r2.length, n_cols: h.length, size_bytes: size }; };
  const kindOf = (name, mime) => { const n = String(name).toLowerCase(); if (/\.pdf$/.test(n) || /pdf/.test(mime)) return "pdf"; if (/\.(xlsx|xlsm|xls|ods|csv|tsv)$/.test(n)) return "spreadsheet"; if (/\.(docx|doc|odt|rtf|txt|md)$/.test(n)) return "document";
    if (/\.(pptx|ppt|odp)$/.test(n)) return "slides"; if (/\.(png|jpe?g|gif|webp|svg)$/.test(n)) return "image"; return "other"; };

  // who may see what
  const userInfo = async (req) => { if (req.auth.admin) return { admin: true, username: req.auth.username };
    const r = await sbFetch("GET", "ecoscope_users", null, `?username=eq.${enc(req.auth.username)}&select=username,plan,plan_status`); const u = Array.isArray(r) && r[0] ? r[0] : null;
    return { admin: false, username: req.auth.username, plan: u && u.plan_status !== "suspended" && u.plan_status !== "invited" ? (u.plan || "free") : null }; };
  const liveCats = (d, s) => (d.categories || []).filter(c => s.categories[c]);
  const entitled = (d, u) => { if (u.admin) return true; const a = normAudience(d.audience); return (!!u.plan && a.plans.includes(u.plan)) || a.users.includes(u.username); };
  const visible = (d, s, u) => u.admin || (d.published && liveCats(d, s).length > 0 && entitled(d, u));
  const stateOf = (d, s) => !d.published ? "draft" : !liveCats(d, s).length ? "hidden" : !(normAudience(d.audience).plans.length || normAudience(d.audience).users.length) ? "no_audience" : "live";
  const one = async (id, cols = META) => { const r = await sbFetch("GET", "ecoscope_library", null, `?id=eq.${enc(id)}&select=${cols}`); return Array.isArray(r) && r[0] ? r[0] : null; };
  const filesOf = async (ids) => { if (!ids.length) return {}; const r = await sbFetch("GET", "ecoscope_library_files", null, `?dataset_id=in.(${ids.map(i => `"${String(i).replace(/"/g, "")}"`).join(",")})&select=${FILE_META}&order=created_at.asc`);
    const out = {}; (Array.isArray(r) ? r : []).forEach(f => { (out[f.dataset_id] = out[f.dataset_id] || []).push(f); }); return out; };

  // ══════════════ USERS ══════════════
  app.get("/api/library", async (req, res) => {
    try { const s = await getSettings(); const u = await userInfo(req);
      const r = await sbFetch("GET", "ecoscope_library", null, `?published=eq.true&select=${META}&order=updated_at.desc`); if (bad(r)) throw new Error(JSON.stringify(r).slice(0, 200));
      const list = r.filter(d => visible(d, s, u)); const files = await filesOf(list.map(d => d.id));
      const enabled = CATS.filter(c => s.categories[c]);
      res.json({ name: s.name, categories: enabled, datasets: list.map(d => ({ ...d, categories: liveCats(d, s), audience: undefined, files: files[d.id] || [] })) });
    } catch (e) { fail(res, e); } });
  app.get("/api/library/:id", async (req, res) => {
    try { const s = await getSettings(); const u = await userInfo(req); const d = await one(req.params.id, "*");
      if (!d || !visible(d, s, u)) return deny(res, 404, "This dataset is not available on your plan, or it is no longer published.", "not_found");
      const files = await filesOf([d.id]); res.json({ ...d, audience: u.admin ? d.audience : undefined, categories: u.admin ? d.categories : liveCats(d, s), files: files[d.id] || [] });
      logAct(req.auth.username, "Vault dataset opened", d.title);
    } catch (e) { fail(res, e); } });
  app.get("/api/library/:id/files/:fid", async (req, res) => {
    try { const s = await getSettings(); const u = await userInfo(req); const d = await one(req.params.id, "id,title,published,categories,audience");
      if (!d || !visible(d, s, u)) return deny(res, 404, "This document is not available on your plan.", "not_found");
      const r = await sbFetch("GET", "ecoscope_library_files", null, `?id=eq.${enc(req.params.fid)}&dataset_id=eq.${enc(d.id)}&select=*`); const f = Array.isArray(r) && r[0];
      if (!f) return deny(res, 404, "Document not found.", "not_found");
      const buf = Buffer.from(f.data || "", "base64"); res.setHeader("Content-Type", f.mime || "application/octet-stream"); res.setHeader("Content-Length", buf.length);
      res.setHeader("Content-Disposition", `${req.query.inline ? "inline" : "attachment"}; filename*=UTF-8''${enc(f.name)}`); res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Cache-Control", "private, no-store");
      res.end(buf);
    } catch (e) { fail(res, e); } });

  // ══════════════ ADMINISTRATOR ══════════════
  app.get("/api/admin/library", async (req, res) => {
    if (!adminOnly(req, res)) return;
    try { const s = await getSettings(true); const r = await sbFetch("GET", "ecoscope_library", null, `?select=${META}&order=updated_at.desc`); if (bad(r)) throw new Error(JSON.stringify(r).slice(0, 200));
      const files = await filesOf(r.map(d => d.id));
      res.json({ settings: s, catalog: CATS, plans: PLANS, datasets: r.map(d => ({ ...d, audience: normAudience(d.audience), state: stateOf(d, s), live_in: liveCats(d, s), files: files[d.id] || [] })) });
    } catch (e) { fail(res, e); } });
  app.get("/api/admin/library/:id", async (req, res) => {
    if (!adminOnly(req, res)) return;
    try { const s = await getSettings(); const d = await one(req.params.id, "*"); if (!d) return deny(res, 404, "Dataset not found.", "not_found");
      const files = await filesOf([d.id]); res.json({ ...d, audience: normAudience(d.audience), state: stateOf(d, s), live_in: liveCats(d, s), files: files[d.id] || [] }); } catch (e) { fail(res, e); } });
  app.post("/api/admin/library", big, async (req, res) => {
    if (!adminOnly(req, res)) return;
    try { const b = req.body || {}; const now = new Date().toISOString(); const t = tableOf(b);
      const row = { id: crypto.randomUUID(), title: "Untitled dataset", categories: [], audience: { plans: [], users: [] }, allow_download: true, published: false, headers: [], rows: [], n_rows: 0, n_cols: 0, size_bytes: 0,
        ...meta(b), ...(t || {}), created_at: now, updated_at: now, updated_by: req.auth.username, published_at: null };
      if (b.published && !t) return deny(res, 400, "Add the data before publishing.", "bad_request");
      if (b.published) { row.published = true; row.published_at = now; }
      const out = await sbFetch("POST", "ecoscope_library", row); const d = Array.isArray(out) ? out[0] : null; if (!d || !d.id) throw new Error(JSON.stringify(out).slice(0, 300));
      await logAct(req.auth.username, "Vault dataset created", `${row.title}${row.published ? " · published" : " · draft"}`);
      const s = await getSettings(); const { headers, rows, ...m } = d; res.json({ ...m, state: stateOf(d, s), live_in: liveCats(d, s), files: [] });
    } catch (e) { if (e.http) return deny(res, e.http, e.message, "bad_request"); fail(res, e); } });
  app.patch("/api/admin/library/:id", big, async (req, res) => {
    if (!adminOnly(req, res)) return;
    try { const d = await one(req.params.id, "id,title,published,n_rows"); if (!d) return deny(res, 404, "Dataset not found.", "not_found");
      const b = req.body || {}; const now = new Date().toISOString(); const upd = { ...meta(b), ...(tableOf(b) || {}), updated_at: now, updated_by: req.auth.username };
      if (b.published !== undefined) { upd.published = !!b.published; if (upd.published && !d.published) upd.published_at = now;
        if (upd.published && !(upd.n_rows || d.n_rows)) return deny(res, 400, "Add the data before publishing.", "bad_request"); }
      await sbFetch("PATCH", "ecoscope_library", upd, `?id=eq.${enc(d.id)}`);
      if (b.published !== undefined && !!b.published !== !!d.published) await logAct(req.auth.username, b.published ? "Vault dataset published" : "Vault dataset unpublished", upd.title || d.title);
      else await logAct(req.auth.username, "Vault dataset updated", `${upd.title || d.title}${upd.n_rows != null ? ` · ${upd.n_rows} rows` : ""}`);
      const s = await getSettings(); const fresh = await one(d.id); res.json({ ...fresh, audience: normAudience(fresh.audience), state: stateOf(fresh, s), live_in: liveCats(fresh, s) });
    } catch (e) { if (e.http) return deny(res, e.http, e.message, "bad_request"); fail(res, e); } });
  app.delete("/api/admin/library/:id", async (req, res) => {
    if (!adminOnly(req, res)) return;
    try { const d = await one(req.params.id, "id,title"); if (!d) return deny(res, 404, "Dataset not found.", "not_found");
      await sbFetch("DELETE", "ecoscope_library_files", null, `?dataset_id=eq.${enc(d.id)}`); await sbFetch("DELETE", "ecoscope_library", null, `?id=eq.${enc(d.id)}`);
      await logAct(req.auth.username, "Vault dataset deleted", d.title); res.json({ ok: true });
    } catch (e) { fail(res, e); } });
  // supporting documents: the browser sends the file's bytes as the request body (?name=...&note=...)
  app.post("/api/admin/library/:id/files", raw, async (req, res) => {
    if (!adminOnly(req, res)) return;
    try { const d = await one(req.params.id, "id,title"); if (!d) return deny(res, 404, "Save the dataset first, then add documents.", "not_found");
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]); if (!buf.length) return deny(res, 400, "The file is empty.", "bad_request");
      if (buf.length > FILE_MAX) return deny(res, 413, `Each document can be up to ${FILE_MAX / 1048576} MB.`, "too_large");
      const name = clean(req.query.name, 200).replace(/[\\/:*?"<>|\r\n]+/g, "_") || "document"; const mime = clean(req.query.type, 120).replace(/[^\w.+\/-]/g, "") || "application/octet-stream";
      const row = { id: crypto.randomUUID(), dataset_id: d.id, name, mime, kind: kindOf(name, mime), note: clean(req.query.note, 500) || null, size_bytes: buf.length, data: buf.toString("base64"), created_at: new Date().toISOString(), uploaded_by: req.auth.username };
      const out = await sbFetch("POST", "ecoscope_library_files", row); if (bad(out)) throw new Error(JSON.stringify(out).slice(0, 200));
      await logAct(req.auth.username, "Vault document added", `${name} → ${d.title}`); const { data, ...m } = row; res.json(m);
    } catch (e) { fail(res, e, "the document store"); } });
  app.patch("/api/admin/library/:id/files/:fid", async (req, res) => {
    if (!adminOnly(req, res)) return;
    try { await sbFetch("PATCH", "ecoscope_library_files", { note: clean(req.body?.note, 500) || null }, `?id=eq.${enc(req.params.fid)}&dataset_id=eq.${enc(req.params.id)}`); res.json({ ok: true }); } catch (e) { fail(res, e); } });
  app.delete("/api/admin/library/:id/files/:fid", async (req, res) => {
    if (!adminOnly(req, res)) return;
    try { await sbFetch("DELETE", "ecoscope_library_files", null, `?id=eq.${enc(req.params.fid)}&dataset_id=eq.${enc(req.params.id)}`); res.json({ ok: true }); } catch (e) { fail(res, e); } });
  app.patch("/api/admin/library-settings", async (req, res) => {
    if (!adminOnly(req, res)) return;
    try { const cur = await getSettings(true); const b = req.body || {}; const next = { name: b.name !== undefined ? (clean(b.name, 60) || DEFAULT_SETTINGS.name) : cur.name, categories: { ...cur.categories } };
      if (b.categories && typeof b.categories === "object") CATS.forEach(c => { if (typeof b.categories[c] === "boolean") next.categories[c] = b.categories[c]; });
      const ex = await sbFetch("GET", "ecoscope_library_settings", null, "?key=eq.vault&select=key");
      if (Array.isArray(ex) && ex[0]) await sbFetch("PATCH", "ecoscope_library_settings", { value: next, updated_at: new Date().toISOString() }, "?key=eq.vault");
      else await sbFetch("POST", "ecoscope_library_settings", { key: "vault", value: next, updated_at: new Date().toISOString() });
      const changed = CATS.filter(c => cur.categories[c] !== next.categories[c]).map(c => `${c} ${next.categories[c] ? "on" : "off"}`);
      if (changed.length || cur.name !== next.name) await logAct(req.auth.username, "Vault settings changed", [...changed, cur.name !== next.name ? `renamed to ${next.name}` : ""].filter(Boolean).join(", "));
      cache = next; cacheAt = Date.now(); res.json(next);
    } catch (e) { fail(res, e); } });
};
