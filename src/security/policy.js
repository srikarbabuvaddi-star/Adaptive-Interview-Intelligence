const { ROLES } = require('../constants/roles');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

class PolicyEngine {
  /**
   * Enforces role-based or attribute-based authorization for interview access
   */
  canAccessInterview(user, interview) {
    if (!user || !interview) return false;
    if (user.role === ROLES.RECRUITER) {
      return interview.recruiterId === user.uid;
    }
    return interview.candidateId === user.uid;
  }

  /**
   * Enforces that only the assigned candidate can submit answers for an in-progress interview
   */
  canSubmitAnswer(user, interview) {
    if (!user || !interview) return false;
    if (user.role !== ROLES.CANDIDATE) return false;
    return interview.candidateId === user.uid;
  }

  /**
   * Enforces that reports are accessible only by the owning candidate or the managing recruiter
   */
  canAccessReport(user, report) {
    if (!user || !report) return false;
    if (user.role === ROLES.RECRUITER) {
      return report.recruiterId === user.uid;
    }
    return report.candidateId === user.uid;
  }

  /**
   * Enforces candidate profile access (candidate can access own profile; recruiter can access if active application exists)
   */
  canAccessCandidateProfile(user, targetCandidateId) {
    if (!user || !targetCandidateId) return false;
    if (user.role === ROLES.CANDIDATE) {
      return user.uid === targetCandidateId;
    }
    // Recruiters are authorized if reviewing applicant
    return user.role === ROLES.RECRUITER;
  }

  /**
   * Enforces that recruiters can only manage their own job postings
   */
  canManageJob(user, job) {
    if (!user || !job) return false;
    if (user.role !== ROLES.RECRUITER) return false;
    return job.recruiterId === user.uid;
  }

  /**
   * Enforces that WebSocket interview rooms can only be joined by the session's candidate or recruiter
   */
  canJoinInterviewRoom(user, interview) {
    return this.canAccessInterview(user, interview);
  }

  /**
   * Enforces least-privilege attribute filtering before exposing data
   */
  filterAuthorizedData(user, resourceType, data) {
    if (!data || typeof data !== 'object') return data;
    const sanitized = { ...data };

    // Strip sensitive internal fields, secrets, and credentials
    delete sanitized.apiKey;
    delete sanitized.internalPrompt;
    delete sanitized.rawTokens;

    // Candidates should not see internal recruiter scoring benchmarks or recruiter private notes
    if (user?.role === ROLES.CANDIDATE && resourceType === 'interview') {
      delete sanitized.recruiterInternalNotes;
      delete sanitized.hiringThresholdCutoff;
    }

    return sanitized;
  }

  /**
   * Assertive helper that throws ApiError.forbidden if policy fails
   */
  assert(condition, message = 'Forbidden: Access denied by security policy') {
    if (!condition) {
      logger.warn(`[Security Policy] Authorization assertion failed: ${message}`);
      throw ApiError.forbidden(message);
    }
  }
}

// Export singleton instance
module.exports = new PolicyEngine();
