import { useEffect, useMemo, useRef, useState } from 'react';
import { Scanner } from './components/Scanner';
import { usePersistentState } from './hooks/usePersistentState';
import { AVAILABLE_LANGUAGES, Language, getTranslations } from './lib/i18n';
import { ScanRecord, WebhookConfig } from './lib/types';
import { sendWebhook } from './lib/webhook';

function createBlankConfig(): WebhookConfig {
  return { url: '', method: 'POST', headers: [], pauseMs: 1200 };
}

const METHODS: WebhookConfig['method'][] = ['POST', 'PUT', 'PATCH', 'GET'];

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
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const lastScanAtRef = useRef<number | null>(null);
  const todayHistory = useMemo(() => filterToday(history), [history]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const APP_VERSION = '0.3.1';
  const scannerSectionRef = useRef<HTMLElement | null>(null);
  const t = useMemo(() => getTranslations(language), [language]);

  useEffect(() => {
    if (todayHistory.length !== history.length) {
      setHistory((prev) => pruneToToday(prev));
    }
  }, [history.length, todayHistory.length, setHistory]);

  useEffect(() => {
    setConfig((prev) => {
      const normalized: WebhookConfig = {
        url: prev?.url ?? '',
        method: prev?.method ?? 'POST',
        headers: Array.isArray(prev?.headers) ? prev.headers : [],
        pauseMs:
          prev?.pauseMs === undefined || Number.isNaN(prev.pauseMs) || prev.pauseMs < 0
            ? 1200
            : prev.pauseMs,
      };

      const unchanged =
        normalized.url === prev?.url &&
        normalized.method === prev?.method &&
        normalized.pauseMs === prev?.pauseMs &&
        normalized.headers === prev?.headers;

      return unchanged ? prev : normalized;
    });
  }, [setConfig]);

  useEffect(() => {
    document.body.classList.toggle('no-scroll', scannerActive);
    return () => document.body.classList.remove('no-scroll');
  }, [scannerActive]);

  useEffect(() => {
    document.body.classList.toggle('modal-open', showResetConfirm);
    return () => document.body.classList.remove('modal-open');
  }, [showResetConfirm]);

  useEffect(() => {
    if (scannerActive && scannerSectionRef.current) {
      const target = scannerSectionRef.current;
      requestAnimationFrame(() => {
        const top = target.getBoundingClientRect().top + window.scrollY - 10;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    }
  }, [scannerActive]);

  const handleScan = async (text: string, format: string) => {
    if (sendingRef.current) return;

    const now = Date.now();
    if (lastScanAtRef.current && now - lastScanAtRef.current < Math.max(0, config.pauseMs)) {
      const remaining = Math.max(0, config.pauseMs - (now - lastScanAtRef.current));
      setLastError(t.scanner.waitMessage(remaining));
      return;
    }

    lastScanAtRef.current = now;
    setLastScanAt(now);

    const record: ScanRecord = {
      id: crypto.randomUUID(),
      text,
      format,
      scannedAt: new Date().toISOString(),
      status: 'pending',
    };

    setHistory((prev) => pruneToToday([record, ...prev]));
    setSending(true);
    sendingRef.current = true;
    setLastError(null);

    const result = await sendWebhook({ ...record }, config);
    setHistory((prev) =>
      prev.map((item) =>
        item.id === record.id
          ? { ...item, status: result.status, responseCode: result.responseCode, error: result.error }
          : item,
      ),
    );
    setSending(false);
    sendingRef.current = false;
  };

  const updateConfig = (value: Partial<WebhookConfig>) => {
    setConfig((prev) => ({ ...prev, ...value }));
  };

  const addHeader = () => {
    setConfig((prev) => ({ ...prev, headers: [...prev.headers, { key: '', value: '' }] }));
  };

  const updateHeader = (index: number, key: 'key' | 'value', value: string) => {
    setConfig((prev) => {
      const headers = [...prev.headers];
      headers[index] = { ...headers[index], [key]: value };
      return { ...prev, headers };
    });
  };

  const deleteHeader = (index: number) => {
    setConfig((prev) => {
      const headers = prev.headers.filter((_, i) => i !== index);
      return { ...prev, headers };
    });
  };

  const resetConfig = () => {
    setShowResetConfirm(true);
  };
  const clearHistory = () => setHistory([]);

  const confirmReset = () => {
    setConfig(createBlankConfig());
    setShowResetConfirm(false);
  };

  const closeResetModal = () => setShowResetConfirm(false);

  const runWebhookTest = async () => {
    if (!config.url) {
      setWebhookStatus(t.settings.testMissingUrl);
      return;
    }

    setTestingWebhook(true);
    setWebhookStatus(t.settings.testSendingStatus);

    const now = new Date().toISOString();
    const result = await sendWebhook(
      { id: `test-${now}`, text: 'Test barcode', format: 'TEST', scannedAt: now },
      config,
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
              <button className="button" onClick={() => setScannerActive((prev) => !prev)}>
                {scannerActive ? t.scanner.stop : t.scanner.start}
              </button>
            </div>
          </div>

          {scannerActive ? (
            <Scanner
              active={scannerActive}
              onScan={handleScan}
              onError={setLastError}
              messages={t.scanner.cameraErrors}
            />
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
                      <td>{item.text}</td>
                      <td>{item.format}</td>
                      <td title={formatDate(item.scannedAt)}>{formatTime(item.scannedAt)}</td>
                      <td>
                        <span className={`badge status-${item.status}`} title={item.error ?? undefined}>
                          {item.status === 'sent' && t.scanner.statuses.sent}
                          {item.status === 'pending' && t.scanner.statuses.pending}
                          {item.status === 'failed' && t.scanner.statuses.failed}
                          {item.responseCode ? ` · ${item.responseCode}` : ''}
                        </span>
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
              <label htmlFor="url">{t.settings.urlLabel}</label>
              <input
                id="url"
                className="input"
                value={config.url}
                onChange={(event) => updateConfig({ url: event.target.value })}
                placeholder={t.settings.urlPlaceholder}
                autoComplete="off"
              />
            </div>

            <div>
              <label htmlFor="method">{t.settings.methodLabel}</label>
              <select
                id="method"
                className="input"
                value={config.method}
                onChange={(event) => updateConfig({ method: event.target.value as WebhookConfig['method'] })}
              >
                {METHODS.map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>
              <p className="small-note">{t.settings.methodNote}</p>
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

            <div className="stack">
              <div className="flex-between">
                <label>{t.settings.headersLabel}</label>
                <button className="button secondary" onClick={addHeader}>
                  {t.settings.addHeader}
                </button>
              </div>
              {config.headers.length === 0 ? <p className="small-note">{t.settings.headersEmpty}</p> : null}
              {config.headers.map((header, index) => (
                <div className="header-row" key={index}>
                  <input
                    className="input"
                    placeholder={t.settings.headerName}
                    value={header.key}
                    onChange={(event) => updateHeader(index, 'key', event.target.value)}
                  />
                  <input
                    className="input"
                    placeholder={t.settings.headerValue}
                    value={header.value}
                    onChange={(event) => updateHeader(index, 'value', event.target.value)}
                    autoComplete="off"
                  />
                  <button className="button secondary" onClick={() => deleteHeader(index)}>
                    {t.settings.removeHeader}
                  </button>
                </div>
              ))}
            </div>

            <div className="stack test-row">
              <div className="flex-between">
                <div>
                  <h3>{t.settings.testTitle}</h3>
                  <p className="small-note">{t.settings.testDescription}</p>
                </div>
                <button className="button" onClick={runWebhookTest} disabled={testingWebhook}>
                  {testingWebhook ? t.settings.testSending : t.settings.testSend}
                </button>
              </div>
              {webhookStatus ? (
                <p className="small-note" role="status">
                  {webhookStatus}
                </p>
              ) : null}
            </div>

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
              <button className="button secondary full-width" onClick={closeResetModal}>
                {t.settings.resetCancel}
              </button>
              <button className="button danger full-width" onClick={confirmReset}>
                {t.settings.resetConfirmAction}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
