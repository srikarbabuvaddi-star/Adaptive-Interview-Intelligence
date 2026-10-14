/**
 * Adaptive Interview Logic Service
 * Ported and integrated from Adaptive_interview_logic architecture:
 * 1. Two-dimensional adaptive algorithm (Adaptive Depth vs. Resume Skill Coverage)
 * 2. Deterministic answer evaluation: 0.60 * correctness + 0.40 * completeness
 * 3. Concept matching with exact candidate quote evidence extraction
 * 4. Difficulty-weighted skill scoring (Easy: 1.0x, Medium: 1.15x, Hard: 1.30x)
 * 5. Proficiency tier classification (Advanced, Proficient, Competent, Needs Improvement)
 * 6. Hiring Manager next-round follow-up probes generation
 */

const { QUESTION_DIFFICULTY } = require('../../constants/interviewStatus');

// Difficulty multipliers
const DIFFICULTY_WEIGHTS = {
  easy: 1.0,
  beginner: 1.0,
  medium: 1.15,
  intermediate: 1.15,
  hard: 1.30,
  advanced: 1.30
};

// Normalized canonical difficulty levels
const CANONICAL_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

const DIFFICULTY_MAP_TO_CANONICAL = {
  easy: 'beginner',
  beginner: 'beginner',
  medium: 'intermediate',
  intermediate: 'intermediate',
  hard: 'advanced',
  advanced: 'advanced'
};

const DIFFICULTY_MAP_TO_THREE_TIER = {
  beginner: 'easy',
  easy: 'easy',
  intermediate: 'medium',
  medium: 'medium',
  advanced: 'hard',
  hard: 'hard'
};

/**
 * Normalizes any difficulty string to 'easy' | 'medium' | 'hard'
 */
function toThreeTierDifficulty(diff) {
  const lower = String(diff || 'easy').toLowerCase().trim();
  return DIFFICULTY_MAP_TO_THREE_TIER[lower] || 'easy';
}

/**
 * Normalizes any difficulty string to 'beginner' | 'intermediate' | 'advanced'
 */
function toCanonicalDifficulty(diff) {
  const lower = String(diff || 'intermediate').toLowerCase().trim();
  return DIFFICULTY_MAP_TO_CANONICAL[lower] || QUESTION_DIFFICULTY.INTERMEDIATE;
}

class AdaptiveLogicService {
  constructor() {
    this.difficultyWeights = DIFFICULTY_WEIGHTS;
  }

  /**
   * Deterministically evaluates an answer given expected concepts and raw correctness
   * Formula:
   * Completeness = (|Matched Concepts| / |Expected Concepts|) * 100
   * Question Score = round(0.60 * Correctness + 0.40 * Completeness)
   *
   * @param {Object} params
   * @param {string} params.question - The question text
   * @param {string} params.candidateAnswer - The candidate's response
   * @param {Array<string>} params.expectedConcepts - Concepts expected in answer
   * @param {number} [params.rawCorrectness] - AI evaluated correctness 0-100 (or derived)
   * @param {Array<string>} [params.rawMatchedConcepts] - AI matched concepts
   * @param {Array<string>} [params.rawEvidence] - AI direct quote excerpts
   * @param {string} [params.rawExplanation] - Explanation
   * @returns {Object} Structured deterministic evaluation
   */
  calculateDeterministicEvaluation({
    question,
    candidateAnswer = '',
    expectedConcepts = [],
    rawCorrectness = 70,
    rawMatchedConcepts = [],
    rawEvidence = [],
    rawExplanation = ''
  }) {
    const answerText = String(candidateAnswer || '').trim();
    const concepts = Array.isArray(expectedConcepts) ? expectedConcepts.filter(c => typeof c === 'string' && c.trim()) : [];

    // 1. Handle empty answer edge case
    if (!answerText) {
      return {
        status: 'incorrect_or_unclear',
        score: 0,
        scoreOutOf10: 0,
        correctnessScore: 0,
        completenessScore: 0,
        explanation: 'No answer was provided by the candidate.',
        expectedConcepts: concepts,
        matchedConcepts: [],
        missingConcepts: concepts,
        evidence: []
      };
    }

    // 2. Normalize correctness score (0 to 100)
    let correctness = typeof rawCorrectness === 'number' ? rawCorrectness : parseFloat(rawCorrectness);
    if (isNaN(correctness)) correctness = 50;
    // If input is on a 0-10 scale, convert to 0-100 scale
    if (correctness <= 10 && correctness > 0) {
      correctness = correctness * 10;
    }
    correctness = Math.max(0, Math.min(100, Math.round(correctness)));

    // 3. Strict concept matching against expected concepts
    const matchedLookup = new Set(
      (Array.isArray(rawMatchedConcepts) ? rawMatchedConcepts : [])
        .filter(c => typeof c === 'string')
        .map(c => c.trim().toLowerCase())
    );

    // Also heuristic fallback match: if LLM didn't return matched_concepts array, match against answer text
    const lowerAnswer = answerText.toLowerCase();

    const matched = [];
    const missing = [];

    for (const concept of concepts) {
      const lowerConcept = concept.toLowerCase().trim();
      const tokens = lowerConcept.split(/\s+/).filter(w => w.length > 3);
      const matchedByLLM = matchedLookup.has(lowerConcept);
      const matchedByText = lowerAnswer.includes(lowerConcept) || (tokens.length > 0 && tokens.every(t => lowerAnswer.includes(t)));

      if (matchedByLLM || matchedByText) {
        matched.push(concept);
      } else {
        missing.push(concept);
      }
    }

    // 4. Calculate completeness score deterministically from concept match ratio
    let completeness = 0;
    if (concepts.length > 0) {
      completeness = Math.round((matched.length / concepts.length) * 100);
    } else {
      completeness = correctness; // If no expected concepts provided, completeness reflects correctness
    }

    // 5. Calculate composite question score (60% correctness, 40% completeness)
    const compositeScore = Math.round((0.60 * correctness) + (0.40 * completeness));
    const scoreOutOf10 = Math.round((compositeScore / 10) * 10) / 10;

    // 6. Deterministic status classification
    let status;
    if (compositeScore >= 75 && correctness >= 70) {
      status = 'correct';
    } else if (compositeScore >= 40 || correctness >= 40 || completeness >= 40) {
      status = 'partially_correct';
    } else {
      status = 'incorrect_or_unclear';
    }

    // 7. Sanitize evidence quotes
    const evidenceList = Array.isArray(rawEvidence)
      ? rawEvidence.filter(e => typeof e === 'string' && e.trim()).map(e => e.trim())
      : [];

    // Fallback evidence from answer text if none provided
    if (evidenceList.length === 0 && answerText.length > 0) {
      const firstSentence = answerText.split(/[.!?]\s+/)[0];
      if (firstSentence && firstSentence.length > 10) {
        evidenceList.push(firstSentence.length > 160 ? `${firstSentence.slice(0, 157)}...` : firstSentence);
      }
    }

    const explanation = rawExplanation && rawExplanation.trim()
      ? rawExplanation.trim()
      : `Candidate demonstrated ${matched.length} of ${concepts.length} concepts with ${correctness}% technical accuracy and ${completeness}% conceptual completeness.`;

    return {
      status,
      score: compositeScore,
      scoreOutOf10,
      correctnessScore: correctness,
      completenessScore: completeness,
      explanation,
      expectedConcepts: concepts,
      matchedConcepts: matched,
      missingConcepts: missing,
      evidence: evidenceList
    };
  }

  /**
   * Two-dimensional adaptive decision engine:
   * Balances Adaptive Depth vs. Multi-Skill Resume Coverage
   *
   * @param {Object} params
   * @param {Array<string>} params.skills - List of job/candidate target skills
   * @param {string} params.currentSkill - Currently evaluated skill
   * @param {string} params.currentDifficulty - 'easy' | 'medium' | 'hard' (or beginner | intermediate | advanced)
   * @param {string} params.status - 'correct' | 'partially_correct' | 'incorrect_or_unclear'
   * @param {Object} [params.skillStats] - Tracking map { [skill]: { questions_asked, consecutive, difficulty } }
   * @param {number} [params.roundNumber] - Current round index (1-based)
   * @param {number} [params.totalRounds] - Total rounds planned (e.g. 5 or 10)
   * @returns {Object} { action, reason, nextSkill, nextDifficulty, canonicalDifficulty, updatedSkillStats }
   */
  selectNextAdaptiveSkillAndDifficulty({
    skills = [],
    currentSkill,
    currentDifficulty = 'easy',
    status = 'correct',
    skillStats = {},
    roundNumber = 1,
    totalRounds = 5
  }) {
    const skillList = Array.isArray(skills) && skills.length > 0
      ? skills
      : [currentSkill || 'General Software Engineering'];

    const activeSkill = currentSkill || skillList[0];
    const threeTierDiff = toThreeTierDifficulty(currentDifficulty);
    const difficulties = ['easy', 'medium', 'hard'];
    let currDiffIdx = difficulties.indexOf(threeTierDiff);
    if (currDiffIdx === -1) currDiffIdx = 0;

    // 1. Calculate next difficulty for the current skill
    let nextDiffIdxCurr;
    if (status === 'correct') {
      nextDiffIdxCurr = Math.min(currDiffIdx + 1, 2);
    } else if (status === 'partially_correct') {
      nextDiffIdxCurr = currDiffIdx;
    } else {
      nextDiffIdxCurr = Math.max(currDiffIdx - 1, 0);
    }
    const updatedCurrDifficulty = difficulties[nextDiffIdxCurr];

    // Ensure skillStats has entry for all skills
    const stats = { ...skillStats };
    for (const s of skillList) {
      if (!stats[s]) {
        stats[s] = { questions_asked: 0, consecutive: 0, difficulty: 'easy' };
      }
    }

    // 2. Check skill coverage and depth constraints
    const roundsRemaining = Math.max(0, totalRounds - roundNumber);
    const unvisitedSkills = skillList.filter(
      s => (stats[s]?.questions_asked || 0) === 0 && s !== activeSkill
    );

    const currConsecutive = stats[activeSkill]?.consecutive || 1;
    const maxConsecutiveAllowed = skillList.length > 1 ? 2 : 999;

    let mustSwitchSkill = false;
    let decisionReason = '';
    let action = '';

    // Condition A: Must switch to cover unvisited skills before rounds run out
    if (unvisitedSkills.length >= roundsRemaining && unvisitedSkills.length > 0) {
      mustSwitchSkill = true;
      decisionReason = `Transitioning to assess unvisited resume skill to ensure 100% skill coverage.`;
    }
    // Condition B: Max consecutive depth reached for this skill
    else if (currConsecutive >= maxConsecutiveAllowed && skillList.length > 1) {
      mustSwitchSkill = true;
      decisionReason = `Completed in-depth assessment of '${activeSkill}'. Rotating to cover next resume skill.`;
    }
    // Condition C: Struggled on this skill and other skills need assessment
    else if (status === 'incorrect_or_unclear' && skillList.length > 1 && unvisitedSkills.length > 0) {
      mustSwitchSkill = true;
      decisionReason = `Candidate struggled on '${activeSkill}'. Switching to assess other resume competencies.`;
    }

    let nextSkill = activeSkill;
    let nextDifficulty = updatedCurrDifficulty;

    if (mustSwitchSkill) {
      action = 'switch_skill';
      if (unvisitedSkills.length > 0) {
        nextSkill = unvisitedSkills[0];
      } else {
        const otherSkills = skillList.filter(s => s !== activeSkill);
        nextSkill = otherSkills.reduce((least, s) => {
          const countS = stats[s]?.questions_asked || 0;
          const countLeast = stats[least]?.questions_asked || 0;
          return countS < countLeast ? s : least;
        }, otherSkills[0]);
      }
      nextDifficulty = stats[nextSkill]?.difficulty || 'easy';
    } else {
      nextSkill = activeSkill;
      nextDifficulty = updatedCurrDifficulty;

      if (status === 'correct') {
        action = 'increase_difficulty';
        decisionReason = `Candidate answered correctly. Escalating difficulty to '${nextDifficulty}' to test deeper mastery in '${activeSkill}'.`;
      } else if (status === 'partially_correct') {
        action = 'ask_follow_up';
        decisionReason = `Candidate had minor gaps. Asking a targeted follow-up on '${activeSkill}' at '${nextDifficulty}'.`;
      } else {
        action = 'decrease_difficulty';
        decisionReason = `Candidate struggled. Lowering difficulty to '${nextDifficulty}' for '${activeSkill}'.`;
      }
    }

    return {
      action,
      reason: decisionReason,
      mustSwitchSkill,
      nextSkill,
      nextDifficulty,
      canonicalDifficulty: toCanonicalDifficulty(nextDifficulty)
    };
  }

  /**
   * Difficulty-weighted skill score calculation (from skill_scoring.py)
   * Easy: 1.0x, Medium: 1.15x, Hard: 1.30x
   *
   * @param {Object} params
   * @param {string} params.skill - Skill name
   * @param {Array<Object>} params.questions - Array of evaluated question objects
   * @returns {Object} Structured skill assessment dossier
   */
  calculateSkillScore({ skill, questions = [] }) {
    if (!skill || typeof skill !== 'string') {
      throw new Error('A valid skill name is required.');
    }

    const cleanSkill = skill.trim();

    if (!Array.isArray(questions) || questions.length === 0) {
      return {
        skill: cleanSkill,
        score: 0,
        level: 'Unassessed',
        totalQuestions: 0,
        difficultyBreakdown: { easy: 0, medium: 0, hard: 0 },
        averageCorrectness: 0.0,
        averageCompleteness: 0.0,
        conceptCoveragePercentage: 0.0,
        explanation: `No questions were attempted for ${cleanSkill}.`,
        evidence: [],
        matchedConcepts: [],
        missingConcepts: [],
        questionsAudit: []
      };
    }

    const diffCounts = { easy: 0, medium: 0, hard: 0 };
    let weightedScoreSum = 0.0;
    let totalWeights = 0.0;
    let totalCorrectness = 0.0;
    let totalCompleteness = 0.0;

    const allExpected = [];
    const allMatched = [];
    const allEvidence = [];
    const questionsAudit = [];

    for (const q of questions) {
      const diffThree = toThreeTierDifficulty(q.difficulty || 'easy');
      diffCounts[diffThree] = (diffCounts[diffThree] || 0) + 1;

      const weight = DIFFICULTY_WEIGHTS[diffThree] || 1.0;
      const score = typeof q.score === 'number'
        ? (q.score <= 10 && q.score > 0 ? q.score * 10 : q.score)
        : 50;

      weightedScoreSum += score * weight;
      totalWeights += weight;

      const corr = typeof q.correctnessScore === 'number'
        ? q.correctnessScore
        : score;
      const comp = typeof q.completenessScore === 'number'
        ? q.completenessScore
        : 50;

      totalCorrectness += corr;
      totalCompleteness += comp;

      const expC = Array.isArray(q.expectedConcepts) ? q.expectedConcepts : (q.expectedKeyPoints || []);
      const matC = Array.isArray(q.matchedConcepts) ? q.matchedConcepts : [];
      const misC = Array.isArray(q.missingConcepts) ? q.missingConcepts : [];
      const ev = Array.isArray(q.evidence) ? q.evidence : [];

      for (const c of expC) {
        if (typeof c === 'string' && c.trim() && !allExpected.includes(c.trim())) {
          allExpected.push(c.trim());
        }
      }

      for (const c of matC) {
        if (typeof c === 'string' && c.trim() && !allMatched.includes(c.trim())) {
          allMatched.push(c.trim());
        }
      }

      for (const e of ev) {
        if (typeof e === 'string' && e.trim() && !allEvidence.includes(e.trim())) {
          allEvidence.push(e.trim());
        }
      }

      questionsAudit.push({
        question: q.question || q.questionText || '',
        difficulty: diffThree,
        status: q.status || 'unknown',
        correctnessScore: Math.round(corr * 10) / 10,
        completenessScore: Math.round(comp * 10) / 10,
        score: Math.round(score * 10) / 10,
        matchedConcepts: matC,
        missingConcepts: misC
      });
    }

    const numQuestions = questions.length;
    const avgCorrectness = Math.round((totalCorrectness / numQuestions) * 10) / 10;
    const avgCompleteness = Math.round((totalCompleteness / numQuestions) * 10) / 10;

    const finalScore = totalWeights > 0
      ? Math.round(Math.min(100.0, weightedScoreSum / totalWeights))
      : 0;

    // Identified persistent gaps: concepts never demonstrated
    const matchedCasefold = new Set(allMatched.map(c => c.toLowerCase()));
    const unresolvedGaps = allExpected.filter(c => !matchedCasefold.has(c.toLowerCase()));

    // Concept coverage percentage
    const conceptCoverage = allExpected.length > 0
      ? Math.round((allMatched.length / allExpected.length) * 1000) / 10
      : 0.0;

    // Proficiency level classification
    let level;
    let ratingDesc;
    if (finalScore >= 85) {
      level = 'Advanced';
      ratingDesc = 'deep and comprehensive';
    } else if (finalScore >= 70) {
      level = 'Proficient';
      ratingDesc = 'solid and proficient';
    } else if (finalScore >= 50) {
      level = 'Competent';
      ratingDesc = 'moderate with noticeable knowledge gaps';
    } else {
      level = 'Needs Improvement';
      ratingDesc = 'limited and requires foundational study';
    }

    const explanation = `The candidate demonstrated a ${ratingDesc} understanding of ${cleanSkill} with an average correctness of ${avgCorrectness}%, concept completeness of ${avgCompleteness}%, and concept coverage of ${conceptCoverage}% across ${numQuestions} question(s).`;

    return {
      skill: cleanSkill,
      score: finalScore,
      level,
      totalQuestions: numQuestions,
      difficultyBreakdown: diffCounts,
      averageCorrectness: avgCorrectness,
      averageCompleteness: avgCompleteness,
      conceptCoveragePercentage: conceptCoverage,
      explanation,
      evidence: allEvidence,
      matchedConcepts: allMatched,
      missingConcepts: unresolvedGaps,
      questionsAudit
    };
  }

  /**
   * Generates targeted follow-up questions for the Hiring Manager
   * based specifically on the candidate's gaps and unverified concepts.
   */
  generateHiringManagerProbes({ jobRole = 'Software Engineer', experienceLevel = 'Mid-Level', missingConcepts = [], weakSkills = [] }) {
    const probes = [];

    if (Array.isArray(missingConcepts) && missingConcepts.length > 0) {
      for (const concept of missingConcepts.slice(0, 3)) {
        probes.push({
          topic: `Knowledge Gap Probe: ${concept}`,
          question: `Can you walk us through a real-world scenario where you had to implement, optimize, or debug ${concept}?`,
          rationale: `Candidate did not demonstrate ${concept} during the technical screening round.`
        });
      }
    }

    if (Array.isArray(weakSkills) && weakSkills.length > 0) {
      for (const skill of weakSkills.slice(0, 2)) {
        probes.push({
          topic: `Skill Depth Calibration: ${skill}`,
          question: `In a production environment, how do you handle concurrency, fault mitigation, and architectural tradeoffs using ${skill}?`,
          rationale: `Candidate exhibited marginal proficiency in ${skill}; further depth inquiry is recommended.`
        });
      }
    }

    if (probes.length === 0) {
      probes.push({
        topic: 'System & Architectural Depth',
        question: `How would you design and optimize a production service for ${jobRole} handling high-scale concurrent traffic?`,
        rationale: 'Candidate showed strong fundamentals; on-site round should test high-scale distributed architecture.'
      });
    }

    return probes;
  }
}

module.exports = new AdaptiveLogicService();
