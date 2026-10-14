const { z } = require('zod');
const { resolveUserFromToken, enforceInterviewOwnership } = require('../auth');
const { COLLECTIONS, getCollection } = require('../../services/db/firestore.service');
const { agentOrchestrator } = require('../../services/agents');
const ApiError = require('../../utils/apiError');
const logger = require('../../utils/logger');

const generateInterviewReportSchema = {
  authToken: z.string().min(1, 'authToken is required').describe('Cryptographic authentication token'),
  interviewId: z.string().min(1, 'interviewId is required').describe('ID of the completed interview session'),
  forceRegenerate: z.boolean().optional().default(false).describe('Whether to force re-synthesis if report already exists')
};

async function handleGenerateInterviewReport(args) {
  const user = await resolveUserFromToken(args.authToken);

  // 1. Fetch interview and enforce ownership
  const intSnap = await getCollection(COLLECTIONS.INTERVIEWS).doc(args.interviewId).get();
  if (!intSnap.exists) {
    throw ApiError.notFound('Interview session was not found');
  }
  const interview = intSnap.data();
  enforceInterviewOwnership(user, interview);

  // 2. Idempotency Check: Return existing report if already generated and forceRegenerate is false
  const existingReportsSnap = await getCollection(COLLECTIONS.INTERVIEW_REPORTS)
    .where('interviewId', '==', args.interviewId)
    .get();

  if (!existingReportsSnap.empty && !args.forceRegenerate) {
    const existing = existingReportsSnap.docs[0].data();
    logger.info(`[MCP:generate_interview_report] Report for interview ${args.interviewId} already exists. Returning existing report.`);
    return {
      success: true,
      reportId: existingReportsSnap.docs[0].id,
      isExisting: true,
      overallScore: existing.overallScore,
      recommendation: existing.recommendation,
      hiringVerdict: existing.hiringVerdict,
      summary: existing.summary
    };
  }

  // 3. Fetch Job record
  const jobSnap = await getCollection(COLLECTIONS.JOBS).doc(interview.jobId).get();
  if (!jobSnap.exists) {
    throw ApiError.notFound('Associated job was not found');
  }
  const job = jobSnap.data();

  // 4. Synthesize final report via Agent Orchestrator (Feedback Coach + Integrity Review)
  const reportData = await agentOrchestrator.finalizeInterviewSession({
    interviewId: args.interviewId,
    user,
    job,
    reason: 'mcp_agent_completed'
  });

  return {
    success: true,
    reportId: reportData.id,
    isExisting: false,
    overallScore: reportData.overallScore,
    recommendation: reportData.recommendation,
    hiringVerdict: reportData.hiringVerdict,
    summary: reportData.summary
  };
}

module.exports = {
  name: 'generate_interview_report',
  description: 'Generate or retrieve a comprehensive evidence-backed report based on persisted, completed interview results with duplicate prevention.',
  inputSchema: generateInterviewReportSchema,
  handler: handleGenerateInterviewReport
};
