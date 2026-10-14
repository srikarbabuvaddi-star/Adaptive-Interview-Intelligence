const { z } = require('zod');
const { ROLES } = require('../constants/roles');

const registerUserSchema = z.object({
  role: z.enum([ROLES.CANDIDATE, ROLES.RECRUITER], {
    errorMap: () => ({ message: `Role must be either '${ROLES.CANDIDATE}' or '${ROLES.RECRUITER}'` })
  }),
  displayName: z.string().min(2, 'Display name must be at least 2 characters').max(100),
  candidateProfile: z
    .object({
      skills: z.array(z.string()).default([]),
      experienceYears: z.number().min(0).max(60).default(0),
      headline: z.string().max(200).optional(),
      bio: z.string().max(2000).optional(),
      resumeUrl: z.string().url().or(z.literal('')).optional()
    })
    .optional(),
  recruiterProfile: z
    .object({
      companyName: z.string().min(2, 'Company name is required for recruiters').max(100),
      companyWebsite: z.string().url().or(z.literal('')).optional(),
      department: z.string().max(100).optional()
    })
    .optional()
}).refine(data => {
  if (data.role === ROLES.RECRUITER && !data.recruiterProfile?.companyName) {
    return false;
  }
  return true;
}, {
  message: 'Recruiter profile with companyName is required for recruiter accounts',
  path: ['recruiterProfile']
});

module.exports = {
  registerUserSchema
};
