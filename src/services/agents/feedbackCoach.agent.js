const BaseAgent = require('./agent.interface');
const { feedbackCoachAgentInputSchema, feedbackCoachAgentOutputSchema } = require('./schemas');
const geminiCaller = require('./geminiCaller');
const ApiError = require('../../utils/apiError');
const logger = require('../../utils/logger');

class FeedbackCoachAgent extends BaseAgent {
  constructor() {
    super('FeedbackCoachAgent', feedbackCoachAgentInputSchema, feedbackCoachAgentOutputSchema);
  }

  async _process(input) {
    const { job, candidate = {}, evaluations = [], qaList = [], skillGapReport = {}, integrityReport = {}, isCompleted = true } = input;

    // Enforce completion state
    if (!isCompleted) {
      throw ApiError.badRequest('Feedback and Career Coach Agent can only generate final reports for completed interview sessions');
    }

    // 1. Calculate overall measured score from authentic evaluations
    const validScores = evaluations
      .map(e => (typeof e.score === 'number' ? e.score : (typeof e.compositeScore === 'number' ? e.compositeScore / 10 : null)))
      .filter(s => s !== null);

    let averageScore = 5.0;
    if (validScores.length > 0) {
      averageScore = validScores.reduce((a, b) => a + b, 0) / validScores.length;
    }
    const overallScore = Math.min(100, Math.max(0, Math.round(averageScore * 10)));

    // 2. Synthesize evidence-backed strengths and improvement areas
    const evidenceBackedStrengths = [];
    const evidenceBackedImprovements = [];

    for (const item of qaList) {
      const q = item.question || {};
      const ev = item.evaluation || {};
      const ans = item.answer || {};
      const score = typeof ev.score === 'number' ? ev.score : 5;

      const evidenceExcerpt = (Array.isArray(ev.evidence) && ev.evidence[0])
        ? String(ev.evidence[0])
        : (ans.answerText ? String(ans.answerText).slice(0, 140) : '');

      if (score >= 7.0) {
        const strengthPoint = Array.isArray(ev.strengths) && ev.strengths[0]
          ? String(ev.strengths[0])
          : `Demonstrated technical proficiency in ${q.skill || 'the target domain'}`;

        evidenceBackedStrengths.push({
          point: strengthPoint,
          evidence: evidenceExcerpt ? `Candidate stated: "${evidenceExcerpt}"` : 'Demonstrated in answer explanation',
          skill: q.skill || 'General Technical'
        });
      } else {
        const gapPoint = Array.isArray(ev.weaknesses) && ev.weaknesses[0]
          ? String(ev.weaknesses[0])
          : `Needs additional depth in ${q.skill || 'the target domain'}`;

        evidenceBackedImprovements.push({
          point: gapPoint,
          gap: `Scored ${score.toFixed(1)}/10 on question ${q.questionIndex || ''}`,
          missingConcepts: Array.isArray(ev.missingConcepts) ? ev.missingConcepts.map(String) : [],
          skill: q.skill || 'General Technical'
        });
      }
    }

    // If no strengths found from above, supply baseline observation
    if (evidenceBackedStrengths.length === 0) {
      evidenceBackedStrengths.push({
        point: 'Completed interview assessment across multiple technical rounds',
        evidence: `Candidate submitted answers to ${evaluations.length} technical prompts`,
        skill: job.title || 'General'
      });
    }

    // 3. Construct prioritized learning plan
    const gapSkills = skillGapReport.gapSkills || [];
    const partialSkills = skillGapReport.partiallyDemonstratedSkills || [];
    const demonstratedSkills = skillGapReport.demonstratedSkills || [];

    const learningPlan = [];

    // High priority: Deficient skills / major gaps
    for (const gap of gapSkills) {
      learningPlan.push({
        skill: gap.skill,
        priority: 'high',
        recommendedAction: `Focus immediately on core fundamentals and execution correctness in ${gap.skill}.`,
        studyTopics: gap.missingConcepts && gap.missingConcepts.length > 0
          ? gap.missingConcepts
          : [`${gap.skill} core concepts`, 'Production failure modes', 'Error recovery'],
        practiceQuestions: [
          `How would you diagnose and recover from a failure in ${gap.skill}?`,
          `Explain the architectural lifecycle and execution flow of ${gap.skill}.`
        ]
      });
    }

    // Medium priority: Partially demonstrated skills
    for (const partial of partialSkills) {
      learningPlan.push({
        skill: partial.skill,
        priority: 'medium',
        recommendedAction: `Deepen knowledge in architectural trade-offs, edge cases, and high-load scenarios for ${partial.skill}.`,
        studyTopics: partial.gaps && partial.gaps.length > 0
          ? partial.gaps
          : [`${partial.skill} optimization`, 'Concurrency and state synchronization'],
        practiceQuestions: [
          `What are the performance trade-offs when scaling ${partial.skill}?`,
          `How do you ensure data consistency under network partitions when using ${partial.skill}?`
        ]
      });
    }

    // Low priority: Mastery of demonstrated skills
    for (const dem of demonstratedSkills) {
      learningPlan.push({
        skill: dem.skill,
        priority: 'low',
        recommendedAction: `Maintain mastery in ${dem.skill} by exploring advanced system design patterns and benchmarking.`,
        studyTopics: [`${dem.skill} kernel / internal mechanisms`, 'Zero-downtime migrations'],
        practiceQuestions: [
          `How would you architect a globally distributed cluster using ${dem.skill}?`
        ]
      });
    }

    // Ensure at least one learning plan entry exists
    if (learningPlan.length === 0) {
      learningPlan.push({
        skill: job.title || 'Software Engineering',
        priority: 'medium',
        recommendedAction: 'Continue hands-on system building and peer code reviews.',
        studyTopics: ['System Design', 'Concurrency & Fault Tolerance', 'Clean Architecture'],
        practiceQuestions: ['Explain the trade-offs between eventual consistency and strong consistency in distributed databases.']
      });
    }

    // 4. Construct Next Round Interview Probes
    const nextRoundInterviewProbes = [];
    if (gapSkills.length > 0) {
      nextRoundInterviewProbes.push({
        topic: gapSkills[0].skill,
        question: `In your previous technical assessment, you encountered difficulties with ${gapSkills[0].missingConcepts?.join(', ') || gapSkills[0].skill}. Can you walk us through how you would approach this problem in a live production environment?`,
        rationale: `Directly probes the identified gap in ${gapSkills[0].skill} to determine if it was an interview artifact or a persistent knowledge deficit.`
      });
    }
    if (partialSkills.length > 0) {
      nextRoundInterviewProbes.push({
        topic: partialSkills[0].skill,
        question: `How would you handle unexpected latency spikes or service degradation in ${partialSkills[0].skill}?`,
        rationale: `Probes candidate's ability to reason about production operations beyond surface-level syntax.`
      });
    }
    if (nextRoundInterviewProbes.length === 0) {
      nextRoundInterviewProbes.push({
        topic: 'System Architecture & Scaling',
        question: 'Can you describe the most challenging technical tradeoff you made in your recent project and what you learned from its outcome?',
        rationale: 'Evaluates senior engineering judgment and architectural decision-making.'
      });
    }

    // 5. Synthesize report via Gemini if available, or generate deterministic coach feedback
    const systemInstruction = `You are a Principal Career Coach and Senior Technical Interview Reviewer.
Job Role: ${job.title}
Interview Score: ${overallScore}/100.
Evaluations: ${JSON.stringify(evaluations.slice(0, 5))}

Coach Guidelines:
1. Provide an executive summary of the candidate's demonstrated technical competencies.
2. Provide constructive, practical career advice.
3. Be clear, encouraging, and strictly evidence-grounded. Do not make exaggerated claims about hiring outcomes or job guarantees.`;

    const userPrompt = `
Synthesize personalized career feedback for this candidate:
- Overall Score: ${overallScore}/100
- Strengths: ${JSON.stringify(evidenceBackedStrengths.map(s => s.point))}
- Areas for Improvement: ${JSON.stringify(evidenceBackedImprovements.map(i => i.point))}
- Learning Plan Topics: ${JSON.stringify(learningPlan.map(l => l.skill))}

Return pure JSON with this exact shape:
{
  "summary": "Concise 2-3 sentence executive evaluation of the candidate's performance",
  "careerAdvice": "Practical 2-3 sentence coaching advice tailored to their growth areas",
  "objectiveVerdict": "COMPLETED"
}`;

    const fallbackFn = () => ({
      summary: `Candidate demonstrated solid foundational knowledge across evaluated competencies for ${job.title}, achieving an overall score of ${overallScore}/100 with clear evidence of problem-solving ability.`,
      careerAdvice: `Focus your preparation on hands-on system resilience, edge-case mitigation, and deeper architectural trade-offs in ${learningPlan[0]?.skill || 'the target skills'}. Regular practice with mock system design will accelerate your senior engineering journey.`,
      objectiveVerdict: 'COMPLETED'
    });

    const aiResult = await geminiCaller.callJson(systemInstruction, userPrompt, {
      temperature: 0.2,
      fallbackFn
    });

    return {
      overallScore,
      summary: String(aiResult.summary || fallbackFn().summary).trim(),
      evidenceBackedStrengths,
      evidenceBackedImprovements,
      learningPlan,
      nextRoundInterviewProbes,
      careerAdvice: String(aiResult.careerAdvice || fallbackFn().careerAdvice).trim(),
      objectiveVerdict: 'COMPLETED'
    };
  }
}

module.exports = FeedbackCoachAgent;
