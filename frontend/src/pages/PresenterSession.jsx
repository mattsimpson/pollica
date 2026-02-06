import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { sessionService, questionService, responseService } from '../services/api';
import socketService from '../services/socket';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import WordCloud from '../components/WordCloud';
import { QRCodeSVG } from 'qrcode.react';
import { Pencil, Trash2 } from 'lucide-react';

function PresenterSession() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [presentedQuestionId, setPresentedQuestionId] = useState(null);
  const [responses, setResponses] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [questionToDelete, setQuestionToDelete] = useState(null);
  const [anonymousParticipantCount, setAnonymousParticipantCount] = useState(0);
  const [closingQuestionId, setClosingQuestionId] = useState(null);
  const [closeCountdown, setCloseCountdown] = useState(0);
  const [newQuestion, setNewQuestion] = useState({
    questionText: '',
    questionType: 'multiple_choice',
    options: ['', '', '', ''],
    correctAnswer: '',
    timeLimit: ''
  });

  useEffect(() => {
    loadSessionData();

    // Connect to socket
    const token = localStorage.getItem('token');
    socketService.connect(token);
    socketService.joinSession(sessionId);

    // Listen for new responses
    const handleNewResponse = (response) => {
      // Update response count in questions list
      setQuestions(prev => prev.map(q =>
        q.id === response.question_id
          ? { ...q, response_count: (q.response_count || 0) + 1 }
          : q
      ));

      // If viewing this question, update responses and stats
      setSelectedQuestion(current => {
        if (current && current.id === response.question_id) {

          setResponses(prev => [response, ...prev]);

          // Update stats incrementally
          setStats(prevStats => {
            if (!prevStats) return prevStats;

            const newStats = { ...prevStats };
            newStats.totalResponses = (prevStats.totalResponses || 0) + 1;

            if (response.is_correct !== null) {
              if (response.is_correct) {
                newStats.correctCount = (prevStats.correctCount || 0) + 1;
              } else {
                newStats.incorrectCount = (prevStats.incorrectCount || 0) + 1;
              }
            }

            // Update answer distribution (immutable update for React)
            if (prevStats.answerDistribution) {
              const existingIndex = prevStats.answerDistribution.findIndex(
                a => a.answer_text === response.answer_text
              );
              if (existingIndex >= 0) {
                newStats.answerDistribution = prevStats.answerDistribution.map((a, i) =>
                  i === existingIndex ? { ...a, count: a.count + 1 } : a
                );
              } else {
                newStats.answerDistribution = [
                  ...prevStats.answerDistribution,
                  { answer_text: response.answer_text, count: 1 }
                ];
              }
            } else {
              newStats.answerDistribution = [{ answer_text: response.answer_text, count: 1 }];
            }

            return newStats;
          });
        }
        return current;
      });
    };

    socketService.onNewResponse(handleNewResponse);

    // Listen for anonymous responses
    const handleNewAnonymousResponse = (response) => {
      // Update response count in questions list
      setQuestions(prev => prev.map(q =>
        q.id === response.question_id
          ? { ...q, response_count: (q.response_count || 0) + 1 }
          : q
      ));

      // If viewing this question, update responses and stats
      setSelectedQuestion(current => {
        if (current && current.id === response.question_id) {
          setResponses(prev => [response, ...prev]);

          // For numeric questions, re-fetch stats to recalculate histogram bins accurately
          if (current.question_type === 'numeric') {
            loadResponseStats(current.id);
          } else {
            // Update stats incrementally for other question types
            setStats(prevStats => {
              if (!prevStats) return prevStats;

              const newStats = { ...prevStats };
              newStats.totalResponses = (prevStats.totalResponses || 0) + 1;
              newStats.anonymousResponses = (prevStats.anonymousResponses || 0) + 1;

              // Update answer distribution (immutable update for React)
              if (prevStats.answerDistribution) {
                const existingIndex = prevStats.answerDistribution.findIndex(
                  a => a.answer_text === response.answer_text
                );
                if (existingIndex >= 0) {
                  newStats.answerDistribution = prevStats.answerDistribution.map((a, i) =>
                    i === existingIndex ? { ...a, count: a.count + 1 } : a
                  );
                } else {
                  newStats.answerDistribution = [
                    ...prevStats.answerDistribution,
                    { answer_text: response.answer_text, count: 1 }
                  ];
                }
              } else {
                newStats.answerDistribution = [{ answer_text: response.answer_text, count: 1 }];
              }

              return newStats;
            });
          }
        }
        return current;
      });
    };

    socketService.socket?.on('new-anonymous-response', handleNewAnonymousResponse);

    // Listen for anonymous participant count updates
    const handleAnonymousCount = ({ count }) => {
      setAnonymousParticipantCount(count);
    };

    socketService.socket?.on('anonymous-participant-count', handleAnonymousCount);

    // Listen for question closing events
    const handleQuestionClosing = ({ questionId, countdown }) => {
      setClosingQuestionId(questionId);
      setCloseCountdown(countdown);
    };

    const handleQuestionCloseCancelled = ({ questionId }) => {
      if (closingQuestionId === questionId) {
        setClosingQuestionId(null);
        setCloseCountdown(0);
      }
    };

    const handleQuestionClosed = ({ questionId }) => {
      setClosingQuestionId(null);
      setCloseCountdown(0);
      // Update the question in the list
      setQuestions(prev => prev.map(q =>
        q.id === questionId ? { ...q, is_active: false } : q
      ));
    };

    const handleQuestionReopened = ({ questionId }) => {
      // Update the question in the list
      setQuestions(prev => prev.map(q =>
        q.id === questionId ? { ...q, is_active: true } : q
      ));
    };

    socketService.socket?.on('question-closing', handleQuestionClosing);
    socketService.socket?.on('question-close-cancelled', handleQuestionCloseCancelled);
    socketService.socket?.on('question-closed', handleQuestionClosed);
    socketService.socket?.on('question-reopened', handleQuestionReopened);

    // Listen for session status changes
    const handleSessionReopened = ({ sessionId: reopenedSessionId }) => {
      if (parseInt(sessionId) === reopenedSessionId) {
        setSession(prev => ({ ...prev, is_active: true }));
      }
    };

    const handleSessionClosed = () => {
      setSession(prev => ({ ...prev, is_active: false }));
    };

    socketService.socket?.on('session-reopened', handleSessionReopened);
    socketService.socket?.on('session-closed', handleSessionClosed);

    return () => {
      socketService.leaveSession(sessionId);
      socketService.socket?.off('new-anonymous-response', handleNewAnonymousResponse);
      socketService.socket?.off('anonymous-participant-count', handleAnonymousCount);
      socketService.socket?.off('question-closing', handleQuestionClosing);
      socketService.socket?.off('question-close-cancelled', handleQuestionCloseCancelled);
      socketService.socket?.off('question-closed', handleQuestionClosed);
      socketService.socket?.off('question-reopened', handleQuestionReopened);
      socketService.socket?.off('session-reopened', handleSessionReopened);
      socketService.socket?.off('session-closed', handleSessionClosed);
    };
  }, [sessionId, closingQuestionId]);

  // Countdown timer for close
  useEffect(() => {
    if (closingQuestionId && closeCountdown > 0) {
      const timer = setTimeout(() => {
        setCloseCountdown(closeCountdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [closingQuestionId, closeCountdown]);

  const loadSessionData = async () => {
    try {
      const [sessionRes, questionsRes] = await Promise.all([
        sessionService.getSession(sessionId),
        questionService.getQuestions(sessionId)
      ]);

      setSession(sessionRes.data.session);
      setQuestions(questionsRes.data.questions);
      setPresentedQuestionId(sessionRes.data.session.selected_question_id);
      setAnonymousParticipantCount(sessionRes.data.anonymousParticipantCount || 0);

      // Auto-select the currently presented question
      const presentedId = sessionRes.data.session.selected_question_id;
      if (presentedId) {
        const presentedQuestion = questionsRes.data.questions.find(q => q.id === presentedId);
        if (presentedQuestion) {
          setSelectedQuestion(presentedQuestion);
          const [responsesRes, statsRes] = await Promise.all([
            responseService.getResponsesByQuestion(presentedQuestion.id),
            responseService.getResponseStats(presentedQuestion.id)
          ]);
          setResponses(responsesRes.data.responses);
          setStats(statsRes.data);
        }
      }
    } catch (err) {

    } finally {
      setLoading(false);
    }
  };

  const handleCreateQuestion = async (e) => {
    e.preventDefault();
    try {
      const questionData = {
        sessionId: parseInt(sessionId),
        questionText: newQuestion.questionText,
        questionType: newQuestion.questionType,
        options: newQuestion.questionType === 'multiple_choice' ? newQuestion.options.filter(o => o) : null,
        correctAnswer: newQuestion.correctAnswer || null,
        timeLimit: newQuestion.timeLimit ? parseInt(newQuestion.timeLimit) : null
      };

      await questionService.createQuestion(questionData);
      setShowQuestionModal(false);
      setNewQuestion({
        questionText: '',
        questionType: 'multiple_choice',
        options: ['', '', '', ''],
        correctAnswer: '',
        timeLimit: ''
      });
      loadSessionData();
    } catch (err) {

    }
  };

  const handleQuestionClick = async (question) => {
    setSelectedQuestion(question);
    try {
      const [responsesRes, statsRes] = await Promise.all([
        responseService.getResponsesByQuestion(question.id),
        responseService.getResponseStats(question.id)
      ]);

      setResponses(responsesRes.data.responses);
      setStats(statsRes.data);
    } catch (err) {

    }
  };

  const loadResponseStats = async (questionId) => {
    try {
      const statsRes = await responseService.getResponseStats(questionId);
      setStats(statsRes.data);
    } catch (err) {

    }
  };

  const handleCloseQuestion = async (questionId) => {
    try {
      await questionService.closeQuestion(questionId);
      // The socket event will update the UI
    } catch (err) {

    }
  };

  const handleCancelClose = async (questionId) => {
    try {
      await questionService.cancelCloseQuestion(questionId);
      // The socket event will update the UI
    } catch (err) {

    }
  };

  const handleReopenQuestion = async (questionId) => {
    try {
      await questionService.reopenQuestion(questionId);
      // The socket event will update the UI
    } catch (err) {

    }
  };

  const handleCloseSession = async () => {
    try {
      await sessionService.updateSession(sessionId, { isActive: false });
      setSession(prev => ({ ...prev, is_active: false }));
    } catch (err) {

    }
  };

  const handleReopenSession = async () => {
    try {
      await sessionService.updateSession(sessionId, { isActive: true });
      setSession(prev => ({ ...prev, is_active: true }));
    } catch (err) {

    }
  };

  const handlePresentQuestion = async (questionId) => {
    try {
      // If the same question is already presented, deselect it
      const newQuestionId = presentedQuestionId === questionId ? null : questionId;
      await sessionService.selectQuestion(sessionId, newQuestionId);
      setPresentedQuestionId(newQuestionId);

      // If presenting a question (not stopping), optimistically set it as active
      // and also select it to show its Response Analytics
      if (newQuestionId !== null) {
        setQuestions(prev => prev.map(q =>
          q.id === newQuestionId ? { ...q, is_active: true } : q
        ));

        // Select the question to show its analytics
        const question = questions.find(q => q.id === newQuestionId);
        if (question) {
          setSelectedQuestion(question);
          const [responsesRes, statsRes] = await Promise.all([
            responseService.getResponsesByQuestion(question.id),
            responseService.getResponseStats(question.id)
          ]);
          setResponses(responsesRes.data.responses);
          setStats(statsRes.data);
        }
      }
    } catch (err) {

    }
  };

  const handleEditClick = (question) => {
    setEditingQuestion({
      id: question.id,
      questionText: question.question_text,
      questionType: question.question_type,
      options: question.options || ['', '', '', ''],
      correctAnswer: question.correct_answer || '',
      timeLimit: question.time_limit || ''
    });
    setShowEditModal(true);
  };

  const handleUpdateQuestion = async (e) => {
    e.preventDefault();
    try {
      await questionService.updateQuestion(editingQuestion.id, {
        questionText: editingQuestion.questionText,
        questionType: editingQuestion.questionType,
        options: editingQuestion.questionType === 'multiple_choice' ? editingQuestion.options.filter(o => o) : null,
        correctAnswer: editingQuestion.correctAnswer || null,
        timeLimit: editingQuestion.timeLimit ? parseInt(editingQuestion.timeLimit) : null
      });
      setShowEditModal(false);
      setEditingQuestion(null);
      loadSessionData();
    } catch (err) {

    }
  };

  const handleDeleteClick = (question) => {
    setQuestionToDelete(question);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    try {
      await questionService.deleteQuestion(questionToDelete.id);
      setShowDeleteConfirm(false);
      setQuestionToDelete(null);
      // Clear selection if deleted question was selected
      if (selectedQuestion?.id === questionToDelete.id) {
        setSelectedQuestion(null);
        setResponses([]);
        setStats(null);
      }
      loadSessionData();
    } catch (err) {

    }
  };

  const getJoinUrl = () => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/go/${session?.join_code}`;
  };

  const fallbackCopyToClipboard = (text) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      alert('Link copied to clipboard!');
    } catch (err) {
      alert('Failed to copy. Please copy manually: ' + text);
    }
    document.body.removeChild(textArea);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="main-content">
      <div className="session-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h1>{session?.title}</h1>
            {!session?.is_active && (
              <span className="badge" style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}>
                Closed
              </span>
            )}
          </div>
          {session?.description && (
            <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>{session.description}</p>
          )}
        </div>
        <div className="session-actions">
          {session?.join_code && (
            <button className="btn btn-success" onClick={() => setShowShareModal(true)}>
              Share
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setShowQuestionModal(true)}>
            Add Question
          </button>
          {session?.is_active ? (
            <button className="btn btn-danger" onClick={handleCloseSession}>
              Close Session
            </button>
          ) : (
            <button className="btn btn-success" onClick={handleReopenSession}>
              Reopen Session
            </button>
          )}
        </div>
      </div>

      <div className="grid session-grid">
        <div>
          <div className="card">
            <div className="card-header">Questions</div>
            {questions.length === 0 ? (
              <p style={{ color: '#6b7280' }}>No questions yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {questions.map((q) => (
                  <div
                    key={q.id}
                    className="card"
                    style={{
                      cursor: 'pointer',
                      backgroundColor: selectedQuestion?.id === q.id ? '#eff6ff' : 'white',
                      padding: '1rem',
                      border: presentedQuestionId === q.id ? '2px solid #10b981' : '1px solid #e5e7eb'
                    }}
                    onClick={() => handleQuestionClick(q)}
                  >
                    {/* Control bar at top */}
                    <div className="question-controls">
                      <div className="controls-left">
                        <button
                          className="icon-btn"
                          title="Edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditClick(q);
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-btn icon-btn-danger"
                          title="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(q);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="controls-right">
                        <button
                          className={`btn btn-sm ${presentedQuestionId === q.id ? 'btn-success' : 'btn-outline'}`}
                          title={presentedQuestionId === q.id ? 'Stop showing question to audience' : 'Show question to audience'}
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePresentQuestion(q.id);
                          }}
                        >
                          {presentedQuestionId === q.id ? 'Stop' : 'Present'}
                        </button>
                        {presentedQuestionId === q.id && (
                          closingQuestionId === q.id ? (
                            <button
                              className="btn btn-sm btn-warning"
                              style={{ minWidth: '60px' }}
                              title="Cancel closing and keep accepting responses"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelClose(q.id);
                              }}
                            >
                              {closeCountdown > 0 ? closeCountdown : 'Cancel'}
                            </button>
                          ) : q.is_active ? (
                            <button
                              className="btn btn-sm btn-secondary"
                              title="Stop accepting responses"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCloseQuestion(q.id);
                              }}
                            >
                              Close
                            </button>
                          ) : (
                            <button
                              className="btn btn-sm btn-primary"
                              title="Accept responses again"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReopenQuestion(q.id);
                              }}
                            >
                              Reopen
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {/* Question content */}
                    {presentedQuestionId === q.id && (
                      <span className="badge badge-active" style={{ marginBottom: '0.5rem', display: 'inline-block' }}>
                        Presenting
                      </span>
                    )}
                    <p>{q.question_text}</p>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
                      {q.response_count || 0} responses
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          {selectedQuestion ? (
            <div className="card">
              <div className="card-header">Response Analytics</div>

              {stats && (
                <>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-value">{stats.totalResponses}</div>
                      <div className="stat-label">Total Responses</div>
                    </div>
                    {stats.correctCount !== null && (
                      <>
                        <div className="stat-card">
                          <div className="stat-value">{stats.correctCount}</div>
                          <div className="stat-label">Correct</div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-value">{stats.incorrectCount}</div>
                          <div className="stat-label">Incorrect</div>
                        </div>
                      </>
                    )}
                    {stats.averageResponseTime && (
                      <div className="stat-card">
                        <div className="stat-value">{Math.round(stats.averageResponseTime)}s</div>
                        <div className="stat-label">Avg Time</div>
                      </div>
                    )}
                  </div>

                  {(() => {
                    if (selectedQuestion.question_type === 'short_answer') {
                      return (
                        <div style={{ marginTop: '2rem' }}>
                          <h3 style={{ marginBottom: '1rem' }}>Response Word Cloud</h3>
                          <WordCloud responses={responses} />
                        </div>
                      );
                    } else if (selectedQuestion.question_type === 'numeric' && stats.numericStats) {
                      return (
                        <div style={{ marginTop: '2rem' }}>
                          {/* Summary Statistics */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                            <div className="stat-card">
                              <div className="stat-value">{stats.numericStats.mean.toFixed(2)}</div>
                              <div className="stat-label">Mean</div>
                            </div>
                            <div className="stat-card">
                              <div className="stat-value">{stats.numericStats.median.toFixed(2)}</div>
                              <div className="stat-label">Median</div>
                            </div>
                            <div className="stat-card">
                              <div className="stat-value">{stats.numericStats.min}</div>
                              <div className="stat-label">Min</div>
                            </div>
                            <div className="stat-card">
                              <div className="stat-value">{stats.numericStats.max}</div>
                              <div className="stat-label">Max</div>
                            </div>
                          </div>

                          {/* Histogram */}
                          {stats.answerDistribution && stats.answerDistribution.length > 1 && (
                            <div className="response-chart">
                              <h3 style={{ marginBottom: '1rem' }}>Response Distribution</h3>
                              <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={stats.answerDistribution}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="range" />
                                  <YAxis />
                                  <Tooltip />
                                  <Bar dataKey="count" fill="#667eea" />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                        </div>
                      );
                    } else if (stats.answerDistribution && stats.answerDistribution.length > 0) {
                      return (
                        <div className="response-chart">
                          <h3 style={{ marginBottom: '1rem' }}>Answer Distribution</h3>
                          <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={stats.answerDistribution}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="answer_text" />
                              <YAxis />
                              <Tooltip />
                              <Legend />
                              <Bar dataKey="count" fill="#667eea" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div style={{ marginTop: '2rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Recent Responses</h3>
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      {responses.map((response) => (
                        <div
                          key={response.id}
                          className="card"
                          style={{ marginBottom: '0.5rem', padding: '1rem' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <div>
                              <strong>{response.display_name || 'Anonymous'}</strong>
                              <p style={{ marginTop: '0.5rem' }}>{response.answer_text}</p>
                            </div>
                            {typeof response.is_correct === 'boolean' && (
                              <span className={`badge ${response.is_correct ? 'badge-active' : 'badge-inactive'}`}>
                                {response.is_correct ? 'Correct' : 'Incorrect'}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <h3>Select a question to view responses</h3>
            </div>
          )}
        </div>
      </div>

      {showQuestionModal && (
        <div className="modal-overlay" onClick={() => setShowQuestionModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Create New Question</h2>
              <button className="close-btn" onClick={() => setShowQuestionModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleCreateQuestion}>
              <div className="form-group">
                <label className="form-label">Question Text</label>
                <textarea
                  className="form-textarea"
                  value={newQuestion.questionText}
                  onChange={(e) => setNewQuestion({ ...newQuestion, questionText: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Question Type</label>
                <select
                  className="form-select"
                  value={newQuestion.questionType}
                  onChange={(e) => setNewQuestion({ ...newQuestion, questionType: e.target.value })}
                >
                  <option value="multiple_choice">Multiple Choice</option>
                  <option value="true_false">True/False</option>
                  <option value="short_answer">Short Answer</option>
                  <option value="numeric">Numeric</option>
                </select>
              </div>

              {newQuestion.questionType === 'multiple_choice' && (
                <div className="form-group">
                  <label className="form-label">Options</label>
                  {newQuestion.options.map((option, index) => (
                    <input
                      key={index}
                      type="text"
                      className="form-input"
                      style={{ marginBottom: '0.5rem' }}
                      placeholder={`Option ${index + 1}`}
                      value={option}
                      onChange={(e) => {
                        const newOptions = [...newQuestion.options];
                        newOptions[index] = e.target.value;
                        setNewQuestion({ ...newQuestion, options: newOptions });
                      }}
                    />
                  ))}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Correct Answer (optional)</label>
                <input
                  type="text"
                  className="form-input"
                  value={newQuestion.correctAnswer}
                  onChange={(e) => setNewQuestion({ ...newQuestion, correctAnswer: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Time Limit (seconds, optional)</label>
                <input
                  type="number"
                  className="form-input"
                  value={newQuestion.timeLimit}
                  onChange={(e) => setNewQuestion({ ...newQuestion, timeLimit: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowQuestionModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Question
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="modal share-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Share Session</h2>
              <button className="close-btn" onClick={() => setShowShareModal(false)}>&times;</button>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <QRCodeSVG
                  value={getJoinUrl()}
                  size={200}
                  level="M"
                  includeMargin={true}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  Scan to join or visit:
                </p>
                <p style={{ fontSize: '1rem', fontWeight: '500', wordBreak: 'break-all' }}>
                  {getJoinUrl()}
                </p>
              </div>

              <div style={{
                backgroundColor: '#f3f4f6',
                padding: '1.5rem',
                borderRadius: '0.5rem',
                marginBottom: '1.5rem'
              }}>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  Join Code
                </p>
                <p style={{ fontSize: '2.5rem', fontWeight: 'bold', letterSpacing: '0.25rem', textTransform: 'uppercase' }}>
                  {session?.join_code}
                </p>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '1rem',
                backgroundColor: '#ede9fe',
                borderRadius: '0.5rem'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#667eea' }}>
                    {anonymousParticipantCount}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Participants</p>
                </div>
              </div>

              <button
                className="btn btn-primary"
                style={{ marginTop: '1.5rem', width: '100%' }}
                onClick={() => {
                  const url = getJoinUrl();
                  if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(url)
                      .then(() => alert('Link copied to clipboard!'))
                      .catch(() => fallbackCopyToClipboard(url));
                  } else {
                    fallbackCopyToClipboard(url);
                  }
                }}
              >
                Copy Link
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editingQuestion && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Edit Question</h2>
              <button className="close-btn" onClick={() => setShowEditModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleUpdateQuestion}>
              <div className="form-group">
                <label className="form-label">Question Text</label>
                <textarea
                  className="form-textarea"
                  value={editingQuestion.questionText}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, questionText: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Question Type</label>
                <select
                  className="form-select"
                  value={editingQuestion.questionType}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, questionType: e.target.value })}
                >
                  <option value="multiple_choice">Multiple Choice</option>
                  <option value="true_false">True/False</option>
                  <option value="short_answer">Short Answer</option>
                  <option value="numeric">Numeric</option>
                </select>
              </div>

              {editingQuestion.questionType === 'multiple_choice' && (
                <div className="form-group">
                  <label className="form-label">Options</label>
                  {editingQuestion.options.map((option, index) => (
                    <input
                      key={index}
                      type="text"
                      className="form-input"
                      style={{ marginBottom: '0.5rem' }}
                      placeholder={`Option ${index + 1}`}
                      value={option}
                      onChange={(e) => {
                        const newOptions = [...editingQuestion.options];
                        newOptions[index] = e.target.value;
                        setEditingQuestion({ ...editingQuestion, options: newOptions });
                      }}
                    />
                  ))}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Correct Answer (optional)</label>
                <input
                  type="text"
                  className="form-input"
                  value={editingQuestion.correctAnswer}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, correctAnswer: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Time Limit (seconds, optional)</label>
                <input
                  type="number"
                  className="form-input"
                  value={editingQuestion.timeLimit}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, timeLimit: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteConfirm && questionToDelete && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Question</h2>
              <button className="close-btn" onClick={() => setShowDeleteConfirm(false)}>&times;</button>
            </div>
            <p>Are you sure you want to delete this question?</p>
            <p style={{ marginTop: '0.5rem' }}><strong>"{questionToDelete.question_text}"</strong></p>
            <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              This will also delete all {questionToDelete.response_count || 0} responses.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleConfirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PresenterSession;
