# Pollica: AI Reconstruction Prompt

> Use this prompt to instruct an AI coding assistant (Claude Code, Codex, Copilot, etc.) to recreate the entire Pollica application from scratch.

---

## System Context

You are building **Pollica**, a real-time audience response platform (like Kahoot/Mentimeter) for educational presentations. License: AGPL-3.0.

The system has three user types:
- **Admin** -- full access including user management
- **Presenter** -- creates sessions, posts questions, views real-time analytics
- **Audience** -- joins anonymously via 4-character codes, answers questions in real-time

---

## Architecture Overview

Three-tier containerized stack:

```
[Browser] <-> [nginx :7011] <-> [Node.js/Express :7012] <-> [MySQL :3306]
                                  + Socket.io
```

- **Frontend**: React 19 SPA served by nginx, which also reverse-proxies `/api` and `/socket.io` to the backend
- **Backend**: Node.js/Express REST API + Socket.io WebSocket server
- **Database**: MySQL 8.0 (internal to Docker network, not exposed to host)
- Only the frontend port (7011) is exposed to the host

---

## Technology Stack (exact versions)

### Backend (`backend/package.json`)
```json
{
  "dependencies": {
    "express": "^5.1.0",
    "socket.io": "^4.8.1",
    "mysql2": "^3.12.0",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express-rate-limit": "^7.5.0",
    "helmet": "^8.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.9",
    "jest": "^29.7.0"
  }
}
```

### Frontend (`frontend/package.json`)
```json
{
  "type": "module",
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^6.28.1",
    "axios": "^1.7.9",
    "socket.io-client": "^4.8.1",
    "recharts": "^2.15.0",
    "@visx/wordcloud": "^3.3.0",
    "@visx/text": "^3.3.0",
    "@visx/scale": "^3.5.0",
    "qrcode.react": "^4.2.0",
    "lucide-react": "^0.563.0"
  },
  "devDependencies": {
    "vite": "^6.0.7",
    "@vitejs/plugin-react": "^4.3.4"
  }
}
```

---

## Database Schema (complete SQL)

Create `database/schema.sql`:

```sql
CREATE DATABASE IF NOT EXISTS pollica;
USE pollica;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('presenter', 'admin') NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    token_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    presenter_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    join_code VARCHAR(4) UNIQUE,
    selected_question_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL,
    FOREIGN KEY (presenter_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_presenter_id (presenter_id),
    INDEX idx_active (is_active),
    INDEX idx_join_code (join_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    presenter_id INT NOT NULL,
    question_text TEXT NOT NULL,
    question_type ENUM('multiple_choice', 'true_false', 'short_answer', 'numeric') NOT NULL,
    options JSON,
    correct_answer VARCHAR(255),
    time_limit INT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (presenter_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_session_id (session_id),
    INDEX idx_presenter_id (presenter_id),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE anonymous_participants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    anonymous_token VARCHAR(64) NOT NULL UNIQUE,
    display_name VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    INDEX idx_session_id (session_id),
    INDEX idx_anonymous_token (anonymous_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE anonymous_responses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question_id INT NOT NULL,
    anonymous_participant_id INT NOT NULL,
    answer_text TEXT NOT NULL,
    response_time INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (anonymous_participant_id) REFERENCES anonymous_participants(id) ON DELETE CASCADE,
    UNIQUE KEY unique_anonymous_response (question_id, anonymous_participant_id),
    INDEX idx_question_id (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE sessions ADD FOREIGN KEY (selected_question_id) REFERENCES questions(id) ON DELETE SET NULL;

-- Demo users (password: 'password123')
INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES
('admin@polli.ca', '$2b$10$9/OO/Jur3leUzuC8ubRnO.Ow4vSRE5NCol8fZ5xSqrqMlG06ZoqbG', 'admin', 'System', 'Admin'),
('presenter@polli.ca', '$2b$10$9/OO/Jur3leUzuC8ubRnO.Ow4vSRE5NCol8fZ5xSqrqMlG06ZoqbG', 'presenter', 'John', 'Smith');
```

---

## Backend Specification

### File Structure
```
backend/
  package.json
  Dockerfile
  .dockerignore
  src/
    server.js
    config/
      database.js
      jwt.js
    middleware/
      auth.js
    controllers/
      authController.js
      adminController.js
      sessionController.js
      questionController.js
      responseController.js
      anonymousController.js
    routes/
      authRoutes.js
      adminRoutes.js
      sessionRoutes.js
      questionRoutes.js
      responseRoutes.js
      anonymousRoutes.js
    services/
      socketService.js
```

### Server Setup (`src/server.js`)

Initialize Express + HTTP server + Socket.io:

```javascript
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:7011',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});
```

**Security middleware (Helmet):**
```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://www.gravatar.com"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
```

**Rate limiting -- 4 tiers:**

| Name | Applied To | Window | Max |
|------|-----------|--------|-----|
| generalLimiter | All routes (`app.use`) | 15 min | 100 |
| authLimiter | `/api/auth/*` at mount | 15 min | 10 |
| joinLimiter | `POST /api/anonymous/join` | 15 min | 10 |
| codeLookupLimiter | `GET /api/anonymous/session/:code` | 15 min | 20 |

All use `standardHeaders: true, legacyHeaders: false`.

**Route mounting:**
```javascript
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/responses', responseRoutes);
app.use('/api/anonymous', anonymousRoutes);
app.use('/api/admin', adminRoutes);
```

**Health check:** `GET /health` -> `{ status: 'OK', timestamp: new Date().toISOString() }`

**Error handler:** Returns `{ error: err.message || 'Internal server error' }` with status code.

**404 handler:** Returns `{ error: 'Route not found' }`.

Listen on `process.env.PORT || 7012`, bound to `0.0.0.0`.

### Database Config (`src/config/database.js`)

MySQL2 promise-based connection pool:
- `connectionLimit`: `parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 50`
- `waitForConnections: true`, `queueLimit: 0`
- `enableKeepAlive: true`, `keepAliveInitialDelay: 0`
- Auto-retry connection test every 5 seconds on failure

### JWT Config (`src/config/jwt.js`)

- `process.exit(1)` if `JWT_SECRET` not set or < 32 characters
- Exports `{ secret, expiresIn: process.env.JWT_EXPIRES_IN || '24h' }`

### Auth Middleware (`src/middleware/auth.js`)

**Anonymous token cache:**
- In-memory `Map` with 30-second TTL per entry
- Cleanup interval every 60 seconds
- Shared `lookupAnonymousToken(token)` function used by both HTTP middleware and socket auth
- `invalidateAnonymousTokenCache(token)` and `invalidateSessionTokenCache(sessionId)` for cache busting

**`authenticateToken` middleware:**
1. Extract Bearer token from Authorization header
2. No token -> 401 `{ error: 'Access token required' }`
3. `jwt.verify()` failure -> 403 `{ error: 'Invalid or expired token' }`
4. Validate `tokenVersion` against DB `SELECT token_version FROM users WHERE id = ?`
5. Mismatch or user not found -> 403 `{ error: 'Token has been invalidated. Please log in again.' }`
6. Set `req.user = decoded`

**`requireRole(...roles)` middleware factory:**
- No user -> 401; role not in list -> 403

**`anonymousAuth` middleware:**
1. Read `X-Anonymous-Token` header
2. No token -> 401
3. Look up via `lookupAnonymousToken()` (checks cache first, then DB)
4. Not found -> 403; session inactive -> invalidate cache, 400
5. Set `req.anonymousParticipant = participant`

### Controllers

#### Auth Controller (`src/controllers/authController.js`)

**register:** Email regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, password >= 8 chars, role hardcoded to 'presenter', bcrypt 10 rounds, name trimmed/capped at 100 chars.

**login:** Verify credentials with bcrypt.compare, check role is presenter/admin, sign JWT with `{ id, role, email, tokenVersion: user.token_version }`. Return `{ token, user: { id, email, role, firstName, lastName } }`.

**getProfile:** Return user details from DB by `req.user.id`.

**updateProfile:** Update email (unique check excluding self), firstName, lastName.

**changePassword:** Verify current password, hash new (min 6 chars), increment `token_version`.

#### Admin Controller (`src/controllers/adminController.js`)

**getAllUsers:** `SELECT u.*, COUNT(s.id) as session_count FROM users u LEFT JOIN sessions s ON u.id = s.presenter_id GROUP BY u.id ORDER BY u.created_at DESC`

**createUser:** Any role (presenter/admin), min 6 char password, bcrypt 10 rounds.

**updateUser:** Dynamic field update. Role change increments `token_version`. Cannot change own role.

**resetUserPassword:** Min 6 char password, increment `token_version`.

**deleteUser:** Cannot delete self. `DELETE FROM users` cascades.

**getAllSessions:** Filterable by `presenterId`, `status` (open/closed), `search` (title LIKE). Includes question_count and participant_count subqueries.

#### Session Controller (`src/controllers/sessionController.js`)

**createSession:** Generate unique join code (pattern: letter-digit-letter-digit, excluding ambiguous chars l/i/o/0/1). Up to 10 retries.

**getSessions:** Own sessions with question/participant counts. Optional `active=true` filter.

**getSessionById:** Ownership check (`presenter_id === req.user.id || req.user.role === 'admin'`). Returns session, questions with response counts, participant count.

**updateSession:** Closing (`isActive: false`) sets `closed_at`, emits `session-closed`, invalidates anonymous token cache. Reopening emits `session-reopened`.

**selectQuestion:** Set `selected_question_id`. If question is closed, auto-reopen it. If `questionId === null`, deselect. Emits question-selected/question-deselected. Handles 5-second transition for audience.

#### Question Controller (`src/controllers/questionController.js`)

**createQuestion:** Validates session ownership, session must be active. Options stored as `JSON.stringify()`.

**closeQuestion:** Initiates 5-second countdown via socket service. The actual DB update (`is_active = false, closed_at = CURRENT_TIMESTAMP`) happens inside the socket service timer callback, not in the controller. Returns `{ message: 'Question closing initiated', countdown: 5 }`.

**cancelCloseQuestion:** Cancels active closing timer via socket service.

**reopenQuestion:** Sets `is_active = true`, clears `closed_at`, emits question-reopened.

#### Response Controller (`src/controllers/responseController.js`)

**getResponsesByQuestion:** All anonymous responses with display names, ordered by created_at ASC.

**getResponseStats:**
- Total count, average response time
- MC/TF: answer distribution grouped by answer_text, sorted by count DESC
- Numeric: mean, median, min, max, range, plus histogram with `Math.min(10, Math.max(1, Math.ceil(Math.sqrt(values.length))))` bins

#### Anonymous Controller (`src/controllers/anonymousController.js`)

**getSessionByCode:** Case-insensitive join code lookup. Returns session info (title, description, presenterName), selected question (if active), participant count.

**joinSession:** Display name max 50 chars, trimmed. Anonymous token: `crypto.randomBytes(32).toString('hex')` (64 hex chars).

**submitResponse:** Validates question active, belongs to session, is currently selected. Answer max 1000 chars. Duplicate -> 409 (DB unique constraint). Fire-and-forget `last_active_at` update. Emits `new-anonymous-response` to presenter.

**getMyResponse:** Returns `{ hasResponded: boolean, response: object|null }`.

### Route Definitions with Middleware Chains

**Auth routes** (`/api/auth`, auth rate limiter at mount level):
- `POST /register` -> register
- `POST /login` -> login
- `GET /profile` -> authenticateToken -> getProfile
- `PUT /profile` -> authenticateToken -> updateProfile
- `POST /change-password` -> authenticateToken -> changePassword

**Session routes** (`/api/sessions`):
- `POST /` -> authenticateToken, requireRole('presenter', 'admin') -> createSession
- `GET /my-sessions` -> authenticateToken, requireRole('presenter', 'admin') -> getSessions
- `GET /active` -> authenticateToken -> getActiveSessions
- `GET /:sessionId` -> authenticateToken -> getSessionById
- `PUT /:sessionId` -> authenticateToken, requireRole('presenter', 'admin') -> updateSession
- `PUT /:sessionId/select-question` -> authenticateToken, requireRole('presenter', 'admin') -> selectQuestion

**Question routes** (`/api/questions`):
- `POST /` -> authenticateToken, requireRole('presenter', 'admin') -> createQuestion
- `PUT /:questionId` -> authenticateToken, requireRole('presenter', 'admin') -> updateQuestion
- `DELETE /:questionId` -> authenticateToken, requireRole('presenter', 'admin') -> deleteQuestion
- `PUT /:questionId/close` -> authenticateToken, requireRole('presenter', 'admin') -> closeQuestion
- `PUT /:questionId/cancel-close` -> authenticateToken, requireRole('presenter', 'admin') -> cancelCloseQuestion
- `PUT /:questionId/reopen` -> authenticateToken, requireRole('presenter', 'admin') -> reopenQuestion
- `GET /` -> authenticateToken -> getQuestions
- `GET /active` -> authenticateToken -> getActiveQuestions
- `GET /:questionId` -> authenticateToken -> getQuestionById

**Response routes** (`/api/responses`):
- `GET /question/:questionId` -> authenticateToken, requireRole('presenter', 'admin') -> getResponsesByQuestion
- `GET /question/:questionId/stats` -> authenticateToken, requireRole('presenter', 'admin') -> getResponseStats

**Anonymous routes** (`/api/anonymous`, own rate limiters):
- `GET /session/:code` -> codeLookupLimiter (20/15min) -> getSessionByCode
- `POST /join` -> joinLimiter (10/15min) -> joinSession
- `POST /response` -> anonymousAuth -> submitResponse
- `GET /my-response/:questionId` -> anonymousAuth -> getMyResponse

**Admin routes** (`/api/admin`, router-level: authenticateToken + requireRole('admin')):
- `GET /users` -> getAllUsers
- `POST /users` -> createUser
- `PUT /users/:userId` -> updateUser
- `POST /users/:userId/reset-password` -> resetUserPassword
- `DELETE /users/:userId` -> deleteUser
- `GET /sessions` -> getAllSessions

### Socket.io Service (`src/services/socketService.js`)

**Class with these tracking Maps:**
- `connectedUsers`: userId -> socketId
- `sessionRooms`: sessionId -> Set<socketId>
- `anonymousRooms`: sessionId -> Set<socketId>
- `selectedQuestions`: sessionId -> { questionId, previousQuestionId, transitionTimer, isTransitioning }
- `closingQuestions`: questionId -> { sessionId, closingTimer, startTime }

**Main namespace authentication middleware:**
1. Read `socket.handshake.auth.token`
2. `jwt.verify()` and validate `token_version` against DB
3. Set `socket.user = decoded`

**Main namespace `join-session` event:**
- Query session from DB, verify `presenter_id === socket.user.id || socket.user.role === 'admin'`
- Join room `session-${sessionId}`, track in sessionRooms
- Emit `user-joined` with `{ role }` to room (no email exposed)

**Main namespace `leave-session` and `disconnect`:** Clean up rooms and tracking.

**Anonymous namespace (`/anonymous`) authentication middleware:**
- Read `socket.handshake.auth.token`
- `lookupAnonymousToken(token)` (shared with HTTP middleware)
- Set `socket.anonymousParticipant = participant`

**Anonymous namespace on connect:** Auto-join room `session-${sessionId}`, emit `anonymous-participant-count` to presenters.

**Emit methods:**

`emitQuestionSelected(sessionId, questionId, question, previousQuestionId)`:
- If re-selecting same question during active transition: emit `transition-cancelled` to anonymous namespace, cancel transition, return
- Emit to anonymous: `question-transition-start` with `{ questionId, question, countdown: 5 }`
- Emit to main: `question-selected` with `{ sessionId, questionId, question }`
- Set 5-second timer; on expiry emit `question-changed` to anonymous with `{ questionId, question }`

`emitQuestionDeselected(sessionId, previousQuestionId)`:
- Clear transition timer, emit `question-deselected` to anonymous, emit `question-selected` with null to main

`emitQuestionClosing(sessionId, questionId)`:
- Emit `question-closing` with `{ questionId, countdown: 5 }` to both namespaces
- Set 5-second timer; on expiry: UPDATE DB `is_active = false, closed_at = CURRENT_TIMESTAMP`, emit `question-closed` to both namespaces

`cancelQuestionClosing(questionId)`:
- Clear timer, emit `question-close-cancelled` to both namespaces

`emitNewAnonymousResponse(sessionId, response)`:
- Emit to main namespace room, but only to sockets where `socket.user.role === 'presenter' || 'admin'`

`emitAnonymousParticipantCount(sessionId)`:
- Count sockets in anonymousRooms for that session
- Emit to presenter/admin sockets only in main namespace

`emitSessionClosed(sessionId)`:
- Emit `session-closed` to anonymous namespace
- Call `invalidateSessionTokenCache(sessionId)`

`emitSessionReopened(sessionId)`:
- Emit `session-reopened` to both namespaces

`emitQuestionReopened(sessionId, questionId)`:
- Emit `question-reopened` to both namespaces

---

## Frontend Specification

### File Structure
```
frontend/
  package.json
  vite.config.js
  Dockerfile
  nginx.conf
  index.html
  .dockerignore
  public/
    manifest.json
    service-worker.js
    icon-192.png
    icon-512.png
    apple-touch-icon.png
    (6 splash screen PNGs)
  src/
    main.jsx
    App.jsx
    mobile.css
    styles/
      App.css
    services/
      api.js
      anonymousApi.js
      socket.js
      anonymousSocket.js
    components/
      Login.jsx
      Navbar.jsx
      WordCloud.jsx
    pages/
      PresenterDashboard.jsx
      PresenterSession.jsx
      AudiencePage.jsx
      AdminUsers.jsx
```

### Vite Config (`vite.config.js`)

```javascript
export default defineConfig({
  plugins: [react()],
  server: {
    port: 7011,
    proxy: {
      '/api': { target: 'http://localhost:7012', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:7012', ws: true }
    }
  },
  preview: { port: 7011 },
  build: { outDir: 'dist', sourcemap: true }
});
```

### API Services

**`src/services/api.js`:**
- Axios instance with `baseURL: import.meta.env.VITE_API_URL || 'http://localhost:7011/api'`
- Request interceptor: attach `Authorization: Bearer ${localStorage.getItem('token')}`
- Response interceptor: on 401, clear localStorage (`token`, `user`), redirect to `/login`
- Export service objects: `authService`, `sessionService`, `questionService`, `responseService`, `adminService` -- each wrapping axios calls for their respective endpoints

**`src/services/anonymousApi.js`:**
- Separate axios instance with `baseURL: ${API_URL}/anonymous`
- Request interceptor: read `sessionStorage.getItem('currentJoinCode')`, then `sessionStorage.getItem('anonymousToken_${joinCode}')`, set `X-Anonymous-Token` header
- Export `anonymousService` with methods: `getSessionByCode`, `joinSession`, `submitResponse`, `getMyResponse`
- Export helper functions: `setCurrentJoinCode`, `storeAnonymousToken`, `getAnonymousToken`, `storeDisplayName`, `getDisplayName` (all use sessionStorage)

### Socket Services

**`src/services/socket.js`** (singleton, main namespace):
- `SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:7011'`
- `connect(token)`: creates `io(SOCKET_URL, { auth: { token }, reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 5000, reconnectionAttempts: 5 })`
- Reuses existing socket if already connected
- Methods: `joinSession`, `leaveSession`, `disconnect`, `onNewQuestion`, `onQuestionUpdated`, `onNewResponse`, `onSessionUpdated`, `onUserJoined`, `onUserLeft`, `off`

**`src/services/anonymousSocket.js`** (singleton, `/anonymous` namespace):
- Connects to `${SOCKET_URL}/anonymous` with same reconnection settings
- Has `connectionCallbacks` queue -- callbacks added before connection are flushed on connect
- Methods: `connect`, `onConnected`, `isConnected`, `disconnect`, `onQuestionTransitionStart`, `onTransitionCancelled`, `onQuestionChanged`, `onQuestionDeselected`, `onSessionClosed`, `onQuestionClosing`, `onQuestionCloseCancelled`, `onQuestionClosed`, `onQuestionReopened`, `off`

### Routing & Auth Guards (`src/App.jsx`)

- Wraps everything in `<BrowserRouter>` and `<React.StrictMode>`
- State: `user` (null or object), `loading` (true initially)
- On mount: if localStorage has `token`, validate via `authService.getProfile()`. On failure, clear localStorage.
- On mount: register service worker at `/service-worker.js`
- Navbar hidden on `/go/*` routes

Routes:
| Path | Guard | Component |
|------|-------|-----------|
| `/` | -- | Redirect: user -> `/presenter/dashboard`, no user -> `/login` |
| `/login` | Redirect if user | `<Login setUser={setUser} />` |
| `/presenter/dashboard` | `user?.role === 'presenter' \|\| user?.role === 'admin'` | `<PresenterDashboard user={user} />` |
| `/presenter/session/:sessionId` | `user?.role === 'presenter' \|\| user?.role === 'admin'` | `<PresenterSession />` |
| `/admin/users` | `user?.role === 'admin'` | `<AdminUsers />` |
| `/go/:code` | None | `<AudiencePage />` |
| `*` | -- | `<Navigate to="/" replace />` |

### Login Component (`src/components/Login.jsx`)

- Simple form: email, password, submit button
- Calls `authService.login()`, stores token and user in localStorage, navigates to `/presenter/dashboard`
- Card style, max-width 500px, centered

### Navbar Component (`src/components/Navbar.jsx`)

- Gradient background (#667eea -> #764ba2)
- Brand link "Pollica" on left
- Right side: Dashboard link, Users link (admin only), profile avatar dropdown
- **Gravatar**: includes inline MD5 implementation (no external dependency). Generates URL `https://www.gravatar.com/avatar/${md5(email)}?d=mp&s=${size}`
- Dropdown: user name, "My Profile" button, divider, "Logout" button (red)
- Profile modal (max-width 450px): Gravatar avatar (80x80), profile form (firstName, lastName, email), section divider "Change Password", password form (current, new, confirm)
- Click-outside detection via `useRef` + `mousedown` event listener

### Presenter Dashboard (`src/pages/PresenterDashboard.jsx`)

- Props: `{ user }`
- If admin: shows "All Sessions" title, filter bar (search, presenter dropdown, status dropdown), fetches via `adminService.getAllSessions(params)`
- If presenter: shows "My Sessions", fetches via `sessionService.getMySessions()`
- Session cards in a `grid grid-2` layout: title, active/closed badge, description, question count, participant count, created date, presenter name (admin view)
- Create session modal: title (required, autoFocus), description (textarea), Cancel/Create buttons

### Presenter Session (`src/pages/PresenterSession.jsx`)

- Uses `useParams()` for sessionId
- 16 state variables tracking session, questions, selected question, responses, stats, modals, countdown state
- Socket connection: joins session room, listens for real-time events
- Two-column grid layout (1fr 2fr):
  - **Left column**: Questions list. Each card has:
    - Control bar: Edit (Pencil icon), Delete (Trash2 icon), Present/Stop button, Close/Cancel/Reopen button
    - "Presenting" badge when active
    - Question text and response count
    - Visual feedback: `backgroundColor: '#eff6ff'` when selected, `border: 2px solid #10b981` when presenting
  - **Right column**: Response analytics
    - Stats grid: Total Responses, Correct, Incorrect, Avg Time
    - Visualization by question type:
      - `short_answer`: WordCloud component
      - `numeric` with stats: Summary (mean, median, min, max) + Recharts histogram (BarChart with `dataKey="range"`)
      - MC/TF: Recharts BarChart of answer distribution (dataKey="answer_text"), `fill="#667eea"`
    - Recent responses list (scrollable, max-height 400px)
- Modals: Create/Edit question, Share (QR code + join URL + code), Delete confirmation
- Share modal: `<QRCodeSVG value={joinUrl} size={200} level="M" includeMargin />`, join code displayed large (2.5rem bold uppercase), participant count, copy link button
- Countdown timer: decrements `closeCountdown` every second when `closingQuestionId` is set
- Incremental stat updates from WebSocket responses (avoids re-fetching); numeric questions re-fetch stats for histogram accuracy

### Audience Page (`src/pages/AudiencePage.jsx`)

State machine with stages: `loading` -> `name-entry` -> `waiting` -> `transition` -> `answering` -> `submitted` -> `question-closing` -> `question-closed` (plus `error`, `closed`)

**Join flow:**
1. Check sessionStorage for existing token/name
2. Fetch session by code
3. If no token: show name entry form (maxLength=50, autoComplete=off)
4. On submit: call `anonymousService.joinSession()`, store token and name in sessionStorage
5. Connect anonymous socket

**Stage renders:**
- `loading`: spinner + "Loading session..."
- `name-entry`: session title, presenter name, name input, "Join Session" button
- `waiting`: "Welcome, {name}!", pulse animation (ring + dot), "Waiting for the next question..."
- `transition`: "Next question in", large countdown number (6rem), "Get ready!"
- `answering`: question type badge (uppercase, gray), question text, answer input by type, submit button
- `submitted`: green checkmark circle (&#10003;), "Response Submitted!", waiting message
- `question-closing`: question with closing overlay, red countdown, disabled options if responded
- `question-closed`: red "Question Closed" badge, locked answer or "No response recorded"
- `closed`: "Session Ended", "closed by presenter" message
- `error`: "Oops!" in red, error message, "Go Home" button

**Answer inputs by question type:**
- `multiple_choice`: buttons with letter (A, B, C... via `String.fromCharCode(65 + index)`) and text, `.selected` class
- `true_false`: two side-by-side buttons in `.true-false` layout
- `short_answer`: `<textarea rows={3}>`
- `numeric`: `<input type="number">` with class `numeric-input`

**Auto-submit:** When `question-closing` stage and countdown <= 2, if user has an answer but hasn't submitted, trigger automatic submission.

**Socket events drive all transitions.** Session-reopened triggers data refresh and state recalculation.

### Word Cloud Component (`src/components/WordCloud.jsx`)

- Props: `{ responses, width = 500, height = 400 }`
- Uses `@visx/wordcloud`, `@visx/text`, `@visx/scale`
- Color palette: `['#667eea', '#764ba2', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6']`
- Word frequency: split by `/\s+/`, remove punctuation `/[^\w]/g`, filter length > 2, filter stopwords
- Stop words: the, a, an, and, or, but, in, on, at, to, for, of, with, by, from, as, is, was, are, were, been, be, have, has, had, do, does, did, will, would, could, should, may, might, can, i, you, he, she, it, we, they, this, that, these, those, am, my, your, his, her, its, our, their
- Font scale: `scaleLog({ domain: [min, max], range: [14, 60] })`
- Config: font `"system-ui, -apple-system, sans-serif"`, fontWeight `"bold"`, padding `2`, spiral `"archimedean"`, rotate `() => (Math.random() > 0.5 ? 0 : 90)`, random `() => 0.5`
- Hover effect: dims other words to 0.5 opacity
- Tooltip: absolute positioned, dark background (#1f2937), shows word and count
- Empty state: dashed border container with "No responses yet"

### Admin Users (`src/pages/AdminUsers.jsx`)

- Users table with columns: Name, Email, Role (badge), Sessions count, Created date, Actions
- CRUD modals: Add User, Edit User, Reset Password, Delete Confirmation
- Success messages auto-clear after 3 seconds
- Delete confirmation shows session count warning in red (#dc2626)

---

## Styling System

### CSS Architecture
Two CSS files: `src/styles/App.css` (main, ~1064 lines) and `src/mobile.css` (mobile overrides, ~161 lines).

### Key Color Palette
| Name | Hex | Usage |
|------|-----|-------|
| Primary | #667eea | Buttons, focus, charts, pulse, countdown |
| Gradient | #764ba2 | Navbar end, word cloud |
| Success | #10b981 | Active badges, presented border, checkmark |
| Danger | #ef4444 | Errors, close countdown |
| Theme | #2563eb | PWA theme, icon backgrounds |

### Responsive Design
- Single breakpoint: `@media (max-width: 768px)`
- Below 768px: single-column grids, stacked layouts, minimum 44px touch targets, 16px input font (prevents iOS zoom)
- iOS safe areas: `padding: env(safe-area-inset-*)`
- Mobile card feedback: `:active` `transform: scale(0.98)`
- `-webkit-overflow-scrolling: touch` for momentum scrolling

### Animations (CSS @keyframes)
1. `pulse-ring`: 2s, scale 0.5->1.5 with fade
2. `pulse-dot`: 2s, subtle scale 1->1.1->1
3. `countdown-pop`: 1s, scale 1.5->1 with fade-in
4. `checkmark-pop`: 0.5s, scale 0->1.2->1
5. `spin`: 1s linear, full rotation
6. `countdown-pulse`: 1s, scale 1->1.1->1

---

## Docker & Deployment

### docker-compose.yml

```yaml
services:
  mysql:
    image: mysql:8.0
    container_name: pollica-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is required}
      MYSQL_DATABASE: ${DB_NAME:-pollica}
    volumes:
      - mysql_data:/var/lib/mysql
      - ./database/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
    networks:
      - pollica-network
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      timeout: 20s
      retries: 10

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: pollica-backend
    restart: unless-stopped
    expose:
      - "${BACKEND_PORT:-7012}"
    environment:
      PORT: ${BACKEND_PORT:-7012}
      NODE_ENV: ${NODE_ENV:-production}
      DB_HOST: ${DB_HOST:-mysql}
      DB_PORT: ${DB_PORT:-3306}
      DB_USER: ${DB_USER:-root}
      DB_PASSWORD: ${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is required}
      DB_NAME: ${DB_NAME:-pollica}
      DB_CONNECTION_LIMIT: ${DB_CONNECTION_LIMIT:-50}
      JWT_SECRET: ${JWT_SECRET:?JWT_SECRET is required}
      JWT_EXPIRES_IN: ${JWT_EXPIRES_IN:-24h}
      CORS_ORIGIN: ${CORS_ORIGIN:-http://localhost:7011}
    depends_on:
      mysql:
        condition: service_healthy
    networks:
      - pollica-network
    volumes:
      - ./backend/src:/app/src

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        VITE_API_URL: ${VITE_API_URL:-http://localhost:7011/api}
        VITE_SOCKET_URL: ${VITE_SOCKET_URL:-http://localhost:7011}
    container_name: pollica-frontend
    restart: unless-stopped
    ports:
      - "${FRONTEND_PORT:-7011}:${FRONTEND_PORT:-7011}"
    environment:
      FRONTEND_PORT: ${FRONTEND_PORT:-7011}
      BACKEND_PORT: ${BACKEND_PORT:-7012}
    depends_on:
      - backend
    networks:
      - pollica-network

networks:
  pollica-network:
    driver: bridge

volumes:
  mysql_data:
```

Key: MySQL and backend are NOT exposed to host. Only frontend (nginx) is exposed.

### Backend Dockerfile

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY . .
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3000
CMD ["npm", "start"]
```

### Frontend Dockerfile (multi-stage)

```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
ARG VITE_API_URL
ARG VITE_SOCKET_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

FROM nginx:alpine
ENV FRONTEND_PORT=7011
ENV BACKEND_PORT=7012
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
```

The nginx template uses `envsubst` for `${FRONTEND_PORT}` and `${BACKEND_PORT}`.

### nginx.conf

```nginx
server {
    listen ${FRONTEND_PORT};
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://backend:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io {
        proxy_pass http://backend:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## PWA Configuration

### manifest.json
```json
{
  "short_name": "Pollica",
  "name": "Pollica",
  "description": "Real-time audience response and polling platform for education",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "purpose": "any" },
    { "src": "icon-192.png", "sizes": "192x192", "purpose": "maskable" },
    { "src": "icon-512.png", "sizes": "512x512", "purpose": "any" },
    { "src": "icon-512.png", "sizes": "512x512", "purpose": "maskable" },
    { "src": "apple-touch-icon.png", "sizes": "180x180" }
  ],
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "theme_color": "#2563eb",
  "background_color": "#ffffff",
  "orientation": "portrait-primary",
  "categories": ["education", "productivity"]
}
```

### service-worker.js
```javascript
const CACHE_NAME = 'pollica-v1';
const urlsToCache = ['/', '/index.html'];

// Install: pre-cache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)).catch(() => {})
  );
});

// Fetch: cache-first strategy
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
});
```

### index.html key meta tags
```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#2563eb">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Pollica">
<link rel="manifest" href="/manifest.json">
```

Include apple-touch-icon and iOS splash screen links for 6 device sizes.

---

## Environment Variables (.env.example)

```bash
# REQUIRED
JWT_SECRET=                    # Min 32 chars. Generate: openssl rand -base64 32
MYSQL_ROOT_PASSWORD=           # Strong password for MySQL

# OPTIONAL (defaults shown)
NODE_ENV=production
FRONTEND_PORT=7011
BACKEND_PORT=7012
DB_HOST=mysql
DB_PORT=3306
DB_USER=root
DB_NAME=pollica
DB_CONNECTION_LIMIT=50
JWT_EXPIRES_IN=24h
CORS_ORIGIN=http://localhost:7011
VITE_API_URL=http://localhost:7011/api
VITE_SOCKET_URL=http://localhost:7011
```

---

## Verification Checklist

After building, verify:

1. **Environment**: `cp .env.example .env`, set JWT_SECRET (32+ chars) and MYSQL_ROOT_PASSWORD
2. **Start**: `docker compose up -d --build`
3. **Health**: `curl http://localhost:7012/health` returns `{ status: 'OK' }` (from within Docker network) or test via `curl http://localhost:7011/api/../health`
4. **Frontend**: Navigate to `http://localhost:7011` -- should see login page
5. **Login**: Use `admin@polli.ca` / `password123`
6. **Dashboard**: Should see "All Sessions" (admin view)
7. **Create session**: Click "Create New Session", enter title, verify join code generated
8. **Add question**: Add one of each type (MC, TF, short answer, numeric)
9. **Present question**: Click present button, verify "Presenting" badge
10. **Audience join**: In incognito, go to `http://localhost:7011/go/{code}`, enter name, verify waiting state
11. **Question appears**: After 5-second countdown, question should appear for audience
12. **Submit answer**: Submit an answer, verify it streams to presenter in real-time
13. **Analytics**: Verify bar chart (MC/TF), word cloud (short answer), or histogram (numeric) renders
14. **Close question**: Initiate close, verify 5-second countdown on both sides
15. **QR sharing**: Open share modal, verify QR code renders
16. **User management**: Navigate to `/admin/users`, verify CRUD operations
17. **Session close/reopen**: Close session, verify audience sees "Session Ended", reopen, verify audience recovers
18. **Mobile**: Test on mobile viewport -- verify responsive layout and touch targets
19. **Rate limiting**: Rapid-fire login attempts should be blocked after 10
20. **Token invalidation**: Change password, verify old token stops working
