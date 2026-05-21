'use strict';

// ── State ─────────────────────────────────────────────────────────────────

let services    = [];
let activeLogId = null;
let sseSource   = null;

// ── API ───────────────────────────────────────────────────────────────────

async function api(action, id) {
  const url = id ? `/api/${action}/${id}` : `/api/${action}`;
  try {
    await fetch(url, { method: 'POST' });
  } catch (e) {
    console.error('API error:', e);
  }
}

// Start/stop all services in a group (vehicle | infrastructure)
function apiGroup(action, group) {
  const targets = services.filter(s => s.group === group);
  targets.forEach(s => api(action, s.id));
}

// ── Status polling ────────────────────────────────────────────────────────

async function loadStatus() {
  try {
    const res  = await fetch('/api/status');
    const data = await res.json();
    document.getElementById('panelStatus').textContent = 'online';
    document.getElementById('panelStatus').classList.add('ok');
    services = data;
    renderAll(data);
    if (!activeLogId && data.length) switchLog(data[0].id);
  } catch {
    document.getElementById('panelStatus').textContent = 'offline';
    document.getElementById('panelStatus').classList.remove('ok');
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────

function stateLabel(s) {
  return { RUNNING: 'Running', STOPPED: 'Stopped', STARTING: 'Starting…', STOPPING: 'Stopping…' }[s] ?? s;
}

function uptime(startedAt) {
  if (!startedAt) return '';
  const s = Math.floor((Date.now() - new Date(startedAt)) / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s`;
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
}

function cardHtml(svc) {
  const cls     = svc.state.toLowerCase();
  const running  = svc.state === 'RUNNING';
  const busy     = svc.state === 'STARTING' || svc.state === 'STOPPING';
  return `
  <div class="card ${cls}" id="card-${svc.id}">
    <div class="card-top">
      <div>
        <div class="card-name">${svc.name}</div>
        <div class="card-desc">${svc.description}</div>
      </div>
      <div class="status-chip ${cls}">
        <span class="dot"></span>${stateLabel(svc.state)}
      </div>
    </div>
    <div class="card-meta">
      ${svc.pid > 0  ? `<span>PID&nbsp;${svc.pid}</span>` : ''}
      ${running && svc.startedAt ? `<span>↑&nbsp;${uptime(svc.startedAt)}</span>` : ''}
    </div>
    <div class="card-footer">
      ${running
        ? `<button class="btn btn-stop"    onclick="api('stop','${svc.id}')" ${busy?'disabled':''}>■ Stop</button>`
        : `<button class="btn btn-success" onclick="api('start','${svc.id}')" ${busy?'disabled':''}>▶ Start</button>`
      }
      <button class="btn btn-sm" onclick="switchLog('${svc.id}')">Logs</button>
    </div>
  </div>`;
}

function renderAll(data) {
  const vehicle = data.filter(s => s.group === 'vehicle');
  const infra   = data.filter(s => s.group === 'infrastructure');

  document.getElementById('vehicleCards').innerHTML = vehicle.map(cardHtml).join('');
  document.getElementById('infraCards').innerHTML   = infra.map(cardHtml).join('');

  // log tabs
  document.getElementById('logTabs').innerHTML = data.map(s =>
    `<button class="log-tab ${s.id === activeLogId ? 'active' : ''}"
             onclick="switchLog('${s.id}')">${s.name}</button>`
  ).join('');
}

// ── Log streaming via SSE ─────────────────────────────────────────────────

function switchLog(id) {
  if (activeLogId === id) return;
  activeLogId = id;
  clearLog();

  if (sseSource) { sseSource.close(); sseSource = null; }

  document.querySelectorAll('.log-tab').forEach(t => {
    const svc = services.find(s => s.id === id);
    t.classList.toggle('active', t.textContent === (svc?.name ?? id));
  });

  sseSource = new EventSource(`/api/logs/${id}`);
  sseSource.onmessage = e => appendLog(e.data);
  sseSource.onerror   = () => appendLog('--- stream disconnected ---');
}

function appendLog(line) {
  const box = document.getElementById('logBox');

  // remove placeholder
  const ph = box.querySelector('.log-placeholder');
  if (ph) ph.remove();

  const div = document.createElement('div');
  div.className = 'log-line ' + lineClass(line);
  div.textContent = line;
  box.appendChild(div);

  while (box.childElementCount > 2000) box.removeChild(box.firstChild);

  if (document.getElementById('autoScroll').checked) {
    box.scrollTop = box.scrollHeight;
  }
}

function lineClass(line) {
  const l = line.toLowerCase();
  if (/^rx /.test(l) || l.startsWith('rx ')) return 'wire-rx';
  if (/^tx /.test(l) || l.startsWith('tx ')) return 'wire-tx';
  if (l.includes('--- '))          return 'system';
  if (l.includes('error') || l.includes('exception')) return 'error';
  if (l.includes(' warn '))        return 'warn';
  if (l.includes(' debug '))       return 'debug';
  return 'info';
}

function clearLog() {
  const box = document.getElementById('logBox');
  box.innerHTML = '<div class="log-placeholder">Loading…</div>';
}

// ── Boot ──────────────────────────────────────────────────────────────────

loadStatus();
setInterval(loadStatus, 2000);
