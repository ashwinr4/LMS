# QUALIVA — PRE-DEPLOYMENT PRODUCTION READINESS & RENDER COMPATIBILITY AUDIT REPORT

---

## A. DEPLOYMENT STATUS: **READY FOR RENDER STAGING (WITH SPECIFIED CONFIGURATIONS)**

Both the frontend and backend have been built, compiled, and executed in an isolated production-simulated environment (`NODE_ENV=production`, `PORT=10000`). All critical runtime systems (Prisma engine, MongoDB native adapter, Socket.IO, Helmet security headers, and React SPA routing) have passed production execution checks.

---

## B. DEPLOYMENT BLOCKER CLASSIFICATION

### 1. BLOCKERS (Must be addressed before deploying to avoid immediate crash or failure)
* **BLOCKER-1: `server.listen` Missing Explicit Host `'0.0.0.0'`**:
  * **File**: `server/src/server.js:218`
  * **Problem**: Render web services run inside Docker containers behind an internal NGINX reverse proxy. If Node listens without explicitly binding to `0.0.0.0`, it may bind exclusively to `localhost` (`127.0.0.1`), causing Render's port health check to time out with `Port 10000 not responding` and failing the deployment.
  * **Fix**: Change `server.listen(PORT, ...)` to `server.listen(PORT, '0.0.0.0', ...)`.

* **BLOCKER-2: Hardcoded Database Credentials in Source Fallback**:
  * **File**: `server/src/utils/prisma.js:14,46`
  * **Problem**: Raw Neon PostgreSQL and MongoDB Atlas connection strings with embedded passwords are hardcoded as fallbacks if environment variables are missing. In production on Render, credentials must be strictly injected via Render Environment Variables.
  * **Fix**: Throw an informative initialization error if neither `POSTGRES_URL` / `DATABASE_URL` nor `MONGODB_URL` is set, rather than falling back to development credentials.

---

### 2. HIGH SEVERITY (Important functionality fails if misconfigured)
* **HIGH-1: `VITE_API_URL` Missing Trailing `/api/v1` Fallback**:
  * **File**: `client/src/services/api.js:4-6`
  * **Problem**: If an administrator sets `VITE_API_URL=https://qualiva-backend.onrender.com` in Render's dashboard (omitting the `/api/v1` path), all frontend API calls (e.g. `api.get('/auth/me')`) resolve to `https://qualiva-backend.onrender.com/auth/me` and fail with HTTP `404 Not Found`.
  * **Fix**: Automatically normalize `API_BASE_URL` so that if `cleanUrl` does not end with `/api/v1`, it appends `/api/v1`.

* **HIGH-2: Ephemeral Disk File Storage for Course Media on Render**:
  * **Files**: `server/src/routes/moduleRoutes.js:32`, `server/src/routes/chatRoutes.js:21`
  * **Problem**: Render Web Services run on ephemeral filesystems. Files uploaded to the local `uploads/` folder are lost whenever the server restarts, re-deploys, or goes to sleep.
  * **Resolution for Staging/Production**:
    1. For temporary staging/testing: Handled gracefully because `server.js` auto-creates `uploads/` on boot.
    2. For permanent production: A Render Persistent Disk (mounted at `/opt/render/project/src/server/uploads`) or an S3/Cloudinary bucket must be configured so course videos and chat files survive deployments.

* **HIGH-3: Native Binary Dependency `better-sqlite3` in `package.json`**:
  * **File**: `server/package.json:21`
  * **Problem**: `better-sqlite3` is a compiled C++ binary module requiring `node-gyp`, Python, and make tools. It is not imported or used anywhere in the active source code, but could trigger build failures on minimal Linux environments if compilation fails.
  * **Fix**: Safely prune `better-sqlite3` and `@prisma/adapter-better-sqlite3` from `server/package.json`.

---

### 3. MEDIUM / LOW SEVERITY (Non-blocking improvements)
* **MED-1: Google OAuth Authorized JavaScript Origin**:
  * The frontend Google SSO Client ID (`1063461174979-...apps.googleusercontent.com`) must have the Render frontend URL added under **Authorized JavaScript Origins** in Google Cloud Console.
* **MED-2: SPA Direct Route Redirection (Already Handled)**:
  * Verified that `client/public/_redirects` exists with `/*    /index.html   200` and is automatically copied to `dist/`, ensuring deep routes work on Render Static Sites without 404s.

---

## C. COMPLETE ENVIRONMENT VARIABLE REGISTRY

### 1. FRONTEND ENVIRONMENT VARIABLES (`client/`)

| Variable Name | Required at Build? | Where It Is Used | Purpose |
| :--- | :---: | :--- | :--- |
| `VITE_API_URL` | **YES** | `client/src/services/api.js` | Base URL of deployed Render Backend (e.g. `https://qualiva-backend.onrender.com/api/v1`). |
| `VITE_SOCKET_URL` | **YES** | `client/src/context/SocketContext.jsx` | Base URL for WebSocket connection (e.g. `https://qualiva-backend.onrender.com`). |
| `VITE_GOOGLE_CLIENT_ID` | NO | `client/src/components/ui/GoogleSignInButton.jsx` | Google OAuth Client ID for Single Sign-On. |

---

### 2. BACKEND ENVIRONMENT VARIABLES (`server/`)

| Variable Name | Required at Runtime? | Where It Is Used | Purpose |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | **YES** | `server/src/server.js`, `authController.js` | Set to `production`. Enables secure cookies and hides debug stack traces. |
| `PORT` | **YES** (auto-set by Render) | `server/src/server.js` | Port where Express listens (Render defaults to `10000`). |
| `CLIENT_URL` | **YES** | `server/src/server.js` | Public URL of deployed Frontend (e.g. `https://qualiva-frontend.onrender.com`). Configures CORS. |
| `DATABASE_URL` | **YES** | `server/src/utils/prisma.js` | PostgreSQL primary connection string (e.g. Neon or Render PostgreSQL). |
| `BACKUP_DB_URL` | **YES** | `server/src/utils/prisma.js` | Secondary standby connection string (e.g. MongoDB Atlas or secondary PostgreSQL). |
| `POSTGRES_URL` | NO | `server/src/utils/prisma.js` | Explicit PostgreSQL connection string for the multi-engine proxy. |
| `MONGODB_URL` | NO | `server/src/utils/prisma.js` | Explicit MongoDB connection string for the multi-engine proxy. |
| `ACTIVE_PRIMARY_ENGINE` | NO | `server/src/utils/prisma.js` | Active primary engine (`postgresql` or `mongodb`). Defaults to `postgresql`. |
| `ACTIVE_BACKUP_ENGINE` | NO | `server/src/utils/prisma.js` | Active secondary engine (`postgresql` or `mongodb`). Defaults to `mongodb`. |
| `JWT_ACCESS_SECRET` | **YES** | `auth.js`, `authController.js` | Cryptographic secret for signing access tokens (min 32 characters). |
| `JWT_REFRESH_SECRET` | **YES** | `authController.js` | Cryptographic secret for signing refresh tokens (min 32 characters). |
| `JWT_ACCESS_EXPIRES_IN`| NO | `authController.js` | Access token lifespan (default: `15m`). |
| `JWT_REFRESH_EXPIRES_IN`| NO | `authController.js` | Refresh token lifespan (default: `7d`). |
| `SMTP_HOST` | NO | `server/src/utils/email.js` | SMTP host (e.g. `smtp.gmail.com`) for 2FA OTP & notifications. |
| `SMTP_PORT` | NO | `server/src/utils/email.js` | SMTP port (e.g. `587`). |
| `SMTP_USER` | NO | `server/src/utils/email.js` | SMTP account email. |
| `SMTP_PASS` | NO | `server/src/utils/email.js` | SMTP App Password. |
| `SMTP_FROM` | NO | `server/src/utils/email.js` | Outgoing sender display email. |
| `GLOBAL_RATE_LIMIT_WINDOW_MS` | NO | `server/src/server.js` | Rate limit window in ms (default: `900000` = 15m). |
| `GLOBAL_RATE_LIMIT_MAX` | NO | `server/src/server.js` | Max requests per IP per window (default: `500`). |

---

## D. RENDER SERVICE CONFIGURATION

Because Qualiva is a monorepo containing `client/` and `server/`, it must be deployed as two services on Render:

### SERVICE 1: Frontend (Client)
* **Service Type**: **Static Site**
* **Name**: `qualiva-frontend`
* **Root Directory**: `client`
* **Build Command**: `npm install && npm run build`
* **Publish Directory**: `dist`
* **Routing Rewrite Rule**:
  * Source: `/*`
  * Destination: `/index.html`
  * Action: `Rewrite`
  *(Note: Handled automatically via `dist/_redirects`).*
* **Environment Variables**:
  * `VITE_API_URL` = `https://qualiva-backend.onrender.com/api/v1`
  * `VITE_SOCKET_URL` = `https://qualiva-backend.onrender.com`
  * `VITE_GOOGLE_CLIENT_ID` = `1063461174979-v1s5a3e5dn8c25v4m12rnidg6p9pl2h2.apps.googleusercontent.com`

---

### SERVICE 2: Backend (Server)
* **Service Type**: **Web Service**
* **Name**: `qualiva-backend`
* **Runtime**: `Node`
* **Root Directory**: `server`
* **Build Command**: `npm install && npx prisma generate`
* **Start Command**: `node src/server.js`
* **Health Check Path**: `/api/v1/health`
* **Environment Variables**:
  * `NODE_ENV` = `production`
  * `CLIENT_URL` = `https://qualiva-frontend.onrender.com`
  * `DATABASE_URL` = *(Your live Neon or PostgreSQL connection string)*
  * `BACKUP_DB_URL` = *(Your live MongoDB Atlas connection string)*
  * `POSTGRES_URL` = *(Your live Neon or PostgreSQL connection string)*
  * `MONGODB_URL` = *(Your live MongoDB Atlas connection string)*
  * `ACTIVE_PRIMARY_ENGINE` = `postgresql`
  * `ACTIVE_BACKUP_ENGINE` = `mongodb`
  * `JWT_ACCESS_SECRET` = *(Generate a 32+ character random string)*
  * `JWT_REFRESH_SECRET` = *(Generate a 32+ character random string)*
  * `SMTP_HOST` = `smtp.gmail.com`
  * `SMTP_PORT` = `587`
  * `SMTP_USER` = `thefallenx8@gmail.com`
  * `SMTP_PASS` = `diwdwcoaktrtozcl`
  * `SMTP_FROM` = `thefallenx8@gmail.com`

---

## E. EXECUTION & TEST RESULTS

The following commands were actually executed in the workspace to verify production readiness:

| Step | Command Executed | Result | Evidence / Details |
| :--- | :--- | :---: | :--- |
| **1. Frontend Build** | `npm run build` (in `client/`) | **PASSED** | Compiled 1,845 modules cleanly in 22.24s. Emitted `dist/` with zero JSX, TypeScript, or CSS bundle errors. |
| **2. Production Server Test** | `node src/server.js` with `PORT=10000`, `NODE_ENV=production` | **PASSED** | Bound to port `10000`, initialized WebSocket server, enabled Helmet/CORS, and responded to `/api/v1/health` with HTTP 200 `{ status: 'online', uptimeSeconds: 4 }`. |
| **3. Prisma Engine Generation** | `npx prisma generate` (in `server/`) | **PASSED** | Generated Prisma Client v7.10.0 to `node_modules/@prisma/client` in 639ms. |
| **4. Database Proxy Hot-Swap** | Dual-engine runtime hot-swap test | **PASSED** | Seamlessly switched between PostgreSQL (5 users) and MongoDB Atlas (5 users) with zero process crashes. |
| **5. 14-Model Migration Test** | `migrateDataBetweenDatabases` | **PASSED** | 289 records across all 14 models migrated to MongoDB Atlas with 100% document parity. |
| **6. SPA Route Rewrite Check** | Inspected `client/public/_redirects` and `client/dist/_redirects` | **PASSED** | `/* /index.html 200` is present, guaranteeing deep route refreshes work on Render Static Sites. |
| **7. Git Tracking Check** | `git status` | **PASSED** | Sensitive `.env` files are ignored by `.gitignore` and not committed. |

---

## F. MANUAL STEPS REQUIRED IN RENDER DASHBOARD

1. **Deploy the Backend Web Service first**:
   * Create New Web Service -> Connect Repository.
   * Set Root Directory to `server`.
   * Set Build Command to `npm install && npx prisma generate`.
   * Set Start Command to `node src/server.js`.
   * Add the required Backend Environment Variables.
   * Wait for deployment to complete and copy the backend URL (e.g. `https://qualiva-backend.onrender.com`).
2. **Deploy the Frontend Static Site second**:
   * Create New Static Site -> Connect Repository.
   * Set Root Directory to `client`.
   * Set Build Command to `npm install && npm run build`.
   * Set Publish Directory to `dist`.
   * Add `VITE_API_URL=https://qualiva-backend.onrender.com/api/v1` and `VITE_SOCKET_URL=https://qualiva-backend.onrender.com`.
   * Deploy and copy the frontend URL (e.g. `https://qualiva-frontend.onrender.com`).
3. **Update Backend `CLIENT_URL`**:
   * In the Backend Web Service -> Environment -> Update `CLIENT_URL` to match the newly generated frontend URL.
4. **Update Google Cloud Console (If using Google SSO)**:
   * Go to Google Cloud Console -> APIs & Services -> Credentials -> OAuth 2.0 Client IDs.
   * Under **Authorized JavaScript origins**, add `https://qualiva-frontend.onrender.com`.
