const config = require("../config");

const loginFieldAliases = [
  "Email address or mobile number",
  "Email address",
  "Email",
  "Mobile number",
  "Mobile phone",
  "Phone number",
  "Username",
  "Login",
  "البريد الإلكتروني أو رقم الهاتف",
  "البريد الالكتروني أو رقم الهاتف",
  "البريد الإلكتروني",
  "البريد الالكتروني",
  "رقم الهاتف",
  "اسم المستخدم",
];

const requestedActionKeys = ["followPage", "likePosts", "sharePosts"];

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (error) {
    return "";
  }
}

function matchesHost(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}





function officialConnectorConfigured() {
  return Boolean(
    config.apiAutomation.connectorBaseUrl && config.apiAutomation.connectorApiKey
  );
}

function officialConnectorEndpoint() {
  return new URL(
    config.apiAutomation.connectorRunPath,
    config.apiAutomation.connectorBaseUrl
  ).toString();
}

function classifyIdentifier(value) {
  const identifier = String(value || "").trim();
  if (identifier.includes("@")) return "email";
  if (/^\+?[\d\s().-]{7,}$/.test(identifier)) return "mobile";
  return "username";
}

function maskIdentifier(value) {
  const identifier = String(value || "").trim();
  if (!identifier) return "";

  if (identifier.includes("@")) {
    const [localPart, domain] = identifier.split("@");
    return `${localPart.slice(0, 2)}***@${domain || "***"}`;
  }

  if (/^\+?[\d\s().-]{7,}$/.test(identifier)) {
    const digits = identifier.replace(/\D/g, "");
    return `${identifier.startsWith("+") ? "+" : ""}***${digits.slice(-4)}`;
  }

  return `${identifier.slice(0, 2)}***`;
}

function selectedActions(actions) {
  return requestedActionKeys.filter((name) => actions?.[name] === true);
}

function cleanRequestedActions(actions) {
  return requestedActionKeys.reduce((acc, name) => {
    acc[name] = actions?.[name] === true;
    return acc;
  }, {});
}

function buildPlan(payload) {
  const requestedActions = selectedActions(payload.requestedActions);
  const loginIsSocial = isSocialHost(payload.loginUrl);
  const targetIsSocial = isSocialHost(payload.targetUrl);
  const engagementRequested = requestedActions.length > 0;
  const restricted = engagementRequested && (loginIsSocial || targetIsSocial);
  const hostsAllowed =
    isAllowedAutomationHost(payload.loginUrl) && isAllowedAutomationHost(payload.targetUrl);
  const needsOfficialConnector =
    engagementRequested && !restricted && (!officialConnectorConfigured() || !hostsAllowed);

  const warnings = [];
  if (payload.useZyteProxy && !config.zyte.apiKey) {
    warnings.push("ZYTE_API_KEY is not configured, so Zyte proxy cannot be enabled.");
  }

  if (payload.useZyteProxy && (loginIsSocial || targetIsSocial)) {
    warnings.push("Zyte proxy is not enabled for Facebook/Meta or other social engagement targets.");
  }

  if (restricted) {
    warnings.push(
      "Automated follow, like, or share actions on third-party social platforms are blocked. Use an official API with explicit permission instead."
    );
  }

  if (needsOfficialConnector) {
    warnings.push(
      "Engagement actions require a configured official API connector and allowlisted hosts before they can execute."
    );
  }

  if (!hostsAllowed && !restricted) {
    warnings.push(
      "Add the login and target hosts to API_AUTOMATION_ALLOWED_HOSTS before running this workflow."
    );
  }

  return {
    status: restricted
      ? "restricted"
      : needsOfficialConnector
        ? "requires_official_api"
        : "ready",
    credentials: {
      identifierType: classifyIdentifier(payload.username),
      usernamePreview: maskIdentifier(payload.username),
      passwordReceived: Boolean(payload.password),
      stored: false,
    },
    urls: {
      loginUrl: payload.loginUrl,
      targetUrl: payload.targetUrl,
      loginHost: hostnameOf(payload.loginUrl),
      targetHost: hostnameOf(payload.targetUrl),
    },
    zyte: {
      requested: payload.useZyteProxy,
      configured: Boolean(config.zyte.apiKey),
      enabled:
        payload.useZyteProxy === true &&
        Boolean(config.zyte.apiKey) &&
        !loginIsSocial &&
        !targetIsSocial,
    },
    officialConnector: {
      configured: officialConnectorConfigured(),
      hostsAllowed,
      allowedHosts: config.apiAutomation.allowedHosts,
      runPath: config.apiAutomation.connectorRunPath,
    },
    requestedActions,
    loginFieldAliases,
    steps: [
      {
        id: "login",
        title: "Locate login field",
        status: "planned",
        detail: "Match username/email/mobile controls by labels, placeholders, name, aria-label, and autocomplete.",
      },
      {
        id: "authenticate",
        title: "Authenticate",
        status: restricted ? "blocked" : "planned",
        detail: "Use an owned site or approved connector; credentials are not stored by this planner.",
      },
      {
        id: "target",
        title: "Open target page",
        status: restricted ? "blocked" : "planned",
        detail: "Open the target URL inside the API Automation workspace preview when embedding is allowed.",
      },
      {
        id: "actions",
        title: "Run requested actions",
        status: restricted || needsOfficialConnector ? "blocked" : "skipped",
        detail:
          requestedActions.length > 0
            ? "Follow/like/share execution is limited to official APIs with explicit permission."
            : "No follow/like/share actions were selected.",
      },
    ],
    warnings,
  };
}

function httpError(statusCode, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function assertRunnable(plan) {
  if (plan.status === "restricted") {
    throw httpError(403, "This workflow is blocked for automated social engagement", {
      warnings: plan.warnings,
    });
  }

  if (!officialConnectorConfigured()) {
    throw httpError(409, "Official API connector is not configured", {
      requiredEnv: [
        "API_AUTOMATION_CONNECTOR_URL or MAJIC_API_BASE_URL",
        "API_AUTOMATION_CONNECTOR_KEY or MAJIC_API_KEY",
      ],
    });
  }

  if (!plan.officialConnector.hostsAllowed) {
    throw httpError(403, "Login and target hosts must be allowlisted", {
      requiredEnv: "API_AUTOMATION_ALLOWED_HOSTS",
      loginHost: plan.urls.loginHost,
      targetHost: plan.urls.targetHost,
    });
  }
}

async function callOfficialConnector(payload, plan, runtime = {}) {
  if (typeof fetch !== "function") {
    throw httpError(500, "Node fetch API is not available in this runtime");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    config.apiAutomation.requestTimeoutMs
  );

  try {
    const response = await fetch(officialConnectorEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiAutomation.connectorApiKey}`,
      },
      body: JSON.stringify({
        loginUrl: payload.loginUrl,
        targetUrl: payload.targetUrl,
        username: payload.username,
        password: payload.password,
        useZyteProxy: plan.zyte.enabled,
        requestedActions: cleanRequestedActions(payload.requestedActions),
        loginFieldAliases,
        majicCase: runtime.registrationCase,
        registrationCase: runtime.registrationCase,
        proxyCase: runtime.proxyCase,
        proxySessionId: runtime.proxySessionId,
        accountMeta: runtime.accountMeta || {},
      }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw httpError(
        response.status,
        data.error || data.message || "Official connector request failed",
        data.details || data
      );
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw httpError(504, "Official connector timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  loginFieldAliases,
  buildPlan,
  assertRunnable,
  callOfficialConnector,
  classifyIdentifier,
  maskIdentifier,
};
