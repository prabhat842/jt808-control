'use strict';

// ── constants ─────────────────────────────────────────────────────────────
const NUM_TILES   = 4;
const DMS_URL     = 'http://localhost:7500/dms/state';
const RTVS_HOST      = location.hostname;  // RTVS runs on same host
const RTVS_PORT      = 8089;              // studio HTTP + /ws video
const RTVS_TALK_PORT = 8090;              // talkback WebSocket (CVNet connects here)
const ALARM_NAMES = { 0:'none', 1:'fatigue', 2:'distraction', 5:'no seatbelt', 6:'cam blocked' };
const MAX_CHANNELS = 6;

// ── DOM refs ──────────────────────────────────────────────────────────────
const healthEl    = document.getElementById('server-health');
const videoGrid   = document.getElementById('video-grid');
const vehicleList = document.getElementById('vehicle-list');
const sidebar     = document.getElementById('sidebar');
const dmsBadge    = document.getElementById('dms-badge');
const dmsFace     = document.getElementById('dms-face');
const dmsEyes     = document.getElementById('dms-eyes');
const dmsBar      = document.getElementById('dms-bar');
const dmsFatigue  = document.getElementById('dms-fatigue');
const dmsDistract = document.getElementById('dms-distracted');
const dmsSeatbelt = document.getElementById('dms-seatbelt');
const dmsAlarm    = document.getElementById('dms-alarm');

// ── helpers ───────────────────────────────────────────────────────────────
const fmt = n => n >= 1e6 ? (n/1e6).toFixed(1)+' MB' : n >= 1e3 ? (n/1e3).toFixed(1)+' KB' : n+' B';
const indicator = (ok, t, f) => `<span class="${ok?'ok':'warn'}">${ok?t:f}</span>`;
const sessionKey = s => s.terminalId + '#' + s.channelId;
const shortId = id => id.replace(/^0+/, '') || '0';
const stoppedSessions = new Set();
const stopKey = (terminalId, channelId) => terminalId + '#' + channelId;
const markStopped = key => stoppedSessions.add(key);
const clearStopped = key => stoppedSessions.delete(key);
const isStopped = key => stoppedSessions.has(key);

// ── VideoTile ─────────────────────────────────────────────────────────────
class VideoTile {
  constructor(index) {
    this.index      = index;
    this.terminalId = null;
    this.channelId  = null;
    this.ws         = null;
    this.decoder    = null;
    this.pending    = null;
    this.firstFrame = true;
    this.audioLevel = 0;

    this.el = this._build();
    videoGrid.appendChild(this.el);
    this.canvas = this.el.querySelector('.tile-canvas');
    this.ctx    = this.canvas.getContext('2d');
    this.badge  = this.el.querySelector('.tile-badge');
    this.label  = this.el.querySelector('.tile-stream-label');
    this.stats  = this.el.querySelector('.tile-stats');
    this.audioBars = Array.from(this.el.querySelectorAll('.tile-audio-meter i'));
  }

  _build() {
    const div = document.createElement('div');
    div.className = 'tile tile--empty';
    div.dataset.index = this.index;
    div.innerHTML = `
      <canvas class="tile-canvas"></canvas>
      <div class="tile-empty-overlay">
        <div class="tile-add-icon">+</div>
        <span class="tile-empty-label">Add stream</span>
      </div>
      <div class="tile-stats">
        <span class="tile-audio-meter" aria-hidden="true">
          <i></i><i></i><i></i><i></i>
        </span>
      </div>
      <div class="tile-bar">
        <span class="tile-stream-label"></span>
        <span class="tile-badge stopped">—</span>
      </div>
      <div class="tile-controls">
        <button class="tile-btn tile-btn--fs" title="Fullscreen">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 5V1h4M11 1h4v4M15 11v4h-4M5 15H1v-4"/></svg>
        </button>
        <button class="tile-btn tile-btn--talk" title="Start talkback">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1a3 3 0 0 1 3 3v3a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3z"/><path d="M3 7a5 5 0 0 0 10 0M8 12v3M5 15h6"/></svg>
        </button>
        <button class="tile-btn tile-btn--stop" title="Stop stream">
          <svg viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor" stroke="none"/></svg>
        </button>
        <button class="tile-btn tile-btn--close" title="Remove">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>
        </button>
      </div>`;

    div.querySelector('.tile-empty-overlay').addEventListener('click', () => tileManager.selectTile(this.index));
    div.querySelector('.tile-btn--fs').addEventListener('click',   e => { e.stopPropagation(); this.fullscreen(); });
    div.querySelector('.tile-btn--talk').addEventListener('click', e => { e.stopPropagation(); talkback.toggleTile(this); });
    div.querySelector('.tile-btn--stop').addEventListener('click', e => { e.stopPropagation(); this.stop(); });
    div.querySelector('.tile-btn--close').addEventListener('click',e => { e.stopPropagation(); this.close(); });
    div.addEventListener('click', () => tileManager.selectTile(this.index));
    return div;
  }

  assign(terminalId, channelId) {
    if (isStopped(stopKey(terminalId, channelId))) return;
    this.close();
    this.terminalId = terminalId;
    this.channelId  = channelId;
    this.el.classList.remove('tile--empty', 'tile--error');
    this.el.classList.add('tile--connecting');
    this.label.textContent = shortId(terminalId) + ' · ch' + channelId;
    this._setBadge('connecting', 'connecting');
    this._connectWs();
  }

  ensureConnected() {
    if (!this.terminalId) return false;
    const ready = this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING);
    if (ready) return true;
    this._resetDecoder();
    this.pending = null;
    this.firstFrame = true;
    this.el.classList.remove('tile--error', 'tile--live');
    this.el.classList.add('tile--connecting');
    this._setBadge('reconnecting', 'connecting');
    this._connectWs();
    return true;
  }

  close() {
    if (this.ws) { try { this.ws.close(); } catch(_){} this.ws = null; }
    this._resetDecoder();
    this.terminalId = null;
    this.channelId  = null;
    this.firstFrame = true;
    this.setAudioLevel(0);
    this.el.classList.remove('tile--connecting', 'tile--live', 'tile--error');
    this.el.classList.add('tile--empty');
    this.label.textContent = '';
    this._setBadge('—', 'stopped');
    if (this.canvas.width) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  stop() {
    const tid = this.terminalId, ch = this.channelId;
    if (tid) markStopped(stopKey(tid, ch));
    this.close();
    if (tid) fetch(`/api/live/stop?terminal=${tid}&channel=${ch}`).catch(() => {});
  }

  fullscreen() {
    (this.el.requestFullscreen || this.el.webkitRequestFullscreen || (() => {})).call(this.el);
  }

  updateStats(frames, bytes, bps) {
    if (!this.terminalId) return;
    this.setAudioLevel(this.audioLevel);
  }

  isEmpty() { return !this.terminalId; }
  key()     { return this.terminalId ? this.terminalId + '#' + this.channelId : null; }

  // ── WebSocket + WebCodecs ─────────────────────────────────────────────

  _connectWs() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Connect directly to RTVS WebSocket (different port from control panel)
    const ws = new WebSocket(`${proto}//${location.hostname}:8089/ws`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ terminalId: this.terminalId, channelId: this.channelId }));
      this._setBadge('buffering', 'buffering');
    };
    ws.onmessage = evt => this._onMessage(evt);
    ws.onclose   = () => {
      if (this.ws === ws) {
        this._setBadge('offline', 'stopped');
        this.el.classList.remove('tile--live', 'tile--connecting');
      }
    };
    ws.onerror = () => { this.el.classList.add('tile--error'); this._setBadge('error', 'error'); };
  }

  _onMessage(evt) {
    if (!(evt.data instanceof ArrayBuffer)) {
      try { const m = JSON.parse(evt.data); if (m.type === 'reset') { this._resetDecoder(); this.firstFrame = true; } } catch(_) {}
      return;
    }
    const data = new Uint8Array(evt.data);

    if (data.length === 12 && data[0] === 0xFF && data[1] === 0xFE && data[2] === 98) {
      this.pending = {
        keyframe: data[3] === 0,
        tsMs: Number(
          (BigInt(data[4])<<56n)|(BigInt(data[5])<<48n)|(BigInt(data[6])<<40n)|(BigInt(data[7])<<32n)|
          (BigInt(data[8])<<24n)|(BigInt(data[9])<<16n)|(BigInt(data[10])<<8n)|BigInt(data[11]))
      };
      return;
    }

    if (!this.pending) return;
    const { keyframe, tsMs } = this.pending;
    this.pending = null;

    if (!keyframe && (!this.decoder || this.decoder.state !== 'configured')) return;
    if (keyframe && (!this.decoder || this.decoder.state !== 'configured')) {
      this._initDecoder(this._codecFromSps(data));
      if (!this.decoder) return;
    }
    if (!this.decoder || this.decoder.state !== 'configured') return;

    if (this.firstFrame && keyframe) {
      this.firstFrame = false;
      this.el.classList.remove('tile--connecting');
      this.el.classList.add('tile--live');
      this._setBadge('live', 'live');
    }
    try {
      this.decoder.decode(new EncodedVideoChunk({ type: keyframe ? 'key' : 'delta', timestamp: tsMs * 1000, data }));
    } catch(_) { this._resetDecoder(); }
  }

  _initDecoder(codecStr) {
    this._resetDecoder();
    if (typeof VideoDecoder === 'undefined') { this.el.classList.add('tile--error'); this._setBadge('no WebCodecs', 'error'); return; }
    this.decoder = new VideoDecoder({
      output: frame => {
        const w = frame.codedWidth || frame.displayWidth;
        const h = frame.codedHeight || frame.displayHeight;
        if (w && h && (this.canvas.width !== w || this.canvas.height !== h)) { this.canvas.width = w; this.canvas.height = h; }
        this.ctx.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height);
        frame.close();
      },
      error: () => this._resetDecoder()
    });
    try {
      this.decoder.configure({ codec: codecStr, optimizeForLatency: true, hardwareAcceleration: 'no-preference' });
    } catch(_) { this.decoder = null; }
  }

  _resetDecoder() {
    if (this.decoder && this.decoder.state !== 'closed') try { this.decoder.close(); } catch(_) {}
    this.decoder = null; this.pending = null;
  }

  setAudioLevel(level) {
    const next = Math.max(0, Math.min(1, Number(level) || 0));
    this.audioLevel = next;
    const fills = [0.18, 0.42, 0.68, 1];
    this.audioBars.forEach((bar, idx) => {
      const active = next >= fills[idx];
      bar.classList.toggle('is-active', active);
      bar.style.height = active ? `${Math.round(3 + next * 14 + idx * 2)}px` : `${3 + idx}px`;
    });
  }

  _setBadge(text, cls) { this.badge.textContent = text; this.badge.className = 'tile-badge ' + (cls || ''); }

  _codecFromSps(data) {
    for (let i = 0; i < data.length - 5; i++) {
      const sc4 = data[i]===0&&data[i+1]===0&&data[i+2]===0&&data[i+3]===1;
      const sc3 = data[i]===0&&data[i+1]===0&&data[i+2]===1;
      const off = sc4 ? i+4 : sc3 ? i+3 : -1;
      if (off > 0 && off+3 < data.length && (data[off] & 0x1F) === 7)
        return `avc1.${data[off+1].toString(16).padStart(2,'0').toUpperCase()}${data[off+2].toString(16).padStart(2,'0').toUpperCase()}${data[off+3].toString(16).padStart(2,'0').toUpperCase()}`;
    }
    return 'avc1.64001E';
  }
}

// ── TileManager ───────────────────────────────────────────────────────────
const tileManager = {
  tiles:       Array.from({ length: NUM_TILES }, (_, i) => new VideoTile(i)),
  selectedIdx: null,

  selectTile(idx) {
    this.tiles.forEach((t, i) => t.el.classList.toggle('tile--selected', i === idx));
    this.selectedIdx = idx;
  },

  clearSelection() {
    this.tiles.forEach(t => t.el.classList.remove('tile--selected'));
    this.selectedIdx = null;
  },

  assignSession(terminalId, channelId) {
    const key = terminalId + '#' + channelId;
    if (isStopped(key)) return;
    const existing = this.tiles.find(t => t.key() === key);
    if (existing) {
      existing.ensureConnected();
      this.selectTile(existing.index);
      return;
    }
    let target = this.selectedIdx !== null ? this.tiles[this.selectedIdx] : null;
    if (!target) target = this.tiles.find(t => t.isEmpty()) || this.tiles[0];
    target.assign(terminalId, channelId);
    this.clearSelection();
  },

  closeAll() { this.tiles.forEach(t => t.stop()); this.clearSelection(); },

  assignedKeys() { return new Set(this.tiles.map(t => t.key()).filter(Boolean)); },

  updateStats(terminalId, channelId, frames, bytes, bps) {
    this.tiles.find(t => t.key() === terminalId + '#' + channelId)?.updateStats(frames, bytes, bps);
  }
};

// ── Header controls ───────────────────────────────────────────────────────
document.getElementById('layout-switcher').addEventListener('click', e => {
  const btn = e.target.closest('.layout-btn');
  if (!btn) return;
  videoGrid.className = `grid layout-${btn.dataset.layout}`;
  document.querySelectorAll('.layout-btn').forEach(b => b.classList.toggle('active', b === btn));
});

document.getElementById('btn-sidebar').addEventListener('click', () => sidebar.classList.toggle('sidebar--hidden'));

document.getElementById('btn-close-all').addEventListener('click', () => tileManager.closeAll());

document.getElementById('btn-fullscreen').addEventListener('click', () => {
  const wrap = document.getElementById('grid-wrap');
  if (!document.fullscreenElement) (wrap.requestFullscreen || wrap.webkitRequestFullscreen || (() => {})).call(wrap);
  else (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
});

// ── Vehicle + session polling ─────────────────────────────────────────────
const prevBytes = {};

function matchIds(serverId, rtvsId) {
  return serverId.endsWith(rtvsId) || rtvsId.endsWith(serverId);
}

function renderVehicles(terminals, sessions) {
  const assigned = tileManager.assignedKeys();

  if (!terminals.length && !sessions.length) {
    vehicleList.innerHTML = '<div class="empty-msg">No connected vehicles</div>';
    return;
  }

  const sessionMap = {};
  sessions.forEach(s => {
    sessionMap[s.terminalId] = sessionMap[s.terminalId] || [];
    sessionMap[s.terminalId].push(s);
  });

  const vehicles = terminals.map(t => {
    const rtvsId = Object.keys(sessionMap).find(id => matchIds(t.terminalId, id)) || null;
    return { ...t, rtvsId, sessions: rtvsId ? sessionMap[rtvsId] : [] };
  });

  const coveredRtvsIds = new Set(vehicles.map(v => v.rtvsId).filter(Boolean));
  Object.keys(sessionMap).forEach(rtvsId => {
    if (!coveredRtvsIds.has(rtvsId)) {
      vehicles.push({ terminalId: rtvsId, plateNumber: '', plateColorName: '', rtvsId, sessions: sessionMap[rtvsId] });
    }
  });

  vehicleList.innerHTML = vehicles.map(v => {
    const plate = v.plateNumber || shortId(v.rtvsId || v.terminalId);
    const colorBadge = v.plateColorName ? `<span class="plate-color plate-color--${v.plateColorName}">${v.plateColorName}</span>` : '';

    const channelRows = v.sessions.map(s => {
      const key = sessionKey(s);
      const bps = Math.max(0, s.bytes - (prevBytes[key] || 0));
      prevBytes[key] = s.bytes;
      tileManager.updateStats(s.terminalId, s.channelId, s.frames, s.bytes, bps);
      const isAssigned = assigned.has(key);
      const paused = isStopped(key);
      const statusText = paused ? '○ stopped' : s.active ? '● live' : '○ idle';
      const statusClass = paused ? 'badge badge--warn' : s.active ? 'badge badge--on' : 'badge badge--off';
      return `<div class="ch-row${isAssigned ? ' ch-row--assigned' : ''}" data-tid="${s.terminalId}" data-ch="${s.channelId}">
        <div class="ch-left">
          <span class="ch-num">ch ${s.channelId}</span>
          <span class="ch-status ${statusClass}">${statusText}</span>
        </div>
        <div class="ch-stats">${fmt(bps)}/s · ${s.frames.toLocaleString()} fr</div>
        <div class="ch-actions">
          <button class="sc-btn sc-btn--assign" title="${isAssigned ? 'Reassign' : 'Add to panel'}">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M5 3l6 5-6 5"/></svg>
          </button>
          <button class="sc-btn sc-btn--stop" title="Stop stream">
            <svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1"/></svg>
          </button>
        </div>
      </div>`;
    }).join('');

    const rtvsId = v.rtvsId || v.terminalId;
    const activeChs = new Set(v.sessions.map(s => s.channelId));
    const chOptions = Array.from({length: MAX_CHANNELS}, (_, i) => i+1)
      .filter(ch => !activeChs.has(ch))
      .map(ch => `<option value="${ch}">ch ${ch}</option>`).join('');

    const startRow = v.terminalId
      ? `<div class="ch-start-row">
           <select class="ch-select">${chOptions || '<option value="1">ch 1</option>'}</select>
           <button class="sc-btn sc-btn--start" data-tid="${v.terminalId}">
             <svg viewBox="0 0 16 16" fill="currentColor"><polygon points="3,2 13,8 3,14"/></svg>
             Start
           </button>
         </div>`
      : '';

    return `<div class="vehicle-card" data-rtvsid="${rtvsId}">
      <div class="vc-header">
        <div class="vc-plate">
          <svg class="vc-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1" y="4" width="14" height="8" rx="1.5"/><circle cx="4" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="8" r="1.2" fill="currentColor" stroke="none"/><rect x="5.5" y="6" width="5" height="4" rx=".5" fill="currentColor" stroke="none" opacity=".4"/></svg>
          <span class="vc-plate-num">${plate}</span>
          ${colorBadge}
        </div>
        <span class="vc-connected badge badge--on">connected</span>
      </div>
      <div class="vc-channels">${channelRows}${startRow}</div>
    </div>`;
  }).join('');

  vehicleList.querySelectorAll('.ch-row').forEach(row => {
    const tid = row.dataset.tid, ch = parseInt(row.dataset.ch);
    row.querySelector('.sc-btn--assign').addEventListener('click', e => { e.stopPropagation(); tileManager.assignSession(tid, ch); });
    row.querySelector('.sc-btn--stop').addEventListener('click', e => {
      e.stopPropagation();
      markStopped(stopKey(tid, ch));
      fetch(`/api/live/stop?terminal=${tid}&channel=${ch}`).catch(() => {});
      tileManager.tiles.filter(t => t.key() === tid + '#' + ch).forEach(t => t.close());
    });
    row.addEventListener('click', () => tileManager.assignSession(tid, ch));
  });

  vehicleList.querySelectorAll('.sc-btn--start').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const tid = btn.dataset.tid;
      const ch  = parseInt(btn.closest('.ch-start-row').querySelector('.ch-select').value);
      clearStopped(stopKey(tid, ch));
      fetch(`/api/live/start?terminal=${tid}&channel=${ch}`).catch(() => {});
      setTimeout(() => tileManager.assignSession(
        vehicleList.querySelector(`[data-rtvsid]`)?.dataset.rtvsid || tid, ch), 800);
    });
  });
}

async function pollVehicles() {
  try {
    const [termRes, sessRes] = await Promise.all([
      fetch('/api/terminals'),
      fetch('/api/sessions')
    ]);
    if (!termRes.ok || !sessRes.ok) throw new Error();
    const [terminals, sessions] = await Promise.all([termRes.json(), sessRes.json()]);
    const sessionKeys = new Set(sessions.map(sessionKey));
    stoppedSessions.forEach(key => { if (!sessionKeys.has(key)) stoppedSessions.delete(key); });
    healthEl.textContent = 'online'; healthEl.className = 'badge badge--on';
    renderVehicles(terminals, sessions);
    tileManager.tiles.forEach(t => {
      if (t.key() && sessions.some(s => sessionKey(s) === t.key()) && !isStopped(t.key())) {
        t.ensureConnected();
      }
    });
    if (tileManager.tiles.every(t => t.isEmpty())) {
      const first = sessions.find(s => s.active && !isStopped(sessionKey(s)));
      if (first) tileManager.assignSession(first.terminalId, first.channelId);
    }
  } catch {
    healthEl.textContent = 'offline'; healthEl.className = 'badge badge--off';
  }
}

// ── DMS polling ───────────────────────────────────────────────────────────
async function pollDms() {
  try {
    const res = await fetch(DMS_URL);
    if (!res.ok) throw new Error();
    const s = await res.json();
    const alarm = s.primaryAlarm;
    dmsBadge.textContent = 'online'; dmsBadge.className = 'badge badge--on';
    dmsFace.innerHTML     = indicator(s.faceDetected,  '● detected', '○ absent');
    dmsEyes.innerHTML     = indicator(!s.eyesClosed,   '● open',     '● closed');
    dmsDistract.innerHTML = indicator(!s.distracted,   '—',          '⚠ distracted');
    dmsSeatbelt.innerHTML = indicator(s.seatbeltWorn,  '✓ worn',     '⚠ not worn');
    const deg = s.fatigueDegree;
    dmsBar.style.width = (deg * 10) + '%';
    dmsBar.className   = 'dms-bar' + (deg >= 7 ? ' dms-bar--high' : deg >= 4 ? ' dms-bar--mid' : '');
    dmsFatigue.textContent = deg + ' / 10';
    const name = ALARM_NAMES[alarm] || ('alarm ' + alarm);
    dmsAlarm.textContent = alarm ? '⚠ ' + name : '—';
    dmsAlarm.className   = 'dms-val dms-alarm' + (alarm ? ' dms-alarm--active' : '');
  } catch {
    dmsBadge.textContent = 'offline'; dmsBadge.className = 'badge badge--off';
  }
}

// ── Talkback (CVNet two-way audio) ────────────────────────────────────────

const talkback = (() => {
  let cvnet = null;
  let activeTile = null;
  let audioCtx = null;
  let audioAnalyser = null;
  let audioSource = null;
  let meterTimer = null;
  let trackedStream = null;
  let originalGetUserMedia = null;
  let patched = false;

  function getCvNet() {
    if (cvnet) return cvnet;
    if (typeof CvNetVideo === 'undefined') {
      console.warn('CVNet SDK not loaded — talkback unavailable');
      return null;
    }
    const container = document.getElementById('cvnet-hidden');
    cvnet = CvNetVideo.Init(container, 1, {
      usingCluster: false,
      clusterHost:  RTVS_HOST,
      clusterPort:  RTVS_TALK_PORT,
      remotePortWs: RTVS_TALK_PORT,  // talkback server port (separate from video port)
      protocol:     2,               // JT1078
      playerMode:   3,               // Wasm → uses remotePortWs, processes JT1078 audio
    });
    return cvnet;
  }

  function installAudioMeter(stream, tile) {
    cleanupAudioMeter();
    if (!stream || !stream.getAudioTracks || stream.getAudioTracks().length === 0) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      audioCtx = new AudioCtx();
      audioSource = audioCtx.createMediaStreamSource(stream);
      audioAnalyser = audioCtx.createAnalyser();
      audioAnalyser.fftSize = 256;
      audioSource.connect(audioAnalyser);
      trackedStream = stream;
      const data = new Uint8Array(audioAnalyser.fftSize);
      meterTimer = setInterval(() => {
        if (!activeTile || activeTile !== tile || !audioAnalyser) return;
        audioAnalyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const x = (data[i] - 128) / 128;
          sum += x * x;
        }
        const rms = Math.sqrt(sum / data.length);
        tile.setAudioLevel(Math.min(1, Math.max(0, rms * 3)));
      }, 50);
    } catch (e) {
      console.warn('audio meter unavailable:', e);
    }
  }

  function cleanupAudioMeter() {
    if (meterTimer) {
      clearInterval(meterTimer);
      meterTimer = null;
    }
    if (audioSource) {
      try { audioSource.disconnect(); } catch (_) {}
      audioSource = null;
    }
    if (audioAnalyser) {
      try { audioAnalyser.disconnect(); } catch (_) {}
      audioAnalyser = null;
    }
    if (audioCtx) {
      try { audioCtx.close(); } catch (_) {}
      audioCtx = null;
    }
    trackedStream = null;
  }

  function patchMicCapture() {
    if (patched) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await originalGetUserMedia(constraints);
      if (constraints && constraints.audio && activeTile) {
        installAudioMeter(stream, activeTile);
      }
      return stream;
    };
    patched = true;
  }

  function start(tile) {
    const sdk = getCvNet();
    if (!sdk || !tile.terminalId) return;
    stop();
    patchMicCapture();
    activeTile = tile;
    tile.el.querySelector('.tile-btn--talk').classList.add('tile-btn--talk-active');
    try {
      sdk.StartSpeek(tile.terminalId, tile.channelId);
    } catch (e) {
      console.error('StartSpeek failed:', e);
      stop();
    }
  }

  function stop() {
    if (activeTile) {
      activeTile.el.querySelector('.tile-btn--talk').classList.remove('tile-btn--talk-active');
      activeTile.setAudioLevel(0);
      activeTile = null;
    }
    cleanupAudioMeter();
    const sdk = getCvNet();
    if (sdk) { try { sdk.StopSpeak(); } catch (_) {} }
  }

  function toggleTile(tile) {
    if (activeTile === tile) { stop(); } else { start(tile); }
  }

  return { start, stop, toggleTile };
})();

// ── boot ──────────────────────────────────────────────────────────────────
pollVehicles();
setInterval(pollVehicles, 1500);
pollDms();
setInterval(pollDms, 500);
