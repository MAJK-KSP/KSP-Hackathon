/**
 * @file AiChat.tsx
 * @description Interactive AI Assistant chat terminal. Supports starting new threads, viewing conversation history, managing threads, and rendering assistant markdown responses.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../LanguageContext';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    sql_queries?: string[];
    reasoning_steps?: string[];
  };
  created_at: string;
  is_generating?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface AiChatProps {
  isFullPage?: boolean;
}

interface CopySqlButtonProps {
  text: string;
  label: string;
}

const CopySqlButton: React.FC<CopySqlButtonProps> = ({ text, label }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button className={`ai-copy-sql-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
      {copied ? 'Copied ✓' : label}
    </button>
  );
};

export const AiChat: React.FC<AiChatProps> = ({ isFullPage = false }) => {
  const { locale, t, translateText } = useLanguage();
  const [targetTransLang, setTargetTransLang] = useState<string>('kn');
  const [translatedMessages, setTranslatedMessages] = useState<Record<string, string>>({});
  const [translatingMsgId, setTranslatingMsgId] = useState<string | null>(null);

  const handleZiaTranslate = async (msgId: string, content: string, targetLang: string = 'kn') => {
    if (translatedMessages[msgId]) {
      // Toggle back to original text if already translated
      const updated = { ...translatedMessages };
      delete updated[msgId];
      setTranslatedMessages(updated);
      return;
    }

    setTranslatingMsgId(msgId);
    try {
      const translated = await translateText(content, targetLang);
      if (translated && translated !== content) {
        setTranslatedMessages(prev => ({ ...prev, [msgId]: translated }));
      } else {
        console.warn('Translation returned same text — API may have failed silently');
      }
    } catch (err) {
      console.error('Zoho Zia Translate failed:', err);
    } finally {
      setTranslatingMsgId(null);
    }
  };
  const [isOpen, setIsOpen] = useState(isFullPage);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Voice recording and translation states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState<'en' | 'hi' | 'kn'>('en');
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);

  // TTS Synthesis states
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [ttsLoadingMessageId, setTtsLoadingMessageId] = useState<string | null>(null);
  const [ttsEmotion, setTtsEmotion] = useState<'neutral' | 'happy' | 'sad' | 'angry'>('neutral');
  const [ttsSpeaker, setTtsSpeaker] = useState<string>('female');
  const [showTtsModal, setShowTtsModal] = useState<boolean>(false);
  const [ttsCustomText, setTtsCustomText] = useState<string>('Karnataka State Police operational intelligence platform is active.');
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const speechRecognitionRef = useRef<any>(null);

  const location = useLocation();

  // Read ?query= search parameter from URL if redirected from GIS Map or elsewhere
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const initialQuery = params.get('query');
    if (initialQuery && initialQuery.trim()) {
      setInput(initialQuery.trim());
      if (isFullPage) {
        setIsOpen(true);
      }
    }
  }, [location.search, isFullPage]);

  // Sync speechLanguage with user's selected locale
  useEffect(() => {
    if (locale === 'kn') {
      setSpeechLanguage('kn');
    } else {
      setSpeechLanguage('en');
    }
  }, [locale]);

  // Clean up recording timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch (e) {}
      }
    };
  }, []);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      alert(t('Audio recording is not supported in this browser or context (requires HTTPS/localhost).'));
      return;
    }

    setTranscriptionError(null);

    let liveCapturedText = false;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        const langMap: Record<string, string> = { en: 'en-IN', hi: 'hi-IN', kn: 'kn-IN' };
        recognition.lang = langMap[speechLanguage] || 'en-IN';

        recognition.onresult = (event: any) => {
          let liveTranscript = '';
          for (let i = 0; i < event.results.length; i++) {
            liveTranscript += event.results[i][0].transcript;
          }
          if (liveTranscript.trim()) {
            liveCapturedText = true;
            setInput(liveTranscript.trim());
          }
        };

        recognition.onerror = (event: any) => {
          console.warn('Live SpeechRecognition notice:', event.error);
        };

        recognition.start();
        speechRecognitionRef.current = recognition;
      } catch (e) {
        console.warn('Live SpeechRecognition initialization notice:', e);
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        // If real-time Web Speech API already typed text into the input bar, skip the slow server transcription!
        if (liveCapturedText || (inputRef.current && inputRef.current.value.trim().length > 0)) {
          console.log('[Voice] Real-time speech captured. Skipping secondary server transcription delay.');
          return;
        }
        const mimeType = mediaRecorder.mimeType || 'audio/wav';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioChunksRef.current.length > 0 && audioBlob.size > 0) {
          await transcribeAudio(audioBlob);
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingDuration(0);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          if (prev >= 30) {
            stopRecording();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err) {
      console.error('Error starting audio recording:', err);
      alert(t('Could not access microphone. Please check permissions.'));
    }
  };

  const stopRecording = () => {
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch (e) {}
      speechRecognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  };

  const cancelRecording = () => {
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch (e) {}
      speechRecognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      audioChunksRef.current = [];
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
    setTranscriptionError(null);
  };

  const transcribeAudio = async (blob: Blob) => {
    setTranscribing(true);
    setTranscriptionError(null);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        if (typeof reader.result !== 'string') {
          setTranscribing(false);
          setTranscriptionError(t('Failed to read recorded audio data.'));
          return;
        }
        const base64data = reader.result.split(',')[1];
        if (!base64data) {
          setTranscribing(false);
          setTranscriptionError(t('Recorded audio payload is empty.'));
          return;
        }
        try {
          const res = await fetch('/api/ai/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audio: base64data,
              language: speechLanguage,
              mimeType: blob.type
            })
          });

          if (res.ok) {
            const data = await res.json();
            if (data.success && data.text) {
              setInput(prev => {
                const base = prev.trim();
                return base ? `${base} ${data.text}` : data.text;
              });
            } else {
              console.error('Transcription error:', data.error);
              const errMsg = data.error ? t(data.error) : t('Speech not recognized. Please speak clearly.');
              setTranscriptionError(errMsg);
              setTimeout(() => setTranscriptionError(prev => prev === errMsg ? null : prev), 6000);
            }
          } else {
            console.error('Transcription API responded with status:', res.status);
            let errMsg = t('Transcription failed (HTTP {status})').replace('{status}', res.status.toString());
            try {
              const errData = await res.json();
              if (errData.error) errMsg = t(errData.error);
            } catch (e) {}
            setTranscriptionError(errMsg);
            setTimeout(() => setTranscriptionError(prev => prev === errMsg ? null : prev), 6000);
          }
        } catch (fetchErr) {
          console.error('Error in transcribing audio request:', fetchErr);
          const errMsg = t('Network error. Failed to reach transcription service.');
          setTranscriptionError(errMsg);
          setTimeout(() => setTranscriptionError(prev => prev === errMsg ? null : prev), 6000);
        } finally {
          setTranscribing(false);
        }
      };
    } catch (err) {
      console.error('Failed to read audio blob:', err);
      setTranscriptionError(t('Failed to process recorded audio.'));
      setTranscribing(false);
    }
  };

  // Kannada Translation + TTS state
  const [kannadaPlayingId, setKannadaPlayingId] = useState<string | null>(null);
  const [kannadaLoadingId, setKannadaLoadingId] = useState<string | null>(null);

  const translateAndPlayKannada = async (msgId: string, textToSpeak: string) => {
    // Toggle off if already playing
    if (kannadaPlayingId === msgId || kannadaLoadingId === msgId) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setKannadaPlayingId(null);
      setKannadaLoadingId(null);
      return;
    }

    // Stop any existing playback
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
    }
    setPlayingMessageId(null);
    setKannadaPlayingId(null);

    const cleanText = textToSpeak.replace(/[*_#`~>|-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanText) return;

    setKannadaLoadingId(msgId);

    try {
      // Use Zoho Catalyst QuickML Zia Translate API via /api/ai/translate
      const res = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText.substring(0, 800), target_language: 'kn' })
      });

      let kannadaText = cleanText;
      if (res.ok) {
        const data = await res.json();
        kannadaText = data.translated_text || cleanText;
      }

      if (!('speechSynthesis' in window)) {
        setKannadaLoadingId(null);
        return;
      }

      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();

      const utterance = new SpeechSynthesisUtterance(kannadaText);
      utterance.lang = 'kn-IN';
      utterance.rate = 0.9;

      // Try to find a Kannada voice
      const voices = window.speechSynthesis.getVoices();
      const knVoice = voices.find(v => v.lang.startsWith('kn'));
      if (knVoice) utterance.voice = knVoice;

      utterance.onend = () => {
        setKannadaPlayingId(null);
        setKannadaLoadingId(null);
      };
      utterance.onerror = () => {
        setKannadaPlayingId(null);
        setKannadaLoadingId(null);
      };

      setKannadaLoadingId(null);
      setKannadaPlayingId(msgId);
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Kannada TTS error:', err);
      setKannadaLoadingId(null);
      setKannadaPlayingId(null);
    }
  };

  const synthesizeAndPlay = async (msgId: string, textToSpeak: string) => {
    // 1. If currently playing or loading this message, stop immediately
    if (playingMessageId === msgId || ttsLoadingMessageId === msgId) {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setPlayingMessageId(null);
      setTtsLoadingMessageId(null);
      return;
    }

    // 2. Stop any existing playback
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
    }
    setPlayingMessageId(null);

    const cleanText = textToSpeak.replace(/[*_#`~>|-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanText) return;

    // Fast native SpeechSynthesis player
    const playFallbackSpeech = () => {
      setTtsLoadingMessageId(null);
      if (!('speechSynthesis' in window)) {
        setPlayingMessageId(null);
        return;
      }

      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();

        const utterance = new SpeechSynthesisUtterance(cleanText.substring(0, 1500));
        const langMap: Record<string, string> = { en: 'en-IN', hi: 'hi-IN', kn: 'kn-IN' };
        utterance.lang = langMap[speechLanguage] || 'en-IN';

        const voices = window.speechSynthesis.getVoices();
        const matchedVoice = voices.find(v => v.lang.startsWith(utterance.lang) || v.lang.startsWith(speechLanguage));
        if (matchedVoice) {
          utterance.voice = matchedVoice;
        }

        utterance.onend = () => {
          setPlayingMessageId(null);
          setTtsLoadingMessageId(null);
        };
        utterance.onerror = () => {
          setPlayingMessageId(null);
          setTtsLoadingMessageId(null);
        };

        setPlayingMessageId(msgId);
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn('Native speech error:', e);
        setPlayingMessageId(null);
        setTtsLoadingMessageId(null);
      }
    };

    setTtsLoadingMessageId(msgId);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4-second timeout limit

    try {
      const langMap: Record<string, string> = { en: 'English', hi: 'Hindi', kn: 'Kannada' };
      const selectedLang = langMap[speechLanguage] || 'English';

      const res = await fetch('/api/ai/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText.substring(0, 800),
          language: selectedLang,
          speaker: ttsSpeaker,
          emotion: ttsEmotion
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        playFallbackSpeech();
        return;
      }

      const contentType = res.headers.get('content-type') || '';
      let audioUrl = '';

      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data.success && data.audio_base64) {
          audioUrl = `data:audio/wav;base64,${data.audio_base64}`;
        } else {
          playFallbackSpeech();
          return;
        }
      } else {
        const blob = await res.blob();
        if (blob.size === 0) {
          playFallbackSpeech();
          return;
        }
        audioUrl = URL.createObjectURL(blob);
      }

      const audio = new Audio(audioUrl);
      audioElementRef.current = audio;
      setTtsLoadingMessageId(null);
      setPlayingMessageId(msgId);

      audio.onended = () => {
        setPlayingMessageId(null);
        audioElementRef.current = null;
      };
      audio.onerror = () => {
        setPlayingMessageId(null);
        audioElementRef.current = null;
        playFallbackSpeech();
      };

      await audio.play();
    } catch (err: any) {
      clearTimeout(timeoutId);
      playFallbackSpeech();
    } finally {
      setTtsLoadingMessageId(null);
    }
  };

  const renderInputArea = () => {
    return (
      <div className="ai-chat-input-area" style={{ position: 'relative' }}>
        {/* Transcription feedback / error banner */}
        {transcriptionError && (
          <div className="ai-transcription-error-banner" style={{
            position: 'absolute',
            bottom: '100%',
            left: '12px',
            right: '12px',
            backgroundColor: '#fee2e2',
            border: '1px solid #fca5a5',
            color: '#991b1b',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '0.825rem',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 10,
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>⚠️</span>
              <strong>{transcriptionError}</strong>
            </span>
            <button 
              onClick={() => setTranscriptionError(null)} 
              style={{
                background: 'none',
                border: 'none',
                color: '#991b1b',
                cursor: 'pointer',
                fontWeight: 'bold',
                padding: '0 4px',
                fontSize: '1rem',
                lineHeight: 1
              }}
            >
              ×
            </button>
          </div>
        )}

        {isRecording ? (
          <div className="ai-recording-panel">
            <div className="ai-recording-status">
              <span className="ai-recording-dot"></span>
              <span className="ai-recording-timer">{t('Recording...')} {formatDuration(recordingDuration)} / 0:30</span>
            </div>
            <div className="ai-recording-waves">
              <span className="wave-bar"></span>
              <span className="wave-bar"></span>
              <span className="wave-bar"></span>
              <span className="wave-bar"></span>
              <span className="wave-bar"></span>
            </div>
            <div className="ai-recording-actions">
              <button className="ai-cancel-btn" onClick={cancelRecording} title={t('Cancel')}>
                {t('Cancel')}
              </button>
              <button className="ai-stop-btn" onClick={stopRecording} title={t('Stop & Transcribe')}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
                {t('Stop')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <textarea
              ref={inputRef}
              className="ai-chat-input"
              placeholder={t('Ask the KSP AI Assistant...')}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                if (transcriptionError) setTranscriptionError(null);
              }}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={loading || transcribing}
            />
            
            {/* Language Selector Dropdown */}
            <select
              className="ai-voice-lang-select"
              value={speechLanguage}
              onChange={e => setSpeechLanguage(e.target.value as any)}
              title={t('Select Speech Language')}
              disabled={loading || transcribing}
            >
              <option value="en">🌐 EN</option>
              <option value="hi">🌐 HI</option>
              <option value="kn">🌐 KN</option>
            </select>

            {/* Microphone Button */}
            <button
              className={`ai-voice-btn ${isRecording ? 'recording' : ''} ${transcribing ? 'transcribing' : ''}`}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={loading || transcribing}
              title={isRecording ? t('Stop Recording') : t('Record Voice')}
              type="button"
            >
              {transcribing ? (
                <div className="ai-voice-loader" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
              )}
            </button>

            <button
              className="ai-send-btn"
              onClick={sendMessage}
              disabled={!input.trim() || loading || transcribing}
              title={t('Send Message')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </>
        )}
      </div>
    );
  };

  // Synchronize isOpen state and auto-fetch conversations list for full-page mode
  useEffect(() => {
    if (isFullPage) {
      setIsOpen(true);
      fetchConversations();
    }
  }, [isFullPage]);

  // Custom markdown inline parser (converts **text** to bold elements)
  const parseInline = (text: string) => {
    const parts = text.split(/\*\*([^*]+)\*\*/g);
    return parts.map((part, idx) => {
      if (idx % 2 === 1) {
        return <strong key={idx} style={{ fontWeight: 700 }}>{part}</strong>;
      }
      return part;
    });
  };

  // Custom markdown block parser (converts markdown block headers, lists, tables, paragraphs to React JSX)
  const parseMarkdown = (markdown: string) => {
    if (!markdown) return null;
    
    const lines = markdown.split('\n');
    const elements: React.ReactNode[] = [];
    let listItems: string[] = [];
    let inList = false;

    const flushList = (keyIndex: number) => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`ul-${keyIndex}`} style={{ paddingLeft: '20px', margin: '8px 0', listStyleType: 'square' }}>
            {listItems.map((item, idx) => (
              <li key={`li-${keyIndex}-${idx}`} style={{ fontSize: '0.9rem', marginBottom: '4px' }}>{parseInline(item)}</li>
            ))}
          </ul>
        );
        listItems = [];
      }
    };

    let tableRows: string[][] = [];
    let inTable = false;

    const flushTable = (keyIndex: number) => {
      if (tableRows.length > 0) {
        const hasHeaders = tableRows.length > 1; // Simplistic header check
        const headers = hasHeaders ? tableRows[0] : [];
        const rows = hasHeaders ? tableRows.slice(1) : tableRows;

        elements.push(
          <div key={`table-wrapper-${keyIndex}`} style={{ overflowX: 'auto', margin: '12px 0', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              {hasHeaders && (
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                    {headers.map((h, idx) => (
                      <th key={`th-${idx}`} style={{ padding: '8px 12px', fontWeight: 'bold', color: '#1e293b', whiteSpace: 'nowrap' }}>{parseInline(h)}</th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {rows.map((row, rIdx) => (
                  <tr key={`tr-${rIdx}`} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: rIdx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    {row.map((cell, cIdx) => (
                      <td key={`td-${cIdx}`} style={{ padding: '8px 12px', color: '#334155', whiteSpace: 'nowrap' }}>{parseInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableRows = [];
      }
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      // Table row check: starts and ends with |
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        if (inList) {
          flushList(index);
          inList = false;
        }
        inTable = true;
        
        // Skip separator line (e.g., |---|---|)
        if (trimmed.includes('---')) {
          return;
        }

        const cells = trimmed.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        tableRows.push(cells);
      } else {
        if (inTable) {
          flushTable(index);
          inTable = false;
        }

        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          inList = true;
          listItems.push(trimmed.substring(2));
        } else {
          if (inList) {
            flushList(index);
            inList = false;
          }

          if (trimmed.startsWith('#### ')) {
            elements.push(<h4 key={index} style={{ fontSize: '0.95rem', fontWeight: 'bold', margin: '12px 0 6px 0' }}>{parseInline(trimmed.substring(5))}</h4>);
          } else if (trimmed.startsWith('### ')) {
            elements.push(<h3 key={index} style={{ fontSize: '1.05rem', fontWeight: 'bold', margin: '14px 0 8px 0' }}>{parseInline(trimmed.substring(4))}</h3>);
          } else if (trimmed.startsWith('## ')) {
            elements.push(<h2 key={index} style={{ fontSize: '1.15rem', fontWeight: 'bold', margin: '16px 0 10px 0' }}>{parseInline(trimmed.substring(3))}</h2>);
          } else if (trimmed.startsWith('# ')) {
            elements.push(<h1 key={index} style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '18px 0 12px 0' }}>{parseInline(trimmed.substring(2))}</h1>);
          } else if (trimmed === '---') {
            elements.push(<hr key={index} style={{ border: 0, height: '1px', background: '#e2e8f0', margin: '16px 0' }} />);
          } else if (trimmed.length > 0) {
            elements.push(<p key={index} style={{ marginBottom: '8px', fontSize: '0.9rem', lineHeight: '1.4' }}>{parseInline(trimmed)}</p>);
          }
        }
      }
    });

    if (inList) {
      flushList(lines.length);
    }
    if (inTable) {
      flushTable(lines.length);
    }

    return elements;
  };

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Fetch conversations list
  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/ai/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  };

  // Load a specific conversation's messages
  const loadConversation = async (convId: string) => {
    try {
      const res = await fetch(`/api/ai/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setActiveConversationId(convId);
        setShowHistory(false);
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }
  };

  // Delete a conversation
  const deleteConversation = async (convId: string) => {
    try {
      await fetch(`/api/ai/conversations/${convId}`, { method: 'DELETE' });
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (activeConversationId === convId) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  // Start a new conversation
  const startNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
    setShowHistory(false);
    inputRef.current?.focus();
  };

  // Send a message
  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setInput('');
    setLoading(true);

    // Optimistic: add user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    
    // Add placeholder assistant message that we will stream into
    const assistantMessageId = `assist-${Date.now()}`;
    const tempAssistantMsg: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      metadata: {
        sql_queries: [],
        reasoning_steps: []
      },
      created_at: new Date().toISOString(),
      is_generating: true,
    };

    setMessages(prev => [...prev, tempUserMsg, tempAssistantMsg]);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          conversation_id: activeConversationId,
        }),
      });

      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const data = JSON.parse(line);
              if (data.type === 'reasoning_step') {
                setMessages(prev => prev.map(msg => {
                  if (msg.id === assistantMessageId) {
                    const steps = msg.metadata?.reasoning_steps || [];
                    if (!steps.includes(data.content)) {
                      return {
                        ...msg,
                        metadata: {
                          ...msg.metadata,
                          reasoning_steps: [...steps, data.content]
                        }
                      };
                    }
                  }
                  return msg;
                }));
              } else if (data.type === 'sql_query') {
                setMessages(prev => prev.map(msg => {
                  if (msg.id === assistantMessageId) {
                    const queries = msg.metadata?.sql_queries || [];
                    if (!queries.includes(data.content)) {
                      return {
                        ...msg,
                        metadata: {
                          ...msg.metadata,
                          sql_queries: [...queries, data.content]
                        }
                      };
                    }
                  }
                  return msg;
                }));
              } else if (data.type === 'final_result') {
                setMessages(prev => prev.map(msg => {
                  if (msg.id === assistantMessageId) {
                    return {
                      ...msg,
                      content: data.response,
                      metadata: {
                        sql_queries: data.sql_queries || msg.metadata?.sql_queries,
                        reasoning_steps: data.reasoning_steps || msg.metadata?.reasoning_steps
                      }
                    };
                  }
                  return msg;
                }));
              } else if (data.type === 'complete') {
                setActiveConversationId(data.conversation_id);
                setMessages(prev => prev.map(msg => {
                  if (msg.id === assistantMessageId) {
                    return {
                      ...msg,
                      id: data.message.id,
                      content: data.message.content,
                      metadata: data.message.metadata,
                      created_at: data.message.created_at,
                      is_generating: false
                    };
                  }
                  return msg;
                }));
              } else if (data.type === 'error') {
                setMessages(prev => prev.map(msg => {
                  if (msg.id === assistantMessageId) {
                    return {
                      ...msg,
                      content: data.error,
                      is_generating: false
                    };
                  }
                  return msg;
                }));
              }
            } catch (err) {
              // Ignore line parse errors
            }
          }
        }
      } else {
        setMessages(prev => prev.map(msg => {
          if (msg.id === assistantMessageId) {
            return {
              ...msg,
              content: t('Sorry, something went wrong. Please try again.'),
              is_generating: false
            };
          }
          return msg;
        }));
      }
    } catch (err) {
      setMessages(prev => prev.map(msg => {
        if (msg.id === assistantMessageId) {
          return {
            ...msg,
            content: t('Network error. Please check your connection.'),
            is_generating: false
          };
        }
        return msg;
      }));
    } finally {
      setLoading(false);
      setMessages(prev => prev.map(msg => {
        if (msg.id === assistantMessageId) {
          return {
            ...msg,
            is_generating: false
          };
        }
        return msg;
      }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleChat = () => {
    setIsOpen(prev => !prev);
    if (!isOpen) {
      fetchConversations();
    }
  };

  const formatTime = (isoStr: string) => {
    try {
      return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <>
      {/* Floating Chat Button (Miniature overlay mode only) */}
      {!isFullPage && (
        <button
          id="ai-chat-toggle"
          className={`ai-chat-fab ${isOpen ? 'active' : ''}`}
          onClick={toggleChat}
          title={t('AI Assistant')}
        >
          {isOpen ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              <circle cx="9" cy="10" r="1" fill="currentColor"></circle>
              <circle cx="12" cy="10" r="1" fill="currentColor"></circle>
              <circle cx="15" cy="10" r="1" fill="currentColor"></circle>
            </svg>
          )}
        </button>
      )}

      {/* Chat Panel */}
      {(isFullPage || isOpen) && (
        <div className={`ai-chat-panel ${isFullPage ? 'full-page' : ''}`}>
          {isFullPage ? (
            <div className="ai-chat-fullpage-layout">
              {/* Sidebar */}
              <div className="ai-chat-sidebar">
                <div className="ai-sidebar-header">
                  <h3>📂 {t('Chat History')}</h3>
                  <button className="ai-new-chat-btn" onClick={startNewConversation} title={t('New Chat')}>
                    ➕ {t('New')}
                  </button>
                </div>
                {conversations.length === 0 ? (
                  <div className="ai-history-empty">{t('No conversations yet')}</div>
                ) : (
                  <div className="ai-history-list">
                    {conversations.map(conv => (
                      <div
                        key={conv.id}
                        className={`ai-history-item ${activeConversationId === conv.id ? 'active' : ''}`}
                        onClick={() => loadConversation(conv.id)}
                      >
                        <span className="ai-history-title">{conv.title || t('Untitled')}</span>
                        <div className="ai-history-meta">
                          <span>{formatTime(conv.updated_at)}</span>
                          <button
                            className="ai-history-delete"
                            onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }}
                            title={t('Delete')}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Chat Main Workspace */}
              <div className="ai-chat-main-container">
                {/* Header */}
                <div className="ai-chat-header">
                  <div className="ai-chat-header-left">
                    <div className="ai-chat-avatar">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        <polygon points="12 11 9 13 10 9 7 7 11 7 12 3 13 7 17 7 14 9 15 13"></polygon>
                      </svg>
                    </div>
                    <div>
                      <span className="ai-chat-title">{t('KSP AI Assistant')}</span>
                      <span className="ai-chat-status">
                        <span className="status-dot online" style={{ backgroundColor: '#10b981' }}></span>
                        {t('Online')}
                      </span>
                    </div>
                  </div>
                  <div className="ai-chat-header-actions">
                    {activeConversationId && (
                      <button
                        className="ai-header-btn"
                        onClick={() => {
                          setShowPreviewModal(true);
                        }}
                        title={t('Export PDF')}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                          <line x1="16" y1="13" x2="8" y2="13"></line>
                          <line x1="16" y1="17" x2="8" y2="17"></line>
                          <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Messages Area */}
                <div className="ai-chat-messages">
                  {messages.length === 0 && (
                    <div className="ai-chat-welcome">
                      <div className="ai-welcome-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                      </div>
                      <h4>{t('KSP AI Assistant')}</h4>
                      <p>{t('Ask questions about cases, datasets, policies, or get your daily briefing.')}</p>
                      <div className="ai-welcome-chips">
                        <button className="ai-chip" onClick={() => { setInput("What's my briefing for today?"); }}>
                          {t('📋 Today\'s Briefing')}
                        </button>
                        <button className="ai-chip" onClick={() => { setInput('Show recent updates'); }}>
                          {t('📊 Recent Updates')}
                        </button>
                        <button className="ai-chip" onClick={() => { setInput('Help me with a query'); }}>
                          {t('🔍 Query Help')}
                        </button>
                      </div>
                    </div>
                  )}
                  {messages.map(msg => (
                    <div key={msg.id} className={`ai-message ${msg.role}`}>
                      {msg.role === 'assistant' && (
                        <div className="ai-msg-avatar">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                            <polygon points="12 11 9 13 10 9 7 7 11 7 12 3 13 7 17 7 14 9 15 13"></polygon>
                          </svg>
                        </div>
                      )}
                      <div className="ai-msg-bubble">
                        {msg.is_generating ? (
                          <div className="ai-thinking-container">
                            <div className="ai-thinking-header-loading">
                              <div className="ai-thinking-spinner"></div>
                              <span className="ai-thinking-title-text">{t('AI Database Agent is thinking...')}</span>
                            </div>
                            {msg.metadata?.reasoning_steps && msg.metadata.reasoning_steps.length > 0 && (
                              <div className="ai-thinking-steps-list" style={{ marginTop: '10px' }}>
                                <div className="ai-timeline">
                                  {msg.metadata.reasoning_steps.map((step, idx) => (
                                    <div key={idx} className="ai-timeline-step fade-in-step">
                                      <span className="ai-step-bullet">•</span>
                                      <span className="ai-step-text">{step}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {msg.metadata?.sql_queries && msg.metadata.sql_queries.length > 0 && (
                              <div className="ai-thinking-queries-list" style={{ marginTop: '8px' }}>
                                <div className="ai-sql-container">
                                  <pre className="ai-sql-block mini">
                                    <code>{msg.metadata.sql_queries[msg.metadata.sql_queries.length - 1]}</code>
                                  </pre>
                                  <CopySqlButton text={msg.metadata.sql_queries[msg.metadata.sql_queries.length - 1]} label={t('Copy SQL')} />
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            {Boolean(translatedMessages[msg.id]) && (
                              <div style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '3px 8px', borderRadius: '4px', marginBottom: '6px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                ✨ Zoho Zia Translated (NLP Model)
                              </div>
                            )}
                            <div className="ai-msg-content">{parseMarkdown(translatedMessages[msg.id] || msg.content)}</div>
                            {msg.role === 'assistant' && !msg.is_generating && (
                              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                <button
                                  className={`ai-tts-listen-btn ${playingMessageId === msg.id ? 'playing' : ''}`}
                                  onClick={() => synthesizeAndPlay(msg.id, translatedMessages[msg.id] || msg.content)}
                                >
                                  {ttsLoadingMessageId === msg.id ? (
                                    <>⌛ {t('Synthesizing Zia TTS...')}</>
                                  ) : playingMessageId === msg.id ? (
                                    <>⏹️ {t('Stop Voice')}</>
                                  ) : (
                                    <>🔊 {t('Listen (Zia TTS)')}</>
                                  )}
                                </button>
                                <button
                                  className={`ai-tts-listen-btn kannada-btn ${translatingMsgId === msg.id ? 'playing' : ''}`}
                                  onClick={() => handleZiaTranslate(msg.id, msg.content, targetTransLang)}
                                  style={{ background: translatedMessages[msg.id] ? '#15803d' : '#047857', color: '#ffffff' }}
                                >
                                  {translatingMsgId === msg.id ? (
                                    <>⌛ {t('Translating via Zia...')}</>
                                  ) : translatedMessages[msg.id] ? (
                                    <>↩️ {t('Show Original')}</>
                                  ) : (
                                    <>🌐 {t('Translate (Zoho Zia)')}</>
                                  )}
                                </button>
                              </div>
                            )}
                            {msg.role === 'assistant' && msg.metadata && (msg.metadata.sql_queries?.length || msg.metadata.reasoning_steps?.length) ? (
                              <details className="ai-evidence-accordion">
                                <summary className="ai-evidence-header">
                                  <span>🔎 {t('Evidence Trail & Reasoning Path')}</span>
                                </summary>
                                <div className="ai-evidence-body">
                                  {msg.metadata.reasoning_steps && msg.metadata.reasoning_steps.length > 0 && (
                                    <div className="ai-reasoning-section">
                                      <div className="ai-section-title">🧠 {t('Agent Reasoning Steps')}</div>
                                      <div className="ai-timeline">
                                        {msg.metadata.reasoning_steps.map((step, idx) => (
                                          <div key={idx} className="ai-timeline-step">
                                            <span className="ai-step-bullet">•</span>
                                            <span className="ai-step-text">{step}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {msg.metadata.sql_queries && msg.metadata.sql_queries.length > 0 && (
                                    <div className="ai-sql-section" style={{ marginTop: '12px' }}>
                                      <div className="ai-section-title">💻 {t('Database Queries Executed')}</div>
                                      {msg.metadata.sql_queries.map((query, idx) => (
                                        <div key={idx} className="ai-sql-container" style={{ marginBottom: '8px' }}>
                                          <pre className="ai-sql-block">
                                            <code>{query}</code>
                                          </pre>
                                          <CopySqlButton text={query} label={t('Copy SQL')} />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </details>
                            ) : null}
                          </>
                        )}
                        <span className="ai-msg-time">{formatTime(msg.created_at)}</span>
                      </div>
                    </div>
                  ))}
                  {loading && messages.length > 0 && !messages[messages.length - 1].is_generating && (
                    <div className="ai-message assistant">
                      <div className="ai-msg-avatar">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                          <polygon points="12 11 9 13 10 9 7 7 11 7 12 3 13 7 17 7 14 9 15 13"></polygon>
                        </svg>
                      </div>
                      <div className="ai-msg-bubble">
                        <div className="ai-typing">
                          <span></span><span></span><span></span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                {renderInputArea()}
              </div>
            </div>
          ) : (
            // Popup float mode
            <>
              <div className="ai-chat-header">
                <div className="ai-chat-header-left">
                  <div className="ai-chat-avatar">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                      <polygon points="12 11 9 13 10 9 7 7 11 7 12 3 13 7 17 7 14 9 15 13"></polygon>
                    </svg>
                  </div>
                  <div>
                    <span className="ai-chat-title">{t('KSP AI Assistant')}</span>
                    <span className="ai-chat-status">
                      <span className="status-dot online" style={{ backgroundColor: '#10b981' }}></span>
                      {t('Online')}
                    </span>
                  </div>
                </div>
                <div className="ai-chat-header-actions">
                  <button
                    className="ai-header-btn"
                    onClick={() => setShowTtsModal(true)}
                    title={t('Test Zia TTS Voice')}
                    style={{ fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    🔊 {t('Voice TTS')}
                  </button>
                  {activeConversationId && (
                    <button
                      className="ai-header-btn"
                      onClick={() => setShowPreviewModal(true)}
                      title={t('Export PDF')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                      </svg>
                    </button>
                  )}
                  <button
                    className="ai-header-btn"
                    onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchConversations(); }}
                    title={t('Chat History')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                  </button>
                  <button className="ai-header-btn" onClick={startNewConversation} title={t('New Chat')}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  </button>
                </div>
              </div>

              {showHistory && (
                <div className="ai-chat-history">
                  <div className="ai-history-header">
                    <span>{t('Conversations')}</span>
                    <button className="ai-header-btn small" onClick={() => setShowHistory(false)}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                  {conversations.length === 0 ? (
                    <div className="ai-history-empty">{t('No conversations yet')}</div>
                  ) : (
                    <div className="ai-history-list">
                      {conversations.map(conv => (
                        <div
                          key={conv.id}
                          className={`ai-history-item ${activeConversationId === conv.id ? 'active' : ''}`}
                          onClick={() => { loadConversation(conv.id); setShowHistory(false); }}
                        >
                          <span className="ai-history-title">{conv.title || t('Untitled')}</span>
                          <div className="ai-history-meta">
                            <span>{formatTime(conv.updated_at)}</span>
                            <button
                              className="ai-history-delete"
                              onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }}
                              title={t('Delete')}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="ai-chat-messages">
                {messages.length === 0 && (
                  <div className="ai-chat-welcome">
                    <div className="ai-welcome-icon">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                      </svg>
                    </div>
                    <h4>{t('KSP AI Assistant')}</h4>
                    <p>{t('Ask questions about cases, datasets, policies, or get your daily briefing.')}</p>
                    <div className="ai-welcome-chips">
                      <button className="ai-chip" onClick={() => { setInput("What's my briefing for today?"); }}>
                        {t('📋 Today\'s Briefing')}
                      </button>
                      <button className="ai-chip" onClick={() => { setInput('Show recent updates'); }}>
                        {t('📊 Recent Updates')}
                      </button>
                      <button className="ai-chip" onClick={() => { setInput('Help me with a query'); }}>
                        {t('🔍 Query Help')}
                      </button>
                    </div>
                  </div>
                )}
                {messages.map(msg => (
                  <div key={msg.id} className={`ai-message ${msg.role}`}>
                    {msg.role === 'assistant' && (
                      <div className="ai-msg-avatar">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                          <polygon points="12 11 9 13 10 9 7 7 11 7 12 3 13 7 17 7 14 9 15 13"></polygon>
                        </svg>
                      </div>
                    )}
                    <div className="ai-msg-bubble">
                      {msg.is_generating ? (
                        <div className="ai-thinking-container">
                          <div className="ai-thinking-header-loading">
                            <div className="ai-thinking-spinner"></div>
                            <span className="ai-thinking-title-text">{t('AI Database Agent is thinking...')}</span>
                          </div>
                          {msg.metadata?.reasoning_steps && msg.metadata.reasoning_steps.length > 0 && (
                            <div className="ai-thinking-steps-list" style={{ marginTop: '10px' }}>
                              <div className="ai-timeline">
                                {msg.metadata.reasoning_steps.map((step, idx) => (
                                  <div key={idx} className="ai-timeline-step fade-in-step">
                                    <span className="ai-step-bullet">•</span>
                                    <span className="ai-step-text">{step}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {msg.metadata?.sql_queries && msg.metadata.sql_queries.length > 0 && (
                            <div className="ai-thinking-queries-list" style={{ marginTop: '8px' }}>
                              <div className="ai-sql-container">
                                <pre className="ai-sql-block mini">
                                  <code>{msg.metadata.sql_queries[msg.metadata.sql_queries.length - 1]}</code>
                                </pre>
                                <CopySqlButton text={msg.metadata.sql_queries[msg.metadata.sql_queries.length - 1]} label={t('Copy SQL')} />
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="ai-msg-content">{parseMarkdown(msg.content)}</div>
                          {msg.role === 'assistant' && !msg.is_generating && (
                            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <button
                                className={`ai-tts-listen-btn ${playingMessageId === msg.id ? 'playing' : ''}`}
                                onClick={() => synthesizeAndPlay(msg.id, msg.content)}
                              >
                                {ttsLoadingMessageId === msg.id ? (
                                  <>⌛ {t('Synthesizing Zia TTS...')}</>
                                ) : playingMessageId === msg.id ? (
                                  <>⏹️ {t('Stop Voice')}</>
                                ) : (
                                  <>🔊 {t('Listen (Zia TTS)')}</>
                                )}
                              </button>
                              <button
                                className={`ai-tts-listen-btn kannada-btn ${kannadaPlayingId === msg.id ? 'playing' : ''}`}
                                onClick={() => translateAndPlayKannada(msg.id, msg.content)}
                              >
                                {kannadaLoadingId === msg.id ? (
                                  <>⌛ {t('Translating to ಕನ್ನಡ...')}</>
                                ) : kannadaPlayingId === msg.id ? (
                                  <>⏹️ {t('Stop ಕನ್ನಡ')}</>
                                ) : (
                                  <>🗣️ {t('ಕನ್ನಡದಲ್ಲಿ ಕೇಳಿ')}</>
                                )}
                              </button>
                            </div>
                          )}
                          {msg.role === 'assistant' && msg.metadata && (msg.metadata.sql_queries?.length || msg.metadata.reasoning_steps?.length) ? (
                            <details className="ai-evidence-accordion">
                              <summary className="ai-evidence-header">
                                <span>🔎 {t('Evidence Trail & Reasoning Path')}</span>
                              </summary>
                              <div className="ai-evidence-body">
                                {msg.metadata.reasoning_steps && msg.metadata.reasoning_steps.length > 0 && (
                                  <div className="ai-reasoning-section">
                                    <div className="ai-section-title">🧠 {t('Agent Reasoning Steps')}</div>
                                    <div className="ai-timeline">
                                      {msg.metadata.reasoning_steps.map((step, idx) => (
                                        <div key={idx} className="ai-timeline-step">
                                          <span className="ai-step-bullet">•</span>
                                          <span className="ai-step-text">{step}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {msg.metadata.sql_queries && msg.metadata.sql_queries.length > 0 && (
                                  <div className="ai-sql-section" style={{ marginTop: '12px' }}>
                                    <div className="ai-section-title">💻 {t('Database Queries Executed')}</div>
                                    {msg.metadata.sql_queries.map((query, idx) => (
                                      <div key={idx} className="ai-sql-container" style={{ marginBottom: '8px' }}>
                                        <pre className="ai-sql-block">
                                          <code>{query}</code>
                                        </pre>
                                        <CopySqlButton text={query} label={t('Copy SQL')} />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </details>
                          ) : null}
                        </>
                      )}
                      <span className="ai-msg-time">{formatTime(msg.created_at)}</span>
                    </div>
                  </div>
                ))}
                {loading && messages.length > 0 && !messages[messages.length - 1].is_generating && (
                  <div className="ai-message assistant">
                    <div className="ai-msg-avatar">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        <polygon points="12 11 9 13 10 9 7 7 11 7 12 3 13 7 17 7 14 9 15 13"></polygon>
                      </svg>
                    </div>
                    <div className="ai-msg-bubble">
                      <div className="ai-typing">
                        <span></span><span></span><span></span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {renderInputArea()}
            </>
          )}
        </div>
      )}

      {/* PDF Preview & Download Confirmation Modal */}
      {showPreviewModal && activeConversationId && (
        <div className="ai-modal-backdrop" onClick={() => setShowPreviewModal(false)}>
          <div className="ai-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="ai-modal-header">
              <h3>📋 {t('Report Export Preview')}</h3>
              <button className="ai-modal-close" onClick={() => setShowPreviewModal(false)} title={t('Close Preview')}>
                ×
              </button>
            </div>
            <div className="ai-modal-body">
              <iframe
                className="ai-pdf-preview-frame"
                src={`/api/ai/conversations/${activeConversationId}/pdf?preview=true`}
                title="PDF Preview"
              />
            </div>
            <div className="ai-modal-footer">
              <button className="ai-btn-secondary" onClick={() => setShowPreviewModal(false)}>
                {t('Cancel')}
              </button>
              <button
                className="ai-btn-primary"
                onClick={() => {
                  window.location.href = `/api/ai/conversations/${activeConversationId}/pdf`;
                  setShowPreviewModal(false);
                }}
              >
                {t('Confirm & Download')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zoho Catalyst Zia TTS Testing Modal */}
      {showTtsModal && (
        <div className="ai-modal-backdrop" onClick={() => setShowTtsModal(false)}>
          <div className="ai-preview-modal" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="ai-modal-header">
              <h3>🔊 {t('Zoho Catalyst Zia Text-to-Audio Synthesis')}</h3>
              <button className="ai-modal-close" onClick={() => setShowTtsModal(false)} title={t('Close Modal')}>
                ×
              </button>
            </div>
            <div className="ai-modal-body" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.825rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  {t('Input Text to Synthesize:')}
                </label>
                <textarea
                  value={ttsCustomText}
                  onChange={e => setTtsCustomText(e.target.value)}
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit'
                  }}
                  placeholder={t('Type text to speak...')}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    {t('Language')}
                  </label>
                  <select
                    value={speechLanguage}
                    onChange={e => setSpeechLanguage(e.target.value as any)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="en">English</option>
                    <option value="hi">Hindi (हिंदी)</option>
                    <option value="kn">Kannada (ಕನ್ನಡ)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    {t('Speaker')}
                  </label>
                  <select
                    value={ttsSpeaker}
                    onChange={e => setTtsSpeaker(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    {t('Emotion')}
                  </label>
                  <select
                    value={ttsEmotion}
                    onChange={e => setTtsEmotion(e.target.value as any)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="neutral">Neutral</option>
                    <option value="happy">Happy</option>
                    <option value="sad">Sad</option>
                    <option value="angry">Angry</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="ai-modal-footer">
              <button className="ai-btn-secondary" onClick={() => setShowTtsModal(false)}>
                {t('Close')}
              </button>
              <button
                className="ai-btn-primary"
                disabled={!ttsCustomText.trim() || ttsLoadingMessageId === 'test-modal'}
                onClick={() => synthesizeAndPlay('test-modal', ttsCustomText)}
                style={{ backgroundColor: playingMessageId === 'test-modal' ? '#ef4444' : '#2563eb' }}
              >
                {ttsLoadingMessageId === 'test-modal' ? (
                  <>⌛ {t('Synthesizing...')}</>
                ) : playingMessageId === 'test-modal' ? (
                  <>⏹️ {t('Stop Playback')}</>
                ) : (
                  <>🔊 {t('Play Audio')}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AiChat;
