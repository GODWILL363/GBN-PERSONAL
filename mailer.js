// mailer.js  —  sends EcoScope's emails (password reset, invitations, sharing notices) through Resend's web API.
// Railway blocks ordinary email (SMTP) on most plans; a web API works everywhere.
// Variables: RESEND_API_KEY (from resend.com), MAIL_FROM (e.g. "EcoScope <no-reply@yourdomain.com>"), APP_URL (the site's address).
// Without RESEND_API_KEY nothing is sent: the server logs that an email was skipped, and the caller can show the link instead.

const https = require("https");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

module.exports = function mailer(opts = {}) {
  const KEY = opts.key ?? process.env.RESEND_API_KEY ?? "";
  const FROM = opts.from ?? process.env.MAIL_FROM ?? "EcoScope <onboarding@resend.dev>";
  const APP = (opts.appUrl ?? process.env.APP_URL ?? "").replace(/\/$/, "");
  const enabled = !!KEY;
  const post = opts.request || ((body) => new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = https.request({ hostname: "api.resend.com", path: "/emails", method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "Content-Length": data.length } }, (r) => {
      let d = ""; r.on("data", c => d += c); r.on("end", () => resolve({ status: r.statusCode, body: d })); });
    req.on("error", reject); req.setTimeout(20000, () => req.destroy(new Error("email timeout"))); req.write(data); req.end(); }));

  // one simple, readable layout for every message
  const layout = (heading, paras, button, foot) => `<!doctype html><html><body style="margin:0;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#1d2433">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border:1px solid #e3e7ee;border-radius:10px" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 30px">
<div style="font-size:13px;color:#2a63c9;font-weight:bold;letter-spacing:.08em">ECOSCOPE</div>
<h1 style="font-size:20px;margin:10px 0 14px">${esc(heading)}</h1>
${paras.map(p => `<p style="font-size:14px;line-height:1.55;margin:0 0 12px">${p}</p>`).join("")}
${button ? `<p style="margin:20px 0"><a href="${esc(button.url)}" style="background:#2a63c9;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:6px;font-size:14px;display:inline-block">${esc(button.label)}</a></p>
<p style="font-size:12px;color:#7a8497;line-height:1.5;margin:0 0 12px">If the button does not work, copy this address into your browser:<br><span style="word-break:break-all">${esc(button.url)}</span></p>` : ""}
${foot ? `<p style="font-size:12px;color:#7a8497;line-height:1.5;margin:16px 0 0">${foot}</p>` : ""}
</td></tr></table></td></tr></table></body></html>`;
  const textOf = (heading, paras, button, foot) => [heading, "", ...paras.map(p => p.replace(/<[^>]+>/g, "")), button ? `\n${button.label}: ${button.url}` : "", foot ? `\n${foot.replace(/<[^>]+>/g, "")}` : ""].join("\n");

  const send = async (to, subject, heading, paras, button, foot) => {
    if (!enabled) { console.log(`[mail] RESEND_API_KEY not set: skipped "${subject}" to ${to}`); return { sent: false, reason: "not_configured" }; }
    try { const r = await post({ from: FROM, to: [to], subject, html: layout(heading, paras, button, foot), text: textOf(heading, paras, button, foot) });
      if (r.status >= 300) { console.error(`[mail] Resend ${r.status}: ${String(r.body).slice(0, 300)}`); return { sent: false, reason: "provider_error" }; }
      return { sent: true }; }
    catch (e) { console.error("[mail] send failed:", e.message); return { sent: false, reason: "network" }; } };

  const link = (req, query) => `${APP || `${req.headers["x-forwarded-proto"] || req.protocol}://${req.get("host")}`}/?${query}`;

  return {
    enabled, link,
    passwordReset: (to, username, url, minutes) => send(to, "Reset your EcoScope password", "Reset your password",
      [`Someone asked to reset the password for the EcoScope account <b>${esc(username)}</b>.`, `The link works once and expires in ${minutes} minutes.`],
      { label: "Choose a new password", url }, "If you did not ask for this, ignore this email. Your password stays the same."),
    invite: (to, invitedBy, url, days) => send(to, "You're invited to EcoScope", "You're invited to EcoScope",
      [`${esc(invitedBy)} invited you to EcoScope, a platform for economic data and analysis.`, `Open the link, choose a username and password, and you're in. The link works once and expires in ${days} days.`],
      { label: "Accept the invitation", url }, "If you were not expecting this, ignore this email."),
    projectInvite: (to, invitedBy, project, role, url, days) => send(to, `${invitedBy} shared "${project}" with you on EcoScope`, `${invitedBy} shared a project with you`,
      [`${esc(invitedBy)} invited you to the EcoScope project <b>${esc(project)}</b>, with ${role === "editor" ? "edit" : "view"} access.`, `You don't have an EcoScope account yet. Open the link, choose a username and password, and the project will be under <b>Projects → Shared with me</b>. The link expires in ${days} days.`],
      { label: "Accept and open EcoScope", url }, "If you were not expecting this, ignore this email."),
    projectShared: (to, username, invitedBy, project, role, url) => send(to, `${invitedBy} shared "${project}" with you on EcoScope`, `${invitedBy} shared a project with you`,
      [`Hi ${esc(username)}, ${esc(invitedBy)} gave you ${role === "editor" ? "edit" : "view"} access to the EcoScope project <b>${esc(project)}</b>.`, "Sign in and open <b>Projects → Shared with me</b> to find it."],
      { label: "Open EcoScope", url }, null),
  };
};
