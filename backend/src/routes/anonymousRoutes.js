const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const anonymousController = require('../controllers/anonymousController');
const { anonymousAuth } = require('../middleware/auth');

const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many authentication attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const codeLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many session lookup attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Public routes (no authentication required)
router.get('/session/:code', codeLookupLimiter, anonymousController.getSessionByCode);
router.post('/join', joinLimiter, anonymousController.joinSession);

// Token-authenticated routes (requires X-Anonymous-Token header)
router.post('/response', anonymousAuth, anonymousController.submitResponse);
router.get('/my-response/:questionId', anonymousAuth, anonymousController.getMyResponse);

module.exports = router;
