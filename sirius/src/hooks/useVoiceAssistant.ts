import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceName } from '../types.ts';

interface UseVoiceAssistantOptions {
  onTranscriptReady: (text: string) => void;
  onError: (message: string) => void;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function useVoiceAssistant({ onTranscriptReady, onError }: UseVoiceAssistantOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [isSynthesizingSpeech, setIsSynthesizingSpeech] = useState(false);

  // Live audio level ref (0..1) read by the 3D canvas animation loop without React re-renders
  const audioLevelRef = useRef<number>(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const micRafRef = useRef<number | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);

  const playbackContextRef = useRef<AudioContext | null>(null);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playbackRafRef = useRef<number | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);

  const cleanupMicPipeline = useCallback(() => {
    if (micRafRef.current !== null) {
      cancelAnimationFrame(micRafRef.current);
      micRafRef.current = null;
    }
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
    if (micContextRef.current) {
      void micContextRef.current.close().catch(() => {});
      micContextRef.current = null;
    }
    audioLevelRef.current = 0;
  }, []);

  const stopSpeaking = useCallback(() => {
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    if (playbackRafRef.current !== null) {
      cancelAnimationFrame(playbackRafRef.current);
      playbackRafRef.current = null;
    }
    if (playbackSourceRef.current) {
      try {
        playbackSourceRef.current.stop();
        playbackSourceRef.current.disconnect();
      } catch {
        // Already stopped
      }
      playbackSourceRef.current = null;
    }
    audioLevelRef.current = 0;
    setIsSynthesizingSpeech(false);
    setIsSpeaking(false);
    setSpeakingMessageId(null);
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      cleanupMicPipeline();
      setIsRecording(false);
    }
  }, [cleanupMicPipeline]);

  const startRecording = useCallback(async () => {
    if (isRecording || isTranscribing) {
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError('Brauzeringiz mikrofon yozuvini qo‘llab-quvvatlamaydi.');
      return;
    }

    stopSpeaking();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        micContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const meterTick = () => {
          if (!micContextRef.current) {
            return;
          }
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / (dataArray.length * 255);
          audioLevelRef.current = Math.min(1, avg * 2.8);
          micRafRef.current = requestAnimationFrame(meterTick);
        };
        micRafRef.current = requestAnimationFrame(meterTick);
      }

      const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const chosenType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || '';
      const recorder = chosenType
        ? new MediaRecorder(stream, { mimeType: chosenType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const recordedType = recorder.mimeType || 'audio/webm';
        const chunks = [...audioChunksRef.current];
        audioChunksRef.current = [];
        cleanupMicPipeline();
        setIsRecording(false);

        if (chunks.length === 0) {
          return;
        }

        const blob = new Blob(chunks, { type: recordedType });
        if (blob.size < 400) {
          return;
        }

        setIsTranscribing(true);
        try {
          const buffer = await blob.arrayBuffer();
          const audioBase64 = arrayBufferToBase64(buffer);
          const resp = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64,
              mimeType: recordedType,
            }),
          });
          const data = await resp.json();
          if (!resp.ok) {
            throw new Error(data?.error || 'Ovozni matnga o‘girishda xatolik.');
          }
          const text = typeof data?.text === 'string' ? data.text.trim() : '';
          if (text) {
            onTranscriptReady(text);
          } else {
            onError('Nutq aniqlanmadi. Iltimos, aniqroq gapirib qayta urinib ko‘ring.');
          }
        } catch (err) {
          onError(err instanceof Error ? err.message : 'Ovozni aniqlashda xatolik yuz berdi.');
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start(250);
      setIsRecording(true);
    } catch (err) {
      cleanupMicPipeline();
      setIsRecording(false);
      const msg = err instanceof Error ? err.message : String(err);
      if (/Permission|NotAllowed|denied/i.test(msg)) {
        onError('Mikrofon ruxsati berilmadi. Brauzer sozlamalaridan ruxsat bering.');
      } else {
        onError('Mikrofonni ishga tushirib bo‘lmadi.');
      }
    }
  }, [cleanupMicPipeline, isRecording, isTranscribing, onError, onTranscriptReady, stopSpeaking]);

  const speakText = useCallback(
    async (text: string, voiceName: VoiceName, messageId: string | null = null) => {
      if (!text.trim()) {
        return;
      }

      if (isSpeaking && messageId && speakingMessageId === messageId) {
        stopSpeaking();
        return;
      }

      stopSpeaking();
      const controller = new AbortController();
      ttsAbortRef.current = controller;
      setIsSynthesizingSpeech(true);
      setSpeakingMessageId(messageId);

      try {
        const resp = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voiceName }),
          signal: controller.signal,
        });
        const data = await resp.json();
        if (!resp.ok || !data?.audioBase64) {
          throw new Error(data?.error || 'Ovoz yaratib bo‘lmadi.');
        }

        if (controller.signal.aborted) {
          return;
        }

        const arrayBuf = base64ToArrayBuffer(data.audioBase64);
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

        if (!AudioCtx) {
          throw new Error('Brauzer audio tizimini qo‘llab-quvvatlamaydi.');
        }

        if (!playbackContextRef.current || playbackContextRef.current.state === 'closed') {
          playbackContextRef.current = new AudioCtx();
        }
        const ctx = playbackContextRef.current;
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        const audioBuffer = await ctx.decodeAudioData(arrayBuf.slice(0));
        if (controller.signal.aborted) {
          return;
        }

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyser.connect(ctx.destination);

        const freqData = new Uint8Array(analyser.frequencyBinCount);
        playbackSourceRef.current = source;

        setIsSynthesizingSpeech(false);
        setIsSpeaking(true);

        const meterTick = () => {
          if (!playbackSourceRef.current) {
            return;
          }
          analyser.getByteFrequencyData(freqData);
          let sum = 0;
          for (let i = 0; i < freqData.length; i++) {
            sum += freqData[i];
          }
          audioLevelRef.current = Math.min(1, (sum / (freqData.length * 255)) * 2.5);
          playbackRafRef.current = requestAnimationFrame(meterTick);
        };
        playbackRafRef.current = requestAnimationFrame(meterTick);

        source.onended = () => {
          if (playbackSourceRef.current === source) {
            stopSpeaking();
          }
        };

        source.start(0);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          return;
        }
        stopSpeaking();
        onError(err instanceof Error ? err.message : 'Ovozli ijro xatoligi.');
      }
    },
    [isSpeaking, onError, speakingMessageId, stopSpeaking]
  );

  useEffect(() => {
    return () => {
      cleanupMicPipeline();
      stopSpeaking();
      if (playbackContextRef.current) {
        void playbackContextRef.current.close().catch(() => {});
        playbackContextRef.current = null;
      }
    };
  }, [cleanupMicPipeline, stopSpeaking]);

  return {
    isRecording,
    isTranscribing,
    isSpeaking,
    isSynthesizingSpeech,
    speakingMessageId,
    audioLevelRef,
    startRecording,
    stopRecording,
    speakText,
    stopSpeaking,
  };
}
