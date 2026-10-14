const {
  InterviewerAgent,
  AnswerEvaluationAgent,
  SkillGapAgent,
  FeedbackCoachAgent,
  IntegrityReviewAgent,
  agentOrchestrator
} = require('../src/services/agents');
const { QUESTION_DIFFICULTY, INTERVIEW_STATUS } = require('../src/constants/interviewStatus');
const { COLLECTIONS, getCollection } = require('../src/services/db/firestore.service');
const interviewService = require('../src/services/interview.service');
const { setupCandidate, setupRecruiter } = require('./testHelper');

describe('Multi-Agent Architecture & Autonomous Intelligence Agents', () => {
  const sampleJob = {
    id: 'job-agent-test',
    title: 'Senior Cloud Native Architect',
    description: 'Design distributed microservices, Kubernetes clusters, and event-driven architectures.',
    requiredSkills: [
      { name: 'Kubernetes', minimumLevel: 'advanced', weight: 3 },
      { name: 'Go', minimumLevel: 'intermediate', weight: 2 },
      { name: 'Distributed Systems', minimumLevel: 'advanced', weight: 3 }
    ],
    experienceLevel: 'Senior',
    evaluationCriteria: [
      'High availability design',
      'Container orchestration and networking',
      'Fault tolerance and consensus'
    ]
  };

  const sampleCandidateProfile = {
    headline: 'Senior Backend Engineer',
    experienceYears: 6,
    skills: ['Kubernetes', 'Go', 'Docker', 'PostgreSQL'],
    projects: [
      { name: 'K8s Ingress Controller', description: 'Built custom Envoy-based controller handling 50k req/s' }
    ]
  };

  // ========================================================
  // 1. Interviewer Agent Unit Tests
  // ========================================================
  describe('Agent 1: Interviewer Agent', () => {
    let agent;

    beforeAll(() => {
      agent = new InterviewerAgent();
    });

    it('should generate opening question with contract-validated schema matching senior role', async () => {
      const output = await agent.execute({
        job: sampleJob,
        candidateProfile: sampleCandidateProfile,
        stage: 'initial',
        history: [],
        questionIndex: 1,
        maxQuestions: 5
      });

      expect(output).toBeDefined();
      expect(typeof output.questionText).toBe('string');
      expect(output.questionText.length).toBeGreaterThanOrEqual(10);
      expect(output.skill).toBeTruthy();
      expect([
        QUESTION_DIFFICULTY.BEGINNER,
        QUESTION_DIFFICULTY.INTERMEDIATE,
        QUESTION_DIFFICULTY.ADVANCED
      ]).toContain(output.difficulty);
      expect(['conceptual', 'scenario', 'system_design', 'coding_logic', 'tradeoff']).toContain(output.questionType);
      expect(output.selectionRationale).toBeTruthy();
      expect(Array.isArray(output.expectedConcepts)).toBe(true);
      expect(output.expectedConcepts.length).toBeGreaterThanOrEqual(2);
    });

    it('should adapt question difficulty and avoid repetition based on evaluation history', async () => {
      const history = [
        {
          question: 'Explain the fundamental architecture and lifecycle of Kubernetes.',
          skill: 'Kubernetes',
          difficulty: QUESTION_DIFFICULTY.INTERMEDIATE,
          answer: 'Kubernetes operates on a control plane consisting of kube-apiserver, etcd, controller manager, and scheduler, with kubelet and kube-proxy on worker nodes.',
          evaluation: { score: 9.0, status: 'correct' }
        }
      ];

      const output = await agent.execute({
        job: sampleJob,
        candidateProfile: sampleCandidateProfile,
        stage: 'adaptive',
        history,
        skillEvidence: {
          targetNextSkill: 'Distributed Systems',
          targetDifficulty: QUESTION_DIFFICULTY.ADVANCED
        },
        questionIndex: 2,
        maxQuestions: 5
      });

      expect(output).toBeDefined();
      expect(output.skill).toBe('Distributed Systems');
      expect(output.difficulty).toBe(QUESTION_DIFFICULTY.ADVANCED);
      // Anti-repetition: Question text must not equal previous question
      expect(output.questionText).not.toBe(history[0].question);
    });

    it('should reject invalid input schemas lacking mandatory job title', async () => {
      await expect(agent.execute({
        job: { description: 'Missing title' },
        stage: 'initial'
      })).rejects.toThrow();
    });
  });

  // ========================================================
  // 2. Answer Evaluation Agent Unit Tests
  // ========================================================
  describe('Agent 2: Answer Evaluation Agent', () => {
    let agent;

    beforeAll(() => {
      agent = new AnswerEvaluationAgent();
    });

    it('should evaluate a strong answer, extracting verbatim evidence and applying rubric', async () => {
      const question = {
        questionText: 'How does Raft consensus elect a leader and maintain replicated state machine consistency?',
        skill: 'Distributed Systems',
        difficulty: QUESTION_DIFFICULTY.ADVANCED,
        expectedConcepts: ['Leader election', 'Heartbeat timeouts', 'Replicated log quorum commit']
      };

      const answer = 'In Raft consensus, nodes transition from Follower to Candidate when heartbeat timeouts expire. The candidate requests votes and becomes Leader upon receiving majority quorum. The leader then writes entries to its log and sends AppendEntries RPCs to commit to replicated state machines.';

      const output = await agent.execute({
        question,
        answer,
        job: sampleJob,
        candidateProfile: sampleCandidateProfile
      });

      expect(output.score).toBeGreaterThanOrEqual(7.0);
      expect(output.status).toBe('correct');
      expect(output.compositeScore).toBeGreaterThanOrEqual(70);
      expect(output.correctnessScore).toBeGreaterThanOrEqual(70);
      expect(output.completenessScore).toBeGreaterThanOrEqual(50);
      expect(output.matchedConcepts.length).toBeGreaterThan(0);
      expect(output.skillsDemonstrated).toContain('Distributed Systems');

      // Strict evidence verification: all evidence strings must exist verbatim in the candidate answer
      expect(output.evidence.length).toBeGreaterThan(0);
      for (const quote of output.evidence) {
        expect(answer.toLowerCase()).toContain(quote.toLowerCase());
      }
    });

    it('should distinguish an empty/missing answer from an incorrect answer', async () => {
      const question = {
        questionText: 'Explain goroutine scheduling in Go runtime.',
        skill: 'Go',
        expectedConcepts: ['M:N work-stealing scheduler', 'Network poller']
      };

      const output = await agent.execute({
        question,
        answer: '',
        job: sampleJob
      });

      expect(output.score).toBe(0);
      expect(output.status).toBe('incorrect_or_unclear');
      expect(output.evidence).toEqual([]);
      expect(output.explanation).toContain('Missing answer');
      expect(output.skillsDemonstrated).toEqual([]);
    });

    it('should reject invalid input without question text', async () => {
      await expect(agent.execute({
        question: { skill: 'Kubernetes' },
        answer: 'Some answer'
      })).rejects.toThrow();
    });
  });

  // ========================================================
  // 3. Skill-Gap Analysis Agent Unit Tests
  // ========================================================
  describe('Agent 3: Skill-Gap Analysis Agent', () => {
    let agent;

    beforeAll(() => {
      agent = new SkillGapAgent();
    });

    it('should distinguish unassessed skills from verified skill gaps', async () => {
      // Evaluations only exist for Kubernetes (scored well) and Go (scored low)
      const evaluations = [
        {
          skill: 'Kubernetes',
          score: 8.5,
          status: 'correct',
          evidence: ['Custom Envoy controller with 50k req/s'],
          matchedConcepts: ['Control plane', 'Custom resources'],
          missingConcepts: []
        },
        {
          skill: 'Go',
          score: 3.5,
          status: 'incorrect_or_unclear',
          evidence: ['basic channels'],
          matchedConcepts: ['Goroutines'],
          missingConcepts: ['Work-stealing scheduler', 'Garbage collection tuning']
        }
      ];

      const output = await agent.execute({
        job: sampleJob,
        candidateProfile: sampleCandidateProfile,
        evaluations,
        roundNumber: 2,
        totalRounds: 5
      });

      // Kubernetes must be in demonstrated skills
      expect(output.demonstratedSkills.some(s => s.skill === 'Kubernetes')).toBe(true);

      // Go must be identified as a verified gap skill
      expect(output.gapSkills.some(s => s.skill === 'Go')).toBe(true);

      // Distributed Systems was NOT assessed yet -> must be in unassessedSkills, NOT gapSkills!
      expect(output.unassessedSkills.some(s => s.skill === 'Distributed Systems')).toBe(true);
      expect(output.gapSkills.some(s => s.skill === 'Distributed Systems')).toBe(false);

      // Agent must recommend assessing the unassessed required skill next
      expect(output.recommendedNextSkill).toBe('Distributed Systems');
    });

    it('should identify unverified resume claims', async () => {
      const output = await agent.execute({
        job: sampleJob,
        candidateProfile: {
          skills: ['Distributed Systems', 'Kubernetes']
        },
        evaluations: [
          { skill: 'Kubernetes', score: 9.0 }
        ]
      });

      // Distributed Systems is claimed on resume but has not yet been assessed
      expect(output.unverifiedClaims.some(c => c.includes('Distributed Systems'))).toBe(true);
    });
  });

  // ========================================================
  // 4. Feedback & Career Coach Agent Unit Tests
  // ========================================================
  describe('Agent 4: Feedback & Career Coach Agent', () => {
    let agent;

    beforeAll(() => {
      agent = new FeedbackCoachAgent();
    });

    it('should refuse to generate report if interview is not completed', async () => {
      await expect(agent.execute({
        job: sampleJob,
        evaluations: [{ score: 8 }],
        isCompleted: false
      })).rejects.toThrow('completed');
    });

    it('should generate personalized report with evidence-backed strengths and prioritized learning plan', async () => {
      const evaluations = [
        {
          score: 8.5,
          skill: 'Kubernetes',
          strengths: ['Deep grasp of ingress controllers'],
          weaknesses: [],
          evidence: ['Built custom Envoy-based controller'],
          missingConcepts: []
        },
        {
          score: 4.0,
          skill: 'Go',
          strengths: ['Understands syntax'],
          weaknesses: ['Lacks concurrency safety'],
          evidence: ['Shared memory without mutex'],
          missingConcepts: ['Mutex sync', 'Race detector']
        }
      ];

      const qaList = [
        {
          question: { skill: 'Kubernetes', questionIndex: 1 },
          answer: { answerText: 'Built custom Envoy-based controller handling 50k req/s' },
          evaluation: evaluations[0]
        },
        {
          question: { skill: 'Go', questionIndex: 2 },
          answer: { answerText: 'Shared memory without mutex lock patterns' },
          evaluation: evaluations[1]
        }
      ];

      const skillGapReport = {
        demonstratedSkills: [{ skill: 'Kubernetes', score: 8.5, level: 'Proficient' }],
        partiallyDemonstratedSkills: [],
        gapSkills: [{ skill: 'Go', score: 4.0, missingConcepts: ['Mutex sync', 'Race detector'] }],
        unassessedSkills: []
      };

      const output = await agent.execute({
        job: sampleJob,
        candidate: { displayName: 'John Doe', candidateProfile: sampleCandidateProfile },
        evaluations,
        qaList,
        skillGapReport,
        isCompleted: true
      });

      expect(output.overallScore).toBeGreaterThanOrEqual(50);
      expect(output.summary).toBeTruthy();
      expect(output.evidenceBackedStrengths.length).toBeGreaterThan(0);
      expect(output.evidenceBackedImprovements.length).toBeGreaterThan(0);

      // Prioritized learning plan: Go must be high priority
      const goPlan = output.learningPlan.find(p => p.skill === 'Go');
      expect(goPlan).toBeDefined();
      expect(goPlan.priority).toBe('high');
      expect(goPlan.studyTopics.length).toBeGreaterThan(0);
      expect(goPlan.practiceQuestions.length).toBeGreaterThan(0);

      // Next round interview probes
      expect(output.nextRoundInterviewProbes.length).toBeGreaterThan(0);
      expect(output.nextRoundInterviewProbes[0].question).toBeTruthy();
      expect(output.nextRoundInterviewProbes[0].rationale).toBeTruthy();
      expect(output.objectiveVerdict).toBe('COMPLETED');
    });
  });

  // ========================================================
  // 5. Interview Integrity Review Agent Unit Tests
  // ========================================================
  describe('Agent 5: Interview Integrity Review Agent', () => {
    let agent;

    beforeAll(() => {
      agent = new IntegrityReviewAgent();
    });

    it('should evaluate clean session with no false positive cheating flags', async () => {
      const output = await agent.execute({
        interviewId: 'int-clean-1',
        integrityEvents: [],
        sessionDurationSeconds: 1200
      });

      expect(output.integrityScore).toBe(100);
      expect(output.incidentCount).toBe(0);
      expect(output.flags).toEqual([]);
      expect(output.humanReviewRecommended).toBe(false);
      expect(output.verdict).toBe('CLEAN');
    });

    it('should distinguish factual tab switches from unverified cheating accusations', async () => {
      const events = [
        {
          eventType: 'tab_switch',
          metadata: { durationMs: 4000 }
        },
        {
          eventType: 'tab_switch',
          metadata: { durationMs: 3000 }
        }
      ];

      const output = await agent.execute({
        interviewId: 'int-flagged-1',
        integrityEvents: events,
        sessionDurationSeconds: 600
      });

      expect(output.incidentCount).toBe(2);
      expect(output.flags.length).toBe(1);
      const flag = output.flags[0];

      // Factual observed fact
      expect(flag.observedFact).toContain('switched browser tabs 2 time(s)');
      // Inferred risk
      expect(flag.inferredRisk).toBeTruthy();
      // Honest uncertainty disclosure
      expect(flag.uncertainty).toContain('cannot distinguish');
      // Must not silently fail or penalize excessively
      expect(output.integrityScore).toBeGreaterThanOrEqual(70);
    });
  });

  // ========================================================
  // 6. Central Backend Multi-Agent Orchestrator Integration
  // ========================================================
  describe('Agent Orchestrator & End-to-End Autonomous Workflow', () => {
    let candidateUser, recruiterUser;
    let interviewId;

    beforeAll(async () => {
      recruiterUser = await setupRecruiter('rec-orch-1', 'Cloud Solutions Corp');
      candidateUser = await setupCandidate('cand-orch-1');

      // Create a test job in Firestore
      const jobDoc = getCollection(COLLECTIONS.JOBS).doc('job-orch-1');
      await jobDoc.set({
        id: 'job-orch-1',
        recruiterId: recruiterUser.uid,
        title: 'Cloud Native Engineer',
        description: 'Kubernetes and Go microservices',
        requiredSkills: [
          { name: 'Kubernetes', minimumLevel: 'intermediate', weight: 2 },
          { name: 'Go', minimumLevel: 'intermediate', weight: 2 }
        ],
        maxQuestions: 2,
        createdAt: new Date().toISOString()
      });

      // Schedule interview
      const interview = await interviewService.createInterview({
        jobId: 'job-orch-1',
        candidateId: candidateUser.uid,
        recruiterId: recruiterUser.uid
      });
      interviewId = interview.id;
    });

    let currentQId;

    it('Step 1: Orchestrator invokes Agent 1 to generate opening question', async () => {
      const startResult = await interviewService.startInterview(interviewId, candidateUser);

      expect(startResult).toBeDefined();
      expect(startResult.status).toBe(INTERVIEW_STATUS.IN_PROGRESS);
      expect(startResult.currentQuestion.questionIndex).toBe(1);
      expect(startResult.currentQuestion.questionText).toBeTruthy();
      expect(startResult.currentQuestion.skill).toBeTruthy();
      currentQId = startResult.currentQuestion.id;
    });

    it('Step 2: Cross-account security: Denies unauthorized candidate from answering', async () => {
      const imposter = await setupCandidate('cand-imposter-99');

      await expect(interviewService.submitAnswer(interviewId, imposter, {
        questionId: currentQId,
        answerText: 'Unauthorized malicious attempt'
      })).rejects.toThrow('Forbidden');
    });

    it('Step 3: Orchestrator accepts authentic candidate answer, executes Agent 2, persists evaluation, updates Agent 3, and generates adaptive Question 2 via Agent 1', async () => {
      const candidateAnswer = 'In Kubernetes, pod scheduling evaluates node affinity, taints, and resource limits to assign pods to appropriate cluster nodes with high reliability.';

      const result = await interviewService.submitAnswer(interviewId, candidateUser, {
        questionId: currentQId,
        answerText: candidateAnswer,
        timeTakenSeconds: 30
      });

      expect(result.isInterviewComplete).toBe(false);

      // Verify Agent 2 Evaluation output
      expect(result.evaluation).toBeDefined();
      expect(result.evaluation.score).toBeGreaterThan(0);
      expect(result.evaluation.matchedConcepts).toBeDefined();
      expect(result.evaluation.evidence.length).toBeGreaterThan(0);

      // Verify Agent 3 Skill-Gap output
      expect(result.skillGapFindings).toBeDefined();
      expect(result.skillGapFindings.recommendedNextSkill).toBeTruthy();

      // Verify Agent 1 Adaptive Next Question
      expect(result.nextQuestion).toBeDefined();
      expect(result.nextQuestion.questionIndex).toBe(2);
      expect(result.nextQuestion.questionText).toBeTruthy();

      // Verify answer persistence in Firestore
      const ansSnap = await getCollection(COLLECTIONS.INTERVIEW_ANSWERS).where('questionId', '==', currentQId).get();
      expect(ansSnap.empty).toBe(false);

      // Verify evaluation persistence in Firestore
      const evalSnap = await getCollection(COLLECTIONS.SKILL_EVALUATIONS).where('questionId', '==', currentQId).get();
      expect(evalSnap.empty).toBe(false);

      // Advance currentQId to question 2
      currentQId = result.nextQuestion.id;
    });

    it('Step 4: Orchestrator prevents duplicate answer submission for same question', async () => {
      const qSnap = await getCollection(COLLECTIONS.INTERVIEW_QUESTIONS).where('interviewId', '==', interviewId).get();
      const q1 = qSnap.docs.find(d => d.data().questionIndex === 1).data();

      await expect(interviewService.submitAnswer(interviewId, candidateUser, {
        questionId: q1.id,
        answerText: 'Duplicate submission attempt',
        timeTakenSeconds: 10
      })).rejects.toThrow();
    });

    it('Step 5: Submitting final answer triggers Agent 4 & 5 to synthesize final comprehensive report and mark interview COMPLETED', async () => {
      // Log a factual telemetry event
      await interviewService.recordIntegrityEvent(interviewId, candidateUser, {
        eventType: 'tab_switch',
        details: { durationMs: 2500 },
        severity: 'low'
      });

      const q2Answer = 'Go routines communicate via channels using select multiplexing to prevent deadlocks and race conditions.';

      const result = await interviewService.submitAnswer(interviewId, candidateUser, {
        questionId: currentQId,
        answerText: q2Answer,
        timeTakenSeconds: 25
      });

      expect(result.isInterviewComplete).toBe(true);
      expect(result.reportId).toBeDefined();
      expect(result.overallScore).toBeDefined();

      // Verify interview document status updated to COMPLETED
      const intDoc = await getCollection(COLLECTIONS.INTERVIEWS).doc(interviewId).get();
      expect(intDoc.data().status).toBe(INTERVIEW_STATUS.COMPLETED);

      // Verify final reports persisted in Firestore
      const reportDoc = await getCollection(COLLECTIONS.INTERVIEW_REPORTS).doc(result.reportId).get();
      expect(reportDoc.exists).toBe(true);
      const report = reportDoc.data();
      expect(report.candidateId).toBe(candidateUser.uid);
      expect(report.strengths.length).toBeGreaterThan(0);
      expect(report.learningPlan.length).toBeGreaterThan(0);
      expect(report.nextRoundInterviewProbes.length).toBeGreaterThan(0);
      expect(report.integrityScore).toBeDefined();
    });
  });
});
