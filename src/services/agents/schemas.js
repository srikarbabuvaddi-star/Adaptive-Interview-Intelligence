const { z } = require('zod');
const { QUESTION_DIFFICULTY } = require('../../constants/interviewStatus');

// ========================================================
// 1. Interviewer Agent Schemas (Agent 1)
// ========================================================

const interviewerAgentInputSchema = z.object({
  job: z.object({
    id: z.string().optional(),
    title: z.string().min(1, 'Job title is required'),
    description: z.string().optional().default(''),
    requiredSkills: z.array(z.any()).default([]),
    experienceLevel: z.string().optional().default('Intermediate'),
    evaluationCriteria: z.array(z.string()).optional().default([])
  }),
  candidateProfile: z.object({
    headline: z.string().optional(),
    experienceYears: z.number().optional(),
    skills: z.array(z.string()).optional(),
    projects: z.array(z.any()).optional(),
    workExperience: z.array(z.any()).optional()
  }).optional().default({}),
  stage: z.enum(['initial', 'adaptive']).default('initial'),
  history: z.array(z.object({
    question: z.string(),
    skill: z.string(),
    difficulty: z.string(),
    answer: z.string().optional().default(''),
    evaluation: z.any().optional()
  })).optional().default([]),
  skillEvidence: z.object({
    skillStats: z.record(z.any()).optional().default({}),
    skillScores: z.record(z.any()).optional().default({}),
    targetNextSkill: z.string().optional(),
    targetDifficulty: z.string().optional()
  }).optional().default({}),
  questionIndex: z.number().int().min(1).default(1),
  maxQuestions: z.number().int().min(1).default(5)
});

const interviewerAgentOutputSchema = z.object({
  questionText: z.string().min(10, 'Question text must be at least 10 characters'),
  skill: z.string().min(1, 'Target skill is required'),
  difficulty: z.enum([
    QUESTION_DIFFICULTY.BEGINNER,
    QUESTION_DIFFICULTY.INTERMEDIATE,
    QUESTION_DIFFICULTY.ADVANCED
  ]).default(QUESTION_DIFFICULTY.INTERMEDIATE),
  questionType: z.enum([
    'conceptual',
    'scenario',
    'system_design',
    'coding_logic',
    'tradeoff'
  ]).default('scenario'),
  selectionRationale: z.string().min(5, 'Selection rationale must explain the adaptation'),
  expectedConcepts: z.array(z.string()).min(2, 'At least 2 expected concepts are required'),
  expectedKeyPoints: z.array(z.string()).optional().default([]),
  context: z.string().optional().default('')
});

// ========================================================
// 2. Answer Evaluation Agent Schemas (Agent 2)
// ========================================================

const answerEvaluationAgentInputSchema = z.object({
  question: z.object({
    id: z.string().optional(),
    questionText: z.string().min(1),
    skill: z.string().min(1),
    difficulty: z.string().optional().default('intermediate'),
    expectedConcepts: z.array(z.string()).optional().default([]),
    expectedKeyPoints: z.array(z.string()).optional().default([])
  }),
  answer: z.string().default(''),
  job: z.object({
    title: z.string().optional().default('Software Engineer'),
    description: z.string().optional().default(''),
    requiredSkills: z.array(z.any()).optional().default([])
  }).optional().default({}),
  candidateProfile: z.any().optional().default({}),
  previousQA: z.array(z.any()).optional().default([])
});

const answerEvaluationAgentOutputSchema = z.object({
  score: z.number().min(0).max(10), // Scaled 0 to 10
  correctnessScore: z.number().min(0).max(100),
  completenessScore: z.number().min(0).max(100),
  compositeScore: z.number().min(0).max(100),
  conceptualAccuracy: z.number().min(0).max(10),
  depthScore: z.number().min(0).max(10),
  communicationScore: z.number().min(0).max(10),
  status: z.enum(['correct', 'partially_correct', 'incorrect_or_unclear']),
  evidence: z.array(z.string()).default([]), // Verbatim citations from candidate
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  matchedConcepts: z.array(z.string()).default([]),
  missingConcepts: z.array(z.string()).default([]),
  feedback: z.string().default(''),
  explanation: z.string().default(''),
  skillsDemonstrated: z.array(z.string()).default([])
});

// ========================================================
// 3. Skill-Gap Analysis Agent Schemas (Agent 3)
// ========================================================

const skillGapAgentInputSchema = z.object({
  job: z.object({
    id: z.string().optional(),
    title: z.string().default('Software Engineer'),
    requiredSkills: z.array(z.any()).default([])
  }),
  candidateProfile: z.any().optional().default({}),
  evaluations: z.array(z.object({
    id: z.string().optional(),
    skill: z.string(),
    score: z.number(),
    status: z.string().optional(),
    evidence: z.array(z.string()).optional().default([]),
    matchedConcepts: z.array(z.string()).optional().default([]),
    missingConcepts: z.array(z.string()).optional().default([]),
    strengths: z.array(z.string()).optional().default([]),
    weaknesses: z.array(z.string()).optional().default([])
  })).default([]),
  roundNumber: z.number().int().optional().default(1),
  totalRounds: z.number().int().optional().default(5)
});

const skillGapAgentOutputSchema = z.object({
  demonstratedSkills: z.array(z.object({
    skill: z.string(),
    score: z.number(),
    level: z.string(),
    evidence: z.array(z.string())
  })).default([]),
  partiallyDemonstratedSkills: z.array(z.object({
    skill: z.string(),
    score: z.number(),
    level: z.string(),
    gaps: z.array(z.string())
  })).default([]),
  gapSkills: z.array(z.object({
    skill: z.string(),
    score: z.number(),
    missingConcepts: z.array(z.string()),
    description: z.string()
  })).default([]),
  unassessedSkills: z.array(z.object({
    skill: z.string(),
    requiredLevel: z.string(),
    recommendation: z.string()
  })).default([]),
  unverifiedClaims: z.array(z.string()).default([]),
  uncertaintyAreas: z.array(z.string()).default([]),
  recommendedNextSkill: z.string(),
  recommendedDifficulty: z.enum([
    QUESTION_DIFFICULTY.BEGINNER,
    QUESTION_DIFFICULTY.INTERMEDIATE,
    QUESTION_DIFFICULTY.ADVANCED
  ]),
  recommendationReason: z.string(),
  readinessScore: z.number().min(0).max(100),
  summary: z.string()
});

// ========================================================
// 4. Feedback & Career Coach Agent Schemas (Agent 4)
// ========================================================

const feedbackCoachAgentInputSchema = z.object({
  job: z.object({
    title: z.string(),
    description: z.string().optional().default(''),
    requiredSkills: z.array(z.any()).default([])
  }),
  candidate: z.any().optional().default({}),
  evaluations: z.array(z.any()).default([]),
  qaList: z.array(z.any()).default([]),
  skillGapReport: z.any().optional().default({}),
  integrityReport: z.any().optional().default({}),
  isCompleted: z.boolean().default(true)
});

const feedbackCoachAgentOutputSchema = z.object({
  overallScore: z.number().min(0).max(100),
  summary: z.string().min(10),
  evidenceBackedStrengths: z.array(z.object({
    point: z.string(),
    evidence: z.string().optional().default(''),
    skill: z.string().optional().default('General')
  })).default([]),
  evidenceBackedImprovements: z.array(z.object({
    point: z.string(),
    gap: z.string().optional().default(''),
    missingConcepts: z.array(z.string()).optional().default([]),
    skill: z.string().optional().default('General')
  })).default([]),
  learningPlan: z.array(z.object({
    skill: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
    recommendedAction: z.string(),
    studyTopics: z.array(z.string()),
    practiceQuestions: z.array(z.string())
  })).default([]),
  nextRoundInterviewProbes: z.array(z.object({
    topic: z.string(),
    question: z.string(),
    rationale: z.string()
  })).default([]),
  careerAdvice: z.string().default(''),
  objectiveVerdict: z.string().default('COMPLETED')
});

// ========================================================
// 5. Interview Integrity Review Agent Schemas (Agent 5)
// ========================================================

const integrityReviewAgentInputSchema = z.object({
  interviewId: z.string(),
  integrityEvents: z.array(z.object({
    id: z.string().optional(),
    eventType: z.string(),
    eventSource: z.string().optional(),
    metadata: z.any().optional(),
    severity: z.string().optional(),
    timestamp: z.any().optional()
  })).default([]),
  qaList: z.array(z.any()).optional().default([]),
  sessionDurationSeconds: z.number().optional().default(0)
});

const integrityReviewAgentOutputSchema = z.object({
  integrityScore: z.number().min(0).max(100),
  incidentCount: z.number().int().min(0),
  flags: z.array(z.object({
    eventType: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
    confidence: z.number().min(0).max(1),
    observedFact: z.string(),
    inferredRisk: z.string(),
    requiresHumanReview: z.boolean(),
    uncertainty: z.string()
  })).default([]),
  summary: z.string(),
  humanReviewRecommended: z.boolean(),
  verdict: z.enum(['CLEAN', 'REQUIRES_RECRUITER_REVIEW', 'SUSPICIOUS_ANOMALIES'])
});

module.exports = {
  interviewerAgentInputSchema,
  interviewerAgentOutputSchema,
  answerEvaluationAgentInputSchema,
  answerEvaluationAgentOutputSchema,
  skillGapAgentInputSchema,
  skillGapAgentOutputSchema,
  feedbackCoachAgentInputSchema,
  feedbackCoachAgentOutputSchema,
  integrityReviewAgentInputSchema,
  integrityReviewAgentOutputSchema
};
