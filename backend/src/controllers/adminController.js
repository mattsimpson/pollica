const bcrypt = require('bcrypt');
const db = require('../config/database');

// Get all users with session counts
const getAllUsers = async (req, res) => {
  try {
    const [users] = await db.query(`
      SELECT
        u.id,
        u.email,
        u.role,
        u.first_name,
        u.last_name,
        u.created_at,
        COUNT(s.id) as session_count
      FROM users u
      LEFT JOIN sessions s ON u.id = s.presenter_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    res.json({
      users: users.map(user => ({
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
        createdAt: user.created_at,
        sessionCount: user.session_count
      }))
    });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create a new user
const createUser = async (req, res) => {
  try {
    const { email, password, role, firstName, lastName } = req.body;

    // Validate input
    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Email, password, and role are required' });
    }

    if (!['presenter', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if email already exists
    const [existingUsers] = await db.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user
    const [result] = await db.query(
      'INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
      [email, passwordHash, role, firstName || null, lastName || null]
    );

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: result.insertId,
        email,
        role,
        firstName: firstName || null,
        lastName: lastName || null
      }
    });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update a user
const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { email, role, firstName, lastName } = req.body;
    const currentUserId = req.user.id;

    // Prevent admin from changing their own role
    if (parseInt(userId) === currentUserId && role && role !== req.user.role) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    // Check if user exists
    const [existingUsers] = await db.query(
      'SELECT id FROM users WHERE id = ?',
      [userId]
    );

    if (existingUsers.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if email is taken by another user
    if (email) {
      const [emailCheck] = await db.query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, userId]
      );

      if (emailCheck.length > 0) {
        return res.status(409).json({ error: 'Email is already in use' });
      }
    }

    // Validate role if provided
    if (role && !['presenter', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];

    if (email) {
      updates.push('email = ?');
      values.push(email);
    }
    if (role) {
      updates.push('role = ?');
      values.push(role);
      // Invalidate existing tokens when role changes
      updates.push('token_version = token_version + 1');
    }
    if (firstName !== undefined) {
      updates.push('first_name = ?');
      values.push(firstName || null);
    }
    if (lastName !== undefined) {
      updates.push('last_name = ?');
      values.push(lastName || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(userId);
    await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // Fetch updated user
    const [users] = await db.query(
      'SELECT id, email, role, first_name, last_name FROM users WHERE id = ?',
      [userId]
    );

    const user = users[0];
    res.json({
      message: 'User updated successfully',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name
      }
    });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

// Reset user password
const resetUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Check if user exists
    const [existingUsers] = await db.query(
      'SELECT id FROM users WHERE id = ?',
      [userId]
    );

    if (existingUsers.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Increment token_version to invalidate existing tokens after password reset
    await db.query(
      'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?',
      [passwordHash, userId]
    );

    res.json({ message: 'Password reset successfully' });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete a user
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    // Prevent admin from deleting themselves
    if (parseInt(userId) === currentUserId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Check if user exists
    const [existingUsers] = await db.query(
      'SELECT id FROM users WHERE id = ?',
      [userId]
    );

    if (existingUsers.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user (cascades to sessions, questions, etc.)
    await db.query('DELETE FROM users WHERE id = ?', [userId]);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all sessions with optional filters
const getAllSessions = async (req, res) => {
  try {
    const { presenterId, status, search } = req.query;

    let query = `
      SELECT
        s.id,
        s.title,
        s.description,
        s.is_active,
        s.join_code,
        s.created_at,
        s.closed_at,
        u.id as presenter_id,
        u.first_name as presenter_first_name,
        u.last_name as presenter_last_name,
        u.email as presenter_email,
        (SELECT COUNT(*) FROM questions WHERE session_id = s.id) as question_count,
        (SELECT COUNT(*) FROM anonymous_participants WHERE session_id = s.id) as participant_count
      FROM sessions s
      JOIN users u ON s.presenter_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (presenterId) {
      query += ' AND s.presenter_id = ?';
      params.push(presenterId);
    }

    if (status === 'open') {
      query += ' AND s.is_active = true';
    } else if (status === 'closed') {
      query += ' AND s.is_active = false';
    }

    if (search) {
      query += ' AND s.title LIKE ?';
      params.push(`%${search}%`);
    }

    query += ' ORDER BY s.created_at DESC';

    const [sessions] = await db.query(query, params);

    res.json({
      sessions: sessions.map(session => ({
        id: session.id,
        title: session.title,
        description: session.description,
        is_active: session.is_active,
        join_code: session.join_code,
        created_at: session.created_at,
        closed_at: session.closed_at,
        presenter_id: session.presenter_id,
        presenter_first_name: session.presenter_first_name,
        presenter_last_name: session.presenter_last_name,
        presenter_email: session.presenter_email,
        question_count: session.question_count,
        participant_count: session.participant_count
      }))
    });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getAllUsers,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
  getAllSessions
};
