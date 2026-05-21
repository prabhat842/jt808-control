'use strict';

// ── State ─────────────────────────────────────────────────────────────────

let services    = [];
let activeLogId = null;
let sseSource   = null;

// ── API calls ─────────────────────────────────────────────────────────────

async function api(action, id) {
  const url = id ? `/api/${action}/${id}` : `/api/${action}`;
  try {
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) console.error(`${url} failed:`, res.status);
  } catch (e) {
    console.error('API error:', e);
  }
}

async function loadStatus() {
  try {
    const res  = await fetch('/api/status');
    const data = await res.json();
    document.getElementById('panelStatus').textContent = 'online';
    document.getElementById('panelStatus').classList.add('ok');
    renderCards(data);
    services = data;
    if (!activeLogId && data.length) switchLog(data[0].id);
  } catch {
    document.getElementById('panelStatus').textContent = 'offline';
    document.getElementById('panelStatus').classList.remove('ok');
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────

function stateLabel(s) {
  return { RUNNING: '● Running', STOPPED: '○ Stopped', STARTING: '◌ Starting…', STOPPING: '◌ Stopping…' }[s] ?? s;
}

function uptime(startedAt) {
  if (!startedAt) return '';
  const s = Math.floor((Date.now() - new Date(startedAt)) / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s`;
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
}

function renderCards(data) {
  const container = document.getElementById('serviceCards');
  const logTabs   = document.getElementById('logTabs');

  container.innerHTML = data.map(svc => {
    const stClass = svc.state.toLowerCase();
    const running  = svc.state === 'RUNNING';
    const stopping = svc.state === 'STOPPING' || svc.state === 'STARTING';
    return `
    <div class="card ${stClass}">
      <div class="card-header">
        <div>
          <div class="card-title">${svc.name}</div>
          <div class="card-desc">${svc.description}</div>
        </div>
        <div class="status-dot">
          <span class="dot ${stClass}"></span>
          <span>${stateLabel(svc.state)}</span>
        </div>
      </div>
      <div class="card-meta">
        ${svc.pid > 0 ? `<span>PID&nbsp;${svc.pid}</span>` : ''}
        ${running && svc.startedAt ? `<span>Up&nbsp;${uptime(svc.startedAt)}</span>` : ''}
      </div>
      <div class="card-footer">
        ${running
          ? `<button class="btn btn-danger"  onclick="api('stop','${svc.id}')" ${stopping ? 'disabled' : ''}>■ Stop</button>`
          : `<button class="btn btn-success" onclick="api('start','${svc.id}')" ${stopping ? 'disabled' : ''}>▶ Start</button>`
        }
        <button class="btn btn-sm" onclick="switchLog('${svc.id}')">Logs</button>
      </div>
    </div>`;
  }).join('');

  logTabs.innerHTML = data.map(svc =>
    `<button class="log-tab ${svc.id === activeLogId ? 'active' : ''}"
             onclick="switchLog('${svc.id}')">${svc.name}</button>`
  ).join('');
}

// ── Log streaming (SSE) ───────────────────────────────────────────────────

function switchLog(id) {
  if (activeLogId === id) return;
  activeLogId = id;
  clearLog();

  if (sseSource) { sseSource.close(); sseSource = null; }

  // re-render tabs
  document.querySelectorAll('.log-tab').forEach(t => {
    t.classList.toggle('active', t.textContent === (services.find(s => s.id === id)?.name ?? id));
  });

  sseSource = new EventSource(`/api/logs/${id}`);
  sseSource.onmessage = e => appendLog(e.data);
  sseSource.onerror   = () => appendLog('--- log stream disconnected ---');
}

function appendLog(line) {
  const box = document.getElementById('logBox');
  const div = document.createElement('div');
  div.className = 'log-line ' + lineClass(line);
  div.textContent = line;
  box.appendChild(div);

  // cap to 2000 lines
  while (box.childElementCount > 2000) box.removeChild(box.firstChild);

  if (document.getElementById('autoScroll').checked) {
    box.scrollTop = box.scrollHeight;
  }
}

function lineClass(line) {
  const l = line.toLowerCase();
  if (l.includes('--- '))   return 'system';
  if (l.includes(' error ') || l.includes('exception')) return 'error';
  if (l.includes(' warn '))  return 'warn';
  if (l.includes(' debug ') || l.includes('rx ') || l.includes('tx ')) return 'debug';
  return 'info';
}

function clearLog() {
  document.getElementById('logBox').innerHTML = '';
}

// ── Boot ──────────────────────────────────────────────────────────────────

loadStatus();
setInterval(loadStatus, 2000);
