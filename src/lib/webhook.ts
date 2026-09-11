import { DeliveryStatus, ScanRecord, WebhookTarget } from './types';

interface SendResult {
  status: DeliveryStatus;
  responseCode?: number;
  error?: string;
}

export interface WebhookBody {
  barcode: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export type WebhookDebugLogger = (message: string) => void;

function hasValidLocation(payload: Omit<ScanRecord, 'status'>): boolean {
  return Boolean(
    payload.location &&
    Number.isFinite(payload.location.latitude) &&
    Number.isFinite(payload.location.longitude),
  );
}

export async function sendWebhook(
  payload: Omit<ScanRecord, 'status'>,
  config: WebhookTarget,
  addDebugLog?: WebhookDebugLogger,
): Promise<SendResult> {
  console.info('[webhook] sending', {
    url: config.url,
    method: config.method,
    barcode: payload.text,
    hasLocation: Boolean(payload.location),
  });
  addDebugLog?.(`Webhook attempt: ${config.method} ${config.url || '(URL not configured)'}; barcode=${payload.text}; location=${payload.location ? 'yes' : 'no'}`);

  if (!config.url) {
    const error = 'URL not configured';
    console.error('[webhook] failed', error);
    addDebugLog?.(`Webhook NOT sent: ${error}`);
    return { status: 'failed', error };
  }

  if (!hasValidLocation(payload)) {
    const error = 'Location unavailable - webhook not sent';
    console.error('[webhook] failed', error);
    addDebugLog?.(`Webhook NOT sent: ${error}`);
    return { status: 'failed', error };
  }

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  config.headers
    .filter((header) => header.key.trim())
    .forEach((header) => headers.set(header.key.trim(), header.value));

  try {
    const location = payload.location!;
    const body: WebhookBody = {
      barcode: payload.text,
      latitude: location.latitude,
      longitude: location.longitude,
      ...(Number.isFinite(location.accuracy) ? { accuracy: location.accuracy } : {}),
    };
    console.info('[webhook] request', {
      url: config.url,
      body: config.method === 'GET' ? undefined : body,
    });
    addDebugLog?.(`${config.method} ${config.url}`);
    addDebugLog?.(`Payload: ${JSON.stringify(body)}`);

    const response = await fetch(config.url, {
      method: config.method,
      headers,
      body:
        config.method === 'GET'
          ? undefined
          : JSON.stringify(body),
    });

    console.info('[webhook] response', {
      status: response.status,
      ok: response.ok,
    });
    addDebugLog?.(`HTTP response: ${response.status}`);

    return {
      status: response.ok ? 'sent' : 'failed',
      responseCode: response.status,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    console.error('[webhook] failed', error);
    addDebugLog?.(`Webhook failed: ${error instanceof Error ? error.message : 'Network error'}`);
    return {
      status: 'failed',
      error: 'Network error',
    };
  }
}
