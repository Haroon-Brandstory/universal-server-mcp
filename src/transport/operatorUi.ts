import type { Response } from "express";

/** Browser UI for dual-auth approvals. No build step. */
export function sendOperatorUi(res: Response): void {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>BrandStory Operators</title>
<style>
  :root {
    /* brandstoryglobal.com tokens */
    --bg: #000000;
    --panel: #1a1a1a;
    --panel-2: #212025;
    --text: #ffffff;
    --muted: rgba(255, 255, 255, 0.65);
    --accent: #E73D26;
    --accent-2: #F15D22;
    --accent-hot: #ff5c39;
    --cream: #FDF6F0;
    --ok: #2fbf7a;
    --warn: #FFD675;
    --danger: #D0161B;
    --border: rgba(255, 255, 255, 0.12);
    --focus: #ff5a2c;
    --shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    font-family: "Poppins", "Gilroy-regular", "Segoe UI", system-ui, sans-serif;
    background:
      radial-gradient(900px 480px at 12% -12%, rgba(231, 61, 38, 0.22) 0%, transparent 55%),
      radial-gradient(700px 420px at 100% 0%, rgba(241, 93, 34, 0.12) 0%, transparent 50%),
      linear-gradient(180deg, #0F0F0F, var(--bg));
    color: var(--text);
  }
  main { max-width: 920px; margin: 0 auto; padding: 1.75rem 1.15rem 4rem; }
  .brand {
    display: flex; align-items: center; gap: .65rem; margin-bottom: .85rem;
    color: var(--muted); font-size: .78rem; letter-spacing: .06em; text-transform: uppercase;
  }
  .brand-mark {
    width: .7rem; height: .7rem; border-radius: 2px;
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    box-shadow: 0 0 16px rgba(231, 61, 38, 0.55);
  }
  h1 {
    font-size: 1.65rem; font-weight: 700; margin: 0 0 .3rem;
    letter-spacing: -0.03em; font-family: "Poppins", "Gilroy-Bold", system-ui, sans-serif;
  }
  .sub { color: var(--muted); margin: 0 0 1.35rem; line-height: 1.5; max-width: 62ch; }
  .card {
    background: color-mix(in srgb, var(--panel) 92%, #2E2221);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 1.15rem 1.2rem;
    margin-bottom: .85rem;
    box-shadow: var(--shadow);
  }
  label { display: block; font-size: .82rem; color: var(--muted); margin: .7rem 0 .3rem; }
  input[type="password"], input[type="text"] {
    width: 100%;
    padding: .72rem .85rem;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: #111111;
    color: var(--text);
    font-size: 1rem;
  }
  input:focus { outline: 2px solid rgba(255, 90, 44, 0.55); border-color: var(--accent-hot); }
  .row { display: flex; gap: .65rem; flex-wrap: wrap; align-items: center; }
  .row.spread { justify-content: space-between; }
  button, .btn {
    border: 0;
    border-radius: 999px;
    padding: .62rem 1.1rem;
    font-weight: 600;
    cursor: pointer;
    font-size: .9rem;
    font-family: inherit;
  }
  button.primary {
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    color: #fff;
    box-shadow: 0 8px 24px rgba(231, 61, 38, 0.35);
  }
  button.primary:hover { filter: brightness(1.06); }
  button.ghost { background: transparent; color: var(--text); border: 1px solid var(--border); }
  button.ghost:hover { border-color: rgba(255, 92, 57, 0.55); color: #fff; }
  button.ok { background: var(--ok); color: #062016; }
  button.danger {
    background: transparent;
    color: #ff8a8f;
    border: 1px solid color-mix(in srgb, var(--danger) 50%, var(--border));
  }
  button:disabled { opacity: .45; cursor: not-allowed; }
  .msg { margin-top: .9rem; padding: .7rem .85rem; border-radius: 12px; font-size: .9rem; }
  .msg.err { background: rgba(208, 22, 27, 0.18); color: #ffd0d5; }
  .msg.ok { background: rgba(47, 191, 122, 0.14); color: #c9f7e0; }
  .badge {
    display: inline-block;
    font-size: .68rem;
    font-weight: 700;
    letter-spacing: .05em;
    text-transform: uppercase;
    padding: .18rem .48rem;
    border-radius: 999px;
    background: #2a2a2a;
    color: var(--muted);
  }
  .badge.pending { background: rgba(255, 214, 117, 0.16); color: var(--warn); }
  .badge.approved { background: rgba(47, 191, 122, 0.18); color: #b8f5d6; }
  .badge.denied { background: rgba(208, 22, 27, 0.2); color: #ffc4cb; }
  .chip {
    display: inline-block;
    font-size: .72rem;
    padding: .15rem .45rem;
    border-radius: 6px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    color: rgba(255, 255, 255, 0.75);
    margin-right: .35rem;
  }
  .item { display: grid; grid-template-columns: auto 1fr; gap: .85rem; align-items: start; }
  .item h2 { font-size: 1.02rem; margin: .35rem 0 .45rem; line-height: 1.35; }
  .meta { color: var(--muted); font-size: .86rem; line-height: 1.5; }
  .meta code {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: .8rem;
    color: #FFEEC2;
  }
  .hidden { display: none !important; }
  .topbar { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: .85rem; flex-wrap: wrap; }
  .bulkbar {
    display: flex; justify-content: space-between; align-items: center; gap: .75rem; flex-wrap: wrap;
    padding: .75rem 1rem; margin-bottom: .85rem;
    background: linear-gradient(90deg, rgba(231, 61, 38, 0.12), rgba(26, 26, 26, 0.95));
    border: 1px solid rgba(255, 90, 44, 0.28); border-radius: 14px;
  }
  .bulkbar .count { color: var(--muted); font-size: .88rem; }
  .check {
    width: 1.15rem; height: 1.15rem; margin-top: .2rem; accent-color: var(--accent-hot); cursor: pointer;
  }
  .filters { display: flex; gap: .4rem; flex-wrap: wrap; margin-bottom: .85rem; }
  .filters button {
    border-radius: 8px; padding: .4rem .75rem; font-size: .82rem;
    background: transparent; color: var(--muted); border: 1px solid var(--border);
  }
  .filters button.active {
    background: rgba(255, 90, 44, 0.15);
    color: #fff;
    border-color: rgba(255, 90, 44, 0.45);
  }
  .check-label { display: flex; align-items: center; gap: .5rem; color: var(--muted); font-size: .88rem; cursor: pointer; user-select: none; }
  .empty { text-align: center; padding: 1.75rem 1rem; color: var(--muted); }
  .stats { font-size: .82rem; color: var(--muted); }
  .actions { margin-top: .75rem; }
  @media (max-width: 640px) {
    .item { grid-template-columns: auto 1fr; }
    button { padding: .55rem .9rem; }
  }
</style>
</head>
<body>
<main>
  <div class="brand"><span class="brand-mark" aria-hidden="true"></span> BrandStory Global</div>
  <h1>MCP Operators</h1>
  <p class="sub">Approve or deny AI change requests. The AI cannot self-approve. After you approve, tell the agent to proceed with the approval id.</p>

  <section id="login" class="card">
    <label for="password">Approval password</label>
    <input id="password" type="password" autocomplete="current-password" placeholder="Enter MCP_OPERATOR_TOKEN"/>
    <div class="row" style="margin-top:1rem">
      <button class="primary" id="signIn" type="button">Sign in</button>
    </div>
    <div id="loginMsg" class="msg err hidden"></div>
  </section>

  <section id="app" class="hidden">
    <div class="topbar">
      <div class="stats" id="stats">Signed in</div>
      <div class="row">
        <button class="ghost" id="refresh" type="button">Refresh</button>
        <button class="ghost" id="signOut" type="button">Sign out</button>
      </div>
    </div>

    <div class="filters" id="filters">
      <button type="button" data-filter="pending" class="active">Pending</button>
      <button type="button" data-filter="approved">Approved</button>
      <button type="button" data-filter="all">All</button>
    </div>

    <div id="bulkbar" class="bulkbar hidden">
      <label class="check-label">
        <input type="checkbox" id="selectAll" class="check"/>
        <span>Select all pending</span>
      </label>
      <div class="row">
        <span class="count" id="selectedCount">0 selected</span>
        <button class="ok" id="bulkApprove" type="button" disabled>Approve selected</button>
        <button class="danger" id="bulkDeny" type="button" disabled>Deny selected</button>
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
  stats: document.getElementById('stats'),
  bulkbar: document.getElementById('bulkbar'),
  selectAll: document.getElementById('selectAll'),
  selectedCount: document.getElementById('selectedCount'),
  bulkApprove: document.getElementById('bulkApprove'),
  bulkDeny: document.getElementById('bulkDeny'),
};

let allItems = [];
let filter = 'pending';
let selected = new Set();

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
  if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
  return data;
}

function show(el, text, kind) {
  el.textContent = text;
  el.className = 'msg ' + kind;
  el.classList.remove('hidden');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function visibleItems() {
  if (filter === 'all') return allItems;
  return allItems.filter((i) => i.status === filter);
}

function pendingIds() {
  return visibleItems().filter((i) => i.status === 'pending').map((i) => i.id);
}

function syncBulkUi() {
  const pending = pendingIds();
  const showBar = pending.length > 0 && (filter === 'pending' || filter === 'all');
  els.bulkbar.classList.toggle('hidden', !showBar);
  const n = selected.size;
  els.selectedCount.textContent = n + ' selected';
  els.bulkApprove.disabled = n === 0;
  els.bulkDeny.disabled = n === 0;
  els.selectAll.checked = pending.length > 0 && pending.every((id) => selected.has(id));
  els.selectAll.indeterminate = n > 0 && !els.selectAll.checked;
}

function render() {
  const items = visibleItems();
  const pending = allItems.filter((i) => i.status === 'pending').length;
  const approved = allItems.filter((i) => i.status === 'approved').length;
  els.stats.textContent = pending + ' pending · ' + approved + ' approved · auto-refresh 20s';

  if (!items.length) {
    els.list.innerHTML = '<div class="card empty">No ' + (filter === 'all' ? '' : filter + ' ') + 'requests. When the AI asks to change something, tickets show here.</div>';
    syncBulkUi();
    return;
  }

  els.list.innerHTML = items.map((item) => {
    const exp = new Date(item.expiresAt).toLocaleString();
    const created = new Date(item.createdAt).toLocaleString();
    const isPending = item.status === 'pending';
    const checked = selected.has(item.id) ? ' checked' : '';
    const check = isPending
      ? '<input type="checkbox" class="check" data-select="' + item.id + '"' + checked + ' aria-label="Select request"/>'
      : '<span></span>';
    const detailBits = [];
    if (item.detail?.pathPrefix) detailBits.push('Path: <code>' + escapeHtml(String(item.detail.pathPrefix)) + '</code>');
    if (item.detail?.repo) detailBits.push('Repo: <code>' + escapeHtml(String(item.detail.repo)) + '</code>');
    if (item.detail?.serverId) detailBits.push('Server: <code>' + escapeHtml(String(item.detail.serverId)) + '</code>');
    if (item.detail?.usesLeft != null) detailBits.push('Uses left: ' + escapeHtml(String(item.detail.usesLeft)));
    return '<article class="card item" data-id="' + item.id + '">'
      + check
      + '<div>'
      + '<div class="row">'
      + '<span class="badge ' + item.status + '">' + item.status + '</span>'
      + '<span class="chip">' + escapeHtml(item.module) + '</span>'
      + '<span class="chip">' + escapeHtml(item.permission) + '</span>'
      + '</div>'
      + '<h2>' + escapeHtml(item.summary) + '</h2>'
      + '<div class="meta">Action: <code>' + escapeHtml(item.action) + '</code><br/>'
      + 'Created: ' + escapeHtml(created) + ' · Expires: ' + escapeHtml(exp)
      + (detailBits.length ? '<br/>' + detailBits.join(' · ') : '')
      + '</div>'
      + '<div class="row actions">'
      + (isPending
        ? '<button class="ok" data-act="approve">Approve</button><button class="danger" data-act="deny">Deny</button>'
        : item.status === 'approved'
          ? '<span class="meta">Approved — tell the AI to apply with this id.</span>'
          : '<span class="meta">Denied.</span>')
      + '</div></div></article>';
  }).join('');
  syncBulkUi();
}

async function signIn() {
  els.loginMsg.classList.add('hidden');
  const password = els.password.value.trim();
  if (password.length < 16) {
    show(els.loginMsg, 'Approval password looks too short (≥16 chars).', 'err');
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
  selected.clear();
  allItems = [];
  els.app.classList.add('hidden');
  els.login.classList.remove('hidden');
  els.password.value = '';
}

async function refresh() {
  els.appMsg.classList.add('hidden');
  const data = await api('/operators/approvals');
  allItems = data.approvals || [];
  const live = new Set(allItems.map((i) => i.id));
  for (const id of [...selected]) if (!live.has(id) || allItems.find((i) => i.id === id)?.status !== 'pending') selected.delete(id);
  render();
}

async function actOne(id, act, btn) {
  if (btn) btn.disabled = true;
  try {
    await api('/operators/approvals/' + id + '/' + act, { method: 'POST', body: JSON.stringify({ confirm: true }) });
    selected.delete(id);
    show(els.appMsg, act === 'approve'
      ? 'Approved. Tell the AI agent to apply the change now.'
      : 'Denied. The AI cannot apply that change.', 'ok');
    await refresh();
  } catch (e) {
    show(els.appMsg, e.message || 'Failed', 'err');
    if (btn) btn.disabled = false;
  }
}

async function actBulk(act) {
  const ids = [...selected];
  if (!ids.length) return;
  const label = act === 'approve' ? 'Approve' : 'Deny';
  if (!confirm(label + ' ' + ids.length + ' selected request(s)?')) return;
  els.bulkApprove.disabled = true;
  els.bulkDeny.disabled = true;
  try {
    const data = await api('/operators/approvals/bulk', {
      method: 'POST',
      body: JSON.stringify({ confirm: true, action: act, ids }),
    });
    selected.clear();
    const ok = (data.succeeded || []).length;
    const fail = (data.failed || []).length;
    show(els.appMsg,
      label + 'd ' + ok + ' request(s)' + (fail ? ' · ' + fail + ' failed' : '') + '. Tell the AI if any were approved.',
      fail && !ok ? 'err' : 'ok');
    await refresh();
  } catch (e) {
    show(els.appMsg, e.message || 'Bulk action failed', 'err');
    syncBulkUi();
  }
}

els.list.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-act]');
  if (!btn) return;
  const card = btn.closest('[data-id]');
  const id = card?.dataset.id;
  if (!id) return;
  await actOne(id, btn.dataset.act, btn);
});

els.list.addEventListener('change', (ev) => {
  const box = ev.target.closest('input[data-select]');
  if (!box) return;
  if (box.checked) selected.add(box.dataset.select);
  else selected.delete(box.dataset.select);
  syncBulkUi();
});

els.selectAll.addEventListener('change', () => {
  const pending = pendingIds();
  if (els.selectAll.checked) pending.forEach((id) => selected.add(id));
  else pending.forEach((id) => selected.delete(id));
  render();
});

document.getElementById('filters').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-filter]');
  if (!btn) return;
  filter = btn.dataset.filter;
  document.querySelectorAll('#filters button').forEach((b) => b.classList.toggle('active', b === btn));
  selected.clear();
  render();
});

els.bulkApprove.onclick = () => actBulk('approve');
els.bulkDeny.onclick = () => actBulk('deny');
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
