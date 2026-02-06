# Pollica Requirements Specification

## 1. Project Overview

**Pollica** is a real-time audience response platform for educational institutions and presentations. Presenters create interactive sessions and post questions; audience members join anonymously via short join codes and respond in real-time. Results stream live to the presenter with visualizations including bar charts, word clouds, and histograms.

- **Comparable products:** Kahoot, Mentimeter, Slido
- **License:** AGPL-3.0

---

## 2. Technology Stack

### Runtime & Frameworks

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend runtime | Node.js (Alpine Docker) | 24 |
| Backend framework | Express | ^5.1.0 |
| Frontend library | React | ^19.0.0 |
| Frontend build | Vite | ^6.0.7 |
| Frontend routing | react-router-dom | ^6.28.1 |
| Database | MySQL | 8.0 |
| Database driver | mysql2 | ^3.12.0 |

### Real-Time Communication

| Package | Version | Purpose |
|---------|---------|---------|
| socket.io | ^4.8.1 | WebSocket server |
| socket.io-client | ^4.8.1 | WebSocket client |

### Authentication & Security

| Package | Version | Purpose |
|---------|---------|---------|
| jsonwebtoken | ^9.0.2 | JWT token signing and verification |
| bcrypt | ^5.1.1 | Password hashing (10 salt rounds) |
| helmet | ^8.0.0 | Security headers (CSP, HSTS, etc.) |
| express-rate-limit | ^7.5.0 | Request rate limiting |
| cors | ^2.8.5 | Cross-origin resource sharing |

### Frontend Libraries

| Package | Version | Purpose |
|---------|---------|---------|
| recharts | ^2.15.0 | Bar charts for answer distributions and histograms |
| @visx/wordcloud | ^3.3.0 | Word cloud visualization for short answers |
| @visx/text | ^3.3.0 | SVG text rendering for word clouds |
| @visx/scale | ^3.5.0 | Logarithmic font scaling for word clouds |
| qrcode.react | ^4.2.0 | QR code generation for session sharing |
| lucide-react | ^0.563.0 | Icon library (Pencil, Trash2) |
| axios | ^1.7.9 | HTTP client with interceptors |

### Infrastructure

| Technology | Purpose |
|-----------|---------|
| Docker Compose | Container orchestration (3 services) |
| nginx (Alpine) | Reverse proxy, SPA routing, WebSocket upgrade |
| Multi-stage Docker builds | Frontend: build with Node, serve with nginx |

### Development Tools

| Package | Version | Purpose |
|---------|---------|---------|
| nodemon | ^3.1.9 | Backend hot-reload |
| @vitejs/plugin-react | ^4.3.4 | React fast refresh for Vite |
| jest | ^29.7.0 | Backend test framework |
| eslint | ^9.17.0 | Frontend linting |
| dotenv | ^16.4.7 | Environment variable loading |
| express-validator | ^7.2.1 | Listed as dependency (unused in source) |

---

## 3. User Roles & Personas

### Admin
- Full presenter capabilities plus user management
- Can view and manage all sessions across all presenters
- Can create, edit, and delete user accounts
- Can reset user passwords
- Can filter sessions by presenter, status, and search term

### Presenter
- Creates and manages their own sessions
- Creates questions of four types within sessions
- Presents questions to audience with real-time response streaming
- Views response analytics (bar charts, word clouds, histograms, stats)
- Shares sessions via QR code, link, or join code
- Opens and closes questions with 5-second countdowns
- Closes and reopens sessions

### Audience Member (Anonymous)
- Joins sessions via 4-character join code (no account required)
- Provides only a display name (max 50 characters)
- Answers questions presented by the presenter
- One response per question enforced at database level
- Experiences 5-second transition countdown before new questions appear
- Auto-submit triggered when question closing countdown reaches 2 seconds
- Token stored in sessionStorage (lost when tab closes)

---

## 4. Functional Requirements

### 4.1 Authentication & Account Management

#### Registration (POST /api/auth/register)
- Public endpoint; creates presenter-role accounts only
- Requires email (validated against `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) and password (minimum 8 characters)
- First name and last name optional, trimmed and capped at 100 characters
- Passwords hashed with bcrypt (10 salt rounds)
- Duplicate email returns 409

#### Login (POST /api/auth/login)
- Returns JWT token + user object
- JWT payload: `{ id, role, email, tokenVersion }`
- Token expiration: configurable, default 24 hours
- Only presenter and admin roles may log in; audience members directed to `/go/:code`
- JWT secret must be at least 32 characters; app exits on startup if missing or too short

#### Token Versioning
- `token_version` column on users table (INT, default 1)
- Included in JWT payload as `tokenVersion`
- Validated on every authenticated request (HTTP middleware and WebSocket auth)
- Incremented on: password change, password reset, role change
- Mismatch returns 403 "Token has been invalidated"

#### Profile Management
- GET /api/auth/profile: returns user details
- PUT /api/auth/profile: update email, first name, last name (email uniqueness enforced)
- POST /api/auth/change-password: requires current password verification, new password minimum 6 characters, increments token_version

#### Frontend Auth Flow
- Token stored in localStorage
- On app mount: validates token via GET /api/auth/profile
- Axios interceptor attaches Bearer token to all requests
- 401 response triggers automatic logout (clear localStorage, redirect to /login)

### 4.2 Admin Functions

#### User Management
- GET /api/admin/users: list all users with session counts
- POST /api/admin/users: create user with any role (minimum 6 character password)
- PUT /api/admin/users/:userId: update user fields; role change increments token_version; cannot change own role
- POST /api/admin/users/:userId/reset-password: set new password (minimum 6 characters), increments token_version
- DELETE /api/admin/users/:userId: delete user (cascades to all sessions, questions, responses); cannot delete self

#### Session Overview
- GET /api/admin/sessions: view all sessions across all presenters
- Filterable by: presenterId, status (open/closed), search (title LIKE match)
- Includes question count and participant count per session

### 4.3 Session Management

#### Session CRUD
- POST /api/sessions: create session with title (required) and description (optional); auto-generates unique 4-character join code
- GET /api/sessions/my-sessions: list own sessions with question and participant counts; optional `active=true` filter
- GET /api/sessions/:sessionId: full session details with questions (including response counts) and participant count; ownership check (own sessions + admin access)
- PUT /api/sessions/:sessionId: update title, description, isActive; closing emits session-closed to audience and invalidates anonymous token cache; reopening emits session-reopened

#### Join Code Generation
- Pattern: letter-digit-letter-digit (e.g., "a2b3")
- Letters: abcdefghjkmnpqrstuvwxyz (excludes l, i, o for readability)
- Digits: 23456789 (excludes 0, 1 for readability)
- Up to 10 retry attempts for uniqueness

#### Question Selection (Presenting)
- PUT /api/sessions/:sessionId/select-question: set which question is shown to audience
- Selecting a closed question auto-reopens it
- Selecting null deselects the current question
- Triggers 5-second transition countdown for audience before question is shown
- Re-selecting the same question during transition cancels the transition

### 4.4 Question Management

#### Question Types
1. **Multiple Choice** (`multiple_choice`): Array of option strings; displayed with letter labels (A, B, C...)
2. **True/False** (`true_false`): Two buttons side by side
3. **Short Answer** (`short_answer`): Freeform text area (3 rows)
4. **Numeric** (`numeric`): Number input field

#### Question CRUD
- POST /api/questions: create question in a session (session must be active); stores options as JSON
- PUT /api/questions/:questionId: update question fields
- DELETE /api/questions/:questionId: delete question and cascade responses
- All operations enforce session ownership (own sessions + admin)

#### Question Lifecycle
- **Close** (PUT /api/questions/:questionId/close): initiates 5-second closing countdown; after countdown, DB marks question inactive with closed_at timestamp
- **Cancel Close** (PUT /api/questions/:questionId/cancel-close): cancels active closing countdown
- **Reopen** (PUT /api/questions/:questionId/reopen): sets is_active=true, clears closed_at

### 4.5 Audience Participation

#### Session Discovery (GET /api/anonymous/session/:code)
- Looks up session by join code (case-insensitive)
- Returns session info, presenter name, selected question (if any and active), participant count
- Rate limited to 20 requests per 15 minutes

#### Joining (POST /api/anonymous/join)
- Requires joinCode and displayName (max 50 characters, trimmed)
- Generates 64-character hex anonymous token (crypto.randomBytes(32))
- Rate limited to 10 requests per 15 minutes
- Token stored in sessionStorage keyed by join code

#### Responding (POST /api/anonymous/response)
- Requires X-Anonymous-Token header
- Validates: question exists, question is active, question belongs to participant's session, question is currently selected
- Answer text limited to 1000 characters
- Duplicate response returns 409 (enforced by DB unique constraint)
- Fire-and-forget update to participant last_active_at
- Response streamed to presenter via WebSocket

#### Response Retrieval
- GET /api/anonymous/my-response/:questionId: check if participant already responded to a question

### 4.6 Response Analytics

#### Response List (GET /api/responses/question/:questionId)
- Returns all responses with display names and timestamps
- Ordered by created_at ascending

#### Response Statistics (GET /api/responses/question/:questionId/stats)
- Total response count, average response time
- **Multiple choice / True-false**: answer distribution (grouped by answer_text, sorted by count descending)
- **Numeric**: statistical summary (mean, median, min, max, range) plus histogram with dynamic bin count (sqrt of values count, minimum 1, maximum 10)

### 4.7 Real-Time Communication (WebSocket)

#### Architecture
- Two Socket.io namespaces: main (JWT-authenticated) and `/anonymous` (anonymous token)
- Session-based rooms: `session-${sessionId}`
- Presenter/admin clients join rooms explicitly via `join-session` event (with ownership verification)
- Anonymous clients auto-join their session room on connection

#### Main Namespace Events

| Direction | Event | Payload | Recipients |
|-----------|-------|---------|------------|
| Client->Server | `join-session` | sessionId | -- |
| Client->Server | `leave-session` | sessionId | -- |
| Server->Client | `user-joined` | `{ role }` | Room peers |
| Server->Client | `user-left` | `{ userId }` | Room peers |
| Server->Client | `new-question` | question object | Room |
| Server->Client | `question-updated` | `{ questionId, updates }` | Room |
| Server->Client | `question-selected` | `{ sessionId, questionId, question }` | Room |
| Server->Client | `new-response` | response object | Presenter/admin only |
| Server->Client | `new-anonymous-response` | response object | Presenter/admin only |
| Server->Client | `anonymous-participant-count` | `{ count }` | Presenter/admin only |
| Server->Client | `question-closing` | `{ questionId, countdown: 5 }` | Room |
| Server->Client | `question-closed` | `{ questionId }` | Room |
| Server->Client | `question-close-cancelled` | `{ questionId }` | Room |
| Server->Client | `question-reopened` | `{ questionId }` | Room |
| Server->Client | `session-updated` | `{ sessionId, updates }` | Room |
| Server->Client | `session-reopened` | `{ sessionId }` | Room |

#### Anonymous Namespace Events

| Direction | Event | Payload | Recipients |
|-----------|-------|---------|------------|
| Server->Client | `question-transition-start` | `{ questionId, question, countdown: 5 }` | Room |
| Server->Client | `question-changed` | `{ questionId, question }` | Room |
| Server->Client | `transition-cancelled` | `{ questionId }` | Room |
| Server->Client | `question-deselected` | `{}` | Room |
| Server->Client | `question-closing` | `{ questionId, countdown: 5 }` | Room |
| Server->Client | `question-closed` | `{ questionId }` | Room |
| Server->Client | `question-close-cancelled` | `{ questionId }` | Room |
| Server->Client | `question-reopened` | `{ questionId }` | Room |
| Server->Client | `session-closed` | `{}` | Room |
| Server->Client | `session-reopened` | `{ sessionId }` | Room |

#### Countdown Mechanics
- **Question Transition**: 5-second countdown before new question appears to audience. Presenter sees question immediately; audience sees countdown, then question.
- **Question Closing**: 5-second countdown before question closes. Both presenter and audience see countdown. Audience auto-submits at 2 seconds remaining if they have an unsaved answer. After 5 seconds, DB marks question inactive.
- Both countdowns can be cancelled.

---

## 5. Non-Functional Requirements

### 5.1 Security

#### Content Security Policy (Helmet)
- `default-src`: 'self'
- `script-src`: 'self'
- `style-src`: 'self', 'unsafe-inline'
- `img-src`: 'self', data:, https://www.gravatar.com
- `connect-src`: 'self', ws:, wss:
- `crossOriginEmbedderPolicy`: disabled (for QR code rendering)

#### Rate Limiting (4 tiers)
| Scope | Window | Max Requests | Applied To |
|-------|--------|-------------|------------|
| General | 15 min | 100 | All routes |
| Auth | 15 min | 10 | /api/auth/* |
| Anonymous Join | 15 min | 10 | POST /api/anonymous/join |
| Code Lookup | 15 min | 20 | GET /api/anonymous/session/:code |

All limiters use `standardHeaders: true` and `legacyHeaders: false`.

#### Access Control
- Role-based middleware: `requireRole('presenter', 'admin')` on session/question/response management routes
- Admin-only middleware on /api/admin/* routes
- IDOR protection: session and question endpoints verify ownership (own resources + admin bypass)
- WebSocket `join-session` verifies session ownership before allowing room join
- Anonymous auth via `X-Anonymous-Token` header with server-side token validation

#### Token Security
- JWT secret minimum 32 characters (enforced at startup with process.exit)
- Token versioning for immediate invalidation on password/role change
- Anonymous tokens: 64 hex characters (crypto.randomBytes(32))
- Anonymous token cache with 30-second TTL and 60-second cleanup interval

#### CSRF Protection
- Not required: authentication uses Bearer tokens (Authorization header) and custom X-Anonymous-Token headers, which browsers do not auto-attach on cross-origin requests

#### Input Validation
- Email regex on registration
- Password minimum 8 characters on registration
- Display name max 50 characters
- Answer text max 1000 characters
- First/last name trimmed and capped at 100 characters

### 5.2 Performance

- MySQL connection pool: configurable, default 50 connections
- Connection keep-alive enabled with 0ms initial delay
- Anonymous token cache: in-memory Map with 30-second TTL to reduce DB lookups
- Fire-and-forget pattern for non-critical updates (e.g., participant last_active_at)
- Frontend incremental stat updates via WebSocket (avoids re-fetching after each response, except numeric questions which re-fetch for histogram accuracy)
- Socket.io reconnection: 5 attempts, 1-5 second delay range

### 5.3 Deployment

- Docker Compose with 3 services on a bridge network
- MySQL port not exposed to host (internal only)
- Backend uses `expose` (not `ports`) -- only accessible within Docker network
- Frontend is the only host-accessible service (port 7011)
- nginx reverse proxy handles API and WebSocket proxying
- nginx envsubst templates for dynamic port configuration
- MySQL health check (mysqladmin ping, 20s timeout, 10 retries)
- Backend depends on MySQL health check passing
- Backend source directory bind-mounted for development hot-reload
- Schema auto-loaded via docker-entrypoint-initdb.d on first MySQL start
- All services restart unless-stopped

### 5.4 PWA

- Service worker with cache-first strategy
- Cache name: `pollica-v1`
- Web app manifest with standalone display mode
- Theme color: #2563eb
- Portrait-primary orientation
- iOS meta tags: apple-mobile-web-app-capable, black-translucent status bar
- iOS splash screens for 6 device sizes
- App icons: 192x192 (any + maskable), 512x512 (any + maskable), 180x180 apple-touch-icon

---

## 6. Database Schema

### Table: users

| Column | Type | Constraints |
|--------|------|-------------|
| id | INT | AUTO_INCREMENT, PRIMARY KEY |
| email | VARCHAR(255) | NOT NULL, UNIQUE |
| password_hash | VARCHAR(255) | NOT NULL |
| role | ENUM('presenter', 'admin') | NOT NULL |
| first_name | VARCHAR(100) | Nullable |
| last_name | VARCHAR(100) | Nullable |
| token_version | INT | NOT NULL, DEFAULT 1 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP |

Indexes: `idx_email(email)`, `idx_role(role)`

### Table: sessions

| Column | Type | Constraints |
|--------|------|-------------|
| id | INT | AUTO_INCREMENT, PRIMARY KEY |
| presenter_id | INT | NOT NULL, FK -> users(id) ON DELETE CASCADE |
| title | VARCHAR(255) | NOT NULL |
| description | TEXT | Nullable |
| is_active | BOOLEAN | DEFAULT TRUE |
| join_code | VARCHAR(4) | UNIQUE |
| selected_question_id | INT | NULL, FK -> questions(id) ON DELETE SET NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| closed_at | TIMESTAMP | NULL |

Indexes: `idx_presenter_id(presenter_id)`, `idx_active(is_active)`, `idx_join_code(join_code)`

### Table: questions

| Column | Type | Constraints |
|--------|------|-------------|
| id | INT | AUTO_INCREMENT, PRIMARY KEY |
| session_id | INT | NOT NULL, FK -> sessions(id) ON DELETE CASCADE |
| presenter_id | INT | NOT NULL, FK -> users(id) ON DELETE CASCADE |
| question_text | TEXT | NOT NULL |
| question_type | ENUM('multiple_choice', 'true_false', 'short_answer', 'numeric') | NOT NULL |
| options | JSON | Nullable |
| correct_answer | VARCHAR(255) | Nullable |
| time_limit | INT | Nullable (seconds) |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| closed_at | TIMESTAMP | NULL |

Indexes: `idx_session_id(session_id)`, `idx_presenter_id(presenter_id)`, `idx_active(is_active)`

### Table: anonymous_participants

| Column | Type | Constraints |
|--------|------|-------------|
| id | INT | AUTO_INCREMENT, PRIMARY KEY |
| session_id | INT | NOT NULL, FK -> sessions(id) ON DELETE CASCADE |
| anonymous_token | VARCHAR(64) | NOT NULL, UNIQUE |
| display_name | VARCHAR(50) | NOT NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| last_active_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP |

Indexes: `idx_session_id(session_id)`, `idx_anonymous_token(anonymous_token)`

### Table: anonymous_responses

| Column | Type | Constraints |
|--------|------|-------------|
| id | INT | AUTO_INCREMENT, PRIMARY KEY |
| question_id | INT | NOT NULL, FK -> questions(id) ON DELETE CASCADE |
| anonymous_participant_id | INT | NOT NULL, FK -> anonymous_participants(id) ON DELETE CASCADE |
| answer_text | TEXT | NOT NULL |
| response_time | INT | Nullable |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

UNIQUE KEY: `unique_anonymous_response(question_id, anonymous_participant_id)`
Index: `idx_question_id(question_id)`

### Schema Notes
- All tables: ENGINE=InnoDB, CHARSET=utf8mb4, COLLATE=utf8mb4_unicode_ci
- All foreign keys use ON DELETE CASCADE except `selected_question_id` which uses ON DELETE SET NULL
- `selected_question_id` FK added via ALTER TABLE after questions table creation (circular dependency)
- Seed data: two demo users (admin@polli.ca and presenter@polli.ca) with bcrypt hash of 'password123'

---

## 7. API Specification

### Authentication Routes (mounted at /api/auth, rate limited: 10 req/15min)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | None | Register new presenter account |
| POST | /api/auth/login | None | Login and receive JWT |
| GET | /api/auth/profile | JWT | Get current user profile |
| PUT | /api/auth/profile | JWT | Update profile (email, name) |
| POST | /api/auth/change-password | JWT | Change password |

### Session Routes (mounted at /api/sessions)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/sessions | JWT + presenter/admin | Create session |
| GET | /api/sessions/my-sessions | JWT + presenter/admin | List own sessions |
| GET | /api/sessions/active | JWT | List all active sessions |
| GET | /api/sessions/:sessionId | JWT | Get session details (ownership check) |
| PUT | /api/sessions/:sessionId | JWT + presenter/admin | Update session (ownership check) |
| PUT | /api/sessions/:sessionId/select-question | JWT + presenter/admin | Present/deselect question (ownership check) |

### Question Routes (mounted at /api/questions)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/questions | JWT + presenter/admin | Create question |
| GET | /api/questions | JWT | List questions by sessionId (ownership check) |
| GET | /api/questions/active | JWT | List active questions by sessionId (ownership check) |
| GET | /api/questions/:questionId | JWT | Get question details (ownership check) |
| PUT | /api/questions/:questionId | JWT + presenter/admin | Update question (ownership check) |
| DELETE | /api/questions/:questionId | JWT + presenter/admin | Delete question (ownership check) |
| PUT | /api/questions/:questionId/close | JWT + presenter/admin | Initiate question close countdown |
| PUT | /api/questions/:questionId/cancel-close | JWT + presenter/admin | Cancel close countdown |
| PUT | /api/questions/:questionId/reopen | JWT + presenter/admin | Reopen closed question |

### Response Routes (mounted at /api/responses)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/responses/question/:questionId | JWT + presenter/admin | Get all responses |
| GET | /api/responses/question/:questionId/stats | JWT + presenter/admin | Get response statistics |

### Anonymous Routes (mounted at /api/anonymous)

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| GET | /api/anonymous/session/:code | None | 20/15min | Look up session by join code |
| POST | /api/anonymous/join | None | 10/15min | Join session anonymously |
| POST | /api/anonymous/response | X-Anonymous-Token | General only | Submit response |
| GET | /api/anonymous/my-response/:questionId | X-Anonymous-Token | General only | Check if responded |

### Admin Routes (mounted at /api/admin, all require JWT + admin role)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/admin/users | List all users with session counts |
| POST | /api/admin/users | Create user (any role) |
| PUT | /api/admin/users/:userId | Update user |
| POST | /api/admin/users/:userId/reset-password | Reset user password |
| DELETE | /api/admin/users/:userId | Delete user |
| GET | /api/admin/sessions | List all sessions with filters |

### Health Check

| Method | Path | Auth | Response |
|--------|------|------|----------|
| GET | /health | None | `{ status: 'OK', timestamp: ISO string }` |

---

## 8. Frontend Routes

| Path | Component | Auth Guard | Description |
|------|-----------|-----------|-------------|
| / | Redirect | None | Redirects to /presenter/dashboard if logged in, /login otherwise |
| /login | Login | Redirect if logged in | Presenter/admin login form |
| /presenter/dashboard | PresenterDashboard | presenter or admin | Session list and management |
| /presenter/session/:sessionId | PresenterSession | presenter or admin | Session detail with questions and analytics |
| /admin/users | AdminUsers | admin only | User management |
| /go/:code | AudiencePage | None (public) | Anonymous audience participation |
| * | Redirect to / | None | 404 catch-all |

---

## 9. Environment Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| JWT_SECRET | Yes | -- | JWT signing secret (min 32 chars) |
| MYSQL_ROOT_PASSWORD | Yes | -- | MySQL root password |
| NODE_ENV | No | production | Node.js environment |
| FRONTEND_PORT | No | 7011 | Frontend host and container port |
| BACKEND_PORT | No | 7012 | Backend container port (internal only) |
| DB_HOST | No | mysql | Database hostname |
| DB_PORT | No | 3306 | Database port |
| DB_USER | No | root | Database user |
| DB_NAME | No | pollica | Database name |
| DB_CONNECTION_LIMIT | No | 50 | MySQL connection pool size |
| JWT_EXPIRES_IN | No | 24h | JWT token expiration |
| CORS_ORIGIN | No | http://localhost:7011 | Allowed CORS origin |
| VITE_API_URL | No | http://localhost:7011/api | API URL (baked into frontend at build time) |
| VITE_SOCKET_URL | No | http://localhost:7011 | Socket.io URL (baked into frontend at build time) |

---

## 10. UI/UX Specifications

### Color Palette

| Role | Hex | Usage |
|------|-----|-------|
| Primary | #667eea | Buttons, focus rings, chart fills, countdowns, pulse animations |
| Primary hover | #5a67d8 | Button hover state |
| Gradient end | #764ba2 | Navbar gradient, word cloud |
| Success | #10b981 | Active badges, presented border, checkmark |
| Danger | #ef4444 / #dc2626 | Error states, closing countdown, delete actions |
| Warning | #f59e0b | Warning buttons |
| Theme | #2563eb | PWA theme color, icon backgrounds |

### Responsive Design
- Single breakpoint at 768px
- Above 768px: multi-column grids, side-by-side layouts
- Below 768px: single column, stacked layouts, larger touch targets (44px minimum), 16px font inputs (prevents iOS zoom)
- iOS safe area insets respected via `env(safe-area-inset-*)`

### Animations
- Pulse ring: 2s infinite (waiting state)
- Countdown pop: 1s ease-out (number scaling in)
- Checkmark pop: 0.5s ease-out (submission confirmation)
- Loading spinner: 1s linear infinite rotation
- Countdown pulse: 1s infinite (closing countdown)
- Card press: scale(0.98) on mobile :active

### Audience State Machine
States: `loading` -> `name-entry` -> `waiting` -> `transition` -> `answering` -> `submitted` -> `question-closing` -> `question-closed` (plus `error`, `closed` for terminal states)

Transitions driven by WebSocket events and user actions.
