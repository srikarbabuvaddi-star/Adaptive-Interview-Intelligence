/**
 * Evidence-Based Interview Report Service
 * Synthesizes:
 * 1. Question-by-question adaptive progression
 * 2. Evidence-backed strengths & areas of improvement
 * 3. Skill-gap intelligence comparing required vs claimed vs demonstrated ability
 * 4. Chronological integrity timeline & human review flags
 * 5. Transparent recruiter decision-support recommendations
 */

const skillGapService = require('./skillGap.service');
const integrityService = require('./integrity.service');
const { EVALUATION_RUBRIC } = require('./rubric');
const { INTERVIEW_STATUS } = require('../../constants/interviewStatus');
const adaptiveLogicService = require('./adaptiveLogic.service');

class EvidenceReportService {
  /**
   * Generates a comprehensive, evidence-linked report from raw interview data
   *
   * @param {Object} params
   * @param {Object} params.job - Job details
   * @param {Object} params.interview - Interview session document
   * @param {Object} [params.candidate] - Candidate user profile
   * @param {Object} [params.application] - Job application details
   * @param {Array} params.qaList - Array of { question, answer, evaluation }
   * @param {Array} params.integrityEvents - Chronological integrity events
   * @param {string} [params.completionReason] - 'candidate_completed' | 'terminated' | etc.
   * @returns {Object} Comprehensive final report
   */
  generateEvidenceBasedReport({
    job,
    interview,
    candidate = {},
    application = {},
    qaList = [],
    integrityEvents = [],
    completionReason = 'candidate_completed'
  }) {
    const isCompleted = interview.status === INTERVIEW_STATUS.COMPLETED || completionReason === 'candidate_completed';
    const isTerminated = interview.status === INTERVIEW_STATUS.TERMINATED || completionReason === 'proctoring_violation' || completionReason === 'candidate_quit';

    // 1. Skill Gap Intelligence Analysis
    const skillGapAnalysis = skillGapService.analyzeSkillGaps({
      job,
      candidateProfile: candidate.candidateProfile || {},
      application,
      qaList
    });

    // 2. Integrity Intelligence & Timeline Analysis
    const integrityAnalysis = integrityService.analyzeIntegrityPatterns(integrityEvents, interview);

    // 3. Adaptive Question Progression Summary
    const progressionSummary = this._buildProgressionSummary(qaList);

    // 4. Evidence-backed Strengths and Areas for Improvement
    const { evidenceBackedStrengths, evidenceBackedImprovements } = this._extractEvidencePoints(qaList);

    // 5. Measured Overall Score
    // Calculated transparently from evaluated questions:
    const validScores = qaList
      .filter(item => typeof item.evaluation?.score === 'number')
      .map(item => item.evaluation.score);

    let rawScoreAverage = 0;
    if (validScores.length > 0) {
      rawScoreAverage = validScores.reduce((a, b) => a + b, 0) / validScores.length;
    }
    const overallScore = Math.round(rawScoreAverage * 10); // 0-100 scale

    // 5B. Multi-Question Structured Skill Dossier & Concept Coverage (from skill_scoring.py)
    const requiredSkillsList = (job.requiredSkills || []).map(s => (typeof s === 'string' ? s : s.name));
    const allAssessedSkills = Array.from(new Set([
      ...requiredSkillsList,
      ...qaList.map(item => item.question?.skill).filter(Boolean)
    ]));

    const skillAssessments = {};
    const allMissingConcepts = [];
    const weakSkills = [];

    for (const skill of allAssessedSkills) {
      const skillQuestions = qaList
        .filter(item => item.question?.skill && item.question.skill.toLowerCase().trim() === skill.toLowerCase().trim())
        .map(item => ({
          question: item.question.questionText,
          difficulty: item.question.difficulty,
          status: item.evaluation?.status || (item.evaluation?.score >= 7.5 ? 'correct' : (item.evaluation?.score >= 4 ? 'partially_correct' : 'incorrect_or_unclear')),
          score: item.evaluation?.compositeScore || (item.evaluation?.score != null ? item.evaluation.score * 10 : 50),
          correctnessScore: item.evaluation?.correctnessScore || (item.evaluation?.score != null ? item.evaluation.score * 10 : 50),
          completenessScore: item.evaluation?.completenessScore || (item.evaluation?.score != null ? item.evaluation.score * 10 : 50),
          expectedConcepts: item.question.expectedConcepts || item.question.expectedKeyPoints || [],
          matchedConcepts: item.evaluation?.matchedConcepts || [],
          missingConcepts: item.evaluation?.missingConcepts || [],
          evidence: item.evaluation?.evidence || []
        }));

      const skillDossier = adaptiveLogicService.calculateSkillScore({
        skill,
        questions: skillQuestions
      });

      skillAssessments[skill] = skillDossier;

      if (skillDossier.score < 65 && skillQuestions.length > 0) {
        weakSkills.push(skill);
      }
      for (const gap of skillDossier.missingConcepts) {
        if (!allMissingConcepts.includes(gap)) {
          allMissingConcepts.push(gap);
        }
      }
    }

    // 5C. Suggested Next-Round Interview Probes for Hiring Manager
    const nextRoundInterviewProbes = adaptiveLogicService.generateHiringManagerProbes({
      jobRole: job.title,
      experienceLevel: job.experienceLevel || 'Intermediate',
      missingConcepts: allMissingConcepts,
      weakSkills
    });

    // 5D. Concept coverage percentage across evaluated skills
    const assessedSkillsWithQuestions = Object.values(skillAssessments).filter(s => s.totalQuestions > 0);
    const conceptCoveragePercentage = assessedSkillsWithQuestions.length > 0
      ? Math.round(assessedSkillsWithQuestions.reduce((acc, s) => acc + s.conceptCoveragePercentage, 0) / assessedSkillsWithQuestions.length * 10) / 10
      : 0;

    // 5E. Executive Hiring Verdict (from main.py)
    let hiringVerdict = 'HIRE';
    if (overallScore >= 85) hiringVerdict = 'STRONG HIRE';
    else if (overallScore >= 70) hiringVerdict = 'HIRE';
    else if (overallScore >= 50) hiringVerdict = 'CONSIDER WITH RESERVATIONS';
    else hiringVerdict = 'DO NOT HIRE';

    // 6. Recruiter Decision Support & Recommendation
    const recommendation = this._determineHiringRecommendation({
      overallScore,
      integrityScore: integrityAnalysis.integrityScore,
      skillsDemonstrated: skillGapAnalysis.skillsDemonstratedCount,
      totalRequiredSkills: skillGapAnalysis.totalRequiredSkills,
      isCompleted,
      isTerminated
    });

    // 7. Executive Assessment Summary
    const executiveSummary = this._buildExecutiveSummary({
      candidateName: candidate.displayName || 'Candidate',
      jobTitle: job.title,
      overallScore,
      readinessScore: skillGapAnalysis.readinessScore,
      questionsAnswered: qaList.length,
      totalQuestions: interview.totalQuestions,
      isCompleted,
      recommendation: recommendation.decision
    });

    return {
      interviewId: interview.id,
      candidateId: interview.candidateId,
      jobId: interview.jobId,
      recruiterId: interview.recruiterId,
      completionStatus: interview.status,
      isCompleteSession: isCompleted,
      completionReason,

      // Measured Scores & Rubric
      overallScore,
      hiringVerdict,
      conceptCoveragePercentage,
      rubricCriteria: {
        scale: '0-100',
        passingThreshold: EVALUATION_RUBRIC.scale.passingThreshold * 10,
        excellenceThreshold: EVALUATION_RUBRIC.scale.excellenceThreshold * 10,
        dimensions: EVALUATION_RUBRIC.dimensions
      },

      // Executive & Recruiter Summaries
      summary: executiveSummary,
      recruiterTakeaway: executiveSummary,
      recruiterDecisionSupport: {
        recommendation: recommendation.decision,
        confidenceLevel: recommendation.confidence,
        keyRationale: recommendation.rationale,
        suggestedNextSteps: recommendation.nextSteps
      },

      // Evidence-Backed Performance Points
      strengths: evidenceBackedStrengths,
      areasForImprovement: evidenceBackedImprovements,

      // Recruiter Technical Assessment Dossier Components
      skillAssessments,
      nextRoundInterviewProbes,
      missingConceptsSummary: allMissingConcepts,

      // Skill Gap Intelligence
      skillGapReport: skillGapAnalysis,

      // Adaptive Interview Progression
      adaptiveProgression: progressionSummary,

      // Integrity Analysis & Recruiter Review Flags
      integrityReport: {
        integrityScore: integrityAnalysis.integrityScore,
        riskLevel: integrityAnalysis.riskLevel,
        requiresHumanReview: integrityAnalysis.requiresHumanReview,
        observedFacts: integrityAnalysis.observedFacts,
        reviewFlags: integrityAnalysis.reviewFlags,
        recruiterSummary: integrityAnalysis.recruiterSummary
      },

      // Follow-up Recommendations
      recommendedFollowUps: skillGapAnalysis.recommendedFollowUps,

      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Builds step-by-step adaptive progression timeline
   */
  _buildProgressionSummary(qaList) {
    return qaList.map((item, idx) => {
      const q = item.question || {};
      const a = item.answer || {};
      const ev = item.evaluation || {};

      let difficultyShift = 'initial';
      if (idx > 0) {
        const prevDiff = qaList[idx - 1]?.question?.difficulty;
        if (prevDiff && q.difficulty) {
          if (prevDiff === q.difficulty) difficultyShift = 'maintained';
          else if (q.difficulty === 'advanced') difficultyShift = 'escalated_to_advanced';
          else if (q.difficulty === 'beginner') difficultyShift = 'reduced_to_beginner';
          else difficultyShift = 'adjusted';
        }
      }

      return {
        step: idx + 1,
        questionId: q.id,
        skill: q.skill,
        difficulty: q.difficulty,
        difficultyShift,
        scoreAchieved: ev.score ?? null,
        timeTakenSeconds: a.timeTakenSeconds ?? null,
        adaptiveRationale: ev.score >= 8
          ? `High score (${ev.score}/10) demonstrated conceptual mastery; engine probed deeper architectural complexity.`
          : ev.score <= 4
          ? `Score (${ev.score}/10) indicated foundational gaps; engine adjusted to fundamental principles.`
          : `Solid response (${ev.score}/10); engine explored practical implementation.`
      };
    });
  }

  /**
   * Links strengths and weaknesses to exact question/answer evidence
   */
  _extractEvidencePoints(qaList) {
    const evidenceBackedStrengths = [];
    const evidenceBackedImprovements = [];

    for (const item of qaList) {
      const q = item.question || {};
      const a = item.answer || {};
      const ev = item.evaluation || {};

      const excerpt = a.answerText
        ? (a.answerText.length > 180 ? `${a.answerText.slice(0, 177)}...` : a.answerText)
        : '';

      if (Array.isArray(ev.strengths)) {
        for (const s of ev.strengths) {
          evidenceBackedStrengths.push({
            point: s,
            skill: q.skill,
            citation: {
              questionIndex: q.questionIndex,
              questionText: q.questionText,
              answerExcerpt: excerpt,
              score: ev.score
            }
          });
        }
      }

      if (Array.isArray(ev.weaknesses)) {
        for (const w of ev.weaknesses) {
          evidenceBackedImprovements.push({
            point: w,
            skill: q.skill,
            citation: {
              questionIndex: q.questionIndex,
              questionText: q.questionText,
              answerExcerpt: excerpt,
              score: ev.score
            }
          });
        }
      }
    }

    return {
      evidenceBackedStrengths,
      evidenceBackedImprovements
    };
  }

  /**
   * Determines objective hiring recommendation based on multiple verifiable signals
   */
  _determineHiringRecommendation({
    overallScore,
    integrityScore,
    skillsDemonstrated,
    totalRequiredSkills,
    isCompleted,
    isTerminated
  }) {
    if (isTerminated) {
      return {
        decision: 'no_hire',
        confidence: 0.9,
        rationale: 'Interview session was terminated early or interrupted without regular completion.',
        nextSteps: 'Check candidate availability to reschedule or close application.'
      };
    }

    if (!isCompleted) {
      return {
        decision: 'lean_no_hire',
        confidence: 0.7,
        rationale: 'Interview is incomplete; insufficient evidence collected to make a definitive hiring recommendation.',
        nextSteps: 'Allow candidate to complete pending questions or schedule a follow-up session.'
      };
    }

    // Completed interview decision matrix
    if (overallScore >= 80 && integrityScore >= 80 && skillsDemonstrated >= totalRequiredSkills) {
      return {
        decision: 'strong_hire',
        confidence: 0.92,
        rationale: `Exceptional technical performance (${overallScore}/100) meeting or exceeding all ${totalRequiredSkills} required skills with verified integrity (${integrityScore}/100).`,
        nextSteps: 'Proceed directly to final hiring committee / offer discussion.'
      };
    }

    if (overallScore >= 70 && integrityScore >= 70) {
      return {
        decision: 'hire',
        confidence: 0.85,
        rationale: `Solid competency demonstrated (${overallScore}/100) across key evaluated competencies with acceptable integrity (${integrityScore}/100).`,
        nextSteps: 'Advance to team cultural fit or engineering lead conversation.'
      };
    }

    if (overallScore >= 55) {
      return {
        decision: 'lean_hire',
        confidence: 0.75,
        rationale: `Candidate achieved baseline technical passing bar (${overallScore}/100) with identified growth areas in specific skills.`,
        nextSteps: 'Conduct targeted technical follow-up on unassessed or lower-scoring skills.'
      };
    }

    if (overallScore >= 40) {
      return {
        decision: 'lean_no_hire',
        confidence: 0.80,
        rationale: `Demonstrated technical capability (${overallScore}/100) falls below required position thresholds for multiple skills.`,
        nextSteps: 'Review candidate response citations or consider for a junior/alternative role.'
      };
    }

    return {
      decision: 'no_hire',
      confidence: 0.90,
      rationale: `Technical score (${overallScore}/100) does not meet minimum technical requirements for the role.`,
      nextSteps: 'Send courteous rejection update with feedback highlights.'
    };
  }

  _buildExecutiveSummary({
    candidateName,
    jobTitle,
    overallScore,
    readinessScore,
    questionsAnswered,
    totalQuestions,
    isCompleted,
    recommendation
  }) {
    if (!isCompleted) {
      return `${candidateName} participated in an interview session for ${jobTitle}, completing ${questionsAnswered} of ${totalQuestions} questions before session interruption. Assessment is preliminary.`;
    }

    return `${candidateName} completed the full adaptive interview assessment for the ${jobTitle} position (${questionsAnswered} questions evaluated). Overall technical score: ${overallScore}/100 with a role readiness index of ${readinessScore}/100. Hiring decision support: ${recommendation.toUpperCase().replace(/_/g, ' ')}.`;
  }
}

module.exports = new EvidenceReportService();
