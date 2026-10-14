const request = require('supertest');
const app = require('../src/app');
const { setupRecruiter, setupCandidate, recruiterToken, candidateToken, authHeader } = require('./testHelper');

describe('Quality Assurance: Edge Cases, Resilience & Access Control', () => {
  let emptyRecruiter, emptyCandidate, activeRecruiter, activeCandidate;
  let testJobId, activeInterviewId;

  beforeAll(async () => {
    emptyRecruiter = await setupRecruiter('rec-empty', 'Blank Corp');
    emptyCandidate = await setupCandidate('cand-empty');

    activeRecruiter = await setupRecruiter('rec-edge-1', 'Resilience Labs');
    activeCandidate = await setupCandidate('cand-edge-1', ['TypeScript', 'Jest']);

    // Create job for testing
    const jobRes = await request(app)
      .post('/api/jobs')
      .set(activeRecruiter.header)
      .send({
        title: 'QA Automation Engineer',
        description: 'Design comprehensive integration test suites and fuzzing mechanisms.',
        requiredSkills: [
          { name: 'TypeScript', minimumLevel: 'intermediate', weight: 2 },
          { name: 'Jest', minimumLevel: 'intermediate', weight: 2 }
        ],
        maxQuestions: 3
      });
    testJobId = jobRes.body.data.id;

    // Schedule interview
    const intRes = await request(app)
      .post('/api/interviews')
      .set(activeRecruiter.header)
      .send({
        jobId: testJobId,
        candidateId: activeCandidate.uid
      });
    activeInterviewId = intRes.body.data.id;
  });

  describe('1. Empty Accounts & Empty Dashboards', () => {
    it('should return empty list (not crash) for a new recruiter with no created jobs', async () => {
      const res = await request(app)
        .get('/api/jobs')
        .set(emptyRecruiter.header);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(0);
      expect(res.body.meta.total).toBe(0);
    });

    it('should return empty list for a new candidate with no applications', async () => {
      const res = await request(app)
        .get('/api/applications/me')
        .set(emptyCandidate.header);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(0);
    });

    it('should return empty list for a new candidate with no interviews', async () => {
      const res = await request(app)
        .get('/api/interviews')
        .set(emptyCandidate.header);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(0);
    });
  });

  describe('2. Unauthorized Access & Data Isolation', () => {
    it('should prevent emptyCandidate from viewing activeInterview details (403)', async () => {
      const res = await request(app)
        .get(`/api/interviews/${activeInterviewId}`)
        .set(emptyCandidate.header);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should prevent emptyRecruiter from viewing activeCandidate interview (403)', async () => {
      const res = await request(app)
        .get(`/api/interviews/${activeInterviewId}`)
        .set(emptyRecruiter.header);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject unauthenticated requests to protected endpoints (401)', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .send({ title: 'Hacked Job' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('3. Interview State Protection & Duplicate Submissions', () => {
    let question1Id;

    it('should start interview and receive first question', async () => {
      const res = await request(app)
        .post(`/api/interviews/${activeInterviewId}/start`)
        .set(activeCandidate.header);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('in_progress');
      question1Id = res.body.data.currentQuestion.id;
      expect(question1Id).toBeDefined();
    });

    it('should successfully submit answer to active question', async () => {
      const res = await request(app)
        .post(`/api/interviews/${activeInterviewId}/answers`)
        .set(activeCandidate.header)
        .send({
          questionId: question1Id,
          answerText: 'We write unit tests with Jest mocks and run integration tests in Docker.',
          timeTakenSeconds: 30
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isInterviewComplete).toBe(false);
    });

    it('should reject duplicate submission for the same already-answered question', async () => {
      const res = await request(app)
        .post(`/api/interviews/${activeInterviewId}/answers`)
        .set(activeCandidate.header)
        .send({
          questionId: question1Id,
          answerText: 'Attempting to resubmit answer for question 1',
          timeTakenSeconds: 15
        });

      expect(res.status).toBe(400); // Bad request: Question is no longer active
      expect(res.body.success).toBe(false);
    });

    it('should prevent submitting answer with invalid / too short text (validation failure 422)', async () => {
      const getRes = await request(app)
        .get(`/api/interviews/${activeInterviewId}`)
        .set(activeCandidate.header);

      const q2 = getRes.body.data.questions[1];

      const res = await request(app)
        .post(`/api/interviews/${activeInterviewId}/answers`)
        .set(activeCandidate.header)
        .send({
          questionId: q2.id,
          answerText: 'no' // Too short (< 3 chars)
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
