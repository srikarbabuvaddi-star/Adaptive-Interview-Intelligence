import { useState, useEffect, useRef, useCallback } from 'react';

export const useSpeechRecognition = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState(null);

  const recognitionRef = useRef(null);
  const shouldListenRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      setPermissionDenied(false);
    };

    recognition.onresult = event => {
      let finalChunk = '';
      let currentInterim = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        const text = result[0]?.transcript || '';

        if (result.isFinal) {
          finalChunk += text + ' ';
        } else {
          currentInterim += text;
        }
      }

      if (finalChunk) {
        setTranscript(prev => {
          const trimmedPrev = prev.trim();
          const trimmedChunk = finalChunk.trim();
          if (!trimmedPrev) return trimmedChunk;
          // Avoid appending exact duplicate sentences if recognition repeats
          if (trimmedPrev.endsWith(trimmedChunk)) return trimmedPrev;
          return `${trimmedPrev} ${trimmedChunk}`;
        });
      }

      setInterimTranscript(currentInterim);
    };

    recognition.onerror = event => {
      console.warn('SpeechRecognition error event:', event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setPermissionDenied(true);
        setError('Microphone access was denied. Please allow microphone permissions in your browser.');
        shouldListenRef.current = false;
        setIsListening(false);
      } else if (event.error === 'no-speech') {
        // Ignorable timeout: user was silent
      } else {
        setError(`Speech recognition notice: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setInterimTranscript('');
      // If candidate is still in listening mode, automatically restart recognition
      if (shouldListenRef.current) {
        try {
          recognition.start();
        } catch (e) {
          setIsListening(false);
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      shouldListenRef.current = false;
      try {
        recognition.stop();
      } catch (e) {}
    };
  }, []);

  const startListening = useCallback(() => {
    setError(null);
    if (!recognitionRef.current) {
      setIsSupported(false);
      return;
    }

    shouldListenRef.current = true;
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (err) {
      // If already started, start() throws an InvalidStateError
      if (err.name !== 'InvalidStateError') {
        console.warn('Recognition start exception:', err);
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  return {
    isListening,
    transcript,
    setTranscript,
    interimTranscript,
    isSupported,
    permissionDenied,
    error,
    startListening,
    stopListening,
    resetTranscript
  };
};

export default useSpeechRecognition;
