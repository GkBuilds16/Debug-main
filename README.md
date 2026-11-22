<div align="center">

# 🐛 DebugDSA

### The DSA Debugging Platform — Learn. Debug. Battle. Dominate.

[![React](https://img.shields.io/badge/React-18.2-61DAFB?style=flat-square\&logo=react)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=flat-square\&logo=node.js)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?style=flat-square\&logo=mongodb)](https://mongodb.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-Realtime-010101?style=flat-square\&logo=socket.io)](https://socket.io/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

</div>

---

# 🚀 About The Project

DebugDSA is a full-stack gamified DSA debugging platform where developers solve real buggy code, participate in live coding battles, earn certifications, and improve debugging skills through AI-powered complexity analysis.

Unlike traditional coding platforms that focus only on writing solutions, DebugDSA emphasizes reading, understanding, and fixing broken code — a crucial real-world engineering skill.

---

# ✨ Features

## 🐛 Bug Challenge System

* Post bugs with code, description, expected output, language, and topic
* Multi-language support:

  * JavaScript
  * Python
  * Java
  * C++
  * C
* Difficulty levels: Easy / Medium / Hard
* AI auto-analyzes time & space complexity (Big-O)
* Community-driven upvoting system
* Mark bugs as solved after accepted fixes

---

## ⚔️ Real-Time Battle Arena

* Admin-created timed coding battles
* Battle states: UPCOMING → LIVE → FINISHED
* Real-time participant tracking using Socket.IO
* Live submission system during battle windows
* Automatic winner detection
* Dedicated battle leaderboard
* Separate battle points system

---

## 🏆 Gamification & Ranking

* Points awarded for solving bugs and winning battles
* Bronze / Silver / Gold certification system
* Milestone badges and achievements
* Global leaderboard + Battle leaderboard
* Public user profiles with follower/following system

---

## 🤖 AI-Powered Analysis

Complexity analysis uses local Ollama on bug and solution submissions. It is
best-effort and time-bounded. If the model is missing, unavailable, times out,
or returns an invalid estimate, the existing complexity fields contain
`ANALYSIS_UNAVAILABLE`; submissions continue normally. Estimates are model
outputs and should be reviewed rather than treated as verified facts.

### Local AI Debug Coach

The bug-solving page also provides an authenticated, RAG-based debugging coach.
The backend selects its AI provider explicitly via `AI_PROVIDER`. The default is
`ollama` for local development, and `groq` is supported for hosted production.
The Coach retrieves up to five related debugging concepts and returns a
diagnosis, a conceptual hint, the relevant concept, and one concrete debugging
step without providing corrected code.

For local development with Ollama, install and start Ollama, then download the model:

```bash
ollama pull qwen2.5:3b-instruct
ollama run qwen2.5:3b-instruct
```

Keep Ollama running, configure `OLLAMA_URL` and `OLLAMA_MODEL` in
`backend/.env` if the defaults do not apply. For hosted usage, set
`AI_PROVIDER=groq`, `GROQ_API_KEY`, and optionally `GROQ_MODEL`. The backend
keeps API keys only on the server side. Model and embedding weights load only
when AI is first requested; the embedding cache is written atomically to the OS
temporary directory (`debugdsa-ai`) by default. Set `AI_CACHE_DIR` to a
writable persistent directory where you prefer to keep it. No AI dependency is
required for ordinary server startup. The authenticated coach endpoint is
`POST /api/ai/debug` and accepts `code`, `language`, `topic`, `description`,
`error`, and `expectedOutput`; success returns those four text fields
`diagnosis`, `hint`, `concept`, and `debuggingStep` alongside `success: true`.
It accepts JavaScript, Python, Java, C++, and C. The coach does not execute code
and provides hints rather than corrected implementations. Submitted code is
processed by the configured backend provider and the local embedding model; the
AI route does not log source or prompts. AI diagnoses can still be wrong, and
deterministic checks cover only a few JavaScript/TypeScript patterns.

Run the model-free regression suite with:

```bash
cd backend
npm run test:ai
```

`npm run test:ai:ollama` sends a real request to the configured local model;
`npm run test:ai:embedding` loads or downloads the embedding model and should be
run separately. Neither is needed for ordinary CI. `OLLAMA_TIMEOUT_MS`,
`COMPLEXITY_TIMEOUT_MS`, `AI_CACHE_DIR`, `AI_RELEVANCE_THRESHOLD`,
`AI_RATE_LIMIT_MAX`, and `AI_MAX_CONCURRENT` are optional configuration values.
The default model is `qwen2.5:3b-instruct` and
the embedding model is `onnx-community/all-MiniLM-L6-v2-ONNX`. The active `server.js`
exposes `/health`, which reports readiness from MongoDB connectivity and does
not require Ollama or embeddings to be loaded.


---

## 🔐 Authentication & Security

* JWT access + refresh token authentication
* Refresh token rotation
* Google OAuth 2.0 authentication
* Firebase authentication integration
* Password reset via Nodemailer
* Account lockout after multiple failed attempts
* Helmet.js security headers
* API rate limiting protection

---

## 📊 Personalized Recommendations

* Topic-based bug recommendations
* Recommendations based on solve history
* Graceful fallback for new users

---

## 🛡️ Admin Panel

* Full CRUD operations for:

  * Users
  * Bugs
  * Solutions
  * Battles
* Battle creation and management
* View all battle submissions
* Admin dashboard controls

---

# 🏗️ Tech Stack

| Category       | Technologies                          |
| -------------- | ------------------------------------- |
| Frontend       | React 18, React Router, Framer Motion |
| Backend        | Node.js, Express.js, Socket.IO        |
| Database       | MongoDB, Mongoose                     |
| Authentication | JWT, Passport.js, Firebase OAuth      |
| AI Integration | Ollama / Groq, Hugging Face Transformers.js |
| Security       | Helmet, bcryptjs, express-rate-limit  |
| Email Service  | Nodemailer                            |
| PDF Generation | PDFKit                                |

---

# 📂 Project Architecture

```bash
DebugDSA-platform/
│
├── backend/                          # Express.js REST API + Socket.IO server
│   │
│   ├── config/
│   │   ├── env.js                    # Environment configuration
│   │   ├── firebase.js               # Firebase Admin SDK setup
│   │   └── passport.js               # Google OAuth strategy
│   │
│   ├── controllers/
│   │   ├── authController.js         # Authentication & JWT handling
│   │   ├── bugController.js          # Bug CRUD + AI analysis
│   │   ├── battleController.js       # Battle management & live events
│   │   ├── solutionController.js     # Solution submission & upvotes
│   │   ├── userController.js         # Profiles, leaderboard, followers
│   │   ├── certificateController.js  # PDF certificate generation
│   │   ├── recommendationController.js # Personalized recommendations
│   │   ├── runCodeController.js      # Code execution endpoint
│   │   └── adminController.js        # Admin CRUD operations
│   │
│   ├── middleware/
│   │   ├── authMiddleware.js         # JWT authentication middleware
│   │   └── adminAuth.js              # Admin authorization middleware
│   │
│   ├── models/
│   │   ├── User.js                   # User schema & gamification
│   │   ├── Bug.js                    # Bug schema with AI fields
│   │   ├── Solution.js               # Solution schema + upvotes
│   │   ├── Battle.js                 # Battle schema & winner logic
│   │   └── BattleSolution.js         # Battle submission model
│   │
│   ├── routes/
│   │   ├── adminRoutes.js            # Admin dashboard & CRUD routes
│   │   ├── authRoutes.js             # Authentication routes
│   │   ├── battleRoutes.js           # Battle management routes
│   │   ├── bugRoutes.js              # Bug challenge routes
│   │   ├── certificateRoutes.js      # Certificate download routes
│   │   ├── recommendationRoutes.js   # Personalized recommendations
│   │   ├── runCode.js                # Code execution routes
│   │   ├── solutionRoutes.js         # Solution submission routes
│   │   └── userRoutes.js             # User profile & leaderboard routes
│   │
│   ├── utils/
│   │   ├── complexityAnalyzer.js     # Bounded best-effort local analysis
│   │   ├── certificationChecker.js   # Certification eligibility logic
│   │   └── sendEmail.js              # Nodemailer email utility
│   │
│   └── server.js                     # Backend entry point
│
├── frontend/                         # React 18 SPA
│   │
│   ├── public/                       # Static assets
│   │
│   ├── src/
│   │   │
│   │   ├── api/
│   │   │   └── axiosInstance.js      # Axios interceptors + auth refresh
│   │   │
│   │   ├── assets/
│   │   │   └── dsaaa.png             # Project assets
│   │   │
│   │   ├── components/               # Reusable UI components
│   │   │   ├── Adminprotected.js
│   │   │   ├── challengeDetails.js
│   │   │   ├── CodeEditor.js
│   │   │   ├── LivesSession.js
│   │   │   ├── Navbar.js
│   │   │   ├── RecommendedBugs.js
│   │   │   └── SolutionCard.js
│   │   │
│   │   ├── context/
│   │   │   └── Authcontext.js        # Global authentication state
│   │   │
│   │   ├── pages/
│   │   │   ├── Home.js
│   │   │   ├── login.js
│   │   │   ├── signup.js
│   │   │   ├── profile.js
│   │   │   ├── userprofile.js
│   │   │   ├── postbug.js
│   │   │   ├── viewbugs.js
│   │   │   ├── viewbug.js
│   │   │   ├── BugSolution.js
│   │   │   ├── Battles.js
│   │   │   ├── BattleRoom.js
│   │   │   ├── BattleLeaderboard.js
│   │   │   ├── leaderboard.js
│   │   │   ├── MySubmissions.js
│   │   │   ├── AllSubmissions.js
│   │   │   ├── ForgotPassword.js
│   │   │   ├── ResetPassword.js
│   │   │   ├── OAuthSuccess.js
│   │   │   ├── ProfileFollowers.js
│   │   │   ├── ProfileFollowing.js
│   │   │   ├── ProfilePoints.js
│   │   │   ├── ProfileUpvotes.js
│   │   │   ├── ProfileBug.js
│   │   │   └── battleSubmissions.js
│   │   │
│   │   │── admin/
│   │   │   ├── AdminDashboard.js
│   │   │   ├── AdminUsers.js
│   │   │   ├── AdminBugs.js
│   │   │   ├── AdminBattles.js
│   │   │   ├── AdminSubmissions.js
│   │   │   ├── adminBattleSubmissions.js
│   │   │   ├── createBattle.js
│   │   │   └── AdminLogin.js
│   │   │
│   │   ├── styles/
│   │   │   └── theme.css             # Global styling
│   │   │
│   │   ├── App.js                    # Application routes
│   │   ├── api.js
│   │   ├── config.js
│   │   ├── firebase.js
│   │   ├── index.js
│   │   └── App.css
│   │
│   ├── .env
│   ├── package.json
│   └── README.md
│
└── README.md
```



---

# ⚙️ Local Setup

## Prerequisites

* Node.js >= 18
* MongoDB
* Ollama (optional; needed only for AI features)
* Google OAuth Credentials (Optional)

---

## 1️⃣ Clone Repository

```bash
git clone https://github.com/your-username/DebugDSA-platform.git
cd DebugDSA-platform
```

---

## 2️⃣ Backend Setup

```bash
cd backend
npm ci
```

Create `.env` file:

```env
PORT=5000
MONGO_URI=your_mongodb_uri

JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret
SESSION_SECRET=your_session_secret

OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b-instruct
AI_CACHE_DIR=your_writable_cache_directory

FRONTEND_URL=http://localhost:3000
```

Run backend:

```bash
npm run dev
```

---

## 3️⃣ Frontend Setup

```bash
cd ../frontend
npm ci
npm start
```

## Docker Compose

From the repository root, create `backend/.env` from `backend/.env.example`.
For Compose, set `MONGO_URI=mongodb://mongo:27017/debugdsa` and replace the JWT
and session placeholders with unique random secrets. Then run:

```bash
docker compose up --build
```

The frontend is served by Nginx at `http://localhost:3000`; it proxies `/api`
and `/socket.io` to the backend. Dev Mode local uploads persist in the
`codebase_storage` volume. External providers (Google OAuth, Firebase, SMTP,
Groq, Redis, and R2/S3) remain optional until configured.

## Production deployment with Docker Compose

The root `docker-compose.yml` is for local development: it publishes MongoDB
without authentication. Do not expose that stack to the public internet. For a
single-host production setup, use `docker-compose.production.yml`, which enables
MongoDB authentication, keeps MongoDB and the backend off host-published ports,
and binds the frontend only to `127.0.0.1:3000`. Put a TLS-terminating reverse
proxy in front of that port and forward WebSocket upgrades for `/socket.io/`.
The included Nginx frontend container already proxies `/api/` and `/socket.io/`
to the backend and falls back to `index.html` for client-side route refreshes.

1. Copy `.env.production.example` to `.env.production`. Set the MongoDB root
   password and app password to independently generated 64-character
   hexadecimal values (generate each with
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
   The alphanumeric passwords can be used directly in a MongoDB URI. Keep the
   app username restricted to letters, digits, and underscores.
2. Copy `backend/.env.example` to `backend/.env`. Set unique random values for
   `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `SESSION_SECRET`; set
   `MONGO_URI=mongodb://<MONGO_APP_USERNAME>:<MONGO_APP_PASSWORD>@mongo:27017/debugdsa?authSource=debugdsa`.
   Keep these credentials consistent with `.env.production`. Compose creates
   this app account only when Mongo initializes an empty data volume. Use the deployed
   frontend's exact HTTPS origin in `FRONTEND_URL` and `ALLOWED_ORIGINS` (a
   comma-separated list without paths). To enable Google OAuth, set
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL` to
   `https://<public-host>/api/auth/google/callback`, and register this exact
   callback in Google Cloud Console. Passport state sessions are persisted in
   the authenticated MongoDB app database (`oauth_sessions`) for 15 minutes;
   production session cookies are HttpOnly, Secure, and SameSite=Lax. Keep the
   Mongo database and collection available across backend restarts.
3. If Firebase browser sign-in is used, put its public `REACT_APP_FIREBASE_*`
   project settings in `.env.production` before building. Configure Firebase
   Authorized domains. Backend Firebase Admin must use a workload identity or
   application-default credential; never put its service-account key in the
   frontend image. Add optional Groq, Ollama, Redis, R2, SMTP, and Judge0
   settings to `backend/.env` only when those services are configured.
4. Start the stack from the repository root:

   ```sh
   docker compose --env-file .env.production -f docker-compose.production.yml up --build -d
   docker compose --env-file .env.production -f docker-compose.production.yml ps
   curl http://127.0.0.1:3000/
   curl http://127.0.0.1:3000/health
   ```

   Backend `/health` is reachable through frontend Nginx at `/health`; it
   reports ready only when MongoDB is connected. Inspect logs with
   `docker compose --env-file .env.production -f docker-compose.production.yml logs -f`.
   Back up the `mongo_data` and `codebase_storage` volumes before upgrades.
5. Configure the TLS proxy to overwrite forwarded headers and ensure the only
   network path to the frontend container is through that proxy. Have it set
   `X-Forwarded-Proto` to the public HTTPS scheme and sanitize the forwarded IP
   chain. This Compose layout has two proxy hops (TLS proxy then frontend Nginx), so it sets
   `TRUST_PROXY_HOPS=2`; change that value if the network path differs. Auth
   cookies are HttpOnly, Secure, and SameSite=None in production. Compose sets
   `NODE_ENV=production`.

Production startup validates required settings and refuses placeholder secrets,
unauthenticated/system-database Mongo URIs, non-HTTPS browser origins, missing
proxy-hop configuration, partial optional-provider credentials, loopback Ollama,
and the shared public Judge0 CE endpoint. Set `AI_PROVIDER=groq` with a backend
`GROQ_API_KEY`, or use a reachable non-loopback `OLLAMA_URL` and `OLLAMA_MODEL`.
Select `STORAGE_PROVIDER=local` or configure all R2 credentials. Redis is optional
cache only; cache reads fall back to a miss and writes are skipped if Redis is
unavailable. It is not used for Passport sessions or rate-limit coordination.
Firebase browser keys must be configured together as build-time public values;
Firebase Admin credentials must remain in the backend runtime secret store.
SMTP (`EMAIL_USER`/`EMAIL_PASS`) is optional and only enables email delivery when
both values are supplied.

The application relies on Mongoose schema indexes being created automatically
at startup. Review unique-index build requirements and back up MongoDB before
the first production launch or schema/index changes. No separate data migration
runner is included. Production Compose creates a dedicated `readWrite` user for
the `debugdsa` database; the MongoDB root account is used only for initialization
and the container health check.
The production profile uses separate named volumes from the local Compose stack.
Mongo's root initialization only applies to an empty data directory: an
existing data volume needs a separately planned user/authorization migration
before switching its URI. The app-user initialization script also runs only
against an empty volume. Do not remove or reuse an existing volume as a shortcut
to enable authentication.

Use the included Nginx frontend container (or another WebSocket-capable reverse
proxy) for both `/api/` and `/socket.io/`; it forwards upgrade headers and has an
SPA fallback for client-side route refreshes. A Vercel `/api/*` rewrite does not
proxy Socket.IO WebSocket traffic, so battles are not supported through that
rewrite alone. The production Compose topology runs one backend replica. Scale
only after configuring sticky Socket.IO routing and a shared Socket.IO adapter;
rate limiting also remains process-local. Set Vercel's static output directory
to `build` if deploying only the non-realtime frontend there.

### External service and code-execution limits

- MongoDB production connectivity, Google OAuth provider sign-in, Firebase project
  verification, Groq/Ollama live inference, Redis availability, R2, SMTP, and
  private Judge0 isolation require deployment credentials/services and were not
  verified by the repository test run.
- The application sends Judge0 CPU 5 seconds, wall time 15 seconds, memory
  128000 KiB, a fixed language allowlist, bounded source/stdin, and a 15-second
  request timeout with `wait=true`. It cannot enforce process count, network
  denial, filesystem isolation, container/kernel isolation or seccomp policy.
  Production configuration requires a non-public HTTPS Judge0 URL, but that
  check does not prove the remote host or its isolation policy. Verify those
  controls in the Judge0 deployment before accepting untrusted submissions.
- GitHub imports support public repositories only. The backend validates exact
  GitHub repository URLs, blocks private/non-public DNS destinations, pins the
  vetted address, restricts redirects to GitHub API/codeload, disables proxy-env
  forwarding, caps redirects/time/archive size, then applies the same safe ZIP
  extraction checks. Imports do not use GitHub tokens; private repositories are
  unsupported.

## Tests and production build

```bash
cd backend
npm ci
npm test
npm run test:integration
cd ../frontend
npm ci
npm test
npm run build
```

The latest blocker-resolution run is recorded in `AUDIT.md`. It includes Mongo
session persistence/OAuth-state tests, real Socket.IO integration coverage,
GitHub URL/archive policy tests, production configuration validation, both npm
audits, frontend production build, and the exact external-service verification
limits. Docker/Compose results are recorded as unavailable when Docker is not
installed; do not interpret local tests as proof of production connectivity.

## Isolated staging deployment

`docker-compose.staging.yml` defines an isolated staging stack. It uses a
separate Mongo database (`debugdsa_staging`), a separately named Mongo volume,
a separate Dev Mode storage volume, and loopback frontend port `3100`. It does
not reuse the production Compose volume names. The staging Mongo init script
creates an app user with `readWrite` only on `debugdsa_staging`. Mongo user
creation and database permissions have not been exercised here because Docker
is unavailable; provisioning runs only when the staging Mongo data volume is
empty.

1. Copy `.env.staging.example` to `.env.staging` and
   `backend/.env.staging.example` to `backend/.env.staging`. Both populated
   files are ignored by Git. Replace all `REPLACE_` values and secret templates.
   Use independent generated 64-hex-character Mongo passwords and distinct
   strong JWT/session secrets. Set the real staging HTTPS origin in both
   `FRONTEND_URL` and `ALLOWED_ORIGINS`. Set reachable Ollama/Groq and controlled
   Judge0 endpoints before testing those integrations. Leave optional services
   blank when they are not configured; Google OAuth must be supplied as all
   three client ID, secret, and exact HTTPS callback values. Register
   `https://<staging-host>/api/auth/google/callback` in Google Cloud Console and
   allow the staging frontend origin in `ALLOWED_ORIGINS`.
2. Put a TLS reverse proxy in front of `127.0.0.1:3100`, overwrite forwarded
   headers, and allow WebSocket upgrades on `/socket.io/`. This topology expects
   two trusted proxy hops (TLS proxy → frontend Nginx → backend). Keep MongoDB
   and backend ports unpublished.
3. From the repository root, validate and start staging:

   ```powershell
   docker compose -p debugdsa-staging --env-file .env.staging -f docker-compose.staging.yml config --quiet
   docker compose -p debugdsa-staging --env-file .env.staging -f docker-compose.staging.yml up --build -d
   docker compose -p debugdsa-staging --env-file .env.staging -f docker-compose.staging.yml ps
   Invoke-WebRequest http://127.0.0.1:3100/
   Invoke-RestMethod http://127.0.0.1:3100/health
   docker compose -p debugdsa-staging --env-file .env.staging -f docker-compose.staging.yml logs --tail 200
   ```

   The Compose config command should succeed before building. `/health` should
   report `ready` with MongoDB `connected`. Verify actual app-user write access
   using a disposable staging-only probe, then delete the probe. Use dedicated
   test accounts and records only. Restart the backend while performing an
   OAuth authorization flow to verify persisted state when real Google
   credentials are available. The full staging acceptance matrix and results
   are in `AUDIT.md`.

The example intentionally contains invalid staging URL/secret placeholders so
production-mode validation fails until real staging values are supplied. A
successful local test suite or YAML parse is not evidence that Docker images,
external integrations, reverse-proxy WebSockets, Judge0 isolation, or the live
staging acceptance flows work.

# 🔐 Security Features

* JWT Access & Refresh Tokens
* Password Hashing using bcryptjs
* HTTP Security Headers using Helmet
* API Rate Limiting
* Google OAuth Authentication
* Refresh Token Rotation
* Account Lockout Protection
* Secure Password Reset Flow

---

# 🤝 Contributing

Contributions are welcome!

```bash
# Fork the repository
# Create your feature branch
git checkout -b feature/amazing-feature

# Commit changes
git commit -m "Add amazing feature"

# Push changes
git push origin feature/amazing-feature
```

Then open a Pull Request.

---

# 📄 License

This project is licensed under the MIT License.

---

<div align="center">

Made with  using MERN Stack + AI

⭐ Star this repository if you found it useful!

</div>
