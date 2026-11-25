// snapshot_routes.js  —  "My snapshots": chart pictures a user saves, private to that user
// Bytes live in Supabase Storage (bucket from blob_store.js); the table keeps metadata. Up to 4 MB each, 300 per user.
// Usage in server.js:  require("./snapshot_routes")(app, { sbFetch });

const crypto = require("crypto");
const express = require("express");

module.exports = function registerSnapshots(app, { sbFetch, blobs }) {
  const BLOB = blobs || require("./blob_store")();
  const MAX = 4 * 1048576, PER_USER = 300; const T = "ecoscope_snapshots";
  const enc = encodeURIComponent; const clean = (s, n) => String(s ?? "").trim().slice(0, n);
  const raw = express.raw({ type: () => true, limit: MAX + 1024 });
  const who = (req, res) => { if (!req.auth) { res.status(401).json({ error: "Please sign in again.", code: "auth_required" }); return null; } return req.auth.username; };
  const fail = (res, e) => { console.error("[snapshots]", e.message || e); if (!res.headersSent) res.status(500).json({ error: "Could not reach your snapshots. Please try again." }); };
  const mine = async (id, user, cols = "*") => { const r = await sbFetch("GET", T, null, `?id=eq.${enc(id)}&username=eq.${enc(user)}&select=${cols}`); return Array.isArray(r) ? r[0] || null : null; };
  const isImage = (b) => b.length > 8 && ((b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) || (b[0] === 0xff && b[1] === 0xd8) || (b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP"));
  const mimeOf = (b) => (b[0] === 0x89 ? "image/png" : b[0] === 0xff ? "image/jpeg" : "image/webp");

  app.get("/api/snapshots", async (req, res) => { const u = who(req, res); if (!u) return;
    try { const r = await sbFetch("GET", T, null, `?username=eq.${enc(u)}&select=id,title,mime,size_bytes,meta,created_at&order=created_at.desc&limit=${PER_USER}`);
      if (!Array.isArray(r)) throw new Error(JSON.stringify(r).slice(0, 200)); res.setHeader("Cache-Control", "no-store"); res.json({ snapshots: r, limit: PER_USER }); } catch (e) { fail(res, e); } });

  app.post("/api/snapshots", raw, async (req, res) => { const u = who(req, res); if (!u) return;
    try { const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!isImage(buf)) return res.status(400).json({ error: "Send a PNG, JPEG or WebP picture." }); if (buf.length > MAX) return res.status(413).json({ error: "The picture is larger than 4 MB." });
      const n = await sbFetch("GET", T, null, `?username=eq.${enc(u)}&select=id`); if (Array.isArray(n) && n.length >= PER_USER) return res.status(409).json({ error: `You have ${PER_USER} snapshots. Delete some to save more.` });
      let meta = null; try { meta = req.query.meta ? JSON.parse(String(req.query.meta).slice(0, 2000)) : null; } catch (e) { meta = null; }
      const id = crypto.randomUUID(); const row = { id, username: u, title: clean(req.query.title, 160) || "Chart", mime: mimeOf(buf), size_bytes: buf.length, meta, storage_path: null, data: null, created_at: new Date().toISOString() };
      if (BLOB.enabled) { try { row.storage_path = await BLOB.put(`snapshots/${u}/${id}`, buf, row.mime); } catch (e) { console.error("[snapshots] storage upload failed, keeping it in the database:", e.message); } }
      if (!row.storage_path) row.data = buf.toString("base64");
      const out = await sbFetch("POST", T, row); if (!Array.isArray(out)) { if (row.storage_path) await BLOB.del(row.storage_path); throw new Error(JSON.stringify(out).slice(0, 200)); }
      const { data, storage_path, ...m } = row; res.json(m); } catch (e) { fail(res, e); } });

  app.get("/api/snapshots/:id", async (req, res) => { const u = who(req, res); if (!u) return;
    try { const s = await mine(req.params.id, u, "id,title,mime,storage_path,data"); if (!s) return res.status(404).json({ error: "Snapshot not found." });
      const buf = s.storage_path ? await BLOB.get(s.storage_path) : Buffer.from(s.data || "", "base64");
      res.setHeader("Content-Type", s.mime || "image/png"); res.setHeader("Content-Length", buf.length); res.setHeader("Cache-Control", "private, max-age=3600"); res.setHeader("X-Content-Type-Options", "nosniff"); res.send(buf); } catch (e) { fail(res, e); } });

  app.patch("/api/snapshots/:id", async (req, res) => { const u = who(req, res); if (!u) return;
    try { const t = clean(req.body?.title, 160); if (!t) return res.status(400).json({ error: "Give the snapshot a name." }); const r = await sbFetch("PATCH", T, { title: t }, `?id=eq.${enc(req.params.id)}&username=eq.${enc(u)}`);
      if (!Array.isArray(r) || !r.length) return res.status(404).json({ error: "Snapshot not found." }); res.json({ ok: true }); } catch (e) { fail(res, e); } });

  app.delete("/api/snapshots/:id", async (req, res) => { const u = who(req, res); if (!u) return;
    try { const s = await mine(req.params.id, u, "id,storage_path"); if (!s) return res.status(404).json({ error: "Snapshot not found." });
      if (s.storage_path) await BLOB.del(s.storage_path); await sbFetch("DELETE", T, null, `?id=eq.${enc(s.id)}&username=eq.${enc(u)}`); res.json({ ok: true }); } catch (e) { fail(res, e); } });
};
