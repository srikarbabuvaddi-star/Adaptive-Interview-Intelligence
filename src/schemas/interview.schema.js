const { z } = require('zod');

const createInterviewSchema = z
  .object({
    jobId: z.string().min(1).optional(),
    candidateId: z.string().min(1).optional(), // Required if created by recruiter
    applicationId: z.string().optional(),
    targetRole: z
      .object({
        title: z.string().min(2, 'Role title must be at least 2 characters'),
        experienceLevel: z.string().optional().default('mid'),
        durationMinutes: z.number().int().min(5).max(60).default(15),
        skills: z.array(z.string()).min(1, 'At least one skill is required'),
        maxQuestions: z.number().int().min(1).max(10).default(3)
      })
      .optional()
  })
  .refine(data => data.jobId || data.targetRole, {
    message: 'Either jobId or targetRole configuration is required',
    path: ['jobId']
  });

const submitAnswerSchema = z.object({
  questionId: z.string().min(1, 'questionId is required'),
  answerText: z.string().min(3, 'Answer text must be at least 3 characters').max(10000),
  timeTakenSeconds: z.number().int().min(1).default(30)
});

const endInterviewSchema = z.object({
  reason: z.enum(['candidate_completed', 'candidate_quit', 'time_limit_reached', 'proctoring_violation']).default('candidate_completed')
});

module.exports = {
  createInterviewSchema,
  submitAnswerSchema,
  endInterviewSchema
};
