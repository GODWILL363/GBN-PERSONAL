// auth_projects.js  —  EcoScope: signed sessions, route protection, projects and project history
// Usage in server.js, right after the CORS middleware and BEFORE any route:
//   require("./auth_projects")(app, { sbFetch });
// Needs: SUPABASE_URL, SUPABASE_KEY (already set). Optional: SESSION_SECRET (a long random string), ADMIN_BOOTSTRAP_PASSWORD (only for a fresh database),
// INSIGHT_MODEL (default claude-sonnet-4-5). Also handles sign-up, sign-in, account update/delete and the AI insight route.
// Run supabase_projects.sql once in Supabase → SQL Editor before deploying.

const crypto = require("crypto");
const express = require("express");

module.exports = function registerAuthProjects(app, { sbFetch, mail }) {
  const MAIL = mail || require("./mailer")();
  const SECRET = process.env.SESSION_SECRET || crypto.createHash("sha256").update((process.env.SUPABASE_KEY || "dev") + "|ecoscope-session-v1").digest("hex");
  const TTL_DAYS = 30;
  const b64 = (s) => Buffer.from(s).toString("base64url");
  const sign = (payload) => { const body = b64(JSON.stringify(payload)); const mac = crypto.createHmac("sha256", SECRET).update(body).digest("base64url"); return `${body}.${mac}`; };
  const verify = (token) => {
    if (!token || typeof token !== "string" || !token.includes(".")) return null;
    const [body, mac] = token.split(".");
    const good = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
    if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
    try { const p = JSON.parse(Buffer.from(body, "base64url").toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
  };
  const issue = (user) => sign({ u: user.username, r: user.role || (user.username === "admin" ? "admin" : "user"), exp: Date.now() + TTL_DAYS * 864e5 });

  // ── 1. Attach a token to successful sign-in / registration responses ──
  app.use((req, res, next) => {
    if (req.method === "POST" && (req.path === "/api/auth/login" || req.path === "/api/auth/register" || req.path === "/api/auth/accept-invite" || req.path === "/api/auth/reset")) {
      const json = res.json.bind(res);
      res.json = (body) => { if (res.statusCode < 300 && body && body.user && body.user.username) body.token = issue(body.user); return json(body); };
    }
    next();
  });

  // ── 1b. Never send password hashes back to the browser (older routes return whole user rows) ──
  const scrub = (x) => { if (Array.isArray(x)) return x.map(y => (y && typeof y === "object" && !Array.isArray(y)) ? scrub1(y) : y); return (x && typeof x === "object") ? scrub1(x) : x; };
  const scrub1 = (o) => { if (!("password_hash" in o) && !(o.user && typeof o.user === "object" && "password_hash" in o.user)) return o; const { password_hash, ...rest } = o; if (rest.user && typeof rest.user === "object") { const { password_hash: _p, ...u } = rest.user; rest.user = u; } return rest; };
  app.use("/api", (req, res, next) => { const json = res.json.bind(res); res.json = (body) => json(scrub(body)); next(); });

  // ── 2. Who is calling? The token proves identity; role and status are re-read from the database (cached 60 s),
  //       so a demoted admin, a suspended or a deleted account loses access within a minute, not after 30 days ──
  const LIVE = new Map(); const LIVE_TTL = 60000;
  const liveUser = async (username) => { const hit = LIVE.get(username); if (hit && Date.now() - hit.t < LIVE_TTL) return hit.u;
    const r = await sbFetch("GET", "ecoscope_users", null, `?username=eq.${encodeURIComponent(username)}&select=username,role,plan_status`);
    if (!Array.isArray(r)) throw new Error("user store unavailable"); const u = r[0] || null;
    LIVE.set(username, { t: Date.now(), u }); if (LIVE.size > 5000) LIVE.delete(LIVE.keys().next().value); return u; };
  app.use(async (req, res, next) => {
    const h = req.headers.authorization || ""; const t = h.startsWith("Bearer ") ? h.slice(7) : null; const p = verify(t); req.auth = null;
    if (p) { try { const u = await liveUser(p.u); if (u && u.plan_status !== "suspended") { const role = u.role || (u.username === "admin" ? "admin" : "user"); req.auth = { username: u.username, role, admin: role === "admin" }; } }
      catch (e) { console.error("[auth] live check:", e.message); req.auth = { username: p.u, role: p.r, admin: p.r === "admin" }; } } // database unreachable: fall back to the signed token
    next();
  });
  const forgetUser = (username) => LIVE.delete(username);

  // ── 3. Route rules ──
  const PUBLIC = [["POST", /^\/api\/auth\/(login|register|accept-invite|forgot|reset)$/], ["GET", /^\/api\/auth\/(invite\/[a-f0-9]{40}|reset\/[a-f0-9]{64})$/], ["GET", /^\/api\/health$/], ["GET", /^\/api\/proxy-data$/]];
  const ADMIN = [["GET", /^\/api\/users$/], ["DELETE", /^\/api\/users\/[^/]+$/], ["POST", /^\/api\/users\/invite$/], ["POST", /^\/api\/users\/[^/]+\/plan$/],
                 ["GET", /^\/api\/activity$/], ["GET", /^\/api\/requests$/], ["PATCH", /^\/api\/requests\/[^/]+$/], ["GET", /^\/api\/support\/threads$/], ["POST", /^\/api\/support\/status$/]];
  const deny = (res, code, msg, kind) => res.status(code).json({ error: msg, code: kind });
  app.use("/api", async (req, res, next) => {
    const full = "/api" + req.path; const m = req.method;
    if (m === "OPTIONS" || PUBLIC.some(([mm, re]) => mm === m && re.test(full))) return next();
    if (!req.auth) return deny(res, 401, "Please sign in again.", "auth_required");
    if (ADMIN.some(([mm, re]) => mm === m && re.test(full)) && !req.auth.admin) return deny(res, 403, "Administrator access only.", "forbidden");
    const me = req.auth.username;
    // an admin changing someone's role, plan or status takes effect at once
    { const mm = full.match(/^\/api\/users\/([^/]+)(\/plan)?$/); if (mm && m !== "GET" && mm[1] !== "invite") forgetUser(decodeURIComponent(mm[1])); }
    // a user may only act on their own account and messages; admins on anyone's
    if (!req.auth.admin) {
      const self = (name) => !name || String(name) === me;
      if (m === "PATCH" && /^\/api\/users\/[^/]+$/.test(full)) {
        if (!self(decodeURIComponent(full.split("/").pop()))) return deny(res, 403, "You can only change your own account.", "forbidden");
        if (req.body) Object.keys(req.body).forEach(k => { if (!["email", "country", "settings"].includes(k)) delete req.body[k]; });
        if (req.body && req.body.email !== undefined) return deny(res, 400, "Change your email in Settings → Account.", "bad_request");
        // settings saved by the app must not wipe the profile kept by /api/account
        if (req.body && req.body.settings && typeof req.body.settings === "object") { try { const cur = await sbFetch("GET", "ecoscope_users", null, `?username=eq.${encodeURIComponent(me)}&select=settings`); const prof = Array.isArray(cur) && cur[0] && cur[0].settings ? cur[0].settings.profile : null; if (prof) req.body.settings = { ...req.body.settings, profile: prof }; } catch (e) { console.error("[account] merge settings:", e.message); } }
      }
      if (/^\/api\/support\/messages$/.test(full)) {
        if (m === "GET" && !self(req.query.username)) return deny(res, 403, "Not your conversation.", "forbidden");
        if (m === "POST") { if (!self(req.body?.username)) return deny(res, 403, "Not your conversation.", "forbidden");
          // the help assistant's replies are saved by the app as "bot" in the assistant channel only; the support chat is always the user
          if (req.body?.sender === "admin" || (req.body?.sender === "bot" && req.body?.channel !== "assistant")) req.body.sender = "user"; }
      }
      if (m === "POST" && /^\/api\/support\/read$/.test(full) && (!self(req.body?.username) || req.body?.reader === "admin")) return deny(res, 403, "Not your conversation.", "forbidden");
      if (m === "POST" && /^\/api\/auth\/change-password$/.test(full) && !self(req.body?.username)) return deny(res, 403, "You can only change your own password.", "forbidden");
      if (m === "POST" && /^\/api\/(requests|activity)$/.test(full) && req.body) { req.body.username = me;
        if (full === "/api/activity") { req.body.action = String(req.body.action || "").slice(0, 80); req.body.detail = String(req.body.detail || "").slice(0, 300); } }
    }
    next();
  });

  // ══════════════════════════════════════════════════════════════════════
  // ACCOUNTS: sign-up, sign-in, update and delete (these take over the older routes in server.js)
  // Passwords are stored with scrypt and a per-user salt: "scrypt$<salt>$<hash>". Older SHA-256 hashes still work
  // and are upgraded to scrypt the next time that person signs in.
  // ══════════════════════════════════════════════════════════════════════
  const scryptA = (pw, salt, len) => new Promise((ok, no) => crypto.scrypt(pw, salt, len, { N: 16384, r: 8, p: 1 }, (e, k) => e ? no(e) : ok(k)));
  const LEGACY = (pw) => crypto.createHash("sha256").update(pw + "ecoscope_salt_2024").digest("hex");
  const hashPw = async (pw) => { const salt = crypto.randomBytes(16); const h = await scryptA(String(pw), salt, 32); return `scrypt$${salt.toString("base64")}$${h.toString("base64")}`; };
  const checkPw = async (pw, stored) => { stored = String(stored || ""); if (stored.startsWith("scrypt$")) { const [, sb, hb] = stored.split("$"); try { const want = Buffer.from(hb, "base64"); const got = await scryptA(String(pw), Buffer.from(sb, "base64"), want.length); return { ok: crypto.timingSafeEqual(want, got) }; } catch { return { ok: false }; } }
    if (!/^[0-9a-f]{64}$/.test(stored)) return { ok: false }; const a = Buffer.from(LEGACY(String(pw))), b = Buffer.from(stored); return { ok: a.length === b.length && crypto.timingSafeEqual(a, b), legacy: true }; };
  const strong = (pw) => { pw = String(pw || ""); return pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw); };
  const PW_RULE = "Password needs 8+ characters, an uppercase letter, a number and a symbol.";
  const okEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(String(e || ""));
  const logAct = async (username, action, detail, ip = "") => { try { await sbFetch("POST", "ecoscope_activity", { username, action, detail, ip, ts: new Date().toISOString() }); } catch (e) { console.error("[account] log:", e.message); } };
  const USER_COLS = "id,username,email,role,plan,plan_status,country,settings,created_at,last_login";
  const one = async (q) => { const r = await sbFetch("GET", "ecoscope_users", null, q); return Array.isArray(r) && r[0] ? r[0] : null; };

  app.post("/api/auth/register", async (req, res) => {
    try { const b = req.body || {}; const username = clean(b.username, 40), email = clean(b.email, 254).toLowerCase(), password = String(b.password || ""), country = clean(b.country || "GH", 8);
      if (!username || !email || !password) return res.status(400).json({ error: "All fields required" });
      if (!/^[A-Za-z0-9_.-]{3,40}$/.test(username)) return res.status(400).json({ error: "Username: 3 to 40 letters, numbers, dots, dashes or underscores." });
      if (!okEmail(email)) return res.status(400).json({ error: "Please enter a valid email address." });
      if (!strong(password)) return res.status(400).json({ error: PW_RULE });
      if (await one(`?username=eq.${enc(username)}&select=id`)) return res.status(409).json({ error: "Username already taken." });
      if (await one(`?email=eq.${enc(email)}&select=id`)) return res.status(409).json({ error: "Email already registered." });
      const user = { id: Date.now().toString(36) + crypto.randomBytes(6).toString("hex"), username, email, password_hash: await hashPw(password), role: "user", plan: "free", plan_status: "active", country, settings: {}, created_at: new Date().toISOString() };
      const created = await sbFetch("POST", "ecoscope_users", user); const u = Array.isArray(created) ? created[0] : created; if (!u || !u.username) throw new Error("store refused the new account");
      await logAct(username, "Registered", "New account · Free plan", req.ip); const { password_hash, invite_token, ...safe } = u; res.json({ user: safe });
    } catch (e) { console.error("[account] register:", e.message); res.status(500).json({ error: "Registration failed. Please try again." }); } });

  // ── sign-in guard: 10 failed attempts per username or per address lock that key for 15 minutes ──
  const FAILS = new Map(); const LOCK_N = 10, LOCK_MS = 15 * 60e3;
  const locked = (k) => { const f = FAILS.get(k); return !!f && Date.now() - f.t < LOCK_MS && f.n >= (k.startsWith("i:") ? 30 : LOCK_N); }; // 10 per username, 30 per address (shared connections)
  const failed = (k) => { const f = FAILS.get(k); if (!f || Date.now() - f.t >= LOCK_MS) FAILS.set(k, { t: Date.now(), n: 1 }); else f.n++; if (FAILS.size > 20000) FAILS.clear(); };
  const BAD_LOGIN = "Incorrect username or password.";
  app.post("/api/auth/login", async (req, res) => {
    try { const username = clean(req.body?.username, 254), password = String(req.body?.password || ""); if (!username || !password) return res.status(400).json({ error: "Username and password required" });
      const kU = `u:${username.toLowerCase()}`, kI = `i:${req.ip}`;
      if (locked(kU) || locked(kI)) return res.status(429).json({ error: "Too many failed sign-ins. Please wait 15 minutes, or reset your password." });
      // exact username, then email (any capitalisation), then the username in any capitalisation
      const like = (v) => enc(v.replace(/[%_\\]/g, "\\$&"));
      const user = await one(`?username=eq.${enc(username)}&select=*`)
        || (username.includes("@") ? await one(`?email=ilike.${like(username)}&select=*`) : null)
        || (/^[A-Za-z0-9_.-]+$/.test(username) ? await one(`?username=ilike.${like(username)}&select=*`) : null);
      if (!user) { failed(kU); failed(kI); return res.status(401).json({ error: BAD_LOGIN }); }
      let ok = false, upgrade = false;
      if (user.password_hash === "bootstrap") { const boot = process.env.ADMIN_BOOTSTRAP_PASSWORD; ok = !!boot && user.username === "admin" && password === boot; upgrade = ok; }
      else { const c = await checkPw(password, user.password_hash); ok = c.ok; upgrade = c.ok && c.legacy; }
      if (!ok) { failed(kU); failed(kI); await logAct(user.username, "Login failed", "Wrong password", req.ip); return res.status(401).json({ error: BAD_LOGIN }); }
      FAILS.delete(kU);
      if (user.plan_status === "suspended") return res.status(403).json({ error: "Account suspended. Contact support@ecoscope.app" });
      const now = new Date().toISOString(); await sbFetch("PATCH", "ecoscope_users", { last_login: now, ...(upgrade ? { password_hash: await hashPw(password) } : {}) }, `?id=eq.${enc(user.id)}`);
      await logAct(user.username, "Login", `Signed in · Plan: ${user.plan}`, req.ip);
      const { password_hash, invite_token, ...safe } = user; res.json({ user: { ...safe, last_login: now } });
    } catch (e) { console.error("[account] login:", e.message); res.status(500).json({ error: "Sign-in failed. Please try again." }); } });

  // update my account: email, country, display name, organisation (username and plan cannot change here)
  // ── invitations: an admin creates the account (plan_status "invited"); the person opens /?invite=<token>,
  //    chooses a username and password, and is signed in. Links expire after 14 days and work once. ──
  const INVITE_DAYS = 14;
  const invited = async (token) => { if (!/^[a-f0-9]{40}$/.test(String(token || ""))) return null;
    const u = await one(`?invite_token=eq.${token}&plan_status=eq.invited&select=id,username,email,role,created_at`);
    if (!u || (u.created_at && Date.now() - new Date(u.created_at).getTime() > INVITE_DAYS * 864e5)) return null; return u; };
  app.get("/api/auth/invite/:token", async (req, res) => {
    try { const u = await invited(req.params.token); if (!u) return res.status(404).json({ error: "This invitation link is not valid or has expired. Ask the administrator for a new one." });
      res.json({ email: u.email, role: u.role === "admin" ? "admin" : "user" }); } catch (e) { console.error("[invite] look up:", e.message); res.status(500).json({ error: "Could not check the invitation. Please try again." }); } });
  app.post("/api/auth/accept-invite", async (req, res) => {
    try { const b = req.body || {}; const u = await invited(b.token); if (!u) return res.status(404).json({ error: "This invitation link is not valid or has expired. Ask the administrator for a new one." });
      const username = clean(b.username, 40), password = String(b.password || "");
      if (!/^[A-Za-z0-9_.-]{3,40}$/.test(username)) return res.status(400).json({ error: "Username: 3 to 40 letters, numbers, dots, dashes or underscores." });
      if (!strong(password)) return res.status(400).json({ error: PW_RULE });
      if (await one(`?username=ilike.${enc(username.replace(/[%_\\]/g, "\\$&"))}&select=id`)) return res.status(409).json({ error: "Username already taken." });
      const now = new Date().toISOString();
      const upd = await sbFetch("PATCH", "ecoscope_users", { username, password_hash: await hashPw(password), plan_status: "active", invite_token: null, last_login: now }, `?id=eq.${enc(u.id)}&plan_status=eq.invited`);
      const nu = Array.isArray(upd) ? upd[0] : null; if (!nu) return res.status(409).json({ error: "This invitation was already used." });
      forgetUser(u.username); await logAct(username, "Invitation accepted", `Account set up · ${u.email}`, req.ip);
      // projects shared with this email before the account existed now belong to the chosen username
      try { await sbFetch("PATCH", "ecoscope_project_members", { username }, `?username=eq.${enc(u.username)}`); } catch (e) { console.error("[invite] move memberships:", e.message); }
      const { password_hash, invite_token, ...safe } = nu; res.json({ user: safe });
    } catch (e) { console.error("[invite] accept:", e.message); res.status(500).json({ error: "Could not finish setting up the account. Please try again." }); } });

  // ── invited accounts created by an admin or by someone sharing a project ──
  const createInvited = async (email, role, by) => { const token = crypto.randomBytes(20).toString("hex"); const now = new Date().toISOString();
    const row = { id: Date.now().toString(36) + crypto.randomBytes(5).toString("hex"), username: "invited_" + token.slice(0, 8), email, password_hash: "invite_" + token,
      role: role === "admin" ? "admin" : "user", plan: "free", plan_status: "invited", country: "GH", settings: {}, created_at: now, invite_token: token };
    const out = await sbFetch("POST", "ecoscope_users", row); if (!Array.isArray(out) || !out[0]) throw new Error(`could not create the invited account: ${JSON.stringify(out).slice(0, 160)}`);
    await logAct(by, "Invite created", `${email} (${row.role})`); return row; };
  // a pending invitation is renewed (new link, 14 more days) when it is sent again
  const renewInvite = async (u) => { const token = crypto.randomBytes(20).toString("hex");
    await sbFetch("PATCH", "ecoscope_users", { invite_token: token, password_hash: "invite_" + token, created_at: new Date().toISOString() }, `?id=eq.${enc(u.id)}&plan_status=eq.invited`); return token; };

  // ── forgotten password: an emailed link (one use, 60 minutes) leads to /?reset=<token> ──
  const RESET_MIN = 60; const sha = (x) => crypto.createHash("sha256").update(String(x)).digest("hex");
  const RESETS = new Map(); const resetLimited = (k, n) => { const now = Date.now(); const f = RESETS.get(k); if (!f || now - f.t > 3600e3) { RESETS.set(k, { t: now, n: 1 }); return false; } f.n++; if (RESETS.size > 20000) RESETS.clear(); return f.n > n; };
  const RESET_SENT = "If an account uses that email, a reset link is on its way. Check your inbox and spam folder; the link expires in 60 minutes.";
  app.post("/api/auth/forgot", async (req, res) => {
    try { const who = clean(req.body?.email, 254).toLowerCase(); if (!who) return res.status(400).json({ error: "Enter your email or username." });
      // 3 requests per hour for one email, 10 per address: stops anyone flooding an inbox
      if (resetLimited(`e:${who}`, 3) || resetLimited(`i:${req.ip}`, 10)) return res.json({ ok: true, message: RESET_SENT });
      const like = (v) => enc(v.replace(/[%_\\]/g, "\\$&"));
      let list = await sbFetch("GET", "ecoscope_users", null, who.includes("@") ? `?email=ilike.${like(who)}&select=id,username,email,plan_status` : `?username=ilike.${like(who)}&select=id,username,email,plan_status`);
      list = (Array.isArray(list) ? list : []).filter(u => u.email && u.plan_status !== "invited" && u.plan_status !== "suspended").slice(0, 3);
      for (const u of list) { const token = crypto.randomBytes(32).toString("hex");
        await sbFetch("PATCH", "ecoscope_users", { reset_token_hash: sha(token), reset_expires: new Date(Date.now() + RESET_MIN * 60e3).toISOString() }, `?id=eq.${enc(u.id)}`);
        const r = await MAIL.passwordReset(u.email, u.username, MAIL.link(req, `reset=${token}`), RESET_MIN);
        await logAct(u.username, "Password reset requested", r.sent ? "Reset email sent" : `Reset email not sent (${r.reason})`, req.ip); }
      res.json({ ok: true, message: RESET_SENT });   // the same answer whether or not the account exists
    } catch (e) { console.error("[reset] request:", e.message); res.status(500).json({ error: "Could not send the reset email. Please try again." }); } });
  const resetUser = async (token) => { if (!/^[a-f0-9]{64}$/.test(String(token || ""))) return null;
    const u = await one(`?reset_token_hash=eq.${sha(token)}&select=id,username,email,role,plan,plan_status,reset_expires`);
    if (!u || !u.reset_expires || new Date(u.reset_expires).getTime() < Date.now() || u.plan_status === "suspended") return null; return u; };
  app.get("/api/auth/reset/:token", async (req, res) => {
    try { const u = await resetUser(req.params.token); if (!u) return res.status(404).json({ error: "This reset link is not valid or has expired. Ask for a new one." }); res.json({ username: u.username }); }
    catch (e) { res.status(500).json({ error: "Could not check the link. Please try again." }); } });
  app.post("/api/auth/reset", async (req, res) => {
    try { const u = await resetUser(req.body?.token); if (!u) return res.status(404).json({ error: "This reset link is not valid or has expired. Ask for a new one." });
      const password = String(req.body?.password || ""); if (!strong(password)) return res.status(400).json({ error: PW_RULE });
      const now = new Date().toISOString();
      const upd = await sbFetch("PATCH", "ecoscope_users", { password_hash: await hashPw(password), reset_token_hash: null, reset_expires: null, last_login: now }, `?id=eq.${enc(u.id)}&reset_token_hash=eq.${sha(req.body.token)}`);
      if (!Array.isArray(upd) || !upd[0]) return res.status(409).json({ error: "This reset link was already used." });
      FAILS.delete(`u:${u.username.toLowerCase()}`); if (u.email) FAILS.delete(`u:${u.email.toLowerCase()}`); forgetUser(u.username);
      await logAct(u.username, "Password reset", "New password set from the emailed link", req.ip);
      res.json({ user: { username: u.username, email: u.email, role: u.role, plan: u.plan } });   // signs them in
    } catch (e) { console.error("[reset] set:", e.message); res.status(500).json({ error: "Could not reset the password. Please try again." }); } });

  app.patch("/api/account", async (req, res) => {
    try { const me = req.auth.username; const u = await one(`?username=eq.${enc(me)}&select=${USER_COLS}`); if (!u) return deny(res, 404, "Account not found.", "not_found");
      const b = req.body || {}; const upd = {}; const changed = [];
      if (b.email !== undefined) { const em = clean(b.email, 254).toLowerCase(); if (!okEmail(em)) return deny(res, 400, "Please enter a valid email address.", "bad_request");
        if (em !== String(u.email || "").toLowerCase()) { const other = await one(`?email=eq.${enc(em)}&select=username`); if (other && other.username !== me) return deny(res, 409, "Another account already uses that email.", "conflict"); upd.email = em; changed.push("email"); } }
      if (b.country !== undefined) { const c = clean(b.country, 8).toUpperCase(); if (!/^[A-Z]{2,3}$/.test(c)) return deny(res, 400, "Country must be a 2 or 3 letter code, for example GH.", "bad_request"); if (c !== u.country) { upd.country = c; changed.push("country"); } }
      const prof = { ...((u.settings || {}).profile || {}) }; ["display_name", "organisation", "job_title"].forEach(k => { if (b[k] !== undefined) { const v = clean(b[k], 120); if (v !== (prof[k] || "")) { prof[k] = v; changed.push(k.replace("_", " ")); } } });
      if (changed.some(c => !["email", "country"].includes(c))) upd.settings = { ...(u.settings || {}), profile: prof, ...(prof.display_name ? { displayName: prof.display_name } : {}) };
      if (!changed.length) return res.json({ ok: true, user: u, changed: [] });
      await sbFetch("PATCH", "ecoscope_users", upd, `?username=eq.${enc(me)}`); await logAct(me, "Account updated", changed.join(", "), req.ip);
      res.json({ ok: true, user: { ...u, ...upd }, changed });
    } catch (e) { console.error("[account] update:", e.message); res.status(500).json({ error: "Could not save your account. Please try again." }); } });

  // delete my account and everything I own: projects (with their history and sharing), my memberships, support messages, plan requests, activity
  app.delete("/api/account", async (req, res) => {
    try { const me = req.auth.username; if (me === "admin") return deny(res, 403, "The main administrator account cannot be deleted.", "forbidden");
      const u = await one(`?username=eq.${enc(me)}&select=id,username,password_hash`); if (!u) return deny(res, 404, "Account not found.", "not_found");
      if (String(req.body?.confirm || "").trim().toUpperCase() !== "DELETE") return deny(res, 400, "Type DELETE to confirm.", "bad_request");
      if (!(await checkPw(String(req.body?.password || ""), u.password_hash)).ok) return deny(res, 401, "Password is incorrect.", "bad_password");
      const own = await sbFetch("GET", "ecoscope_projects", null, `?owner=eq.${enc(me)}&select=id`); const ids = (Array.isArray(own) ? own : []).map(p => p.id);
      for (const id of ids) { await sbFetch("DELETE", "ecoscope_project_members", null, `?project_id=eq.${enc(id)}`); await sbFetch("DELETE", "ecoscope_project_history", null, `?project_id=eq.${enc(id)}`); try { await sbFetch("DELETE", "ecoscope_project_messages", null, `?project_id=eq.${enc(id)}`); } catch (e) { /* table may not exist yet */ } }
      // saved chart pictures: the files in storage, then the rows
      try { const sn = await sbFetch("GET", "ecoscope_snapshots", null, `?username=eq.${enc(me)}&select=storage_path`); const paths = (Array.isArray(sn) ? sn : []).map(x => x.storage_path).filter(Boolean); if (paths.length) await require("./blob_store")().del(paths); await sbFetch("DELETE", "ecoscope_snapshots", null, `?username=eq.${enc(me)}`); } catch (e) { console.error("[account] snapshots:", e.message); }
      if (ids.length) await sbFetch("DELETE", "ecoscope_projects", null, `?owner=eq.${enc(me)}`);
      await sbFetch("DELETE", "ecoscope_project_members", null, `?username=eq.${enc(me)}`);
      for (const t of ["ecoscope_support_messages", "ecoscope_support_threads", "ecoscope_requests", "ecoscope_activity"]) { try { await sbFetch("DELETE", t, null, `?username=eq.${enc(me)}`); } catch (e) { console.error("[account] delete", t, e.message); } }
      await sbFetch("DELETE", "ecoscope_users", null, `?username=eq.${enc(me)}`); forgetUser(me); console.log(`[account] deleted ${me}: ${ids.length} projects`);
      res.json({ ok: true, projects: ids.length });
    } catch (e) { console.error("[account] delete:", e.message); res.status(500).json({ error: "Could not delete the account. Nothing was removed from sign-in; please try again." }); } });

  // ── AI insight (takes over server.js): same request and reply, plus a 24-hour cache so repeated charts cost nothing ──
  const INS = new Map(); const INS_TTL = 24 * 3600e3; const AIUSE = { day: "", n: new Map() };
  app.post("/api/insight", async (req, res) => {
    const key = process.env.ANTHROPIC_KEY || ""; if (!key) return res.status(500).json({ error: { message: "ANTHROPIC_KEY not configured." } });
    // one institutional key on the server, with a daily allowance per person (AI_DAILY_LIMIT, default 40; administrators unlimited)
    if (!req.auth.admin) { const day = new Date().toISOString().slice(0, 10); const k = `${req.auth.username}|${day}`; const lim = +(process.env.AI_DAILY_LIMIT || 40);
      if (AIUSE.day !== day) { AIUSE.day = day; AIUSE.n.clear(); } const used = AIUSE.n.get(k) || 0;
      if (used >= lim) return res.status(429).json({ error: { message: `You have used today's ${lim} AI analyses. The allowance resets at midnight UTC.` } }); AIUSE.n.set(k, used + 1); }
    const b = req.body || {}; const f = { country: clean(b.country, 80), indicator: clean(b.indicator, 200), source: clean(b.source, 80), startYear: clean(b.startYear, 10), endYear: clean(b.endYear, 10), dataPoints: clean(b.dataPoints, 6000) };
    const ck = crypto.createHash("sha256").update(JSON.stringify(f)).digest("hex"); const hit = INS.get(ck); if (hit && Date.now() - hit.t < INS_TTL) { res.setHeader("X-Cache", "hit"); return res.json(hit.body); }
    try { const r = await new Promise((resolve, reject) => { const body = JSON.stringify({ model: process.env.INSIGHT_MODEL || "claude-sonnet-4-5", max_tokens: 600,
        messages: [{ role: "user", content: `Analyze "${f.indicator}" for ${f.country} from ${f.source} (${f.startYear}–${f.endYear}). Data: ${f.dataPoints}. Write 3 paragraphs: 1) Key trend 2) Context 3) Outlook. Max 220 words, data-driven.` }] });
        const rq = require("https").request({ hostname: "api.anthropic.com", path: "/v1/messages", method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Length": Buffer.byteLength(body) } }, (rs) => { let d = ""; rs.on("data", c => d += c); rs.on("end", () => resolve({ status: rs.statusCode, d })); });
        rq.on("error", reject); rq.setTimeout(45000, () => rq.destroy(new Error("timeout"))); rq.write(body); rq.end(); });
      let j; try { j = JSON.parse(r.d); } catch { return res.status(502).json({ error: { message: "Parse error" } }); }
      if (r.status === 200) { if (INS.size > 500) INS.delete(INS.keys().next().value); INS.set(ck, { t: Date.now(), body: j }); }
      res.status(r.status).json(j);
    } catch (e) { res.status(502).json({ error: { message: e.message } }); } });

  // ── 4. Current user (used by the dashboard to refresh the plan) ──
  app.get("/api/me", async (req, res) => {
    try { const r = await sbFetch("GET", "ecoscope_users", null, `?username=eq.${encodeURIComponent(req.auth.username)}&select=id,username,email,role,plan,plan_status,country,settings,created_at,last_login`);
      if (!Array.isArray(r) || !r.length) return deny(res, 401, "Account not found. Please sign in again.", "auth_required"); res.json(r[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ══════════════════════════════════════════════════════════════════════
  // PROJECTS
  // ══════════════════════════════════════════════════════════════════════
  const big = express.json({ limit: "25mb" });
  const enc = encodeURIComponent; const clean = (s, n) => String(s ?? "").trim().slice(0, n);
  const fail = (res, e) => { console.error("[projects]", e?.message || e); res.status(500).json({ error: "Could not reach the project store. Your work is kept on this device and will sync when the connection returns." }); };
  const META = "id,owner,name,domain,description,question,status,tags,created_at,updated_at,updated_by,size_bytes";
  const ROLES = ["viewer", "editor"];
  // Who may do what: owner (everything), editor (open and save), viewer (open only), admin (everything)
  const access = async (req, id) => {
    const r = await sbFetch("GET", "ecoscope_projects", null, `?id=eq.${enc(id)}&select=${META}`); const p = Array.isArray(r) ? r[0] : null; if (!p) return null;
    const me = req.auth.username; if (p.owner === me) return { p, role: "owner" }; if (req.auth.admin) return { p, role: "admin" };
    const m = await sbFetch("GET", "ecoscope_project_members", null, `?project_id=eq.${enc(id)}&username=eq.${enc(me)}&select=role`);
    const role = Array.isArray(m) && m[0] ? m[0].role : null; return role ? { p, role } : null; };
  const canEdit = (a) => a && ["owner", "admin", "editor"].includes(a.role);
  const canManage = (a) => a && ["owner", "admin"].includes(a.role);
  const meta = (b) => ({ name: clean(b.name, 120) || "Untitled project", domain: clean(b.domain, 80) || null, description: clean(b.description, 2000) || null, question: clean(b.question, 1000) || null,
                         status: ["planning", "active", "paused", "done"].includes(b.status) ? b.status : "active", tags: Array.isArray(b.tags) ? b.tags.slice(0, 12).map(t => clean(t, 40)) : [] });
  const history = async (p, req, action, detail, state, now) => {
    // snapshots keep datasets only when small; large datasets are referenced and restored from the project
    let snap = state || null; const bigS = (x) => Buffer.byteLength(JSON.stringify(x || null)) > 3e5;
    if (snap && snap.datasets) snap = { ...snap, datasets: Object.fromEntries(Object.entries(snap.datasets).map(([k, d]) => [k, bigS(d) ? { ref: true, name: d?.name } : d])) };
    if (snap && snap.importedRaw && bigS(snap.importedRaw)) snap = { ...snap, importedRaw: { ref: true, name: snap.importedRaw.name } };
    await sbFetch("POST", "ecoscope_project_history", { project_id: p.id, owner: p.owner, author: req.auth.username, action: clean(action, 160), detail: clean(detail, 600) || null, state: snap, created_at: now });
    const old = await sbFetch("GET", "ecoscope_project_history", null, `?project_id=eq.${enc(p.id)}&select=id&order=id.desc&offset=300&limit=1`);
    if (Array.isArray(old) && old[0]) await sbFetch("DELETE", "ecoscope_project_history", null, `?project_id=eq.${enc(p.id)}&id=lte.${old[0].id}`);
  };

  // list: my projects plus projects shared with me (role and owner on each)
  app.get("/api/projects", async (req, res) => {
    try { const me = req.auth.username; const bad = (where, r) => { if (!Array.isArray(r)) console.error(`[projects] ${where} for ${me}:`, JSON.stringify(r).slice(0, 300)); return Array.isArray(r) ? r : []; };
      const own = bad("own projects", await sbFetch("GET", "ecoscope_projects", null, `?owner=eq.${enc(me)}&select=${META}&order=updated_at.desc`));
      const mem = bad("memberships", await sbFetch("GET", "ecoscope_project_members", null, `?username=eq.${enc(me)}&select=project_id,role`));
      let shared = [];
      if (mem.length) { const ids = mem.map(m => `"${String(m.project_id).replace(/"/g, "")}"`).join(",");
        let got = await sbFetch("GET", "ecoscope_projects", null, `?id=in.(${ids})&select=${META}`);
        if (!Array.isArray(got)) { bad("shared projects (batch)", got); got = []; for (const m of mem) { const one = await sbFetch("GET", "ecoscope_projects", null, `?id=eq.${enc(m.project_id)}&select=${META}`); if (Array.isArray(one) && one[0]) got.push(one[0]); else bad("shared project " + m.project_id, one); } }
        shared = got.filter(p => p.owner !== me).map(p => ({ ...p, role: (mem.find(m => String(m.project_id) === String(p.id)) || {}).role || "viewer" })); }
      const names = {}; if (own.length) { const ids = own.map(p => `"${p.id}"`).join(","); const all = bad("members of own projects", await sbFetch("GET", "ecoscope_project_members", null, `?project_id=in.(${ids})&select=project_id,username,role&order=created_at.asc`)); all.forEach(m => { (names[m.project_id] = names[m.project_id] || []).push({ username: m.username, role: m.role }); }); }
      res.json([...own.map(p => ({ ...p, role: "owner", members: (names[p.id] || []).length, memberNames: names[p.id] || [] })), ...shared].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))));
    } catch (e) { fail(res, e); } });
  app.post("/api/projects", big, async (req, res) => {
    try { const b = req.body || {}; const now = new Date().toISOString(); const state = b.state || {}; const s = JSON.stringify(state);
      const row = { id: crypto.randomUUID(), owner: req.auth.username, ...meta(b), state, size_bytes: Buffer.byteLength(s), created_at: now, updated_at: now, updated_by: req.auth.username };
      const out = await sbFetch("POST", "ecoscope_projects", row); const p = Array.isArray(out) ? out[0] : out; if (!p?.id) throw new Error(JSON.stringify(out).slice(0, 200));
      await history(p, req, "Project created", row.name, state, now);
      const { state: _s, ...m } = p; res.json({ ...m, role: "owner" });
    } catch (e) { fail(res, e); } });
  app.get("/api/projects/:id", async (req, res) => {
    try { const a = await access(req, req.params.id); if (!a) return deny(res, 404, "Project not found, or it is no longer shared with you.", "not_found");
      const r = await sbFetch("GET", "ecoscope_projects", null, `?id=eq.${enc(req.params.id)}&select=*`); res.json({ ...r[0], role: a.role }); } catch (e) { fail(res, e); } });
  // save: metadata (owner) and/or state (owner, editor), optional history entry. base = the updated_at the client last saw:
  // if someone else saved since, answer 409 so the client can offer to reload or overwrite (force)
  app.patch("/api/projects/:id", big, async (req, res) => {
    try { const a = await access(req, req.params.id); if (!a) return deny(res, 404, "Project not found, or it is no longer shared with you.", "not_found");
      if (!canEdit(a)) return deny(res, 403, "You can view this project but not change it. Ask the owner for edit access, or duplicate it.", "view_only");
      const b = req.body || {}; const p = a.p; const me = req.auth.username;
      if (b.meta && !canManage(a)) return deny(res, 403, "Only the owner can change the project details.", "forbidden");
      if (b.state && b.base && !b.force && p.updated_at && p.updated_by && p.updated_by !== me && new Date(p.updated_at).getTime() > new Date(b.base).getTime())
        return res.status(409).json({ error: `${p.updated_by} saved changes to this project at ${p.updated_at}.`, code: "conflict", updated_by: p.updated_by, updated_at: p.updated_at });
      const now = new Date().toISOString(); const upd = { updated_at: now, updated_by: me };
      if (b.meta) Object.assign(upd, meta({ ...p, ...b.meta }));
      if (b.state) { upd.state = b.state; upd.size_bytes = Buffer.byteLength(JSON.stringify(b.state)); }
      await sbFetch("PATCH", "ecoscope_projects", upd, `?id=eq.${enc(p.id)}`);
      if (b.history && b.history.action) await history(p, req, b.history.action, b.history.detail, b.state, now);
      res.json({ ok: true, updated_at: now });
    } catch (e) { fail(res, e); } });
  app.delete("/api/projects/:id", async (req, res) => {
    try { const a = await access(req, req.params.id); if (!a) return deny(res, 404, "Project not found.", "not_found");
      if (!canManage(a)) return deny(res, 403, "Only the owner can delete this project. Use Leave to remove it from your list.", "forbidden");
      await sbFetch("DELETE", "ecoscope_project_members", null, `?project_id=eq.${enc(a.p.id)}`);
      await sbFetch("DELETE", "ecoscope_project_history", null, `?project_id=eq.${enc(a.p.id)}`); await sbFetch("DELETE", "ecoscope_projects", null, `?id=eq.${enc(a.p.id)}`); res.json({ ok: true });
    } catch (e) { fail(res, e); } });
  // history list (no states) and one entry's state (for restore)
  app.get("/api/projects/:id/history", async (req, res) => {
    try { if (!await access(req, req.params.id)) return deny(res, 404, "Project not found.", "not_found");
      res.json(await sbFetch("GET", "ecoscope_project_history", null, `?project_id=eq.${enc(req.params.id)}&select=id,action,detail,author,created_at&order=id.desc&limit=300`) || []); } catch (e) { fail(res, e); } });
  app.get("/api/projects/:id/history/:hid", async (req, res) => {
    try { if (!await access(req, req.params.id)) return deny(res, 404, "Project not found.", "not_found");
      const r = await sbFetch("GET", "ecoscope_project_history", null, `?project_id=eq.${enc(req.params.id)}&id=eq.${enc(req.params.hid)}&select=*`);
      if (!Array.isArray(r) || !r[0]) return deny(res, 404, "History entry not found.", "not_found"); res.json(r[0]); } catch (e) { fail(res, e); } });

  // ── sharing: members of a project ──
  const findUser = async (who) => { const w = clean(who, 200); if (!w) return null; const q = w.includes("@") ? `email=eq.${enc(w.toLowerCase())}` : `username=eq.${enc(w)}`;
    const cols = "select=id,username,email,plan_status,created_at";
    let r = await sbFetch("GET", "ecoscope_users", null, `?${q}&${cols}`); if ((!Array.isArray(r) || !r[0]) && w.includes("@")) r = await sbFetch("GET", "ecoscope_users", null, `?email=eq.${enc(w)}&${cols}`);
    if (Array.isArray(r) && r.length > 1) return { multi: r.map(x => x.username) };
    return Array.isArray(r) && r[0] ? r[0] : null; };
  app.get("/api/projects/:id/members", async (req, res) => {
    try { const a = await access(req, req.params.id); if (!a) return deny(res, 404, "Project not found.", "not_found");
      const m = await sbFetch("GET", "ecoscope_project_members", null, `?project_id=eq.${enc(a.p.id)}&select=username,role,invited_by,created_at&order=created_at.asc`) || [];
      let list = Array.isArray(m) ? m : [];
      if (list.length && canManage(a)) { const us = await sbFetch("GET", "ecoscope_users", null, `?username=in.(${enc(list.map(x => `"${String(x.username).replace(/"/g, "")}"`).join(","))})&select=username,email,plan_status`) || []; const em = {}, pend = {}; (Array.isArray(us) ? us : []).forEach(x => { em[x.username] = x.email; pend[x.username] = x.plan_status === "invited"; }); list = list.map(x => ({ ...x, email: em[x.username] || null, pending: !!pend[x.username] })); }
      res.json({ owner: a.p.owner, role: a.role, members: list }); } catch (e) { fail(res, e); } });
  app.post("/api/projects/:id/members", async (req, res) => {
    try { const a = await access(req, req.params.id); if (!a) return deny(res, 404, "Project not found.", "not_found");
      if (!canManage(a)) return deny(res, 403, "Only the owner can share this project.", "forbidden");
      const role = ROLES.includes(req.body?.role) ? req.body.role : "viewer"; const who = clean(req.body?.who, 200); let u = await findUser(who); let created = false;
      const isEmail = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(who);
      // someone without an account: create an invitation and email it, so they join straight into this project
      if (!u && isEmail) { u = await createInvited(who.toLowerCase(), "user", req.auth.username); created = true; }
      if (!u) return deny(res, 404, "No EcoScope account has that username. To invite someone new, type their email address instead.", "no_user");
      if (u.multi) return deny(res, 409, `More than one account uses that email (${u.multi.join(", ")}). Invite by username instead, so the right account gets access.`, "ambiguous");
      if (u.username === a.p.owner) return deny(res, 400, "That person already owns this project.", "bad_request");
      const now = new Date().toISOString();
      const ex = await sbFetch("GET", "ecoscope_project_members", null, `?project_id=eq.${enc(a.p.id)}&username=eq.${enc(u.username)}&select=username`);
      if (Array.isArray(ex) && ex[0]) await sbFetch("PATCH", "ecoscope_project_members", { role }, `?project_id=eq.${enc(a.p.id)}&username=eq.${enc(u.username)}`);
      else await sbFetch("POST", "ecoscope_project_members", { project_id: a.p.id, username: u.username, role, invited_by: req.auth.username, created_at: now });
      const pending = created || u.plan_status === "invited";
      await history(a.p, req, `Shared with ${pending ? u.email : u.username}`, role === "editor" ? "Can edit" : "Can view", null, now);
      let mailed = { sent: false, reason: "no_email" };
      if (pending) { const token = created ? u.invite_token : await renewInvite(u); mailed = await MAIL.projectInvite(u.email, req.auth.username, a.p.name || "a project", role, MAIL.link(req, `invite=${token}`), INVITE_DAYS);
        res.json({ ok: true, invited: true, username: u.username, email: u.email, role, emailed: mailed.sent, invite_link: mailed.sent ? undefined : MAIL.link(req, `invite=${token}`) }); }
      else { if (u.email) mailed = await MAIL.projectShared(u.email, u.username, req.auth.username, a.p.name || "a project", role, MAIL.link(req, "")); res.json({ ok: true, username: u.username, email: u.email || null, role, emailed: mailed.sent }); }
    } catch (e) { fail(res, e); } });
  app.patch("/api/projects/:id/members/:user", async (req, res) => {
    try { const a = await access(req, req.params.id); if (!canManage(a)) return deny(res, 403, "Only the owner can change access.", "forbidden");
      const role = ROLES.includes(req.body?.role) ? req.body.role : null; if (!role) return deny(res, 400, "Role must be viewer or editor.", "bad_request");
      await sbFetch("PATCH", "ecoscope_project_members", { role }, `?project_id=eq.${enc(a.p.id)}&username=eq.${enc(req.params.user)}`); res.json({ ok: true });
    } catch (e) { fail(res, e); } });
  // the owner removes someone, or a member leaves
  app.delete("/api/projects/:id/members/:user", async (req, res) => {
    try { const a = await access(req, req.params.id); if (!a) return deny(res, 404, "Project not found.", "not_found");
      const self = req.params.user === req.auth.username; if (!self && !canManage(a)) return deny(res, 403, "Only the owner can remove people.", "forbidden");
      await sbFetch("DELETE", "ecoscope_project_members", null, `?project_id=eq.${enc(a.p.id)}&username=eq.${enc(req.params.user)}`);
      await history(a.p, req, self ? `${req.params.user} left the project` : `Removed ${req.params.user}`, null, null, new Date().toISOString()); res.json({ ok: true });
    } catch (e) { fail(res, e); } });

  // ════════════════ LIVE: project chat, who is online, who is typing; support presence ════════════════
  // Messages are stored in ecoscope_project_messages; presence and typing are kept in memory (one server) and expire on their own.
  const SEEN = new Map(); // `${room}|${username}` -> { at, typing }
  const touch = (room, username, typing) => { const k = `${room}|${username}`; const cur = SEEN.get(k) || {}; SEEN.set(k, { at: Date.now(), typing: typing ? Date.now() : (cur.typing || 0) }); if (SEEN.size > 50000) { const cut = Date.now() - 300e3; for (const [kk, v] of SEEN) if (v.at < cut) SEEN.delete(kk); } };
  const presence = (room, me) => { const now = Date.now(); const online = [], typing = []; for (const [k, v] of SEEN) { if (!k.startsWith(room + "|")) continue; const u = k.slice(room.length + 1); if (u === me) continue; if (now - v.at < 60e3) online.push(u); if (now - v.typing < 6e3) typing.push(u); } return { online: online.sort(), typing: typing.sort() }; };
  const MSG_COLS = "id,project_id,username,body,created_at,edited_at,deleted";
  const chatGate = async (req, res) => { const a = await access(req, req.params.id); if (!a) { deny(res, 404, "Project not found.", "not_found"); return null; } return a; };
  app.get("/api/projects/:id/chat", async (req, res) => {
    try { const a = await chatGate(req, res); if (!a) return; const me = req.auth.username; touch(`p:${a.p.id}`, me, false);
      const after = parseInt(req.query.after || "0", 10) || 0; const q = after ? `&id=gt.${after}&order=id.asc&limit=200` : `&order=id.desc&limit=150`;
      let msgs = await sbFetch("GET", "ecoscope_project_messages", null, `?project_id=eq.${enc(a.p.id)}&select=${MSG_COLS}${q}`); if (!Array.isArray(msgs)) throw new Error(JSON.stringify(msgs).slice(0, 200));
      if (!after) msgs = msgs.reverse(); msgs = msgs.map(m => (m.deleted ? { ...m, body: "" } : m));
      // the people in this project, so the chat can list members and handle @mentions
      let people = [a.p.owner]; try { const mm = await sbFetch("GET", "ecoscope_project_members", null, `?project_id=eq.${enc(a.p.id)}&select=username`); if (Array.isArray(mm)) people = [...new Set([a.p.owner, ...mm.map(x => x.username)])]; } catch (e) { /* owner only */ }
      res.setHeader("Cache-Control", "no-store"); res.json({ messages: msgs, ...presence(`p:${a.p.id}`, me), people, role: a.role });
    } catch (e) { fail(res, e); } });
  const CHAT_RATE = new Map();
  app.post("/api/projects/:id/chat", async (req, res) => {
    try { const a = await chatGate(req, res); if (!a) return; const me = req.auth.username; const body = clean(req.body?.body, 4000); if (!body) return deny(res, 400, "The message is empty.", "bad_request");
      const now = Date.now(); const r = CHAT_RATE.get(me) || { t: now, n: 0 }; if (now - r.t > 60e3) { r.t = now; r.n = 0; } if (++r.n > 40) return deny(res, 429, "Too many messages in a minute. Please slow down.", "rate_limited"); CHAT_RATE.set(me, r);
      const out = await sbFetch("POST", "ecoscope_project_messages", { project_id: a.p.id, username: me, body, created_at: new Date().toISOString() });
      if (!Array.isArray(out) || !out[0]) throw new Error(JSON.stringify(out).slice(0, 200)); const k = `p:${a.p.id}|${me}`; const cur = SEEN.get(k); if (cur) cur.typing = 0; touch(`p:${a.p.id}`, me, false);
      res.json(out[0]); } catch (e) { fail(res, e); } });
  app.post("/api/projects/:id/chat/typing", async (req, res) => {
    try { const a = await chatGate(req, res); if (!a) return; touch(`p:${a.p.id}`, req.auth.username, true); res.json({ ok: true }); } catch (e) { fail(res, e); } });
  app.patch("/api/projects/:id/chat/:mid", async (req, res) => {
    try { const a = await chatGate(req, res); if (!a) return; const body = clean(req.body?.body, 4000); if (!body) return deny(res, 400, "The message is empty.", "bad_request");
      const out = await sbFetch("PATCH", "ecoscope_project_messages", { body, edited_at: new Date().toISOString() }, `?id=eq.${enc(req.params.mid)}&project_id=eq.${enc(a.p.id)}&username=eq.${enc(req.auth.username)}&deleted=eq.false`);
      if (!Array.isArray(out) || !out[0]) return deny(res, 404, "You can only edit your own messages.", "not_found"); res.json(out[0]); } catch (e) { fail(res, e); } });
  app.delete("/api/projects/:id/chat/:mid", async (req, res) => {
    try { const a = await chatGate(req, res); if (!a) return; const who = canManage(a) ? "" : `&username=eq.${enc(req.auth.username)}`;
      const out = await sbFetch("PATCH", "ecoscope_project_messages", { deleted: true, body: "", edited_at: new Date().toISOString() }, `?id=eq.${enc(req.params.mid)}&project_id=eq.${enc(a.p.id)}${who}`);
      if (!Array.isArray(out) || !out[0]) return deny(res, 404, "You can only delete your own messages.", "not_found"); res.json({ ok: true }); } catch (e) { fail(res, e); } });
  // unread counts for the project list: newest message id per project the user can open
  app.get("/api/projects-chat/latest", async (req, res) => {
    try { const ids = String(req.query.ids || "").split(",").map(x => x.trim()).filter(x => /^[A-Za-z0-9_-]{1,64}$/.test(x)).slice(0, 100); if (!ids.length) return res.json({});
      const out = {}; for (const id of ids) { const a = await access(req, id); if (!a) continue; const r = await sbFetch("GET", "ecoscope_project_messages", null, `?project_id=eq.${enc(id)}&deleted=eq.false&select=id,username&order=id.desc&limit=1`); if (Array.isArray(r) && r[0]) out[id] = r[0]; }
      res.json(out); } catch (e) { fail(res, e); } });

  // support: is the team online, is someone typing (admins are "online" while their inbox is open)
  app.post("/api/support/typing", (req, res) => { if (!req.auth) return deny(res, 401, "Please sign in again.", "auth_required");
    const u = req.auth.admin ? clean(req.body?.username, 64) : req.auth.username; if (!u) return deny(res, 400, "username required", "bad_request");
    touch(`s:${u}`, req.auth.admin ? "@team" : u, true); if (req.auth.admin) touch("s:@team", req.auth.username, false); res.json({ ok: true }); });
  app.get("/api/support/presence", (req, res) => { if (!req.auth) return deny(res, 401, "Please sign in again.", "auth_required");
    const u = req.auth.admin ? clean(req.query.username, 64) : req.auth.username; const now = Date.now();
    if (req.auth.admin) { touch("s:@team", req.auth.username, false); const v = SEEN.get(`s:${u}|${u}`); return res.json({ user_online: !!v && now - v.at < 60e3, user_typing: !!v && now - v.typing < 6e3 }); }
    touch(`s:${u}`, u, false); const team = presence("s:@team", null); const t = SEEN.get(`s:${u}|@team`);
    res.json({ team_online: team.online.length > 0, team_typing: !!t && now - t.typing < 6e3 }); });
  // an admin reading the inbox counts as online
  app.use("/api/support", (req, res, next) => { if (req.auth && req.auth.admin && req.method === "GET") touch("s:@team", req.auth.username, false); next(); });

  return { sign, verify, issue, createInvited, renewInvite, mail: MAIL };
};
