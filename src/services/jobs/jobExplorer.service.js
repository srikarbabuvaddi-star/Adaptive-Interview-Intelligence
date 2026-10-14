const JSearchAdapter = require('./adapters/jsearch.adapter');
const AdzunaAdapter = require('./adapters/adzuna.adapter');
const env = require('../../config/env');
const ApiError = require('../../utils/apiError');
const logger = require('../../utils/logger');
const { COLLECTIONS, getCollection, toTimestamp } = require('../db/firestore.service');
const { JOB_STATUS, QUESTION_DIFFICULTY } = require('../../constants/interviewStatus');
const interviewService = require('../interview.service');

class JobExplorerService {
  constructor() {
    this.jsearchAdapter = new JSearchAdapter();
    this.adzunaAdapter = new AdzunaAdapter();
    this.cache = new Map(); // key -> { data, timestamp }
    this.cacheTtlMs = env.JOB_CACHE_TTL_MS || 15 * 60 * 1000;
  }

  /**
   * Returns active provider adapter based on config or preference
   */
  getAdapter(preferredProvider) {
    const provider = preferredProvider || env.JOB_DATA_PROVIDER || 'jsearch';
    if (provider.toLowerCase() === 'adzuna') {
      return this.adzunaAdapter;
    }
    return this.jsearchAdapter;
  }

  /**
   * Generates a stable cache key for search queries
   */
  _generateCacheKey(prefix, params) {
    const sorted = Object.keys(params)
      .sort()
      .map(k => `${k}=${params[k]}`)
      .join('&');
    return `${prefix}:${sorted}`;
  }

  /**
   * Retrieves data from in-memory cache if valid
   */
  _getFromCache(key) {
    if (!this.cache.has(key)) return null;
    const entry = this.cache.get(key);
    const now = Date.now();
    if (now - entry.timestamp > this.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }
    return { ...entry.data, isCached: true, cachedAt: new Date(entry.timestamp).toISOString() };
  }

  /**
   * Saves data to in-memory cache
   */
  _setCache(key, data) {
    // Prevent memory leaks: cap cache entries at 500
    if (this.cache.size > 500) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Deduplicates jobs across result set by title, employer, and city
   */
  _deduplicateJobs(jobs) {
    const seen = new Set();
    const deduplicated = [];

    for (const job of jobs) {
      const normTitle = (job.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const normEmp = (job.employer?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const normCity = (job.location?.city || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const compositeKey = `${normTitle}|${normEmp}|${normCity}`;

      if (!seen.has(compositeKey)) {
        seen.add(compositeKey);
        deduplicated.push(job);
      }
    }

    return deduplicated;
  }

  /**
   * Searches live job vacancies with deduplication and caching
   */
  async searchJobs(searchParams = {}) {
    const adapter = this.getAdapter(searchParams.provider);
    const cacheKey = this._generateCacheKey(`search_${adapter.getProviderName()}`, searchParams);

    const cached = this._getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const result = await adapter.searchJobs(searchParams);
      const deduplicatedJobs = this._deduplicateJobs(result.jobs);

      const responsePayload = {
        jobs: deduplicatedJobs,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        provider: adapter.getProviderName(),
        isCached: false,
        retrievedAt: new Date().toISOString()
      };

      this._setCache(cacheKey, responsePayload);
      return responsePayload;
    } catch (err) {
      // If primary failed and alternative is available, try fallback
      if (adapter.getProviderName() === 'jsearch' && this.adzunaAdapter._isConfigured()) {
        logger.warn(`JSearch search failed, attempting fallback to Adzuna: ${err.message}`);
        const result = await this.adzunaAdapter.searchJobs(searchParams);
        return {
          jobs: this._deduplicateJobs(result.jobs),
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          provider: 'adzuna (fallback)',
          isCached: false,
          retrievedAt: new Date().toISOString()
        };
      }
      throw err;
    }
  }

  /**
   * Retrieves single job details with salary augmentation if needed
   */
  async getJobDetails(jobId, provider) {
    const adapter = this.getAdapter(provider);
    const cacheKey = `job_details:${adapter.getProviderName()}:${jobId}`;

    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;

    const job = await adapter.getJobDetails(jobId);

    // If listing lacks advertised salary, try to fetch estimated salary
    if (!job.salary.hasSalary) {
      try {
        const estimate = await adapter.getSalaryEstimate({
          jobTitle: job.title,
          location: job.location?.city || job.location?.displayLocation,
          country: job.location?.country
        });

        if (estimate.hasEstimate) {
          job.marketSalaryBenchmark = estimate;
        }
      } catch (err) {
        logger.warn(`Failed to fetch estimated salary for ${job.title}: ${err.message}`);
      }
    }

    this._setCache(cacheKey, job);
    return job;
  }

  /**
   * Retrieves market salary benchmark for a role & location
   */
  async getSalaryBenchmark({ jobTitle, location, country = 'in' }) {
    if (!jobTitle) {
      throw ApiError.badRequest('jobTitle is required to look up salary benchmark');
    }

    const adapter = this.getAdapter();
    const cacheKey = `salary_bm:${jobTitle.toLowerCase()}:${(location || '').toLowerCase()}:${country.toLowerCase()}`;
    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;

    const benchmark = await adapter.getSalaryEstimate({ jobTitle, location, country });
    this._setCache(cacheKey, benchmark);
    return benchmark;
  }

  /**
   * Compares candidate's saved resume profile against job requirements
   * Distinguishes matched skills, missing skills, unverified resume claims, and proven gaps.
   */
  async compareResumeWithJob({ candidateId, jobData }) {
    if (!candidateId) {
      throw ApiError.unauthorized('Candidate authentication required');
    }

    if (!jobData || (!jobData.requiredSkills && !jobData.title)) {
      throw ApiError.badRequest('Valid jobData with requiredSkills or title is required');
    }

    // 1. Fetch Candidate's saved resume
    const resumeCol = getCollection(COLLECTIONS.RESUMES);
    const resumeSnap = await resumeCol.doc(candidateId).get();

    if (!resumeSnap.exists) {
      return {
        hasResume: false,
        message: 'No saved resume found in your profile. Please upload your resume once from your Profile page to compare skills.',
        matchScore: 0,
        matchedSkills: [],
        absentSkills: jobData.requiredSkills || [],
        unverifiedSkills: [],
        interviewProvenLacking: []
      };
    }

    const resumeData = resumeSnap.data();
    const extracted = resumeData.extractedProfile || {};
    const resumeSkills = (extracted.skills || []).map(s => (typeof s === 'string' ? s : s.name)).filter(Boolean);
    const resumeTech = (extracted.technologies || []).filter(Boolean);
    const resumeProjects = extracted.projects || [];
    const resumeExp = extracted.workExperience || [];

    // Also include skills from candidate's user profile
    const userSnap = await getCollection(COLLECTIONS.USERS).doc(candidateId).get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const userSkills = (userData.candidateProfile?.skills || []).map(s => (typeof s === 'string' ? s : s.name)).filter(Boolean);

    // All skills claimed in candidate resume and verified profile
    const candidateClaimedSkills = Array.from(new Set([...resumeSkills, ...resumeTech, ...userSkills]));

    // Job skills to match against
    const jobSkills = Array.isArray(jobData.requiredSkills) && jobData.requiredSkills.length > 0
      ? jobData.requiredSkills
      : ['Software Engineering', 'Problem Solving'];

    // 2. Fetch candidate's past interview reports to check for proven gaps vs unverified claims
    const reportsCol = getCollection(COLLECTIONS.REPORTS);
    const pastReportsSnap = await reportsCol.where('candidateId', '==', candidateId).get();

    const interviewEvaluatedSkills = new Map(); // skillName -> averageScore
    pastReportsSnap.docs.forEach(doc => {
      const rep = doc.data();
      if (rep.skillScores) {
        Object.entries(rep.skillScores).forEach(([skill, score]) => {
          interviewEvaluatedSkills.set(skill.toLowerCase(), score);
        });
      }
    });

    const matchedSkills = [];
    const absentSkills = [];
    const interviewProvenLacking = [];
    const unverifiedSkills = [];

    // Match each job skill
    jobSkills.forEach(reqSkill => {
      const reqName = typeof reqSkill === 'string' ? reqSkill : reqSkill.name;
      const reqLower = reqName.toLowerCase();

      // Check if found in resume
      const foundInResume = candidateClaimedSkills.some(cs => {
        const cLower = cs.toLowerCase();
        return cLower === reqLower || cLower.includes(reqLower) || reqLower.includes(cLower);
      });

      // Find supporting evidence from projects or work experience
      let evidence = null;
      if (foundInResume) {
        const matchingProject = resumeProjects.find(p =>
          (p.technologies || []).some(t => t.toLowerCase().includes(reqLower)) ||
          (p.description || '').toLowerCase().includes(reqLower)
        );
        if (matchingProject) {
          evidence = `Demonstrated in project: "${matchingProject.title || 'Portfolio Project'}" - ${matchingProject.description?.slice(0, 100) || ''}...`;
        } else {
          const matchingWork = resumeExp.find(w =>
            (w.responsibilities || []).some(r => r.toLowerCase().includes(reqLower)) ||
            (w.role || w.title || '').toLowerCase().includes(reqLower)
          );
          if (matchingWork) {
            evidence = `Applied at ${matchingWork.company || 'Previous Employer'} as ${matchingWork.title || matchingWork.role}`;
          } else {
            evidence = 'Listed in technical skills on verified resume';
          }
        }
      }

      // Check interview performance history
      const pastScore = interviewEvaluatedSkills.get(reqLower);

      if (foundInResume) {
        if (pastScore !== undefined && pastScore < 4.5) {
          interviewProvenLacking.push({
            name: reqName,
            pastScore,
            status: 'proven_lacking_in_interview',
            detail: `Claimed on resume, but evaluated as a skill gap in prior interview (Score: ${pastScore.toFixed(1)}/10)`
          });
        } else {
          matchedSkills.push({
            name: reqName,
            evidence,
            verifiedInInterview: pastScore !== undefined && pastScore >= 7.0,
            interviewScore: pastScore !== undefined ? pastScore : null
          });
        }
      } else {
        // Skill is absent from resume.
        // Direct instruction: "Distinguish between skills absent from the resume and skills proven to be lacking; these are not equivalent."
        if (pastScore !== undefined && pastScore < 4.5) {
          interviewProvenLacking.push({
            name: reqName,
            pastScore,
            status: 'proven_lacking_in_interview',
            detail: `Not on resume, and tested as a development area in past interview (Score: ${pastScore.toFixed(1)}/10)`
          });
        } else {
          absentSkills.push({
            name: reqName,
            status: 'absent_from_resume',
            detail: 'Not explicitly listed on uploaded resume'
          });
        }
      }
    });

    // Determine unverified resume claims (skills on resume not yet tested in interview)
    candidateClaimedSkills.forEach(cs => {
      if (!interviewEvaluatedSkills.has(cs.toLowerCase())) {
        unverifiedSkills.push(cs);
      }
    });

    const totalJobSkills = Math.max(jobSkills.length, 1);
    const matchScore = Math.min(100, Math.round((matchedSkills.length / totalJobSkills) * 100));

    return {
      hasResume: true,
      resumeVersion: resumeData.currentVersion || 1,
      resumeFilename: resumeData.originalName || resumeData.filename,
      matchScore,
      matchedSkills,
      absentSkills,
      interviewProvenLacking,
      unverifiedSkills: unverifiedSkills.slice(0, 10),
      summary: `${matchedSkills.length} of ${totalJobSkills} required skills matched from your saved resume.`
    };
  }

  /**
   * Prepares and starts a tailored adaptive interview session for a real market job
   */
  async prepareJobInterview({ candidateId, jobData }) {
    if (!candidateId) {
      throw ApiError.unauthorized('Candidate authentication required');
    }

    if (!jobData || !jobData.title) {
      throw ApiError.badRequest('Valid jobData with title and description is required');
    }

    // 1. Verify candidate has an active resume
    const resumeCol = getCollection(COLLECTIONS.RESUMES);
    const resumeSnap = await resumeCol.doc(candidateId).get();
    if (!resumeSnap.exists) {
      throw ApiError.badRequest(
        'Please upload your resume in the Profile page before starting an interview. Your resume is used to personalize interview questions.'
      );
    }
    const resumeData = resumeSnap.data();

    // 2. Convert and persist market job into COLLECTIONS.JOBS
    const jobsCol = getCollection(COLLECTIONS.JOBS);
    const safeJobId = `market_${String(jobData.id || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const jobDocRef = jobsCol.doc(safeJobId);

    const skillsArray = Array.isArray(jobData.requiredSkills) && jobData.requiredSkills.length > 0
      ? jobData.requiredSkills
      : ['Software Engineering', 'Problem Solving'];

    const structuredSkills = skillsArray.map(s => {
      const name = typeof s === 'string' ? s : s.name;
      return {
        name,
        minimumLevel: QUESTION_DIFFICULTY.INTERMEDIATE,
        weight: 1
      };
    });

    const marketJobRecord = {
      id: safeJobId,
      externalJobId: String(jobData.id || ''),
      recruiterId: 'market-job-explorer',
      title: jobData.title,
      company: jobData.employer?.name || 'Hiring Employer',
      employer: jobData.employer || { name: 'Hiring Employer' },
      description: jobData.description || `Assessment for ${jobData.title}`,
      department: 'Engineering',
      location: jobData.location?.displayLocation || 'Remote',
      employmentType: jobData.employmentType || 'full-time',
      experienceLevel: jobData.experienceLevel || 'Intermediate',
      requiredSkills: structuredSkills,
      evaluationCriteria: structuredSkills.map(s => `Demonstrate technical depth and problem solving in ${s.name}`),
      salary: jobData.salary || null,
      source: jobData.source || 'Job Explorer Market Search',
      applyUrl: jobData.applyUrl || '#',
      isExternalMarketJob: true,
      status: JOB_STATUS.PUBLISHED,
      maxQuestions: 5,
      targetDurationMinutes: 25,
      createdAt: toTimestamp(),
      updatedAt: toTimestamp()
    };

    await jobDocRef.set(marketJobRecord);

    // 3. Launch adaptive interview session linking candidate, saved resume, and market job
    const interview = await interviewService.createInterview({
      jobId: safeJobId,
      candidateId,
      targetRole: {
        title: jobData.title,
        experienceLevel: jobData.experienceLevel || 'Intermediate'
      }
    });

    return {
      interview,
      job: marketJobRecord,
      resumeVersionUsed: resumeData.currentVersion || 1,
      resumeFilename: resumeData.originalName || resumeData.filename
    };
  }
}

module.exports = new JobExplorerService();
