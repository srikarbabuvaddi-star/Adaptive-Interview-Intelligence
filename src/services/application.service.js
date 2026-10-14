const { COLLECTIONS, getCollection, toTimestamp } = require('./db/firestore.service');
const ApiError = require('../utils/apiError');
const { APPLICATION_STATUS, JOB_STATUS } = require('../constants/interviewStatus');
const { ROLES } = require('../constants/roles');

class ApplicationService {
  /**
   * Candidate applies for an active job
   */
  async createApplication({ jobId, candidateId, resumeUrl, coverNote, candidateSkills }) {
    // 1. Verify job exists and is published
    const jobDocSnap = await getCollection(COLLECTIONS.JOBS).doc(jobId).get();
    if (!jobDocSnap.exists) {
      throw ApiError.notFound('Job posting not found');
    }
    const job = jobDocSnap.data();
    if (job.status !== JOB_STATUS.PUBLISHED) {
      throw ApiError.badRequest('This job posting is not accepting applications');
    }

    // 2. Prevent duplicate application
    const appCol = getCollection(COLLECTIONS.APPLICATIONS);
    const existingApps = await appCol
      .where('jobId', '==', jobId)
      .where('candidateId', '==', candidateId)
      .get();

    if (!existingApps.empty) {
      throw ApiError.conflict('You have already applied for this position');
    }

    // 3. Automatically link active saved resume and extracted skills
    let activeResumeSnapshot = null;
    let skillsList = candidateSkills || [];

    const resumeSnap = await getCollection(COLLECTIONS.RESUMES).doc(candidateId).get();
    if (resumeSnap.exists) {
      const resumeData = resumeSnap.data();
      activeResumeSnapshot = {
        resumeId: candidateId,
        resumeVersion: resumeData.currentVersion || 1,
        filename: resumeData.originalName || resumeData.filename,
        uploadedAt: resumeData.updatedAt || resumeData.createdAt
      };
      if (skillsList.length === 0 && Array.isArray(resumeData.extractedProfile?.skills)) {
        skillsList = resumeData.extractedProfile.skills;
      }
    }

    // 4. Create application
    const appDocRef = appCol.doc();
    const application = {
      id: appDocRef.id,
      jobId,
      candidateId,
      recruiterId: job.recruiterId,
      resumeUrl: resumeUrl || null,
      resumeSnapshot: activeResumeSnapshot,
      resumeVersion: activeResumeSnapshot ? activeResumeSnapshot.resumeVersion : null,
      coverNote: coverNote || '',
      candidateSkills: skillsList,
      status: APPLICATION_STATUS.PENDING,
      jobTitle: job.title,
      createdAt: toTimestamp(),
      updatedAt: toTimestamp()
    };

    await appDocRef.set(application);
    return application;
  }

  /**
   * Recruiter gets applications for a specific job
   */
  async getApplicationsByJob(jobId, recruiterId) {
    // Verify recruiter owns job
    const jobDocSnap = await getCollection(COLLECTIONS.JOBS).doc(jobId).get();
    if (!jobDocSnap.exists) {
      throw ApiError.notFound('Job posting not found');
    }
    const job = jobDocSnap.data();
    if (job.recruiterId !== recruiterId) {
      throw ApiError.forbidden('Forbidden: You can only view applications for jobs you manage');
    }

    const appCol = getCollection(COLLECTIONS.APPLICATIONS);
    const snapshot = await appCol.where('jobId', '==', jobId).get();

    const applications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    applications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return applications;
  }

  /**
   * Candidate views all their applications
   */
  async getCandidateApplications(candidateId) {
    const appCol = getCollection(COLLECTIONS.APPLICATIONS);
    const snapshot = await appCol.where('candidateId', '==', candidateId).get();

    const applications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    applications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return applications;
  }

  /**
   * Get single application by ID with ownership verification
   */
  async getApplicationById(applicationId, user) {
    const appDocSnap = await getCollection(COLLECTIONS.APPLICATIONS).doc(applicationId).get();
    if (!appDocSnap.exists) {
      throw ApiError.notFound('Application not found');
    }

    const app = { id: appDocSnap.id, ...appDocSnap.data() };

    // Check ownership
    if (user.role === ROLES.CANDIDATE && app.candidateId !== user.uid) {
      throw ApiError.forbidden('Forbidden: You can only access your own applications');
    }
    if (user.role === ROLES.RECRUITER && app.recruiterId !== user.uid) {
      throw ApiError.forbidden('Forbidden: You can only access applications for jobs you manage');
    }

    return app;
  }

  /**
   * Recruiter updates application status
   */
  async updateApplicationStatus(applicationId, recruiterId, status, reviewNotes) {
    const appDocRef = getCollection(COLLECTIONS.APPLICATIONS).doc(applicationId);
    const appSnap = await appDocRef.get();

    if (!appSnap.exists) {
      throw ApiError.notFound('Application not found');
    }

    const app = appSnap.data();
    if (app.recruiterId !== recruiterId) {
      throw ApiError.forbidden('Forbidden: You can only update applications for jobs you manage');
    }

    const updates = {
      status,
      ...(reviewNotes !== undefined ? { reviewNotes: String(reviewNotes).trim() } : {}),
      updatedAt: toTimestamp()
    };

    await appDocRef.update(updates);
    return { id: applicationId, ...app, ...updates };
  }
}

module.exports = new ApplicationService();
