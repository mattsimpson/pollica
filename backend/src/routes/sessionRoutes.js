const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Presenter and admin routes
router.post('/', authenticateToken, requireRole('presenter', 'admin'), sessionController.createSession);
router.get('/my-sessions', authenticateToken, requireRole('presenter', 'admin'), sessionController.getSessions);
router.get('/active', authenticateToken, sessionController.getActiveSessions);
router.get('/:sessionId', authenticateToken, sessionController.getSessionById);
router.put('/:sessionId', authenticateToken, requireRole('presenter', 'admin'), sessionController.updateSession);
router.put('/:sessionId/select-question', authenticateToken, requireRole('presenter', 'admin'), sessionController.selectQuestion);

module.exports = router;
