const request = require('supertest');
const app = require('../src/app');
const { setupRecruiter, setupCandidate } = require('./testHelper');

describe('Interview Reports and Skill Gap Analysis APIs', () => {
  let recruiter, candidate, unauthorizedCandidate;
  let jobId, interviewId;

  beforeAll(async () => {
    recruiter = await setupRecruiter('rec-rep-1', 'Talent Metrics Inc');
    candidate = await setupCandidate('cand-rep-1');
    unauthorizedCandidate = await setupCandidate('cand-rep-unauth');

    // Create job
    const jobRes = await request(app)
      .post('/api/jobs')
      .set(recruiter.header)
      .send({
        title: 'Full Stack Engineer',
        description: 'Building modern web platforms with React and Node.js.',
        requiredSkills: [
          { name: 'React', minimumLevel: 'intermediate', weight: 2 },
          { name: 'Node.js', minimumLevel: 'intermediate', weight: 2 }
        ],
        maxQuestions: 3
      });
    jobId = jobRes.body.data.id;

    // Schedule interview
    const intRes = await request(app)
      .post('/api/interviews')
      .set(recruiter.header)
      .send({ jobId, candidateId: candidate.uid });
    interviewId = intRes.body.data.id;

    // Start interview
    await request(app)
      .post(`/api/interviews/${interviewId}/start`)
      .set(candidate.header);

    // Get question and submit answer to have data
    const getRes = await request(app)
      .get(`/api/interviews/${interviewId}`)
      .set(candidate.header);
    const q1 = getRes.body.data.questions[0];

    await request(app)
      .post(`/api/interviews/${interviewId}/answers`)
      .set(candidate.header)
      .send({
        questionId: q1.id,
        answerText: 'We structure React applications with modular component architecture, custom hooks for shared state logic, and memoization for render optimization.',
        timeTakenSeconds: 35
      });

    // Conclude interview to trigger report generation
    await request(app)
      .post(`/api/interviews/${interviewId}/end`)
      .set(candidate.header)
      .send({ reason: 'candidate_completed' });
  });

  it('should allow candidate to retrieve their interview report and skill gap analysis', async () => {
    const res = await request(app)
      .get(`/api/interviews/${interviewId}/report`)
      .set(candidate.header);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { report, skillGapReport, transcript, interviewMeta } = res.body.data;
    expect(report).toBeDefined();
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.summary).toBeTruthy();
    expect(report.recommendation).toBeDefined();
    expect(report.integrityScore).toBeDefined();
    expect(Array.isArray(report.skillBreakdown)).toBe(true);

    expect(skillGapReport).toBeDefined();
    expect(skillGapReport.readinessScore).toBeDefined();
    expect(Array.isArray(skillGapReport.skills)).toBe(true);

    expect(Array.isArray(transcript)).toBe(true);
    expect(transcript[0].candidateAnswer).toBeTruthy();
    expect(transcript[0].score).toBeDefined();

    expect(interviewMeta.interviewId).toBe(interviewId);
  });

  it('should allow recruiter to retrieve the candidate interview report', async () => {
    const res = await request(app)
      .get(`/api/interviews/${interviewId}/report`)
      .set(recruiter.header);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.report.overallScore).toBeDefined();
  });

  it('should reject unauthorized candidate from viewing someone else report (403)', async () => {
    const res = await request(app)
      .get(`/api/interviews/${interviewId}/report`)
      .set(unauthorizedCandidate.header);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should allow recruiter to view all candidate reports for a job', async () => {
    const res = await request(app)
      .get(`/api/jobs/${jobId}/reports`)
      .set(recruiter.header);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.jobId).toBe(jobId);
    expect(Array.isArray(res.body.data.reports)).toBe(true);
    expect(res.body.data.reports.length).toBeGreaterThan(0);
  });

  it('should prevent candidate from accessing job-wide candidate reports (403)', async () => {
    const res = await request(app)
      .get(`/api/jobs/${jobId}/reports`)
      .set(candidate.header);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});
