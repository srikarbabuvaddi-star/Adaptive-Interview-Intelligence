const request = require('supertest');
const app = require('../src/app');
const { authHeader, recruiterToken, candidateToken } = require('./testHelper');

describe('Authentication & Profile Management APIs', () => {
  it('should return 401 Unauthorized if Authorization header is missing', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should register a candidate successfully', async () => {
    const token = candidateToken('cand-auth-test');
    const res = await request(app)
      .post('/api/auth/register')
      .set(authHeader(token))
      .send({
        role: 'candidate',
        displayName: 'John Doe',
        candidateProfile: {
          skills: ['Node.js', 'PostgreSQL', 'Docker'],
          experienceYears: 3,
          headline: 'Backend Developer'
        }
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.role).toBe('candidate');
    expect(res.body.data.displayName).toBe('John Doe');
    expect(res.body.data.candidateProfile.skills).toEqual(expect.arrayContaining(['Node.js']));
  });

  it('should reject recruiter registration if companyName is missing', async () => {
    const token = recruiterToken('rec-no-company');
    const res = await request(app)
      .post('/api/auth/register')
      .set(authHeader(token))
      .send({
        role: 'recruiter',
        displayName: 'Jane Recruiter'
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should retrieve current user profile with GET /api/users/me', async () => {
    const token = candidateToken('cand-auth-test');
    const res = await request(app)
      .get('/api/users/me')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.role).toBe('candidate');
    expect(res.body.data.displayName).toBe('John Doe');
  });

  it('should update user profile with PATCH /api/users/me', async () => {
    const token = candidateToken('cand-auth-test');
    const res = await request(app)
      .patch('/api/users/me')
      .set(authHeader(token))
      .send({
        displayName: 'Johnathan Doe',
        candidateProfile: {
          headline: 'Senior Backend Developer'
        }
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.displayName).toBe('Johnathan Doe');
    expect(res.body.data.candidateProfile.headline).toBe('Senior Backend Developer');
  });
});
