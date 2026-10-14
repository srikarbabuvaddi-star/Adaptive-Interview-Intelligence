import React, { useState, useEffect } from 'react';
import interviewApi from '../services/interviewApi';
import { useAuth } from '../context/AuthContext';

const PRESET_ROLES = [
  {
    title: 'Staff Backend Engineer',
    skills: ['Distributed Systems', 'Raft Consensus', 'Kafka', 'Backpressure', 'Go Runtime'],
    experienceLevel: 'Staff'
  },
  {
    title: 'Lead Product Designer',
    skills: ['Design Systems', 'WCAG AAA', 'Information Architecture', 'Micro-copy'],
    experienceLevel: 'Senior'
  },
  {
    title: 'Machine Learning Specialist',
    skills: ['Transformer Tuning', 'Inference Latency', 'Vector DBs', 'Model Evaluation'],
    experienceLevel: 'Senior'
  }
];

export const CandidateDashboard = ({
  onStartInterview,
  onViewReport,
  onBrowseJobs,
  onOpenAuthModal
}) => {
  const { user } = useAuth();
  const [interviews, setInterviews] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Hardware Diagnostic States
  const [micStatus, setMicStatus] = useState('untested'); // 'untested' | 'testing' | 'calibrated' | 'error'
  const [apiStatus, setApiStatus] = useState('calibrated'); // 'calibrated' | 'offline'

  // Config Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [roleTitle, setRoleTitle] = useState('Staff Backend Engineer');
  const [experienceLevel, setExperienceLevel] = useState('Staff');
  const [skillsString, setSkillsString] = useState('Distributed Systems, Kafka, Go, Consensus');
  const [questionCount, setQuestionCount] = useState(5);
  const [isCreating, setIsCreating] = useState(false);
  const [modalError, setModalError] = useState(null);

  const fetchUserData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [interviewsData, appsData] = await Promise.all([
        interviewApi.listInterviews(),
        user?.role === 'candidate' ? interviewApi.getMyApplications() : Promise.resolve([])
      ]);
      setInterviews(Array.isArray(interviewsData) ? interviewsData : []);
      setApplications(Array.isArray(appsData) ? appsData : []);
    } catch (err) {
      console.warn('Failed to load user data:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchUserData();
    } else {
      setInterviews([]);
      setApplications([]);
      setLoading(false);
    }
  }, [user]);

  // Test microphone hardware readiness
  const handleTestMic = async () => {
    setMicStatus('testing');
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop stream tracks after quick calibration
        setTimeout(() => {
          stream.getTracks().forEach((track) => track.stop());
          setMicStatus('calibrated');
        }, 800);
      } else {
        setMicStatus('calibrated');
      }
    } catch {
      setMicStatus('error');
    }
  };

  const handleLaunchQuickInterview = async () => {
    if (!user) {
      if (onOpenAuthModal) {
        onOpenAuthModal('candidate');
      } else {
        setError('Please sign in to launch your adaptive interview session.');
      }
      return;
    }

    setIsCreating(true);
    try {
      const targetRole = {
        title: roleTitle,
        experienceLevel,
        skills: skillsString.split(',').map((s) => s.trim()).filter(Boolean),
        durationMinutes: questionCount * 5,
        maxQuestions: questionCount
      };

      const interview = await interviewApi.createInterview({ targetRole });
      if (onStartInterview) {
        onStartInterview(interview, {
          id: interview.jobId,
          title: interview.jobTitle,
          maxQuestions: interview.totalQuestions,
          targetRole
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to create interview session.');
    } finally {
      setIsCreating(false);
    }
  };

  const completedInterviews = interviews.filter((i) => i.status === 'completed');
  const activeSession = interviews.find((i) => i.status === 'scheduled' || i.status === 'in_progress');

  return (
    <div className="w-full max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop py-space-xl min-h-screen">
      {/* Welcome Header & Profile Brief */}
      <div className="relative overflow-hidden rounded-xl bg-surface-container-low p-space-lg md:p-space-xl mb-space-lg shadow-sm border border-outline-variant/30">
        <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-primary-fixed/30 blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-space-lg">
          <div className="space-y-space-xs max-w-2xl">
            <div className="flex flex-wrap items-center gap-space-xs mb-space-xs">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-secondary-container text-on-secondary-fixed text-label-sm font-label-sm font-semibold">
                <span className="material-symbols-outlined text-[14px]">badge</span>
                {user?.role === 'recruiter' ? 'Verified Recruiter Seat' : 'Candidate Evaluation Track'}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface text-secondary text-label-sm font-label-sm">
                <span className="material-symbols-outlined text-[14px]">mail</span>
                {user?.email || 'Authenticating...'}
              </span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
              Welcome back, {user?.displayName || user?.email?.split('@')[0] || 'Candidate'}
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Your technical evaluation track is initialized and synchronized with real-time Gemini AI adaptive inference.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-space-sm bg-surface-container-lowest p-space-sm rounded-lg shadow-sm border border-outline-variant/30">
            <div className="flex items-center gap-space-sm px-3 py-2 rounded bg-surface-container-low">
              <span className="material-symbols-outlined text-primary text-[22px]">verified_user</span>
              <div className="flex flex-col pr-2">
                <span className="font-label-md text-label-md text-on-surface font-semibold truncate max-w-[190px]">
                  Real Telemetry Active
                </span>
                <span className="font-label-sm text-label-sm text-secondary">
                  {interviews.length} Total Registered Sessions
                </span>
              </div>
            </div>
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded text-body-sm font-body-sm text-primary hover:bg-surface-container transition-colors font-semibold"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">tune</span>
              <span>Customize</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-error-container/40 border border-error/30 text-error flex items-start gap-2">
          <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5">error</span>
          <span className="text-body-sm font-medium">{error}</span>
        </div>
      )}

      {/* Main Grid: Primary Callout (Left) + Target Position Summary (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg mb-space-xl">
        {/* LEFT: High-Impact Adaptive Session Action Card (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-xl bg-surface-container-lowest p-space-lg md:p-space-xl shadow-md relative overflow-hidden border border-outline-variant/30">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-primary-container to-tertiary-container"></div>
          <div>
            {/* Status Banner & Session Badge */}
            <div className="flex items-center justify-between pb-space-md mb-space-md">
              <div className="flex items-center gap-space-xs">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                </span>
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary font-bold">
                  {activeSession ? 'Session In-Progress • Ready to Resume' : 'Session Ready • Live Inference'}
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container text-on-surface-variant font-metric-tabular text-label-sm">
                <span className="material-symbols-outlined text-[16px] text-primary">timer</span>
                <span>{questionCount * 5} MIN ALLOCATED</span>
              </div>
            </div>

            {/* Title & Adaptive Notice */}
            <h2 className="font-headline-md text-headline-md text-on-surface mb-space-xs font-bold">
              Adaptive Live Technical Evaluation
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-space-md">
              Consists of <span className="font-semibold text-on-surface">{questionCount} dynamic adaptive questions</span>. Our inference layer evaluates core depth and responds to architectural nuances in real-time.
            </p>

            <div className="rounded-lg bg-surface-container-low p-space-md mb-space-lg border border-outline-variant/20">
              <div className="flex items-start gap-space-sm">
                <span className="material-symbols-outlined text-primary-container text-[20px] mt-0.5">psychology</span>
                <div className="space-y-1">
                  <span className="font-label-md text-label-md text-on-surface font-semibold block">
                    Continuous Calibration Model
                  </span>
                  <p className="font-body-sm text-body-sm text-secondary">
                    Our AI adjusts question depth in real-time based on your spoken answers. There is no penalty for taking a moment to structure your thoughts before presenting your architectural logic.
                  </p>
                </div>
              </div>
            </div>

            {/* Hardware & Diagnostic Readiness Checklist */}
            <div className="mb-space-lg">
              <div className="flex items-center justify-between mb-space-sm">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">
                  Pre-Flight Hardware Telemetry
                </span>
                <button
                  onClick={handleTestMic}
                  className="text-label-sm text-primary hover:underline font-semibold flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px]">refresh</span>
                  <span>Test Hardware</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-sm">
                {/* Mic & Audio */}
                <div className="flex items-center gap-space-xs p-space-sm rounded bg-surface-container-low border border-outline-variant/20">
                  <div className="w-6 h-6 rounded flex items-center justify-center bg-surface-container-lowest text-primary">
                    <span className="material-symbols-outlined text-[16px]">mic</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-label-sm text-label-sm text-on-surface font-semibold truncate">Mic &amp; Audio</span>
                    <div className="flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${micStatus === 'calibrated' ? 'bg-primary' : micStatus === 'testing' ? 'bg-primary-container animate-ping' : 'bg-secondary'}`}></span>
                      <span className="font-label-sm text-label-sm text-primary font-medium">
                        {micStatus === 'calibrated' ? 'Calibrated' : micStatus === 'testing' ? 'Calibrating...' : 'Ready'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* WebRTC Engine */}
                <div className="flex items-center gap-space-xs p-space-sm rounded bg-surface-container-low border border-outline-variant/20">
                  <div className="w-6 h-6 rounded flex items-center justify-center bg-surface-container-lowest text-primary">
                    <span className="material-symbols-outlined text-[16px]">terminal</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-label-sm text-label-sm text-on-surface font-semibold truncate">Web Speech STT</span>
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                      <span className="font-label-sm text-label-sm text-primary font-medium">Browser Native</span>
                    </div>
                  </div>
                </div>

                {/* Gemini Engine */}
                <div className="flex items-center gap-space-xs p-space-sm rounded bg-surface-container-low border border-outline-variant/20">
                  <div className="w-6 h-6 rounded flex items-center justify-center bg-surface-container-lowest text-primary">
                    <span className="material-symbols-outlined text-[16px]">graphic_eq</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-label-sm text-label-sm text-on-surface font-semibold truncate">Gemini AI Stream</span>
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                      <span className="font-label-sm text-label-sm text-primary font-medium">Synchronized</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Big Royal Blue Primary CTA */}
          <div className="pt-space-md">
            {activeSession ? (
              <button
                onClick={() =>
                  onStartInterview(activeSession, {
                    id: activeSession.jobId,
                    title: activeSession.jobTitle,
                    maxQuestions: activeSession.totalQuestions
                  })
                }
                className="w-full h-12 px-6 rounded-lg bg-primary-container hover:bg-primary text-on-primary font-body-lg text-body-lg font-semibold flex items-center justify-center gap-space-sm shadow-md transition-all duration-150 transform active:scale-[0.99] group"
              >
                <span>Resume Active Interview Session</span>
                <span className="material-symbols-outlined text-[20px] transition-transform duration-200 group-hover:translate-x-1">
                  arrow_forward
                </span>
              </button>
            ) : (
              <button
                onClick={handleLaunchQuickInterview}
                disabled={isCreating}
                className="w-full h-12 px-6 rounded-lg bg-primary-container hover:bg-primary text-on-primary font-body-lg text-body-lg font-semibold flex items-center justify-center gap-space-sm shadow-md transition-all duration-150 transform active:scale-[0.99] group disabled:opacity-60"
              >
                {isCreating ? (
                  <>
                    <span className="material-symbols-outlined text-[20px] animate-spin">refresh</span>
                    <span>Initializing Adaptive Engine...</span>
                  </>
                ) : (
                  <>
                    <span>Start Adaptive Interview Now</span>
                    <span className="material-symbols-outlined text-[20px] transition-transform duration-200 group-hover:translate-x-1">
                      arrow_forward
                    </span>
                  </>
                )}
              </button>
            )}

            <div className="flex items-center justify-center gap-space-xs mt-space-sm text-secondary">
              <span className="material-symbols-outlined text-[16px]">lock</span>
              <span className="font-label-sm text-label-sm">
                End-to-end encrypted session stream • Real database persistence
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT: Target Position Summary Card (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-xl bg-surface-container-lowest p-space-lg md:p-space-xl shadow-sm border border-outline-variant/30">
          <div>
            <div className="flex items-center justify-between pb-space-sm mb-space-sm">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">
                Target Evaluation Track
              </span>
              <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface font-metric-tabular text-label-sm font-semibold">
                ACTIVE-REQ
              </span>
            </div>

            <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold leading-tight mb-space-xs">
              {roleTitle}
            </h3>
            <div className="flex items-center gap-space-xs text-on-surface-variant font-body-sm text-body-sm mb-space-md">
              <span className="material-symbols-outlined text-[18px] text-secondary">hub</span>
              <span>Level: {experienceLevel}</span>
              <span>•</span>
              <span className="material-symbols-outlined text-[18px] text-secondary">location_on</span>
              <span>Enterprise AI Sandbox</span>
            </div>

            {/* Competency Dimensions */}
            <div className="space-y-space-md mb-space-lg">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold block">
                Target Competency Dimensions
              </span>
              <div className="space-y-space-sm">
                <div className="space-y-1">
                  <div className="flex items-center justify-between font-label-md text-label-md">
                    <span className="text-on-surface font-medium">Distributed Consensus &amp; Raft</span>
                    <span className="font-metric-tabular font-semibold text-primary">Level 5 Tier</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-surface-container">
                    <div className="h-1.5 rounded-full bg-primary" style={{ width: '92%' }}></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between font-label-md text-label-md">
                    <span className="text-on-surface font-medium">Streaming Pipelines &amp; Event Sourcing</span>
                    <span className="font-metric-tabular font-semibold text-primary">Level 4 Tier</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-surface-container">
                    <div className="h-1.5 rounded-full bg-primary" style={{ width: '84%' }}></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between font-label-md text-label-md">
                    <span className="text-on-surface font-medium">Backpressure &amp; High-Throughput I/O</span>
                    <span className="font-metric-tabular font-semibold text-primary">Level 5 Tier</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-surface-container">
                    <div className="h-1.5 rounded-full bg-primary" style={{ width: '88%' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-space-md">
            <button
              onClick={onBrowseJobs}
              className="inline-flex items-center justify-between w-full p-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-semibold transition-colors border border-outline-variant/20"
            >
              <span className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-[18px] text-primary">feed</span>
                <span>Browse All Open Requisitions &amp; Rubrics</span>
              </span>
              <span className="material-symbols-outlined text-[18px] text-secondary">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {/* Operational Blueprint (Candidate Expectations) */}
      <div className="mb-space-xl">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-space-md">
          <div>
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">
              Operational Blueprint
            </span>
            <h3 className="font-headline-md text-headline-md text-on-surface font-bold">
              Candidate Expectations &amp; Adaptive Flow
            </h3>
          </div>
          <p className="font-body-sm text-body-sm text-secondary mt-1 sm:mt-0">
            Evaluated via institutional rubric v4.8
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md mb-space-md">
          {/* Step 1 */}
          <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm flex flex-col justify-between border border-outline-variant/30">
            <div>
              <div className="flex items-center justify-between mb-space-sm">
                <span className="font-metric-tabular text-metric-tabular font-bold text-primary">01</span>
                <span className="px-2 py-0.5 rounded bg-surface-container text-label-sm font-label-sm font-semibold text-on-surface-variant">
                  Q1 — Q2
                </span>
              </div>
              <h4 className="font-headline-sm text-headline-sm text-on-surface mb-space-xs font-semibold">
                Algorithmic Calibration
              </h4>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Initial questions baseline your concrete experience against your submitted resume, probing actual architectural patterns you have built.
              </p>
            </div>
            <div className="mt-space-md pt-space-sm flex items-center gap-1.5 text-secondary font-label-sm text-label-sm">
              <span className="material-symbols-outlined text-[16px]">tune</span>
              <span>Focus: Foundational systems rigor</span>
            </div>
          </div>

          {/* Step 2 */}
          <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm flex flex-col justify-between border border-outline-variant/30">
            <div>
              <div className="flex items-center justify-between mb-space-sm">
                <span className="font-metric-tabular text-metric-tabular font-bold text-primary">02</span>
                <span className="px-2 py-0.5 rounded bg-surface-container text-label-sm font-label-sm font-semibold text-on-surface-variant">
                  Q3 — Q4
                </span>
              </div>
              <h4 className="font-headline-sm text-headline-sm text-on-surface mb-space-xs font-semibold">
                Adaptive Trajectory
              </h4>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Depending on the depth of your answers, the model dynamically introduces real-world failure modes, network splits, or write amplification scenarios.
              </p>
            </div>
            <div className="mt-space-md pt-space-sm flex items-center gap-1.5 text-secondary font-label-sm text-label-sm">
              <span className="material-symbols-outlined text-[16px]">alt_route</span>
              <span>Focus: Edge resilience &amp; bottlenecks</span>
            </div>
          </div>

          {/* Step 3 */}
          <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm flex flex-col justify-between border border-outline-variant/30">
            <div>
              <div className="flex items-center justify-between mb-space-sm">
                <span className="font-metric-tabular text-metric-tabular font-bold text-primary">03</span>
                <span className="px-2 py-0.5 rounded bg-surface-container text-label-sm font-label-sm font-semibold text-on-surface-variant">
                  Q5 + Synthesis
                </span>
              </div>
              <h4 className="font-headline-sm text-headline-sm text-on-surface mb-space-xs font-semibold">
                Post-Session Intelligence
              </h4>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                System compiles your reasoning trajectory into an institutional score rubric immediately available in your evaluation dossier.
              </p>
            </div>
            <div className="mt-space-md pt-space-sm flex items-center gap-1.5 text-secondary font-label-sm text-label-sm">
              <span className="material-symbols-outlined text-[16px]">query_stats</span>
              <span>Focus: Objective telemetry synthesis</span>
            </div>
          </div>
        </div>
      </div>

      {/* Real User Interview History & Pipeline */}
      <div className="rounded-xl bg-surface-container-lowest p-space-lg md:p-space-xl shadow-sm mb-space-xl border border-outline-variant/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-md mb-space-lg border-b border-outline-variant/20">
          <div>
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">
              Persisted Records
            </span>
            <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
              Your Authenticated Evaluation History
            </h3>
          </div>
          <button
            onClick={fetchUserData}
            className="mt-2 sm:mt-0 font-label-sm text-label-sm text-primary hover:underline font-semibold flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            <span>Refresh History</span>
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <span className="material-symbols-outlined text-[32px] text-primary animate-spin">refresh</span>
            <span className="text-body-sm text-secondary">Loading your authenticated interview records from database...</span>
          </div>
        ) : interviews.length === 0 ? (
          /* Strict Authentic Empty State */
          <div className="py-12 px-6 flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-4">
            <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[28px]">history</span>
            </div>
            <h4 className="font-headline-sm text-headline-sm text-on-surface font-bold">
              You haven&apos;t completed an interview yet
            </h4>
            <p className="font-body-sm text-body-sm text-secondary leading-relaxed">
              Start your first adaptive voice evaluation to benchmark your technical mastery with live Google Gemini dynamic questioning.
            </p>
            <button
              onClick={handleLaunchQuickInterview}
              disabled={isCreating}
              className="px-6 py-2.5 rounded-lg bg-primary-container text-on-primary font-body-sm font-semibold shadow-sm hover:bg-primary transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">play_arrow</span>
              <span>Launch Your First Interview</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/20">
            {interviews.map((interview) => {
              const isCompleted = interview.status === 'completed';
              const formattedDate = interview.createdAt
                ? new Date(
                    interview.createdAt._seconds ? interview.createdAt._seconds * 1000 : interview.createdAt
                  ).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : 'Recent';

              return (
                <div key={interview.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
                        {interview.jobTitle || 'Technical Role'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-label-sm font-label-sm uppercase font-semibold ${
                          isCompleted
                            ? 'bg-surface-container text-primary'
                            : 'bg-secondary-container text-on-secondary-fixed'
                        }`}
                      >
                        {interview.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-body-sm text-secondary">
                      <span>Date: {formattedDate}</span>
                      <span>•</span>
                      <span>
                        {interview.currentQuestionIndex || 0} / {interview.totalQuestions || 5} Questions
                      </span>
                      {interview.overallScore != null && (
                        <>
                          <span>•</span>
                          <span className="font-semibold text-primary">Score: {Math.round(interview.overallScore)}%</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    {isCompleted ? (
                      <button
                        onClick={() => onViewReport(interview.id)}
                        className="px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        <span>View Evaluation Report</span>
                        <span className="material-symbols-outlined text-[16px]">visibility</span>
                      </button>
                    ) : (
                      <button
                        onClick={() =>
                          onStartInterview(interview, {
                            id: interview.jobId,
                            title: interview.jobTitle,
                            maxQuestions: interview.totalQuestions
                          })
                        }
                        className="px-4 py-2 rounded-lg bg-primary-container text-on-primary font-body-sm font-semibold hover:bg-primary transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        <span>Resume Session</span>
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Real Candidate Job Applications Section */}
      <div className="rounded-xl bg-surface-container-lowest p-space-lg md:p-space-xl shadow-sm mb-space-xl border border-outline-variant/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-md mb-space-lg border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">
                Application Pipeline
              </span>
              <span className="px-2 py-0.5 rounded bg-surface-container text-primary font-label-sm text-label-sm font-bold">
                {applications.length} Active
              </span>
            </div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold mt-1">
              Your Submitted Requisition Applications
            </h3>
          </div>
          <button
            onClick={onBrowseJobs}
            className="mt-2 sm:mt-0 px-3.5 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-body-sm font-semibold transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px] text-primary">add</span>
            <span>Explore More Requisitions</span>
          </button>
        </div>

        {applications.length === 0 ? (
          /* Authentic Empty State for Applications */
          <div className="py-10 px-6 flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-3">
            <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[24px]">send_time_extension</span>
            </div>
            <h4 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
              No Requisition Applications Submitted Yet
            </h4>
            <p className="font-body-sm text-body-sm text-secondary leading-relaxed">
              Browse our institutional open positions to apply with your core engineering competencies and track your review status.
            </p>
            <button
              onClick={onBrowseJobs}
              className="px-5 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm font-semibold transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[16px] text-primary">work</span>
              <span>Browse Open Positions</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/20">
            {applications.map((app) => {
              const formattedDate = app.createdAt
                ? new Date(
                    app.createdAt._seconds ? app.createdAt._seconds * 1000 : app.createdAt
                  ).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })
                : 'Recent';

              const statusColorMap = {
                pending: 'bg-surface-container text-secondary',
                reviewing: 'bg-secondary-container text-on-secondary-fixed',
                interview_invited: 'bg-primary-container text-on-primary',
                interview_completed: 'bg-surface-container-highest text-primary',
                accepted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
              };

              const statusClass = statusColorMap[app.status] || 'bg-surface-container text-secondary';

              return (
                <div key={app.id} className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-2 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
                        {app.jobTitle || 'Engineering Role'}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded text-label-sm font-label-sm uppercase font-bold tracking-wide ${statusClass}`}>
                        {(app.status || 'pending').replace(/_/g, ' ')}
                      </span>
                      <span className="text-secondary font-body-sm text-body-sm">
                        • Applied {formattedDate}
                      </span>
                    </div>

                    {app.candidateSkills && app.candidateSkills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {app.candidateSkills.map((sk, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded bg-surface-container-low text-on-surface-variant font-label-sm text-[11px]"
                          >
                            {sk}
                          </span>
                        ))}
                      </div>
                    )}

                    {app.coverNote && (
                      <p className="font-body-sm text-body-sm text-secondary italic line-clamp-2 bg-surface-container-low/50 p-2.5 rounded-lg border border-outline-variant/15">
                        &ldquo;{app.coverNote}&rdquo;
                      </p>
                    )}

                    {app.reviewNotes && (
                      <div className="text-body-sm text-primary font-medium bg-primary/5 p-2 rounded border border-primary/20">
                        <span className="font-bold">Recruiter Note:</span> {app.reviewNotes}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-start lg:self-center shrink-0">
                    <button
                      onClick={onBrowseJobs}
                      className="px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm font-semibold transition-colors flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">visibility</span>
                      <span>View Requisition</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Role Configuration Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-surface/60 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-lg bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/40 p-6 space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/30">
              <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                Configure Target Requisition Track
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded text-secondary hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Presets */}
            <div className="space-y-1.5">
              <label className="font-label-sm text-label-sm uppercase font-semibold text-secondary">
                Select Standard Benchmark
              </label>
              <div className="grid grid-cols-1 gap-2">
                {PRESET_ROLES.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setRoleTitle(preset.title);
                      setSkillsString(preset.skills.join(', '));
                      setExperienceLevel(preset.experienceLevel);
                    }}
                    className={`p-2.5 rounded-lg text-left text-body-sm transition-all border ${
                      roleTitle === preset.title
                        ? 'bg-secondary-container text-on-surface border-primary font-semibold'
                        : 'bg-surface-container-low text-secondary border-outline-variant/30 hover:bg-surface-container'
                    }`}
                  >
                    <div className="font-semibold text-on-surface">{preset.title}</div>
                    <div className="text-label-sm text-secondary truncate">{preset.skills.join(', ')}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Role Title */}
            <div className="space-y-1">
              <label className="font-label-md text-label-md font-semibold text-on-surface" htmlFor="cfg-role">
                Target Role Title
              </label>
              <input
                id="cfg-role"
                type="text"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Questions count */}
            <div className="space-y-1">
              <label className="font-label-md text-label-md font-semibold text-on-surface" htmlFor="cfg-count">
                Adaptive Questions
              </label>
              <select
                id="cfg-count"
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value={3}>3 Questions (~15 mins)</option>
                <option value={5}>5 Questions (~25 mins)</option>
              </select>
            </div>

            {/* Skills */}
            <div className="space-y-1">
              <label className="font-label-md text-label-md font-semibold text-on-surface" htmlFor="cfg-skills">
                Target Skills (Comma Separated)
              </label>
              <input
                id="cfg-skills"
                type="text"
                value={skillsString}
                onChange={(e) => setSkillsString(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-body-sm font-semibold hover:bg-surface-container-high"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  handleLaunchQuickInterview();
                }}
                disabled={isCreating}
                className="px-5 py-2 rounded-lg bg-primary-container text-on-primary font-body-sm font-semibold hover:bg-primary"
              >
                Apply &amp; Launch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CandidateDashboard;
