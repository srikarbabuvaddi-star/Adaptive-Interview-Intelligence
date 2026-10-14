const { z } = require('zod');
const { resolveUserFromToken, enforceInterviewOwnership } = require('../auth');
const { COLLECTIONS, getCollection } = require('../../services/db/firestore.service');
const ApiError = require('../../utils/apiError');

const getInterviewEvaluationSchema = {
  authToken: z.string().min(1, 'authToken is required').describe('Cryptographic authentication token'),
  interviewId: z.string().min(1, 'interviewId is required').describe('ID of the interview session')
};

async function handleGetInterviewEvaluation(args) {
  const user = await resolveUserFromToken(args.authToken);

  // 1. Fetch interview to verify ownership
  const intSnap = await getCollection(COLLECTIONS.INTERVIEWS).doc(args.interviewId).get();
  if (!intSnap.exists) {
    throw ApiError.notFound('Interview session was not found');
  }
  const interview = intSnap.data();

  // 2. Strict authorization check
  enforceInterviewOwnership(user, interview);

  // 3. Fetch questions to map context
  const qSnap = await getCollection(COLLECTIONS.INTERVIEW_QUESTIONS)
    .where('interviewId', '==', args.interviewId)
    .get();
  const questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // 4. Fetch evaluations
  const evSnap = await getCollection(COLLECTIONS.SKILL_EVALUATIONS)
    .where('interviewId', '==', args.interviewId)
    .get();

  const evaluations = evSnap.docs.map(d => {
    const data = d.data();
    const q = questions.find(question => question.id === data.questionId);
    return {
      evaluationId: d.id,
      questionId: data.questionId,
      questionIndex: q?.questionIndex || null,
      questionText: q?.questionText || null,
      skill: data.skill,
      score: data.score,
      compositeScore: data.compositeScore,
      correctnessScore: data.correctnessScore,
      completenessScore: data.completenessScore,
      status: data.status,
      matchedConcepts: data.matchedConcepts || [],
      missingConcepts: data.missingConcepts || [],
      evidence: data.evidence || [],
      feedback: data.feedback,
      evaluatedAt: data.evaluatedAt
    };
  });

  evaluations.sort((a, b) => (a.questionIndex || 0) - (b.questionIndex || 0));

  return {
    interviewId: args.interviewId,
    candidateId: interview.candidateId,
    jobTitle: interview.jobTitle,
    totalEvaluations: evaluations.length,
    evaluations
  };
}

module.exports = {
  name: 'get_interview_evaluation',
  description: 'Retrieve evaluations only for interviews the authenticated user is permitted to access.',
  inputSchema: getInterviewEvaluationSchema,
  handler: handleGetInterviewEvaluation
};
