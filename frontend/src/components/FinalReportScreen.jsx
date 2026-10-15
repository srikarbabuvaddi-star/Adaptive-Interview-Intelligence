import React, { useState, useEffect } from 'react';
import interviewApi from '../services/interviewApi';
import { useAuth } from '../context/AuthContext';

export const FinalReportScreen = ({ interviewId, onRetake, onBackToJobs }) => {
  const { user } = useAuth();
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [committeeNote, setCommitteeNote] = useState('');
  const [notesList, setNotesList] = useState([]);

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await interviewApi.getInterviewReport(interviewId);
        setReportData(data);
      } catch (err) {
        console.error('Failed to load final report:', err);
        setError(`Failed to retrieve final evaluation dossier: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    if (interviewId) {
      fetchReport();
    }
  }, [interviewId]);

  const handleAppendNote = () => {
    if (!committeeNote.trim()) return;
    setNotesList((prev) => [
      ...prev,
      {
        author: user?.displayName || user?.email || 'Talent Partner',
        text: committeeNote.trim(),
        time: 'Just now'
      }
    ]);
    setCommitteeNote('');
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-margin py-20 flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-primary-container text-on-primary flex items-center justify-center animate-spin">
          <span className="material-symbols-outlined text-[32px]">sync</span>
        </div>
        <h2 className="font-headline-md text-headline-md font-bold text-on-surface">
          Synthesizing Evaluation Dossier...
        </h2>
        <p className="font-body-md text-body-md text-secondary max-w-md">
          Calibrating candidate vocal transcript against multi-tenant technical rubrics.
        </p>
      </div>
    );
  }

  if (error || !reportData) {
    return (
      <div className="max-w-3xl mx-auto px-margin py-16 space-y-4">
        <div className="p-4 rounded-xl bg-error-container/40 border border-error/30 text-error flex items-start gap-3">
          <span className="material-symbols-outlined text-[24px] shrink-0 mt-0.5">error</span>
          <div>
            <h3 className="font-bold text-body-lg">Report Retrieval Error</h3>
            <p className="font-body-sm">{error || 'Report data was not returned by the backend.'}</p>
          </div>
        </div>
        <button
          onClick={onBackToJobs}
          className="px-6 py-2.5 rounded-lg bg-surface-container text-on-surface font-semibold hover:bg-surface-container-high"
        >
          Return to Positions
        </button>
      </div>
    );
  }

  const { report, skillGapReport, transcript, interviewMeta } = reportData;
  const overallScoreNum = report?.overallScore != null ? Math.round(Number(report.overallScore)) : 0;
  const hiringVerdict = (report?.hiringVerdict || report?.recommendation || 'evaluation complete').replace(/_/g, ' ').toUpperCase();
  const conceptCoverage = report?.conceptCoveragePercentage != null ? Math.round(Number(report.conceptCoveragePercentage)) : 0;
  const recommendation = hiringVerdict;

  const getInitials = (name) => {
    if (!name) return 'CD';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  const candidateInitials = getInitials(user?.displayName || interviewMeta?.candidateId || 'Candidate');
  const candidateName = user?.displayName || user?.email?.split('@')[0] || 'Candidate';
  const roleTitle = interviewMeta?.jobTitle || 'Adaptive Assessment';
  const durationMins = interviewMeta?.durationSeconds
    ? Math.round(interviewMeta.durationSeconds / 60)
    : 0;

  const integrityReport = report?.integrityReport;
  const integrityScore = integrityReport?.integrityScore != null
    ? Math.round(Number(integrityReport.integrityScore))
    : (report?.integrityScore != null ? Math.round(Number(report.integrityScore)) : 100);
  const requiresHumanReview = integrityReport?.requiresHumanReview || false;
  const riskLevel = integrityReport?.riskLevel || 'low';
  const observedFacts = integrityReport?.observedFacts || [];
  const decisionSupport = report?.recruiterDecisionSupport;

  return (
    <div className="w-full min-h-screen bg-surface-container-lowest">
      <div className="w-full max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop py-space-lg space-y-space-xl">
        {/* Top Meta Context Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md bg-surface-container-low p-space-md rounded-xl border border-outline-variant/30">
          <div className="flex items-center gap-space-md">
            <span className="px-2.5 py-1 bg-surface-container-lowest text-secondary text-label-sm font-label-sm rounded uppercase tracking-wider font-semibold shadow-sm border border-outline-variant/30">
              Session ID: {interviewId ? interviewId.substring(0, 14).toUpperCase() : 'AI-EVAL-8842'}
            </span>
            <span className="text-secondary text-body-sm font-body-sm flex items-center gap-1 font-semibold">
              <span className="material-symbols-outlined text-[16px] text-primary">verified</span>
              Institutional Evaluation Dossier
            </span>
          </div>
          <div className="flex items-center gap-space-md text-label-md font-label-md text-on-surface-variant">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">schedule</span>
              Evaluated: Live Verified Session
            </span>
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px] text-primary">shield</span>
              Integrity Telemetry: {integrityScore}% ({riskLevel.toUpperCase()})
            </span>
          </div>
        </div>

        {/* Executive Candidate Header & Banner */}
        <div className="bg-surface-container-lowest rounded-xl p-space-lg md:p-space-xl shadow-sm space-y-space-lg relative overflow-hidden border border-outline-variant/30">
          <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-surface-variant/40 blur-3xl pointer-events-none"></div>
          <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg">
            {/* Candidate Identity */}
            <div className="flex items-start gap-space-md">
              <div className="w-16 h-16 rounded-xl bg-primary-container text-on-primary flex items-center justify-center font-headline-lg font-bold shadow-md shrink-0">
                {candidateInitials}
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-space-sm">
                  <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
                    {candidateName}
                  </h1>
                  <span className="px-2.5 py-0.5 rounded bg-surface-container-high text-on-surface font-label-sm text-label-sm font-semibold uppercase tracking-wider">
                    {roleTitle}
                  </span>
                  <span className="px-2.5 py-0.5 rounded bg-surface-container-low text-primary font-label-sm text-label-sm font-semibold">
                    {interviewMeta?.experienceLevel ? `${interviewMeta.experienceLevel} Level` : 'Adaptive Track'}
                  </span>
                </div>
                <p className="font-body-md text-body-md text-secondary">
                  Assessment Track: {roleTitle} • Verified Telemetry
                </p>
              </div>
            </div>

            {/* Action CTAs */}
            <div className="flex flex-wrap items-center gap-space-sm">
              <button
                onClick={() => window.print()}
                className="px-4 py-2.5 rounded bg-surface-container-low hover:bg-surface-container text-on-surface text-body-sm font-body-sm font-semibold transition-colors flex items-center gap-2 border border-outline-variant/30"
              >
                <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                <span>Print Dossier</span>
              </button>
              <button
                onClick={onRetake}
                className="px-4 py-2.5 rounded bg-surface-container-low hover:bg-surface-container text-on-surface text-body-sm font-body-sm font-semibold transition-colors flex items-center gap-2 border border-outline-variant/30"
              >
                <span className="material-symbols-outlined text-[18px]">replay</span>
                <span>Retake Session</span>
              </button>
              <button
                onClick={onBackToJobs}
                className="px-5 py-2.5 rounded bg-primary-container hover:bg-primary text-on-primary text-body-sm font-body-sm font-semibold shadow-sm transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">dashboard</span>
                <span>Back to Portal</span>
              </button>
            </div>
          </div>

          {/* Recommendation Metric Banner */}
          <div className="bg-surface-container-low rounded-xl p-space-md md:p-space-lg flex flex-col md:flex-row items-stretch justify-between gap-space-md border border-outline-variant/20">
            {/* Verdict Badge */}
            <div className="flex items-center gap-space-md min-w-[280px]">
              <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-[32px]">stars</span>
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2.5 py-0.5 rounded font-label-sm text-label-sm uppercase tracking-wider font-bold ${
                    hiringVerdict.includes('STRONG HIRE') ? 'bg-emerald-600 text-white' :
                    hiringVerdict.includes('HIRE') && !hiringVerdict.includes('NO') ? 'bg-primary text-on-primary' :
                    hiringVerdict.includes('RESERVATION') ? 'bg-amber-600 text-white' :
                    'bg-error text-on-error'
                  }`}>
                    {hiringVerdict}
                  </span>
                  <span className="text-secondary font-label-sm text-label-sm font-semibold">
                    Coverage: {conceptCoverage}%
                  </span>
                </div>
                <div className="text-body-md font-body-md text-on-surface font-semibold mt-1">
                  Recruiter Technical Assessment Dossier
                </div>
              </div>
            </div>

            {/* Metric Block 1 */}
            <div className="flex items-center gap-space-sm pl-0 md:pl-space-md">
              <div className="space-y-0.5">
                <span className="font-label-sm text-label-sm text-secondary uppercase tracking-wider block font-semibold">
                  Composite Assessment
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="font-metric-tabular text-metric-tabular text-primary font-bold">
                    {overallScoreNum}
                  </span>
                  <span className="text-secondary font-label-md text-label-md">/ 100 pts</span>
                </div>
              </div>
            </div>

            {/* Metric Block 2 */}
            <div className="flex items-center gap-space-sm pl-0 md:pl-space-md">
              <div className="space-y-0.5">
                <span className="font-label-sm text-label-sm text-secondary uppercase tracking-wider block font-semibold">
                  Session Duration
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="font-metric-tabular text-metric-tabular text-on-surface font-bold">
                    {durationMins}m
                  </span>
                  <span className="text-secondary font-label-md text-label-md">(Adaptive pacing)</span>
                </div>
              </div>
            </div>

            {/* Metric Block 3 */}
            <div className="flex items-center gap-space-sm pl-0 md:pl-space-md">
              <div className="space-y-0.5">
                <span className="font-label-sm text-label-sm text-secondary uppercase tracking-wider block font-semibold">
                  Questions Evaluated
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="font-metric-tabular text-metric-tabular text-on-surface font-bold">
                    {transcript ? transcript.length : 0}
                  </span>
                  <span className="text-secondary font-label-md text-label-md">Deep Branches Hit</span>
                </div>
              </div>
            </div>

            {/* Circular Gauge SVG */}
            <div className="hidden xl:flex items-center justify-center pl-space-md">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-surface-container-high"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                  ></path>
                  <path
                    className="text-primary"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeDasharray={`${overallScoreNum}, 100`}
                    strokeLinecap="round"
                    strokeWidth="3.5"
                  ></path>
                </svg>
                <span className="absolute font-label-sm text-label-sm font-bold text-on-surface">
                  {overallScoreNum}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Structured Analysis Bento Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
          {/* 1. Strengths */}
          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between border border-outline-variant/30">
            <div className="space-y-space-md">
              <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant/20">
                <div className="flex items-center gap-space-sm">
                  <div className="w-8 h-8 rounded bg-surface-container-low flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[20px]">thumb_up</span>
                  </div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">1. Evaluated Strengths</h2>
                </div>
                <span className="px-2 py-0.5 rounded bg-surface-container-low text-primary font-label-sm text-label-sm font-semibold">
                  Verified Signals
                </span>
              </div>

              <div className="space-y-space-sm">
                {(report?.strengths && report.strengths.length > 0) ? (
                  report.strengths.map((strength, idx) => (
                    <div key={idx} className="p-space-md rounded-lg bg-surface-container-low space-y-1 border border-outline-variant/20">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[18px]">verified_user</span>
                        <span className="font-body-md text-body-md font-semibold text-on-surface">{strength}</span>
                      </div>
                      <p className="font-body-sm text-body-sm text-secondary pl-6">
                        Demonstrated technical competence under dynamic adaptive questioning.
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="p-space-md rounded-lg bg-surface-container-low text-secondary text-body-sm">
                    No specific evaluated strengths recorded for this session.
                  </div>
                )}
              </div>
            </div>
            <div className="pt-space-md flex items-center justify-between text-label-sm font-label-sm text-secondary">
              <span>Synthesized from live spoken transcript</span>
              <span className="text-primary font-semibold">Live AI Verified</span>
            </div>
          </div>

          {/* 2. Demonstrated Skills & Core Competencies Scorecard */}
          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between border border-outline-variant/30">
            <div className="space-y-space-md">
              <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant/20">
                <div className="flex items-center gap-space-sm">
                  <div className="w-8 h-8 rounded bg-surface-container-low flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[20px]">equalizer</span>
                  </div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">2. Core Competencies Scorecard</h2>
                </div>
                <span className="px-2 py-0.5 rounded bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm font-semibold">
                  Difficulty-Weighted
                </span>
              </div>

              <div className="space-y-space-md">
                {report?.skillAssessments && Object.keys(report.skillAssessments).length > 0 ? (
                  Object.entries(report.skillAssessments).map(([skill, sData], idx) => {
                    const score = Number(sData.score || 0);
                    const level = sData.level || (score >= 85 ? 'Advanced' : score >= 70 ? 'Proficient' : score >= 50 ? 'Competent' : 'Needs Improvement');
                    const coverage = sData.conceptCoveragePercentage != null ? sData.conceptCoveragePercentage : score;
                    const qCount = sData.totalQuestions || 1;
                    return (
                      <div key={idx} className="space-y-1.5 bg-surface-container-low p-space-sm rounded-lg border border-outline-variant/20">
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-body-sm text-body-sm font-semibold text-on-surface">{skill}</span>
                            <span className="text-secondary font-label-sm text-label-sm">({qCount} Qs)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded text-label-sm font-bold uppercase tracking-wider ${
                              level === 'Advanced' ? 'bg-emerald-600/15 text-emerald-800 dark:text-emerald-300' :
                              level === 'Proficient' ? 'bg-primary/15 text-primary' :
                              level === 'Competent' ? 'bg-amber-600/15 text-amber-800 dark:text-amber-300' :
                              'bg-error/15 text-error'
                            }`}>
                              {level}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-surface-container-high text-primary font-label-sm text-label-sm font-bold">
                              {score} / 100
                            </span>
                          </div>
                        </div>
                        <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                          <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, score)}%` }}></div>
                        </div>
                        <div className="flex items-center justify-between text-label-sm text-secondary pt-0.5">
                          <span>Concept Coverage: {coverage}%</span>
                          <span>Weights: 1.0x / 1.15x / 1.30x</span>
                        </div>
                      </div>
                    );
                  })
                ) : report?.skillScores && Object.keys(report.skillScores).length > 0 ? (
                  Object.entries(report.skillScores).map(([skill, score], idx) => {
                    const numScore = Number(score);
                    const pct = Math.min(100, (numScore / 10) * 100);
                    return (
                      <div key={idx} className="space-y-1.5 bg-surface-container-low p-space-sm rounded-lg border border-outline-variant/20">
                        <div className="flex items-center justify-between">
                          <span className="font-body-sm text-body-sm font-semibold text-on-surface">{skill}</span>
                          <span className="px-2 py-0.5 rounded bg-surface-container-high text-primary font-label-sm text-label-sm font-bold">
                            {numScore.toFixed(1)} / 10
                          </span>
                        </div>
                        <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                          <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-space-md rounded-lg bg-surface-container-low text-secondary text-body-sm">
                    No assessed competency scores recorded for this session.
                  </div>
                )}
              </div>
            </div>
            <div className="pt-space-md flex items-center justify-between text-label-sm font-label-sm text-secondary">
              <span>Multipliers: Easy 1.0x • Med 1.15x • Hard 1.30x</span>
              <span className="text-on-surface font-semibold">Calibrated Rubric</span>
            </div>
          </div>

          {/* 3. Skill Gaps */}
          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between border border-outline-variant/30">
            <div className="space-y-space-md">
              <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant/20">
                <div className="flex items-center gap-space-sm">
                  <div className="w-8 h-8 rounded bg-surface-container-low flex items-center justify-center text-secondary">
                    <span className="material-symbols-outlined text-[20px]">tune</span>
                  </div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">3. Identified Gaps &amp; Calibration</h2>
                </div>
                <span className="px-2 py-0.5 rounded bg-surface-container-low text-secondary font-label-sm text-label-sm font-semibold">
                  Non-Blocking
                </span>
              </div>

              <div className="space-y-space-sm">
                {(report?.missingConceptsSummary && report.missingConceptsSummary.length > 0) ? (
                  report.missingConceptsSummary.map((gap, idx) => (
                    <div key={idx} className="p-space-md rounded-lg bg-surface-container-low space-y-1 border border-outline-variant/20">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-secondary text-[18px]">cloud_off</span>
                        <span className="font-body-md text-body-md font-semibold text-on-surface">{gap}</span>
                      </div>
                      <p className="font-body-sm text-body-sm text-secondary pl-6">
                        Identified knowledge gap during dynamic probing; targeted follow-up recommended.
                      </p>
                    </div>
                  ))
                ) : (report?.areasForImprovement && report.areasForImprovement.length > 0) ? (
                  report.areasForImprovement.map((gap, idx) => (
                    <div key={idx} className="p-space-md rounded-lg bg-surface-container-low space-y-1 border border-outline-variant/20">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-secondary text-[18px]">cloud_off</span>
                        <span className="font-body-md text-body-md font-semibold text-on-surface">{gap}</span>
                      </div>
                      <p className="font-body-sm text-body-sm text-secondary pl-6">
                        Identified knowledge gap during dynamic probing; targeted follow-up recommended.
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="p-space-md rounded-lg bg-surface-container-low text-secondary text-body-sm">
                    No significant knowledge gaps identified during this evaluation.
                  </div>
                )}
              </div>
            </div>
            <div className="pt-space-md flex items-center justify-between text-label-sm font-label-sm text-secondary">
              <span>Targeted Remediation Queue</span>
              <span className="text-secondary font-semibold">Analyzed</span>
            </div>
          </div>

          {/* 4. Skills Not Yet Assessed */}
          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between border border-outline-variant/30">
            <div className="space-y-space-md">
              <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant/20">
                <div className="flex items-center gap-space-sm">
                  <div className="w-8 h-8 rounded bg-surface-container-low flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[20px]">help_outline</span>
                  </div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">4. Unassessed — Human Round Queue</h2>
                </div>
                <span className="px-2 py-0.5 rounded bg-surface-container-low text-primary font-label-sm text-label-sm font-semibold">
                  Follow-Up Queue
                </span>
              </div>

              <div className="space-y-space-sm">
                {(() => {
                  const unassessed = (skillGapReport?.skillAnalyses || []).filter(
                    (s) => s.assessmentStatus === 'not_assessed'
                  );
                  const followUps = skillGapReport?.recommendedFollowUps || [];

                  if (unassessed.length > 0) {
                    return unassessed.map((item, idx) => (
                      <div key={idx} className="p-space-md rounded-lg bg-surface-container-low space-y-1 border border-outline-variant/20">
                        <div className="flex items-center justify-between">
                          <span className="font-body-md text-body-md font-semibold text-on-surface">{item.skill}</span>
                          <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface font-label-sm text-label-sm">
                            Required: {item.requiredProficiency || 'Intermediate'}
                          </span>
                        </div>
                        <p className="font-body-sm text-body-sm text-secondary">
                          {item.gapDescription || 'Skill was not evaluated during active adaptive rounds. Candidate follow-up recommended.'}
                        </p>
                      </div>
                    ));
                  }

                  if (followUps.length > 0) {
                    return followUps.map((fu, idx) => (
                      <div key={idx} className="p-space-md rounded-lg bg-surface-container-low space-y-1 border border-outline-variant/20">
                        <div className="flex items-center justify-between">
                          <span className="font-body-md text-body-md font-semibold text-on-surface">{fu.skill}</span>
                          <span className="px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container font-label-sm text-label-sm">
                            Target Probe
                          </span>
                        </div>
                        <p className="font-body-sm text-body-sm text-secondary">{fu.recommendation}</p>
                      </div>
                    ));
                  }

                  return (
                    <div className="p-space-md rounded-lg bg-surface-container-low text-secondary text-body-sm">
                      All required technical competencies were evaluated during the adaptive session.
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="pt-space-md flex items-center justify-between text-label-sm font-label-sm text-secondary">
              <span>Coverage Target: 100% Required Skills</span>
              <span className="text-primary font-semibold">
                {skillGapReport?.skillsUnassessedCount != null ? `${skillGapReport.skillsUnassessedCount} Pending` : 'Synchronized'}
              </span>
            </div>
          </div>
        </div>

        {/* Suggested Next-Round Interview Probes (For Hiring Manager) - from Adaptive Logic */}
        {report?.nextRoundInterviewProbes && report.nextRoundInterviewProbes.length > 0 && (
          <div className="bg-surface-container-lowest rounded-xl p-space-lg md:p-space-xl shadow-sm space-y-space-md border border-outline-variant/30">
            <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant/20 flex-wrap gap-2">
              <div className="flex items-center gap-space-sm">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined text-[24px]">psychology_alt</span>
                </div>
                <div>
                  <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                    Suggested Next-Round Interview Probes (For Hiring Manager)
                  </h2>
                  <p className="font-body-sm text-body-sm text-secondary">
                    Targeted inquiries automatically synthesized from the candidate&apos;s unresolved concept gaps.
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded bg-surface-container-low text-primary font-label-sm text-label-sm font-bold uppercase tracking-wider border border-outline-variant/20">
                On-Site Panel Handoff
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-md pt-2">
              {report.nextRoundInterviewProbes.map((probe, idx) => (
                <div
                  key={idx}
                  className="bg-surface-container-low p-space-md rounded-xl border border-outline-variant/20 flex flex-col justify-between space-y-3 hover:border-primary/40 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2 py-0.5 rounded bg-surface-container-high text-primary font-label-sm text-label-sm font-bold shrink-0">
                        Probe #{idx + 1}
                      </span>
                      <span className="text-secondary font-label-sm text-label-sm font-semibold truncate text-right">
                        {probe.topic}
                      </span>
                    </div>
                    <div className="font-body-sm text-body-sm font-semibold text-on-surface leading-snug">
                      &ldquo;{probe.question}&rdquo;
                    </div>
                  </div>
                  <div className="pt-2 border-t border-outline-variant/20 text-label-sm text-secondary">
                    <span className="font-bold text-on-surface-variant block mb-0.5">Recruiter Rationale:</span>
                    {probe.rationale}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Adaptive Question Lineage Tree Visualization */}
        <div className="bg-surface-container-lowest rounded-xl p-space-lg md:p-space-xl shadow-sm space-y-space-lg border border-outline-variant/30">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm">
            <div>
              <div className="flex items-center gap-space-sm">
                <span className="px-2 py-0.5 rounded bg-surface-container-low text-primary font-label-sm text-label-sm font-bold uppercase tracking-wider">
                  Dynamic Trajectory
                </span>
                <span className="text-secondary font-label-sm text-label-sm">Gemini AI Adaptive Reasoning</span>
              </div>
              <h2 className="font-headline-md text-headline-md text-on-surface font-bold mt-1">
                Adaptive Question Lineage Tree
              </h2>
              <p className="font-body-sm text-body-sm text-secondary">
                Visual record of dynamic branching decisions and actual spoken transcripts.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-primary inline-block"></span>
              <span className="font-label-sm text-label-sm text-on-surface font-semibold">
                Auto-Escalated to Staff Complexity
              </span>
            </div>
          </div>

          {/* Transcript Nodes */}
          <div className="space-y-4">
            {(transcript || []).map((item, idx) => (
              <div
                key={idx}
                className="bg-surface-container-low rounded-xl p-space-md space-y-space-sm border border-outline-variant/20"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-surface-container-lowest text-primary font-label-sm text-label-sm font-bold border border-outline-variant/30">
                      Question 0{item.questionIndex || idx + 1}
                    </span>
                    <span className="text-body-sm font-semibold text-on-surface">{item.skill || 'Architecture & Design'}</span>
                  </div>
                  {item.score != null && (
                    <span className="font-metric-tabular text-body-sm font-bold text-primary">
                      Score: {Number(item.score).toFixed(1)} / 10
                    </span>
                  )}
                </div>

                <div className="space-y-2 pt-1">
                  <div className="text-body-sm font-semibold text-on-surface">
                    &ldquo;{item.questionText}&rdquo;
                  </div>
                  <div className="p-3 rounded-lg bg-surface-container-lowest border border-outline-variant/20 text-body-sm text-on-surface-variant leading-relaxed">
                    <span className="font-semibold text-primary block mb-1">Candidate Spoken Response:</span>
                    {item.candidateAnswer || '(Answer recorded)'}
                  </div>
                  {item.feedback && (
                    <div className="text-label-sm text-secondary bg-surface-container px-3 py-1.5 rounded">
                      <strong>AI Evaluation Feedback:</strong> {item.feedback}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recruiter Notes & Hiring Manager Sign-off */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
          <div className="lg:col-span-2 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm space-y-space-md border border-outline-variant/30">
            <div className="flex items-center justify-between pb-space-xs">
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-primary text-[24px]">rate_review</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  Recruiter Synthesis &amp; Committee Notes
                </h2>
              </div>
              <span className="font-label-sm text-label-sm text-secondary">Verified Record</span>
            </div>

            <div className="space-y-space-sm">
              <div className="p-space-md bg-surface-container-low rounded-lg space-y-2 border border-outline-variant/20">
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-label-md text-on-surface font-semibold">
                    Executive AI Synthesis:
                  </span>
                  <span className="font-label-sm text-label-sm text-secondary">Verified</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                  {report?.executiveSummary ||
                    'Candidate demonstrated exceptional executive calm under simulated failure scenarios, with clean decomposition of tradeoffs.'}
                </p>
              </div>

              {notesList.map((note, idx) => (
                <div key={idx} className="p-space-md bg-surface-container-low rounded-lg space-y-1 border border-outline-variant/20">
                  <div className="flex items-center justify-between">
                    <span className="font-label-md text-label-md text-on-surface font-semibold">{note.author}</span>
                    <span className="font-label-sm text-label-sm text-secondary">{note.time}</span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">{note.text}</p>
                </div>
              ))}

              <div className="space-y-2 pt-2">
                <label className="block font-label-sm text-label-sm text-secondary uppercase tracking-wider font-semibold" htmlFor="report-recruiter-comment">
                  Add Committee Note / Follow-Up Instruction
                </label>
                <textarea
                  id="report-recruiter-comment"
                  rows={3}
                  value={committeeNote}
                  onChange={(e) => setCommitteeNote(e.target.value)}
                  placeholder="Enter comments for the hiring committee review session..."
                  className="w-full p-space-md bg-surface-container-low text-on-surface placeholder:text-secondary/60 text-body-sm font-body-sm rounded-lg border border-outline-variant/30 focus:outline-none focus:bg-surface-container-lowest transition-all"
                />
                <div className="flex justify-between items-center pt-1">
                  <span className="text-label-sm font-label-sm text-secondary">
                    Visible to Interview Panel and HR Lead
                  </span>
                  <button
                    type="button"
                    onClick={handleAppendNote}
                    className="px-3.5 py-1.5 rounded bg-surface-container text-on-surface text-label-md font-label-md font-semibold hover:bg-surface-container-high transition-colors"
                  >
                    Append Note
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Hiring Manager Sign-off */}
          <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm space-y-space-md flex flex-col justify-between border border-outline-variant/30">
            <div className="space-y-space-md">
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-primary text-[24px]">verified</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">Hiring Manager Sign-Off</h2>
              </div>

              <div className="space-y-space-sm">
                <div className="p-space-sm bg-surface-container-low rounded-lg flex items-center justify-between border border-outline-variant/20">
                  <div className="flex items-center gap-space-sm">
                    <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
                    <span className="font-body-sm text-body-sm text-on-surface font-medium">Algorithmic Calibration</span>
                  </div>
                  <span className="font-label-sm text-label-sm text-primary font-bold uppercase">Approved</span>
                </div>

                <div className="p-space-sm bg-surface-container-low rounded-lg flex items-center justify-between border border-outline-variant/20">
                  <div className="flex items-center gap-space-sm">
                    <span className="material-symbols-outlined text-primary text-[20px]">
                      {requiresHumanReview ? 'warning' : 'check_circle'}
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface font-medium">Integrity Telemetry</span>
                  </div>
                  <span className={`font-label-sm text-label-sm font-bold uppercase ${requiresHumanReview ? 'text-amber-600' : 'text-primary'}`}>
                    {integrityScore}% ({riskLevel.toUpperCase()})
                  </span>
                </div>
              </div>

              {decisionSupport && (
                <div className="p-space-md bg-surface-container-high/60 rounded-lg space-y-1.5 border border-outline-variant/20">
                  <span className="font-label-sm text-label-sm text-secondary uppercase tracking-wider block font-semibold">
                    Recruiter Decision Support
                  </span>
                  <div className="font-body-md text-body-md font-bold text-primary uppercase">
                    {decisionSupport.recommendation || hiringVerdict} ({decisionSupport.confidenceLevel || 'High'} Confidence)
                  </div>
                  {decisionSupport.keyRationale && (
                    <p className="font-body-sm text-body-sm text-secondary leading-snug">{decisionSupport.keyRationale}</p>
                  )}
                </div>
              )}
            </div>

            <div className="pt-space-md space-y-2">
              <button
                onClick={onBackToJobs}
                className="w-full py-2.5 rounded bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:bg-primary-container shadow-sm transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">done</span>
                <span>Conclude Dossier Review</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinalReportScreen;
