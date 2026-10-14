import React, { useState, useEffect } from 'react';
import interviewApi from '../services/interviewApi';
import { useAuth } from '../context/AuthContext';

export const JobExplorerScreen = ({
  onStartInterview,
  onNavigateProfile,
  onOpenAuthModal
}) => {
  const { user } = useAuth();

  // Search & Filter State
  const [query, setQuery] = useState('Software Engineer');
  const [location, setLocation] = useState('Bengaluru');
  const [country, setCountry] = useState('in');
  const [remote, setRemote] = useState('all'); // 'all' | 'true' | 'false'
  const [experienceLevel, setExperienceLevel] = useState('all'); // 'all' | 'entry' | 'mid' | 'senior'
  const [employmentType, setEmploymentType] = useState('all'); // 'all' | 'fulltime' | 'contractor' | 'parttime' | 'intern'
  const [salaryMin, setSalaryMin] = useState('');
  const [page, setPage] = useState(1);

  // Data & State
  const [jobs, setJobs] = useState([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [activeProvider, setActiveProvider] = useState('jsearch');
  const [isCached, setIsCached] = useState(false);
  const [retrievedAt, setRetrievedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeResume, setActiveResume] = useState(null);

  // Inspected Job Modal & Skill Comparison
  const [selectedJob, setSelectedJob] = useState(null);
  const [modalTab, setModalTab] = useState('skills'); // 'skills' | 'description' | 'salary'
  const [skillComparison, setSkillComparison] = useState(null);
  const [comparingSkills, setComparingSkills] = useState(false);
  const [comparisonError, setComparisonError] = useState(null);

  // Preparing Interview State
  const [isPreparingInterview, setIsPreparingInterview] = useState(false);
  const [prepareError, setPrepareError] = useState(null);

  // Check candidate's saved resume on load
  useEffect(() => {
    if (user && user.role === 'candidate') {
      interviewApi
        .getMyResume()
        .then(res => setActiveResume(res))
        .catch(() => setActiveResume(null));
    }
  }, [user]);

  // Execute Search
  const fetchJobs = async (targetPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const searchParams = {
        query: query.trim() || 'Software Engineer',
        location: location.trim(),
        country,
        remote,
        experienceLevel,
        employmentType,
        salaryMin: salaryMin ? Number(salaryMin) : undefined,
        page: targetPage,
        limit: 10
      };

      const result = await interviewApi.searchMarketJobs(searchParams);
      if (result) {
        setJobs(result.jobs || []);
        setTotalJobs(result.total || (result.jobs || []).length);
        setTotalPages(result.totalPages || 1);
        setActiveProvider(result.provider || 'jsearch');
        setIsCached(Boolean(result.isCached));
        setRetrievedAt(result.retrievedAt || null);
        setPage(targetPage);
      }
    } catch (err) {
      console.warn('Market Job Explorer API error:', err.message);
      setError(err.message || 'Failed to fetch live job listings.');
      setJobs([]);
      setTotalJobs(0);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchJobs(1);
  }, [country]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchJobs(1);
  };

  // Open Job Details & Compare Skills
  const handleOpenJobDetails = async (job) => {
    setSelectedJob(job);
    setModalTab('skills');
    setSkillComparison(null);
    setComparisonError(null);
    setPrepareError(null);

    if (!user) {
      return;
    }

    if (user.role === 'candidate') {
      setComparingSkills(true);
      try {
        const comp = await interviewApi.compareResumeWithJob(job);
        setSkillComparison(comp);
      } catch (err) {
        setComparisonError(err.message);
      } finally {
        setComparingSkills(false);
      }
    }
  };

  // Prepare and Launch Adaptive Interview
  const handlePrepareInterview = async (job) => {
    if (!user) {
      if (onOpenAuthModal) onOpenAuthModal('candidate');
      return;
    }

    if (!activeResume) {
      if (onNavigateProfile) onNavigateProfile();
      return;
    }

    setIsPreparingInterview(true);
    setPrepareError(null);
    try {
      const result = await interviewApi.prepareMarketJobInterview(job);
      if (result && result.interview) {
        if (onStartInterview) {
          onStartInterview(result.interview, result.job);
        }
      }
    } catch (err) {
      setPrepareError(err.message || 'Failed to initialize adaptive interview.');
    } finally {
      setIsPreparingInterview(false);
    }
  };

  // Popular tech hubs
  const indianHubs = ['Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Delhi NCR', 'Chennai', 'Remote'];
  const globalHubs = ['San Francisco', 'New York', 'London', 'Berlin', 'Toronto', 'Singapore', 'Remote'];
  const activeHubs = country === 'in' ? indianHubs : globalHubs;

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] bg-surface-container-lowest text-on-surface py-space-xl">
      <div className="max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop space-y-space-xl">
        
        {/* Header Hero Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-lg border-b border-outline-variant/30 pb-space-lg">
          <div>
            <div className="inline-flex items-center gap-space-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-label-sm font-semibold text-xs mb-space-xs">
              <span className="material-symbols-outlined text-[16px]">travel_explore</span>
              <span>Real-Time Market Intelligence</span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface font-extrabold tracking-tight">
              Job Explorer &amp; Salary Intelligence
            </h1>
            <p className="font-body-md text-on-surface-variant max-w-2xl mt-1">
              Explore authentic vacancies worldwide, compare compensation benchmarks, evaluate your saved resume against real employer requirements, and launch personalized AI interview simulations.
            </p>
          </div>

          {/* Saved Resume Status Badge */}
          <div className="flex items-center gap-space-md">
            {user && user.role === 'candidate' ? (
              activeResume ? (
                <div className="flex items-center gap-space-sm bg-surface-container-low border border-outline-variant/40 rounded-xl p-3 shadow-sm">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">verified_user</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-body-sm font-semibold text-on-surface">Active Resume Ready</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary">
                        v{activeResume.currentVersion || 1}
                      </span>
                    </div>
                    <span className="text-label-sm text-secondary truncate max-w-[180px] block">
                      {activeResume.originalName || activeResume.filename}
                    </span>
                  </div>
                </div>
              ) : (
                <button
                  onClick={onNavigateProfile}
                  className="flex items-center gap-space-sm bg-amber-500/10 border border-amber-500/30 text-amber-700 px-4 py-2.5 rounded-xl hover:bg-amber-500/20 transition-colors text-body-sm font-medium"
                >
                  <span className="material-symbols-outlined text-[18px]">upload_file</span>
                  <span>Upload Resume in Profile</span>
                </button>
              )
            ) : null}
          </div>
        </div>

        {/* Search & Filters Card */}
        <div className="bg-surface-container-low border border-outline-variant/40 rounded-2xl p-space-lg shadow-sm space-y-space-md">
          <form onSubmit={handleSearchSubmit} className="space-y-space-md">
            {/* Top Search Inputs Row */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-space-sm">
              {/* Job Title / Skill Keyword Input */}
              <div className="md:col-span-5 relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-secondary">
                  <span className="material-symbols-outlined text-[20px]">search</span>
                </span>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Job title, technical skill, or company (e.g. Node.js Developer)..."
                  className="w-full pl-10 pr-4 py-2.5 bg-surface-container-lowest border border-outline-variant/50 rounded-xl text-body-md text-on-surface placeholder:text-secondary/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Location Input */}
              <div className="md:col-span-4 relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-secondary">
                  <span className="material-symbols-outlined text-[20px]">location_on</span>
                </span>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City or state (e.g. Bengaluru, Hyderabad)..."
                  className="w-full pl-10 pr-4 py-2.5 bg-surface-container-lowest border border-outline-variant/50 rounded-xl text-body-md text-on-surface placeholder:text-secondary/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Country Selector */}
              <div className="md:col-span-2">
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-3 py-2.5 bg-surface-container-lowest border border-outline-variant/50 rounded-xl text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-medium"
                >
                  <option value="in">India 🇮🇳 (INR)</option>
                  <option value="us">United States 🇺🇸 (USD)</option>
                  <option value="gb">United Kingdom 🇬🇧 (GBP)</option>
                  <option value="ca">Canada 🇨🇦 (CAD)</option>
                  <option value="de">Germany 🇩🇪 (EUR)</option>
                  <option value="au">Australia 🇦🇺 (AUD)</option>
                </select>
              </div>

              {/* Search Button */}
              <div className="md:col-span-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-full min-h-[42px] bg-primary text-on-primary rounded-xl font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1 shadow-sm disabled:opacity-50"
                >
                  {loading ? (
                    <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">search</span>
                      <span className="hidden lg:inline text-body-sm">Search</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Location Chips */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-label-sm">
              <span className="text-secondary font-medium shrink-0">Popular Tech Hubs:</span>
              {activeHubs.map((hub) => (
                <button
                  key={hub}
                  type="button"
                  onClick={() => {
                    setLocation(hub === 'Remote' ? '' : hub);
                    if (hub === 'Remote') setRemote('true');
                    else setRemote('all');
                  }}
                  className={`px-2.5 py-1 rounded-lg border text-xs transition-colors shrink-0 ${
                    location === hub || (hub === 'Remote' && remote === 'true')
                      ? 'bg-primary text-on-primary border-primary font-semibold'
                      : 'bg-surface-container-lowest border-outline-variant/40 text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  {hub}
                </button>
              ))}
            </div>

            {/* Filter Pills Bar (Workplace, Experience, Employment, Salary) */}
            <div className="pt-space-xs border-t border-outline-variant/30 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-sm text-body-sm">
              {/* Workplace Arrangement */}
              <div>
                <label className="block text-label-sm text-secondary mb-1">Work Arrangement</label>
                <select
                  value={remote}
                  onChange={(e) => setRemote(e.target.value)}
                  className="w-full px-3 py-1.5 bg-surface-container-lowest border border-outline-variant/40 rounded-lg text-on-surface focus:outline-none focus:border-primary text-body-sm"
                >
                  <option value="all">Any Work Arrangement</option>
                  <option value="true">Remote / Work from Home Only</option>
                  <option value="false">On-site / In-Office Only</option>
                </select>
              </div>

              {/* Experience Level */}
              <div>
                <label className="block text-label-sm text-secondary mb-1">Experience Level</label>
                <select
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                  className="w-full px-3 py-1.5 bg-surface-container-lowest border border-outline-variant/40 rounded-lg text-on-surface focus:outline-none focus:border-primary text-body-sm"
                >
                  <option value="all">All Experience Levels</option>
                  <option value="entry">Entry-Level / Junior (0-2 yrs)</option>
                  <option value="mid">Mid-Level (2-5 yrs)</option>
                  <option value="senior">Senior / Lead (5+ yrs)</option>
                </select>
              </div>

              {/* Employment Type */}
              <div>
                <label className="block text-label-sm text-secondary mb-1">Employment Type</label>
                <select
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value)}
                  className="w-full px-3 py-1.5 bg-surface-container-lowest border border-outline-variant/40 rounded-lg text-on-surface focus:outline-none focus:border-primary text-body-sm"
                >
                  <option value="all">All Employment Types</option>
                  <option value="fulltime">Full-Time</option>
                  <option value="contractor">Contract / Freelance</option>
                  <option value="parttime">Part-Time</option>
                  <option value="intern">Internship</option>
                </select>
              </div>

              {/* Min Salary Filter */}
              <div>
                <label className="block text-label-sm text-secondary mb-1">
                  Min. Annual Pay ({country === 'in' ? '₹ INR' : country === 'gb' ? '£ GBP' : '$ USD'})
                </label>
                <input
                  type="number"
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(e.target.value)}
                  placeholder={country === 'in' ? 'e.g. 1000000' : 'e.g. 80000'}
                  className="w-full px-3 py-1.5 bg-surface-container-lowest border border-outline-variant/40 rounded-lg text-on-surface focus:outline-none focus:border-primary text-body-sm placeholder:text-secondary/50"
                />
              </div>
            </div>
          </form>
        </div>

        {/* Feed Status & Provider Metadata */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm text-label-sm text-secondary px-1">
          <div className="flex items-center gap-space-sm">
            <span className="font-semibold text-on-surface">
              {loading ? 'Searching...' : `${totalJobs} verified vacancy records found`}
            </span>
            {isCached && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-container text-secondary text-[11px]">
                <span className="material-symbols-outlined text-[13px]">cached</span>
                Cached snapshot
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[15px] text-emerald-600">bolt</span>
            <span>Live Feed Provider: <strong className="text-on-surface uppercase">{activeProvider}</strong></span>
          </div>
        </div>

        {/* Error State Banner */}
        {error && (
          <div className="bg-error-container/20 border border-error/30 rounded-2xl p-space-lg text-on-surface space-y-space-sm">
            <div className="flex items-start gap-space-md">
              <span className="material-symbols-outlined text-error text-[24px]">cloud_off</span>
              <div className="space-y-1">
                <h3 className="font-semibold text-error">Job Market Provider Notification</h3>
                <p className="text-body-sm text-on-surface-variant">{error}</p>
                <p className="text-xs text-secondary mt-1">
                  Configure <code className="bg-surface-container px-1 py-0.5 rounded font-mono text-primary">JSEARCH_API_KEY</code> or <code className="bg-surface-container px-1 py-0.5 rounded font-mono text-primary">ADZUNA_APP_KEY</code> in your server's <code className="bg-surface-container px-1 py-0.5 rounded font-mono">.env</code> to activate live market queries.
                </p>
              </div>
            </div>
            <div className="pl-9">
              <button
                onClick={() => fetchJobs(page)}
                className="px-3.5 py-1.5 bg-error text-white rounded-lg text-body-sm font-medium hover:bg-error/90 transition-colors"
              >
                Retry Search
              </button>
            </div>
          </div>
        )}

        {/* Job Listings Grid / Skeleton / Empty */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-space-lg animate-pulse space-y-space-md"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-surface-container" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-surface-container rounded w-3/4" />
                    <div className="h-3 bg-surface-container rounded w-1/2" />
                  </div>
                </div>
                <div className="h-3 bg-surface-container rounded w-full" />
                <div className="h-3 bg-surface-container rounded w-5/6" />
                <div className="flex gap-2 pt-2">
                  <div className="h-6 w-20 bg-surface-container rounded-full" />
                  <div className="h-6 w-24 bg-surface-container rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : jobs.length === 0 && !error ? (
          <div className="text-center py-space-3xl bg-surface-container-low border border-outline-variant/30 rounded-2xl p-space-xl space-y-space-md">
            <div className="w-16 h-16 rounded-2xl bg-surface-container mx-auto flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[32px]">manage_search</span>
            </div>
            <div className="space-y-1">
              <h3 className="font-headline-sm font-bold text-on-surface">No matching job vacancies found</h3>
              <p className="text-body-md text-on-surface-variant max-w-md mx-auto">
                Try widening your search terms, removing filters, or choosing a different city or country.
              </p>
            </div>
            <button
              onClick={() => {
                setQuery('Software Engineer');
                setLocation('');
                setRemote('all');
                setExperienceLevel('all');
                setEmploymentType('all');
                setSalaryMin('');
                fetchJobs(1);
              }}
              className="px-4 py-2 bg-primary text-on-primary rounded-xl font-medium text-body-sm hover:bg-primary/90 transition-colors"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="bg-surface-container-low border border-outline-variant/40 rounded-2xl p-space-lg shadow-sm hover:shadow-md hover:border-primary/40 transition-all flex flex-col justify-between space-y-space-md group"
              >
                {/* Job Card Header */}
                <div className="space-y-space-sm">
                  <div className="flex items-start justify-between gap-space-sm">
                    <div className="flex items-start gap-3">
                      {/* Employer Logo or Initial */}
                      {job.employer?.logo ? (
                        <img
                          src={job.employer.logo}
                          alt={job.employer.name}
                          className="w-12 h-12 rounded-xl object-contain bg-surface-container-lowest p-1 border border-outline-variant/40 shrink-0"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-headline-sm shrink-0 border border-outline-variant/20">
                          {job.employer?.name?.charAt(0) || 'J'}
                        </div>
                      )}

                      <div className="space-y-0.5">
                        <h2 className="font-title-lg text-title-lg text-on-surface font-bold group-hover:text-primary transition-colors line-clamp-1">
                          {job.title}
                        </h2>
                        <div className="flex items-center gap-1.5 text-body-sm text-secondary font-medium">
                          <span>{job.employer?.name}</span>
                          <span>•</span>
                          <span className="flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[14px]">location_on</span>
                            {job.location?.displayLocation}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Freshness Badge */}
                    <span className="text-[11px] font-medium text-secondary whitespace-nowrap bg-surface-container px-2 py-0.5 rounded-md shrink-0">
                      {job.postedAtDisplay}
                    </span>
                  </div>

                  {/* Pills Row: Salary & Work Type */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {/* Salary Intelligence Badge */}
                    {job.salary?.hasSalary ? (
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                          job.salary.type === 'advertised'
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                            : 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/30'
                        }`}
                        title={job.salary.source || 'Salary Information'}
                      >
                        <span className="material-symbols-outlined text-[14px]">payments</span>
                        <span>{job.salary.displaySalary}</span>
                        <span className="text-[10px] uppercase font-bold opacity-75">
                          ({job.salary.type === 'advertised' ? 'Advertised' : 'Estimated'})
                        </span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs text-secondary bg-surface-container border border-outline-variant/30">
                        <span className="material-symbols-outlined text-[13px]">money_off</span>
                        <span>Salary not disclosed</span>
                      </span>
                    )}

                    {/* Remote Pill */}
                    {job.location?.isRemote && (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                        <span className="material-symbols-outlined text-[13px]">home_work</span>
                        <span>Remote</span>
                      </span>
                    )}

                    {/* Employment Type Pill */}
                    <span className="px-2 py-0.5 rounded-lg text-xs font-medium bg-surface-container text-on-surface-variant capitalize">
                      {job.employmentType}
                    </span>
                  </div>

                  {/* Snippet Description */}
                  <p className="text-body-sm text-on-surface-variant line-clamp-2 leading-relaxed">
                    {job.description}
                  </p>

                  {/* Skills Chips */}
                  {job.requiredSkills && job.requiredSkills.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {job.requiredSkills.slice(0, 5).map((skill, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-surface-container-lowest border border-outline-variant/40 text-[11px] font-medium text-on-surface-variant"
                        >
                          {skill}
                        </span>
                      ))}
                      {job.requiredSkills.length > 5 && (
                        <span className="px-1.5 py-0.5 text-[11px] text-secondary">
                          +{job.requiredSkills.length - 5} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="pt-space-sm border-t border-outline-variant/30 flex items-center justify-between gap-space-sm">
                  <span className="text-[11px] text-secondary truncate max-w-[150px]">
                    Source: {job.source}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenJobDetails(job)}
                      className="px-3 py-1.5 rounded-xl border border-outline-variant/60 hover:bg-surface-container text-body-sm font-semibold text-on-surface transition-colors flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[16px] text-primary">analytics</span>
                      <span>Compare &amp; Inspect</span>
                    </button>

                    <button
                      onClick={() => handlePrepareInterview(job)}
                      className="px-3.5 py-1.5 rounded-xl bg-primary text-on-primary hover:bg-primary/90 text-body-sm font-semibold transition-colors flex items-center gap-1 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[16px]">mic</span>
                      <span>AI Interview</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-outline-variant/30 pt-space-lg">
            <span className="text-body-sm text-secondary">
              Page <strong className="text-on-surface">{page}</strong> of <strong className="text-on-surface">{totalPages}</strong>
            </span>

            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1 || loading}
                onClick={() => fetchJobs(page - 1)}
                className="px-3.5 py-1.5 rounded-xl border border-outline-variant/50 text-body-sm font-medium hover:bg-surface-container disabled:opacity-40 transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                <span>Previous</span>
              </button>
              <button
                disabled={page >= totalPages || loading}
                onClick={() => fetchJobs(page + 1)}
                className="px-3.5 py-1.5 rounded-xl border border-outline-variant/50 text-body-sm font-medium hover:bg-surface-container disabled:opacity-40 transition-colors flex items-center gap-1"
              >
                <span>Next</span>
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Deep Inspection & Resume Match Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-space-md animate-fade-in">
          <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-space-lg border-b border-outline-variant/30 bg-surface-container-low flex items-start justify-between gap-space-md">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary uppercase tracking-wide">
                    {selectedJob.employmentType}
                  </span>
                  {selectedJob.location?.isRemote && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-700">
                      Remote
                    </span>
                  )}
                  <span className="text-xs text-secondary">{selectedJob.postedAtDisplay}</span>
                </div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  {selectedJob.title}
                </h2>
                <p className="text-body-sm text-secondary font-medium">
                  {selectedJob.employer?.name} • {selectedJob.location?.displayLocation}
                </p>
              </div>

              <button
                onClick={() => setSelectedJob(null)}
                className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-secondary hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex items-center gap-space-xs px-space-lg pt-space-xs border-b border-outline-variant/30 bg-surface-container-low text-body-sm">
              <button
                onClick={() => setModalTab('skills')}
                className={`px-4 py-2.5 font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  modalTab === 'skills'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-secondary hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">verified_user</span>
                <span>Resume Match &amp; Skills</span>
              </button>
              <button
                onClick={() => setModalTab('description')}
                className={`px-4 py-2.5 font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  modalTab === 'description'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-secondary hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">description</span>
                <span>Job Description</span>
              </button>
              <button
                onClick={() => setModalTab('salary')}
                className={`px-4 py-2.5 font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  modalTab === 'salary'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-secondary hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">payments</span>
                <span>Compensation Intelligence</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-space-lg overflow-y-auto flex-1 space-y-space-md">
              {/* Tab 1: Resume Match & Skills Comparison */}
              {modalTab === 'skills' && (
                <div className="space-y-space-md">
                  {!user ? (
                    <div className="bg-surface-container-low border border-outline-variant/40 rounded-xl p-space-lg text-center space-y-space-sm">
                      <span className="material-symbols-outlined text-[32px] text-primary">lock</span>
                      <h4 className="font-semibold text-on-surface">Candidate Sign-In Required</h4>
                      <p className="text-body-sm text-secondary max-w-md mx-auto">
                        Sign in as a candidate to compare your saved resume against this role's competencies.
                      </p>
                      <button
                        onClick={() => {
                          setSelectedJob(null);
                          if (onOpenAuthModal) onOpenAuthModal('candidate');
                        }}
                        className="px-4 py-2 bg-primary text-on-primary rounded-xl font-medium text-body-sm hover:bg-primary/90 transition-colors"
                      >
                        Sign In / Register
                      </button>
                    </div>
                  ) : comparingSkills ? (
                    <div className="py-space-xl text-center space-y-space-sm">
                      <span className="material-symbols-outlined animate-spin text-[32px] text-primary">sync</span>
                      <p className="text-body-sm text-secondary">
                        Analyzing your saved resume against employer requirements...
                      </p>
                    </div>
                  ) : skillComparison && skillComparison.hasResume ? (
                    <div className="space-y-space-md">
                      {/* Match Score Banner */}
                      <div className="bg-surface-container-low border border-outline-variant/40 rounded-xl p-space-md flex flex-col sm:flex-row items-center justify-between gap-space-md">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-headline-md font-extrabold text-primary">
                              {skillComparison.matchScore}%
                            </span>
                            <div>
                              <div className="font-semibold text-on-surface text-body-md">Skill Alignment Score</div>
                              <div className="text-label-sm text-secondary">
                                Based on active resume v{skillComparison.resumeVersion} ({skillComparison.resumeFilename})
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Visual Progress Bar */}
                        <div className="w-full sm:w-48 bg-surface-container rounded-full h-3 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              skillComparison.matchScore >= 75
                                ? 'bg-emerald-500'
                                : skillComparison.matchScore >= 50
                                ? 'bg-primary'
                                : 'bg-amber-500'
                            }`}
                            style={{ width: `${skillComparison.matchScore}%` }}
                          />
                        </div>
                      </div>

                      {/* Matched Skills with Evidence */}
                      <div className="space-y-space-xs">
                        <h4 className="text-body-sm font-bold text-on-surface flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[18px] text-emerald-600">check_circle</span>
                          <span>Matched Skills with Resume Evidence ({skillComparison.matchedSkills?.length || 0})</span>
                        </h4>
                        <div className="space-y-2">
                          {skillComparison.matchedSkills?.map((m, idx) => (
                            <div
                              key={idx}
                              className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-emerald-800 dark:text-emerald-300 text-body-sm">
                                  {m.name}
                                </span>
                                {m.verifiedInInterview && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700">
                                    Verified in Past Interview ({m.interviewScore}/10)
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-on-surface-variant italic">
                                "{m.evidence}"
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Absent Skills (Not in resume) */}
                      {skillComparison.absentSkills?.length > 0 && (
                        <div className="space-y-space-xs">
                          <h4 className="text-body-sm font-bold text-on-surface flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[18px] text-amber-500">help</span>
                            <span>Skills Absent from Resume ({skillComparison.absentSkills.length})</span>
                          </h4>
                          <p className="text-xs text-secondary">
                            These skills are requested by the employer but not detected on your resume. (Absence does not imply lack of ability; practice them during the AI interview.)
                          </p>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {skillComparison.absentSkills.map((s, idx) => (
                              <span
                                key={idx}
                                className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-medium"
                              >
                                {typeof s === 'string' ? s : s.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Proven Lacking in Past Interviews */}
                      {skillComparison.interviewProvenLacking?.length > 0 && (
                        <div className="space-y-space-xs">
                          <h4 className="text-body-sm font-bold text-error flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[18px]">warning</span>
                            <span>Demonstrated Development Areas ({skillComparison.interviewProvenLacking.length})</span>
                          </h4>
                          <div className="space-y-1.5">
                            {skillComparison.interviewProvenLacking.map((g, idx) => (
                              <div
                                key={idx}
                                className="bg-error-container/20 border border-error/30 rounded-lg p-2.5 text-xs text-on-surface space-y-0.5"
                              >
                                <div className="font-semibold text-error">{g.name}</div>
                                <div className="text-secondary">{g.detail}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* No Saved Resume Prompt */
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-space-lg text-center space-y-space-sm">
                      <span className="material-symbols-outlined text-[32px] text-amber-600">contact_page</span>
                      <h4 className="font-semibold text-amber-900 dark:text-amber-200">No Resume Found in Profile</h4>
                      <p className="text-body-sm text-on-surface-variant max-w-md mx-auto">
                        Upload your PDF or Word resume once to automatically match competencies and prepare for job-specific AI interviews.
                      </p>
                      <button
                        onClick={() => {
                          setSelectedJob(null);
                          if (onNavigateProfile) onNavigateProfile();
                        }}
                        className="px-4 py-2 bg-amber-600 text-white rounded-xl font-medium text-body-sm hover:bg-amber-700 transition-colors shadow-sm"
                      >
                        Go to Profile &amp; Upload Resume
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Job Description */}
              {modalTab === 'description' && (
                <div className="space-y-space-md text-body-md text-on-surface">
                  <div className="whitespace-pre-line leading-relaxed text-body-sm bg-surface-container-low p-space-md rounded-xl border border-outline-variant/30">
                    {selectedJob.description}
                  </div>

                  {selectedJob.qualifications && selectedJob.qualifications.length > 0 && (
                    <div className="space-y-space-xs">
                      <h4 className="font-semibold text-on-surface text-body-sm">Key Qualifications</h4>
                      <ul className="list-disc pl-5 space-y-1 text-xs text-on-surface-variant">
                        {selectedJob.qualifications.map((q, idx) => (
                          <li key={idx}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedJob.responsibilities && selectedJob.responsibilities.length > 0 && (
                    <div className="space-y-space-xs">
                      <h4 className="font-semibold text-on-surface text-body-sm">Core Responsibilities</h4>
                      <ul className="list-disc pl-5 space-y-1 text-xs text-on-surface-variant">
                        {selectedJob.responsibilities.map((r, idx) => (
                          <li key={idx}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Compensation & Market Salary Intelligence */}
              {modalTab === 'salary' && (
                <div className="space-y-space-md">
                  <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-space-md space-y-space-sm">
                    <h4 className="font-semibold text-body-md text-on-surface flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[20px] text-primary">account_balance_wallet</span>
                      <span>Compensation Analysis</span>
                    </h4>

                    {selectedJob.salary?.hasSalary ? (
                      <div className="space-y-2">
                        <div className="p-3 rounded-lg bg-surface-container-lowest border border-outline-variant/40 flex items-center justify-between">
                          <div>
                            <span className="text-xs text-secondary font-medium block">
                              {selectedJob.salary.type === 'advertised' ? 'Employer Advertised Range' : 'Provider Estimated Range'}
                            </span>
                            <span className="text-headline-sm font-extrabold text-on-surface">
                              {selectedJob.salary.displaySalary}
                            </span>
                          </div>
                          <span
                            className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                              selectedJob.salary.type === 'advertised'
                                ? 'bg-emerald-500/10 text-emerald-700'
                                : 'bg-sky-500/10 text-sky-700'
                            }`}
                          >
                            {selectedJob.salary.type}
                          </span>
                        </div>
                        <div className="text-xs text-secondary flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">info</span>
                          <span>Source: {selectedJob.salary.source || selectedJob.source}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-center space-y-1">
                        <span className="material-symbols-outlined text-[24px] text-secondary">money_off</span>
                        <div className="font-semibold text-on-surface text-body-sm">Salary Not Disclosed by Employer</div>
                        <p className="text-xs text-secondary">
                          The hiring organization did not publish explicit compensation figures for this opening.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Market Benchmark Breakdown if available */}
                  {selectedJob.marketSalaryBenchmark?.hasEstimate && (
                    <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl p-space-md space-y-space-xs">
                      <span className="text-xs font-bold text-sky-700 uppercase tracking-wider block">
                        Market Benchmark Reference
                      </span>
                      <div className="text-title-lg font-bold text-on-surface">
                        {selectedJob.marketSalaryBenchmark.currency}{' '}
                        {Number(selectedJob.marketSalaryBenchmark.average || selectedJob.marketSalaryBenchmark.median).toLocaleString()}
                        <span className="text-xs text-secondary font-normal"> / year</span>
                      </div>
                      <div className="text-xs text-secondary">
                        Location: {selectedJob.marketSalaryBenchmark.location} • Sourced from {selectedJob.marketSalaryBenchmark.source}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Error Message */}
              {prepareError && (
                <div className="p-3 bg-error-container/20 border border-error/30 rounded-xl text-error text-xs flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  <span>{prepareError}</span>
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="p-space-lg border-t border-outline-variant/30 bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-sm">
              <a
                href={selectedJob.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-outline-variant/60 hover:bg-surface-container text-body-sm font-semibold text-on-surface transition-colors flex items-center justify-center gap-1.5"
              >
                <span>Apply on {selectedJob.employer?.name || 'Company Site'}</span>
                <span className="material-symbols-outlined text-[16px]">open_in_new</span>
              </a>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setSelectedJob(null)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl hover:bg-surface-container text-body-sm font-medium text-secondary transition-colors"
                >
                  Close
                </button>

                <button
                  type="button"
                  disabled={isPreparingInterview}
                  onClick={() => handlePrepareInterview(selectedJob)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-primary text-on-primary hover:bg-primary/90 text-body-sm font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {isPreparingInterview ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
                      <span>Preparing Interview...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">mic</span>
                      <span>Start Adaptive AI Interview</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default JobExplorerScreen;
