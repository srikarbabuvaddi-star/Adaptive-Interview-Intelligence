const skillGapService = require('../src/services/intelligence/skillGap.service');
const { ASSESSMENT_STATUS, QUESTION_DIFFICULTY } = require('../src/constants/interviewStatus');

describe('Skill-Gap Intelligence Unit Tests', () => {
  const mockJob = {
    title: 'Senior Platform Engineer',
    requiredSkills: [
      { name: 'Kubernetes', minimumLevel: QUESTION_DIFFICULTY.ADVANCED, weight: 3 },
      { name: 'Go', minimumLevel: QUESTION_DIFFICULTY.INTERMEDIATE, weight: 2 },
      { name: 'Terraform', minimumLevel: QUESTION_DIFFICULTY.INTERMEDIATE, weight: 2 }
    ]
  };

  const mockCandidateProfile = {
    skills: ['Kubernetes', 'Go', 'Docker', 'Linux'],
    experienceYears: 5
  };

  const mockApplication = {
    candidateSkills: ['Kubernetes', 'Go']
  };

  it('should evaluate assessed skills with evidence citations and calculate demonstrated proficiency', () => {
    const qaList = [
      {
        question: {
          id: 'q-k8s-1',
          questionIndex: 1,
          skill: 'Kubernetes',
          difficulty: 'advanced',
          questionText: 'How do you configure custom controller reconciliation loops?'
        },
        answer: {
          answerText: 'We implement controller-runtime Reconciler interfaces with rate-limited workqueues and predicate event filtering.',
          timeTakenSeconds: 55
        },
        evaluation: {
          score: 8.5,
          feedback: 'Comprehensive understanding of controller reconciliation and event filtering.',
          strengths: ['Accurate controller-runtime knowledge']
        }
      },
      {
        question: {
          id: 'q-go-1',
          questionIndex: 2,
          skill: 'Go',
          difficulty: 'intermediate',
          questionText: 'Explain how context cancellation propagates across goroutines.'
        },
        answer: {
          answerText: 'context.WithCancel returns a Done channel that closes when canceled, propagating down the call tree.',
          timeTakenSeconds: 40
        },
        evaluation: {
          score: 7.0,
          feedback: 'Solid explanation of channel closure propagation.',
          strengths: ['Clear explanation of Done channel']
        }
      }
    ];

    const result = skillGapService.analyzeSkillGaps({
      job: mockJob,
      candidateProfile: mockCandidateProfile,
      application: mockApplication,
      qaList
    });

    expect(result.skillsAssessedCount).toBe(2);
    expect(result.skillsUnassessedCount).toBe(1); // Terraform was not assessed
    expect(result.skillsDemonstratedCount).toBe(2);
    expect(result.readinessScore).toBeGreaterThanOrEqual(70);

    // Verify Kubernetes analysis
    const k8sAnalysis = result.skillAnalyses.find(s => s.skill.toLowerCase() === 'kubernetes');
    expect(k8sAnalysis).toBeDefined();
    expect(k8sAnalysis.assessmentStatus).toBe(ASSESSMENT_STATUS.DEMONSTRATED);
    expect(k8sAnalysis.demonstratedScore).toBe(8.5);
    expect(k8sAnalysis.demonstratedProficiency).toBe(QUESTION_DIFFICULTY.ADVANCED);
    expect(k8sAnalysis.gapScore).toBe(0);
    expect(k8sAnalysis.resumeClaim.isClaimed).toBe(true);
    expect(k8sAnalysis.evidence.length).toBe(1);
    expect(k8sAnalysis.evidence[0].questionId).toBe('q-k8s-1');
    expect(k8sAnalysis.evidence[0].answerExcerpt).toContain('controller-runtime');
  });

  it('should NOT treat an unassessed skill as proof that the candidate lacks that skill', () => {
    // Only Kubernetes assessed; Terraform and Go unassessed
    const qaList = [
      {
        question: { id: 'q1', skill: 'Kubernetes', questionIndex: 1, questionText: 'Q1' },
        answer: { answerText: 'Answer 1' },
        evaluation: { score: 9.0 }
      }
    ];

    const result = skillGapService.analyzeSkillGaps({
      job: mockJob,
      candidateProfile: mockCandidateProfile,
      application: mockApplication,
      qaList
    });

    const terraformAnalysis = result.skillAnalyses.find(s => s.skill.toLowerCase() === 'terraform');
    expect(terraformAnalysis).toBeDefined();
    expect(terraformAnalysis.assessmentStatus).toBe(ASSESSMENT_STATUS.NOT_ASSESSED);
    expect(terraformAnalysis.demonstratedScore).toBeNull();
    expect(terraformAnalysis.confidence).toBe(0.0);
    expect(terraformAnalysis.gapScore).toBe(0); // Neutral gap
    expect(terraformAnalysis.gapDescription).toContain('Absence of evidence is not proof of absence of skill');
  });

  it('should distinguish unverified resume claims from demonstrated ability', () => {
    // Candidate claims 'Go' in resume, but Go is unassessed in this session
    const result = skillGapService.analyzeSkillGaps({
      job: mockJob,
      candidateProfile: { skills: ['Go'] },
      application: {},
      qaList: [] // Empty interview
    });

    const goAnalysis = result.skillAnalyses.find(s => s.skill.toLowerCase() === 'go');
    expect(goAnalysis.resumeClaim.isClaimed).toBe(true);
    expect(goAnalysis.assessmentStatus).toBe(ASSESSMENT_STATUS.NOT_ASSESSED);
    expect(goAnalysis.gapDescription).toContain('unverified by interview answers');
  });

  it('should generate targeted recruiter follow-up recommendations for unassessed and gap skills', () => {
    const qaList = [
      {
        question: { id: 'q1', skill: 'Kubernetes', questionIndex: 1, questionText: 'Q1' },
        answer: { answerText: 'Answer 1' },
        evaluation: { score: 4.0 } // Low score in Kubernetes (target was advanced)
      }
    ];

    const result = skillGapService.analyzeSkillGaps({
      job: mockJob,
      candidateProfile: mockCandidateProfile,
      application: mockApplication,
      qaList
    });

    expect(Array.isArray(result.recommendedFollowUps)).toBe(true);
    // Should recommend follow-up for Go and Terraform (unassessed) and Kubernetes (low score)
    expect(result.recommendedFollowUps.some(f => f.skill === 'Terraform')).toBe(true);
    expect(result.recommendedFollowUps.some(f => f.skill === 'Kubernetes')).toBe(true);
  });
});
