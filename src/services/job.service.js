const { COLLECTIONS, getCollection, toTimestamp } = require('./db/firestore.service');
const ApiError = require('../utils/apiError');
const { JOB_STATUS } = require('../constants/interviewStatus');
const { ROLES } = require('../constants/roles');

class JobService {
  /**
   * Creates a new job posting (recruiter only)
   */
  async createJob(recruiterId, jobData) {
    const jobsCol = getCollection(COLLECTIONS.JOBS);
    const newJobDoc = jobsCol.doc();

    const job = {
      id: newJobDoc.id,
      recruiterId,
      title: jobData.title,
      description: jobData.description,
      department: jobData.department || 'Engineering',
      location: jobData.location || 'Remote',
      employmentType: jobData.employmentType || 'full-time',
      requiredSkills: jobData.requiredSkills,
      evaluationCriteria: jobData.evaluationCriteria || [],
      status: jobData.status || JOB_STATUS.PUBLISHED,
      maxQuestions: jobData.maxQuestions || 5,
      targetDurationMinutes: jobData.targetDurationMinutes || 30,
      createdAt: toTimestamp(),
      updatedAt: toTimestamp()
    };

    await newJobDoc.set(job);
    return job;
  }

  /**
   * Retrieves jobs with filtering, pagination and access control
   */
  async getJobs({ user, status, search, department, page = 1, limit = 10 }) {
    const jobsCol = getCollection(COLLECTIONS.JOBS);
    let query = jobsCol;

    if (user.role === ROLES.CANDIDATE) {
      // Candidates can only see published jobs
      query = query.where('status', '==', JOB_STATUS.PUBLISHED);
    } else if (user.role === ROLES.RECRUITER) {
      // Recruiters see their own jobs
      query = query.where('recruiterId', '==', user.uid);
      if (status) {
        query = query.where('status', '==', status);
      }
    }

    const snapshot = await query.get();
    let jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Apply in-memory text search and department filter if specified
    if (department) {
      jobs = jobs.filter(j => j.department.toLowerCase() === department.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      jobs = jobs.filter(j =>
        j.title.toLowerCase().includes(q) ||
        j.description.toLowerCase().includes(q) ||
        (j.requiredSkills || []).some(s => s.name.toLowerCase().includes(q))
      );
    }

    // Sort newest first
    jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = jobs.length;
    const startIndex = (page - 1) * limit;
    const paginated = jobs.slice(startIndex, startIndex + limit);

    return {
      jobs: paginated,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Retrieves a single job by ID with authorization checks
   */
  async getJobById(jobId, user) {
    const jobDocSnap = await getCollection(COLLECTIONS.JOBS).doc(jobId).get();
    if (!jobDocSnap.exists) {
      throw ApiError.notFound('Job posting not found');
    }

    const job = { id: jobDocSnap.id, ...jobDocSnap.data() };

    // Candidates can only view published jobs
    if (user.role === ROLES.CANDIDATE && job.status !== JOB_STATUS.PUBLISHED) {
      throw ApiError.notFound('Job posting is not active');
    }

    return job;
  }

  /**
   * Updates an existing job (recruiter owner only)
   */
  async updateJob(jobId, recruiterId, updateData) {
    const jobDocRef = getCollection(COLLECTIONS.JOBS).doc(jobId);
    const existingSnap = await jobDocRef.get();

    if (!existingSnap.exists) {
      throw ApiError.notFound('Job posting not found');
    }

    const job = existingSnap.data();
    if (job.recruiterId !== recruiterId) {
      throw ApiError.forbidden('Forbidden: You can only update jobs created by your account');
    }

    const updates = {
      ...updateData,
      updatedAt: toTimestamp()
    };
    delete updates.id;
    delete updates.recruiterId;
    delete updates.createdAt;

    await jobDocRef.update(updates);
    const updatedSnap = await jobDocRef.get();
    return { id: jobId, ...updatedSnap.data() };
  }

  /**
   * Deletes a job (recruiter owner only)
   */
  async deleteJob(jobId, recruiterId) {
    const jobDocRef = getCollection(COLLECTIONS.JOBS).doc(jobId);
    const existingSnap = await jobDocRef.get();

    if (!existingSnap.exists) {
      throw ApiError.notFound('Job posting not found');
    }

    const job = existingSnap.data();
    if (job.recruiterId !== recruiterId) {
      throw ApiError.forbidden('Forbidden: You can only delete jobs created by your account');
    }

    await jobDocRef.delete();
    return { message: 'Job posting deleted successfully' };
  }
}

module.exports = new JobService();
