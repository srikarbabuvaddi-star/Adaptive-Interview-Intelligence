const request = require('supertest');
const app = require('../src/app');
const { setupRecruiter, setupCandidate } = require('./testHelper');

describe('Job Management APIs', () => {
  let recruiter1, recruiter2, candidate;
  let createdJobId;

  beforeAll(async () => {
    recruiter1 = await setupRecruiter('rec-job-1', 'Alpha Corp');
    recruiter2 = await setupRecruiter('rec-job-2', 'Beta Systems');
    candidate = await setupCandidate('cand-job-1');
  });

  it('should prevent candidate from creating a job posting (403)', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set(candidate.header)
      .send({
        title: 'Backend Engineer',
        description: 'Building high throughput systems in Node.js',
        requiredSkills: [{ name: 'Node.js', minimumLevel: 'intermediate', weight: 2 }]
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should allow recruiter to create a valid job posting', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set(recruiter1.header)
      .send({
        title: 'Senior Full Stack Engineer',
        description: 'Join our core platform engineering team to build scalable microservices and dynamic frontend applications.',
        department: 'Core Engineering',
        location: 'Remote',
        employmentType: 'full-time',
        requiredSkills: [
          { name: 'React', minimumLevel: 'advanced', weight: 3 },
          { name: 'Node.js', minimumLevel: 'advanced', weight: 3 },
          { name: 'System Design', minimumLevel: 'intermediate', weight: 2 }
        ],
        evaluationCriteria: [
          'Code organization & architectural clarity',
          'Production debugging and edge case handling'
        ],
        maxQuestions: 4,
        targetDurationMinutes: 25
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.title).toBe('Senior Full Stack Engineer');
    createdJobId = res.body.data.id;
  });

  it('should allow candidate to retrieve published jobs', async () => {
    const res = await request(app)
      .get('/api/jobs')
      .set(candidate.header);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    const found = res.body.data.find(j => j.id === createdJobId);
    expect(found).toBeDefined();
  });

  it('should retrieve job details by ID with GET /api/jobs/:jobId', async () => {
    const res = await request(app)
      .get(`/api/jobs/${createdJobId}`)
      .set(candidate.header);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdJobId);
  });

  it('should prevent recruiter2 from modifying recruiter1 job (403)', async () => {
    const res = await request(app)
      .patch(`/api/jobs/${createdJobId}`)
      .set(recruiter2.header)
      .send({
        title: 'Hacked Job Title'
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('should allow recruiter1 to update their job', async () => {
    const res = await request(app)
      .patch(`/api/jobs/${createdJobId}`)
      .set(recruiter1.header)
      .send({
        title: 'Lead Full Stack Engineer'
      });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Lead Full Stack Engineer');
  });

  it('should allow recruiter1 to delete their job', async () => {
    const res = await request(app)
      .delete(`/api/jobs/${createdJobId}`)
      .set(recruiter1.header);

    expect(res.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/jobs/${createdJobId}`)
      .set(recruiter1.header);
    expect(getRes.status).toBe(404);
  });
});
