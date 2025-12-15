import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { useEffect, useRef, useState } from 'react';

interface ScannerProps {
  active: boolean;
  onScan: (text: string, format: string) => void;
  onError?: (message: string) => void;
  messages: {
    insecure: string;
    unsupported: string;
    startFailed: string;
  };
}

export function Scanner({ active, onScan, onError, messages }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastResultRef = useRef<string | null>(null);
  const lastResultAtRef = useRef<number>(0);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();

    if (!active) {
      controlsRef.current?.stop();
      return () => controlsRef.current?.stop();
    }

    if (!window.isSecureContext) {
      setPermissionError(messages.insecure);
      return undefined;
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setPermissionError(messages.unsupported);
      return undefined;
    }

    let isMounted = true;

    reader
      .decodeFromConstraints(
        {
          video: {
            facingMode: 'environment',
          },
        },
        videoRef.current!,
        (result, error, controls) => {
          controlsRef.current = controls;
          if (error) {
            return;
          }

          if (!result) {
            return;
          }

          if (isMounted) {
            const text = result.getText();
            const now = Date.now();

            if (lastResultRef.current === text && now - lastResultAtRef.current < 500) {
              return;
            }

            lastResultRef.current = text;
            lastResultAtRef.current = now;
            onScan(text, result.getBarcodeFormat().toString());
          }
        },
      )
      .catch((error) => {
        const message = error instanceof Error ? error.message : messages.startFailed;
        setPermissionError(message);
        onError?.(message);
      });

    return () => {
      isMounted = false;
      controlsRef.current?.stop();
    };
  }, [active, onError, onScan]);

  return (
    <div className="scanner-shell">
      <div className="scanner-viewfinder">
        <video ref={videoRef} muted autoPlay playsInline />
        <div className="scanner-overlay" />
      </div>
      {permissionError ? <p className="small-note">{permissionError}</p> : null}
    </div>
  );
}
