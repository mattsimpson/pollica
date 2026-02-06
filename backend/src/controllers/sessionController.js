const db = require('../config/database');
const { generateUniqueJoinCode } = require('./anonymousController');

const createSession = async (req, res) => {
  try {
    const { title, description } = req.body;
    const presenterId = req.user.id;

    if (!title) {
      return res.status(400).json({ error: 'Session title is required' });
    }

    // Generate a unique join code
    const joinCode = await generateUniqueJoinCode();

    const [result] = await db.query(
      'INSERT INTO sessions (presenter_id, title, description, is_active, join_code) VALUES (?, ?, ?, ?, ?)',
      [presenterId, title, description || null, true, joinCode]
    );

    res.status(201).json({
      message: 'Session created successfully',
      sessionId: result.insertId,
      joinCode
    });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

const getSessions = async (req, res) => {
  try {
    const presenterId = req.user.id;
    const { active } = req.query;

    let query = `
      SELECT s.*,
        u.email as presenter_email,
        u.first_name as presenter_first_name,
        u.last_name as presenter_last_name,
        COUNT(DISTINCT q.id) as question_count,
        COUNT(DISTINCT ap.id) as participant_count
      FROM sessions s
      LEFT JOIN users u ON s.presenter_id = u.id
      LEFT JOIN questions q ON s.id = q.session_id
      LEFT JOIN anonymous_participants ap ON s.id = ap.session_id
      WHERE s.presenter_id = ?
    `;

    const params = [presenterId];

    if (active === 'true') {
      query += ' AND s.is_active = true';
    }

    query += ' GROUP BY s.id ORDER BY s.created_at DESC';

    const [sessions] = await db.query(query, params);

    res.json({ sessions });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

const getSessionById = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const [sessions] = await db.query(
      `SELECT s.*,
        u.email as presenter_email,
        u.first_name as presenter_first_name,
        u.last_name as presenter_last_name
      FROM sessions s
      LEFT JOIN users u ON s.presenter_id = u.id
      WHERE s.id = ?`,
      [sessionId]
    );

    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessions[0];

    // Verify ownership (admin can view any session)
    if (session.presenter_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to view this session' });
    }

    // Get questions for this session with response counts (anonymous only now)
    const [questions] = await db.query(
      `SELECT q.*,
        (SELECT COUNT(*) FROM anonymous_responses WHERE question_id = q.id) as response_count
      FROM questions q
      WHERE q.session_id = ?
      ORDER BY q.created_at DESC`,
      [sessionId]
    );

    // Get anonymous participant count
    const [anonymousCount] = await db.query(
      'SELECT COUNT(*) as count FROM anonymous_participants WHERE session_id = ?',
      [sessionId]
    );

    res.json({
      session,
      questions,
      participants: [],
      anonymousParticipantCount: anonymousCount[0].count
    });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

const updateSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { title, description, isActive } = req.body;
    const presenterId = req.user.id;

    // Verify ownership (admin can update any session)
    const [sessions] = await db.query(
      'SELECT presenter_id FROM sessions WHERE id = ?',
      [sessionId]
    );

    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (sessions[0].presenter_id !== presenterId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to update this session' });
    }

    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }

    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive);

      if (!isActive) {
        updates.push('closed_at = CURRENT_TIMESTAMP');
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(sessionId);

    await db.query(
      `UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // If session is being closed, emit session-closed event to anonymous clients
    if (isActive === false) {
      const socketService = req.app.get('socketService');
      if (socketService) {
        socketService.emitSessionClosed(sessionId);
      }
    }

    // If session is being reopened, emit session-reopened event
    if (isActive === true) {
      const socketService = req.app.get('socketService');
      if (socketService) {
        socketService.emitSessionReopened(sessionId);
      }
    }

    res.json({ message: 'Session updated successfully' });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

const getActiveSessions = async (req, res) => {
  try {
    const [sessions] = await db.query(
      `SELECT s.*,
        u.email as presenter_email,
        u.first_name as presenter_first_name,
        u.last_name as presenter_last_name,
        COUNT(DISTINCT q.id) as question_count
      FROM sessions s
      LEFT JOIN users u ON s.presenter_id = u.id
      LEFT JOIN questions q ON s.id = q.session_id AND q.is_active = true
      WHERE s.is_active = true
      GROUP BY s.id
      ORDER BY s.created_at DESC`,
      []
    );

    res.json({ sessions });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

const selectQuestion = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { questionId } = req.body;
    const presenterId = req.user.id;

    // Verify ownership (admin can update any session)
    const [sessions] = await db.query(
      'SELECT presenter_id, selected_question_id FROM sessions WHERE id = ?',
      [sessionId]
    );

    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (sessions[0].presenter_id !== presenterId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to update this session' });
    }

    const previousQuestionId = sessions[0].selected_question_id;

    // If questionId is null, we're deselecting
    if (questionId === null) {
      await db.query(
        'UPDATE sessions SET selected_question_id = NULL WHERE id = ?',
        [sessionId]
      );

      // Emit socket event
      const socketService = req.app.get('socketService');
      if (socketService) {
        socketService.emitQuestionDeselected(sessionId, previousQuestionId);
      }

      return res.json({ message: 'Question deselected' });
    }

    // Verify the question belongs to this session
    const [questions] = await db.query(
      'SELECT id, question_text, question_type, options, time_limit, is_active FROM questions WHERE id = ? AND session_id = ?',
      [questionId, sessionId]
    );

    if (questions.length === 0) {
      return res.status(404).json({ error: 'Question not found in this session' });
    }

    // If question is closed, automatically reopen it when presenting
    if (!questions[0].is_active) {
      await db.query(
        'UPDATE questions SET is_active = true, closed_at = NULL WHERE id = ?',
        [questionId]
      );
      // Emit question reopened event
      const socketService = req.app.get('socketService');
      if (socketService) {
        socketService.emitQuestionReopened(sessionId, questionId);
      }
    }

    // Update selected question
    await db.query(
      'UPDATE sessions SET selected_question_id = ? WHERE id = ?',
      [questionId, sessionId]
    );

    const question = questions[0];
    if (question.options && typeof question.options === 'string') {
      question.options = JSON.parse(question.options);
    }

    // Emit socket event for question selection
    const socketService = req.app.get('socketService');
    if (socketService) {
      socketService.emitQuestionSelected(sessionId, questionId, question, previousQuestionId);
    }

    res.json({
      message: 'Question selected',
      selectedQuestionId: questionId
    });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  createSession,
  getSessions,
  getSessionById,
  updateSession,
  getActiveSessions,
  selectQuestion
};
