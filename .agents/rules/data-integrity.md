# Antigravity Rule: Real Data Integrity & Anti-Mock Directives

## Permanent Instruction for Active and Future Agents

> **Never generate mock data, fake arrays, or sample seed scripts. All application data must pull exclusively from real user inputs, real database queries, or live external APIs.**

---

### Mandatory Requirements:

1. **No Simulated Fallbacks**:
   - Never inject placeholder arrays, synthetic responses, or fake scoring profiles.
   - If a live API (such as Google Gemini) encounters an error, rate limit, or missing credentials, propagate an authentic error (`ApiError.aiServiceError`) so the client can retry cleanly. Never fabricate AI evaluations or hiring decisions.

2. **Persistent Database Exclusivity**:
   - All user data, jobs, interviews, transcripts, telemetry events, and reports must be stored and queried from the configured database (Cloud Firestore).
   - Database tables and collections must initialize clean and empty without automated seed scripts.

3. **Strict User-Specific Multi-Tenant Isolation**:
   - Never trust frontend-supplied user IDs. Extract user identity strictly from verified server-side session tokens or Firebase Admin ID tokens.
   - Always enforce ownership checks (`403 Forbidden` on unauthorized cross-user access).

4. **Environment Variables**:
   - Secrets, database connection parameters, and API keys must be loaded exclusively through environment variables (`.env`). Never hardcode fallback secrets.
