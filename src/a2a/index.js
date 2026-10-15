const { defaultRegistry, A2AAgentRegistry } = require('./registry');
const { defaultDispatcher, A2ADispatcher } = require('./dispatcher');
const { A2ATaskStore, TASK_STATES } = require('./taskStore');
const { A2AClient, createA2AClient } = require('./client');
const a2aRoutes = require('./routes');

const evaluationCardDef = require('./cards/evaluationAgentCard');
const skillGapCardDef = require('./cards/skillGapAgentCard');
const interviewerCardDef = require('./cards/interviewerAgentCard');
const feedbackCardDef = require('./cards/feedbackAgentCard');

module.exports = {
  registry: defaultRegistry,
  dispatcher: defaultDispatcher,
  taskStore: defaultDispatcher.taskStore,
  A2AAgentRegistry,
  A2ADispatcher,
  A2ATaskStore,
  A2AClient,
  createA2AClient,
  a2aRoutes,
  TASK_STATES,
  cards: {
    evaluation: evaluationCardDef,
    skillGap: skillGapCardDef,
    interviewer: interviewerCardDef,
    feedback: feedbackCardDef
  }
};
