const interviewService = require('../services/interview.service');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const { ROLES } = require('../constants/roles');

class InterviewController {
  async createInterview(req, res, next) {
    try {
      const isCandidate = req.user.role === ROLES.CANDIDATE;
      const candidateId = isCandidate
        ? req.user.uid
        : (req.body.candidateId || req.user.uid);

      if (!candidateId) {
        throw ApiError.badRequest('candidateId is required');
      }

      const interview = await interviewService.createInterview({
        jobId: req.body.jobId,
        candidateId,
        recruiterId: isCandidate ? null : req.user.uid,
        applicationId: req.body.applicationId,
        targetRole: req.body.targetRole
      });

      return ApiResponse.created(res, interview, 'Interview session created successfully');
    } catch (error) {
      next(error);
    }
  }

  async getInterviews(req, res, next) {
    try {
      const result = await interviewService.getInterviews({
        user: req.user,
        status: req.query.status,
        page: req.query.page,
        limit: req.query.limit
      });
      return ApiResponse.success(
        res,
        result.interviews,
        'Interviews retrieved successfully',
        200,
        result.pagination
      );
    } catch (error) {
      next(error);
    }
  }

  async getInterviewById(req, res, next) {
    try {
      const interview = await interviewService.getInterviewById(req.params.interviewId, req.user);
      return ApiResponse.success(res, interview, 'Interview retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async startInterview(req, res, next) {
    try {
      const result = await interviewService.startInterview(req.params.interviewId, req.user);
      return ApiResponse.success(res, result, 'Interview session started. First question generated.');
    } catch (error) {
      next(error);
    }
  }

  async submitAnswer(req, res, next) {
    try {
      const result = await interviewService.submitAnswer(
        req.params.interviewId,
        req.user,
        req.body
      );
      return ApiResponse.success(res, result, 'Answer submitted and evaluated successfully');
    } catch (error) {
      next(error);
    }
  }

  async endInterview(req, res, next) {
    try {
      const result = await interviewService.endInterview(
        req.params.interviewId,
        req.user,
        req.body
      );
      return ApiResponse.success(res, result, 'Interview ended');
    } catch (error) {
      next(error);
    }
  }

  async recordIntegrityEvent(req, res, next) {
    try {
      const event = await interviewService.recordIntegrityEvent(
        req.params.interviewId,
        req.user,
        req.body
      );
      return ApiResponse.created(res, event, 'Integrity event logged');
    } catch (error) {
      next(error);
    }
  }

  async getIntegrityTimeline(req, res, next) {
    try {
      const data = await interviewService.getIntegrityTimeline(
        req.params.interviewId,
        req.user
      );
      return ApiResponse.success(res, data, 'Integrity timeline retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async reviewIntegrityEvent(req, res, next) {
    try {
      const updated = await interviewService.reviewIntegrityEvent(
        req.params.interviewId,
        req.params.eventId,
        req.user,
        req.body
      );
      return ApiResponse.success(res, updated, 'Integrity event review status updated');
    } catch (error) {
      next(error);
    }
  }

  async getSkillGapAnalysis(req, res, next) {
    try {
      const data = await interviewService.getSkillGapAnalysis(
        req.params.interviewId,
        req.user
      );
      return ApiResponse.success(res, data, 'Skill gap analysis retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new InterviewController();
