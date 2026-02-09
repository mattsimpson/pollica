import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  anonymousService,
  setCurrentJoinCode,
  storeAnonymousToken,
  getAnonymousToken,
  storeDisplayName,
  getDisplayName
} from '../services/anonymousApi';
import anonymousSocket from '../services/anonymousSocket';

function AudiencePage() {
  const { code } = useParams();
  const navigate = useNavigate();

  // Page states: 'loading', 'name-entry', 'waiting', 'answering', 'transition', 'submitted', 'error', 'closed', 'question-closing', 'question-closed'
  const [stage, setStage] = useState('loading');
  const [closeCountdown, setCloseCountdown] = useState(0);
  const [session, setSession] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [textAnswer, setTextAnswer] = useState('');
  const [hasResponded, setHasResponded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Set current join code for API interceptor
  useEffect(() => {
    if (code) {
      setCurrentJoinCode(code.toLowerCase());
    }
  }, [code]);

  // Check for existing session and load data
  useEffect(() => {
    const loadSession = async () => {
      try {
        const existingToken = getAnonymousToken(code.toLowerCase());
        const existingName = getDisplayName(code.toLowerCase());

        const response = await anonymousService.getSessionByCode(code);
        setSession(response.data.session);

        if (existingToken && existingName) {
          // Already joined, restore state
          setDisplayName(existingName);

          // Connect socket
          anonymousSocket.connect(existingToken);

          // Check if there's a selected question
          if (response.data.selectedQuestion) {
            const question = response.data.selectedQuestion;
            setCurrentQuestion(question);
            // Check if already responded
            try {
              const myResponse = await anonymousService.getMyResponse(question.id);
              if (myResponse.data.hasResponded && myResponse.data.response) {
                setHasResponded(true);
                // Restore the user's answer based on question type
                const answerText = myResponse.data.response.answer_text;
                if (question.question_type === 'multiple_choice' || question.question_type === 'true_false') {
                  setSelectedAnswer(answerText);
                } else {
                  setTextAnswer(answerText);
                }
                setStage('submitted');
              } else {
                setStage('answering');
              }
            } catch {
              setStage('answering');
            }
          } else {
            setStage('waiting');
          }
        } else {
          setStage('name-entry');
        }
      } catch (err) {

        if (err.response?.status === 404) {
          setError('Session not found. Please check your join code.');
        } else if (err.response?.status === 400) {
          setError(err.response.data.error || 'Session is no longer active.');
        } else {
          setError('Failed to load session. Please try again.');
        }
        setStage('error');
      }
    };

    if (code) {
      loadSession();
    }
  }, [code]);

  // Socket event handlers - register when stage changes to waiting/answering/submitted (after socket connects)
  useEffect(() => {
    // Only set up socket listeners when we're past the name-entry stage
    // Note: We keep listeners active for 'closed' stage so we can detect session-reopened
    if (stage === 'loading' || stage === 'name-entry' || stage === 'error') {
      return;
    }

    const handleTransitionStart = async ({ questionId, question, countdown: countdownValue }) => {
      setPendingQuestion(question);
      setCountdown(countdownValue);
      setStage('transition');

      // Check if user already responded to this question
      try {
        const myResponse = await anonymousService.getMyResponse(questionId);
        if (myResponse.data.hasResponded && myResponse.data.response) {
          setHasResponded(true);
          const answerText = myResponse.data.response.answer_text;
          if (question.question_type === 'multiple_choice' || question.question_type === 'true_false') {
            setSelectedAnswer(answerText);
          } else {
            setTextAnswer(answerText);
          }
        } else {
          setHasResponded(false);
          setSelectedAnswer('');
          setTextAnswer('');
        }
      } catch {
        // If check fails, assume not responded
        setHasResponded(false);
        setSelectedAnswer('');
        setTextAnswer('');
      }
    };

    const handleTransitionCancelled = () => {
      setPendingQuestion(null);
      setCountdown(0);
      // Return to previous state
      setStage(prev => {
        if (currentQuestion) {
          return hasResponded ? 'submitted' : 'answering';
        }
        return 'waiting';
      });
    };

    const handleQuestionChanged = async ({ questionId, question }) => {
      setCurrentQuestion(question);
      setPendingQuestion(null);
      setCountdown(0);

      // Check if user already responded to this question
      try {
        const myResponse = await anonymousService.getMyResponse(questionId);
        if (myResponse.data.hasResponded && myResponse.data.response) {
          setHasResponded(true);
          const answerText = myResponse.data.response.answer_text;
          if (question.question_type === 'multiple_choice' || question.question_type === 'true_false') {
            setSelectedAnswer(answerText);
          } else {
            setTextAnswer(answerText);
          }
          setStage('submitted');
        } else {
          setHasResponded(false);
          setSelectedAnswer('');
          setTextAnswer('');
          setStage('answering');
        }
      } catch {
        // If check fails, assume not responded
        setHasResponded(false);
        setSelectedAnswer('');
        setTextAnswer('');
        setStage('answering');
      }
    };

    const handleQuestionDeselected = () => {
      setCurrentQuestion(null);
      setPendingQuestion(null);
      setCountdown(0);
      setStage('waiting');
    };

    const handleSessionClosed = () => {
      setStage('closed');
    };

    const handleSessionReopened = async () => {
      // Refresh session data to get current state
      try {
        const response = await anonymousService.getSessionByCode(code);
        setSession(response.data.session);

        if (response.data.selectedQuestion) {
          const question = response.data.selectedQuestion;
          setCurrentQuestion(question);
          // Check if already responded to this question
          try {
            const myResponse = await anonymousService.getMyResponse(question.id);
            if (myResponse.data.hasResponded && myResponse.data.response) {
              setHasResponded(true);
              const answerText = myResponse.data.response.answer_text;
              if (question.question_type === 'multiple_choice' || question.question_type === 'true_false') {
                setSelectedAnswer(answerText);
              } else {
                setTextAnswer(answerText);
              }
              setStage('submitted');
            } else {
              setHasResponded(false);
              setSelectedAnswer('');
              setTextAnswer('');
              setStage('answering');
            }
          } catch {
            setHasResponded(false);
            setSelectedAnswer('');
            setTextAnswer('');
            setStage('answering');
          }
        } else {
          setCurrentQuestion(null);
          setHasResponded(false);
          setSelectedAnswer('');
          setTextAnswer('');
          setStage('waiting');
        }
      } catch (err) {

        // Stay on closed screen if we can't fetch the session
      }
    };

    const handleQuestionClosing = ({ questionId, countdown }) => {
      // Only handle if this is the current question
      if (currentQuestion && currentQuestion.id === questionId) {
        setCloseCountdown(countdown);
        setStage('question-closing');
      }
    };

    const handleQuestionCloseCancelled = ({ questionId }) => {
      if (currentQuestion && currentQuestion.id === questionId) {
        setCloseCountdown(0);
        // Return to previous state
        setStage(hasResponded ? 'submitted' : 'answering');
      }
    };

    const handleQuestionClosed = ({ questionId }) => {
      if (currentQuestion && currentQuestion.id === questionId) {
        setCloseCountdown(0);
        setStage('question-closed');
      }
    };

    const handleQuestionReopened = ({ questionId }) => {
      if (currentQuestion && currentQuestion.id === questionId) {
        // Return to appropriate state
        setStage(hasResponded ? 'submitted' : 'answering');
      }
    };

    const registerEvents = (socket) => {
      socket.on('question-transition-start', handleTransitionStart);
      socket.on('transition-cancelled', handleTransitionCancelled);
      socket.on('question-changed', handleQuestionChanged);
      socket.on('question-deselected', handleQuestionDeselected);
      socket.on('session-closed', handleSessionClosed);
      socket.on('session-reopened', handleSessionReopened);
      socket.on('question-closing', handleQuestionClosing);
      socket.on('question-close-cancelled', handleQuestionCloseCancelled);
      socket.on('question-closed', handleQuestionClosed);
      socket.on('question-reopened', handleQuestionReopened);
    };

    const unregisterEvents = (socket) => {
      if (socket) {
        socket.off('question-transition-start', handleTransitionStart);
        socket.off('transition-cancelled', handleTransitionCancelled);
        socket.off('question-changed', handleQuestionChanged);
        socket.off('question-deselected', handleQuestionDeselected);
        socket.off('session-closed', handleSessionClosed);
        socket.off('session-reopened', handleSessionReopened);
        socket.off('question-closing', handleQuestionClosing);
        socket.off('question-close-cancelled', handleQuestionCloseCancelled);
        socket.off('question-closed', handleQuestionClosed);
        socket.off('question-reopened', handleQuestionReopened);
      }
    };

    // Get the socket instance and register events
    const socket = anonymousSocket.socket;
    if (socket) {
      registerEvents(socket);
      return () => unregisterEvents(socket);
    } else {
      // Socket not ready yet, wait for connection
      anonymousSocket.onConnected((socket) => {
        registerEvents(socket);
      });
    }
  }, [stage, currentQuestion, hasResponded, code]);

  // Countdown timer for transition
  useEffect(() => {
    if (stage === 'transition' && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [stage, countdown]);

  // Countdown timer for question closing
  useEffect(() => {
    if (stage === 'question-closing' && closeCountdown > 0) {
      const timer = setTimeout(() => {
        setCloseCountdown(closeCountdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [stage, closeCountdown]);

  // Auto-submit when countdown reaches 2 if user has selected an answer but hasn't submitted
  useEffect(() => {
    if (stage === 'question-closing' && closeCountdown <= 2 && closeCountdown > 0 && !hasResponded && !submitting && currentQuestion) {
      const hasAnswer = (currentQuestion.question_type === 'multiple_choice' || currentQuestion.question_type === 'true_false')
        ? selectedAnswer !== ''
        : textAnswer.trim() !== '';

      if (hasAnswer) {

        handleSubmitResponse();
      }
    }
  }, [stage, closeCountdown, hasResponded, submitting, currentQuestion, selectedAnswer, textAnswer]);

  // Handle join session
  const handleJoinSession = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    try {
      const response = await anonymousService.joinSession(code.toLowerCase(), displayName.trim());
      const { token } = response.data;

      // Store credentials
      storeAnonymousToken(code.toLowerCase(), token);
      storeDisplayName(code.toLowerCase(), displayName.trim());

      // Connect socket
      anonymousSocket.connect(token);

      // Refresh session data to get current question
      const sessionResponse = await anonymousService.getSessionByCode(code);
      if (sessionResponse.data.selectedQuestion) {
        setCurrentQuestion(sessionResponse.data.selectedQuestion);
        setStage('answering');
      } else {
        setStage('waiting');
      }
    } catch (err) {

      setError(err.response?.data?.error || 'Failed to join session');
    }
  };

  // Handle submit response
  const handleSubmitResponse = async () => {
    if (!currentQuestion) return;

    const answer = currentQuestion.question_type === 'multiple_choice' || currentQuestion.question_type === 'true_false'
      ? selectedAnswer
      : textAnswer;

    if (!answer.trim()) return;

    setSubmitting(true);
    try {
      await anonymousService.submitResponse(currentQuestion.id, answer);
      setHasResponded(true);
      setStage('submitted');
    } catch (err) {

      if (err.response?.status === 409) {
        // Already responded
        setHasResponded(true);
        setStage('submitted');
      } else {
        setError(err.response?.data?.error || 'Failed to submit response');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Render error state
  if (stage === 'error') {
    return (
      <div className="audience-page">
        <div className="audience-card error-card">
          <h2>Oops!</h2>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Go Home
          </button>
        </div>
      </div>
    );
  }

  // Render closed state
  if (stage === 'closed') {
    return (
      <div className="audience-page">
        <div className="audience-card">
          <h2>Session Ended</h2>
          <p>This session has been closed by the presenter.</p>
          <p>Thank you for participating!</p>
        </div>
      </div>
    );
  }

  // Render loading state
  if (stage === 'loading') {
    return (
      <div className="audience-page">
        <div className="audience-card">
          <div className="loading-spinner"></div>
          <p>Loading session...</p>
        </div>
      </div>
    );
  }

  // Render name entry
  if (stage === 'name-entry') {
    return (
      <div className="audience-page">
        <div className="audience-card">
          <h1>{session?.title}</h1>
          {session?.presenterName && (
            <p className="session-host">Hosted by {session.presenterName}</p>
          )}
          <form onSubmit={handleJoinSession} className="name-form">
            <label htmlFor="displayName">Enter your first name to join</label>
            <input
              type="text"
              id="displayName"
              className="form-input name-input"
              placeholder="Your first name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
              autoFocus
              autoComplete="off"
            />
            <button type="submit" className="btn btn-primary btn-large" disabled={!displayName.trim()}>
              Join Session
            </button>
          </form>
          {error && <p className="error-message">{error}</p>}
        </div>
      </div>
    );
  }

  // Render waiting state
  if (stage === 'waiting') {
    return (
      <div className="audience-page">
        <div className="audience-card waiting-card">
          <h2>Welcome, {displayName}!</h2>
          <div className="waiting-animation">
            <div className="pulse-ring"></div>
            <div className="pulse-dot"></div>
          </div>
          <p>Waiting for the next question...</p>
          <p className="session-title">{session?.title}</p>
        </div>
      </div>
    );
  }

  // Render transition state
  if (stage === 'transition') {
    return (
      <div className="audience-page">
        <div className="audience-card transition-card">
          <p className="transition-label">Next question in</p>
          <div className="countdown-number">{countdown}</div>
          <p className="transition-hint">Get ready!</p>
        </div>
      </div>
    );
  }

  // Render submitted state
  if (stage === 'submitted') {
    return (
      <div className="audience-page">
        <div className="audience-card submitted-card">
          <div className="checkmark">&#10003;</div>
          <h2>Response Submitted!</h2>
          <p>Waiting for the next question...</p>
        </div>
      </div>
    );
  }

  // Render question-closing state (show countdown overlay)
  // If user hasn't responded, they can still submit during countdown
  // If user has responded, show their selection locked
  if (stage === 'question-closing' && currentQuestion) {
    return (
      <div className="audience-page">
        <div className="audience-card question-card">
          <div className="question-header">
            <span className="question-type-badge">{currentQuestion.question_type.replace('_', ' ')}</span>
          </div>
          <h2 className="question-text">{currentQuestion.question_text}</h2>

          <div className="closing-overlay">
            <p className="closing-label">{hasResponded ? 'Response locked' : 'Question closing in'}</p>
            <div className="countdown-number closing-countdown">{closeCountdown}</div>
          </div>

          {/* Multiple Choice */}
          {currentQuestion.question_type === 'multiple_choice' && currentQuestion.options && (
            <div className={`answer-options ${hasResponded ? 'disabled' : ''}`}>
              {currentQuestion.options.map((option, index) => (
                <button
                  key={index}
                  className={`answer-option ${selectedAnswer === option ? 'selected' : ''}`}
                  onClick={() => !hasResponded && setSelectedAnswer(option)}
                  disabled={hasResponded}
                >
                  <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                  <span className="option-text">{option}</span>
                </button>
              ))}
            </div>
          )}

          {/* True/False */}
          {currentQuestion.question_type === 'true_false' && (
            <div className={`answer-options true-false ${hasResponded ? 'disabled' : ''}`}>
              <button
                className={`answer-option ${selectedAnswer === 'False' ? 'selected' : ''}`}
                onClick={() => !hasResponded && setSelectedAnswer('False')}
                disabled={hasResponded}
              >
                False
              </button>
              <button
                className={`answer-option ${selectedAnswer === 'True' ? 'selected' : ''}`}
                onClick={() => !hasResponded && setSelectedAnswer('True')}
                disabled={hasResponded}
              >
                True
              </button>
            </div>
          )}

          {/* Short Answer */}
          {currentQuestion.question_type === 'short_answer' && (
            <div className="text-answer">
              <textarea
                className="form-textarea"
                placeholder="Type your answer..."
                value={textAnswer}
                onChange={(e) => !hasResponded && setTextAnswer(e.target.value)}
                disabled={hasResponded}
                rows={3}
              />
            </div>
          )}

          {/* Numeric */}
          {currentQuestion.question_type === 'numeric' && (
            <div className="text-answer">
              <input
                type="number"
                className="form-input numeric-input"
                placeholder="Enter a number..."
                value={textAnswer}
                onChange={(e) => !hasResponded && setTextAnswer(e.target.value)}
                disabled={hasResponded}
              />
            </div>
          )}

          {hasResponded ? (
            <button className="btn btn-primary btn-large submit-btn" disabled>
              Response Locked
            </button>
          ) : (
            <button
              className="btn btn-primary btn-large submit-btn"
              onClick={handleSubmitResponse}
              disabled={
                submitting ||
                ((currentQuestion.question_type === 'multiple_choice' || currentQuestion.question_type === 'true_false') && !selectedAnswer) ||
                ((currentQuestion.question_type === 'short_answer' || currentQuestion.question_type === 'numeric') && !textAnswer.trim())
              }
            >
              {submitting ? 'Submitting...' : 'Submit Answer'}
            </button>
          )}

          {error && <p className="error-message">{error}</p>}
        </div>
      </div>
    );
  }

  // Render question-closed state (show user's selection or "no response" message)
  if (stage === 'question-closed' && currentQuestion) {
    return (
      <div className="audience-page">
        <div className="audience-card question-card closed-card">
          <div className="question-header">
            <span className="question-type-badge closed-badge">Question Closed</span>
          </div>
          <h2 className="question-text">{currentQuestion.question_text}</h2>

          {hasResponded ? (
            <>
              {/* Multiple Choice - show user's selection */}
              {currentQuestion.question_type === 'multiple_choice' && currentQuestion.options && (
                <div className="answer-options disabled">
                  {currentQuestion.options.map((option, index) => (
                    <button
                      key={index}
                      className={`answer-option ${selectedAnswer === option ? 'selected' : ''}`}
                      disabled
                    >
                      <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                      <span className="option-text">{option}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* True/False - show user's selection */}
              {currentQuestion.question_type === 'true_false' && (
                <div className="answer-options true-false disabled">
                  <button
                    className={`answer-option ${selectedAnswer === 'False' ? 'selected' : ''}`}
                    disabled
                  >
                    False
                  </button>
                  <button
                    className={`answer-option ${selectedAnswer === 'True' ? 'selected' : ''}`}
                    disabled
                  >
                    True
                  </button>
                </div>
              )}

              {/* Short Answer - show user's response */}
              {currentQuestion.question_type === 'short_answer' && (
                <div className="text-answer">
                  <textarea
                    className="form-textarea"
                    value={textAnswer}
                    disabled
                    rows={3}
                  />
                </div>
              )}

              {/* Numeric - show user's response */}
              {currentQuestion.question_type === 'numeric' && (
                <div className="text-answer">
                  <input
                    type="number"
                    className="form-input numeric-input"
                    value={textAnswer}
                    disabled
                  />
                </div>
              )}

              <p className="closed-hint">Your response has been recorded.</p>
            </>
          ) : (
            <div className="closed-message">
              <p className="no-response-message">No response recorded</p>
              <p className="closed-hint">Please wait for the presenter...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render answering state
  if (stage === 'answering' && currentQuestion) {
    return (
      <div className="audience-page">
        <div className="audience-card question-card">
          <div className="question-header">
            <span className="question-type-badge">{currentQuestion.question_type.replace('_', ' ')}</span>
          </div>
          <h2 className="question-text">{currentQuestion.question_text}</h2>

          {/* Multiple Choice */}
          {currentQuestion.question_type === 'multiple_choice' && currentQuestion.options && (
            <div className="answer-options">
              {currentQuestion.options.map((option, index) => (
                <button
                  key={index}
                  className={`answer-option ${selectedAnswer === option ? 'selected' : ''}`}
                  onClick={() => setSelectedAnswer(option)}
                >
                  <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                  <span className="option-text">{option}</span>
                </button>
              ))}
            </div>
          )}

          {/* True/False */}
          {currentQuestion.question_type === 'true_false' && (
            <div className="answer-options true-false">
              <button
                className={`answer-option ${selectedAnswer === 'False' ? 'selected' : ''}`}
                onClick={() => setSelectedAnswer('False')}
              >
                False
              </button>
              <button
                className={`answer-option ${selectedAnswer === 'True' ? 'selected' : ''}`}
                onClick={() => setSelectedAnswer('True')}
              >
                True
              </button>
            </div>
          )}

          {/* Short Answer */}
          {currentQuestion.question_type === 'short_answer' && (
            <div className="text-answer">
              <textarea
                className="form-textarea"
                placeholder="Type your answer..."
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                rows={3}
              />
            </div>
          )}

          {/* Numeric */}
          {currentQuestion.question_type === 'numeric' && (
            <div className="text-answer">
              <input
                type="number"
                className="form-input numeric-input"
                placeholder="Enter a number..."
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
              />
            </div>
          )}

          <button
            className="btn btn-primary btn-large submit-btn"
            onClick={handleSubmitResponse}
            disabled={
              submitting ||
              ((currentQuestion.question_type === 'multiple_choice' || currentQuestion.question_type === 'true_false') && !selectedAnswer) ||
              ((currentQuestion.question_type === 'short_answer' || currentQuestion.question_type === 'numeric') && !textAnswer.trim())
            }
          >
            {submitting ? 'Submitting...' : 'Submit Answer'}
          </button>

          {error && <p className="error-message">{error}</p>}
        </div>
      </div>
    );
  }

  return null;
}

export default AudiencePage;
