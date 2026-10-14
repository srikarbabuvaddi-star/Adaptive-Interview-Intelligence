const request = require('supertest');
const app = require('../src/app');
const { setupRecruiter, setupCandidate } = require('./testHelper');

describe('Adaptive Interview Lifecycle APIs', () => {
  let recruiter, candidate, otherCandidate;
  let jobId, interviewId;

  beforeAll(async () => {
    recruiter = await setupRecruiter('rec-int-1', 'Adaptive AI Labs');
    candidate = await setupCandidate('cand-int-1', ['Node.js', 'System Architecture', 'Redis']);
    otherCandidate = await setupCandidate('cand-int-2', ['Python']);

    // Recruiter creates a 3-question job
    const jobRes = await request(app)
      .post('/api/jobs')
      .set(recruiter.header)
      .send({
        title: 'Backend Systems Engineer',
        description: 'Design and build high-performance data processing pipelines with Node.js and caching layers.',
        requiredSkills: [
          { name: 'Node.js', minimumLevel: 'intermediate', weight: 2 },
          { name: 'System Architecture', minimumLevel: 'intermediate', weight: 3 },
          { name: 'Redis', minimumLevel: 'beginner', weight: 1 }
        ],
        maxQuestions: 3,
        targetDurationMinutes: 15
      });
    jobId = jobRes.body.data.id;
  });

  it('should allow recruiter to schedule an interview session', async () => {
    const res = await request(app)
      .post('/api/interviews')
      .set(recruiter.header)
      .send({
        jobId,
        candidateId: candidate.uid
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('scheduled');
    expect(res.body.data.currentQuestionIndex).toBe(0);
    interviewId = res.body.data.id;
  });

  it('should allow candidate to self-initiate an interview session for a job role', async () => {
    const res = await request(app)
      .post('/api/interviews')
      .set(otherCandidate.header)
      .send({ jobId });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.candidateId).toBe(otherCandidate.uid);
    expect(res.body.data.status).toBe('scheduled');
  });

  it('should prevent an unrelated candidate from starting this interview (403)', async () => {
    const res = await request(app)
      .post(`/api/interviews/${interviewId}/start`)
      .set(otherCandidate.header);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('should allow authorized candidate to start the interview and receive the first AI question', async () => {
    const res = await request(app)
      .post(`/api/interviews/${interviewId}/start`)
      .set(candidate.header);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('in_progress');
    expect(res.body.data.questionIndex).toBe(1);
    expect(res.body.data.currentQuestion).toBeDefined();
    expect(res.body.data.currentQuestion.id).toBeDefined();
    expect(res.body.data.currentQuestion.questionText).toBeTruthy();
    expect(res.body.data.currentQuestion.skill).toBeTruthy();
    // Verify grading rubric is NOT exposed to candidate
    expect(res.body.data.currentQuestion.expectedKeyPoints).toBeUndefined();
  });

  it('should record an integrity / proctoring event during the interview', async () => {
    const res = await request(app)
      .post(`/api/interviews/${interviewId}/integrity-events`)
      .set(candidate.header)
      .send({
        eventType: 'tab_switch',
        details: { durationMs: 1400, targetTabTitle: 'Google Search' },
        severity: 'medium'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.eventType).toBe('tab_switch');
  });

  it('should submit answer 1, receive AI evaluation and adaptive question 2', async () => {
    // 1. Get current question ID
    const getRes = await request(app)
      .get(`/api/interviews/${interviewId}`)
      .set(candidate.header);

    const currentQ = getRes.body.data.questions[0];
    expect(currentQ).toBeDefined();

    // 2. Submit answer
    const ansRes = await request(app)
      .post(`/api/interviews/${interviewId}/answers`)
      .set(candidate.header)
      .send({
        questionId: currentQ.id,
        answerText: 'In our architecture, we decompose services into event-driven modules. We manage asynchronous operations with non-blocking promises and backpressure handling. We employ Redis caching for low-latency state and implement centralized error middleware and graceful shutdowns for resilience.',
        timeTakenSeconds: 45
      });

    expect(ansRes.status).toBe(200);
    expect(ansRes.body.success).toBe(true);
    expect(ansRes.body.data.isInterviewComplete).toBe(false);
    expect(ansRes.body.data.evaluation).toBeDefined();
    expect(ansRes.body.data.evaluation.score).toBeGreaterThan(0);
    expect(ansRes.body.data.evaluation.feedback).toBeTruthy();
    expect(ansRes.body.data.nextQuestion).toBeDefined();
    expect(ansRes.body.data.nextQuestion.questionIndex).toBe(2);
  });

  it('should reject duplicate submission for the same question (409 Conflict)', async () => {
    const getRes = await request(app)
      .get(`/api/interviews/${interviewId}`)
      .set(candidate.header);

    const question1Id = getRes.body.data.questions[0].id;

    const res = await request(app)
      .post(`/api/interviews/${interviewId}/answers`)
      .set(candidate.header)
      .send({
        questionId: question1Id,
        answerText: 'Duplicate attempt to submit answer again',
        timeTakenSeconds: 15
      });

    expect(res.status).toBe(400); // Bad request because current question is now question 2
  });

  it('should submit answer 2 and answer 3 to complete the interview', async () => {
    // Get question 2
    let getRes = await request(app)
      .get(`/api/interviews/${interviewId}`)
      .set(candidate.header);
    let q2 = getRes.body.data.questions[1];

    let ans2 = await request(app)
      .post(`/api/interviews/${interviewId}/answers`)
      .set(candidate.header)
      .send({
        questionId: q2.id,
        answerText: 'For system architecture and distributed scaling, we implement horizontal scaling behind an NGINX load balancer, utilize message queues for decoupling heavy tasks, and partition the database with read replicas to manage query traffic.',
        timeTakenSeconds: 50
      });

    expect(ans2.status).toBe(200);
    expect(ans2.body.data.isInterviewComplete).toBe(false);

    // Get question 3
    getRes = await request(app)
      .get(`/api/interviews/${interviewId}`)
      .set(candidate.header);
    let q3 = getRes.body.data.questions[2];

    // Submit final question answer
    let ans3 = await request(app)
      .post(`/api/interviews/${interviewId}/answers`)
      .set(candidate.header)
      .send({
        questionId: q3.id,
        answerText: 'We use Redis as an in-memory cache with eviction policies like LRU. We maintain cache invalidation via pub/sub notifications and mitigate cache stampede using mutex locks.',
        timeTakenSeconds: 40
      });

    expect(ans3.status).toBe(200);
    expect(ans3.body.data.isInterviewComplete).toBe(true);
    expect(ans3.body.data.reportId).toBeDefined();

    // Verify interview status is now completed
    const finalInterviewRes = await request(app)
      .get(`/api/interviews/${interviewId}`)
      .set(candidate.header);
    expect(finalInterviewRes.body.data.status).toBe('completed');
  });
});
