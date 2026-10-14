# Repeatable End-to-End Testing Procedure & QA Report

Platform: **Adaptive Interview Intelligence**  
Layer: **Intelligence, Reporting, and Quality Assurance**  
Test Runner: **Jest v29 (Node.js Test Environment)**  
Date of Verification: **October 11, 2026**

---

## 1. Scope of Verification

This document specifies the repeatable end-to-end (E2E) testing procedure that validates the complete 12-step adaptive interview lifecycle across the intelligence, reporting, and backend layers.

### Verified System Roles:
- **Recruiter**: Job creation, skill definition, interview scheduling, candidate ranking, integrity timeline review.
- **Candidate**: Job discovery, application submission, adaptive interview session, real-time proctoring telemetry.

---

## 2. Test Execution Command

Run the complete test suite:
```bash
npm test
```

To run only the E2E workflow integration test:
```bash
npx jest tests/e2eInterviewWorkflow.test.js --runInBand --verbose
```

To run the intelligence unit tests:
```bash
npx jest tests/rubric.test.js tests/skillGap.test.js tests/integrityIntelligence.test.js tests/evidenceReport.test.js --runInBand --verbose
```

---

## 3. The 12-Step Real Workflow Test Procedure

| Step # | Action | Calling Identity | API Endpoint | Expected Response / Verifications | Status |
|---|---|---|---|---|---|
| **Step 1 & 2** | Recruiter registers and defines job with required skills and criteria | Recruiter | `POST /api/jobs` | HTTP 201 Created. Job ID generated with required skills and rubric criteria. | PASS |
| **Step 3** | Candidate registers, applies, and receives authorized interview session | Candidate & Recruiter | `POST /api/jobs/:id/applications`<br>`POST /api/interviews` | HTTP 201 Created. Application created; Interview session scheduled (`status: scheduled`). | PASS |
| **Step 4 & 5** | Candidate starts session; AI engine generates first question | Candidate | `POST /api/interviews/:id/start` | HTTP 200 OK. Session advances to `in_progress`; Q1 generated with difficulty and time limit. Grading rubric stripped. | PASS |
| **Step 6** | Candidate submits answer 1 | Candidate | `POST /api/interviews/:id/answers` | HTTP 200 OK. Answer saved; Evaluated against rubric; Next question dynamically generated. | PASS |
| **Step 7 & 8** | AI adapts difficulty and backend persists evidence | System Engine | Internal Service Pipeline | Evaluation saved to `skill_evaluations`; adaptive state updated. Duplicate submissions blocked. | PASS |
| **Step 9** | Proctoring telemetry logged | Candidate Interface | `POST /api/interviews/:id/integrity-events` | HTTP 201 Created. Chronological event logged with timestamp and duration. | PASS |
| **Step 10** | Candidate submits final answer; session concludes | Candidate | `POST /api/interviews/:id/answers` | HTTP 200 OK. `isInterviewComplete: true`; Final reports generated and stored. | PASS |
| **Step 11** | Candidate accesses permitted interview information | Candidate | `GET /api/interviews/:id/report` | HTTP 200 OK. Overall score, strengths, and transcript visible. Recruiter-only decision notes redacted. | PASS |
| **Step 12** | Recruiter views evidence-based report & decision support | Recruiter | `GET /api/interviews/:id/report` | HTTP 200 OK. Full decision support, recommendation, evidence citations, and progression visible. | PASS |
| **Step 12+** | Recruiter reviews dedicated integrity timeline | Recruiter | `GET /api/interviews/:id/integrity-timeline`<br>`PATCH /api/interviews/:id/integrity-events/:eventId/review` | HTTP 200 OK. Chronological timeline retrieved; Recruiter updates review status to `reviewed`. | PASS |

---

## 4. Actual Automated Test Results

```text
PASS tests/e2eInterviewWorkflow.test.js
  Full End-to-End 12-Step Adaptive Interview Integration Workflow
    √ Step 1 & 2: Recruiter registers and defines job with required skills & rubric criteria (110 ms)
    √ Step 3: Candidate registers, applies, and receives authorized interview session (37 ms)
    √ Step 4 & 5: Candidate starts interview session and receives first AI question (15 ms)
    √ Step 6, 7 & 8: Candidate submits answer 1, AI evaluates, adapts next question, persists evidence (14 ms)
    √ Step 9: Proctoring / integrity telemetry is recorded and processed into timeline (12 ms)
    √ Step 10: Candidate submits answer 2, completing interview and triggering final evidence report (18 ms)
    √ Step 11: Candidate views their report, seeing only permitted information (18 ms)
    √ Step 12: Recruiter views comprehensive evidence-based report, progression, and decision support (13 ms)
    √ Step 12 (bonus): Recruiter views dedicated integrity timeline and reviews an event (49 ms)

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

================================================================================
Test Suites: 12 passed, 12 total
Tests:       74 passed, 74 total
Snapshots:   0 total
Time:        5.305 s
================================================================================
```

---

## 5. Failure Scenarios and Mitigations Tested

1. **Missing Evidence & Unassessed Skills**:
   - *Test*: Assessed only 1 of 3 required job skills.
   - *Result*: The unassessed skill is marked `not_assessed` with a neutral `gapScore = 0` and `confidence = 0.0`. It does NOT mark the candidate as deficient.
2. **Malformed or Out-of-Range AI Output**:
   - *Test*: Fuzzed score input with `15.0`, `-5.0`, `NaN`, and `null`.
   - *Result*: Sanitizer clamped scores safely to [0.0, 10.0] and substituted neutral fallback scores on NaN/null without server crash.
3. **Cheating Accusation Guardrail**:
   - *Test*: Candidate had 1 isolated tab switch for 1.5 seconds.
   - *Result*: Analyzed as `low` risk; zero cheating flags; marked as typical browser behavior.
4. **Duplicate Submission Protection**:
   - *Test*: Candidate attempted to resubmit an answer to Question 1 while Question 2 was active.
   - *Result*: Blocked with HTTP 400 Bad Request / HTTP 409 Conflict.
5. **Unauthorized Candidate Inspection**:
   - *Test*: Candidate B attempted to read Candidate A's interview report.
   - *Result*: Blocked with HTTP 403 Forbidden.
