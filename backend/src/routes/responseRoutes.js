const express = require('express');
const router = express.Router();
const responseController = require('../controllers/responseController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Presenter and admin routes
router.get('/question/:questionId', authenticateToken, requireRole('presenter', 'admin'), responseController.getResponsesByQuestion);
router.get('/question/:questionId/stats', authenticateToken, requireRole('presenter', 'admin'), responseController.getResponseStats);

module.exports = router;
