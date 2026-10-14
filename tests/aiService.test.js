const GeminiAIService = require('../src/services/ai/gemini.service');
const { QUESTION_DIFFICULTY } = require('../src/constants/interviewStatus');

describe('AI Engine Service Integration', () => {
  let aiService;
  const mockJob = {
    title: 'Senior Distributed Systems Engineer',
    description: 'Build fault-tolerant event processing pipelines.',
    requiredSkills: [
      { name: 'Distributed Systems', minimumLevel: 'advanced', weight: 3 },
      { name: 'Go', minimumLevel: 'intermediate', weight: 2 }
    ],
    evaluationCriteria: ['Fault tolerance', 'Raft consensus', 'Throughput']
  };

  beforeAll(() => {
    aiService = new GeminiAIService();
  });

  it('should generate first interview question matching job specifications', async () => {
    const firstQ = await aiService.generateFirstQuestion({
      job: mockJob,
      candidateProfile: { skills: ['Go', 'Kafka'], experienceYears: 5 }
    });

    expect(firstQ).toBeDefined();
    expect(firstQ.questionText).toBeTruthy();
    expect(firstQ.skill).toBe('Distributed Systems');
    expect(firstQ.difficulty).toBe('advanced');
    expect(Array.isArray(firstQ.expectedKeyPoints)).toBe(true);
    expect(firstQ.expectedKeyPoints.length).toBeGreaterThan(0);
  });

  it('should evaluate candidate answer and adaptively generate next question with difficulty scaling', async () => {
    const currentQ = {
      questionText: 'Explain the Raft consensus algorithm and how leader election works.',
      skill: 'Distributed Systems',
      difficulty: QUESTION_DIFFICULTY.INTERMEDIATE,
      expectedKeyPoints: ['Leader election', 'Heartbeats', 'Log replication']
    };

    const strongAnswer = 'In Raft, consensus is achieved by having nodes transition among Follower, Candidate, and Leader states. When a follower misses election heartbeats, it increments term and solicits votes. Leaders manage replicated log state machines with quorum commits to preserve safety and linearizability against network partitions.';

    const result = await aiService.evaluateAnswerAndGenerateNextQuestion({
      job: mockJob,
      currentQuestion: currentQ,
      answer: strongAnswer,
      previousQA: [],
      skillScores: {},
      questionIndex: 1,
      maxQuestions: 3
    });

    expect(result.evaluation).toBeDefined();
    expect(result.evaluation.score).toBeGreaterThanOrEqual(7);
    expect(result.evaluation.strengths.length).toBeGreaterThan(0);
    expect(result.isInterviewComplete).toBe(false);
    expect(result.nextQuestion).toBeDefined();
    // Strong answer should scale difficulty to advanced
    expect(result.nextQuestion.difficulty).toBe(QUESTION_DIFFICULTY.ADVANCED);
  });

  it('should synthesize interview transcript and integrity events into final report', async () => {
    const qaList = [
      {
        question: { questionIndex: 1, skill: 'Distributed Systems', difficulty: 'advanced' },
        answer: { answerText: 'Comprehensive response on consensus' },
        evaluation: { score: 9, strengths: ['Depth'], weaknesses: [] }
      },
      {
        question: { questionIndex: 2, skill: 'Go', difficulty: 'intermediate' },
        answer: { answerText: 'Goroutines, channels, and select statement synchronization' },
        evaluation: { score: 8, strengths: ['Clarity'], weaknesses: [] }
      }
    ];

    const integrityEvents = [
      { eventType: 'tab_switch', severity: 'low' }
    ];

    const report = await aiService.generateFinalReport({
      job: mockJob,
      interview: { id: 'test-int-1', candidateId: 'test-cand-1' },
      questionsWithAnswersAndEvaluations: qaList,
      integrityEvents
    });

    expect(report.overallScore).toBeGreaterThanOrEqual(80);
    expect(report.recommendation).toBe('strong_hire');
    expect(report.integrityScore).toBe(95); // 100 - 5 for low severity event
    expect(report.skillGapReport.skills.length).toBe(mockJob.requiredSkills.length);
  });
});
