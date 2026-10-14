const { z } = require('zod');
const { resolveUserFromToken } = require('../auth');
const interviewService = require('../../services/interview.service');

const getInterviewHistorySchema = {
  authToken: z.string().min(1, 'authToken is required').describe('Cryptographic authentication token of the session'),
  limit: z.number().int().min(1).max(20).optional().default(5).describe('Maximum number of records to return (1-20)'),
  page: z.number().int().min(1).optional().default(1).describe('Page number (1-based)'),
  status: z.enum(['scheduled', 'in_progress', 'completed', 'terminated']).optional().describe('Filter by interview status')
};

async function handleGetInterviewHistory(args) {
  const user = await resolveUserFromToken(args.authToken);

  const result = await interviewService.getInterviews({
    user,
    status: args.status,
    page: args.page || 1,
    limit: args.limit || 5
  });

  const sanitized = result.interviews.map(i => ({
    interviewId: i.id,
    jobId: i.jobId,
    jobTitle: i.jobTitle || 'Software Position',
    status: i.status,
    startTime: i.startTime,
    endTime: i.endTime,
    durationSeconds: i.durationSeconds,
    overallScore: i.overallScore,
    currentQuestionIndex: i.currentQuestionIndex,
    totalQuestions: i.totalQuestions,
    createdAt: i.createdAt
  }));

  return {
    pagination: result.pagination,
    interviews: sanitized
  };
}

module.exports = {
  name: 'get_interview_history',
  description: 'Retrieve authorized interview history for the authenticated candidate or recruiter, with pagination and limits.',
  inputSchema: getInterviewHistorySchema,
  handler: handleGetInterviewHistory
};
