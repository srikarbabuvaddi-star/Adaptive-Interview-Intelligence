const BaseAgent = require('./agent.interface');
const { interviewerAgentInputSchema, interviewerAgentOutputSchema } = require('./schemas');
const geminiCaller = require('./geminiCaller');
const adaptiveLogicService = require('../intelligence/adaptiveLogic.service');
const { QUESTION_DIFFICULTY } = require('../../constants/interviewStatus');
const logger = require('../../utils/logger');

class InterviewerAgent extends BaseAgent {
  constructor() {
    super('InterviewerAgent', interviewerAgentInputSchema, interviewerAgentOutputSchema);
  }

  async _process(input) {
    const { job, candidateProfile, stage, history = [], skillEvidence = {}, questionIndex = 1, maxQuestions = 5 } = input;

    const skills = (job.requiredSkills || []).map(s => (typeof s === 'string' ? s : s.name)).filter(Boolean);
    if (skills.length === 0) skills.push('Software Engineering');

    // Determine target skill and difficulty
    let targetSkill = skillEvidence.targetNextSkill;
    let targetDifficulty = skillEvidence.targetDifficulty;
    let selectionReason = 'Initial question based on job requirements and candidate profile';

    if (!targetSkill) {
      if (history.length === 0 || stage === 'initial') {
        targetSkill = skills[0];
        const exp = (job.experienceLevel || candidateProfile.headline || '').toLowerCase();
        if (exp.includes('junior') || exp.includes('entry') || exp.includes('intern')) {
          targetDifficulty = QUESTION_DIFFICULTY.BEGINNER;
        } else if (exp.includes('senior') || exp.includes('lead') || exp.includes('principal') || (candidateProfile.experienceYears && candidateProfile.experienceYears >= 5)) {
          targetDifficulty = QUESTION_DIFFICULTY.ADVANCED;
        } else {
          targetDifficulty = QUESTION_DIFFICULTY.INTERMEDIATE;
        }
        selectionReason = `Opening question for ${targetSkill} calibrated to ${targetDifficulty} difficulty.`;
      } else {
        const lastQA = history[history.length - 1];
        const lastScore = lastQA?.evaluation?.score ?? 5;
        const lastStatus = lastScore >= 7.5 ? 'correct' : (lastScore >= 4 ? 'partially_correct' : 'incorrect_or_unclear');

        const adaptiveDecision = adaptiveLogicService.selectNextAdaptiveSkillAndDifficulty({
          skills,
          currentSkill: lastQA?.skill || skills[0],
          currentDifficulty: lastQA?.difficulty || QUESTION_DIFFICULTY.INTERMEDIATE,
          status: lastStatus,
          skillStats: skillEvidence.skillStats || {},
          roundNumber: questionIndex,
          totalRounds: maxQuestions
        });

        targetSkill = adaptiveDecision.nextSkill;
        targetDifficulty = adaptiveDecision.canonicalDifficulty;
        selectionReason = `${adaptiveDecision.action}: ${adaptiveDecision.reason}`;
      }
    }

    // Normalize canonical difficulty
    if (targetDifficulty === 'easy') targetDifficulty = QUESTION_DIFFICULTY.BEGINNER;
    if (targetDifficulty === 'medium') targetDifficulty = QUESTION_DIFFICULTY.INTERMEDIATE;
    if (targetDifficulty === 'hard') targetDifficulty = QUESTION_DIFFICULTY.ADVANCED;
    if (![QUESTION_DIFFICULTY.BEGINNER, QUESTION_DIFFICULTY.INTERMEDIATE, QUESTION_DIFFICULTY.ADVANCED].includes(targetDifficulty)) {
      targetDifficulty = QUESTION_DIFFICULTY.INTERMEDIATE;
    }

    // Select suitable question type
    let questionType = 'scenario';
    if (targetDifficulty === QUESTION_DIFFICULTY.ADVANCED) {
      questionType = (questionIndex % 2 === 0) ? 'system_design' : 'tradeoff';
    } else if (targetDifficulty === QUESTION_DIFFICULTY.BEGINNER) {
      questionType = (questionIndex === 1) ? 'conceptual' : 'scenario';
    } else {
      questionType = (questionIndex % 2 === 1) ? 'scenario' : 'coding_logic';
    }

    // Prepare candidate background context
    let candidateContext = '';
    if (candidateProfile) {
      const parts = [];
      if (candidateProfile.headline) parts.push(`Headline: ${candidateProfile.headline}`);
      if (candidateProfile.experienceYears) parts.push(`Experience: ${candidateProfile.experienceYears} years`);
      if (candidateProfile.skills?.length) parts.push(`Claimed Skills: ${candidateProfile.skills.join(', ')}`);
      if (candidateProfile.projects?.length) {
        const pSummary = candidateProfile.projects.map(p => typeof p === 'string' ? p : `${p.name}: ${p.description || ''}`).slice(0, 3).join('; ');
        parts.push(`Key Projects: ${pSummary}`);
      }
      if (parts.length > 0) {
        candidateContext = `\nCandidate Background:\n- ${parts.join('\n- ')}`;
      }
    }

    // History and anti-repetition context
    const previousQuestions = history.map(h => h.question);
    const historySummary = history.map((h, i) =>
      `Q${i + 1} (${h.skill}, ${h.difficulty}): "${h.question}" | Ans: "${(h.answer || '').slice(0, 100)}..." | Score: ${h.evaluation?.score ?? 'N/A'}`
    ).join('\n');

    const systemInstruction = `You are an elite Adaptive Technical Interviewer Agent.
Role: ${job.title}
Job Description: ${job.description || 'N/A'}
Required Skills: ${skills.join(', ')}
Evaluation Criteria: ${(job.evaluationCriteria || []).join(', ') || 'Technical proficiency and practical problem solving'}${candidateContext}

Interview Progress: Question ${questionIndex} of ${maxQuestions} (Remaining: ${Math.max(0, maxQuestions - questionIndex)}).
Stage: ${stage}
Target Skill: ${targetSkill}
Target Difficulty: ${targetDifficulty}
Question Type: ${questionType}
Selection Rationale: ${selectionReason}

Guidelines:
1. Generate ONE focused, realistic technical interview question testing "${targetSkill}" at "${targetDifficulty}" difficulty.
2. The question style must be "${questionType}".
3. NEVER repeat or rephrase any previous question.
4. If candidate history is provided, build on what they have already proven or failed to answer.
5. Provide 3-5 core expected technical concepts required in a complete, high-quality answer.`;

    const userPrompt = `
Previously Asked Questions (DO NOT REPEAT):
${previousQuestions.length > 0 ? previousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n') : 'None (First question)'}

Interview History & Evaluations so far:
${historySummary || 'None'}

Generate the next question as a pure JSON object with this exact shape:
{
  "questionText": "Direct, realistic technical question",
  "skill": "${targetSkill}",
  "difficulty": "${targetDifficulty}",
  "questionType": "${questionType}",
  "selectionRationale": "${selectionReason}",
  "expectedConcepts": ["concept 1", "concept 2", "concept 3"],
  "expectedKeyPoints": ["concept 1", "concept 2", "concept 3"],
  "context": "Context or architectural scope"
}`;

    // Fallback question generator for test / offline execution
    const fallbackFn = () => this._generateDeterministicQuestion({
      targetSkill,
      targetDifficulty,
      questionType,
      selectionReason,
      questionIndex,
      previousQuestions,
      job
    });

    const aiResult = await geminiCaller.callJson(systemInstruction, userPrompt, {
      temperature: 0.2,
      fallbackFn
    });

    // Sanitize and validate
    const concepts = (Array.isArray(aiResult.expectedConcepts) && aiResult.expectedConcepts.length >= 2)
      ? aiResult.expectedConcepts.map(String)
      : (Array.isArray(aiResult.expectedKeyPoints) && aiResult.expectedKeyPoints.length >= 2
          ? aiResult.expectedKeyPoints.map(String)
          : [
              `Core principles and paradigms of ${targetSkill}`,
              'Scalability and error recovery trade-offs',
              'Production observability and edge case handling'
            ]);

    return {
      questionText: String(aiResult.questionText || fallbackFn().questionText).trim(),
      skill: String(aiResult.skill || targetSkill).trim(),
      difficulty: targetDifficulty,
      questionType: ['conceptual', 'scenario', 'system_design', 'coding_logic', 'tradeoff'].includes(aiResult.questionType)
        ? aiResult.questionType
        : questionType,
      selectionRationale: String(aiResult.selectionRationale || selectionReason).trim(),
      expectedConcepts: concepts,
      expectedKeyPoints: concepts,
      context: String(aiResult.context || selectionReason).trim()
    };
  }

  /**
   * Deterministic algorithmic question formulation for offline tests and resilience
   */
  _generateDeterministicQuestion({ targetSkill, targetDifficulty, questionType, selectionReason, questionIndex, previousQuestions = [], job }) {
    const templates = {
      [QUESTION_DIFFICULTY.BEGINNER]: [
        {
          q: `Explain the fundamental architecture and lifecycle of ${targetSkill}. What problem does it solve and what are its primary components?`,
          concepts: [`Core architecture of ${targetSkill}`, 'Lifecycle mechanisms', 'Key advantages and limitations']
        },
        {
          q: `How do you handle error states and input validation when working with ${targetSkill} in a standard application?`,
          concepts: ['Input validation patterns', 'Graceful error handling', 'State recovery']
        }
      ],
      [QUESTION_DIFFICULTY.INTERMEDIATE]: [
        {
          q: `Describe how you would implement concurrency, asynchronous workflows, or state synchronization using ${targetSkill}. What race conditions or bottlenecks must you mitigate?`,
          concepts: ['Concurrency/Asynchrony model', 'Race condition prevention', 'Resource cleanup and throughput']
        },
        {
          q: `Walk through an issue you encountered in production involving ${targetSkill} regarding latency or data consistency, and how you debugged and resolved it.`,
          concepts: ['Root cause diagnosis', 'Performance profiling', 'Resilient mitigation strategy']
        }
      ],
      [QUESTION_DIFFICULTY.ADVANCED]: [
        {
          q: `Design a high-throughput, fault-tolerant distributed system using ${targetSkill}. How do you ensure high availability, partition tolerance, and eventual consistency under peak loads?`,
          concepts: ['Partition tolerance strategies', 'Consensus / replication guarantees', 'Backpressure and degradation handling']
        },
        {
          q: `What are the critical architectural trade-offs between memory footprint, serialization overhead, and network I/O when scaling ${targetSkill} across multiple clusters?`,
          concepts: ['Memory and allocation optimization', 'Serialization tradeoffs', 'Clustering and network topology']
        }
      ]
    };

    const diffTemplates = templates[targetDifficulty] || templates[QUESTION_DIFFICULTY.INTERMEDIATE];
    // Find a template question not already asked
    let chosen = diffTemplates.find(t => !previousQuestions.some(pq => pq.includes(targetSkill) && pq.includes(t.q.slice(0, 30))));
    if (!chosen) chosen = diffTemplates[(questionIndex - 1) % diffTemplates.length];

    return {
      questionText: chosen.q,
      skill: targetSkill,
      difficulty: targetDifficulty,
      questionType,
      selectionRationale: selectionReason,
      expectedConcepts: chosen.concepts,
      expectedKeyPoints: chosen.concepts,
      context: `Deterministic formulation for ${job.title} round ${questionIndex}`
    };
  }

  /**
   * Executes InterviewerAgent leveraging authorized MCP client tools
   * Uses get_interview_context and get_candidate_skill_profile to formulate next question
   */
  async executeWithMcp({ mcpClient, interviewId, maxQuestions = 5 }) {
    if (!mcpClient || !interviewId) {
      throw new Error('executeWithMcp requires an initialized mcpClient and interviewId');
    }

    // 1. Retrieve authorized interview context over MCP
    const context = await mcpClient.getInterviewContext({ interviewId });

    // 2. Fetch candidate skill profile over MCP
    let candidateProfile = {};
    try {
      const profile = await mcpClient.getCandidateSkillProfile();
      candidateProfile = {
        skills: profile.claimedSkills || [],
        headline: profile.headline || '',
        experienceYears: profile.experienceYears || null,
        demonstratedSkills: profile.demonstratedSkills || []
      };
    } catch (profileErr) {
      logger.warn(`[InterviewerAgent] MCP Profile fetch warning: ${profileErr.message}`);
    }

    // 3. Format history for adaptive questioning
    const history = (context.history || []).map(h => ({
      question: h.questionText,
      skill: h.skill,
      difficulty: h.difficulty,
      answer: h.answerText || '',
      evaluation: h.score !== null ? { score: h.score, feedback: h.feedback } : undefined
    }));

    const stage = history.length === 0 ? 'initial' : 'adaptive';
    const questionIndex = context.currentQuestionIndex || (history.length + 1);

    return this.execute({
      job: {
        id: context.jobId,
        title: context.jobTitle,
        description: context.jobDescription,
        requiredSkills: context.requiredSkills
      },
      candidateProfile,
      stage,
      history,
      skillEvidence: context.adaptiveState || {},
      questionIndex,
      maxQuestions: context.totalQuestions || maxQuestions
    });
  }
}

module.exports = InterviewerAgent;
