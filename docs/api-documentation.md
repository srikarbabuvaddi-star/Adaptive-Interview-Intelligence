# Adaptive Interview Intelligence — REST API Documentation

Base URL: `http://localhost:5000/api`  
Content-Type: `application/json`

---

## 1. Authentication & Security

All protected routes require a Bearer token in the `Authorization` header:
```http
Authorization: Bearer <Firebase_ID_Token>
```

### Standard Response Format
```json
{
  "success": true,
  "message": "Success message",
  "data": { ... },
  "meta": { ... } // optional pagination info
}
```

### Standard Error Format
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error description",
    "details": null
  }
}
```

---

## 2. Authentication & User Profile APIs

### 2.1 Complete Registration
- **Method & Route**: `POST /api/auth/register`
- **Access**: Authenticated Firebase user
- **Description**: Assigns verified role and initial profile in Firestore after Firebase client signup.

**Request Body (Candidate):**
```json
{
  "role": "candidate",
  "displayName": "Jane Doe",
  "candidateProfile": {
    "skills": ["React", "Node.js", "Docker"],
    "experienceYears": 3,
    "headline": "Full Stack Engineer",
    "bio": "Enthusiastic about distributed cloud apps",
    "resumeUrl": "https://example.com/resume.pdf"
  }
}
```

**Request Body (Recruiter):**
```json
{
  "role": "recruiter",
  "displayName": "Mark Sloan",
  "recruiterProfile": {
    "companyName": "TechCorp Global",
    "companyWebsite": "https://techcorp.com",
    "department": "Engineering Talent"
  }
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "uid": "usr_12345",
    "email": "user@example.com",
    "displayName": "Jane Doe",
    "role": "candidate",
    "candidateProfile": { ... },
    "createdAt": "2026-10-11T12:00:00.000Z"
  }
}
```

---

### 2.2 Get Current User Profile
- **Method & Route**: `GET /api/users/me`
- **Access**: Authenticated user

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Profile retrieved successfully",
  "data": {
    "uid": "usr_12345",
    "email": "user@example.com",
    "displayName": "Jane Doe",
    "role": "candidate",
    "candidateProfile": { ... }
  }
}
```

---

### 2.3 Update Current User Profile
- **Method & Route**: `PATCH /api/users/me`
- **Access**: Authenticated user
- **Security**: Role cannot be altered via this endpoint.

**Request Body:**
```json
{
  "displayName": "Jane A. Doe",
  "candidateProfile": {
    "headline": "Lead Full Stack Engineer"
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": { ... }
}
```

---

## 3. Job Management APIs

### 3.1 Create Job Posting
- **Method & Route**: `POST /api/jobs`
- **Access**: Recruiter only (`role: 'recruiter'`)

**Request Body:**
```json
{
  "title": "Senior Distributed Systems Engineer",
  "description": "Design resilient microservices, consensus engines, and event streams.",
  "department": "Core Platform",
  "location": "Remote",
  "employmentType": "full-time",
  "requiredSkills": [
    { "name": "Distributed Systems", "minimumLevel": "advanced", "weight": 3 },
    { "name": "Go", "minimumLevel": "intermediate", "weight": 2 }
  ],
  "evaluationCriteria": [
    "Raft consensus and leader election",
    "Fault recovery and concurrency control"
  ],
  "status": "published",
  "maxQuestions": 4,
  "targetDurationMinutes": 25
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Job posting created successfully",
  "data": {
    "id": "job_9988",
    "recruiterId": "recruiter_uid",
    "title": "Senior Distributed Systems Engineer",
    "status": "published",
    "createdAt": "2026-10-11T12:00:00.000Z"
  }
}
```

---

### 3.2 List Jobs
- **Method & Route**: `GET /api/jobs?page=1&limit=10&search=system&department=Core Platform`
- **Access**: Candidates (only see published jobs), Recruiters (see their created jobs)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Jobs retrieved successfully",
  "data": [
    {
      "id": "job_9988",
      "title": "Senior Distributed Systems Engineer",
      "department": "Core Platform",
      "status": "published",
      "requiredSkills": [ ... ]
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### 3.3 Get Job by ID
- **Method & Route**: `GET /api/jobs/:jobId`
- **Access**: Candidates (if published), Recruiter owner

---

### 3.4 Update Job
- **Method & Route**: `PATCH /api/jobs/:jobId`
- **Access**: Recruiter owner only

---

### 3.5 Delete Job
- **Method & Route**: `DELETE /api/jobs/:jobId`
- **Access**: Recruiter owner only

---

## 4. Application Lifecycle APIs

### 4.1 Apply for a Job
- **Method & Route**: `POST /api/jobs/:jobId/applications`
- **Access**: Candidate only
- **Validation**: Rejects duplicate applications for the same job.

**Request Body:**
```json
{
  "resumeUrl": "https://example.com/resume.pdf",
  "coverNote": "Specialized in distributed consensus algorithms.",
  "candidateSkills": ["Go", "Distributed Systems", "Kubernetes"]
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Application submitted successfully",
  "data": {
    "id": "app_5544",
    "jobId": "job_9988",
    "candidateId": "cand_123",
    "status": "pending",
    "createdAt": "2026-10-11T12:05:00.000Z"
  }
}
```

---

### 4.2 List Applications for Job
- **Method & Route**: `GET /api/jobs/:jobId/applications`
- **Access**: Recruiter owner only

---

### 4.3 List My Applications
- **Method & Route**: `GET /api/applications/me`
- **Access**: Candidate only

---

### 4.4 Update Application Status
- **Method & Route**: `PATCH /api/applications/:applicationId/status`
- **Access**: Recruiter owner only

**Request Body:**
```json
{
  "status": "interview_invited"
}
```

---

## 5. Interview Lifecycle APIs

### 5.1 Create / Schedule Interview Session
- **Method & Route**: `POST /api/interviews`
- **Access**: Recruiter only
- **Validation**: Prevents duplicate active sessions for same candidate and job.

**Request Body:**
```json
{
  "jobId": "job_9988",
  "candidateId": "cand_123",
  "applicationId": "app_5544"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Interview session created successfully",
  "data": {
    "id": "int_7766",
    "jobId": "job_9988",
    "candidateId": "cand_123",
    "status": "scheduled",
    "currentQuestionIndex": 0,
    "totalQuestions": 4
  }
}
```

---

### 5.2 Start Interview Session (Generate 1st Question)
- **Method & Route**: `POST /api/interviews/:interviewId/start`
- **Access**: Assigned candidate only
- **Rate Limit**: 30 req/minute
- **Description**: Advances session state to `in_progress`, triggers Gemini AI to synthesize first question based on job skills, and returns question to candidate without evaluation rubrics.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Interview session started. First question generated.",
  "data": {
    "interviewId": "int_7766",
    "status": "in_progress",
    "questionIndex": 1,
    "totalQuestions": 4,
    "currentQuestion": {
      "id": "q_1122",
      "questionIndex": 1,
      "questionText": "Can you explain how leader election functions in the Raft consensus protocol and what happens when network partitions occur?",
      "skill": "Distributed Systems",
      "difficulty": "intermediate",
      "timeLimitSeconds": 180
    }
  }
}
```

---

### 5.3 Submit Answer (Adaptive AI Grading & Progression)
- **Method & Route**: `POST /api/interviews/:interviewId/answers`
- **Access**: Assigned candidate only
- **Security**: Duplicate submissions for the same question are rejected.

**Request Body:**
```json
{
  "questionId": "q_1122",
  "answerText": "In Raft, followers transition to candidate upon election timer timeouts and solicit votes across peers with term IDs. Quorum requirements ensure only one leader per term. During partitions, the minority partition cannot achieve quorum and rejects commits, preserving linearizability.",
  "timeTakenSeconds": 52
}
```

**Response (Interview Continues - 200 OK):**
```json
{
  "success": true,
  "message": "Answer submitted and evaluated successfully",
  "data": {
    "isInterviewComplete": false,
    "evaluation": {
      "score": 9,
      "feedback": "Outstanding precision regarding split-brain prevention and quorum commits.",
      "strengths": ["Correct quorum logic", "Clear state transition flow"],
      "weaknesses": []
    },
    "nextQuestion": {
      "id": "q_1123",
      "questionIndex": 2,
      "totalQuestions": 4,
      "questionText": "How would you optimize log compaction and snapshotting to avoid blocking real-time client requests in Go?",
      "skill": "Go",
      "difficulty": "advanced",
      "timeLimitSeconds": 180
    }
  }
}
```

**Response (Interview Completes - 200 OK):**
```json
{
  "success": true,
  "message": "Answer submitted and evaluated successfully",
  "data": {
    "isInterviewComplete": true,
    "evaluation": {
      "score": 8,
      "feedback": "Solid answer closing the session."
    },
    "message": "Interview session completed. Comprehensive reports have been generated.",
    "reportId": "rep_9900",
    "overallScore": 86
  }
}
```

---

### 5.4 Log Proctoring / Integrity Event
- **Method & Route**: `POST /api/interviews/:interviewId/integrity-events`
- **Access**: Assigned candidate only

**Request Body:**
```json
{
  "eventType": "tab_switch",
  "details": {
    "durationMs": 1800,
    "unfocusedAt": "2026-10-11T12:15:30.000Z"
  },
  "severity": "medium"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Integrity event logged",
  "data": {
    "id": "evt_3321",
    "interviewId": "int_7766",
    "eventType": "tab_switch",
    "severity": "medium",
    "timestamp": "2026-10-11T12:15:32.000Z"
  }
}
```

---

### 5.5 End Interview Early
- **Method & Route**: `POST /api/interviews/:interviewId/end`
- **Access**: Candidate or Recruiter owner

**Request Body:**
```json
{
  "reason": "candidate_completed"
}
```

---

### 5.6 Get Chronological Integrity Timeline
- **Method & Route**: `GET /api/interviews/:interviewId/integrity-timeline`
- **Access**: Candidate or Recruiter owner
- **Description**: Returns strictly ordered events with review statuses and pattern risk summary.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Integrity timeline retrieved successfully",
  "data": {
    "interviewId": "int_7766",
    "timeline": [
      {
        "sequenceIndex": 1,
        "id": "evt_3321",
        "timestamp": "2026-10-11T12:15:32.000Z",
        "eventType": "tab_switch",
        "eventSource": "browser_window",
        "severity": "low",
        "confidence": 0.95,
        "explanation": "Browser window lost focus for 1.2 seconds.",
        "reviewStatus": "reviewed"
      }
    ],
    "analysis": {
      "integrityScore": 95,
      "riskLevel": "low",
      "requiresHumanReview": false,
      "observedFacts": ["Total telemetry events logged: 1"],
      "recruiterSummary": "Telemetry indicates standard interview session engagement with no significant integrity anomalies."
    }
  }
}
```

---

### 5.7 Review Integrity Event Flag
- **Method & Route**: `PATCH /api/interviews/:interviewId/integrity-events/:eventId/review`
- **Access**: Recruiter owner only
- **Description**: Allows recruiter to review, flag, or dismiss an observed event with human notes.

**Request Body:**
```json
{
  "reviewStatus": "reviewed",
  "reviewNotes": "Candidate checked authorized documentation tab."
}
```

---

### 5.8 Dedicated Evidence-Based Skill Gap Analysis
- **Method & Route**: `GET /api/interviews/:interviewId/skill-gap`
- **Access**: Candidate or Recruiter owner
- **Description**: Compares required vs claimed vs demonstrated abilities with evidence citations and confidence metrics.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Skill gap analysis retrieved successfully",
  "data": {
    "readinessScore": 86,
    "skillsAssessedCount": 2,
    "skillsUnassessedCount": 1,
    "skillsDemonstratedCount": 2,
    "skills": [
      {
        "skill": "Distributed Systems",
        "isRequired": true,
        "requiredProficiency": "advanced",
        "assessmentStatus": "demonstrated",
        "demonstratedScore": 8.5,
        "demonstratedProficiency": "advanced",
        "gapScore": 0,
        "confidence": 0.80,
        "evidence": [
          {
            "questionId": "q_1122",
            "questionIndex": 1,
            "questionText": "Can you explain how leader election...",
            "answerExcerpt": "In Raft, followers transition to candidate...",
            "score": 8.5
          }
        ]
      }
    ],
    "recommendedFollowUps": [
      {
        "skill": "PostgreSQL",
        "reason": "Required skill not assessed during adaptive session",
        "recommendation": "Conduct a targeted follow-up technical inquiry for PostgreSQL."
      }
    ]
  }
}
```

---

## 6. Reports & Analytics APIs

### 6.1 Get Interview Report & Skill Gap Analysis
- **Method & Route**: `GET /api/interviews/:interviewId/report`
- **Access**: Assigned Candidate or Job Recruiter owner

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Interview report retrieved successfully",
  "data": {
    "report": {
      "id": "rep_9900",
      "overallScore": 86,
      "summary": "Candidate exhibited senior-level competence in distributed protocols and systems engineering.",
      "strengths": [
        "Rigorous grasp of consensus models",
        "Clear articulation of concurrency safeguards"
      ],
      "areasForImprovement": [
        "Quantitative memory benchmarking"
      ],
      "skillBreakdown": [
        {
          "skill": "Distributed Systems",
          "score": 90,
          "weight": 3,
          "levelDemonstrated": "advanced",
          "feedback": "Mastery of quorum protocols."
        }
      ],
      "integrityScore": 90,
      "integrityIncidentCount": 1,
      "recommendation": "strong_hire"
    },
    "skillGapReport": {
      "readinessScore": 86,
      "summary": "Candidate readiness exceeds target bar for Senior Distributed Systems Engineer.",
      "skills": [
        {
          "name": "Distributed Systems",
          "requiredLevel": "advanced",
          "candidateLevel": "advanced",
          "score": 90,
          "gapScore": 0,
          "recommendations": ["Ready for production ownership."]
        }
      ]
    },
    "transcript": [
      {
        "questionIndex": 1,
        "questionText": "...",
        "skill": "Distributed Systems",
        "candidateAnswer": "...",
        "timeTakenSeconds": 52,
        "score": 9,
        "feedback": "..."
      }
    ],
    "interviewMeta": {
      "interviewId": "int_7766",
      "jobId": "job_9988",
      "durationSeconds": 1320,
      "status": "completed"
    }
  }
}
```

---

### 6.2 Get All Candidate Reports for a Job
- **Method & Route**: `GET /api/jobs/:jobId/reports`
- **Access**: Recruiter owner only
- **Ordering**: Ranked by `overallScore` descending

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Job interview reports retrieved successfully",
  "data": {
    "jobId": "job_9988",
    "jobTitle": "Senior Distributed Systems Engineer",
    "totalInterviewsCompleted": 2,
    "reports": [
      {
        "id": "rep_9900",
        "candidateId": "cand_123",
        "candidate": {
          "displayName": "Jane Doe",
          "email": "jane@example.com"
        },
        "overallScore": 86,
        "integrityScore": 90,
        "recommendation": "strong_hire"
      }
    ]
  }
}
```
