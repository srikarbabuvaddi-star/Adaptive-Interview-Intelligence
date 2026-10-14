import React, { useState, useEffect, useRef } from 'react';
import interviewApi from '../services/interviewApi';
import { useAuth } from '../context/AuthContext';

export const CandidateProfileScreen = ({
  onNavigateJobs,
  onNavigateDashboard,
  onOpenAuthModal
}) => {
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  const [resumeData, setResumeData] = useState(null);
  const [versionHistory, setVersionHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('skills'); // 'skills' | 'experience' | 'projects' | 'education' | 'versions'

  const fetchProfileAndResume = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [activeResume, versions] = await Promise.all([
        interviewApi.getMyResume(),
        interviewApi.getMyResumeVersions()
      ]);
      setResumeData(activeResume);
      setVersionHistory(Array.isArray(versions) ? versions : []);
    } catch (err) {
      console.warn('Error fetching resume profile:', err.message);
      setError(err.message || 'Failed to load resume profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileAndResume();
  }, [user]);

  const handleFileUpload = async (file) => {
    if (!file) return;

    // Validate size (5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setError(`File "${file.name}" exceeds the 5MB maximum size limit.`);
      return;
    }

    // Validate extension
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'docx', 'doc'].includes(ext)) {
      setError('Please upload a PDF (.pdf) or Word document (.docx).');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await interviewApi.uploadResume(file);
      setSuccessMessage(
        `Resume "${file.name}" uploaded successfully! Extracted v${result.currentVersion} profile.`
      );
      await fetchProfileAndResume();
    } catch (err) {
      setError(err.message || 'Resume upload and extraction failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDownload = async (version = null, filename = 'resume.pdf') => {
    setDownloading(true);
    try {
      const blob = await interviewApi.downloadMyResume(version);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Download failed: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleReprocess = async () => {
    setReprocessing(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const updated = await interviewApi.reprocessMyResume();
      setSuccessMessage('Resume re-extracted and profile updated successfully!');
      await fetchProfileAndResume();
    } catch (err) {
      setError(`Reprocessing failed: ${err.message}`);
    } finally {
      setReprocessing(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 KB';
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const profile = resumeData?.extractedProfile || user?.candidateProfile || {};
  const skillsList = Array.isArray(profile.skills) ? profile.skills : [];
  const techList = Array.isArray(profile.technologies) ? profile.technologies : [];
  const experienceList = Array.isArray(profile.workExperience) ? profile.workExperience : [];
  const projectsList = Array.isArray(profile.projects) ? profile.projects : [];
  const educationList = Array.isArray(profile.education) ? profile.education : [];

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary-container text-on-primary flex items-center justify-center mx-auto mb-6 shadow-md">
          <span className="material-symbols-outlined text-[32px]">lock</span>
        </div>
        <h2 className="text-2xl font-bold text-on-surface mb-2">Candidate Authentication Required</h2>
        <p className="text-secondary max-w-md mx-auto mb-6">
          Please log in or register as a candidate to manage your persistent resume profile and unlock adaptive AI interview preparation.
        </p>
        <button
          onClick={() => onOpenAuthModal && onOpenAuthModal('candidate')}
          className="px-6 py-2.5 bg-primary text-on-primary rounded-xl font-semibold hover:bg-primary/90 transition-all shadow-sm"
        >
          Sign In / Create Account
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop py-space-xl flex flex-col gap-space-xl">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md border-b border-outline-variant/30 pb-space-lg">
        <div>
          <div className="flex items-center gap-space-xs text-label-sm text-secondary uppercase tracking-wider mb-1">
            <span>Verified Candidate Credentials</span>
            <span>•</span>
            <span className="text-primary font-semibold">Resume-Once Intelligence</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-on-surface flex items-center gap-3">
            <span>Candidate Profile &amp; Resume</span>
            {resumeData && (
              <span className="text-xs px-2.5 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full font-semibold">
                Version {resumeData.currentVersion || 1}.0 Active
              </span>
            )}
          </h1>
          <p className="text-secondary text-sm mt-1 max-w-2xl">
            Upload your resume once. Our AI extracts your core proficiencies and automatically links them whenever you apply for a job or start an adaptive interview.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onNavigateDashboard}
            className="px-4 py-2 border border-outline-variant rounded-xl text-sm font-semibold text-on-surface hover:bg-surface-container transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">dashboard</span>
            <span>Candidate Portal</span>
          </button>
          <button
            onClick={onNavigateJobs}
            className="px-5 py-2 bg-primary text-on-primary rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all shadow-sm flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">work</span>
            <span>Browse Job Roles</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-error-container/20 border border-error/30 rounded-xl text-on-error-container text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-error">error</span>
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-xs font-semibold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-primary-container/20 border border-primary/30 rounded-xl text-on-primary-container text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">check_circle</span>
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-xs font-semibold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Top Banner: Active Resume Card + Drag & Drop Upload Zone */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        {/* Left: Active Resume Card / Empty State */}
        <div className="lg:col-span-7 flex flex-col gap-space-md">
          {resumeData ? (
            <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-2xl p-space-lg shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-xs">
                      <span className="material-symbols-outlined text-[28px]">
                        {resumeData.filename?.endsWith('.docx') ? 'description' : 'picture_as_pdf'}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-on-surface text-lg">
                          {resumeData.originalName || resumeData.filename}
                        </h3>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          v{resumeData.currentVersion || 1}
                        </span>
                      </div>
                      <p className="text-xs text-secondary mt-0.5">
                        {formatFileSize(resumeData.fileSize)} • Uploaded{' '}
                        {new Date(resumeData.updatedAt || resumeData.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Extracted &amp; Verified
                  </span>
                </div>

                {/* Candidate Headline & Summary snippet */}
                <div className="bg-surface-container/40 rounded-xl p-3.5 mb-4 border border-outline-variant/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-on-surface uppercase tracking-wider">
                      {profile.headline || 'Technical Profile'}
                    </span>
                    <span className="text-xs font-semibold text-primary">
                      {profile.experienceYears ? `${profile.experienceYears} Years Exp` : 'Exp inferred from resume'}
                    </span>
                  </div>
                  <p className="text-xs text-secondary line-clamp-2">
                    {profile.summary || 'Resume indexed. Ready for instant adaptive evaluations.'}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-outline-variant/20">
                <button
                  onClick={() => handleDownload(null, resumeData.originalName || resumeData.filename)}
                  disabled={downloading}
                  className="px-4 py-2 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  <span>{downloading ? 'Downloading...' : 'Download File'}</span>
                </button>

                <button
                  onClick={handleReprocess}
                  disabled={reprocessing}
                  className="px-3.5 py-2 border border-outline-variant text-secondary hover:text-on-surface rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                >
                  <span className={`material-symbols-outlined text-[16px] ${reprocessing ? 'animate-spin' : ''}`}>
                    sync
                  </span>
                  <span>{reprocessing ? 'Reprocessing...' : 'Re-extract Profile'}</span>
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="ml-auto px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">upload_file</span>
                  <span>Replace Resume</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-surface-container-lowest border border-dashed border-outline-variant rounded-2xl p-space-xl shadow-sm text-center flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-[32px]">upload_file</span>
              </div>
              <h3 className="text-lg font-bold text-on-surface mb-1">No Resume Uploaded Yet</h3>
              <p className="text-xs text-secondary max-w-sm mb-5">
                Upload your resume in PDF or DOCX format to activate your adaptive interview candidate profile and unlock one-click applications.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all shadow-sm flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                <span>Select Resume File</span>
              </button>
            </div>
          )}

          {/* Reassurance Callout */}
          <div className="px-4 py-3 bg-surface-container-low rounded-xl border border-outline-variant/30 flex items-start gap-3">
            <span className="material-symbols-outlined text-primary text-[20px] mt-0.5">verified_user</span>
            <div className="text-xs text-secondary">
              <span className="font-semibold text-on-surface">Historical Immutability Guarantee: </span>
              Updating or replacing your resume increments your version for upcoming interviews. Historical completed interviews and evaluation reports remain immutable and linked to their original snapshot.
            </div>
          </div>
        </div>

        {/* Right: Upload / Replace Dropzone */}
        <div className="lg:col-span-5 flex flex-col">
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`flex-1 border-2 border-dashed rounded-2xl p-space-lg flex flex-col items-center justify-center text-center transition-all min-h-[220px] ${
              dragActive
                ? 'border-primary bg-primary/5 scale-[1.01]'
                : 'border-outline-variant/60 bg-surface-container-lowest hover:border-outline-variant'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
              className="hidden"
            />

            <div className="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center text-secondary mb-3 shadow-xs">
              <span className="material-symbols-outlined text-[26px]">
                {uploading ? 'hourglass_top' : 'cloud_upload'}
              </span>
            </div>

            <h4 className="font-bold text-on-surface text-sm mb-1">
              {uploading
                ? 'Extracting & Parsing Resume Profile...'
                : resumeData
                ? 'Drop New Resume Version'
                : 'Upload Your Resume'}
            </h4>
            <p className="text-xs text-secondary max-w-xs mb-4">
              Drag &amp; drop your PDF or Word document here, or click to browse. Max file size: 5MB.
            </p>

            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 border border-outline-variant bg-surface-container-low hover:bg-surface-container text-on-surface rounded-xl text-xs font-semibold transition-all flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">folder_open</span>
                  <span>{resumeData ? 'Choose Replacement File' : 'Browse Files'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Navigation for Extracted Data & History */}
      <div className="border-b border-outline-variant/30 flex items-center gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('skills')}
          className={`px-4 py-2.5 text-sm font-semibold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'skills'
              ? 'border-primary text-primary'
              : 'border-transparent text-secondary hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">psychology</span>
          <span>Skills &amp; Technologies ({skillsList.length + techList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('experience')}
          className={`px-4 py-2.5 text-sm font-semibold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'experience'
              ? 'border-primary text-primary'
              : 'border-transparent text-secondary hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">business_center</span>
          <span>Work History ({experienceList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('projects')}
          className={`px-4 py-2.5 text-sm font-semibold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'projects'
              ? 'border-primary text-primary'
              : 'border-transparent text-secondary hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">code</span>
          <span>Projects ({projectsList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('education')}
          className={`px-4 py-2.5 text-sm font-semibold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'education'
              ? 'border-primary text-primary'
              : 'border-transparent text-secondary hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">school</span>
          <span>Education ({educationList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('versions')}
          className={`px-4 py-2.5 text-sm font-semibold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'versions'
              ? 'border-primary text-primary'
              : 'border-transparent text-secondary hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">history</span>
          <span>Version History ({versionHistory.length})</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-space-lg shadow-sm min-h-[300px]">
        {/* Tab 1: Skills & Technologies */}
        {activeTab === 'skills' && (
          <div className="flex flex-col gap-space-lg">
            <div>
              <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider mb-3 flex items-center gap-2">
                <span>Extracted Core Competencies</span>
                <span className="text-xs font-normal text-secondary">
                  (Evaluated against role requirements)
                </span>
              </h3>
              {skillsList.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {skillsList.map((skill, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/20 text-on-surface rounded-xl text-xs font-semibold"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                      <span>{typeof skill === 'object' ? skill.name : skill}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-secondary italic">
                  No explicit skills extracted yet. Upload a detailed resume to extract proficiencies.
                </p>
              )}
            </div>

            {techList.length > 0 && (
              <div className="pt-space-md border-t border-outline-variant/20">
                <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider mb-3">
                  Technologies, Frameworks &amp; Tools
                </h3>
                <div className="flex flex-wrap gap-2">
                  {techList.map((tech, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 bg-surface-container text-secondary text-xs rounded-lg font-medium border border-outline-variant/30"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Work Experience */}
        {activeTab === 'experience' && (
          <div>
            {experienceList.length > 0 ? (
              <div className="flex flex-col gap-4">
                {experienceList.map((exp, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/20 flex flex-col gap-1.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <h4 className="font-bold text-on-surface text-sm">
                        {exp.title || exp.role || 'Software Role'}
                      </h4>
                      <span className="text-xs text-secondary font-medium">
                        {exp.duration || exp.years || ''}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-primary">
                      {exp.company || exp.organization || 'Organization'}
                    </p>
                    {exp.description && (
                      <p className="text-xs text-secondary mt-1 whitespace-pre-line leading-relaxed">
                        {exp.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-secondary text-xs">
                No formal work experience entries extracted from this document.
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Projects */}
        {activeTab === 'projects' && (
          <div>
            {projectsList.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {projectsList.map((proj, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/20 flex flex-col justify-between"
                  >
                    <div>
                      <h4 className="font-bold text-on-surface text-sm mb-1">
                        {proj.name || proj.title || `Project ${idx + 1}`}
                      </h4>
                      <p className="text-xs text-secondary mb-3 leading-relaxed">
                        {proj.description || 'Architecture and implementation project.'}
                      </p>
                    </div>
                    {proj.technologies && proj.technologies.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-outline-variant/20">
                        {proj.technologies.map((t, tidx) => (
                          <span
                            key={tidx}
                            className="px-2 py-0.5 bg-surface-container text-[11px] text-secondary rounded font-medium"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-secondary text-xs">
                No distinct project entries extracted.
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Education */}
        {activeTab === 'education' && (
          <div>
            {educationList.length > 0 ? (
              <div className="flex flex-col gap-3">
                {educationList.map((edu, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/20 flex items-center justify-between"
                  >
                    <div>
                      <h4 className="font-bold text-on-surface text-sm">
                        {edu.degree || edu.field || 'Degree / Field'}
                      </h4>
                      <p className="text-xs text-secondary mt-0.5">
                        {edu.institution || edu.school || 'University'}
                      </p>
                    </div>
                    {edu.year && (
                      <span className="text-xs text-secondary font-medium px-2 py-1 bg-surface-container rounded-lg">
                        {edu.year}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-secondary text-xs">
                No education history extracted from this document.
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Version History */}
        {activeTab === 'versions' && (
          <div>
            {versionHistory.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-container border-b border-outline-variant/30 text-secondary uppercase font-semibold">
                    <tr>
                      <th className="py-2.5 px-4">Version</th>
                      <th className="py-2.5 px-4">Filename</th>
                      <th className="py-2.5 px-4">Size</th>
                      <th className="py-2.5 px-4">Uploaded Date</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {versionHistory.map((ver) => {
                      const isActive = ver.version === (resumeData?.currentVersion || 1);
                      return (
                        <tr key={ver.id || ver.version} className="hover:bg-surface-container-low transition-colors">
                          <td className="py-3 px-4 font-bold text-on-surface flex items-center gap-1.5">
                            <span>v{ver.version}</span>
                            {isActive && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 bg-primary/10 text-primary rounded">
                                ACTIVE
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-on-surface">{ver.originalName || ver.filename}</td>
                          <td className="py-3 px-4 text-secondary">{formatFileSize(ver.fileSize)}</td>
                          <td className="py-3 px-4 text-secondary">
                            {ver.createdAt
                              ? new Date(ver.createdAt).toLocaleString()
                              : 'Recent'}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                              {ver.status || 'parsed'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => handleDownload(ver.version, ver.originalName || ver.filename)}
                              className="px-2.5 py-1 text-primary hover:bg-primary/10 rounded font-semibold text-xs transition-colors"
                            >
                              Download
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-secondary text-xs">
                No version history recorded yet.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CandidateProfileScreen;
