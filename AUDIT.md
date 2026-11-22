# DebugDSA production-readiness audit

Audit date: 2026-11-20
Scope: existing application source, dependency manifests and lockfiles, automated tests, deployment files, and configured external integrations in this checkout. The checkout has no `.git` metadata. No production environment files or credentials were present.

## Status summary

- Dependency security: **VERIFIED** â€” `npm audit` reports 0 findings for both backend and frontend, including development dependencies.
- Backend integration suite: **VERIFIED** â€” latest full run completed 31 suites / 137 tests, including persistent-session, GitHub import and Redis fallback coverage.
- Backend AI regression suite: **VERIFIED** â€” `npm test` passed.
- Live embedding inference: **VERIFIED** â€” generated a 384-dimensional embedding using the migrated Transformers.js package.
- Frontend tests and production build: **VERIFIED** â€” 6 files / 37 tests passed; Vite production build completed (main bundle warning recorded below).
- Backend HTTP startup and health: **VERIFIED** against an isolated MongoDB Memory Server; `/health` returned 200 and `ready`.
- Judge0 execution: **PARTIALLY VERIFIED** â€” live authenticated app-route execution succeeded; remote deployment security remains unverified.
- Third-party credentials, deployed data stores, and full Docker deployment: **BLOCKED BY CONFIGURATION** or unavailable in this environment.

## Vulnerability remediation and dependency migrations

Both audits were run against the complete installed trees after changes. Backend and frontend each report 0 critical, high, moderate, and low vulnerabilities. `npm audit --omit=dev` for the frontend also reports 0. Because the final audit is clean, no known vulnerable package remains in either lockfile. The findings present before migration and their resolutions are listed below, with runtime or development scope.

### Backend

- **High â€” production dependency path:** `@xenova/transformers@2.17.2` pulled vulnerable ONNX Runtime Web, `onnx-proto` / `protobufjs`, and `sharp` versions. Removed the Xenova package and migrated the embedding service to `@huggingface/transformers@4.3.2`. Installed transitive versions include `onnxruntime-web@1.31.0-dev.20260914-8d85527a0` and patched `sharp@0.35.5`; the former vulnerable dependency path is no longer present. The default embedding model is now `onnx-community/all-MiniLM-L6-v2-ONNX`.
- **Moderate â€” production dependency path:** `firebase-admin@13.10.0` and its Google Cloud / Firestore dependency tree had audit findings. Migrated to `firebase-admin@14.5.1`, with the Admin SDK imports moved to modular ESM entry points. Docker already uses Node 22, satisfying the new majorâ€™s runtime requirement. Firebase credentials remain optional for ordinary startup.
- **Moderate â€” development dependency path:** `nodemon@3.1.13` resolved `minimatch@10.2.6` in the affected version range. Updated Nodemon to `3.1.11`; its installed `minimatch@3.1.5` is outside the affected range.
- Final backend audit: **0 findings** across production and development dependencies.

### Frontend

- **High â€” production dependency path:** `firebase@12.19.0` â†’ `@firebase/firestore@4.17.2` â†’ vulnerable `@grpc/grpc-js@1.9.16`. Added a compatible npm override to patched `@grpc/grpc-js@1.14.7`; the installed Firebase version remains `12.19.0`.
- **Moderate â€” production dependency path:** `react-router-dom@6.30.6` used affected React Router 6 code. Migrated to `react-router-dom@7.18.6` and verified the existing routing behavior with the route integration tests.
- **Low â€” production dependency path:** Monacoâ€™s `monaco-editor@0.57.0` dependency used affected DOMPurify. Added an override and installed `dompurify@3.4.18`.
- **High / moderate â€” development dependency paths:** Create React App `react-scripts@5.0.1` kept an old Webpack/SVGO/PostCSS/Jest development chain. A trial Webpack Dev Server 6 override made CRAâ€™s `npm start` fail its schema checks, so that incompatible override was reverted. To remove the remaining vulnerable dev-server chain safely, migrated the frontend from CRA to Vite `7.3.8`, `@vitejs/plugin-react` `5.2.0`, and Vitest `4.1.12`. Replaced CRAâ€™s HTML entry, kept the `build/` output expected by Nginx, migrated Jest mocks to Vitest, and refreshed the frontend README. The CRA dependency and its affected paths (SVGO/nth-check, PostCSS, serialize-javascript, sockjs/uuid, webpack-dev-server and webpack-dev-middleware) are no longer installed.
- Final frontend audit: **0 findings** across production and development dependencies. `npm ci` succeeds using the committed lockfile.

## Security review

- **JWT and sessions â€” PARTIALLY VERIFIED:** access tokens expire in 15 minutes; refresh tokens expire in 7 days and are rotated with an atomic database compare-and-update. Active-account checks and password-change timestamps invalidate old access tokens. Password reset now enforces the schemaâ€™s 6-character minimum, caps input at 128 characters, invalidates the stored refresh token, and does not disclose whether an email exists. Access and refresh cookies are HttpOnly; production cookies are Secure and SameSite=None. Unsafe API requests with a browser `Origin` must match `ALLOWED_ORIGINS`. Unauthenticated non-browser requests without an Origin are still accepted by that origin check and remain subject to endpoint authentication/rate limiting. Production cookie behavior was not tested against a deployed frontend.
- **Google OAuth â€” PARTIALLY VERIFIED:** OAuth authorization uses Passport state validation, rejects profiles without an email, and creates opaque-password accounts using cryptographic randomness. OAuth credentials and a registered callback are absent, so provider sign-in was not exercised. Passport state is now stored in MongoDB with a 15-minute expiry and TTL index; state persistence and mismatched-state rejection are covered by integration tests.
- **Firebase authentication â€” PARTIALLY VERIFIED:** Firebase Admin verification is lazy and uses modular imports; Google ID-token fallback is audience-checked. No Firebase project settings or Admin credentials were supplied, so real Firebase verification could not be performed.
- **Admin authorization â€” VERIFIED by tests:** active admin routes use authenticated user records and database-backed role authorization. Regression tests reject non-admin access. A legacy `adminAuth` middleware exists but is not used by the active admin routes.
- **Socket.IO â€” VERIFIED by integration tests:** handshakes require a valid active-user token, reject untrusted browser origins, and battle-room joins require participant membership. Originless non-browser clients can connect only with valid authentication and still require participant membership for battle rooms.
- **File uploads and ZIP extraction â€” VERIFIED by tests:** Multer limits archive uploads to 10 MiB, one file, and no form fields. Extraction rejects unsafe/duplicate paths, symbolic links, encrypted entries, invalid UTF-8, excessive entries/files/expanded bytes, oversized entries, and high compression ratios.
- **GitHub imports â€” PARTIALLY VERIFIED:** imports accept only public `https://github.com/{owner}/{repository}` repositories. DNS pinning and public-IP checks, restricted HTTPS redirect hosts, disabled proxy env use, bounded redirects/response size/time, and the shared ZIP traversal/size/type policy are implemented. Policy tests pass and a public repository import was verified live; private repo imports and authenticated GitHub tokens are not supported.
- **Code execution â€” PARTIALLY VERIFIED:** code execution is delegated to Judge0. The endpoint accepts JavaScript (63), Python (71), Java (62), C++ (54), and C (50), limits source to 10,000 characters and stdin to 5,000, authenticates requests, and rate-limits to 10 per minute. It sends CPU 5 seconds, wall time 15 seconds, memory 128,000 KiB, and an Axios timeout of 15 seconds. `wait=true` requests a completed response in one call; the application does not implement a submission-polling loop. The app does not itself sandbox or execute code. Network denial, filesystem isolation, process/container isolation, and enforcement of resource limits depend on the configured Judge0 deployment. Those remote controls were not inspected or certified; use a controlled private Judge0 deployment for production guarantees.
- **Rate limiting and input validation â€” PARTIALLY VERIFIED:** global API, AI, code-execution, and archive-upload limits are present; route integration tests cover input constraints. The default rate-limit store is process-local, so limits are not coordinated across multiple backend instances. Redis is optional for cache only; cache reads return a miss and writes are skipped when Redis is absent; rate-limit state is not stored in Redis.
- **Uploads / storage â€” PARTIALLY VERIFIED:** local storage paths and access behavior are covered by tests. R2/S3 credentials and a remote bucket were not available.

## External integration configuration checklist

- **MongoDB â€” PARTIALLY VERIFIED.** Integration tests and the startup health check used isolated MongoDB Memory Server. Configure `MONGO_URI`; Compose expects `mongodb://mongo:27017/debugdsa`. No deployment URI was available.
- **Google OAuth â€” BLOCKED BY CONFIGURATION for provider login.** Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `FRONTEND_URL`, and include the frontend origin in `ALLOWED_ORIGINS`. Register the callback URI with Google. Mongo-backed session-state tests pass; no real Google credentials were present.
- **Firebase â€” BLOCKED BY CONFIGURATION.** Frontend build settings: `REACT_APP_FIREBASE_API_KEY`, `REACT_APP_FIREBASE_AUTH_DOMAIN`, `REACT_APP_FIREBASE_PROJECT_ID`, `REACT_APP_FIREBASE_STORAGE_BUCKET`, `REACT_APP_FIREBASE_MESSAGING_SENDER_ID`, and `REACT_APP_FIREBASE_APP_ID` (optional `REACT_APP_FIREBASE_MEASUREMENT_ID`). Backend Admin SDK uses application-default credentials plus `GCLOUD_PROJECT` / `GOOGLE_CLOUD_PROJECT`, or a service account file at `backend/config/firebaseServiceAccount.json`. No live project was configured.
- **Groq â€” BLOCKED BY CONFIGURATION.** Set `AI_PROVIDER=groq`, `GROQ_API_KEY`, and optionally `GROQ_MODEL`. Unit tests exercise simulated provider success/errors; no API key or live call was available.
- **Ollama â€” PARTIALLY VERIFIED.** `AI_PROVIDER=ollama`, `OLLAMA_URL`, and `OLLAMA_MODEL` configure the service. Model-free AI tests passed and the embedding model loaded successfully. No Ollama server/model endpoint was available for a live chat request.
- **Redis â€” PARTIALLY VERIFIED.** Optional `REDIS_URL`; blank means no connection attempt and cache misses/writes are handled without Redis. No Redis server was deployed, so live connectivity was not tested. Compose does not include Redis.
- **S3 / Cloudflare R2 â€” BLOCKED BY CONFIGURATION.** To use R2 set `STORAGE_PROVIDER=r2`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME`. Local storage tests passed; no remote credentials/bucket were supplied.
- **SMTP â€” BLOCKED BY CONFIGURATION.** Gmail delivery needs `EMAIL_USER` and an app password in `EMAIL_PASS`. Neither was present; password-reset email delivery was not attempted.
- **Judge0 â€” PARTIALLY VERIFIED.** Local development defaults to `https://ce.judge0.com`; production configuration rejects this shared host and requires an explicit HTTPS endpoint. A prior live authenticated JavaScript app-route submission returned Accepted and expected stdout. The remote deployment security settings were not inspected.

## Deployment verification

- **Frontend â€” VERIFIED:** production Vite build completed into `frontend/build/`. `npm ci` succeeds. A local Vite development-server check returned HTTP 200 for the HTML, transformed `/src/index.js`, and `/src/App.js`.
- **Backend â€” VERIFIED in an isolated test environment:** server startup with MongoDB Memory Server returned HTTP 200 from `/health` with `status: ready` and database `connected`.
- **Socket.IO â€” VERIFIED by integration tests:** authenticated connection and participant-room checks pass; the final integration suite also exercises untrusted-origin rejection.
- **Docker / Compose â€” BLOCKED BY ENVIRONMENT:** the Docker CLI is unavailable, so no image was built, no container was started, and no Compose health/MongoDB/Socket.IO checks were claimed. Docker deployment remains unverified.
- **Production services â€” BLOCKED BY CONFIGURATION:** no `.env` files or external credentials/services were present for a real deployment check.

## Final regression results

- Backend `npm run test:integration`: **24 suites / 118 tests passed** (final run).
- Backend `npm test`: **passed** model-free AI/RAG and provider-client regressions.
- Backend `npm run test:ai:embedding`: **passed**, generated 384 dimensions.
- Frontend `npm test`: **5 suites / 36 tests passed** using Vitest.
- Frontend `npm run build`: **passed**. Vite warns that the main minified JavaScript chunk is over 500 kB (674.65 kB; 211.52 kB gzip); code splitting can reduce startup transfer size.
- Backend and frontend `npm audit`: **0 findings each**, including dev dependencies.
- Backend syntax checks for `server.js` and `app.js`: **passed**.
- Live Groq/Ollama, production database, Firebase, OAuth, Redis, R2, SMTP, private Judge0 deployment policy, and Docker images remain unverified because credentials/services were unavailable or Docker was not installed.

### Failed migration checks and resolution

- A trial Webpack Dev Server 6 override made CRA `npm start` reject CRAâ€™s old middleware-hook configuration. That override was removed; CRA was then replaced with Vite/Vitest. The final Vite dev server returned HTTP 200 for the page and app modules.
- Initial Vite 8 parsing and JSX test transforms failed on the repositoryâ€™s `.js` files containing JSX. The migration was adjusted to Vite 7 with the JSX loader, and Vitest mocks were updated. Final frontend tests and build pass.
- The first `npm ci` after the toolchain migration detected a stale lockfile. The lockfile was regenerated and the subsequent clean `npm ci` completed successfully.
- The first sandboxed Vite dependency scan was blocked by filesystem access. An unsandboxed local startup check succeeded and served the app entry modules.
- No test or build failures remain in the final verification runs.

## Remaining blockers and operational follow-up

1. Supply real production environment settings and verify MongoDB, Google OAuth, Firebase, AI provider, Redis (if used), R2, and SMTP from the deployed environment.
2. Configure a private Judge0 deployment and review its network, filesystem, container, CPU, and memory policies before making security claims about executed code.
3. Provide Docker to run the Compose build and health checks. Docker configuration has not been validated in this environment.
4. MongoDB-backed Passport sessions survive backend restarts. Before running multiple backend replicas, ensure every replica uses the same authenticated MongoDB database; rate-limit state is still process-local.
5. Use a shared rate-limit store if request limits must apply consistently across multiple backend replicas.
6. Consider splitting the large frontend JavaScript chunk to reduce initial download time.

## Useful commands

From `backend/`: `npm ci`, `npm test`, `npm run test:integration`, `npm run test:ai:embedding`, and `npm start`.  
From `frontend/`: `npm ci`, `npm test`, `npm run build`, and `npm start`.  
For Compose, copy `backend/.env.example` to `backend/.env`, set unique JWT/session secrets and `MONGO_URI=mongodb://mongo:27017/debugdsa`, then run `docker compose up --build` on a host with Docker.

## Final deployment readiness review â€” 2026-11-20

### Production deployment checklist

- **Production Compose configuration â€” PARTIALLY VERIFIED.** Added `docker-compose.production.yml` and `.env.production.example`. This profile authenticates MongoDB, keeps MongoDB and backend ports private to the Compose network, binds the frontend to loopback, configures Firebase browser build arguments, and adds service health checks. The backend container build excludes the Firebase service-account file and local storage data. Docker is not installed on this machine. YAML syntax parses with `js-yaml`; Docker Compose CLI validation and image builds/starts were not run.
- **TLS and forwarded headers â€” PARTIALLY VERIFIED.** The Compose profile expects an external TLS terminator in front of loopback port 3000, with two trusted proxy hops (`TRUST_PROXY_HOPS=2`). Configure that proxy to replace untrusted forwarded headers; the included Nginx forwards the upstream scheme and appends the proxy hop. Keep the frontend port private. The production profile itself does not terminate TLS. The ordinary backend default is one proxy hop. Do not publish the backend or MongoDB ports directly.
- **Frontend API, Socket.IO, and page refresh â€” VERIFIED by source review / tests.** Production frontend requests use the browser's same origin. Included Nginx proxies `/api/` and WebSocket-capable `/socket.io/` to backend and serves `index.html` for client routes; `/health` now proxies to the backend health endpoint. Socket.IO uses its default polling/WebSocket transports, credentials, JWT authentication, and the configured origin allowlist. The current Vercel rewrite forwards `/api/*` only; it does not support the required Socket.IO proxy, so real-time battles need the included Nginx or another WebSocket-capable proxy. Set Vercel's static output directory to `build` if deploying the frontend there.
- **HTTPS cookies â€” VERIFIED by source review; deployed browser behavior NOT VERIFIED.** Auth cookies are HttpOnly, `Secure` and `SameSite=None` when `NODE_ENV=production`; the OAuth session cookie is HttpOnly, Secure and SameSite=Lax. The frontend and callback should use HTTPS. `ALLOWED_ORIGINS` must contain exact scheme/host origins, with no paths.
- **Health, shutdown, and errors â€” PARTIALLY VERIFIED.** `/health` reports 200 only when MongoDB is connected. Production Compose health checks poll it. Backend startup sets a failure exit code on MongoDB connection failure. SIGTERM/SIGINT handlers close Socket.IO/HTTP, MongoDB, and an open Redis connection with a 10-second shutdown timeout. Unexpected 5xx errors now return a generic message; 4xx messages are retained. Backend startup and `/health` passed against MongoDB Memory Server. The registered shutdown handler closed Socket.IO/HTTP and MongoDB after an IPC-triggered SIGTERM event. Windows child-process OS SIGTERM delivery terminated the child without running its handler; native signal delivery and Docker/Linux shutdown remain unverified.
- **Indexes and migrations â€” PARTIALLY VERIFIED.** Schema indexes are declared on relevant models and rely on Mongoose startup index creation. There is no standalone migration runner or migration/rollback script. Check existing data for unique-index conflicts and take a backup before deployment or index/schema changes. Production Compose creates a dedicated `readWrite` user for the app database; the root account is reserved for initialization and health checks.
- **Logging and monitoring â€” PARTIALLY VERIFIED.** HTTP request logs include request ID, normalized path, status and duration; AI provider and coach events are structured. No metrics/APM integration, external log sink, alerting, or certificate monitoring is configured. Collect application logs through the deployment platform.

### Environment and integration configuration checklist

Required backend settings: `MONGO_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `SESSION_SECRET`; set `PORT` only when the platform requires a non-default port. `NODE_ENV=production`, `TRUST_PROXY_HOPS`, `FRONTEND_URL`, and `ALLOWED_ORIGINS` must match the deployment topology. `backend/.env.example` lists the available settings; do not use its placeholders in production.

- **MongoDB â€” BLOCKED BY CONFIGURATION for production.** Compose initializes MongoDB with root authentication and a database-scoped `readWrite` app user from `.env.production`. Both app and root passwords are 64-hex-character values. The init script runs only for an empty Mongo data directory. For Atlas/managed MongoDB use its TLS URI and network allowlist. Only MongoDB Memory Server was exercised here; no production database or replica set was available.
- **Google OAuth â€” BLOCKED BY CONFIGURATION for provider login.** Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL=https://<public-host>/api/auth/google/callback`; register that exact callback in Google Cloud. Set `FRONTEND_URL` and allow the HTTPS frontend origin in `ALLOWED_ORIGINS`. OAuth state is stored in MongoDB with a 15-minute TTL; real provider credentials were not supplied.
- **Firebase â€” BLOCKED BY CONFIGURATION for a real project.** Frontend `REACT_APP_FIREBASE_*` settings are public build-time configuration and can be supplied in `.env.production` for Compose or in Vercel's build environment. Backend Admin uses workload/application-default credentials or `backend/config/firebaseServiceAccount.json`; Docker excludes the key file from the image. Configure Firebase Authorized Domains and never place Admin credentials in frontend build args.
- **Groq â€” BLOCKED BY CONFIGURATION.** Set `AI_PROVIDER=groq`, `GROQ_API_KEY`, and optionally `GROQ_MODEL` in the backend environment. Regression tests use mocked provider responses; no live API credentials were available.
- **Ollama â€” BLOCKED BY CONFIGURATION for live inference.** Set `AI_PROVIDER=ollama`, `OLLAMA_URL` reachable from the backend network, and `OLLAMA_MODEL`. A container's localhost is itself, not a host Ollama service. Model-free AI regressions and embedding inference pass; no Ollama server was configured.
- **Redis â€” PARTIALLY VERIFIED.** `REDIS_URL` is optional; leave it blank to avoid a connection attempt. Cache calls fall back when Redis is unavailable. No live Redis instance was available, and rate limits remain process-local rather than Redis-backed.
- **S3/R2 â€” BLOCKED BY CONFIGURATION.** Configure `STORAGE_PROVIDER=r2`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME`. The local provider is covered by storage tests; no remote bucket credentials were available.
- **SMTP â€” BLOCKED BY CONFIGURATION.** Set `EMAIL_USER` and `EMAIL_PASS` (Gmail app password). No delivery was attempted. Delivery is configured for Gmail's Nodemailer service.
- **Judge0 â€” PARTIALLY VERIFIED.** An authenticated app submission returned Judge0 `Accepted` using `https://ce.judge0.com`. The app sends language IDs JavaScript 63, Python 71, Java 62, C++ 54, C 50; CPU 5 seconds, wall 15 seconds, 128000 KiB memory, and an Axios 15-second timeout. It requests `wait=true`, so there is no client polling loop. Network denial, filesystem/container isolation, and enforcement are properties of the remote deployment and were not audited. Use a private controlled Judge0 deployment for production.

### End-to-end and regression results

- Backend integration: **24 suites / 118 tests passed** in the full-suite run. The certificate integration suite added afterward passed separately: **1 suite / 4 tests** for authentication, the 100-point eligibility boundary, and PDF download responses at the 100/250/500 point thresholds. Total verified across the runs: 25 suites / 122 tests.
- Frontend: **5 suites / 36 tests passed**; Vite production build passed. The existing main JavaScript chunk warning remains: 674.65 kB (211.52 kB gzip).
- AI: `npm test` passed model-free coach, retrieval, request validation, provider errors, timeout, and concurrency regressions. Embedding inference previously passed with 384 dimensions. Live Groq/Ollama responses were unavailable.
- Auth: registration and login passed automated integration tests and an app-route smoke check. Registration cookies authenticated a code request; refresh rotation and stale-token rejection passed.
- Code execution: real app route returned Judge0 `Accepted` for `console.log('DebugDSA app to Judge0 smoke')` and expected stdout. The submission used a fresh registration in an isolated in-memory database; no persistent user data was touched.
- Battles, Socket.IO authentication, leaderboards, admin, and Dev Mode HTTP flows are covered by backend integration tests. Frontend route tests exist, but there is no browser-driven E2E harness for every workflow. No live AI provider or complete battle UI flow was exercised.
- Certificates: fixed the eligibility mismatch (download previously allowed at 4 points while displaying a 100-point requirement); it now requires 100 points and uses the established 100/250/500 Bronze/Silver/Gold thresholds. Four new integration checks passed.
- Dev Mode ZIP and GitHub imports: valid/hostile ZIP cases pass integration coverage; public URL/archive policy tests pass, and the final blocker-resolution section records a successful live public repository import. Private repositories remain unsupported.
- Mongo health: isolated Mongo startup/health checks passed. Production Mongo connectivity is not verified.
- `npm audit --json`: backend 0 vulnerabilities; frontend 0 vulnerabilities.
- Docker/Compose: **BLOCKED BY ENVIRONMENT** â€” Docker is not installed. No image build, Compose startup, container health, inter-service networking, or deployment startup is claimed.

### Exact production deployment instructions

1. On a Docker host, copy `.env.production.example` to `.env.production`. Set a root username and independent generated 64-hex-character root and app passwords; set the app username using letters, digits, and underscores.
2. Copy `backend/.env.example` to `backend/.env`. Replace JWT and session placeholders with unique random secrets. Set `MONGO_URI=mongodb://<MONGO_APP_USERNAME>:<MONGO_APP_PASSWORD>@mongo:27017/debugdsa?authSource=debugdsa`. Set `FRONTEND_URL`, `ALLOWED_ORIGINS`, `GOOGLE_CALLBACK_URL`, and provider settings that you actually use. Do not commit either populated environment file.
3. For Firebase browser auth, set public `REACT_APP_FIREBASE_*` values in `.env.production` before building. Keep Firebase Admin credentials in a backend runtime workload identity/secret mount; do not bake them into an image.
4. Put a TLS reverse proxy in front of `127.0.0.1:3000`, overwrite forwarded headers, and allow Socket.IO upgrade traffic. This Compose topology uses two trusted proxy hops. The app account has `readWrite` only on the app database. Mongo initialization and app-user creation apply only to an empty data volume.
5. From repository root, run:

   ```sh
   docker compose --env-file .env.production -f docker-compose.production.yml up --build -d
   docker compose --env-file .env.production -f docker-compose.production.yml ps
   curl http://127.0.0.1:3000/
   curl http://127.0.0.1:3000/health
   docker compose --env-file .env.production -f docker-compose.production.yml logs -f
   ```

   `/health` should return HTTP 200 with `status: ready` and MongoDB connected. Back up the `mongo_data` and `codebase_storage` volumes before updates. Configure platform monitoring, snapshots, OAuth origins, Firebase domains, and Judge0 isolation before enabling real users.

### Remaining blockers

1. Docker is unavailable; production Compose syntax/build/runtime remain unverified.
2. Production MongoDB and account-based services other than public Judge0 are unconfigured; verify from the target deployment before launch.
3. A private Judge0 deployment's execution isolation and limits are not independently verified.
4. Google OAuth requires real Google credentials and the exact registered HTTPS callback. Session persistence is implemented on the app MongoDB; its production deployment must retain the `oauth_sessions` collection and TTL index.
5. Vercel's rewrite does not forward Socket.IO; use the Compose Nginx path or a supported WebSocket proxy before enabling battles on Vercel.
6. No live browser automation suite currently covers every requested workflow end-to-end.

## Final blocker resolution â€” 2026-11-20

This section supersedes the earlier session and GitHub-import statements above.

- **Persistent OAuth sessions â€” VERIFIED in isolated MongoDB integration tests.** Express Passport state uses the `oauth_sessions` collection in the authenticated application database, not Redis or MemoryStore. Sessions have a 15-minute cookie/document expiry; the store explicitly rejects and deletes expired reads, and Mongo TTL index `oauth_session_ttl` performs asynchronous cleanup. Store tests verify persistence across store instances, expiration and deletion. OAuth initiation stores state in MongoDB and a callback with mismatched state returns 403. Production cookies are HttpOnly, Secure and SameSite=Lax. Real Google sign-in and production browser cookies remain **BLOCKED BY CONFIGURATION** because Google credentials and a deployed HTTPS origin were not provided. MongoDB connection/index creation must succeed before OAuth can work.
- **Socket.IO topology â€” VERIFIED in local client/server integration tests.** Real `socket.io-client` handshakes exercise unauthenticated rejection, origin rejection, authenticated participant room access, and denial. The client uses credentials, explicit reconnect settings, and rejoins after reconnect. Production topology is one backend behind the included Nginx frontend proxy; `/socket.io/` forwards upgrade headers and disables buffering. Use a WebSocket-capable reverse proxy; Vercel `/api` rewrites do not serve this socket path. Keep one backend replica unless sticky routing and a shared Socket.IO adapter are configured. Docker/Nginx runtime verification is **BLOCKED BY ENVIRONMENT**.
- **GitHub imports â€” PARTIALLY VERIFIED.** Replaced `IMPORT_DISABLED` with public-only archive retrieval. URL validation rejects credentials, ports, query/fragment, and unsupported paths; DNS lookup checks every result and pins the vetted addresses; only GitHub API/codeload hosts are accepted; redirects are capped and revalidated; proxy environment variables are bypassed; requests time out and archives are capped at 10 MiB; shared ZIP extraction enforces file/path/expanded-size policy. No tokens are used or exposed. Unit policy tests passed, and a live import of `https://github.com/octocat/Spoon-Knife` returned three accepted files. A live import of `octocat/Hello-World` was safely rejected because its archive contains an unsupported extensionless file. Private repositories remain unsupported.
- **Production configuration â€” VERIFIED by validation tests, not by deployment.** Production startup rejects missing/placeholder secrets, unauthenticated or system-database Mongo URIs, non-HTTPS browser origins, absent/invalid proxy-hop settings, partial optional integrations, loopback Ollama URLs, invalid R2/email configuration, and the shared public Judge0 CE host. Non-production modes retain development/test behavior. Frontend Vite config rejects partially configured Firebase browser credentials. Production Compose gives the app a database-scoped `readWrite` Mongo user; actual production Mongo credentials and connection are **BLOCKED BY CONFIGURATION**. Existing Compose init scripts only provision users on a fresh volume.
- **Redis fallback â€” PARTIALLY VERIFIED by source and regression coverage.** Redis remains optional cache infrastructure only; with no open Redis client, reads return cache miss and writes are skipped, and Redis errors are caught. No Redis service was available for a live outage/recovery test. Redis is not the Passport session store and does not coordinate rate limits.
- **Judge0 security â€” PARTIALLY VERIFIED for the application request only.** The app sends CPU time 5s, wall time 15s, memory 128000 KiB, language allowlist IDs, bounded code/stdin, and a 15s HTTP timeout with `wait=true`. No client polling loop is needed for that synchronous mode. Production config now requires an explicit private HTTPS Judge0 API URL, but URL validation cannot prove its destination is private or inspect the remote runner. Process count, CPU enforcement, memory enforcement, network isolation, filesystem isolation, kernel/container isolation and seccomp remain **NOT VERIFIED**; obtain deployment configuration and review it before accepting untrusted production submissions. The previous public CE smoke test is not evidence of isolation.
- **Current verification run:** full backend integration suite passed (31 suites / 137 tests), including persistent-session, GitHub import and Redis-unavailable behavior. The focused blocker subset also passed (5 suites / 14 tests). Backend AI regressions and live embedding inference passed (384 dimensions). A standalone backend process connected to an isolated MongoDB Memory Server, created the session TTL index, and returned `/health` 200 with `ready` / `connected`. Frontend Vitest passed (6 files / 37 tests) and Vite production build passed (674.77 kB main JS warning). Both npm audits reported zero vulnerabilities. Partial Firebase build configuration was rejected as expected. Live GitHub import passed as described above. Docker and Nginx binaries are unavailable, so image build, Compose startup, and proxy-level health/WebSocket verification are **NOT VERIFIED / BLOCKED BY ENVIRONMENT**.

### Current deployment blockers and exact topology

1. Supply production secrets and reachable services; run with `NODE_ENV=production` and explicitly configure `TRUST_PROXY_HOPS`, HTTPS `FRONTEND_URL` / `ALLOWED_ORIGINS`, authenticated app-database `MONGO_URI`, strong distinct JWT/session secrets, explicit AI and storage providers, and a controlled HTTPS Judge0 endpoint. Startup intentionally rejects the example defaults.
2. For Compose, configure `.env.production` and `backend/.env`, then run `docker compose --env-file .env.production -f docker-compose.production.yml up --build -d`. Terminate TLS in a trusted proxy in front of loopback `127.0.0.1:3000`; preserve WebSocket upgrades for `/socket.io/`, overwrite forwarded headers, and keep backend/Mongo ports unpublished. The configured hop count assumes TLS proxy â†’ frontend Nginx â†’ backend.
3. Enable Google OAuth only with valid client credentials and the registered callback `https://<host>/api/auth/google/callback`. Persistent state is in MongoDB and expires after 15 minutes.
4. Run one backend replica. Horizontal scale requires sticky Socket.IO routing plus a shared Socket.IO adapter; rate limiting also needs a distributed store.
5. Before accepting submitted code, verify actual Judge0 server-side CPU, memory, wall-time, process, filesystem, network, and container isolation policy. The application payload alone does not establish those guarantees.

## Staging deployment and live acceptance report — 2026-11-20

### Staging configuration prepared

- Added `docker-compose.staging.yml`, `.env.staging.example`, `backend/.env.staging.example`, and a staging-specific Mongo init script. Root Mongo credentials and app Mongo credentials are separate. The app user receives `readWrite` only on `debugdsa_staging`. Compose uses volume names `debugdsa_staging_mongo_data` and `debugdsa_staging_codebase_storage`, plus loopback port `3100`; it does not reuse production volumes or port `3000`.
- Added `.env.staging` and `backend/.env.staging` to `.gitignore`. Templates deliberately contain invalid URL/secret placeholders so production configuration validation blocks startup until operators supply actual staging configuration.
- The Compose YAML parses successfully with the installed `js-yaml` parser and lists the expected three services and two isolated volumes. A focused rerun of the seven staging-related backend suites passed 18 tests. This is only syntax/source verification. Docker and Nginx executables are unavailable, so `docker compose config`, image build, startup, container networking, Mongo auth, and reverse-proxy checks were **NOT VERIFIED**.
- No staging secrets, domain, production/staging Mongo service, external API credentials, or external service endpoints were available. The staging stack was not started and no live staging data was created.

### Live acceptance matrix

- **Staging image build and full Compose startup — NOT VERIFIED:** Docker CLI unavailable; only YAML parsing was possible.
- **MongoDB authentication and app-user permission — NOT VERIFIED:** staging init source grants `readWrite` on `debugdsa_staging`; no Mongo container could be started to test authentication or an actual write.
- **Login/session persistence across a backend restart — PARTIALLY VERIFIED:** Mongo session store persistence across store instances, TTL expiry, OAuth state storage, and wrong-state rejection pass integration tests. No staging backend restart or valid Google callback was possible.
- **Google OAuth — BLOCKED BY CONFIGURATION:** no OAuth client credentials, registered callback, or staging HTTPS origin.
- **Frontend/backend communication — PARTIALLY VERIFIED:** frontend uses same-origin production API configuration; API integration tests and standalone backend health check pass. No built frontend container or live staging browser session.
- **Socket.IO through the actual reverse proxy — NOT VERIFIED:** local authenticated `socket.io-client` integration tests pass, but Docker and Nginx are unavailable.
- **Battle creation, joining, completion and leaderboard — PARTIALLY VERIFIED:** backend integration tests cover battle lifecycle/authorization/leaderboards and Socket.IO join checks. Full browser-driven staging battle flow was not run.
- **Public GitHub repository import — PARTIALLY VERIFIED:** security policy tests pass and live public repository service import returned three files. An authenticated staging HTTP route and persisted result were not exercised. Private repositories are unsupported.
- **ZIP upload and extraction — PARTIALLY VERIFIED:** valid and hostile archive integration tests pass. No staging upload route/storage volume was available.
- **Judge0 application execution — PARTIALLY VERIFIED:** a prior authenticated application-route JavaScript submission returned Accepted with expected output. No staging Judge0 endpoint was supplied. Remote CPU/memory enforcement, process count, filesystem/network isolation, container/kernel isolation, and seccomp are **NOT VERIFIED**.
- **AI debugging and fallback — PARTIALLY VERIFIED:** AI regression/provider-error/fallback tests pass; 384-dimensional embedding inference succeeds. No live staging Groq or Ollama endpoint/credentials.
- **Certificate eligibility and downloads — PARTIALLY VERIFIED:** certificate integration tests cover authentication, eligibility thresholds, and PDF responses. No staging account/data.
- **Admin authorization — PARTIALLY VERIFIED:** admin route authorization integration tests pass. No staging admin account or deployed admin workflow.
- **Database persistence — PARTIALLY VERIFIED:** MongoDB Memory Server integration and health tests pass; Compose defines separate durable staging volumes. No staged write/restart persistence test.
- **Health check — PARTIALLY VERIFIED:** standalone backend process connected to isolated MongoDB Memory Server and returned `/health` 200/ready. Container health check was not run.
- **Graceful shutdown — PARTIALLY VERIFIED:** shutdown path is covered by prior local handler verification; Linux/Docker termination and proxy drain behavior were not verified here.
- **SMTP, Firebase, Redis, R2/S3 — BLOCKED BY CONFIGURATION for live service tests:** no credentials or remote services. Redis-unavailable cache behavior and local storage are covered by automated tests; no staging provider connectivity is claimed.

### Exact staging deployment commands

On a Docker host, from the repository root:

1. Copy `.env.staging.example` to `.env.staging` and
   `backend/.env.staging.example` to `backend/.env.staging`. Replace all
   placeholders. Generate independent 64-character hexadecimal Mongo passwords
   and distinct strong JWT/session secrets. Set real HTTPS staging frontend
   origins, reachable AI endpoints, and a controlled Judge0 URL. Configure
   optional integrations only when credentials exist. Keep populated env files
   private; `.gitignore` excludes them.
2. Put a TLS reverse proxy in front of `127.0.0.1:3100`, overwrite forwarded
   headers, and proxy WebSocket upgrades for `/socket.io/`. The expected trusted
   proxy path is TLS proxy → frontend Nginx → backend, hence
   `TRUST_PROXY_HOPS=2`.
3. Run:

   ```powershell
   docker compose -p debugdsa-staging --env-file .env.staging -f docker-compose.staging.yml config --quiet
   docker compose -p debugdsa-staging --env-file .env.staging -f docker-compose.staging.yml up --build -d
   docker compose -p debugdsa-staging --env-file .env.staging -f docker-compose.staging.yml ps
   Invoke-WebRequest http://127.0.0.1:3100/
   Invoke-RestMethod http://127.0.0.1:3100/health
   docker compose -p debugdsa-staging --env-file .env.staging -f docker-compose.staging.yml logs --tail 200
   ```

   Verify Mongo app-user permissions with a disposable write/delete probe in the
   staging database. Run the acceptance matrix above with staging-only test
   accounts. For OAuth persistence, begin Google authorization, restart the
   backend before callback, then complete the real callback and verify the
   result. Do not use production accounts or databases.

### Remaining launch blockers

1. Docker and Nginx are unavailable in this environment; the staging stack,
   actual reverse-proxy Socket.IO transport, health checks, and shutdown have
   not been deployed or tested.
2. No staging domain, secrets, MongoDB service, Google OAuth credentials,
   Firebase project, Groq/Ollama endpoint, Redis, S3/R2 bucket, SMTP credentials,
   or private Judge0 deployment was supplied. Live checks are blocked until
   those are configured.
3. Judge0 isolation and enforcement must be independently inspected on the
   controlled remote deployment before staging results can support any claim
   about executing untrusted code safely.
4. Full user-facing browser acceptance (including login, battles, certificates,
   admin screens, and Dev Mode import/upload flows) remains outstanding; the
   automated backend tests are not a substitute for a staging browser run.
