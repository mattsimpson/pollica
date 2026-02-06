const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
const db = require('../config/database');
const { lookupAnonymousToken, invalidateSessionTokenCache } = require('../middleware/auth');

class SocketService {
  constructor(io) {
    this.io = io;
    this.connectedUsers = new Map();
    this.sessionRooms = new Map();
    this.anonymousRooms = new Map();
    this.selectedQuestions = new Map();
    this.closingQuestions = new Map();

    this.setupSocketAuth();
    this.setupEventHandlers();
    this.setupAnonymousNamespace();
  }

  setupSocketAuth() {
    this.io.use(async (socket, next) => {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication error'));
      }

      try {
        const decoded = jwt.verify(token, jwtConfig.secret);

        // Validate token_version against DB to reject invalidated tokens
        const [rows] = await db.query('SELECT token_version FROM users WHERE id = ?', [decoded.id]);
        if (rows.length === 0 || rows[0].token_version !== decoded.tokenVersion) {
          return next(new Error('Token invalidated'));
        }

        socket.user = decoded;
        next();
      } catch (err) {
        return next(new Error('Authentication error'));
      }
    });
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      this.connectedUsers.set(socket.user.id, socket.id);

      socket.on('join-session', async (sessionId) => {
        // Verify the user owns this session or is admin before joining
        try {
          const [sessions] = await db.query('SELECT presenter_id FROM sessions WHERE id = ?', [sessionId]);
          if (!sessions.length) return;
          if (sessions[0].presenter_id !== socket.user.id && socket.user.role !== 'admin') return;
        } catch (err) {
          return;
        }

        socket.join(`session-${sessionId}`);

        if (!this.sessionRooms.has(sessionId)) {
          this.sessionRooms.set(sessionId, new Set());
        }
        this.sessionRooms.get(sessionId).add(socket.id);

        socket.to(`session-${sessionId}`).emit('user-joined', {
          role: socket.user.role
        });
      });

      socket.on('leave-session', (sessionId) => {
        socket.leave(`session-${sessionId}`);

        if (this.sessionRooms.has(sessionId)) {
          this.sessionRooms.get(sessionId).delete(socket.id);
        }

        socket.to(`session-${sessionId}`).emit('user-left', {
          userId: socket.user.id
        });
      });

      socket.on('disconnect', () => {
        this.connectedUsers.delete(socket.user.id);

        this.sessionRooms.forEach((sockets, sessionId) => {
          if (sockets.has(socket.id)) {
            sockets.delete(socket.id);
            socket.to(`session-${sessionId}`).emit('user-left', {
              userId: socket.user.id
            });
          }
        });
      });
    });
  }

  emitNewQuestion(sessionId, question) {
    this.io.to(`session-${sessionId}`).emit('new-question', question);
  }

  emitQuestionUpdate(sessionId, questionId, updates) {
    this.io.to(`session-${sessionId}`).emit('question-updated', {
      questionId,
      updates
    });
  }

  emitNewResponse(sessionId, response) {
    const room = this.io.sockets.adapter.rooms.get(`session-${sessionId}`);

    if (room) {
      room.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket && (socket.user.role === 'presenter' || socket.user.role === 'admin')) {
          socket.emit('new-response', response);
        }
      });
    }
  }

  emitSessionUpdate(sessionId, updates) {
    this.io.to(`session-${sessionId}`).emit('session-updated', {
      sessionId,
      updates
    });
  }

  getSessionParticipantCount(sessionId) {
    const room = this.io.sockets.adapter.rooms.get(`session-${sessionId}`);
    return room ? room.size : 0;
  }

  setupAnonymousNamespace() {
    const anonymousNsp = this.io.of('/anonymous');

    anonymousNsp.use(async (socket, next) => {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Anonymous token required'));
      }

      try {
        const { participant } = await lookupAnonymousToken(token);

        if (!participant) {
          return next(new Error('Invalid anonymous token'));
        }

        if (!participant.session_is_active) {
          return next(new Error('Session is no longer active'));
        }

        socket.anonymousParticipant = participant;
        next();
      } catch (error) {
        next(new Error('Authentication error'));
      }
    });

    anonymousNsp.on('connection', (socket) => {
      const participant = socket.anonymousParticipant;
      const sessionId = participant.session_id;

      socket.join(`session-${sessionId}`);

      if (!this.anonymousRooms.has(sessionId)) {
        this.anonymousRooms.set(sessionId, new Set());
      }
      this.anonymousRooms.get(sessionId).add(socket.id);

      this.emitAnonymousParticipantCount(sessionId);

      socket.on('disconnect', () => {
        if (this.anonymousRooms.has(sessionId)) {
          this.anonymousRooms.get(sessionId).delete(socket.id);
        }

        this.emitAnonymousParticipantCount(sessionId);
      });
    });

    this.anonymousNsp = anonymousNsp;
  }

  emitQuestionSelected(sessionId, questionId, question, previousQuestionId) {
    const existing = this.selectedQuestions.get(sessionId);
    if (existing && existing.transitionTimer) {
      clearTimeout(existing.transitionTimer);
    }

    if (existing && existing.previousQuestionId === questionId && existing.isTransitioning) {
      if (this.anonymousNsp) {
        this.anonymousNsp.to(`session-${sessionId}`).emit('transition-cancelled', {
          questionId: questionId
        });
      }

      this.selectedQuestions.set(sessionId, {
        questionId: questionId,
        transitionTimer: null,
        isTransitioning: false
      });

      return;
    }

    if (this.anonymousNsp) {
      this.anonymousNsp.to(`session-${sessionId}`).emit('question-transition-start', {
        questionId,
        question,
        countdown: 5
      });
    }

    this.io.to(`session-${sessionId}`).emit('question-selected', {
      sessionId,
      questionId,
      question
    });

    const transitionTimer = setTimeout(() => {
      if (this.anonymousNsp) {
        this.anonymousNsp.to(`session-${sessionId}`).emit('question-changed', {
          questionId,
          question
        });
      }

      this.selectedQuestions.set(sessionId, {
        questionId: questionId,
        transitionTimer: null,
        isTransitioning: false
      });
    }, 5000);

    this.selectedQuestions.set(sessionId, {
      questionId: questionId,
      previousQuestionId: previousQuestionId,
      transitionTimer: transitionTimer,
      isTransitioning: true
    });
  }

  emitQuestionDeselected(sessionId, previousQuestionId) {
    const existing = this.selectedQuestions.get(sessionId);
    if (existing && existing.transitionTimer) {
      clearTimeout(existing.transitionTimer);
    }

    this.selectedQuestions.delete(sessionId);

    if (this.anonymousNsp) {
      this.anonymousNsp.to(`session-${sessionId}`).emit('question-deselected', {});
    }

    this.io.to(`session-${sessionId}`).emit('question-selected', {
      sessionId,
      questionId: null,
      question: null
    });
  }

  emitNewAnonymousResponse(sessionId, response) {
    const room = this.io.sockets.adapter.rooms.get(`session-${sessionId}`);

    if (room) {
      room.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket && socket.user && (socket.user.role === 'presenter' || socket.user.role === 'admin')) {
          socket.emit('new-anonymous-response', response);
        }
      });
    }
  }

  emitAnonymousParticipantCount(sessionId) {
    const anonymousRoom = this.anonymousRooms.get(sessionId);
    const count = anonymousRoom ? anonymousRoom.size : 0;

    const room = this.io.sockets.adapter.rooms.get(`session-${sessionId}`);

    if (room) {
      room.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket && socket.user && (socket.user.role === 'presenter' || socket.user.role === 'admin')) {
          socket.emit('anonymous-participant-count', { count });
        }
      });
    }
  }

  getAnonymousParticipantCount(sessionId) {
    const room = this.anonymousRooms.get(sessionId);
    return room ? room.size : 0;
  }

  emitSessionClosed(sessionId) {
    if (this.anonymousNsp) {
      this.anonymousNsp.to(`session-${sessionId}`).emit('session-closed', {});
    }
    invalidateSessionTokenCache(sessionId);
  }

  emitSessionReopened(sessionId) {
    if (this.anonymousNsp) {
      this.anonymousNsp.to(`session-${sessionId}`).emit('session-reopened', {
        sessionId
      });
    }

    this.io.to(`session-${sessionId}`).emit('session-reopened', {
      sessionId
    });
  }

  emitQuestionClosing(sessionId, questionId) {
    const existing = this.closingQuestions.get(questionId);
    if (existing && existing.closingTimer) {
      clearTimeout(existing.closingTimer);
    }

    if (this.anonymousNsp) {
      this.anonymousNsp.to(`session-${sessionId}`).emit('question-closing', {
        questionId,
        countdown: 5
      });
    }

    this.io.to(`session-${sessionId}`).emit('question-closing', {
      questionId,
      countdown: 5
    });

    const closingTimer = setTimeout(async () => {
      try {
        await db.query(
          'UPDATE questions SET is_active = false, closed_at = CURRENT_TIMESTAMP WHERE id = ?',
          [questionId]
        );
      } catch (error) {
        // Database update failed silently
      }

      if (this.anonymousNsp) {
        this.anonymousNsp.to(`session-${sessionId}`).emit('question-closed', {
          questionId
        });
      }

      this.io.to(`session-${sessionId}`).emit('question-closed', {
        questionId
      });

      this.closingQuestions.delete(questionId);
    }, 5000);

    this.closingQuestions.set(questionId, {
      sessionId,
      closingTimer,
      startTime: Date.now()
    });

    return true;
  }

  cancelQuestionClosing(questionId) {
    const existing = this.closingQuestions.get(questionId);
    if (!existing) {
      return false;
    }

    clearTimeout(existing.closingTimer);
    const sessionId = existing.sessionId;

    if (this.anonymousNsp) {
      this.anonymousNsp.to(`session-${sessionId}`).emit('question-close-cancelled', {
        questionId
      });
    }

    this.io.to(`session-${sessionId}`).emit('question-close-cancelled', {
      questionId
    });

    this.closingQuestions.delete(questionId);
    return true;
  }

  isQuestionClosing(questionId) {
    return this.closingQuestions.has(questionId);
  }

  emitQuestionReopened(sessionId, questionId) {
    if (this.anonymousNsp) {
      this.anonymousNsp.to(`session-${sessionId}`).emit('question-reopened', {
        questionId
      });
    }

    this.io.to(`session-${sessionId}`).emit('question-reopened', {
      questionId
    });
  }
}

module.exports = SocketService;
