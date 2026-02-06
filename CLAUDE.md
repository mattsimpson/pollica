# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pollica is a real-time audience response platform (similar to Kahoot/Mentimeter) for educational institutions and presentations. Presenters create interactive sessions and post questions; audience members join anonymously via join codes and respond in real-time. The system uses JWT authentication for presenters, anonymous tokens for audience, WebSocket for real-time updates, and is containerized with Docker.

**Website:** https://polli.ca
**Repository:** https://github.com/mattsimpson/pollica
**License:** AGPL-3.0

## Architecture

**Three-tier stack:**
- **Backend** (Node.js/Express + Socket.io) - Port 7012
- **Frontend** (React PWA with Vite) - Port 7011
- **Database** (MySQL 8.0) - Port 3306

**Key architectural patterns:**
- RESTful API for CRUD operations
- WebSocket (Socket.io) for real-time bidirectional communication
- JWT tokens for presenter authentication
- Anonymous tokens for audience participation (no login required)
- Role-based access control (presenter and admin roles)

## Environment Setup

All configuration is in a single `.env` file in the project root:

```bash
# Copy example and configure
cp .env.example .env

# Required: Generate JWT secret and set password
openssl rand -base64 32  # Use output for JWT_SECRET
```

**Required variables:**
- `JWT_SECRET` - Must be at least 32 characters (app won't start without it)
- `MYSQL_ROOT_PASSWORD` - Database password

## Development Commands

### Docker (primary development method)

Start all services:
```bash
docker compose up -d
```

View logs:
```bash
docker compose logs -f
```

Rebuild after code changes:
```bash
docker compose up -d --build
```

Stop and remove volumes (database reset):
```bash
docker compose down -v
```

### Backend (manual development)

```bash
cd backend
npm install
npm start                    # Production mode
npm run dev                  # Development mode with nodemon
npm test                     # Run all tests
npm test -- --testNamePattern="auth"  # Run tests matching pattern
npm test -- path/to/test.js  # Run specific test file
```

### Frontend (manual development)

```bash
cd frontend
npm install
npm run dev                 # Development server (Vite)
npm run build               # Production build
npm test                    # Run tests in watch mode
npm test -- --watchAll=false # Run tests once (CI mode)
```

### Database

Initial schema is automatically loaded via `docker-entrypoint-initdb.d` when MySQL container starts. For manual setup:

```bash
mysql -u root -p pollica < database/schema.sql
```

## Code Structure

### Backend (`backend/src/`)

- `server.js` - Express app initialization, security middleware (helmet, rate limiting), Socket.io initialization
- `config/database.js` - MySQL connection pool with auto-retry
- `config/jwt.js` - JWT configuration (requires JWT_SECRET env var)
- `middleware/auth.js` - Authentication middleware (`authenticateToken`, `requireRole`, `anonymousAuth`)
- `controllers/` - Request handlers:
  - `authController.js` - Login, register (presenter only), profile management
  - `adminController.js` - User CRUD, password reset, all-sessions view
  - `sessionController.js` - Session CRUD, question selection
  - `questionController.js` - Question CRUD, close/reopen
  - `responseController.js` - Response stats and retrieval
  - `anonymousController.js` - Anonymous join and response submission
- `routes/` - Express route definitions (including `adminRoutes.js` for admin-only endpoints)
- `services/socketService.js` - Socket.io event handling and room management

**Key backend patterns:**
- Routes use `authenticateToken` and `requireRole('presenter', 'admin')` middleware
- Admin routes restricted to admin role only via `requireRole('admin')`
- Anonymous routes use token-based authentication via `anonymousAuth` middleware
- Socket.io has two namespaces: main (authenticated) and `/anonymous` (anonymous tokens)
- Controllers get socketService via `req.app.get('socketService')`

### Frontend (`frontend/src/`)

- `App.jsx` - Main routing, authentication state, service worker registration
- `main.jsx` - React entry point
- `services/api.js` - Axios instance with JWT interceptors for presenter API
- `services/anonymousApi.js` - API service for anonymous audience endpoints
- `services/socket.js` - Socket.io client wrapper for presenters
- `services/anonymousSocket.js` - Socket.io client for anonymous audience
- `components/` - Reusable React components (Login, Navbar, WordCloud)
- `pages/` - Route-specific page components:
  - `PresenterDashboard.jsx` - Session list (admin sees all with filters)
  - `PresenterSession.jsx` - Session management, questions, responses
  - `AudiencePage.jsx` - Anonymous audience participation
  - `AdminUsers.jsx` - User management (admin only)

**Key frontend patterns:**
- Token stored in localStorage, attached via axios interceptors
- Socket connection initialized with token from localStorage
- Presenter routes: `/presenter/dashboard`, `/presenter/session/:id` (admin can access)
- Admin routes: `/admin/users` (admin only)
- Audience route: `/go/:code` (anonymous, no login required)
- Real-time updates via Socket.io event listeners in useEffect

### Database Schema

Five main tables with foreign key relationships:
- `users` - Authenticated users with roles (`presenter` or `admin`)
- `sessions` - Created by presenters/admins, with 4-character join codes
- `questions` - Within sessions, types: multiple_choice, true_false, short_answer, numeric
- `anonymous_participants` - Audience members who join via join code
- `anonymous_responses` - Audience answers, unique constraint per participant/question

## WebSocket Architecture

**Session-based rooms:**
- Clients join/leave rooms: `session-${sessionId}`
- Presenters receive all events including individual responses
- Anonymous clients receive question events, closing events, session events

**Namespaces:**
- Main namespace: Authenticated presenters and admins (JWT)
- `/anonymous` namespace: Audience members (anonymous token)

**Events (server → client):**
- `question-selected` / `question-deselected` - Question presentation state
- `question-transition-start` / `question-changed` - 5-second countdown before question shows
- `question-closing` / `question-closed` - 5-second countdown before question closes
- `question-reopened` - Question reopened for responses
- `new-anonymous-response` - Sent to presenter/admin only
- `anonymous-participant-count` - Real-time participant count (presenter/admin only)
- `session-closed` - Session ended

**Events (client → server):**
- `join-session` - Join a session room
- `leave-session` - Leave a session room

## Authentication Flow

### Presenters
1. Login via `/api/auth/login`
2. Backend returns JWT token + user object
3. Frontend stores both in localStorage
4. Axios interceptor attaches token to all requests
5. Socket.io connects with token in auth handshake

### Audience Members
1. Visit `/go/:code` with session join code
2. Enter display name
3. POST to `/api/anonymous/join` returns anonymous token
4. Token stored in sessionStorage with join code
5. Anonymous socket connects to `/anonymous` namespace with token

## Important Implementation Notes

### Backend
- Database connection auto-retries every 5 seconds on failure (`config/database.js`)
- Response uniqueness enforced via DB constraint (one response per participant per question)
- Socket rooms cleaned up on disconnect (`services/socketService.js`)
- CORS configured for frontend origin (`server.js`)
- 5-second countdown on question selection and closing for smoother UX

### Frontend
- Vite-based build system (not Create React App)
- Service worker registered for PWA functionality (`App.jsx`)
- 401 responses trigger automatic logout and redirect (`services/api.js`)
- Socket connection reused if already connected
- AudiencePage handles all anonymous user states (loading, name-entry, waiting, answering, etc.)

## Testing

Demo accounts:
- **Admin:** `admin@polli.ca` / `password123`
- **Presenter:** `presenter@polli.ca` / `password123`

Audience members join via session link (e.g., `/go/a1b2`) - no login required.

Health check endpoint: `http://localhost:7012/health`

## Environment Configuration

All environment variables are configured in a single `.env` file in the project root. See `.env.example` for all options.

**Required (app won't start without these):**
- `JWT_SECRET` - At least 32 characters, generate with `openssl rand -base64 32`
- `MYSQL_ROOT_PASSWORD` - Database password

**Optional (have sensible defaults):**
- `BACKEND_PORT` - Backend port for host and container (default: 7012)
- `FRONTEND_PORT` - Frontend port for host and container (default: 7011)
- `CORS_ORIGIN` - Frontend URL (default: http://localhost:7011)
- `VITE_API_URL` - Frontend URL for API (default: http://localhost:7011/api)
- `VITE_SOCKET_URL` - Frontend URL for Socket.io (default: http://localhost:7011)

**Note:** Docker Compose reads from the root `.env` file automatically.

## Common Development Workflows

### Adding a new API endpoint
1. Create controller function in `backend/src/controllers/`
2. Add route in `backend/src/routes/`
3. Apply appropriate middleware (`authenticateToken`, `requireRole('presenter', 'admin')`)
4. Add corresponding method in `frontend/src/services/api.js`

### Adding a new WebSocket event
1. Add event handler in `backend/src/services/socketService.js`
2. Add emit method if needed (e.g., `emitQuestionSelected`)
3. Add listener in `frontend/src/services/socket.js` or `anonymousSocket.js`
4. Use listener in component via `useEffect`

### Adding a new question type
1. Update `question_type` enum in `database/schema.sql`
2. Modify backend validation in question controller
3. Add UI components in frontend for new question type
4. Update AudiencePage to handle new question type

## Security Features

The application includes several security measures:
- **Helmet.js** - Security headers (CSP, HSTS, X-Frame-Options, etc.)
- **Rate limiting** - 100 req/15min general, 10 req/15min for auth endpoints
- **JWT validation** - Requires 32+ character secret, app fails without it
- **Role-based access** - Admin and presenter roles with middleware enforcement
- **Registration restricted** - Public registration creates presenter accounts only
- **MySQL not exposed** - Database only accessible within Docker network

## Production Deployment Notes

- Set strong `JWT_SECRET` (required, 32+ characters)
- Set strong `MYSQL_ROOT_PASSWORD`
- Update or remove demo user accounts from `database/schema.sql`
- Configure HTTPS/SSL certificates
- Update `CORS_ORIGIN` to production domain
- Update `VITE_API_URL` and `VITE_SOCKET_URL` to production URLs
