const { COLLECTIONS, getCollection } = require('./db/firestore.service');
const ApiError = require('../utils/apiError');
const { ROLES } = require('../constants/roles');

class ReportService {
  /**
   * Retrieves final report and skill gap report for a specific interview
   */
  async getInterviewReport(interviewId, user) {
    // 1. Fetch interview to verify authorization
    const interviewSnap = await getCollection(COLLECTIONS.INTERVIEWS).doc(interviewId).get();
    if (!interviewSnap.exists) {
      throw ApiError.notFound('Interview not found');
    }
    const interview = interviewSnap.data();

    if (user.role === ROLES.CANDIDATE && interview.candidateId !== user.uid) {
      throw ApiError.forbidden('Forbidden: You can only view reports for your own interviews');
    }
    if (user.role === ROLES.RECRUITER && interview.recruiterId !== user.uid) {
      throw ApiError.forbidden('Forbidden: You can only view reports for jobs you manage');
    }

    // 2. Fetch main report
    const reportSnap = await getCollection(COLLECTIONS.INTERVIEW_REPORTS)
      .where('interviewId', '==', interviewId)
      .get();

    if (reportSnap.empty) {
      throw ApiError.notFound('Report has not yet been generated for this interview session');
    }

    const report = { id: reportSnap.docs[0].id, ...reportSnap.docs[0].data() };

    // 3. Fetch skill gap report
    let skillGapReport = null;
    const gapSnap = await getCollection(COLLECTIONS.SKILL_GAP_REPORTS)
      .where('interviewId', '==', interviewId)
      .get();

    if (!gapSnap.empty) {
      skillGapReport = { id: gapSnap.docs[0].id, ...gapSnap.docs[0].data() };
    }

    // 4. Fetch questions, answers, and evaluations
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

    questions.sort((a, b) => a.questionIndex - b.questionIndex);

    const transcript = questions.map(q => {
      const a = answers.find(ans => ans.questionId === q.id);
      const ev = evaluations.find(e => e.questionId === q.id);
      return {
        questionIndex: q.questionIndex,
        questionText: q.questionText,
        skill: q.skill,
        difficulty: q.difficulty,
        candidateAnswer: a ? a.answerText : null,
        timeTakenSeconds: a ? a.timeTakenSeconds : null,
        score: ev ? ev.score : null,
        feedback: ev ? ev.feedback : null,
        strengths: ev ? ev.strengths : [],
        weaknesses: ev ? ev.weaknesses : []
      };
    });

    // Candidate sees only permitted interview information (scores, strengths, skill gaps, transcript)
    // Recruiter-specific internal decision notes & review flags are restricted to recruiters
    let sanitizedReport = { ...report };
    if (user.role === ROLES.CANDIDATE) {
      sanitizedReport = { ...report };
      delete sanitizedReport.recruiterDecisionSupport;
      if (sanitizedReport.integrityReport) {
        sanitizedReport.integrityReport = {
          integrityScore: sanitizedReport.integrityReport.integrityScore,
          observedFacts: sanitizedReport.integrityReport.observedFacts
        };
      }
    }

    return {
      report: sanitizedReport,
      skillGapReport,
      transcript,
      interviewMeta: {
        interviewId,
        jobId: interview.jobId,
        jobTitle: interview.jobTitle,
        durationSeconds: interview.durationSeconds,
        startTime: interview.startTime,
        endTime: interview.endTime,
        status: interview.status
      }
    };
  }

  /**
   * Retrieves all candidate reports for a job (recruiter only)
   */
  async getJobReports(jobId, recruiterId) {
    // Verify recruiter owns the job
    const jobSnap = await getCollection(COLLECTIONS.JOBS).doc(jobId).get();
    if (!jobSnap.exists) {
      throw ApiError.notFound('Job posting not found');
    }
    const job = jobSnap.data();

    if (job.recruiterId !== recruiterId) {
      throw ApiError.forbidden('Forbidden: You can only view reports for jobs you manage');
    }

    const reportsSnap = await getCollection(COLLECTIONS.INTERVIEW_REPORTS)
      .where('jobId', '==', jobId)
      .get();

    const reports = reportsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Fetch candidate names and details
    const candidateIds = [...new Set(reports.map(r => r.candidateId))];
    const candidateMap = {};

    for (const cId of candidateIds) {
      const userSnap = await getCollection(COLLECTIONS.USERS).doc(cId).get();
      if (userSnap.exists) {
        const u = userSnap.data();
        candidateMap[cId] = {
          displayName: u.displayName,
          email: u.email
        };
      }
    }

    const enrichedReports = reports.map(r => ({
      ...r,
      candidate: candidateMap[r.candidateId] || { displayName: 'Unknown', email: '' }
    }));

    // Sort by overall score descending (highest ranking candidate first)
    enrichedReports.sort((a, b) => b.overallScore - a.overallScore);

    return {
      jobId,
      jobTitle: job.title,
      totalInterviewsCompleted: enrichedReports.length,
      reports: enrichedReports
    };
  }
}

module.exports = new ReportService();
