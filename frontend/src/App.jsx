import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import HomeScreen from './components/HomeScreen';
import CandidateDashboard from './components/CandidateDashboard';
import CandidateProfileScreen from './components/CandidateProfileScreen';
import JobExplorerScreen from './components/JobExplorerScreen';
import JobSelector from './components/JobSelector';
import VoiceInterviewScreen from './components/VoiceInterviewScreen';
import FinalReportScreen from './components/FinalReportScreen';
import RecruiterDashboard from './components/RecruiterDashboard';
import AuthModal from './components/AuthModal';

const MainApp = () => {
  const { user } = useAuth();
  // Views: 'HOME' | 'CANDIDATE_PORTAL' | 'PROFILE' | 'JOB_EXPLORER' | 'SELECT_JOB' | 'INTERVIEW' | 'RECRUITER_PORTAL' | 'REPORT'
  const [view, setView] = useState('HOME');
  const [selectedJob, setSelectedJob] = useState(null);
  const [activeInterview, setActiveInterview] = useState(null);
  const [completedInterviewId, setCompletedInterviewId] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalInitialRole, setAuthModalInitialRole] = useState('candidate');

  const handleStartInterviewSession = (interview, jobData) => {
    setActiveInterview(interview);
    setSelectedJob(
      jobData || {
        id: interview.jobId,
        title: interview.jobTitle,
        maxQuestions: interview.totalQuestions
      }
    );
    setView('INTERVIEW');
  };

  const handleSelectJob = (job) => {
    setSelectedJob(job);
    setActiveInterview(null);
    setView('INTERVIEW');
  };

  const handleSelectInterview = (interview) => {
    if (interview.status === 'completed') {
      setCompletedInterviewId(interview.id);
      setView('REPORT');
    } else {
      setSelectedJob({
        id: interview.jobId,
        title: interview.jobTitle,
        maxQuestions: interview.totalQuestions
      });
      setActiveInterview(interview);
      setView('INTERVIEW');
    }
  };

  const handleInterviewComplete = (interviewId) => {
    setCompletedInterviewId(interviewId);
    setView('REPORT');
  };

  const handleResetToDashboard = () => {
    setView('CANDIDATE_PORTAL');
    setSelectedJob(null);
    setActiveInterview(null);
  };

  const handleRetakeInterview = () => {
    setActiveInterview(null);
    setView('INTERVIEW');
  };

  const handleOpenAuthForRole = (role = 'candidate') => {
    setAuthModalInitialRole(role);
    setAuthModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-surface-container-lowest flex flex-col font-body-md text-on-surface antialiased">
      {/* Top Navbar */}
      <Navbar
        currentView={view}
        onNavigateHome={() => setView('HOME')}
        onNavigateExplorer={() => setView('JOB_EXPLORER')}
        onNavigateDashboard={() => setView('CANDIDATE_PORTAL')}
        onNavigateProfile={() => setView('PROFILE')}
        onNavigateJobs={() => setView('SELECT_JOB')}
        onNavigateInterview={() => setView('INTERVIEW')}
        onNavigateRecruiter={() => setView('RECRUITER_PORTAL')}
        onNavigateReport={() => setView('REPORT')}
        onOpenAuthModal={() => handleOpenAuthForRole('candidate')}
        hasCompletedReport={Boolean(completedInterviewId)}
      />

      {/* Main Content Area (padding-top 4rem for fixed navbar) */}
      <main className="w-full pt-16 flex-1 flex flex-col">
        {view === 'HOME' && (
          <HomeScreen
            onStartInterview={() => setView('INTERVIEW')}
            onNavigateExplorer={() => setView('JOB_EXPLORER')}
            onExploreRecruiter={() => setView('RECRUITER_PORTAL')}
            onCandidateSetup={() => setView('PROFILE')}
            onSelectRole={(roleTitle) => {
              setSelectedJob({
                title: roleTitle,
                maxQuestions: 5
              });
              setActiveInterview(null);
              setView('INTERVIEW');
            }}
            onOpenReport={() => setView('REPORT')}
          />
        )}

        {view === 'CANDIDATE_PORTAL' && (
          <CandidateDashboard
            onStartInterview={handleStartInterviewSession}
            onViewReport={(interviewId) => {
              setCompletedInterviewId(interviewId);
              setView('REPORT');
            }}
            onBrowseJobs={() => setView('JOB_EXPLORER')}
            onNavigateProfile={() => setView('PROFILE')}
            onOpenAuthModal={handleOpenAuthForRole}
          />
        )}

        {view === 'JOB_EXPLORER' && (
          <JobExplorerScreen
            onStartInterview={handleStartInterviewSession}
            onNavigateProfile={() => setView('PROFILE')}
            onOpenAuthModal={handleOpenAuthForRole}
          />
        )}

        {view === 'PROFILE' && (
          <CandidateProfileScreen
            onNavigateJobs={() => setView('JOB_EXPLORER')}
            onNavigateDashboard={() => setView('CANDIDATE_PORTAL')}
            onOpenAuthModal={handleOpenAuthForRole}
          />
        )}

        {view === 'SELECT_JOB' && (
          <JobSelector
            onSelectJob={handleSelectJob}
            onSelectInterview={handleSelectInterview}
            onOpenAuthModal={handleOpenAuthForRole}
            onNavigateProfile={() => setView('PROFILE')}
          />
        )}

        {view === 'INTERVIEW' && (
          <VoiceInterviewScreen
            job={selectedJob}
            initialInterview={activeInterview}
            onComplete={handleInterviewComplete}
            onExit={handleResetToDashboard}
            onNavigateProfile={() => setView('PROFILE')}
            onOpenAuthModal={handleOpenAuthForRole}
          />
        )}

        {view === 'RECRUITER_PORTAL' && (
          <RecruiterDashboard
            onViewReport={(interviewId) => {
              setCompletedInterviewId(interviewId);
              setView('REPORT');
            }}
            onBrowseJobs={() => setView('SELECT_JOB')}
            onPostJob={() => setView('SELECT_JOB')}
            onOpenAuthModal={handleOpenAuthForRole}
          />
        )}

        {view === 'REPORT' && (
          <FinalReportScreen
            interviewId={completedInterviewId}
            onRetake={handleRetakeInterview}
            onBackToJobs={handleResetToDashboard}
          />
        )}
      </main>

      {/* Global Stitch Styled Footer */}
      <footer className="w-full bg-surface-container-low border-t border-outline-variant/30 py-space-lg">
        <div className="max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop flex flex-col sm:flex-row items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-sm">
            <span className="font-label-md text-label-md text-secondary">
              © 2025 Adaptive Interview Intel. Enterprise Assessment Rubrics &amp; Candidate Telemetry.
            </span>
          </div>
          <div className="flex items-center gap-space-lg">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
              Institutional Evaluation Engine
            </span>
            <span className="font-label-sm text-label-sm text-primary font-semibold">
              Calibration Mode Active
            </span>
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialRole={authModalInitialRole}
      />
    </div>
  );
};

export const App = () => {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
};

export default App;
