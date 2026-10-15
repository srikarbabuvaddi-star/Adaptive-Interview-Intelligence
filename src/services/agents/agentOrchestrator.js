const InterviewerAgent = require('./interviewer.agent');
const AnswerEvaluationAgent = require('./evaluation.agent');
const SkillGapAgent = require('./skillGap.agent');
const FeedbackCoachAgent = require('./feedbackCoach.agent');
const IntegrityReviewAgent = require('./integrityReview.agent');
const { COLLECTIONS, getCollection, toTimestamp } = require('../db/firestore.service');
const guardrailsService = require('../intelligence/guardrails.service');
const skillGraphService = require('../intelligence/skillGraph.service');
const tracer = require('../../observability/tracer');
const metrics = require('../../observability/metrics');
const ApiError = require('../../utils/apiError');
const logger = require('../../utils/logger');
const { INTERVIEW_STATUS, REVIEW_STATUS } = require('../../constants/interviewStatus');

class AgentOrchestrator {
  constructor() {
    this.interviewerAgent = new InterviewerAgent();
    this.evaluationAgent = new AnswerEvaluationAgent();
    this.skillGapAgent = new SkillGapAgent();
    this.feedbackCoachAgent = new FeedbackCoachAgent();
    this.integrityReviewAgent = new IntegrityReviewAgent();
  }

  /**
   * Orchestrates Agent 1 (Interviewer) to generate the opening question
   */
  async generateFirstQuestion({ job, candidateProfile = {}, maxQuestions = 5 }) {
    logger.info(`[AgentOrchestrator] Invoking InterviewerAgent for initial question: job="${job.title}"`);
    return this.interviewerAgent.execute({
      job,
      candidateProfile,
      stage: 'initial',
      history: [],
      skillEvidence: {},
      questionIndex: 1,
      maxQuestions
    });
  }

  /**
   * Central orchestrator loop for answer submission:
   * 1. Authenticate candidate & ownership
   * 2. Prevent duplicate answers
   * 3. Run Answer Evaluation Agent (Agent 2)
   * 4. Persist Answer and Evaluation
   * 5. Run Skill-Gap Analysis Agent (Agent 3)
   * 6. Check completion condition
   * 7. If continuing: Run Interviewer Agent (Agent 1) with skill findings to generate adaptive question
   * 8. If complete: Run Feedback Coach (Agent 4) & Integrity Review (Agent 5) to synthesize final report
   */
  async processAnswerAndDetermineNextStep({
    interviewId,
    user,
    questionId,
    answerText,
    timeTakenSeconds = 30,
    useA2A = false,
    correlationId
  }) {
    // 1. Fetch and verify interview ownership
    const interviewRef = getCollection(COLLECTIONS.INTERVIEWS).doc(interviewId);
    const interviewSnap = await interviewRef.get();
    if (!interviewSnap.exists) {
      throw ApiError.notFound('Interview not found');
    }
    const interview = interviewSnap.data();

    if (interview.candidateId !== user.uid) {
      throw ApiError.forbidden('Forbidden: You can only submit answers to your own interview');
    }

    if (interview.status !== INTERVIEW_STATUS.IN_PROGRESS) {
      throw ApiError.badRequest(`Interview is not in progress (Current status: ${interview.status})`);
    }

    if (interview.currentQuestionId !== questionId) {
      throw ApiError.badRequest('Question ID does not match the active pending question for this interview');
    }

    // 2. Prevent duplicate answer submission
    const existingAnswers = await getCollection(COLLECTIONS.INTERVIEW_ANSWERS)
      .where('questionId', '==', questionId)
      .get();

    if (!existingAnswers.empty) {
      throw ApiError.conflict('An answer has already been submitted for this question');
    }

    // 3. Fetch Question and Job data
    const questionRef = getCollection(COLLECTIONS.INTERVIEW_QUESTIONS).doc(questionId);
    const questionSnap = await questionRef.get();
    if (!questionSnap.exists) {
      throw ApiError.notFound('Question not found');
    }
    const currentQuestion = questionSnap.data();

    const jobSnap = await getCollection(COLLECTIONS.JOBS).doc(interview.jobId).get();
    if (!jobSnap.exists) {
      throw ApiError.notFound('Associated job posting was not found');
    }
    const job = jobSnap.data();

    const candidateProfile = interview.candidateProfileSnapshot || user.candidateProfile || {};

    // 4. Persist the raw candidate answer
    const answerRef = getCollection(COLLECTIONS.INTERVIEW_ANSWERS).doc();
    const answerRecord = {
      id: answerRef.id,
      interviewId,
      questionId,
      candidateId: user.uid,
      answerText,
      timeTakenSeconds,
      submittedAt: toTimestamp()
    };
    await answerRef.set(answerRecord);

    // 5. Gather past Q&A history
    const allQuestionsSnap = await getCollection(COLLECTIONS.INTERVIEW_QUESTIONS)
      .where('interviewId', '==', interviewId)
      .get();
    const allQuestions = allQuestionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allQuestions.sort((a, b) => a.questionIndex - b.questionIndex);

    const allAnswersSnap = await getCollection(COLLECTIONS.INTERVIEW_ANSWERS)
      .where('interviewId', '==', interviewId)
      .get();
    const allAnswers = allAnswersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const previousQA = allQuestions
      .filter(q => q.id !== questionId)
      .map(q => {
        const a = allAnswers.find(ans => ans.questionId === q.id);
        return {
          question: q.questionText,
          skill: q.skill,
          difficulty: q.difficulty,
          answer: a?.answerText || ''
        };
      });

    // 6. Invoke Agent 2: Answer Evaluation Agent
    logger.info(`[AgentOrchestrator] Invoking AnswerEvaluationAgent for question ${currentQuestion.questionIndex} (A2A: ${useA2A})`);
    let evaluationResult;
    if (useA2A) {
      const evalTask = await this.getA2AClient().submitTask('evaluation-agent', {
        contextId: interviewId,
        correlationId,
        input: {
          question: currentQuestion,
          answer: answerText,
          job,
          candidateProfile,
          previousQA
        }
      });
      evaluationResult = evalTask.output;
    } else {
      evaluationResult = await this.evaluationAgent.execute({
        question: currentQuestion,
        answer: answerText,
        job,
        candidateProfile,
        previousQA
      });
    }

    // Apply AI Evaluation Guardrails validation
    evaluationResult = guardrailsService.validateAndEnforceGuardrails(evaluationResult, answerText, currentQuestion);

    // 7. Persist Evaluation Record
    const evalRef = getCollection(COLLECTIONS.SKILL_EVALUATIONS).doc();
    const evaluationRecord = {
      id: evalRef.id,
      interviewId,
      questionId,
      answerId: answerRef.id,
      skill: currentQuestion.skill,
      score: evaluationResult.score,
      compositeScore: evaluationResult.compositeScore,
      correctnessScore: evaluationResult.correctnessScore,
      completenessScore: evaluationResult.completenessScore,
      conceptualAccuracy: evaluationResult.conceptualAccuracy,
      depthScore: evaluationResult.depthScore,
      communicationScore: evaluationResult.communicationScore,
      status: evaluationResult.status,
      evidence: evaluationResult.evidence,
      strengths: evaluationResult.strengths,
      weaknesses: evaluationResult.weaknesses,
      matchedConcepts: evaluationResult.matchedConcepts,
      missingConcepts: evaluationResult.missingConcepts,
      feedback: evaluationResult.feedback,
      explanation: evaluationResult.explanation,
      skillsDemonstrated: evaluationResult.skillsDemonstrated,
      evaluatedAt: toTimestamp()
    };
    await evalRef.set(evaluationRecord);

    // 8. Fetch all accumulated evaluations for Skill-Gap Agent
    const allEvaluationsSnap = await getCollection(COLLECTIONS.SKILL_EVALUATIONS)
      .where('interviewId', '==', interviewId)
      .get();
    const allEvaluations = allEvaluationsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // 9. Invoke Agent 3: Skill-Gap Analysis Agent
    logger.info(`[AgentOrchestrator] Invoking SkillGapAgent to update skill gap findings (A2A: ${useA2A})`);
    let skillGapFindings;
    if (useA2A) {
      const gapTask = await this.getA2AClient().submitTask('skill-gap-agent', {
        contextId: interviewId,
        correlationId,
        input: {
          job,
          candidateProfile,
          evaluations: allEvaluations,
          roundNumber: interview.currentQuestionIndex,
          totalRounds: interview.totalQuestions
        }
      });
      skillGapFindings = gapTask.output;
    } else {
      skillGapFindings = await this.skillGapAgent.execute({
        job,
        candidateProfile,
        evaluations: allEvaluations,
        roundNumber: interview.currentQuestionIndex,
        totalRounds: interview.totalQuestions
      });
    }

    // Cross-reference with Skill Knowledge Graph for prerequisite gaps
    const graphRecommendation = skillGraphService.recommendNextTopic({
      jobRequiredSkills: job.requiredSkills || [],
      demonstratedSkills: skillGapFindings.demonstratedSkills || [],
      weakSkills: skillGapFindings.gapSkills || []
    });

    if (graphRecommendation.isPrerequisiteProbe) {
      logger.info(`[AgentOrchestrator] Skill graph identified root prerequisite gap: probing ${graphRecommendation.skill} for ${graphRecommendation.prerequisiteFor}`);
      skillGapFindings.recommendedNextSkill = graphRecommendation.skill;
      skillGapFindings.recommendedDifficulty = graphRecommendation.difficulty;
    }

    // 10. Check interview completion criteria
    const isCompleted = interview.currentQuestionIndex >= interview.totalQuestions;

    if (!isCompleted) {
      // 11A. Build structured history for Agent 1
      const compiledHistory = allQuestions.map(q => {
        const a = allAnswers.find(ans => ans.questionId === q.id) || (q.id === questionId ? answerRecord : null);
        const ev = allEvaluations.find(e => e.questionId === q.id) || (q.id === questionId ? evaluationRecord : null);
        return {
          question: q.questionText,
          skill: q.skill,
          difficulty: q.difficulty,
          answer: a?.answerText || '',
          evaluation: ev
        };
      });

      // Update per-skill stats
      const currentSkillStats = { ...(interview.adaptiveState?.skillStats || {}) };
      const currSkill = currentQuestion.skill;
      if (!currentSkillStats[currSkill]) {
        currentSkillStats[currSkill] = { questions_asked: 0, consecutive: 0, difficulty: currentQuestion.difficulty || 'intermediate' };
      }
      currentSkillStats[currSkill].questions_asked += 1;
      currentSkillStats[currSkill].consecutive += 1;
      for (const s of Object.keys(currentSkillStats)) {
        if (s !== currSkill) currentSkillStats[s].consecutive = 0;
      }
      currentSkillStats[currSkill].difficulty = skillGapFindings.recommendedDifficulty;

      // Invoke Agent 1: Interviewer Agent for adaptive next question
      logger.info(`[AgentOrchestrator] Invoking InterviewerAgent for adaptive Question ${interview.currentQuestionIndex + 1} (A2A: ${useA2A})`);
      let nextQuestionResult;
      if (useA2A) {
        const qTask = await this.getA2AClient().submitTask('interviewer-agent', {
          contextId: interviewId,
          correlationId,
          input: {
            job,
            candidateProfile,
            stage: 'adaptive',
            history: compiledHistory,
            skillEvidence: {
              skillStats: currentSkillStats,
              skillScores: {
                ...(interview.adaptiveState?.skillScores || {}),
                [currSkill]: evaluationResult.score
              },
              targetNextSkill: skillGapFindings.recommendedNextSkill,
              targetDifficulty: skillGapFindings.recommendedDifficulty
            },
            questionIndex: interview.currentQuestionIndex + 1,
            maxQuestions: interview.totalQuestions
          }
        });
        nextQuestionResult = qTask.output;
      } else {
        nextQuestionResult = await this.interviewerAgent.execute({
          job,
          candidateProfile,
          stage: 'adaptive',
          history: compiledHistory,
          skillEvidence: {
            skillStats: currentSkillStats,
            skillScores: {
              ...(interview.adaptiveState?.skillScores || {}),
              [currSkill]: evaluationResult.score
            },
            targetNextSkill: skillGapFindings.recommendedNextSkill,
            targetDifficulty: skillGapFindings.recommendedDifficulty
          },
          questionIndex: interview.currentQuestionIndex + 1,
          maxQuestions: interview.totalQuestions
        });
      }

      // Save Next Question
      const nextQRef = getCollection(COLLECTIONS.INTERVIEW_QUESTIONS).doc();
      const nextQuestionRecord = {
        id: nextQRef.id,
        interviewId,
        questionIndex: interview.currentQuestionIndex + 1,
        questionText: nextQuestionResult.questionText,
        skill: nextQuestionResult.skill,
        difficulty: nextQuestionResult.difficulty,
        questionType: nextQuestionResult.questionType,
        selectionRationale: nextQuestionResult.selectionRationale,
        expectedConcepts: nextQuestionResult.expectedConcepts,
        expectedKeyPoints: nextQuestionResult.expectedKeyPoints,
        context: nextQuestionResult.context,
        timeLimitSeconds: 180,
        askedAt: toTimestamp()
      };
      await nextQRef.set(nextQuestionRecord);

      // Update interview document
      const updatedSkillScores = {
        ...(interview.adaptiveState?.skillScores || {}),
        [currSkill]: evaluationResult.score
      };

      await interviewRef.update({
        currentQuestionIndex: interview.currentQuestionIndex + 1,
        currentQuestionId: nextQRef.id,
        adaptiveState: {
          currentDifficulty: nextQuestionResult.difficulty,
          skillScores: updatedSkillScores,
          skillStats: currentSkillStats,
          topicsCovered: Array.from(new Set([
            ...(interview.adaptiveState?.topicsCovered || []),
            currSkill
          ]))
        },
        updatedAt: toTimestamp()
      });

      return {
        isInterviewComplete: false,
        evaluation: evaluationResult,
        skillGapFindings,
        nextQuestion: {
          id: nextQRef.id,
          questionIndex: interview.currentQuestionIndex + 1,
          totalQuestions: interview.totalQuestions,
          questionText: nextQuestionResult.questionText,
          skill: nextQuestionResult.skill,
          difficulty: nextQuestionResult.difficulty,
          questionType: nextQuestionResult.questionType,
          selectionRationale: nextQuestionResult.selectionRationale,
          timeLimitSeconds: 180
        }
      };
    } else {
      // 11B. Finalize interview and generate final reports via Feedback Coach & Integrity Review
      logger.info(`[AgentOrchestrator] Interview ${interviewId} completed. Finalizing session.`);
      const finalReport = await this.finalizeInterviewSession({
        interviewId,
        user,
        job,
        reason: 'candidate_completed',
        useA2A,
        correlationId
      });

      return {
        isInterviewComplete: true,
        evaluation: evaluationResult,
        skillGapFindings,
        message: 'Interview session completed. Multi-agent comprehensive reports have been synthesized and saved.',
        reportId: finalReport.id,
        overallScore: finalReport.overallScore
      };
    }
  }

  /**
   * Finalizes an interview session and synthesizes reports using Agents 3, 4, and 5
   */
  async finalizeInterviewSession({ interviewId, user, job, reason = 'candidate_completed', useA2A = false, correlationId }) {
    const interviewRef = getCollection(COLLECTIONS.INTERVIEWS).doc(interviewId);
    const interviewSnap = await interviewRef.get();
    if (!interviewSnap.exists) {
      throw ApiError.notFound('Interview not found');
    }
    const interview = interviewSnap.data();

    // Verify ownership
    if (interview.candidateId !== user.uid && interview.recruiterId !== user.uid) {
      throw ApiError.forbidden('Forbidden: You are not authorized to finalize this interview');
    }

    // Check if report was already generated
    const existingReports = await getCollection(COLLECTIONS.INTERVIEW_REPORTS)
      .where('interviewId', '==', interviewId)
      .get();

    if (!existingReports.empty) {
      return { id: existingReports.docs[0].id, ...existingReports.docs[0].data() };
    }

    const now = toTimestamp();
    const startTime = interview.startTime ? new Date(interview.startTime) : new Date(interview.createdAt);
    const durationSeconds = Math.max(1, Math.round((new Date(now) - startTime) / 1000));

    // Gather questions, answers, evaluations, and proctoring events
    const qSnap = await getCollection(COLLECTIONS.INTERVIEW_QUESTIONS).where('interviewId', '==', interviewId).get();
    const questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    questions.sort((a, b) => a.questionIndex - b.questionIndex);

    const aSnap = await getCollection(COLLECTIONS.INTERVIEW_ANSWERS).where('interviewId', '==', interviewId).get();
    const answers = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const eSnap = await getCollection(COLLECTIONS.SKILL_EVALUATIONS).where('interviewId', '==', interviewId).get();
    const evaluations = eSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const iSnap = await getCollection(COLLECTIONS.INTEGRITY_EVENTS).where('interviewId', '==', interviewId).get();
    const integrityEvents = iSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    integrityEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const qaList = questions.map(q => ({
      question: q,
      answer: answers.find(a => a.questionId === q.id) || null,
      evaluation: evaluations.find(e => e.questionId === q.id) || null
    }));

    // Candidate user profile
    const candSnap = await getCollection(COLLECTIONS.USERS).doc(interview.candidateId).get();
    const rawCandidate = candSnap.exists ? candSnap.data() : {};
    const candidate = {
      ...rawCandidate,
      candidateProfile: interview.candidateProfileSnapshot || rawCandidate.candidateProfile || {}
    };

    // 1. Invoke Agent 5: Integrity Review Agent
    logger.info(`[AgentOrchestrator] Invoking IntegrityReviewAgent for interview ${interviewId}`);
    const integrityReport = await this.integrityReviewAgent.execute({
      interviewId,
      integrityEvents,
      qaList,
      sessionDurationSeconds: durationSeconds
    });

    // 2. Invoke Agent 3: Skill Gap Analysis Agent
    logger.info(`[AgentOrchestrator] Invoking SkillGapAgent for final skill synthesis (A2A: ${useA2A})`);
    let skillGapReport;
    if (useA2A) {
      const gapTask = await this.getA2AClient().submitTask('skill-gap-agent', {
        contextId: interviewId,
        correlationId,
        input: {
          job,
          candidateProfile: candidate.candidateProfile,
          evaluations,
          roundNumber: questions.length,
          totalRounds: interview.totalQuestions
        }
      });
      skillGapReport = gapTask.output;
    } else {
      skillGapReport = await this.skillGapAgent.execute({
        job,
        candidateProfile: candidate.candidateProfile,
        evaluations,
        roundNumber: questions.length,
        totalRounds: interview.totalQuestions
      });
    }

    // 3. Invoke Agent 4: Feedback & Career Coach Agent
    logger.info(`[AgentOrchestrator] Invoking FeedbackCoachAgent for comprehensive report synthesis (A2A: ${useA2A})`);
    let feedbackReport;
    if (useA2A) {
      const fbTask = await this.getA2AClient().submitTask('feedback-coach-agent', {
        contextId: interviewId,
        correlationId,
        input: {
          job,
          candidate,
          evaluations,
          qaList,
          skillGapReport,
          integrityReport,
          isCompleted: true
        }
      });
      feedbackReport = fbTask.output;
    } else {
      feedbackReport = await this.feedbackCoachAgent.execute({
        job,
        candidate,
        evaluations,
        qaList,
        skillGapReport,
        integrityReport,
        isCompleted: true
      });
    }

    const allSkillsList = [
      ...skillGapReport.demonstratedSkills.map(s => ({
        name: s.skill,
        skill: s.skill,
        score: Math.round(s.score * 10),
        demonstratedScore: s.score,
        level: s.level,
        status: 'demonstrated',
        evidence: s.evidence
      })),
      ...skillGapReport.partiallyDemonstratedSkills.map(s => ({
        name: s.skill,
        skill: s.skill,
        score: Math.round(s.score * 10),
        demonstratedScore: s.score,
        level: s.level,
        status: 'partially_demonstrated',
        gaps: s.gaps
      })),
      ...skillGapReport.gapSkills.map(s => ({
        name: s.skill,
        skill: s.skill,
        score: Math.round(s.score * 10),
        demonstratedScore: s.score,
        level: 'Needs Improvement',
        status: 'gap',
        missingConcepts: s.missingConcepts,
        gapDescription: s.description
      })),
      ...skillGapReport.unassessedSkills.map(s => ({
        name: s.skill,
        skill: s.skill,
        requiredLevel: s.requiredLevel,
        status: 'not_assessed',
        recommendation: s.recommendation
      }))
    ];

    const assessedCount = skillGapReport.demonstratedSkills.length + skillGapReport.partiallyDemonstratedSkills.length + skillGapReport.gapSkills.length;
    const totalSkillsCount = Math.max(1, assessedCount + skillGapReport.unassessedSkills.length);
    const conceptCoveragePercentage = Math.round((assessedCount / totalSkillsCount) * 100);

    const recommendationStr = feedbackReport.overallScore >= 80 ? 'strong_hire' : (feedbackReport.overallScore >= 65 ? 'hire' : (feedbackReport.overallScore >= 45 ? 'lean_hire' : 'no_hire'));
    const verdictStr = recommendationStr.toUpperCase();

    // 4. Save Skill Gap Report Document
    const gapReportRef = getCollection(COLLECTIONS.SKILL_GAP_REPORTS).doc();
    const skillGapDocData = {
      id: gapReportRef.id,
      interviewId,
      candidateId: interview.candidateId,
      jobId: interview.jobId,
      readinessScore: skillGapReport.readinessScore,
      summary: skillGapReport.summary,
      skills: allSkillsList,
      skillAnalyses: allSkillsList,
      demonstratedSkills: skillGapReport.demonstratedSkills,
      partiallyDemonstratedSkills: skillGapReport.partiallyDemonstratedSkills,
      gapSkills: skillGapReport.gapSkills,
      unassessedSkills: skillGapReport.unassessedSkills,
      unverifiedClaims: skillGapReport.unverifiedClaims,
      uncertaintyAreas: skillGapReport.uncertaintyAreas,
      recommendedNextSkill: skillGapReport.recommendedNextSkill,
      recommendedDifficulty: skillGapReport.recommendedDifficulty,
      recommendationReason: skillGapReport.recommendationReason,
      skillsAssessedCount: assessedCount,
      skillsUnassessedCount: skillGapReport.unassessedSkills.length,
      createdAt: now
    };
    await gapReportRef.set(skillGapDocData);

    // 5. Save Interview Report Document
    const reportRef = getCollection(COLLECTIONS.INTERVIEW_REPORTS).doc();
    const interviewReportDocData = {
      id: reportRef.id,
      interviewId,
      candidateId: interview.candidateId,
      jobId: interview.jobId,
      recruiterId: interview.recruiterId,
      resumeId: interview.resumeId || null,
      resumeVersion: interview.resumeVersion || null,
      resumeFilename: interview.resumeFilename || null,
      overallScore: feedbackReport.overallScore,
      summary: feedbackReport.summary,
      strengths: feedbackReport.evidenceBackedStrengths.map(s => s.point),
      evidenceBackedStrengths: feedbackReport.evidenceBackedStrengths.map((s, idx) => {
        const matchingQA = qaList.find(item => item.question?.skill === s.skill) || qaList[idx] || qaList[0];
        const q = matchingQA?.question || {};
        const a = matchingQA?.answer || {};
        const ev = matchingQA?.evaluation || {};
        const excerpt = a.answerText ? (a.answerText.length > 180 ? `${a.answerText.slice(0, 177)}...` : a.answerText) : '';
        return {
          ...s,
          citation: {
            questionIndex: q.questionIndex || idx + 1,
            questionText: q.questionText || '',
            answerExcerpt: excerpt,
            score: ev.score || 8
          }
        };
      }),
      areasForImprovement: feedbackReport.evidenceBackedImprovements.map(a => a.point),
      evidenceBackedImprovements: feedbackReport.evidenceBackedImprovements.map((imp, idx) => {
        const matchingQA = qaList.find(item => item.question?.skill === imp.skill) || qaList[idx] || qaList[0];
        const q = matchingQA?.question || {};
        const a = matchingQA?.answer || {};
        const ev = matchingQA?.evaluation || {};
        const excerpt = a.answerText ? (a.answerText.length > 180 ? `${a.answerText.slice(0, 177)}...` : a.answerText) : '';
        return {
          ...imp,
          citation: {
            questionIndex: q.questionIndex || idx + 1,
            questionText: q.questionText || '',
            answerExcerpt: excerpt,
            score: ev.score || 4
          }
        };
      }),
      adaptiveProgression: qaList.map((item, idx) => {
        const q = item.question || {};
        const a = item.answer || {};
        const ev = item.evaluation || {};
        const prevQ = idx > 0 ? qaList[idx - 1].question : null;
        let difficultyShift = 'maintained';
        if (prevQ && q.difficulty && prevQ.difficulty) {
          if (q.difficulty === 'advanced' && prevQ.difficulty !== 'advanced') difficultyShift = 'escalated';
          else if (q.difficulty === 'beginner' && prevQ.difficulty !== 'beginner') difficultyShift = 'de-escalated';
        }
        return {
          step: idx + 1,
          questionId: q.id,
          skill: q.skill,
          difficulty: q.difficulty,
          difficultyShift,
          scoreAchieved: ev.score ?? null,
          timeTakenSeconds: a.timeTakenSeconds ?? null,
          adaptiveRationale: ev.score >= 7.5
            ? `Score (${ev.score}/10) demonstrated conceptual mastery; engine probed deeper architectural complexity.`
            : `Score (${ev.score}/10); engine adapted competency coverage.`
        };
      }),
      learningPlan: feedbackReport.learningPlan,
      nextRoundInterviewProbes: feedbackReport.nextRoundInterviewProbes,
      careerAdvice: feedbackReport.careerAdvice,
      skillBreakdown: [
        ...skillGapReport.demonstratedSkills.map(s => ({
          skill: s.skill,
          score: Math.round(s.score * 10),
          levelDemonstrated: s.level,
          feedback: `Demonstrated: ${s.evidence.join('; ')}`
        })),
        ...skillGapReport.partiallyDemonstratedSkills.map(s => ({
          skill: s.skill,
          score: Math.round(s.score * 10),
          levelDemonstrated: s.level,
          feedback: `Gaps identified: ${s.gaps.join('; ')}`
        })),
        ...skillGapReport.gapSkills.map(s => ({
          skill: s.skill,
          score: Math.round(s.score * 10),
          levelDemonstrated: 'Needs Improvement',
          feedback: s.description
        }))
      ],
      skillGapReportId: gapReportRef.id,
      integrityScore: integrityReport.integrityScore,
      integrityIncidentCount: integrityReport.incidentCount,
      integrityVerdict: integrityReport.verdict,
      integrityFlags: integrityReport.flags,
      integrityHumanReviewRecommended: integrityReport.humanReviewRecommended,
      recommendation: recommendationStr,
      hiringVerdict: verdictStr,
      conceptCoveragePercentage,
      recruiterTakeaway: feedbackReport.summary,
      recruiterDecisionSupport: {
        recommendation: recommendationStr,
        keyRationale: feedbackReport.summary,
        keyObservations: feedbackReport.evidenceBackedStrengths.map(s => s.point),
        probes: feedbackReport.nextRoundInterviewProbes
      },
      skillCategories: {
        demonstratedSkills: skillGapReport.demonstratedSkills.map(s => s.skill),
        partiallyDemonstratedSkills: skillGapReport.partiallyDemonstratedSkills.map(s => s.skill),
        gapSkills: skillGapReport.gapSkills.map(s => s.skill),
        untestedSkills: skillGapReport.unassessedSkills.map(s => s.skill),
        unassessedSkills: skillGapReport.unassessedSkills.map(s => s.skill)
      },
      completionReason: reason,
      createdAt: now
    };
    await reportRef.set(interviewReportDocData);

    // 6. Update Interview Document to COMPLETED
    await interviewRef.update({
      status: INTERVIEW_STATUS.COMPLETED,
      endTime: now,
      durationSeconds,
      overallScore: feedbackReport.overallScore,
      finalReportId: reportRef.id,
      skillGapReportId: gapReportRef.id,
      updatedAt: now
    });

    return interviewReportDocData;
  }

  /**
   * Helper to instantiate an authenticated in-memory MCP client session for a user
   */
  async createMcpClientForUser(user) {
    const { createMcpAgentClient } = require('../../mcp/client');
    return createMcpAgentClient({ user });
  }

  /**
   * Helper to instantiate or retrieve the A2A protocol client
   */
  getA2AClient() {
    if (!this.a2aClient) {
      const { createA2AClient } = require('../../a2a/client');
      this.a2aClient = createA2AClient();
    }
    return this.a2aClient;
  }

  /**
   * Orchestrates the 4-step interview processing cycle strictly via genuine A2A protocol tasks
   */
  async processAnswerWithA2A(params) {
    return this.processAnswerAndDetermineNextStep({
      ...params,
      useA2A: true
    });
  }

  /**
   * Generates opening interview question via A2A protocol task delegation
   */
  async generateFirstQuestionWithA2A({ job, candidateProfile = {}, maxQuestions = 5, correlationId }) {
    logger.info(`[AgentOrchestrator] Invoking InterviewerAgent via A2A protocol task delegation for opening question`);
    const task = await this.getA2AClient().submitTask('interviewer-agent', {
      contextId: '',
      correlationId,
      input: {
        job,
        candidateProfile,
        stage: 'initial',
        history: [],
        skillEvidence: {},
        questionIndex: 1,
        maxQuestions
      }
    });
    return task.output;
  }

  /**
   * Finalizes interview session via A2A protocol task delegation
   */
  async finalizeInterviewWithA2A(params) {
    return this.finalizeInterviewSession({
      ...params,
      useA2A: true
    });
  }
}

module.exports = new AgentOrchestrator();
