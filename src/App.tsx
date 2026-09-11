import { useEffect, useMemo, useRef, useState } from 'react';
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
  return primaryFormats.includes(normalizeFormat(format)) ? config.webhooks[0] : config.webhooks[1];
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
  const todayHistory = useMemo(() => filterToday(history), [history]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const APP_VERSION = '0.3.4';
  const scannerSectionRef = useRef<HTMLElement | null>(null);
  const t = useMemo(() => getTranslations(language), [language]);

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

    setHistory((prev) => pruneToToday([record, ...prev]));
    sendingRef.current = true;
    setLastError(null);
    const sequence = ++feedbackSequenceRef.current;
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    setScanFeedback({ phase: 'detected', text, format });
    playConfirmation();

    const locationPromise = recentLocation
      ? Promise.resolve<ScanLocation | null>(recentLocation)
      : new Promise<ScanLocation | null>((resolve) => {
          if (!('geolocation' in navigator) || locationStatusRef.current === 'permission-denied') {
            resolve(null);
            return;
          }

          navigator.geolocation.getCurrentPosition(
            (position) => {
              const location = locationFromPosition(position);
              latestLocationRef.current = location;
              locationStatusRef.current = 'available';
              setLocationStatus('available');
              setHistory((previous) => previous.map((item) =>
                item.id === record.id ? { ...item, location, locationStatus: 'available' } : item,
              ));
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
      const target = selectWebhook(config, format);
      console.info('[scan] invoking webhook');
      const [result] = await Promise.all([
        sendWebhook({ ...record, location: webhookLocation ?? undefined }, target),
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
    const location = latestLocationRef.current;
    if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
      setWebhookStatus(t.settings.testLocationUnavailable);
      return;
    }

    setTestingWebhook(true);
    setWebhookStatus(t.settings.testSendingStatus);

    const now = new Date().toISOString();
    const result = await sendWebhook(
      { id: `test-${now}`, text: 'Test barcode', format: 'TEST', scannedAt: now, location },
      target,
    );

    if (result.status === 'sent') {
      setWebhookStatus(t.settings.testSuccess(result.responseCode));
    } else {
      setWebhookStatus(result.error ? t.settings.testFailed(result.error) : t.settings.testNoResponse);
    }

    setTestingWebhook(false);
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
              feedback={scanFeedback}
              labels={t.scanner.feedback}
              messages={t.scanner.cameraErrors}
            />
          ) : null}
          {scannerActive && locationStatus !== 'available' ? (
            <p className="small-note location-note">{t.scanner.locationStatuses[locationStatus]}</p>
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
                <button className="button" onClick={() => runWebhookTest(webhookIndex)} disabled={testingWebhook}>
                  {testingWebhook ? t.settings.testSending : t.settings.testSend}
                </button>
              </div>
            ))}
            <p className="small-note" role="status">{webhookStatus}</p>

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
