
# Coupling

Coupling is a full-stack link-in-bio page builder that allows users to create, customize and publish a personal page containing their online links.

Developed by Ben King as an individual project for SOEN 287 — Web Programming at Concordia University, Fall 2026.

## Features

- Public landing page
- User registration and login
- Password hashing and session-based authentication
- Authenticated personal dashboard
- Create, read, update and delete links
- Link reordering and visibility controls
- Public user profiles with unique URLs
- Dynamic live page preview
- Profile picture upload and removal
- Preset themes and custom colour selection
- Persistent JSON and image file storage
- Responsive design

## Tech Stack

### Frontend

- HTML5
- CSS3
- Vanilla JavaScript

### Backend

- Node.js
- Express
- express-session
- bcryptjs
- dotenv
- express-rate-limit
- Sharp

### Data Storage

- JSON files for user accounts and profile data
- Local file storage for profile pictures

## Installation and Setup

### 1. Prerequisites

Install Node.js (version 24 LTS recommended) and npm.

### 2. Clone the repository

```bash
git clone https://github.com/B-LKing/Coupling.git
cd Coupling
```

### 3. Install dependencies

```bash
npm ci
```

### 4. Configure environment variables

Generate a session secret using:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Create a .env file in the root directory containing:

```env
PORT=3000
NODE_ENV=development
APP_ORIGIN=http://localhost:3000
SESSION_SECRET=your_generated_secret
```

Replace your_generated_secret with the generated value.

The .env file must not be committed to GitHub.

### 5. Run the application

```bash
npm start
```

Open http://localhost:3000 in your browser.

The required data directory and JSON files are created
automatically when the server starts if they do not
already exist.

## Security

- Passwords are hashed using bcrypt.
- Protected routes require an authenticated session.
- Users can only modify their own profile and links.
- User input is validated on the server.
- User-generated text is rendered using textContent.
- Link URLs are restricted to HTTP and HTTPS.
- Authentication requests are rate limited.
- Request origins are validated.
- Uploaded images are validated, resized and re-encoded.
- Environment variables are used to store secrets.

## Project Structure

```text
Coupling/
├── server.js
├── package.json
├── package-lock.json
├── README.md
├── .gitignore
├── .env
├── data/
│   ├── users.json
│   ├── pages.json
│   └── avatars/
├── private/
│   └── dashboard.html
└── public/
    ├── index.html
    ├── register.html
    ├── login.html
    ├── profile.html
    ├── css/
    │   └── styles.css
    └── js/
        ├── auth.js
        ├── dashboard.js
        ├── profile.js
        └── appearance.js
```

## Limitations

Coupling currently uses local JSON and image file storage
and in-memory session management. A production deployment
would require persistent hosting storage, HTTPS, more
robust session storage and improved concurrency handling.

## Development Progress

- Session 1: Initial setup and public landing page.
- Session 2: Registration and login frontend.
- Session 3: Backend authentication.
- Session 4: Dashboard and CRUD operations.
- Session 5: Public profiles and live preview.
- Session 6: Link reordering, themes and visibility.
- Session 7: Security improvements.
- Session 8: Code cleanup and application refinement.
- Session 9: Profile pictures and custom colours.
