// support_routes.js  —  EcoScope: password change, support chat and help assistant
// Usage in server.js (after `const app = express()` and `app.use(express.json())`):
//   require("./support_routes")(app);
// Needs the same environment variables as server.js: SUPABASE_URL, SUPABASE_KEY, ANTHROPIC_KEY (optional).
// Run supabase_support.sql once in Supabase → SQL Editor before deploying.

const crypto = require("crypto");

const https = require("https");
const http = require("http");

// Minimal HTTPS/HTTP JSON request helper (works on any Node version)
function requestJSON(urlStr, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr); const data = body ? JSON.stringify(body) : null;
    const req = (u.protocol === "http:" ? http : https).request({ hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search, method,
      headers: { ...headers, ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}) } }, (res) => {
      let txt = ""; res.on("data", c => txt += c); res.on("end", () => { let j = null; try { j = txt ? JSON.parse(txt) : null; } catch { j = txt; } resolve({ status: res.statusCode, ok: res.statusCode < 300, data: j }); });
    });
    req.on("error", reject); req.setTimeout(20000, () => req.destroy(new Error("timeout"))); if (data) req.write(data); req.end();
  });
}

module.exports = function registerSupportRoutes(app, opts = {}) {
  const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
  const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || "";
  // Must match how server.js hashes passwords at sign-up and sign-in (server.js passes its own hashPw).
  const hashPassword = opts.hashPassword || ((pw) => crypto.createHash("sha256").update(pw + "ecoscope_salt_2024").digest("hex"));
  const sb = async (method, table, query = "", body, prefer = "return=representation") => {
    const r = await requestJSON(`${SUPABASE_URL}/rest/v1/${table}${query}`, { method, body,
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: prefer, "X-Supabase-Api-Version": "2024-01-01" } });
    if (!r.ok) throw new Error((r.data && (r.data.message || r.data.error)) || `Supabase ${r.status}`);
    return r.data;
  };
  const enc = encodeURIComponent;
  const clean = (s, n) => String(s ?? "").trim().slice(0, n);
  const fail = (res, e, code = 500) => { console.error("[support]", e?.message || e); res.status(code).json({ error: typeof e === "string" ? e : "Server error. Please try again." }); };

  // ── Password change ──
  // Verifies the current password, saves the new hash, then confirms by signing in through this
  // server's own /api/auth/login. If that check fails the old hash is restored, so a mismatch in
  // hashing can never lock a user out.
  const selfLogin = async (username, password) => {
    if (opts.hashPassword) return null; // server supplied its own hash function, so no round-trip is needed
    try { const r = await requestJSON(`http://127.0.0.1:${process.env.PORT || 3001}/api/auth/login`, { method: "POST", body: { username, password } }); return r.ok; }
    catch { return null; } // login route unreachable: fall back to the hash check
  };
  app.post("/api/auth/change-password", async (req, res) => {
    try {
      const { username, currentPassword, newPassword } = req.body || {};
      if (!username || !currentPassword || !newPassword) return fail(res, "Missing fields.", 400);
      const pw = String(newPassword);
      if (pw.length < 8 || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw) || !/[^A-Za-z0-9]/.test(pw))
        return fail(res, "New password must have 8+ characters, an uppercase letter, a number and a symbol.", 400);
      if (pw === String(currentPassword)) return fail(res, "New password must differ from the current one.", 400);
      const rows = await sb("GET", "ecoscope_users", `?username=eq.${enc(username)}&select=username,password_hash`);
      if (!Array.isArray(rows) || !rows.length) return fail(res, "Account not found.", 404);
      const oldHash = rows[0].password_hash;
      const hashOk = oldHash === hashPassword(String(currentPassword));
      const loginOk = hashOk ? true : await selfLogin(username, String(currentPassword));
      if (!hashOk && !loginOk) return fail(res, "Current password is incorrect.", 401);
      if (!hashOk && loginOk) return fail(res, "Password change is not set up to match this server's password hashing. Please contact support.", 500);
      await sb("PATCH", "ecoscope_users", `?username=eq.${enc(username)}`, { password_hash: hashPassword(pw) }, "return=minimal");
      const verified = await selfLogin(username, pw);
      if (verified === false) { await sb("PATCH", "ecoscope_users", `?username=eq.${enc(username)}`, { password_hash: oldHash }, "return=minimal");
        return fail(res, "Password could not be verified after saving, so it was not changed. Please contact support.", 500); }
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  // ── Support messages ──
  app.get("/api/support/messages", async (req, res) => {
    try {
      const u = clean(req.query.username, 64); if (!u) return fail(res, "username required", 400);
      res.json(await sb("GET", "ecoscope_support_messages", `?username=eq.${enc(u)}&order=created_at.asc&limit=1000`));
    } catch (e) { fail(res, e); }
  });
  app.post("/api/support/messages", async (req, res) => {
    try {
      const b = req.body || {};
      const sender = ["user", "admin", "bot"].includes(b.sender) ? b.sender : "user";
      const row = {
        username: clean(b.username, 64), email: clean(b.email, 200) || null, sender,
        channel: b.channel === "assistant" ? "assistant" : "support", category: clean(b.category, 32) || null,
        body: clean(b.body, 4000), admin: sender === "admin" ? clean(b.admin, 64) || "admin" : null,
        read_by_admin: sender === "admin" || b.channel === "assistant", read_by_user: sender !== "admin",
      };
      if (!row.username || !row.body) return fail(res, "Message is empty.", 400);
      const out = await sb("POST", "ecoscope_support_messages", "", row);
      if (row.channel === "support") await sb("POST", "ecoscope_support_threads", "?on_conflict=username", { username: row.username, status: "open", updated_at: new Date().toISOString() }, "resolution=merge-duplicates,return=minimal").catch(() => {});
      res.json(Array.isArray(out) ? out[0] : out);
    } catch (e) { fail(res, e); }
  });
  app.post("/api/support/read", async (req, res) => {
    try {
      const { username, reader } = req.body || {}; if (!username) return fail(res, "username required", 400);
      const patch = reader === "admin" ? { read_by_admin: true } : { read_by_user: true };
      await sb("PATCH", "ecoscope_support_messages", `?username=eq.${enc(username)}`, patch, "return=minimal");
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });
  app.post("/api/support/status", async (req, res) => {
    try {
      const { username, status } = req.body || {}; if (!username) return fail(res, "username required", 400);
      await sb("POST", "ecoscope_support_threads", "?on_conflict=username", { username, status: status === "resolved" ? "resolved" : "open", updated_at: new Date().toISOString() }, "resolution=merge-duplicates,return=minimal");
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });
  // One row per user: last message, counts, unread, status
  app.get("/api/support/threads", async (req, res) => {
    try {
      const msgs = await sb("GET", "ecoscope_support_messages", "?select=username,email,sender,channel,body,created_at,read_by_admin&order=created_at.asc&limit=20000");
      const st = await sb("GET", "ecoscope_support_threads", "?select=username,status").catch(() => []);
      const status = Object.fromEntries((st || []).map(t => [t.username, t.status]));
      const by = {};
      (msgs || []).forEach(m => {
        const t = by[m.username] || (by[m.username] = { username: m.username, email: null, count: 0, unread: 0, first_at: m.created_at, support: 0 });
        if (m.email) t.email = m.email; t.count++; if (m.channel === "support") t.support++;
        t.last_at = m.created_at; if (m.channel === "support" || !t.support) { t.last_body = m.body; t.last_sender = m.sender; }
        if (m.sender === "user" && m.channel === "support" && !m.read_by_admin) t.unread++;
      });
      res.json(Object.values(by).map(t => ({ ...t, status: status[t.username] || "open" })).sort((a, b) => String(b.last_at).localeCompare(String(a.last_at))));
    } catch (e) { fail(res, e); }
  });

  // ── Help assistant: answers usability questions, grounded in the app guide ──
  const GUIDE = `You are the in-app help assistant for EcoScope, a web app for economic data and causal analysis.
Answer only questions about using EcoScope, its data sources and its statistical methods. Be brief (under 120 words), concrete and friendly. Use plain text, no markdown headings.
If a question is about an account problem, billing, a bug or anything you cannot resolve, tell the user to switch to the Support tab in this chat to message the team.
Never invent features. Key facts:
- Sidebar: choose data level (macro/micro), source, variables (click to add to the basket, up to 4 on Free, 10 on Pro), country, years. Import your data (CSV) at the top.
- Sources: World Bank and most others via the World Bank API; IMF (8 series mapped to World Bank); WHO; FRED (US only, needs an API key); Yahoo market data. Pro-only sources show a lock.
- Analysis tabs under the variable list: Transform (log, difference, % change, moving averages, z-score, min-max, cumulative), Impute (linear, forward, backward, mean), Composite index, Frequency (quarterly/monthly are interpolated for annual sources), Dag (causal graph builder with auto-discover).
- Chart toolbar: Area/Line/Bar/Stats/Distribution, Animate, Table, Impact Lab, Refresh, Export (CSV, Excel, PDF; Excel/PDF need Pro), Snapshot (PNG/SVG).
- Built-in "Analyze Data": trend, CAGR, outliers (|z|>2.5), volatility, structural-break screen. "Deep Analysis" uses Claude and needs Pro.
- Impact Lab tabs: Data structure (detect cross-section, time series or panel; reshape; send to an analysis), Matching (NN matching with Abadie-Imbens SEs, PS matching with the 2016 estimated-score correction, IPW with bootstrap or sandwich SEs, AIPW, CEM, subclassification; multiple imputation for missing covariates; balance, overlap, robustness value), DiD & event study (Callaway-Sant'Anna, imputation estimator, TWFE, Bacon decomposition, event study with uniform bands, parallel-trend sensitivity), Synthetic control (World Bank, your selection or your own panel; cross-validated V, placebo p-value, leave-one-out, backdating, convex-hull check, synthetic DiD and penalized SC comparison), Many controls (post-double-selection lasso, double/debiased ML with lasso or random forest), Methods guide.
- DAG tab: draw the graph or auto-discover (ADF stationarity, PC algorithm, Granger orientation); shows minimal adjustment sets, bad controls, front-door, and tests of the graph's implications.
- Settings: Account, Password & security (change password), Data defaults, Data sources, Appearance (5 themes), Subscription (request upgrade), Support, Help.`;
  app.post("/api/support/assistant", async (req, res) => {
    try {
      if (!ANTHROPIC_KEY) return fail(res, "Assistant not configured.", 404);
      const q = clean(req.body?.question, 1500); if (!q) return fail(res, "Empty question.", 400);
      const hist = Array.isArray(req.body?.history) ? req.body.history.slice(-8).filter(m => m && m.content).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: clean(m.content, 1500) })) : [];
      // the API needs alternating roles starting with "user"
      const msgs = []; [...hist, { role: "user", content: q }].forEach(m => { if (!msgs.length && m.role !== "user") return; if (msgs.length && msgs[msgs.length - 1].role === m.role) msgs[msgs.length - 1].content += "\n" + m.content; else msgs.push(m); });
      const r = await requestJSON("https://api.anthropic.com/v1/messages", { method: "POST",
        headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
        body: { model: process.env.ASSISTANT_MODEL || "claude-haiku-4-5-20251001", max_tokens: 400, system: GUIDE, messages: msgs } });
      const j = r.data || {};
      if (!r.ok) return fail(res, j?.error?.message || "Assistant unavailable.", 502);
      res.json({ answer: (j.content || []).map(c => c.text || "").join("").trim() });
    } catch (e) { fail(res, e); }
  });
};
