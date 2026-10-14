const BaseAgent = require('./agent.interface');
const { skillGapAgentInputSchema, skillGapAgentOutputSchema } = require('./schemas');
const { QUESTION_DIFFICULTY } = require('../../constants/interviewStatus');
const logger = require('../../utils/logger');

class SkillGapAgent extends BaseAgent {
  constructor() {
    super('SkillGapAgent', skillGapAgentInputSchema, skillGapAgentOutputSchema);
  }

  async _process(input) {
    const { job, candidateProfile = {}, evaluations = [], roundNumber = 1, totalRounds = 5 } = input;

    const requiredSkills = (job.requiredSkills || []).map(s => {
      if (typeof s === 'string') return { name: s, minimumLevel: QUESTION_DIFFICULTY.INTERMEDIATE, weight: 1 };
      return {
        name: s.name || 'General Engineering',
        minimumLevel: s.minimumLevel || QUESTION_DIFFICULTY.INTERMEDIATE,
        weight: s.weight || 1
      };
    });

    const candidateClaimedSkills = new Set(
      (candidateProfile.skills || []).map(s => String(s).toLowerCase().trim())
    );

    // 1. Group evaluations by skill
    const skillGroups = new Map();
    for (const ev of evaluations) {
      if (!ev.skill) continue;
      const key = ev.skill.toLowerCase().trim();
      if (!skillGroups.has(key)) {
        skillGroups.set(key, {
          skillName: ev.skill,
          scores: [],
          evidence: [],
          matchedConcepts: new Set(),
          missingConcepts: new Set(),
          strengths: [],
          weaknesses: []
        });
      }
      const g = skillGroups.get(key);
      g.scores.push(typeof ev.score === 'number' ? ev.score : 5);
      if (Array.isArray(ev.evidence)) {
        ev.evidence.forEach(e => { if (e) g.evidence.push(String(e)); });
      }
      if (Array.isArray(ev.matchedConcepts)) {
        ev.matchedConcepts.forEach(c => { if (c) g.matchedConcepts.add(String(c)); });
      }
      if (Array.isArray(ev.missingConcepts)) {
        ev.missingConcepts.forEach(c => { if (c) g.missingConcepts.add(String(c)); });
      }
      if (Array.isArray(ev.strengths)) {
        g.strengths.push(...ev.strengths);
      }
      if (Array.isArray(ev.weaknesses)) {
        g.weaknesses.push(...ev.weaknesses);
      }
    }

    const demonstratedSkills = [];
    const partiallyDemonstratedSkills = [];
    const gapSkills = [];
    const uncertaintyAreas = [];

    // 2. Classify evaluated skills based on documented rubric thresholds
    for (const [key, group] of skillGroups.entries()) {
      const avgScore = group.scores.length > 0
        ? group.scores.reduce((a, b) => a + b, 0) / group.scores.length
        : 0;
      const normalizedScore = Math.round(avgScore * 10) / 10;
      const evidenceList = Array.from(new Set(group.evidence)).slice(0, 3);
      const missingList = Array.from(group.missingConcepts);

      if (normalizedScore >= 7.0) {
        demonstratedSkills.push({
          skill: group.skillName,
          score: normalizedScore,
          level: normalizedScore >= 8.5 ? 'Advanced' : 'Proficient',
          evidence: evidenceList.length > 0 ? evidenceList : [`Demonstrated sound understanding in ${group.scores.length} evaluation(s)`]
        });
      } else if (normalizedScore >= 4.5) {
        partiallyDemonstratedSkills.push({
          skill: group.skillName,
          score: normalizedScore,
          level: 'Competent',
          gaps: missingList.length > 0 ? missingList.slice(0, 3) : ['Depth in architectural edge cases and error handling']
        });
        uncertaintyAreas.push(`Partial competency in ${group.skillName} (Score: ${normalizedScore}/10). Needs deeper probe.`);
      } else {
        gapSkills.push({
          skill: group.skillName,
          score: normalizedScore,
          missingConcepts: missingList.length > 0 ? missingList.slice(0, 4) : ['Core principles', 'Execution correctness'],
          description: `Performance was below required proficiency threshold (${normalizedScore}/10). Key concepts missed: ${missingList.join(', ') || 'Fundamental principles'}.`
        });
      }

      // Check for single-sample uncertainty
      if (group.scores.length === 1 && normalizedScore < 7.5 && normalizedScore >= 4.0) {
        uncertaintyAreas.push(`Single data point for ${group.skillName}. Consider probing for confirmation.`);
      }
    }

    // 3. Identify Unassessed Skills (Distinguish from gaps)
    const unassessedSkills = [];
    for (const req of requiredSkills) {
      const key = req.name.toLowerCase().trim();
      if (!skillGroups.has(key)) {
        unassessedSkills.push({
          skill: req.name,
          requiredLevel: req.minimumLevel,
          recommendation: `Evaluate ${req.name} to establish evidence of candidate competency.`
        });
      }
    }

    // 4. Identify unverified resume claims
    const unverifiedClaims = [];
    for (const claim of candidateClaimedSkills) {
      const reqMatch = requiredSkills.find(r => r.name.toLowerCase().trim() === claim);
      if (reqMatch) {
        const evalGroup = skillGroups.get(claim);
        if (!evalGroup) {
          unverifiedClaims.push(`${reqMatch.name} (Claimed on resume, not yet assessed)`);
        } else {
          const avg = evalGroup.scores.reduce((a, b) => a + b, 0) / evalGroup.scores.length;
          if (avg < 5.0) {
            unverifiedClaims.push(`${reqMatch.name} (Claimed on resume, but evaluated as deficient: ${avg.toFixed(1)}/10)`);
          }
        }
      }
    }

    // 5. Select recommended next skill and difficulty
    let recommendedNextSkill = requiredSkills[0]?.name || 'Software Engineering';
    let recommendedDifficulty = QUESTION_DIFFICULTY.INTERMEDIATE;
    let recommendationReason = 'Initial round baseline assessment';

    if (unassessedSkills.length > 0) {
      // Prioritize unassessed required skills
      recommendedNextSkill = unassessedSkills[0].skill;
      recommendedDifficulty = unassessedSkills[0].requiredLevel || QUESTION_DIFFICULTY.INTERMEDIATE;
      recommendationReason = `Required skill '${recommendedNextSkill}' has not yet been assessed. Recommend testing baseline competency.`;
    } else if (partiallyDemonstratedSkills.length > 0) {
      // Probe partial skill to resolve uncertainty
      recommendedNextSkill = partiallyDemonstratedSkills[0].skill;
      recommendedDifficulty = QUESTION_DIFFICULTY.INTERMEDIATE;
      recommendationReason = `Skill '${recommendedNextSkill}' demonstrated partial competence (${partiallyDemonstratedSkills[0].score}/10). Recommend follow-up question to probe gaps: ${partiallyDemonstratedSkills[0].gaps.join(', ')}.`;
    } else if (gapSkills.length > 0 && roundNumber <= 2) {
      // If early gap, adjust difficulty down to find candidate floor
      recommendedNextSkill = gapSkills[0].skill;
      recommendedDifficulty = QUESTION_DIFFICULTY.BEGINNER;
      recommendationReason = `Candidate struggled on '${recommendedNextSkill}' (${gapSkills[0].score}/10). Recommend simpler foundational question to establish floor.`;
    } else if (demonstratedSkills.length > 0) {
      // Advance to test ceiling
      recommendedNextSkill = demonstratedSkills[0].skill;
      recommendedDifficulty = QUESTION_DIFFICULTY.ADVANCED;
      recommendationReason = `Strong performance on '${recommendedNextSkill}' (${demonstratedSkills[0].score}/10). Recommend escalating to advanced level to assess technical depth.`;
    }

    // 6. Calculate overall readiness score (0-100)
    let readinessScore = 0;
    if (requiredSkills.length > 0) {
      let totalWeight = 0;
      let earnedWeight = 0;

      for (const req of requiredSkills) {
        totalWeight += req.weight;
        const g = skillGroups.get(req.name.toLowerCase().trim());
        if (g && g.scores.length > 0) {
          const avg = g.scores.reduce((a, b) => a + b, 0) / g.scores.length;
          earnedWeight += (avg / 10) * req.weight;
        }
      }

      readinessScore = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 50;
    } else if (evaluations.length > 0) {
      const avg = evaluations.reduce((acc, e) => acc + (typeof e.score === 'number' ? e.score : 5), 0) / evaluations.length;
      readinessScore = Math.round(avg * 10);
    }

    readinessScore = Math.max(0, Math.min(100, readinessScore));

    const assessedCount = skillGroups.size;
    const totalRequired = requiredSkills.length;
    const summary = `Assessed ${assessedCount} of ${totalRequired} required skills. ${demonstratedSkills.length} demonstrated, ${partiallyDemonstratedSkills.length} partial, ${gapSkills.length} gaps, ${unassessedSkills.length} unassessed. Readiness score: ${readinessScore}%.`;

    return {
      demonstratedSkills,
      partiallyDemonstratedSkills,
      gapSkills,
      unassessedSkills,
      unverifiedClaims,
      uncertaintyAreas,
      recommendedNextSkill,
      recommendedDifficulty,
      recommendationReason,
      readinessScore,
      summary
    };
  }

  /**
   * Executes SkillGap analysis using evaluations retrieved from MCP and persists results via MCP
   */
  async executeWithMcp({ mcpClient, interviewId, job, candidateProfile = {}, roundNumber = 1, totalRounds = 5 }) {
    if (!mcpClient || !interviewId) {
      throw new Error('executeWithMcp requires an initialized mcpClient and interviewId');
    }

    // 1. Retrieve authorized evaluations via MCP
    const evalData = await mcpClient.getInterviewEvaluation({ interviewId });
    const evaluations = (evalData.evaluations || []).map(e => ({
      id: e.evaluationId,
      skill: e.skill,
      score: e.score,
      status: e.status,
      evidence: e.evidence || [],
      matchedConcepts: e.matchedConcepts || [],
      missingConcepts: e.missingConcepts || [],
      strengths: [],
      weaknesses: []
    }));

    // 2. Perform core skill gap reasoning
    const analysis = await this.execute({
      job,
      candidateProfile,
      evaluations,
      roundNumber,
      totalRounds
    });

    // 3. Persist findings idempotently via MCP
    const persistResult = await mcpClient.updateSkillGapAnalysis({
      interviewId,
      readinessScore: analysis.readinessScore,
      summary: analysis.summary,
      demonstratedSkills: analysis.demonstratedSkills,
      partiallyDemonstratedSkills: analysis.partiallyDemonstratedSkills,
      gapSkills: analysis.gapSkills,
      unassessedSkills: analysis.unassessedSkills,
      recommendedNextSkill: analysis.recommendedNextSkill,
      recommendedDifficulty: analysis.recommendedDifficulty,
      recommendationReason: analysis.recommendationReason
    });

    return {
      ...analysis,
      mcpPersistResult: persistResult
    };
  }
}

module.exports = SkillGapAgent;
