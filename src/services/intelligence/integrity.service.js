/**
 * Interview Integrity Intelligence Service
 * Provides evidence-based event capture, chronological timeline generation,
 * pattern recognition for human review, and fair recruiter decision support.
 */

const { COLLECTIONS, getCollection, toTimestamp } = require('../db/firestore.service');
const { INTEGRITY_EVENT_TYPE, REVIEW_STATUS } = require('../../constants/interviewStatus');

class IntegrityService {
  /**
   * Records a validated integrity event with context, severity, and confidence.
   */
  async recordEvent({
    interviewId,
    candidateId,
    eventType,
    eventSource = 'browser_window',
    metadata = {},
    severity = 'medium',
    explanation = null
  }) {
    const now = toTimestamp();
    const eventDocRef = getCollection(COLLECTIONS.INTEGRITY_EVENTS).doc();

    const computedExplanation = explanation || this._buildDefaultExplanation(eventType, metadata);

    const eventRecord = {
      id: eventDocRef.id,
      interviewId,
      candidateId,
      eventType,
      eventSource,
      metadata: this._sanitizeMetadata(metadata),
      severity: ['low', 'medium', 'high'].includes(severity) ? severity : 'medium',
      confidence: 0.95, // Directly observed browser/client telemetry
      explanation: computedExplanation,
      reviewStatus: REVIEW_STATUS.UNREVIEWED,
      reviewedBy: null,
      reviewNotes: null,
      timestamp: now
    };

    await eventDocRef.set(eventRecord);
    return eventRecord;
  }

  /**
   * Retrieves and formats chronological event timeline for an interview session
   */
  async getChronologicalTimeline(interviewId) {
    const snapshot = await getCollection(COLLECTIONS.INTEGRITY_EVENTS)
      .where('interviewId', '==', interviewId)
      .get();

    const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Chronological order: earliest event first
    events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return events.map((evt, idx) => ({
      sequenceIndex: idx + 1,
      id: evt.id,
      timestamp: evt.timestamp,
      eventType: evt.eventType,
      eventSource: evt.eventSource,
      severity: evt.severity,
      confidence: evt.confidence,
      explanation: evt.explanation,
      reviewStatus: evt.reviewStatus,
      metadata: evt.metadata
    }));
  }

  /**
   * Analyzes observed event patterns, computes fair risk indicator,
   * flags suspicious clusters for human review, and distinguishes facts from inferred risk.
   *
   * @param {Array} events - Chronological list of integrity events
   * @param {Object} [interview] - Optional interview session metadata
   * @returns {Object} Comprehensive integrity analysis & recruiter summary
   */
  analyzeIntegrityPatterns(events = [], interview = {}) {
    const totalEvents = events.length;

    let tabSwitchCount = 0;
    let totalUnfocusedDurationMs = 0;
    let copyPasteCount = 0;
    let failedSubmissionCount = 0;
    let unexpectedExitCount = 0;

    for (const evt of events) {
      switch (evt.eventType) {
        case INTEGRITY_EVENT_TYPE.TAB_SWITCH:
        case INTEGRITY_EVENT_TYPE.WINDOW_BLUR:
          tabSwitchCount++;
          if (typeof evt.metadata?.durationMs === 'number') {
            totalUnfocusedDurationMs += evt.metadata.durationMs;
          }
          break;
        case INTEGRITY_EVENT_TYPE.COPY_PASTE:
          copyPasteCount++;
          break;
        case INTEGRITY_EVENT_TYPE.FAILED_SUBMISSION:
          failedSubmissionCount++;
          break;
        case INTEGRITY_EVENT_TYPE.UNEXPECTED_EXIT:
        case INTEGRITY_EVENT_TYPE.SESSION_INTERRUPTION:
          unexpectedExitCount++;
          break;
        default:
          break;
      }
    }

    // --- 1. Objective Observed Facts ---
    const observedFacts = [
      `Total telemetry events logged: ${totalEvents}`,
      `Focus loss / tab switches: ${tabSwitchCount} (total unfocused duration: ${(totalUnfocusedDurationMs / 1000).toFixed(1)}s)`,
      `Copy-paste events: ${copyPasteCount}`,
      `Submission errors or failed attempts: ${failedSubmissionCount}`,
      `Unexpected disconnects or session interruptions: ${unexpectedExitCount}`
    ];

    // --- 2. Pattern Detection & Flags for Human Review ---
    // Rule: Never declare cheating from a single event. Flag patterns only.
    const reviewFlags = [];

    if (tabSwitchCount >= 3) {
      reviewFlags.push({
        flagType: 'REPEATED_FOCUS_LOSS',
        severity: tabSwitchCount >= 5 ? 'high' : 'medium',
        reason: `Repeated window blur / tab switching observed (${tabSwitchCount} occurrences, ${(totalUnfocusedDurationMs / 1000).toFixed(1)}s total). Recommended human review of question timing.`
      });
    }

    if (copyPasteCount >= 2) {
      reviewFlags.push({
        flagType: 'MULTIPLE_PASTE_OPERATIONS',
        severity: 'medium',
        reason: `Candidate performed ${copyPasteCount} paste operations during response entry. Review code originality or notes usage.`
      });
    }

    if (unexpectedExitCount > 0) {
      reviewFlags.push({
        flagType: 'UNEXPECTED_SESSION_TERMINATION',
        severity: 'medium',
        reason: `Session ended or lost connection abruptly before regular completion.`
      });
    }

    // --- 3. Compute Measured Integrity Score (0-100) ---
    // Start at 100, apply moderate deductions for confirmed clusters
    let integrityScore = 100;
    integrityScore -= Math.min(30, tabSwitchCount * 6);
    integrityScore -= Math.min(20, copyPasteCount * 8);
    integrityScore -= Math.min(15, failedSubmissionCount * 5);
    integrityScore -= Math.min(20, unexpectedExitCount * 15);
    integrityScore = Math.max(0, integrityScore);

    // --- 4. Risk Level (Fair, Non-Accusatory) ---
    let riskLevel = 'low';
    if (reviewFlags.some(f => f.severity === 'high') || integrityScore < 60) {
      riskLevel = 'elevated';
    } else if (reviewFlags.length > 0 || integrityScore < 80) {
      riskLevel = 'moderate';
    }

    const requiresHumanReview = reviewFlags.length > 0 || riskLevel !== 'low';

    // --- 5. Recruiter Decision Support Summary ---
    let recruiterSummary = '';
    if (riskLevel === 'low') {
      recruiterSummary = `Telemetry indicates standard interview session engagement with no significant integrity anomalies. Integrity score: ${integrityScore}/100.`;
    } else if (riskLevel === 'moderate') {
      recruiterSummary = `Minor session anomalies observed (Integrity score: ${integrityScore}/100). Review flags noted for recruiter awareness. We recommend verifying candidate answers during follow-up rather than drawing negative conclusions.`;
    } else {
      recruiterSummary = `Elevated integrity pattern detected (${reviewFlags.map(f => f.flagType).join(', ')}). Recruiter review of answer timestamps and event timeline is recommended prior to final hiring decisions.`;
    }

    return {
      integrityScore,
      riskLevel,
      requiresHumanReview,
      observedFacts,
      reviewFlags,
      recruiterSummary,
      metrics: {
        totalEvents,
        tabSwitchCount,
        totalUnfocusedDurationMs,
        copyPasteCount,
        failedSubmissionCount,
        unexpectedExitCount
      }
    };
  }

  /**
   * Updates human review status of a specific event
   */
  async updateReviewStatus(eventId, reviewerUid, reviewStatus, reviewNotes = '') {
    const eventRef = getCollection(COLLECTIONS.INTEGRITY_EVENTS).doc(eventId);
    const eventSnap = await eventRef.get();

    if (!eventSnap.exists) {
      throw new Error(`Integrity event ${eventId} not found`);
    }

    const updates = {
      reviewStatus,
      reviewedBy: reviewerUid,
      reviewNotes,
      reviewedAt: toTimestamp()
    };

    await eventRef.update(updates);
    const updated = await eventRef.get();
    return { id: eventId, ...updated.data() };
  }

  _buildDefaultExplanation(eventType, metadata = {}) {
    switch (eventType) {
      case INTEGRITY_EVENT_TYPE.TAB_SWITCH:
      case INTEGRITY_EVENT_TYPE.WINDOW_BLUR:
        return metadata.durationMs
          ? `Browser window lost focus for ${(metadata.durationMs / 1000).toFixed(1)} seconds.`
          : 'Browser window or active tab lost focus.';
      case INTEGRITY_EVENT_TYPE.FULLSCREEN_EXIT:
        return 'Candidate exited full screen mode during active question.';
      case INTEGRITY_EVENT_TYPE.COPY_PASTE:
        return metadata.textLength
          ? `Pasted ${metadata.textLength} characters into the response editor.`
          : 'Paste operation recorded in response input.';
      case INTEGRITY_EVENT_TYPE.UNUSUAL_INACTIVITY:
        return 'Extended period of inactivity without response entry.';
      case INTEGRITY_EVENT_TYPE.RAPID_SUBMISSION:
        return 'Answer submitted unusually fast after question presentation.';
      case INTEGRITY_EVENT_TYPE.FAILED_SUBMISSION:
        return 'Submission attempt failed validation or network error.';
      case INTEGRITY_EVENT_TYPE.UNEXPECTED_EXIT:
        return 'Session terminated or closed prior to completion.';
      default:
        return `Integrity signal recorded: ${eventType}.`;
    }
  }

  _sanitizeMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') return {};
    // Strip unnecessary personal or sensitive data
    const safe = { ...metadata };
    delete safe.password;
    delete safe.authHeader;
    delete safe.privateKey;
    delete safe.cameraStream;
    return safe;
  }
}

module.exports = new IntegrityService();
