// news_routes.js  —  "What's new": update and upgrade notices that admins post and every signed-in user sees under the bell
// Usage in server.js:  require("./news_routes")(app, { sbFetch });
// Table: ecoscope_announcements (supabase_upgrade_4.sql). If the table is missing, GET returns an empty list so the app keeps working.

module.exports = function registerNews(app, { sbFetch }) {
  const T = "ecoscope_announcements"; const KINDS = ["update", "upgrade", "maintenance", "notice"];
  const enc = encodeURIComponent; const clean = (s, n) => String(s ?? "").trim().slice(0, n);
  const who = (req, res) => { if (!req.auth) { res.status(401).json({ error: "Please sign in again.", code: "auth_required" }); return null; } return req.auth; };
  const admin = (req, res) => { const a = who(req, res); if (!a) return null; if (!a.admin) { res.status(403).json({ error: "Only admins can post announcements." }); return null; } return a; };
  const fail = (res, e) => { console.error("[news]", e.message || e); if (!res.headersSent) res.status(500).json({ error: "Could not reach the announcements. Please try again." }); };
  const body = (b) => ({ title: clean(b?.title, 140), body: clean(b?.body, 4000), kind: KINDS.includes(b?.kind) ? b.kind : "update", version: clean(b?.version, 40) || null });

  app.get("/api/news", async (req, res) => { if (!who(req, res)) return;
    try { const r = await sbFetch("GET", T, null, "?published=eq.true&select=id,title,body,kind,version,created_by,created_at&order=created_at.desc&limit=50");
      res.setHeader("Cache-Control", "no-store");
      if (!Array.isArray(r)) { console.error("[news] list:", JSON.stringify(r).slice(0, 200)); return res.json({ items: [], ready: false }); }
      res.json({ items: r, ready: true }); } catch (e) { fail(res, e); } });

  app.post("/api/news", async (req, res) => { const a = admin(req, res); if (!a) return;
    try { const row = body(req.body); if (!row.title || !row.body) return res.status(400).json({ error: "Give the announcement a title and a description." });
      const out = await sbFetch("POST", T, { ...row, published: true, created_by: a.username, created_at: new Date().toISOString() });
      if (!Array.isArray(out) || !out[0]) { console.error("[news] post:", JSON.stringify(out).slice(0, 200)); return res.status(500).json({ error: "Could not save it. Has supabase_upgrade_4.sql been run in Supabase?" }); }
      res.json(out[0]); } catch (e) { fail(res, e); } });

  app.patch("/api/news/:id", async (req, res) => { if (!admin(req, res)) return;
    try { const row = body(req.body); if (!row.title || !row.body) return res.status(400).json({ error: "Give the announcement a title and a description." });
      const r = await sbFetch("PATCH", T, { ...row, edited_at: new Date().toISOString() }, `?id=eq.${enc(req.params.id)}`);
      if (!Array.isArray(r) || !r.length) return res.status(404).json({ error: "Announcement not found." }); res.json(r[0]); } catch (e) { fail(res, e); } });

  app.delete("/api/news/:id", async (req, res) => { if (!admin(req, res)) return;
    try { await sbFetch("DELETE", T, null, `?id=eq.${enc(req.params.id)}`); res.json({ ok: true }); } catch (e) { fail(res, e); } });
};
