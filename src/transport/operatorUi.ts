import type { Response } from "express";

/** Simple browser UI for non-technical operators. No build step. */
export function sendOperatorUi(res: Response): void {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>Approve MCP changes</title>
<style>
  :root {
    --bg: #0f1419;
    --panel: #1a222c;
    --text: #e8eef4;
    --muted: #9aa7b5;
    --accent: #3d9cf0;
    --ok: #3ecf8e;
    --warn: #e6a23c;
    --danger: #e35d6a;
    --border: #2a3542;
    --focus: #5eb0ff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    background:
      radial-gradient(1200px 600px at 10% -10%, #1b3a55 0%, transparent 55%),
      radial-gradient(900px 500px at 100% 0%, #243018 0%, transparent 50%),
      var(--bg);
    color: var(--text);
  }
  main { max-width: 720px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
  h1 { font-size: 1.5rem; font-weight: 650; margin: 0 0 .35rem; letter-spacing: -0.02em; }
  .sub { color: var(--muted); margin: 0 0 1.5rem; line-height: 1.45; }
  .card {
    background: color-mix(in srgb, var(--panel) 92%, black);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 1.25rem;
    margin-bottom: 1rem;
  }
  label { display: block; font-size: .85rem; color: var(--muted); margin: .75rem 0 .35rem; }
  input {
    width: 100%;
    padding: .7rem .85rem;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: #121820;
    color: var(--text);
    font-size: 1rem;
  }
  input:focus { outline: 2px solid var(--focus); border-color: transparent; }
  .row { display: flex; gap: .75rem; flex-wrap: wrap; margin-top: 1rem; }
  button {
    border: 0;
    border-radius: 999px;
    padding: .7rem 1.15rem;
    font-weight: 600;
    cursor: pointer;
    font-size: .95rem;
  }
  button.primary { background: var(--accent); color: #041018; }
  button.ghost { background: transparent; color: var(--text); border: 1px solid var(--border); }
  button.ok { background: var(--ok); color: #062016; }
  button.danger { background: transparent; color: var(--danger); border: 1px solid color-mix(in srgb, var(--danger) 50%, var(--border)); }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .msg { margin-top: 1rem; padding: .75rem .9rem; border-radius: 10px; font-size: .92rem; }
  .msg.err { background: color-mix(in srgb, var(--danger) 18%, transparent); color: #ffd0d5; }
  .msg.ok { background: color-mix(in srgb, var(--ok) 16%, transparent); color: #c9f7e0; }
  .badge {
    display: inline-block;
    font-size: .72rem;
    font-weight: 700;
    letter-spacing: .04em;
    text-transform: uppercase;
    padding: .2rem .5rem;
    border-radius: 999px;
    background: #243041;
    color: var(--muted);
  }
  .badge.pending { background: color-mix(in srgb, var(--warn) 22%, #243041); color: #ffd89a; }
  .badge.approved { background: color-mix(in srgb, var(--ok) 22%, #243041); color: #b8f5d6; }
  .item h2 { font-size: 1.05rem; margin: .4rem 0; }
  .meta { color: var(--muted); font-size: .88rem; line-height: 1.5; }
  .hidden { display: none !important; }
  .topbar { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem; }
</style>
</head>
<body>
<main>
  <h1>Approve MCP changes</h1>
  <p class="sub">Sign in with the approval password. The AI cannot approve changes by itself. After you approve, tell the agent it is approved so it can proceed with the approval id.</p>

  <section id="login" class="card">
    <label for="password">Approval password</label>
    <input id="password" type="password" autocomplete="current-password" placeholder="Enter approval password"/>
    <div class="row">
      <button class="primary" id="signIn" type="button">Sign in</button>
    </div>
    <div id="loginMsg" class="msg err hidden"></div>
  </section>

  <section id="app" class="hidden">
    <div class="topbar">
      <div class="meta">Signed in · refresh every 20s</div>
      <div class="row">
        <button class="ghost" id="refresh" type="button">Refresh</button>
        <button class="ghost" id="signOut" type="button">Sign out</button>
      </div>
    </div>
    <div id="list"></div>
    <div id="appMsg" class="msg ok hidden"></div>
  </section>
</main>
<script>
const KEY = 'gsmcp-operator';
const els = {
  login: document.getElementById('login'),
  app: document.getElementById('app'),
  password: document.getElementById('password'),
  loginMsg: document.getElementById('loginMsg'),
  appMsg: document.getElementById('appMsg'),
  list: document.getElementById('list'),
};

function saved() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; }
}
function save(password) {
  sessionStorage.setItem(KEY, JSON.stringify({ password }));
}
function clear() { sessionStorage.removeItem(KEY); }

async function api(path, opts = {}) {
  const auth = saved();
  if (!auth?.password) throw new Error('Not signed in');
  const headers = {
    'authorization': 'Bearer ' + auth.password,
    'accept': 'application/json',
  };
  if (opts.body) headers['content-type'] = 'application/json';
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || ('Request failed (' + res.status + ')'));
    throw err;
  }
  return data;
}

function show(el, text, kind) {
  el.textContent = text;
  el.className = 'msg ' + kind;
  el.classList.remove('hidden');
}

async function signIn() {
  els.loginMsg.classList.add('hidden');
  const password = els.password.value.trim();
  if (password.length < 16) {
    show(els.loginMsg, 'Approval password looks too short.', 'err');
    return;
  }
  save(password);
  try {
    await refresh();
    els.login.classList.add('hidden');
    els.app.classList.remove('hidden');
  } catch (e) {
    clear();
    show(els.loginMsg, e.message || 'Sign-in failed', 'err');
  }
}

function signOut() {
  clear();
  els.app.classList.add('hidden');
  els.login.classList.remove('hidden');
  els.password.value = '';
}

async function refresh() {
  els.appMsg.classList.add('hidden');
  const data = await api('/operators/approvals');
  const items = data.approvals || [];
  if (!items.length) {
    els.list.innerHTML = '<div class="card meta">No pending changes right now. When the AI asks to change something, requests appear here.</div>';
    return;
  }
  els.list.innerHTML = items.map((item) => {
    const exp = new Date(item.expiresAt).toLocaleString();
    return '<article class="card item" data-id="' + item.id + '">'
      + '<span class="badge ' + item.status + '">' + item.status + '</span>'
      + '<h2>' + escapeHtml(item.summary) + '</h2>'
      + '<div class="meta">Module: <code>' + escapeHtml(item.module) + '</code> · Action: <code>'
      + escapeHtml(item.action) + '</code><br/>Permission: '
      + escapeHtml(item.permission) + '<br/>Expires: ' + escapeHtml(exp) + '</div>'
      + '<div class="row">'
      + (item.status === 'pending'
        ? '<button class="ok" data-act="approve">Approve</button><button class="danger" data-act="deny">Deny</button>'
        : '<span class="meta">Already approved — tell the AI to apply the change now.</span>')
      + '</div></article>';
  }).join('');
}

els.list.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-act]');
  if (!btn) return;
  const card = btn.closest('[data-id]');
  const id = card?.dataset.id;
  if (!id) return;
  btn.disabled = true;
  try {
    if (btn.dataset.act === 'approve') {
      await api('/operators/approvals/' + id + '/approve', { method: 'POST', body: JSON.stringify({ confirm: true }) });
      show(els.appMsg, 'Approved. Tell the AI agent to apply the change now.', 'ok');
    } else {
      await api('/operators/approvals/' + id + '/deny', { method: 'POST', body: JSON.stringify({ confirm: true }) });
      show(els.appMsg, 'Denied. The AI cannot apply that change.', 'ok');
    }
    await refresh();
  } catch (e) {
    show(els.appMsg, e.message || 'Failed', 'err');
    btn.disabled = false;
  }
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

document.getElementById('signIn').onclick = signIn;
document.getElementById('signOut').onclick = signOut;
document.getElementById('refresh').onclick = () => refresh().catch((e) => show(els.appMsg, e.message, 'err'));
els.password.addEventListener('keydown', (e) => { if (e.key === 'Enter') signIn(); });

if (saved()?.password) {
  els.login.classList.add('hidden');
  els.app.classList.remove('hidden');
  refresh().catch(() => signOut());
}
setInterval(() => {
  if (!els.app.classList.contains('hidden')) refresh().catch(() => {});
}, 20000);
</script>
</body>
</html>`;
  res
    .status(200)
    .set({
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-frame-options": "DENY",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'",
    })
    .send(html);
}
