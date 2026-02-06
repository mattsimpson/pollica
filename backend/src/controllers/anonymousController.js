const db = require('../config/database');
const crypto = require('crypto');

// Generate a 4-character join code (letter-digit-letter-digit pattern)
const generateJoinCode = () => {
  const letters = 'abcdefghjkmnpqrstuvwxyz'; // Exclude confusing chars like l, i, o
  const digits = '23456789'; // Exclude 0, 1 to avoid confusion

  return (
    letters[Math.floor(Math.random() * letters.length)] +
    digits[Math.floor(Math.random() * digits.length)] +
    letters[Math.floor(Math.random() * letters.length)] +
    digits[Math.floor(Math.random() * digits.length)]
  );
};

// Generate a unique join code that doesn't exist in the database
const generateUniqueJoinCode = async () => {
  let code;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    code = generateJoinCode();
    const [existing] = await db.query(
      'SELECT id FROM sessions WHERE join_code = ?',
      [code]
    );
    if (existing.length === 0) {
      return code;
    }
    attempts++;
  }

  throw new Error('Failed to generate unique join code');
};

// Generate anonymous token
const generateAnonymousToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// GET /api/anonymous/session/:code - Public endpoint to get session by join code
const getSessionByCode = async (req, res) => {
  try {
    const { code } = req.params;

    const [sessions] = await db.query(
      `SELECT s.id, s.title, s.description, s.is_active, s.selected_question_id,
        u.first_name as presenter_first_name, u.last_name as presenter_last_name
      FROM sessions s
      LEFT JOIN users u ON s.presenter_id = u.id
      WHERE s.join_code = ?`,
      [code.toLowerCase()]
    );

    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessions[0];

    if (!session.is_active) {
      return res.status(400).json({ error: 'Session is no longer active' });
    }

    // Get the selected question if one is set
    let selectedQuestion = null;
    if (session.selected_question_id) {
      const [questions] = await db.query(
        `SELECT id, question_text, question_type, options, time_limit
        FROM questions WHERE id = ? AND is_active = true`,
        [session.selected_question_id]
      );
      if (questions.length > 0) {
        selectedQuestion = questions[0];
        // Parse options if it's a string
        if (selectedQuestion.options && typeof selectedQuestion.options === 'string') {
          selectedQuestion.options = JSON.parse(selectedQuestion.options);
        }
      }
    }

    // Get anonymous participant count
    const [countResult] = await db.query(
      'SELECT COUNT(*) as count FROM anonymous_participants WHERE session_id = ?',
      [session.id]
    );

    res.json({
      session: {
        id: session.id,
        title: session.title,
        description: session.description,
        presenterName: `${session.presenter_first_name || ''} ${session.presenter_last_name || ''}`.trim(),
        selectedQuestionId: session.selected_question_id
      },
      selectedQuestion,
      anonymousParticipantCount: countResult[0].count
    });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/anonymous/join - Join a session anonymously
const joinSession = async (req, res) => {
  try {
    const { joinCode, displayName } = req.body;

    if (!joinCode || !displayName) {
      return res.status(400).json({ error: 'Join code and display name are required' });
    }

    if (displayName.length > 50) {
      return res.status(400).json({ error: 'Display name must be 50 characters or less' });
    }

    // Find the session
    const [sessions] = await db.query(
      'SELECT id, is_active FROM sessions WHERE join_code = ?',
      [joinCode.toLowerCase()]
    );

    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!sessions[0].is_active) {
      return res.status(400).json({ error: 'Session is no longer active' });
    }

    const sessionId = sessions[0].id;
    const token = generateAnonymousToken();

    // Create anonymous participant
    const [result] = await db.query(
      'INSERT INTO anonymous_participants (session_id, anonymous_token, display_name) VALUES (?, ?, ?)',
      [sessionId, token, displayName.trim()]
    );

    res.status(201).json({
      message: 'Joined session successfully',
      token,
      participantId: result.insertId,
      sessionId
    });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/anonymous/response - Submit a response (requires anonymous token)
const submitResponse = async (req, res) => {
  try {
    const { questionId, answerText, responseTime } = req.body;
    const participant = req.anonymousParticipant;

    if (!questionId || !answerText) {
      return res.status(400).json({ error: 'Question ID and answer are required' });
    }

    if (answerText.length > 1000) {
      return res.status(400).json({ error: 'Answer text must be 1000 characters or less' });
    }

    // Check if question exists and is active
    const [questions] = await db.query(
      `SELECT q.id, q.is_active, q.session_id, s.selected_question_id
      FROM questions q
      LEFT JOIN sessions s ON q.session_id = s.id
      WHERE q.id = ?`,
      [questionId]
    );

    if (questions.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const question = questions[0];

    if (!question.is_active) {
      return res.status(400).json({ error: 'Question is no longer active' });
    }

    // Verify the question belongs to the participant's session
    if (question.session_id !== participant.session_id) {
      return res.status(403).json({ error: 'Question does not belong to your session' });
    }

    // Verify this is the currently selected question
    if (question.selected_question_id !== questionId) {
      return res.status(400).json({ error: 'This question is not currently active for responses' });
    }

    // Insert response - rely on UNIQUE constraint for duplicate detection
    // This eliminates a redundant SELECT query before INSERT
    let result;
    try {
      [result] = await db.query(
        'INSERT INTO anonymous_responses (question_id, anonymous_participant_id, answer_text, response_time) VALUES (?, ?, ?, ?)',
        [questionId, participant.id, answerText, responseTime || null]
      );
    } catch (insertError) {
      // Handle duplicate key error (ER_DUP_ENTRY)
      if (insertError.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'You have already responded to this question' });
      }
      throw insertError;
    }

    // Update last_active_at asynchronously - fire and forget (non-critical metadata)
    db.query(
      'UPDATE anonymous_participants SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?',
      [participant.id]
    ).catch(() => {});

    // Emit real-time update to presenter via socket
    const socketService = req.app.get('socketService');
    if (socketService) {
      socketService.emitNewAnonymousResponse(question.session_id, {
        id: result.insertId,
        question_id: questionId,
        display_name: participant.display_name,
        answer_text: answerText,
        response_time: responseTime || null,
        created_at: new Date(),
        isAnonymous: true
      });
    }

    res.status(201).json({
      message: 'Response submitted successfully',
      responseId: result.insertId
    });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/anonymous/my-response/:questionId - Check if already responded
const getMyResponse = async (req, res) => {
  try {
    const { questionId } = req.params;
    const participant = req.anonymousParticipant;

    const [responses] = await db.query(
      'SELECT id, answer_text, created_at FROM anonymous_responses WHERE question_id = ? AND anonymous_participant_id = ?',
      [questionId, participant.id]
    );

    if (responses.length === 0) {
      return res.json({ hasResponded: false, response: null });
    }

    res.json({
      hasResponded: true,
      response: responses[0]
    });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  generateUniqueJoinCode,
  getSessionByCode,
  joinSession,
  submitResponse,
  getMyResponse
};
