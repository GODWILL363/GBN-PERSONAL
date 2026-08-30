const express = require("express");
const https   = require("https");
const http    = require("http");
const crypto  = require("crypto");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 3001;

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || "";

app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

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

// Register
app.post("/api/auth/register", async (req, res) => {
  const { username, email, password, country = "GH" } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: "All fields required" });
  try {
    // Check existing
    const existing = await sbFetch("GET", "ecoscope_users", null, `?username=eq.${encodeURIComponent(username)}&select=id`);
    if (Array.isArray(existing) && existing.length > 0) return res.status(409).json({ error: "Username already taken." });
    const existingEmail = await sbFetch("GET", "ecoscope_users", null, `?email=eq.${encodeURIComponent(email)}&select=id`);
    if (Array.isArray(existingEmail) && existingEmail.length > 0) return res.status(409).json({ error: "Email already registered." });

    const user = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      username, email,
      password_hash: hashPw(password),
      role: "user", plan: "free", plan_status: "active",
      country, settings: {},
      created_at: new Date().toISOString(),
    };
    const created = await sbFetch("POST", "ecoscope_users", user);
    await logActivity(username, "Registered", `New account · Free plan`, req.ip);
    res.json({ user: Array.isArray(created) ? created[0] : created });
  } catch (e) {
    console.error("Register error:", e);
    res.status(500).json({ error: "Registration failed: " + e.message });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  try {
    const users = await sbFetch("GET", "ecoscope_users", null, `?username=eq.${encodeURIComponent(username)}&select=*`);
    console.log(`[LOGIN] user="${username}" supabase_result=${JSON.stringify(users).substring(0,120)}`);
    if (!Array.isArray(users) || users.length === 0) return res.status(401).json({ error: "Username not found. Please create an account." });
    const user = users[0];
    console.log(`[LOGIN] found user=${user.username} hash_prefix=${user.password_hash?.substring(0,10)}`);

    // Fix bootstrap admin
    if (user.password_hash === "bootstrap") {
      if (username === "admin" && password === "Admin@2024!") {
        await sbFetch("PATCH", "ecoscope_users", { password_hash: hashPw(password) }, `?id=eq.${user.id}`);
      } else {
        return res.status(401).json({ error: "Incorrect password." });
      }
    } else if (user.password_hash !== hashPw(password)) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    if (user.plan_status === "suspended") return res.status(403).json({ error: "Account suspended. Contact support@ecoscope.app" });

    // Update last login
    await sbFetch("PATCH", "ecoscope_users", { last_login: new Date().toISOString() }, `?id=eq.${user.id}`);
    await logActivity(username, "Login", `Signed in · Plan: ${user.plan}`, req.ip);
    const { password_hash, ...safeUser } = user;
    res.json({ user: { ...safeUser, last_login: new Date().toISOString() } });
  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({ error: "Login failed: " + e.message });
  }
});

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
  const { email, role = "user" } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });
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
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok", version: "2.0",
    supabase: !!SUPABASE_URL,
    anthropic: !!ANTHROPIC_KEY,
    ts: new Date().toISOString()
  });
});

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
