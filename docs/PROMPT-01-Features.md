# Pollica: Feature Specification Prompt

> Use this prompt to instruct an AI coding assistant to build the Pollica application based on feature requirements alone, with full freedom over technology and implementation choices.

---

## What Is Pollica?

Pollica is a real-time audience response platform for educational institutions and presentations -- similar to Kahoot, Mentimeter, or Slido. Presenters create interactive sessions and post questions; audience members join anonymously via short join codes and respond in real-time. Results stream live to the presenter with visualizations.

- **License:** AGPL-3.0

---

## User Roles

### Admin
- Has all presenter capabilities
- Manages user accounts (create, edit, delete, reset passwords)
- Can assign presenter or admin roles to users
- Can view and manage all sessions across all presenters
- Can filter sessions by presenter, status, and title search

### Presenter
- Logs in with email and password
- Creates and manages their own interactive sessions
- Creates questions of four types within sessions
- Presents questions to a live audience one at a time
- Views real-time response analytics and visualizations
- Shares sessions via QR code, shareable link, or join code
- Opens and closes questions with countdowns
- Closes and reopens sessions

### Audience Member
- Joins sessions anonymously via a short, human-readable join code -- no account required
- Provides only a display name to participate
- Answers questions as they are presented by the host
- Sees real-time question transitions and countdowns
- Can only submit one answer per question
- Closing the browser tab ends their session (must rejoin with a new name)

---

## Features

### Authentication & Accounts

- Email and password login for presenters and admins
- Public registration creates presenter accounts only (no self-service admin creation)
- Email validation and minimum 8-character passwords on registration
- Profile management: update name and email
- Password change (requires current password, invalidates all existing sessions)
- Admin password reset (invalidates the target user's existing sessions)
- Role changes invalidate the affected user's existing sessions
- Token-based auth that can be immediately invalidated when credentials or roles change

### Session Management

- Create sessions with a title and optional description
- Each session gets a unique, auto-generated 4-character join code
- Join codes use only unambiguous characters (no l/i/o/0/1) for easy reading aloud
- Join codes are case-insensitive
- View a list of own sessions with question counts and participant counts
- Open and close sessions (closing notifies all connected audience members)
- Reopen previously closed sessions (audience members are notified)
- Delete sessions (cascades to all questions, participants, and responses)

### Question Types

1. **Multiple Choice**: variable number of options displayed as labeled buttons (A, B, C...)
2. **True/False**: two side-by-side buttons
3. **Short Answer**: freeform text input
4. **Numeric**: number input field

### Question Management

- Create, edit, and delete questions within a session
- Questions can only be added to active (open) sessions
- Each question has: text, type, options (for multiple choice), optional correct answer, optional time limit
- Present a question to make it visible to the audience
- Only one question can be presented at a time per session
- Presenting a closed question automatically reopens it

### Question Lifecycle & Countdowns

- **Presenting a question**: the presenter sees it immediately, while the audience gets a 5-second countdown ("Next question in 5, 4, 3, 2, 1...") before the question appears -- this builds anticipation and ensures everyone starts at the same time
- **Switching questions**: re-selecting the same question during its transition countdown cancels the countdown
- **Closing a question**: initiates a 5-second countdown visible to both presenter and audience. During the countdown, the audience can still submit answers. At 2 seconds remaining, any unsaved answer the audience member has entered is auto-submitted. After 5 seconds, the question is fully closed and no more responses are accepted.
- **Cancelling a close**: the presenter can cancel a question's closing countdown before it completes
- **Reopening a question**: a closed question can be reopened for additional responses
- **Deselecting a question**: the presenter can stop presenting without closing, returning the audience to a waiting state

### Response Handling

- Audience members submit one response per question (enforced; duplicates are rejected)
- Responses stream to the presenter in real-time as they are submitted
- Response data includes display name, answer text, and submission timestamp
- Answer text is limited to 1000 characters
- Only the presenter/admin can see individual responses; audience members cannot see each other's answers

### Response Analytics & Visualizations

- **Statistics**: total response count, correct count, incorrect count, average response time
- **Multiple choice / True-false**: bar chart showing the distribution of answers
- **Short answer**: word cloud visualization with stop-word filtering, hover tooltips showing word frequency, and logarithmic font scaling
- **Numeric**: summary statistics (mean, median, min, max) plus a histogram with dynamically-sized bins
- Analytics update incrementally in real-time as new responses arrive (no page refresh needed)

### Session Sharing

- Share modal with:
  - QR code that links directly to the join page
  - Full join URL (copyable to clipboard)
  - Join code displayed prominently (large, bold, uppercase)
  - Current participant count
- Join URL format: `/go/{code}` (e.g., `/go/a2b3`)

### Audience Experience

The audience member's journey through a session follows a clear state progression:

1. **Loading**: fetching session data
2. **Name entry**: prompted for a display name (max 50 characters)
3. **Waiting**: sees a pulsing animation and "Waiting for the next question..."
4. **Transition countdown**: sees a large countdown number with "Get ready!"
5. **Answering**: sees the question with type-appropriate input controls
6. **Submitted**: sees a green checkmark and confirmation message, then waits for the next question
7. **Question closing**: sees a red countdown overlay; inputs are disabled if already answered
8. **Question closed**: sees their locked answer or "No response recorded"
9. **Session ended**: sees a "Session Ended" message if the presenter closes the session

If the audience member navigates away and returns (in the same tab), they rejoin automatically without re-entering their name. If they close the tab, they must rejoin with a new name.

If a session is reopened after being closed, connected audience members are automatically returned to the waiting state.

### Admin Features

- **User management**: table of all users showing name, email, role, session count, creation date
- **Create users**: with any role (presenter or admin)
- **Edit users**: update name, email, role (cannot change own role)
- **Reset passwords**: set a new password for any user
- **Delete users**: with confirmation showing how many sessions will be lost (cannot delete self)
- **Session overview**: view all sessions across all presenters, filterable by presenter, open/closed status, and title search

### Navigation & Profile

- Navbar with brand name, dashboard link, admin links (admin only), and profile dropdown
- Profile avatar using Gravatar (based on email hash)
- Profile dropdown: edit profile, change password, logout
- Navbar hidden on audience pages for a clean, distraction-free experience

### Security

- Rate limiting on all endpoints, with stricter limits on authentication and session join endpoints
- Security headers (content security policy, etc.)
- Role-based access control: presenters can only access their own resources; admins can access everything
- Input validation on all user-provided data (email format, password length, display name length, answer length)
- Tokens can be immediately invalidated when passwords change or roles are modified

### Progressive Web App

- Installable as a standalone app on mobile devices
- Offline caching of the app shell
- iOS-optimized: home screen icon, splash screens for multiple device sizes, safe area handling
- Portrait-primary orientation

### Responsive Design

- Desktop: multi-column layouts, side-by-side grids
- Mobile (below 768px): single-column layouts, larger touch targets (minimum 44px), larger input fonts to prevent mobile browser zoom
- iOS-specific: safe area padding for notched devices, momentum scrolling
- Tactile feedback: subtle scale animation on button press

### Visual Design

- Clean, modern aesthetic with card-based layouts
- Primary color scheme: indigo/purple gradient for brand identity
- Consistent badge system: green for active/success, gray for inactive, red for errors/danger, purple for admin, blue for presenter
- Subtle animations: pulsing dots for waiting states, scaling numbers for countdowns, popping checkmarks for confirmation
- Interactive data visualizations: word clouds with hover effects, bar charts, histograms
