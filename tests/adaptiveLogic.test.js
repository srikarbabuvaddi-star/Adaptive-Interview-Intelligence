const adaptiveLogicService = require('../src/services/intelligence/adaptiveLogic.service');
const { QUESTION_DIFFICULTY } = require('../src/constants/interviewStatus');

describe('Adaptive Interview Logic Integration Tests', () => {
  describe('Deterministic Concept Completeness & Answer Evaluation (answer_evaluation.py)', () => {
    it('should compute combined score deterministically as 0.60 * correctness + 0.40 * completeness', () => {
      const result = adaptiveLogicService.calculateDeterministicEvaluation({
        question: 'What is a Python function?',
        candidateAnswer: 'A function is a reusable block of code that takes parameters.',
        expectedConcepts: ['Reusable block of code', 'Parameters', 'Return values'],
        rawCorrectness: 90,
        rawMatchedConcepts: ['Reusable block of code', 'Parameters'],
        rawEvidence: ['A function is a reusable block of code']
      });

      // 2 matched out of 3 expected -> completeness = 67%
      expect(result.completenessScore).toBe(67);
      expect(result.correctnessScore).toBe(90);
      // 0.60 * 90 + 0.40 * 67 = 54 + 26.8 = 80.8 -> 81
      expect(result.score).toBe(81);
      expect(result.status).toBe('correct');
      expect(result.matchedConcepts).toEqual(['Reusable block of code', 'Parameters']);
      expect(result.missingConcepts).toEqual(['Return values']);
      expect(result.evidence).toContain('A function is a reusable block of code');
    });

    it('should classify as partially_correct when score is between 40 and 74', () => {
      const result = adaptiveLogicService.calculateDeterministicEvaluation({
        question: 'Explain mutable default arguments in Python.',
        candidateAnswer: 'They are shared across calls.',
        expectedConcepts: ['definition time binding', 'shared list problem', 'None sentinel'],
        rawCorrectness: 60,
        rawMatchedConcepts: ['shared list problem']
      });

      // 1 matched out of 3 expected -> completeness = 33%
      expect(result.completenessScore).toBe(33);
      // 0.60 * 60 + 0.40 * 33 = 36 + 13.2 = 49.2 -> 49
      expect(result.score).toBe(49);
      expect(result.status).toBe('partially_correct');
      expect(result.missingConcepts).toContain('None sentinel');
    });

    it('should return 0 score and incorrect_or_unclear for empty candidate answer', () => {
      const result = adaptiveLogicService.calculateDeterministicEvaluation({
        question: 'What is polymorphism?',
        candidateAnswer: '   ',
        expectedConcepts: ['Method overriding', 'Subtyping', 'Dynamic dispatch']
      });

      expect(result.score).toBe(0);
      expect(result.status).toBe('incorrect_or_unclear');
      expect(result.matchedConcepts).toHaveLength(0);
      expect(result.missingConcepts).toHaveLength(3);
    });
  });

  describe('Two-Dimensional Adaptive Decision Engine (adaptive_questions.py)', () => {
    it('should escalate difficulty on correct answer when consecutive depth < 2', () => {
      const decision = adaptiveLogicService.selectNextAdaptiveSkillAndDifficulty({
        skills: ['Python', 'SQL', 'Algorithms'],
        currentSkill: 'Python',
        currentDifficulty: 'easy',
        status: 'correct',
        skillStats: {
          Python: { questions_asked: 1, consecutive: 1, difficulty: 'easy' },
          SQL: { questions_asked: 0, consecutive: 0, difficulty: 'easy' },
          Algorithms: { questions_asked: 0, consecutive: 0, difficulty: 'easy' }
        },
        roundNumber: 1,
        totalRounds: 6
      });

      expect(decision.action).toBe('increase_difficulty');
      expect(decision.nextSkill).toBe('Python');
      expect(decision.nextDifficulty).toBe('medium');
      expect(decision.mustSwitchSkill).toBe(false);
    });

    it('should force rotate to next skill when max consecutive depth (2) is reached to ensure resume coverage', () => {
      const decision = adaptiveLogicService.selectNextAdaptiveSkillAndDifficulty({
        skills: ['Python', 'SQL', 'Algorithms'],
        currentSkill: 'Python',
        currentDifficulty: 'medium',
        status: 'correct',
        skillStats: {
          Python: { questions_asked: 2, consecutive: 2, difficulty: 'medium' },
          SQL: { questions_asked: 0, consecutive: 0, difficulty: 'easy' },
          Algorithms: { questions_asked: 0, consecutive: 0, difficulty: 'easy' }
        },
        roundNumber: 2,
        totalRounds: 6
      });

      expect(decision.action).toBe('switch_skill');
      expect(decision.mustSwitchSkill).toBe(true);
      expect(decision.nextSkill).toBe('SQL'); // unvisited skill prioritized
    });

    it('should force rotate when remaining rounds equal unvisited skills count to guarantee 100% coverage', () => {
      const decision = adaptiveLogicService.selectNextAdaptiveSkillAndDifficulty({
        skills: ['Python', 'SQL', 'Algorithms'],
        currentSkill: 'Python',
        currentDifficulty: 'easy',
        status: 'correct',
        skillStats: {
          Python: { questions_asked: 1, consecutive: 1, difficulty: 'easy' },
          SQL: { questions_asked: 0, consecutive: 0, difficulty: 'easy' },
          Algorithms: { questions_asked: 0, consecutive: 0, difficulty: 'easy' }
        },
        roundNumber: 4,
        totalRounds: 6 // rounds_remaining = 2, unvisited = 2 (SQL, Algorithms)
      });

      expect(decision.mustSwitchSkill).toBe(true);
      expect(decision.action).toBe('switch_skill');
      expect(decision.reason).toContain('100% skill coverage');
    });

    it('should decrease difficulty when candidate struggles (incorrect_or_unclear)', () => {
      const decision = adaptiveLogicService.selectNextAdaptiveSkillAndDifficulty({
        skills: ['Python'],
        currentSkill: 'Python',
        currentDifficulty: 'hard',
        status: 'incorrect_or_unclear',
        skillStats: {
          Python: { questions_asked: 1, consecutive: 1, difficulty: 'hard' }
        },
        roundNumber: 1,
        totalRounds: 3
      });

      expect(decision.action).toBe('decrease_difficulty');
      expect(decision.nextDifficulty).toBe('medium');
    });
  });

  describe('Difficulty-Weighted Skill Scoring & Proficiency Tiers (skill_scoring.py)', () => {
    it('should apply difficulty weights (Easy: 1.0, Medium: 1.15, Hard: 1.30)', () => {
      const questions = [
        {
          questionText: 'Q1 easy',
          difficulty: 'easy',
          score: 80,
          correctnessScore: 80,
          completenessScore: 80,
          expectedConcepts: ['C1', 'C2'],
          matchedConcepts: ['C1', 'C2'],
          missingConcepts: []
        },
        {
          questionText: 'Q2 hard',
          difficulty: 'hard',
          score: 90,
          correctnessScore: 90,
          completenessScore: 90,
          expectedConcepts: ['C3', 'C4'],
          matchedConcepts: ['C3', 'C4'],
          missingConcepts: []
        }
      ];

      const dossier = adaptiveLogicService.calculateSkillScore({
        skill: 'Distributed Systems',
        questions
      });

      // Total weights: 1.0 (easy) + 1.30 (hard) = 2.30
      // Weighted sum: 80 * 1.0 + 90 * 1.30 = 80 + 117 = 197
      // Score: 197 / 2.30 = 85.65 -> 86
      expect(dossier.score).toBe(86);
      expect(dossier.level).toBe('Advanced');
      expect(dossier.conceptCoveragePercentage).toBe(100);
      expect(dossier.missingConcepts).toHaveLength(0);
    });

    it('should classify lower scoring skills as Needs Improvement or Competent with persistent gaps', () => {
      const questions = [
        {
          questionText: 'Q1',
          difficulty: 'easy',
          score: 45,
          correctnessScore: 40,
          completenessScore: 50,
          expectedConcepts: ['Pointers', 'Memory allocation', 'Garbage collection'],
          matchedConcepts: ['Pointers'],
          missingConcepts: ['Memory allocation', 'Garbage collection']
        }
      ];

      const dossier = adaptiveLogicService.calculateSkillScore({
        skill: 'C++',
        questions
      });

      expect(dossier.score).toBe(45);
      expect(dossier.level).toBe('Needs Improvement');
      expect(dossier.missingConcepts).toEqual(['Memory allocation', 'Garbage collection']);
      expect(dossier.conceptCoveragePercentage).toBe(33.3);
    });
  });

  describe('Next-Round Probes for Hiring Managers (main.py)', () => {
    it('should generate targeted probes for identified missing concepts and weak skills', () => {
      const probes = adaptiveLogicService.generateHiringManagerProbes({
        jobRole: 'Backend Engineer',
        experienceLevel: 'Senior',
        missingConcepts: ['Raft consensus', 'Log compaction'],
        weakSkills: ['Distributed Systems']
      });

      expect(probes.length).toBeGreaterThanOrEqual(2);
      expect(probes[0].question).toContain('Raft consensus');
      expect(probes[0].rationale).toContain('did not demonstrate');
    });
  });
});
