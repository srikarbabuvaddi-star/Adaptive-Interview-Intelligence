const jobExplorerService = require('../services/jobs/jobExplorer.service');

class JobExplorerController {
  /**
   * GET /api/job-explorer/search
   */
  async searchJobs(req, res, next) {
    try {
      const results = await jobExplorerService.searchJobs(req.query);
      return res.status(200).json({
        status: 'success',
        data: results
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/job-explorer/jobs/:jobId
   */
  async getJobDetails(req, res, next) {
    try {
      const job = await jobExplorerService.getJobDetails(req.params.jobId, req.query.provider);
      return res.status(200).json({
        status: 'success',
        data: job
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/job-explorer/salary-benchmark
   */
  async getSalaryBenchmark(req, res, next) {
    try {
      const benchmark = await jobExplorerService.getSalaryBenchmark(req.query);
      return res.status(200).json({
        status: 'success',
        data: benchmark
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/job-explorer/compare-skills
   */
  async compareSkills(req, res, next) {
    try {
      const candidateId = req.user.uid;
      const comparison = await jobExplorerService.compareResumeWithJob({
        candidateId,
        jobData: req.body.jobData
      });
      return res.status(200).json({
        status: 'success',
        data: comparison
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/job-explorer/prepare-interview
   */
  async prepareInterview(req, res, next) {
    try {
      const candidateId = req.user.uid;
      const result = await jobExplorerService.prepareJobInterview({
        candidateId,
        jobData: req.body.jobData
      });
      return res.status(201).json({
        status: 'success',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new JobExplorerController();
