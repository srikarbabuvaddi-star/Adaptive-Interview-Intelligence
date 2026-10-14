const { z } = require('zod');

const searchJobsQuerySchema = z.object({
  query: z.string().min(1, 'Search query is required').max(150).default('Software Engineer'),
  location: z.string().max(100).optional(),
  country: z.string().max(10).default('in'),
  remote: z.enum(['true', 'false', 'all']).optional(),
  experienceLevel: z.enum(['entry', 'mid', 'senior', 'lead', 'all']).optional(),
  employmentType: z.enum(['fulltime', 'contractor', 'contract', 'parttime', 'intern', 'all']).optional(),
  salaryMin: z.coerce.number().min(0).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  provider: z.enum(['jsearch', 'adzuna']).optional()
});

const getSalaryBenchmarkQuerySchema = z.object({
  jobTitle: z.string().min(1, 'Job title is required').max(150),
  location: z.string().max(100).optional(),
  country: z.string().max(10).default('in')
});

const compareSkillsBodySchema = z.object({
  jobData: z.object({
    id: z.any().optional(),
    title: z.string().min(1, 'Job title is required'),
    requiredSkills: z.array(z.any()).optional(),
    employer: z.any().optional(),
    location: z.any().optional(),
    description: z.string().optional()
  }).passthrough()
});

const prepareInterviewBodySchema = z.object({
  jobData: z.object({
    id: z.any().optional(),
    title: z.string().min(1, 'Job title is required'),
    employer: z.any().optional(),
    location: z.any().optional(),
    description: z.string().optional(),
    requiredSkills: z.array(z.any()).optional(),
    employmentType: z.string().optional(),
    experienceLevel: z.string().optional(),
    salary: z.any().optional(),
    source: z.string().optional(),
    applyUrl: z.string().optional()
  }).passthrough()
});

module.exports = {
  searchJobsQuerySchema,
  getSalaryBenchmarkQuerySchema,
  compareSkillsBodySchema,
  prepareInterviewBodySchema
};
