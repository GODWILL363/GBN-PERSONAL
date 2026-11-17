// blob_store.js  —  file bytes in Supabase Storage (a private bucket), so Postgres keeps only the metadata
// Used by library_routes.js for Vault documents and admin storage files.
// The bucket is created on first use (private: only the server, with the service key, can read it).
// Old rows that still hold base64 bytes keep working; POST /api/admin/library-storage/migrate-files moves them over.

const https = require("https");

module.exports = function blobStore(opts = {}) {
  const URL_ = (opts.url ?? process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const KEY = opts.key ?? process.env.SUPABASE_KEY ?? "";
  const BUCKET = opts.bucket || process.env.VAULT_BUCKET || "ecoscope-vault";
  const enabled = !!(URL_ && KEY) && process.env.VAULT_STORAGE !== "off";

  // one HTTPS request; resolves { status, body: Buffer }
  const send = opts.request || ((method, path, body, headers = {}) => new Promise((resolve, reject) => {
    const u = new URL(URL_ + path);
    const req = https.request({ hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search, method,
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, ...headers, ...(body ? { "Content-Length": body.length } : {}) } }, (res) => {
      const chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) })); });
    req.on("error", reject); req.setTimeout(60000, () => req.destroy(new Error("storage timeout"))); if (body) req.write(body); req.end(); }));

  const objPath = (p) => `/storage/v1/object/${BUCKET}/${String(p).split("/").map(encodeURIComponent).join("/")}`;
  let ready = null;
  const ensureBucket = () => { if (!ready) ready = (async () => {
    const r = await send("POST", "/storage/v1/bucket", Buffer.from(JSON.stringify({ id: BUCKET, name: BUCKET, public: false })), { "Content-Type": "application/json" });
    const txt = r.body.toString(); if (r.status >= 300 && !/already exists|Duplicate|409/i.test(txt) && r.status !== 409) { ready = null; throw new Error(`storage bucket: ${r.status} ${txt.slice(0, 160)}`); } })(); return ready; };

  return {
    enabled, bucket: BUCKET,
    async put(path, buf, mime) {
      if (!enabled) throw new Error("storage disabled"); await ensureBucket();
      const r = await send("POST", objPath(path), buf, { "Content-Type": mime || "application/octet-stream", "x-upsert": "true", "Cache-Control": "no-store" });
      if (r.status >= 300) throw new Error(`storage upload: ${r.status} ${r.body.toString().slice(0, 160)}`); return path; },
    async get(path) {
      const r = await send("GET", objPath(path)); if (r.status >= 300) throw new Error(`storage download: ${r.status} ${r.body.toString().slice(0, 160)}`); return r.body; },
    async del(paths) {
      const list = (Array.isArray(paths) ? paths : [paths]).filter(Boolean); if (!list.length) return;
      const r = await send("DELETE", `/storage/v1/object/${BUCKET}`, Buffer.from(JSON.stringify({ prefixes: list })), { "Content-Type": "application/json" });
      if (r.status >= 300) console.error("[storage] delete:", r.status, r.body.toString().slice(0, 160)); },
  };
};
