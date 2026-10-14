const request = require('supertest');
const app = require('../src/app');
const {
  createMcpServer,
  ALL_TOOLS,
  createMcpAgentClient,
  resolveUserFromToken,
  createMcpAuthToken
} = require('../src/mcp');
const { COLLECTIONS, getCollection, toTimestamp } = require('../src/services/db/firestore.service');
const InterviewerAgent = require('../src/services/agents/interviewer.agent');
const SkillGapAgent = require('../src/services/agents/skillGap.agent');
const { INTERVIEW_STATUS, QUESTION_DIFFICULTY } = require('../src/constants/interviewStatus');
const { setupCandidate, setupRecruiter, authHeader } = require('./testHelper');

describe('TASK 2: Model Context Protocol (MCP) Server & Tools', () => {
  let candidateA;
  let candidateB;
  let recruiter;
  let job;
  let interviewA;
  let questionA1;
  let answerA1;

  beforeAll(async () => {
    // 1. Setup Candidate A, Candidate B, and Recruiter
    candidateA = await setupCandidate('cand-mcp-alice', ['TypeScript', 'Node.js', 'PostgreSQL']);
    candidateB = await setupCandidate('cand-mcp-bob', ['Python', 'Django']);
    recruiter = await setupRecruiter('rec-mcp-boss', 'CloudApex Technologies');

    // 2. Post a real job
    const jobRes = await request(app)
      .post('/api/jobs')
      .set(recruiter.header)
      .send({
        title: 'Senior Backend Engineer',
        description: 'Design distributed backend microservices and maintain database schemas.',
        department: 'Core Infrastructure',
        location: 'Remote',
        employmentType: 'full-time',
        experienceLevel: 'senior',
        requiredSkills: [
          { name: 'Node.js', minimumLevel: 'intermediate', weight: 1.5 },
          { name: 'PostgreSQL', minimumLevel: 'intermediate', weight: 1.0 },
          { name: 'Distributed Systems', minimumLevel: 'advanced', weight: 1.2 }
        ],
        responsibilities: ['Build APIs', 'Optimize database performance'],
        evaluationCriteria: ['System design soundness', 'Technical depth']
      });

    job = jobRes.body.data;

    // 3. Candidate A applies and starts interview
    await request(app)
      .post('/api/applications')
      .set(candidateA.header)
      .send({ jobId: job.id });

    const scheduleRes = await request(app)
      .post('/api/interviews')
      .set(candidateA.header)
      .send({ jobId: job.id, maxQuestions: 3 });

    const interviewId = scheduleRes.body.data.id;

    const startRes = await request(app)
      .post(`/api/interviews/${interviewId}/start`)
      .set(candidateA.header);

    interviewA = { id: startRes.body.data.interviewId, ...startRes.body.data };
    questionA1 = startRes.body.data.currentQuestion;

    // 4. Candidate A submits answer to question 1
    const ansRef = getCollection(COLLECTIONS.INTERVIEW_ANSWERS).doc();
    answerA1 = {
      id: ansRef.id,
      interviewId: interviewA.id,
      questionId: questionA1.id,
      candidateId: candidateA.uid,
      answerText: 'We design the distributed system with idempotent operations and connection pooling in PostgreSQL to handle high concurrency.',
      timeTakenSeconds: 45,
      submittedAt: toTimestamp()
    };
    await ansRef.set(answerA1);
  });

  describe('1. MCP Server Initialization & Tool Registration', () => {
    it('should initialize McpServer with exactly 7 standardized tools', () => {
      const server = createMcpServer();
      expect(server).toBeDefined();
      expect(ALL_TOOLS.length).toBe(7);

      const toolNames = ALL_TOOLS.map(t => t.name);
      expect(toolNames).toContain('get_candidate_skill_profile');
      expect(toolNames).toContain('get_interview_history');
      expect(toolNames).toContain('get_interview_evaluation');
      expect(toolNames).toContain('get_interview_context');
      expect(toolNames).toContain('save_answer_evaluation');
      expect(toolNames).toContain('update_skill_gap_analysis');
      expect(toolNames).toContain('generate_interview_report');
    });

    it('should connect an in-memory client and list all tools with valid schemas', async () => {
      const user = { uid: candidateA.uid, email: 'alice@example.com', role: 'candidate' };
      const mcpClient = await createMcpAgentClient({ user });

      const tools = await mcpClient.listTools();
      expect(tools.length).toBe(7);

      const profileTool = tools.find(t => t.name === 'get_candidate_skill_profile');
      expect(profileTool).toBeDefined();
      expect(profileTool.description).toMatch(/skill profile/i);

      await mcpClient.close();
    });
  });

  describe('2. Tool 1: get_candidate_skill_profile', () => {
    it('should retrieve authorized candidate skill profile and claimed skills', async () => {
      const user = { uid: candidateA.uid, email: 'alice@example.com', role: 'candidate' };
      const mcpClient = await createMcpAgentClient({ user });

      const result = await mcpClient.getCandidateSkillProfile();
      expect(result).toBeDefined();
      expect(result.candidateId).toBe(candidateA.uid);
      expect(result.claimedSkills).toEqual(expect.arrayContaining(['TypeScript', 'Node.js', 'PostgreSQL']));
      expect(Array.isArray(result.demonstratedSkills)).toBe(true);
      expect(typeof result.totalInterviewsCompleted).toBe('number');

      await mcpClient.close();
    });
  });

  describe('3. Tool 2: get_interview_history', () => {
    it('should retrieve interview history with pagination and limits', async () => {
      const user = { uid: candidateA.uid, email: 'alice@example.com', role: 'candidate' };
      const mcpClient = await createMcpAgentClient({ user });

      const result = await mcpClient.getInterviewHistory({ page: 1, limit: 5 });
      expect(result).toBeDefined();
      expect(result.pagination).toBeDefined();
      expect(Array.isArray(result.interviews)).toBe(true);
      expect(result.interviews.length).toBeGreaterThanOrEqual(1);

      const found = result.interviews.find(i => i.interviewId === interviewA.id);
      expect(found).toBeDefined();
      expect(found.jobId).toBe(job.id);
      expect(found.status).toBe(INTERVIEW_STATUS.IN_PROGRESS);

      await mcpClient.close();
    });
  });

  describe('4. Tool 4: get_interview_context', () => {
    it('should retrieve role, stage, prior questions, and answers for active interview', async () => {
      const user = { uid: candidateA.uid, email: 'alice@example.com', role: 'candidate' };
      const mcpClient = await createMcpAgentClient({ user });

      const context = await mcpClient.getInterviewContext({ interviewId: interviewA.id });
      expect(context).toBeDefined();
      expect(context.interviewId).toBe(interviewA.id);
      expect(context.jobTitle).toBe('Senior Backend Engineer');
      expect(context.requiredSkills.length).toBe(3);
      expect(Array.isArray(context.history)).toBe(true);
      expect(context.history.length).toBeGreaterThanOrEqual(1);

      const q1 = context.history[0];
      expect(q1.questionId).toBe(questionA1.id);
      expect(q1.answerText).toBe(answerA1.answerText);

      await mcpClient.close();
    });
  });

  describe('5. Tool 5: save_answer_evaluation & Idempotency', () => {
    it('should validate and persist an answer evaluation for candidate A', async () => {
      const user = { uid: candidateA.uid, email: 'alice@example.com', role: 'candidate' };
      const mcpClient = await createMcpAgentClient({ user });

      const evalRes = await mcpClient.saveAnswerEvaluation({
        interviewId: interviewA.id,
        questionId: questionA1.id,
        score: 8.5,
        feedback: 'Excellent explanation of database connection pooling and idempotency.',
        matchedConcepts: ['Idempotency', 'Connection pooling', 'Concurrency'],
        missingConcepts: [],
        evidence: ['idempotent operations and connection pooling in PostgreSQL'],
        strengths: ['Identified database connection bottlenecks'],
        weaknesses: []
      });

      expect(evalRes.success).toBe(true);
      expect(evalRes.evaluationId).toBeDefined();
      expect(evalRes.isDuplicate).toBe(false);
      expect(evalRes.score).toBe(8.5);

      await mcpClient.close();
    });

    it('should return existing evaluation idempotently on duplicate evaluation submission', async () => {
      const user = { uid: candidateA.uid, email: 'alice@example.com', role: 'candidate' };
      const mcpClient = await createMcpAgentClient({ user });

      // Retry the exact same question evaluation
      const duplicateRes = await mcpClient.saveAnswerEvaluation({
        interviewId: interviewA.id,
        questionId: questionA1.id,
        score: 8.5,
        feedback: 'Duplicate attempt to evaluate the same question.'
      });

      expect(duplicateRes.success).toBe(true);
      expect(duplicateRes.isDuplicate).toBe(true);
      expect(duplicateRes.evaluationId).toBeDefined();
      expect(duplicateRes.message).toMatch(/already persisted/i);

      await mcpClient.close();
    });
  });

  describe('6. Tool 3: get_interview_evaluation', () => {
    it('should retrieve authorized evaluations for Candidate A interview', async () => {
      const user = { uid: candidateA.uid, email: 'alice@example.com', role: 'candidate' };
      const mcpClient = await createMcpAgentClient({ user });

      const result = await mcpClient.getInterviewEvaluation({ interviewId: interviewA.id });
      expect(result).toBeDefined();
      expect(result.interviewId).toBe(interviewA.id);
      expect(result.totalEvaluations).toBe(1);

      const ev = result.evaluations[0];
      expect(ev.questionId).toBe(questionA1.id);
      expect(ev.score).toBe(8.5);
      expect(ev.matchedConcepts).toContain('Idempotency');

      await mcpClient.close();
    });
  });

  describe('7. Tool 6: update_skill_gap_analysis & Idempotent Update', () => {
    it('should persist skill-gap findings using evaluation evidence', async () => {
      const user = { uid: candidateA.uid, email: 'alice@example.com', role: 'candidate' };
      const mcpClient = await createMcpAgentClient({ user });

      const gapRes = await mcpClient.updateSkillGapAnalysis({
        interviewId: interviewA.id,
        readinessScore: 82,
        summary: 'Candidate demonstrated strong mastery of backend concurrency and database pooling.',
        demonstratedSkills: [
          { skill: 'PostgreSQL', score: 8.5, evidence: ['connection pooling'] }
        ],
        partiallyDemonstratedSkills: [
          { skill: 'Distributed Systems', score: 6.0, gaps: ['partition tolerance'] }
        ],
        gapSkills: [],
        unassessedSkills: [
          { skill: 'Node.js', requiredLevel: 'intermediate' }
        ],
        recommendedNextSkill: 'Node.js',
        recommendedDifficulty: 'intermediate',
        recommendationReason: 'Assess core runtime capabilities'
      });

      expect(gapRes.success).toBe(true);
      expect(gapRes.skillGapReportId).toBeDefined();
      expect(gapRes.readinessScore).toBe(82);

      // Verify idempotent update on subsequent call
      const updatedGapRes = await mcpClient.updateSkillGapAnalysis({
        interviewId: interviewA.id,
        readinessScore: 85,
        summary: 'Updated summary after additional analysis.',
        demonstratedSkills: [
          { skill: 'PostgreSQL', score: 8.5, evidence: ['connection pooling'] }
        ]
      });

      expect(updatedGapRes.success).toBe(true);
      expect(updatedGapRes.skillGapReportId).toBe(gapRes.skillGapReportId);
      expect(updatedGapRes.readinessScore).toBe(85);

      await mcpClient.close();
    });
  });

  describe('8. Tool 7: generate_interview_report', () => {
    it('should generate or retrieve report for completed interview', async () => {
      const user = { uid: candidateA.uid, email: 'alice@example.com', role: 'candidate' };
      const mcpClient = await createMcpAgentClient({ user });

      const reportRes = await mcpClient.generateInterviewReport({
        interviewId: interviewA.id,
        forceRegenerate: false
      });

      expect(reportRes.success).toBe(true);
      expect(reportRes.reportId).toBeDefined();
      expect(typeof reportRes.overallScore).toBe('number');
      expect(reportRes.recommendation).toBeDefined();

      // Test idempotency: calling again without forceRegenerate should return existing
      const secondCall = await mcpClient.generateInterviewReport({
        interviewId: interviewA.id,
        forceRegenerate: false
      });

      expect(secondCall.success).toBe(true);
      expect(secondCall.isExisting).toBe(true);
      expect(secondCall.reportId).toBe(reportRes.reportId);

      await mcpClient.close();
    });
  });

  describe('9. Multi-Tenant Authorization & Security Isolation', () => {
    it('should reject unauthenticated tool calls with 401 Unauthorized', async () => {
      const tool = ALL_TOOLS.find(t => t.name === 'get_candidate_skill_profile');
      await expect(tool.handler({})).rejects.toThrow(/Authentication required/i);
    });

    it('should reject cross-candidate interview access with 403 Forbidden', async () => {
      // Candidate B attempts to access Candidate A's interview
      const bobUser = { uid: candidateB.uid, email: 'bob@example.com', role: 'candidate' };
      const bobClient = await createMcpAgentClient({ user: bobUser });

      await expect(
        bobClient.getInterviewContext({ interviewId: interviewA.id })
      ).rejects.toThrow(/Forbidden/i);

      await expect(
        bobClient.getInterviewEvaluation({ interviewId: interviewA.id })
      ).rejects.toThrow(/Forbidden/i);

      await bobClient.close();
    });

    it('should return 404 Not Found for non-existent interview sessions', async () => {
      const user = { uid: candidateA.uid, email: 'alice@example.com', role: 'candidate' };
      const mcpClient = await createMcpAgentClient({ user });

      await expect(
        mcpClient.getInterviewContext({ interviewId: 'non-existent-interview-id-999' })
      ).rejects.toThrow(/not found/i);

      await mcpClient.close();
    });

    it('should reject malformed tool arguments at schema validation level', async () => {
      const user = { uid: candidateA.uid, email: 'alice@example.com', role: 'candidate' };
      const mcpClient = await createMcpAgentClient({ user });

      // Pass invalid score > 10
      await expect(
        mcpClient.saveAnswerEvaluation({
          interviewId: interviewA.id,
          questionId: questionA1.id,
          score: 999, // Exceeds max 10
          feedback: 'Valid feedback'
        })
      ).rejects.toThrow();

      await mcpClient.close();
    });
  });

  describe('10. AI Agent MCP Integration (Interviewer & SkillGap Agents)', () => {
    it('InterviewerAgent.executeWithMcp should formulate adaptive question using MCP tools', async () => {
      const user = { uid: candidateA.uid, email: 'alice@example.com', role: 'candidate' };
      const mcpClient = await createMcpAgentClient({ user });
      const interviewerAgent = new InterviewerAgent();

      const result = await interviewerAgent.executeWithMcp({
        mcpClient,
        interviewId: interviewA.id,
        maxQuestions: 5
      });

      expect(result).toBeDefined();
      expect(result.questionText).toBeDefined();
      expect(result.skill).toBeDefined();
      expect(result.selectionRationale).toBeDefined();
      expect(result.expectedConcepts.length).toBeGreaterThanOrEqual(2);

      await mcpClient.close();
    });

    it('SkillGapAgent.executeWithMcp should load evaluations and persist findings via MCP', async () => {
      const user = { uid: candidateA.uid, email: 'alice@example.com', role: 'candidate' };
      const mcpClient = await createMcpAgentClient({ user });
      const skillGapAgent = new SkillGapAgent();

      const result = await skillGapAgent.executeWithMcp({
        mcpClient,
        interviewId: interviewA.id,
        job,
        candidateProfile: { skills: ['Node.js', 'PostgreSQL', 'TypeScript'] },
        roundNumber: 2,
        totalRounds: 5
      });

      expect(result).toBeDefined();
      expect(result.readinessScore).toBeGreaterThanOrEqual(0);
      expect(result.summary).toBeDefined();
      expect(result.mcpPersistResult).toBeDefined();
      expect(result.mcpPersistResult.success).toBe(true);

      await mcpClient.close();
    });
  });

  describe('11. Express REST & SSE MCP Transport Endpoints', () => {
    it('GET /api/mcp/health should return MCP service operational status', async () => {
      const res = await request(app).get('/api/mcp/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.toolsCount).toBe(7);
      expect(res.body.protocolVersion).toBe('2024-11-05');
    });

    it('GET /api/mcp/tools should expose list of registered MCP tools', async () => {
      const res = await request(app).get('/api/mcp/tools');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(7);
      expect(res.body.tools.map(t => t.name)).toContain('get_interview_context');
    });

    it('POST /api/mcp/tools/:toolName should execute tool for authenticated user via REST', async () => {
      const res = await request(app)
        .post('/api/mcp/tools/get_candidate_skill_profile')
        .set(candidateA.header)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.candidateId).toBe(candidateA.uid);
      expect(res.body.data.claimedSkills).toContain('TypeScript');
    });

    it('POST /api/mcp/tools/:toolName should reject unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/mcp/tools/get_candidate_skill_profile')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('GET /api/mcp/sse should require authentication token', async () => {
      const res = await request(app).get('/api/mcp/sse');
      expect(res.status).toBe(401);
    });
  });
});
