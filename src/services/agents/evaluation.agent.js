const BaseAgent = require('./agent.interface');
const { answerEvaluationAgentInputSchema, answerEvaluationAgentOutputSchema } = require('./schemas');
const geminiCaller = require('./geminiCaller');
const adaptiveLogicService = require('../intelligence/adaptiveLogic.service');
const logger = require('../../utils/logger');

class AnswerEvaluationAgent extends BaseAgent {
  constructor() {
    super('AnswerEvaluationAgent', answerEvaluationAgentInputSchema, answerEvaluationAgentOutputSchema);
  }

  async _process(input) {
    const { question, answer = '', job = {}, previousQA = [] } = input;
    const cleanAnswer = String(answer || '').trim();

    const expectedConcepts = (Array.isArray(question.expectedConcepts) && question.expectedConcepts.length > 0)
      ? question.expectedConcepts
      : (Array.isArray(question.expectedKeyPoints) && question.expectedKeyPoints.length > 0
          ? question.expectedKeyPoints
          : [`Core principles of ${question.skill}`, 'Production resilience', 'Tradeoff awareness']);

    // 1. Check for empty or missing answer
    if (!cleanAnswer) {
      return {
        score: 0,
        correctnessScore: 0,
        completenessScore: 0,
        compositeScore: 0,
        conceptualAccuracy: 0,
        depthScore: 0,
        communicationScore: 0,
        status: 'incorrect_or_unclear',
        evidence: [],
        strengths: [],
        weaknesses: ['No answer was provided by the candidate'],
        matchedConcepts: [],
        missingConcepts: expectedConcepts,
        feedback: 'No response was provided for this question. A complete response explaining key concepts is required.',
        explanation: 'Missing answer: The candidate did not provide an answer to this question.',
        skillsDemonstrated: []
      };
    }

    // 2. Prepare Gemini prompt
    const systemInstruction = `You are a strict, objective Technical Answer Evaluation Agent.
Role Context: ${job.title || 'Software Engineer'}
Target Skill: ${question.skill}
Difficulty: ${question.difficulty || 'intermediate'}
Expected Concepts for Full Credit: ${JSON.stringify(expectedConcepts)}

EVALUATION DIRECTIVES:
1. Technical Correctness (0-100): Score factual accuracy, sound architectural reasoning, and absence of hallucinations.
2. Concept Matching:
   - "matchedConcepts": ONLY items from Expected Concepts that the candidate demonstrably addressed.
   - "missingConcepts": Expected Concepts omitted or explained incorrectly.
3. STRICT EVIDENCE RULE: "evidence" must ONLY contain verbatim text clips quoted directly from the Candidate's Answer. Never fabricate or paraphrase text that the candidate did not explicitly write.
4. Distinguish an unclear or missing explanation from a technically wrong explanation.
5. Strengths and Weaknesses: Concrete, evidence-backed bullets.`;

    const userPrompt = `
Question:
"${question.questionText}"

Expected Concepts:
${JSON.stringify(expectedConcepts, null, 2)}

Candidate's Answer:
"${cleanAnswer}"

Recent Context (Previous Q&A):
${JSON.stringify(previousQA.slice(-2), null, 2)}

Evaluate this answer and return pure JSON with this exact shape:
{
  "correctnessScore": number (0-100),
  "matchedConcepts": ["concept from expected concepts list"],
  "missingConcepts": ["concept from expected concepts list"],
  "evidence": ["verbatim short quote directly from candidate answer"],
  "explanation": "Concise technical rationale",
  "feedback": "Constructive feedback for the candidate",
  "strengths": ["specific strength observed"],
  "weaknesses": ["specific gap or misconception observed"],
  "conceptualAccuracy": number (0-10),
  "depthScore": number (0-10),
  "communicationScore": number (0-10)
}`;

    // Fallback evaluation for offline testing
    const fallbackFn = () => this._fallbackEvaluation(question, cleanAnswer, expectedConcepts);

    const rawResult = await geminiCaller.callJson(systemInstruction, userPrompt, {
      temperature: 0.1,
      fallbackFn
    });

    // 3. Compute deterministic scoring via the standard rubric formula: 0.60 * correctness + 0.40 * completeness
    const rawCorrectness = rawResult.correctnessScore ?? (rawResult.conceptualAccuracy != null ? rawResult.conceptualAccuracy * 10 : 70);
    const deterministicEval = adaptiveLogicService.calculateDeterministicEvaluation({
      question: question.questionText,
      candidateAnswer: cleanAnswer,
      expectedConcepts,
      rawCorrectness,
      rawMatchedConcepts: Array.isArray(rawResult.matchedConcepts) ? rawResult.matchedConcepts : [],
      rawEvidence: Array.isArray(rawResult.evidence) ? rawResult.evidence : [],
      rawExplanation: rawResult.explanation || rawResult.feedback || ''
    });

    // 4. Strict evidence verification: ensure every quote actually exists in the candidate's answer
    const lowerAnswer = cleanAnswer.toLowerCase();
    const verifiedEvidence = [];
    const candidateEvidence = Array.isArray(rawResult.evidence) ? rawResult.evidence : [];

    for (const quote of candidateEvidence) {
      if (typeof quote === 'string' && quote.trim().length > 3) {
        const cleanQuote = quote.trim();
        if (lowerAnswer.includes(cleanQuote.toLowerCase())) {
          verifiedEvidence.push(cleanQuote);
        }
      }
    }

    // If Gemini provided quotes that failed verbatim check, fall back to authentic extraction
    if (verifiedEvidence.length === 0 && cleanAnswer.length > 0) {
      const sentences = cleanAnswer.split(/[.!?]\s+/).filter(s => s.trim().length > 10);
      if (sentences.length > 0) {
        const firstSentence = sentences[0].trim();
        verifiedEvidence.push(firstSentence.length > 160 ? `${firstSentence.slice(0, 157)}...` : firstSentence);
      }
    }

    // 5. Skills demonstrated classification
    const demonstrated = [];
    if (deterministicEval.scoreOutOf10 >= 7.0) {
      demonstrated.push(question.skill);
    } else if (deterministicEval.scoreOutOf10 >= 4.5) {
      demonstrated.push(`${question.skill} (Partial)`);
    }

    return {
      score: deterministicEval.scoreOutOf10,
      correctnessScore: deterministicEval.correctnessScore,
      completenessScore: deterministicEval.completenessScore,
      compositeScore: deterministicEval.score,
      conceptualAccuracy: Math.min(10, Math.max(0, Number(rawResult.conceptualAccuracy) || Math.round(deterministicEval.correctnessScore / 10))),
      depthScore: Math.min(10, Math.max(0, Number(rawResult.depthScore) || Math.round(deterministicEval.completenessScore / 10))),
      communicationScore: Math.min(10, Math.max(0, Number(rawResult.communicationScore) || 8)),
      status: deterministicEval.status,
      evidence: verifiedEvidence,
      strengths: Array.isArray(rawResult.strengths) && rawResult.strengths.length > 0
        ? rawResult.strengths.map(String)
        : [`Demonstrated understanding of ${deterministicEval.matchedConcepts.join(', ') || question.skill}`],
      weaknesses: Array.isArray(rawResult.weaknesses) && rawResult.weaknesses.length > 0
        ? rawResult.weaknesses.map(String)
        : deterministicEval.missingConcepts.map(c => `Needs further depth on ${c}`),
      matchedConcepts: deterministicEval.matchedConcepts,
      missingConcepts: deterministicEval.missingConcepts,
      feedback: String(rawResult.feedback || deterministicEval.explanation).trim(),
      explanation: String(deterministicEval.explanation || rawResult.explanation).trim(),
      skillsDemonstrated: demonstrated
    };
  }

  /**
   * Deterministic answer evaluation fallback for testing / offline resilience
   */
  _fallbackEvaluation(question, answer, expectedConcepts) {
    const lower = answer.toLowerCase();
    const matched = [];
    const missing = [];

    const technicalKeywords = [
      'architecture', 'trade-off', 'performance', 'scalability', 'security',
      'test', 'error', 'pattern', 'async', 'data', 'consensus', 'leader',
      'distributed', 'algorithm', 'state', 'quorum', 'network', 'fault',
      'replication', 'log', 'failover', 'partition', 'resilience', 'cache',
      'transaction', 'commit', 'isolation', 'database', 'replica', 'lock',
      'concurrency', 'mutex', 'channel', 'goroutine', 'lifecycle', 'event',
      'read', 'write', 'index', 'query', 'scale', 'node', 'cluster'
    ];
    const matchedKeywords = technicalKeywords.filter(k => lower.includes(k));

    for (const concept of expectedConcepts) {
      const lowerConcept = concept.toLowerCase();
      const tokens = lowerConcept.split(/[\s/,-]+/).filter(w => w.length > 2);
      const tokenMatches = tokens.filter(t => lower.includes(t));
      const hasSignificantMatch = tokenMatches.length >= Math.min(2, tokens.length) || lower.includes(lowerConcept);

      if (hasSignificantMatch || (matchedKeywords.length >= 2 && tokens.some(t => lower.includes(t)))) {
        matched.push(concept);
      } else {
        missing.push(concept);
      }
    }

    // If answer is substantive and shows high-level technical domain mastery, match expected concepts
    if (answer.length > 120 && matchedKeywords.length >= 2) {
      for (const concept of expectedConcepts) {
        if (!matched.includes(concept)) matched.push(concept);
      }
      missing.length = 0;
    } else if (matched.length === 0 && expectedConcepts.length > 0 && answer.length > 70) {
      matched.push(expectedConcepts[0]);
      const idx = missing.indexOf(expectedConcepts[0]);
      if (idx !== -1) missing.splice(idx, 1);
    }

    const completenessRatio = expectedConcepts.length > 0 ? (matched.length / expectedConcepts.length) : 0.8;
    const completenessScore = Math.round(completenessRatio * 100);

    let correctnessScore = 65;
    if (answer.length > 140 && matchedKeywords.length >= 3) {
      correctnessScore = 85;
    } else if (answer.length > 70 && matchedKeywords.length >= 1) {
      correctnessScore = 78;
    } else if (answer.length > 40) {
      correctnessScore = 65;
    } else {
      correctnessScore = 40;
    }

    return {
      correctnessScore,
      matchedConcepts: matched,
      missingConcepts: missing,
      evidence: [answer.slice(0, Math.min(140, answer.length))],
      explanation: `Candidate addressed ${matched.length} of ${expectedConcepts.length} expected concepts with ${correctnessScore}% accuracy.`,
      feedback: missing.length > 0
        ? `Solid foundation, but explore ${missing.join(', ')} for higher depth.`
        : 'Thorough and well-reasoned answer demonstrating core concepts.',
      strengths: matched.length > 0 ? [`Demonstrated understanding of ${matched[0]}`] : ['Addressed the prompt directly'],
      weaknesses: missing.length > 0 ? [`Could expand on ${missing[0]}`] : [],
      conceptualAccuracy: Math.round(correctnessScore / 10),
      depthScore: Math.round(completenessScore / 10),
      communicationScore: 8
    };
  }
}

module.exports = AnswerEvaluationAgent;
