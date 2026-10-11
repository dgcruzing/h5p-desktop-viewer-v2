const player = document.querySelector('#player');
const nameEl = document.querySelector('#pkg-name');
const statusEl = document.querySelector('#status');
const pkgList = document.querySelector('#pkg-list');
const eventLog = document.getElementById('event-log');
const xapiLog = document.getElementById('xapi-log');
const scoreLog = document.getElementById('score-log');
const resizeHandle = document.getElementById('resize-handle');
const bottomPanel = document.getElementById('bottom-panel');

const setStatus = (text) => { statusEl.textContent = text; };

// --- Tab switching ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content > div').forEach(d => d.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// --- Resize bottom panel ---
let resizing = false;
resizeHandle.addEventListener('mousedown', (e) => {
  resizing = true;
  e.preventDefault();
});
document.addEventListener('mousemove', (e) => {
  if (!resizing) return;
  const rect = bottomPanel.getBoundingClientRect();
  const newHeight = window.innerHeight - e.clientY;
  bottomPanel.style.height = Math.max(80, Math.min(400, newHeight)) + 'px';
});
document.addEventListener('mouseup', () => { resizing = false; });

// --- Event logging ---
const EVENT_KEY = 'h5pv2-events';
function logEvent(target, msg) {
  const empty = target.querySelector('.empty-msg');
  if (empty) empty.remove();
  const line = document.createElement('div');
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  if (target === eventLog) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(EVENT_KEY) || '[]');
      sessionStorage.setItem(EVENT_KEY, JSON.stringify([...saved, line.textContent].slice(-100)));
    } catch { /* Storage may be unavailable. */ }
  }
  target.appendChild(line);
  target.scrollTop = target.scrollHeight;
}

try {
  for (const text of JSON.parse(sessionStorage.getItem(EVENT_KEY) || '[]')) {
    eventLog.querySelector('.empty-msg')?.remove();
    const line = document.createElement('div');
    line.textContent = text;
    eventLog.appendChild(line);
  }
} catch { /* Storage may be unavailable. */ }

// --- Package list ---
async function loadPackageList() {
  try {
    const res = await fetch('/api/packages', { cache: 'no-store' });
    const data = await res.json();
    pkgList.innerHTML = '';
    if (!data.packages || data.packages.length === 0) {
      pkgList.innerHTML = '<div id="pkg-empty">Your library is empty.<br>Drop H5P files above to begin.</div>';
      return;
    }
    for (const pkg of data.packages) {
      const div = document.createElement('div');
      div.className = 'pkg-item';
      div.tabIndex = 0;
      div.setAttribute('role', 'button');
      div.setAttribute('aria-label', pkg.title || pkg.name);
      div.dataset.name = pkg.name;
      const sizeKB = (pkg.size / 1024).toFixed(0);
      div.innerHTML = `<span class="pkg-title">${esc(pkg.title)}</span><span class="pkg-meta">${esc(pkg.name)} &middot; ${sizeKB} KB</span>`;
      div.addEventListener('click', () => loadPackage(pkg.name, div));
      div.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadPackage(pkg.name, div); }
      });
      pkgList.appendChild(div);
    }
  } catch (e) {
    pkgList.innerHTML = '<div id="pkg-empty">Cannot reach server.</div>';
  }
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// --- Load a package via API ---
async function loadPackage(name, el) {
  setStatus('Loading ' + name + '...');
  logEvent(eventLog, 'Loading: ' + name);
  try {
    const res = await fetch('/api/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (data.error) {
      setStatus('Error: ' + data.error);
      logEvent(eventLog, 'ERROR: ' + data.error);
      return;
    }
    // Update active state
    document.querySelectorAll('.pkg-item').forEach(i => i.classList.remove('active'));
    if (el) el.classList.add('active');
    nameEl.textContent = data.title || data.name || name;
    // Navigate the whole page to the new token URL so the SW scope matches
    if (data.url) {
      logEvent(eventLog, 'Loaded: ' + (data.title || data.name) + ' (gen ' + data.generation + ')');
      window.location.href = data.url;
    }
  } catch (e) {
    setStatus('Error: ' + e.message);
    logEvent(eventLog, 'ERROR: ' + e.message);
  }
}

// --- Player events ---
player.addEventListener('ready', () => {
  setStatus('Preparing capture…');
  logEvent(eventLog, 'Player ready');
});
player.addEventListener('progress', (event) => {
  if (player.state === 'ready') return;
  const p = event.detail;
  setStatus(p?.fraction == null ? `Loading ${p?.phase || 'package'}...` : `Loading ${Math.round(p.fraction * 100)}%`);
});
player.addEventListener('error', (event) => {
  setStatus('Error: ' + (event.detail?.message || 'Unable to load package'));
  logEvent(eventLog, 'ERROR: ' + (event.detail?.message || 'Unable to load package'));
});

// --- xAPI statement capture ---
// The H5P player dispatches xAPI events via H5P.externalDispatcher
// We intercept these and send them to the server
let captureStarted = false;
function setupXapiCapture() {
  if (captureStarted) return;
  captureStarted = true;
  // Wait for H5P to be available (it's inside the player's iframe)
  // We use a polling approach since the player uses a service worker
  let captured = false;

  function tryCapture() {
    try {
      const iframe = player.querySelector('iframe') || player.shadowRoot?.querySelector('iframe');
      if (!iframe || !iframe.contentWindow) return false;
      const innerWin = iframe.contentWindow;
      if (!innerWin.H5P || !innerWin.H5P.externalDispatcher) return false;

      if (captured) return true;
      captured = true;

      // Hook into the xAPI event dispatcher
      innerWin.H5P.externalDispatcher.on('xAPI', (event) => {
        try {
          // Send to server
          const posted = fetch('/api/xapi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event.data || event)
          }).then(res => {
            if (!res.ok) throw new Error(`xAPI POST failed: ${res.status}`);
          });

          // Display in xAPI log
          const stmt = event.data?.statement || event.data || event;
          const obj = stmt?.object?.definition?.name?.['en-US'] || stmt?.object?.id || 'unknown';
          const verb = stmt?.verb?.display?.['en-US'] || stmt?.verb?.id || 'unknown';
          const score = stmt?.result?.score;
          const scoreStr = score ? ` raw=${score.raw ?? '?'}/${score.max ?? '?'} scaled=${score.scaled ?? '?'}` : '';
          const success = stmt?.result?.success !== undefined ? ` success=${stmt.result.success}` : '';
          const completion = stmt?.result?.completion !== undefined ? ` completion=${stmt.result.completion}` : '';
          logEvent(xapiLog, `${verb}: ${obj}${scoreStr}${success}${completion}`);

          // If scored, update score panel
          if (score || stmt?.result?.success !== undefined) {
            posted.then(updateScores).catch(e => logEvent(eventLog, 'ERROR: ' + e.message));
          } else {
            posted.catch(e => logEvent(eventLog, 'ERROR: ' + e.message));
          }
        } catch (e) {
          // Ignore capture errors
        }
      });
      logEvent(eventLog, 'xAPI capture active');
      player.dataset.captureReady = 'true';
      setStatus('Ready');
      return true;
    } catch (e) {
      return false;
    }
  }

  // Poll until H5P is available
  if (tryCapture()) return;
  const interval = setInterval(() => {
    if (tryCapture()) clearInterval(interval);
  }, 50);

  // Stop after 30 seconds
  setTimeout(() => {
    clearInterval(interval);
    if (!captured) { setStatus('Capture unavailable'); logEvent(eventLog, 'ERROR: xAPI capture did not attach'); }
  }, 30000);
}

// --- Update score panel from server ---
async function updateScores() {
  try {
    const res = await fetch('/api/scores', { cache: 'no-store' });
    const data = await res.json();
    scoreLog.innerHTML = '';
    if (!data.scores || data.scores.length === 0) {
      scoreLog.innerHTML = '<span class="empty-msg">No scores yet.</span>';
      return;
    }
    for (const s of data.scores) {
      const row = document.createElement('div');
      row.className = 'score-row';
      const sc = s.score;
      const scoreStr = sc ? `${sc.raw ?? '?'}/${sc.max ?? '?'} (scaled: ${sc.scaled ?? '?'})` : 'no score';
      row.innerHTML = `<span class="score-obj">${esc(s.object)}</span> <span class="score-val">${scoreStr}</span>${s.success !== undefined ? ` success=${s.success}` : ''}${s.completion !== undefined ? ` completion=${s.completion}` : ''}<br><span class="score-raw">${new Date(s.time).toLocaleTimeString()}</span>`;
      scoreLog.appendChild(row);
    }
    scoreLog.scrollTop = scoreLog.scrollHeight;
  } catch (e) {
    // Ignore
  }
}

// --- Reload button ---
document.querySelector('#reload').addEventListener('click', () => {
  player.removeAttribute('src');
  location.reload();
});

// --- Refresh packages button ---
document.querySelector('#refresh-pkgs').addEventListener('click', loadPackageList);

// --- Clear xAPI button ---
document.querySelector('#clear-xapi').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/xapi/clear', { method: 'POST' });
    if (!res.ok) throw new Error(`Clear failed: ${res.status}`);
    xapiLog.innerHTML = '<span class="empty-msg">No xAPI statements yet.</span>';
    scoreLog.innerHTML = '<span class="empty-msg">No scores yet.</span>';
    logEvent(eventLog, 'xAPI log cleared (package still loaded)');
  } catch (e) {
    logEvent(eventLog, 'ERROR clearing: ' + e.message);
  }
});

// --- Config loading (fetches ./config.json relative to page URL) ---
async function loadConfig() {
  try {
    const config = await (await fetch('./config.json', { cache: 'no-store' })).json();
    nameEl.textContent = config.title || config.name || 'No package selected';
    if (config.packageUrl) {
      document.getElementById('welcome').hidden = true;
      player.src = config.packageUrl;
      setStatus('Loading package...');
      updateScores();
    } else {
      setStatus('Select a package from the sidebar');
    }
  } catch (error) {
    setStatus('Waiting for package...');
  }
}

// --- Initialize ---
loadPackageList();
loadConfig();

// Set up xAPI capture when player becomes ready
player.addEventListener('ready', () => {
  setupXapiCapture();
});

// --- Desktop library imports (copies only; originals are never changed) ---
const picker = document.getElementById('file-picker');
const importStatus = document.getElementById('import-status');
let importing = false;
async function importFiles(files) {
  if (importing) { importStatus.textContent += '\nImport already running; drop the next batch when it finishes.'; return; }
  const batch = Array.from(files);
  if (!batch.length) return;
  importing = true;
  document.getElementById('add-files').disabled = true;
  importStatus.textContent = '';
  let imported = 0;
  try {
    for (const [i, file] of batch.entries()) {
      importStatus.textContent += `\n${i + 1}/${batch.length} · ${file.name}: `;
      if (!/\.h5p$/i.test(file.name)) { importStatus.textContent += 'skipped (not an H5P file)'; continue; }
      if (file.size > 100 * 1024 * 1024) { importStatus.textContent += 'too large (100 MB maximum)'; continue; }
      try {
        const res = await fetch(`/api/import?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        importStatus.textContent += `added as ${data.name}`;
        imported++;
        logEvent(eventLog, `Imported: ${data.name}`);
      } catch (e) { importStatus.textContent += e.message; }
    }
    await loadPackageList();
    importStatus.textContent += `\nDone · ${imported} of ${batch.length} added.`;
  } finally {
    importing = false; document.getElementById('add-files').disabled = false; picker.value = '';
  }
}
document.getElementById('add-files').addEventListener('click', () => picker.click());
picker.addEventListener('change', () => importFiles(picker.files));
document.addEventListener('dragover', e => {
  if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); document.body.classList.add('drag-over'); }
});
document.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('drag-over'); });
document.addEventListener('drop', e => {
  e.preventDefault(); document.body.classList.remove('drag-over');
  importFiles(e.dataTransfer.files);
});
async function heartbeat() { try { await fetch('/api/heartbeat', { method: 'POST' }); } catch {} }
heartbeat(); setInterval(heartbeat, 15000);
document.getElementById('export-results').addEventListener('click', async () => {
  try {
    const [status, xapi, scores] = await Promise.all(['status', 'xapi', 'scores'].map(p => fetch(`/api/${p}`).then(r => r.json())));
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), status, xapi, scores }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `h5p-results-${Date.now()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) { logEvent(eventLog, 'ERROR exporting: ' + e.message); }
});
document.getElementById('quit-app').addEventListener('click', async () => {
  if (importing) { importStatus.textContent += '\nWait for imports to finish before quitting.'; return; }
  try {
    const res = await fetch('/api/quit', { method: 'POST' });
    if (!res.ok) throw new Error('Unable to stop viewer');
    setStatus('Viewer stopped');
    document.body.innerHTML = '<main style="padding:40px"><h1>Viewer stopped</h1><p>You can close this window. Your imported lessons are saved.</p></main>';
    window.close();
  } catch (e) { logEvent(eventLog, e.message); }
});

