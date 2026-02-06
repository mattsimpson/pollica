# Pollica

Pollica is a modern, real-time audience response platform designed for educational institutions and presentations. Presenters can create interactive sessions and pose questions, while audience members join anonymously via join codes and respond in real-time through a Progressive Web App (PWA) interface.

**Website:** https://polli.ca
**Repository:** https://github.com/mattsimpson/pollica
**License:** AGPL-3.0

## Features

### For Admins
- All presenter capabilities plus:
- Manage users (create, edit, delete presenter and admin accounts)
- Reset user passwords
- View all sessions across all presenters
- Search and filter sessions by presenter, status, or title

### For Presenters
- Create and manage interactive sessions
- Share sessions with a simple 4-character join code
- Post questions in multiple formats (multiple choice, true/false, short answer, numeric)
- View real-time response analytics and statistics
- Live dashboard with response distribution charts and word clouds
- Track anonymous participant count
- Close questions with a 5-second countdown
- Control which question is displayed to the audience

### For Audience
- Join sessions instantly with a join code (no account required)
- Answer questions in real-time on any device
- Mobile-friendly PWA for easy access
- Real-time notifications for new questions
- See countdown when questions are about to close

### Technical Features
- Real-time updates using WebSocket (Socket.io)
- RESTful API with JWT authentication for presenters
- Anonymous token-based authentication for audience
- Progressive Web App (PWA) capabilities
- Responsive design for mobile and desktop
- Docker containerization for easy deployment
- MySQL database for data persistence
- Vite-based React frontend

## Architecture

The system consists of three main components:

1. **Backend API** (Node.js + Express + Socket.io)
   - RESTful API endpoints
   - WebSocket server with separate namespaces for presenters and audience
   - JWT-based authentication for presenters
   - Anonymous token authentication for audience
   - Port: 7012

2. **Frontend PWA** (React + Vite)
   - Progressive Web App
   - Real-time UI updates
   - Separate interfaces for presenters and audience
   - Port: 7011

3. **Database** (MySQL 8.0)
   - Persistent data storage
   - Port: 3306

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ (for local development without Docker)
- At least 2GB of available RAM

## Quick Start with Docker

1. Clone the repository:
```bash
git clone https://github.com/mattsimpson/pollica.git
cd pollica
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Generate a secure JWT secret and set passwords in `.env`:
```bash
# Generate a secure JWT secret
openssl rand -base64 32

# Edit .env and set:
# - JWT_SECRET (paste the generated value)
# - MYSQL_ROOT_PASSWORD (choose a secure password)
# - DB_PASS (choose a different password for the application database user)
```

4. Start all services using Docker Compose:
```bash
docker compose up -d
```

5. Wait for services to initialize (about 30-60 seconds):
```bash
docker compose logs -f
```

6. Access the application:
   - Frontend: http://localhost:7011
   - Backend API: http://localhost:7012

7. Login with demo account:
   - **Admin**: email: `admin@polli.ca`, password: `password123`
   - **Presenter**: email: `presenter@polli.ca`, password: `password123`

8. Audience members join via session link:
   - Create a session as presenter
   - Share the join link (e.g., http://localhost:7011/go/a1b2)
   - Audience members enter their name and start responding

## Manual Setup (Without Docker)

### Environment Setup

1. Create the root `.env` file from example:
```bash
cp .env.example .env
```

2. Set `JWT_SECRET`, `MYSQL_ROOT_PASSWORD`, and `DB_PASS` in `.env`

3. Ensure MySQL is running and accessible with the credentials in `.env`

### Backend Setup

1. Install dependencies and start:
```bash
cd backend
npm install
npm start
```

### Frontend Setup

1. Install dependencies and start:
```bash
cd frontend
npm install
npm run dev
```

### Database Setup

1. Create MySQL database:
```sql
CREATE DATABASE pollica;
```

2. Import schema:
```bash
mysql -u root -p pollica < database/schema.sql
```

## Usage Guide

### Presenter Workflow

1. **Login** with presenter credentials
2. **Create a Session**:
   - Click "Create New Session"
   - Enter session title and description
   - Session becomes active with a unique join code
3. **Share Session**:
   - Click "Share" to see QR code and join link
   - Share with audience via screen or messaging
4. **Add Questions**:
   - Click "Add Question" within a session
   - Select question type
   - Enter question text and options
   - Optionally set correct answer
5. **Present Questions**:
   - Click "Present" on a question to display it to audience
   - Watch responses come in real-time
   - Click "Close" to end accepting responses (5-second countdown)
6. **View Analytics**:
   - Click on questions to see response charts
   - Short answer questions show word clouds
   - Monitor response counts in real-time
7. **End Session**:
   - Click "Close Session" when finished

### Audience Workflow

1. **Visit Join Link** (e.g., http://localhost:7011/go/a1b2)
2. **Enter Name**:
   - Provide a display name to identify your responses
3. **Wait for Questions**:
   - See "Waiting for next question..." until presenter shows one
4. **Answer Questions**:
   - Tap your answer choice or enter text
   - Submit before the countdown ends
5. **Continue**:
   - Wait for next question after submitting
   - Session will notify when ended

## API Documentation

### Authentication Endpoints

- `POST /api/auth/register` - Register new presenter
- `POST /api/auth/login` - Login and receive JWT token
- `GET /api/auth/profile` - Get current user profile (requires auth)
- `PUT /api/auth/profile` - Update current user profile (requires auth)
- `POST /api/auth/change-password` - Change password (requires auth)

### Session Endpoints (Presenter and Admin)

- `POST /api/sessions` - Create new session
- `GET /api/sessions/my-sessions` - Get presenter's sessions
- `GET /api/sessions/active` - Get all active sessions
- `GET /api/sessions/:sessionId` - Get session details
- `PUT /api/sessions/:sessionId` - Update session
- `PUT /api/sessions/:sessionId/select-question` - Set displayed question

### Question Endpoints (Presenter and Admin)

- `POST /api/questions` - Create question
- `GET /api/questions?sessionId=:id` - Get questions for session
- `GET /api/questions/active?sessionId=:id` - Get active questions for session
- `GET /api/questions/:questionId` - Get question details
- `PUT /api/questions/:questionId` - Update question
- `DELETE /api/questions/:questionId` - Delete question
- `PUT /api/questions/:questionId/close` - Start close countdown
- `PUT /api/questions/:questionId/cancel-close` - Cancel close
- `PUT /api/questions/:questionId/reopen` - Reopen closed question

### Response Endpoints

- `GET /api/responses/question/:questionId` - Get all responses (presenter and admin)
- `GET /api/responses/question/:questionId/stats` - Get response statistics (presenter and admin)

### Admin Endpoints (Admin only)

- `GET /api/admin/users` - Get all users with session counts
- `POST /api/admin/users` - Create new user
- `PUT /api/admin/users/:userId` - Update user details
- `POST /api/admin/users/:userId/reset-password` - Reset user password
- `DELETE /api/admin/users/:userId` - Delete user (cascades to sessions)
- `GET /api/admin/sessions` - Get all sessions with optional filters (presenterId, status, search)

### Anonymous Endpoints (Audience)

- `GET /api/anonymous/session/:code` - Get session by join code
- `POST /api/anonymous/join` - Join session with display name
- `POST /api/anonymous/response` - Submit response (requires token)
- `GET /api/anonymous/my-response/:questionId` - Check if already responded

### WebSocket Events

**Presenter Events:**
- `join-session` / `leave-session` - Room management
- `question-selected` - Question displayed to audience
- `question-closing` / `question-closed` - Question closing countdown
- `new-anonymous-response` - Real-time response notifications
- `anonymous-participant-count` - Participant count updates

**Audience Events (via /anonymous namespace):**
- `question-transition-start` - 5-second countdown before question appears
- `question-changed` - Question now active for responses
- `question-deselected` - No question currently displayed
- `question-closing` / `question-closed` - Question closing countdown
- `session-closed` - Session ended

## Project Structure

```
pollica/
├── backend/
│   ├── src/
│   │   ├── config/          # Database and JWT configuration
│   │   ├── controllers/     # Request handlers
│   │   ├── middleware/       # Authentication middleware
│   │   ├── models/           # Data models
│   │   ├── routes/           # API routes
│   │   ├── services/         # Socket.io service
│   │   ├── utils/            # Utility functions
│   │   └── server.js         # Express server setup
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── public/               # Static files and PWA manifest
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── pages/            # Page components
│   │   ├── services/         # API and Socket services
│   │   ├── styles/           # CSS styles
│   │   ├── App.jsx           # Main app component
│   │   ├── main.jsx          # Entry point
│   │   └── mobile.css        # Mobile-specific styles
│   ├── Dockerfile
│   ├── nginx.conf            # Nginx config template (envsubst)
│   ├── vite.config.js        # Vite configuration
│   └── package.json
├── database/
│   ├── migrations/           # Database migrations
│   └── schema.sql            # Database schema
├── .env.example              # Environment variable template
├── CLAUDE.md                 # Claude Code project instructions
├── docker-compose.yml        # Docker orchestration
├── LICENSE                   # AGPL-3.0 license
└── README.md
```

## Database Schema

The system uses five main tables:

1. **users** - Stores presenter and admin accounts
2. **sessions** - Stores active and historical sessions with join codes
3. **questions** - Stores questions within sessions
4. **anonymous_participants** - Tracks audience members who join sessions
5. **anonymous_responses** - Stores audience responses to questions

See `database/schema.sql` for complete schema definition.

## Environment Variables

All variables are configured in a single `.env` file in the project root. See `.env.example` for a complete template.

### Required
- `JWT_SECRET` - Secret key for JWT tokens (minimum 32 characters, app won't start without it)
- `MYSQL_ROOT_PASSWORD` - MySQL root password (used by Docker to initialize the database)
- `DB_PASS` - Password for the `pollica` application database user (used by the backend)

### Server Configuration
- `NODE_ENV` - Environment mode (default: production)
- `BACKEND_PORT` - Backend port for host and container (default: 7012)
- `FRONTEND_PORT` - Frontend port for host and container (default: 7011)

### Database Configuration
- `DB_HOST` - MySQL host (default: mysql)
- `DB_PORT` - MySQL port (default: 3306)
- `DB_USER` - MySQL username (default: pollica)
- `DB_NAME` - Database name (default: pollica)
- `DB_CONNECTION_LIMIT` - Connection pool size (default: 50)

### Authentication
- `JWT_EXPIRES_IN` - Token expiration time (default: 24h)

### URLs
- `CORS_ORIGIN` - Allowed CORS origin (default: http://localhost:7011)
- `VITE_API_URL` - Frontend URL for API requests, baked in at build time (default: http://localhost:7011/api)
- `VITE_SOCKET_URL` - Frontend URL for Socket.io, baked in at build time (default: http://localhost:7011)

## Docker Commands

Start services:
```bash
docker compose up -d
```

Stop services:
```bash
docker compose down
```

View logs:
```bash
docker compose logs -f
```

Rebuild services:
```bash
docker compose up -d --build
```

Reset database:
```bash
docker compose down -v
docker compose up -d
```

## Troubleshooting

### Backend won't connect to database
- Ensure MySQL container is healthy: `docker compose ps`
- Check backend logs: `docker compose logs backend`
- Verify database credentials in `.env`

### Frontend can't reach backend
- Verify backend is running: `curl http://localhost:7012/health`
- Check CORS_ORIGIN setting in `.env`
- Ensure ports 7011 and 7012 are not in use

### WebSocket connection issues
- Check that Socket.io endpoint is accessible
- Verify JWT token is being sent with socket connection
- Check browser console for WebSocket errors

### PWA not installing
- Ensure HTTPS or localhost is being used
- Check service worker registration in browser DevTools
- Verify manifest.json is accessible

## Security Considerations

### For Production Deployment

1. **Change default credentials**:
   - Update MySQL root password
   - Change JWT_SECRET to a strong random string
   - Remove or change demo presenter password

2. **Use HTTPS**:
   - Configure SSL certificates
   - Update CORS_ORIGIN to match your domain
   - Update VITE_API_URL and VITE_SOCKET_URL

3. **Database security**:
   - Don't expose MySQL port externally
   - Application uses a dedicated `pollica` database user (not root) with limited privileges
   - Set a strong, unique `DB_PASS` different from `MYSQL_ROOT_PASSWORD`
   - Enable MySQL SSL connections

4. **Additional recommendations**:
   - Enable audit logging
   - Set up monitoring and alerts

## Future Enhancements

- SSO integration (SAML/OAuth)
- Advanced question types (ranking, matching, essay)
- Export responses to CSV/Excel
- Session recording and playback
- Team-based responses
- Leaderboards and gamification
- Mobile native apps (iOS/Android)
- Advanced analytics and reporting
- Question banks and templates

## Development

### Running Tests
```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

### Code Style
The project uses standard JavaScript/React conventions. Run linting with:
```bash
npm run lint
```

## License

Copyright (C) 2026 Matt Simpson

This program is free software: you can redistribute it and/or modify it under the terms of the [GNU Affero General Public License](LICENSE) as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

## Support

For issues and questions:
- Open an issue at https://github.com/mattsimpson/pollica/issues

## Contributors

Built for educational institutions to enhance interactive learning experiences.
