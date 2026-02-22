#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const { program } = require('commander');
const VirtualUser = require('./lib/virtual-user');
const Stats = require('./lib/stats');
const { generateName } = require('./lib/names');

// Simple semaphore for limiting concurrent operations
class Semaphore {
  constructor(max) {
    this._max = max;
    this._count = 0;
    this._queue = [];
  }
  acquire() {
    if (this._count < this._max) {
      this._count++;
      return Promise.resolve();
    }
    return new Promise(resolve => this._queue.push(resolve));
  }
  release() {
    if (this._queue.length > 0) {
      this._queue.shift()();
    } else {
      this._count--;
    }
  }
}

program
  .requiredOption('--code <code>', 'Session join code')
  .option('--url <url>', 'Base URL', 'http://localhost:7011')
  .option('--users <n>', 'Number of virtual users', v => parseInt(v, 10), 500)
  .option('--ramp-up <seconds>', 'Ramp-up period in seconds', v => parseInt(v, 10), 60)
  .option('--duration <seconds>', 'Max duration in seconds (0 = unlimited)', v => parseInt(v, 10), 0)
  .parse();

const opts = program.opts();
const baseUrl = opts.url.replace(/\/$/, '');
const joinCode = opts.code.toLowerCase();
const totalUsers = opts.users;
const rampUpSeconds = opts.rampUp;
const duration = opts.duration;

console.log(`Pollica Load Test`);
console.log(`  Target:   ${baseUrl}`);
console.log(`  Code:     ${joinCode}`);
console.log(`  Users:    ${totalUsers}`);
console.log(`  Ramp-up:  ${rampUpSeconds}s`);
console.log(`  Duration: ${duration > 0 ? duration + 's' : 'unlimited (Ctrl+C to stop)'}`);
console.log('');

// Shared HTTP agents with connection pooling and keep-alive
const isHttps = baseUrl.startsWith('https');
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 10 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 10 });

// Limit concurrent WebSocket handshakes (prevents TLS storm)
const socketSemaphore = new Semaphore(20);

const stats = new Stats();
const users = [];
let spawnIndex = 0;
let spawnTimer = null;
let durationTimer = null;
let shuttingDown = false;

function spawnUser() {
  if (spawnIndex >= totalUsers || shuttingDown) {
    if (spawnTimer) clearInterval(spawnTimer);
    return;
  }

  const idx = spawnIndex++;
  stats.users.spawned++;

  const name = generateName(idx);
  const user = new VirtualUser(idx, baseUrl, joinCode, stats, {
    httpAgent,
    httpsAgent,
    socketSemaphore
  });
  users.push(user);
  user.start(name);
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  if (spawnTimer) clearInterval(spawnTimer);
  if (durationTimer) clearTimeout(durationTimer);

  stats.stopLiveDisplay();

  process.stderr.write('\nShutting down...\n');

  for (const user of users) {
    user.destroy();
  }

  httpAgent.destroy();
  httpsAgent.destroy();

  stats.printSummary();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start
stats.startLiveDisplay();

const intervalMs = Math.max(1, Math.floor((rampUpSeconds * 1000) / totalUsers));
spawnTimer = setInterval(spawnUser, intervalMs);
spawnUser(); // spawn first immediately

if (duration > 0) {
  durationTimer = setTimeout(shutdown, duration * 1000);
}
