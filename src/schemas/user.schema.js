const { z } = require('zod');

const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(100).optional(),
  role: z.string().optional(),
  candidateProfile: z
    .object({
      skills: z.array(z.string()).optional(),
      experienceYears: z.number().min(0).max(60).optional(),
      headline: z.string().max(200).optional(),
      bio: z.string().max(2000).optional(),
      resumeUrl: z.string().url().or(z.literal('')).optional()
    })
    .optional(),
  recruiterProfile: z
    .object({
      companyName: z.string().min(2).max(100).optional(),
      companyWebsite: z.string().url().or(z.literal('')).optional(),
      department: z.string().max(100).optional()
    })
    .optional()
});

module.exports = {
  updateProfileSchema
};
