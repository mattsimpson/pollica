import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:7011';

class AnonymousSocketService {
  constructor() {
    this.socket = null;
    this.connectionCallbacks = [];
  }

  connect(token) {
    if (this.socket?.connected) {
      return this.socket;
    }

    // Disconnect existing socket if any
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io(`${SOCKET_URL}/anonymous`, {
      auth: {
        token: token
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      this.connectionCallbacks.forEach(cb => cb(this.socket));
      this.connectionCallbacks = [];
    });

    return this.socket;
  }

  // Wait for socket to be connected
  onConnected(callback) {
    if (this.socket?.connected) {
      callback(this.socket);
    } else {
      this.connectionCallbacks.push(callback);
    }
  }

  isConnected() {
    return this.socket?.connected || false;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Listen for question transition start (5-second countdown begins)
  onQuestionTransitionStart(callback) {
    if (this.socket) {
      this.socket.on('question-transition-start', callback);
    }
  }

  // Listen for transition cancelled (faculty returned to previous question within 5s)
  onTransitionCancelled(callback) {
    if (this.socket) {
      this.socket.on('transition-cancelled', callback);
    }
  }

  // Listen for question changed (transition complete)
  onQuestionChanged(callback) {
    if (this.socket) {
      this.socket.on('question-changed', callback);
    }
  }

  // Listen for question deselected
  onQuestionDeselected(callback) {
    if (this.socket) {
      this.socket.on('question-deselected', callback);
    }
  }

  // Listen for session closed
  onSessionClosed(callback) {
    if (this.socket) {
      this.socket.on('session-closed', callback);
    }
  }

  // Listen for question closing (5-second countdown starts)
  onQuestionClosing(callback) {
    if (this.socket) {
      this.socket.on('question-closing', callback);
    }
  }

  // Listen for question close cancelled
  onQuestionCloseCancelled(callback) {
    if (this.socket) {
      this.socket.on('question-close-cancelled', callback);
    }
  }

  // Listen for question closed (countdown complete)
  onQuestionClosed(callback) {
    if (this.socket) {
      this.socket.on('question-closed', callback);
    }
  }

  // Listen for question reopened
  onQuestionReopened(callback) {
    if (this.socket) {
      this.socket.on('question-reopened', callback);
    }
  }

  // Remove event listener
  off(eventName) {
    if (this.socket) {
      this.socket.off(eventName);
    }
  }
}

export default new AnonymousSocketService();
