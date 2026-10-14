const jobService = require('../services/job.service');
const ApiResponse = require('../utils/apiResponse');

class JobController {
  async createJob(req, res, next) {
    try {
      const job = await jobService.createJob(req.user.uid, req.body);
      return ApiResponse.created(res, job, 'Job posting created successfully');
    } catch (error) {
      next(error);
    }
  }

  async getJobs(req, res, next) {
    try {
      const result = await jobService.getJobs({
        user: req.user,
        status: req.query.status,
        search: req.query.search,
        department: req.query.department,
        page: req.query.page,
        limit: req.query.limit
      });
      return ApiResponse.success(res, result.jobs, 'Jobs retrieved successfully', 200, result.pagination);
    } catch (error) {
      next(error);
    }
  }

  async getJobById(req, res, next) {
    try {
      const job = await jobService.getJobById(req.params.jobId, req.user);
      return ApiResponse.success(res, job, 'Job retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateJob(req, res, next) {
    try {
      const updated = await jobService.updateJob(req.params.jobId, req.user.uid, req.body);
      return ApiResponse.success(res, updated, 'Job updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async deleteJob(req, res, next) {
    try {
      const result = await jobService.deleteJob(req.params.jobId, req.user.uid);
      return ApiResponse.success(res, null, result.message);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new JobController();
