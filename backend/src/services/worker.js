const { chromium } = require("playwright");
const mongoose = require("mongoose");
const Attempt = require("../models/Attempt");
const Job = require("../models/Job");
const Template = require("../models/Template");
const config = require("../config");
const { saveRegisteredAccountFromAttempt } = require("./registeredAccounts");

const activeJobs = new Set();
const liveScreenshots = new Map();
const BLOCKED_PROXY_DOMAINS = [
  // "facebook.com",
  // "fbcdn.net",
  // "meta.com",
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DEFAULT_FIELD_ORDER = [
  "firstName",
  "surname",
  "birthDay",
  "birthMonth",
  "birthYear",
  "gender",
  "contact",
  "password",
];
const FIELD_ALIASES = {
  firstname: "firstName",
  first_name: "firstName",
  fname: "firstName",
  givenname: "firstName",
  given_name: "firstName",
  surname: "surname",
  lastname: "surname",
  last_name: "surname",
  lname: "surname",
  familyname: "surname",
  family_name: "surname",
  birthday: "birthDay",
  birthdate: "birthDay",
  birth_date: "birthDay",
  dateofbirth: "birthDay",
  date_of_birth: "birthDay",
  dob: "birthDay",
  birthdayday: "birthDay",
  birthday_day: "birthDay",
  birth_day: "birthDay",
  day: "birthDay",
  birthmonth: "birthMonth",
  birthdaymonth: "birthMonth",
  birthday_month: "birthMonth",
  birth_month: "birthMonth",
  month: "birthMonth",
  birthyear: "birthYear",
  birthdayyear: "birthYear",
  birthday_year: "birthYear",
  birth_year: "birthYear",
  year: "birthYear",
  gender: "gender",
  sex: "gender",
  contact: "contact",
  email: "contact",
  emailaddress: "contact",
  email_address: "contact",
  phone: "contact",
  mobile: "contact",
  mobilenumber: "contact",
  mobile_number: "contact",
  mobilenumberoremail: "contact",
  mobilenumberoremailaddress: "contact",
  mobilephone: "contact",
  mobile_phone: "contact",
  username: "contact",
  password: "password",
  pass: "password",
};
const MAJIC_ONE_TIMEOUTS_MS = {
  firstName: 20000,
  surname: 20000,
  birthDay: 10000,
  birthMonth: 10000,
  birthYear: 10000,
  gender: 5000,
  contact: 8000,
  password: 20000,
};
const REGISTRATION_TIMEOUT_PATTERNS_MS = [
  {
    firstName: 15000,
    surname: 10000,
    birthDay: 5000,
    birthMonth: 5000,
    birthYear: 5000,
    gender: 7000,
    contact: 10000,
    password: 27000,
  },
  {
    firstName: 17000,
    surname: 11000,
    birthDay: 7000,
    birthMonth: 7000,
    birthYear: 7000,
    gender: 5000,
    contact: 13000,
    password: 22000,
  },
  {
    firstName: 10000,
    surname: 8000,
    birthDay: 4000,
    birthMonth: 4000,
    birthYear: 4000,
    gender: 9000,
    contact: 16000,
    password: 11000,
  },
  {
    firstName: 10000,
    surname: 8000,
    birthDay: 4000,
    birthMonth: 4000,
    birthYear: 4000,
    gender: 9000,
    contact: 16000,
    password: 11000,
  },
  {
    firstName: 8000,
    surname: 4000,
    birthDay: 8000,
    birthMonth: 8000,
    birthYear: 8000,
    gender: 5000,
    contact: 11000,
    password: 9000,
  },
  {
    firstName: 10000,
    surname: 8000,
    birthDay: 4000,
    birthMonth: 4000,
    birthYear: 4000,
    gender: 9000,
    contact: 16000,
    password: 11000,
  },
];
const numberWords = {
  2: "TWO",
  3: "THREE",
  4: "FOUR",
  5: "FIVE",
};

function registrationCaseName(index) {
  return `MAJIC ${numberWords[index] || index}`;
}

function buildRegistrationCases() {
  const cases = {
    "MAJIC ONE": {
      fieldTimeoutsMs: MAJIC_ONE_TIMEOUTS_MS,
    },
  };

  for (let index = 2; index <= 1000; index += 1) {
    cases[registrationCaseName(index)] = {
      fieldTimeoutsMs: REGISTRATION_TIMEOUT_PATTERNS_MS[(index - 2) % REGISTRATION_TIMEOUT_PATTERNS_MS.length],
    };
  }

  return cases;
}

const REGISTRATION_CASES = buildRegistrationCases();
const PAGE_ACTION_TIMEOUT_MS = 45000;
const VISIBLE_FAILURE_PAUSE_MS = 15000;
const LIVE_SCREENSHOT_INTERVAL_MS = 1000;
const LIVE_SCREENSHOT_MAX_AGE_MS = 5 * 60 * 1000;

class AutomationOutcomeError extends Error {
  constructor(failureType, message) {
    super(message);
    this.name = "AutomationOutcomeError";
    this.failureType = failureType;
  }
}

function outcomeError(failureType, message) {
  return new AutomationOutcomeError(failureType, message);
}

function isBlockedProxyHost(hostname) {
  return BLOCKED_PROXY_DOMAINS.some((domain) =>
    new RegExp(`(^|\\.)${escapeRegExp(domain)}$`, "i").test(hostname)
  );
}
function isBlockedProxyTarget(url) {
  try {
    return isBlockedProxyHost(new URL(url).hostname);
  } catch (error) {
    return false;
  }
}

function proxySessionIdForAttempt(attempt, settings) {
  const recordSession = String(attempt.record?.proxySessionId || "").trim();
  const rawSessionId = recordSession || `${settings.registrationCase}-${attempt._id}`;
  return rawSessionId.replace(/[^a-zA-Z0-9_.:-]/g, "-").slice(0, 120);
}

function renderZyteUsername(sessionId) {
  return config.zyte.usernameTemplate
    .replaceAll("{apiKey}", config.zyte.apiKey)
    .replaceAll("{sessionId}", sessionId);
}

function buildZyteProxySession(settings, attempt, targetUrl) {
  if (settings.useZyteProxy !== true) {
    return null;
  }

  if (isBlockedProxyTarget(targetUrl)) {
    throw outcomeError(
      "proxy_target_not_allowed",
      "Zyte proxy is disabled for Facebook/Meta template URLs"
    );
  }

  if (!config.zyte.apiKey) {
    throw outcomeError("proxy_config_missing", "ZYTE_API_KEY is required when useZyteProxy is enabled");
  }

  const sessionId = proxySessionIdForAttempt(attempt, settings);

  return {
    provider: "zyte",
    sessionId,
    enabled: true,
    proxy: {
      server: config.zyte.proxyServer,
      username: renderZyteUsername(sessionId),
      password: config.zyte.proxyPassword,
    },
  };
}

function randomDelay(minDelayMs, maxDelayMs) {
  if (maxDelayMs <= minDelayMs) return minDelayMs;
  return Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
}

function registrationEntryUrl(url) {
  try {
    const parsedUrl = new URL(url);
    if (/(^|\.)facebook\.com$/i.test(parsedUrl.hostname)) {
      parsedUrl.searchParams.set("locale", "en_GB");
      parsedUrl.searchParams.set("hl", "en_GB");
    }
    return parsedUrl.toString();
  } catch (error) {
    return url;
  }
}

function browserContextOptions(settings, proxySession) {
  const options = {
    locale: "en-GB",
    timezoneId: "Africa/Cairo",
    viewport: settings.headless === false ? null : undefined,
    extraHTTPHeaders: {
      "Accept-Language": "en-GB,en;q=0.9",
    },
  };

  if (proxySession?.proxy) {
    options.proxy = proxySession.proxy;
  }

  return options;
}

function browserLaunchOptions(settings) {
  const headless = settings.headless !== false;
  return {
    headless,
    slowMo: headless ? 0 : settings.slowMoMs ?? 500,
    args: headless ? [] : ["--start-maximized"],
  };
}

async function recordStep(attempt, message) {
  const timestamp = new Date().toISOString();
  attempt.result = attempt.result || {};
  attempt.result.steps = [...(attempt.result.steps || []), `${timestamp} ${message}`].slice(-50);
  console.log(`[attempt:${attempt._id}] ${message}`);
}

function cleanupLiveScreenshots() {
  const now = Date.now();
  for (const [attemptId, screenshot] of liveScreenshots.entries()) {
    if (now - screenshot.updatedAt > LIVE_SCREENSHOT_MAX_AGE_MS) {
      liveScreenshots.delete(attemptId);
    }
  }
}

function getAttemptScreenshot(attemptId) {
  cleanupLiveScreenshots();
  return liveScreenshots.get(String(attemptId)) || null;
}

function startLiveScreenshotCapture(attemptId, page, enabled) {
  if (!enabled) {
    return () => {};
  }

  let stopped = false;
  const key = String(attemptId);

  const capture = async () => {
    if (stopped || page.isClosed()) return;

    try {
      const buffer = await page.screenshot({
        type: "jpeg",
        quality: 70,
        fullPage: false,
        timeout: 3000,
      });
      liveScreenshots.set(key, {
        contentType: "image/jpeg",
        buffer,
        updatedAt: Date.now(),
      });
    } catch (error) {
      if (!stopped) {
        liveScreenshots.set(key, {
          contentType: "text/plain",
          buffer: Buffer.from(error.message || "Screenshot unavailable"),
          updatedAt: Date.now(),
          error: error.message || "Screenshot unavailable",
        });
      }
    }
  };

  capture();
  const intervalId = setInterval(capture, LIVE_SCREENSHOT_INTERVAL_MS);

  return () => {
    stopped = true;
    clearInterval(intervalId);
  };
}

function normalizeFieldName(fieldName) {
  const normalized = String(fieldName || "")
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");

  return FIELD_ALIASES[normalized] || String(fieldName || "").trim();
}

function normalizeTemplate(template) {
  const data = template.toObject ? template.toObject() : template;
  const rawFields =
    data.fields instanceof Map
      ? Object.fromEntries(data.fields)
      : data.fields || {};
  const fields = Object.entries(rawFields).reduce((acc, [fieldName, locator]) => {
    acc[normalizeFieldName(fieldName)] = locator;
    return acc;
  }, {});

  return { ...data, fields };
}

const fieldProfiles = {
  firstName: {
    labels: ["First name", "First Name", "Given name", "الاسم الأول", "الاسم الاول"],
    placeholders: ["First name", "First Name", "Given name", "الاسم الأول", "الاسم الاول"],
    names: ["firstName", "firstname", "first_name", "fname", "givenName"],
    selectors: [
      'input[name*="first" i]',
      'input[id*="first" i]',
      'input[aria-label*="first" i]',
      'input[aria-label*="given" i]',
      'input[aria-label*="الاسم الأول" i]',
      'input[aria-label*="الاسم الاول" i]',
      'input[autocomplete="given-name"]',
    ],
    inputIndex: 0,
  },
  surname: {
    labels: ["Surname", "Last name", "Family name", "اسم العائلة", "اسم العائله"],
    placeholders: ["Surname", "Last name", "Family name", "اسم العائلة", "اسم العائله"],
    names: ["surname", "lastName", "lastname", "last_name", "lname", "familyName"],
    selectors: [
      'input[name*="sur" i]',
      'input[name*="last" i]',
      'input[id*="sur" i]',
      'input[id*="last" i]',
      'input[aria-label*="sur" i]',
      'input[aria-label*="last" i]',
      'input[aria-label*="family" i]',
      'input[aria-label*="اسم العائلة" i]',
      'input[aria-label*="اسم العائله" i]',
      'input[autocomplete="family-name"]',
    ],
    inputIndex: 1,
  },
  contact: {
    labels: [
      "Mobile number or email address",
      "Mobile number or email",
      "Email address",
      "Email",
      "Mobile number",
      "Phone",
      "رقم الهاتف المحمول أو البريد الإلكتروني",
      "رقم الهاتف المحمول أو البريد الالكتروني",
      "البريد الإلكتروني",
      "البريد الالكتروني",
      "رقم الهاتف المحمول",
      "رقم الهاتف",
    ],
    placeholders: [
      "Mobile number or email address",
      "Mobile number or email",
      "Email address",
      "Email",
      "Mobile number",
      "Phone",
      "رقم الهاتف المحمول أو البريد الإلكتروني",
      "رقم الهاتف المحمول أو البريد الالكتروني",
      "البريد الإلكتروني",
      "البريد الالكتروني",
      "رقم الهاتف المحمول",
      "رقم الهاتف",
    ],
    names: ["contact", "email", "phone", "mobile", "username"],
    selectors: [
      'input[type="email"]',
      'input[type="tel"]',
      'input[name*="email" i]',
      'input[name*="phone" i]',
      'input[name*="mobile" i]',
      'input[id*="email" i]',
      'input[id*="phone" i]',
      'input[aria-label*="email" i]',
      'input[aria-label*="phone" i]',
      'input[aria-label*="mobile" i]',
      'input[aria-label*="البريد الإلكتروني" i]',
      'input[aria-label*="البريد الالكتروني" i]',
      'input[aria-label*="رقم الهاتف" i]',
      'input[autocomplete="email"]',
      'input[autocomplete="tel"]',
    ],
    inputIndex: 2,
  },
  password: {
    labels: ["Password", "New password", "كلمة السر", "كلمة المرور"],
    placeholders: ["Password", "New password", "كلمة السر", "كلمة المرور"],
    names: ["password", "pass", "passwd"],
    selectors: [
      'input[type="password"]',
      'input[name*="pass" i]',
      'input[id*="pass" i]',
      'input[aria-label*="password" i]',
      'input[aria-label*="كلمة السر" i]',
      'input[aria-label*="كلمة المرور" i]',
      'input[autocomplete="new-password"]',
    ],
  },
  birthDay: {
    optionText: "Day",
    names: ["birthDay", "birthday_day", "day", "dob_day"],
    selectors: ['select[name*="day" i]', 'select[id*="day" i]'],
    selectIndex: 0,
  },
  birthMonth: {
    optionText: "Month",
    names: ["birthMonth", "birthday_month", "month", "dob_month"],
    selectors: ['select[name*="month" i]', 'select[id*="month" i]'],
    selectIndex: 1,
  },
  birthYear: {
    optionText: "Year",
    names: ["birthYear", "birthday_year", "year", "dob_year"],
    selectors: ['select[name*="year" i]', 'select[id*="year" i]'],
    selectIndex: 2,
  },
  gender: {
    optionText: "Select your gender",
    names: ["gender", "sex"],
    selectors: [
      'select[name*="gender" i]',
      'select[name*="sex" i]',
      'select[id*="gender" i]',
      'select[aria-label*="gender" i]',
      'input[type="radio"][name*="gender" i]',
      'input[type="radio"][name*="sex" i]',
    ],
    selectIndex: 3,
  },
};

async function firstExisting(page, selectors) {
  for (const scope of getSearchScopes(page)) {
    for (const selector of selectors) {
      const candidate = scope.locator(selector).first();
      if ((await candidate.count()) > 0 && (await candidate.isVisible().catch(() => false))) {
        return candidate;
      }
    }
  }
  return null;
}

function getSearchScopes(page) {
  return [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
}

async function getFieldDebug(page) {
  const data = await Promise.all(
    getSearchScopes(page).map(async (scope, index) => {
      const inputs = await scope
        .locator("input, select, textarea")
        .evaluateAll((elements) =>
          elements.slice(0, 30).map((element) => ({
            tag: element.tagName.toLowerCase(),
            type: element.getAttribute("type") || "",
            name: element.getAttribute("name") || "",
            id: element.getAttribute("id") || "",
            placeholder: element.getAttribute("placeholder") || "",
            aria: element.getAttribute("aria-label") || "",
            autocomplete: element.getAttribute("autocomplete") || "",
            visible:
              element.offsetParent !== null ||
              element.getClientRects().length > 0,
          }))
        )
        .catch(() => []);

      return {
        scope: index === 0 ? "main" : `frame:${index}`,
        url: typeof scope.url === "function" ? scope.url() : "",
        inputs,
      };
    })
  );

  return data
    .map((scope) => {
      const fields = scope.inputs
        .map(
          (input) =>
            `${input.tag}[type=${input.type || "-"} name=${input.name || "-"} id=${
              input.id || "-"
            } placeholder=${input.placeholder || "-"} aria=${input.aria || "-"} visible=${input.visible}]`
        )
        .join("; ");
      return `${scope.scope} ${scope.url}: ${fields || "no inputs"}`;
    })
    .join(" | ");
}

async function getFormSnapshot(page) {
  const snapshots = await Promise.all(
    getSearchScopes(page).map(async (scope, index) => {
      const controls = await scope
        .locator("input, select, textarea")
        .evaluateAll((elements) =>
          elements
            .filter(
              (element) =>
                element.offsetParent !== null ||
                element.getClientRects().length > 0
            )
            .slice(0, 40)
            .map((element) => {
              const isPassword = (element.getAttribute("type") || "").toLowerCase() === "password";
              const selected =
                element.tagName.toLowerCase() === "select"
                  ? element.options[element.selectedIndex]?.text || ""
                  : "";

              return {
                tag: element.tagName.toLowerCase(),
                type: element.getAttribute("type") || "",
                name: element.getAttribute("name") || "",
                id: element.getAttribute("id") || "",
                placeholder: element.getAttribute("placeholder") || "",
                aria: element.getAttribute("aria-label") || "",
                value: isPassword ? "*".repeat(element.value.length) : element.value,
                checked: element.checked || false,
                selected,
              };
            })
        )
        .catch(() => []);

      const buttons = await scope
        .locator('[role="button"], button')
        .evaluateAll((elements) =>
          elements
            .filter(
              (element) =>
                element.offsetParent !== null ||
                element.getClientRects().length > 0
            )
            .slice(0, 30)
            .map((element) => ({
              text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
              aria: element.getAttribute("aria-label") || "",
              expanded: element.getAttribute("aria-expanded") || "",
            }))
        )
        .catch(() => []);

      const bodyText = await scope
        .locator("body")
        .innerText({ timeout: 2000 })
        .then((text) => text.replace(/\s+/g, " ").trim().slice(0, 2000))
        .catch(() => "");

      return {
        scope: index === 0 ? "main" : `frame:${index}`,
        url: typeof scope.url === "function" ? scope.url() : "",
        controls,
        buttons,
        bodyText,
      };
    })
  );

  return snapshots;
}

async function collectVisiblePageText(page, options = {}) {
  const attempts = options.attempts ?? 5;
  const delayMs = options.delayMs ?? 500;
  const limit = options.limit ?? 1000;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const parts = await Promise.all(
      getSearchScopes(page).map(async (scope) => {
        const innerText = await scope
          .locator("body")
          .innerText({ timeout: 2000 })
          .catch(() => "");
        const textContent = await scope
          .locator("body")
          .evaluate((body) => body.textContent || "", { timeout: 2000 })
          .catch(() => "");

        return `${innerText} ${textContent}`;
      })
    );

    const text = parts.join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      return text.slice(0, limit);
    }

    await sleep(delayMs);
  }

  return "";
}

async function dismissCommonOverlays(page) {
  const labels = [
    "Accept",
    "Accept all",
    "I agree",
    "Agree",
    "Allow all",
    "Close",
    "Not now",
    "Skip",
  ];

  for (const scope of getSearchScopes(page)) {
    for (const label of labels) {
      const button = scope.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).first();
      if ((await button.count()) > 0) {
        await button.click({ timeout: 1500 }).catch(() => {});
      }
    }
  }
}

async function waitForVisibleFormField(page) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < actionTimeout()) {
    for (const scope of getSearchScopes(page)) {
      const candidate = scope
        .locator('input:not([type="hidden"]), select, textarea')
        .filter({ visible: true })
        .first();
      if ((await candidate.count()) > 0) {
        return;
      }
    }
    await sleep(250);
  }

  throw new Error(`No visible form fields found. Found: ${await getFieldDebug(page)}`);
}

async function waitForFormReady(page) {
  await page
    .waitForLoadState("domcontentloaded", { timeout: actionTimeout() })
    .catch(() => {});
  await page
    .locator("input, select, textarea")
    .first()
    .waitFor({ state: "attached", timeout: actionTimeout() })
    .catch(() => {});
  await dismissCommonOverlays(page);
  await waitForVisibleFormField(page);
}

async function isRegistrationFormVisible(page) {
  const requiredText = [/first name/i, /surname/i, /date of birth/i];

  for (const scope of getSearchScopes(page)) {
    const bodyText = await scope.locator("body").innerText({ timeout: 1500 }).catch(() => "");
    if (requiredText.every((pattern) => pattern.test(bodyText))) {
      return true;
    }
  }

  return false;
}

function isFacebookRegistrationUrl(url) {
  return /https?:\/\/([^/]+\.)?facebook\.com\/reg\/?/i.test(String(url || ""));
}

async function waitForRegistrationForm(page) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < actionTimeout()) {
    if (isFacebookRegistrationUrl(page.url()) || (await isRegistrationFormVisible(page))) {
      return;
    }
    await sleep(250);
  }

  throw outcomeError(
    "registration_form_not_opened",
    `Could not open registration form from Facebook entry page. Final URL: ${page.url()}. Found: ${await getFieldDebug(page)}`
  );
}

async function openFacebookRegistrationFromEntry(page, attempt) {
  const currentUrl = page.url();
  if (!/https?:\/\/([^/]+\.)?facebook\.com\/?($|[?#])/i.test(currentUrl)) {
    return;
  }

  if (isFacebookRegistrationUrl(currentUrl)) {
    await recordStep(attempt, "registration url already opened");
    return;
  }

  if (await isRegistrationFormVisible(page)) {
    await recordStep(attempt, "registration form already visible on entry page");
    return;
  }

  await recordStep(attempt, "facebook entry page detected");

  const createAccount = await firstExistingInScope(page, (scope) =>
    scope.getByRole("button", { name: /^create new account$/i })
  );
  const createAccountLink = createAccount || (await firstExistingInScope(page, (scope) =>
    scope.getByRole("link", { name: /^create new account$/i })
  ));
  const createAccountText = createAccountLink || (await firstExistingInScope(page, (scope) =>
    scope.getByText(/^Create new account$/i)
  ));

  if (!createAccountText) {
    throw outcomeError(
      "create_account_button_not_found",
      `Could not find Create new account on Facebook entry page. Found: ${await getFieldDebug(page)}`
    );
  }

  await recordStep(attempt, "click Create new account");
  await clickLocatorOwner(createAccountText, actionTimeout());
  await page.waitForLoadState("networkidle", { timeout: actionTimeout() }).catch(() => {});
  await waitForRegistrationForm(page);
  await recordStep(attempt, "registration form opened from entry page");
}

async function firstExistingInScope(page, selectorFactory) {
  for (const scope of getSearchScopes(page)) {
    const candidate = selectorFactory(scope).first();
    if ((await candidate.count()) > 0 && (await candidate.isVisible().catch(() => false))) {
      return candidate;
    }
  }
  return null;
}

async function locate(page, locator, fieldName) {
  const profile = fieldProfiles[fieldName] || {};

  if (locator.selector) {
    const candidate = await firstExistingInScope(page, (scope) => scope.locator(locator.selector));
    if (candidate) return candidate;
  }

  if (locator.type === "select" && (locator.fallback?.placeholder || profile.optionText)) {
    const optionText = locator.fallback?.placeholder || profile.optionText;
    const optionSelect = await firstExistingInScope(page, (scope) =>
      scope.locator("select").filter({ has: scope.locator("option", { hasText: optionText }) })
    );

    if (optionSelect) {
      return optionSelect;
    }
  }

  if (profile.selectors) {
    const candidate = await firstExisting(page, profile.selectors);
    if (candidate) return candidate;
  }

  if (profile.names) {
    const nameSelectors = profile.names.flatMap((name) => [
      `input[name="${name}" i]`,
      `select[name="${name}" i]`,
      `textarea[name="${name}" i]`,
      `input[id="${name}" i]`,
      `select[id="${name}" i]`,
    ]);
    const candidate = await firstExisting(page, nameSelectors);
    if (candidate) return candidate;
  }

  if (Number.isInteger(profile.inputIndex)) {
    const byIndex = await firstExistingInScope(page, (scope) =>
      scope
        .locator(
          'input:not([type]), input[type="text"], input[type="email"], input[type="tel"], textarea'
        )
        .filter({ visible: true })
        .nth(profile.inputIndex)
    );
    if (byIndex) return byIndex;
  }

  if (profile.labels) {
    for (const labelText of profile.labels) {
      const candidate = await firstExistingInScope(page, (scope) =>
        scope.getByLabel(labelText, { exact: false })
      );
      if (candidate) return candidate;
    }
  }

  if (locator.fallback?.placeholder) {
    const placeholder = await firstExistingInScope(page, (scope) =>
      scope.getByPlaceholder(locator.fallback.placeholder)
    );
    if (placeholder) return placeholder;
  }

  if (profile.placeholders) {
    for (const placeholderText of profile.placeholders) {
      const candidate = await firstExistingInScope(page, (scope) =>
        scope.getByPlaceholder(placeholderText)
      );
      if (candidate) return candidate;
    }
  }

  if (locator.fallback?.label) {
    const label = await firstExistingInScope(page, (scope) =>
      scope.getByLabel(locator.fallback.label)
    );
    if (label) return label;
  }

  if (locator.fallback?.name) {
    const byName = await firstExistingInScope(page, (scope) =>
      scope.locator(`[name="${locator.fallback.name}"]`)
    );
    if (byName) return byName;
  }

  if (locator.type === "select" && Number.isInteger(profile.selectIndex)) {
    const byIndex = await firstExistingInScope(page, (scope) =>
      scope.locator("select").nth(profile.selectIndex)
    );
    if (byIndex) return byIndex;
  }

  throw new Error(`Could not find field "${fieldName}". Found: ${await getFieldDebug(page)}`);
}

function monthLabel(value) {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) {
    return months[numeric - 1];
  }
  return String(value);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function monthNumber(value) {
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const numeric = Number(value);

  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) {
    return numeric;
  }

  const normalized = String(value || "").trim().toLowerCase();
  const index = months.findIndex(
    (month) => month === normalized || month.slice(0, 3) === normalized.slice(0, 3)
  );

  return index >= 0 ? index + 1 : Number.NaN;
}

function getRecordValue(record, fieldName) {
  if (record[fieldName] !== undefined) {
    return record[fieldName];
  }

  const entry = Object.entries(record).find(
    ([recordFieldName]) => normalizeFieldName(recordFieldName) === fieldName
  );
  return entry ? entry[1] : undefined;
}

function birthdayIsoValue(record) {
  const year = Number(getRecordValue(record, "birthYear"));
  const month = monthNumber(getRecordValue(record, "birthMonth"));
  const day = Number(getRecordValue(record, "birthDay"));

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

async function writeCombinedBirthdayIfPresent(page, record, settings) {
  const value = birthdayIsoValue(record);
  if (!value) return false;

  const dateInput = await firstExisting(page, [
    'input[type="date"][name*="birth" i]',
    'input[type="date"][id*="birth" i]',
    'input[type="date"][name*="dob" i]',
    'input[type="date"][id*="dob" i]',
    'input[type="date"]',
  ]);

  if (!dateInput) return false;

  return dateInput
    .fill(value, { timeout: fieldActionTimeout(settings)("birthDay") })
    .then(() => true)
    .catch(() => false);
}

async function clickCustomDropdownOption(page, buttonLabel, optionText, timeoutMs) {
  const buttonPattern = new RegExp(`^${escapeRegExp(buttonLabel)}$`, "i");
  const optionPattern = new RegExp(`^${escapeRegExp(optionText)}$`, "i");
  let button = await firstExistingInScope(page, (scope) =>
    scope.getByRole("button", { name: buttonPattern })
  );

  if (!button) {
    const buttonText = await firstExistingInScope(page, (scope) =>
      scope.getByText(buttonPattern)
    );
    if (buttonText) {
      button = buttonText;
    }
  }

  if (!button) return false;

  await clickLocatorOwner(button, timeoutMs);

  const option = await firstExistingInScope(page, (scope) =>
    scope.getByRole("option", { name: optionPattern })
  );
  if (option) {
    await option.click({ timeout: timeoutMs });
    return true;
  }

  const textOption = await firstExistingInScope(page, (scope) =>
    scope.getByText(optionPattern)
  );
  if (textOption) {
    await clickLocatorOwner(textOption, timeoutMs);
    return true;
  }

  return false;
}

async function clickLocatorOwner(locator, timeoutMs) {
  const owner = locator.locator(
    'xpath=ancestor::*[@role="button" or @role="option" or @tabindex="0"][1]'
  );

  if ((await owner.count()) > 0 && (await owner.isVisible().catch(() => false))) {
    await owner.click({ timeout: timeoutMs });
    return;
  }

  await locator.click({ timeout: timeoutMs });
}

async function writeBirthdayDropdownsIfPresent(page, record, settings) {
  const day = String(getRecordValue(record, "birthDay") || "").trim();
  const month = monthLabel(getRecordValue(record, "birthMonth"));
  const year = String(getRecordValue(record, "birthYear") || "").trim();

  if (!day || !month || !year) return false;

  const timeoutMs = fieldActionTimeout(settings)("birthDay");
  const daySelected = await clickCustomDropdownOption(page, "Day", day, timeoutMs);
  const monthSelected = await clickCustomDropdownOption(page, "Month", month, timeoutMs);
  const yearSelected = await clickCustomDropdownOption(page, "Year", year, timeoutMs);

  return daySelected && monthSelected && yearSelected;
}

function fieldHasValue(record, fieldName) {
  const value = getRecordValue(record, fieldName);
  return value !== undefined && value !== null && value !== "";
}

function pendingFields(fieldOrder, template, record, handledFields) {
  return fieldOrder.filter(
    (fieldName) => template.fields[fieldName] && fieldHasValue(record, fieldName) && !handledFields.has(fieldName)
  );
}

function normalizeFieldOrder(fieldOrder) {
  return [...new Set(fieldOrder.map((fieldName) => normalizeFieldName(fieldName)))];
}

function isMissingFieldError(error) {
  return /^Could not find field "/.test(error.message || "");
}

async function fillVisibleFields(page, attempt, template, settings, fieldOrder, handledFields) {
  let filledCount = 0;

  for (const fieldName of fieldOrder) {
    if (handledFields.has(fieldName)) continue;

    if (
      fieldName === "birthDay" &&
      fieldHasValue(attempt.record, "birthDay") &&
      fieldHasValue(attempt.record, "birthMonth") &&
      fieldHasValue(attempt.record, "birthYear")
    ) {
      if (
        (await writeBirthdayDropdownsIfPresent(page, attempt.record, settings)) ||
        (await writeCombinedBirthdayIfPresent(page, attempt.record, settings))
      ) {
        await recordStep(attempt, "filled birthday fields from birthDay order slot");
        handledFields.add("birthDay");
        handledFields.add("birthMonth");
        handledFields.add("birthYear");
        filledCount += 3;
      } else {
        await recordStep(attempt, "birthday fields visible/not filled yet");
      }
      continue;
    }

    const locator = template.fields[fieldName];
    if (!locator) continue;
    if (!fieldHasValue(attempt.record, fieldName)) continue;

    try {
      await writeField(page, locator, getRecordValue(attempt.record, fieldName), fieldName, settings);
      handledFields.add(fieldName);
      filledCount += 1;
      await recordStep(attempt, `filled ${fieldName}`);
    } catch (error) {
      if (isMissingFieldError(error)) {
        if (
          fieldName === "gender" &&
          (await writeGenderFallback(
            page,
            getRecordValue(attempt.record, fieldName),
            fieldActionTimeout(settings)(fieldName)
          ))
        ) {
          handledFields.add(fieldName);
          filledCount += 1;
        }
        continue;
      }
      throw error;
    }
  }

  return filledCount;
}

function actionTimeout() {
  return PAGE_ACTION_TIMEOUT_MS;
}

function fieldActionTimeout(settings) {
  const registrationCase = settings.registrationCase || "MAJIC ONE";
  const caseConfig = REGISTRATION_CASES[registrationCase] || REGISTRATION_CASES["MAJIC ONE"];
  return (fieldName) =>
    Math.min(
      actionTimeout(),
      caseConfig.fieldTimeoutsMs[fieldName] || actionTimeout()
    );
}

function attemptSettings(settings, record) {
  const recordRegistrationCase = String(record?.registrationCase || "").trim();
  return {
    ...settings,
    registrationCase: REGISTRATION_CASES[recordRegistrationCase]
      ? recordRegistrationCase
      : settings.registrationCase || "MAJIC ONE",
  };
}

function valuesFromSnapshot(snapshot) {
  return snapshot.flatMap((scope) =>
    scope.controls.flatMap((control) => [
      control.value,
      control.selected,
      control.checked ? control.value : "",
    ])
  ).filter(Boolean);
}

function visibleTextFromSnapshot(snapshot) {
  return snapshot
    .flatMap((scope) => [
      scope.bodyText,
      ...scope.controls.flatMap((control) => [
        control.placeholder,
        control.aria,
        control.value,
        control.selected,
      ]),
      ...scope.buttons.flatMap((button) => [button.text, button.aria]),
    ])
    .filter(Boolean)
    .join(" ");
}

function includesExactValue(values, expected) {
  const normalizedExpected = String(expected || "").trim().toLowerCase();
  return values.some((value) => String(value || "").trim().toLowerCase() === normalizedExpected);
}

function includesVisibleText(text, expected) {
  const normalizedText = String(text || "").toLowerCase();
  return normalizedText.includes(String(expected || "").trim().toLowerCase());
}

async function verifyFilledFields(page, record, fieldOrder) {
  const snapshot = await getFormSnapshot(page);
  const values = valuesFromSnapshot(snapshot);
  const visibleText = visibleTextFromSnapshot(snapshot);
  const isoBirthday = birthdayIsoValue(record);

  const evidence = {};

  for (const fieldName of fieldOrder) {
    if (!fieldHasValue(record, fieldName)) continue;

    const expected = getRecordValue(record, fieldName);
    let ok = true;
    let detail = "verified";

    if (["firstName", "surname", "contact"].includes(fieldName)) {
      ok = includesExactValue(values, expected);
      detail = ok ? "visible control value matched" : `expected visible value "${expected}"`;
    } else if (fieldName === "password") {
      const passwordFilled = snapshot.some((scope) =>
        scope.controls.some(
          (control) => control.type.toLowerCase() === "password" && control.value.length > 0
        )
      );
      ok = passwordFilled;
      detail = ok ? "password control has value" : "password control is empty";
    } else if (fieldName === "birthDay") {
      const month = monthLabel(getRecordValue(record, "birthMonth"));
      const year = getRecordValue(record, "birthYear");
      ok =
        includesExactValue(values, expected) ||
        (isoBirthday && includesExactValue(values, isoBirthday)) ||
        (includesVisibleText(visibleText, expected) &&
          includesVisibleText(visibleText, month) &&
          includesVisibleText(visibleText, year));
      detail = ok ? "birthday day/month/year visible" : `expected birthday ${expected} ${month} ${year}`;
    } else if (fieldName === "birthMonth" || fieldName === "birthYear") {
      ok = evidence.birthDay?.ok === true;
      detail = ok ? "birthday group verified" : "birthday group did not verify";
    } else if (fieldName === "gender") {
      const genderLabel = String(expected || "").toLowerCase().startsWith("f") ? "Female" : "Male";
      ok = includesExactValue(values, genderLabel) || includesVisibleText(visibleText, genderLabel);
      detail = ok ? `${genderLabel} visible/selected` : `expected gender ${genderLabel}`;
    }

    evidence[fieldName] = { ok, detail };
  }

  return { evidence, snapshot };
}

function failedEvidenceFields(evidence) {
  return Object.entries(evidence)
    .filter(([, value]) => value && value.ok === false)
    .map(([fieldName, value]) => `${fieldName}: ${value.detail}`);
}

async function selectValue(input, value, fieldName, timeoutMs) {
  const normalizedValue = String(value);
  const candidates = [
    { value: normalizedValue },
    { label: normalizedValue },
  ];

  if (fieldName === "birthMonth") {
    candidates.push({ label: monthLabel(value) });
  }

  if (fieldName === "gender") {
    candidates.push({ label: normalizedValue.toLowerCase() });
    candidates.push({ label: normalizedValue.charAt(0).toUpperCase() + normalizedValue.slice(1) });
  }

  let lastError;
  for (const candidate of candidates) {
    try {
      await input.selectOption(candidate, { timeout: timeoutMs });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Could not select "${normalizedValue}" for "${fieldName}": ${lastError.message}`);
}

async function writeGenderFallback(page, value, timeoutMs) {
  const label = String(value || "").trim();
  const normalized = label.toLowerCase();
  const labelCandidates = [
    label,
    normalized,
    label.charAt(0).toUpperCase() + label.slice(1).toLowerCase(),
  ];

  if (normalized === "male" || normalized === "m") {
    labelCandidates.push("Male", "male", "Man");
  }

  if (normalized === "female" || normalized === "f") {
    labelCandidates.push("Female", "female", "Woman");
  }

  const optionLabel = normalized === "female" || normalized === "f" ? "Female" : "Male";
  const optionPattern = new RegExp(`^${optionLabel}$`, "i");

  const clickGenderOption = async () => {
    const option = await firstExistingInScope(page, (scope) =>
      scope.getByRole("option", { name: optionPattern })
    );
    if (option) {
      await option.click({ timeout: timeoutMs });
      return true;
    }

    const textOption = await firstExistingInScope(page, (scope) =>
      scope.getByText(optionPattern)
    );
    if (textOption) {
      await clickLocatorOwner(textOption, timeoutMs);
      return true;
    }

    return false;
  };

  if (await clickGenderOption()) {
    return true;
  }

  const dropdown = await firstExistingInScope(page, (scope) =>
    scope.getByRole("button", { name: /select your gender/i })
  );
  if (dropdown) {
    await dropdown.click({ timeout: timeoutMs });
    if (await clickGenderOption()) {
      return true;
    }
  }

  const dropdownByText = await firstExistingInScope(page, (scope) =>
    scope.getByText(/^Select your gender$/i)
  );
  if (dropdownByText) {
    await clickLocatorOwner(dropdownByText, timeoutMs);
    if (await clickGenderOption()) {
      return true;
    }
  }

  for (const candidate of labelCandidates) {
    const radio = await firstExistingInScope(page, (scope) =>
      scope.getByLabel(candidate, { exact: false })
    );
    if (radio) {
      await radio.click({ timeout: timeoutMs });
      return true;
    }
  }

  const valueRadio = await firstExistingInScope(page, (scope) =>
    scope.locator(`input[type="radio"][value="${normalized}" i]`)
  );
  if (valueRadio) {
    await valueRadio.click({ timeout: timeoutMs });
    return true;
  }

  for (const candidate of labelCandidates) {
    const textButton = await firstExistingInScope(page, (scope) =>
      scope.getByRole("button", { name: new RegExp(`^${candidate}$`, "i") })
    );
    if (textButton) {
      await textButton.click({ timeout: timeoutMs });
      return true;
    }
  }

  for (const candidate of labelCandidates) {
    const textOption = await firstExistingInScope(page, (scope) =>
      scope.getByText(new RegExp(`^${candidate}$`, "i"))
    );
    if (textOption) {
      await clickLocatorOwner(textOption, timeoutMs);
      return true;
    }
  }

  return false;
}

async function writeField(page, locator, value, fieldName, settings) {
  const timeoutMs = fieldActionTimeout(settings)(fieldName);

  if (fieldName === "gender" && (await writeGenderFallback(page, value, timeoutMs))) {
    return;
  }

  const input = await locate(page, locator, fieldName);

  if (locator.type === "select") {
    try {
      await selectValue(input, value, fieldName, timeoutMs);
    } catch (error) {
      if (fieldName === "gender" && (await writeGenderFallback(page, value, timeoutMs))) {
        return;
      }
      throw new Error(`Could not set "${fieldName}": ${error.message}`);
    }
    return;
  }

  await input
    .fill(String(value), { timeout: timeoutMs })
    .catch((error) => {
      throw new Error(`Could not fill "${fieldName}": ${error.message}`);
    });
}

async function clickSubmit(page, locator, settings) {
  const timeoutMs = actionTimeout();
  if (locator?.selector) {
    const configuredButton = await firstExistingInScope(page, (scope) =>
      scope.locator(locator.selector)
    );
    if (configuredButton) {
      await configuredButton.click({ timeout: timeoutMs });
      return;
    }
  }

  const candidates = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Create account")',
    'button:has-text("Sign up")',
    'button:has-text("Register")',
    'button:has-text("Submit")',
    'input[value="Submit" i]',
    '[role="button"]:has-text("Submit")',
    'div:has-text("Submit")',
    'span:has-text("Submit")',
  ];

  const submitButton = await firstExisting(page, candidates);
  if (!submitButton) {
    const roleSubmit = await firstExistingInScope(page, (scope) =>
      scope.getByRole("button", { name: /submit|create account|sign up|register/i })
    );
    if (roleSubmit) {
      await roleSubmit.click({ timeout: timeoutMs });
      return;
    }

    throw new Error(`Could not find submit button. Found: ${await getFieldDebug(page)}`);
  }

  await submitButton.click({ timeout: timeoutMs });
}

async function detectManualVerification(page) {
  const selectors = [
    'iframe[src*="captcha"]',
    '[class*="captcha" i]',
    '[id*="captcha" i]',
    'input[name*="captcha" i]',
  ];

  for (const scope of getSearchScopes(page)) {
    for (const selector of selectors) {
      if ((await scope.locator(selector).count()) > 0) {
        return true;
      }
    }
  }

  const bodyText = await collectVisiblePageText(page, {
    attempts: 1,
    delayMs: 0,
    limit: 3000,
  });
  if (/captcha|verify you are human|manual verification|security check/i.test(bodyText)) {
    return true;
  }

  return false;
}

function expectsConfirmationCode(success) {
  return /otp|code|confirmation|confirm|verify/i.test(String(success?.textContains || ""));
}

async function hasConfirmationCodeInput(page) {
  const selectors = [
    'input[autocomplete="one-time-code"]',
    'input[name*="code" i]',
    'input[id*="code" i]',
    'input[placeholder*="code" i]',
    'input[aria-label*="code" i]',
    'input[name*="confirm" i]',
    'input[id*="confirm" i]',
    'input[placeholder*="confirm" i]',
    'input[aria-label*="confirm" i]',
    'input[name*="verify" i]',
    'input[id*="verify" i]',
    'input[placeholder*="verify" i]',
    'input[aria-label*="verify" i]',
  ];

  for (const scope of getSearchScopes(page)) {
    for (const selector of selectors) {
      const locator = scope.locator(selector).first();
      if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
        return true;
      }
    }
  }

  return false;
}

async function waitForConfirmationCodeInput(page, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await hasConfirmationCodeInput(page)) {
      return true;
    }
    await sleep(500);
  }
  return false;
}

function looksLikeConfirmationDeliveryPrompt(text) {
  return /send (a )?(confirmation |verification )?code|text (me|your phone)|sms|choose (a )?(way|method).*confirm|confirm.*(phone|mobile)|verify.*(phone|mobile)/i.test(
    String(text || "")
  );
}

async function waitForSuccess(page, success, settings) {
  const checks = [];
  const timeoutMs = actionTimeout();
  const criteria = [];

  if (success.urlContains) {
    criteria.push(`url contains "${success.urlContains}"`);
    checks.push(
      page
        .waitForURL((url) => url.toString().includes(success.urlContains), {
          timeout: timeoutMs,
        })
        .then(() => ({ matchedBy: "urlContains" }))
    );
  }

  if (success.textSelector && success.textContains) {
    criteria.push(`${success.textSelector} contains "${success.textContains}"`);
    const textContains = String(success.textContains);
    const hasText =
      textContains.includes("|")
        ? new RegExp(textContains, "i")
        : textContains;
    for (const scope of getSearchScopes(page)) {
      checks.push(
        scope
          .locator(success.textSelector)
          .filter({ hasText })
          .first()
          .waitFor({ state: "visible", timeout: timeoutMs })
          .then(() => ({ matchedBy: "textContains" }))
      );
    }
  }

  if (checks.length === 0) {
    throw new Error("Template success criteria are missing");
  }

  try {
    const result = await Promise.any(checks);

    if (expectsConfirmationCode(success)) {
      const codeInputReady = await waitForConfirmationCodeInput(page);
      if (!codeInputReady) {
        const finalUrl = page.url();
        const bodyText = await collectVisiblePageText(page, {
          attempts: 2,
          delayMs: 500,
          limit: 3000,
        });
        const snippet = bodyText.replace(/\s+/g, " ").trim().slice(0, 700);
        const failureType = looksLikeConfirmationDeliveryPrompt(bodyText)
          ? "confirmation_delivery_step_required"
          : "confirmation_code_input_not_found";

        throw outcomeError(
          failureType,
          `Confirmation text appeared, but no visible code input was found. Final URL: ${finalUrl}. Page text: ${
            snippet || "empty"
          }`
        );
      }
    }

    return result;
  } catch (error) {
    if (error instanceof AutomationOutcomeError) {
      throw error;
    }

    const finalUrl = page.url();
    const bodyText = await collectVisiblePageText(page, {
      attempts: 6,
      delayMs: 750,
      limit: 3000,
    });
    const snippet = bodyText.replace(/\s+/g, " ").trim().slice(0, 700);

    if (/\/login\/?/i.test(finalUrl)) {
      throw outcomeError(
        "redirected_to_login",
        `Facebook redirected to login after submit instead of verification. Final URL: ${finalUrl}. Page text: ${
          snippet || "empty"
        }`
      );
    }

    if (/an error occurred during your registration|please try again/i.test(bodyText)) {
      throw outcomeError(
        "facebook_rejected",
        `Facebook rejected the registration after submit. Final URL: ${finalUrl}. Page text: ${
          snippet || "empty"
        }`
      );
    }

    if (/\/reg\/?/i.test(finalUrl) && !/code|confirmation|confirm|verify/i.test(bodyText)) {
      throw outcomeError(
        "registration_not_accepted",
        `Facebook stayed on registration page after submit instead of verification. Final URL: ${finalUrl}. Page text: ${
          snippet || "empty"
        }`
      );
    }

    throw outcomeError(
      "success_criteria_mismatch",
      `Success criteria did not match after submit. Expected: ${criteria.join(
        " or "
      )}. Final URL: ${finalUrl}. Page text: ${snippet || "empty"}`
    );
  }
}

async function runAttempt(attempt, template, settings) {
  const effectiveSettings = attemptSettings(settings, attempt.record);
  const proxySession = buildZyteProxySession(effectiveSettings, attempt, template.url);
  let browser;
  let context;
  let page;
  let stopLiveScreenshotCapture = () => {};

  try {
    if (proxySession) {
      attempt.result = attempt.result || {};
      attempt.result.proxySession = {
        provider: proxySession.provider,
        sessionId: proxySession.sessionId,
        enabled: proxySession.enabled,
      };
    }

    await recordStep(
      attempt,
      `launch browser headless=${effectiveSettings.headless !== false} slowMo=${effectiveSettings.slowMoMs || 0} registrationCase=${effectiveSettings.registrationCase} zyteProxy=${proxySession ? proxySession.sessionId : "off"}`
    );
    browser = await chromium.launch(browserLaunchOptions(effectiveSettings));
    context = await browser.newContext(browserContextOptions(effectiveSettings, proxySession));
    page = await context.newPage();
    page.setDefaultTimeout(actionTimeout());
    stopLiveScreenshotCapture = startLiveScreenshotCapture(
      attempt._id,
      page,
      effectiveSettings.livePreview !== false
    );

    const entryUrl = registrationEntryUrl(template.url);
    await recordStep(attempt, `goto ${entryUrl}`);
    await page.goto(entryUrl, {
      waitUntil: "domcontentloaded",
      timeout: actionTimeout(),
    });
    await openFacebookRegistrationFromEntry(page, attempt);
    await waitForFormReady(page);
    await recordStep(attempt, "form ready");

    const fieldOrder = normalizeFieldOrder(
      effectiveSettings.fieldOrder?.length ? effectiveSettings.fieldOrder : DEFAULT_FIELD_ORDER
    );
    const handledFields = new Set();
    let remainingFields = [];

    for (let step = 0; step < 3; step += 1) {
      await recordStep(attempt, `fill pass ${step + 1}`);
      await fillVisibleFields(page, attempt, template, effectiveSettings, fieldOrder, handledFields);
      remainingFields = pendingFields(fieldOrder, template, attempt.record, handledFields);
      await recordStep(
        attempt,
        `handled=${[...handledFields].join(",") || "-"} remaining=${remainingFields.join(",") || "-"}`
      );

      if (remainingFields.length === 0) {
        break;
      }

      if (await detectManualVerification(page)) {
        throw outcomeError("manual_verification_required", "Manual verification required");
      }

      await recordStep(attempt, "click intermediate submit/next");
      await clickSubmit(page, template.submitButton, effectiveSettings);
      await page.waitForLoadState("networkidle", { timeout: actionTimeout() }).catch(() => {});
      await dismissCommonOverlays(page);
      await waitForVisibleFormField(page).catch(() => {});
    }

    if (await detectManualVerification(page)) {
      throw outcomeError("manual_verification_required", "Manual verification required");
    }

    remainingFields = pendingFields(fieldOrder, template, attempt.record, handledFields);
    if (remainingFields.length > 0) {
      throw outcomeError(
        "field_not_found",
        `Could not find required fields after all registration steps: ${remainingFields.join(", ")}`
      );
    }

    await recordStep(attempt, "verify filled fields before submit");
    const verification = await verifyFilledFields(page, attempt.record, fieldOrder);
    attempt.result = attempt.result || {};
    attempt.result.fieldEvidence = verification.evidence;
    attempt.result.beforeSubmitSnapshot = verification.snapshot;
    const failedFields = failedEvidenceFields(verification.evidence);
    if (failedFields.length > 0) {
      throw outcomeError(
        "field_verification_failed",
        `Field verification failed before submit: ${failedFields.join("; ")}`
      );
    }
    await recordStep(attempt, "all filled fields verified before submit");

    await recordStep(attempt, "click final submit");
    await clickSubmit(page, template.submitButton, effectiveSettings);
    await page.waitForLoadState("networkidle", { timeout: actionTimeout() }).catch(() => {});

    if (await detectManualVerification(page)) {
      throw outcomeError("manual_verification_required", "Manual verification required");
    }

    await recordStep(attempt, "wait for success criteria");
    const result = await waitForSuccess(page, template.success, effectiveSettings);

    attempt.status = "success";
    attempt.error = undefined;
    attempt.result = {
      ...(attempt.result || {}),
      finalUrl: page.url(),
      matchedBy: result.matchedBy,
      failureType: undefined,
    };
    try {
      const storageResult = await saveRegisteredAccountFromAttempt(
        attempt,
        template,
        effectiveSettings
      );
      if (storageResult.stored) {
        attempt.result.registeredAccountId = storageResult.account._id;
        await recordStep(attempt, "registered account stored in Mongo");
      } else {
        await recordStep(attempt, `registered account storage skipped: ${storageResult.reason}`);
      }
    } catch (storageError) {
      await recordStep(
        attempt,
        `registered account storage failed: ${storageError.message || "unknown error"}`
      );
    }
  } catch (error) {
    attempt.status = "failed";
    attempt.error = error.message || "Automation failed";
    attempt.result = attempt.result || {};
    attempt.result.failureType = error.failureType || "automation_failed";
    await recordStep(attempt, `failed: ${attempt.error}`);
    if (page) {
      attempt.result.finalUrl = page.url();
      attempt.result.afterFailureSnapshot = await getFormSnapshot(page).catch(() => undefined);
      attempt.result.pageText = await collectVisiblePageText(page, {
        attempts: 3,
        delayMs: 500,
        limit: 1000,
      }).catch(() => undefined);
    }
    if (effectiveSettings.headless === false) {
      await sleep(effectiveSettings.keepBrowserOpenOnError ? 60000 : VISIBLE_FAILURE_PAUSE_MS);
    }
  } finally {
    stopLiveScreenshotCapture();
    if (page && !page.isClosed() && effectiveSettings.livePreview !== false) {
      try {
        const buffer = await page.screenshot({
          type: "jpeg",
          quality: 70,
          fullPage: false,
          timeout: 3000,
        });
        liveScreenshots.set(String(attempt._id), {
          contentType: "image/jpeg",
          buffer,
          updatedAt: Date.now(),
        });
      } catch (error) {
        liveScreenshots.set(String(attempt._id), {
          contentType: "text/plain",
          buffer: Buffer.from(error.message || "Screenshot unavailable"),
          updatedAt: Date.now(),
          error: error.message || "Screenshot unavailable",
        });
      }
    }

    attempt.finishedAt = new Date();
    await attempt.save();

    if (context) {
      await context.close().catch(() => {});
    }

    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function claimAttempt(jobId) {
  return Attempt.findOneAndUpdate(
    { jobId, status: "pending" },
    { $set: { status: "running", startedAt: new Date(), error: undefined } },
    { new: true, sort: { createdAt: 1 } }
  );
}

async function refreshJobStats(jobId) {
  const normalizedJobId =
    typeof jobId === "string" ? new mongoose.Types.ObjectId(jobId) : jobId;
  const counts = await Attempt.aggregate([
    { $match: { jobId: normalizedJobId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const stats = {
    pending: 0,
    running: 0,
    success: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const item of counts) {
    stats[item._id] = item.count;
  }

  const finalStatuses = stats.success + stats.failed + stats.cancelled;
  const update = { stats };
  const currentJob = await Job.findById(normalizedJobId).select("status");

  if (
    currentJob &&
    !["paused", "stopped", "failed"].includes(currentJob.status) &&
    finalStatuses > 0 &&
    finalStatuses === Object.values(stats).reduce((sum, value) => sum + value, 0)
  ) {
    update.status = "completed";
    update.finishedAt = new Date();
    activeJobs.delete(String(jobId));
  }

  return Job.findByIdAndUpdate(normalizedJobId, update, { new: true });
}

async function workerLane(jobId) {
  while (activeJobs.has(String(jobId))) {
    const job = await Job.findById(jobId);

    if (!job || job.status !== "running") {
      activeJobs.delete(String(jobId));
      return;
    }

    const templateDoc = await Template.findById(job.templateId);
    if (!templateDoc) {
      await Job.findByIdAndUpdate(jobId, {
        status: "failed",
        lastError: "Template not found",
        finishedAt: new Date(),
      });
      activeJobs.delete(String(jobId));
      return;
    }

    const attempt = await claimAttempt(jobId);
    if (!attempt) {
      await refreshJobStats(jobId);
      activeJobs.delete(String(jobId));
      return;
    }

    await refreshJobStats(jobId);
    await runAttempt(attempt, normalizeTemplate(templateDoc), job.settings);
    await refreshJobStats(jobId);

    const delayMs = randomDelay(job.settings.minDelayMs, job.settings.maxDelayMs);
    if (delayMs > 0 && activeJobs.has(String(jobId))) {
      await sleep(delayMs);
    }
  }
}

async function startJob(jobId) {
  const job = await Job.findById(jobId);
  if (!job) {
    const error = new Error("Job not found");
    error.statusCode = 404;
    throw error;
  }

  if (job.status === "stopped" || job.status === "completed") {
    const error = new Error(`Cannot start a ${job.status} job`);
    error.statusCode = 409;
    throw error;
  }

  await Job.findByIdAndUpdate(jobId, {
    status: "running",
    startedAt: job.startedAt || new Date(),
    finishedAt: undefined,
    lastError: undefined,
  });

  if (!activeJobs.has(String(jobId))) {
    activeJobs.add(String(jobId));

    for (let index = 0; index < job.settings.concurrency; index += 1) {
      workerLane(jobId).catch(async (error) => {
        activeJobs.delete(String(jobId));
        await Job.findByIdAndUpdate(jobId, {
          status: "failed",
          lastError: error.message || "Worker failed",
          finishedAt: new Date(),
        });
      });
    }
  }

  return Job.findById(jobId);
}

async function pauseJob(jobId) {
  activeJobs.delete(String(jobId));
  const job = await Job.findByIdAndUpdate(jobId, { status: "paused" }, { new: true });
  if (!job) {
    const error = new Error("Job not found");
    error.statusCode = 404;
    throw error;
  }
  return job;
}

async function resumeJob(jobId) {
  return startJob(jobId);
}

async function stopJob(jobId) {
  activeJobs.delete(String(jobId));

  const job = await Job.findByIdAndUpdate(
    jobId,
    { status: "stopped", finishedAt: new Date() },
    { new: true }
  );

  if (!job) {
    const error = new Error("Job not found");
    error.statusCode = 404;
    throw error;
  }

  await Attempt.updateMany(
    { jobId, status: "pending" },
    { $set: { status: "cancelled", finishedAt: new Date(), error: "Job stopped" } }
  );
  await refreshJobStats(jobId);

  return Job.findById(jobId);
}

module.exports = {
  startJob,
  pauseJob,
  resumeJob,
  stopJob,
  refreshJobStats,
  getAttemptScreenshot,
};
