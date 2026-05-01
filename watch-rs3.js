#!/usr/bin/env node
/**
 * watch-rs3.js  —  Race Studio 3 folder watcher + auto-uploader to Render
 *
 * HOW IT WORKS
 *   1. Run this script on the laptop that has Race Studio 3 installed.
 *   2. Connect to AiM WiFi — Race Studio 3 pulls sessions as normal.
 *   3. This script detects any new .xrk/.xrz/.drk file saved by RS3.
 *   4. When internet returns, it uploads new files to your Render app
 *      automatically — no manual steps needed.
 *
 * USAGE
 *   node watch-rs3.js                  # watch + auto-upload (keeps running)
 *   node watch-rs3.js upload-only      # just upload anything pending, then exit
 *
 * CONFIG  (edit constants below or set env vars)
 *   RS3_FOLDER    path to Race Studio 3 data folder
 *   RENDER_URL    your Render upload endpoint
 *
 * RACE STUDIO 3 DEFAULT DATA FOLDERS
 *   Windows:  C:\Users\<you>\Documents\Race Studio 3\data\
 *   Mac:      ~/Documents/Race Studio 3/data/   (RS3 is Windows-only but just in case)
 */

'use strict';

const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const { URL } = require('url');

// ─── CONFIG ────────────────────────────────────────────────────────────────
const IS_WIN = process.platform === 'win32';

const DEFAULT_RS3_FOLDER = IS_WIN
  ? path.join(os.homedir(), 'Documents', 'Race Studio 3', 'data')
  : path.join(os.homedir(), 'Documents', 'Race Studio 3', 'data');

const RS3_FOLDER  = process.env.RS3_FOLDER  || DEFAULT_RS3_FOLDER;
const RENDER_URL  = process.env.RENDER_URL  || 'https://raceteamsoftware.onrender.com/api/telemetry/upload';
const UPLOADED_LOG = path.join(os.homedir(), 'mychron-queue', 'uploaded.json');
const QUEUE_DIR    = path.join(os.homedir(), 'mychron-queue');

// How often to check for internet + retry uploads (ms)
const UPLOAD_CHECK_INTERVAL = 30_000;   // 30 seconds
// How long to wait after a file appears before uploading (lets RS3 finish writing)
const FILE_SETTLE_MS = 5_000;           // 5 seconds

const TARGET_EXTS = new Set(['.xrk', '.xrz', '.drk', '.drz']);

// ─── STATE ─────────────────────────────────────────────────────────────────
let pendingUploads = new Set();   // files detected but not yet uploaded
let uploadTimer    = null;
let isUploading    = false;
let settleTimers   = {};          // filename → timer, waiting for file to finish writing

// ─── UTILITIES ─────────────────────────────────────────────────────────────
function log(msg)  { console.log(`[${timestamp()}] ${msg}`); }
function warn(msg) { console.warn(`[${timestamp()}] WARN: ${msg}`); }
function timestamp() { return new Date().toTimeString().slice(0,8); }

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function loadUploadedLog() {
  try { return new Set(JSON.parse(fs.readFileSync(UPLOADED_LOG, 'utf8'))); }
  catch { return new Set(); }
}

function saveUploadedLog(set) {
  ensureDir(QUEUE_DIR);
  fs.writeFileSync(UPLOADED_LOG, JSON.stringify([...set], null, 2));
}

function internetReachable() {
  return new Promise(resolve => {
    const req = https.get(
      'https://raceteamsoftware.onrender.com/api/telemetry/dll-status',
      { timeout: 4000 },
      res => { res.resume(); resolve(res.statusCode < 500); }
    );
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', ()  => resolve(false));
  });
}

// ─── UPLOAD ────────────────────────────────────────────────────────────────
function uploadFile(filePath) {
  return new Promise((resolve, reject) => {
    const fileName = path.basename(filePath);
    let fileData;
    try { fileData = fs.readFileSync(filePath); }
    catch (e) { return reject(new Error(`Cannot read file: ${e.message}`)); }

    const boundary = `----RTS${Date.now()}`;
    const parsed   = new URL(RENDER_URL);

    const bodyPre  = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
    );
    const bodyPost = Buffer.from(`\r\n--${boundary}--\r\n`);
    const totalLen = bodyPre.length + fileData.length + bodyPost.length;

    const req = https.request({
      hostname: parsed.hostname,
      port:     parsed.port || 443,
      path:     parsed.pathname,
      method:   'POST',
      timeout:  180_000,
      headers: {
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalLen,
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(text)); }
          catch { resolve({ raw: text }); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
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

// ─── SCAN + QUEUE ──────────────────────────────────────────────────────────

/** Recursively find all session files under RS3 folder */
function scanRS3Folder(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanRS3Folder(full, results);
    } else if (TARGET_EXTS.has(path.extname(entry.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

/** Queue a file for upload after it has settled (finished writing) */
function scheduleFile(filePath) {
  const key = filePath;
  if (settleTimers[key]) clearTimeout(settleTimers[key]);
  settleTimers[key] = setTimeout(() => {
    delete settleTimers[key];
    const uploaded = loadUploadedLog();
    const name = path.basename(filePath);
    if (uploaded.has(name)) return;  // already done
    if (!pendingUploads.has(filePath)) {
      pendingUploads.add(filePath);
      const size = fileSizeKB(filePath);
      log(`Queued: ${name}  (${size} KB)`);
    }
    triggerUpload();
  }, FILE_SETTLE_MS);
}

function fileSizeKB(p) {
  try { return (fs.statSync(p).size / 1024).toFixed(0); }
  catch { return '?'; }
}

// ─── UPLOAD LOOP ───────────────────────────────────────────────────────────
function triggerUpload() {
  if (uploadTimer) clearTimeout(uploadTimer);
  uploadTimer = setTimeout(runUploadCycle, 2000);
}

async function runUploadCycle() {
  if (isUploading) return;

  // Also pick up anything in pending that survived a restart
  const uploaded = loadUploadedLog();
  const allFiles = scanRS3Folder(RS3_FOLDER)
    .filter(f => !uploaded.has(path.basename(f)));
  for (const f of allFiles) pendingUploads.add(f);

  if (pendingUploads.size === 0) return;

  if (!(await internetReachable())) {
    log(`No internet — ${pendingUploads.size} file(s) queued, will retry in ${UPLOAD_CHECK_INTERVAL/1000}s`);
    return;
  }

  isUploading = true;
  const uploaded2 = loadUploadedLog();
  let ok = 0, fail = 0;

  for (const filePath of [...pendingUploads]) {
    const name = path.basename(filePath);
    if (uploaded2.has(name)) { pendingUploads.delete(filePath); continue; }

    process.stdout.write(`[${timestamp()}] Uploading ${name} (${fileSizeKB(filePath)} KB)… `);
    try {
      const result = await uploadFile(filePath);
      console.log(`OK → session ${result.session_id || JSON.stringify(result)}`);
      uploaded2.add(name);
      pendingUploads.delete(filePath);
      ok++;
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
      fail++;
    }
  }

  saveUploadedLog(uploaded2);
  isUploading = false;

  if (ok > 0)   log(`Upload complete: ${ok} uploaded, ${fail} failed.`);
  if (fail > 0) log(`${fail} file(s) failed — will retry in ${UPLOAD_CHECK_INTERVAL/1000}s`);
}

// ─── WATCH ─────────────────────────────────────────────────────────────────
function startWatcher() {
  if (!fs.existsSync(RS3_FOLDER)) {
    warn(`Race Studio 3 folder not found: ${RS3_FOLDER}`);
    warn('Watching will start when the folder is created (or set RS3_FOLDER env var).');
    // Poll until folder exists
    const poll = setInterval(() => {
      if (fs.existsSync(RS3_FOLDER)) {
        clearInterval(poll);
        log(`RS3 folder appeared — starting watcher.`);
        attachWatcher();
      }
    }, 5000);
    return;
  }
  attachWatcher();
}

function attachWatcher() {
  log(`Watching: ${RS3_FOLDER}`);
  log(`Upload target: ${RENDER_URL}`);
  log('');

  // Initial scan — queue anything already there but not yet uploaded
  const uploaded = loadUploadedLog();
  const existing = scanRS3Folder(RS3_FOLDER).filter(f => !uploaded.has(path.basename(f)));
  if (existing.length > 0) {
    log(`Found ${existing.length} unuploaded file(s) from previous sessions:`);
    for (const f of existing) {
      log(`  ${path.basename(f)}  (${fileSizeKB(f)} KB)`);
      pendingUploads.add(f);
    }
    triggerUpload();
  } else {
    log('All existing files already uploaded. Watching for new sessions…');
  }

  // Watch recursively for new files
  try {
    fs.watch(RS3_FOLDER, { recursive: true }, (event, filename) => {
      if (!filename) return;
      const ext = path.extname(filename).toLowerCase();
      if (!TARGET_EXTS.has(ext)) return;

      // Resolve full path — filename from fs.watch is relative on some platforms
      const full = path.isAbsolute(filename)
        ? filename
        : path.join(RS3_FOLDER, filename);

      if (!fs.existsSync(full)) return;  // deleted, not created
      scheduleFile(full);
    });
  } catch (e) {
    // fs.watch recursive not supported on all Linux kernels — fall back to polling
    warn(`fs.watch failed (${e.message}), falling back to 10s polling`);
    setInterval(() => {
      const up = loadUploadedLog();
      for (const f of scanRS3Folder(RS3_FOLDER)) {
        if (!up.has(path.basename(f)) && !pendingUploads.has(f)) {
          scheduleFile(f);
        }
      }
    }, 10_000);
  }
}

// ─── ENTRY POINT ───────────────────────────────────────────────────────────
const mode = (process.argv[2] || 'watch').toLowerCase();

(async () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Race Studio 3 → Render auto-uploader               ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  if (mode === 'upload-only') {
    log('Mode: upload-only — scanning for pending files then exiting.');
    const uploaded = loadUploadedLog();
    const files = scanRS3Folder(RS3_FOLDER).filter(f => !uploaded.has(path.basename(f)));
    if (files.length === 0) { log('Nothing to upload.'); process.exit(0); }
    log(`Found ${files.length} file(s) to upload.`);
    for (const f of files) pendingUploads.add(f);
    await runUploadCycle();
    process.exit(0);
  }

  // Watch mode — run forever
  log(`RS3 folder : ${RS3_FOLDER}`);
  log(`Render URL : ${RENDER_URL}`);
  log(`Press Ctrl+C to stop.`);
  console.log('');

  startWatcher();

  // Periodic retry for failed uploads
  setInterval(runUploadCycle, UPLOAD_CHECK_INTERVAL);

  // Keep process alive
  process.stdin.resume();
  process.on('SIGINT', () => {
    log('Stopped.');
    process.exit(0);
  });
})();
