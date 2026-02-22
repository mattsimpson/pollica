'use strict';

const http = require('http');
const https = require('https');
const { io } = require('socket.io-client');
const { generateAnswer, thinkTimeMs } = require('./answers');

// Transient error codes worth retrying
const RETRYABLE = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT',
  'EAI_AGAIN', 'UND_ERR_SOCKET', 'EHOSTUNREACH'
]);

function isRetryable(err) {
  if (err.code && RETRYABLE.has(err.code)) return true;
  const msg = err.message || '';
  if (msg.includes('ECONNRESET')) return true;
  if (msg.includes('TLS connection')) return true;
  if (msg.includes('socket disconnected')) return true;
  if (msg.includes('socket hang up')) return true;
  return false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class VirtualUser {
  constructor(id, baseUrl, joinCode, stats, opts = {}) {
    this.id = id;
    this.baseUrl = baseUrl;
    this.joinCode = joinCode;
    this.stats = stats;
    this.token = null;
    this.sessionId = null;
    this.socket = null;
    this.state = 'idle';
    this._destroyed = false;

    // Shared agents for connection pooling
    this._httpAgent = opts.httpAgent || null;
    this._httpsAgent = opts.httpsAgent || null;

    // Semaphore to limit concurrent socket connections
    this._socketSemaphore = opts.socketSemaphore || null;
  }

  async start(displayName) {
    if (this._destroyed) return;
    try {
      // Step 1: Validate session and check for active question
      const sessionData = await this._getSession();

      // Step 2: Join session
      const joinStart = Date.now();
      await this._joinSession(displayName);
      this.stats.recordLatency('join', Date.now() - joinStart);
      this.stats.users.joined++;

      // Step 3: Connect socket (with semaphore)
      if (this._socketSemaphore) await this._socketSemaphore.acquire();
      try {
        const socketStart = Date.now();
        await this._connectSocket();
        this.stats.recordLatency('socketConnect', Date.now() - socketStart);
        this.stats.users.connected++;
      } finally {
        if (this._socketSemaphore) this._socketSemaphore.release();
      }

      // Step 4: If a question is already active, answer it after think time
      if (sessionData.selectedQuestion) {
        this.state = 'answering';
        const q = sessionData.selectedQuestion;
        const delay = thinkTimeMs();
        setTimeout(() => {
          if (this._destroyed) return;
          const answer = generateAnswer(q);
          this._submitResponse(q.id, answer).then(() => {
            this.state = 'waiting';
          });
        }, delay);
      } else {
        this.state = 'waiting';
      }
    } catch (err) {
      this.stats.users.errors++;
      if (!this._destroyed) {
        process.stderr.write(`\n[user-${this.id}] Setup failed: ${err.message}\n`);
      }
    }
  }

  destroy() {
    this._destroyed = true;
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // --- HTTP with retry ---

  async _requestWithRetry(method, path, body, maxRetries = 3) {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (this._destroyed) throw new Error('Destroyed');
      try {
        return await this._request(method, path, body);
      } catch (err) {
        lastErr = err;
        // Don't retry 4xx errors (client errors)
        if (err.status && err.status >= 400 && err.status < 500) throw err;
        if (!isRetryable(err) && attempt > 0) throw err;
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 8000);
          await sleep(delay);
        }
      }
    }
    throw lastErr;
  }

  _request(method, path, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;
      const agent = isHttps ? this._httpsAgent : this._httpAgent;

      const headers = { 'Accept': 'application/json' };
      let payload;
      if (body) {
        payload = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(payload);
      }
      if (this.token) {
        headers['X-Anonymous-Token'] = this.token;
      }

      const reqOpts = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method,
        headers
      };
      if (agent) reqOpts.agent = agent;

      const req = lib.request(reqOpts, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode >= 400) {
              const err = new Error(json.error || `HTTP ${res.statusCode}`);
              err.status = res.statusCode;
              reject(err);
            } else {
              resolve(json);
            }
          } catch {
            reject(new Error(`Invalid JSON (HTTP ${res.statusCode})`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(20000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (payload) req.write(payload);
      req.end();
    });
  }

  async _getSession() {
    const data = await this._requestWithRetry('GET', `/api/anonymous/session/${this.joinCode}`);
    return data;
  }

  async _joinSession(displayName) {
    const result = await this._requestWithRetry('POST', '/api/anonymous/join', {
      joinCode: this.joinCode,
      displayName
    });
    this.token = result.token;
    this.sessionId = result.sessionId;
  }

  async _submitResponse(questionId, answerText) {
    const start = Date.now();
    try {
      await this._requestWithRetry('POST', '/api/anonymous/response', {
        questionId,
        answerText
      }, 2);
      this.stats.recordLatency('response', Date.now() - start);
      this.stats.responses.submitted++;
    } catch (err) {
      if (err.status === 409) {
        this.stats.responses.duplicates++;
      } else {
        this.stats.responses.errors++;
        if (!this._destroyed) {
          process.stderr.write(`\n[user-${this.id}] Response error: ${err.message}\n`);
        }
      }
    }
  }

  // --- Socket with retry ---

  async _connectSocket() {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (this._destroyed) throw new Error('Destroyed');
      try {
        return await this._connectSocketOnce();
      } catch (err) {
        lastErr = err;
        if (attempt < 2) {
          const delay = 1000 * Math.pow(2, attempt) + Math.random() * 1000;
          await sleep(delay);
        }
      }
    }
    throw lastErr;
  }

  _connectSocketOnce() {
    return new Promise((resolve, reject) => {
      if (this._destroyed) return reject(new Error('Destroyed'));

      const socketUrl = this.baseUrl.replace(/\/$/, '');
      this.socket = io(`${socketUrl}/anonymous`, {
        auth: { token: this.token },
        transports: ['websocket'],
        reconnection: false,
        timeout: 20000
      });

      const connectTimeout = setTimeout(() => {
        this.socket.disconnect();
        this.socket = null;
        reject(new Error('Socket connect timeout'));
      }, 20000);

      this.socket.on('connect', () => {
        clearTimeout(connectTimeout);
        this._setupListeners();
        resolve();
      });

      this.socket.on('connect_error', (err) => {
        clearTimeout(connectTimeout);
        this.socket.disconnect();
        this.socket = null;
        reject(new Error(`Socket connect failed: ${err.message}`));
      });

      this.socket.on('disconnect', () => {
        if (!this._destroyed) {
          this.stats.users.connected--;
        }
      });
    });
  }

  _setupListeners() {
    this.socket.on('question-changed', ({ questionId, question }) => {
      if (this._destroyed || this.state === 'answering') return;
      this.state = 'answering';

      const delay = thinkTimeMs();
      setTimeout(() => {
        if (this._destroyed) return;
        const answer = generateAnswer(question);
        this._submitResponse(questionId, answer).then(() => {
          this.state = 'waiting';
        });
      }, delay);
    });

    this.socket.on('question-deselected', () => {
      this.state = 'waiting';
    });

    this.socket.on('session-closed', () => {
      this.state = 'closed';
    });
  }
}

module.exports = VirtualUser;
