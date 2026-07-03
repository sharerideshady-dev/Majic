const toInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const parseCsv = (value) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseRequesterApiKeys = (value) => {
  if (!value) return [];

  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf(":");
      if (separatorIndex === -1) return null;

      const requesterId = entry.slice(0, separatorIndex).trim();
      const apiKey = entry.slice(separatorIndex + 1).trim();
      if (!requesterId || !apiKey) return null;

      return { requesterId, apiKey };
    })
    .filter(Boolean);
};

module.exports = {
  port: toInteger(process.env.PORT, 5000),
  mongoUri:
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/majic_automation",
  defaults: {
    minDelayMs: toInteger(process.env.DEFAULT_MIN_DELAY_MS, 30000),
    maxDelayMs: toInteger(process.env.DEFAULT_MAX_DELAY_MS, 180000),
    concurrency: toInteger(process.env.DEFAULT_CONCURRENCY, 1),
  },
  zyte: {
    apiKey: process.env.ZYTE_API_KEY || "",
    proxyServer: process.env.ZYTE_PROXY_SERVER || "http://api.zyte.com:8011",
    proxyPassword: process.env.ZYTE_PROXY_PASSWORD || "",
    usernameTemplate: process.env.ZYTE_PROXY_USERNAME_TEMPLATE || "{apiKey}",
    enabledByDefault: toBoolean(process.env.ZYTE_PROXY_ENABLED, false),
    extractEndpoint:
      process.env.ZYTE_EXTRACT_URL || "https://api.zyte.com/v1/extract",
    requestTimeoutMs: toInteger(process.env.ZYTE_REQUEST_TIMEOUT_MS, 60000),
  },
  apiAutomation: {
    connectorBaseUrl:
      process.env.API_AUTOMATION_CONNECTOR_URL || process.env.MAJIC_API_BASE_URL || "",
    connectorApiKey:
      process.env.API_AUTOMATION_CONNECTOR_KEY || process.env.MAJIC_API_KEY || "",
    connectorRunPath: process.env.API_AUTOMATION_CONNECTOR_RUN_PATH || "/automation/run",
    allowedHosts: parseCsv(process.env.API_AUTOMATION_ALLOWED_HOSTS),
    requestTimeoutMs: toInteger(process.env.API_AUTOMATION_TIMEOUT_MS, 60000),
  },
  accounts: {
    encryptionKey:
      process.env.ACCOUNT_ENCRYPTION_KEY || process.env.MAJIC_ACCOUNT_ENCRYPTION_KEY || "",
  },
  otp: {
    mailDomain: (process.env.MAIL_DOMAIN || "").trim().toLowerCase(),
    receiveMode: (process.env.MAIL_RECEIVE_MODE || "webhook").trim().toLowerCase(),
    aliasLocalPart: (process.env.OTP_ALIAS_LOCAL_PART || "otp").trim().toLowerCase(),
    sessionExpireMinutes: clamp(
      toInteger(process.env.OTP_SESSION_EXPIRE_MINUTES, 10),
      5,
      10
    ),
    requesterApiKeys: parseRequesterApiKeys(process.env.OTP_REQUESTER_API_KEYS),
    inboundWebhookSecret: process.env.INBOUND_MAIL_WEBHOOK_SECRET || "",
    imap: {
      host: process.env.IMAP_HOST || "",
      port: toInteger(process.env.IMAP_PORT, 993),
      user: process.env.IMAP_USER || "",
      password: process.env.IMAP_PASSWORD || "",
      secure: toBoolean(process.env.IMAP_SECURE, true),
      pollIntervalMs: toInteger(process.env.IMAP_POLL_INTERVAL_MS, 30000),
      archiveFolder: process.env.IMAP_ARCHIVE_FOLDER || "",
      maxMessagesPerPoll: toInteger(process.env.IMAP_MAX_MESSAGES_PER_POLL, 10),
    },
    mailServerApi: {
      baseUrl:
        process.env.MAIL_SERVER_API_BASE_URL ||
        process.env.MAIL_API_BASE_URL ||
        process.env.BASE_URL ||
        "",
      token:
        process.env.MAIL_SERVER_API_TOKEN ||
        process.env.MAIL_API_TOKEN ||
        process.env.API_TOKEN ||
        "",
      authHeader: process.env.MAIL_SERVER_API_AUTH_HEADER || "Authorization",
    },
  },
};
