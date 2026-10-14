const BaseAgent = require('./agent.interface');
const { integrityReviewAgentInputSchema, integrityReviewAgentOutputSchema } = require('./schemas');
const { INTEGRITY_EVENT_TYPE } = require('../../constants/interviewStatus');
const logger = require('../../utils/logger');

class IntegrityReviewAgent extends BaseAgent {
  constructor() {
    super('IntegrityReviewAgent', integrityReviewAgentInputSchema, integrityReviewAgentOutputSchema);
  }

  async _process(input) {
    const { interviewId, integrityEvents = [], qaList = [], sessionDurationSeconds = 0 } = input;

    let tabSwitchCount = 0;
    let totalUnfocusedDurationMs = 0;
    let copyPasteCount = 0;
    let duplicateSubmissionCount = 0;
    let unexpectedExitCount = 0;
    let windowBlurCount = 0;

    const flags = [];

    // 1. Analyze factual events
    for (const evt of integrityEvents) {
      const type = evt.eventType || 'unknown';
      const meta = evt.metadata || {};

      switch (type) {
        case INTEGRITY_EVENT_TYPE.TAB_SWITCH:
          tabSwitchCount++;
          if (typeof meta.durationMs === 'number') {
            totalUnfocusedDurationMs += meta.durationMs;
          }
          break;
        case INTEGRITY_EVENT_TYPE.WINDOW_BLUR:
          windowBlurCount++;
          break;
        case INTEGRITY_EVENT_TYPE.PASTE_EVENT:
        case 'copy_paste':
          copyPasteCount++;
          break;
        case 'duplicate_submission':
          duplicateSubmissionCount++;
          break;
        case INTEGRITY_EVENT_TYPE.SESSION_DISCONNECTED:
        case 'unexpected_exit':
          unexpectedExitCount++;
          break;
        default:
          break;
      }
    }

    // 2. Build flags with factual observations, inferred risks, and honest uncertainty
    if (tabSwitchCount > 0) {
      const unfocusedSec = Math.round(totalUnfocusedDurationMs / 1000);
      const isHighFrequency = tabSwitchCount >= 4 || unfocusedSec > 60;
      flags.push({
        eventType: INTEGRITY_EVENT_TYPE.TAB_SWITCH,
        severity: isHighFrequency ? 'high' : (tabSwitchCount >= 2 ? 'medium' : 'low'),
        confidence: 0.95,
        observedFact: `Candidate switched browser tabs ${tabSwitchCount} time(s) with an unfocused duration of approximately ${unfocusedSec}s.`,
        inferredRisk: isHighFrequency
          ? 'Potential external search or reference consultation during active technical prompts.'
          : 'Minor window switching or operating system notification interaction.',
        requiresHumanReview: isHighFrequency,
        uncertainty: 'Browser blur events cannot distinguish OS notifications, accidental clicks on another monitor, or benign window shifts from external tool usage.'
      });
    }

    if (copyPasteCount > 0) {
      flags.push({
        eventType: 'copy_paste',
        severity: copyPasteCount >= 3 ? 'high' : 'medium',
        confidence: 0.9,
        observedFact: `Detected ${copyPasteCount} paste event(s) in the response input field.`,
        inferredRisk: 'Candidate may have pasted pre-drafted notes, code snippets from an external IDE, or external AI outputs.',
        requiresHumanReview: copyPasteCount >= 2,
        uncertainty: 'Candidate may legitimately draft architectural explanations in an external editor or scratchpad before pasting into the submission area.'
      });
    }

    if (duplicateSubmissionCount > 0) {
      flags.push({
        eventType: 'duplicate_submission',
        severity: 'medium',
        confidence: 1.0,
        observedFact: `Attempted ${duplicateSubmissionCount} duplicate answer submission(s) for already answered questions.`,
        inferredRisk: 'Network retry or double-click on submission button.',
        requiresHumanReview: false,
        uncertainty: 'High latency or rapid consecutive clicks commonly trigger duplicate requests without malicious intent.'
      });
    }

    if (unexpectedExitCount > 0) {
      flags.push({
        eventType: 'unexpected_exit',
        severity: 'medium',
        confidence: 0.85,
        observedFact: `Candidate disconnected or closed session abruptly ${unexpectedExitCount} time(s).`,
        inferredRisk: 'Session interruption, network failure, or deliberate exit.',
        requiresHumanReview: true,
        uncertainty: 'ISP drops, Wi-Fi reconnection, and accidental browser window closes occur frequently and are not indicators of non-compliance.'
      });
    }

    // 3. Calculate calibrated integrity score (starts at 100, deductor-bounded)
    let deduction = 0;
    for (const flag of flags) {
      if (flag.severity === 'high') deduction += 15;
      else if (flag.severity === 'medium') deduction += 8;
      else if (flag.severity === 'low') deduction += 3;
    }

    const integrityScore = Math.max(50, Math.min(100, 100 - deduction));
    const incidentCount = integrityEvents.length;

    // 4. Recruiter verdict decision
    let verdict = 'CLEAN';
    let humanReviewRecommended = false;

    if (flags.some(f => f.severity === 'high') || flags.length >= 3) {
      verdict = flags.filter(f => f.severity === 'high').length >= 2 ? 'SUSPICIOUS_ANOMALIES' : 'REQUIRES_RECRUITER_REVIEW';
      humanReviewRecommended = true;
    } else if (flags.some(f => f.severity === 'medium')) {
      verdict = 'REQUIRES_RECRUITER_REVIEW';
      humanReviewRecommended = false; // mild, no urgent review required
    }

    const summary = incidentCount === 0
      ? 'Clean session with no proctoring incidents or suspicious telemetry observed.'
      : `Recorded ${incidentCount} proctoring event(s). Calibrated integrity score: ${integrityScore}/100. ${humanReviewRecommended ? 'Human recruiter review is recommended before final hiring decisions.' : 'Minor telemetry variations observed within normal tolerances.'}`;

    return {
      integrityScore,
      incidentCount,
      flags,
      summary,
      humanReviewRecommended,
      verdict
    };
  }
}

module.exports = IntegrityReviewAgent;
