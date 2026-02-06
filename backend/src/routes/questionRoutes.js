const express = require('express');
const router = express.Router();
const questionController = require('../controllers/questionController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Presenter and admin routes
router.post('/', authenticateToken, requireRole('presenter', 'admin'), questionController.createQuestion);
router.put('/:questionId', authenticateToken, requireRole('presenter', 'admin'), questionController.updateQuestion);
router.delete('/:questionId', authenticateToken, requireRole('presenter', 'admin'), questionController.deleteQuestion);
router.put('/:questionId/close', authenticateToken, requireRole('presenter', 'admin'), questionController.closeQuestion);
router.put('/:questionId/cancel-close', authenticateToken, requireRole('presenter', 'admin'), questionController.cancelCloseQuestion);
router.put('/:questionId/reopen', authenticateToken, requireRole('presenter', 'admin'), questionController.reopenQuestion);

// Shared routes (presenter only now)
router.get('/', authenticateToken, questionController.getQuestions);
router.get('/active', authenticateToken, questionController.getActiveQuestions);
router.get('/:questionId', authenticateToken, questionController.getQuestionById);

module.exports = router;
