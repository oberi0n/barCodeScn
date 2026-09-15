export type Language = 'en' | 'fr' | 'de';

export const AVAILABLE_LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
];

export interface Translations {
  tabs: {
    scan: string;
    settings: string;
  };
  scanner: {
    title: string;
    clearToday: string;
    start: string;
    stop: string;
    table: {
      value: string;
      format: string;
      time: string;
      status: string;
    };
    statuses: {
      sent: string;
      pending: string;
      failed: string;
    };
    feedback: {
      ready: string;
      detected: string;
      sending: string;
      waitingLocation: string;
      sendingWebhook: string;
      sent: (code?: number) => string;
      failed: (reason: string) => string;
    };
    locationStatuses: {
      acquiring: string;
      ready: (accuracy?: number) => string;
      unavailable: string;
      'permission-denied': string;
      timeout: string;
      unsupported: string;
    };
    empty: string;
    waitMessage: (ms: number) => string;
    clearConfirmTitle: string;
    clearConfirm: string;
    clearConfirmAction: string;
    clearCancel: string;
    cameraErrors: {
      insecure: string;
      unsupported: string;
      startFailed: string;
    };
  };
  settings: {
    title: string;
    reset: string;
    resetConfirm: string;
    resetConfirmTitle: string;
    resetConfirmAction: string;
    resetCancel: string;
    urlLabel: string;
    urlPlaceholder: string;
    webhookName: (number: number) => string;
    primaryFormatsLabel: string;
    primaryFormatsNote: string;
    methodLabel: string;
    methodNote: string;
    pauseLabel: string;
    pauseNote: string;
    headersLabel: string;
    addHeader: string;
    headersEmpty: string;
    headerName: string;
    headerValue: string;
    removeHeader: string;
    testTitle: string;
    testDescription: string;
    testSend: string;
    testSending: string;
    testMissingUrl: string;
    testLocationUnavailable: string;
    testSendingStatus: string;
    testSuccess: (code?: number) => string;
    testFailed: (message: string) => string;
    testNoResponse: string;
    privacyTitle: string;
    privacyCopy: string;
    appVersion: (version: string) => string;
    languageLabel: string;
    languageHelper: string;
    debugMode: string;
    debugDescription: string;
    debugTitle: string;
    debugEmpty: string;
    clearDebug: string;
    testApi: string;
    testNetwork: string;
    networkTesting: string;
    networkSuccess: (code: number) => string;
    networkFailed: (reason: string) => string;
  };
}

const translations: Record<Language, Translations> = {
  en: {
    tabs: { scan: 'Scan & history', settings: 'Settings' },
    scanner: {
      title: 'Scanner',
      clearToday: 'Clear today',
      start: 'Start scanning',
      stop: 'Stop camera',
      table: { value: 'Value', format: 'Format', time: 'Time', status: 'Status' },
      statuses: { sent: 'Sent', pending: 'Pending', failed: 'Failed' },
      feedback: {
        ready: 'Ready to scan',
        detected: 'Code detected',
        sending: 'Sending…',
        waitingLocation: 'Waiting for location…',
        sendingWebhook: 'Sending webhook…',
        sent: (code) => `Sent${code ? ` · HTTP ${code}` : ''}`,
        failed: (reason) => `Webhook failed · ${reason}`,
      },
      locationStatuses: {
        acquiring: 'Location: acquiring…',
        ready: (accuracy) => `Location: ready${accuracy !== undefined ? ` · ± ${Math.round(accuracy)} m` : ''}`,
        unavailable: 'Location unavailable',
        'permission-denied': 'Location permission denied',
        timeout: 'Location request timed out',
        unsupported: 'Location is not supported on this device',
      },
      empty: 'No scans yet today.',
      waitMessage: (ms) => `Please wait ${ms} ms before scanning again.`,
      clearConfirmTitle: 'Confirm clear',
      clearConfirm: 'Clear today\'s scans? This only removes local history.',
      clearConfirmAction: 'Clear today',
      clearCancel: 'Keep scans',
      cameraErrors: {
        insecure: 'Camera access requires HTTPS (or localhost for dev).',
        unsupported: 'Camera access is not supported in this browser.',
        startFailed: 'Unable to start scanner',
      },
    },
    settings: {
      title: 'Webhook settings',
      reset: 'Reset',
      resetConfirmTitle: 'Confirm reset',
      resetConfirm: 'Reset webhook settings to defaults?',
      resetConfirmAction: 'Reset now',
      resetCancel: 'Keep my settings',
      urlLabel: 'Webhook URL',
      urlPlaceholder: 'https://example.com/webhook',
      webhookName: (number) => `Webhook ${number}`,
      primaryFormatsLabel: 'Formats sent to webhook 1',
      primaryFormatsNote: 'Comma-separated ZXing formats (for example QR_CODE). All other formats go to webhook 2.',
      methodLabel: 'HTTP verb',
      methodNote: 'If using GET, only headers are sent to protect query strings.',
      pauseLabel: 'Pause between scans',
      pauseNote: 'Throttle repeated reads to avoid spamming your webhook.',
      headersLabel: 'Custom headers',
      addHeader: 'Add header',
      headersEmpty: 'Use headers to pass secure tokens or API keys.',
      headerName: 'Header name',
      headerValue: 'Header value',
      removeHeader: 'Remove',
      testTitle: 'Webhook test',
      testDescription: 'Send a sample payload to confirm your endpoint receives scans.',
      testSend: 'Send test',
      testSending: 'Testing…',
      testMissingUrl: 'Configure the webhook URL first.',
      testLocationUnavailable: 'Cannot test webhook: location unavailable.',
      testSendingStatus: 'Sending test payload…',
      testSuccess: (code) => `Test successful · HTTP ${code ?? '2xx'}`,
      testFailed: (message) => `Webhook failed: ${message}`,
      testNoResponse: 'Webhook failed to respond.',
      privacyTitle: 'Privacy',
      privacyCopy:
        'All configuration, scan history, and location metadata stay on this device in local storage. Location is not sent to webhooks. Header values are only sent to your configured webhook.',
      appVersion: (version) => `App version ${version}.`,
      languageLabel: 'Language',
      languageHelper: 'Set the language for the app interface.',
      debugMode: 'Debug mode',
      debugDescription: 'Show the last 50 scanner, location, and API events on this device.',
      debugTitle: 'Debug log',
      debugEmpty: 'No debug events yet.',
      clearDebug: 'Clear debug log',
      testApi: 'Test API',
      testNetwork: 'Test network',
      networkTesting: 'Testing API connectivity…',
      networkSuccess: (code) => `API reachable · HTTP ${code}`,
      networkFailed: (reason) => `API unreachable · ${reason}`,
    },
  },
  fr: {
    tabs: { scan: 'Scan & historique', settings: 'Paramètres' },
    scanner: {
      title: 'Scanner',
      clearToday: "Effacer la journée",
      start: 'Démarrer le scan',
      stop: 'Arrêter la caméra',
      table: { value: 'Valeur', format: 'Format', time: 'Heure', status: 'Statut' },
      statuses: { sent: 'Envoyé', pending: 'En attente', failed: 'Échec' },
      feedback: {
        ready: 'Prêt à scanner',
        detected: 'Code détecté',
        sending: 'Envoi…',
        waitingLocation: 'Attente de la localisation…',
        sendingWebhook: 'Envoi du webhook…',
        sent: (code) => `Envoyé${code ? ` · HTTP ${code}` : ''}`,
        failed: (reason) => `Échec webhook · ${reason}`,
      },
      locationStatuses: {
        acquiring: 'Localisation : acquisition…',
        ready: (accuracy) => `Localisation : prête${accuracy !== undefined ? ` · ± ${Math.round(accuracy)} m` : ''}`,
        unavailable: 'Localisation indisponible',
        'permission-denied': 'Autorisation de localisation refusée',
        timeout: 'Délai de localisation dépassé',
        unsupported: "La localisation n'est pas prise en charge sur cet appareil",
      },
      empty: "Aucun scan aujourd'hui.",
      waitMessage: (ms) => `Merci de patienter ${ms} ms avant de scanner à nouveau.`,
      clearConfirmTitle: 'Confirmer la suppression',
      clearConfirm: 'Effacer les scans du jour ? Cela supprime uniquement l\'historique local.',
      clearConfirmAction: 'Effacer la journée',
      clearCancel: 'Conserver les scans',
      cameraErrors: {
        insecure: "L'accès à la caméra nécessite HTTPS (ou localhost en dev).",
        unsupported: "L'accès à la caméra n'est pas supporté dans ce navigateur.",
        startFailed: 'Impossible de démarrer le scanner',
      },
    },
    settings: {
      title: 'Paramètres webhook',
      reset: 'Réinitialiser',
      resetConfirmTitle: 'Confirmer la réinitialisation',
      resetConfirm: 'Réinitialiser les paramètres webhook ?',
      resetConfirmAction: 'Réinitialiser maintenant',
      resetCancel: 'Conserver mes réglages',
      urlLabel: 'URL du webhook',
      urlPlaceholder: 'https://exemple.com/webhook',
      webhookName: (number) => `Webhook ${number}`,
      primaryFormatsLabel: 'Formats envoyés au webhook 1',
      primaryFormatsNote: 'Formats ZXing séparés par des virgules (par ex. QR_CODE). Tous les autres vont au webhook 2.',
      methodLabel: 'Verbe HTTP',
      methodNote:
        "Avec GET, seuls les en-têtes sont envoyés afin de protéger les chaînes de requête.",
      pauseLabel: 'Pause entre les scans',
      pauseNote: 'Limiter les lectures répétées pour éviter de saturer votre webhook.',
      headersLabel: 'En-têtes personnalisés',
      addHeader: 'Ajouter un en-tête',
      headersEmpty: 'Utilisez des en-têtes pour passer des jetons ou clés API sécurisés.',
      headerName: "Nom de l'en-tête",
      headerValue: "Valeur de l'en-tête",
      removeHeader: 'Supprimer',
      testTitle: 'Test du webhook',
      testDescription: "Envoyer un échantillon pour vérifier que votre endpoint reçoit les scans.",
      testSend: 'Envoyer un test',
      testSending: 'Test en cours…',
      testMissingUrl: "Configurez d'abord l’URL du webhook.",
      testLocationUnavailable: 'Impossible de tester le webhook : localisation indisponible.',
      testSendingStatus: 'Envoi du payload de test…',
      testSuccess: (code) => `Test réussi · HTTP ${code ?? '2xx'}`,
      testFailed: (message) => `Le webhook a échoué : ${message}`,
      testNoResponse: "Le webhook n'a pas répondu.",
      privacyTitle: 'Confidentialité',
      privacyCopy:
        "La configuration, l'historique et les localisations restent sur cet appareil. La localisation n'est pas envoyée aux webhooks. Les en-têtes sont uniquement envoyés à votre webhook configuré.",
      appVersion: (version) => `Version de l'application ${version}.`,
      languageLabel: 'Langue',
      languageHelper: "Choisissez la langue de l'interface.",
      debugMode: 'Mode debug',
      debugDescription: 'Afficher les 50 derniers événements du scanner, de localisation et API.',
      debugTitle: 'Journal debug',
      debugEmpty: 'Aucun événement debug.',
      clearDebug: 'Effacer le journal debug',
      testApi: "Tester l'API",
      testNetwork: 'Tester le réseau',
      networkTesting: 'Test de la connexion API…',
      networkSuccess: (code) => `API accessible · HTTP ${code}`,
      networkFailed: (reason) => `API inaccessible · ${reason}`,
    },
  },
  de: {
    tabs: { scan: 'Scannen & Verlauf', settings: 'Einstellungen' },
    scanner: {
      title: 'Scanner',
      clearToday: 'Heutige löschen',
      start: 'Scannen starten',
      stop: 'Kamera stoppen',
      table: { value: 'Wert', format: 'Format', time: 'Zeit', status: 'Status' },
      statuses: { sent: 'Gesendet', pending: 'Ausstehend', failed: 'Fehlgeschlagen' },
      feedback: {
        ready: 'Bereit zum Scannen',
        detected: 'Code erkannt',
        sending: 'Wird gesendet…',
        waitingLocation: 'Standort wird ermittelt…',
        sendingWebhook: 'Webhook wird gesendet…',
        sent: (code) => `Gesendet${code ? ` · HTTP ${code}` : ''}`,
        failed: (reason) => `Webhook fehlgeschlagen · ${reason}`,
      },
      locationStatuses: {
        acquiring: 'Standort: wird ermittelt…',
        ready: (accuracy) => `Standort: bereit${accuracy !== undefined ? ` · ± ${Math.round(accuracy)} m` : ''}`,
        unavailable: 'Standort nicht verfügbar',
        'permission-denied': 'Standortberechtigung verweigert',
        timeout: 'Zeitüberschreitung bei der Standortabfrage',
        unsupported: 'Standort wird auf diesem Gerät nicht unterstützt',
      },
      empty: 'Heute noch keine Scans.',
      waitMessage: (ms) => `Bitte ${ms} ms warten, bevor erneut gescannt wird.`,
      clearConfirmTitle: 'Löschen bestätigen',
      clearConfirm: 'Heutige Scans löschen? Dies entfernt nur den lokalen Verlauf.',
      clearConfirmAction: 'Heute löschen',
      clearCancel: 'Scans behalten',
      cameraErrors: {
        insecure: 'Kamerazugriff erfordert HTTPS (oder localhost in der Entwicklung).',
        unsupported: 'Kamerazugriff wird in diesem Browser nicht unterstützt.',
        startFailed: 'Scanner konnte nicht gestartet werden',
      },
    },
    settings: {
      title: 'Webhook-Einstellungen',
      reset: 'Zurücksetzen',
      resetConfirmTitle: 'Zurücksetzen bestätigen',
      resetConfirm: 'Webhook-Einstellungen auf Standard zurücksetzen?',
      resetConfirmAction: 'Jetzt zurücksetzen',
      resetCancel: 'Einstellungen behalten',
      urlLabel: 'Webhook-URL',
      urlPlaceholder: 'https://beispiel.de/webhook',
      webhookName: (number) => `Webhook ${number}`,
      primaryFormatsLabel: 'Formate für Webhook 1',
      primaryFormatsNote: 'Kommagetrennte ZXing-Formate (z. B. QR_CODE). Alle anderen Formate gehen an Webhook 2.',
      methodLabel: 'HTTP-Verb',
      methodNote: 'Bei GET werden nur Header gesendet, um Query-Strings zu schützen.',
      pauseLabel: 'Pause zwischen Scans',
      pauseNote: 'Wiederholte Scans drosseln, um Ihren Webhook nicht zu fluten.',
      headersLabel: 'Eigene Header',
      addHeader: 'Header hinzufügen',
      headersEmpty: 'Nutzen Sie Header, um sichere Token oder API-Keys zu senden.',
      headerName: 'Header-Name',
      headerValue: 'Header-Wert',
      removeHeader: 'Entfernen',
      testTitle: 'Webhook-Test',
      testDescription: 'Senden Sie ein Beispiel, um den Empfang am Endpoint zu bestätigen.',
      testSend: 'Test senden',
      testSending: 'Test wird gesendet…',
      testMissingUrl: 'Konfigurieren Sie zuerst die Webhook-URL.',
      testLocationUnavailable: 'Webhook kann nicht getestet werden: Standort nicht verfügbar.',
      testSendingStatus: 'Test-Payload wird gesendet…',
      testSuccess: (code) => `Test erfolgreich · HTTP ${code ?? '2xx'}`,
      testFailed: (message) => `Webhook fehlgeschlagen: ${message}`,
      testNoResponse: 'Webhook hat nicht geantwortet.',
      privacyTitle: 'Datenschutz',
      privacyCopy:
        'Einstellungen, Scanverlauf und Standortdaten bleiben lokal auf diesem Gerät. Standortdaten werden nicht an Webhooks gesendet. Header werden nur an den konfigurierten Webhook gesendet.',
      appVersion: (version) => `App-Version ${version}.`,
      languageLabel: 'Sprache',
      languageHelper: 'Sprache der Benutzeroberfläche festlegen.',
      debugMode: 'Debug-Modus',
      debugDescription: 'Die letzten 50 Scanner-, Standort- und API-Ereignisse anzeigen.',
      debugTitle: 'Debug-Protokoll',
      debugEmpty: 'Noch keine Debug-Ereignisse.',
      clearDebug: 'Debug-Protokoll löschen',
      testApi: 'API testen',
      testNetwork: 'Netzwerk testen',
      networkTesting: 'API-Verbindung wird getestet…',
      networkSuccess: (code) => `API erreichbar · HTTP ${code}`,
      networkFailed: (reason) => `API nicht erreichbar · ${reason}`,
    },
  },
};

export function getTranslations(language: Language): Translations {
  return translations[language] ?? translations.en;
}
