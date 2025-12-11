import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { useEffect, useRef, useState } from 'react';

interface ScannerProps {
  active: boolean;
  onScan: (text: string, format: string) => void;
  onError?: (message: string) => void;
}

export function Scanner({ active, onScan, onError }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();

    if (!active) {
      controlsRef.current?.stop();
      return () => controlsRef.current?.stop();
    }

    if (!window.isSecureContext) {
      setPermissionError('Camera access requires HTTPS (or localhost for dev).');
      return undefined;
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setPermissionError('Camera access is not supported in this browser.');
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
            onScan(result.getText(), result.getBarcodeFormat().toString());
          }
        },
      )
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Unable to start scanner';
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
