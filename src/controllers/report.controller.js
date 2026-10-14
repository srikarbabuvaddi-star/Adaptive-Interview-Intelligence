const reportService = require('../services/report.service');
const ApiResponse = require('../utils/apiResponse');

class ReportController {
  async getInterviewReport(req, res, next) {
    try {
      const data = await reportService.getInterviewReport(req.params.interviewId, req.user);
      return ApiResponse.success(res, data, 'Interview report retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getJobReports(req, res, next) {
    try {
      const data = await reportService.getJobReports(req.params.jobId, req.user.uid);
      return ApiResponse.success(res, data, 'Job interview reports retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ReportController();
