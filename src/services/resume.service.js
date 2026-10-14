const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const { COLLECTIONS, getCollection, toTimestamp } = require('./db/firestore.service');
const { getAIService } = require('./ai');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');
const { ROLES } = require('../constants/roles');

class ResumeService {
  constructor() {
    this.storageBaseDir = path.resolve(process.cwd(), 'storage', 'resumes');
    this._ensureStorageDir(this.storageBaseDir);
  }

  _ensureStorageDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Sanitizes filenames to avoid path traversal or malicious characters
   */
  _sanitizeFilename(filename = 'resume.pdf') {
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .slice(0, 100);
  }

  /**
   * Extracts raw text from an uploaded resume buffer (PDF or DOCX)
   */
  async extractTextFromBuffer(buffer, mimeType, originalName = '') {
    const ext = path.extname(originalName).toLowerCase();
    const isPdf = mimeType === 'application/pdf' || ext === '.pdf' || (buffer.length > 4 && buffer.slice(0, 4).toString() === '%PDF');
    const isDocx =
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword' ||
      ext === '.docx' ||
      ext === '.doc';

    let rawText = '';

    if (isPdf) {
      try {
        const parsed = await pdf(buffer);
        rawText = parsed.text || '';
      } catch (err) {
        logger.error(`PDF text extraction failed: ${err.message}`);
        throw ApiError.badRequest(`Could not parse PDF content: ${err.message}. Please ensure the file is not password-protected or corrupted.`);
      }
    } else if (isDocx) {
      try {
        const result = await mammoth.extractRawText({ buffer });
        rawText = result.value || '';
      } catch (err) {
        logger.error(`DOCX text extraction failed: ${err.message}`);
        throw ApiError.badRequest(`Could not parse DOCX content: ${err.message}. Please ensure the file is a valid Word document.`);
      }
    } else {
      throw ApiError.badRequest('Unsupported file format. Please upload a PDF (.pdf) or Word document (.docx).');
    }

    const cleanedText = rawText.trim();
    if (cleanedText.length < 15) {
      throw ApiError.badRequest('The uploaded document contains insufficient text or appears to be a scanned image without OCR text. Please upload a text-based PDF or DOCX.');
    }

    return cleanedText;
  }

  /**
   * Uploads, versions, extracts, and persists a candidate resume
   */
  async uploadResume({ candidateId, file }) {
    if (!candidateId) {
      throw ApiError.unauthorized('Authenticated candidate ID is required');
    }
    if (!file || !file.buffer) {
      throw ApiError.badRequest('No resume file was uploaded');
    }

    // 1. Validate size (Max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      throw ApiError.badRequest('File size exceeds the 5MB limit');
    }

    // 2. Extract plain text
    const rawText = await this.extractTextFromBuffer(file.buffer, file.mimetype, file.originalname);

    // 3. Determine resume version (resume-once, replace-without-rewriting-history)
    const resumeCol = getCollection(COLLECTIONS.RESUMES);
    const existingSnap = await resumeCol.doc(candidateId).get();
    const existing = existingSnap.exists ? existingSnap.data() : null;

    const nextVersion = existing ? (Number(existing.currentVersion) || 1) + 1 : 1;
    const sanitizedName = this._sanitizeFilename(file.originalname);

    // 4. Save to secure server storage
    const candidateStorageDir = path.join(this.storageBaseDir, candidateId);
    this._ensureStorageDir(candidateStorageDir);
    const storedFileName = `v${nextVersion}_${sanitizedName}`;
    const storageFilePath = path.join(candidateStorageDir, storedFileName);

    fs.writeFileSync(storageFilePath, file.buffer);

    // 5. Extract structured profile using AI layer
    let extractedProfile;
    let status = 'parsed';
    let processingError = null;

    try {
      const aiService = getAIService();
      extractedProfile = await aiService.extractResumeProfile(rawText);
    } catch (err) {
      logger.warn(`AI extraction encountered error for candidate ${candidateId}: ${err.message}`);
      // If AI fails in production or offline, capture error and fallback
      if (process.env.NODE_ENV === 'production') {
        status = 'failed';
        processingError = err.message;
        extractedProfile = {
          headline: 'Candidate',
          summary: 'Resume uploaded. Automated extraction pending reprocessing.',
          experienceYears: 1,
          skills: [],
          technologies: [],
          workExperience: [],
          education: [],
          projects: []
        };
      } else {
        const aiService = getAIService();
        extractedProfile = aiService.fallbackExtractResumeProfile
          ? aiService.fallbackExtractResumeProfile(rawText)
          : { headline: 'Software Engineer', skills: ['Software Engineering'], experienceYears: 2, projects: [] };
      }
    }

    const now = toTimestamp();

    // 6. Persist immutable version in RESUME_VERSIONS collection
    const versionId = `${candidateId}_v${nextVersion}`;
    const versionRecord = {
      id: versionId,
      candidateId,
      version: nextVersion,
      filename: sanitizedName,
      originalName: file.originalname,
      mimeType: file.mimetype || 'application/pdf',
      fileSize: file.size,
      storagePath: storageFilePath,
      extractedProfile,
      status,
      processingError,
      createdAt: now
    };
    await getCollection(COLLECTIONS.RESUME_VERSIONS).doc(versionId).set(versionRecord);

    // 7. Update active candidate resume in RESUMES collection
    const activeResumeRecord = {
      id: candidateId,
      candidateId,
      currentVersion: nextVersion,
      filename: sanitizedName,
      originalName: file.originalname,
      mimeType: file.mimetype || 'application/pdf',
      fileSize: file.size,
      storagePath: storageFilePath,
      extractedProfile,
      status,
      processingError,
      rawText: rawText.slice(0, 30000),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    await resumeCol.doc(candidateId).set(activeResumeRecord);

    // 8. Update candidate profile in USERS collection
    const userDocRef = getCollection(COLLECTIONS.USERS).doc(candidateId);
    await userDocRef.set(
      {
        hasResume: true,
        candidateProfile: {
          ...extractedProfile,
          resumeId: candidateId,
          resumeVersion: nextVersion,
          resumeFilename: sanitizedName,
          resumeUpdatedAt: now
        },
        updatedAt: now
      },
      { merge: true }
    );

    return {
      ...activeResumeRecord,
      rawText: undefined // Don't send huge text blobs in basic API response
    };
  }

  /**
   * Retrieves active resume & extracted profile for candidate
   */
  async getCandidateResume(candidateId, user) {
    if (!candidateId) {
      throw ApiError.badRequest('Candidate ID is required');
    }

    // Verify ownership
    if (user.role === ROLES.CANDIDATE && user.uid !== candidateId) {
      throw ApiError.forbidden('Forbidden: You can only view your own resume');
    }

    const resumeSnap = await getCollection(COLLECTIONS.RESUMES).doc(candidateId).get();
    if (!resumeSnap.exists) {
      return null;
    }

    const data = resumeSnap.data();
    return {
      ...data,
      rawText: undefined
    };
  }

  /**
   * Retrieves version history for candidate resume
   */
  async getResumeVersions(candidateId, user) {
    if (user.role === ROLES.CANDIDATE && user.uid !== candidateId) {
      throw ApiError.forbidden('Forbidden: You can only view your own resume versions');
    }

    const snapshot = await getCollection(COLLECTIONS.RESUME_VERSIONS)
      .where('candidateId', '==', candidateId)
      .get();

    const versions = snapshot.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        version: data.version,
        filename: data.filename,
        originalName: data.originalName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        status: data.status,
        createdAt: data.createdAt
      };
    });

    versions.sort((a, b) => b.version - a.version);
    return versions;
  }

  /**
   * Securely streams resume file for authorized candidate or recruiter
   */
  async getResumeFileForDownload(candidateId, user, version = null) {
    // 1. Authorization check
    if (user.role === ROLES.CANDIDATE && user.uid !== candidateId) {
      throw ApiError.forbidden('Forbidden: You can only download your own resume');
    }

    if (user.role === ROLES.RECRUITER) {
      // Recruiter must have an application from this candidate or manage an interview with them
      const appsSnapshot = await getCollection(COLLECTIONS.APPLICATIONS)
        .where('candidateId', '==', candidateId)
        .where('recruiterId', '==', user.uid)
        .limit(1)
        .get();

      const interviewsSnapshot = await getCollection(COLLECTIONS.INTERVIEWS)
        .where('candidateId', '==', candidateId)
        .where('recruiterId', '==', user.uid)
        .limit(1)
        .get();

      if (appsSnapshot.empty && interviewsSnapshot.empty) {
        throw ApiError.forbidden('Forbidden: You can only download resumes for candidates in your active requisition pipeline');
      }
    }

    // 2. Fetch resume metadata
    let filePath = null;
    let mimeType = 'application/pdf';
    let filename = 'resume.pdf';

    if (version) {
      const versionSnap = await getCollection(COLLECTIONS.RESUME_VERSIONS).doc(`${candidateId}_v${version}`).get();
      if (!versionSnap.exists) {
        throw ApiError.notFound(`Resume version v${version} not found`);
      }
      const vData = versionSnap.data();
      filePath = vData.storagePath;
      mimeType = vData.mimeType || 'application/pdf';
      filename = vData.originalName || vData.filename || 'resume.pdf';
    } else {
      const resumeSnap = await getCollection(COLLECTIONS.RESUMES).doc(candidateId).get();
      if (!resumeSnap.exists) {
        throw ApiError.notFound('Candidate has not uploaded a resume');
      }
      const rData = resumeSnap.data();
      filePath = rData.storagePath;
      mimeType = rData.mimeType || 'application/pdf';
      filename = rData.originalName || rData.filename || 'resume.pdf';
    }

    if (!filePath || !fs.existsSync(filePath)) {
      throw ApiError.notFound('Stored resume file was not found on server disk');
    }

    return {
      filePath,
      mimeType,
      filename
    };
  }

  /**
   * Retries extraction on the currently saved resume
   */
  async reprocessResume(candidateId, user) {
    if (user.role === ROLES.CANDIDATE && user.uid !== candidateId) {
      throw ApiError.forbidden('Forbidden: You can only reprocess your own resume');
    }

    const resumeRef = getCollection(COLLECTIONS.RESUMES).doc(candidateId);
    const resumeSnap = await resumeRef.get();
    if (!resumeSnap.exists) {
      throw ApiError.notFound('No active resume to reprocess');
    }

    const resumeData = resumeSnap.data();
    if (!resumeData.storagePath || !fs.existsSync(resumeData.storagePath)) {
      throw ApiError.notFound('Resume file not found on disk');
    }

    const fileBuffer = fs.readFileSync(resumeData.storagePath);
    const rawText = await this.extractTextFromBuffer(fileBuffer, resumeData.mimeType, resumeData.filename);

    const aiService = getAIService();
    const extractedProfile = await aiService.extractResumeProfile(rawText);
    const now = toTimestamp();

    await resumeRef.update({
      extractedProfile,
      rawText: rawText.slice(0, 30000),
      status: 'parsed',
      processingError: null,
      updatedAt: now
    });

    // Update user profile in USERS
    const userDocRef = getCollection(COLLECTIONS.USERS).doc(candidateId);
    await userDocRef.set(
      {
        candidateProfile: {
          ...extractedProfile,
          resumeId: candidateId,
          resumeVersion: resumeData.currentVersion,
          resumeFilename: resumeData.filename,
          resumeUpdatedAt: now
        },
        updatedAt: now
      },
      { merge: true }
    );

    return {
      id: candidateId,
      currentVersion: resumeData.currentVersion,
      filename: resumeData.filename,
      status: 'parsed',
      extractedProfile,
      updatedAt: now
    };
  }
}

module.exports = new ResumeService();
