import { useState, useEffect, useRef, useCallback } from 'react';

export const useVoiceSynthesis = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [voices, setVoices] = useState([]);
  const selectedVoiceRef = useRef(null);
  const currentUtteranceRef = useRef(null);

  // Load available speech synthesis voices
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setIsSupported(false);
      return;
    }

    const updateVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);

      // Prioritize natural sounding English voices (Google, Natural, Samantha, Daniel)
      const englishVoice =
        availableVoices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Premium'))) ||
        availableVoices.find(v => v.lang === 'en-US') ||
        availableVoices.find(v => v.lang.startsWith('en')) ||
        availableVoices[0];

      selectedVoiceRef.current = englishVoice || null;
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const cancel = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      currentUtteranceRef.current = null;
    }
  }, []);

  const speak = useCallback(
    (text, { onStart, onEnd, onError, rate = 0.98, pitch = 1.0 } = {}) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        setIsSupported(false);
        if (onEnd) onEnd();
        return;
      }

      // Stop any prior speech
      window.speechSynthesis.cancel();

      if (!text || !text.trim()) {
        if (onEnd) onEnd();
        return;
      }

      // Resume speech synthesis if suspended by browser autoplay policy
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const utterance = new SpeechSynthesisUtterance(text.trim());
      utterance.rate = rate;
      utterance.pitch = pitch;

      if (selectedVoiceRef.current) {
        utterance.voice = selectedVoiceRef.current;
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
        if (onStart) onStart();
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        currentUtteranceRef.current = null;
        if (onEnd) onEnd();
      };

      utterance.onerror = event => {
        console.warn('SpeechSynthesis error:', event);
        setIsSpeaking(false);
        currentUtteranceRef.current = null;
        if (onError) onError(event);
        // Fallback: If TTS fails or is blocked, unblock the flow so candidate can proceed
        if (onEnd) onEnd();
      };

      currentUtteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    []
  );

  return {
    speak,
    cancel,
    isSpeaking,
    isSupported,
    voices
  };
};

export default useVoiceSynthesis;
