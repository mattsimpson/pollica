const db = require('../config/database');

const createQuestion = async (req, res) => {
  try {
    const { sessionId, questionText, questionType, options, correctAnswer, timeLimit } = req.body;
    const presenterId = req.user.id;

    if (!sessionId || !questionText || !questionType) {
      return res.status(400).json({ error: 'Session ID, question text, and type are required' });
    }

    // Verify session ownership (admin can add to any session)
    const [sessions] = await db.query(
      'SELECT presenter_id, is_active FROM sessions WHERE id = ?',
      [sessionId]
    );

    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (sessions[0].presenter_id !== presenterId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to add questions to this session' });
    }

    if (!sessions[0].is_active) {
      return res.status(400).json({ error: 'Cannot add questions to inactive session' });
    }

    const [result] = await db.query(
      `INSERT INTO questions (session_id, presenter_id, question_text, question_type, options, correct_answer, time_limit, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        presenterId,
        questionText,
        questionType,
        options ? JSON.stringify(options) : null,
        correctAnswer || null,
        timeLimit || null,
        true
      ]
    );

    res.status(201).json({
      message: 'Question created successfully',
      questionId: result.insertId
    });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

const getQuestions = async (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Verify session ownership (admin can view any session's questions)
    const [sessions] = await db.query(
      'SELECT presenter_id FROM sessions WHERE id = ?',
      [sessionId]
    );

    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (sessions[0].presenter_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to view questions for this session' });
    }

    const [questions] = await db.query(
      `SELECT q.*,
        COUNT(DISTINCT ar.id) as response_count
      FROM questions q
      LEFT JOIN anonymous_responses ar ON q.id = ar.question_id
      WHERE q.session_id = ?
      GROUP BY q.id
      ORDER BY q.created_at DESC`,
      [sessionId]
    );

    // MySQL JSON type returns already parsed objects
    res.json({ questions });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

const getQuestionById = async (req, res) => {
  try {
    const { questionId } = req.params;

    const [questions] = await db.query(
      `SELECT q.*,
        s.title as session_title,
        s.presenter_id,
        COUNT(DISTINCT ar.id) as response_count
      FROM questions q
      LEFT JOIN sessions s ON q.session_id = s.id
      LEFT JOIN anonymous_responses ar ON q.id = ar.question_id
      WHERE q.id = ?
      GROUP BY q.id`,
      [questionId]
    );

    if (questions.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const question = questions[0];

    // Verify ownership (admin can view any question)
    if (question.presenter_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to view this question' });
    }

    // MySQL JSON type returns already parsed objects

    res.json({ question });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

const updateQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { questionText, questionType, options, correctAnswer, timeLimit, isActive } = req.body;
    const presenterId = req.user.id;

    // Verify ownership (admin can update any question)
    const [questions] = await db.query(
      'SELECT presenter_id FROM questions WHERE id = ?',
      [questionId]
    );

    if (questions.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    if (questions[0].presenter_id !== presenterId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to update this question' });
    }

    const updates = [];
    const params = [];

    if (questionText !== undefined) {
      updates.push('question_text = ?');
      params.push(questionText);
    }

    if (questionType !== undefined) {
      updates.push('question_type = ?');
      params.push(questionType);
    }

    if (options !== undefined) {
      updates.push('options = ?');
      params.push(JSON.stringify(options));
    }

    if (correctAnswer !== undefined) {
      updates.push('correct_answer = ?');
      params.push(correctAnswer);
    }

    if (timeLimit !== undefined) {
      updates.push('time_limit = ?');
      params.push(timeLimit);
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

    params.push(questionId);

    await db.query(
      `UPDATE questions SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    res.json({ message: 'Question updated successfully' });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

const deleteQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const presenterId = req.user.id;

    // Verify ownership (admin can delete any question)
    const [questions] = await db.query(
      'SELECT presenter_id FROM questions WHERE id = ?',
      [questionId]
    );

    if (questions.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    if (questions[0].presenter_id !== presenterId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to delete this question' });
    }

    await db.query('DELETE FROM questions WHERE id = ?', [questionId]);

    res.json({ message: 'Question deleted successfully' });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

const getActiveQuestions = async (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Verify session ownership (admin can view any session's questions)
    const [sessions] = await db.query(
      'SELECT presenter_id FROM sessions WHERE id = ?',
      [sessionId]
    );

    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (sessions[0].presenter_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to view questions for this session' });
    }

    const [questions] = await db.query(
      `SELECT q.*,
        COUNT(DISTINCT ar.id) as response_count
      FROM questions q
      LEFT JOIN anonymous_responses ar ON q.id = ar.question_id
      WHERE q.session_id = ? AND q.is_active = true
      GROUP BY q.id
      ORDER BY q.created_at DESC`,
      [sessionId]
    );

    res.json({ questions });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

const closeQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const presenterId = req.user.id;

    // Verify ownership and get session info (admin can close any question)
    const [questions] = await db.query(
      'SELECT q.presenter_id, q.session_id, q.is_active FROM questions q WHERE q.id = ?',
      [questionId]
    );

    if (questions.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    if (questions[0].presenter_id !== presenterId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to close this question' });
    }

    if (!questions[0].is_active) {
      return res.status(400).json({ error: 'Question is already closed' });
    }

    const sessionId = questions[0].session_id;
    const socketService = req.app.get('socketService');

    // Start the closing countdown
    socketService.emitQuestionClosing(sessionId, parseInt(questionId));

    res.json({ message: 'Question closing initiated', countdown: 5 });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

const cancelCloseQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const presenterId = req.user.id;

    // Verify ownership (admin can cancel close for any question)
    const [questions] = await db.query(
      'SELECT presenter_id FROM questions WHERE id = ?',
      [questionId]
    );

    if (questions.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    if (questions[0].presenter_id !== presenterId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to cancel close for this question' });
    }

    const socketService = req.app.get('socketService');

    // Cancel the closing countdown
    const cancelled = socketService.cancelQuestionClosing(parseInt(questionId));

    if (!cancelled) {
      return res.status(400).json({ error: 'Question is not currently closing' });
    }

    res.json({ message: 'Question close cancelled' });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

const reopenQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const presenterId = req.user.id;

    // Verify ownership and get session info (admin can reopen any question)
    const [questions] = await db.query(
      'SELECT q.presenter_id, q.session_id, q.is_active FROM questions q WHERE q.id = ?',
      [questionId]
    );

    if (questions.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    if (questions[0].presenter_id !== presenterId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to reopen this question' });
    }

    if (questions[0].is_active) {
      return res.status(400).json({ error: 'Question is already open' });
    }

    const sessionId = questions[0].session_id;

    // Reopen the question
    await db.query(
      'UPDATE questions SET is_active = true, closed_at = NULL WHERE id = ?',
      [questionId]
    );

    const socketService = req.app.get('socketService');
    socketService.emitQuestionReopened(sessionId, parseInt(questionId));

    res.json({ message: 'Question reopened successfully' });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  createQuestion,
  getQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  getActiveQuestions,
  closeQuestion,
  cancelCloseQuestion,
  reopenQuestion
};
