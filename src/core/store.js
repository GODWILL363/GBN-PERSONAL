// core/store.js — split from App.js (code unchanged; only imports and exports were added)


// ══════════════════════════════════════════════
// USER STORE — Supabase via server API
// ══════════════════════════════════════════════
// Signed session token: every /api call carries it; a 401 from the server signs the user out.
// IESGI platform (separate app, same database and accounts): its address comes from the server's IESGI_URL
let IESGI_URL = ""; try { fetch("/api/health").then(r => r.ok ? r.json() : null).then(j => { if (j && j.iesgi_url) IESGI_URL = String(j.iesgi_url).replace(/\/$/, ""); }).catch(() => {}); } catch (e) {}
const openIesgi = (path) => { if (!IESGI_URL) { window.alert("The IESGI platform address is not set. Add IESGI_URL in Railway → Variables."); return; } window.open(IESGI_URL + path, "_blank", "noopener"); };
const ecoToken = () => { try { return JSON.parse(localStorage.getItem('ecoscope_session')||'null')?.token || null; } catch { return null; } };
if (typeof window !== 'undefined' && !window.__ecoFetchWrapped) {
  const baseFetch = window.fetch.bind(window); window.__ecoFetchWrapped = true;
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const api = url.startsWith('/api/');
    if (api) { const t = ecoToken(); if (t) init = { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${t}` } }; }
    return baseFetch(input, init).then(r => { if (api && r.status === 401 && !url.startsWith('/api/auth/') && ecoToken()) window.dispatchEvent(new Event('ecoscope-auth-expired')); return r; });
  };
}
const US = {
  SESS: 'ecoscope_session',

  async _call(method, path, body) {
    try {
      const res = await fetch(path, {
        method,
        headers: {'Content-Type': 'application/json'},
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok) return {...(json && typeof json === 'object' ? json : {}), error: (json && json.error) || 'Server error', status: res.status};
      return json;
    } catch(e) {
      console.error('API error:', e);
      return {error: 'Network error — check your connection'};
    }
  },

  hash(p){
    let h=5381;
    for(let i=0;i<p.length;i++) h=((h<<5)+h)+p.charCodeAt(i);
    return (h>>>0).toString(36)+':'+p.length;
  },

  init(){
    // No-op — server handles init
  },

  async register(username, email, password){
    const res = await this._call('POST', '/api/auth/register', {username, email, password});
    if(res.error) return {error: res.error};
    const user = {...res.user, token: res.token};
    localStorage.setItem(this.SESS, JSON.stringify({username: user.username, role: user.role, plan: user.plan, token: res.token, at: new Date().toISOString()}));
    return {user};
  },

  async login(username, password){
    const res = await this._call('POST', '/api/auth/login', {username, password});
    if(res.error) return {error: res.error};
    localStorage.setItem(this.SESS, JSON.stringify({
      username: res.user?.username || username, // the real username, even when signing in with an email
      role: res.user?.role,
      plan: res.user?.plan,
      token: res.token,
      at: new Date().toISOString()
    }));
    return {user: {...res.user, token: res.token}};
  },

  logout(username){
    this.log(username, 'Logout', 'Session ended');
    localStorage.removeItem(this.SESS);
  },

  async getAll(){
    const res = await this._call('GET', '/api/users');
    return Array.isArray(res) ? res : [];
  },

  async me(){ const r = await this._call('GET', '/api/me'); return r && !r.error ? r : null; },

  // Projects (these throw on failure so callers can show the message)
  async _p(method, path, body){ const r = await this._call(method, path, body); if (r && r.error) throw Object.assign(new Error(r.error), { code: r.code, data: r }); return r; },
  async projectMembers(id){ return this._p('GET', `/api/projects/${encodeURIComponent(id)}/members`); },
  async projectInvite(id, who, role){ return this._p('POST', `/api/projects/${encodeURIComponent(id)}/members`, { who, role }); },
  async projectSetRole(id, user, role){ return this._p('PATCH', `/api/projects/${encodeURIComponent(id)}/members/${encodeURIComponent(user)}`, { role }); },
  async projectRemoveMember(id, user){ return this._p('DELETE', `/api/projects/${encodeURIComponent(id)}/members/${encodeURIComponent(user)}`); },
  async projectList(){ const r = await this._p('GET', '/api/projects'); return Array.isArray(r) ? r : []; },
  async projectCreate(p){ return this._p('POST', '/api/projects', p); },
  async projectGet(id){ return this._p('GET', `/api/projects/${encodeURIComponent(id)}`); },
  async projectSave(id, body){ return this._p('PATCH', `/api/projects/${encodeURIComponent(id)}`, body); },
  async projectDelete(id){ return this._p('DELETE', `/api/projects/${encodeURIComponent(id)}`); },
  async projectHistory(id){ const r = await this._p('GET', `/api/projects/${encodeURIComponent(id)}/history`); return Array.isArray(r) ? r : []; },
  async projectHistoryEntry(id, hid){ return this._p('GET', `/api/projects/${encodeURIComponent(id)}/history/${encodeURIComponent(hid)}`); },

  getUser(username){
    // For session restore - check localStorage cache
    try {
      const sess = JSON.parse(localStorage.getItem(this.SESS) || 'null');
      return sess?.username === username ? sess : null;
    } catch { return null; }
  },

  async update(username, updates){
    const res = await this._call('PATCH', `/api/users/${encodeURIComponent(username)}`, updates);
    window.dispatchEvent(new Event('ecoscope-update'));
    return res;
  },

  async setPlan(username, plan, status='active'){
    await this._call('POST', `/api/users/${encodeURIComponent(username)}/plan`, {plan, plan_status: status});
    window.dispatchEvent(new Event('ecoscope-update'));
  },

  async deleteUser(username){
    if(username === 'admin') return false;
    await this._call('DELETE', `/api/users/${encodeURIComponent(username)}`);
    window.dispatchEvent(new Event('ecoscope-update'));
    return true;
  },

  async invite(email, role='user'){
    const res = await this._call('POST', '/api/users/invite', {email, role});
    if(res.error) return {error: res.error};
    window.dispatchEvent(new Event('ecoscope-update'));
    return {user: res.user, inviteToken: res.token, emailed: !!res.emailed, renewed: !!res.renewed};
  },

  async updateProfile(username, updates){
    return this.update(username, updates);
  },

  async log(username, action, detail=''){
    try {
      await this._call('POST', '/api/activity', {username, action, detail});
      window.dispatchEvent(new Event('ecoscope-update'));
    } catch(e) { console.error('Log error:', e); }
  },

  async getLog(){
    const res = await this._call('GET', '/api/activity');
    return Array.isArray(res) ? res : [];
  },

  async getRequests(){
    const res = await this._call('GET', '/api/requests');
    return Array.isArray(res) ? res : [];
  },

  async requestPlan(username, email, currentPlan, requestedPlan, message=''){
    const res = await this._call('POST', '/api/requests', {username, email, currentPlan, requestedPlan, message});
    if(res.error) return {error: res.error};
    return {req: res};
  },

  // My account: update details, or delete the account and everything it owns
  async updateAccount(body){ const r = await this._call('PATCH', '/api/account', body); if (!r.error) window.dispatchEvent(new Event('ecoscope-update')); return r; },
  async deleteAccount(password, confirm){ return this._call('DELETE', '/api/account', { password, confirm }); },

  // Password change: the server verifies the current password before saving the new one
  async changePassword(username, currentPassword, newPassword){
    const res = await this._call('POST', '/api/auth/change-password', {username, currentPassword, newPassword});
    if(res.error) return {error: res.error};
    this.log(username, 'Password changed', 'User changed their password');
    return {ok:true};
  },

  // Support chat
  async supportMessages(username){ return this._call('GET', `/api/support/messages?username=${encodeURIComponent(username)}`); },
  async supportSend(msg){ return this._call('POST', '/api/support/messages', msg); },
  async supportThreads(){ return this._call('GET', '/api/support/threads'); },
  async supportMarkRead(username, reader){ return this._call('POST', '/api/support/read', {username, reader}); },
  async supportSetStatus(username, status){ return this._call('POST', '/api/support/status', {username, status}); },
  async supportAssistant(question, history=[], context=null){ const r = await this._call('POST', '/api/support/assistant', {question, history, context}); return r && !r.error ? r : null; },
  async news(){ return this._call('GET','/api/news'); },
  async newsPost(item){ return this._call('POST','/api/news',item); },
  async newsEdit(id,item){ return this._call('PATCH',`/api/news/${encodeURIComponent(id)}`,item); },
  async newsDelete(id){ return this._call('DELETE',`/api/news/${encodeURIComponent(id)}`); },
  async supportPresence(username){ return this._call('GET', `/api/support/presence${username?`?username=${encodeURIComponent(username)}`:''}`); },
  async supportTyping(username){ return this._call('POST', '/api/support/typing', {username}); },
  async projectChat(id, after=0){ return this._p('GET', `/api/projects/${encodeURIComponent(id)}/chat${after?`?after=${after}`:''}`); },
  async projectChatSend(id, body){ return this._p('POST', `/api/projects/${encodeURIComponent(id)}/chat`, {body}); },
  async projectChatTyping(id){ return this._call('POST', `/api/projects/${encodeURIComponent(id)}/chat/typing`, {}); },
  async projectChatEdit(id, mid, body){ return this._p('PATCH', `/api/projects/${encodeURIComponent(id)}/chat/${mid}`, {body}); },
  async projectChatDelete(id, mid){ return this._p('DELETE', `/api/projects/${encodeURIComponent(id)}/chat/${mid}`); },
  async projectChatLatest(ids){ return this._call('GET', `/api/projects-chat/latest?ids=${encodeURIComponent(ids.join(','))}`); },

  async resolveRequest(id, action, adminNote=''){
    await this._call('PATCH', `/api/requests/${id}`, {status: action, adminNote});
    window.dispatchEvent(new Event('ecoscope-update'));
    return true;
  },
};

export { US, openIesgi };
