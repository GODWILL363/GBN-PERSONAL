const express = require("express");
const https   = require("https");
const http    = require("http");
const crypto  = require("crypto");
const path    = require("path");

const app  = express();
app.set("trust proxy", 1); // Railway sits behind one proxy: real visitor addresses in logs
const PORT = process.env.PORT || 3001;

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || "";

const jsonSmall = express.json({ limit: "2mb" }), jsonBig = express.json({ limit: "25mb" });
app.use((req, res, next) => (req.path.startsWith("/api/projects") || req.path.startsWith("/api/admin/library") ? jsonBig : jsonSmall)(req, res, next)); // projects and Vault datasets carry tables
// security headers on every response; the Content-Security-Policy is report-only for now, so it cannot break the app
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (req.secure || req.headers["x-forwarded-proto"] === "https") res.setHeader("Strict-Transport-Security", "max-age=15552000");
  if (!req.path.startsWith("/api/")) res.setHeader("Content-Security-Policy-Report-Only", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https:; frame-ancestors 'self'; base-uri 'self'; object-src 'none'");
  next();
});
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ════════════════════════════════════════════════════════════════════════════
// SIGNED SESSIONS · ROUTE PROTECTION · PROJECTS  (see auth_projects.js)
// Must stay above every /api route.
// ════════════════════════════════════════════════════════════════════════════
require("./auth_projects")(app, { sbFetch });
require("./library_routes")(app, { sbFetch }); // Data Vault: admin-published datasets for chosen plans and users
// AI runs only on the server's key: never store personal Anthropic keys in user settings
app.use("/api/users", (req, res, next) => { if (req.method === "PATCH" && req.body && req.body.settings && typeof req.body.settings === "object") delete req.body.settings.anthropicKey; next(); });
// The IESGI platform (open data, public API, citations, partners) is a separate app on the same database: set IESGI_URL to link to it.

// ── Supabase helper ──────────────────────────────────────────────────────────
function sbFetch(method, table, body, query = "") {
  return new Promise((resolve, reject) => {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      reject(new Error("Supabase not configured"));
      return;
    }
    const bodyStr = body ? JSON.stringify(body) : null;
    const urlObj  = new URL(`${SUPABASE_URL}/rest/v1/${table}${query}`);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
        "X-Supabase-Api-Version": "2024-01-01",
      },
    };
    if (bodyStr) options.headers["Content-Length"] = Buffer.byteLength(bodyStr);

    const req = https.request(options, (res2) => {
      let data = "";
      res2.on("data", c => data += c);
      res2.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Test Supabase connection on startup
async function testSupabase() {
  try {
    const result = await sbFetch("GET", "ecoscope_users", null, "?select=count&limit=1");
    if (result && !result.message) {
      console.log("  Supabase DB: ✓ connected");
    } else {
      console.log("  Supabase DB: ✗ error —", JSON.stringify(result).substring(0,100));
    }
  } catch(e) {
    console.log("  Supabase DB: ✗ exception —", e.message);
  }
}

// ── Password hashing ─────────────────────────────────────────────────────────
function hashPw(pw) {
  return crypto.createHash("sha256").update(pw + "ecoscope_salt_2024").digest("hex");
}

// ── Logging helper ───────────────────────────────────────────────────────────
async function logActivity(username, action, detail, ip = "") {
  try {
    await sbFetch("POST", "ecoscope_activity", { username, action, detail, ip, ts: new Date().toISOString() });
  } catch (e) { console.error("Log error:", e.message); }
}

// ════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ════════════════════════════════════════════════════════════════════════════

// Register and login live in auth_projects.js (scrypt passwords, signed sessions).

// ════════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT ROUTES
// ════════════════════════════════════════════════════════════════════════════

// Get all users (admin)
app.get("/api/users", async (req, res) => {
  try {
    const users = await sbFetch("GET", "ecoscope_users", null, "?select=id,username,email,role,plan,plan_status,country,created_at,last_login&order=created_at.desc");
    res.json(users || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update user
app.patch("/api/users/:username", async (req, res) => {
  const { username } = req.params;
  const updates = req.body;
  delete updates.password_hash;
  try {
    const updated = await sbFetch("PATCH", "ecoscope_users", updates, `?username=eq.${encodeURIComponent(username)}`);
    await logActivity("admin", "User Updated", `${username}: ${Object.keys(updates).join(", ")} changed`);
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete user
app.delete("/api/users/:username", async (req, res) => {
  const { username } = req.params;
  if (username === "admin") return res.status(403).json({ error: "Cannot delete admin" });
  try {
    await sbFetch("DELETE", "ecoscope_users", null, `?username=eq.${encodeURIComponent(username)}`);
    await logActivity("admin", "User Deleted", `${username} removed`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Invite user
app.post("/api/users/invite", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase(); const role = req.body?.role === "admin" ? "admin" : "user";
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: "A valid email is required" });
  try {
    const existing = await sbFetch("GET", "ecoscope_users", null, `?email=eq.${encodeURIComponent(email)}&select=id`);
    if (Array.isArray(existing) && existing.length > 0) return res.status(409).json({ error: "Email already registered" });
    const token = crypto.randomBytes(20).toString("hex");
    const user = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      username: "invited_" + token.slice(0, 6),
      email, password_hash: "invite_" + token,
      role, plan: "free", plan_status: "invited",
      country: "GH", settings: {},
      created_at: new Date().toISOString(),
      invite_token: token,
    };
    const created = await sbFetch("POST", "ecoscope_users", user);
    await logActivity("admin", "Invite Sent", `${email} invited as ${role}`);
    res.json({ user: Array.isArray(created) ? created[0] : created, token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Set plan
app.post("/api/users/:username/plan", async (req, res) => {
  const { username } = req.params;
  const { plan, plan_status = "active" } = req.body;
  try {
    await sbFetch("PATCH", "ecoscope_users", { plan, plan_status }, `?username=eq.${encodeURIComponent(username)}`);
    await logActivity("admin", "Plan Changed", `${username} → ${plan} (${plan_status})`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// ACTIVITY LOG
// ════════════════════════════════════════════════════════════════════════════
app.get("/api/activity", async (req, res) => {
  try {
    const log = await sbFetch("GET", "ecoscope_activity", null, "?order=ts.desc&limit=200");
    res.json(log || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/activity", async (req, res) => {
  const { username, action, detail } = req.body;
  try {
    await logActivity(username, action, detail, req.ip);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// PLAN REQUESTS
// ════════════════════════════════════════════════════════════════════════════
app.get("/api/requests", async (req, res) => {
  try {
    const reqs = await sbFetch("GET", "ecoscope_requests", null, "?order=ts.desc");
    res.json(reqs || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/requests", async (req, res) => {
  const { username, email, currentPlan, requestedPlan, message } = req.body;
  try {
    const existing = await sbFetch("GET", "ecoscope_requests", null, `?username=eq.${encodeURIComponent(username)}&status=eq.pending&select=id`);
    if (Array.isArray(existing) && existing.length > 0) return res.status(409).json({ error: "You already have a pending request." });
    const req2 = {
      id: Date.now().toString(36),
      username, email,
      current_plan: currentPlan,
      requested_plan: requestedPlan,
      message, status: "pending",
      ts: new Date().toISOString(),
    };
    const created = await sbFetch("POST", "ecoscope_requests", req2);
    await logActivity(username, "Plan Request", `Requested ${currentPlan} → ${requestedPlan}`);
    res.json(Array.isArray(created) ? created[0] : created);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/requests/:id", async (req, res) => {
  const { id } = req.params;
  const { status, adminNote } = req.body;
  try {
    const reqs = await sbFetch("GET", "ecoscope_requests", null, `?id=eq.${id}&select=*`);
    if (!Array.isArray(reqs) || reqs.length === 0) return res.status(404).json({ error: "Request not found" });
    const r = reqs[0];
    await sbFetch("PATCH", "ecoscope_requests", { status, admin_note: adminNote, resolved_at: new Date().toISOString() }, `?id=eq.${id}`);
    if (status === "approved") {
      await sbFetch("PATCH", "ecoscope_users", { plan: r.requested_plan, plan_status: "active" }, `?username=eq.${encodeURIComponent(r.username)}`);
    }
    await logActivity("admin", `Request ${status}`, `${r.username}: ${r.current_plan}→${r.requested_plan}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// AI INSIGHT PROXY
// ════════════════════════════════════════════════════════════════════════════
app.post("/api/insight", (req, res) => {
  const apiKey = ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: { message: "ANTHROPIC_KEY not configured." } });
  const { country, indicator, source, startYear, endYear, dataPoints } = req.body;
  const body = JSON.stringify({
    model: "claude-sonnet-4-5", max_tokens: 1000,
    messages: [{ role: "user", content: `Analyze "${indicator}" for ${country} from ${source} (${startYear}–${endYear}). Data: ${dataPoints}. Write 3 paragraphs: 1) Key trend 2) Context 3) Outlook. Max 220 words, data-driven.` }]
  });
  const options = {
    hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Length": Buffer.byteLength(body) }
  };
  const proxyReq = https.request(options, (proxyRes) => {
    let data = "";
    proxyRes.on("data", c => data += c);
    proxyRes.on("end", () => { try { res.status(proxyRes.statusCode).json(JSON.parse(data)); } catch { res.status(500).json({ error: { message: "Parse error" } }); } });
  });
  proxyReq.on("error", err => res.status(500).json({ error: { message: err.message } }));
  proxyReq.write(body);
  proxyReq.end();
});

// ════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// DATA PROXY — routes external economic data API calls through the server so
// the browser never talks cross-origin directly (avoids CORS failures from
// third-party providers like World Bank, IMF, FRED, WHO).
// ════════════════════════════════════════════════════════════════════════════
const PROXY_ALLOWED_HOSTS = new Set([
  "api.worldbank.org",
  "www.imf.org",
  "api.stlouisfed.org",
  "ghoapi.azureedge.net",
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
]);

function proxyGet(target, res, redirectsLeft, attempt) {
  let urlObj;
  try { urlObj = new URL(target); } catch { return res.status(400).json({ error: "Invalid URL" }); }
  if (!PROXY_ALLOWED_HOSTS.has(urlObj.hostname)) {
    return res.status(403).json({ error: `Host not allowed: ${urlObj.hostname}` });
  }
  const client = urlObj.protocol === "http:" ? http : https;
  let settled = false;
  const options = {
    hostname: urlObj.hostname,
    path: urlObj.pathname + urlObj.search,
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; EcoScope/2.0)",
      "Accept": "application/json",
      "Connection": "close",
    },
    // Prefer IPv4 — some data-center IPv6 routes to World Bank hang
    family: 4,
  };
  const upstreamReq = client.request(options, (upstreamRes) => {
    const status = upstreamRes.statusCode || 200;
    if ([301,302,303,307,308].includes(status) && upstreamRes.headers.location && redirectsLeft > 0) {
      upstreamRes.resume();
      const next = new URL(upstreamRes.headers.location, urlObj).toString();
      return proxyGet(next, res, redirectsLeft - 1, attempt);
    }
    let data = "";
    upstreamRes.on("data", c => data += c);
    upstreamRes.on("end", () => {
      if (settled) return;
      settled = true;
      res.setHeader("Content-Type", "application/json");
      res.status(status).send(data);
    });
  });
  const failOrRetry = (msg) => {
    if (settled) return;
    settled = true;
    if (attempt < 4) {
      const backoff = 400 * attempt;
      return setTimeout(()=>proxyGet(target, res, 5, attempt + 1), backoff);
    }
    console.error("[proxy-data] failed:", target, msg);
    res.status(502).json({ error: "Upstream fetch failed", detail: msg });
  };
  upstreamReq.on("error", (e) => failOrRetry(e.message));
  upstreamReq.setTimeout(12000, () => { upstreamReq.destroy(new Error("timeout")); });
  upstreamReq.end();
}

// the data proxy is public (charts load before sign-in), so limit each address to 600 requests a minute (country comparisons fire many requests at once)
const PROXY_HITS = new Map();
app.get("/api/proxy-data", (req, res, next) => { const now = Date.now(); let b = PROXY_HITS.get(req.ip); if (!b || now - b.t >= 60000) { b = { t: now, n: 0 }; PROXY_HITS.set(req.ip, b); }
  if (PROXY_HITS.size > 20000) for (const [k, v] of PROXY_HITS) if (now - v.t >= 60000) PROXY_HITS.delete(k);
  if (++b.n > 600) { res.setHeader("Retry-After", Math.ceil((60000 - (now - b.t)) / 1000)); return res.status(429).json({ error: "Too many data requests. Please wait a minute." }); } next(); });
app.get("/api/proxy-data", (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: "Missing url parameter" });
  proxyGet(target, res, 5, 1);
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok", version: "2.0",
    supabase: !!SUPABASE_URL,
    anthropic: !!ANTHROPIC_KEY,
    iesgi_url: process.env.IESGI_URL || null,
    ts: new Date().toISOString()
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PASSWORD CHANGE · SUPPORT CHAT · HELP ASSISTANT  (see support_routes.js)
// Must stay above the React catch-all route below.
// ════════════════════════════════════════════════════════════════════════════
require("./support_routes")(app, { hashPassword: hashPw });

// ════════════════════════════════════════════════════════════════════════════
// SERVE REACT BUILD
// ════════════════════════════════════════════════════════════════════════════
const BUILD_DIR = path.join(__dirname, "build");
app.use(express.static(BUILD_DIR));
app.get("*", (req, res) => res.sendFile(path.join(BUILD_DIR, "index.html")));

app.listen(PORT, () => {
  console.log(`✓ EcoScope server running on port ${PORT}`);
  testSupabase();
  console.log(`  Supabase:  ${SUPABASE_URL ? "✓ configured" : "✗ missing — users won't persist cross-device"}`);
  console.log(`  Anthropic: ${ANTHROPIC_KEY ? "✓ configured" : "✗ missing"}`);
});
