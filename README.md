# WasteZero

A full-stack platform connecting NGOs with volunteers for waste cleanup, recycling drives, and household waste pickups. NGOs post opportunities and manage pickup requests; volunteers browse and apply for opportunities, schedule pickups, and message NGOs directly — with real-time notifications and end-to-end encrypted chat.

Built as part of the Infosys Springboard 7.0 Virtual Internship.

## Tech Stack

**Backend**
- Node.js + Express 5
- MongoDB + Mongoose
- Socket.IO (real-time messaging & notifications, sharing the same HTTP server/port as the REST API)
- JWT authentication with refresh-token rotation, bcrypt password hashing
- Joi validation, Helmet, CORS, express-rate-limit
- Cloudinary (opportunity image uploads)
- SendGrid (transactional email — OTP verification, password reset, 2FA)
- Winston (logging), PDFKit (admin report generation)

**Frontend**
- Angular 22 (standalone components, `@angular/build` application builder)
- RxJS
- Socket.IO client
- `hash-wasm` (client-side cryptography for end-to-end encrypted messaging)

## Project Structure

```
WasteZero/
├── Backend/            Express REST API + Socket.IO server
│   └── src/
│       ├── config/         DB connection, logger, Cloudinary, email
│       ├── constants/      Roles, status enums, security settings
│       ├── models/         Mongoose schemas
│       ├── validators/     Joi validation schemas
│       ├── middlewares/    Auth, role, ownership, error handling
│       ├── services/       Business logic layer
│       ├── controllers/    Thin request handlers
│       ├── routes/         Express routers + central registry
│       ├── sockets/        Socket.IO event handlers
│       ├── templates/      HTML email templates
│       ├── utils/          ApiResponse, ApiError, asyncHandler, tokens
│       ├── app.js          Express app setup
│       └── server.js       Entry point
│
└── Frontend/            Angular application
    └── src/
        ├── app/features/   Feature modules (auth, opportunities, pickups,
        │                   messages, dashboard, profile, admin, settings, help)
        ├── app/shared/      Shared services/components (e.g. notifications)
        └── environments/    Environment config (API URL)
```

## Features

- **Auth & security** — registration with email OTP verification, login with account lockout after failed attempts, optional 2FA via email, JWT access + refresh tokens with rotation/revocation, "logout everywhere," password reset flow, role-based access control (volunteer / ngo / admin)
- **Opportunities** — NGOs create/update/close cleanup & recycling opportunities with images (Cloudinary); volunteers search, filter, and apply
- **Applications** — volunteers apply to opportunities and track status; NGOs review and accept/reject applicants
- **Pickups** — volunteers request household waste pickups; NGOs view available requests and accept/decline/complete them
- **Messaging** — direct messages between users, end-to-end encrypted (public-key exchange + password-wrapped key backup), delivered in real time over Socket.IO with a REST fallback
- **Notifications** — real-time in-app notifications with unread counts
- **Dashboard** — role-specific stats overview
- **Admin panel** — user management (suspend/unsuspend), opportunity moderation, activity logs, downloadable reports

## Prerequisites

- Node.js 18+ (Backend `package.json` scripts use `node --watch`, available in modern Node)
- A MongoDB database (local install, or a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster)
- A [Cloudinary](https://cloudinary.com/) account (free tier) for image uploads
- A [SendGrid](https://sendgrid.com/) account (free tier) for sending OTP/verification emails — requires **Single Sender Verification** for at least one email address (see [SendGrid docs](https://www.twilio.com/docs/sendgrid/ui/sending-email/sender-verification)), or a fully authenticated domain for production use

## Local Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd WasteZero

cd Backend && npm install
cd ../Frontend && npm install
```

### 2. Configure the backend

Create `Backend/.env`:

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/wastezero

JWT_SECRET=<a long random string>
JWT_EXPIRES_IN=7d

# Optional — bcrypt cost factor (defaults to 10 if unset)
BCRYPT_SALT_ROUNDS=10

# Cloudinary — from https://console.cloudinary.com/
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# SendGrid — API key with "Mail Send" permission
SENDGRID_API_KEY=SG.xxxxxxxxxxxx
# Must exactly match a Single Sender you've verified in SendGrid, or an
# address on a domain you've authenticated there
FROM_EMAIL=your-verified-sender@example.com
```

`PORT`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, and `NODE_ENV` are required — the server refuses to start without them.

### 3. Configure the frontend

The API URL lives in `Frontend/src/environments/environment.ts`:

```ts
export const environment = {
  apiUrl: 'http://localhost:3000/api/v1'
};
```

Leave this as-is for local development.

### 4. Run it

```bash
# Terminal 1 — backend (http://localhost:3000)
cd Backend
npm run dev

# Terminal 2 — frontend (http://localhost:4200)
cd Frontend
npm start
```

Health check: `GET http://localhost:3000/health`

## API Overview

All routes are prefixed with `/api/v1`. Every route except `/auth/*` and `GET /health` requires `Authorization: Bearer <token>`.

| Module | Base route | Notes |
|---|---|---|
| Auth | `/auth` | Register, login, email verification, 2FA, refresh/revoke tokens, password reset |
| Users | `/users` | Profile CRUD, password change, E2EE public key exchange & key backup |
| Opportunities | `/opportunities` | CRUD, search/filter/paginate — create/edit restricted to `ngo`/`admin`, ownership-enforced |
| Applications | `/applications` | Volunteers apply/withdraw; NGOs review applicants and update status |
| Pickups | `/pickups` | Volunteers request pickups; NGOs accept/decline/complete |
| Messages | `/messages` | Conversation list, message history, read receipts; primary send path is the `message:send` Socket.IO event, with this as a REST fallback |
| Notifications | `/notifications` | Paginated list, unread count, mark as read |
| Dashboard | `/dashboard` | Role-specific summary stats |
| Admin | `/admin` | User suspension, opportunity removal, activity logs, report downloads — `admin` role only |

## Deployment

This project deploys as two separate services:

- **Backend** — needs a host that keeps a persistent process running and supports WebSockets (for Socket.IO), e.g. [Render](https://render.com) or [Railway](https://railway.app). Serverless/static hosts won't work for this.
- **Frontend** — any static host with SPA rewrite support, e.g. [Vercel](https://vercel.com) or [Netlify](https://www.netlify.com).

Key things to set up beyond local dev:
- A cloud MongoDB instance (e.g. MongoDB Atlas) — local Mongo won't be reachable from a deployed backend
- All backend env vars above, set in your host's dashboard (not from a committed `.env` — `.env` is git-ignored on purpose)
- `Frontend/src/environments/environment.prod.ts` with `apiUrl` pointing at your deployed backend's `/api/v1`, wired up via `fileReplacements` in `angular.json`'s `production` build configuration
- A SendGrid Single Sender (or authenticated domain) — some hosts (e.g. Render's free tier) block outbound SMTP ports entirely, which is why this project sends email over SendGrid's HTTPS API rather than SMTP

## Scripts Reference

| Location | Command | Description |
|---|---|---|
| `Backend/` | `npm run dev` | Start with auto-restart on file changes |
| `Backend/` | `npm start` | Start (production) |
| `Frontend/` | `npm start` | Angular dev server |
| `Frontend/` | `npm run build` | Production build to `dist/` |
| `Frontend/` | `npm test` | Unit tests (Vitest) |

## Security Notes

- Passwords hashed with bcrypt; never stored or logged in plain text
- JWT access tokens + rotating refresh tokens, with per-session revocation and "logout everywhere"
- Account lockout after repeated failed logins
- Direct messages are end-to-end encrypted client-side (public-key exchange, password-wrapped key backup) — the server stores ciphertext only
- All input validated server-side with Joi, independent of frontend validation
- Rate limiting on the global API surface plus stricter route-specific limits on sensitive endpoints (auth, OTP)
