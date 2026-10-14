const { z } = require('zod');
const { JOB_STATUS, QUESTION_DIFFICULTY } = require('../constants/interviewStatus');

const skillSchema = z.object({
  name: z.string().min(1, 'Skill name is required').trim(),
  minimumLevel: z.enum([
    QUESTION_DIFFICULTY.BEGINNER,
    QUESTION_DIFFICULTY.INTERMEDIATE,
    QUESTION_DIFFICULTY.ADVANCED
  ]).default(QUESTION_DIFFICULTY.INTERMEDIATE),
  weight: z.number().min(1).max(5).default(1)
});

const createJobSchema = z.object({
  title: z.string().min(3, 'Job title must be at least 3 characters').max(150),
  description: z.string().min(20, 'Job description must be at least 20 characters'),
  department: z.string().min(2).max(100).default('Engineering'),
  location: z.string().min(2).max(100).default('Remote'),
  employmentType: z.enum(['full-time', 'part-time', 'contract', 'internship']).default('full-time'),
  requiredSkills: z.array(skillSchema).min(1, 'At least one required skill must be specified'),
  evaluationCriteria: z.array(z.string().min(2)).default([
    'Technical depth and conceptual accuracy',
    'Problem-solving methodology',
    'Clarity and communication',
    'Edge-case handling and best practices'
  ]),
  status: z.enum([JOB_STATUS.DRAFT, JOB_STATUS.PUBLISHED, JOB_STATUS.CLOSED]).default(JOB_STATUS.PUBLISHED),
  maxQuestions: z.number().int().min(1).max(25).default(5),
  targetDurationMinutes: z.number().int().min(5).max(120).default(30)
});

const updateJobSchema = createJobSchema.partial();

const queryJobsSchema = z.object({
  status: z.enum([JOB_STATUS.DRAFT, JOB_STATUS.PUBLISHED, JOB_STATUS.CLOSED]).optional(),
  search: z.string().optional(),
  department: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10)
});

module.exports = {
  createJobSchema,
  updateJobSchema,
  queryJobsSchema
};
