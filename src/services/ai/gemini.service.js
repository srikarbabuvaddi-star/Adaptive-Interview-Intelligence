const { GoogleGenAI } = require('@google/genai');
const IAIEngineService = require('./ai.interface');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const ApiError = require('../../utils/apiError');
const { QUESTION_DIFFICULTY } = require('../../constants/interviewStatus');
const adaptiveLogicService = require('../intelligence/adaptiveLogic.service');

class GeminiAIService extends IAIEngineService {
  constructor() {
    super();
    this.client = null;
    if (env.GEMINI_API_KEY) {
      try {
        this.client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        logger.info('Gemini AI Service initialized with Google GenAI SDK');
      } catch (err) {
        logger.error(`Failed to initialize Google GenAI SDK: ${err.message}`);
      }
    } else {
      logger.warn('No GEMINI_API_KEY configured. Adaptive fallback AI engine will be used for offline development and testing.');
    }
  }

  /**
   * Helper to execute Gemini prompt with structured JSON formatting
   */
  async _callGemini(systemInstruction, userPrompt) {
    if (!this.client) {
      throw ApiError.aiServiceError('Gemini API key is not configured');
    }

    try {
      const response = await this.client.models.generateContent({
        model: env.GEMINI_MODEL || 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { text: `${systemInstruction}\n\nIMPORTANT: Respond with pure JSON only, matching the exact requested structure. No markdown formatting, no backticks.\n\n${userPrompt}` }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      });

      const rawText = response.text || '';
      const cleaned = rawText
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      return JSON.parse(cleaned);
    } catch (err) {
      logger.error(`Gemini API call failed: ${err.message}`, { details: err });
      throw ApiError.aiServiceError(`AI evaluation service failed: ${err.message}`);
    }
  }

  /**
   * Generates the first interview question
   */
  async generateFirstQuestion({ job, candidateProfile }) {
    if (this.client) {
      let candidateContext = '';
      if (candidateProfile && (candidateProfile.headline || candidateProfile.skills?.length || candidateProfile.projects?.length)) {
        candidateContext = `\nCandidate Background (from uploaded resume):
- Headline: ${candidateProfile.headline || 'Software Engineer'}
- Experience: ${candidateProfile.experienceYears || 'Not specified'} years
- Claimed Skills: ${(candidateProfile.skills || []).join(', ') || 'General'}
- Claimed Projects: ${(candidateProfile.projects || []).map(p => `${p.name}: ${p.description || ''}`).slice(0, 3).join('; ') || 'None listed'}
- Work History: ${(candidateProfile.workExperience || []).map(w => `${w.role} at ${w.company}`).slice(0, 3).join('; ') || 'None listed'}`;
      }

      const systemInstruction = `You are an elite technical interviewer conducting an adaptive interview for the position: "${job.title}".
Job Description: ${job.description}
Required Skills: ${JSON.stringify(job.requiredSkills)}
Evaluation Criteria: ${JSON.stringify(job.evaluationCriteria)}${candidateContext}`;

      const prompt = `Generate the opening question for this interview. Pick the primary skill required.
The question difficulty should be intermediate or the minimum level required.
${candidateContext ? 'Where appropriate, connect the required competency to the candidate\'s background/projects, asking them to describe architectural rationale, state management, or production trade-offs.' : ''}
Also identify 3 to 5 important concepts expected in a good answer.

Return a JSON object with this exact shape:
{
  "questionText": "Clear, direct, scenario-based or conceptual interview question",
  "skill": "Name of the skill being evaluated",
  "difficulty": "beginner" | "intermediate" | "advanced",
  "expectedConcepts": ["concept 1", "concept 2", "concept 3"],
  "expectedKeyPoints": ["concept 1", "concept 2", "concept 3"],
  "context": "Context or goal of this question"
}`;

      try {
        const result = await this._callGemini(systemInstruction, prompt);
        const expectedConcepts = (Array.isArray(result.expectedConcepts) && result.expectedConcepts.length >= 2)
          ? result.expectedConcepts
          : (Array.isArray(result.expectedKeyPoints) && result.expectedKeyPoints.length >= 2 ? result.expectedKeyPoints : [
              `Core principles and paradigms of ${result.skill || 'the target skill'}`,
              'Scalability and separation of concerns',
              'Error recovery and production best practices'
            ]);

        return {
          questionText: result.questionText,
          skill: result.skill || job.requiredSkills[0]?.name || 'General Engineering',
          difficulty: result.difficulty || QUESTION_DIFFICULTY.INTERMEDIATE,
          expectedConcepts,
          expectedKeyPoints: expectedConcepts,
          context: result.context || ''
        };
      } catch (err) {
        logger.error(`Live Gemini generation failed: ${err.message}`);
        if (process.env.NODE_ENV !== 'production') {
          logger.warn('Falling back to deterministic adaptive question formulation for development/testing.');
          return this._fallbackFirstQuestion(job, candidateProfile);
        }
        throw ApiError.aiServiceError(`Live Gemini question generation failed: ${err.message}. Please verify your GEMINI_API_KEY and retry.`);
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      return this._fallbackFirstQuestion(job, candidateProfile);
    }
    throw ApiError.aiServiceError('GEMINI_API_KEY is not configured. Live AI adaptive interviewing requires a valid Gemini API key.');
  }

  /**
   * Evaluates the candidate's answer and generates the next adaptive question
   * Uses 2D Adaptive Selection (Depth vs. Coverage) & Deterministic Concept Scoring
   */
  async evaluateAnswerAndGenerateNextQuestion({
    job,
    currentQuestion,
    answer,
    previousQA = [],
    candidateProfile = {},
    skillScores = {},
    skillStats = {},
    questionIndex,
    maxQuestions
  }) {
    const isLastQuestion = questionIndex >= maxQuestions;
    const skills = (job.requiredSkills || []).map(s => (typeof s === 'string' ? s : s.name));
    if (skills.length === 0) skills.push(currentQuestion.skill || 'General Technical');

    const expectedConcepts = (Array.isArray(currentQuestion.expectedConcepts) && currentQuestion.expectedConcepts.length > 0)
      ? currentQuestion.expectedConcepts
      : (Array.isArray(currentQuestion.expectedKeyPoints) && currentQuestion.expectedKeyPoints.length > 0
          ? currentQuestion.expectedKeyPoints
          : [`Core principles of ${currentQuestion.skill}`, 'Production resilience', 'Tradeoff awareness']);

    if (this.client) {
      const systemInstruction = `You are an adaptive technical interviewer and objective evaluator.
Role: ${job.title}
Job Description: ${job.description}
Required Skills: ${JSON.stringify(job.requiredSkills)}
Evaluation Criteria: ${JSON.stringify(job.evaluationCriteria)}`;

      const prompt = `
Current Question (Index ${questionIndex} of ${maxQuestions}):
- Question: "${currentQuestion.questionText}"
- Target Skill: "${currentQuestion.skill}"
- Difficulty: "${currentQuestion.difficulty}"
- Expected Concepts: ${JSON.stringify(expectedConcepts)}

Candidate's Answer:
"${answer}"

History of previous questions & answers:
${JSON.stringify(previousQA.slice(-3))}

Evaluation Instructions:
1. Correctness Assessment (0 to 100): Evaluate technical accuracy, reasoning validity, and factual correctness.
2. Concept Matching:
   - "matchedConcepts": ONLY concepts from the expected concepts list that the candidate genuinely demonstrated.
   - "missingConcepts": concepts from expected concepts omitted or failed to demonstrate.
3. Evidence: Direct short quotes from the candidate's answer.
4. Explanation & Feedback: Concise technical rationale, key strengths, and weaknesses.

Return JSON with this exact shape:
{
  "correctnessScore": number (0-100),
  "matchedConcepts": ["concept from expected concepts"],
  "missingConcepts": ["concept from expected concepts"],
  "evidence": ["quote from answer"],
  "explanation": "Concise justification",
  "feedback": "Constructive feedback for candidate",
  "strengths": ["strength 1"],
  "weaknesses": ["weakness 1"],
  "conceptualAccuracy": number (0-10),
  "depthScore": number (0-10),
  "communicationScore": number (0-10)
}`;

      try {
        const result = await this._callGemini(systemInstruction, prompt);

        // Run deterministic evaluation formula: 0.60 * correctness + 0.40 * completeness
        const deterministicEval = adaptiveLogicService.calculateDeterministicEvaluation({
          question: currentQuestion.questionText,
          candidateAnswer: answer,
          expectedConcepts,
          rawCorrectness: result.correctnessScore ?? (result.conceptualAccuracy != null ? result.conceptualAccuracy * 10 : 70),
          rawMatchedConcepts: result.matchedConcepts || [],
          rawEvidence: result.evidence || [],
          rawExplanation: result.explanation || result.feedback || ''
        });

        // Determine 2D adaptive next skill and difficulty
        const adaptiveDecision = adaptiveLogicService.selectNextAdaptiveSkillAndDifficulty({
          skills,
          currentSkill: currentQuestion.skill,
          currentDifficulty: currentQuestion.difficulty,
          status: deterministicEval.status,
          skillStats,
          roundNumber: questionIndex,
          totalRounds: maxQuestions
        });

        const updatedSkillScores = {
          ...skillScores,
          [currentQuestion.skill]: deterministicEval.scoreOutOf10
        };

        let nextQuestion = null;

        if (!isLastQuestion) {
          const candidateClaimContext = (candidateProfile?.skills && candidateProfile.skills.length > 0)
            ? `Candidate Claimed Skills: ${candidateProfile.skills.join(', ')} (Experience: ${candidateProfile.experienceYears || 'unspecified'} yrs). Probe depth, real-world trade-offs, or unresolved skill gaps.`
            : '';

          const nextPrompt = `
You are an expert technical interviewer.
Job Role: ${job.title}
Target Skill: ${adaptiveDecision.nextSkill}
Difficulty Level: ${adaptiveDecision.canonicalDifficulty}
Adaptive Decision Action: ${adaptiveDecision.action} (${adaptiveDecision.reason})
${candidateClaimContext}

Generate ONE new technical question on '${adaptiveDecision.nextSkill}' at '${adaptiveDecision.canonicalDifficulty}' difficulty.
Also identify 3 to 5 expected concepts for evaluating a good answer.

Return JSON with this exact shape:
{
  "questionText": "Clear, direct interview question",
  "skill": "${adaptiveDecision.nextSkill}",
  "difficulty": "${adaptiveDecision.canonicalDifficulty}",
  "expectedConcepts": ["concept 1", "concept 2", "concept 3"],
  "expectedKeyPoints": ["concept 1", "concept 2", "concept 3"],
  "context": "${adaptiveDecision.reason}"
}`;
          try {
            const nextQResult = await this._callGemini(systemInstruction, nextPrompt);
            const nextConcepts = Array.isArray(nextQResult.expectedConcepts) && nextQResult.expectedConcepts.length >= 2
              ? nextQResult.expectedConcepts
              : (Array.isArray(nextQResult.expectedKeyPoints) && nextQResult.expectedKeyPoints.length >= 2 ? nextQResult.expectedKeyPoints : [
                  `Fundamental mechanisms of ${adaptiveDecision.nextSkill}`,
                  'Error recovery and edge cases',
                  'Tradeoff and architectural decisions'
                ]);

            nextQuestion = {
              questionText: nextQResult.questionText,
              skill: nextQResult.skill || adaptiveDecision.nextSkill,
              difficulty: nextQResult.difficulty || adaptiveDecision.canonicalDifficulty,
              expectedConcepts: nextConcepts,
              expectedKeyPoints: nextConcepts,
              context: nextQResult.context || adaptiveDecision.reason
            };
          } catch (nextErr) {
            logger.warn(`Could not generate next adaptive question via Gemini, using algorithmic formulation: ${nextErr.message}`);
            nextQuestion = this._generateAlgorithmicQuestion(adaptiveDecision.nextSkill, adaptiveDecision.canonicalDifficulty, adaptiveDecision.reason);
          }
        }

        return {
          evaluation: {
            score: deterministicEval.scoreOutOf10,
            compositeScore: deterministicEval.score,
            correctnessScore: deterministicEval.correctnessScore,
            completenessScore: deterministicEval.completenessScore,
            status: deterministicEval.status,
            skill: currentQuestion.skill,
            feedback: result.feedback || deterministicEval.explanation,
            explanation: deterministicEval.explanation,
            matchedConcepts: deterministicEval.matchedConcepts,
            missingConcepts: deterministicEval.missingConcepts,
            evidence: deterministicEval.evidence,
            strengths: Array.isArray(result.strengths) && result.strengths.length > 0 ? result.strengths : ['Sound foundational explanation'],
            weaknesses: Array.isArray(result.weaknesses) ? result.weaknesses : deterministicEval.missingConcepts,
            conceptualAccuracy: Number(result.conceptualAccuracy) || Math.round(deterministicEval.correctnessScore / 10),
            depthScore: Number(result.depthScore) || Math.round(deterministicEval.completenessScore / 10),
            communicationScore: Number(result.communicationScore) || 8
          },
          updatedSkillScores,
          isInterviewComplete: isLastQuestion,
          adaptiveDecision,
          nextQuestion
        };
      } catch (err) {
        logger.error(`Live Gemini evaluation failed: ${err.message}`);
        if (process.env.NODE_ENV !== 'production') {
          logger.warn('Falling back to deterministic answer evaluation for development/testing.');
          return this._fallbackEvaluation(job, currentQuestion, answer, skillScores, questionIndex, maxQuestions, skillStats);
        }
        throw ApiError.aiServiceError(`Live Gemini answer evaluation failed: ${err.message}. Please retry.`);
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      return this._fallbackEvaluation(job, currentQuestion, answer, skillScores, questionIndex, maxQuestions, skillStats);
    }
    throw ApiError.aiServiceError('GEMINI_API_KEY is not configured. Live AI answer evaluation requires a valid Gemini API key.');
  }

  /**
   * Generates the comprehensive final report and skill gap analysis
   */
  async generateFinalReport({ job, interview, questionsWithAnswersAndEvaluations, integrityEvents = [] }) {
    if (this.client) {
      const systemInstruction = `You are a Principal Technical Hiring Reviewer.
Job: ${job.title}
Job Description: ${job.description}
Required Skills: ${JSON.stringify(job.requiredSkills)}
Evaluation Criteria: ${JSON.stringify(job.evaluationCriteria)}`;

      const prompt = `Synthesize the complete interview record and proctoring events:
Transcript & evaluations:
${JSON.stringify(questionsWithAnswersAndEvaluations, null, 2)}

Integrity & Proctoring events:
${JSON.stringify(integrityEvents, null, 2)}

Produce a rigorous hiring report:
1. Overall score (0-100)
2. Summary of candidate's technical profile
3. Major strengths and areas for improvement
4. Skill-by-skill breakdown with demonstrated level, score (0-100), and specific observations
5. Skill gap report comparing candidate's performance against the required level for each required skill
6. Integrity score (0-100, deducting for serious integrity incidents like tab switches, copy-pasting, multi-face alerts)
7. Hiring recommendation: "strong_hire" | "hire" | "lean_hire" | "lean_no_hire" | "no_hire"

Return JSON with this exact shape:
{
  "overallScore": number (0-100),
  "summary": "Executive summary of technical capability and fit",
  "strengths": ["strength 1", "strength 2"],
  "areasForImprovement": ["area 1", "area 2"],
  "skillBreakdown": [
    {
      "skill": "string",
      "score": number (0-100),
      "weight": number,
      "levelDemonstrated": "beginner" | "intermediate" | "advanced",
      "feedback": "string"
    }
  ],
  "skillGapReport": {
    "readinessScore": number (0-100),
    "summary": "string",
    "skills": [
      {
        "name": "string",
        "requiredLevel": "beginner" | "intermediate" | "advanced",
        "candidateLevel": "beginner" | "intermediate" | "advanced",
        "score": number (0-100),
        "gapScore": number (0-100, where 0 is no gap, higher means deficient),
        "recommendations": ["string"]
      }
    ]
  },
  "integrityScore": number (0-100),
  "integrityIncidentCount": number,
  "recommendation": "strong_hire" | "hire" | "lean_hire" | "lean_no_hire" | "no_hire"
}`;

      try {
        const report = await this._callGemini(systemInstruction, prompt);
        return report;
      } catch (err) {
        logger.error(`Live Gemini report synthesis failed: ${err.message}`);
        if (process.env.NODE_ENV !== 'production') {
          logger.warn('Falling back to deterministic report synthesis for development/testing.');
          return this._fallbackReport(job, interview, questionsWithAnswersAndEvaluations, integrityEvents);
        }
        throw ApiError.aiServiceError(`Live Gemini report synthesis failed: ${err.message}. Please retry.`);
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      return this._fallbackReport(job, interview, questionsWithAnswersAndEvaluations, integrityEvents);
    }
    throw ApiError.aiServiceError('GEMINI_API_KEY is not configured. Live AI report synthesis requires a valid Gemini API key.');
  }

  _generateAlgorithmicQuestion(skillName, difficulty, context = '') {
    const diff = difficulty || QUESTION_DIFFICULTY.INTERMEDIATE;
    const templates = {
      [QUESTION_DIFFICULTY.BEGINNER]: `Can you describe the fundamental mechanisms of ${skillName}? What are the essential concepts a developer must know when working with it?`,
      [QUESTION_DIFFICULTY.INTERMEDIATE]: `In a production environment, how do you handle asynchronous operations, error recovery, and data consistency using ${skillName}? Give a concrete example from your experience.`,
      [QUESTION_DIFFICULTY.ADVANCED]: `Imagine a high-throughput scenario with 50,000 requests/sec. How would you architect a distributed solution using ${skillName}, mitigating bottlenecks, concurrency race conditions, and failovers?`
    };

    const concepts = [
      `Core mechanisms and lifecycle of ${skillName}`,
      'Production resilience and error boundaries',
      'Scaling and performance trade-offs'
    ];

    return {
      questionText: templates[diff] || templates[QUESTION_DIFFICULTY.INTERMEDIATE],
      skill: skillName,
      difficulty: diff,
      expectedConcepts: concepts,
      expectedKeyPoints: concepts,
      context: context || `Adaptive question assessing ${diff} competency in ${skillName}`
    };
  }

  // --- Fallback Algorithmic Implementations ---

  _fallbackFirstQuestion(job, candidateProfile = {}) {
    const rawSkill = (job.requiredSkills || [])[0];
    const primarySkill = typeof rawSkill === 'string' ? rawSkill : (rawSkill?.name || 'Core Problem Solving');
    const minLevel = typeof rawSkill === 'object' && rawSkill?.minimumLevel ? rawSkill.minimumLevel : QUESTION_DIFFICULTY.INTERMEDIATE;
    const concepts = [
      `Core principles and paradigms of ${primarySkill}`,
      'Scalability, state management, and separation of concerns',
      'Performance optimization and common pitfalls',
      'Testing and error handling strategies'
    ];

    let questionText = `To begin our assessment for the ${job.title} role, could you explain how you design and structure applications utilizing ${primarySkill}? Walk us through the architectural patterns, trade-offs, and state or resource management strategies you apply.`;

    const relevantProject = (candidateProfile?.projects || []).find(p =>
      p.name && (
        p.description?.toLowerCase().includes(primarySkill.toLowerCase()) ||
        p.technologies?.some(t => t.toLowerCase().includes(primarySkill.toLowerCase()))
      )
    ) || (candidateProfile?.projects || [])[0];

    if (relevantProject) {
      questionText = `Based on your resume background highlighting "${relevantProject.name}", could you walk us through how you applied ${primarySkill} in that system, detailing your architectural choices, state management, and key performance trade-offs for the ${job.title} role?`;
    }

    return {
      questionText,
      skill: primarySkill,
      difficulty: minLevel,
      expectedConcepts: concepts,
      expectedKeyPoints: concepts,
      context: `Initial foundational evaluation for ${primarySkill} under ${job.title}`
    };
  }

  _fallbackEvaluation(job, currentQuestion, answer, skillScores, questionIndex, maxQuestions, skillStats = {}) {
    const wordCount = answer.trim().split(/\s+/).length;
    let baseScore = 5;

    // Evaluate depth by length & content heuristics
    if (wordCount >= 35) baseScore += 1;
    if (wordCount >= 70) baseScore += 1;
    if (wordCount >= 110) baseScore += 1;
    if (wordCount < 15) baseScore -= 2;

    const lowerAnswer = answer.toLowerCase();
    const generalKeyTerms = [
      'architecture', 'trade-off', 'performance', 'scalability', 'security',
      'test', 'error', 'pattern', 'async', 'data', 'consensus', 'leader',
      'distributed', 'algorithm', 'state', 'quorum', 'network', 'fault',
      'replication', 'log', 'failover', 'partition', 'resilience', 'cache'
    ];
    const matchedTerms = generalKeyTerms.filter(t => lowerAnswer.includes(t));
    if (matchedTerms.length >= 3) baseScore += 2;
    else if (matchedTerms.length >= 1) baseScore += 1;

    const expectedConcepts = (Array.isArray(currentQuestion.expectedConcepts) && currentQuestion.expectedConcepts.length > 0)
      ? currentQuestion.expectedConcepts
      : (Array.isArray(currentQuestion.expectedKeyPoints) && currentQuestion.expectedKeyPoints.length > 0
          ? currentQuestion.expectedKeyPoints
          : [`Core principles of ${currentQuestion.skill}`, 'Production resilience', 'Tradeoff awareness']);

    const finalScore = Math.min(10, Math.max(1, baseScore));

    // Run deterministic concept matching and scoring
    const deterministicEval = adaptiveLogicService.calculateDeterministicEvaluation({
      question: currentQuestion.questionText,
      candidateAnswer: answer,
      expectedConcepts,
      rawCorrectness: finalScore * 10,
      rawMatchedConcepts: [],
      rawEvidence: [answer.slice(0, 140)],
      rawExplanation: finalScore >= 7
        ? `Strong response showing sound understanding of ${currentQuestion.skill}.`
        : `Demonstrated foundational familiarity with ${currentQuestion.skill}.`
    });

    const updatedSkillScores = {
      ...skillScores,
      [currentQuestion.skill]: finalScore
    };

    const isInterviewComplete = questionIndex >= maxQuestions;
    let nextQuestion = null;
    let adaptiveDecision = null;

    if (!isInterviewComplete) {
      const skills = (job.requiredSkills || []).map(s => (typeof s === 'string' ? s : s.name));
      if (skills.length === 0) skills.push(currentQuestion.skill || 'General Technical');

      adaptiveDecision = adaptiveLogicService.selectNextAdaptiveSkillAndDifficulty({
        skills,
        currentSkill: currentQuestion.skill,
        currentDifficulty: currentQuestion.difficulty,
        status: finalScore >= 7 ? 'correct' : (finalScore >= 4 ? 'partially_correct' : 'incorrect_or_unclear'),
        skillStats,
        roundNumber: questionIndex,
        totalRounds: maxQuestions
      });

      nextQuestion = this._generateAlgorithmicQuestion(
        adaptiveDecision.nextSkill,
        adaptiveDecision.canonicalDifficulty,
        adaptiveDecision.reason
      );
    }

    return {
      evaluation: {
        score: finalScore,
        compositeScore: deterministicEval.score,
        correctnessScore: deterministicEval.correctnessScore,
        completenessScore: deterministicEval.completenessScore,
        status: deterministicEval.status,
        skill: currentQuestion.skill,
        feedback: finalScore >= 7
          ? `Strong response showing sound understanding of ${currentQuestion.skill}. Answer demonstrated practical insights and structured reasoning.`
          : `Demonstrated foundational familiarity with ${currentQuestion.skill}, but lacked deeper consideration of trade-offs, edge-cases, and production resilience.`,
        strengths: finalScore >= 7
          ? ['Clear technical articulation', 'Awareness of production best practices']
          : ['Addressed the core concept'],
        weaknesses: finalScore >= 7
          ? ['Could have elaborated more on failover strategies']
          : ['Needs more specific architectural examples and deeper rationale'],
        conceptualAccuracy: finalScore,
        depthScore: Math.min(10, finalScore + (wordCount > 50 ? 1 : -1)),
        communicationScore: Math.min(10, Math.max(3, wordCount > 30 ? 8 : 5)),
        matchedConcepts: deterministicEval.matchedConcepts,
        missingConcepts: deterministicEval.missingConcepts,
        evidence: deterministicEval.evidence
      },
      updatedSkillScores,
      isInterviewComplete,
      adaptiveDecision,
      nextQuestion
    };
  }

  _fallbackReport(job, interview, qaList, integrityEvents) {
    const scores = qaList.map(item => item.evaluation?.score || 5);
    const avgScoreOutOf10 = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 6;
    const overallScore = Math.round(avgScoreOutOf10 * 10);

    // Calculate integrity deductions
    let integrityScore = 100;
    for (const evt of integrityEvents) {
      if (evt.severity === 'high') integrityScore -= 20;
      else if (evt.severity === 'medium') integrityScore -= 10;
      else integrityScore -= 5;
    }
    integrityScore = Math.max(0, integrityScore);

    // Skill breakdown
    const skillMap = {};
    qaList.forEach(item => {
      const skill = item.question?.skill || 'General';
      const score = (item.evaluation?.score || 5) * 10;
      if (!skillMap[skill]) skillMap[skill] = [];
      skillMap[skill].push(score);
    });

    const skillBreakdown = Object.entries(skillMap).map(([skill, sList]) => {
      const mean = Math.round(sList.reduce((a, b) => a + b, 0) / sList.length);
      return {
        skill,
        score: mean,
        weight: 1,
        levelDemonstrated: mean >= 80 ? 'advanced' : mean >= 60 ? 'intermediate' : 'beginner',
        feedback: mean >= 70
          ? `Consistently demonstrated strong problem-solving and domain competence in ${skill}.`
          : `Requires further structured practice and depth in ${skill}.`
      };
    });

    // Skill gap report
    const skillGaps = (job.requiredSkills || []).map(reqSkill => {
      const found = skillBreakdown.find(sb => sb.skill.toLowerCase() === reqSkill.name.toLowerCase());
      const candidateScore = found ? found.score : 60;
      const targetScore = reqSkill.minimumLevel === 'advanced' ? 85 : reqSkill.minimumLevel === 'intermediate' ? 65 : 50;
      const gapScore = Math.max(0, targetScore - candidateScore);

      return {
        name: reqSkill.name,
        requiredLevel: reqSkill.minimumLevel,
        candidateLevel: candidateScore >= 80 ? 'advanced' : candidateScore >= 60 ? 'intermediate' : 'beginner',
        score: candidateScore,
        gapScore,
        recommendations: gapScore > 0
          ? [`Focus on advanced architectural trade-offs in ${reqSkill.name}`, `Review production incident postmortems`]
          : [`Demonstrates proficiency matching or exceeding team requirements`]
      };
    });

    let recommendation = 'lean_hire';
    if (overallScore >= 85 && integrityScore >= 80) recommendation = 'strong_hire';
    else if (overallScore >= 70 && integrityScore >= 70) recommendation = 'hire';
    else if (overallScore < 50 || integrityScore < 50) recommendation = 'no_hire';

    return {
      overallScore,
      summary: `Candidate demonstrated ${overallScore >= 70 ? 'solid' : 'mixed'} technical capability across evaluated competencies for the role of ${job.title}. Communication was structured and showed progressive adaptation to difficulty shifts.`,
      strengths: [
        'Structured problem decomposition and methodical approach',
        'Demonstrated practical familiarity with core stack fundamentals'
      ],
      areasForImprovement: [
        'Could provide deeper quantitative trade-off analysis during design decisions',
        'Strengthen edge-case test coverage reasoning'
      ],
      skillBreakdown,
      skillGapReport: {
        readinessScore: overallScore,
        summary: `Analysis of candidate skills against required thresholds for ${job.title}.`,
        skills: skillGaps
      },
      integrityScore,
      integrityIncidentCount: integrityEvents.length,
      recommendation
    };
  }

  /**
   * Extracts structured candidate profile from raw resume text
   */
  async extractResumeProfile(rawResumeText) {
    if (this.client) {
      const systemInstruction = `You are an expert technical talent intelligence analyzer.
Extract factual information from the candidate's uploaded resume text into clean, structured JSON.
Do not invent facts, skills, or employment history not present in the text.`;

      const prompt = `Analyze this resume text and extract the structured candidate profile:

--- RESUME TEXT ---
${(rawResumeText || '').slice(0, 30000)}
--- END RESUME TEXT ---

Return a JSON object matching this exact structure:
{
  "headline": "A concise professional title (e.g., Staff Backend Engineer)",
  "summary": "2-3 sentence overview of their technical background and focus",
  "experienceYears": 5,
  "skills": ["Skill 1", "Skill 2"],
  "technologies": ["Tool 1", "Framework 1"],
  "workExperience": [
    {
      "company": "Company Name",
      "role": "Title",
      "period": "Start - End Date",
      "description": "Core responsibilities and system scope",
      "highlights": ["Notable achievement or architectural impact"]
    }
  ],
  "education": [
    {
      "institution": "University / Institution",
      "degree": "Degree / Field of study",
      "year": "Graduation Year"
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "description": "Overview of technical implementation",
      "technologies": ["Go", "Kafka"]
    }
  ]
}`;

      try {
        const parsed = await this._callGemini(systemInstruction, prompt);
        return this._sanitizeExtractedProfile(parsed);
      } catch (err) {
        logger.warn(`Gemini resume extraction call failed: ${err.message}`);
        if (process.env.NODE_ENV === 'production') {
          throw err;
        }
      }
    }

    return this.fallbackExtractResumeProfile(rawResumeText);
  }

  _sanitizeExtractedProfile(parsed = {}) {
    const headline = typeof parsed.headline === 'string' && parsed.headline.trim() ? parsed.headline.trim() : 'Software Engineer';
    const summary = typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : 'Technical professional with verified software engineering background.';
    const experienceYears = Number(parsed.experienceYears) > 0 && Number(parsed.experienceYears) < 60 ? Math.round(Number(parsed.experienceYears)) : 2;

    const skills = Array.isArray(parsed.skills)
      ? Array.from(new Set(parsed.skills.map(s => String(s).trim()).filter(Boolean)))
      : ['Software Engineering'];

    const technologies = Array.isArray(parsed.technologies)
      ? Array.from(new Set(parsed.technologies.map(t => String(t).trim()).filter(Boolean)))
      : skills.slice(0, 6);

    const workExperience = Array.isArray(parsed.workExperience)
      ? parsed.workExperience.map(w => ({
          company: String(w.company || 'Technology Company').trim(),
          role: String(w.role || headline).trim(),
          period: String(w.period || 'Recent').trim(),
          description: String(w.description || '').trim(),
          highlights: Array.isArray(w.highlights) ? w.highlights.map(h => String(h).trim()).filter(Boolean) : []
        }))
      : [];

    const education = Array.isArray(parsed.education)
      ? parsed.education.map(e => ({
          institution: String(e.institution || 'University / Institution').trim(),
          degree: String(e.degree || 'Computer Science').trim(),
          year: String(e.year || '').trim()
        }))
      : [];

    const projects = Array.isArray(parsed.projects)
      ? parsed.projects.map(p => ({
          name: String(p.name || 'System Project').trim(),
          description: String(p.description || '').trim(),
          technologies: Array.isArray(p.technologies) ? p.technologies.map(t => String(t).trim()).filter(Boolean) : []
        }))
      : [];

    return {
      headline,
      summary,
      experienceYears,
      skills: skills.length > 0 ? skills : ['Software Engineering', 'System Architecture', 'Problem Solving'],
      technologies,
      workExperience,
      education,
      projects
    };
  }

  fallbackExtractResumeProfile(rawText = '') {
    const text = String(rawText || '').trim();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // Heuristics for headline
    const headline = lines.find(l => /engineer|developer|architect|lead|manager|analyst|designer/i.test(l)) || 'Software Engineer';

    // Heuristics for experience years
    let experienceYears = 3;
    const expMatch = text.match(/(\d+)\+?\s*years?(?:\s+of)?(?:\s+experience)?/i);
    if (expMatch && parseInt(expMatch[1], 10) > 0 && parseInt(expMatch[1], 10) < 50) {
      experienceYears = parseInt(expMatch[1], 10);
    } else {
      const years = Array.from(text.matchAll(/\b(20\d{2}|19\d{2})\b/g)).map(m => parseInt(m[1], 10));
      if (years.length >= 2) {
        const span = Math.max(...years) - Math.min(...years);
        if (span > 0 && span < 40) experienceYears = span;
      }
    }

    // Common skills dictionary
    const knownSkillsList = [
      'JavaScript', 'TypeScript', 'Node.js', 'React', 'Vue', 'Next.js', 'Angular',
      'Python', 'Go', 'Golang', 'Java', 'C++', 'C#', 'Rust', 'Ruby', 'PHP',
      'Distributed Systems', 'Microservices', 'Kafka', 'RabbitMQ', 'Event-Driven Architecture',
      'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Cassandra', 'DynamoDB', 'Elasticsearch',
      'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'Terraform', 'CI/CD',
      'REST APIs', 'GraphQL', 'gRPC', 'WebSockets', 'SQL', 'NoSQL', 'Linux',
      'Git', 'System Design', 'Concurrency', 'High Availability', 'Raft Consensus'
    ];

    const detectedSkills = [];
    for (const skill of knownSkillsList) {
      const escaped = skill.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`(?:\\b|[^a-zA-Z0-9])${escaped}(?:\\b|[^a-zA-Z0-9])`, 'i');
      if (regex.test(text)) {
        detectedSkills.push(skill);
      }
    }

    // Projects extraction
    const projects = [];
    const projIndex = text.search(/projects?|notable projects/i);
    if (projIndex !== -1) {
      const projSection = text.slice(projIndex, projIndex + 800);
      const projLines = projSection.split(/\r?\n/).slice(1, 6).filter(l => l.length > 10);
      for (const line of projLines) {
        if (!/education|experience|skills|contact/i.test(line)) {
          projects.push({
            name: line.split(/[-:|]/)[0].trim().slice(0, 50),
            description: line.trim(),
            technologies: detectedSkills.slice(0, 3)
          });
          if (projects.length >= 3) break;
        }
      }
    }
    if (projects.length === 0) {
      projects.push({
        name: 'Distributed Systems & Cloud Services',
        description: 'Designed and deployed high-availability microservices with resilient data pipelines.',
        technologies: detectedSkills.slice(0, 3)
      });
    }

    // Work experience extraction
    const workExperience = [];
    const expIndex = text.search(/experience|work history|employment/i);
    if (expIndex !== -1) {
      const expSection = text.slice(expIndex, expIndex + 1200);
      const expLines = expSection.split(/\r?\n/).slice(1, 8).filter(l => l.length > 10);
      for (const line of expLines) {
        if (!/education|projects|skills|summary/i.test(line)) {
          workExperience.push({
            company: line.split(/[-–|]/)[0]?.trim() || 'Technology Company',
            role: headline,
            period: '2021 - Present',
            description: line.trim(),
            highlights: [line.trim()]
          });
          if (workExperience.length >= 2) break;
        }
      }
    }
    if (workExperience.length === 0) {
      workExperience.push({
        company: 'Enterprise Engineering',
        role: headline,
        period: `${Math.max(2020, new Date().getFullYear() - experienceYears)} - Present`,
        description: 'Engineered scalable services, optimized performance, and led system architecture reviews.',
        highlights: ['Designed reliable services and automated testing workflows']
      });
    }

    // Education extraction
    const education = [];
    if (/bachelor|master|b\.s\.|m\.s\.|phd|degree|university|college/i.test(text)) {
      education.push({
        institution: 'University / Institute of Technology',
        degree: /master|m\.s\./i.test(text) ? 'Master of Science in Computer Science' : 'Bachelor of Science in Computer Science',
        year: '2020'
      });
    }

    const summary = lines.slice(0, 4).join(' ').slice(0, 250) ||
      `Experienced professional with ${experienceYears}+ years focused on ${detectedSkills.slice(0, 3).join(', ')} and production engineering.`;

    return {
      headline,
      summary,
      experienceYears,
      skills: detectedSkills.length > 0 ? detectedSkills : ['Software Engineering', 'System Architecture', 'Problem Solving'],
      technologies: detectedSkills.slice(0, 8),
      workExperience,
      education,
      projects
    };
  }
}

module.exports = GeminiAIService;
