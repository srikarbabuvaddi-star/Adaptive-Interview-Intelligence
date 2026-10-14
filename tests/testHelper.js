const request = require('supertest');
const app = require('../src/app');

const recruiterToken = (id = 'rec-1') => `mock-${id}-recruiter`;
const candidateToken = (id = 'cand-1') => `mock-${id}-candidate`;

const authHeader = (token) => ({
  Authorization: `Bearer ${token}`
});

/**
 * Registers a recruiter account
 */
const setupRecruiter = async (id = 'rec-1', companyName = 'TechCorp Labs') => {
  const token = recruiterToken(id);
  const res = await request(app)
    .post('/api/auth/register')
    .set(authHeader(token))
    .send({
      role: 'recruiter',
      displayName: `Recruiter ${id}`,
      recruiterProfile: {
        companyName,
        department: 'Talent Acquisition',
        companyWebsite: 'https://techcorp.example.com'
      }
    });

  return { uid: id, token, header: authHeader(token), body: res.body };
};

/**
 * Registers a candidate account
 */
const setupCandidate = async (id = 'cand-1', skills = ['React', 'Node.js', 'System Design']) => {
  const token = candidateToken(id);
  const res = await request(app)
    .post('/api/auth/register')
    .set(authHeader(token))
    .send({
      role: 'candidate',
      displayName: `Candidate ${id}`,
      candidateProfile: {
        skills,
        experienceYears: 4,
        headline: 'Full Stack Engineer',
        bio: 'Passionate about distributed systems and React UI'
      }
    });

  return { uid: id, token, header: authHeader(token), body: res.body };
};

module.exports = {
  recruiterToken,
  candidateToken,
  authHeader,
  setupRecruiter,
  setupCandidate
};
