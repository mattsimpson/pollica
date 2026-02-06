# Pollica: Detailed Technical Prompt

> Use this prompt to instruct an AI coding assistant to build the Pollica application with knowledge of the technology stack and architecture, but freedom to make implementation decisions.

---

## System Context

You are building **Pollica**, a real-time audience response platform (like Kahoot/Mentimeter) for educational presentations.

- **License:** AGPL-3.0

The system has three user types:
- **Admin** -- full access including user management
- **Presenter** -- creates sessions, posts questions, views real-time analytics
- **Audience** -- joins anonymously via 4-character codes, answers questions in real-time

---

## Architecture

Three-tier containerized stack:

```
[Browser] <-> [nginx :7011] <-> [Node.js/Express :7012] <-> [MySQL :3306]
                                  + Socket.io
```

- **Frontend**: React SPA served by nginx, which reverse-proxies `/api` and `/socket.io` to the backend
- **Backend**: Node.js/Express REST API + Socket.io WebSocket server
- **Database**: MySQL 8.0 (internal to Docker network only, not exposed to host)
- Only the frontend nginx port is exposed to the host
- All three services run in Docker Compose on a shared bridge network

---

## Technology Stack

### Backend
- **Runtime**: Node.js 24 (Alpine Docker image)
- **Framework**: Express 5
- **Database**: MySQL 8.0 with mysql2 promise driver
- **Real-time**: Socket.io 4
- **Authentication**: jsonwebtoken (JWT) + bcrypt for password hashing
- **Security**: helmet (CSP, security headers) + express-rate-limit
- **CORS**: cors package
- **Environment**: dotenv

### Frontend
- **Library**: React 19
- **Build Tool**: Vite 6 with React plugin
- **Routing**: React Router 6
- **HTTP Client**: axios
- **Real-time**: socket.io-client
- **Charts**: recharts (bar charts, histograms)
- **Word Cloud**: @visx/wordcloud + @visx/text + @visx/scale
- **QR Codes**: qrcode.react
- **Icons**: lucide-react

### Infrastructure
- **Orchestration**: Docker Compose (3 services: mysql, backend, frontend)
- **Reverse Proxy**: nginx (Alpine) with envsubst-based config templates
- **Frontend Build**: Multi-stage Docker build (Node for build, nginx for serve)
- **PWA**: Service worker + web app manifest

---

## Database Design

Five tables with these relationships:

- **users** -- Authenticated users (presenters and admins). Has email, password hash, role (enum: presenter/admin), first/last name, and a `token_version` integer for JWT invalidation.
- **sessions** -- Created by presenters. Has title, description, active status, a unique 4-character join code, a reference to the currently-selected question, and timestamps for creation and closing.
- **questions** -- Belong to sessions. Four types: multiple_choice, true_false, short_answer, numeric. Has question text, JSON options field, optional correct answer, optional time limit, active status, and close timestamp.
- **anonymous_participants** -- Audience members who join sessions. Has a unique 64-character anonymous token, display name (max 50 chars), and activity timestamps.
- **anonymous_responses** -- Answers from audience members. Has answer text, optional response time. A unique constraint on (question_id, anonymous_participant_id) enforces one response per participant per question.

All tables use InnoDB with utf8mb4. Foreign keys cascade on delete, except the selected_question reference on sessions which sets null on delete.

---

## Authentication & Authorization

### Presenter/Admin Authentication
- JWT-based authentication with tokens stored in localStorage
- JWT payload includes user id, role, email, and a `tokenVersion` field
- Every authenticated request validates the JWT's `tokenVersion` against the database -- if the user's `token_version` has been incremented (due to password change, password reset, or role change), the token is rejected
- Registration is public but only creates presenter accounts; admin accounts are created by other admins
- Password hashing uses bcrypt with 10 salt rounds
- The JWT secret must be at least 32 characters; the app refuses to start otherwise

### Anonymous Authentication
- Audience members receive a random 64-character hex token upon joining a session
- This token is sent via an `X-Anonymous-Token` custom header (not a Bearer token)
- An in-memory cache with 30-second TTL reduces database lookups for token validation
- Anonymous tokens are stored in the browser's sessionStorage (not localStorage), so closing the tab requires rejoining

### Role-Based Access Control
- **Admin**: can access everything including user management and all sessions across all presenters
- **Presenter**: can manage their own sessions, questions, and view their own response analytics
- Ownership checks on session/question/response endpoints: the resource must belong to the requesting user unless they are an admin

---

## Rate Limiting

Four tiers of rate limiting:
- **General**: 100 requests per 15 minutes on all routes
- **Auth**: 10 requests per 15 minutes on login/register endpoints
- **Anonymous Join**: 10 requests per 15 minutes on the session join endpoint
- **Code Lookup**: 20 requests per 15 minutes on the session-by-code lookup endpoint

---

## Security Headers

Helmet configured with Content Security Policy:
- Scripts and defaults restricted to same-origin
- Styles allow inline (for dynamic styling)
- Images allow same-origin, data URIs, and Gravatar
- WebSocket connections allowed via ws: and wss:
- Cross-origin embedder policy disabled (for QR code rendering)

CSRF protection is not needed because authentication uses Bearer tokens and custom headers, which browsers do not auto-attach on cross-origin requests.

---

## API Design

### Auth Endpoints (`/api/auth`)
- Register (public, creates presenter accounts only)
- Login (returns JWT + user object)
- Get profile (authenticated)
- Update profile (authenticated)
- Change password (authenticated, invalidates existing tokens)

### Session Endpoints (`/api/sessions`)
- Create session (generates unique 4-char join code)
- List own sessions (with question and participant counts)
- Get session detail (with questions and analytics, ownership checked)
- Update session (close/reopen, ownership checked)
- Select/deselect question for presentation (ownership checked)

### Question Endpoints (`/api/questions`)
- CRUD operations on questions within sessions
- Close question (initiates 5-second countdown)
- Cancel close (cancels active countdown)
- Reopen question

### Response Endpoints (`/api/responses`)
- Get all responses for a question (presenter/admin only)
- Get response statistics including answer distribution, and for numeric questions: mean, median, min, max, and a histogram

### Anonymous Endpoints (`/api/anonymous`)
- Look up session by join code (case-insensitive)
- Join session with display name (returns anonymous token)
- Submit response to a question (validates question is active and currently presented)
- Check if already responded to a question

### Admin Endpoints (`/api/admin`)
- Full user CRUD (create with any role, edit, delete, reset password)
- View all sessions across all presenters with filtering (by presenter, status, search)

---

## Real-Time Communication (WebSocket)

### Architecture
- Two Socket.io namespaces: the main namespace (JWT-authenticated presenters/admins) and `/anonymous` (anonymous token-authenticated audience)
- Session-based rooms (`session-{id}`): presenters join explicitly, audience auto-joins on connection
- Presenters must own the session (or be admin) to join a room

### Question Presentation Flow
1. Presenter selects a question to present
2. Presenter immediately sees the question selected in their UI
3. Audience receives a 5-second transition countdown ("Next question in 5, 4, 3...")
4. After countdown, the question appears for the audience to answer
5. If the presenter re-selects the same question during the countdown, the transition is cancelled

### Question Closing Flow
1. Presenter initiates question close
2. Both presenter and audience see a 5-second closing countdown
3. At 2 seconds remaining, the audience's unsaved answer is auto-submitted
4. After 5 seconds, the question is marked as closed in the database
5. The presenter can cancel the close during the countdown

### Real-Time Events
- Response streaming: when audience members submit answers, responses stream to the presenter in real-time (only to presenter/admin, not to other audience members)
- Participant count: live count of connected anonymous participants, visible to presenter only
- Session lifecycle: session close/reopen events notify audience members
- Question lifecycle: question close, reopen, and selection changes push to all relevant clients

---

## Frontend Pages

### Login Page
- Simple email/password login form
- On successful login, stores JWT in localStorage and redirects to dashboard
- No public registration form in the UI (accounts created via admin panel or API)

### Presenter Dashboard
- Shows the user's sessions in a card grid
- Each card shows: title, active/closed status badge, description excerpt, question count, participant count, creation date
- "Create New Session" button opens a modal with title and description fields
- **Admin view**: shows all sessions across all presenters with filter bar (search by title, filter by presenter, filter by status)

### Presenter Session Detail
- Two-column layout: questions list on the left, response analytics on the right
- **Questions list**: each question card has controls to edit, delete, present/stop presenting, close/cancel-close/reopen
- **Analytics panel**: shows stats (total responses, correct, incorrect, avg response time) and a visualization that varies by question type:
  - Multiple choice / True-false: bar chart of answer distribution
  - Short answer: interactive word cloud with hover tooltips
  - Numeric: summary statistics (mean, median, min, max) plus a histogram
- Below the chart: scrollable list of recent individual responses
- **Share modal**: QR code, join URL, join code displayed prominently, participant count, copy-to-clipboard button
- **Create/Edit question modal**: question text, type selector (MC/TF/short answer/numeric), options editor (for MC), correct answer, time limit

### Audience Page (`/go/:code`)
- State-machine driven UI that progresses through stages:
  - **Loading**: spinner while fetching session data
  - **Name entry**: session title, presenter name, display name input (max 50 chars), join button
  - **Waiting**: welcome message with pulsing animation, "Waiting for the next question..."
  - **Transition**: large countdown number with "Get ready!" message
  - **Answering**: question with type-appropriate input (MC buttons with letter labels, T/F side-by-side buttons, text area, number input)
  - **Submitted**: green checkmark with confirmation message
  - **Question closing**: overlay with red countdown, disabled inputs if already answered
  - **Question closed**: shows the user's locked answer or "No response recorded"
  - **Session closed**: "Session Ended" message
  - **Error**: error message with "Go Home" button
- All transitions between stages are driven by WebSocket events
- Supports reconnection: if the user already has a token in sessionStorage, they rejoin without re-entering their name

### Admin Users Page
- Table of all users with columns: name, email, role (badge), session count, created date, action buttons
- CRUD modals: add user (with role selector), edit user, reset password, delete confirmation (with session count warning)

### Navbar
- Gradient background (primary color to purple)
- Left: "Pollica" brand link
- Right: Dashboard link, Users link (admin only), Gravatar-based profile avatar dropdown
- Profile dropdown: opens a modal with profile edit form and password change form
- Gravatar URL generated using an inline MD5 implementation (no external dependency)
- Hidden on audience pages (`/go/*`)

---

## Styling

- Custom CSS (no CSS framework) with a consistent design system
- Primary color: #667eea (indigo/purple), used for buttons, focus states, charts, and animations
- Navbar gradient: #667eea to #764ba2
- Success indicators: #10b981 (green)
- Error/danger: #ef4444 (red)
- Card-based layouts with subtle box shadows
- Single responsive breakpoint at 768px: below this, grids collapse to single column, touch targets increase to 44px minimum, input fonts increase to 16px (prevents iOS auto-zoom)
- iOS-specific: safe area insets, momentum scrolling, splash screens for 6 device sizes
- Animations: pulse ring (waiting state), countdown pop (transition), checkmark pop (submission), spinner (loading), countdown pulse (closing)

---

## PWA Support

- Web app manifest: standalone display mode, portrait orientation, theme color #2563eb
- Service worker: cache-first strategy for app shell
- iOS meta tags: apple-mobile-web-app-capable, black-translucent status bar
- App icons: 192x192 and 512x512 (both standard and maskable), 180x180 apple touch icon
- Splash screens for major iOS device sizes

---

## Docker & Deployment

### Services
- **mysql**: MySQL 8.0, named volume for data persistence, schema auto-loaded via docker-entrypoint-initdb.d, health check via mysqladmin ping
- **backend**: Node.js 24 Alpine, runs as non-root user, only exposed within Docker network (not to host), depends on MySQL health check
- **frontend**: Multi-stage build (Node for Vite build, nginx for serving), only service with host port mapping, nginx handles SPA routing and reverse proxy to backend

### Networking
- All services share a bridge network
- nginx proxies `/api` and `/socket.io` to the backend service by Docker hostname
- WebSocket upgrade headers configured in nginx for Socket.io
- nginx uses envsubst templates for dynamic port configuration

### Environment
- Three required variables: `JWT_SECRET` (min 32 chars), `MYSQL_ROOT_PASSWORD` (Docker initialization), and `DB_PASS` (application database user password)
- All other variables have sensible defaults
- Frontend API/Socket URLs are baked in at Docker build time via Vite build args

---

## Join Code Format

The 4-character join code follows the pattern: letter-digit-letter-digit (e.g., "a2b3"). Ambiguous characters are excluded for readability:
- Letters exclude: l, i, o
- Digits exclude: 0, 1

Codes are case-insensitive for lookup. Up to 10 generation attempts for uniqueness.
