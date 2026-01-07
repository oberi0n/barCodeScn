import { DeliveryStatus, ScanRecord, WebhookConfig } from './types';

interface SendResult {
  status: DeliveryStatus;
  responseCode?: number;
  error?: string;
}

export async function sendWebhook(
  payload: Omit<ScanRecord, 'status'>,
  config: WebhookConfig,
): Promise<SendResult> {
  if (!config.url) {
    return { status: 'failed', error: 'Webhook URL not configured' };
  }

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  config.headers
    .filter((header) => header.key.trim())
    .forEach((header) => headers.set(header.key.trim(), header.value));

  try {
    const response = await fetch(config.url, {
      method: config.method,
      headers,
      body: config.method === 'GET' ? undefined : JSON.stringify({ code: payload.text }),
    });

    return {
      status: response.ok ? 'sent' : 'failed',
      responseCode: response.status,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
