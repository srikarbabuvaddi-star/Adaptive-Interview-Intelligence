const request = require('supertest');
const app = require('../src/app');
const { setupRecruiter, setupCandidate } = require('./testHelper');

describe('Full End-to-End 12-Step Adaptive Interview Integration Workflow', () => {
  let recruiter, candidate;
  let jobId, applicationId, interviewId;
  let firstQuestionId, secondQuestionId;

  // Step 1 & 2: Recruiter registers and creates a job with defined skills and evaluation criteria
  it('Step 1 & 2: Recruiter registers and defines job with required skills & rubric criteria', async () => {
    recruiter = await setupRecruiter('rec-e2e', 'Stripe Payments Labs');

    const jobRes = await request(app)
      .post('/api/jobs')
      .set(recruiter.header)
      .send({
        title: 'Principal Backend Engineer',
        description: 'Design distributed ledger consensus, transactional consistency, and fault-tolerant APIs.',
        department: 'Payments Core',
        location: 'Remote',
        employmentType: 'full-time',
        requiredSkills: [
          { name: 'Distributed Systems', minimumLevel: 'advanced', weight: 3 },
          { name: 'PostgreSQL', minimumLevel: 'intermediate', weight: 2 },
          { name: 'Node.js', minimumLevel: 'intermediate', weight: 2 }
        ],
        evaluationCriteria: [
          'ACID transaction isolation levels',
          'Distributed consensus and two-phase commit',
          'Idempotency and retry semantics'
        ],
        maxQuestions: 2,
        targetDurationMinutes: 15
      });

    expect(jobRes.status).toBe(201);
    expect(jobRes.body.data.id).toBeDefined();
    jobId = jobRes.body.data.id;
  });

  // Step 3: Candidate registers, applies, and receives interview session
  it('Step 3: Candidate registers, applies, and receives authorized interview session', async () => {
    candidate = await setupCandidate('cand-e2e', ['Distributed Systems', 'Node.js']);

    // Candidate applies for job
    const appRes = await request(app)
      .post(`/api/jobs/${jobId}/applications`)
      .set(candidate.header)
      .send({
        resumeUrl: 'https://example.com/candidate-resume.pdf',
        coverNote: 'Deep background in distributed banking infrastructure.',
        candidateSkills: ['Distributed Systems', 'Node.js', 'Redis']
      });

    expect(appRes.status).toBe(201);
    applicationId = appRes.body.data.id;

    // Recruiter schedules interview session
    const intRes = await request(app)
      .post('/api/interviews')
      .set(recruiter.header)
      .send({
        jobId,
        candidateId: candidate.uid,
        applicationId
      });

    expect(intRes.status).toBe(201);
    expect(intRes.body.data.status).toBe('scheduled');
    interviewId = intRes.body.data.id;
  });

  // Step 4 & 5: Candidate starts the interview and AI engine generates 1st question
  it('Step 4 & 5: Candidate starts interview session and receives first AI question', async () => {
    const startRes = await request(app)
      .post(`/api/interviews/${interviewId}/start`)
      .set(candidate.header);

    expect(startRes.status).toBe(200);
    expect(startRes.body.data.status).toBe('in_progress');
    expect(startRes.body.data.questionIndex).toBe(1);
    expect(startRes.body.data.currentQuestion).toBeDefined();
    expect(startRes.body.data.currentQuestion.questionText).toBeTruthy();

    firstQuestionId = startRes.body.data.currentQuestion.id;
  });

  // Step 6, 7 & 8: Candidate submits answer 1, AI evaluates, adapts next question, backend persists
  it('Step 6, 7 & 8: Candidate submits answer 1, AI evaluates, adapts next question, persists evidence', async () => {
    const ans1Res = await request(app)
      .post(`/api/interviews/${interviewId}/answers`)
      .set(candidate.header)
      .send({
        questionId: firstQuestionId,
        answerText: 'In distributed transaction design, we use two-phase commit or saga orchestrations with idempotency keys. For database isolation, PostgreSQL read committed prevents dirty reads, but repeatable read or serializable is required to avoid phantom reads and write skew.',
        timeTakenSeconds: 50
      });

    expect(ans1Res.status).toBe(200);
    expect(ans1Res.body.data.isInterviewComplete).toBe(false);
    expect(ans1Res.body.data.evaluation).toBeDefined();
    expect(ans1Res.body.data.evaluation.score).toBeGreaterThanOrEqual(7);
    expect(ans1Res.body.data.nextQuestion).toBeDefined();

    secondQuestionId = ans1Res.body.data.nextQuestion.id;
  });

  // Step 9: Proctoring events logged and timeline processed
  it('Step 9: Proctoring / integrity telemetry is recorded and processed into timeline', async () => {
    const eventRes = await request(app)
      .post(`/api/interviews/${interviewId}/integrity-events`)
      .set(candidate.header)
      .send({
        eventType: 'tab_switch',
        details: { durationMs: 1200 },
        severity: 'low'
      });

    expect(eventRes.status).toBe(201);
    expect(eventRes.body.data.eventType).toBe('tab_switch');
  });

  // Step 10: Candidate submits answer 2, completing interview and triggering report generation
  it('Step 10: Candidate submits answer 2, completing interview and triggering final evidence report', async () => {
    const ans2Res = await request(app)
      .post(`/api/interviews/${interviewId}/answers`)
      .set(candidate.header)
      .send({
        questionId: secondQuestionId,
        answerText: 'In PostgreSQL, we optimize connection pools via PgBouncer and partition large ledger tables by date ranges while tuning vacuum settings to manage dead tuples.',
        timeTakenSeconds: 45
      });

    expect(ans2Res.status).toBe(200);
    expect(ans2Res.body.data.isInterviewComplete).toBe(true);
    expect(ans2Res.body.data.reportId).toBeDefined();
    expect(ans2Res.body.data.overallScore).toBeDefined();
  });

  // Step 11: Candidate sees only permitted interview information
  it('Step 11: Candidate views their report, seeing only permitted information', async () => {
    const repRes = await request(app)
      .get(`/api/interviews/${interviewId}/report`)
      .set(candidate.header);

    expect(repRes.status).toBe(200);
    expect(repRes.body.success).toBe(true);

    const { report, skillGapReport, transcript } = repRes.body.data;
    expect(report.overallScore).toBeGreaterThanOrEqual(60);
    expect(report.strengths.length).toBeGreaterThan(0);
    expect(Array.isArray(transcript)).toBe(true);
    expect(skillGapReport.readinessScore).toBeDefined();

    // Sensitive recruiter-only decision support must NOT be exposed to candidate
    expect(report.recruiterDecisionSupport).toBeUndefined();
  });

  // Step 12: Recruiter sees authorized candidate report, supporting evidence, and assessment summary
  it('Step 12: Recruiter views comprehensive evidence-based report, progression, and decision support', async () => {
    const repRes = await request(app)
      .get(`/api/interviews/${interviewId}/report`)
      .set(recruiter.header);

    expect(repRes.status).toBe(200);
    const { report, skillGapReport } = repRes.body.data;

    // Recruiter sees full decision support and recommendation
    expect(report.recruiterDecisionSupport).toBeDefined();
    expect(report.recruiterDecisionSupport.recommendation).toMatch(/hire|strong_hire|lean_hire/);
    expect(report.recruiterDecisionSupport.keyRationale).toBeTruthy();

    // Recruiter sees evidence citations
    expect(report.evidenceBackedStrengths).toBeDefined();
    expect(report.evidenceBackedStrengths[0].citation).toBeDefined();

    // Recruiter sees adaptive progression summary
    expect(report.adaptiveProgression).toBeDefined();
    expect(report.adaptiveProgression.length).toBe(2);

    // Recruiter sees skill gap breakdown
    const analyses = skillGapReport.skillAnalyses || skillGapReport.skills;
    expect(Array.isArray(analyses)).toBe(true);
    expect(analyses.length).toBeGreaterThanOrEqual(3);
    const unassessed = analyses.find(s => s.skill.toLowerCase() === 'node.js' || s.skill.toLowerCase() === 'terraform');
    if (unassessed && unassessed.assessmentStatus === 'not_assessed') {
      expect(unassessed.confidence).toBe(0.0);
    }
  });

  it('Step 12 (bonus): Recruiter views dedicated integrity timeline and reviews an event', async () => {
    const timelineRes = await request(app)
      .get(`/api/interviews/${interviewId}/integrity-timeline`)
      .set(recruiter.header);

    expect(timelineRes.status).toBe(200);
    expect(Array.isArray(timelineRes.body.data.timeline)).toBe(true);
    expect(timelineRes.body.data.analysis.integrityScore).toBeGreaterThanOrEqual(90);

    const eventId = timelineRes.body.data.timeline[0]?.id;
    if (eventId) {
      const reviewRes = await request(app)
        .patch(`/api/interviews/${interviewId}/integrity-events/${eventId}/review`)
        .set(recruiter.header)
        .send({
          reviewStatus: 'reviewed',
          reviewNotes: 'Verified brief tab switch; acceptable behavior.'
        });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.reviewStatus).toBe('reviewed');
    }
  });
});
