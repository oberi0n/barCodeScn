export type HttpMethod = 'POST' | 'PUT' | 'PATCH' | 'GET';

export interface WebhookHeader {
  key: string;
  value: string;
}

export interface WebhookConfig {
  url: string;
  method: HttpMethod;
  headers: WebhookHeader[];
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
