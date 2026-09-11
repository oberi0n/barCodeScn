import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { useEffect, useRef, useState } from 'react';

export interface ScanFeedback {
  phase: 'detected' | 'sent' | 'failed';
  text: string;
  format: string;
  responseCode?: number;
  error?: string;
}

interface ScannerProps {
  active: boolean;
  onScan: (text: string, format: string) => boolean;
  onError?: (message: string) => void;
  feedback: ScanFeedback | null;
  labels: {
    ready: string;
    detected: string;
    sending: string;
    sent: (code?: number) => string;
    failed: (reason: string) => string;
  };
  messages: {
    insecure: string;
    unsupported: string;
    startFailed: string;
  };
}

const IGNORED_DECODE_ERRORS = new Set(['NotFoundException', 'ChecksumException', 'FormatException']);

function waitForVideoFrames(video: HTMLVideoElement, timeoutMs = 5000): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Camera stream did not provide readable video frames.'));
    }, timeoutMs);
    let interval = 0;

    const check = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
        cleanup();
        resolve();
      }
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
      video.removeEventListener('loadedmetadata', check);
      video.removeEventListener('canplay', check);
    };

    video.addEventListener('loadedmetadata', check);
    video.addEventListener('canplay', check);
    interval = window.setInterval(check, 50);
    check();
  });
}

async function openCamera(): Promise<MediaStream> {
  const preferredConstraints: MediaStreamConstraints = {
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  };

  try {
    return await navigator.mediaDevices.getUserMedia(preferredConstraints);
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (!['OverconstrainedError', 'NotFoundError'].includes(name)) throw error;
    console.warn('Preferred rear-camera constraints unavailable; retrying with browser defaults.', error);
    return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
  }
}

export function Scanner({ active, onScan, onError, feedback, labels, messages }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  onScanRef.current = onScan;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!active) return undefined;

    if (!window.isSecureContext) {
      setPermissionError(messages.insecure);
      return undefined;
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setPermissionError(messages.unsupported);
      return undefined;
    }

    const reader = new BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 120,
      delayBetweenScanSuccess: 150,
    });
    let cancelled = false;
    let lastLoggedError = '';

    const stop = () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    const start = async () => {
      const video = videoRef.current;
      if (!video) throw new Error(messages.startFailed);

      setPermissionError(null);
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('autoplay', '');
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');

      const stream = await openCamera();
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      await waitForVideoFrames(video);
      if (cancelled) return;

      console.info('Camera started', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        readyState: video.readyState,
        paused: video.paused,
        trackSettings: stream.getVideoTracks()[0]?.getSettings(),
      });

      controlsRef.current = await reader.decodeFromVideoElement(video, (result, error) => {
        if (cancelled || !result) {
          if (error && !IGNORED_DECODE_ERRORS.has(error.name) && error.name !== lastLoggedError) {
            lastLoggedError = error.name;
            console.error('ZXing decoding error', error);
          }
          return;
        }

        const text = result.getText();
        const format = result.getBarcodeFormat().toString();
        if (!onScanRef.current(text, format)) return;

        console.info('Barcode detected', { format, value: text });
      });
      console.info('ZXing scanning started');
    };

    start().catch((error) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : messages.startFailed;
      console.error('Unable to start scanner', error);
      setPermissionError(message);
      onErrorRef.current?.(message);
      stop();
    });

    return stop;
  }, [active, messages.insecure, messages.startFailed, messages.unsupported]);

  const visibleError = feedback?.error === 'Location unavailable - webhook not sent'
    ? 'Location unavailable'
    : feedback?.error;
  const feedbackTitle = feedback
    ? feedback.phase === 'detected'
      ? labels.detected
      : feedback.phase === 'sent'
        ? labels.sent(feedback.responseCode)
        : labels.failed(visibleError ?? 'Unknown error')
    : labels.ready;

  return (
    <div className={`scanner-shell ${feedback ? `scan-${feedback.phase}` : ''}`}>
      <div className="scanner-viewfinder">
        <video ref={videoRef} muted autoPlay playsInline />
        <div className="scanner-overlay" />
        <div className={`scan-feedback ${feedback ? feedback.phase : 'ready'}`} role="status" aria-live="polite">
          <strong>{feedback ? (feedback.phase === 'failed' ? '⚠' : '✓') : '●'} {feedbackTitle}</strong>
          {feedback ? <span className="scan-feedback-value">{feedback.text}</span> : null}
          {feedback ? <span>{feedback.format.replaceAll('_', '-')}</span> : null}
          {feedback?.phase === 'detected' ? <span>{labels.sending}</span> : null}
        </div>
      </div>
      {permissionError ? <p className="small-note">{permissionError}</p> : null}
    </div>
  );
}
