import React, { useState, useEffect } from 'react';
import interviewApi from '../services/interviewApi';
import { useAuth } from '../context/AuthContext';

export const RecruiterDashboard = ({ onViewReport, onBrowseJobs, onPostJob, onOpenAuthModal }) => {
  const { user } = useAuth();
  const [interviews, setInterviews] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Tab: 'evaluations' | 'applications'
  const [activeTab, setActiveTab] = useState('evaluations');

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [appStatusFilter, setAppStatusFilter] = useState('ALL');

  // Review Application Modal
  const [selectedApp, setSelectedApp] = useState(null);
  const [reviewStatus, setReviewStatus] = useState('pending');
  const [reviewNotes, setReviewNotes] = useState('');
  const [isUpdatingApp, setIsUpdatingApp] = useState(false);
  const [reviewError, setReviewError] = useState(null);
  const [reviewSuccess, setReviewSuccess] = useState(null);

  // Integrity Inspection Modal
  const [integrityModalInterview, setIntegrityModalInterview] = useState(null);
  const [integrityTimeline, setIntegrityTimeline] = useState(null);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [integrityActionNotes, setIntegrityActionNotes] = useState('');
  const [integrityMsg, setIntegrityMsg] = useState(null);

  const fetchPipelineData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [interviewsData, jobsData] = await Promise.all([
        interviewApi.listInterviews(),
        interviewApi.listJobs()
      ]);
      setInterviews(Array.isArray(interviewsData) ? interviewsData : []);
      const recruiterJobs = Array.isArray(jobsData) ? jobsData : [];
      setJobs(recruiterJobs);

      // Fetch applications across all recruiter jobs
      if (recruiterJobs.length > 0) {
        const appsPromises = recruiterJobs.map((j) =>
          interviewApi.getApplicationsByJob(j.id).catch(() => [])
        );
        const allAppsNested = await Promise.all(appsPromises);
        const flatApps = allAppsNested.flat();
        setApplications(flatApps);
      } else {
        setApplications([]);
      }
    } catch (err) {
      console.warn('Failed to load candidate pipeline:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchPipelineData();
    } else {
      setInterviews([]);
      setJobs([]);
      setApplications([]);
      setLoading(false);
    }
  }, [user]);

  // Calculations for KPIs
  const completedCount = interviews.filter((i) => i.status === 'completed').length;
  const inProgressCount = interviews.filter((i) => i.status === 'in_progress' || i.status === 'scheduled').length;
  const completionRate = interviews.length > 0 ? Math.round((completedCount / interviews.length) * 100) : 0;
  const hoursSaved = (interviews.length * 3.8).toFixed(1);

  // Filtered Interviews
  const filteredInterviews = interviews.filter((interview) => {
    const matchesSearch =
      !searchQuery.trim() ||
      (interview.jobTitle && interview.jobTitle.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (interview.candidateId && interview.candidateId.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'COMPLETED' && interview.status === 'completed') ||
      (statusFilter === 'IN_PROGRESS' && (interview.status === 'in_progress' || interview.status === 'scheduled'));

    return matchesSearch && matchesStatus;
  });

  // Filtered Applications
  const filteredApplications = applications.filter((app) => {
    const matchesSearch =
      !searchQuery.trim() ||
      (app.jobTitle && app.jobTitle.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (app.candidateId && app.candidateId.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (app.coverNote && app.coverNote.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      appStatusFilter === 'ALL' ||
      app.status === appStatusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  const getInitials = (idOrName) => {
    if (!idOrName) return 'CD';
    return idOrName.substring(0, 2).toUpperCase();
  };

  const handleOpenAppReview = (app) => {
    setSelectedApp(app);
    setReviewStatus(app.status || 'pending');
    setReviewNotes(app.reviewNotes || '');
    setReviewError(null);
    setReviewSuccess(null);
  };

  const handleSaveAppStatus = async (e) => {
    e.preventDefault();
    if (!selectedApp) return;

    setIsUpdatingApp(true);
    setReviewError(null);
    try {
      const updated = await interviewApi.updateApplicationStatus(selectedApp.id, {
        status: reviewStatus,
        reviewNotes: reviewNotes.trim()
      });

      setReviewSuccess('Application status updated successfully!');
      setApplications((prev) =>
        prev.map((a) => (a.id === selectedApp.id ? { ...a, ...updated } : a))
      );

      setTimeout(() => {
        setSelectedApp(null);
        setReviewSuccess(null);
      }, 1200);
    } catch (err) {
      setReviewError(err.message || 'Failed to update application status');
    } finally {
      setIsUpdatingApp(false);
    }
  };

  const handleOpenIntegrityInspection = async (interview) => {
    setIntegrityModalInterview(interview);
    setIntegrityTimeline(null);
    setIntegrityLoading(true);
    setIntegrityMsg(null);
    try {
      const data = await interviewApi.getIntegrityTimeline(interview.id);
      setIntegrityTimeline(data);
    } catch (err) {
      console.warn('Could not load integrity timeline:', err.message);
    } finally {
      setIntegrityLoading(false);
    }
  };

  const handleReviewIntegrityEvent = async (eventId, newStatus, falsePositive) => {
    if (!integrityModalInterview) return;
    try {
      await interviewApi.reviewIntegrityEvent(integrityModalInterview.id, eventId, {
        reviewStatus: newStatus,
        reviewNotes: integrityActionNotes || 'Recruiter verified telemetry in command center',
        falsePositive
      });
      setIntegrityMsg('Integrity event updated!');
      // Re-fetch timeline
      const data = await interviewApi.getIntegrityTimeline(integrityModalInterview.id);
      setIntegrityTimeline(data);
      setTimeout(() => setIntegrityMsg(null), 2000);
    } catch (err) {
      alert(`Failed to update integrity event: ${err.message}`);
    }
  };

  return (
    <div className="w-full min-h-screen bg-surface-container-lowest">
      <div className="w-full max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop py-space-xl">
        {/* Header Section with Telemetry Overview */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md mb-space-xl">
          <div className="space-y-space-xs">
            <div className="flex items-center gap-space-sm text-secondary">
              <span className="material-symbols-outlined text-primary text-[20px]">analytics</span>
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">
                Talent Intelligence Telemetry
              </span>
              <span className="text-secondary/40 font-body-sm">/</span>
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary font-semibold">
                Recruiter Command Center
              </span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
              Talent Acquisition Command Center
            </h1>
            <p className="font-body-md text-body-md text-secondary max-w-2xl">
              Live candidate evaluation queue, application screening pipeline, and adaptive telemetry intelligence.
            </p>
          </div>
          <div className="flex items-center gap-space-sm self-start md:self-auto">
            <button
              onClick={fetchPipelineData}
              className="flex items-center gap-2 px-3 py-2 bg-surface-container rounded-lg text-secondary font-label-md text-label-md hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-[16px] text-primary">sync</span>
              <span>Sync Pipeline</span>
            </button>
            <button
              onClick={onBrowseJobs}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-container text-on-primary rounded-lg font-body-sm text-body-sm font-semibold transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              <span>Manage Requisitions</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-error-container/40 border border-error/30 text-error flex items-start gap-2">
            <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5">error</span>
            <span className="text-body-sm font-medium">{error}</span>
          </div>
        )}

        {/* KPI Metric Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md mb-space-xl">
          {/* KPI 1 */}
          <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden border border-outline-variant/30">
            <div>
              <div className="flex items-center justify-between mb-space-sm">
                <span className="font-label-sm text-label-sm text-secondary uppercase tracking-wider font-semibold">
                  Evaluated Sessions
                </span>
                <span className="material-symbols-outlined text-primary text-[20px]">psychology</span>
              </div>
              <div className="flex items-baseline gap-space-xs mb-space-xs">
                <span className="font-display-hero text-display-hero text-on-surface tracking-tight font-bold">
                  {interviews.length}
                </span>
                <span className="font-body-sm text-body-sm text-secondary">sessions</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-on-surface-variant font-label-md text-label-md mt-space-md">
              <span className="flex items-center font-semibold text-primary">
                <span className="material-symbols-outlined text-[16px]">trending_up</span>
                Live
              </span>
              <span className="text-secondary font-body-sm text-body-sm">in persistent database</span>
            </div>
          </div>

          {/* KPI 2 */}
          <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden border border-outline-variant/30">
            <div>
              <div className="flex items-center justify-between mb-space-sm">
                <span className="font-label-sm text-label-sm text-secondary uppercase tracking-wider font-semibold">
                  Total Applications
                </span>
                <span className="material-symbols-outlined text-primary text-[20px]">inbox</span>
              </div>
              <div className="flex items-baseline gap-space-xs mb-space-xs">
                <span className="font-display-hero text-display-hero text-on-surface tracking-tight font-bold">
                  {applications.length}
                </span>
                <span className="font-body-sm text-body-sm text-secondary">candidates</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 font-label-md text-label-md mt-space-md text-secondary">
              <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>
              <span>Across {jobs.length} requisitions</span>
            </div>
          </div>

          {/* KPI 3 */}
          <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden border border-outline-variant/30">
            <div>
              <div className="flex items-center justify-between mb-space-sm">
                <span className="font-label-sm text-label-sm text-secondary uppercase tracking-wider font-semibold">
                  Active in Progress
                </span>
                <span className="material-symbols-outlined text-primary text-[20px]">tune</span>
              </div>
              <div className="flex items-baseline gap-space-xs mb-space-xs">
                <span className="font-display-hero text-display-hero text-on-surface tracking-tight font-bold">
                  {inProgressCount}
                </span>
                <span className="font-body-sm text-body-sm text-secondary">sessions</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 font-label-md text-label-md mt-space-md text-secondary">
              <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>
              <span>Gemini AI Adaptive</span>
            </div>
          </div>

          {/* KPI 4 */}
          <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden border border-outline-variant/30">
            <div>
              <div className="flex items-center justify-between mb-space-sm">
                <span className="font-label-sm text-label-sm text-secondary uppercase tracking-wider font-semibold">
                  Hours Saved
                </span>
                <span className="material-symbols-outlined text-primary text-[20px]">timer</span>
              </div>
              <div className="flex items-baseline gap-space-xs mb-space-xs">
                <span className="font-display-hero text-display-hero text-on-surface tracking-tight font-bold">
                  {hoursSaved}
                </span>
                <span className="font-body-sm text-body-sm text-secondary">hrs</span>
              </div>
            </div>
            <div className="flex items-center justify-between font-label-md text-label-md mt-space-md text-secondary">
              <span className="text-primary font-semibold">Saved screening time</span>
              <span>~3.8 hrs / candidate</span>
            </div>
          </div>
        </div>

        {/* Tab Controls Bar */}
        <div className="flex items-center gap-2 mb-6 border-b border-outline-variant/30 pb-2">
          <button
            onClick={() => setActiveTab('evaluations')}
            className={`px-4 py-2 rounded-lg font-body-sm font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'evaluations'
                ? 'bg-primary-container text-on-primary shadow-sm'
                : 'text-secondary hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">psychology</span>
            <span>Candidate Evaluations &amp; Dossiers</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-surface-container-lowest text-on-surface">
              {interviews.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('applications')}
            className={`px-4 py-2 rounded-lg font-body-sm font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'applications'
                ? 'bg-primary-container text-on-primary shadow-sm'
                : 'text-secondary hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">inbox</span>
            <span>Job Applications Pipeline</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-surface-container-lowest text-on-surface">
              {applications.length}
            </span>
          </button>
        </div>

        {/* Candidate Pipeline & Telemetry Hub */}
        <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden border border-outline-variant/30">
          {/* Table Controls Bar */}
          <div className="p-space-lg bg-surface-container-low flex flex-col lg:flex-row lg:items-center justify-between gap-space-md border-b border-outline-variant/30">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-[20px]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={activeTab === 'evaluations' ? "Search candidate by position or ID..." : "Search applications by skill, note, or ID..."}
                className="w-full pl-10 pr-4 py-2 bg-surface-container-lowest rounded-lg text-on-surface placeholder:text-secondary font-body-sm text-body-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 border border-outline-variant/30"
              />
            </div>

            {/* Filter Controls */}
            <div className="flex flex-wrap items-center gap-space-sm">
              {activeTab === 'evaluations' ? (
                <div className="flex items-center gap-1.5 bg-surface-container-lowest px-3 py-2 rounded-lg shadow-sm text-on-surface font-body-sm text-body-sm border border-outline-variant/30">
                  <span className="material-symbols-outlined text-secondary text-[18px]">filter_list</span>
                  <span className="text-secondary font-label-sm text-label-sm uppercase font-semibold">Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-transparent font-semibold text-on-surface cursor-pointer focus:outline-none"
                  >
                    <option value="ALL">All Evaluations</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="IN_PROGRESS">In Progress</option>
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-surface-container-lowest px-3 py-2 rounded-lg shadow-sm text-on-surface font-body-sm text-body-sm border border-outline-variant/30">
                  <span className="material-symbols-outlined text-secondary text-[18px]">filter_list</span>
                  <span className="text-secondary font-label-sm text-label-sm uppercase font-semibold">Stage:</span>
                  <select
                    value={appStatusFilter}
                    onChange={(e) => setAppStatusFilter(e.target.value)}
                    className="bg-transparent font-semibold text-on-surface cursor-pointer focus:outline-none"
                  >
                    <option value="ALL">All Stages</option>
                    <option value="PENDING">Pending</option>
                    <option value="REVIEWING">Reviewing</option>
                    <option value="INTERVIEW_INVITED">Interview Invited</option>
                    <option value="ACCEPTED">Accepted</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>
              )}

              <button
                onClick={fetchPipelineData}
                className="p-2 bg-surface-container-lowest rounded-lg shadow-sm text-secondary hover:text-on-surface hover:bg-surface-container transition-colors border border-outline-variant/30"
                title="Refresh Pipeline"
              >
                <span className="material-symbols-outlined text-[20px]">refresh</span>
              </button>
            </div>
          </div>

          {/* Content Area Based on Active Tab */}
          {activeTab === 'evaluations' ? (
            /* Evaluations Tab Content */
            loading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3">
                <span className="material-symbols-outlined text-[32px] text-primary animate-spin">refresh</span>
                <span className="text-body-sm text-secondary">Loading pipeline records...</span>
              </div>
            ) : filteredInterviews.length === 0 ? (
              /* Authentic Empty State */
              <div className="py-16 px-6 flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-4">
                <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-[28px]">group_off</span>
                </div>
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                  No Candidate Interviews in Pipeline
                </h3>
                <p className="font-body-sm text-body-sm text-secondary leading-relaxed">
                  When candidates complete their adaptive voice assessments, their dossiers, overall fit scores, and rubrics will appear here.
                </p>
                <button
                  onClick={onBrowseJobs}
                  className="px-6 py-2.5 rounded-lg bg-primary-container text-on-primary font-body-sm font-semibold hover:bg-primary transition-all flex items-center gap-2 shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">work</span>
                  <span>View Job Requisitions</span>
                </button>
              </div>
            ) : (
              <div className="divide-y divide-surface-container/60">
                {filteredInterviews.map((interview) => {
                  const score = interview.overallScore != null ? Math.round(Number(interview.overallScore)) : null;
                  const formattedDate = interview.createdAt
                    ? new Date(
                        interview.createdAt._seconds ? interview.createdAt._seconds * 1000 : interview.createdAt
                      ).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })
                    : 'Recent';

                  return (
                    <div
                      key={interview.id}
                      className="p-space-lg hover:bg-surface-container-low/50 transition-colors flex flex-col xl:flex-row xl:items-center justify-between gap-space-lg"
                    >
                      <div className="flex items-start gap-space-md min-w-0">
                        <div className="w-12 h-12 rounded-lg bg-surface-container-high flex-shrink-0 flex items-center justify-center font-headline-sm text-headline-sm font-bold text-primary">
                          {getInitials(interview.candidateId)}
                        </div>
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-space-xs">
                            <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
                              Candidate #{interview.candidateId ? interview.candidateId.substring(0, 8) : 'USER'}
                            </span>
                            <span className="px-2.5 py-0.5 rounded bg-surface-container-low text-primary font-label-sm text-label-sm uppercase font-semibold">
                              {interview.jobTitle || 'Staff Engineer'}
                            </span>
                            <span className="font-label-md text-label-md text-secondary ml-1">
                              Evaluated {formattedDate}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-label-sm text-label-sm font-semibold ${
                                interview.status === 'completed'
                                  ? 'bg-surface-container text-primary'
                                  : 'bg-secondary-container text-on-secondary-container'
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                              {interview.status === 'completed' ? 'Completed — Evaluated' : 'In Progress'}
                            </span>
                            <span className="text-secondary text-body-sm">·</span>
                            <span className="font-body-sm text-body-sm text-secondary truncate">
                              {interview.currentQuestionIndex || 0} / {interview.totalQuestions || 5} Questions Answered
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap sm:flex-nowrap items-center gap-space-lg justify-between xl:justify-end flex-shrink-0">
                        <div className="flex flex-col items-start sm:items-end">
                          <div className="flex items-baseline gap-1">
                            <span className="font-display-hero-mobile text-display-hero-mobile font-bold text-on-surface">
                              {score != null ? score : '—'}
                            </span>
                            <span className="font-label-sm text-label-sm text-secondary uppercase font-bold">/ 100</span>
                          </div>
                          <span className="font-label-sm text-label-sm text-secondary uppercase tracking-wider">
                            Overall AI Fit Score
                          </span>
                        </div>

                        {score != null && (
                          <div className="w-24 hidden sm:block">
                            <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
                              <div className="bg-primary h-full rounded-full" style={{ width: `${score}%` }}></div>
                            </div>
                            <span className="font-label-sm text-label-sm text-secondary text-right block mt-1">
                              Verified Tier
                            </span>
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenIntegrityInspection(interview)}
                            title="Inspect Integrity Telemetry"
                            className="p-2 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-lg transition-colors"
                          >
                            <span className="material-symbols-outlined text-[18px] text-primary">shield</span>
                          </button>
                          <button
                            onClick={() => onViewReport(interview.id)}
                            className="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary-container text-on-primary rounded-lg font-body-sm text-body-sm font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                          >
                            <span>View Dossier</span>
                            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* Applications Pipeline Tab Content */
            loading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3">
                <span className="material-symbols-outlined text-[32px] text-primary animate-spin">refresh</span>
                <span className="text-body-sm text-secondary">Loading candidate applications...</span>
              </div>
            ) : filteredApplications.length === 0 ? (
              /* Authentic Empty State for Applications */
              <div className="py-16 px-6 flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-4">
                <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-[28px]">inbox_customize</span>
                </div>
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                  No Candidate Applications Received
                </h3>
                <p className="font-body-sm text-body-sm text-secondary leading-relaxed">
                  When candidates apply to your published requisitions, their profiles, cover notes, and screening status will populate here.
                </p>
                <button
                  onClick={onBrowseJobs}
                  className="px-6 py-2.5 rounded-lg bg-primary-container text-on-primary font-body-sm font-semibold hover:bg-primary transition-all flex items-center gap-2 shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">add_circle</span>
                  <span>Manage Job Requisitions</span>
                </button>
              </div>
            ) : (
              <div className="divide-y divide-surface-container/60">
                {filteredApplications.map((app) => {
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
                    <div
                      key={app.id}
                      className="p-space-lg hover:bg-surface-container-low/50 transition-colors flex flex-col xl:flex-row xl:items-center justify-between gap-space-lg"
                    >
                      <div className="space-y-2 max-w-2xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
                            Candidate #{app.candidateId ? app.candidateId.substring(0, 8) : 'APPLICANT'}
                          </span>
                          <span className="px-2.5 py-0.5 rounded bg-surface-container-low text-primary font-label-sm text-label-sm uppercase font-semibold">
                            {app.jobTitle || 'Requisition'}
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

                        {app.resumeUrl && (
                          <div className="pt-1">
                            <a
                              href={app.resumeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-body-sm text-primary hover:underline font-semibold flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-[16px]">link</span>
                              <span>View Candidate Resume / Portfolio</span>
                            </a>
                          </div>
                        )}

                        {app.reviewNotes && (
                          <div className="text-body-sm text-primary font-medium bg-primary/5 p-2 rounded border border-primary/20">
                            <span className="font-bold">Review Note:</span> {app.reviewNotes}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-start xl:self-center shrink-0">
                        <button
                          onClick={() => handleOpenAppReview(app)}
                          className="px-4 py-2 bg-primary hover:bg-primary-container text-on-primary rounded-lg font-body-sm text-body-sm font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                          <span className="material-symbols-outlined text-[16px]">edit_note</span>
                          <span>Update Stage &amp; Review</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* Footer bar */}
          <div className="p-space-lg bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-md border-t border-outline-variant/30">
            <div className="font-body-sm text-body-sm text-secondary">
              Showing <span className="font-semibold text-on-surface">
                {activeTab === 'evaluations' ? filteredInterviews.length : filteredApplications.length}
              </span> records in active view
            </div>
            <div className="flex items-center gap-2 text-label-sm text-secondary">
              <span className="material-symbols-outlined text-[16px] text-primary">verified_user</span>
              <span>Multi-tenant strict isolation active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Update Application Stage Modal */}
      {selectedApp && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-surface/60 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-lg bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/40 p-6 space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/30">
              <div>
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                  Update Candidate Application Stage
                </h3>
                <p className="font-body-sm text-secondary text-xs">
                  {selectedApp.jobTitle} • Candidate #{selectedApp.candidateId?.substring(0, 8)}
                </p>
              </div>
              <button
                onClick={() => setSelectedApp(null)}
                className="p-1 rounded text-secondary hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {reviewError && (
              <div className="p-3 rounded-lg bg-error-container/40 border border-error/30 text-error flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
                <span className="text-body-sm font-medium">{reviewError}</span>
              </div>
            )}

            {reviewSuccess && (
              <div className="p-3 rounded-lg bg-primary-fixed/30 border border-primary text-primary font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                <span className="text-body-sm">{reviewSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveAppStatus} className="space-y-4">
              <div className="space-y-1">
                <label className="font-label-md text-label-md font-semibold text-on-surface" htmlFor="stage-select">
                  Hiring Stage
                </label>
                <select
                  id="stage-select"
                  value={reviewStatus}
                  onChange={(e) => setReviewStatus(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="pending">Pending Screening</option>
                  <option value="reviewing">Under Recruiter Review</option>
                  <option value="interview_invited">Interview Invited (Authorized for Assessment)</option>
                  <option value="interview_completed">Interview Completed</option>
                  <option value="accepted">Accepted / Offer Extended</option>
                  <option value="rejected">Not Selected</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-label-md text-label-md font-semibold text-on-surface" htmlFor="rec-notes">
                  Recruiter Feedback / Notes
                </label>
                <textarea
                  id="rec-notes"
                  rows={4}
                  maxLength={1000}
                  placeholder="Add evaluation rationale, committee notes, or candidate follow-up..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="w-full p-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setSelectedApp(null)}
                  disabled={isUpdatingApp}
                  className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-body-sm font-semibold hover:bg-surface-container-high"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingApp}
                  className="px-5 py-2 rounded-lg bg-primary-container text-on-primary font-body-sm font-semibold hover:bg-primary shadow-sm flex items-center gap-1.5"
                >
                  {isUpdatingApp ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">save</span>
                      <span>Save Status &amp; Notes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Integrity Timeline Inspection Modal */}
      {integrityModalInterview && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-surface/60 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-2xl bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/40 p-6 space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/30">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[24px]">shield</span>
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                  Integrity &amp; Proctoring Timeline
                </h3>
              </div>
              <button
                onClick={() => setIntegrityModalInterview(null)}
                className="p-1 rounded text-secondary hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {integrityMsg && (
              <div className="p-3 rounded-lg bg-primary-fixed/30 border border-primary text-primary font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                <span className="text-body-sm">{integrityMsg}</span>
              </div>
            )}

            {integrityLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[28px] text-primary animate-spin">refresh</span>
                <span className="text-body-sm text-secondary">Loading telemetry timeline...</span>
              </div>
            ) : !integrityTimeline || !integrityTimeline.events || integrityTimeline.events.length === 0 ? (
              <div className="py-10 text-center text-secondary space-y-2">
                <span className="material-symbols-outlined text-[36px] text-primary">verified_user</span>
                <p className="font-semibold text-on-surface">Clean Telemetry Session</p>
                <p className="text-body-sm">
                  No anomalous tab switches, audio disconnects, or integrity warnings were recorded.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-surface-container-low p-3 rounded-lg border border-outline-variant/20">
                  <div>
                    <span className="font-label-sm uppercase font-semibold text-secondary">Integrity Score</span>
                    <div className="font-bold text-headline-sm text-on-surface">
                      {integrityTimeline.integrityScore ?? 100}%
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded bg-surface-container text-primary font-bold text-label-sm uppercase">
                    Risk: {integrityTimeline.riskLevel || 'low'}
                  </span>
                </div>

                <div className="space-y-2">
                  <span className="font-label-sm uppercase font-semibold text-secondary block">
                    Telemetry Event Chronology
                  </span>
                  <div className="divide-y divide-outline-variant/20 max-h-60 overflow-y-auto">
                    {integrityTimeline.events.map((evt, idx) => (
                      <div key={idx} className="py-2.5 flex items-start justify-between gap-3 text-body-sm">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-on-surface capitalize">
                              {(evt.eventType || 'event').replace(/_/g, ' ')}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] uppercase font-bold bg-surface-container text-secondary">
                              {evt.reviewStatus || 'unreviewed'}
                            </span>
                          </div>
                          <p className="text-secondary text-xs">
                            {new Date(evt.timestamp?._seconds ? evt.timestamp._seconds * 1000 : evt.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleReviewIntegrityEvent(evt.id, 'resolved', false)}
                            className="px-2 py-1 text-xs bg-surface-container hover:bg-surface-container-high rounded text-on-surface font-semibold"
                          >
                            Mark Verified
                          </button>
                          <button
                            onClick={() => handleReviewIntegrityEvent(evt.id, 'dismissed', true)}
                            className="px-2 py-1 text-xs bg-surface-container hover:bg-surface-container-high rounded text-secondary hover:text-on-surface"
                          >
                            False Positive
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-outline-variant/20">
              <button
                onClick={() => setIntegrityModalInterview(null)}
                className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-body-sm font-semibold hover:bg-surface-container-high"
              >
                Close Telemetry Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecruiterDashboard;
