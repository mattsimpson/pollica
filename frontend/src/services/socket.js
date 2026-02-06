import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:7011';

class SocketService {
  constructor() {
    this.socket = null;
  }

  connect(token) {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      auth: {
        token: token
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  joinSession(sessionId) {
    if (this.socket) {
      this.socket.emit('join-session', sessionId);
    }
  }

  leaveSession(sessionId) {
    if (this.socket) {
      this.socket.emit('leave-session', sessionId);
    }
  }

  onNewQuestion(callback) {
    if (this.socket) {
      this.socket.on('new-question', callback);
    }
  }

  onQuestionUpdated(callback) {
    if (this.socket) {
      this.socket.on('question-updated', callback);
    }
  }

  onNewResponse(callback) {
    if (this.socket) {
      this.socket.on('new-response', callback);
    }
  }

  onSessionUpdated(callback) {
    if (this.socket) {
      this.socket.on('session-updated', callback);
    }
  }

  onUserJoined(callback) {
    if (this.socket) {
      this.socket.on('user-joined', callback);
    }
  }

  onUserLeft(callback) {
    if (this.socket) {
      this.socket.on('user-left', callback);
    }
  }

  off(eventName) {
    if (this.socket) {
      this.socket.off(eventName);
    }
  }
}

export default new SocketService();
