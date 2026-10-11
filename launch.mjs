import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const stateFile = path.join(root, 'session.json');
const noBrowser = process.argv.includes('--no-browser');
const browsers = [
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
];
function openWindow(url) {
  if (noBrowser) return;
  const browser = browsers.find(p => fs.existsSync(p));
  if (!browser) throw new Error('Microsoft Edge or Google Chrome is required.');
  const child = spawn(browser, [`--app=${url}`, `--user-data-dir=${path.join(root, 'browser-profile')}`, '--no-first-run', '--no-default-browser-check'], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', e => fs.appendFileSync(path.join(root, 'launcher-error.log'), `${e.message}\n`));
  child.unref();
}
try {
  const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  if (/^http:\/\/127\.0\.0\.1:\d+\/$/.test(saved.url)) {
    const health = await fetch(`${saved.url}api/health`, { signal: AbortSignal.timeout(1500) }).then(r => r.json());
    if (health.app === 'acs-h5p-desktop-v2') {
      await fetch(`${saved.url}api/heartbeat`, { method: 'POST' });
      console.log(`VIEWER_URL=${saved.url}`); openWindow(saved.url); process.exit(0);
    }
  }
} catch { /* Missing or expired session: start a new server. */ }
const child = spawn(process.execPath, [path.join(root, 'helper', 'server.mjs')], {
  cwd: root, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  env: { ...process.env, H5P_DESKTOP_IDLE: noBrowser ? '0' : '1' }
});
let pending = '';
child.stdout.on('data', chunk => {
  pending += chunk;
  const lines = pending.split('\n'); pending = lines.pop();
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (event.type === 'ready') {
        fs.writeFileSync(stateFile, JSON.stringify({ url: event.url }, null, 2));
        console.log(`VIEWER_URL=${event.url}`); openWindow(event.url);
      }
    } catch (e) { console.error(e.message); }
  }
});
child.stderr.on('data', data => process.stderr.write(data));
child.on('error', e => { console.error(e.message); process.exit(1); });
child.on('exit', code => { try { fs.unlinkSync(stateFile); } catch {} process.exit(code || 0); });
process.on('SIGINT', () => child.stdin.write('{"cmd":"shutdown"}\n'));
