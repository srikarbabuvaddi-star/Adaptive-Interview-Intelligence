# Adaptive Interview Intelligence — Backend API

> **AI-Powered Adaptive Interview Platform for Recruiters & Candidates**  
> Hackathon Project | Node.js • Express.js • Firebase Auth • Cloud Firestore • Google Gemini API

---

## 🌟 Executive Summary

**Adaptive Interview Intelligence** is an enterprise-grade backend service powering next-generation technical assessments. Unlike traditional static question banks, our platform dynamically adapts interview difficulty in real-time using Google's **Gemini AI**, evaluating conceptual accuracy, depth, and communication skills to generate precise follow-up questions tailored to candidate answers.

### Core Highlights
- **Server-Controlled Interview State Machine**: Guarantees interview integrity with server-side timers, difficulty adaptation, and duplicate-submission protection.
- **Trusted Role-Based Authorization (RBAC)**: Strict server-side verification using Firebase Admin SDK and Firestore user claims (`candidate` vs `recruiter`). Never trusts frontend role declarations.
- **Comprehensive Firestore Database Design**: 10 distinct collections with document relationships, audit timestamps, and security rules.
- **Clean AI Service Interface**: Decoupled interface supporting Google Gemini (`gemini-2.5-flash`) via the official `@google/genai` SDK or customizable teammate microservice endpoints.
- **Integrity & Proctoring Auditing**: Logs tab switches, window blur events, and fullscreen exits to compute objective integrity scores.
- **Skill Gap & Hiring Reports**: Automatically synthesizes candidate performance into readiness metrics, skill gap breakdowns, and structured hiring recommendations (`strong_hire`, `hire`, etc.).

---

## 🏛️ System Architecture

```
[ React Frontend ]
       │
       │ Firebase ID Token (Bearer)
       ▼
[ Express.js REST API ] ─── Helmet / CORS / Rate Limiter
       │
       ├── Auth Middleware ────> Firebase Admin SDK (Token Verification)
       ├── Role Middleware ────> Cloud Firestore (Server-Side Role Check)
       │
       ├── Services Layer
       │     ├── UserService
       │     ├── JobService
       │     ├── ApplicationService
       │     ├── InterviewService (Adaptive State Machine)
       │     └── ReportService
       │
       ├── AI Engine Interface ───> Google Gemini API (@google/genai)
       │                              OR Custom Teammate AI Engine
       │
       └── Cloud Firestore ───────> 10 Collections (Persistent Storage)
```

---

## 📁 Project Directory Structure

```
Adaptive Interview Intelligence/
├── src/
│   ├── app.js                          # Express app configuration & middlewares
│   ├── server.js                       # Server entry point & graceful shutdown
│   ├── config/
│   │   ├── env.js                      # Centralized environment variable loader
│   │   ├── firebase.js                 # Firebase Admin SDK & DB initialization
│   │   └── inMemoryStore.js            # In-memory Firestore & Auth mock engine
│   ├── constants/
│   │   ├── roles.js                    # User roles (candidate, recruiter, admin)
│   │   ├── interviewStatus.js          # Session states & integrity event types
│   │   └── errorCodes.js               # Standardized error codes
│   ├── controllers/
│   │   ├── auth.controller.js          # Registration & profile controller
│   │   ├── job.controller.js           # Job CRUD operations controller
│   │   ├── application.controller.js   # Application workflow controller
│   │   ├── interview.controller.js     # Interview lifecycle controller
│   │   └── report.controller.js        # Report & analytics controller
│   ├── middlewares/
│   │   ├── auth.middleware.js          # Firebase ID-token verification
│   │   ├── role.middleware.js          # RBAC enforcement middleware
│   │   ├── validate.middleware.js      # Zod request validation middleware
│   │   ├── rateLimiter.middleware.js   # DDoS & abuse prevention limiters
│   │   └── errorHandler.middleware.js  # Global centralized error handler
│   ├── routes/
│   │   ├── auth.routes.js              # /api/auth
│   │   ├── user.routes.js              # /api/users
│   │   ├── job.routes.js               # /api/jobs
│   │   ├── application.routes.js       # /api/applications
│   │   ├── interview.routes.js         # /api/interviews
│   │   ├── report.routes.js            # /api/reports
│   │   └── index.js                    # Router hub & health check
│   ├── schemas/
│   │   ├── auth.schema.js              # Zod validation for user registration
│   │   ├── user.schema.js              # Zod validation for profile updates
│   │   ├── job.schema.js               # Zod validation for jobs & filters
│   │   ├── application.schema.js       # Zod validation for applications
│   │   ├── interview.schema.js         # Zod validation for interview actions
│   │   └── integrity.schema.js         # Zod validation for proctoring events
│   ├── services/
│   │   ├── ai/
│   │   │   ├── ai.interface.js         # Abstract IAIEngineService interface
│   │   │   ├── gemini.service.js       # Gemini API implementation & fallback
│   │   │   └── index.js                # AI provider factory
│   │   ├── intelligence/
│   │   │   ├── rubric.js               # 4-dimension scoring rubric & validator
│   │   │   ├── skillGap.service.js     # Multi-source skill-gap intelligence
│   │   │   ├── integrity.service.js    # Proctoring telemetry & timeline analysis
│   │   │   └── evidenceReport.service.js # Evidence-linked report generator
│   │   ├── db/
│   │   │   └── firestore.service.js    # Firestore collection definitions
│   │   ├── user.service.js             # User & profile business logic
│   │   ├── job.service.js              # Job listings business logic
│   │   ├── application.service.js      # Application processing logic
│   │   ├── interview.service.js        # Interview lifecycle state machine
│   │   └── report.service.js           # Analytics & report synthesis
│   └── utils/
│       ├── apiError.js                 # Custom ApiError class
│       ├── apiResponse.js              # Standard API response builder
│       └── logger.js                   # Structured application logger
├── tests/
│   ├── auth.test.js                    # Auth & profile endpoint tests
│   ├── jobs.test.js                    # Job management & authorization tests
│   ├── applications.test.js            # Application lifecycle tests
│   ├── interviews.test.js              # Full adaptive interview lifecycle tests
│   ├── reports.test.js                 # Report & skill gap analysis tests
│   ├── aiService.test.js               # AI Engine service unit tests
│   ├── rubric.test.js                  # Scoring rubric & AI output sanitization tests
│   ├── skillGap.test.js                # Evidence vs resume skill gap analysis tests
│   ├── integrityIntelligence.test.js   # Integrity timeline & anomaly detection tests
│   ├── evidenceReport.test.js          # Evidence citation & synthesis tests
│   ├── edgeCasesAndResilience.test.js  # Edge cases, empty states & security tests
│   ├── e2eInterviewWorkflow.test.js    # Full 12-step end-to-end integration test
│   └── testHelper.js                   # Test token & fixture helpers
├── docs/
│   ├── api-documentation.md            # Complete API spec with request/response JSON
│   ├── firestore-schema.md             # Detailed 10-collection schema & indexing
│   ├── firebase-setup.md               # Step-by-step Firebase & GCP setup
│   ├── frontend-integration-guide.md   # React frontend integration instructions
│   ├── deployment-guide.md             # Cloud Run, Docker & Render deployment guide
│   └── e2e-testing-procedure.md        # 12-step QA test procedure & verification guide
├── firestore.rules                     # Production Firestore Security Rules
├── Dockerfile                          # Production container image definition
├── .dockerignore                       # Docker build exclusions
├── .env.example                        # Template for environment configuration
├── jest.config.js                      # Jest testing configuration
└── package.json                        # Dependencies and scripts
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v18.x or higher (Tested on Node v24)
- **npm**: v9.x or higher
- **Google Cloud / Firebase Project** (optional for local mock testing)

### 2. Installation
```bash
git clone https://github.com/your-org/adaptive-interview-intelligence.git
cd "adaptive-interview-intelligence"
npm install
```

### 3. Environment Configuration
Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
```

Edit `.env` with your settings:
```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Firebase credentials (choose Option A or B)
# Option A: Path to serviceAccountKey.json
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json

# Option B: Direct credentials
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...==\n-----END PRIVATE KEY-----\n"

# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

> **Note on Local Offline Testing**: If you don't have Firebase or Gemini credentials configured yet, the backend automatically enables its built-in in-memory emulator and adaptive algorithmic engine. You can run all endpoints and tests immediately out of the box!

### 4. Start the Server
```bash
# Development with hot-reload
npm run dev

# Production
npm start
```

Server will start on: `http://localhost:5000`  
Health check: `http://localhost:5000/api/health`

---

## 🧪 Automated Testing

The repository includes a comprehensive automated test suite covering authentication, RBAC authorization, job management, the adaptive interview state machine, proctoring, and report generation.

Run the test suite:
```bash
npm test
```

### Test Results
```text
PASS tests/aiService.test.js
  AI Engine Service Integration
    √ should generate first interview question matching job specifications
    √ should evaluate candidate answer and adaptively generate next question with difficulty scaling
    √ should synthesize interview transcript and integrity events into final report

PASS tests/e2eInterviewWorkflow.test.js
  Full End-to-End 12-Step Adaptive Interview Integration Workflow (9 passed)

PASS tests/interviews.test.js
  Adaptive Interview Lifecycle APIs (7 passed)

PASS tests/edgeCasesAndResilience.test.js
  Quality Assurance: Edge Cases, Resilience & Access Control (10 passed)

PASS tests/reports.test.js
  Interview Reports and Skill Gap Analysis APIs (5 passed)

PASS tests/jobs.test.js
  Job Management APIs (7 passed)

PASS tests/applications.test.js
  Application Lifecycle APIs (6 passed)

PASS tests/auth.test.js
  Authentication & Profile Management APIs (5 passed)

PASS tests/integrityIntelligence.test.js
  Interview Integrity Intelligence Unit Tests (6 passed)

PASS tests/evidenceReport.test.js
  Evidence-Based Report Generation Unit Tests (3 passed)

PASS tests/aiService.test.js
  AI Engine Service Integration (3 passed)

PASS tests/skillGap.test.js
  Skill-Gap Intelligence Unit Tests (4 passed)

PASS tests/rubric.test.js
  Evaluation Rubric & AI Output Validation Unit Tests (9 passed)

Test Suites: 12 passed, 12 total
Tests:       74 passed, 74 total (100% pass rate)
```

---

## ⚖️ Evaluation Rubric & Intelligence Standards

Our intelligence layer enforces a standardized rubric across four evaluation dimensions:
- **Conceptual Accuracy (35%)**: Technical correctness, terminology, and domain precision.
- **Depth & Trade-offs (30%)**: Consideration of scalability, performance bottlenecks, concurrency, and architecture alternatives.
- **Practical Implementation (20%)**: Awareness of real-world patterns, error recovery, and production resilience.
- **Communication Clarity (15%)**: Problem decomposition and structured articulation.

### Assessment Status & Scoring Rules
- `demonstrated`: Score ≥ 7.0 / 10 (meets/exceeds expectations).
- `partially_demonstrated`: Score 4.5 – 6.9 / 10 (basic competence with gaps).
- `not_demonstrated`: Score < 4.5 / 10 (failed to demonstrate core concepts).
- `not_assessed`: Zero questions evaluated this skill during the session. **Absence of evidence is never treated as lack of skill.** Neutral gap (0%) and 0.0 confidence applied.

---

## 📡 REST API Summary

For full details, JSON payloads, and schemas, see [docs/api-documentation.md](docs/api-documentation.md).

| Method | Endpoint | Role | Description |
|---|---|---|---|
| `GET` | `/api/health` | Public | Service health & status |
| `POST` | `/api/auth/register` | Auth | Assign role & profile in Firestore |
| `GET` | `/api/users/me` | Auth | Retrieve current profile |
| `PATCH` | `/api/users/me` | Auth | Update current profile |
| `POST` | `/api/jobs` | Recruiter | Create a new job with required skills |
| `GET` | `/api/jobs` | Any Auth | List jobs (candidates: published, recruiters: own) |
| `GET` | `/api/jobs/:jobId` | Any Auth | Retrieve job details |
| `PATCH` | `/api/jobs/:jobId` | Recruiter Owner | Update job details |
| `DELETE` | `/api/jobs/:jobId` | Recruiter Owner | Delete job listing |
| `POST` | `/api/jobs/:jobId/applications` | Candidate | Apply for a published job |
| `GET` | `/api/jobs/:jobId/applications` | Recruiter Owner | View applications for a job |
| `GET` | `/api/applications/me` | Candidate | View my job applications |
| `PATCH` | `/api/applications/:appId/status`| Recruiter Owner | Update application status |
| `POST` | `/api/interviews` | Recruiter Owner | Schedule interview session |
| `GET` | `/api/interviews` | Any Auth | List interviews for current user |
| `GET` | `/api/interviews/:interviewId` | Owner | Retrieve interview state |
| `POST` | `/api/interviews/:interviewId/start` | Candidate Owner | Begin interview & generate 1st question |
| `POST` | `/api/interviews/:interviewId/answers`| Candidate Owner | Submit answer, evaluate & get next question |
| `POST` | `/api/interviews/:interviewId/end` | Owner | Conclude interview & trigger report |
| `POST` | `/api/interviews/:interviewId/integrity-events`| Candidate Owner | Log proctoring events (tab switch, etc.) |
| `GET` | `/api/interviews/:interviewId/integrity-timeline`| Owner | Retrieve chronological integrity timeline |
| `PATCH` | `/api/interviews/:interviewId/integrity-events/:eventId/review`| Recruiter Owner | Review/flag/dismiss integrity events |
| `GET` | `/api/interviews/:interviewId/skill-gap`| Owner | Dedicated evidence-based skill gap analysis |
| `GET` | `/api/interviews/:interviewId/report` | Owner | Retrieve final report & skill gap analysis |
| `GET` | `/api/jobs/:jobId/reports` | Recruiter Owner | Rank & view all candidate reports for job |

---

## 🎙️ Voice-Based AI Interview Frontend

The repository includes a modern, high-performance React + Vite frontend application located in `frontend/`. It directly integrates with the Express backend to deliver real-time voice-driven AI technical interviews.

### Core Voice Capabilities
- **AI Text-To-Speech (TTS)**: Questions generated by Google Gemini are spoken aloud to the candidate using the browser's `SpeechSynthesis` API.
- **Speech-To-Text (STT)**: Spoken answers are captured via `SpeechRecognition` / `webkitSpeechRecognition`, transcribed with live deduplication, and displayed in real-time.
- **Audio Visualizer**: Dynamic animated waveform visualizer reflecting AI speech and candidate speaking states.
- **Interview State Machine**:
  `READY → STARTING → AI_SPEAKING → LISTENING → PROCESSING → EVALUATING → NEXT_QUESTION → COMPLETED`
- **Audio Safeguards**:
  - The AI does not listen to its own spoken question (speech recognition is paused during TTS playback).
  - Candidates can **Repeat Question**, **Pause/Resume Speaking**, and **Clear & Retry** their answer.
  - Automatic fallback to typed answers if microphone permissions are denied or if browser lacks native SpeechRecognition.
- **Real-Time Proctoring Telemetry**: Automatically records window blur and tab-switching events to the backend's integrity timeline.
- **Final Evidence Report**: Displays overall score, recommendation badge, skill competency breakdown, evidence-linked strengths/weaknesses, and question-by-question spoken transcript.

### Browser Compatibility
- **Google Chrome & Microsoft Edge** (Desktop & Mobile): Full voice support (TTS + native STT).
- **Safari & Firefox**: Full TTS playback support with manual text-answer fallback for speech input.
- **HTTPS Requirement**: When deployed to production, microphone access requires an HTTPS origin.

### Quick Start: Running Frontend & Backend

```bash
# 1. Start the Express Backend (Port 5000)
npm run dev

# 2. In a second terminal, start the Voice Frontend (Port 5173)
npm run frontend:dev
```

Open `http://localhost:5173` in Google Chrome or Microsoft Edge.

### Frontend Environment Configuration

In `frontend/.env`:
```env
VITE_API_BASE_URL=http://localhost:5000
```
> **Security Note**: No API keys (Gemini, Firebase Admin) are exposed to the browser. All Gemini AI calls and database transactions are processed strictly on the Express backend.

---

## 🔒 Security & Privacy Guarantees

1. **Server-Side Token Verification**: Every protected route decodes and validates Firebase ID tokens via the Firebase Admin SDK.
2. **Server-Side Role Truth**: Roles are loaded directly from trusted Firestore user documents. Frontend role assertions are discarded.
3. **Strict Resource Ownership**: Cross-account access is blocked (candidates can only access their own records; recruiters can only manage their own jobs and candidates).
4. **Anti-Cheating Safeguards**: Grading rubrics and expected key points are stripped from the response returned to candidates during active interviews.
5. **Duplicate-Submission Prevention**: The backend verifies question active state and rejects duplicate answers with HTTP 409 Conflict.
6. **Rate Limiting & Headers**: Configured with `helmet`, `cors`, and `express-rate-limit`.

---

## 📚 Documentation Directory

- 📖 [REST API Reference](docs/api-documentation.md)
- 🗄️ [Firestore Schema & Indexing Guide](docs/firestore-schema.md)
- 🔐 [Firebase & Google Cloud Setup](docs/firebase-setup.md)
- ⚛️ [React Frontend Integration Guide](docs/frontend-integration-guide.md)
- ☁️ [Production Deployment Guide](docs/deployment-guide.md)
- 🧪 [End-to-End Testing & Verification Procedure](docs/e2e-testing-procedure.md)
- 🛡️ [Firestore Security Rules](firestore.rules)
