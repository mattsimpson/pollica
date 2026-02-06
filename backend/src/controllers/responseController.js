const db = require('../config/database');

const getResponsesByQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;

    // Verify user has access to these responses
    const [questions] = await db.query(
      'SELECT presenter_id FROM questions WHERE id = ?',
      [questionId]
    );

    if (questions.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Only the session owner or admin can see responses
    if (questions[0].presenter_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to view these responses' });
    }

    // Get anonymous responses (only source of responses now)
    const [anonymousResponses] = await db.query(
      `SELECT ar.id, ar.question_id, ar.answer_text, ar.response_time, ar.created_at,
        ap.display_name,
        ap.display_name as first_name,
        true as isAnonymous
      FROM anonymous_responses ar
      LEFT JOIN anonymous_participants ap ON ar.anonymous_participant_id = ap.id
      WHERE ar.question_id = ?
      ORDER BY ar.created_at ASC`,
      [questionId]
    );

    res.json({ responses: anonymousResponses });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

const getResponseStats = async (req, res) => {
  try {
    const { questionId } = req.params;

    // Verify user has access
    const [questions] = await db.query(
      'SELECT q.*, s.presenter_id FROM questions q LEFT JOIN sessions s ON q.session_id = s.id WHERE q.id = ?',
      [questionId]
    );

    if (questions.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    if (questions[0].presenter_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to view statistics' });
    }

    const question = questions[0];

    // Get anonymous response statistics (only source now)
    const [anonymousStats] = await db.query(
      `SELECT
        COUNT(*) as total_responses,
        AVG(response_time) as avg_response_time
      FROM anonymous_responses
      WHERE question_id = ?`,
      [questionId]
    );

    const totalResponses = anonymousStats[0].total_responses || 0;
    const avgResponseTime = anonymousStats[0].avg_response_time || null;

    // Get answer distribution for multiple choice and true/false
    let answerDistribution = null;
    let numericStats = null;

    if (question.question_type === 'multiple_choice' || question.question_type === 'true_false') {
      const [anonymousDist] = await db.query(
        `SELECT answer_text, COUNT(*) as count
        FROM anonymous_responses
        WHERE question_id = ?
        GROUP BY answer_text`,
        [questionId]
      );

      answerDistribution = anonymousDist.sort((a, b) => b.count - a.count);
    } else if (question.question_type === 'numeric') {
      const [numericResponses] = await db.query(
        `SELECT answer_text FROM anonymous_responses WHERE question_id = ?`,
        [questionId]
      );

      // Parse numeric values, filtering out invalid entries
      const values = numericResponses
        .map(r => parseFloat(r.answer_text))
        .filter(v => !isNaN(v) && isFinite(v));

      if (values.length > 0) {
        values.sort((a, b) => a - b);

        const sum = values.reduce((a, b) => a + b, 0);
        const mean = sum / values.length;
        const min = values[0];
        const max = values[values.length - 1];
        const median = values.length % 2 === 0
          ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2
          : values[Math.floor(values.length / 2)];
        const range = max - min;

        // Build histogram with ~8-10 bins (auto-calculated)
        const binCount = Math.min(10, Math.max(1, Math.ceil(Math.sqrt(values.length))));
        const binWidth = range / binCount || 1;

        const bins = [];
        for (let i = 0; i < binCount; i++) {
          const binMin = min + i * binWidth;
          const binMax = min + (i + 1) * binWidth;
          const count = values.filter(v =>
            i === binCount - 1 ? v >= binMin && v <= binMax : v >= binMin && v < binMax
          ).length;
          bins.push({
            range: `${binMin.toFixed(1)}-${binMax.toFixed(1)}`,
            min: binMin,
            max: binMax,
            count
          });
        }

        numericStats = { mean, median, min, max, range };
        answerDistribution = bins;
      }
    }

    res.json({
      questionId: parseInt(questionId),
      questionType: question.question_type,
      totalResponses: totalResponses,
      registeredResponses: 0,
      anonymousResponses: totalResponses,
      averageResponseTime: avgResponseTime,
      correctCount: null,
      incorrectCount: null,
      answerDistribution: answerDistribution,
      numericStats: numericStats
    });
  } catch (error) {

    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getResponsesByQuestion,
  getResponseStats
};
