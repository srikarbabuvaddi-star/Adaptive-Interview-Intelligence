const request = require('supertest');
const app = require('../src/app');
const { setupRecruiter, setupCandidate } = require('./testHelper');

describe('Application Lifecycle APIs', () => {
  let recruiter1, recruiter2, candidate;
  let testJobId, applicationId;

  beforeAll(async () => {
    recruiter1 = await setupRecruiter('rec-app-1', 'FinTech Innovators');
    recruiter2 = await setupRecruiter('rec-app-2', 'Other Org');
    candidate = await setupCandidate('cand-app-1');

    // Create a job for application tests
    const jobRes = await request(app)
      .post('/api/jobs')
      .set(recruiter1.header)
      .send({
        title: 'Cloud Solutions Architect',
        description: 'Design and deploy robust microservices architectures on Google Cloud Platform with Kubernetes.',
        requiredSkills: [
          { name: 'Google Cloud Platform', minimumLevel: 'advanced', weight: 3 },
          { name: 'Kubernetes', minimumLevel: 'intermediate', weight: 2 }
        ],
        maxQuestions: 4
      });
    testJobId = jobRes.body.data.id;
  });

  it('should allow candidate to apply for a published job', async () => {
    const res = await request(app)
      .post(`/api/jobs/${testJobId}/applications`)
      .set(candidate.header)
      .send({
        resumeUrl: 'https://example.com/resume.pdf',
        coverNote: 'Excited about cloud architecture and Kubernetes orchestration.',
        candidateSkills: ['Google Cloud Platform', 'Kubernetes', 'Terraform']
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.jobId).toBe(testJobId);
    expect(res.body.data.status).toBe('pending');
    applicationId = res.body.data.id;
  });

  it('should reject duplicate application for the same job (409 Conflict)', async () => {
    const res = await request(app)
      .post(`/api/jobs/${testJobId}/applications`)
      .set(candidate.header)
      .send({
        coverNote: 'Applying again'
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('should allow candidate to retrieve their applications via GET /api/applications/me', async () => {
    const res = await request(app)
      .get('/api/applications/me')
      .set(candidate.header);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some(a => a.id === applicationId)).toBe(true);
  });

  it('should allow recruiter to view applications for their job', async () => {
    const res = await request(app)
      .get(`/api/jobs/${testJobId}/applications`)
      .set(recruiter1.header);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some(a => a.id === applicationId)).toBe(true);
  });

  it('should prevent unauthorized recruiter from viewing applications for another job (403)', async () => {
    const res = await request(app)
      .get(`/api/jobs/${testJobId}/applications`)
      .set(recruiter2.header);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('should allow recruiter to update application status', async () => {
    const res = await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set(recruiter1.header)
      .send({
        status: 'interview_invited'
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('interview_invited');
  });
});
