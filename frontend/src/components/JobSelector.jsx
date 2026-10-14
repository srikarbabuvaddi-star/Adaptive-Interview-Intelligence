import React, { useState, useEffect } from 'react';
import interviewApi from '../services/interviewApi';
import { useAuth } from '../context/AuthContext';

export const JobSelector = ({ onSelectJob, onSelectInterview, onOpenAuthModal, onNavigateProfile }) => {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [existingInterviews, setExistingInterviews] = useState([]);
  const [applications, setApplications] = useState([]);
  const [activeResume, setActiveResume] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Selected job for deep requisition view
  const [inspectedJob, setInspectedJob] = useState(null);

  // Candidate Apply Modal
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applyCoverNote, setApplyCoverNote] = useState('');
  const [applySkills, setApplySkills] = useState('');
  const [applyResumeUrl, setApplyResumeUrl] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [applySuccess, setApplySuccess] = useState(null);

  // Recruiter job creation modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [jobTitle, setJobTitle] = useState('');
  const [jobDept, setJobDept] = useState('Engineering');
  const [jobDesc, setJobDesc] = useState('');
  const [jobSkills, setJobSkills] = useState('');
  const [jobMaxQuestions, setJobMaxQuestions] = useState(5);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [createError, setCreateError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobsData, interviewsData, appsData, resumeData] = await Promise.all([
        interviewApi.listJobs(),
        user ? interviewApi.listInterviews() : Promise.resolve([]),
        user && user.role === 'candidate' ? interviewApi.getMyApplications() : Promise.resolve([]),
        user && user.role === 'candidate' ? interviewApi.getMyResume().catch(() => null) : Promise.resolve(null)
      ]);
      setJobs(jobsData || []);
      setExistingInterviews(interviewsData || []);
      setApplications(appsData || []);
      setActiveResume(resumeData);
      if (jobsData && jobsData.length > 0 && !inspectedJob) {
        setInspectedJob(jobsData[0]);
      }
    } catch (err) {
      console.warn('Error fetching jobs, interviews, or applications:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleCreateJobSubmit = async (e) => {
    e.preventDefault();
    if (!jobTitle.trim() || !jobDesc.trim()) {
      setCreateError('Title and description are required.');
      return;
    }

    setIsCreatingJob(true);
    setCreateError(null);
    try {
      const skillsArray = jobSkills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((name) => ({ name, minimumLevel: 'intermediate', weight: 1 }));

      const newJob = await interviewApi.createJob({
        title: jobTitle.trim(),
        department: jobDept.trim() || 'Engineering',
        description: jobDesc.trim(),
        requiredSkills:
          skillsArray.length > 0
            ? skillsArray
            : [{ name: 'Distributed Systems', minimumLevel: 'intermediate', weight: 1 }],
        maxQuestions: Number(jobMaxQuestions) || 5,
        targetDurationMinutes: (Number(jobMaxQuestions) || 5) * 5
      });

      setCreateModalOpen(false);
      setJobTitle('');
      setJobDept('Engineering');
      setJobDesc('');
      setJobSkills('');
      setInspectedJob(newJob);
      await fetchData();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setIsCreatingJob(false);
    }
  };

  const handleOpenApplyModal = () => {
    if (!user) {
      if (onOpenAuthModal) {
        onOpenAuthModal('candidate');
      } else {
        alert('Please sign in as a candidate to apply.');
      }
      return;
    }

    if (user.role === 'candidate' && !activeResume) {
      if (onNavigateProfile) {
        onNavigateProfile();
        return;
      }
    }

    const defaultSkills = (activeResume?.extractedProfile?.skills && activeResume.extractedProfile.skills.length > 0)
      ? activeResume.extractedProfile.skills.join(', ')
      : (inspectedJob?.requiredSkills || [])
          .map((s) => (typeof s === 'string' ? s : s.name))
          .join(', ');

    setApplySkills(defaultSkills);
    setApplyCoverNote('');
    setApplyResumeUrl('');
    setApplyError(null);
    setApplySuccess(null);
    setApplyModalOpen(true);
  };

  const handleApplySubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      onOpenAuthModal?.('candidate');
      return;
    }

    setIsApplying(true);
    setApplyError(null);
    setApplySuccess(null);
    try {
      const skillsArray = applySkills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const newApp = await interviewApi.applyForJob(inspectedJob.id, {
        coverNote: applyCoverNote.trim(),
        candidateSkills: skillsArray,
        resumeUrl: applyResumeUrl.trim() || undefined
      });

      setApplySuccess('Application successfully submitted! Recruiter will review your profile.');
      setApplications((prev) => [newApp, ...prev]);
      setTimeout(() => {
        setApplyModalOpen(false);
        setApplySuccess(null);
      }, 1500);
    } catch (err) {
      setApplyError(err.message || 'Failed to submit application.');
    } finally {
      setIsApplying(false);
    }
  };

  const getActiveInterviewForJob = (jobId) => {
    return existingInterviews.find(
      (i) => i.jobId === jobId && (i.status === 'scheduled' || i.status === 'in_progress')
    );
  };

  const getCompletedInterviewForJob = (jobId) => {
    return existingInterviews.find((i) => i.jobId === jobId && i.status === 'completed');
  };

  const getApplicationForJob = (jobId) => {
    return applications.find((a) => a.jobId === jobId);
  };

  const isRecruiter = user?.role === 'recruiter';
  const existingApp = inspectedJob ? getApplicationForJob(inspectedJob.id) : null;

  return (
    <div className="w-full min-h-screen bg-surface-container-lowest">
      {/* Status & Breadcrumb Header Bar */}
      <section className="w-full bg-surface-container-low py-4 px-margin md:px-margin-tablet lg:px-margin-desktop border-b border-outline-variant/30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-on-surface-variant font-label-md text-label-md">
            <span>Requisitions</span>
            <span className="text-secondary/50">/</span>
            <span>{inspectedJob?.department || 'Engineering'}</span>
            <span className="text-secondary/50">/</span>
            <span className="text-on-surface font-semibold truncate max-w-xs">
              {inspectedJob?.title || 'Open Positions'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 bg-surface-container-lowest shadow-sm rounded-lg border border-outline-variant/30">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              <span className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold">
                Active Positions: {jobs.length}
              </span>
            </div>
            {isRecruiter && (
              <button
                onClick={() => setCreateModalOpen(true)}
                className="px-3 py-1 bg-primary text-on-primary font-label-sm text-label-sm font-semibold rounded-lg hover:bg-primary-container transition-colors flex items-center gap-1 shadow-sm"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>Post Requisition</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {error && (
        <div className="max-w-7xl mx-auto px-margin py-4">
          <div className="p-4 rounded-lg bg-error-container/40 border border-error/30 text-error flex items-start gap-2">
            <span className="material-symbols-outlined text-[20px] shrink-0 mt-0.5">error</span>
            <span className="text-body-sm font-medium">{error}</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="max-w-7xl mx-auto px-margin py-16 flex flex-col items-center justify-center gap-3">
          <span className="material-symbols-outlined text-[32px] text-primary animate-spin">refresh</span>
          <span className="text-body-sm text-secondary">Loading available job requisitions from database...</span>
        </div>
      ) : jobs.length === 0 ? (
        /* Authentic Empty State */
        <div className="max-w-3xl mx-auto px-margin py-20 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-secondary">
            <span className="material-symbols-outlined text-[32px]">work_outline</span>
          </div>
          <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
            No Published Requisitions Found
          </h2>
          <p className="font-body-md text-body-md text-secondary max-w-md">
            There are currently no active job openings in the database. As a recruiter, you can publish a new requisition now.
          </p>
          {isRecruiter && (
            <button
              onClick={() => setCreateModalOpen(true)}
              className="px-6 py-2.5 rounded-lg bg-primary text-on-primary font-body-sm font-semibold hover:bg-primary-container transition-colors flex items-center gap-2 shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              <span>Publish First Requisition</span>
            </button>
          )}
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop py-8 space-y-8">
          {/* Requisition Selector Pills Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <span className="text-label-sm font-label-sm uppercase font-bold text-secondary shrink-0 pr-2">
              Select Position:
            </span>
            {jobs.map((job) => (
              <button
                key={job.id}
                onClick={() => setInspectedJob(job)}
                className={`px-3 py-1.5 rounded-lg text-body-sm font-semibold whitespace-nowrap transition-all border ${
                  inspectedJob?.id === job.id
                    ? 'bg-primary-container text-on-primary border-primary shadow-sm'
                    : 'bg-surface-container-low text-secondary hover:bg-surface-container border-outline-variant/30'
                }`}
              >
                {job.title}
              </button>
            ))}
          </div>

          {/* Inspected Job Canvas */}
          {inspectedJob && (
            <div className="space-y-8">
              {/* Hero Requisition Canvas */}
              <section className="rounded-xl bg-surface-container-lowest p-6 md:p-8 shadow-sm border border-outline-variant/30">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-8">
                  <div className="flex-1 space-y-4">
                    <div className="flex flex-wrap items-center gap-2 font-label-sm text-label-sm text-secondary">
                      <span className="px-2.5 py-1 bg-surface-container text-on-secondary-container font-semibold rounded-lg">
                        {inspectedJob.department || 'Enterprise Engineering'}
                      </span>
                      <span>•</span>
                      <span className="px-2.5 py-1 bg-surface-container text-on-secondary-container font-semibold rounded-lg">
                        Staff Track (L6 Equivalent)
                      </span>
                      <span>•</span>
                      <span className="px-2.5 py-1 bg-surface-container text-on-secondary-container font-semibold rounded-lg">
                        Full-time Regular
                      </span>
                    </div>

                    <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold max-w-4xl">
                      {inspectedJob.title}
                    </h1>

                    <div className="flex flex-wrap items-center gap-6 pt-2 text-on-surface-variant font-body-md text-body-md">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[20px]">payments</span>
                        <span className="font-semibold text-on-surface font-metric-tabular text-metric-tabular">
                          $240,000 - $275,000
                        </span>
                        <span className="text-secondary font-label-md text-label-md">+ Equity &amp; Bonus</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[20px]">location_on</span>
                        <span>San Francisco, CA / Remote (US)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[20px]">speed</span>
                        <span>Adaptive Rounds: {inspectedJob.maxQuestions || 5} Questions</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Panel */}
                  <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0 lg:w-72">
                    {/* Active Resume Status for Candidates */}
                    {!isRecruiter && user?.role === 'candidate' && (
                      activeResume ? (
                        <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 space-y-1.5 text-left">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-primary flex items-center gap-1">
                              <span className="material-symbols-outlined text-[15px]">description</span>
                              <span>Saved Profile Resume</span>
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                              v{activeResume.currentVersion || 1}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-on-surface truncate">
                            {activeResume.originalName || activeResume.filename}
                          </p>
                          <div className="flex items-center justify-between pt-1 border-t border-outline-variant/20">
                            <span className="text-[11px] text-secondary">
                              {(activeResume.extractedProfile?.skills || []).length} skills linked
                            </span>
                            {onNavigateProfile && (
                              <button
                                onClick={onNavigateProfile}
                                className="text-[11px] text-primary hover:underline font-semibold"
                              >
                                Update
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-left">
                          <div className="flex items-center gap-1.5 text-amber-700 font-bold text-xs">
                            <span className="material-symbols-outlined text-[16px]">upload_file</span>
                            <span>Resume Required</span>
                          </div>
                          <p className="text-[11px] text-secondary leading-snug">
                            Please upload your resume once in your Profile to unlock personalized adaptive questions and instant job applications.
                          </p>
                          {onNavigateProfile && (
                            <button
                              onClick={onNavigateProfile}
                              className="w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 shadow-xs"
                            >
                              <span>Upload Resume in Profile</span>
                            </button>
                          )}
                        </div>
                      )
                    )}

                    {/* Application Status Banner if applied */}
                    {existingApp && (
                      <div className="p-3 rounded-lg bg-surface-container-low border border-primary/30 space-y-1 text-left">
                        <div className="flex items-center justify-between">
                          <span className="font-label-sm text-secondary uppercase font-semibold">
                            Application
                          </span>
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-primary-container text-on-primary">
                            {(existingApp.status || 'pending').replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="font-label-sm text-secondary text-[12px]">
                          Submitted on {new Date(existingApp.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    )}

                    {/* Interview Action */}
                    {getActiveInterviewForJob(inspectedJob.id) ? (
                      <button
                        onClick={() => onSelectInterview(getActiveInterviewForJob(inspectedJob.id))}
                        className="w-full h-11 px-6 rounded-lg bg-primary-container text-on-primary font-body-md text-body-md font-semibold shadow-sm hover:bg-primary transition-all flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                        <span>Resume Interview</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          if (user?.role === 'candidate' && !activeResume) {
                            if (onNavigateProfile) {
                              onNavigateProfile();
                              return;
                            }
                          }
                          onSelectJob(inspectedJob);
                        }}
                        className="w-full h-11 px-6 rounded-lg bg-primary-container text-on-primary font-body-md text-body-md font-semibold shadow-sm hover:bg-primary transition-all flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[18px]">bolt</span>
                        <span>{user?.role === 'candidate' && !activeResume ? 'Upload Resume to Interview' : 'Start Adaptive Interview'}</span>
                      </button>
                    )}

                    {/* Apply for Position Button (for candidates who haven't applied yet) */}
                    {!isRecruiter && !existingApp && (
                      <button
                        onClick={() => {
                          if (user?.role === 'candidate' && !activeResume) {
                            if (onNavigateProfile) {
                              onNavigateProfile();
                              return;
                            }
                          }
                          handleOpenApplyModal();
                        }}
                        className="w-full h-11 px-6 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-md text-body-md font-semibold transition-all flex items-center justify-center gap-2 border border-outline-variant/30"
                      >
                        <span className="material-symbols-outlined text-[18px]">send</span>
                        <span>Apply for Position</span>
                      </button>
                    )}

                    {getCompletedInterviewForJob(inspectedJob.id) && (
                      <button
                        onClick={() => onSelectInterview(getCompletedInterviewForJob(inspectedJob.id))}
                        className="w-full h-11 px-6 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-md text-body-md font-semibold transition-all flex items-center justify-center gap-2 border border-outline-variant/30"
                      >
                        <span className="material-symbols-outlined text-[18px]">visibility</span>
                        <span>View Evaluation Report</span>
                      </button>
                    )}
                  </div>
                </div>
              </section>

              {/* Bento Grid Specifications */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Left 8 cols: Overview, Topology & Skills */}
                <div className="lg:col-span-8 space-y-10">
                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="font-headline-md text-headline-md text-on-surface tracking-tight font-bold">
                        Role Overview &amp; Architectural Scope
                      </h2>
                      <span className="font-label-sm text-label-sm text-secondary uppercase tracking-widest font-semibold">
                        Section 01
                      </span>
                    </div>
                    <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
                      {inspectedJob.description}
                    </p>

                    {/* Telemetry Metrics */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                      <div className="p-5 rounded-xl bg-surface-container-low flex flex-col justify-between border border-outline-variant/20">
                        <div className="flex items-center justify-between">
                          <span className="font-label-sm text-label-sm text-secondary uppercase font-semibold">
                            Adaptive Questions
                          </span>
                          <span className="material-symbols-outlined text-primary text-[20px]">layers</span>
                        </div>
                        <div className="mt-4">
                          <span className="font-display-hero text-display-hero font-bold text-on-surface tracking-tight">
                            {inspectedJob.maxQuestions || 5}
                          </span>
                          <p className="font-label-md text-label-md text-secondary">Dynamic Recursive Probes</p>
                        </div>
                      </div>

                      <div className="p-5 rounded-xl bg-surface-container-low flex flex-col justify-between border border-outline-variant/20">
                        <div className="flex items-center justify-between">
                          <span className="font-label-sm text-label-sm text-secondary uppercase font-semibold">
                            Calibration Model
                          </span>
                          <span className="material-symbols-outlined text-primary text-[20px]">psychology</span>
                        </div>
                        <div className="mt-4">
                          <span className="font-display-hero text-display-hero font-bold text-on-surface tracking-tight">
                            Gemini
                          </span>
                          <p className="font-label-md text-label-md text-secondary">Zero-Hallucination Rubrics</p>
                        </div>
                      </div>

                      <div className="p-5 rounded-xl bg-surface-container-low flex flex-col justify-between border border-outline-variant/20">
                        <div className="flex items-center justify-between">
                          <span className="font-label-sm text-label-sm text-secondary uppercase font-semibold">
                            Duration Budget
                          </span>
                          <span className="material-symbols-outlined text-primary text-[20px]">timer</span>
                        </div>
                        <div className="mt-4">
                          <span className="font-display-hero text-display-hero font-bold text-on-surface tracking-tight">
                            ~{(inspectedJob.maxQuestions || 5) * 5}m
                          </span>
                          <p className="font-label-md text-label-md text-secondary">Continuous Voice Flow</p>
                        </div>
                      </div>
                    </div>

                    {/* System Topology SVG */}
                    <div className="p-6 rounded-xl bg-surface-container text-on-surface border border-outline-variant/30">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-primary text-[20px]">schema</span>
                          <span className="font-headline-sm text-headline-sm font-semibold">
                            System Topology: Real-time Evaluation Bus
                          </span>
                        </div>
                        <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-lg bg-surface-container-lowest text-primary font-semibold">
                          Active Stream
                        </span>
                      </div>
                      <div className="w-full bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/20">
                        <svg className="w-full h-auto text-on-surface" fill="none" viewBox="0 0 760 140" xmlns="http://www.w3.org/2000/svg">
                          <rect className="fill-surface-container-low" height="80" rx="8" width="160" x="10" y="30"></rect>
                          <text className="fill-current font-bold text-[13px] font-sans" x="25" y="62">Candidate Audio STT</text>
                          <text className="fill-secondary text-[11px] font-sans" x="25" y="82">Browser Web Speech API</text>
                          <path className="text-outline-variant" d="M170 70 L230 70" stroke="currentColor" strokeDasharray="4 4" strokeWidth="2"></path>
                          <polygon className="text-primary" fill="currentColor" points="230,66 238,70 230,74"></polygon>
                          <rect className="fill-primary-container" height="100" rx="8" width="220" x="240" y="20"></rect>
                          <text className="font-bold text-[14px] font-sans" fill="#ffffff" x="255" y="52">Adaptive Calibration Bus</text>
                          <text className="text-[11px] font-sans" fill="#cad3ff" x="255" y="72">Express &amp; Cloud Firestore</text>
                          <text className="text-[11px] font-sans" fill="#cad3ff" x="255" y="92">Strict Multi-Tenant Isolation</text>
                          <path className="text-primary" d="M460 70 L520 70" stroke="currentColor" strokeWidth="2"></path>
                          <polygon className="text-primary" fill="currentColor" points="520,66 528,70 520,74"></polygon>
                          <rect className="fill-surface-container-low" height="80" rx="8" width="220" x="530" y="30"></rect>
                          <text className="fill-current font-bold text-[13px] font-sans" x="545" y="62">Gemini AI Synthesis</text>
                          <text className="fill-secondary text-[11px] font-sans" x="545" y="82">Real-Time Scoring &amp; TTS</text>
                        </svg>
                      </div>
                    </div>
                  </section>

                  {/* Technical Competency Rubric */}
                  <section className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="font-headline-md text-headline-md text-on-surface tracking-tight font-bold">
                          Required Technical Competencies
                        </h2>
                        <p className="font-body-sm text-body-sm text-secondary mt-1">
                          Evaluated rigorously across algorithmic nuance, systems depth, and live response clarity.
                        </p>
                      </div>
                      <span className="font-label-sm text-label-sm text-secondary uppercase tracking-widest font-semibold">
                        Section 02
                      </span>
                    </div>

                    <div className="space-y-3">
                      {(inspectedJob.requiredSkills || []).map((skill, idx) => {
                        const skillName = typeof skill === 'string' ? skill : skill.name;
                        const skillLevel = typeof skill === 'object' && skill.level ? skill.level : 'Required';
                        return (
                          <div
                            key={idx}
                            className="p-4 rounded-xl bg-surface-container-lowest shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 border border-outline-variant/30"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                                  {skillName}
                                </span>
                                <span className="px-2 py-0.5 rounded-lg bg-surface-container-highest text-primary font-label-sm text-label-sm font-bold uppercase">
                                  {skillLevel}
                                </span>
                              </div>
                              <p className="font-body-sm text-body-sm text-secondary">
                                Core domain benchmark calibrated for enterprise requisition criteria.
                              </p>
                            </div>
                            <div className="shrink-0 w-36">
                              <div className="flex justify-between font-label-sm text-label-sm mb-1">
                                <span className="text-secondary font-semibold">Calibrated Weight</span>
                                <span className="text-primary font-bold">High</span>
                              </div>
                              <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
                                <div className="h-full bg-primary-container rounded-full" style={{ width: '85%' }}></div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>

                {/* Right 4 cols: Card info */}
                <div className="lg:col-span-4 space-y-6">
                  <div className="p-6 rounded-xl bg-surface-container text-on-surface shadow-sm space-y-5 border border-outline-variant/30">
                    <div className="flex items-center justify-between">
                      <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">
                        Requisition Health
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-surface-container-lowest text-primary font-label-sm text-label-sm font-bold">
                        Active Priority
                      </span>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between font-body-sm text-body-sm">
                        <span className="text-secondary">Assigned Score Rubric</span>
                        <span className="font-semibold text-on-surface">Institutional v4.2</span>
                      </div>
                      <div className="flex justify-between font-body-sm text-body-sm">
                        <span className="text-secondary">Difficulty Ceiling</span>
                        <span className="font-semibold text-on-surface">Level 5 / 5 Apex</span>
                      </div>
                      <div className="flex justify-between font-body-sm text-body-sm">
                        <span className="text-secondary">Median Assessment Time</span>
                        <span className="font-semibold text-on-surface">25 Minutes</span>
                      </div>
                    </div>
                    <div className="pt-2">
                      <button
                        onClick={() => onSelectJob(inspectedJob)}
                        className="w-full py-3 px-4 rounded-lg bg-primary-container text-on-primary font-body-md text-body-md font-semibold hover:bg-primary transition-all flex items-center justify-center gap-2 shadow-sm"
                      >
                        <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                        <span>Start Assessment for this Job</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-6 rounded-xl bg-surface-container-lowest shadow-sm space-y-4 border border-outline-variant/30">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">verified_user</span>
                      <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                        Zero-Bias Assurance
                      </h3>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                      Every candidate receives identical dynamic rubric telemetry. Questions adjust exclusively based on technical veracity and reasoning depth.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Candidate Apply for Job Modal */}
      {applyModalOpen && inspectedJob && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-surface/60 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-lg bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/40 p-6 space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/30">
              <div>
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                  Apply for Requisition
                </h3>
                <p className="font-body-sm text-secondary text-xs">{inspectedJob.title}</p>
              </div>
              <button
                onClick={() => setApplyModalOpen(false)}
                className="p-1 rounded text-secondary hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {applyError && (
              <div className="p-3 rounded-lg bg-error-container/40 border border-error/30 text-error flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
                <span className="text-body-sm font-medium">{applyError}</span>
              </div>
            )}

            {applySuccess && (
              <div className="p-3 rounded-lg bg-primary-fixed/30 border border-primary text-primary font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                <span className="text-body-sm">{applySuccess}</span>
              </div>
            )}

            {activeResume && (
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-primary text-[22px]">description</span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-on-surface">
                        {activeResume.originalName || activeResume.filename}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-primary/10 text-primary">
                        v{activeResume.currentVersion || 1}
                      </span>
                    </div>
                    <span className="text-[11px] text-secondary">
                      Saved resume will be linked automatically
                    </span>
                  </div>
                </div>
                {onNavigateProfile && (
                  <button
                    type="button"
                    onClick={() => {
                      setApplyModalOpen(false);
                      onNavigateProfile();
                    }}
                    className="text-xs text-primary hover:underline font-semibold"
                  >
                    Change
                  </button>
                )}
              </div>
            )}

            <form onSubmit={handleApplySubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="font-label-md text-label-md font-semibold text-on-surface" htmlFor="apply-skills">
                  Your Primary Relevant Skills (Comma separated)
                </label>
                <input
                  id="apply-skills"
                  type="text"
                  required
                  placeholder="e.g. Distributed Systems, Kafka, Go, Rust"
                  value={applySkills}
                  onChange={(e) => setApplySkills(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-1">
                <label className="font-label-md text-label-md font-semibold text-on-surface" htmlFor="apply-resume">
                  Resume / Portfolio URL (Optional)
                </label>
                <input
                  id="apply-resume"
                  type="url"
                  placeholder="https://linkedin.com/in/... or https://github.com/..."
                  value={applyResumeUrl}
                  onChange={(e) => setApplyResumeUrl(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-label-md text-label-md font-semibold text-on-surface" htmlFor="apply-note">
                    Cover Note / Engineering Pitch
                  </label>
                  <span className="text-label-sm text-secondary">
                    {applyCoverNote.length} / 1000
                  </span>
                </div>
                <textarea
                  id="apply-note"
                  rows={4}
                  maxLength={1000}
                  placeholder="Highlight your relevant architectural contributions, scaling challenges solved, or system focus..."
                  value={applyCoverNote}
                  onChange={(e) => setApplyCoverNote(e.target.value)}
                  className="w-full p-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setApplyModalOpen(false)}
                  disabled={isApplying}
                  className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-body-sm font-semibold hover:bg-surface-container-high"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isApplying}
                  className="px-5 py-2 rounded-lg bg-primary-container text-on-primary font-body-sm font-semibold hover:bg-primary shadow-sm flex items-center gap-1.5"
                >
                  {isApplying ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">send</span>
                      <span>Submit Application</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recruiter Job Creation Modal */}
      {createModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-surface/60 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-lg bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/40 p-6 space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/30">
              <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                Post New Technical Requisition
              </h3>
              <button onClick={() => setCreateModalOpen(false)} className="p-1 rounded text-secondary hover:text-on-surface">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-lg bg-error-container/40 border border-error/30 text-error flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
                <span className="text-body-sm font-medium">{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateJobSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="font-label-md text-label-md font-semibold text-on-surface" htmlFor="job-pos">
                  Position Title
                </label>
                <input
                  id="job-pos"
                  type="text"
                  required
                  placeholder="e.g. Staff Backend Engineer"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-1">
                <label className="font-label-md text-label-md font-semibold text-on-surface" htmlFor="job-dep">
                  Department
                </label>
                <input
                  id="job-dep"
                  type="text"
                  placeholder="e.g. Core Infrastructure"
                  value={jobDept}
                  onChange={(e) => setJobDept(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-1">
                <label className="font-label-md text-label-md font-semibold text-on-surface" htmlFor="job-desc">
                  Description &amp; Responsibilities
                </label>
                <textarea
                  id="job-desc"
                  rows={4}
                  required
                  placeholder="Describe technical focus, architectural scope, and domain..."
                  value={jobDesc}
                  onChange={(e) => setJobDesc(e.target.value)}
                  className="w-full p-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-1">
                <label className="font-label-md text-label-md font-semibold text-on-surface" htmlFor="job-req-skills">
                  Required Skills (Comma separated)
                </label>
                <input
                  id="job-req-skills"
                  type="text"
                  placeholder="e.g. Distributed Systems, Kafka, Go, Concurrency"
                  value={jobSkills}
                  onChange={(e) => setJobSkills(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-1">
                <label className="font-label-md text-label-md font-semibold text-on-surface" htmlFor="job-q-count">
                  Adaptive Questions
                </label>
                <input
                  id="job-q-count"
                  type="number"
                  min="3"
                  max="10"
                  value={jobMaxQuestions}
                  onChange={(e) => setJobMaxQuestions(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={isCreatingJob}
                  className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-body-sm font-semibold hover:bg-surface-container-high"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingJob}
                  className="px-5 py-2 rounded-lg bg-primary-container text-on-primary font-body-sm font-semibold hover:bg-primary shadow-sm"
                >
                  {isCreatingJob ? 'Publishing...' : 'Publish Requisition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobSelector;
