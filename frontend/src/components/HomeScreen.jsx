import React from 'react';

export const HomeScreen = ({
  onStartInterview,
  onNavigateExplorer,
  onExploreRecruiter,
  onCandidateSetup,
  onSelectRole,
  onOpenReport
}) => {
  return (
    <div className="flex flex-col w-full">
      {/* Hero Section */}
      <section className="relative w-full overflow-hidden bg-surface-container-lowest">
        {/* Subtle ambient backdrop glow */}
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[480px] bg-gradient-to-b from-surface-container/60 via-surface-container-low/20 to-transparent blur-3xl pointer-events-none -z-0"></div>
        <div className="max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop pt-12 md:pt-20 pb-16 relative z-10">
          {/* Top Tag & Calibration Badge */}
          <div className="flex flex-wrap items-center gap-space-sm mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-surface-container text-on-surface-variant shadow-sm">
              <span className="w-2 h-2 rounded-full bg-primary-container animate-ping"></span>
              <span className="font-label-sm text-label-sm tracking-wider uppercase text-on-surface font-semibold">
                Algorithmic Behavioral &amp; Technical Calibration
              </span>
            </div>
            <span className="font-label-sm text-label-sm text-secondary font-mono tracking-tight bg-surface-container-low px-2 py-1 rounded">
              v2.4.8-RELEASE
            </span>
          </div>

          {/* Main Asymmetric Grid Hero */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            {/* Left: Command Typography & CTA */}
            <div className="lg:col-span-7 flex flex-col space-y-6">
              <h1 className="font-display-hero text-display-hero md:text-[54px] md:leading-[60px] tracking-tight text-on-background font-extrabold max-w-2xl">
                Interviews That Adapt to Every Candidate
              </h1>
              <p className="font-body-lg text-body-lg text-secondary leading-relaxed max-w-xl">
                Real-time AI behavioral and technical interviews that dynamically branch questions based on candidate depth, eliminating canned scripts and hiring bias.
              </p>

              {/* Primary Actions */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  onClick={onStartInterview}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary-container text-on-primary font-body-md font-semibold shadow-md hover:bg-primary transition-all duration-150 group"
                >
                  <span>Start Live Interview</span>
                  <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">
                    arrow_forward
                  </span>
                </button>
                <button
                  onClick={onNavigateExplorer}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-primary/10 border border-primary/20 text-primary font-body-md font-semibold shadow-sm hover:bg-primary/20 transition-all duration-150"
                >
                  <span className="material-symbols-outlined text-[18px]">travel_explore</span>
                  <span>Job Explorer &amp; Salaries</span>
                </button>
                <button
                  onClick={onExploreRecruiter}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-surface-container-low text-on-surface font-body-md font-semibold shadow-sm hover:bg-surface-container transition-all duration-150"
                >
                  <span className="material-symbols-outlined text-[18px] text-secondary">analytics</span>
                  <span>Explore Recruiter Portal</span>
                </button>
              </div>

              {/* Micro Spec Proofs */}
              <div className="flex flex-wrap items-center gap-6 pt-4 text-on-surface-variant font-label-md text-label-md">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary-container">verified</span>
                  <span>Zero Hallucination Rubric</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary-container">lock</span>
                  <span>SOC2 &amp; EEOC Compliant</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary-container">speed</span>
                  <span>&lt;180ms Real-Time Gemini Inference</span>
                </div>
              </div>
            </div>

            {/* Right: Real-time Telemetry Visual Artifact */}
            <div className="lg:col-span-5 relative">
              <div className="bg-surface-container-lowest rounded-xl p-5 shadow-xl space-y-4 border border-outline-variant/30">
                {/* Active Session Header */}
                <div className="flex items-center justify-between pb-3 bg-surface-container-low p-3 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-error animate-pulse"></span>
                    <span className="font-label-sm text-label-sm uppercase font-semibold text-on-surface">
                      Active Session: L6 Architecture
                    </span>
                  </div>
                  <span className="font-mono text-label-sm text-secondary">T+11:42 / 20:00</span>
                </div>

                {/* Dynamic Branching Visual Graph */}
                <div className="bg-surface-container-low rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-label-sm text-label-sm uppercase text-secondary font-semibold">
                      Adaptive Tree Probe
                    </span>
                    <span className="font-label-sm text-label-sm bg-primary-container text-on-primary px-2 py-0.5 rounded font-bold">
                      Level 4: High Depth
                    </span>
                  </div>

                  {/* SVG Decision Branch Graph */}
                  <svg className="w-full h-24 text-primary" fill="none" viewBox="0 0 360 90" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="30" cy="45" fill="currentColor" r="7"></circle>
                    <text fill="#565e74" fontFamily="Inter" fontSize="8" textAnchor="middle" x="30" y="70">Resume Base</text>
                    <path d="M37 45 H 100 C 130 45, 140 20, 170 20" stroke="currentColor" strokeDasharray="3 3" strokeWidth="2"></path>
                    <path d="M37 45 H 100 C 130 45, 140 70, 170 70" stroke="#c4c5d7" strokeWidth="1.5"></path>
                    <circle cx="170" cy="20" fill="#1d4ed8" r="6"></circle>
                    <circle cx="170" cy="70" fill="#c4c5d7" r="5"></circle>
                    <text fill="#1d4ed8" fontFamily="Inter" fontSize="8" fontWeight="600" textAnchor="middle" x="170" y="36">Paxos Nuance</text>
                    <text fill="#747686" fontFamily="Inter" fontSize="8" textAnchor="middle" x="170" y="85">Sharding (Skipped)</text>
                    <path d="M176 20 H 240 C 260 20, 270 12, 300 12" stroke="currentColor" strokeWidth="2"></path>
                    <path d="M176 20 H 240 C 260 20, 270 38, 300 38" stroke="currentColor" strokeWidth="2"></path>
                    <circle cx="300" cy="12" fill="#0037b0" r="6"></circle>
                    <circle cx="300" cy="38" fill="#0037b0" r="6"></circle>
                    <text fill="#0037b0" fontFamily="Inter" fontSize="8" fontWeight="bold" textAnchor="middle" x="300" y="26">Raft Split-Brain</text>
                    <text fill="#0037b0" fontFamily="Inter" fontSize="8" fontWeight="bold" textAnchor="middle" x="300" y="52">Quorum Leases</text>
                  </svg>
                </div>

                {/* Real-time dynamic prompt preview */}
                <div className="p-3 bg-surface rounded-lg space-y-1.5 border border-outline-variant/20">
                  <div className="flex items-center gap-1.5 text-primary font-label-sm text-label-sm font-semibold">
                    <span className="material-symbols-outlined text-[15px]">psychology</span>
                    <span>AI Prompt Adjustment Real-Time</span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface italic">
                    &ldquo;Candidate articulated consensus nuances beyond standard Paxos. Auto-advancing to asymmetric partition failure handling...&rdquo;
                  </p>
                </div>

                {/* Live Scoring Bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between items-center text-label-sm font-label-sm">
                    <span className="text-secondary font-semibold">Distributed Systems Rigor</span>
                    <span className="font-mono font-bold text-primary-container">96.4 / 100</span>
                  </div>
                  <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
                    <div className="bg-primary-container h-full rounded-full transition-all duration-500" style={{ width: '96.4%' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Credibility Metrics Bar */}
      <section className="w-full bg-surface-container-low py-8 shadow-inner border-y border-outline-variant/30">
        <div className="max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">Calibration</span>
                <span className="material-symbols-outlined text-primary-container text-[20px]">target</span>
              </div>
              <div className="font-metric-tabular text-metric-tabular font-bold text-on-surface">94%</div>
              <div className="font-body-sm text-body-sm text-secondary mt-1">Interview Accuracy vs Expert Panel</div>
            </div>

            <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">Efficiency</span>
                <span className="material-symbols-outlined text-primary-container text-[20px]">timer</span>
              </div>
              <div className="font-metric-tabular text-metric-tabular font-bold text-on-surface">18.5 min</div>
              <div className="font-body-sm text-body-sm text-secondary mt-1">Avg Assessment Time per Depth Level</div>
            </div>

            <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">Taxonomy</span>
                <span className="material-symbols-outlined text-primary-container text-[20px]">schema</span>
              </div>
              <div className="font-metric-tabular text-metric-tabular font-bold text-on-surface">420+</div>
              <div className="font-body-sm text-body-sm text-secondary mt-1">Competencies Evaluated In-Depth</div>
            </div>

            <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">Objectivity</span>
                <span className="material-symbols-outlined text-primary-container text-[20px]">balance</span>
              </div>
              <div className="font-metric-tabular text-metric-tabular font-bold text-on-surface">Zero Bias</div>
              <div className="font-body-sm text-body-sm text-secondary mt-1">Guarantee via Rubric Normalization</div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Workflow: How Adaptive Intelligence Works */}
      <section className="w-full py-16 md:py-24 bg-surface-container-lowest">
        <div className="max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop space-y-12">
          <div className="max-w-2xl space-y-3">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary font-bold">
              Dynamic Execution Engine
            </span>
            <h2 className="font-headline-lg text-headline-lg font-bold text-on-surface">
              How Adaptive Intelligence Works
            </h2>
            <p className="font-body-md text-body-md text-secondary">
              Rather than relying on static questionnaires, our continuous reinforcement pipeline analyzes answers on the fly to test upper limits and uncover latent mastery.
            </p>
          </div>

          {/* 3-Step Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Step 1 */}
            <div className="bg-surface-container-low rounded-xl p-6 shadow-sm flex flex-col justify-between space-y-6 hover:shadow-md transition-shadow border border-outline-variant/30">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-lg bg-primary-container text-on-primary flex items-center justify-center font-bold font-mono">
                  01
                </div>
                <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                  Ingest Resume &amp; Job Req
                </h3>
                <p className="font-body-sm text-body-sm text-secondary leading-relaxed">
                  AI maps exact career milestone claims against specific enterprise vacancy constraints, isolating critical engineering and behavioral thresholds.
                </p>
              </div>
              <div className="bg-surface-container-lowest p-4 rounded-lg shadow-sm space-y-2">
                <div className="flex items-center justify-between text-label-sm font-label-sm text-secondary">
                  <span>Parsed Artifacts</span>
                  <span className="text-primary font-semibold">12 Core Skills</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="bg-surface-container text-on-surface-variant font-label-sm px-2 py-0.5 rounded">Kubernetes</span>
                  <span className="bg-surface-container text-on-surface-variant font-label-sm px-2 py-0.5 rounded">Golang</span>
                  <span className="bg-surface-container text-on-surface-variant font-label-sm px-2 py-0.5 rounded">CAP Theorem</span>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-surface-container-low rounded-xl p-6 shadow-sm flex flex-col justify-between space-y-6 hover:shadow-md transition-shadow border border-outline-variant/30">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-lg bg-primary-container text-on-primary flex items-center justify-center font-bold font-mono">
                  02
                </div>
                <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                  Dynamic Adaptive Questioning
                </h3>
                <p className="font-body-sm text-body-sm text-secondary leading-relaxed">
                  As the candidate speaks, our semantic engine assesses depth, vagueness, and accuracy, pivoting instantly from superficial trivia to architectural tradeoffs.
                </p>
              </div>
              <div className="bg-surface-container-lowest p-4 rounded-lg shadow-sm space-y-2">
                <div className="flex items-center gap-2 text-label-sm text-primary font-semibold">
                  <span className="material-symbols-outlined text-[16px]">alt_route</span>
                  <span>Autonomous Branch Shift</span>
                </div>
                <div className="text-label-sm font-mono text-on-surface-variant bg-surface-container-low p-2 rounded">
                  &gt; IF clarity &gt; 85% THEN trigger edge_case_escalation()
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-surface-container-low rounded-xl p-6 shadow-sm flex flex-col justify-between space-y-6 hover:shadow-md transition-shadow border border-outline-variant/30">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-lg bg-primary-container text-on-primary flex items-center justify-center font-bold font-mono">
                  03
                </div>
                <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                  Multidimensional Rubric Matrix
                </h3>
                <p className="font-body-sm text-body-sm text-secondary leading-relaxed">
                  Generates an exhaustive institutional scorecard rating reasoning veracity, ambiguity tolerance, execution rigor, and communication velocity.
                </p>
              </div>
              <div className="bg-surface-container-lowest p-4 rounded-lg shadow-sm space-y-2">
                <div className="flex justify-between items-center text-label-sm font-label-sm">
                  <span className="text-secondary font-semibold">Veracity Index</span>
                  <span className="text-primary font-bold">98.2%</span>
                </div>
                <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                  <div className="bg-primary-container h-full rounded-full" style={{ width: '98.2%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Side-by-Side Comparison */}
      <section className="w-full py-16 bg-surface-container">
        <div className="max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary font-bold">
              Methodological Shift
            </span>
            <h2 className="font-headline-lg text-headline-lg font-bold text-on-surface">
              The Adaptive Difference
            </h2>
            <p className="font-body-md text-body-md text-secondary">
              Contrast legacy scripted interviews with continuous algorithmic calibration.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
            {/* Standard Scripted Interview (Legacy) */}
            <div className="bg-surface-container-lowest rounded-xl p-8 shadow-sm flex flex-col justify-between space-y-6 border border-outline-variant/30">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-4 border-b border-outline-variant/20">
                  <span className="font-headline-sm text-headline-sm font-bold text-secondary">
                    Standard Scripted Interview
                  </span>
                  <span className="px-2.5 py-1 rounded font-label-sm text-label-sm bg-surface-container text-secondary font-semibold">
                    Legacy Status Quo
                  </span>
                </div>
                <ul className="space-y-4 text-on-surface-variant font-body-sm text-body-sm">
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-error text-[20px] shrink-0">close</span>
                    <span><strong>Rigid linear sequences:</strong> Every candidate receives the identical 5 questions regardless of seniority or depth.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-error text-[20px] shrink-0">close</span>
                    <span><strong>Vulnerable to memorization:</strong> Pre-rehearsed generic answers pass surface-level screening without detection.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-error text-[20px] shrink-0">close</span>
                    <span><strong>Subconscious bias:</strong> Panellists favor conversational chemistry over quantifiable problem-solving rigor.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-error text-[20px] shrink-0">close</span>
                    <span><strong>Zero real-time probing:</strong> Weak responses are not dynamically pressure-tested; high potential is overlooked.</span>
                  </li>
                </ul>
              </div>
              <div className="p-4 bg-surface-container-low rounded-lg text-secondary font-label-md">
                Outcome: High false positive rate and up to 45 hours wasted per executive hire.
              </div>
            </div>

            {/* Adaptive Interview Intel (Modern) */}
            <div className="bg-surface-container-lowest rounded-xl p-8 shadow-md flex flex-col justify-between space-y-6 relative overflow-hidden border border-primary/20">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary-container/10 rounded-full blur-2xl pointer-events-none"></div>
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-4 border-b border-outline-variant/20">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary-container text-[24px]">verified_user</span>
                    <span className="font-headline-sm text-headline-sm font-bold text-on-surface">Adaptive Interview Intel</span>
                  </div>
                  <span className="px-2.5 py-1 rounded font-label-sm text-label-sm bg-primary-container text-on-primary font-semibold">
                    Autonomous AI
                  </span>
                </div>
                <ul className="space-y-4 text-on-surface font-body-sm text-body-sm">
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-primary-container text-[20px] shrink-0">check_circle</span>
                    <span><strong>Dynamic recursive branching:</strong> Probes deep into specifics when a claim sounds abstract or boilerplate.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-primary-container text-[20px] shrink-0">check_circle</span>
                    <span><strong>Tailored technical calibration:</strong> Real-time difficulty adjusts upward to evaluate true upper ceiling competencies.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-primary-container text-[20px] shrink-0">check_circle</span>
                    <span><strong>Absolute rubric consistency:</strong> Evaluates every candidate against an unvarying, objective mathematical baseline.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-primary-container text-[20px] shrink-0">check_circle</span>
                    <span><strong>Instant candidate feedback loop:</strong> Produces granular gap analyses and telemetry instantly post-interview.</span>
                  </li>
                </ul>
              </div>
              <div className="p-4 bg-surface-container rounded-lg text-primary font-label-md font-semibold flex items-center justify-between">
                <span>Outcome: 3.8x higher hire accuracy with 62% shorter screening cycles.</span>
                <span className="material-symbols-outlined text-[18px]">trending_up</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Production Deployments (Evaluation Templates) */}
      <section className="w-full py-16 md:py-20 bg-surface-container-lowest">
        <div className="max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-2">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary font-bold">
                Production Deployments
              </span>
              <h2 className="font-headline-lg text-headline-lg font-bold text-on-surface">
                Active Evaluation Tracks
              </h2>
              <p className="font-body-md text-body-md text-secondary">
                Select a benchmark track to test the adaptive engine&apos;s live reasoning tree right now.
              </p>
            </div>
            <button
              onClick={onCandidateSetup}
              className="inline-flex items-center gap-1 text-primary-container font-label-md hover:underline font-semibold"
            >
              <span>Browse All Positions</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Role 1 */}
            <div className="bg-surface-container-low rounded-xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-5 border border-outline-variant/30">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded font-label-sm text-label-sm bg-surface-container text-secondary font-mono">STAFF-ENG-09</span>
                  <span className="text-primary font-label-sm font-semibold">8 Active Branches</span>
                </div>
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Staff Backend Engineer</h3>
                <p className="font-body-sm text-body-sm text-secondary">
                  Focuses on Byzantine fault tolerance, multi-region database consistency, low-latency RPC optimization, and failure telemetry.
                </p>
              </div>
              <div className="space-y-4 pt-2">
                <div className="flex flex-wrap gap-1.5">
                  <span className="bg-surface-container-lowest text-on-surface-variant font-label-sm px-2 py-1 rounded shadow-sm">Consensus Protocols</span>
                  <span className="bg-surface-container-lowest text-on-surface-variant font-label-sm px-2 py-1 rounded shadow-sm">Kafka Ingestion</span>
                  <span className="bg-surface-container-lowest text-on-surface-variant font-label-sm px-2 py-1 rounded shadow-sm">Backpressure</span>
                </div>
                <button
                  onClick={() => onSelectRole('Staff Backend Engineer')}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded bg-surface-container-lowest text-primary font-label-md font-semibold shadow-sm hover:bg-primary-container hover:text-on-primary transition-colors"
                >
                  <span>Launch Interview Session</span>
                  <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                </button>
              </div>
            </div>

            {/* Role 2 */}
            <div className="bg-surface-container-low rounded-xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-5 border border-outline-variant/30">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded font-label-sm text-label-sm bg-surface-container text-secondary font-mono">DESIGN-PR-04</span>
                  <span className="text-primary font-label-sm font-semibold">6 Active Branches</span>
                </div>
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Lead Product Designer</h3>
                <p className="font-body-sm text-body-sm text-secondary">
                  Assesses systems architecture, information hierarchy under cognitive load, design token scalability, and user empathy metrics.
                </p>
              </div>
              <div className="space-y-4 pt-2">
                <div className="flex flex-wrap gap-1.5">
                  <span className="bg-surface-container-lowest text-on-surface-variant font-label-sm px-2 py-1 rounded shadow-sm">Design Systems</span>
                  <span className="bg-surface-container-lowest text-on-surface-variant font-label-sm px-2 py-1 rounded shadow-sm">WCAG AAA</span>
                  <span className="bg-surface-container-lowest text-on-surface-variant font-label-sm px-2 py-1 rounded shadow-sm">Micro-copy</span>
                </div>
                <button
                  onClick={() => onSelectRole('Lead Product Designer')}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded bg-surface-container-lowest text-primary font-label-md font-semibold shadow-sm hover:bg-primary-container hover:text-on-primary transition-colors"
                >
                  <span>Launch Interview Session</span>
                  <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                </button>
              </div>
            </div>

            {/* Role 3 */}
            <div className="bg-surface-container-low rounded-xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-5 border border-outline-variant/30">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded font-label-sm text-label-sm bg-surface-container text-secondary font-mono">QUANT-RES-12</span>
                  <span className="text-primary font-label-sm font-semibold">10 Active Branches</span>
                </div>
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Machine Learning Specialist</h3>
                <p className="font-body-sm text-body-sm text-secondary">
                  Probes neural architecture design, statistical validation, slippage mitigation, and low-latency inference bottlenecks.
                </p>
              </div>
              <div className="space-y-4 pt-2">
                <div className="flex flex-wrap gap-1.5">
                  <span className="bg-surface-container-lowest text-on-surface-variant font-label-sm px-2 py-1 rounded shadow-sm">Transformer Tuning</span>
                  <span className="bg-surface-container-lowest text-on-surface-variant font-label-sm px-2 py-1 rounded shadow-sm">Inference SLAs</span>
                  <span className="bg-surface-container-lowest text-on-surface-variant font-label-sm px-2 py-1 rounded shadow-sm">MLOps Pipeline</span>
                </div>
                <button
                  onClick={() => onSelectRole('Machine Learning Specialist')}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded bg-surface-container-lowest text-primary font-label-md font-semibold shadow-sm hover:bg-primary-container hover:text-on-primary transition-colors"
                >
                  <span>Launch Interview Session</span>
                  <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quickstart Callout */}
      <section className="w-full py-16 bg-gradient-to-b from-surface-container to-surface-container-low border-t border-outline-variant/30">
        <div className="max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop">
          <div className="bg-surface-container-lowest rounded-xl p-8 md:p-12 shadow-xl flex flex-col lg:flex-row items-center justify-between gap-8 border border-outline-variant/30">
            <div className="space-y-4 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-secondary-container text-on-surface">
                <span className="material-symbols-outlined text-[18px] text-primary">terminal</span>
                <span className="font-label-sm text-label-sm font-semibold uppercase">Candidate Assessment Quickstart</span>
              </div>
              <h2 className="font-headline-lg text-headline-lg font-bold text-on-surface">
                Ready to Experience Zero-Bias Intelligence?
              </h2>
              <p className="font-body-md text-body-md text-secondary">
                Select your track and launch an interview that continuously adapts its difficulty to your real-time responses.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
              <button
                onClick={onCandidateSetup}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg bg-surface-container text-on-surface font-body-md font-semibold hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">work</span>
                <span>Select Job Requisition</span>
              </button>
              <button
                onClick={onStartInterview}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-lg bg-primary-container text-on-primary font-body-md font-bold shadow-md hover:bg-primary transition-colors group"
              >
                <span>Start Live Evaluation</span>
                <span className="material-symbols-outlined text-[20px] group-hover:translate-x-1 transition-transform">
                  arrow_forward
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomeScreen;
