import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const Navbar = ({
  currentView,
  onNavigateHome,
  onNavigateExplorer,
  onNavigateDashboard,
  onNavigateProfile,
  onNavigateJobs,
  onNavigateInterview,
  onNavigateRecruiter,
  onNavigateReport,
  onOpenAuthModal,
  hasCompletedReport
}) => {
  const { user, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const getInitials = (name) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <header className="fixed top-0 left-0 w-full z-50 bg-surface-container-lowest border-b border-outline-variant/40 shadow-[0_1px_8px_rgba(0,0,0,0.03)]">
      <div className="h-16 w-full max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop flex items-center justify-between gap-space-md">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-space-lg">
          <button
            onClick={onNavigateHome}
            className="flex items-center gap-space-sm text-left group focus:outline-none"
          >
            <div className="w-9 h-9 rounded-lg bg-primary-container flex items-center justify-center text-on-primary shadow-sm group-hover:bg-primary transition-colors">
              <span className="material-symbols-outlined text-[20px]">psychology</span>
            </div>
            <div className="flex flex-col">
              <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight font-bold">
                Adaptive Interview Intel
              </span>
              <span className="font-label-sm text-label-sm text-secondary tracking-wider uppercase hidden sm:inline-block">
                Enterprise AI Platform
              </span>
            </div>
          </button>

          {/* Navigation Items */}
          <nav className="hidden xl:flex items-center gap-space-xs">
            <button
              onClick={onNavigateHome}
              className={`px-3 py-1.5 rounded-lg text-body-sm font-body-sm transition-colors ${
                currentView === 'HOME'
                  ? 'bg-secondary-container text-on-surface font-semibold'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              Home
            </button>
            <button
              onClick={onNavigateExplorer}
              className={`px-3 py-1.5 rounded-lg text-body-sm font-body-sm transition-colors flex items-center gap-1 ${
                currentView === 'JOB_EXPLORER'
                  ? 'bg-primary text-on-primary font-semibold shadow-sm'
                  : 'text-primary hover:bg-primary/10 font-semibold'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">travel_explore</span>
              <span>Job Explorer</span>
            </button>
            <button
              onClick={onNavigateJobs}
              className={`px-3 py-1.5 rounded-lg text-body-sm font-body-sm transition-colors ${
                currentView === 'SELECT_JOB'
                  ? 'bg-secondary-container text-on-surface font-semibold'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              Internal Jobs
            </button>
            <button
              onClick={onNavigateDashboard}
              className={`px-3 py-1.5 rounded-lg text-body-sm font-body-sm transition-colors ${
                currentView === 'CANDIDATE_PORTAL'
                  ? 'bg-secondary-container text-on-surface font-semibold'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              Candidate Portal
            </button>
            <button
              onClick={onNavigateProfile}
              className={`px-3 py-1.5 rounded-lg text-body-sm font-body-sm transition-colors ${
                currentView === 'PROFILE'
                  ? 'bg-secondary-container text-on-surface font-semibold'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              Resume &amp; Profile
            </button>
            <button
              onClick={onNavigateInterview}
              className={`px-3 py-1.5 rounded-lg text-body-sm font-body-sm transition-colors ${
                currentView === 'INTERVIEW'
                  ? 'bg-secondary-container text-on-surface font-semibold'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              Live Interview
            </button>
            <button
              onClick={onNavigateRecruiter}
              className={`px-3 py-1.5 rounded-lg text-body-sm font-body-sm transition-colors ${
                currentView === 'RECRUITER_PORTAL'
                  ? 'bg-secondary-container text-on-surface font-semibold'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              Recruiter Portal
            </button>
            <button
              onClick={onNavigateReport}
              disabled={!hasCompletedReport}
              className={`px-3 py-1.5 rounded-lg text-body-sm font-body-sm transition-colors ${
                currentView === 'REPORT'
                  ? 'bg-secondary-container text-on-surface font-semibold'
                  : hasCompletedReport
                  ? 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                  : 'text-secondary/40 cursor-not-allowed'
              }`}
            >
              Evaluation Report
            </button>
          </nav>
        </div>

        {/* Right Action Tools */}
        <div className="flex items-center gap-space-md">
          {/* User Controls */}
          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-space-sm pl-space-xs border-l border-outline-variant/50 focus:outline-none"
              >
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold text-label-sm shadow-sm">
                    {getInitials(user.displayName || user.email)}
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-primary-container ring-2 ring-surface-container-lowest"></span>
                </div>
                <div className="hidden lg:flex flex-col text-left">
                  <span className="font-body-sm text-body-sm font-semibold text-on-surface leading-tight max-w-[140px] truncate">
                    {user.displayName || user.email}
                  </span>
                  <span className="font-label-sm text-label-sm text-secondary leading-tight capitalize">
                    {user.role || 'Candidate'}
                  </span>
                </div>
                <span className="material-symbols-outlined text-[18px] text-secondary">
                  expand_more
                </span>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/30 py-2 z-50">
                  <div className="px-4 py-2 border-b border-outline-variant/20">
                    <p className="font-body-sm font-semibold text-on-surface truncate">
                      {user.displayName || user.email}
                    </p>
                    <p className="font-label-sm text-secondary truncate">{user.email}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] uppercase font-semibold bg-primary-fixed text-on-primary-fixed">
                      {user.role || 'candidate'}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      onNavigateExplorer();
                    }}
                    className="w-full text-left px-4 py-2 text-body-sm text-primary hover:bg-surface-container flex items-center gap-2 font-semibold"
                  >
                    <span className="material-symbols-outlined text-[16px] text-primary">travel_explore</span>
                    Job Explorer &amp; Salary Intel
                  </button>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      onNavigateProfile();
                    }}
                    className="w-full text-left px-4 py-2 text-body-sm text-on-surface hover:bg-surface-container flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[16px] text-secondary">description</span>
                    Resume &amp; Profile
                  </button>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      onNavigateDashboard();
                    }}
                    className="w-full text-left px-4 py-2 text-body-sm text-on-surface hover:bg-surface-container flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[16px] text-secondary">dashboard</span>
                    Candidate Portal
                  </button>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      onNavigateRecruiter();
                    }}
                    className="w-full text-left px-4 py-2 text-body-sm text-on-surface hover:bg-surface-container flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[16px] text-secondary">corporate_fare</span>
                    Recruiter Portal
                  </button>
                  <div className="border-t border-outline-variant/20 mt-1 pt-1">
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        logout();
                      }}
                      className="w-full text-left px-4 py-2 text-body-sm text-error hover:bg-error-container/30 flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[16px]">logout</span>
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenAuthModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-body-sm font-semibold shadow-sm transition-all text-sm"
            >
              <span className="material-symbols-outlined text-[18px]">lock_open</span>
              <span>Sign In / Register</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
