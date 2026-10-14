const applicationService = require('../services/application.service');
const ApiResponse = require('../utils/apiResponse');

class ApplicationController {
  async applyJob(req, res, next) {
    try {
      const application = await applicationService.createApplication({
        jobId: req.params.jobId,
        candidateId: req.user.uid,
        resumeUrl: req.body.resumeUrl,
        coverNote: req.body.coverNote,
        candidateSkills: req.body.candidateSkills
      });
      return ApiResponse.created(res, application, 'Application submitted successfully');
    } catch (error) {
      next(error);
    }
  }

  async getApplicationsByJob(req, res, next) {
    try {
      const applications = await applicationService.getApplicationsByJob(
        req.params.jobId,
        req.user.uid
      );
      return ApiResponse.success(res, applications, 'Applications retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getMyApplications(req, res, next) {
    try {
      const applications = await applicationService.getCandidateApplications(req.user.uid);
      return ApiResponse.success(res, applications, 'My applications retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getApplicationById(req, res, next) {
    try {
      const application = await applicationService.getApplicationById(
        req.params.applicationId,
        req.user
      );
      return ApiResponse.success(res, application, 'Application retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req, res, next) {
    try {
      const updated = await applicationService.updateApplicationStatus(
        req.params.applicationId,
        req.user.uid,
        req.body.status,
        req.body.reviewNotes
      );
      return ApiResponse.success(res, updated, 'Application status updated successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ApplicationController();
