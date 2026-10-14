const request = require('supertest');
const path = require('path');
const fs = require('fs');
const app = require('../src/app');
const { authHeader, recruiterToken, candidateToken, setupRecruiter, setupCandidate } = require('./testHelper');

describe('Resume-Once, Reuse-Everywhere Workflow & Security Tests', () => {
  const candidateId1 = 'cand-resume-test-1';
  const candidateId2 = 'cand-resume-test-2';
  const recruiterId1 = 'rec-resume-test-1';
  const recruiterId2 = 'rec-resume-test-2';

  let cand1Auth, cand2Auth, rec1Auth, rec2Auth;

  const validPdfPath = path.resolve(process.cwd(), 'node_modules', 'pdf-parse', 'test', 'data', '01-valid.pdf');
  const validDocxPath = path.resolve(process.cwd(), 'node_modules', 'mammoth', 'test', 'test-data', 'single-paragraph.docx');

  beforeAll(async () => {
    cand1Auth = await setupCandidate(candidateId1, ['Node.js', 'PostgreSQL']);
    cand2Auth = await setupCandidate(candidateId2, ['Python', 'Django']);
    rec1Auth = await setupRecruiter(recruiterId1, 'Global Innovations Corp');
    rec2Auth = await setupRecruiter(recruiterId2, 'Independent Apex Ventures');
  });

  describe('1. Unauthenticated & Empty States', () => {
    it('should reject unauthenticated resume requests with 401', async () => {
      const res = await request(app).get('/api/resumes/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return null with friendly empty-state message when candidate has not uploaded a resume', async () => {
      const res = await request(app)
        .get('/api/resumes/me')
        .set(cand1Auth.header);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeNull();
      expect(res.body.message).toContain('No resume has been uploaded yet');
    });
  });

  describe('2. Validation & Security on Upload', () => {
    it('should reject recruiter from uploading a candidate resume (403)', async () => {
      const res = await request(app)
        .post('/api/resumes/upload')
        .set(rec1Auth.header)
        .attach('resume', validPdfPath);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject request when no file is attached (400)', async () => {
      const res = await request(app)
        .post('/api/resumes/upload')
        .set(cand1Auth.header);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('should reject invalid file types like .txt or .exe (400)', async () => {
      const fakeTextFile = Buffer.from('console.log("malicious code");');
      const res = await request(app)
        .post('/api/resumes/upload')
        .set(cand1Auth.header)
        .attach('resume', fakeTextFile, { filename: 'exploit.exe', contentType: 'application/x-msdownload' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Invalid file type');
    });

    it('should reject files exceeding 5MB size limit (400)', async () => {
      const oversizedBuffer = Buffer.alloc(6 * 1024 * 1024, '%PDF-1.4 sample large data');
      const res = await request(app)
        .post('/api/resumes/upload')
        .set(cand1Auth.header)
        .attach('resume', oversizedBuffer, { filename: 'oversized_resume.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/exceeds/i);
    });
  });

  describe('3. Successful Upload, Extraction, & Persistence', () => {
    it('should successfully upload and extract profile from valid PDF resume (v1)', async () => {
      const res = await request(app)
        .post('/api/resumes/upload')
        .set(cand1Auth.header)
        .attach('resume', validPdfPath);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currentVersion).toBe(1);
      expect(res.body.data.status).toBe('parsed');
      expect(res.body.data.extractedProfile).toBeDefined();
      expect(res.body.data.extractedProfile.skills).toBeInstanceOf(Array);
      expect(res.body.data.originalName).toBe('01-valid.pdf');
    });

    it('should retrieve candidate active resume with GET /api/resumes/me', async () => {
      const res = await request(app)
        .get('/api/resumes/me')
        .set(cand1Auth.header);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currentVersion).toBe(1);
      expect(res.body.data.filename).toBe('01-valid.pdf');
      expect(res.body.data.extractedProfile).toBeDefined();
    });

    it('should show user profile updated with hasResume = true and extracted skills', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set(cand1Auth.header);

      expect(res.status).toBe(200);
      expect(res.body.data.hasResume).toBe(true);
      expect(res.body.data.candidateProfile.resumeVersion).toBe(1);
    });

    it('should securely download candidate own resume with GET /api/resumes/me/download', async () => {
      const res = await request(app)
        .get('/api/resumes/me/download')
        .set(cand1Auth.header);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.body.length).toBeGreaterThan(100);
    });
  });

  describe('4. Multi-Tenant Cross-User Isolation', () => {
    it('should prevent Candidate 2 from accessing Candidate 1 resume directly (403)', async () => {
      // Trying to query Candidate 1 resume directly via candidate endpoint
      const res = await request(app)
        .get(`/api/resumes/candidate/${candidateId1}`)
        .set(cand2Auth.header);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should prevent Recruiter 1 from downloading Candidate 1 resume without an application or interview link (403)', async () => {
      const res = await request(app)
        .get(`/api/resumes/candidate/${candidateId1}/download`)
        .set(rec1Auth.header);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('active requisition pipeline');
    });
  });

  describe('5. Automatic Resume Reuse in Applications & Adaptive Interviews', () => {
    let createdJobId;
    let createdInterviewId;
    let currentQuestionId;

    it('should automatically reuse candidate saved resume when applying for a role', async () => {
      // 1. Recruiter creates a job
      const jobRes = await request(app)
        .post('/api/jobs')
        .set(rec1Auth.header)
        .send({
          title: 'Senior Cloud Architect',
          description: 'Design robust multi-region Kubernetes cloud infrastructure.',
          department: 'Cloud Platform',
          location: 'San Francisco, CA / Remote',
          employmentType: 'full-time',
          experienceLevel: 'Senior',
          requiredSkills: [
            { name: 'Kubernetes', minimumLevel: 'advanced', weight: 2 },
            { name: 'Docker', minimumLevel: 'intermediate', weight: 1 },
            { name: 'Node.js', minimumLevel: 'intermediate', weight: 1 }
          ],
          evaluationCriteria: ['Container orchestration architecture', 'Microservices resilience']
        });

      expect(jobRes.status).toBe(201);
      createdJobId = jobRes.body.data.id;

      // 2. Candidate 1 applies WITHOUT uploading resume again or specifying skills manually
      const appRes = await request(app)
        .post(`/api/jobs/${createdJobId}/applications`)
        .set(cand1Auth.header)
        .send({
          coverNote: 'Excited to apply using my profile resume!'
        });

      expect(appRes.status).toBe(201);
      expect(appRes.body.data.resumeVersion).toBe(1);
      expect(appRes.body.data.resumeSnapshot).toBeDefined();
      expect(appRes.body.data.resumeSnapshot.filename).toBe('01-valid.pdf');
      // Skills automatically inferred from extracted resume
      expect(appRes.body.data.candidateSkills).toBeInstanceOf(Array);
    });

    it('should allow Recruiter 1 to download Candidate 1 resume now that an application exists', async () => {
      const res = await request(app)
        .get(`/api/resumes/candidate/${candidateId1}/download`)
        .set(rec1Auth.header);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
    });

    it('should still reject Recruiter 2 from accessing Candidate 1 resume (403)', async () => {
      const res = await request(app)
        .get(`/api/resumes/candidate/${candidateId1}/download`)
        .set(rec2Auth.header);

      expect(res.status).toBe(403);
    });

    it('should automatically attach active resume snapshot (v1) when candidate creates and starts interview', async () => {
      const interviewRes = await request(app)
        .post('/api/interviews')
        .set(cand1Auth.header)
        .send({
          jobId: createdJobId
        });

      expect(interviewRes.status).toBe(201);
      createdInterviewId = interviewRes.body.data.id;
      expect(interviewRes.body.data.resumeVersion).toBe(1);
      expect(interviewRes.body.data.candidateProfileSnapshot).toBeDefined();

      // Start interview and get first question tailored to candidate background
      const startRes = await request(app)
        .post(`/api/interviews/${createdInterviewId}/start`)
        .set(cand1Auth.header);

      expect(startRes.status).toBe(200);
      expect(startRes.body.data.currentQuestion).toBeDefined();
      expect(startRes.body.data.currentQuestion.questionText).toBeTruthy();
      currentQuestionId = startRes.body.data.currentQuestion.id;
    });

    it('should allow candidate to replace resume with v2 (DOCX) without altering historical interview v1 snapshot', async () => {
      // Upload v2 (DOCX)
      const uploadV2Res = await request(app)
        .post('/api/resumes/upload')
        .set(cand1Auth.header)
        .attach('resume', validDocxPath);

      expect(uploadV2Res.status).toBe(201);
      expect(uploadV2Res.body.data.currentVersion).toBe(2);
      expect(uploadV2Res.body.data.originalName).toBe('single-paragraph.docx');

      // Check version list contains both v2 and v1
      const versionsRes = await request(app)
        .get('/api/resumes/me/versions')
        .set(cand1Auth.header);

      expect(versionsRes.status).toBe(200);
      expect(versionsRes.body.data.length).toBe(2);
      expect(versionsRes.body.data[0].version).toBe(2);
      expect(versionsRes.body.data[1].version).toBe(1);

      // Verify historical interview session STILL references v1!
      const histInterviewRes = await request(app)
        .get(`/api/interviews/${createdInterviewId}`)
        .set(cand1Auth.header);

      expect(histInterviewRes.status).toBe(200);
      expect(histInterviewRes.body.data.resumeVersion).toBe(1);
      expect(histInterviewRes.body.data.candidateProfileSnapshot.resumeVersion).toBe(1);
    });

    it('should complete historical interview and generate report referencing v1 snapshot and categorized skills', async () => {
      // 1. Submit answer 1
      const ans1Res = await request(app)
        .post(`/api/interviews/${createdInterviewId}/answers`)
        .set(cand1Auth.header)
        .send({
          questionId: currentQuestionId,
          answerText: 'In Kubernetes, Pods are orchestrated across nodes via kube-scheduler while services abstract traffic using kube-proxy iptables rules and ingress controllers.',
          timeTakenSeconds: 35
        });

      expect(ans1Res.status).toBe(200);

      // End interview to generate final report
      const endRes = await request(app)
        .post(`/api/interviews/${createdInterviewId}/end`)
        .set(cand1Auth.header)
        .send({ reason: 'candidate_completed' });

      expect(endRes.status).toBe(200);
      const reportId = endRes.body.data.reportId;

      // Fetch report by interviewId
      const reportRes = await request(app)
        .get(`/api/reports/interviews/${createdInterviewId}`)
        .set(cand1Auth.header);

      expect(reportRes.status).toBe(200);
      expect(reportRes.body.data.report.resumeVersion).toBe(1);
      expect(reportRes.body.data.report.skillCategories).toBeDefined();
      expect(reportRes.body.data.report.skillCategories.demonstratedSkills).toBeDefined();
      expect(reportRes.body.data.report.skillCategories.untestedSkills).toBeDefined();
    });
  });

  describe('6. Resume Reprocessing', () => {
    it('should allow candidate to reprocess their active resume successfully', async () => {
      const res = await request(app)
        .post('/api/resumes/me/reprocess')
        .set(cand1Auth.header);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('parsed');
      expect(res.body.data.currentVersion).toBe(2);
    });
  });
});
