const { z } = require('zod');
const { resolveUserFromToken } = require('../auth');
const { COLLECTIONS, getCollection } = require('../../services/db/firestore.service');
const ApiError = require('../../utils/apiError');
const logger = require('../../utils/logger');

const getCandidateSkillProfileSchema = {
  authToken: z.string().min(1, 'authToken is required').describe('Cryptographic authentication token of the session')
};

async function handleGetCandidateSkillProfile(args) {
  const user = await resolveUserFromToken(args.authToken);

  // 1. Fetch candidate user profile
  const userDocSnap = await getCollection(COLLECTIONS.USERS).doc(user.uid).get();
  const userData = userDocSnap.exists ? userDocSnap.data() : {};
  const profile = userData.candidateProfile || user.candidateProfile || {};

  // 2. Fetch active resume snapshot if available
  let resumeInfo = null;
  const resumeSnap = await getCollection(COLLECTIONS.RESUMES).doc(user.uid).get();
  if (resumeSnap.exists) {
    const rData = resumeSnap.data();
    resumeInfo = {
      version: rData.currentVersion || 1,
      filename: rData.originalName || rData.filename,
      uploadedAt: rData.uploadedAt,
      extractedSkills: rData.extractedProfile?.skills || []
    };
  }

  // 3. Fetch past completed interviews for candidate
  const interviewsSnap = await getCollection(COLLECTIONS.INTERVIEWS)
    .where('candidateId', '==', user.uid)
    .get();

  const interviewIds = interviewsSnap.docs.map(d => d.id);

  // 4. Aggregate real demonstrated skills from persisted evaluations
  const demonstratedMap = new Map();

  for (const intId of interviewIds) {
    const evSnap = await getCollection(COLLECTIONS.SKILL_EVALUATIONS)
      .where('interviewId', '==', intId)
      .get();

    for (const evDoc of evSnap.docs) {
      const ev = evDoc.data();
      if (!ev.skill) continue;
      const skillName = ev.skill;
      if (!demonstratedMap.has(skillName)) {
        demonstratedMap.set(skillName, { scores: [], evidenceCount: 0 });
      }
      const entry = demonstratedMap.get(skillName);
      if (typeof ev.score === 'number') entry.scores.push(ev.score);
      if (Array.isArray(ev.evidence)) entry.evidenceCount += ev.evidence.length;
    }
  }

  const demonstratedSkills = [];
  for (const [skill, entry] of demonstratedMap.entries()) {
    const avgScore = entry.scores.length > 0
      ? Math.round((entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length) * 10) / 10
      : 0;

    demonstratedSkills.push({
      skill,
      averageScore: avgScore,
      evaluationsCount: entry.scores.length,
      evidenceQuotesRecorded: entry.evidenceCount,
      proficiencyLevel: avgScore >= 7.0 ? 'demonstrated' : (avgScore >= 4.5 ? 'partially_demonstrated' : 'gap')
    });
  }

  const claimedSkills = Array.from(new Set([
    ...(profile.skills || []),
    ...(resumeInfo?.extractedSkills || [])
  ]));

  return {
    candidateId: user.uid,
    displayName: userData.displayName || user.displayName || 'Candidate',
    headline: profile.headline || 'Software Engineer',
    experienceYears: profile.experienceYears || null,
    claimedSkills,
    demonstratedSkills,
    resume: resumeInfo,
    totalInterviewsCompleted: interviewIds.length
  };
}

module.exports = {
  name: 'get_candidate_skill_profile',
  description: 'Retrieve the authenticated user\'s available skill profile, claimed resume skills, and verified assessment evidence.',
  inputSchema: getCandidateSkillProfileSchema,
  handler: handleGetCandidateSkillProfile
};
