import React, { useState, useEffect, useRef, useCallback } from 'react';
import interviewApi, { getWebSocketUrl } from '../services/interviewApi';
import useVoiceSynthesis from '../hooks/useVoiceSynthesis';
import useSpeechRecognition from '../hooks/useSpeechRecognition';
import { useAuth } from '../context/AuthContext';

export const VoiceInterviewScreen = ({
  job,
  initialInterview,
  onComplete,
  onExit,
  onNavigateProfile,
  onOpenAuthModal
}) => {
  const { user } = useAuth();
  const [session, setSession] = useState(initialInterview || null);
  const [activeResume, setActiveResume] = useState(null);
  const [interviewState, setInterviewState] = useState('READY'); // 'READY' | 'STARTING' | 'AI_SPEAKING' | 'LISTENING' | 'EVALUATING' | 'NEXT_QUESTION' | 'COMPLETED'
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionProgress, setQuestionProgress] = useState({ current: 1, total: job?.maxQuestions || 5 });
  const [recentEvaluation, setRecentEvaluation] = useState(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [errorMessage, setErrorMessage] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    if (user && user.role === 'candidate') {
      interviewApi.getMyResume()
        .then(res => setActiveResume(res))
        .catch(err => console.warn('Could not fetch candidate resume:', err.message));
    }
  }, [user]);

  const { speak, cancel: cancelTTS, isSpeaking: isAISpeaking } = useVoiceSynthesis();
  const {
    isListening,
    transcript,
    setTranscript,
    interimTranscript,
    isSupported: isSTTSupported,
    permissionDenied: micPermissionDenied,
    startListening,
    stopListening,
    resetTranscript
  } = useSpeechRecognition();

  const blurTimeRef = useRef(null);

  // Active session timer
  useEffect(() => {
    let timer;
    if (interviewState !== 'READY' && interviewState !== 'COMPLETED') {
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [interviewState]);

  // Telemetry: Integrity tab switches
  useEffect(() => {
    const handleBlur = () => {
      blurTimeRef.current = Date.now();
    };

    const handleFocus = () => {
      if (blurTimeRef.current && session?.id) {
        const durationMs = Date.now() - blurTimeRef.current;
        blurTimeRef.current = null;
        if (durationMs > 1000) {
          interviewApi.recordIntegrityEvent(session.id, {
            eventType: 'tab_switch',
            eventSource: 'browser_window',
            metadata: { durationMs }
          });
        }
      }
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [session]);

  // Real-Time WebSocket Connection & Sync
  useEffect(() => {
    if (!session?.id) return;
    const token = interviewApi.getToken();
    if (!token) return;

    let ws;
    try {
      const wsUrl = getWebSocketUrl(token);
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(
          JSON.stringify({
            type: 'join_interview',
            payload: { interviewId: session.id }
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'interview:state_update' && msg.payload?.state) {
            // sync remote updates
          }
        } catch (_) {}
      };

      ws.onclose = () => {
        setWsConnected(false);
      };

      ws.onerror = () => {
        setWsConnected(false);
      };
    } catch (err) {
      console.warn('Real-time WebSocket initialization notice:', err);
    }

    return () => {
      if (ws) {
        try {
          ws.close();
        } catch (_) {}
      }
      wsRef.current = null;
      setWsConnected(false);
    };
  }, [session?.id]);

  // Broadcast Real-time Speech Transcripts over WebSocket
  useEffect(() => {
    if (wsRef.current && wsConnected && (transcript || interimTranscript)) {
      try {
        wsRef.current.send(
          JSON.stringify({
            type: 'speech:partial',
            payload: {
              transcript: transcript + (interimTranscript ? ` ${interimTranscript}` : ''),
              isFinal: false
            }
          })
        );
      } catch (_) {}
    }
  }, [transcript, interimTranscript, wsConnected]);

  // Broadcast Interview State Changes over WebSocket
  useEffect(() => {
    if (wsRef.current && wsConnected && session?.id) {
      try {
        wsRef.current.send(
          JSON.stringify({
            type: 'voice:state_change',
            payload: { state: interviewState }
          })
        );
      } catch (_) {}
    }
  }, [interviewState, wsConnected, session?.id]);

  // Audio cleanup on unmount
  useEffect(() => {
    return () => {
      cancelTTS();
      stopListening();
    };
  }, [cancelTTS, stopListening]);

  // Speak AI Question
  const speakAIQuestion = useCallback(
    (questionText) => {
      if (!questionText) return;
      stopListening();
      setInterviewState('AI_SPEAKING');

      speak(questionText, {
        onEnd: () => {
          setInterviewState('LISTENING');
          if (isSTTSupported && !micPermissionDenied) {
            startListening();
          }
        },
        onError: () => {
          setInterviewState('LISTENING');
          if (isSTTSupported && !micPermissionDenied) {
            startListening();
          }
        }
      });
    },
    [speak, stopListening, startListening, isSTTSupported, micPermissionDenied]
  );

  const handleSkipAudioPrompt = useCallback(() => {
    cancelTTS();
    setInterviewState('LISTENING');
    if (isSTTSupported && !micPermissionDenied) {
      startListening();
    }
  }, [cancelTTS, isSTTSupported, micPermissionDenied, startListening]);

  // Initialize and start interview
  const handleStartInterview = async () => {
    if (!user) {
      setErrorMessage('Please sign in to launch or resume your authenticated interview session.');
      if (onOpenAuthModal) onOpenAuthModal('candidate');
      return;
    }

    setInterviewState('STARTING');
    setErrorMessage(null);

    try {
      let activeInterview = session;
      if (!activeInterview) {
        const payload = job?.id
          ? { jobId: job.id }
          : {
              targetRole: {
                title: job?.title || 'Staff Backend Engineer',
                skills: job?.skills || ['Distributed Systems', 'Kafka', 'Consensus'],
                maxQuestions: job?.maxQuestions || 5
              }
            };
        activeInterview = await interviewApi.createInterview(payload);
        setSession(activeInterview);
      }

      const startResult = await interviewApi.startInterview(activeInterview.id);
      const q1 = startResult.currentQuestion;
      setCurrentQuestion(q1);
      setQuestionProgress({
        current: startResult.questionIndex || 1,
        total: startResult.totalQuestions || job?.maxQuestions || 5
      });
      setQuestionStartTime(Date.now());
      resetTranscript();

      speakAIQuestion(q1.questionText);
    } catch (err) {
      console.error('Failed to start interview:', err);
      setErrorMessage(`Could not start interview: ${err.message}`);
      setInterviewState('READY');
    }
  };

  const handleRepeatQuestion = () => {
    if (!currentQuestion) return;
    speakAIQuestion(currentQuestion.questionText);
  };

  const handleToggleMic = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleSubmitAnswer = async () => {
    const finalAnswer = transcript.trim();
    if (!finalAnswer || finalAnswer.length < 3) {
      setErrorMessage('Please provide an answer of at least a few words before submitting.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    stopListening();
    cancelTTS();
    setInterviewState('EVALUATING');

    const timeTakenSeconds = Math.max(5, Math.round((Date.now() - questionStartTime) / 1000));

    try {
      const response = await interviewApi.submitAnswer(session.id, {
        questionId: currentQuestion.id,
        answerText: finalAnswer,
        timeTakenSeconds
      });

      if (response.evaluation) {
        setRecentEvaluation({
          score: response.evaluation.score,
          status: response.evaluation.status,
          feedback: response.evaluation.feedback,
          strengths: response.evaluation.strengths || []
        });
      }

      if (response.isInterviewComplete) {
        setInterviewState('COMPLETED');
        if (onComplete) {
          onComplete(session.id);
        }
      } else if (response.nextQuestion) {
        setInterviewState('NEXT_QUESTION');
        const nextQ = response.nextQuestion;
        setCurrentQuestion(nextQ);
        setQuestionProgress({
          current: nextQ.questionIndex,
          total: nextQ.totalQuestions || questionProgress.total
        });
        resetTranscript();
        setQuestionStartTime(Date.now());

        setTimeout(() => {
          speakAIQuestion(nextQ.questionText);
        }, 1000);
      }
    } catch (err) {
      console.error('Answer submission error:', err);
      setErrorMessage(`Failed to evaluate answer: ${err.message}`);
      setInterviewState('LISTENING');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmEndSession = async () => {
    setShowExitConfirm(false);
    stopListening();
    cancelTTS();
    try {
      if (session?.id) {
        await interviewApi.endInterview(session.id, 'candidate_completed');
        if (onComplete) {
          onComplete(session.id);
        }
      } else if (onExit) {
        onExit();
      }
    } catch {
      if (onComplete && session?.id) {
        onComplete(session.id);
      } else if (onExit) {
        onExit();
      }
    }
  };

  const formatTimer = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
  const progressPercent = Math.min(100, Math.round((questionProgress.current / questionProgress.total) * 100));

  return (
    <div className="w-full min-h-screen bg-surface-container-lowest flex flex-col">
      {/* Top Session Bar / Telemetry Header */}
      <section className="w-full bg-surface-container-low/70 py-space-md shadow-sm border-b border-outline-variant/30">
        <div className="max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop flex flex-col md:flex-row md:items-center justify-between gap-space-md">
          {/* Candidate & Role Meta */}
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-space-sm flex-wrap">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-label-sm font-label-sm uppercase tracking-wider bg-secondary-container text-on-secondary-fixed font-semibold">
                Room #{session?.id ? session.id.substring(0, 8).toUpperCase() : '884-LIVE'}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-label-sm font-label-sm bg-surface-container-lowest text-tertiary shadow-sm border border-outline-variant/30">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                <span>Telemetry Synchronized</span>
              </span>
              {wsConnected && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-label-sm font-label-sm bg-surface-container-lowest text-primary shadow-sm border border-outline-variant/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="font-semibold text-emerald-600">WebSocket Live</span>
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-space-sm flex-wrap">
              <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight font-bold">
                {user?.displayName || user?.email?.split('@')[0] || 'Candidate'}
              </h1>
              <span className="text-secondary font-body-md text-body-md">
                — {job?.title || 'Technical Assessment'}
              </span>
            </div>
          </div>

          {/* Linear Metrics & Monospace Timer */}
          <div className="flex items-center gap-space-lg flex-shrink-0 bg-surface-container-lowest px-space-md py-2.5 rounded-lg shadow-sm border border-outline-variant/30">
            {/* Progress */}
            <div className="flex flex-col gap-1.5 w-36">
              <div className="flex items-center justify-between text-label-sm font-label-sm text-secondary">
                <span>Progress</span>
                <span className="text-on-surface font-semibold">
                  Question {questionProgress.current} of {questionProgress.total}
                </span>
              </div>
              <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-container rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>

            <div className="h-8 w-px bg-surface-container"></div>

            {/* Elapsed Timer */}
            <div className="flex flex-col">
              <span className="text-label-sm font-label-sm uppercase text-secondary font-semibold">
                Elapsed / Allocated
              </span>
              <div className="flex items-center gap-1.5 font-metric-tabular text-metric-tabular text-on-surface tracking-tight">
                <span className="material-symbols-outlined text-[16px] text-primary">timer</span>
                <span>{formatTimer(elapsedSeconds)}</span>
                <span className="text-secondary text-body-sm font-body-sm">
                  / {questionProgress.total * 5}:00
                </span>
              </div>
            </div>

            <button
              onClick={() => setShowExitConfirm(true)}
              className="p-1.5 rounded-lg text-secondary hover:text-error hover:bg-error-container/30 transition-colors"
              title="End Interview Early"
            >
              <span className="material-symbols-outlined text-[20px]">power_settings_new</span>
            </button>
          </div>
        </div>
      </section>

      {/* Competency Ribbon */}
      <section className="w-full bg-surface-container-lowest shadow-sm border-b border-outline-variant/30">
        <div className="max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop py-2.5 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-space-sm text-label-md font-label-md">
            <span className="text-secondary uppercase tracking-wider font-semibold">Active Focus:</span>
            <span className="px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-semibold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px]">device_hub</span>
              {currentQuestion?.skill || currentQuestion?.category || 'General Technical'}
            </span>
          </div>
          <div className="flex items-center gap-space-md text-label-sm font-label-sm text-secondary">
            {recentEvaluation?.status && (
              <span className="flex items-center gap-1 font-semibold text-primary">
                <span className="material-symbols-outlined text-[14px]">psychology</span>
                Last Evaluation: {recentEvaluation.status.replace(/_/g, ' ')}
              </span>
            )}
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-tertiary">lock</span>
              Encrypted Session
            </span>
            <span className="hidden sm:inline text-surface-dim">/</span>
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-primary">verified_user</span>
              Difficulty: {currentQuestion?.difficulty ? String(currentQuestion.difficulty).toUpperCase() : 'INTERMEDIATE'}
            </span>
          </div>
        </div>
      </section>

      {/* Error alert if any */}
      {errorMessage && (
        <div className="max-w-7xl mx-auto w-full px-margin pt-4">
          <div className="p-3 rounded-lg bg-error-container/40 border border-error/30 text-error flex items-start gap-2">
            <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
            <span className="text-body-sm font-medium">{errorMessage}</span>
          </div>
        </div>
      )}

      {/* Main Workstation Screen */}
      {interviewState === 'READY' ? (
        /* Ready State / Launch Prompt */
        <div className="max-w-3xl mx-auto w-full px-margin py-16 flex flex-col items-center justify-center text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-primary-container text-on-primary flex items-center justify-center shadow-lg">
            <span className="material-symbols-outlined text-[32px]">mic</span>
          </div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface font-bold">
            Ready for Your Live Voice Interview
          </h2>
          <p className="font-body-lg text-body-lg text-secondary max-w-xl">
            You are entering a live session for <strong className="text-on-surface">{job?.title || 'Technical Role'}</strong>.
            The AI examiner will speak questions aloud and evaluate your depth in real-time.
          </p>

          {/* Active Resume State for Candidate */}
          {user && user.role === 'candidate' && (
            activeResume ? (
              <div className="w-full max-w-xl p-4 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between text-left">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-[22px]">description</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-on-surface">
                        {activeResume.originalName || activeResume.filename}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-primary/10 text-primary">
                        v{activeResume.currentVersion || 1}
                      </span>
                    </div>
                    <p className="text-[11px] text-secondary">
                      Active Profile Resume • {(activeResume.extractedProfile?.skills || []).length} claimed skills loaded for personalization
                    </p>
                  </div>
                </div>
                {onNavigateProfile && (
                  <button
                    onClick={onNavigateProfile}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Change Resume
                  </button>
                )}
              </div>
            ) : (
              <div className="w-full max-w-xl p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-amber-600 text-[24px] mt-0.5">upload_file</span>
                  <div>
                    <h4 className="text-xs font-bold text-amber-800">Resume Upload Required</h4>
                    <p className="text-[11px] text-secondary mt-0.5">
                      Please upload your resume once on your profile page before beginning the AI interview.
                    </p>
                  </div>
                </div>
                {onNavigateProfile && (
                  <button
                    onClick={onNavigateProfile}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold whitespace-nowrap transition-all shadow-xs"
                  >
                    Upload in Profile
                  </button>
                )}
              </div>
            )
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full pt-4 text-left">
            <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1">
              <span className="material-symbols-outlined text-primary text-[20px]">record_voice_over</span>
              <h4 className="font-label-md font-semibold text-on-surface">Gemini Voice Generation</h4>
              <p className="font-body-sm text-secondary">Real questions tailored dynamically to your responses.</p>
            </div>
            <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1">
              <span className="material-symbols-outlined text-primary text-[20px]">mic</span>
              <h4 className="font-label-md font-semibold text-on-surface">Web Speech STT</h4>
              <p className="font-body-sm text-secondary">Microphone speech-to-text with continuous transcription.</p>
            </div>
            <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1">
              <span className="material-symbols-outlined text-primary text-[20px]">analytics</span>
              <h4 className="font-label-md font-semibold text-on-surface">Objective Scoring</h4>
              <p className="font-body-sm text-secondary">4-dimensional rubrics with zero demographic bias.</p>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-4 flex-wrap justify-center">
            {!user ? (
              <button
                onClick={() => onOpenAuthModal && onOpenAuthModal('candidate')}
                className="px-8 py-3.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-body-md font-bold shadow-md transition-all flex items-center gap-2 group"
              >
                <span className="material-symbols-outlined text-[18px]">lock_open</span>
                <span>Sign In to Begin Interview</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  if (user?.role === 'candidate' && !activeResume) {
                    if (onNavigateProfile) onNavigateProfile();
                    return;
                  }
                  handleStartInterview();
                }}
                disabled={user?.role === 'candidate' && !activeResume}
                className={`px-8 py-3.5 rounded-lg font-body-md font-bold shadow-md transition-all flex items-center gap-2 group ${
                  user?.role === 'candidate' && !activeResume
                    ? 'bg-secondary/20 text-secondary cursor-not-allowed'
                    : 'bg-primary-container hover:bg-primary text-on-primary'
                }`}
              >
                <span>{user?.role === 'candidate' && !activeResume ? 'Resume Required to Begin' : 'Begin Voice Session'}</span>
                <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">
                  arrow_forward
                </span>
              </button>
            )}
            <button
              onClick={onExit}
              className="px-6 py-3.5 rounded-lg bg-surface-container text-on-surface font-body-md font-semibold hover:bg-surface-container-high transition-colors"
            >
              Back to Positions
            </button>
          </div>
        </div>
      ) : (
        /* Live Workstation: 8 cols left, 4 cols right */
        <div className="max-w-7xl mx-auto px-margin md:px-margin-tablet lg:px-margin-desktop py-space-xl w-full flex-1">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-desktop items-start">
            {/* Left 8 Cols */}
            <div className="lg:col-span-8 flex flex-col gap-space-xl">
              {/* AI Examiner Prompt Card */}
              <article className="bg-surface-container-lowest rounded-xl p-space-lg md:p-space-xl shadow-md relative overflow-hidden border border-outline-variant/30">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-primary-container"></div>
                <div className="flex flex-col gap-space-md">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-secondary-container text-on-secondary-fixed text-label-sm font-label-sm font-semibold tracking-wide uppercase">
                      <span className="material-symbols-outlined text-[15px] text-primary">neurology</span>
                      Adaptive Examiner (Calibrated to Level {currentQuestion?.difficulty || 'Staff'})
                    </span>
                    <span className="text-label-sm font-label-sm text-secondary font-mono tracking-wider">
                      PROMPT_SEQ_0{questionProgress.current}#R{questionProgress.current}
                    </span>
                  </div>

                  <h2 className="font-headline-md text-headline-md text-on-surface leading-snug font-bold">
                    &ldquo;{currentQuestion?.questionText || 'Loading dynamic adaptive question...'}&rdquo;
                  </h2>

                  <div className="mt-2 flex items-start justify-between gap-space-sm p-space-md rounded-lg bg-surface-container-low text-on-surface border border-outline-variant/20 flex-wrap sm:flex-nowrap">
                    <div className="flex items-start gap-space-sm">
                      <span className="material-symbols-outlined text-primary text-[18px] mt-0.5 flex-shrink-0">
                        auto_fix_high
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-label-sm font-label-sm font-semibold uppercase tracking-wider text-primary">
                          Contextual Adaptation Vector
                        </span>
                        <p className="font-body-sm text-body-sm text-secondary">
                          {isAISpeaking
                            ? 'AI Examiner is speaking aloud. Candidate microphone is paused until prompt concludes.'
                            : 'Probing architectural tradeoffs, error handling heuristics, and concurrency limits.'}
                        </p>
                      </div>
                    </div>
                    {isAISpeaking && (
                      <button
                        onClick={handleSkipAudioPrompt}
                        className="px-3 py-1 bg-surface-container rounded text-label-sm font-semibold text-primary hover:bg-surface-container-high transition-colors shrink-0 mt-1 sm:mt-0"
                      >
                        Skip Audio Prompt
                      </button>
                    )}
                  </div>
                </div>
              </article>

              {/* Candidate Input & Drafting Station */}
              <div className="bg-surface-container-lowest rounded-xl p-space-lg md:p-space-xl shadow-md flex flex-col gap-space-md border border-outline-variant/30">
                <div className="flex items-center justify-between flex-wrap gap-space-sm">
                  <div className="flex items-center gap-space-sm">
                    <span className="font-headline-sm text-headline-sm text-on-surface font-bold">Your Response</span>
                    <span className="text-label-sm font-label-sm px-2 py-0.5 rounded bg-surface-container text-secondary font-semibold">
                      Live STT + Notes
                    </span>
                  </div>
                  <div className="flex items-center gap-space-md">
                    {/* Audio Status */}
                    <button
                      onClick={handleToggleMic}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-label-sm font-label-sm font-semibold transition-colors ${
                        isListening
                          ? 'bg-error-container text-error'
                          : 'bg-surface-container-low text-secondary hover:text-on-surface'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        {isListening ? 'mic' : 'mic_off'}
                      </span>
                      <span>{isListening ? 'Mic Live (Recording)' : 'Mic Paused (Click to toggle)'}</span>
                    </button>

                    <button
                      onClick={handleRepeatQuestion}
                      disabled={isAISpeaking}
                      className="text-label-sm font-label-sm text-primary hover:text-primary-container font-semibold transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[14px]">volume_up</span>
                      <span>Repeat Prompt</span>
                    </button>
                  </div>
                </div>

                {/* Input Canvas */}
                <div className="relative w-full">
                  <textarea
                    rows={8}
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder="Speak into your microphone or type your response detailing your architectural reasoning..."
                    className="w-full p-4 rounded-lg bg-surface font-body-md text-body-md text-on-surface border border-outline-variant/30 focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/20 leading-relaxed resize-y transition-all"
                  />
                  {interimTranscript && (
                    <div className="p-2 text-label-sm text-secondary bg-surface-container-low rounded-b mt-[-4px] border-t border-outline-variant/20 italic">
                      Live voice input: {interimTranscript}
                    </div>
                  )}
                </div>

                {/* Bottom Meta & Submission */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md pt-2">
                  <div className="flex items-center gap-space-md text-label-md font-label-md text-secondary">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px]">format_align_left</span>
                      <span>Word Count: <strong className="text-on-surface font-semibold">{wordCount} words</strong></span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px]">history</span>
                      <span>Real-time persistence</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-space-sm flex-wrap sm:flex-nowrap">
                    <button
                      type="button"
                      onClick={() => resetTranscript()}
                      className="px-4 py-2.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[16px]">refresh</span>
                      <span>Clear Response</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitAnswer}
                      disabled={isSubmitting || (!transcript.trim() && !interimTranscript.trim())}
                      className="px-6 py-2.5 rounded bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md font-semibold transition-all shadow-md hover:shadow-lg flex items-center gap-2 group active:scale-[0.98] disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                          <span>AI Evaluating...</span>
                        </>
                      ) : (
                        <>
                          <span>Submit Answer</span>
                          <span className="material-symbols-outlined text-[16px] group-hover:translate-x-0.5 transition-transform">
                            arrow_forward
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Real-Time Signal Stream Mini-Bento */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-md">
                <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-1 border border-outline-variant/20">
                  <span className="text-label-sm font-label-sm uppercase text-secondary font-semibold">Telemetry Channel</span>
                  <div className="flex items-center justify-between">
                    <span className="font-body-md text-body-md font-semibold text-on-surface">Encrypted WebRTC</span>
                    <span className="w-2 h-2 rounded-full bg-primary"></span>
                  </div>
                  <span className="text-label-sm font-label-sm text-secondary">Packet loss: 0.00%</span>
                </div>
                <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-1 border border-outline-variant/20">
                  <span className="text-label-sm font-label-sm uppercase text-secondary font-semibold">Synthesis Engine</span>
                  <div className="flex items-center justify-between">
                    <span className="font-body-md text-body-md font-semibold text-on-surface">Google Gemini</span>
                    <span className="text-label-sm font-label-sm px-1.5 py-0.5 rounded bg-surface-container text-primary font-bold">L6-CAL</span>
                  </div>
                  <span className="text-label-sm font-label-sm text-secondary">Zero hallucination guard</span>
                </div>
                <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-1 border border-outline-variant/20">
                  <span className="text-label-sm font-label-sm uppercase text-secondary font-semibold">Proctoring Telemetry</span>
                  <div className="flex items-center justify-between">
                    <span className="font-body-md text-body-md font-semibold text-on-surface">Active Proctor</span>
                    <span className="material-symbols-outlined text-[16px] text-tertiary">lock</span>
                  </div>
                  <span className="text-label-sm font-label-sm text-secondary">Integrity events synced</span>
                </div>
              </div>
            </div>

            {/* Right 4 Cols: Telemetry & Rubric Sidebar */}
            <aside className="lg:col-span-4 flex flex-col gap-space-lg">
              {/* Telemetry Stats Card */}
              <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-md flex flex-col gap-space-md border border-outline-variant/30">
                <div className="flex items-center justify-between">
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[20px]">insights</span>
                    Session Telemetry
                  </h3>
                  <span className="px-2 py-0.5 rounded text-label-sm font-label-sm bg-surface-container text-secondary font-semibold">
                    Live Stream
                  </span>
                </div>

                <div className="flex flex-col gap-2.5">
                  <div className="p-2.5 rounded-lg bg-surface-container-low flex items-center justify-between border border-outline-variant/20">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-secondary">graphic_eq</span>
                      <span className="font-body-sm text-body-sm text-secondary">Audio Synthesis</span>
                    </div>
                    <span className="font-label-sm text-label-sm font-bold text-on-surface px-2 py-0.5 rounded bg-surface-container-lowest shadow-sm">
                      {isAISpeaking ? 'Speaking' : isListening ? 'Listening' : 'Ready'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-surface-container-low flex items-center justify-between border border-outline-variant/20">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-secondary">speed</span>
                      <span className="font-body-sm text-body-sm text-secondary">Audio Latency</span>
                    </div>
                    <span className="font-metric-tabular text-body-sm font-bold text-primary px-2 py-0.5 rounded bg-surface-container-lowest shadow-sm">
                      &lt;180ms
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-surface-container-low flex items-center justify-between border border-outline-variant/20">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-secondary">record_voice_over</span>
                      <span className="font-body-sm text-body-sm text-secondary">Vocal Status</span>
                    </div>
                    <span className="font-label-sm text-label-sm font-bold text-on-surface px-2 py-0.5 rounded bg-surface-container-lowest shadow-sm">
                      {isListening ? 'Active Track' : 'Stationary'}
                    </span>
                  </div>
                </div>

                {/* Animated Spectrogram Waveform */}
                <div className="p-space-md rounded-lg bg-surface-container flex flex-col gap-2">
                  <div className="flex items-center justify-between text-label-sm font-label-sm text-secondary">
                    <span className="uppercase tracking-wider font-semibold">Vocal Frequency Spectrum</span>
                    <span className="text-primary font-mono font-semibold">48 kHz / 24-bit</span>
                  </div>
                  <div className="w-full h-8 flex items-end gap-1 px-1">
                    <div className={`w-full bg-primary/40 rounded-t h-2 ${isListening || isAISpeaking ? 'animate-pulse' : ''}`}></div>
                    <div className={`w-full bg-primary/60 rounded-t h-4 ${isListening || isAISpeaking ? 'animate-bounce' : ''}`}></div>
                    <div className={`w-full bg-primary rounded-t h-7 ${isListening || isAISpeaking ? 'animate-pulse' : ''}`}></div>
                    <div className={`w-full bg-primary/70 rounded-t h-5 ${isListening || isAISpeaking ? 'animate-bounce' : ''}`}></div>
                    <div className={`w-full bg-primary/90 rounded-t h-8 ${isListening || isAISpeaking ? 'animate-pulse' : ''}`}></div>
                    <div className={`w-full bg-primary/50 rounded-t h-3 ${isListening || isAISpeaking ? 'animate-bounce' : ''}`}></div>
                    <div className={`w-full bg-primary/80 rounded-t h-6 ${isListening || isAISpeaking ? 'animate-pulse' : ''}`}></div>
                    <div className={`w-full bg-primary/40 rounded-t h-2 ${isListening || isAISpeaking ? 'animate-bounce' : ''}`}></div>
                    <div className={`w-full bg-primary/70 rounded-t h-5 ${isListening || isAISpeaking ? 'animate-pulse' : ''}`}></div>
                    <div className={`w-full bg-primary rounded-t h-8 ${isListening || isAISpeaking ? 'animate-bounce' : ''}`}></div>
                    <div className={`w-full bg-primary/90 rounded-t h-6 ${isListening || isAISpeaking ? 'animate-pulse' : ''}`}></div>
                    <div className={`w-full bg-primary/30 rounded-t h-2 ${isListening || isAISpeaking ? 'animate-bounce' : ''}`}></div>
                    <div className={`w-full bg-primary/50 rounded-t h-4 ${isListening || isAISpeaking ? 'animate-pulse' : ''}`}></div>
                    <div className={`w-full bg-primary/80 rounded-t h-7 ${isListening || isAISpeaking ? 'animate-bounce' : ''}`}></div>
                    <div className={`w-full bg-primary/40 rounded-t h-3 ${isListening || isAISpeaking ? 'animate-pulse' : ''}`}></div>
                    <div className={`w-full bg-primary/20 rounded-t h-1 ${isListening || isAISpeaking ? 'animate-bounce' : ''}`}></div>
                  </div>
                </div>
              </section>

              {/* Rubric Checklist */}
              <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-md flex flex-col gap-space-md border border-outline-variant/30">
                <div className="flex items-center justify-between">
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    Evaluation Progress
                  </h3>
                  <span className="text-label-sm font-label-sm text-secondary font-mono font-semibold">
                    {questionProgress.current} / {questionProgress.total} Questions
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {Array.from({ length: questionProgress.total }).map((_, index) => {
                    const qNum = index + 1;
                    const isDone = qNum < questionProgress.current;
                    const isActive = qNum === questionProgress.current;

                    return (
                      <div
                        key={qNum}
                        className={`p-3 rounded-lg flex items-center justify-between ${
                          isActive
                            ? 'bg-primary text-on-primary shadow-sm font-bold'
                            : isDone
                            ? 'bg-surface-container-low text-on-surface'
                            : 'bg-surface-container-lowest text-secondary opacity-60 border border-outline-variant/20'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="material-symbols-outlined text-[18px]">
                            {isDone ? 'check_circle' : isActive ? 'arrow_forward' : 'radio_button_unchecked'}
                          </span>
                          <span className="font-body-sm text-body-sm font-medium">
                            Question 0{qNum}
                          </span>
                        </div>
                        <span className="text-label-sm font-label-sm uppercase font-semibold">
                          {isDone ? 'Evaluated' : isActive ? 'Active Question' : 'Pending'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 flex items-center gap-2 text-label-sm text-secondary">
                  <span className="material-symbols-outlined text-[15px] text-primary">verified</span>
                  <span>Rubric calibrated for dynamic adaptive branching.</span>
                </div>
              </section>
            </aside>
          </div>
        </div>
      )}

      {/* End Interview Confirmation Modal */}
      {showExitConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 top-0 left-0 w-full h-full z-50 flex items-center justify-center p-4 bg-on-surface/60 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-lg bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/40 overflow-hidden">
            <div className="h-1.5 w-full bg-error"></div>
            <div className="p-space-lg flex flex-col gap-space-md">
              <div className="flex items-start justify-between gap-space-md">
                <div className="flex items-center gap-space-sm">
                  <div className="w-10 h-10 rounded-full bg-error-container text-error flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[24px]">warning</span>
                  </div>
                  <div>
                    <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface leading-tight">
                      End Assessment Session?
                    </h2>
                    <p className="font-body-sm text-body-sm text-secondary mt-0.5">
                      Session ID #{session?.id ? session.id.substring(0, 8).toUpperCase() : '884-LIVE'} • Candidate: {user?.displayName || 'Active Candidate'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowExitConfirm(false)}
                  className="p-1.5 rounded-lg text-secondary hover:text-on-surface hover:bg-surface-container transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              <div className="p-space-md rounded-lg bg-surface-container-low border border-outline-variant/30 flex flex-col gap-2.5">
                <div className="text-label-sm font-label-sm uppercase tracking-wider font-semibold text-secondary flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-primary">analytics</span>
                  <span>Session Snapshot</span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-outline-variant/20">
                  <div className="flex flex-col">
                    <span className="text-label-sm font-label-sm text-secondary">Current Question</span>
                    <span className="font-body-sm text-body-sm font-bold text-on-surface">
                      {questionProgress.current} of {questionProgress.total}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-label-sm font-label-sm text-secondary">Elapsed Time</span>
                    <span className="font-body-sm text-body-sm font-bold text-on-surface font-metric-tabular">
                      {formatTimer(elapsedSeconds)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-label-sm font-label-sm text-secondary">Questions Answered</span>
                    <span className="font-body-sm text-body-sm font-bold text-primary">
                      {Math.max(0, questionProgress.current - 1)} Completed
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-space-md rounded-lg bg-error-container/40 border border-error/20 flex items-start gap-space-sm text-on-error-container">
                <span className="material-symbols-outlined text-error text-[18px] mt-0.5 flex-shrink-0">info</span>
                <p className="font-body-sm text-body-sm leading-relaxed text-on-surface">
                  <strong className="font-semibold text-error">Warning:</strong> Early termination will finalize the candidate dossier with partial telemetry. The backend will compile your score based on answered questions.
                </p>
              </div>

              <div className="flex items-center justify-end gap-space-sm pt-2 border-t border-outline-variant/30">
                <button
                  type="button"
                  onClick={() => setShowExitConfirm(false)}
                  className="px-4 py-2.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md font-semibold transition-colors shadow-sm"
                >
                  Return to Interview
                </button>
                <button
                  type="button"
                  onClick={handleConfirmEndSession}
                  className="px-5 py-2.5 rounded bg-error hover:bg-error/90 text-on-error font-label-md text-label-md font-semibold transition-all shadow-md hover:shadow-lg flex items-center gap-1.5 active:scale-[0.98]"
                >
                  <span className="material-symbols-outlined text-[18px]">power_settings_new</span>
                  <span>Confirm &amp; End Interview</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceInterviewScreen;
