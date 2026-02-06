const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
const db = require('../config/database');

// In-memory token cache for anonymous participants
// Key: token, Value: { participant, expiresAt }
const anonymousTokenCache = new Map();
const TOKEN_CACHE_TTL = 30000; // 30 seconds

// Clean expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of anonymousTokenCache) {
    if (entry.expiresAt < now) {
      anonymousTokenCache.delete(token);
    }
  }
}, 60000); // Clean every 60 seconds

// Exported function to look up token (used by both middleware and socket auth)
const lookupAnonymousToken = async (token) => {
  // Check cache first
  const cached = anonymousTokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return { participant: cached.participant, fromCache: true };
  }

  // Cache miss - query database
  const [participants] = await db.query(
    `SELECT ap.*, s.is_active as session_is_active
    FROM anonymous_participants ap
    LEFT JOIN sessions s ON ap.session_id = s.id
    WHERE ap.anonymous_token = ?`,
    [token]
  );

  if (participants.length === 0) {
    return { participant: null, fromCache: false };
  }

  const participant = participants[0];

  // Cache the result if session is active
  if (participant.session_is_active) {
    anonymousTokenCache.set(token, {
      participant,
      expiresAt: Date.now() + TOKEN_CACHE_TTL
    });
  }

  return { participant, fromCache: false };
};

// Invalidate cache entry (call when session closes)
const invalidateAnonymousTokenCache = (token) => {
  anonymousTokenCache.delete(token);
};

// Clear all cache entries for a session (call when session closes)
const invalidateSessionTokenCache = (sessionId) => {
  for (const [token, entry] of anonymousTokenCache) {
    if (entry.participant.session_id === sessionId) {
      anonymousTokenCache.delete(token);
    }
  }
};

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const user = jwt.verify(token, jwtConfig.secret);

    // Validate token_version against the database to ensure token hasn't been invalidated
    const [rows] = await db.query('SELECT token_version FROM users WHERE id = ?', [user.id]);
    if (rows.length === 0 || rows[0].token_version !== user.tokenVersion) {
      return res.status(403).json({ error: 'Token has been invalidated. Please log in again.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

// Anonymous authentication middleware - validates X-Anonymous-Token header
const anonymousAuth = async (req, res, next) => {
  const token = req.headers['x-anonymous-token'];

  if (!token) {
    return res.status(401).json({ error: 'Anonymous token required' });
  }

  try {
    const { participant } = await lookupAnonymousToken(token);

    if (!participant) {
      return res.status(403).json({ error: 'Invalid anonymous token' });
    }

    if (!participant.session_is_active) {
      // Invalidate cache entry since session is no longer active
      invalidateAnonymousTokenCache(token);
      return res.status(400).json({ error: 'Session is no longer active' });
    }

    req.anonymousParticipant = participant;
    next();
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  authenticateToken,
  requireRole,
  anonymousAuth,
  lookupAnonymousToken,
  invalidateAnonymousTokenCache,
  invalidateSessionTokenCache
};
