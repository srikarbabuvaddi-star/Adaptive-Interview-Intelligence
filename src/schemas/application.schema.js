const { z } = require('zod');
const { APPLICATION_STATUS } = require('../constants/interviewStatus');

const applyJobSchema = z.object({
  resumeUrl: z.string().url().or(z.literal('')).optional(),
  coverNote: z.string().max(1000).optional(),
  candidateSkills: z.array(z.string()).optional()
});

const updateApplicationStatusSchema = z.object({
  status: z.enum([
    APPLICATION_STATUS.PENDING,
    APPLICATION_STATUS.REVIEWING,
    APPLICATION_STATUS.INTERVIEW_INVITED,
    APPLICATION_STATUS.INTERVIEW_COMPLETED,
    APPLICATION_STATUS.REJECTED,
    APPLICATION_STATUS.ACCEPTED
  ]),
  reviewNotes: z.string().max(1000).optional()
});

module.exports = {
  applyJobSchema,
  updateApplicationStatusSchema
};
