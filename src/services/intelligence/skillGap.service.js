/**
 * Skill-Gap Intelligence Service
 * Performs evidence-based comparison across:
 * 1. Required job skills & proficiency thresholds
 * 2. Resume & profile claims
 * 3. Actual interview answer evidence & evaluations
 * 4. Unassessed skills
 */

const { ASSESSMENT_STATUS, QUESTION_DIFFICULTY } = require('../../constants/interviewStatus');
const {
  determineAssessmentStatus,
  scoreToProficiencyLevel,
  EVALUATION_RUBRIC
} = require('./rubric');

class SkillGapService {
  /**
   * Computes comprehensive skill gap analysis comparing job needs, profile claims, and interview evidence.
   *
   * @param {Object} params
   * @param {Object} params.job - Job document with requiredSkills & evaluationCriteria
   * @param {Object} [params.candidateProfile] - Candidate profile with skills, experienceYears, etc.
   * @param {Object} [params.application] - Application document with candidateSkills, coverNote
   * @param {Array} params.qaList - Array of { question, answer, evaluation } objects
   * @returns {Object} Comprehensive skill gap analysis
   */
  analyzeSkillGaps({ job, candidateProfile = {}, application = {}, qaList = [] }) {
    const requiredSkills = job.requiredSkills || [];
    const candidateClaimedSkills = new Set([
      ...(candidateProfile.skills || []).map(s => s.toLowerCase().trim()),
      ...(application.candidateSkills || []).map(s => s.toLowerCase().trim())
    ]);

    // Group interview evidence by skill (case-insensitive)
    const evidenceBySkill = new Map();

    for (const item of qaList) {
      if (!item.question || !item.question.skill) continue;
      const skillKey = item.question.skill.toLowerCase().trim();

      if (!evidenceBySkill.has(skillKey)) {
        evidenceBySkill.set(skillKey, []);
      }

      const answerText = item.answer?.answerText || '';
      const excerpt = answerText.length > 250
        ? `${answerText.slice(0, 247)}...`
        : answerText;

      const evidenceItem = {
        questionId: item.question.id,
        questionIndex: item.question.questionIndex,
        questionText: item.question.questionText,
        difficulty: item.question.difficulty || QUESTION_DIFFICULTY.INTERMEDIATE,
        answerExcerpt: excerpt,
        timeTakenSeconds: item.answer?.timeTakenSeconds || null,
        score: item.evaluation?.score ?? null,
        maxScore: 10,
        feedback: item.evaluation?.feedback || null,
        strengths: item.evaluation?.strengths || [],
        weaknesses: item.evaluation?.weaknesses || [],
        evaluatedAt: item.evaluation?.evaluatedAt || null
      };

      evidenceBySkill.get(skillKey).push(evidenceItem);
    }

    // Process all required job skills
    const skillAnalyses = [];
    const allKnownSkills = new Map();

    // Index required skills
    for (const reqSkill of requiredSkills) {
      const skillName = typeof reqSkill === 'string' ? reqSkill : (reqSkill.name || 'Technical Competence');
      const minLevel = typeof reqSkill === 'object' && reqSkill.minimumLevel ? reqSkill.minimumLevel : QUESTION_DIFFICULTY.INTERMEDIATE;
      const weight = typeof reqSkill === 'object' && reqSkill.weight ? reqSkill.weight : 1;

      allKnownSkills.set(skillName.toLowerCase().trim(), {
        name: skillName,
        requiredProficiency: minLevel,
        weight,
        isRequired: true
      });
    }

    // Also include any assessed skills that were not in job requiredSkills (e.g. adaptive probes)
    for (const [skillKey, evList] of evidenceBySkill.entries()) {
      if (!allKnownSkills.has(skillKey)) {
        allKnownSkills.set(skillKey, {
          name: evList[0]?.questionText ? skillKey : skillKey,
          requiredProficiency: QUESTION_DIFFICULTY.INTERMEDIATE,
          weight: 1,
          isRequired: false
        });
      }
    }

    let weightedScoreSum = 0;
    let totalWeightAssessed = 0;
    let assessedCount = 0;
    let unassessedCount = 0;
    let demonstratedCount = 0;

    for (const [skillKey, skillMeta] of allKnownSkills.entries()) {
      const isClaimed = candidateClaimedSkills.has(skillKey);
      const evidence = evidenceBySkill.get(skillKey) || [];
      const wasAssessed = evidence.length > 0;

      // Extract resume claim detail without inventing data
      const resumeClaim = {
        isClaimed,
        source: isClaimed ? 'candidate_profile' : 'unclaimed',
        claimedYears: isClaimed ? (candidateProfile.experienceYears ?? null) : null,
        details: isClaimed
          ? `Claimed in profile/application (${candidateProfile.experienceYears || 'unspecified'} yrs total experience)`
          : 'Not explicitly claimed in candidate profile or application'
      };

      let demonstratedScore = null;
      let demonstratedProficiency = null;
      let gapDescription = '';
      let assessmentStatus = ASSESSMENT_STATUS.NOT_ASSESSED;
      let confidence = 0.0;
      let confidenceExplanation = '';
      let gapScore = 0;

      if (wasAssessed) {
        assessedCount++;
        // Calculate average score across questions for this skill
        const validScores = evidence.filter(e => typeof e.score === 'number').map(e => e.score);
        if (validScores.length > 0) {
          demonstratedScore = Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 10) / 10;
        } else {
          demonstratedScore = 5.0;
        }

        demonstratedProficiency = scoreToProficiencyLevel(demonstratedScore);
        assessmentStatus = determineAssessmentStatus(demonstratedScore, true);

        if (assessmentStatus === ASSESSMENT_STATUS.DEMONSTRATED) {
          demonstratedCount++;
        }

        // Calculate confidence based on evidence count and depth
        confidence = Math.min(0.95, 0.65 + (evidence.length * 0.15));
        confidenceExplanation = `Based on ${evidence.length} direct interview question(s) and structured rubric evaluation.`;

        // Calculate gap against required level
        const targetMinScore = skillMeta.requiredProficiency === QUESTION_DIFFICULTY.ADVANCED ? 8.0
          : skillMeta.requiredProficiency === QUESTION_DIFFICULTY.INTERMEDIATE ? 5.5
          : 3.0;

        if (demonstratedScore >= targetMinScore) {
          gapScore = 0;
          gapDescription = `Demonstrated proficiency (${demonstratedScore}/10) meets or exceeds the required ${skillMeta.requiredProficiency} level.`;
        } else {
          const rawGap = targetMinScore - demonstratedScore;
          gapScore = Math.round((rawGap / 10) * 100);
          gapDescription = `Performance gap of ${gapScore}%: Scored ${demonstratedScore}/10, below target threshold of ${targetMinScore}/10 for ${skillMeta.requiredProficiency} level.`;
        }

        // Weighting for readiness
        weightedScoreSum += (demonstratedScore / 10) * skillMeta.weight;
        totalWeightAssessed += skillMeta.weight;
      } else {
        unassessedCount++;
        assessmentStatus = ASSESSMENT_STATUS.NOT_ASSESSED;
        confidence = 0.0;
        confidenceExplanation = 'Unassessed: No interview questions evaluated this skill during the session.';
        gapScore = 0; // Neutral: unassessed does not equal failure

        if (isClaimed) {
          gapDescription = `Candidate claims this skill in profile, but it was not assessed during this interview session (unverified by interview answers). Verification recommended in follow-up.`;
        } else {
          gapDescription = `Skill was not assessed and was not listed in candidate profile. Absence of evidence is not proof of absence of skill.`;
        }
      }

      skillAnalyses.push({
        skill: skillMeta.name,
        isRequired: skillMeta.isRequired,
        requiredProficiency: skillMeta.requiredProficiency,
        weight: skillMeta.weight,
        resumeClaim,
        evidence,
        demonstratedScore,
        demonstratedProficiency,
        assessmentStatus,
        gapScore,
        gapDescription,
        confidence: Math.round(confidence * 100) / 100,
        confidenceExplanation
      });
    }

    // Overall readiness score (0-100) based on assessed skills
    let readinessScore = 50;
    if (totalWeightAssessed > 0) {
      readinessScore = Math.round((weightedScoreSum / totalWeightAssessed) * 100);
    }

    // Recommended recruiter follow-ups
    const recommendedFollowUps = [];
    for (const item of skillAnalyses) {
      if (item.assessmentStatus === ASSESSMENT_STATUS.NOT_ASSESSED && item.isRequired) {
        recommendedFollowUps.push({
          skill: item.skill,
          reason: 'Required skill not assessed during adaptive session',
          recommendation: `Conduct a targeted follow-up technical inquiry for ${item.skill} (${item.requiredProficiency} level).`
        });
      } else if (item.assessmentStatus === ASSESSMENT_STATUS.PARTIALLY_DEMONSTRATED || item.assessmentStatus === ASSESSMENT_STATUS.NOT_DEMONSTRATED) {
        recommendedFollowUps.push({
          skill: item.skill,
          reason: `Demonstrated score (${item.demonstratedScore}/10) fell below the required threshold`,
          recommendation: `Probe deeper architectural edge cases in ${item.skill} during hiring manager round.`
        });
      }
    }

    // Explicit role-specific skill categorization according to evaluation requirements
    const demonstratedSkills = skillAnalyses.filter(s => s.assessmentStatus === ASSESSMENT_STATUS.DEMONSTRATED);
    const claimedButUnvalidatedSkills = skillAnalyses.filter(s => s.resumeClaim?.isClaimed && s.assessmentStatus !== ASSESSMENT_STATUS.DEMONSTRATED);
    const potentialGaps = skillAnalyses.filter(s => s.gapScore > 0 || s.assessmentStatus === ASSESSMENT_STATUS.NOT_DEMONSTRATED || s.assessmentStatus === ASSESSMENT_STATUS.PARTIALLY_DEMONSTRATED);
    const untestedSkills = skillAnalyses.filter(s => s.assessmentStatus === ASSESSMENT_STATUS.NOT_ASSESSED);

    return {
      readinessScore,
      skillsAssessedCount: assessedCount,
      skillsUnassessedCount: unassessedCount,
      skillsDemonstratedCount: demonstratedCount,
      totalRequiredSkills: requiredSkills.length,
      summary: `Evaluated ${assessedCount} skill(s) across ${qaList.length} interview questions. ${demonstratedCount} demonstrated, ${unassessedCount} unassessed. Readiness index: ${readinessScore}/100.`,
      skillAnalyses,
      categories: {
        demonstratedSkills: demonstratedSkills.map(s => s.skill),
        claimedButUnvalidatedSkills: claimedButUnvalidatedSkills.map(s => s.skill),
        potentialGaps: potentialGaps.map(s => s.skill),
        untestedSkills: untestedSkills.map(s => s.skill)
      },
      breakdown: {
        demonstrated: demonstratedSkills,
        claimedButUnvalidated: claimedButUnvalidatedSkills,
        potentialGaps,
        untested: untestedSkills
      },
      recommendedFollowUps
    };
  }
}

module.exports = new SkillGapService();
