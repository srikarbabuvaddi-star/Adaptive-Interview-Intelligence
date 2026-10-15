const request = require('supertest');
const app = require('../src/app');
const {
  registry,
  dispatcher,
  taskStore,
  createA2AClient,
  TASK_STATES
} = require('../src/a2a');
const { TaskState } = require('@a2a-js/sdk');
const agentOrchestrator = require('../src/services/agents/agentOrchestrator');
const { COLLECTIONS, getCollection, toTimestamp } = require('../src/services/db/firestore.service');
const { INTERVIEW_STATUS, QUESTION_DIFFICULTY } = require('../src/constants/interviewStatus');
const { setupCandidate, setupRecruiter, authHeader } = require('./testHelper');

describe('TASK 3: Agent2Agent (A2A) Protocol Integration', () => {
  jest.setTimeout(60000);

  let candidateA;
  let candidateB;
  let recruiter;
  let job;
  let interviewA;
  let questionA1;

  beforeAll(async () => {
    candidateA = await setupCandidate('cand-a2a-alice', ['Python', 'FastAPI', 'Redis']);
    candidateB = await setupCandidate('cand-a2a-bob', ['Java', 'Spring Boot']);
    recruiter = await setupRecruiter('rec-a2a-lead', 'Nexus Distributed Systems');

    // Create a Job
    const jobRes = await request(app)
      .post('/api/jobs')
      .set(recruiter.header)
      .send({
        title: 'Senior Distributed Systems Architect',
        description: 'Architect low-latency distributed microservices with Redis caching and FastAPI backends.',
        department: 'Cloud Infrastructure',
        location: 'Remote',
        employmentType: 'full-time',
        experienceLevel: 'senior',
        requiredSkills: [
          { name: 'FastAPI', minimumLevel: 'intermediate', weight: 1.2 },
          { name: 'Redis', minimumLevel: 'intermediate', weight: 1.0 },
          { name: 'Distributed Systems', minimumLevel: 'advanced', weight: 1.5 }
        ],
        maxQuestions: 2,
        evaluationCriteria: ['Concurrency resilience', 'Distributed state management']
      });

    job = jobRes.body.data;

    // Candidate A schedules and starts an interview
    const scheduleRes = await request(app)
      .post('/api/interviews')
      .set(candidateA.header)
      .send({ jobId: job.id, maxQuestions: 2 });

    const interviewId = scheduleRes.body.data.id;

    const startRes = await request(app)
      .post(`/api/interviews/${interviewId}/start`)
      .set(candidateA.header);

    interviewA = { id: startRes.body.data.interviewId, ...startRes.body.data };
    questionA1 = startRes.body.data.currentQuestion;
  });

  describe('1. A2A Agent Directory & Discovery Protocol', () => {
    it('GET /api/a2a/directory should return all 4 specialized agents in standard A2A format', async () => {
      const res = await request(app).get('/api/a2a/directory');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.protocol).toBe('a2a');
      expect(res.body.version).toBe('1.0');
      expect(res.body.agentsCount).toBe(4);

      const agentIds = res.body.agents.map(a => a.agentId);
      expect(agentIds).toContain('evaluation-agent');
      expect(agentIds).toContain('skill-gap-agent');
      expect(agentIds).toContain('interviewer-agent');
      expect(agentIds).toContain('feedback-coach-agent');
    });

    it('GET /.well-known/agent.json root discovery should return the agent registry directory', async () => {
      const res = await request(app).get('/.well-known/agent.json');
      expect(res.status).toBe(200);
      expect(res.body.agentsCount).toBe(4);
    });

    it('GET /api/a2a/agents/:agentId/card should return individual agent card and capabilities', async () => {
      const res = await request(app).get('/api/a2a/agents/evaluation-agent/card');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const card = res.body.agentCard;
      expect(card.name).toBe('evaluation-agent');
      expect(card.displayName).toBe('Answer Evaluation Agent');
      expect(card.skills.length).toBeGreaterThanOrEqual(1);
      expect(card.skills[0].id).toBe('evaluate_answer');
      expect(card.defaultInputSchema).toBeDefined();
      expect(card.defaultOutputSchema).toBeDefined();
    });

    it('GET /api/a2a/agents/:agentId/card should return 404 for unknown agent id', async () => {
      const res = await request(app).get('/api/a2a/agents/non-existent-agent/card');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Direct Protocol Task Execution via A2A Client', () => {
    const a2aClient = createA2AClient();

    it('Evaluation Agent: should evaluate candidate answer and return structured task artifact', async () => {
      const task = await a2aClient.submitTask('evaluation-agent', {
        contextId: interviewA.id,
        correlationId: 'corr-eval-test-1',
        input: {
          question: {
            questionText: 'Explain how you configure Redis cluster sentinel and handle cache penetration.',
            skill: 'Redis',
            difficulty: 'intermediate'
          },
          answer: 'We configure Redis Sentinel with quorum of 2 nodes and use Bloom filters to prevent cache penetration on missing keys.',
          job: { title: 'Distributed Systems Architect' }
        }
      });

      expect(task).toBeDefined();
      expect(task.id).toMatch(/^task_/);
      expect(task.status.state).toBe(TaskState.TASK_STATE_COMPLETED);
      expect(task.artifacts.length).toBeGreaterThan(0);

      const output = task.output;
      expect(output.score).toBeGreaterThanOrEqual(0);
      expect(output.evidence.length).toBeGreaterThan(0);
      expect(output.matchedConcepts).toBeDefined();
    });

    it('Skill-Gap Agent: should analyze evaluations and recommend next adaptive skill probe', async () => {
      const task = await a2aClient.submitTask('skill-gap-agent', {
        contextId: interviewA.id,
        correlationId: 'corr-gap-test-1',
        input: {
          job: {
            title: 'Senior Distributed Systems Architect',
            requiredSkills: [
              { name: 'FastAPI', minimumLevel: 'intermediate', weight: 1.2 },
              { name: 'Redis', minimumLevel: 'intermediate', weight: 1.0 }
            ]
          },
          candidateProfile: { skills: ['Python', 'Redis'] },
          evaluations: [
            {
              skill: 'Redis',
              score: 9.0,
              status: 'correct',
              evidence: ['Sentinel quorum']
            }
          ],
          roundNumber: 1,
          totalRounds: 2
        }
      });

      expect(task.status.state).toBe(TaskState.TASK_STATE_COMPLETED);
      const output = task.output;
      expect(output.readinessScore).toBeDefined();
      expect(output.recommendedNextSkill).toBeDefined();
      expect(output.recommendedDifficulty).toBeDefined();
    });

    it('Interviewer Agent: should formulate calibrated next question based on A2A task input', async () => {
      const task = await a2aClient.submitTask('interviewer-agent', {
        contextId: interviewA.id,
        correlationId: 'corr-interviewer-test-1',
        input: {
          job: {
            title: 'Senior Distributed Systems Architect',
            requiredSkills: ['FastAPI', 'Redis']
          },
          candidateProfile: { skills: ['Python', 'Redis'] },
          stage: 'adaptive',
          history: [
            {
              question: 'Explain Redis sentinel setup.',
              skill: 'Redis',
              difficulty: 'intermediate',
              answer: 'We configured sentinel.'
            }
          ],
          skillEvidence: {
            targetNextSkill: 'FastAPI',
            targetDifficulty: QUESTION_DIFFICULTY.ADVANCED
          },
          questionIndex: 2,
          maxQuestions: 2
        }
      });

      expect(task.status.state).toBe(TaskState.TASK_STATE_COMPLETED);
      const output = task.output;
      expect(output.questionText).toBeDefined();
      expect(output.skill).toBe('FastAPI');
      expect(output.expectedConcepts.length).toBeGreaterThanOrEqual(2);
    });

    it('Feedback Coach Agent: should compile evidence-backed feedback report upon completion', async () => {
      const task = await a2aClient.submitTask('feedback-coach-agent', {
        contextId: interviewA.id,
        correlationId: 'corr-feedback-test-1',
        input: {
          job: { title: 'Senior Distributed Systems Architect' },
          candidate: { uid: candidateA.uid, candidateProfile: { skills: ['Python', 'Redis'] } },
          evaluations: [
            {
              skill: 'Redis',
              score: 8.5,
              evidence: ['Configured sentinel quorum and bloom filter'],
              strengths: ['Cache architecture'],
              feedback: 'Great grasp of cache reliability'
            }
          ],
          qaList: [
            {
              question: { questionText: 'Explain Redis Sentinel.', skill: 'Redis', questionIndex: 1 },
              answer: { answerText: 'We used bloom filters.', timeTakenSeconds: 40 },
              evaluation: { score: 8.5 }
            }
          ],
          skillGapReport: {
            demonstratedSkills: [{ skill: 'Redis', score: 8.5 }],
            partiallyDemonstratedSkills: [],
            gapSkills: [],
            unassessedSkills: []
          },
          isCompleted: true
        }
      });

      expect(task.status.state).toBe(TaskState.TASK_STATE_COMPLETED);
      const output = task.output;
      expect(output.overallScore).toBeDefined();
      expect(output.summary).toBeDefined();
      expect(output.evidenceBackedStrengths.length).toBeGreaterThan(0);
    });
  });

  describe('3. Task Contract Validation & Error Handling', () => {
    const a2aClient = createA2AClient();

    it('should reject invalid incoming task payloads violating Zod contract with 400 Bad Request', async () => {
      await expect(
        a2aClient.submitTask('evaluation-agent', {
          contextId: interviewA.id,
          input: {
            // Missing mandatory 'question' field
            answer: 'Some answer'
          }
        })
      ).rejects.toThrow(/Input Contract Validation Error/i);
    });

    it('should transition task to FAILED when an unrecoverable agent error occurs', async () => {
      // Mock temporary invalid agent to trigger internal failure
      const brokenAgent = {
        execute: async () => {
          throw new Error('Simulated internal engine failure');
        }
      };

      const testRegistry = {
        getAgent: () => ({
          agentId: 'broken-agent',
          rawCard: { displayName: 'Broken Agent' },
          inputSchema: { parse: (x) => x },
          outputSchema: { parse: (x) => x },
          instance: brokenAgent
        })
      };

      const { A2ADispatcher } = require('../src/a2a/dispatcher');
      const customDispatcher = new A2ADispatcher({ registry: testRegistry });

      await expect(
        customDispatcher.dispatchTask({
          agentId: 'broken-agent',
          input: { test: true }
        })
      ).rejects.toThrow(/failed on agent 'broken-agent'/i);
    });
  });

  describe('4. Task Store Lifecycle & Cancellation', () => {
    it('should retrieve task status and artifacts via taskStore.getTask', async () => {
      const a2aClient = createA2AClient();
      const task = await a2aClient.submitTask('evaluation-agent', {
        contextId: interviewA.id,
        input: {
          question: { questionText: 'What is ASGI?', skill: 'FastAPI' },
          answer: 'Asynchronous Server Gateway Interface for Python async frameworks.'
        }
      });

      const retrieved = await a2aClient.getTask(task.id);
      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(task.id);
      expect(retrieved.status.state).toBe(TaskState.TASK_STATE_COMPLETED);
      expect(retrieved.artifacts.length).toBe(1);
    });

    it('should cancel an active task and set state to TASK_STATE_CANCELED', async () => {
      const a2aClient = createA2AClient();
      const task = await a2aClient.submitTask('interviewer-agent', {
        contextId: interviewA.id,
        input: {
          job: { title: 'Backend Dev' },
          questionIndex: 1
        }
      });

      const canceled = await a2aClient.cancelTask(task.id, 'User interrupted session');
      expect(canceled.status.state).toBe(TaskState.TASK_STATE_CANCELED);
      expect(canceled.status.message).toMatch(/User interrupted/i);
    });

    it('should list tasks filtered by contextId (interview session)', async () => {
      const a2aClient = createA2AClient();
      const tasks = await a2aClient.dispatcher.taskStore.listTasks({ contextId: interviewA.id });
      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks[0].contextId).toBe(interviewA.id);
    });
  });

  describe('5. Multi-Tenant Authorization & Security Controls', () => {
    it('POST /api/a2a/agents/:agentId/tasks should reject unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/a2a/agents/evaluation-agent/tasks')
        .send({
          input: {
            question: { questionText: 'Test Q', skill: 'Python' },
            answer: 'Test A'
          }
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('POST /api/a2a/agents/:agentId/tasks should enforce multi-tenant isolation: denies Candidate B from accessing Candidate A session (403)', async () => {
      const res = await request(app)
        .post('/api/a2a/agents/evaluation-agent/tasks')
        .set(candidateB.header) // Bob tries to access Alice's interview
        .send({
          contextId: interviewA.id,
          input: {
            question: { questionText: 'Test Q', skill: 'Python' },
            answer: 'Test A'
          }
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('GET /api/a2a/tasks/:taskId should prevent cross-user inspection of tasks for another interview', async () => {
      const a2aClient = createA2AClient();
      const task = await a2aClient.submitTask('evaluation-agent', {
        contextId: interviewA.id,
        input: {
          question: { questionText: 'Test Q', skill: 'Python' },
          answer: 'Test A'
        }
      });

      // Candidate B attempts to fetch Candidate A's task
      const res = await request(app)
        .get(`/api/a2a/tasks/${task.id}`)
        .set(candidateB.header);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('6. A2A JSON-RPC 2.0 Protocol Operations', () => {
    it('POST /api/a2a/agents/:agentId/rpc should support getAgentCard method', async () => {
      const res = await request(app)
        .post('/api/a2a/agents/interviewer-agent/rpc')
        .set(candidateA.header)
        .send({
          jsonrpc: '2.0',
          id: 'rpc-req-1',
          method: 'getAgentCard',
          params: {}
        });

      expect(res.status).toBe(200);
      expect(res.body.jsonrpc).toBe('2.0');
      expect(res.body.id).toBe('rpc-req-1');
      expect(res.body.result).toBeDefined();
      expect(res.body.result.name).toBe('interviewer-agent');
    });

    it('POST /api/a2a/agents/:agentId/rpc should execute submitTask method via JSON-RPC', async () => {
      const res = await request(app)
        .post('/api/a2a/agents/evaluation-agent/rpc')
        .set(candidateA.header)
        .send({
          jsonrpc: '2.0',
          id: 'rpc-req-2',
          method: 'submitTask',
          params: {
            contextId: interviewA.id,
            input: {
              question: { questionText: 'Explain FastAPI dependency injection.', skill: 'FastAPI' },
              answer: 'We use Depends(get_db) to manage scoped database sessions per request.'
            }
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.jsonrpc).toBe('2.0');
      expect(res.body.id).toBe('rpc-req-2');
      expect(res.body.result).toBeDefined();
      expect(res.body.result.status.state).toBe(TaskState.TASK_STATE_COMPLETED);
      expect(res.body.result.output.score).toBeGreaterThan(0);
    });

    it('POST /api/a2a/agents/:agentId/rpc should return standard error -32601 for unknown method', async () => {
      const res = await request(app)
        .post('/api/a2a/agents/interviewer-agent/rpc')
        .set(candidateA.header)
        .send({
          jsonrpc: '2.0',
          id: 'rpc-req-3',
          method: 'unsupportedMethod',
          params: {}
        });

      expect(res.status).toBe(200);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe(-32601);
    });
  });

  describe('7. End-to-End Autonomous Workflow via A2A Protocol', () => {
    it('Step 1: Orchestrator generates opening question via A2A task delegation', async () => {
      const firstQ = await agentOrchestrator.generateFirstQuestionWithA2A({
        job,
        candidateProfile: { skills: ['Python', 'FastAPI', 'Redis'] },
        maxQuestions: 2,
        correlationId: 'e2e-a2a-start'
      });

      expect(firstQ).toBeDefined();
      expect(firstQ.questionText).toBeTruthy();
      expect(firstQ.skill).toBeTruthy();
      expect(firstQ.expectedConcepts.length).toBeGreaterThanOrEqual(2);
    });

    it('Step 2 & 3: Candidate submits answer, evaluated via A2A evaluation-agent, skill-gap analyzed via A2A, and Question 2 formulated via A2A interviewer-agent', async () => {
      const result = await agentOrchestrator.processAnswerWithA2A({
        interviewId: interviewA.id,
        user: { uid: candidateA.uid, role: 'candidate' },
        questionId: questionA1.id,
        answerText: 'We implement Redis Sentinel clusters to ensure automatic failover and mitigate split-brain with majority quorum.',
        timeTakenSeconds: 35,
        correlationId: 'e2e-a2a-round-1'
      });

      expect(result).toBeDefined();
      expect(result.evaluation).toBeDefined();
      expect(result.evaluation.score).toBeGreaterThan(0);
      expect(result.skillGapFindings).toBeDefined();
      expect(result.nextQuestion).toBeDefined();
      expect(result.isInterviewComplete).toBe(false);
    });

    it('Step 4: Candidate submits final answer, triggering A2A feedback-coach-agent to synthesize comprehensive report and complete interview', async () => {
      // Respect Gemini API free-tier quota window
      await new Promise(r => setTimeout(r, 3500));

      // Fetch question 2
      const interviewSnap = await getCollection(COLLECTIONS.INTERVIEWS).doc(interviewA.id).get();
      const updatedInterview = interviewSnap.data();
      const question2Id = updatedInterview.currentQuestionId;

      const finalResult = await agentOrchestrator.processAnswerWithA2A({
        interviewId: interviewA.id,
        user: { uid: candidateA.uid, role: 'candidate' },
        questionId: question2Id,
        answerText: 'FastAPI uses Starlette and Pydantic for high throughput asynchronous concurrency and type validation.',
        timeTakenSeconds: 40,
        correlationId: 'e2e-a2a-round-2'
      });

      expect(finalResult.isInterviewComplete).toBe(true);
      expect(finalResult.reportId).toBeDefined();
      expect(typeof finalResult.overallScore).toBe('number');

      // Verify interview status updated to COMPLETED in database
      const completedSnap = await getCollection(COLLECTIONS.INTERVIEWS).doc(interviewA.id).get();
      expect(completedSnap.data().status).toBe(INTERVIEW_STATUS.COMPLETED);
      expect(completedSnap.data().finalReportId).toBe(finalResult.reportId);
    });
  });
});
