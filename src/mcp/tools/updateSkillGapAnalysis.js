const { z } = require('zod');
const { resolveUserFromToken, enforceInterviewOwnership } = require('../auth');
const { COLLECTIONS, getCollection, toTimestamp } = require('../../services/db/firestore.service');
const ApiError = require('../../utils/apiError');

const updateSkillGapAnalysisSchema = {
  authToken: z.string().min(1, 'authToken is required').describe('Cryptographic authentication token'),
  interviewId: z.string().min(1, 'interviewId is required').describe('ID of the interview session'),
  readinessScore: z.number().min(0).max(100).describe('Measured readiness percentage (0-100)'),
  summary: z.string().min(5).describe('Summary of skill gap findings'),
  demonstratedSkills: z.array(z.any()).optional().default([]).describe('Skills demonstrated with evidence'),
  partiallyDemonstratedSkills: z.array(z.any()).optional().default([]).describe('Skills partially demonstrated'),
  gapSkills: z.array(z.any()).optional().default([]).describe('Skills identified with gaps below threshold'),
  unassessedSkills: z.array(z.any()).optional().default([]).describe('Required skills not yet assessed'),
  recommendedNextSkill: z.string().optional().describe('Recommended skill to assess next'),
  recommendedDifficulty: z.string().optional().describe('Recommended difficulty for next round'),
  recommendationReason: z.string().optional().describe('Adaptive rationale for recommendation')
};

async function handleUpdateSkillGapAnalysis(args) {
  const user = await resolveUserFromToken(args.authToken);

  // 1. Fetch interview and enforce ownership
  const intSnap = await getCollection(COLLECTIONS.INTERVIEWS).doc(args.interviewId).get();
  if (!intSnap.exists) {
    throw ApiError.notFound('Interview session was not found');
  }
  const interview = intSnap.data();
  enforceInterviewOwnership(user, interview);

  const now = toTimestamp();
  const allSkillsList = [
    ...(args.demonstratedSkills || []).map(s => ({
      name: s.skill || s.name,
      skill: s.skill || s.name,
      score: Math.round((s.score || 7) * 10),
      demonstratedScore: s.score || 7,
      status: 'demonstrated',
      evidence: s.evidence || []
    })),
    ...(args.partiallyDemonstratedSkills || []).map(s => ({
      name: s.skill || s.name,
      skill: s.skill || s.name,
      score: Math.round((s.score || 5) * 10),
      demonstratedScore: s.score || 5,
      status: 'partially_demonstrated',
      gaps: s.gaps || []
    })),
    ...(args.gapSkills || []).map(s => ({
      name: s.skill || s.name,
      skill: s.skill || s.name,
      score: Math.round((s.score || 3) * 10),
      demonstratedScore: s.score || 3,
      status: 'gap',
      missingConcepts: s.missingConcepts || []
    })),
    ...(args.unassessedSkills || []).map(s => ({
      name: s.skill || s.name,
      skill: s.skill || s.name,
      requiredLevel: s.requiredLevel || 'intermediate',
      status: 'not_assessed',
      recommendation: s.recommendation || ''
    }))
  ];

  // 2. Query existing report to update idempotently
  const existingReportsSnap = await getCollection(COLLECTIONS.SKILL_GAP_REPORTS)
    .where('interviewId', '==', args.interviewId)
    .get();

  let reportId;
  const docData = {
    interviewId: args.interviewId,
    candidateId: interview.candidateId,
    jobId: interview.jobId,
    readinessScore: Math.round(args.readinessScore),
    summary: args.summary,
    skills: allSkillsList,
    skillAnalyses: allSkillsList,
    demonstratedSkills: args.demonstratedSkills,
    partiallyDemonstratedSkills: args.partiallyDemonstratedSkills,
    gapSkills: args.gapSkills,
    unassessedSkills: args.unassessedSkills,
    recommendedNextSkill: args.recommendedNextSkill || null,
    recommendedDifficulty: args.recommendedDifficulty || null,
    recommendationReason: args.recommendationReason || null,
    skillsAssessedCount: (args.demonstratedSkills?.length || 0) + (args.partiallyDemonstratedSkills?.length || 0) + (args.gapSkills?.length || 0),
    skillsUnassessedCount: args.unassessedSkills?.length || 0,
    updatedAt: now
  };

  if (!existingReportsSnap.empty) {
    const existingDoc = existingReportsSnap.docs[0];
    reportId = existingDoc.id;
    await getCollection(COLLECTIONS.SKILL_GAP_REPORTS).doc(reportId).update(docData);
  } else {
    const newRef = getCollection(COLLECTIONS.SKILL_GAP_REPORTS).doc();
    reportId = newRef.id;
    await newRef.set({ id: reportId, ...docData, createdAt: now });
  }

  return {
    success: true,
    skillGapReportId: reportId,
    readinessScore: args.readinessScore,
    skillsAssessedCount: docData.skillsAssessedCount,
    skillsUnassessedCount: docData.skillsUnassessedCount
  };
}

module.exports = {
  name: 'update_skill_gap_analysis',
  description: 'Save or update skill-gap findings using actual evaluation evidence with idempotent persistence.',
  inputSchema: updateSkillGapAnalysisSchema,
  handler: handleUpdateSkillGapAnalysis
};
