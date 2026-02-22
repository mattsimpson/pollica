'use strict';

class Stats {
  constructor() {
    this.startTime = Date.now();

    this.users = { spawned: 0, joined: 0, connected: 0, errors: 0 };
    this.responses = { submitted: 0, duplicates: 0, errors: 0 };

    // Latency samples in ms
    this.latencies = {
      join: [],
      response: [],
      socketConnect: []
    };

    this._displayTimer = null;
  }

  recordLatency(category, ms) {
    this.latencies[category].push(ms);
  }

  startLiveDisplay(intervalMs = 2000) {
    this._displayTimer = setInterval(() => {
      const elapsed = Math.round((Date.now() - this.startTime) / 1000);
      const line = `[${elapsed}s] Users: ${this.users.joined}/${this.users.spawned} joined | ` +
        `Sockets: ${this.users.connected} connected | ` +
        `Responses: ${this.responses.submitted} | ` +
        `Errors: ${this.users.errors + this.responses.errors}`;
      process.stderr.write(`\r\x1b[K${line}`);
    }, intervalMs);
  }

  stopLiveDisplay() {
    if (this._displayTimer) {
      clearInterval(this._displayTimer);
      this._displayTimer = null;
      process.stderr.write('\n');
    }
  }

  percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  printSummary() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

    console.log('\n=== Load Test Summary ===');
    console.log(`Duration: ${elapsed}s\n`);

    console.log('Users:');
    console.log(`  Spawned:    ${this.users.spawned}`);
    console.log(`  Joined:     ${this.users.joined}`);
    console.log(`  Connected:  ${this.users.connected}`);
    console.log(`  Errors:     ${this.users.errors}`);

    console.log('\nResponses:');
    console.log(`  Submitted:  ${this.responses.submitted}`);
    console.log(`  Duplicates: ${this.responses.duplicates}`);
    console.log(`  Errors:     ${this.responses.errors}`);

    for (const [name, samples] of Object.entries(this.latencies)) {
      if (samples.length === 0) continue;
      console.log(`\n${name} latency (${samples.length} samples):`);
      console.log(`  p50: ${this.percentile(samples, 50).toFixed(0)}ms`);
      console.log(`  p95: ${this.percentile(samples, 95).toFixed(0)}ms`);
      console.log(`  p99: ${this.percentile(samples, 99).toFixed(0)}ms`);
    }

    console.log('');
  }
}

module.exports = Stats;
