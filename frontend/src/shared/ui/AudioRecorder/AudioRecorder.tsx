'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './AudioRecorder.module.css';

export interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => Promise<void> | void;
  onCancel?: () => void;
  className?: string;
  variant?: 'floating' | 'inline';
}

function pickSupportedMimeType() {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type));
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function AudioRecorder({ onRecordingComplete, onCancel, className, variant = 'floating' }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const durationRef = useRef(0);
  const isMountedRef = useRef(true);

  const cleanup = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    analyserRef.current = null;
    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch {
        // ignore close issues
      }
      audioContextRef.current = null;
    }
    mediaRecorderRef.current = null;
  };

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * ratio));
    const height = Math.max(1, Math.floor(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    const centerY = canvas.height / 2;
    const barCount = 42;
    const barWidth = canvas.width / (barCount * 1.6);

    for (let i = 0; i < barCount; i += 1) {
      const sampleIndex = Math.floor((i / barCount) * data.length);
      const value = data[sampleIndex] / 255;
      const barHeight = Math.max(canvas.height * 0.16, value * canvas.height * 0.76);
      const x = i * (barWidth * 1.6) + 2;
      const y = centerY - barHeight / 2;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.58)';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, barWidth, barHeight, Math.min(barWidth / 2, 8));
      } else {
        ctx.rect(x, y, barWidth, barHeight);
      }
      ctx.fill();
    }

    animationRef.current = requestAnimationFrame(drawWaveform);
  };

  const initializeRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (!isMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      const context = new AudioContextCtor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);

      const mimeType = pickSupportedMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      streamRef.current = stream;
      audioContextRef.current = context;
      analyserRef.current = analyser;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      durationRef.current = 0;
      setDuration(0);
      setIsRecording(true);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.start(250);
      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setDuration(durationRef.current);
      }, 1000);

      drawWaveform();
    } catch {
      setError('Нет доступа к микрофону. Проверь разрешения браузера.');
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    setIsProcessing(true);

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });

    const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
    const recordedDuration = durationRef.current;
    setIsRecording(false);
    await cleanup();

    try {
      if (blob.size > 0) {
        await onRecordingComplete(blob, recordedDuration);
      }
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  };

  const cancelRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    chunksRef.current = [];
    durationRef.current = 0;
    setDuration(0);
    setIsRecording(false);
    setIsProcessing(false);
    await cleanup();
    onCancel?.();
  };

  useEffect(() => {
    isMountedRef.current = true;
    void initializeRecording();
    return () => {
      isMountedRef.current = false;
      void cleanup();
    };
  }, []);

  return (
    <div className={[styles.audioRecorderContainer, variant === 'inline' ? styles.inline : styles.floating, className].filter(Boolean).join(' ')}>
      <div className={styles.panel}>
        <div className={styles.topRow}>
          <div className={styles.state}>
            <span className={styles.redDot} />
            <span>{error ? 'Микрофон недоступен' : isProcessing ? 'Подготавливаем голосовое' : 'Запись голосового'}</span>
          </div>
          <div className={styles.timer}>{formatTime(duration)}</div>
        </div>

        <div className={styles.waveformWrap}>
          <canvas ref={canvasRef} className={styles.waveform} />
          {error ? <div className={styles.errorOverlay}>{error}</div> : null}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.ghostButton} onClick={() => void cancelRecording()} disabled={isProcessing} aria-label="Отменить запись">
            <CloseIcon />
          </button>
          <button type="button" className={styles.primaryButton} onClick={() => void stopRecording()} disabled={!isRecording || isProcessing || Boolean(error)} aria-label="Остановить запись">
            {isProcessing ? <span className={styles.spinner} /> : <SendIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 6 18 18M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 11.5 20 4l-4.5 16-3.3-5.2L4 11.5Zm8.2 3.3L20 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
