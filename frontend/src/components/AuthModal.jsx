import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const AuthModal = ({ isOpen, onClose, initialRole = 'candidate', initialMode = 'signin' }) => {
  const { login, signup, loading, error: authError } = useAuth();
  const [role, setRole] = useState(initialRole);
  const [mode, setMode] = useState(initialMode); // 'signin' | 'register'
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'signin') {
        await login({ email, password });
      } else {
        await signup({
          email,
          password,
          displayName: displayName.trim() || email.split('@')[0],
          role
        });
      }
      onClose();
    } catch (err) {
      setLocalError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-surface/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-xl bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/40 overflow-hidden my-auto max-h-[90vh] overflow-y-auto">
        <div className="h-1.5 w-full bg-gradient-to-r from-primary to-primary-container"></div>
        
        <div className="p-space-lg md:p-space-xl flex flex-col gap-space-lg">
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/30">
            <div className="flex items-center gap-space-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"></span>
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary font-bold">
                Adaptive Authentication Gateway
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-secondary hover:text-on-surface hover:bg-surface-container transition-colors"
              aria-label="Close dialog"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Role Tabs */}
          <div className="grid grid-cols-2 p-1 bg-surface-container rounded-lg">
            <button
              type="button"
              onClick={() => setRole('candidate')}
              className={`py-2 px-3 rounded-md font-headline-sm text-body-sm font-semibold transition-all flex items-center justify-center gap-space-xs ${
                role === 'candidate'
                  ? 'bg-surface-container-lowest text-primary shadow-sm'
                  : 'text-secondary hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">badge</span>
              Candidate Portal
            </button>
            <button
              type="button"
              onClick={() => setRole('recruiter')}
              className={`py-2 px-3 rounded-md font-headline-sm text-body-sm font-semibold transition-all flex items-center justify-center gap-space-xs ${
                role === 'recruiter'
                  ? 'bg-surface-container-lowest text-primary shadow-sm'
                  : 'text-secondary hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">corporate_fare</span>
              Recruiter & Panellist
            </button>
          </div>

          {/* Mode Switch & Title */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <h2 className="font-headline-md text-headline-md text-on-surface tracking-tight font-bold">
                {mode === 'signin'
                  ? role === 'candidate' ? 'Candidate Sign In' : 'Recruiter Sign In'
                  : role === 'candidate' ? 'Create Candidate Account' : 'Provision Recruiter Seat'}
              </h2>
              <span className="font-label-md text-label-md text-secondary mt-0.5">
                {role === 'candidate'
                  ? 'Assessment rubrics, code telemetry & interview schedule'
                  : 'Enterprise hiring dashboard & rubric calibrator'}
              </span>
            </div>
            <div className="inline-flex p-0.5 bg-surface-container-low rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => setMode('signin')}
                className={`px-3 py-1 rounded-md font-label-md text-label-md font-semibold transition-all ${
                  mode === 'signin'
                    ? 'bg-surface-container-lowest text-primary shadow-sm'
                    : 'text-secondary hover:text-on-surface'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className={`px-3 py-1 rounded-md font-label-md text-label-md font-semibold transition-all ${
                  mode === 'register'
                    ? 'bg-surface-container-lowest text-primary shadow-sm'
                    : 'text-secondary hover:text-on-surface'
                }`}
              >
                Register
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {(localError || authError) && (
            <div className="p-3 rounded-lg bg-error-container/40 border border-error/30 text-error flex items-start gap-2">
              <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
              <span className="text-body-sm font-medium">{localError || authError}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-space-md w-full">
            {mode === 'register' && (
              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-label-md text-on-surface font-medium" htmlFor="auth-name">
                  Legal Full Name
                </label>
                <input
                  id="auth-name"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={role === 'candidate' ? 'e.g. Alex Morgan' : 'e.g. Sarah Jenkins'}
                  className="w-full h-10 px-3 text-body-md font-body-md text-on-surface placeholder:text-outline rounded-lg bg-surface-container-low border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="font-label-md text-label-md text-on-surface font-medium" htmlFor="auth-email">
                {role === 'candidate' ? 'Candidate Email Address' : 'Enterprise Panellist Email'}
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={role === 'candidate' ? 'candidate@example.com' : 'recruiter@enterprise.com'}
                className="w-full h-10 px-3 text-body-md font-body-md text-on-surface placeholder:text-outline rounded-lg bg-surface-container-low border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-label-md text-label-md text-on-surface font-medium" htmlFor="auth-password">
                Password
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full h-10 px-3 pr-10 text-body-md font-body-md text-on-surface placeholder:text-outline rounded-lg bg-surface-container-low border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-secondary hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || loading}
              className="w-full h-11 mt-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-headline-sm text-body-sm font-semibold transition-all flex items-center justify-center gap-space-sm shadow-sm active:scale-[0.99] disabled:opacity-60"
            >
              {isSubmitting || loading ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>
                    {mode === 'signin'
                      ? role === 'candidate' ? 'Sign In as Candidate' : 'Sign In as Panellist'
                      : role === 'candidate' ? 'Create Candidate Account' : 'Provision Panellist Seat'}
                  </span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          {/* Security accreditation footer */}
          <div className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/30 flex items-center justify-between text-label-sm text-secondary">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-primary">verified_user</span>
              End-to-end encrypted session stream
            </span>
            <span className="font-mono text-[10px] uppercase">SOC2 & EEOC</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
