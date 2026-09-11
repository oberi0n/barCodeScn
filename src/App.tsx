import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScanFeedback, Scanner } from './components/Scanner';
import { usePersistentState } from './hooks/usePersistentState';
import { AVAILABLE_LANGUAGES, Language, getTranslations } from './lib/i18n';
import { HttpMethod, LocationStatus, ScanLocation, ScanRecord, WebhookConfig, WebhookTarget } from './lib/types';
import { sendWebhook } from './lib/webhook';

function createBlankConfig(): WebhookConfig {
  return {
    webhooks: [
      { url: '', method: 'POST', headers: [] },
      { url: '', method: 'POST', headers: [] },
    ],
    primaryFormats: ['QR_CODE'],
    pauseMs: 1200,
  };
}

const METHODS: HttpMethod[] = ['POST', 'PUT', 'PATCH', 'GET'];

function normalizeFormat(format: string) {
  return format.trim().toUpperCase();
}

function selectWebhook(config: WebhookConfig, format: string) {
  const primaryFormats = config.primaryFormats.map(normalizeFormat);
  const index = primaryFormats.includes(normalizeFormat(format)) ? 0 : 1;
  return { target: config.webhooks[index], index };
}

interface DebugEntry {
  id: number;
  timestamp: string;
  message: string;
}

function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

function isToday(iso: string) {
  const timestamp = new Date(iso).getTime();
  const { start, end } = todayRange();
  return timestamp >= start && timestamp < end;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function locationFromPosition(position: GeolocationPosition): ScanLocation {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp,
  };
}

function locationStatusFromError(error: GeolocationPositionError): LocationStatus {
  if (error.code === error.PERMISSION_DENIED) return 'permission-denied';
  if (error.code === error.TIMEOUT) return 'timeout';
  return 'unavailable';
}

function healthUrlFromWebhook(webhookUrl: string): string | null {
  if (!webhookUrl) return null;
  const url = new URL(webhookUrl, window.location.origin);
  if (!/\/scan\/?$/.test(url.pathname)) return null;
  url.pathname = url.pathname.replace(/\/scan\/?$/, '/healthz');
  url.search = '';
  url.hash = '';
  return webhookUrl.startsWith('/') ? `${url.pathname}` : url.toString();
}

function filterToday(records: ScanRecord[]) {
  return records.filter((record) => isToday(record.scannedAt)).sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
}

function pruneToToday(records: ScanRecord[]) {
  return records.filter((record) => isToday(record.scannedAt));
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'scan' | 'settings'>('scan');
  const [history, setHistory] = usePersistentState<ScanRecord[]>('history', []);
  const [config, setConfig] = usePersistentState<WebhookConfig>('webhook-config', createBlankConfig());
  const [language, setLanguage] = usePersistentState<Language>('language', 'en');
  const [scannerActive, setScannerActive] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback | null>(null);
  const sendingRef = useRef(false);
  const lastScanAtRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const feedbackSequenceRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const latestLocationRef = useRef<ScanLocation | null>(null);
  const locationStatusRef = useRef<LocationStatus>('unavailable');
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('unavailable');
  const [currentLocation, setCurrentLocation] = useState<ScanLocation | null>(null);
  const [locationAcquiring, setLocationAcquiring] = useState(false);
  const [debugMode, setDebugMode] = usePersistentState<boolean>('debug-mode', false);
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);
  const debugSequenceRef = useRef(0);
  const todayHistory = useMemo(() => filterToday(history), [history]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const APP_VERSION = '0.3.5';
  const scannerSectionRef = useRef<HTMLElement | null>(null);
  const t = useMemo(() => getTranslations(language), [language]);
  const addDebugLog = useCallback((message: string) => {
    if (!debugMode) return;
    const entry: DebugEntry = {
      id: ++debugSequenceRef.current,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      message,
    };
    setDebugEntries((previous) => [...previous, entry].slice(-50));
  }, [debugMode]);

  useEffect(() => {
    if (!debugMode) return;
    addDebugLog(`Webhook 1 URL: ${config.webhooks[0].url || '(not configured)'}`);
    addDebugLog(`Webhook 2 URL: ${config.webhooks[1].url || '(not configured)'}`);
    addDebugLog(`Primary formats: ${config.primaryFormats.join(', ') || '(none)'}`);
  }, [debugMode]);

  useEffect(() => {
    if (todayHistory.length !== history.length) {
      setHistory((prev) => pruneToToday(prev));
    }
  }, [history.length, todayHistory.length, setHistory]);

  useEffect(() => {
    setConfig((prev) => {
      // Migrate the former single-webhook configuration without losing local settings.
      const legacy = prev as WebhookConfig & Partial<WebhookTarget>;
      const blank = createBlankConfig();
      const normalized: WebhookConfig = {
        webhooks: Array.isArray(prev?.webhooks) && prev.webhooks.length === 2
          ? prev.webhooks
          : [
              {
                url: legacy?.url ?? '',
                method: legacy?.method ?? 'POST',
                headers: Array.isArray(legacy?.headers) ? legacy.headers : [],
              },
              blank.webhooks[1],
            ],
        primaryFormats: Array.isArray(prev?.primaryFormats) ? prev.primaryFormats : ['QR_CODE'],
        pauseMs:
          prev?.pauseMs === undefined || Number.isNaN(prev.pauseMs) || prev.pauseMs < 0
            ? 1200
            : prev.pauseMs,
      };

      const unchanged =
        normalized.webhooks === prev?.webhooks &&
        normalized.primaryFormats === prev?.primaryFormats &&
        normalized.pauseMs === prev?.pauseMs &&
        Array.isArray(prev?.webhooks);

      return unchanged ? prev : normalized;
    });
  }, [setConfig]);

  useEffect(() => {
    document.body.classList.toggle('no-scroll', scannerActive);
    return () => document.body.classList.remove('no-scroll');
  }, [scannerActive]);

  useEffect(() => () => {
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    void audioContextRef.current?.close();
  }, []);

  useEffect(() => {
    if (!scannerActive) return undefined;
    if (!('geolocation' in navigator)) {
      locationStatusRef.current = 'unsupported';
      setLocationStatus('unsupported');
      return undefined;
    }

    let active = true;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!active) return;
        latestLocationRef.current = locationFromPosition(position);
        locationStatusRef.current = 'available';
        setLocationStatus('available');
      },
      (error) => {
        if (!active) return;
        const status = locationStatusFromError(error);
        if (status === 'permission-denied') latestLocationRef.current = null;
        locationStatusRef.current = status;
        setLocationStatus(status);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 8000 },
    );

    return () => {
      active = false;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [scannerActive]);

  useEffect(() => () => {
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    void audioContextRef.current?.close();
  }, []);

  useEffect(() => {
    if (!scannerActive) return undefined;
    if (!('geolocation' in navigator)) {
      locationStatusRef.current = 'unsupported';
      setLocationStatus('unsupported');
      return undefined;
    }

    let active = true;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!active) return;
        latestLocationRef.current = locationFromPosition(position);
        locationStatusRef.current = 'available';
        setLocationStatus('available');
      },
      (error) => {
        if (!active) return;
        const status = locationStatusFromError(error);
        if (status === 'permission-denied') latestLocationRef.current = null;
        locationStatusRef.current = status;
        setLocationStatus(status);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 8000 },
    );

    return () => {
      active = false;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [scannerActive]);

  useEffect(() => () => {
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    void audioContextRef.current?.close();
  }, []);

  useEffect(() => {
    if (!scannerActive) return undefined;
    if (!('geolocation' in navigator)) {
      locationStatusRef.current = 'unsupported';
      setLocationStatus('unsupported');
      return undefined;
    }

    let active = true;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!active) return;
        latestLocationRef.current = locationFromPosition(position);
        locationStatusRef.current = 'available';
        setLocationStatus('available');
      },
      (error) => {
        if (!active) return;
        const status = locationStatusFromError(error);
        if (status === 'permission-denied') latestLocationRef.current = null;
        locationStatusRef.current = status;
        setLocationStatus(status);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 8000 },
    );

    return () => {
      active = false;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [scannerActive]);

  useEffect(() => () => {
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    void audioContextRef.current?.close();
  }, []);

  useEffect(() => {
    if (!scannerActive) return undefined;
    setLocationAcquiring(true);
    if (!('geolocation' in navigator)) {
      locationStatusRef.current = 'unsupported';
      setLocationStatus('unsupported');
      setLocationAcquiring(false);
      addDebugLog('Geolocation unsupported');
      return undefined;
    }

    let active = true;
    addDebugLog('Geolocation watch started');
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!active) return;
        latestLocationRef.current = locationFromPosition(position);
        setCurrentLocation(latestLocationRef.current);
        locationStatusRef.current = 'available';
        setLocationStatus('available');
        setLocationAcquiring(false);
        addDebugLog(`Location acquired: lat=${position.coords.latitude.toFixed(6)} lon=${position.coords.longitude.toFixed(6)} accuracy=${Math.round(position.coords.accuracy)}m`);
      },
      (error) => {
        if (!active) return;
        const status = locationStatusFromError(error);
        if (status === 'permission-denied') {
          latestLocationRef.current = null;
          setCurrentLocation(null);
        }
        locationStatusRef.current = status;
        setLocationStatus(status);
        setLocationAcquiring(false);
        addDebugLog(`Geolocation ${status}`);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 8000 },
    );

    return () => {
      active = false;
      navigator.geolocation.clearWatch(watchId);
      addDebugLog('Geolocation watch stopped');
    };
  }, [scannerActive, addDebugLog]);

  useEffect(() => () => {
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    void audioContextRef.current?.close();
  }, []);

  useEffect(() => {
    const modalOpen = showResetConfirm || showClearConfirm;
    document.body.classList.toggle('modal-open', modalOpen);
    return () => document.body.classList.remove('modal-open');
  }, [showResetConfirm, showClearConfirm]);

  useEffect(() => {
    if (scannerActive && scannerSectionRef.current) {
      const target = scannerSectionRef.current;
      requestAnimationFrame(() => {
        const top = target.getBoundingClientRect().top + window.scrollY - 10;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    }
  }, [scannerActive]);

  const playConfirmation = () => {
    const context = audioContextRef.current;
    if (context) {
      void context.resume().then(() => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.05, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.09);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.1);
      }).catch(() => undefined);
    }
    navigator.vibrate?.(80);
  };

  const prepareAudio = () => {
    if (!audioContextRef.current) {
      const AudioContextConstructor = window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextConstructor) audioContextRef.current = new AudioContextConstructor();
    }
    void audioContextRef.current?.resume().catch(() => undefined);
  };

  const toggleScanner = () => {
    if (!scannerActive) prepareAudio();
    else setScanFeedback(null);
    setScannerActive((previous) => !previous);
  };

  const handleScan = (text: string, format: string) => {
    if (sendingRef.current) {
      console.info('[scan] ignored: webhook already in progress', { text, format });
      return false;
    }

    const now = Date.now();
    if (lastScanAtRef.current && now - lastScanAtRef.current < Math.max(0, config.pauseMs)) {
      const remaining = Math.max(0, config.pauseMs - (now - lastScanAtRef.current));
      console.info('[scan] ignored: pause active', { text, format, remainingMs: remaining });
      setLastError(t.scanner.waitMessage(remaining));
      return false;
    }

    lastScanAtRef.current = now;

    const latestLocation = latestLocationRef.current;
    const recentLocation = latestLocation?.timestamp && Date.now() - latestLocation.timestamp <= 30000
      ? { ...latestLocation }
      : undefined;
    const record: ScanRecord = {
      id: crypto.randomUUID(),
      text,
      format,
      scannedAt: new Date().toISOString(),
      status: 'pending',
      location: recentLocation,
      locationStatus: recentLocation ? 'available' : locationStatusRef.current,
    };
    console.info('[scan] accepted', { text, format });
    addDebugLog(`Barcode accepted: ${text} ${format}`);

    setHistory((prev) => pruneToToday([record, ...prev]));
    sendingRef.current = true;
    setLastError(null);
    const sequence = ++feedbackSequenceRef.current;
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    setScanFeedback({
      phase: 'detected',
      text,
      format,
      detail: recentLocation ? t.scanner.feedback.sendingWebhook : t.scanner.feedback.waitingLocation,
    });
    playConfirmation();
    if (recentLocation) {
      const ageSeconds = Math.max(0, Math.round((Date.now() - (recentLocation.timestamp ?? Date.now())) / 1000));
      addDebugLog(`Using cached location: age=${ageSeconds}s`);
    } else {
      addDebugLog('No recent location available');
    }

    const locationPromise = recentLocation
      ? Promise.resolve<ScanLocation | null>(recentLocation)
      : new Promise<ScanLocation | null>((resolve) => {
          if (!('geolocation' in navigator) || locationStatusRef.current === 'permission-denied') {
            addDebugLog(`Current location not requested: ${locationStatusRef.current}`);
            resolve(null);
            return;
          }

          addDebugLog('Requesting current position');
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const location = locationFromPosition(position);
              latestLocationRef.current = location;
              setCurrentLocation(location);
              locationStatusRef.current = 'available';
              setLocationStatus('available');
              setHistory((previous) => previous.map((item) =>
                item.id === record.id ? { ...item, location, locationStatus: 'available' } : item,
              ));
              addDebugLog(`Location acquired: lat=${location.latitude.toFixed(6)} lon=${location.longitude.toFixed(6)} accuracy=${Math.round(location.accuracy ?? 0)}m`);
              resolve(location);
            },
            (error) => {
              const status = locationStatusFromError(error);
              const cachedLocation = latestLocationRef.current;
              const hasRecentLocation = Boolean(
                cachedLocation?.timestamp && Date.now() - cachedLocation.timestamp <= 30000,
              );
              if (!hasRecentLocation) {
                locationStatusRef.current = status;
                setLocationStatus(status);
              }
              addDebugLog(`Geolocation ${status}`);
              setHistory((previous) => previous.map((item) => {
                if (item.id !== record.id || item.location) return item;
                return hasRecentLocation && cachedLocation
                  ? { ...item, location: { ...cachedLocation }, locationStatus: 'available' }
                  : { ...item, locationStatus: status };
              }));
              resolve(hasRecentLocation ? cachedLocation : null);
            },
            { enableHighAccuracy: true, maximumAge: 15000, timeout: 8000 },
          );
        });

    void (async () => {
      const webhookLocation = await locationPromise;
      if (feedbackSequenceRef.current === sequence && webhookLocation) {
        setScanFeedback({ phase: 'detected', text, format, detail: t.scanner.feedback.sendingWebhook });
      }
      const { target, index } = selectWebhook(config, format);
      addDebugLog(`Format: ${format}`);
      addDebugLog(`Selected webhook: #${index + 1}`);
      addDebugLog(`URL: ${target.url || '(not configured)'}`);
      addDebugLog(`Method: ${target.method}`);
      console.info('[scan] invoking webhook');
      const [result] = await Promise.all([
        sendWebhook({ ...record, location: webhookLocation ?? undefined }, target, addDebugLog),
        new Promise((resolve) => window.setTimeout(resolve, 1000)),
      ]);
      setHistory((prev) =>
        prev.map((item) =>
          item.id === record.id
            ? { ...item, status: result.status, responseCode: result.responseCode, error: result.error }
            : item,
        ),
      );
      sendingRef.current = false;
      if (feedbackSequenceRef.current !== sequence) return;
      setScanFeedback({
        phase: result.status === 'sent' ? 'sent' : 'failed',
        text,
        format,
        responseCode: result.responseCode,
        error: result.error,
      });
      feedbackTimerRef.current = window.setTimeout(() => {
        if (feedbackSequenceRef.current === sequence) setScanFeedback(null);
      }, Math.max(1200, config.pauseMs - 1000));
    })();

    return true;
  };

  const updateConfig = (value: Partial<WebhookConfig>) => {
    setConfig((prev) => ({ ...prev, ...value }));
  };

  const updateWebhook = (index: number, value: Partial<WebhookTarget>) => {
    setConfig((prev) => {
      const webhooks = [...prev.webhooks] as [WebhookTarget, WebhookTarget];
      webhooks[index] = { ...webhooks[index], ...value };
      return { ...prev, webhooks };
    });
  };

  const addHeader = (webhookIndex: number) => {
    const target = config.webhooks[webhookIndex];
    updateWebhook(webhookIndex, { headers: [...target.headers, { key: '', value: '' }] });
  };

  const updateHeader = (webhookIndex: number, index: number, key: 'key' | 'value', value: string) => {
    setConfig((prev) => {
      const webhooks = [...prev.webhooks] as [WebhookTarget, WebhookTarget];
      const headers = [...webhooks[webhookIndex].headers];
      headers[index] = { ...headers[index], [key]: value };
      webhooks[webhookIndex] = { ...webhooks[webhookIndex], headers };
      return { ...prev, webhooks };
    });
  };

  const deleteHeader = (webhookIndex: number, index: number) => {
    const target = config.webhooks[webhookIndex];
    updateWebhook(webhookIndex, { headers: target.headers.filter((_, i) => i !== index) });
  };

  const resetConfig = () => {
    setShowResetConfirm(true);
  };
  const clearHistory = () => setShowClearConfirm(true);

  const handleConfirmReset = () => {
    setConfig(createBlankConfig());
    setShowResetConfirm(false);
  };

  const handleCloseResetModal = () => setShowResetConfirm(false);

  const handleConfirmClearHistory = () => {
    setHistory([]);
    setShowClearConfirm(false);
  };

  const handleCloseClearModal = () => setShowClearConfirm(false);

  const runWebhookTest = async (webhookIndex: number) => {
    const target = config.webhooks[webhookIndex];
    if (!target.url) {
      setWebhookStatus(t.settings.testMissingUrl);
      return;
    }
    setTestingWebhook(true);
    setWebhookStatus(t.settings.testSendingStatus);
    addDebugLog(`Test API started for webhook #${webhookIndex + 1}: ${target.method} ${target.url}`);

    if (!('geolocation' in navigator)) {
      setWebhookStatus(t.settings.testLocationUnavailable);
      addDebugLog('Test API stopped: geolocation unsupported');
      setTestingWebhook(false);
      return;
    }

    addDebugLog('Requesting current position for API test');
    const location = await new Promise<ScanLocation | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(locationFromPosition(position)),
        (error) => {
          addDebugLog(`Test API geolocation failed: ${locationStatusFromError(error)}`);
          resolve(null);
        },
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 8000 },
      );
    });
    if (!location) {
      setWebhookStatus(t.settings.testLocationUnavailable);
      setTestingWebhook(false);
      return;
    }
    latestLocationRef.current = location;
    setCurrentLocation(location);
    locationStatusRef.current = 'available';
    setLocationStatus('available');
    addDebugLog(`Test location acquired: lat=${location.latitude.toFixed(6)} lon=${location.longitude.toFixed(6)} accuracy=${Math.round(location.accuracy ?? 0)}m`);

    const now = new Date().toISOString();
    const result = await sendWebhook(
      { id: `test-${now}`, text: 'TEST-BARCODE', format: 'TEST', scannedAt: now, location },
      target,
      addDebugLog,
    );

    if (result.status === 'sent') {
      setWebhookStatus(t.settings.testSuccess(result.responseCode));
    } else {
      setWebhookStatus(result.error ? t.settings.testFailed(result.error) : t.settings.testNoResponse);
    }

    setTestingWebhook(false);
  };

  const runNetworkTest = async (webhookIndex: number) => {
    const healthUrl = healthUrlFromWebhook(config.webhooks[webhookIndex].url);
    if (!healthUrl) {
      const message = t.settings.networkFailed('invalid webhook URL');
      setWebhookStatus(message);
      addDebugLog('Test network stopped: cannot derive /healthz from webhook URL');
      return;
    }

    setTestingWebhook(true);
    setWebhookStatus(t.settings.networkTesting);
    addDebugLog(`Test network: GET ${healthUrl}`);
    try {
      const response = await fetch(healthUrl, { method: 'GET' });
      addDebugLog(`Network test HTTP response: ${response.status}`);
      setWebhookStatus(response.ok
        ? t.settings.networkSuccess(response.status)
        : t.settings.networkFailed(`HTTP ${response.status}`));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Network error';
      addDebugLog(`Network test failed: ${reason}`);
      setWebhookStatus(t.settings.networkFailed('Network error'));
    } finally {
      setTestingWebhook(false);
    }
  };

  return (
    <div className={`stack app-shell ${scannerActive ? 'scan-mode' : ''}`}>
      <header className="hero">
        <div className="brand">
          <img className="brand-logo" src="/logo.png" alt="labo.lu logo" />
          
          <span className="version-chip">v{APP_VERSION}</span>
        </div>
        <div className="tabs">
          <button className={`tab ${activeTab === 'scan' ? 'active' : ''}`} onClick={() => setActiveTab('scan')}>
            {t.tabs.scan}
          </button>
          <button className={`tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
            {t.tabs.settings}
          </button>
        </div>
      </header>

      {activeTab === 'scan' ? (
        <section
          className={`card stack scan-card ${scannerActive ? 'scanning' : ''}`}
          ref={scannerSectionRef}
        >
          <div className="flex-between">
            <div className="stack">
              <h2 className="section-heading">
                <span className="pill" aria-hidden>
                  ●
                </span>
                {t.scanner.title}
              </h2>
            </div>
            <div className="flex-row">
              <button className="button secondary" onClick={clearHistory} disabled={!history.length}>
                {t.scanner.clearToday}
              </button>
              <button className="button" onClick={toggleScanner}>
                {scannerActive ? t.scanner.stop : t.scanner.start}
              </button>
            </div>
          </div>

          {scannerActive ? (
            <Scanner
              active={scannerActive}
              onScan={handleScan}
              onError={setLastError}
              onDebug={addDebugLog}
              feedback={scanFeedback}
              labels={t.scanner.feedback}
              messages={t.scanner.cameraErrors}
            />
          ) : null}
          {scannerActive ? (
            <p className={`small-note location-note location-${locationStatus}`} role="status">
              {locationAcquiring
                ? t.scanner.locationStatuses.acquiring
                : locationStatus === 'available'
                  ? t.scanner.locationStatuses.ready(currentLocation?.accuracy)
                  : t.scanner.locationStatuses[locationStatus]}
            </p>
          ) : null}
          {lastError ? <p className="small-note">{lastError}</p> : null}

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>{t.scanner.table.value}</th>
                  <th>{t.scanner.table.format}</th>
                  <th>{t.scanner.table.time}</th>
                  <th>{t.scanner.table.status}</th>
                </tr>
              </thead>
              <tbody>
                {todayHistory.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="small-note">
                      {t.scanner.empty}
                    </td>
                  </tr>
                ) : (
                  todayHistory.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span>{item.text}</span>
                        {item.location ? (
                          <span className="history-location">
                            📍 {item.location.latitude.toFixed(6)}, {item.location.longitude.toFixed(6)}
                            {item.location.accuracy !== undefined ? ` · ± ${Math.round(item.location.accuracy)} m` : ''}
                          </span>
                        ) : null}
                      </td>
                      <td>{item.format}</td>
                      <td title={formatDate(item.scannedAt)}>{formatTime(item.scannedAt)}</td>
                      <td>
                        <span className={`badge status-${item.status}`} title={item.error ?? undefined}>
                          {item.status === 'sent' && t.scanner.statuses.sent}
                          {item.status === 'pending' && t.scanner.statuses.pending}
                          {item.status === 'failed' && t.scanner.statuses.failed}
                          {item.responseCode ? ` · ${item.responseCode}` : ''}
                        </span>
                        {item.error ? <span className="history-error">{item.error}</span> : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="card stack">
          <div className="flex-between">
            <h2 className="section-heading">
              <span className="pill" aria-hidden>
                ●
              </span>
              {t.settings.title}
            </h2>
            <button className="button secondary" onClick={resetConfig}>
              {t.settings.reset}
            </button>
          </div>

          <div className="stack">
            <div>
              <label htmlFor="language">{t.settings.languageLabel}</label>
              <select
                id="language"
                className="input"
                value={language}
                onChange={(event) => setLanguage(event.target.value as Language)}
              >
                {AVAILABLE_LANGUAGES.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="small-note">{t.settings.languageHelper}</p>
            </div>

            <label className="toggle-row" htmlFor="debug-mode">
              <span>
                <strong>{t.settings.debugMode}</strong>
                <span className="small-note">{t.settings.debugDescription}</span>
              </span>
              <input
                id="debug-mode"
                type="checkbox"
                checked={debugMode}
                onChange={(event) => setDebugMode(event.target.checked)}
              />
            </label>

            <div>
              <label htmlFor="primary-formats">{t.settings.primaryFormatsLabel}</label>
              <input
                id="primary-formats"
                className="input"
                value={config.primaryFormats.join(', ')}
                onChange={(event) =>
                  updateConfig({ primaryFormats: event.target.value.split(',').map(normalizeFormat).filter(Boolean) })
                }
                placeholder="QR_CODE, DATA_MATRIX"
                autoComplete="off"
              />
              <p className="small-note">{t.settings.primaryFormatsNote}</p>
            </div>

            <div>
              <label htmlFor="pause">{t.settings.pauseLabel}</label>
              <div className="range-row">
                <input
                  id="pause"
                  className="input range"
                  type="range"
                  min={0}
                  max={5000}
                  step={50}
                  value={config.pauseMs}
                  onChange={(event) => updateConfig({ pauseMs: Math.max(0, Number(event.target.value)) })}
                />
                <span className="range-value">{config.pauseMs} ms</span>
              </div>
              <p className="small-note">{t.settings.pauseNote}</p>
            </div>

            {config.webhooks.map((webhook, webhookIndex) => (
              <div className="stack webhook-card" key={webhookIndex}>
                <h3>{t.settings.webhookName(webhookIndex + 1)}</h3>
                <div>
                  <label htmlFor={`url-${webhookIndex}`}>{t.settings.urlLabel}</label>
                  <input
                    id={`url-${webhookIndex}`}
                    className="input"
                    value={webhook.url}
                    onChange={(event) => updateWebhook(webhookIndex, { url: event.target.value })}
                    placeholder={t.settings.urlPlaceholder}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor={`method-${webhookIndex}`}>{t.settings.methodLabel}</label>
                  <select
                    id={`method-${webhookIndex}`}
                    className="input"
                    value={webhook.method}
                    onChange={(event) => updateWebhook(webhookIndex, { method: event.target.value as HttpMethod })}
                  >
                    {METHODS.map((method) => <option key={method}>{method}</option>)}
                  </select>
                  <p className="small-note">{t.settings.methodNote}</p>
                </div>
                <div className="stack">
                  <div className="flex-between">
                    <label>{t.settings.headersLabel}</label>
                    <button className="button secondary" onClick={() => addHeader(webhookIndex)}>
                      {t.settings.addHeader}
                    </button>
                  </div>
                  {webhook.headers.length === 0 ? <p className="small-note">{t.settings.headersEmpty}</p> : null}
                  {webhook.headers.map((header, index) => (
                    <div className="header-row" key={index}>
                      <input className="input" placeholder={t.settings.headerName} value={header.key}
                        onChange={(event) => updateHeader(webhookIndex, index, 'key', event.target.value)} />
                      <input className="input" placeholder={t.settings.headerValue} value={header.value}
                        onChange={(event) => updateHeader(webhookIndex, index, 'value', event.target.value)} autoComplete="off" />
                      <button className="button secondary" onClick={() => deleteHeader(webhookIndex, index)}>
                        {t.settings.removeHeader}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="api-test-actions">
                  <button className="button" onClick={() => runWebhookTest(webhookIndex)} disabled={testingWebhook}>
                    {testingWebhook ? t.settings.testSending : t.settings.testApi}
                  </button>
                  <button className="button secondary" onClick={() => runNetworkTest(webhookIndex)} disabled={testingWebhook}>
                    {t.settings.testNetwork}
                  </button>
                </div>
              </div>
            ))}
            <p className="small-note" role="status">{webhookStatus}</p>

            {debugMode ? (
              <div className="debug-panel stack">
                <div className="flex-between">
                  <h3>{t.settings.debugTitle}</h3>
                  <button className="button secondary" onClick={() => setDebugEntries([])}>
                    {t.settings.clearDebug}
                  </button>
                </div>
                <div className="debug-log" role="log" aria-live="polite">
                  {debugEntries.length === 0 ? <p>{t.settings.debugEmpty}</p> : null}
                  {debugEntries.map((entry) => (
                    <p key={entry.id}><time>{entry.timestamp}</time> {entry.message}</p>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="stack">
              <h3>{t.settings.privacyTitle}</h3>
              <p className="small-note">{t.settings.privacyCopy}</p>
              <p className="small-note">{t.settings.appVersion(APP_VERSION)}</p>
            </div>
          </div>
        </section>
      )}

      {showResetConfirm ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="reset-modal-title">
          <div className="modal-sheet">
            <div className="sheet-handle" aria-hidden />
            <div className="stack modal-body">
              <p className="eyebrow">{t.settings.resetConfirmTitle}</p>
              <h3 id="reset-modal-title">{t.settings.reset}</h3>
              <p className="small-note modal-copy">{t.settings.resetConfirm}</p>
            </div>
            <div className="modal-actions">
              <button className="button secondary full-width" onClick={handleCloseResetModal}>
                {t.settings.resetCancel}
              </button>
              <button className="button danger full-width" onClick={handleConfirmReset}>
                {t.settings.resetConfirmAction}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showClearConfirm ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="clear-modal-title">
          <div className="modal-sheet">
            <div className="sheet-handle" aria-hidden />
            <div className="stack modal-body">
              <p className="eyebrow">{t.scanner.clearConfirmTitle}</p>
              <h3 id="clear-modal-title">{t.scanner.clearToday}</h3>
              <p className="small-note modal-copy">{t.scanner.clearConfirm}</p>
            </div>
            <div className="modal-actions">
              <button className="button secondary full-width" onClick={handleCloseClearModal}>
                {t.scanner.clearCancel}
              </button>
              <button className="button danger full-width" onClick={handleConfirmClearHistory}>
                {t.scanner.clearConfirmAction}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
