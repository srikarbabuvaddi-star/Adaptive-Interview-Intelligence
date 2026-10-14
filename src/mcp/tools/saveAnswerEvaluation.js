const { z } = require('zod');
const { resolveUserFromToken, enforceInterviewOwnership } = require('../auth');
const { COLLECTIONS, getCollection, toTimestamp } = require('../../services/db/firestore.service');
const { INTERVIEW_STATUS } = require('../../constants/interviewStatus');
const ApiError = require('../../utils/apiError');
const logger = require('../../utils/logger');

const saveAnswerEvaluationSchema = {
  authToken: z.string().min(1, 'authToken is required').describe('Cryptographic authentication token'),
  interviewId: z.string().min(1, 'interviewId is required').describe('ID of the active interview session'),
  questionId: z.string().min(1, 'questionId is required').describe('ID of the question being evaluated'),
  score: z.number().min(0).max(10).describe('Normalized score out of 10'),
  feedback: z.string().min(3).describe('Constructive feedback for candidate'),
  matchedConcepts: z.array(z.string()).optional().default([]).describe('Concepts candidate demonstrated'),
  missingConcepts: z.array(z.string()).optional().default([]).describe('Concepts missed or deficient'),
  evidence: z.array(z.string()).optional().default([]).describe('Verbatim citations from candidate transcript'),
  strengths: z.array(z.string()).optional().default([]).describe('Strengths observed'),
  weaknesses: z.array(z.string()).optional().default([]).describe('Weaknesses observed'),
  correctnessScore: z.number().min(0).max(100).optional().describe('Technical correctness 0-100'),
  completenessScore: z.number().min(0).max(100).optional().describe('Completeness 0-100'),
  compositeScore: z.number().min(0).max(100).optional().describe('Composite score 0-100'),
  status: z.enum(['correct', 'partially_correct', 'incorrect_or_unclear']).optional().describe('Evaluation classification status')
};

async function handleSaveAnswerEvaluation(args) {
  const user = await resolveUserFromToken(args.authToken);

  // 1. Fetch interview and enforce ownership
  const intSnap = await getCollection(COLLECTIONS.INTERVIEWS).doc(args.interviewId).get();
  if (!intSnap.exists) {
    throw ApiError.notFound('Interview session was not found');
  }
  const interview = intSnap.data();
  enforceInterviewOwnership(user, interview);

  if (interview.status !== INTERVIEW_STATUS.IN_PROGRESS) {
    throw ApiError.badRequest(`Cannot evaluate answer on interview with status ${interview.status}`);
  }

  // 2. Fetch question
  const qSnap = await getCollection(COLLECTIONS.INTERVIEW_QUESTIONS).doc(args.questionId).get();
  if (!qSnap.exists) {
    throw ApiError.notFound('Question not found');
  }
  const question = qSnap.data();

  // 3. Verify answer exists for this question
  const ansSnap = await getCollection(COLLECTIONS.INTERVIEW_ANSWERS)
    .where('questionId', '==', args.questionId)
    .get();

  if (ansSnap.empty) {
    throw ApiError.badRequest('No candidate answer has been submitted for this question yet');
  }
  const answer = ansSnap.docs[0].data();

  // 4. Idempotency Check: Prevent duplicate evaluations for same question
  const existingEvalSnap = await getCollection(COLLECTIONS.SKILL_EVALUATIONS)
    .where('questionId', '==', args.questionId)
    .get();

  if (!existingEvalSnap.empty) {
    const existing = existingEvalSnap.docs[0].data();
    logger.info(`[MCP:save_answer_evaluation] Evaluation for question ${args.questionId} already exists. Returning existing record.`);
    return {
      success: true,
      evaluationId: existingEvalSnap.docs[0].id,
      isDuplicate: true,
      score: existing.score,
      status: existing.status,
      message: 'Evaluation already persisted for this question. Returned existing record.'
    };
  }

  // 5. Build and persist evaluation record
  const score = Math.max(0, Math.min(10, args.score));
  const compositeScore = args.compositeScore ?? Math.round(score * 10);
  const correctnessScore = args.correctnessScore ?? compositeScore;
  const completenessScore = args.completenessScore ?? compositeScore;
  const status = args.status || (score >= 7.5 ? 'correct' : (score >= 4.5 ? 'partially_correct' : 'incorrect_or_unclear'));

  const evalRef = getCollection(COLLECTIONS.SKILL_EVALUATIONS).doc();
  const evaluationRecord = {
    id: evalRef.id,
    interviewId: args.interviewId,
    questionId: args.questionId,
    answerId: answer.id,
    skill: question.skill,
    score,
    compositeScore,
    correctnessScore,
    completenessScore,
    status,
    evidence: args.evidence || [],
    matchedConcepts: args.matchedConcepts || [],
    missingConcepts: args.missingConcepts || [],
    strengths: args.strengths || [],
    weaknesses: args.weaknesses || [],
    feedback: args.feedback,
    evaluatedAt: toTimestamp()
  };

  await evalRef.set(evaluationRecord);

  return {
    success: true,
    evaluationId: evalRef.id,
    isDuplicate: false,
    score,
    status,
    skill: question.skill
  };
}

module.exports = {
  name: 'save_answer_evaluation',
  description: 'Validate and persist an answer evaluation associated with the correct interview question, with idempotency protection.',
  inputSchema: saveAnswerEvaluationSchema,
  handler: handleSaveAnswerEvaluation
};
