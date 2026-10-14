const { z } = require('zod');
const { resolveUserFromToken, enforceInterviewOwnership } = require('../auth');
const { COLLECTIONS, getCollection } = require('../../services/db/firestore.service');
const ApiError = require('../../utils/apiError');

const getInterviewContextSchema = {
  authToken: z.string().min(1, 'authToken is required').describe('Cryptographic authentication token'),
  interviewId: z.string().min(1, 'interviewId is required').describe('ID of the interview session')
};

async function handleGetInterviewContext(args) {
  const user = await resolveUserFromToken(args.authToken);

  // 1. Fetch interview and enforce ownership
  const intSnap = await getCollection(COLLECTIONS.INTERVIEWS).doc(args.interviewId).get();
  if (!intSnap.exists) {
    throw ApiError.notFound('Interview session was not found');
  }
  const interview = intSnap.data();
  enforceInterviewOwnership(user, interview);

  // 2. Fetch Job details
  const jobSnap = await getCollection(COLLECTIONS.JOBS).doc(interview.jobId).get();
  const job = jobSnap.exists ? jobSnap.data() : { title: interview.jobTitle, requiredSkills: [] };

  // 3. Fetch questions, answers, evaluations
  const qSnap = await getCollection(COLLECTIONS.INTERVIEW_QUESTIONS)
    .where('interviewId', '==', args.interviewId)
    .get();
  const questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  questions.sort((a, b) => a.questionIndex - b.questionIndex);

  const aSnap = await getCollection(COLLECTIONS.INTERVIEW_ANSWERS)
    .where('interviewId', '==', args.interviewId)
    .get();
  const answers = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const evSnap = await getCollection(COLLECTIONS.SKILL_EVALUATIONS)
    .where('interviewId', '==', args.interviewId)
    .get();
  const evaluations = evSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const history = questions.map(q => {
    const a = answers.find(ans => ans.questionId === q.id);
    const ev = evaluations.find(e => e.questionId === q.id);
    return {
      questionId: q.id,
      questionIndex: q.questionIndex,
      questionText: q.questionText,
      skill: q.skill,
      difficulty: q.difficulty,
      questionType: q.questionType || 'scenario',
      selectionRationale: q.selectionRationale || null,
      answerText: a?.answerText || null,
      timeTakenSeconds: a?.timeTakenSeconds || null,
      score: ev?.score ?? null,
      status: ev?.status || null,
      feedback: ev?.feedback || null,
      matchedConcepts: ev?.matchedConcepts || [],
      missingConcepts: ev?.missingConcepts || []
    };
  });

  return {
    interviewId: args.interviewId,
    candidateId: interview.candidateId,
    jobId: interview.jobId,
    jobTitle: job.title || interview.jobTitle,
    jobDescription: job.description || '',
    requiredSkills: job.requiredSkills || [],
    currentQuestionIndex: interview.currentQuestionIndex,
    totalQuestions: interview.totalQuestions,
    status: interview.status,
    adaptiveState: interview.adaptiveState || {},
    history
  };
}

module.exports = {
  name: 'get_interview_context',
  description: 'Retrieve the authorized current interview\'s role, stage, prior questions, answers, and evaluations needed for adaptation.',
  inputSchema: getInterviewContextSchema,
  handler: handleGetInterviewContext
};
