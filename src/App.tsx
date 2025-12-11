import { useEffect, useMemo, useRef, useState } from 'react';
import { Scanner } from './components/Scanner';
import { usePersistentState } from './hooks/usePersistentState';
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
  const [scannerActive, setScannerActive] = useState(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const lastScanAtRef = useRef<number | null>(null);
  const todayHistory = useMemo(() => filterToday(history), [history]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);
  const APP_VERSION = '0.3.1';
  const scannerSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (todayHistory.length !== history.length) {
      setHistory((prev) => pruneToToday(prev));
    }
  }, [history.length, todayHistory.length, setHistory]);

  useEffect(() => {
    if (config.pauseMs === undefined || Number.isNaN(config.pauseMs)) {
      setConfig((prev) => ({ ...prev, pauseMs: 1200 }));
    }
  }, [config.pauseMs, setConfig]);

  useEffect(() => {
    document.body.classList.toggle('no-scroll', scannerActive);
    return () => document.body.classList.remove('no-scroll');
  }, [scannerActive]);

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
      setLastError(`Please wait ${remaining} ms before scanning again.`);
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
      prev.map((item) => (item.id === record.id ? { ...item, status: result.status, responseCode: result.responseCode, error: result.error } : item)),
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

  const resetConfig = () => setConfig(createBlankConfig());
  const clearHistory = () => setHistory([]);

  const runWebhookTest = async () => {
    if (!config.url) {
      setWebhookStatus('Configure the webhook URL first.');
      return;
    }

    setTestingWebhook(true);
    setWebhookStatus('Sending test payload…');

    const now = new Date().toISOString();
    const result = await sendWebhook(
      { id: `test-${now}`, text: 'Test barcode', format: 'TEST', scannedAt: now },
      config,
    );

    if (result.status === 'sent') {
      setWebhookStatus(`Webhook responded with HTTP ${result.responseCode ?? '200-299'}.`);
    } else {
      setWebhookStatus(result.error ? `Webhook failed: ${result.error}` : 'Webhook failed to respond.');
    }

    setTestingWebhook(false);
  };

  return (
    <div className={`stack app-shell ${scannerActive ? 'scan-mode' : ''}`}>
      <header className="hero">
        <div className="brand">
          <span className="brand-badge" aria-hidden />
          <span>labo.lu</span>
          <span className="version-chip">v{APP_VERSION}</span>
        </div>
        <p className="small-note">Scanner minimaliste avec webhook sécurisé.</p>
        <div className="tabs">
          <button className={`tab ${activeTab === 'scan' ? 'active' : ''}`} onClick={() => setActiveTab('scan')}>
            Scan & history
          </button>
          <button className={`tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
            Settings
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
                Scanner
              </h2>
              <span className="small-note version-inline">v{APP_VERSION}</span>
              <p className="small-note">Camera decoding runs client-side. Pair it with secure webhook headers.</p>
            </div>
            <div className="flex-row">
              <button className="button secondary" onClick={clearHistory} disabled={!history.length}>
                Clear today
              </button>
              <button className="button" onClick={() => setScannerActive((prev) => !prev)}>
                {scannerActive ? 'Stop camera' : 'Start scanning'}
              </button>
            </div>
          </div>

          {scannerActive ? <Scanner active={scannerActive} onScan={handleScan} onError={setLastError} /> : null}
          {lastError ? <p className="small-note">{lastError}</p> : null}

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Value</th>
                  <th>Format</th>
                  <th>Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {todayHistory.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="small-note">
                      No scans yet today.
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
                          {item.status === 'sent' && 'Sent'}
                          {item.status === 'pending' && 'Pending'}
                          {item.status === 'failed' && 'Failed'}
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
              Webhook settings
            </h2>
            <button className="button secondary" onClick={resetConfig}>
              Reset
            </button>
          </div>

          <div className="stack">
            <div>
              <label htmlFor="url">Webhook URL</label>
              <input
                id="url"
                className="input"
                value={config.url}
                onChange={(event) => updateConfig({ url: event.target.value })}
                placeholder="https://example.com/webhook"
                autoComplete="off"
              />
            </div>

            <div>
              <label htmlFor="method">HTTP verb</label>
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
              <p className="small-note">If using GET, only headers are sent to protect query strings.</p>
            </div>

            <div>
              <label htmlFor="pause">Pause between scans</label>
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
              <p className="small-note">Throttle repeated reads to avoid spamming your webhook.</p>
            </div>

            <div className="stack">
              <div className="flex-between">
                <label>Custom headers</label>
                <button className="button secondary" onClick={addHeader}>
                  Add header
                </button>
              </div>
              {config.headers.length === 0 ? <p className="small-note">Use headers to pass secure tokens or API keys.</p> : null}
              {config.headers.map((header, index) => (
                <div className="header-row" key={index}>
                  <input
                    className="input"
                    placeholder="Header name"
                    value={header.key}
                    onChange={(event) => updateHeader(index, 'key', event.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="Header value"
                    value={header.value}
                    onChange={(event) => updateHeader(index, 'value', event.target.value)}
                    autoComplete="off"
                  />
                  <button className="button secondary" onClick={() => deleteHeader(index)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="stack test-row">
              <div className="flex-between">
                <div>
                  <h3>Webhook test</h3>
                  <p className="small-note">Send a sample payload to confirm your endpoint receives scans.</p>
                </div>
                <button className="button" onClick={runWebhookTest} disabled={testingWebhook}>
                  {testingWebhook ? 'Testing…' : 'Send test'}
                </button>
              </div>
              {webhookStatus ? (
                <p className="small-note" role="status">
                  {webhookStatus}
                </p>
              ) : null}
            </div>

            <div className="stack">
              <h3>Privacy</h3>
              <p className="small-note">
                All configuration and scan history stay on this device in local storage. Header values are never logged or
                sent anywhere except your configured webhook.
              </p>
              <p className="small-note">App version {APP_VERSION}.</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
