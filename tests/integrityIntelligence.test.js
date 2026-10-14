const integrityService = require('../src/services/intelligence/integrity.service');
const { INTEGRITY_EVENT_TYPE, REVIEW_STATUS } = require('../src/constants/interviewStatus');

describe('Interview Integrity Intelligence Unit Tests', () => {
  it('should record an integrity event and sanitize metadata', async () => {
    const event = await integrityService.recordEvent({
      interviewId: 'int-test-integrity-1',
      candidateId: 'cand-test-1',
      eventType: INTEGRITY_EVENT_TYPE.TAB_SWITCH,
      eventSource: 'browser_window',
      metadata: {
        durationMs: 3200,
        unfocusedAt: '2026-10-11T12:00:00.000Z',
        password: 'sensitive-password-should-be-stripped'
      },
      severity: 'medium'
    });

    expect(event.id).toBeDefined();
    expect(event.eventType).toBe(INTEGRITY_EVENT_TYPE.TAB_SWITCH);
    expect(event.metadata.durationMs).toBe(3200);
    expect(event.metadata.password).toBeUndefined(); // Sensitive field stripped
    expect(event.reviewStatus).toBe(REVIEW_STATUS.UNREVIEWED);
    expect(event.explanation).toContain('3.2 seconds');
  });

  it('should generate a strictly ordered chronological timeline', async () => {
    const timeline = await integrityService.getChronologicalTimeline('int-test-integrity-1');
    expect(Array.isArray(timeline)).toBe(true);
    if (timeline.length > 1) {
      for (let i = 0; i < timeline.length - 1; i++) {
        expect(new Date(timeline[i].timestamp).getTime()).toBeLessThanOrEqual(
          new Date(timeline[i + 1].timestamp).getTime()
        );
      }
    }
  });

  it('should NOT flag cheating or high risk for a single isolated tab switch event', () => {
    const singleEvent = [
      {
        eventType: INTEGRITY_EVENT_TYPE.TAB_SWITCH,
        metadata: { durationMs: 1500 }
      }
    ];

    const analysis = integrityService.analyzeIntegrityPatterns(singleEvent);
    expect(analysis.riskLevel).toBe('low');
    expect(analysis.requiresHumanReview).toBe(false);
    expect(analysis.reviewFlags.length).toBe(0);
    expect(analysis.integrityScore).toBeGreaterThanOrEqual(90);
    expect(analysis.recruiterSummary).toContain('standard interview session engagement');
  });

  it('should detect repeated focus loss pattern and flag for human review', () => {
    const multipleEvents = [
      { eventType: INTEGRITY_EVENT_TYPE.TAB_SWITCH, metadata: { durationMs: 2000 } },
      { eventType: INTEGRITY_EVENT_TYPE.TAB_SWITCH, metadata: { durationMs: 4000 } },
      { eventType: INTEGRITY_EVENT_TYPE.WINDOW_BLUR, metadata: { durationMs: 3000 } },
      { eventType: INTEGRITY_EVENT_TYPE.TAB_SWITCH, metadata: { durationMs: 5000 } }
    ];

    const analysis = integrityService.analyzeIntegrityPatterns(multipleEvents);
    expect(analysis.requiresHumanReview).toBe(true);
    expect(analysis.reviewFlags.some(f => f.flagType === 'REPEATED_FOCUS_LOSS')).toBe(true);
    expect(analysis.observedFacts.some(fact => fact.includes('4'))).toBe(true);
    // Neutral, non-accusatory recruiter summary
    expect(analysis.recruiterSummary.toLowerCase()).toContain('recommend');
  });

  it('should clearly distinguish observed facts from inferred risk', () => {
    const events = [
      { eventType: INTEGRITY_EVENT_TYPE.COPY_PASTE, metadata: { textLength: 120 } },
      { eventType: INTEGRITY_EVENT_TYPE.COPY_PASTE, metadata: { textLength: 250 } }
    ];

    const analysis = integrityService.analyzeIntegrityPatterns(events);
    // Observed facts list exact counts without accusation:
    expect(analysis.observedFacts).toEqual(
      expect.arrayContaining([expect.stringContaining('Copy-paste events: 2')])
    );
    // Inferred risk provides level:
    expect(analysis.riskLevel).toBe('moderate');
  });

  it('should allow recruiter to update review status of an integrity event', async () => {
    const event = await integrityService.recordEvent({
      interviewId: 'int-test-integrity-2',
      candidateId: 'cand-test-2',
      eventType: INTEGRITY_EVENT_TYPE.TAB_SWITCH,
      metadata: { durationMs: 2500 }
    });

    const updated = await integrityService.updateReviewStatus(
      event.id,
      'recruiter-reviewer-1',
      REVIEW_STATUS.REVIEWED,
      'Candidate switched tab to consult approved API documentation.'
    );

    expect(updated.reviewStatus).toBe(REVIEW_STATUS.REVIEWED);
    expect(updated.reviewedBy).toBe('recruiter-reviewer-1');
    expect(updated.reviewNotes).toContain('approved API documentation');
  });
});
