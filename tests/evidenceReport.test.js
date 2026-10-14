const evidenceReportService = require('../src/services/intelligence/evidenceReport.service');
const { INTERVIEW_STATUS, QUESTION_DIFFICULTY } = require('../src/constants/interviewStatus');

describe('Evidence-Based Report Generation Unit Tests', () => {
  const mockJob = {
    title: 'Senior Site Reliability Engineer',
    requiredSkills: [
      { name: 'Observability', minimumLevel: QUESTION_DIFFICULTY.ADVANCED, weight: 3 },
      { name: 'Incident Management', minimumLevel: QUESTION_DIFFICULTY.INTERMEDIATE, weight: 2 }
    ]
  };

  const mockInterview = {
    id: 'int-rep-test-1',
    candidateId: 'cand-rep-1',
    jobId: 'job-rep-1',
    recruiterId: 'rec-rep-1',
    status: INTERVIEW_STATUS.COMPLETED,
    totalQuestions: 2
  };

  const mockCandidate = {
    displayName: 'Sarah Connor',
    candidateProfile: {
      skills: ['Observability', 'Prometheus', 'Linux'],
      experienceYears: 6
    }
  };

  const mockQAList = [
    {
      question: {
        id: 'q-obs-1',
        questionIndex: 1,
        skill: 'Observability',
        difficulty: QUESTION_DIFFICULTY.INTERMEDIATE,
        questionText: 'How do you structure Prometheus metrics and alert thresholds to minimize alert fatigue?'
      },
      answer: {
        answerText: 'We use Google SRE multiwindow multi-burn-rate alerts based on SLO burn rather than static spike thresholds.',
        timeTakenSeconds: 50
      },
      evaluation: {
        score: 9.0,
        feedback: 'Superb knowledge of SLO burn-rate alerting.',
        strengths: ['Application of Google SRE multi-burn rate principles'],
        weaknesses: []
      }
    },
    {
      question: {
        id: 'q-obs-2',
        questionIndex: 2,
        skill: 'Incident Management',
        difficulty: QUESTION_DIFFICULTY.ADVANCED,
        questionText: 'Walk through leading a SEV-1 outage incident response from triage to postmortem.'
      },
      answer: {
        answerText: 'We designate an Incident Commander, establish dedicated comms, prioritize mitigation before root cause, and run blameless postmortems.',
        timeTakenSeconds: 60
      },
      evaluation: {
        score: 8.5,
        feedback: 'Clear command hierarchy and blameless culture understanding.',
        strengths: ['Clear Incident Commander delegation and blameless postmortem flow'],
        weaknesses: ['Could specify automated paging tools']
      }
    }
  ];

  it('should generate complete report linking strengths and weaknesses directly to answer citations', () => {
    const report = evidenceReportService.generateEvidenceBasedReport({
      job: mockJob,
      interview: mockInterview,
      candidate: mockCandidate,
      qaList: mockQAList,
      integrityEvents: [],
      completionReason: 'candidate_completed'
    });

    expect(report.overallScore).toBe(88); // (9.0 + 8.5) / 2 * 10 = 87.5 -> 88
    expect(report.isCompleteSession).toBe(true);

    // Verify strengths are linked to citations
    expect(report.strengths.length).toBeGreaterThan(0);
    const firstStrength = report.strengths[0];
    expect(firstStrength.citation).toBeDefined();
    expect(firstStrength.citation.questionIndex).toBe(1);
    expect(firstStrength.citation.answerExcerpt).toContain('multi-burn-rate');

    // Verify decision support recommendation
    expect(report.recruiterDecisionSupport.recommendation).toBe('strong_hire');
    expect(report.recruiterDecisionSupport.confidenceLevel).toBeGreaterThanOrEqual(0.85);

    // Verify adaptive progression summary
    expect(report.adaptiveProgression.length).toBe(2);
    expect(report.adaptiveProgression[0].step).toBe(1);
    expect(report.adaptiveProgression[0].difficultyShift).toBe('initial');
  });

  it('should handle incomplete or interrupted sessions without claiming complete evaluation', () => {
    const incompleteInterview = {
      ...mockInterview,
      status: INTERVIEW_STATUS.IN_PROGRESS,
      totalQuestions: 5
    };

    const partialQAList = [mockQAList[0]]; // Only 1 question completed

    const report = evidenceReportService.generateEvidenceBasedReport({
      job: mockJob,
      interview: incompleteInterview,
      candidate: mockCandidate,
      qaList: partialQAList,
      integrityEvents: [],
      completionReason: 'session_in_progress'
    });

    expect(report.isCompleteSession).toBe(false);
    expect(report.summary).toContain('Assessment is preliminary');
    expect(report.recruiterDecisionSupport.recommendation).toBe('lean_no_hire');
    expect(report.recruiterDecisionSupport.keyRationale).toContain('insufficient evidence');
  });

  it('should handle terminated sessions due to proctoring violation or candidate quit', () => {
    const terminatedInterview = {
      ...mockInterview,
      status: INTERVIEW_STATUS.TERMINATED
    };

    const report = evidenceReportService.generateEvidenceBasedReport({
      job: mockJob,
      interview: terminatedInterview,
      candidate: mockCandidate,
      qaList: mockQAList,
      integrityEvents: [],
      completionReason: 'proctoring_violation'
    });

    expect(report.recruiterDecisionSupport.recommendation).toBe('no_hire');
    expect(report.recruiterDecisionSupport.keyRationale).toContain('terminated early');
  });
});
