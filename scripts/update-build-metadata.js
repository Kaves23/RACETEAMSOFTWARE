#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GIT_LOG_PATH = path.join(ROOT, 'git-log.json');
const CONFIG_PATH = path.join(ROOT, 'config.js');
const MAX_COMMITS = 300;

function run(cmd) {
  return cp.execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function getGitEntries() {
  const raw = run(`git log -n ${MAX_COMMITS} --date=iso-strict --pretty=format:%h%x09%cI%x09%s`);
  if (!raw) return [];
  return raw
    .split('\n')
    .map(line => {
      const [hash, date, ...subjectParts] = line.split('\t');
      return {
        hash: (hash || '').trim(),
        date: (date || '').trim(),
        subject: subjectParts.join('\t').trim()
      };
    })
    .filter(e => e.hash && e.date && e.subject);
}

function expectedConfig(configText, latest) {
  const buildVersion = latest.hash;
  const buildDate = latest.date.slice(0, 10);
  const buildNote = latest.subject.replace(/'/g, "\\'");

  let next = configText;
  next = next.replace(/buildVersion:\s*'[^']*'/, `buildVersion: '${buildVersion}'`);
  next = next.replace(/buildDate:\s*'[^']*'/, `buildDate:    '${buildDate}'`);
  next = next.replace(/buildNote:\s*'[^']*'/, `buildNote:    '${buildNote}'`);
  return next;
}

function sameJson(aText, bText) {
  try {
    const a = JSON.parse(aText);
    const b = JSON.parse(bText);
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (_) {
    return false;
  }
}

function main() {
  const checkOnly = process.argv.includes('--check');

  const entries = getGitEntries();
  if (entries.length === 0) {
    console.error('No git commits found.');
    process.exit(1);
  }

  const latest = entries[0];
  const nextGitLogText = JSON.stringify(entries, null, 2) + '\n';

  const currentGitLogText = fs.existsSync(GIT_LOG_PATH)
    ? fs.readFileSync(GIT_LOG_PATH, 'utf8')
    : '';

  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('config.js not found at repository root.');
    process.exit(1);
  }

  const currentConfigText = fs.readFileSync(CONFIG_PATH, 'utf8');
  const nextConfigText = expectedConfig(currentConfigText, latest);

  if (checkOnly) {
    const gitLogOk = sameJson(currentGitLogText, nextGitLogText);
    const configOk = currentConfigText === nextConfigText;
    if (gitLogOk && configOk) {
      console.log('Build metadata is up to date.');
      process.exit(0);
    }
    console.error('Build metadata is stale. Run: node scripts/update-build-metadata.js');
    process.exit(1);
  }

  const gitLogChanged = !sameJson(currentGitLogText, nextGitLogText);
  const configChanged = currentConfigText !== nextConfigText;

  if (gitLogChanged) fs.writeFileSync(GIT_LOG_PATH, nextGitLogText, 'utf8');
  if (configChanged) fs.writeFileSync(CONFIG_PATH, nextConfigText, 'utf8');

  if (!gitLogChanged && !configChanged) {
    console.log('No metadata changes needed.');
    return;
  }

  console.log('Updated build metadata:');
  console.log(`- buildVersion: ${latest.hash}`);
  console.log(`- buildDate: ${latest.date.slice(0, 10)}`);
  console.log(`- buildNote: ${latest.subject}`);
}

main();
