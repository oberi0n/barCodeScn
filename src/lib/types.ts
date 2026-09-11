export type HttpMethod = 'POST' | 'PUT' | 'PATCH' | 'GET';

export interface WebhookHeader {
  key: string;
  value: string;
}

export interface WebhookTarget {
  url: string;
  method: HttpMethod;
  headers: WebhookHeader[];
}

export interface WebhookConfig {
  webhooks: [WebhookTarget, WebhookTarget];
  /** Formats routed to the first webhook. Every other format uses the second. */
  primaryFormats: string[];
  pauseMs: number;
}

export type DeliveryStatus = 'pending' | 'sent' | 'failed';

export interface ScanRecord {
  id: string;
  text: string;
  format: string;
  scannedAt: string;
  status: DeliveryStatus;
  responseCode?: number;
  error?: string;
}
