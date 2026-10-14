const multer = require('multer');
const path = require('path');
const ApiError = require('../utils/apiError');

// Memory storage keeps file buffer in memory for instant processing & validation
const storage = multer.memoryStorage();

const allowedMimeTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword'
];

const allowedExtensions = ['.pdf', '.docx', '.doc'];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const isAllowedExt = allowedExtensions.includes(ext);
  const isAllowedMime = allowedMimeTypes.includes(file.mimetype);

  if (isAllowedExt || isAllowedMime) {
    cb(null, true);
  } else {
    cb(ApiError.badRequest('Invalid file type. Only PDF (.pdf) and Word documents (.docx, .doc) are permitted.'));
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 Megabytes
  },
  fileFilter
});

/**
 * Middleware wrapper for single resume file upload with normalized error handling
 */
const uploadResumeMiddleware = (req, res, next) => {
  const singleUpload = upload.single('resume');

  singleUpload(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(ApiError.badRequest('File size exceeds maximum allowed limit of 5MB'));
        }
        return next(ApiError.badRequest(`Upload error: ${err.message}`));
      }
      return next(err);
    }

    if (!req.file) {
      return next(ApiError.badRequest('No resume file provided. Please attach a PDF or DOCX file with key "resume"'));
    }

    next();
  });
};

module.exports = {
  uploadResumeMiddleware
};
