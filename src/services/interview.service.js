const { COLLECTIONS, getCollection, toTimestamp } = require('./db/firestore.service');
const { getAIService } = require('./ai');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');
const { INTERVIEW_STATUS, APPLICATION_STATUS, QUESTION_DIFFICULTY, REVIEW_STATUS, JOB_STATUS } = require('../constants/interviewStatus');
const { ROLES } = require('../constants/roles');
const skillGapService = require('./intelligence/skillGap.service');
const integrityService = require('./intelligence/integrity.service');
const evidenceReportService = require('./intelligence/evidenceReport.service');
const { validateAndSanitizeEvaluation } = require('./intelligence/rubric');
const { agentOrchestrator } = require('./agents');

class InterviewService {
  /**
   * Creates an interview session
   */
  async createInterview({ jobId, candidateId, recruiterId, applicationId, targetRole, maxQuestions }) {
    // 0. If targetRole is specified without a jobId, create a tailored assessment job
    if (!jobId && targetRole) {
      const jobsCol = getCollection(COLLECTIONS.JOBS);
      const newJobDoc = jobsCol.doc();
      const rawSkills = targetRole.skills || [];
      const skillsArray = Array.isArray(rawSkills)
        ? rawSkills
        : (typeof rawSkills === 'string' ? rawSkills.split(',').map(s => s.trim()).filter(Boolean) : ['General Software Engineering']);

      const structuredSkills = (skillsArray.length > 0 ? skillsArray : ['Software Engineering', 'Problem Solving']).map(s => {
        if (typeof s === 'object' && s.name) return s;
        return { name: String(s), minimumLevel: QUESTION_DIFFICULTY.INTERMEDIATE, weight: 1 };
      });

      const createdJob = {
        id: newJobDoc.id,
        recruiterId: recruiterId || 'system-ai-evaluator',
        title: targetRole.title || 'Software Engineer',
        description: `Target role interview for ${targetRole.title || 'Software Engineer'} (${targetRole.experienceLevel || 'Intermediate'})`,
        department: targetRole.department || 'Engineering',
        location: 'Remote',
        employmentType: 'full-time',
        experienceLevel: targetRole.experienceLevel || 'Intermediate',
        requiredSkills: structuredSkills,
        evaluationCriteria: structuredSkills.map(s => `Demonstrate proficiency and practical knowledge in ${s.name}`),
        status: JOB_STATUS.PUBLISHED,
        maxQuestions: targetRole.maxQuestions || 5,
        targetDurationMinutes: targetRole.durationMinutes || 30,
        createdAt: toTimestamp(),
        updatedAt: toTimestamp()
      };
      await newJobDoc.set(createdJob);
      jobId = newJobDoc.id;
    }

    if (!jobId) {
      throw ApiError.badRequest('Either jobId or targetRole must be provided');
    }

    // 1. Fetch job
    const jobSnap = await getCollection(COLLECTIONS.JOBS).doc(jobId).get();
    if (!jobSnap.exists) {
      throw ApiError.notFound('Job not found');
    }
    const job = jobSnap.data();

    // Verify recruiter authorization if scheduled by recruiter
    if (recruiterId && job.recruiterId !== recruiterId) {
      throw ApiError.forbidden('Forbidden: You can only schedule interviews for jobs you manage');
    }

    // 2. Fetch candidate and active resume profile snapshot
    const candidateSnap = await getCollection(COLLECTIONS.USERS).doc(candidateId).get();
    if (!candidateSnap.exists) {
      throw ApiError.notFound('Candidate user not found');
    }
    const candidateData = candidateSnap.data();

    let resumeId = null;
    let resumeVersion = null;
    let resumeFilename = null;
    let candidateProfileSnapshot = candidateData.candidateProfile || {};

    const resumeSnap = await getCollection(COLLECTIONS.RESUMES).doc(candidateId).get();
    if (resumeSnap.exists) {
      const resumeData = resumeSnap.data();
      resumeId = candidateId;
      resumeVersion = resumeData.currentVersion || 1;
      resumeFilename = resumeData.originalName || resumeData.filename;
      candidateProfileSnapshot = {
        ...candidateProfileSnapshot,
        ...(resumeData.extractedProfile || {}),
        resumeId,
        resumeVersion,
        resumeFilename
      };
    }

    // 3. Prevent duplicate active interview for same job and candidate
    const existingInterviews = await getCollection(COLLECTIONS.INTERVIEWS)
      .where('jobId', '==', jobId)
      .where('candidateId', '==', candidateId)
      .get();

    for (const doc of existingInterviews.docs) {
      const data = doc.data();
      if (data.status === INTERVIEW_STATUS.SCHEDULED || data.status === INTERVIEW_STATUS.IN_PROGRESS) {
        if (!recruiterId) {
          // Candidate self-serve: reuse active interview session
          return { id: doc.id, ...data };
        }
        throw ApiError.conflict('An active interview session already exists for this candidate and job');
      }
    }

    // Determine initial difficulty based on experience level
    let initialDifficulty = QUESTION_DIFFICULTY.INTERMEDIATE;
    const exp = (targetRole?.experienceLevel || job.experienceLevel || '').toLowerCase();
    if (exp.includes('junior') || exp.includes('entry') || exp.includes('basic')) {
      initialDifficulty = QUESTION_DIFFICULTY.BASIC;
    } else if (exp.includes('senior') || exp.includes('lead') || exp.includes('advanced')) {
      initialDifficulty = QUESTION_DIFFICULTY.ADVANCED;
    }

    // Initialize per-skill tracking state (from adaptive_questions.py)
    const initialSkillStats = {};
    (job.requiredSkills || []).forEach(s => {
      const skillName = typeof s === 'string' ? s : s.name;
      if (skillName) {
        initialSkillStats[skillName] = {
          questions_asked: 0,
          consecutive: 0,
          difficulty: initialDifficulty
        };
      }
    });

    // 4. Create interview session
    const interviewDocRef = getCollection(COLLECTIONS.INTERVIEWS).doc();
    const interview = {
      id: interviewDocRef.id,
      jobId,
      jobTitle: job.title,
      candidateId,
      recruiterId: job.recruiterId,
      applicationId: applicationId || null,
      resumeId,
      resumeVersion,
      resumeFilename,
      candidateProfileSnapshot,
      status: INTERVIEW_STATUS.SCHEDULED,
      currentQuestionIndex: 0,
      currentQuestionId: null,
      totalQuestions: (maxQuestions && Number(maxQuestions) > 0) ? Number(maxQuestions) : (job.maxQuestions || 5),
      startTime: null,
      endTime: null,
      durationSeconds: null,
      overallScore: null,
      adaptiveState: {
        currentDifficulty: initialDifficulty,
        skillScores: {},
        topicsCovered: [],
        skillStats: initialSkillStats
      },
      createdAt: toTimestamp(),
      updatedAt: toTimestamp()
    };

    await interviewDocRef.set(interview);

    // If linked to an application, update application status
    if (applicationId) {
      try {
        await getCollection(COLLECTIONS.APPLICATIONS)
          .doc(applicationId)
          .update({
            status: APPLICATION_STATUS.INTERVIEW_INVITED,
            updatedAt: toTimestamp()
          });
      } catch (err) {
        logger.warn(`Could not update application status for ${applicationId}: ${err.message}`);
      }
    }

    return interview;
  }

  /**
   * Retrieves interviews filtered by user role and query parameters
   */
  async getInterviews({ user, status, page = 1, limit = 10 }) {
    const interviewsCol = getCollection(COLLECTIONS.INTERVIEWS);
    let query = interviewsCol;

    if (user.role === ROLES.CANDIDATE) {
      query = query.where('candidateId', '==', user.uid);
    } else if (user.role === ROLES.RECRUITER) {
      query = query.where('recruiterId', '==', user.uid);
    }

    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.get();
    let interviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    interviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = interviews.length;
    const startIndex = (page - 1) * limit;
    const paginated = interviews.slice(startIndex, startIndex + limit);

    return {
      interviews: paginated,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Retrieves single interview session with questions and answers
   */
  async getInterviewById(interviewId, user) {
    const interviewSnap = await getCollection(COLLECTIONS.INTERVIEWS).doc(interviewId).get();
    if (!interviewSnap.exists) {
      throw ApiError.notFound('Interview not found');
    }

    const interview = { id: interviewSnap.id, ...interviewSnap.data() };

    // Authorization
    if (user.role === ROLES.CANDIDATE && interview.candidateId !== user.uid) {
      throw ApiError.forbidden('Forbidden: You can only access your own interviews');
    }
    if (user.role === ROLES.RECRUITER && interview.recruiterId !== user.uid) {
      throw ApiError.forbidden('Forbidden: You can only access interviews for jobs you manage');
    }

    // Fetch related questions
    const qSnapshot = await getCollection(COLLECTIONS.INTERVIEW_QUESTIONS)
      .where('interviewId', '==', interviewId)
      .get();
    const questions = qSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    questions.sort((a, b) => a.questionIndex - b.questionIndex);

    // If candidate is actively taking interview, sanitize expectedKeyPoints
    if (user.role === ROLES.CANDIDATE && interview.status === INTERVIEW_STATUS.IN_PROGRESS) {
      questions.forEach(q => {
        delete q.expectedKeyPoints;
        delete q.context;
      });
    }

    return {
      ...interview,
      questions
    };
  }

  /**
   * Starts an interview session and triggers AI generation of the first question
   */
  async startInterview(interviewId, user) {
    const interviewRef = getCollection(COLLECTIONS.INTERVIEWS).doc(interviewId);
    const interviewSnap = await interviewRef.get();

    if (!interviewSnap.exists) {
      throw ApiError.notFound('Interview not found');
    }

    const interview = interviewSnap.data();

    // Verify candidate ownership
    if (interview.candidateId !== user.uid) {
      throw ApiError.forbidden('Forbidden: Only the assigned candidate can start this interview');
    }

    // State machine check
    if (interview.status === INTERVIEW_STATUS.COMPLETED || interview.status === INTERVIEW_STATUS.TERMINATED) {
      throw ApiError.badRequest('This interview has already been completed and cannot be restarted');
    }

    // If interview is already in progress, return current question
    if (interview.status === INTERVIEW_STATUS.IN_PROGRESS && interview.currentQuestionId) {
      const currentQSnap = await getCollection(COLLECTIONS.INTERVIEW_QUESTIONS).doc(interview.currentQuestionId).get();
      if (currentQSnap.exists) {
        const qData = currentQSnap.data();
        return {
          interviewId,
          status: INTERVIEW_STATUS.IN_PROGRESS,
          questionIndex: interview.currentQuestionIndex,
          totalQuestions: interview.totalQuestions,
          currentQuestion: {
            id: currentQSnap.id,
            questionIndex: qData.questionIndex,
            questionText: qData.questionText,
            skill: qData.skill,
            difficulty: qData.difficulty,
            timeLimitSeconds: qData.timeLimitSeconds || 180
          }
        };
      }
    }

    // Fetch Job and candidate profile for AI
    const jobSnap = await getCollection(COLLECTIONS.JOBS).doc(interview.jobId).get();
    if (!jobSnap.exists) {
      throw ApiError.notFound('Associated job posting was not found');
    }
    const job = jobSnap.data();

    // Prioritize snapshot from interview creation; fallback to active candidate resume or user profile
    let candidateProfile = interview.candidateProfileSnapshot || user.candidateProfile || {};
    let resumeUpdates = {};

    if (!interview.candidateProfileSnapshot) {
      const resumeSnap = await getCollection(COLLECTIONS.RESUMES).doc(user.uid).get();
      if (resumeSnap.exists) {
        const rData = resumeSnap.data();
        candidateProfile = {
          ...candidateProfile,
          ...(rData.extractedProfile || {}),
          resumeId: user.uid,
          resumeVersion: rData.currentVersion || 1,
          resumeFilename: rData.originalName || rData.filename
        };
        resumeUpdates = {
          resumeId: user.uid,
          resumeVersion: rData.currentVersion || 1,
          resumeFilename: rData.originalName || rData.filename,
          candidateProfileSnapshot: candidateProfile
        };
      }
    }

    // 1. Generate First Question via Interviewer Agent (Agent 1)
    logger.info(`Generating first interview question for interview ${interviewId} with InterviewerAgent`);
    const firstQ = await agentOrchestrator.generateFirstQuestion({
      job,
      candidateProfile,
      maxQuestions: interview.totalQuestions
    });

    // 2. Save First Question
    const qDocRef = getCollection(COLLECTIONS.INTERVIEW_QUESTIONS).doc();
    const questionRecord = {
      id: qDocRef.id,
      interviewId,
      questionIndex: 1,
      questionText: firstQ.questionText,
      skill: firstQ.skill,
      difficulty: firstQ.difficulty,
      questionType: firstQ.questionType || 'scenario',
      selectionRationale: firstQ.selectionRationale || 'Initial opening question',
      expectedConcepts: firstQ.expectedConcepts || firstQ.expectedKeyPoints || [],
      expectedKeyPoints: firstQ.expectedKeyPoints || [],
      context: firstQ.context || '',
      timeLimitSeconds: 180,
      askedAt: toTimestamp()
    };
    await qDocRef.set(questionRecord);

    // 3. Update interview state to IN_PROGRESS
    const now = toTimestamp();
    const updates = {
      status: INTERVIEW_STATUS.IN_PROGRESS,
      startTime: now,
      currentQuestionIndex: 1,
      currentQuestionId: qDocRef.id,
      ...resumeUpdates,
      updatedAt: now
    };
    await interviewRef.update(updates);

    return {
      interviewId,
      status: INTERVIEW_STATUS.IN_PROGRESS,
      questionIndex: 1,
      totalQuestions: interview.totalQuestions,
      currentQuestion: {
        id: qDocRef.id,
        questionIndex: 1,
        questionText: firstQ.questionText,
        skill: firstQ.skill,
        difficulty: firstQ.difficulty,
        timeLimitSeconds: 180
      }
    };
  }

  /**
   * Submits an answer for the current question, evaluates it adaptively via Multi-Agent system,
   * saves evaluation and returns either next question or completes the interview
   */
  async submitAnswer(interviewId, user, { questionId, answerText, timeTakenSeconds }) {
    return agentOrchestrator.processAnswerAndDetermineNextStep({
      interviewId,
      user,
      questionId,
      answerText,
      timeTakenSeconds
    });
  }

  /**
   * Concludes an interview and triggers report generation via Agent Orchestrator
   */
  async endInterview(interviewId, user, { reason = 'candidate_completed' } = {}) {
    const interviewRef = getCollection(COLLECTIONS.INTERVIEWS).doc(interviewId);
    const interviewSnap = await interviewRef.get();

    if (!interviewSnap.exists) {
      throw ApiError.notFound('Interview not found');
    }
    const interview = interviewSnap.data();

    if (interview.candidateId !== user.uid && interview.recruiterId !== user.uid) {
      throw ApiError.forbidden('Forbidden: You are not authorized to end this interview');
    }

    if (interview.status === INTERVIEW_STATUS.COMPLETED) {
      throw ApiError.badRequest('Interview is already completed');
    }

    const jobSnap = await getCollection(COLLECTIONS.JOBS).doc(interview.jobId).get();
    const job = jobSnap.data();

    const report = await agentOrchestrator.finalizeInterviewSession({
      interviewId,
      user,
      job,
      reason
    });

    return {
      message: 'Interview session ended successfully',
      interviewId,
      status: INTERVIEW_STATUS.COMPLETED,
      reportId: report.id
    };
  }

  /**
   * Records proctoring / integrity events during the interview
   */
  async recordIntegrityEvent(interviewId, user, { eventType, details = {}, severity = 'medium', eventSource = 'browser_window', explanation = null }) {
    const interviewSnap = await getCollection(COLLECTIONS.INTERVIEWS).doc(interviewId).get();
    if (!interviewSnap.exists) {
      throw ApiError.notFound('Interview not found');
    }
    const interview = interviewSnap.data();

    if (interview.candidateId !== user.uid) {
      throw ApiError.forbidden('Forbidden: Integrity events can only be logged for your active interview');
    }

    return integrityService.recordEvent({
      interviewId,
      candidateId: user.uid,
      eventType,
      eventSource,
      metadata: details,
      severity,
      explanation
    });
  }

  /**
   * Retrieves chronological integrity timeline and pattern analysis for recruiter review
   */
  async getIntegrityTimeline(interviewId, user) {
    const interviewSnap = await getCollection(COLLECTIONS.INTERVIEWS).doc(interviewId).get();
    if (!interviewSnap.exists) {
      throw ApiError.notFound('Interview not found');
    }
    const interview = interviewSnap.data();

    if (user.role === ROLES.CANDIDATE && interview.candidateId !== user.uid) {
      throw ApiError.forbidden('Forbidden: You can only view events for your own interview');
    }
    if (user.role === ROLES.RECRUITER && interview.recruiterId !== user.uid) {
      throw ApiError.forbidden('Forbidden: You can only view events for jobs you manage');
    }

    const timeline = await integrityService.getChronologicalTimeline(interviewId);
    const analysis = integrityService.analyzeIntegrityPatterns(timeline, interview);

    return {
      interviewId,
      timeline,
      analysis
    };
  }

  /**
   * Recruiter updates review status of an integrity event
   */
  async reviewIntegrityEvent(interviewId, eventId, user, { reviewStatus, reviewNotes }) {
    const interviewSnap = await getCollection(COLLECTIONS.INTERVIEWS).doc(interviewId).get();
    if (!interviewSnap.exists) {
      throw ApiError.notFound('Interview not found');
    }
    const interview = interviewSnap.data();

    if (interview.recruiterId !== user.uid) {
      throw ApiError.forbidden('Forbidden: Only the managing recruiter can review integrity events');
    }

    return integrityService.updateReviewStatus(eventId, user.uid, reviewStatus, reviewNotes);
  }

  /**
   * Retrieves dedicated skill gap intelligence
   */
  async getSkillGapAnalysis(interviewId, user) {
    const interviewSnap = await getCollection(COLLECTIONS.INTERVIEWS).doc(interviewId).get();
    if (!interviewSnap.exists) {
      throw ApiError.notFound('Interview not found');
    }
    const interview = interviewSnap.data();

    if (user.role === ROLES.CANDIDATE && interview.candidateId !== user.uid) {
      throw ApiError.forbidden('Forbidden: You can only view skill gap data for your own interview');
    }
    if (user.role === ROLES.RECRUITER && interview.recruiterId !== user.uid) {
      throw ApiError.forbidden('Forbidden: You can only view skill gap data for jobs you manage');
    }

    const gapSnap = await getCollection(COLLECTIONS.SKILL_GAP_REPORTS)
      .where('interviewId', '==', interviewId)
      .get();

    if (gapSnap.empty) {
      throw ApiError.notFound('Skill gap report has not yet been generated');
    }

    return { id: gapSnap.docs[0].id, ...gapSnap.docs[0].data() };
  }

  /**
   * Internal helper to synthesize questions, answers, evaluations, and proctoring
   * into final interview_reports and skill_gap_reports documents with evidence linking
   */
  async _finalizeInterviewAndGenerateReport(interviewId, interview, job, reason = 'completed') {
    const now = toTimestamp();
    const startTime = interview.startTime ? new Date(interview.startTime) : new Date(interview.createdAt);
    const durationSeconds = Math.max(1, Math.round((new Date(now) - startTime) / 1000));

    // Gather all questions, answers, and evaluations
    const qSnap = await getCollection(COLLECTIONS.INTERVIEW_QUESTIONS)
      .where('interviewId', '==', interviewId)
      .get();
    const questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const aSnap = await getCollection(COLLECTIONS.INTERVIEW_ANSWERS)
      .where('interviewId', '==', interviewId)
      .get();
    const answers = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const eSnap = await getCollection(COLLECTIONS.SKILL_EVALUATIONS)
      .where('interviewId', '==', interviewId)
      .get();
    const evaluations = eSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const iSnap = await getCollection(COLLECTIONS.INTEGRITY_EVENTS)
      .where('interviewId', '==', interviewId)
      .get();
    const integrityEvents = iSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Chronological order for integrity events
    integrityEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const compiledQA = questions.map(q => {
      const a = answers.find(ans => ans.questionId === q.id);
      const ev = evaluations.find(e => e.questionId === q.id);
      return {
        question: q,
        answer: a,
        evaluation: ev
      };
    });

    // Fetch candidate profile & application context for evidence comparison (favoring immutable interview snapshot)
    const candSnap = await getCollection(COLLECTIONS.USERS).doc(interview.candidateId).get();
    const rawCandidate = candSnap.exists ? candSnap.data() : {};
    const candidate = {
      ...rawCandidate,
      candidateProfile: interview.candidateProfileSnapshot || rawCandidate.candidateProfile || {}
    };

    let application = {};
    if (interview.applicationId) {
      const appSnap = await getCollection(COLLECTIONS.APPLICATIONS).doc(interview.applicationId).get();
      if (appSnap.exists) application = appSnap.data();
    }

    // Generate evidence-based report through intelligence layer
    const evidenceReport = evidenceReportService.generateEvidenceBasedReport({
      job,
      interview,
      candidate,
      application,
      qaList: compiledQA,
      integrityEvents,
      completionReason: reason
    });

    // 1. Save Skill Gap Report
    const gapReportRef = getCollection(COLLECTIONS.SKILL_GAP_REPORTS).doc();
    const skillGapReportData = {
      id: gapReportRef.id,
      interviewId,
      candidateId: interview.candidateId,
      jobId: interview.jobId,
      readinessScore: evidenceReport.skillGapReport.readinessScore,
      summary: evidenceReport.skillGapReport.summary,
      skills: evidenceReport.skillGapReport.skillAnalyses,
      skillAnalyses: evidenceReport.skillGapReport.skillAnalyses,
      categories: evidenceReport.skillGapReport.categories || {},
      breakdown: evidenceReport.skillGapReport.breakdown || {},
      skillsAssessedCount: evidenceReport.skillGapReport.skillsAssessedCount,
      skillsUnassessedCount: evidenceReport.skillGapReport.skillsUnassessedCount,
      skillsDemonstratedCount: evidenceReport.skillGapReport.skillsDemonstratedCount,
      recommendedFollowUps: evidenceReport.skillGapReport.recommendedFollowUps,
      createdAt: now
    };
    await gapReportRef.set(skillGapReportData);

    // 2. Save Interview Report
    const reportRef = getCollection(COLLECTIONS.INTERVIEW_REPORTS).doc();
    const interviewReportData = {
      id: reportRef.id,
      interviewId,
      candidateId: interview.candidateId,
      jobId: interview.jobId,
      recruiterId: interview.recruiterId,
      resumeId: interview.resumeId || null,
      resumeVersion: interview.resumeVersion || null,
      resumeFilename: interview.resumeFilename || null,
      overallScore: evidenceReport.overallScore,
      summary: evidenceReport.summary,
      strengths: evidenceReport.strengths.map(s => s.point),
      evidenceBackedStrengths: evidenceReport.strengths,
      areasForImprovement: evidenceReport.areasForImprovement.map(a => a.point),
      evidenceBackedImprovements: evidenceReport.areasForImprovement,
      skillBreakdown: evidenceReport.skillGapReport.skillAnalyses.map(s => ({
        skill: s.skill,
        score: s.demonstratedScore !== null ? Math.round(s.demonstratedScore * 10) : 0,
        weight: s.weight,
        levelDemonstrated: s.demonstratedProficiency || 'not_assessed',
        feedback: s.gapDescription
      })),
      skillCategories: evidenceReport.skillGapReport.categories || {},
      adaptiveProgression: evidenceReport.adaptiveProgression,
      recruiterDecisionSupport: evidenceReport.recruiterDecisionSupport,
      integrityScore: evidenceReport.integrityReport.integrityScore,
      integrityIncidentCount: integrityEvents.length,
      integrityReport: evidenceReport.integrityReport,
      recommendation: evidenceReport.recruiterDecisionSupport.recommendation,
      hiringVerdict: evidenceReport.hiringVerdict || 'HIRE',
      recruiterTakeaway: evidenceReport.recruiterTakeaway || evidenceReport.summary,
      conceptCoveragePercentage: evidenceReport.conceptCoveragePercentage || 0,
      skillAssessments: evidenceReport.skillAssessments || {},
      nextRoundInterviewProbes: evidenceReport.nextRoundInterviewProbes || [],
      skillGapReportId: gapReportRef.id,
      completionReason: reason,
      generatedAt: now
    };
    await reportRef.set(interviewReportData);

    // 3. Update interview document status to completed (or terminated if reason specifies)
    const finalStatus = (reason === 'proctoring_violation' || reason === 'candidate_quit')
      ? INTERVIEW_STATUS.TERMINATED
      : INTERVIEW_STATUS.COMPLETED;

    await getCollection(COLLECTIONS.INTERVIEWS).doc(interviewId).update({
      status: finalStatus,
      endTime: now,
      durationSeconds,
      overallScore: evidenceReport.overallScore,
      reportId: reportRef.id,
      updatedAt: now
    });

    // 4. Update application status if applicable
    if (interview.applicationId) {
      try {
        await getCollection(COLLECTIONS.APPLICATIONS).doc(interview.applicationId).update({
          status: APPLICATION_STATUS.INTERVIEW_COMPLETED,
          updatedAt: now
        });
      } catch (err) {
        logger.warn(`Could not update application status: ${err.message}`);
      }
    }

    return interviewReportData;
  }
}

module.exports = new InterviewService();
