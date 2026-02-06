const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  getAllUsers,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
  getAllSessions
} = require('../controllers/adminController');

// All admin routes require authentication and admin role
router.use(authenticateToken, requireRole('admin'));

// User management routes
router.get('/users', getAllUsers);
router.post('/users', createUser);
router.put('/users/:userId', updateUser);
router.post('/users/:userId/reset-password', resetUserPassword);
router.delete('/users/:userId', deleteUser);

// Session management routes
router.get('/sessions', getAllSessions);

module.exports = router;
