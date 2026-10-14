const request = require('supertest');
const app = require('../src/app');
const path = require('path');
const { setupCandidate, setupRecruiter, candidateToken } = require('./testHelper');
const JSearchAdapter = require('../src/services/jobs/adapters/jsearch.adapter');
const AdzunaAdapter = require('../src/services/jobs/adapters/adzuna.adapter');
const jobExplorerService = require('../src/services/jobs/jobExplorer.service');

describe('Real-Time Job Explorer and Market-Based Salary Intelligence Tests', () => {
  const candidateId1 = 'cand-job-explorer-1';
  const candidateId2 = 'cand-job-explorer-no-resume';
  const recruiterId1 = 'rec-job-explorer-1';

  let cand1Auth, cand2Auth, rec1Auth;

  const validPdfPath = path.resolve(process.cwd(), 'node_modules', 'pdf-parse', 'test', 'data', '01-valid.pdf');

  beforeAll(async () => {
    cand1Auth = await setupCandidate(candidateId1, ['Node.js', 'PostgreSQL', 'React', 'AWS']);
    cand2Auth = await setupCandidate(candidateId2, ['Python', 'Docker']);
    rec1Auth = await setupRecruiter(recruiterId1, 'Market Intel Hiring');

    // Upload verified resume for candidate 1
    await request(app)
      .post('/api/resumes/upload')
      .set(cand1Auth.header)
      .attach('resume', validPdfPath);
  });

  describe('1. Authentication & Role-Based Access Control', () => {
    it('should reject unauthenticated search request with 401', async () => {
      const res = await request(app).get('/api/job-explorer/search?query=Developer');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should allow candidate or recruiter to access job search endpoint', async () => {
      // Mock searchJobs on service to return realistic standardized data
      const mockSearch = jest.spyOn(jobExplorerService, 'searchJobs').mockResolvedValueOnce({
        jobs: [],
        total: 0,
        page: 1,
        totalPages: 1,
        provider: 'jsearch',
        isCached: false,
        retrievedAt: new Date().toISOString()
      });

      const res = await request(app)
        .get('/api/job-explorer/search?query=React+Developer&country=in')
        .set(cand1Auth.header);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.jobs).toEqual([]);
      mockSearch.mockRestore();
    });

    it('should prevent recruiters from accessing candidate skill-comparison (403)', async () => {
      const res = await request(app)
        .post('/api/job-explorer/compare-skills')
        .set(rec1Auth.header)
        .send({
          jobData: {
            title: 'Senior Backend Engineer',
            requiredSkills: ['Node.js', 'PostgreSQL']
          }
        });

      expect(res.status).toBe(403);
    });

    it('should prevent recruiters from launching candidate interview preparation (403)', async () => {
      const res = await request(app)
        .post('/api/job-explorer/prepare-interview')
        .set(rec1Auth.header)
        .send({
          jobData: {
            title: 'Senior Backend Engineer',
            requiredSkills: ['Node.js', 'PostgreSQL']
          }
        });

      expect(res.status).toBe(403);
    });
  });

  describe('2. Provider Adapters & Response Normalization', () => {
    it('JSearchAdapter: should accurately normalize advertised salary in Indian Rupees (INR)', () => {
      const adapter = new JSearchAdapter({ apiKey: 'mock-key' });
      const rawJSearchJob = {
        job_id: 'jsearch_in_01',
        job_title: 'Full Stack Engineer',
        employer_name: 'Razorpay',
        employer_logo: 'https://logo.clearbit.com/razorpay.com',
        job_publisher: 'LinkedIn',
        job_employment_type: 'FULLTIME',
        job_apply_link: 'https://careers.razorpay.com/job/123',
        job_description: 'We are seeking a Full Stack Engineer proficient in React, Node.js, and Redis.',
        job_is_remote: true,
        job_city: 'Bengaluru',
        job_state: 'Karnataka',
        job_country: 'IN',
        job_posted_at_datetime_utc: '2026-10-10T12:00:00Z',
        job_min_salary: 1800000,
        job_max_salary: 2800000,
        job_salary_currency: 'INR',
        job_salary_period: 'YEAR',
        job_required_skills: ['React', 'Node.js', 'Redis'],
        job_highlights: {
          Qualifications: ['3+ years in production Node.js'],
          Responsibilities: ['Build scalable payment APIs']
        }
      };

      const normalized = adapter.normalizeJob(rawJSearchJob, 'in');

      expect(normalized.id).toBe('jsearch_in_01');
      expect(normalized.title).toBe('Full Stack Engineer');
      expect(normalized.employer.name).toBe('Razorpay');
      expect(normalized.location.displayLocation).toContain('Bengaluru');
      expect(normalized.location.isRemote).toBe(true);
      expect(normalized.salary.hasSalary).toBe(true);
      expect(normalized.salary.type).toBe('advertised');
      expect(normalized.salary.currency).toBe('INR');
      expect(normalized.salary.displaySalary).toContain('₹');
      expect(normalized.salary.normalizedAnnual.min).toBe(1800000);
      expect(normalized.salary.normalizedAnnual.max).toBe(2800000);
      expect(normalized.requiredSkills).toContain('React');
      expect(normalized.requiredSkills).toContain('Node.js');
      expect(normalized.applyUrl).toBe('https://careers.razorpay.com/job/123');
      expect(normalized.source).toBe('LinkedIn via JSearch');
    });

    it('JSearchAdapter: should normalize hourly pay to annual and state undisclosed when missing', () => {
      const adapter = new JSearchAdapter({ apiKey: 'mock-key' });
      const rawHourlyJob = {
        job_id: 'jsearch_us_02',
        job_title: 'Cloud DevOps Specialist',
        employer_name: 'Stripe',
        job_min_salary: 80,
        job_max_salary: 100,
        job_salary_currency: 'USD',
        job_salary_period: 'HOUR',
        job_country: 'US'
      };

      const normalizedHourly = adapter.normalizeJob(rawHourlyJob, 'us');
      expect(normalizedHourly.salary.hasSalary).toBe(true);
      expect(normalizedHourly.salary.displaySalary).toContain('$80 - $100 / hour');
      // 80 * 2080 hours = 166400, 100 * 2080 = 208000
      expect(normalizedHourly.salary.normalizedAnnual.min).toBe(166400);
      expect(normalizedHourly.salary.normalizedAnnual.max).toBe(208000);

      const rawUndisclosedJob = {
        job_id: 'jsearch_undisclosed',
        job_title: 'Software Developer',
        employer_name: 'Tech Firm',
        job_min_salary: null,
        job_max_salary: null
      };

      const normalizedUndisclosed = adapter.normalizeJob(rawUndisclosedJob, 'in');
      expect(normalizedUndisclosed.salary.hasSalary).toBe(false);
      expect(normalizedUndisclosed.salary.displaySalary).toBe('Salary not disclosed');
      expect(normalizedUndisclosed.salary.type).toBe('undisclosed');
    });

    it('JSearchAdapter: should display "Posting date unavailable" when no date is supplied', () => {
      const adapter = new JSearchAdapter({ apiKey: 'mock-key' });
      const rawJob = {
        job_id: 'no_date_job',
        job_title: 'Engineer',
        employer_name: 'Corp'
      };

      const normalized = adapter.normalizeJob(rawJob);
      expect(normalized.postedAtDisplay).toBe('Posting date unavailable');
    });

    it('AdzunaAdapter: should explicitly distinguish advertiser-declared salary from predicted model salary', () => {
      const adapter = new AdzunaAdapter({ appId: 'test-app', appKey: 'test-key' });

      // Case A: Advertised by employer (salary_is_predicted: "0")
      const advertisedJob = {
        id: 'adzuna_adv_01',
        title: 'Backend Python Engineer',
        company: { display_name: 'Swiggy' },
        location: { display_name: 'Bengaluru, India', area: ['India', 'Bengaluru'] },
        salary_min: 1500000,
        salary_max: 2200000,
        salary_is_predicted: '0',
        created: '2026-10-12T10:00:00Z',
        redirect_url: 'https://adzuna.in/landing/1'
      };

      const normAdvertised = adapter.normalizeJob(advertisedJob, 'in');
      expect(normAdvertised.salary.type).toBe('advertised');
      expect(normAdvertised.salary.source).toBe('Employer Advertised');
      expect(normAdvertised.salary.isPredicted).toBe(false);

      // Case B: Predicted by Adzuna algorithm (salary_is_predicted: "1")
      const predictedJob = {
        id: 'adzuna_pred_02',
        title: 'Senior Java Architect',
        company: { display_name: 'Enterprise Inc' },
        salary_min: 2400000,
        salary_max: 3000000,
        salary_is_predicted: '1',
        created: '2026-10-12T10:00:00Z',
        redirect_url: 'https://adzuna.in/landing/2'
      };

      const normPredicted = adapter.normalizeJob(predictedJob, 'in');
      expect(normPredicted.salary.type).toBe('estimated');
      expect(normPredicted.salary.source).toContain('Predictive Salary Model');
      expect(normPredicted.salary.isPredicted).toBe(true);
      expect(normPredicted.salary.displaySalary).toContain('Est.');
    });
  });

  describe('3. Deduplication and In-Memory Caching', () => {
    it('should deduplicate identical vacancies across duplicate results', () => {
      const duplicateJobs = [
        {
          id: 'job_dup_1',
          title: 'Senior Frontend Engineer',
          employer: { name: 'Microsoft' },
          location: { city: 'Hyderabad' }
        },
        {
          id: 'job_dup_2',
          title: 'Senior Frontend Engineer',
          employer: { name: 'Microsoft' },
          location: { city: 'Hyderabad' }
        },
        {
          id: 'job_unique_3',
          title: 'Senior Backend Engineer',
          employer: { name: 'Microsoft' },
          location: { city: 'Hyderabad' }
        }
      ];

      const deduplicated = jobExplorerService._deduplicateJobs(duplicateJobs);
      expect(deduplicated.length).toBe(2);
      expect(deduplicated[0].id).toBe('job_dup_1');
      expect(deduplicated[1].id).toBe('job_unique_3');
    });

    it('should cache search results and return cached copy on duplicate query within TTL', async () => {
      const mockResult = {
        jobs: [
          {
            id: 'job_cache_test',
            title: 'Cloud Architect',
            employer: { name: 'Amazon' },
            location: { city: 'Bengaluru' },
            salary: { hasSalary: false }
          }
        ],
        total: 1,
        page: 1,
        totalPages: 1,
        provider: 'jsearch'
      };

      const searchSpy = jest.spyOn(jobExplorerService.jsearchAdapter, 'searchJobs').mockResolvedValueOnce(mockResult);

      // Call 1: uncached
      const queryParams = { query: 'Cloud Architect Unique', location: 'Bengaluru', country: 'in' };
      const res1 = await jobExplorerService.searchJobs(queryParams);
      expect(res1.isCached).toBe(false);
      expect(searchSpy).toHaveBeenCalledTimes(1);

      // Call 2: should hit in-memory cache
      const res2 = await jobExplorerService.searchJobs(queryParams);
      expect(res2.isCached).toBe(true);
      expect(searchSpy).toHaveBeenCalledTimes(1); // not called again

      searchSpy.mockRestore();
    });
  });

  describe('4. Candidate Resume Skill Comparison Engine', () => {
    it('should prompt candidate to upload resume if no resume exists in profile', async () => {
      const res = await request(app)
        .post('/api/job-explorer/compare-skills')
        .set(cand2Auth.header)
        .send({
          jobData: {
            title: 'Node.js Backend Engineer',
            requiredSkills: ['Node.js', 'PostgreSQL', 'Docker']
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.data.hasResume).toBe(false);
      expect(res.body.data.matchScore).toBe(0);
      expect(res.body.data.message).toContain('No saved resume found');
    });

    it('should match candidate saved resume skills against job requirements with evidence citations', async () => {
      const res = await request(app)
        .post('/api/job-explorer/compare-skills')
        .set(cand1Auth.header)
        .send({
          jobData: {
            title: 'Full Stack Engineer',
            requiredSkills: ['JavaScript', 'Python', 'Golang', 'Kubernetes'],
            description: 'Looking for a full stack engineer proficient in JavaScript and Python.'
          }
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.hasResume).toBe(true);
      expect(data.matchScore).toBeGreaterThan(0);

      // Matched skills should include JavaScript or Python
      const matchedNames = data.matchedSkills.map(s => s.name.toLowerCase());
      expect(matchedNames.some(n => n.includes('javascript') || n.includes('python'))).toBe(true);

      // Absent skills should include Golang or Kubernetes
      const absentNames = data.absentSkills.map(s => s.name.toLowerCase());
      expect(absentNames.some(n => n.includes('golang') || n.includes('kubernetes'))).toBe(true);

      // Distinction check: Absent skills are not categorized as proven lacking
      data.absentSkills.forEach(absent => {
        expect(absent.status).toBe('absent_from_resume');
      });
    });
  });

  describe('5. Job-Specific Adaptive AI Interview Launch', () => {
    it('should reject candidate without a saved resume from starting an interview', async () => {
      const res = await request(app)
        .post('/api/job-explorer/prepare-interview')
        .set(cand2Auth.header)
        .send({
          jobData: {
            title: 'DevOps Engineer',
            requiredSkills: ['Docker', 'Kubernetes']
          }
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.message || res.body.message).toContain('upload your resume in the Profile page');
    });

    it('should create and link a real market job and start adaptive interview for candidate with saved resume', async () => {
      const realJobData = {
        id: 'real_ext_job_999',
        title: 'Senior Distributed Systems Engineer',
        employer: { name: 'Razorpay Technologies' },
        location: { displayLocation: 'Bengaluru, Karnataka, India' },
        employmentType: 'full-time',
        experienceLevel: 'Senior (5+ yrs)',
        description: 'Design resilient transaction engines using Node.js and distributed databases.',
        requiredSkills: ['Node.js', 'Distributed Systems', 'PostgreSQL'],
        salary: {
          hasSalary: true,
          type: 'advertised',
          displaySalary: '₹28,00,000 - ₹38,00,000 / year'
        },
        source: 'LinkedIn via JSearch',
        applyUrl: 'https://careers.razorpay.com/job/distributed'
      };

      const res = await request(app)
        .post('/api/job-explorer/prepare-interview')
        .set(cand1Auth.header)
        .send({ jobData: realJobData });

      expect(res.status).toBe(201);
      const data = res.body.data;

      // Verify interview was scheduled
      expect(data.interview).toBeDefined();
      expect(data.interview.id).toBeDefined();
      expect(data.interview.candidateId).toBe(candidateId1);
      expect(data.interview.status).toBe('scheduled');

      // Verify immutable resume snapshot was attached
      expect(data.interview.resumeId).toBe(candidateId1);
      expect(data.interview.candidateProfileSnapshot).toBeDefined();

      // Verify job record was persisted with market metadata
      expect(data.job).toBeDefined();
      expect(data.job.title).toBe('Senior Distributed Systems Engineer');
      expect(data.job.company).toBe('Razorpay Technologies');
      expect(data.job.isExternalMarketJob).toBe(true);
      expect(data.job.salary.displaySalary).toBe('₹28,00,000 - ₹38,00,000 / year');
      expect(data.job.applyUrl).toBe('https://careers.razorpay.com/job/distributed');
    });
  });

  describe('6. Resilience & Unconfigured Provider Handling', () => {
    it('should return authentic 503 error when provider key is unconfigured without returning fake listings', async () => {
      const unconfiguredAdapter = new JSearchAdapter({ apiKey: '' });
      await expect(unconfiguredAdapter.searchJobs({ query: 'Software Engineer' }))
        .rejects.toThrow('JSearch API key is not configured');
    });
  });
});
