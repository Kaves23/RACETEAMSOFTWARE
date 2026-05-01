#!/usr/bin/env node
/**
 * pull-mychrono.js  —  AiM MyChrono WiFi session downloader + Render uploader
 *
 * USAGE
 *   node pull-mychrono.js          # auto-detect: pull if on device WiFi, upload if online
 *   node pull-mychrono.js pull     # force pull from device  (must be on AiM WiFi)
 *   node pull-mychrono.js upload   # force upload queue to Render (must be online)
 *   node pull-mychrono.js probe    # just print everything the device exposes, then exit
 *
 * FILES
 *   ~/mychron-queue/               local staging folder for downloaded sessions
 *   ~/mychron-queue/uploaded.json  tracks which files have already been uploaded
 *
 * CONFIG  (edit the constants below or set env vars)
 *   MYCHRON_IP      device IP  (default: 192.168.0.1)
 *   RENDER_URL      your Render upload endpoint
 */

'use strict';

const http   = require('http');
const https  = require('https');
const net    = require('net');
const { execSync } = require('child_process');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const { URL } = require('url');

// ─── CONFIG ────────────────────────────────────────────────────────────────
const DEVICE_IP  = process.env.MYCHRON_IP  || '192.168.0.1';
const RENDER_URL = process.env.RENDER_URL  || 'https://raceteamsoftware.onrender.com/api/telemetry/upload';
const QUEUE_DIR  = path.join(os.homedir(), 'mychron-queue');
const UPLOADED_LOG = path.join(QUEUE_DIR, 'uploaded.json');
const TIMEOUT_MS = 4000;

// Paths to probe on the device (in order of likelihood for AiM MyChrono 5/6)
const PROBE_PATHS = [
  '/',
  '/datastore',
  '/datastore/',
  '/sessions',
  '/session',
  '/api/sessions',
  '/api/v1/sessions',
  '/data',
  '/files',
  '/list',
  '/channels',
  '/device',
  '/info',
];

// File extensions we want to download
const TARGET_EXTS = new Set(['.xrk', '.xrz', '.drk', '.drz']);

// ─── UTILITIES ─────────────────────────────────────────────────────────────
function log(msg, ...args) { console.log(`[MyChrono] ${msg}`, ...args); }
function err(msg, ...args) { console.error(`[MyChrono] ERROR: ${msg}`, ...args); }

function ensureQueueDir() {
  if (!fs.existsSync(QUEUE_DIR)) {
    fs.mkdirSync(QUEUE_DIR, { recursive: true });
    log(`Created queue folder: ${QUEUE_DIR}`);
  }
}

function loadUploadedLog() {
  try { return new Set(JSON.parse(fs.readFileSync(UPLOADED_LOG, 'utf8'))); }
  catch { return new Set(); }
}

function saveUploadedLog(set) {
  fs.writeFileSync(UPLOADED_LOG, JSON.stringify([...set], null, 2));
}

/** Simple HTTP GET — returns { status, headers, body } */
function httpGet(url, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
        bodyText: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

/** Download binary file to disk */
function downloadFile(url, destPath, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const redir = new URL(res.headers.location, url).href;
        return downloadFile(redir, destPath, timeoutMs).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const out = fs.createWriteStream(destPath);
      res.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

/** Upload a local file to the Render telemetry endpoint */
function uploadFile(filePath) {
  return new Promise((resolve, reject) => {
    const fileName = path.basename(filePath);
    const fileData = fs.readFileSync(filePath);
    const boundary = `----RTS${Date.now()}`;
    const parsed = new URL(RENDER_URL);

    const bodyPre  = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
    );
    const bodyPost = Buffer.from(`\r\n--${boundary}--\r\n`);
    const totalLen = bodyPre.length + fileData.length + bodyPost.length;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname,
      method: 'POST',
      timeout: 120000,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalLen,
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(text));
        } else {
          reject(new Error(`Upload HTTP ${res.statusCode}: ${text}`));
        }
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('upload timeout')); });
    req.on('error', reject);

    req.write(bodyPre);
    req.write(fileData);
    req.write(bodyPost);
    req.end();
  });
}

// ─── DEVICE PROBE ──────────────────────────────────────────────────────────

/**
 * Connect raw TCP to a port, wait for greeting, then try known AiM handshakes.
 * Dumps everything as hex + ASCII.
 */
function rawTcpProbe(host, port, timeoutMs = 5000) {
  return new Promise(resolve => {
    const chunks = [];
    const s = net.createConnection({ host, port });

    const done = () => {
      s.destroy();
      const buf = Buffer.concat(chunks);
      if (buf.length === 0) {
        console.log('  (device sent nothing on connect — it waits for client to speak first)');
        console.log('\n  Trying known AiM hello packets…');
        tryAimHandshakes(host, port).then(resolve);
        return;
      }
      console.log(`  Received ${buf.length} bytes greeting:`);
      hexDump(buf);
      console.log('\n  ASCII: ' + buf.toString('latin1').replace(/[^\x20-\x7e]/g, '.'));
      resolve();
    };

    s.setTimeout(timeoutMs);
    s.on('connect', () => {
      console.log('  Connected. Waiting for greeting…');
      // Also send a null byte after 1s in case device waits for us
      setTimeout(() => { if (!s.destroyed) s.write(Buffer.from([0x00])); }, 1000);
    });
    s.on('data', d => { chunks.push(d); });
    s.on('timeout', done);
    s.on('end', done);
    s.on('error', e => { console.log('  Error:', e.message); resolve(); });
  });
}

/** Try several known AiM binary handshake patterns */
async function tryAimHandshakes(host, port) {
  // Known AiM/RS3 protocol init bytes (from community reverse engineering)
  const probes = [
    { label: 'AiM hello (0xA0 0x00)',    bytes: Buffer.from([0xA0, 0x00, 0x00, 0x00]) },
    { label: 'AiM hello (0x00 0xA0)',    bytes: Buffer.from([0x00, 0xA0, 0x00, 0x00]) },
    { label: 'AiM identify (0x01)',       bytes: Buffer.from([0x01, 0x00, 0x00, 0x00]) },
    { label: 'AiM get file list',         bytes: Buffer.from([0x02, 0x00, 0x00, 0x00]) },
    { label: 'RS3 sync word (0xDEAD)',    bytes: Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]) },
    { label: 'Text: LIST',                Buffer: Buffer.from('LIST\r\n') },
    { label: 'Text: HELLO',               Buffer: Buffer.from('HELLO\r\n') },
  ];

  for (const probe of probes) {
    const buf = probe.bytes || probe.Buffer;
    const response = await new Promise(resolve => {
      const chunks = [];
      const s = net.createConnection({ host, port });
      s.setTimeout(3000);
      s.on('connect', () => s.write(buf));
      s.on('data', d => chunks.push(d));
      s.on('timeout', () => { s.destroy(); resolve(Buffer.concat(chunks)); });
      s.on('end', () => resolve(Buffer.concat(chunks)));
      s.on('error', () => resolve(Buffer.concat(chunks)));
    });

    if (response.length > 0) {
      console.log(`\n  [${probe.label}] → Got ${response.length} bytes response:`);
      hexDump(response);
      console.log('  ASCII: ' + response.toString('latin1').replace(/[^\x20-\x7e]/g, '.'));
    } else {
      console.log(`  [${probe.label}] → no response`);
    }
  }
}

function hexDump(buf) {
  for (let i = 0; i < Math.min(buf.length, 256); i += 16) {
    const slice = buf.slice(i, i + 16);
    const hex  = [...slice].map(b => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = [...slice].map(b => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '.').join('');
    console.log(`  ${String(i).padStart(4, '0')}  ${hex.padEnd(48)}  ${ascii}`);
  }
}

/** Check if device is reachable using ping (ICMP) — works even if no TCP ports are open */
async function deviceReachable() {
  try {
    execSync(`ping -c 1 -W 1 ${DEVICE_IP}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Check if internet is available */
async function internetReachable() {
  try {
    await httpGet('https://raceteamsoftware.onrender.com/api/telemetry/dll-status', 3000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract file links from HTML or XML/JSON body.
 * Returns array of { name, url } objects.
 */
function extractLinks(baseUrl, body) {
  const links = [];
  const seen = new Set();

  // HTML href links  <a href="...">
  const hrefRe = /href=["']([^"']+)["']/gi;
  let m;
  while ((m = hrefRe.exec(body)) !== null) {
    const href = m[1];
    const ext = path.extname(href).toLowerCase();
    if (TARGET_EXTS.has(ext)) {
      const full = new URL(href, baseUrl).href;
      if (!seen.has(full)) { seen.add(full); links.push({ name: path.basename(href), url: full }); }
    }
  }

  // XML <filename> or <name> or <file> tags
  const xmlRe = /<(?:filename|name|file|path)>([^<]+)<\/(?:filename|name|file|path)>/gi;
  while ((m = xmlRe.exec(body)) !== null) {
    const val = m[1].trim();
    const ext = path.extname(val).toLowerCase();
    if (TARGET_EXTS.has(ext)) {
      const full = new URL(val, baseUrl).href;
      if (!seen.has(full)) { seen.add(full); links.push({ name: path.basename(val), url: full }); }
    }
  }

  // JSON "filename" or "name" or "path" keys
  const jsonKeyRe = /"(?:filename|name|file|path|url)"\s*:\s*"([^"]+)"/gi;
  while ((m = jsonKeyRe.exec(body)) !== null) {
    const val = m[1].trim();
    const ext = path.extname(val).toLowerCase();
    if (TARGET_EXTS.has(ext)) {
      const full = new URL(val.startsWith('http') ? val : val, baseUrl).href;
      if (!seen.has(full)) { seen.add(full); links.push({ name: path.basename(val), url: full }); }
    }
  }

  return links;
}

/** Probe all known paths, return { allResults, fileLinks } */
async function probeDevice() {
  const allResults = [];
  const fileLinks  = [];
  const seen       = new Set();

  log(`Probing device at http://${DEVICE_IP} ...`);

  // First: raw TCP port scan to find open ports
  const SCAN_PORTS = [80, 443, 8080, 8443, 2000, 2001, 10000, 10001, 50000, 50001, 9000, 9001, 3000, 5000, 7000];
  console.log('\n── TCP port scan ───────────────────────────────────────');
  const openPorts = [];
  for (const port of SCAN_PORTS) {
    const result = await new Promise(resolve => {
      const s = net.createConnection({ host: DEVICE_IP, port, timeout: 2000 });
      s.on('connect', () => { s.destroy(); resolve('open'); });
      s.on('timeout', () => { s.destroy(); resolve('timeout'); });
      s.on('error', e => resolve(e.code === 'ECONNREFUSED' ? 'refused' : 'error:' + e.code));
    });
    const marker = result === 'open' ? '  OPEN  ' : result === 'refused' ? 'CLOSED ' : 'filtered';
    console.log(`  Port ${String(port).padEnd(6)} ${marker}   ${result}`);
    if (result === 'open') openPorts.push(port);
  }
  console.log('────────────────────────────────────────────────────────\n');

  if (openPorts.length === 0) {
    log('No open TCP ports found. Device may only speak a proprietary UDP protocol.');
    log('Race Studio 3 uses a custom protocol — it may not be accessible via HTTP.');
    return { allResults, fileLinks };
  }

  // HTTP probe only on open ports
  const httpPaths = PROBE_PATHS;
  for (const port of openPorts) {
    for (const p of httpPaths) {
      const url = `http://${DEVICE_IP}:${port}${p}`;
      try {
        const r = await httpGet(url, TIMEOUT_MS);
        const preview = r.bodyText.substring(0, 300).replace(/\s+/g, ' ');
        allResults.push({ path: `${port}${p}`, status: r.status, headers: r.headers, preview });

        if (r.status === 200 || r.status === 206) {
          const links = extractLinks(url, r.bodyText);
          for (const l of links) {
            if (!seen.has(l.url)) { seen.add(l.url); fileLinks.push(l); }
          }
        }
      } catch (e) {
        allResults.push({ path: `${port}${p}`, error: e.message });
      }
    }
  }

  return { allResults, fileLinks };
}

// ─── PULL MODE ─────────────────────────────────────────────────────────────
async function runPull() {
  ensureQueueDir();

  log(`Checking device at ${DEVICE_IP}…`);
  if (!(await deviceReachable())) {
    err(`Cannot reach ${DEVICE_IP}. Are you connected to the AiM WiFi hotspot?`);
    err(`  SSID: AiM-MYC5S-v2-... (check your WiFi menu)`);
    process.exit(1);
  }

  const { allResults, fileLinks } = await probeDevice();

  // Print summary of what we found
  console.log('\n── Device probe results ───────────────────────────────');
  for (const r of allResults) {
    if (r.error) {
      console.log(`  ${r.path.padEnd(25)} ERR  ${r.error}`);
    } else {
      console.log(`  ${r.path.padEnd(25)} ${r.status}   ${r.headers['content-type'] || ''}`);
      if (r.preview && r.status === 200) console.log(`    → ${r.preview.substring(0,120)}`);
    }
  }
  console.log('───────────────────────────────────────────────────────\n');

  if (fileLinks.length === 0) {
    log('No .xrk/.drk files found via auto-detection.');
    log('The device may use a non-standard path. Run with "probe" flag to see full responses.');
    log('');
    log('NEXT STEPS:');
    log('  node pull-mychrono.js probe > device-probe.txt  # dump full device response');
    log('  Then share device-probe.txt so the correct API paths can be determined.');
    return;
  }

  log(`Found ${fileLinks.length} session file(s):`);
  fileLinks.forEach(f => log(`  ${f.name}  →  ${f.url}`));

  let downloaded = 0;
  for (const f of fileLinks) {
    const dest = path.join(QUEUE_DIR, f.name);
    if (fs.existsSync(dest)) {
      log(`  SKIP ${f.name} (already in queue)`);
      continue;
    }
    try {
      process.stdout.write(`  Downloading ${f.name}… `);
      await downloadFile(f.url, dest);
      const size = (fs.statSync(dest).size / 1024).toFixed(0);
      console.log(`OK (${size} KB)`);
      downloaded++;
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
  }

  console.log('');
  if (downloaded > 0) {
    log(`Downloaded ${downloaded} file(s) to: ${QUEUE_DIR}`);
    log('When you are back on internet, run:');
    log('  node pull-mychrono.js upload');
  } else {
    log('Nothing new to download — queue is up to date.');
  }
}

// ─── UPLOAD MODE ───────────────────────────────────────────────────────────
async function runUpload() {
  ensureQueueDir();

  log(`Checking internet connection…`);
  if (!(await internetReachable())) {
    err('No internet connection. Connect to your regular WiFi first.');
    process.exit(1);
  }

  const uploaded = loadUploadedLog();
  const files = fs.readdirSync(QUEUE_DIR)
    .filter(f => TARGET_EXTS.has(path.extname(f).toLowerCase()))
    .filter(f => !uploaded.has(f))
    .map(f => path.join(QUEUE_DIR, f));

  if (files.length === 0) {
    log('Queue is empty — nothing to upload.');
    return;
  }

  log(`Uploading ${files.length} file(s) to Render…`);
  let ok = 0, fail = 0;

  for (const fp of files) {
    const name = path.basename(fp);
    process.stdout.write(`  Uploading ${name}… `);
    try {
      const result = await uploadFile(fp);
      console.log(`OK → session_id ${result.session_id || JSON.stringify(result)}`);
      uploaded.add(name);
      ok++;
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
      fail++;
    }
  }

  saveUploadedLog(uploaded);
  console.log('');
  log(`Done. ${ok} uploaded, ${fail} failed.`);
  if (ok > 0) log(`Uploaded log saved to: ${UPLOADED_LOG}`);
}

// ─── PROBE MODE (dump everything) ─────────────────────────────────────────
async function runProbe() {
  if (!(await deviceReachable())) {
    err(`Cannot reach ${DEVICE_IP}. Are you on the AiM WiFi?`);
    process.exit(1);
  }

  log(`Full probe of ${DEVICE_IP} — TCP scan then HTTP dump…\n`);

  // TCP port scan first
  const ALL_PORTS = [80, 443, 8080, 8443, 2000, 2001, 10000, 10001, 50000, 50001, 9000, 9001, 3000, 5000, 7000, 21, 22, 23, 25, 8000, 8888];
  console.log('── TCP port scan ───────────────────────────────────────');
  const openPorts = [];
  for (const port of ALL_PORTS) {
    const result = await new Promise(resolve => {
      const s = net.createConnection({ host: DEVICE_IP, port, timeout: 2000 });
      s.on('connect', () => { s.destroy(); resolve('OPEN'); });
      s.on('timeout', () => { s.destroy(); resolve('filtered'); });
      s.on('error', e => resolve(e.code === 'ECONNREFUSED' ? 'refused(closed)' : e.code));
    });
    console.log(`  ${String(port).padEnd(6)} ${result}`);
    if (result === 'OPEN') openPorts.push(port);
  }
  console.log('────────────────────────────────────────────────────────\n');

  if (openPorts.length === 0) {
    log('No open TCP ports — device likely uses UDP-only proprietary protocol.');
    return;
  }

  // HTTP dump on open ports
  for (const port of openPorts) {
    for (const p of PROBE_PATHS) {
      const url = `http://${DEVICE_IP}:${port}${p}`;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`GET ${url}`);
      console.log('='.repeat(60));
      try {
        const r = await httpGet(url, TIMEOUT_MS);
        console.log(`Status: ${r.status}`);
        console.log('Headers:', JSON.stringify(r.headers, null, 2));
        console.log('Body:');
        console.log(r.bodyText.substring(0, 2000));
      } catch (e) {
        console.log(`ERROR: ${e.message}`);
      }
    }
  }

  // Raw TCP greeting on port 2000 (AiM binary protocol)
  if (openPorts.includes(2000)) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('RAW TCP probe on port 2000 (AiM binary protocol)');
    console.log('='.repeat(60));
    await rawTcpProbe(DEVICE_IP, 2000);
  }
}

// ─── AUTO-DETECT MODE ─────────────────────────────────────────────────────
async function runAuto() {
  const [onDevice, onInternet] = await Promise.all([
    deviceReachable(),
    internetReachable(),
  ]);

  if (onDevice) {
    log('Detected: connected to MyChrono WiFi → starting pull…\n');
    await runPull();

    // If they somehow have both (unusual), also upload after pull
    if (onInternet) {
      console.log('');
      log('Internet also available → uploading queue now…\n');
      await runUpload();
    }
  } else if (onInternet) {
    log('Detected: internet available → uploading queue to Render…\n');
    await runUpload();
  } else {
    err('Neither device nor internet is reachable.');
    err(`  Device (${DEVICE_IP}): not found`);
    err(`  Internet (Render):   not found`);
    err('');
    err('Connect to either the AiM WiFi hotspot or your regular internet, then re-run.');
    process.exit(1);
  }
}

// ─── ENTRY POINT ──────────────────────────────────────────────────────────
const mode = (process.argv[2] || 'auto').toLowerCase();

(async () => {
  console.log('');
  log(`pull-mychrono.js  [mode: ${mode}]`);
  log(`Device IP: ${DEVICE_IP}  |  Queue: ${QUEUE_DIR}`);
  console.log('');

  switch (mode) {
    case 'pull':   await runPull();   break;
    case 'upload': await runUpload(); break;
    case 'probe':  await runProbe();  break;
    case 'auto':   await runAuto();   break;
    default:
      console.error(`Unknown mode "${mode}". Use: auto | pull | upload | probe`);
      process.exit(1);
  }
})().catch(e => {
  err(e.message);
  process.exit(1);
});
