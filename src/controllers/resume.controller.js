const resumeService = require('../services/resume.service');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const { ROLES } = require('../constants/roles');

class ResumeController {
  /**
   * Upload / replace resume for the authenticated candidate
   */
  async uploadResume(req, res, next) {
    try {
      if (req.user.role !== ROLES.CANDIDATE) {
        throw ApiError.forbidden('Only candidates can upload resumes');
      }

      const candidateId = req.user.uid;
      const result = await resumeService.uploadResume({
        candidateId,
        file: req.file
      });

      return ApiResponse.created(
        res,
        result,
        `Resume ${result.originalName} (v${result.currentVersion}) uploaded and processed successfully`
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Retrieve active resume and extracted profile for authenticated candidate
   */
  async getMyResume(req, res, next) {
    try {
      const candidateId = req.user.uid;
      const resume = await resumeService.getCandidateResume(candidateId, req.user);

      if (!resume) {
        return ApiResponse.success(
          res,
          null,
          'No resume has been uploaded yet. Please upload a resume to unlock role applications and AI interviews.'
        );
      }

      return ApiResponse.success(res, resume, 'Resume retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Retrieve version history for authenticated candidate
   */
  async getMyResumeVersions(req, res, next) {
    try {
      const candidateId = req.user.uid;
      const versions = await resumeService.getResumeVersions(candidateId, req.user);
      return ApiResponse.success(res, versions, 'Resume versions retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Securely stream/download authenticated candidate's own resume
   */
  async downloadMyResume(req, res, next) {
    try {
      const candidateId = req.user.uid;
      const version = req.query.version ? parseInt(req.query.version, 10) : null;
      const fileInfo = await resumeService.getResumeFileForDownload(candidateId, req.user, version);

      res.setHeader('Content-Type', fileInfo.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.filename}"`);
      return res.download(fileInfo.filePath, fileInfo.filename);
    } catch (err) {
      next(err);
    }
  }

  /**
   * For recruiters: View applicant's resume extracted profile
   */
  async getCandidateResume(req, res, next) {
    try {
      const { candidateId } = req.params;
      const resume = await resumeService.getCandidateResume(candidateId, req.user);

      if (!resume) {
        throw ApiError.notFound('Candidate resume not found');
      }

      return ApiResponse.success(res, resume, 'Candidate resume retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * For recruiters: Securely stream/download an applicant's resume
   */
  async downloadCandidateResume(req, res, next) {
    try {
      const { candidateId } = req.params;
      const version = req.query.version ? parseInt(req.query.version, 10) : null;
      const fileInfo = await resumeService.getResumeFileForDownload(candidateId, req.user, version);

      res.setHeader('Content-Type', fileInfo.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.filename}"`);
      return res.download(fileInfo.filePath, fileInfo.filename);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Reprocess active resume (e.g. if AI model extraction was retried or updated)
   */
  async reprocessMyResume(req, res, next) {
    try {
      const candidateId = req.user.uid;
      const updated = await resumeService.reprocessResume(candidateId, req.user);
      return ApiResponse.success(res, updated, 'Resume reprocessed successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ResumeController();
