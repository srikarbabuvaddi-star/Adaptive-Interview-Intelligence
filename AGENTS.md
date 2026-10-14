# Adaptive Interview Intelligence — Engineering Standards & Antigravity Directives

## 1. Permanent Core Directive

> **Never generate mock data, fake arrays, or sample seed scripts. All application data must pull exclusively from real user inputs, real database queries, or live external APIs.**

## 2. Production Data Architecture

1. **Strict Real Database Operations**:
   - Every read, create, update, and delete operation must target the persistent database (Cloud Firestore in production, structured via [`src/services/db/firestore.service.js`](file:///c:/Users/hi/Desktop/Adaptive%20Interview%20Intelligence/src/services/db/firestore.service.js)).
   - Do not inject placeholder objects, static arrays of jobs, hardcoded test personas, or fake scoring profiles.
   - Initialized database tables and collections must start completely clean and empty.

2. **Live Gemini AI Integration**:
   - Adaptive interviews, question generation, answer evaluations, and synthesized reports must be generated dynamically by Google Gemini (`@google/genai`) using the configured `GEMINI_API_KEY`.
   - Never simulate or fabricate answer evaluations or hiring recommendations. If the live AI service encounters an error or missing configuration, propagate an authentic error (`ApiError.aiServiceError`) and allow the client to retry.

3. **Strict User-Specific Multi-Tenant Isolation**:
   - Client-supplied IDs are never trusted as proof of ownership.
   - User identity must always be derived from verified server-side session tokens or Firebase ID tokens (`req.user.uid`).
   - Every interview, answer, transcript, telemetry event, and report must be strictly partitioned by `candidateId` and `recruiterId`.
   - Attempting cross-account access must always return `403 Forbidden`.

4. **Environment Variables**:
   - All credentials, secrets, database connection parameters, and API keys must be loaded exclusively through environment variables (`.env`).
   - Never hardcode sensitive fallback secrets or bypass authentication.

5. **Authentic Frontend States**:
   - The frontend must never pre-populate tables or dashboards with fake mock data.
   - New accounts with no interview history must always display the authentic empty state ("You haven't completed an interview yet") with a direct prompt to launch a session.
