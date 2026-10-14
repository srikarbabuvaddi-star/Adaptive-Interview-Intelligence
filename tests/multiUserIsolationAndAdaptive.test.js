const request = require('supertest');
const app = require('../src/app');
const { COLLECTIONS, getCollection } = require('../src/services/db/firestore.service');
const { ROLES } = require('../src/constants/roles');
const { INTERVIEW_STATUS } = require('../src/constants/interviewStatus');

describe('Multi-User Strict Data Isolation & Real Adaptive Interview Flow', () => {
  let tokenA, userA, interviewAId, reportAId;
  let tokenB, userB, interviewBId;
  let q1Id, q2Id;

  const emailA = `candidate.alpha.${Date.now()}@example.com`;
  const emailB = `candidate.beta.${Date.now()}@example.com`;

  describe('Account A: Registration, Empty State & Adaptive Interview Execution', () => {
    it('Step 1: Account A registers and logs in', async () => {
      const signupRes = await request(app)
        .post('/api/auth/signup')
        .send({
          email: emailA,
          password: 'Password123!',
          displayName: 'Candidate Alpha',
          role: ROLES.CANDIDATE,
          candidateProfile: {
            skills: ['React', 'Node.js', 'System Architecture'],
            experienceYears: 4
          }
        });

      expect(signupRes.status).toBe(201);
      expect(signupRes.body.success).toBe(true);
      expect(signupRes.body.data.token).toBeDefined();
      expect(signupRes.body.data.user.email).toBe(emailA);
      expect(signupRes.body.data.user.role).toBe(ROLES.CANDIDATE);

      tokenA = signupRes.body.data.token;
      userA = signupRes.body.data.user;

      // Verify login endpoint works with same credentials
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: emailA,
          password: 'Password123!'
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.token).toBeDefined();
      expect(loginRes.body.data.user.uid).toBe(userA.uid);
    });

    it('Step 2: Account A has clean empty state (0 interviews)', async () => {
      const res = await request(app)
        .get('/api/interviews')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.meta?.total ?? res.body.data.length).toBe(0);
    });

    it('Step 3: Account A creates an adaptive interview session with custom target role', async () => {
      const res = await request(app)
        .post('/api/interviews')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          targetRole: {
            title: 'Lead Full Stack Engineer',
            experienceLevel: 'Senior',
            skills: ['React', 'Node.js', 'Distributed Systems'],
            durationMinutes: 20,
            maxQuestions: 2
          }
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.candidateId).toBe(userA.uid);
      expect(res.body.data.jobTitle).toBe('Lead Full Stack Engineer');
      expect(res.body.data.status).toBe(INTERVIEW_STATUS.SCHEDULED);
      expect(res.body.data.totalQuestions).toBe(2);

      interviewAId = res.body.data.id;
    });

    it('Step 4: Account A starts interview and receives Question 1', async () => {
      const res = await request(app)
        .post(`/api/interviews/${interviewAId}/start`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(INTERVIEW_STATUS.IN_PROGRESS);
      expect(res.body.data.currentQuestion).toBeDefined();
      expect(res.body.data.currentQuestion.questionText).toBeTruthy();
      expect(res.body.data.questionIndex).toBe(1);

      q1Id = res.body.data.currentQuestion.id;
    });

    it('Step 5: Account A submits answer 1 and receives adaptive evaluation + Question 2', async () => {
      const res = await request(app)
        .post(`/api/interviews/${interviewAId}/answers`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          questionId: q1Id,
          answerText: 'In a distributed system, we utilize event-driven architecture with Kafka for pub-sub messaging, Redis for caching hot data, and optimistic concurrency control for database writes.',
          timeTakenSeconds: 45
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isInterviewComplete).toBe(false);
      expect(res.body.data.evaluation).toBeDefined();
      expect(typeof res.body.data.evaluation.score).toBe('number');
      expect(res.body.data.nextQuestion).toBeDefined();
      expect(res.body.data.nextQuestion.questionIndex).toBe(2);

      q2Id = res.body.data.nextQuestion.id;
    });

    it('Step 6: Account A submits answer 2 and completes the interview session', async () => {
      const res = await request(app)
        .post(`/api/interviews/${interviewAId}/answers`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          questionId: q2Id,
          answerText: 'We monitor microservices using distributed tracing with OpenTelemetry, Prometheus metrics, and automated canary deployments to minimize blast radius.',
          timeTakenSeconds: 38
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isInterviewComplete).toBe(true);
      expect(res.body.data.reportId).toBeDefined();
      expect(typeof res.body.data.overallScore).toBe('number');

      reportAId = res.body.data.reportId;
    });

    it('Step 7: Account A can view their final report and transcript', async () => {
      const res = await request(app)
        .get(`/api/interviews/${interviewAId}/report`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.report).toBeDefined();
      expect(res.body.data.report.interviewId).toBe(interviewAId);
      expect(res.body.data.report.candidateId).toBe(userA.uid);
      expect(res.body.data.transcript).toHaveLength(2);
      expect(res.body.data.skillGapReport).toBeDefined();
    });
  });

  describe('Account B: Strict Isolation & Cross-Account Access Prevention', () => {
    it('Step 8: Account B registers and logs in as a separate user', async () => {
      const signupRes = await request(app)
        .post('/api/auth/signup')
        .send({
          email: emailB,
          password: 'Password999!',
          displayName: 'Candidate Beta',
          role: ROLES.CANDIDATE,
          candidateProfile: {
            skills: ['Python', 'Docker', 'Kubernetes'],
            experienceYears: 2
          }
        });

      expect(signupRes.status).toBe(201);
      tokenB = signupRes.body.data.token;
      userB = signupRes.body.data.user;

      expect(userB.uid).not.toBe(userA.uid);
    });

    it('Step 9: Account B sees an EMPTY interview list (Account A data is invisible)', async () => {
      const res = await request(app)
        .get('/api/interviews')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.meta?.total ?? res.body.data.length).toBe(0);
    });

    it('Step 10: Server denies Account B when trying to view Account A interview details (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/interviews/${interviewAId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/Forbidden/i);
    });

    it('Step 11: Server denies Account B when trying to access Account A evaluation report (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/interviews/${interviewAId}/report`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/Forbidden/i);
    });

    it('Step 12: Server denies Account B when trying to submit an answer to Account A interview (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/interviews/${interviewAId}/answers`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          questionId: q2Id,
          answerText: 'Malicious attempt to tamper with candidate A interview',
          timeTakenSeconds: 10
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Step 13: Account B creates and takes their own independent interview', async () => {
      const createRes = await request(app)
        .post('/api/interviews')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          targetRole: {
            title: 'Cloud DevOps Specialist',
            experienceLevel: 'Junior',
            skills: ['Docker', 'Kubernetes'],
            maxQuestions: 2
          }
        });

      expect(createRes.status).toBe(201);
      interviewBId = createRes.body.data.id;
      expect(createRes.body.data.candidateId).toBe(userB.uid);
      expect(createRes.body.data.jobTitle).toBe('Cloud DevOps Specialist');

      // Verify Account B now sees exactly 1 interview in their list
      const listBRes = await request(app)
        .get('/api/interviews')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(listBRes.status).toBe(200);
      expect(listBRes.body.data).toHaveLength(1);
      expect(listBRes.body.data[0].id).toBe(interviewBId);
      expect(listBRes.body.data[0].candidateId).toBe(userB.uid);

      // Verify Account A still sees only Account A interview
      const listARes = await request(app)
        .get('/api/interviews')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(listARes.status).toBe(200);
      expect(listARes.body.data).toHaveLength(1);
      expect(listARes.body.data[0].id).toBe(interviewAId);
      expect(listARes.body.data[0].candidateId).toBe(userA.uid);
    });

    it('Step 14: Token expiration or tampering rejection (401 Unauthorized)', async () => {
      const tamperedRes = await request(app)
        .get('/api/interviews')
        .set('Authorization', 'Bearer invalid-signature-token-12345');

      expect(tamperedRes.status).toBe(401);
      expect(tamperedRes.body.success).toBe(false);
    });

    it('Step 15: Security Audit - Sensitive password credentials are NEVER exposed in user profile responses', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(emailA);
      // Verify passwordHash and passwordSalt are strictly excluded
      expect(res.body.data.passwordHash).toBeUndefined();
      expect(res.body.data.passwordSalt).toBeUndefined();

      // Check auth/me endpoint as well
      const authMeRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(authMeRes.status).toBe(200);
      expect(authMeRes.body.data.passwordHash).toBeUndefined();
      expect(authMeRes.body.data.passwordSalt).toBeUndefined();
    });

    it('Step 16: Security Audit - Profile updates preserve credential concealment and reject unauthorized role changes', async () => {
      const updateRes = await request(app)
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          displayName: 'Candidate Alpha Updated'
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.displayName).toBe('Candidate Alpha Updated');
      expect(updateRes.body.data.passwordHash).toBeUndefined();
      expect(updateRes.body.data.passwordSalt).toBeUndefined();

      // Attempting to elevate role from candidate to recruiter must fail with 400
      const roleTamperRes = await request(app)
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          role: ROLES.RECRUITER
        });

      expect(roleTamperRes.status).toBe(400);
      expect(roleTamperRes.body.success).toBe(false);
    });
  });
});
