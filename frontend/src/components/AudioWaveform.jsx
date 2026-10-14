import React from 'react';

export const AudioWaveform = ({ mode = 'idle', size = 'normal' }) => {
  // mode: 'ai_speaking' | 'candidate_speaking' | 'idle'
  const isAISpeaking = mode === 'ai_speaking';
  const isCandidateSpeaking = mode === 'candidate_speaking';
  const isActive = isAISpeaking || isCandidateSpeaking;

  const barCount = size === 'large' ? 16 : 9;

  return (
    <div className={`waveform-container ${mode}`}>
      <div className="waveform-bars">
        {Array.from({ length: barCount }).map((_, index) => {
          // Compute pseudo-random staggered height multipliers for fluid visualizer effect
          const delays = [0.1, 0.4, 0.2, 0.6, 0.3, 0.5, 0.2, 0.7, 0.3, 0.5, 0.2, 0.4, 0.6, 0.1, 0.3, 0.5];
          const delay = delays[index % delays.length];

          return (
            <span
              key={index}
              className={`waveform-bar ${isActive ? 'animating' : ''}`}
              style={{
                animationDelay: `${delay}s`,
                height: isActive ? undefined : '6px'
              }}
            />
          );
        })}
      </div>
      <div className="waveform-label">
        {isAISpeaking && (
          <span className="label-ai">
            <span className="pulse-dot" /> AI Interviewer is speaking...
          </span>
        )}
        {isCandidateSpeaking && (
          <span className="label-candidate">
            <span className="pulse-dot active" /> Listening to your answer... Speak clearly
          </span>
        )}
        {mode === 'idle' && <span className="label-idle">Microphone ready</span>}
      </div>
    </div>
  );
};

export default AudioWaveform;
