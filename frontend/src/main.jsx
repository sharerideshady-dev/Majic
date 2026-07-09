import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import * as XLSX from "xlsx";
import {
  Activity,
  ClipboardList,
  FileJson,
  Globe,
  Database,
  KeyRound,
  Link2,
  CheckCircle2,
  Trash2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Square,
  Monitor,
  Upload,
} from "lucide-react";
import "./styles.css";

const currentHost =
  typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "127.0.0.1";
const API_BASE = import.meta.env.VITE_API_BASE_URL || `http://${currentHost}:5000`;
const days = Array.from({ length: 31 }, (_, index) => String(index + 1));
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
const years = Array.from({ length: 90 }, (_, index) => String(new Date().getFullYear() - 13 - index));
const fieldOrder = [
  "firstName",
  "surname",
  "username",
  "birthDay",
  "birthMonth",
  "birthYear",
  "gender",
  "contact",
  "password",
];

const registrationCaseNumberWords = {
  2: "TWO",
  3: "THREE",
  4: "FOUR",
  5: "FIVE",
};

const registrationCaseOptions = [
  "MAJIC ONE",
  ...Array.from({ length: 999 }, (_, index) => {
    const caseNumber = index + 2;
    return `MAJIC ${registrationCaseNumberWords[caseNumber] || caseNumber}`;
  }),
];

const proxyCaseOptions = [
  "PROXY ONE",
  ...Array.from({ length: 999 }, (_, index) => {
    const caseNumber = index + 2;
    return `PROXY ${registrationCaseNumberWords[caseNumber] || caseNumber}`;
  }),
];

const successMessageOptions = [
  "code|confirmation|confirm|verify",
  "confirmation code",
  "Enter the confirmation code",
  "registered",
  "Registration complete",
  "Account created",
  "Welcome",
  "Success",
  "Thank you",
  "ØªÙ… Ø§Ù„ØªØ³Ø¬ÙŠÙ„",
  "ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø­Ø³Ø§Ø¨",
  "Ù†Ø¬Ø§Ø­",
];

const NAME_LIBRARY_STORAGE_KEY = "majic:name-library";
const MAILU_FORM_STORAGE_KEY = "majic:mailu-form";
const MAILU_DEFAULT_DOMAIN = "aitechia.com";
const MAILU_DEFAULT_COUNT = 1000;

const defaultFirstNameOptions = [
  "Ahmad",
  "Mohammad",
  "Mahmoud",
  "Khaled",
  "Yousef",
  "Ibrahim",
  "Tamer",
  "Anas",
  "Alaa",
  "Hassan",
  "Mariam",
  "Aisha",
  "Lina",
  "Hala",
  "Reem",
  "Nour",
  "Dina",
  "Rana",
];

const maleFirstNameKeys = new Set([
  "ahmad",
  "ahmed",
  "mohammad",
  "mohammed",
  "muhammad",
  "mahmoud",
  "mahmood",
  "khaled",
  "khalid",
  "yousef",
  "yusuf",
  "ibrahim",
  "tamer",
  "anas",
  "alaa",
  "hassan",
  "hasan",
  "omar",
  "ommar",
  "ali",
  "abdullah",
  "abdallah",
  "hussein",
  "rami",
  "samer",
  "fadi",
  "majd",
  "zaid",
]);

const femaleFirstNameKeys = new Set([
  "mariam",
  "maryam",
  "aisha",
  "aysha",
  "lina",
  "hala",
  "reem",
  "nour",
  "noor",
  "dina",
  "rana",
  "fatima",
  "fatma",
  "sara",
  "sarah",
  "yara",
  "layla",
  "leila",
  "lama",
  "huda",
  "hoda",
  "rima",
  "rasha",
  "aya",
  "amal",
  "salma",
]);

const defaultSurnameOptions = [
  "Abu Amsha",
  "Abu Ghaida",
  "Abu Laban",
  "Abu Ramadan",
  "Al-Khalili",
  "Al-Masri",
  "Al-Nabulsi",
  "Al-Qudsi",
  "Al-Tamimi",
  "Barghouti",
  "Darwish",
  "Dweik",
  "Hammad",
  "Husseini",
  "Jarrar",
  "Kanaan",
  "Qawasmi",
  "Shaheen",
];

const emailHeaderPattern = /email|mail|contact|account|login|username/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const apiAccountHeaderAliases = {
  username: "username",
  user: "username",
  login: "username",
  account: "username",
  email: "email",
  emailaddress: "email",
  mail: "email",
  mobile: "mobile",
  phone: "mobile",
  phonenumber: "mobile",
  number: "mobile",
  contact: "contact",
  password: "password",
  pass: "password",
  loginurl: "loginUrl",
  login_url: "loginUrl",
  targeturl: "targetUrl",
  target_url: "targetUrl",
  pageurl: "targetUrl",
  page_url: "targetUrl",
  registrationcase: "registrationCase",
  registration_case: "registrationCase",
  majiccase: "registrationCase",
  majic_case: "registrationCase",
  proxycase: "proxyCase",
  proxy_case: "proxyCase",
  proxyid: "proxySessionId",
  proxysession: "proxySessionId",
  proxysessionid: "proxySessionId",
  proxy_session_id: "proxySessionId",
};

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const fieldErrors = data.details?.fieldErrors
      ? Object.entries(data.details.fieldErrors)
          .filter(([, messages]) => messages?.length)
          .map(([field, messages]) => `${field}: ${messages.join(", ")}`)
      : [];
    const formErrors = data.details?.formErrors || [];
    const detailText = [...formErrors, ...fieldErrors].join(" | ");
    const message = detailText || data.error || `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function cleanEmailAddress(value) {
  const email = String(value || "").trim().toLowerCase();
  return emailPattern.test(email) ? email : "";
}

function uniqueEmailAddresses(values) {
  const seen = new Set();
  const valid = [];
  let rawCount = 0;

  for (const value of values) {
    rawCount += 1;
    const email = cleanEmailAddress(value);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    valid.push(email);
  }

  return {
    rawCount,
    valid,
    duplicatesRemoved: Math.max(0, rawCount - valid.length),
  };
}

function parseUploadedEmailAccounts(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line, index) => {
      const cleanLine = line.trim();
      if (!cleanLine) return null;
      const separatorIndex = cleanLine.search(/[,\t]/);
      if (separatorIndex === -1) {
        throw new Error(`Line ${index + 1} must be email,password`);
      }
      const emailText =
        separatorIndex === -1 ? cleanLine : cleanLine.slice(0, separatorIndex);
      const password =
        separatorIndex === -1 ? "" : cleanLine.slice(separatorIndex + 1).trim();
      const email = cleanEmailAddress(emailText);
      if (!email || !password) {
        throw new Error(`Line ${index + 1} must include a valid email and password`);
      }
      return { email, password };
    })
    .filter(Boolean);
}

function uniqueUploadedEmailAccounts(accounts) {
  const seen = new Set();
  const valid = [];
  const passwordByEmail = {};
  const rawCount = accounts.length;

  for (const account of accounts) {
    if (!account.email || !account.password || seen.has(account.email)) continue;
    seen.add(account.email);
    valid.push(account.email);
    passwordByEmail[account.email] = account.password;
  }

  return {
    rawCount,
    valid,
    passwordByEmail,
    duplicatesRemoved: Math.max(0, rawCount - valid.length),
  };
}

function extractEmailsFromText(text) {
  return String(text || "")
    .split(/[\n,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractEmailsFromWorksheetRows(rows) {
  if (!rows.length) return [];

  const headers = rows[0].map((cell) => String(cell || "").trim());
  const headerIndex = headers.findIndex((header) => emailHeaderPattern.test(header));
  const columnIndex =
    headerIndex >= 0
      ? headerIndex
      : rows.reduce((best, row, index) => {
          if (index === 0) return best;
          row.forEach((cell, cellIndex) => {
            const score = cleanEmailAddress(cell) ? 1 : 0;
            best[cellIndex] = (best[cellIndex] || 0) + score;
          });
          return best;
        }, []).reduce(
          (best, score, index) => (score > best.score ? { index, score } : best),
          { index: 0, score: 0 }
        ).index;

  return rows
    .slice(headerIndex >= 0 ? 1 : 0)
    .map((row) => row[columnIndex])
    .filter((value) => value !== undefined && value !== null && value !== "");
}

function parseNameList(text) {
  return String(text || "")
    .split(/[\n,;]+/)
    .map((name) => name.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function uniqueNameList(values) {
  const seen = new Set();
  const names = [];

  values.forEach((value) => {
    const name = String(value || "").trim().replace(/\s+/g, " ");
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    names.push(name);
  });

  return names;
}

function defaultNameLibrary() {
  return {
    firstNames: defaultFirstNameOptions,
    surnames: defaultSurnameOptions,
  };
}

function loadNameLibrary() {
  if (typeof window === "undefined") return defaultNameLibrary();

  try {
    const saved = JSON.parse(window.localStorage.getItem(NAME_LIBRARY_STORAGE_KEY) || "{}");
    return {
      firstNames: uniqueNameList([
        ...defaultFirstNameOptions,
        ...(Array.isArray(saved.firstNames) ? saved.firstNames : []),
      ]),
      surnames: uniqueNameList([
        ...defaultSurnameOptions,
        ...(Array.isArray(saved.surnames) ? saved.surnames : []),
      ]),
    };
  } catch (error) {
    return defaultNameLibrary();
  }
}

function saveNameLibrary(library) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NAME_LIBRARY_STORAGE_KEY, JSON.stringify(library));
}

function defaultMailuForm() {
  return {
    count: MAILU_DEFAULT_COUNT,
    domain: MAILU_DEFAULT_DOMAIN,
    baseUrl: "",
    apiPath: "/api",
    apiToken: "",
    dryRun: true,
  };
}

function loadMailuForm() {
  const defaults = defaultMailuForm();
  if (typeof window === "undefined") return defaults;

  try {
    const saved = JSON.parse(window.localStorage.getItem(MAILU_FORM_STORAGE_KEY) || "{}");
    return {
      ...defaults,
      ...saved,
      count: Number(saved.count) || defaults.count,
      dryRun: saved.dryRun !== undefined ? Boolean(saved.dryRun) : defaults.dryRun,
    };
  } catch (error) {
    return defaults;
  }
}

function saveMailuForm(form) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MAILU_FORM_STORAGE_KEY, JSON.stringify(form));
}

function normalizeAccountHeader(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  return apiAccountHeaderAliases[key] || key;
}

function apiAccountIdentifier(account) {
  return account.username || account.email || account.mobile || account.contact || "";
}

function registeredAccountIdentifier(account) {
  return (
    account.identifierPreview ||
    account.identifier ||
    account.username ||
    account.email ||
    account.mobile ||
    account.contact ||
    ""
  );
}

function maskValue(value) {
  const text = String(value || "");
  if (!text) return "";
  return "*".repeat(Math.min(text.length, 12));
}

function compactApiAccount(account) {
  return Object.fromEntries(
    Object.entries(account)
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function mapApiAccountObject(source) {
  const account = {};
  Object.entries(source || {}).forEach(([key, value]) => {
    account[normalizeAccountHeader(key)] = value;
  });
  return compactApiAccount(account);
}

function parseDelimitedLine(line) {
  const separator = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
  return line.split(separator).map((part) => part.trim().replace(/^"|"$/g, ""));
}

function rowsToApiAccounts(rows) {
  if (!rows.length) return [];

  const headers = rows[0].map((header) => normalizeAccountHeader(header));
  const hasHeader =
    headers.includes("password") ||
    headers.some((header) => ["username", "email", "mobile", "contact"].includes(header));
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const fallbackHeaders = [
    "username",
    "password",
    "loginUrl",
    "targetUrl",
    "registrationCase",
    "proxyCase",
    "proxySessionId",
  ];
  const effectiveHeaders = hasHeader ? headers : fallbackHeaders;

  return dataRows
    .map((row) =>
      compactApiAccount(
        row.reduce((account, value, index) => {
          const key = effectiveHeaders[index];
          if (key) account[key] = value;
          return account;
        }, {})
      )
    )
    .filter((account) => apiAccountIdentifier(account) && account.password);
}

function parseApiAccountsFromText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    return entries.map(mapApiAccountObject).filter((account) => apiAccountIdentifier(account) && account.password);
  }

  const rows = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseDelimitedLine);
  return rowsToApiAccounts(rows);
}

function parseApiAccountsFromWorksheetRows(rows) {
  return rowsToApiAccounts(
    rows
      .filter((row) => row.some((cell) => String(cell || "").trim()))
      .map((row) => row.map((cell) => String(cell || "").trim()))
  );
}

function uniqueApiAccounts(accounts) {
  const seen = new Set();
  const valid = [];
  let rawCount = 0;

  accounts.forEach((account) => {
    rawCount += 1;
    const identifier = apiAccountIdentifier(account);
    if (!identifier || !account.password) return;

    const key = `${identifier}|${account.loginUrl || ""}|${account.targetUrl || ""}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    valid.push(account);
  });

  return {
    rawCount,
    valid,
    duplicatesRemoved: Math.max(0, rawCount - valid.length),
  };
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomBirthDate() {
  const currentYear = new Date().getFullYear();
  const year = randomInt(currentYear - 35, currentYear - 18);
  const month = randomInt(1, 12);
  const lastDay = new Date(year, month, 0).getDate();
  const day = randomInt(1, lastDay);
  return {
    birthDay: String(day),
    birthMonth: String(month),
    birthYear: String(year),
  };
}

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const length = randomInt(12, 16);
  let password = "";
  for (let index = 0; index < length; index += 1) {
    password += chars[randomInt(0, chars.length - 1)];
  }
  return password;
}

function generatedRecord(email, registrationCase, proxyCase, nameLibrary, password) {
  const emailParts = emailNameParts(email);
  const firstNames = nameLibrary.firstNames.length
    ? nameLibrary.firstNames
    : defaultFirstNameOptions;
  const surnames = nameLibrary.surnames.length ? nameLibrary.surnames : defaultSurnameOptions;
  const proxySessionId = `${proxyCase}-${email}`.replace(/[^a-zA-Z0-9_.:-]/g, "-");
  const firstName = emailParts.firstName || randomItem(firstNames);
  const surname = emailParts.surname || randomItem(surnames);
  const username = email.split("@")[0] || "";

  return {
    firstName,
    surname,
    ...randomBirthDate(),
    gender: genderForFirstName(firstName),
    username,
    email,
    contact: email,
    password,
    registrationCase,
    proxyCase,
    proxySessionId,
  };
}

function slugName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function nameGender(firstName) {
  const key = slugName(firstName);
  if (maleFirstNameKeys.has(key)) return "male";
  if (femaleFirstNameKeys.has(key)) return "female";
  return "unknown";
}

function genderForFirstName(firstName, format = "lower") {
  const gender = nameGender(firstName);
  const normalizedGender =
    gender === "unknown" ? (slugName(firstName).charCodeAt(0) % 2 === 0 ? "female" : "male") : gender;

  return format === "title"
    ? normalizedGender.charAt(0).toUpperCase() + normalizedGender.slice(1)
    : normalizedGender;
}

function generateMailuRows(count, domain, nameLibrary) {
  const safeCount = Math.min(Math.max(Number(count) || MAILU_DEFAULT_COUNT, 1), 10000);
  const firstNames = nameLibrary.firstNames.length
    ? nameLibrary.firstNames
    : defaultFirstNameOptions;
  const surnames = nameLibrary.surnames.length ? nameLibrary.surnames : defaultSurnameOptions;
  const emailOptions = [];
  const seenEmails = new Set();

  firstNames.forEach((firstName) => {
    surnames.forEach((surname) => {
      const email = `${slugName(firstName)}.${slugName(surname)}@${domain}`;
      if (seenEmails.has(email)) return;
      seenEmails.add(email);
      emailOptions.push({ firstName, surname, email });
    });
  });

  const rows = [];
  const targetCount = Math.min(safeCount, emailOptions.length);

  while (rows.length < targetCount) {
    const optionIndex = randomInt(0, emailOptions.length - 1);
    const [{ firstName, surname, email }] = emailOptions.splice(optionIndex, 1);
    const birthDate = randomBirthDate();

    rows.push({
      name: `${firstName} ${surname}`,
      firstName,
      surname,
      day: Number(birthDate.birthDay),
      month: Number(birthDate.birthMonth),
      year: Number(birthDate.birthYear),
      gender: genderForFirstName(firstName, "title"),
      email,
      password: randomPassword(),
    });
  }

  return rows;
}

function emailNameParts(email) {
  const localPart = String(email || "").split("@")[0] || "";
  const parts = localPart
    .split(".")
    .map((part) => part.replace(/\d+$/g, "").trim())
    .filter(Boolean);

  return {
    firstName: parts[0] || "",
    surname: parts[1] || "",
  };
}

function normalizeNamePart(value) {
  return slugName(value).replace(/\d+$/g, "");
}

function mailuCreatedToGeneratorRecord(createdUser) {
  const rawLinkedUser = createdUser.generatedUserId || {};
  const fallback = emailNameParts(createdUser.email);
  const email = cleanEmailAddress(createdUser.email);
  const username = email.split("@")[0] || "";
  const linkedEmail = cleanEmailAddress(rawLinkedUser.email);
  const linkedUser = linkedEmail && linkedEmail === email ? rawLinkedUser : {};
  const firstName = fallback.firstName;
  const surname = fallback.surname;
  const emailParts = emailNameParts(email);
  const hasLinkedIdentity = Boolean(linkedUser.email);
  const createdPassword = String(createdUser.password || "");
  const password = createdPassword;
  const hasRequiredIdentity =
    Boolean(firstName) &&
    Boolean(surname) &&
    Boolean(linkedUser.day || linkedUser.birthDay) &&
    Boolean(linkedUser.month || linkedUser.birthMonth) &&
    Boolean(linkedUser.year || linkedUser.birthYear) &&
    Boolean(linkedUser.gender);
  const nameMatchesEmail =
    !emailParts.firstName ||
    (normalizeNamePart(firstName) === normalizeNamePart(emailParts.firstName) &&
      normalizeNamePart(surname) === normalizeNamePart(emailParts.surname));

  return {
    firstName,
    surname,
    birthDay: String(linkedUser.day || linkedUser.birthDay || ""),
    birthMonth: String(linkedUser.month || linkedUser.birthMonth || ""),
    birthYear: String(linkedUser.year || linkedUser.birthYear || ""),
    gender: String(linkedUser.gender || "").toLowerCase(),
    username,
    email,
    contact: email,
    password,
    mailuPassword: createdPassword,
    mailuBatchId: createdUser.batchId,
    mailuCreatedUserId: createdUser._id,
    validation: {
      validEmail: Boolean(email),
      linkedEmailMatches: !linkedEmail || linkedEmail === email,
      hasLinkedIdentity,
      hasRequiredIdentity,
      nameMatchesEmail,
      passwordMatchesMailu: !createdPassword || password === createdPassword,
      status: createdUser.status,
    },
  };
}

function validateMailuCreatedRecords(createdUsers) {
  const seenEmails = new Set();
  let duplicateEmails = 0;
  const records = createdUsers
    .filter((user) => user.status === "created")
    .filter((user) => {
      const email = cleanEmailAddress(user.email);
      if (!email) return true;
      if (seenEmails.has(email)) {
        duplicateEmails += 1;
        return false;
      }
      seenEmails.add(email);
      return true;
    })
    .map(mailuCreatedToGeneratorRecord);
  const summary = records.reduce(
    (totals, record) => ({
      total: totals.total + 1,
      matched: totals.matched + (record.validation.hasLinkedIdentity ? 1 : 0),
      missingIdentity: totals.missingIdentity + (record.validation.hasRequiredIdentity ? 0 : 1),
      mismatchedNames: totals.mismatchedNames + (record.validation.nameMatchesEmail ? 0 : 1),
      invalidEmails: totals.invalidEmails + (record.validation.validEmail ? 0 : 1),
    }),
    {
      total: 0,
      matched: 0,
      missingIdentity: 0,
      mismatchedNames: 0,
      invalidEmails: 0,
      duplicateEmails,
    }
  );
  summary.duplicateEmails = duplicateEmails;
  const validRecords = records.filter(
    (record) =>
      record.validation.validEmail &&
      record.validation.hasRequiredIdentity &&
      record.validation.nameMatchesEmail &&
      record.password
  );

  return { records, validRecords, summary };
}

function validateMailuGeneratorPasswords(records) {
  const invalidRecord = records.find(
    (record) =>
      !record.email ||
      !record.password ||
      !record.mailuPassword ||
      record.password !== record.mailuPassword
  );

  if (invalidRecord) {
    throw new Error(
      `Mailu password mismatch for ${invalidRecord.email || "selected record"}`
    );
  }
}

function pickRandomItems(items, count) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, count);
}

function stableIndex(value, length) {
  if (length <= 1) return 0;
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash % length;
}

function caseForRecord(cases, index, mode, seed = "") {
  const availableCases = cases.length > 0 ? cases : ["MAJIC ONE"];
  if (mode === "random") {
    return availableCases[stableIndex(seed, availableCases.length)];
  }
  return availableCases[index % availableCases.length];
}

function settingsPayload(settings) {
  return {
    minDelayMs: Number(settings.minDelayMs),
    maxDelayMs: Number(settings.maxDelayMs),
    registrationCase: settings.registrationCase,
    concurrency: Number(settings.concurrency),
    headless: true,
    showBrowser: false,
    livePreview: Boolean(settings.livePreview),
    slowMoMs: 0,
    keepBrowserOpenOnError: false,
    fieldOrder,
  };
}

function StatusPill({ status }) {
  return <span className={`status status-${status || "unknown"}`}>{status || "unknown"}</span>;
}

function StatBox({ label, value }) {
  return (
    <div className="stat-box">
      <span>{label}</span>
      <strong>{value ?? 0}</strong>
    </div>
  );
}

function buildLocator(selector, placeholder, type = "text") {
  const locator = {};
  locator.type = type;

  if (selector.trim()) {
    locator.selector = selector.trim();
  }

  if (placeholder.trim()) {
    locator.fallback = { placeholder: placeholder.trim() };
  }

  return locator;
}

function defaultTemplateFields() {
  return {
    firstName: buildLocator("", "First name"),
    surname: buildLocator("", "Surname"),
    birthDay: buildLocator("", "Day", "select"),
    birthMonth: buildLocator("", "Month", "select"),
    birthYear: buildLocator("", "Year", "select"),
    gender: buildLocator("", "Select your gender", "select"),
    contact: buildLocator("", "Mobile number or email address"),
    password: buildLocator("", "Password"),
  };
}

function App() {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState([]);
  const [selectedJobIds, setSelectedJobIds] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedJob, setSelectedJob] = useState(null);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState("manual");
  const [templateForm, setTemplateForm] = useState({
    name: "",
    url: "",
    firstNameSelector: "",
    firstNamePlaceholder: "First name",
    surnameSelector: "",
    surnamePlaceholder: "Surname",
    birthDaySelector: "",
    birthDayPlaceholder: "Day",
    birthMonthSelector: "",
    birthMonthPlaceholder: "Month",
    birthYearSelector: "",
    birthYearPlaceholder: "Year",
    genderSelector: "",
    genderPlaceholder: "Select your gender",
    contactSelector: "",
    contactPlaceholder: "Mobile number or email address",
    passwordSelector: "",
    passwordPlaceholder: "Password",
    submitSelector: "button[type='submit']",
    successMode: "message",
    successUrlContains: "",
    successTextSelector: "body",
    successTextContains: "code|confirmation|confirm|verify",
  });
  const [accountForm, setAccountForm] = useState({
    firstName: "",
    surname: "",
    birthDay: "",
    birthMonth: "",
    birthYear: "",
    gender: "",
    contact: "",
    password: "",
  });
  const [jobTemplateId, setJobTemplateId] = useState("");
  const [settings, setSettings] = useState({
    minDelayMs: 30000,
    maxDelayMs: 180000,
    concurrency: 1,
    registrationCase: "MAJIC ONE",
    headless: true,
    livePreview: true,
    slowMoMs: 0,
    keepBrowserOpenOnError: false,
  });
  const [generatorForm, setGeneratorForm] = useState({
    templateId: "",
    emailSource: "upload",
    countMode: "all",
    manualCount: 10,
    mailuUseMode: "selected",
    mailuCount: 50,
    caseMode: "rotate",
    proxyCaseMode: "rotate",
    fileName: "",
    registrationCases: ["MAJIC ONE"],
    proxyCases: ["PROXY ONE"],
  });
  const [nameLibrary, setNameLibrary] = useState(loadNameLibrary);
  const [nameLibraryDraft, setNameLibraryDraft] = useState({
    firstNames: "",
    surnames: "",
  });
  const [mailuForm, setMailuForm] = useState(loadMailuForm);
  const [mailuRows, setMailuRows] = useState(() =>
    generateMailuRows(
      loadMailuForm().count,
      loadMailuForm().domain || MAILU_DEFAULT_DOMAIN,
      loadNameLibrary()
    )
  );
  const [mailuBatchId, setMailuBatchId] = useState("");
  const [mailuStatus, setMailuStatus] = useState({
    state: "idle",
    message: "No Mailu action has run yet.",
    summary: null,
    results: [],
  });
  const [mailuBatches, setMailuBatches] = useState([]);
  const [mailuCreatedUsers, setMailuCreatedUsers] = useState([]);
  const [mailuCreatedTotal, setMailuCreatedTotal] = useState(0);
  const [selectedMailuCreatedIds, setSelectedMailuCreatedIds] = useState([]);
  const [mailuSearch, setMailuSearch] = useState("");
  const [apiAutomationForm, setApiAutomationForm] = useState({
    loginUrl: "",
    targetUrl: "",
    username: "",
    password: "",
    minDelayMs: 30000,
    maxDelayMs: 180000,
    concurrency: 1,
    registrationCases: ["MAJIC ONE"],
    proxyCases: ["PROXY ONE"],
    useZyteProxy: false,
    requestedActions: {
      followPage: true,
      likePosts: true,
      sharePosts: true,
    },
  });
  const [apiAutomationCapabilities, setApiAutomationCapabilities] = useState(null);
  const [apiAutomationPlan, setApiAutomationPlan] = useState(null);
  const [apiAutomationRunResult, setApiAutomationRunResult] = useState(null);
  const [apiAccounts, setApiAccounts] = useState({
    rawCount: 0,
    valid: [],
    duplicatesRemoved: 0,
    sourceName: "",
  });
  const [apiAccountPaste, setApiAccountPaste] = useState("");
  const [apiAutomationJobs, setApiAutomationJobs] = useState([]);
  const [selectedApiAutomationJobIds, setSelectedApiAutomationJobIds] = useState([]);
  const [selectedApiAutomationJobId, setSelectedApiAutomationJobId] = useState("");
  const [selectedApiAutomationJob, setSelectedApiAutomationJob] = useState(null);
  const [apiAutomationLogs, setApiAutomationLogs] = useState([]);
  const [registeredAccounts, setRegisteredAccounts] = useState([]);
  const [registeredAccountsTotal, setRegisteredAccountsTotal] = useState(0);
  const [registeredAccountsCredentials, setRegisteredAccountsCredentials] = useState(null);
  const [selectedRegisteredAccountIds, setSelectedRegisteredAccountIds] = useState([]);
  const [registeredAccountFilters, setRegisteredAccountFilters] = useState({
    search: "",
    registrationCase: "",
    proxyCase: "",
    status: "registered",
  });
  const [uploadedEmails, setUploadedEmails] = useState({
    rawCount: 0,
    valid: [],
    passwordByEmail: {},
    duplicatesRemoved: 0,
  });
  const [uploadedEmailValues, setUploadedEmailValues] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [livePreviewUrl, setLivePreviewUrl] = useState("");
  const [livePreviewError, setLivePreviewError] = useState("");

  const selectedTemplate = useMemo(
    () => templates.find((template) => template._id === jobTemplateId),
    [templates, jobTemplateId]
  );
  const selectedGeneratorTemplate = useMemo(
    () => templates.find((template) => template._id === generatorForm.templateId),
    [templates, generatorForm.templateId]
  );
  const generatorEmails = useMemo(() => {
    if (generatorForm.countMode === "manual") {
      return uploadedEmails.valid.slice(0, Number(generatorForm.manualCount) || 0);
    }
    return uploadedEmails.valid;
  }, [generatorForm.countMode, generatorForm.manualCount, uploadedEmails.valid]);
  const selectedGeneratorCases = useMemo(
    () =>
      generatorForm.registrationCases.length > 0
        ? generatorForm.registrationCases
        : ["MAJIC ONE"],
    [generatorForm.registrationCases]
  );
  const selectedGeneratorProxyCases = useMemo(
    () =>
      generatorForm.proxyCases.length > 0
        ? generatorForm.proxyCases
        : ["PROXY ONE"],
    [generatorForm.proxyCases]
  );
  const selectedApiAutomationCases = useMemo(
    () =>
      apiAutomationForm.registrationCases.length > 0
        ? apiAutomationForm.registrationCases
        : ["MAJIC ONE"],
    [apiAutomationForm.registrationCases]
  );
  const selectedApiAutomationProxyCases = useMemo(
    () =>
      apiAutomationForm.proxyCases.length > 0
        ? apiAutomationForm.proxyCases
        : ["PROXY ONE"],
    [apiAutomationForm.proxyCases]
  );
  const generatedRecords = useMemo(
    () =>
      generatorEmails.map((email, index) =>
        generatedRecord(
          email,
          selectedGeneratorCases[index % selectedGeneratorCases.length],
          selectedGeneratorProxyCases[index % selectedGeneratorProxyCases.length],
          nameLibrary,
          uploadedEmails.passwordByEmail[email]
        )
      ),
    [
      generatorEmails,
      nameLibrary,
      selectedGeneratorCases,
      selectedGeneratorProxyCases,
      uploadedEmails.passwordByEmail,
    ]
  );
  const mailuGeneratorValidation = useMemo(
    () => validateMailuCreatedRecords(mailuCreatedUsers),
    [mailuCreatedUsers]
  );
  const selectedMailuRecordCount = useMemo(
    () =>
      mailuGeneratorValidation.validRecords.filter((record) =>
        selectedMailuCreatedIds.includes(record.mailuCreatedUserId)
      ).length,
    [mailuGeneratorValidation.validRecords, selectedMailuCreatedIds]
  );
  const selectedMailuRecordsForGenerator = useMemo(() => {
    const validRecords = mailuGeneratorValidation.validRecords;
    const count = Math.min(
      Math.max(Number(generatorForm.mailuCount) || validRecords.length, 1),
      validRecords.length
    );

    if (generatorForm.mailuUseMode === "selected") {
      return validRecords.filter((record) =>
        selectedMailuCreatedIds.includes(record.mailuCreatedUserId)
      );
    }

    if (generatorForm.mailuUseMode === "random") {
      return pickRandomItems(validRecords, count);
    }

    return validRecords.slice(0, count);
  }, [
    generatorForm.mailuCount,
    generatorForm.mailuUseMode,
    mailuGeneratorValidation.validRecords,
    selectedMailuCreatedIds,
  ]);
  const dataGeneratorRecords = useMemo(
    () => {
      if (generatorForm.emailSource !== "mailu") return generatedRecords;

      return selectedMailuRecordsForGenerator.map((record, index) => ({
        ...record,
        registrationCase: caseForRecord(
          selectedGeneratorCases,
          index,
          generatorForm.caseMode,
          `${record.email}:majic`
        ),
        proxyCase: caseForRecord(
          selectedGeneratorProxyCases,
          index,
          generatorForm.proxyCaseMode,
          `${record.email}:proxy`
        ),
      }));
    },
    [
      generatedRecords,
      generatorForm.caseMode,
      generatorForm.emailSource,
      generatorForm.proxyCaseMode,
      selectedMailuRecordsForGenerator,
      selectedGeneratorCases,
      selectedGeneratorProxyCases,
    ]
  );
  const mailuPreviewRows = useMemo(() => mailuRows.slice(0, 12), [mailuRows]);
  const mailuResultRows = useMemo(
    () => mailuStatus.results.slice(0, 200),
    [mailuStatus.results]
  );
  const apiAccountsForQueue = useMemo(() => {
    const baseAccounts =
      apiAccounts.valid.length > 0
        ? apiAccounts.valid
        : apiAutomationForm.username && apiAutomationForm.password
          ? [
              {
                username: apiAutomationForm.username,
                password: apiAutomationForm.password,
              },
            ]
          : [];

    return baseAccounts.map((account, index) => ({
      ...account,
      registrationCase:
        account.registrationCase ||
        selectedApiAutomationCases[index % selectedApiAutomationCases.length],
      proxyCase:
        account.proxyCase ||
        selectedApiAutomationProxyCases[index % selectedApiAutomationProxyCases.length],
      proxySessionId:
        account.proxySessionId ||
        (apiAutomationForm.useZyteProxy
          ? `${account.proxyCase || selectedApiAutomationProxyCases[index % selectedApiAutomationProxyCases.length]}-${String(
              apiAccountIdentifier(account) || index + 1
            ).replace(/[^a-zA-Z0-9_.:-]/g, "-")}`
          : ""),
    }));
  }, [
    apiAccounts.valid,
    apiAutomationForm.password,
    apiAutomationForm.username,
    apiAutomationForm.useZyteProxy,
    selectedApiAutomationCases,
    selectedApiAutomationProxyCases,
  ]);
  const selectedRegisteredAccounts = useMemo(
    () =>
      registeredAccounts.filter((account) =>
        selectedRegisteredAccountIds.includes(account._id)
      ),
    [registeredAccounts, selectedRegisteredAccountIds]
  );
  const generatorCountWarning =
    generatorForm.countMode === "manual" &&
    Number(generatorForm.manualCount) > uploadedEmails.valid.length
      ? `Only ${uploadedEmails.valid.length} valid emails are available`
      : "";
  const latestBackendError = useMemo(() => {
    const failedLogs = logs.filter((log) => log.status === "failed" && log.error);
    return failedLogs.at(-1)?.error || selectedJob?.lastError || "";
  }, [logs, selectedJob]);
  const latestApiAutomationError = useMemo(() => {
    const failedLogs = apiAutomationLogs.filter((log) => log.status === "failed" && log.error);
    return failedLogs.at(-1)?.error || selectedApiAutomationJob?.lastError || "";
  }, [apiAutomationLogs, selectedApiAutomationJob]);
  const liveApiAutomationAttempt = useMemo(
    () =>
      apiAutomationLogs.find((log) => log.status === "running") ||
      [...apiAutomationLogs].reverse().find((log) => ["failed", "success"].includes(log.status)) ||
      null,
    [apiAutomationLogs]
  );
  const livePreviewAttempt = useMemo(
    () =>
      logs.find((log) => log.status === "running") ||
      [...logs].reverse().find((log) => ["failed", "success"].includes(log.status)) ||
      null,
    [logs]
  );

  function updateTemplateForm(field, value) {
    setTemplateForm((current) => ({ ...current, [field]: value }));
  }

  function updateAccountForm(field, value) {
    setAccountForm((current) => ({ ...current, [field]: value }));
  }

  function updateGeneratorForm(field, value) {
    setGeneratorForm((current) => ({ ...current, [field]: value }));
  }

  function updateMailuForm(field, value) {
    setMailuForm((current) => {
      const nextForm = { ...current, [field]: value };
      saveMailuForm(nextForm);
      return nextForm;
    });
  }

  function generateMailuBatch() {
    const domain = String(mailuForm.domain || MAILU_DEFAULT_DOMAIN)
      .trim()
      .toLowerCase()
      .replace(/^@/, "");
    const rows = generateMailuRows(mailuForm.count, domain, nameLibrary);
    setMailuRows(rows);
    setMailuBatchId("");
    setMailuStatus({
      state: "idle",
      message: `Generated ${rows.length} ${domain} users locally. Save to MongoDB when ready.`,
      summary: null,
      results: [],
    });
  }

  async function saveMailuBatch() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await apiRequest("/api/mailu-users/generated-batches", {
        method: "POST",
        body: JSON.stringify({
          batchId: mailuBatchId || undefined,
          domain: mailuForm.domain,
          users: mailuRows,
        }),
      });
      setMailuBatchId(data.batchId);
      setNotice(data.message);
      await loadMailuStorage();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function testMailuConnection() {
    setBusy(true);
    setError("");
    setNotice("");
    setMailuStatus({
      state: "loading",
      message: "Testing Mailu API connection...",
      summary: null,
      results: [],
    });
    try {
      const data = await apiRequest("/api/mailu-users/test", {
        method: "POST",
        body: JSON.stringify(mailuForm),
      });
      setMailuStatus({
        state: "success",
        message: data.message,
        summary: data.summary,
        results: [],
      });
    } catch (err) {
      setMailuStatus({
        state: "error",
        message: err.message,
        summary: null,
        results: [],
      });
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createMailuUsers() {
    setBusy(true);
    setError("");
    setNotice("");
    setMailuStatus({
      state: "loading",
      message: mailuForm.dryRun
        ? "Checking generated users without creating Mailu accounts..."
        : "Creating Mailu users and storing results in MongoDB...",
      summary: null,
      results: [],
    });
    try {
      const data = await apiRequest("/api/mailu-users/create", {
        method: "POST",
        body: JSON.stringify({
          ...mailuForm,
          batchId: mailuBatchId || undefined,
          users: mailuRows,
        }),
      });
      setMailuBatchId(data.batchId);
      setMailuStatus({
        state: "success",
        message: data.message,
        summary: data.summary,
        results: data.results || [],
      });
      setNotice(data.message);
      await loadMailuStorage();
    } catch (err) {
      setMailuStatus({
        state: "error",
        message: err.message,
        summary: null,
        results: [],
      });
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function findMailuDuplicates() {
    setBusy(true);
    setError("");
    setNotice("");
    setMailuStatus({
      state: "loading",
      message: "Checking Mailu for duplicate addresses...",
      summary: null,
      results: [],
    });
    try {
      const data = await apiRequest("/api/mailu-users/cleanup-duplicates", {
        method: "POST",
        body: JSON.stringify({
          ...mailuForm,
          dryRun: true,
        }),
      });
      setMailuStatus({
        state: "success",
        message: data.message,
        summary: data.summary,
        results: data.results || [],
      });
      setNotice(data.message);
    } catch (err) {
      setMailuStatus({
        state: "error",
        message: err.message,
        summary: null,
        results: [],
      });
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function cleanupMailuDuplicates() {
    setBusy(true);
    setError("");
    setNotice("");
    setMailuStatus({
      state: "loading",
      message: mailuForm.dryRun
        ? "Dry run: checking duplicate Mailu users without deleting..."
        : "Deleting duplicate Mailu users...",
      summary: null,
      results: [],
    });
    try {
      const data = await apiRequest("/api/mailu-users/cleanup-duplicates", {
        method: "POST",
        body: JSON.stringify(mailuForm),
      });
      setMailuStatus({
        state: "success",
        message: data.message,
        summary: data.summary,
        results: data.results || [],
      });
      setNotice(data.message);
      await loadMailuStorage();
    } catch (err) {
      setMailuStatus({
        state: "error",
        message: err.message,
        summary: null,
        results: [],
      });
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function cleanupExistingGeneratedMailuUsers() {
    setBusy(true);
    setError("");
    setNotice("");
    setMailuStatus({
      state: "loading",
      message: mailuForm.dryRun
        ? "Dry run: checking existing generated Mailu mailboxes..."
        : "Deleting existing generated Mailu mailboxes...",
      summary: null,
      results: [],
    });
    try {
      const data = await apiRequest("/api/mailu-users/cleanup-generated-existing", {
        method: "POST",
        body: JSON.stringify({
          ...mailuForm,
          batchId: mailuBatchId || undefined,
          users: mailuRows,
        }),
      });
      setMailuStatus({
        state: "success",
        message: data.message,
        summary: data.summary,
        results: data.results || [],
      });
      setNotice(data.message);
      await loadMailuStorage();
    } catch (err) {
      setMailuStatus({
        state: "error",
        message: err.message,
        summary: null,
        results: [],
      });
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function updateNameLibraryDraft(field, value) {
    setNameLibraryDraft((current) => ({ ...current, [field]: value }));
  }

  function updateStoredNameLibrary(updater) {
    setNameLibrary((current) => {
      const nextLibrary = updater(current);
      saveNameLibrary(nextLibrary);
      return nextLibrary;
    });
  }

  function addNamesToLibrary(field) {
    const names = parseNameList(nameLibraryDraft[field]);
    if (names.length === 0) return;

    updateStoredNameLibrary((current) => ({
      ...current,
      [field]: uniqueNameList([...current[field], ...names]),
    }));
    setNameLibraryDraft((current) => ({ ...current, [field]: "" }));
    setNotice(`Added ${names.length} names`);
    setError("");
  }

  function resetNameLibrary(field) {
    updateStoredNameLibrary((current) => ({
      ...current,
      [field]: defaultNameLibrary()[field],
    }));
    setNotice("Name library reset");
    setError("");
  }

  function updateApiAutomationForm(field, value) {
    setApiAutomationForm((current) => ({ ...current, [field]: value }));
    setApiAutomationPlan(null);
    setApiAutomationRunResult(null);
  }

  function updateRegisteredAccountFilter(field, value) {
    setRegisteredAccountFilters((current) => ({ ...current, [field]: value }));
  }

  function showFacebookRegisteredAccounts() {
    const nextFilters = {
      ...registeredAccountFilters,
      status: "registered",
      facebookOnly: true,
    };
    loadRegisteredAccounts(nextFilters);
  }

  function updateApiAutomationAction(action, value) {
    setApiAutomationForm((current) => ({
      ...current,
      requestedActions: {
        ...current.requestedActions,
        [action]: value,
      },
    }));
    setApiAutomationPlan(null);
    setApiAutomationRunResult(null);
  }

  function toggleApiAutomationRegistrationCase(registrationCase) {
    setApiAutomationForm((current) => {
      const exists = current.registrationCases.includes(registrationCase);
      const nextCases = exists
        ? current.registrationCases.filter((item) => item !== registrationCase)
        : [...current.registrationCases, registrationCase];
      return {
        ...current,
        registrationCases: nextCases.length ? nextCases : ["MAJIC ONE"],
      };
    });
  }

  function toggleApiAutomationProxyCase(proxyCase) {
    setApiAutomationForm((current) => {
      const exists = current.proxyCases.includes(proxyCase);
      const nextCases = exists
        ? current.proxyCases.filter((item) => item !== proxyCase)
        : [...current.proxyCases, proxyCase];
      return {
        ...current,
        proxyCases: nextCases.length ? nextCases : ["PROXY ONE"],
      };
    });
  }

  function toggleRegisteredAccountSelection(accountId) {
    setSelectedRegisteredAccountIds((current) =>
      current.includes(accountId)
        ? current.filter((id) => id !== accountId)
        : [...current, accountId]
    );
  }

  function selectVisibleRegisteredAccounts() {
    setSelectedRegisteredAccountIds(registeredAccounts.map((account) => account._id));
  }

  function toggleMailuCreatedSelection(recordId) {
    setSelectedMailuCreatedIds((current) =>
      current.includes(recordId)
        ? current.filter((id) => id !== recordId)
        : [...current, recordId]
    );
  }

  function selectAllValidMailuCreated() {
    setSelectedMailuCreatedIds(
      mailuGeneratorValidation.validRecords
        .map((record) => record.mailuCreatedUserId)
        .filter(Boolean)
    );
  }

  function clearSelectedMailuCreated() {
    setSelectedMailuCreatedIds([]);
  }

  function toggleGeneratorRegistrationCase(registrationCase) {
    setGeneratorForm((current) => {
      const exists = current.registrationCases.includes(registrationCase);
      const nextCases = exists
        ? current.registrationCases.filter((item) => item !== registrationCase)
        : [...current.registrationCases, registrationCase];
      return {
        ...current,
        registrationCases: nextCases.length ? nextCases : ["MAJIC ONE"],
      };
    });
  }

  function toggleGeneratorProxyCase(proxyCase) {
    setGeneratorForm((current) => {
      const exists = current.proxyCases.includes(proxyCase);
      const nextCases = exists
        ? current.proxyCases.filter((item) => item !== proxyCase)
        : [...current.proxyCases, proxyCase];
      return {
        ...current,
        proxyCases: nextCases.length ? nextCases : ["PROXY ONE"],
      };
    });
  }

  async function handleEmailFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setNotice("");

    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (extension !== "txt") {
        throw new Error("Upload a .txt file with one email,password pair per line");
      }

      const values = parseUploadedEmailAccounts(await file.text());
      const emailResult = uniqueUploadedEmailAccounts(values);
      setUploadedEmailValues(values);
      setUploadedEmails(emailResult);
      setGeneratorForm((current) => ({ ...current, fileName: file.name }));
      setNotice(`Loaded ${emailResult.valid.length} email/password pairs from ${file.name}`);
    } catch (err) {
      setUploadedEmailValues([]);
      setUploadedEmails({ rawCount: 0, valid: [], passwordByEmail: {}, duplicatesRemoved: 0 });
      setError(err.message || "Could not read email file");
    } finally {
      event.target.value = "";
    }
  }

  async function handleApiAccountFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setNotice("");

    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      let accounts = [];

      if (extension === "xlsx" || extension === "xls") {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
        accounts = parseApiAccountsFromWorksheetRows(rows);
      } else {
        accounts = parseApiAccountsFromText(await file.text());
      }

      const result = uniqueApiAccounts(accounts);
      setApiAccounts({ ...result, sourceName: file.name });
      setNotice(`Attached ${result.valid.length} valid API accounts from ${file.name}`);
    } catch (err) {
      setApiAccounts({ rawCount: 0, valid: [], duplicatesRemoved: 0, sourceName: "" });
      setError(err.message || "Could not read API account file");
    } finally {
      event.target.value = "";
    }
  }

  function loadPastedApiAccounts() {
    setError("");
    setNotice("");

    try {
      const result = uniqueApiAccounts(parseApiAccountsFromText(apiAccountPaste));
      setApiAccounts({ ...result, sourceName: "Pasted accounts" });
      setNotice(`Loaded ${result.valid.length} valid API accounts from pasted text`);
    } catch (err) {
      setError(err.message || "Could not parse pasted API accounts");
    }
  }

  function clearApiAccounts() {
    setApiAccounts({ rawCount: 0, valid: [], duplicatesRemoved: 0, sourceName: "" });
    setApiAccountPaste("");
    setApiAutomationRunResult(null);
  }

  async function loadTemplates() {
    const data = await apiRequest("/api/templates");
    const nextTemplates = data.templates || [];
    setTemplates(nextTemplates);
    setSelectedTemplateIds((current) =>
      current.filter((id) => nextTemplates.some((template) => template._id === id))
    );
    if (!nextTemplates.some((template) => template._id === jobTemplateId)) {
      setJobTemplateId(nextTemplates[0]?._id || "");
    }
    setGeneratorForm((current) =>
      nextTemplates.some((template) => template._id === current.templateId)
        ? current
        : { ...current, templateId: nextTemplates[0]?._id || "" }
    );
  }

  async function loadJobs() {
    const data = await apiRequest("/api/jobs");
    const nextJobs = data.jobs || [];
    setJobs(nextJobs);
    setSelectedJobIds((current) =>
      current.filter((id) => nextJobs.some((job) => job._id === id))
    );
    if (!selectedJobId && nextJobs[0]?._id) {
      setSelectedJobId(nextJobs[0]._id);
    }
  }

  async function loadApiAutomationJobs() {
    const data = await apiRequest("/api/api-automation/jobs");
    const nextJobs = data.jobs || [];
    setApiAutomationJobs(nextJobs);
    setSelectedApiAutomationJobIds((current) =>
      current.filter((id) => nextJobs.some((job) => job._id === id))
    );
    if (!selectedApiAutomationJobId && nextJobs[0]?._id) {
      setSelectedApiAutomationJobId(nextJobs[0]._id);
    }
  }

  async function loadRegisteredAccounts(filters = registeredAccountFilters) {
    const params = new URLSearchParams({ limit: "100" });
    Object.entries(filters).forEach(([key, value]) => {
      if (String(value || "").trim()) params.set(key, String(value).trim());
    });

    const data = await apiRequest(`/api/registered-accounts?${params.toString()}`);
    const nextAccounts = data.accounts || [];
    setRegisteredAccounts(nextAccounts);
    setRegisteredAccountsTotal(data.total || 0);
    setRegisteredAccountsCredentials(data.credentials || null);
    setSelectedRegisteredAccountIds((current) =>
      current.filter((id) => nextAccounts.some((account) => account._id === id))
    );
  }

  async function loadMailuStorage(options = {}) {
    const activeBatchId =
      options.batchId !== undefined ? options.batchId : mailuBatchId;
    const createdParams = new URLSearchParams({ limit: "10000" });
    if (mailuSearch.trim()) createdParams.set("search", mailuSearch.trim());
    if (activeBatchId) createdParams.set("batchId", activeBatchId);

    const [batchesData, createdData] = await Promise.all([
      apiRequest("/api/mailu-users/batches?limit=50"),
      apiRequest(`/api/mailu-users/created?${createdParams.toString()}`),
    ]);

    setMailuBatches(batchesData.batches || []);
    const nextCreatedUsers = createdData.createdUsers || [];
    setMailuCreatedUsers(nextCreatedUsers);
    setMailuCreatedTotal(createdData.total || 0);
    setSelectedMailuCreatedIds((current) =>
      current.filter((id) => nextCreatedUsers.some((user) => user._id === id))
    );
  }

  async function loadMailuBatchDetails(batchId) {
    if (!batchId) {
      setMailuBatchId("");
      await loadMailuStorage({ batchId: "" });
      return;
    }

    setBusy(true);
    setError("");
    try {
      const data = await apiRequest(`/api/mailu-users/batches/${batchId}?limit=500`);
      setMailuBatchId(batchId);
      setMailuRows(data.users || []);
      setMailuStatus({
        state: "success",
        message: `Loaded ${data.users?.length || 0} generated users from MongoDB.`,
        summary: data.batch?.latestMailuSummary || null,
        results: data.mailuResults || [],
      });
      await loadMailuStorage({ batchId });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadJobDetails(jobId = selectedJobId) {
    if (!jobId) return;
    const [jobData, logData] = await Promise.all([
      apiRequest(`/api/jobs/${jobId}`),
      apiRequest(`/api/jobs/${jobId}/logs`),
    ]);
    setSelectedJob(jobData.job);
    setLogs(logData.attempts || []);
  }

  async function loadApiAutomationJobDetails(jobId = selectedApiAutomationJobId) {
    if (!jobId) return;
    const [jobData, logData] = await Promise.all([
      apiRequest(`/api/api-automation/jobs/${jobId}`),
      apiRequest(`/api/api-automation/jobs/${jobId}/logs`),
    ]);
    setSelectedApiAutomationJob(jobData.job);
    setApiAutomationLogs(logData.attempts || []);
  }

  async function refreshAll() {
    setError("");
    await Promise.all([
      loadTemplates(),
      loadJobs(),
      loadApiAutomationJobs(),
      loadRegisteredAccounts(),
      loadMailuStorage(),
    ]);
    if (selectedJobId) {
      await loadJobDetails(selectedJobId);
    }
    if (selectedApiAutomationJobId) {
      await loadApiAutomationJobDetails(selectedApiAutomationJobId);
    }
  }

  async function loadApiAutomationCapabilities() {
    const data = await apiRequest("/api/api-automation/capabilities");
    setApiAutomationCapabilities(data);
    setApiAutomationForm((current) => ({
      ...current,
      useZyteProxy: current.useZyteProxy || Boolean(data.zyte?.enabledByDefault),
    }));
  }

  useEffect(() => {
    refreshAll().catch((err) => setError(err.message));
    loadApiAutomationCapabilities().catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedJobId) {
      loadJobDetails(selectedJobId).catch((err) => setError(err.message));
    } else {
      setSelectedJob(null);
      setLogs([]);
    }
  }, [selectedJobId]);

  useEffect(() => {
    if (selectedApiAutomationJobId) {
      loadApiAutomationJobDetails(selectedApiAutomationJobId).catch((err) =>
        setError(err.message)
      );
    } else {
      setSelectedApiAutomationJob(null);
      setApiAutomationLogs([]);
    }
  }, [selectedApiAutomationJobId]);

  useEffect(() => {
    if (!selectedJobId) return undefined;

    const intervalId = window.setInterval(() => {
      loadJobDetails(selectedJobId).catch(() => {});
      loadJobs().catch(() => {});
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [selectedJobId]);

  useEffect(() => {
    if (!selectedApiAutomationJobId) return undefined;

    const intervalId = window.setInterval(() => {
      loadApiAutomationJobDetails(selectedApiAutomationJobId).catch(() => {});
      loadApiAutomationJobs().catch(() => {});
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [selectedApiAutomationJobId]);

  useEffect(() => {
    if (!uploadedEmailValues.length) return;
    setUploadedEmails(uniqueUploadedEmailAccounts(uploadedEmailValues));
  }, [uploadedEmailValues]);

  useEffect(() => {
    if (!selectedJobId || selectedJob?.settings?.livePreview === false) {
      setLivePreviewUrl((currentUrl) => {
        if (currentUrl) window.URL.revokeObjectURL(currentUrl);
        return "";
      });
      setLivePreviewError("");
      return undefined;
    }

    let cancelled = false;
    let currentObjectUrl = "";

    async function loadLivePreview() {
      try {
        const response = await fetch(
          `${API_BASE}/api/jobs/${selectedJobId}/live-screenshot?ts=${Date.now()}`
        );
        if (!response.ok) {
          throw new Error("Waiting for live preview");
        }

        const contentType = response.headers.get("Content-Type") || "";
        if (!contentType.toLowerCase().startsWith("image/")) {
          const message = await response.text();
          throw new Error(message || "Live preview is not available");
        }

        const blob = await response.blob();
        if (cancelled) return;
        const nextUrl = window.URL.createObjectURL(blob);
        setLivePreviewUrl((previousUrl) => {
          if (previousUrl) window.URL.revokeObjectURL(previousUrl);
          return nextUrl;
        });
        currentObjectUrl = nextUrl;
        setLivePreviewError("");
      } catch (err) {
        if (!cancelled) {
          setLivePreviewUrl((previousUrl) => {
            if (previousUrl) window.URL.revokeObjectURL(previousUrl);
            return "";
          });
          currentObjectUrl = "";
          setLivePreviewError(err.message);
        }
      }
    }

    loadLivePreview();
    const intervalId = window.setInterval(loadLivePreview, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      if (currentObjectUrl) window.URL.revokeObjectURL(currentObjectUrl);
    };
  }, [selectedJobId, selectedJob?.settings?.livePreview]);

  async function createTemplate(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const hasSuccessUrl =
        templateForm.successMode === "url" && templateForm.successUrlContains.trim();
      const hasSuccessText =
        templateForm.successMode === "message" &&
        templateForm.successTextSelector.trim() &&
        templateForm.successTextContains.trim();

      if (!hasSuccessUrl && !hasSuccessText) {
        throw new Error(
          "Choose a success check and fill its required value"
        );
      }

      const payload = {
        name: templateForm.name.trim(),
        url: templateForm.url.trim(),
        fields: defaultTemplateFields(),
        submitButton: buildLocator("button[type='submit']", ""),
        success: {
          urlContains:
            templateForm.successMode === "url"
              ? templateForm.successUrlContains.trim() || undefined
              : undefined,
          textSelector:
            templateForm.successMode === "message"
              ? templateForm.successTextSelector.trim() || undefined
              : undefined,
          textContains:
            templateForm.successMode === "message"
              ? templateForm.successTextContains.trim() || undefined
              : undefined,
        },
      };

      const data = await apiRequest("/api/templates", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setNotice("Template confirmed and saved");
      await loadTemplates();
      setJobTemplateId(data.template._id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createJob(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const email = cleanEmailAddress(accountForm.contact);
      if (!email) {
        throw new Error("Enter a valid email address");
      }

      const records = [
        {
          firstName: accountForm.firstName,
          surname: accountForm.surname,
          birthDay: accountForm.birthDay,
          birthMonth: accountForm.birthMonth,
          birthYear: accountForm.birthYear,
          gender: accountForm.gender,
          email,
          contact: email,
          password: accountForm.password,
        },
      ];
      const data = await apiRequest("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          templateId: jobTemplateId,
          settings: settingsPayload(settings),
          records,
        }),
      });
      setNotice("Job added to queue. Select it below and press Start.");
      await loadJobs();
      setSelectedJobId(data.job._id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createGeneratedJob(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      if (!generatorForm.templateId) {
        throw new Error("Choose a template for generated records");
      }
      if (dataGeneratorRecords.length === 0) {
        throw new Error(
          generatorForm.emailSource === "mailu"
            ? "No valid Mailu-created users are available from MongoDB"
            : "Upload valid email addresses before confirming"
        );
      }
      if (generatorForm.emailSource === "mailu") {
        validateMailuGeneratorPasswords(dataGeneratorRecords);
      }

      const data = await apiRequest("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          templateId: generatorForm.templateId,
          settings: settingsPayload(settings),
          records: dataGeneratorRecords,
        }),
      });

      setNotice(`Generated job added with ${dataGeneratorRecords.length} records`);
      await loadJobs();
      setSelectedJobId(data.job._id);
      setActiveTab("manual");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function planApiAutomation(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const planAccount = apiAccountsForQueue[0] || {};
      const data = await apiRequest("/api/api-automation/plan", {
        method: "POST",
        body: JSON.stringify({
          loginUrl: apiAutomationForm.loginUrl,
          targetUrl: apiAutomationForm.targetUrl,
          username: apiAccountIdentifier(planAccount) || apiAutomationForm.username,
          password: planAccount.password || apiAutomationForm.password,
          useZyteProxy: apiAutomationForm.useZyteProxy,
          requestedActions: apiAutomationForm.requestedActions,
        }),
      });

      setApiAutomationPlan(data.plan);
      setApiAutomationRunResult(null);
      if (data.plan.status === "restricted") {
        setNotice("Workflow checked. Social engagement automation is blocked.");
      } else if (data.plan.status === "requires_official_api") {
        setNotice("Workflow checked. Connect an official API before running actions.");
      } else {
        setNotice("Workflow checked and ready for an approved connector.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function runApiAutomation() {
    await createApiAutomationQueuedJob(true);
  }

  async function createApiAutomationQueuedJob(startNow = false) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      if (!apiAutomationForm.loginUrl || !apiAutomationForm.targetUrl) {
        throw new Error("Login URL and target page URL are required");
      }
      if (apiAccountsForQueue.length === 0) {
        throw new Error("Attach accounts or fill username and password first");
      }

      const data = await apiRequest("/api/api-automation/jobs", {
        method: "POST",
        body: JSON.stringify({
          loginUrl: apiAutomationForm.loginUrl,
          targetUrl: apiAutomationForm.targetUrl,
          settings: {
            minDelayMs: Number(apiAutomationForm.minDelayMs),
            maxDelayMs: Number(apiAutomationForm.maxDelayMs),
            concurrency: Number(apiAutomationForm.concurrency),
            registrationCase: selectedApiAutomationCases[0] || "MAJIC ONE",
            useZyteProxy: Boolean(apiAutomationForm.useZyteProxy),
            requestedActions: apiAutomationForm.requestedActions,
          },
          accounts: apiAccountsForQueue,
        }),
      });

      await loadApiAutomationJobs();
      setSelectedApiAutomationJobId(data.job._id);

      if (startNow) {
        await apiRequest(`/api/api-automation/jobs/${data.job._id}/start`, {
          method: "POST",
        });
        setNotice(`API automation job started with ${apiAccountsForQueue.length} accounts`);
      } else {
        setNotice(`API automation job queued with ${apiAccountsForQueue.length} accounts`);
      }

      await Promise.all([
        loadApiAutomationJobs(),
        loadApiAutomationJobDetails(data.job._id),
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createApiAutomationJobFromRegistered(startNow = false) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      if (!apiAutomationForm.loginUrl || !apiAutomationForm.targetUrl) {
        throw new Error("Login URL and target page URL are required");
      }
      if (selectedRegisteredAccountIds.length === 0) {
        throw new Error("Select saved Mongo accounts first");
      }
      if (registeredAccountsCredentials?.ready === false) {
        throw new Error("ACCOUNT_ENCRYPTION_KEY is required before saved accounts can be used");
      }

      const data = await apiRequest("/api/api-automation/jobs/from-registered-accounts", {
        method: "POST",
        body: JSON.stringify({
          loginUrl: apiAutomationForm.loginUrl,
          targetUrl: apiAutomationForm.targetUrl,
          settings: {
            minDelayMs: Number(apiAutomationForm.minDelayMs),
            maxDelayMs: Number(apiAutomationForm.maxDelayMs),
            concurrency: Number(apiAutomationForm.concurrency),
            registrationCase: selectedApiAutomationCases[0] || "MAJIC ONE",
            useZyteProxy: Boolean(apiAutomationForm.useZyteProxy),
            requestedActions: apiAutomationForm.requestedActions,
          },
          accountIds: selectedRegisteredAccountIds,
        }),
      });

      await loadApiAutomationJobs();
      setSelectedApiAutomationJobId(data.job._id);

      if (startNow) {
        await apiRequest(`/api/api-automation/jobs/${data.job._id}/start`, {
          method: "POST",
        });
        setNotice(
          `API automation job started from ${selectedRegisteredAccountIds.length} saved accounts`
        );
      } else {
        setNotice(
          `API automation job queued from ${selectedRegisteredAccountIds.length} saved accounts`
        );
      }

      await Promise.all([
        loadApiAutomationJobs(),
        loadApiAutomationJobDetails(data.job._id),
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedRegisteredAccounts() {
    if (selectedRegisteredAccountIds.length === 0) return;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const data = await apiRequest("/api/registered-accounts/selected", {
        method: "DELETE",
        body: JSON.stringify({ accountIds: selectedRegisteredAccountIds }),
      });
      setNotice(`Deleted ${data.deleted} saved Mongo accounts`);
      setSelectedRegisteredAccountIds([]);
      await loadRegisteredAccounts();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleApiAutomationJobSelection(jobId) {
    setSelectedApiAutomationJobIds((current) =>
      current.includes(jobId)
        ? current.filter((id) => id !== jobId)
        : [...current, jobId]
    );
  }

  async function deleteSelectedApiAutomationJobs() {
    if (selectedApiAutomationJobIds.length === 0) return;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const data = await apiRequest("/api/api-automation/jobs/selected", {
        method: "DELETE",
        body: JSON.stringify({ jobIds: selectedApiAutomationJobIds }),
      });
      setNotice(`Deleted ${data.deleted.jobs} API jobs and ${data.deleted.attempts} attempts`);
      if (selectedApiAutomationJobIds.includes(selectedApiAutomationJobId)) {
        setSelectedApiAutomationJobId("");
        setSelectedApiAutomationJob(null);
        setApiAutomationLogs([]);
      }
      setSelectedApiAutomationJobIds([]);
      await loadApiAutomationJobs();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function apiAutomationJobAction(action) {
    if (!selectedApiAutomationJobId) return;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await apiRequest(`/api/api-automation/jobs/${selectedApiAutomationJobId}/${action}`, {
        method: "POST",
      });
      setNotice(`API automation ${action} request sent`);
      await Promise.all([
        loadApiAutomationJobs(),
        loadApiAutomationJobDetails(selectedApiAutomationJobId),
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleTemplateSelection(templateId) {
    setSelectedTemplateIds((current) =>
      current.includes(templateId)
        ? current.filter((id) => id !== templateId)
        : [...current, templateId]
    );
  }

  function toggleJobSelection(jobId) {
    setSelectedJobIds((current) =>
      current.includes(jobId)
        ? current.filter((id) => id !== jobId)
        : [...current, jobId]
    );
  }

  async function deleteSelectedTemplates() {
    if (selectedTemplateIds.length === 0) return;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const data = await apiRequest("/api/templates/selected", {
        method: "DELETE",
        body: JSON.stringify({ templateIds: selectedTemplateIds }),
      });
      setNotice(
        `Deleted ${data.deleted.templates} templates, ${data.deleted.jobs} jobs, ${data.deleted.attempts} attempts`
      );
      setSelectedTemplateIds([]);
      setSelectedJobId("");
      setSelectedJob(null);
      setLogs([]);
      await Promise.all([loadTemplates(), loadJobs()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedJobs() {
    if (selectedJobIds.length === 0) return;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const data = await apiRequest("/api/jobs/selected", {
        method: "DELETE",
        body: JSON.stringify({ jobIds: selectedJobIds }),
      });
      setNotice(`Deleted ${data.deleted.jobs} jobs and ${data.deleted.attempts} attempts`);
      if (selectedJobIds.includes(selectedJobId)) {
        setSelectedJobId("");
        setSelectedJob(null);
        setLogs([]);
      }
      setSelectedJobIds([]);
      await loadJobs();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function jobAction(action) {
    if (!selectedJobId) return;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await apiRequest(`/api/jobs/${selectedJobId}/${action}`, { method: "POST" });
      setNotice(`Job ${action} request sent`);
      await Promise.all([loadJobs(), loadJobDetails(selectedJobId)]);
      if (action === "start" || action === "resume") {
        window.setTimeout(() => {
          loadJobs().catch(() => {});
          loadJobDetails(selectedJobId).catch(() => {});
        }, 2500);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Majic Automation</p>
          <h1>Majic Control Dashboard</h1>
        </div>
        <button className="icon-button" onClick={refreshAll} disabled={busy} title="Refresh">
          <RefreshCw size={18} />
        </button>
      </header>

      {(notice || error) && (
        <section className={`notice ${error ? "notice-error" : ""}`}>
          {error || notice}
        </section>
      )}

      <div className="tab-bar">
        <button
          className={activeTab === "manual" ? "tab-button tab-button-active" : "tab-button"}
          type="button"
          onClick={() => setActiveTab("manual")}
        >
          Manual Queue
        </button>
        <button
          className={activeTab === "generator" ? "tab-button tab-button-active" : "tab-button"}
          type="button"
          onClick={() => setActiveTab("generator")}
        >
          Data Generator
        </button>
        <button
          className={activeTab === "mailu" ? "tab-button tab-button-active" : "tab-button"}
          type="button"
          onClick={() => setActiveTab("mailu")}
        >
          Mailu Users
        </button>
        <button
          className={activeTab === "api" ? "tab-button tab-button-active" : "tab-button"}
          type="button"
          onClick={() => setActiveTab("api")}
        >
          Majic log in
        </button>
      </div>

      {activeTab === "manual" ? (
      <section className="grid two-columns">
        <form className="panel" onSubmit={createTemplate}>
          <div className="panel-title">
            <Globe size={18} />
            <h2>Site Template</h2>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Template name</span>
              <input
                value={templateForm.name}
                onChange={(event) => updateTemplateForm("name", event.target.value)}
                placeholder="Registration page"
                required
              />
            </label>
            <label className="field">
              <span>Website registration URL</span>
              <input
                type="url"
                value={templateForm.url}
                onChange={(event) => updateTemplateForm("url", event.target.value)}
                placeholder="https://example.com/register"
                required
              />
            </label>
          </div>

          <div className="auto-map-box">
            The form fields are mapped automatically from the account form below.
          </div>

          <div className="form-grid success-grid">
            <label className="field">
              <span>Success check</span>
              <select
                value={templateForm.successMode}
                onChange={(event) => updateTemplateForm("successMode", event.target.value)}
              >
                <option value="message">Message appears</option>
                <option value="url">URL contains</option>
              </select>
            </label>
            {templateForm.successMode === "url" ? (
              <label className="field">
                <span>Success URL contains</span>
                <select
                  value={templateForm.successUrlContains}
                  onChange={(event) =>
                    updateTemplateForm("successUrlContains", event.target.value)
                  }
                  required
                >
                  <option value="">Choose URL pattern</option>
                  <option value="/success">/success</option>
                  <option value="/welcome">/welcome</option>
                  <option value="/home">/home</option>
                  <option value="/dashboard">/dashboard</option>
                  <option value="/complete">/complete</option>
                </select>
              </label>
            ) : (
              <>
                <label className="field">
                  <span>Message area</span>
                  <select
                    value={templateForm.successTextSelector}
                    onChange={(event) =>
                      updateTemplateForm("successTextSelector", event.target.value)
                    }
                    required
                  >
                    <option value="body">Any page text</option>
                    <option value=".success-message">.success-message</option>
                    <option value=".alert-success">.alert-success</option>
                    <option value="[role='alert']">[role='alert']</option>
                    <option value="#message">#message</option>
                  </select>
                </label>
                <label className="field">
                  <span>Success message / verification step</span>
                  <select
                    value={templateForm.successTextContains}
                    onChange={(event) =>
                      updateTemplateForm("successTextContains", event.target.value)
                    }
                    required
                  >
                    {successMessageOptions.map((message) => (
                      <option key={message} value={message}>
                        {message}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>

          <div className="confirm-bar">
            <button className="primary-button confirm-button" disabled={busy}>
              <CheckCircle2 size={17} />
              Confirm Template
            </button>
          </div>

          <div className="template-list">
            <div className="panel-title compact split">
              <div>
                <FileJson size={16} />
                <h3>Saved Templates</h3>
              </div>
              <button
                className="danger"
                type="button"
                onClick={deleteSelectedTemplates}
                disabled={busy || selectedTemplateIds.length === 0}
              >
                <Trash2 size={16} />
                Delete Selected
              </button>
            </div>
            {templates.length ? (
              templates.map((template) => (
                <div
                  className={`template-list-item ${
                    template._id === jobTemplateId ? "template-list-item-active" : ""
                  }`}
                  key={template._id}
                >
                  <input
                    checked={selectedTemplateIds.includes(template._id)}
                    onChange={() => toggleTemplateSelection(template._id)}
                    type="checkbox"
                  />
                  <span>
                    <strong>{template.name}</strong>
                    <small>{template.url}</small>
                  </span>
                  <button type="button" onClick={() => setJobTemplateId(template._id)}>
                    Use for Queue
                  </button>
                </div>
              ))
            ) : (
              <p className="empty-inline">No templates yet.</p>
            )}
          </div>
        </form>

        <form className="panel" onSubmit={createJob}>
          <div className="panel-title">
            <ClipboardList size={18} />
            <h2>Add to Queue</h2>
          </div>

          <label className="field">
              <span>Template</span>
            <select
              value={jobTemplateId}
              onChange={(event) => setJobTemplateId(event.target.value)}
              required
            >
              <option value="">Choose template</option>
              {templates.map((template) => (
                <option key={template._id} value={template._id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          {selectedTemplate && (
            <div className="template-preview">
              <strong>{selectedTemplate.name}</strong>
              <span>{selectedTemplate.url}</span>
            </div>
          )}

          <div className="settings-grid">
            <label className="field">
              <span>Registration case</span>
              <select
                value={settings.registrationCase}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, registrationCase: event.target.value }))
                }
              >
                {registrationCaseOptions.map((registrationCase) => (
                  <option key={registrationCase} value={registrationCase}>
                    {registrationCase}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Min delay ms</span>
              <input
                type="number"
                min="0"
                value={settings.minDelayMs}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, minDelayMs: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Max delay ms</span>
              <input
                type="number"
                min="0"
                value={settings.maxDelayMs}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, maxDelayMs: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Concurrency</span>
              <input
                type="number"
                min="1"
                max="10"
                value={settings.concurrency}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, concurrency: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Slow motion ms</span>
              <input
                type="number"
                min="0"
                max="5000"
                value={settings.slowMoMs}
                disabled
                onChange={(event) =>
                  setSettings((current) => ({ ...current, slowMoMs: event.target.value }))
                }
              />
            </label>
            <div className="auto-map-box">Headless screenshot preview mode is active.</div>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={settings.livePreview}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, livePreview: event.target.checked }))
                }
              />
              <span>Live preview inside dashboard</span>
            </label>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={settings.keepBrowserOpenOnError}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    keepBrowserOpenOnError: event.target.checked,
                  }))
                }
              />
              <span>Keep browser open on error</span>
            </label>
          </div>

          <div className="signup-card">
            <label className="signup-label">Name</label>
            <div className="signup-name-row">
              <input
                value={accountForm.firstName}
                onChange={(event) => updateAccountForm("firstName", event.target.value)}
                placeholder="First name"
                required
              />
              <input
                value={accountForm.surname}
                onChange={(event) => updateAccountForm("surname", event.target.value)}
                placeholder="Surname"
                required
              />
            </div>

            <label className="signup-label">
              Date of birth <span className="help-dot">?</span>
            </label>
            <div className="signup-date-row">
              <select
                value={accountForm.birthDay}
                onChange={(event) => updateAccountForm("birthDay", event.target.value)}
                required
              >
                <option value="">Day</option>
                {days.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
              <select
                value={accountForm.birthMonth}
                onChange={(event) => updateAccountForm("birthMonth", event.target.value)}
                required
              >
                <option value="">Month</option>
                {months.map((month, index) => (
                  <option key={month} value={String(index + 1)}>
                    {month}
                  </option>
                ))}
              </select>
              <select
                value={accountForm.birthYear}
                onChange={(event) => updateAccountForm("birthYear", event.target.value)}
                required
              >
                <option value="">Year</option>
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <label className="signup-label">
              Gender <span className="help-dot">?</span>
            </label>
            <select
              className="signup-full"
              value={accountForm.gender}
              onChange={(event) => updateAccountForm("gender", event.target.value)}
              required
            >
              <option value="">Select your gender</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="custom">Custom</option>
            </select>

            <label className="signup-label">Email address</label>
            <input
              className="signup-full"
              type="email"
              value={accountForm.contact}
              onChange={(event) => updateAccountForm("contact", event.target.value)}
              placeholder="Email address"
              required
            />

            <p className="signup-note">
              You may receive notifications from us.{" "}
              <span>Learn why we ask for your contact information</span>
            </p>

            <label className="signup-label">Password</label>
            <input
              className="signup-full signup-password"
              type="password"
              value={accountForm.password}
              onChange={(event) => updateAccountForm("password", event.target.value)}
              placeholder="Password"
              required
            />
          </div>
          <button className="primary-button" disabled={busy || !jobTemplateId}>
            <Plus size={17} />
            Add to Queue
          </button>
        </form>
      </section>
      ) : null}

      {activeTab === "generator" ? (
        <form className="panel generator-panel" onSubmit={createGeneratedJob}>
          <div className="panel-title">
            <Upload size={18} />
            <h2>Data Generator</h2>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Template</span>
              <select
                value={generatorForm.templateId}
                onChange={(event) => updateGeneratorForm("templateId", event.target.value)}
                required
              >
                <option value="">Choose template</option>
                {templates.map((template) => (
                  <option key={template._id} value={template._id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Email source</span>
              <select
                value={generatorForm.emailSource}
                onChange={(event) => updateGeneratorForm("emailSource", event.target.value)}
              >
                <option value="upload">Upload emails</option>
                <option value="mailu">Mailu created users from MongoDB</option>
              </select>
            </label>
            <div className="field">
              <span>MAJIC cases for generated records</span>
              <div className="case-multi-select">
                {registrationCaseOptions.map((registrationCase) => (
                  <label key={registrationCase}>
                    <input
                      type="checkbox"
                      checked={generatorForm.registrationCases.includes(registrationCase)}
                      onChange={() => toggleGeneratorRegistrationCase(registrationCase)}
                    />
                    <span>{registrationCase}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <span>Proxy cases for generated records</span>
              <div className="case-multi-select">
                {proxyCaseOptions.map((proxyCase) => (
                  <label key={proxyCase}>
                    <input
                      type="checkbox"
                      checked={generatorForm.proxyCases.includes(proxyCase)}
                      onChange={() => toggleGeneratorProxyCase(proxyCase)}
                    />
                    <span>{proxyCase}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {selectedGeneratorTemplate && (
            <div className="template-preview">
              <strong>{selectedGeneratorTemplate.name}</strong>
              <span>{selectedGeneratorTemplate.url}</span>
              <span>Selected MAJIC cases: {selectedGeneratorCases.join(", ")}</span>
              <span>Selected proxy cases: {selectedGeneratorProxyCases.join(", ")}</span>
            </div>
          )}

          <div className="name-library-grid">
            <div className="name-library-group">
              <div className="panel-title compact split">
                <div>
                  <FileJson size={16} />
                  <h3>First names</h3>
                </div>
                <span className="name-library-count">{nameLibrary.firstNames.length}</span>
              </div>
              <textarea
                value={nameLibraryDraft.firstNames}
                onChange={(event) => updateNameLibraryDraft("firstNames", event.target.value)}
                placeholder="Omar, Sara, Yara"
              />
              <div className="api-button-row">
                <button
                  type="button"
                  onClick={() => addNamesToLibrary("firstNames")}
                  disabled={!nameLibraryDraft.firstNames.trim()}
                >
                  <Plus size={16} />
                  Add
                </button>
                <button type="button" onClick={() => resetNameLibrary("firstNames")}>
                  <RefreshCw size={16} />
                  Reset
                </button>
              </div>
            </div>

            <div className="name-library-group">
              <div className="panel-title compact split">
                <div>
                  <FileJson size={16} />
                  <h3>Surnames</h3>
                </div>
                <span className="name-library-count">{nameLibrary.surnames.length}</span>
              </div>
              <textarea
                value={nameLibraryDraft.surnames}
                onChange={(event) => updateNameLibraryDraft("surnames", event.target.value)}
                placeholder="Haddad, Mansour, Saleh"
              />
              <div className="api-button-row">
                <button
                  type="button"
                  onClick={() => addNamesToLibrary("surnames")}
                  disabled={!nameLibraryDraft.surnames.trim()}
                >
                  <Plus size={16} />
                  Add
                </button>
                <button type="button" onClick={() => resetNameLibrary("surnames")}>
                  <RefreshCw size={16} />
                  Reset
                </button>
              </div>
            </div>
          </div>

          {generatorForm.emailSource === "upload" ? (
            <div className="generator-upload">
              <label className="field">
                <span>Upload email/password TXT</span>
                <input
                  type="file"
                  accept=".txt,text/plain"
                  onChange={handleEmailFile}
                />
              </label>
              <div className="generator-stats">
                <StatBox label="Read" value={uploadedEmails.rawCount} />
                <StatBox label="Valid" value={uploadedEmails.valid.length} />
                <StatBox label="Duplicates/invalid" value={uploadedEmails.duplicatesRemoved} />
                <StatBox label="Will create" value={dataGeneratorRecords.length} />
              </div>
            </div>
          ) : (
            <div className="generator-upload">
              <div className="form-grid">
                <label className="field">
                  <span>Mailu batch filter</span>
                  <select
                    value={mailuBatchId}
                    onChange={(event) => loadMailuBatchDetails(event.target.value)}
                  >
                    <option value="">All stored created users</option>
                    {mailuBatches.map((batch) => (
                      <option key={batch.batchId} value={batch.batchId}>
                        {batch.batchId.slice(0, 8)} - {batch.count} users
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Search Mailu email</span>
                  <input
                    value={mailuSearch}
                    onChange={(event) => setMailuSearch(event.target.value)}
                    placeholder="email"
                  />
                </label>
              </div>
              <div className="api-button-row">
                <button type="button" onClick={loadMailuStorage} disabled={busy}>
                  <RefreshCw size={16} />
                  Load Mailu Created Users
                </button>
                <button
                  type="button"
                  onClick={selectAllValidMailuCreated}
                  disabled={busy || mailuGeneratorValidation.validRecords.length === 0}
                >
                  <CheckCircle2 size={16} />
                  Select All Valid
                </button>
                <button
                  type="button"
                  onClick={clearSelectedMailuCreated}
                  disabled={busy || selectedMailuCreatedIds.length === 0}
                >
                  <Trash2 size={16} />
                  Clear Selection
                </button>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>Emails to use</span>
                  <select
                    value={generatorForm.mailuUseMode}
                    onChange={(event) => updateGeneratorForm("mailuUseMode", event.target.value)}
                  >
                    <option value="selected">Selected emails only</option>
                    <option value="first">First N loaded</option>
                    <option value="random">Random N loaded</option>
                  </select>
                </label>
                <label className="field">
                  <span>Email count</span>
                  <input
                    type="number"
                    min="1"
                    max={mailuGeneratorValidation.validRecords.length || 1}
                    value={generatorForm.mailuCount}
                    onChange={(event) => updateGeneratorForm("mailuCount", event.target.value)}
                    disabled={generatorForm.mailuUseMode === "selected"}
                  />
                </label>
                <label className="field">
                  <span>MAJIC case assignment</span>
                  <select
                    value={generatorForm.caseMode}
                    onChange={(event) => updateGeneratorForm("caseMode", event.target.value)}
                  >
                    <option value="rotate">Rotate selected cases</option>
                    <option value="random">Random selected cases</option>
                  </select>
                </label>
                <label className="field">
                  <span>Proxy case assignment</span>
                  <select
                    value={generatorForm.proxyCaseMode}
                    onChange={(event) => updateGeneratorForm("proxyCaseMode", event.target.value)}
                  >
                    <option value="rotate">Rotate selected proxy cases</option>
                    <option value="random">Random selected proxy cases</option>
                  </select>
                </label>
              </div>
              <div className="generator-stats">
                <StatBox label="Created loaded" value={mailuGeneratorValidation.summary.total} />
                <StatBox label="Selected" value={selectedMailuRecordCount} />
                <StatBox label="Name matched" value={mailuGeneratorValidation.summary.matched} />
                <StatBox
                  label="Missing identity"
                  value={mailuGeneratorValidation.summary.missingIdentity}
                />
                <StatBox
                  label="Name mismatch"
                  value={mailuGeneratorValidation.summary.mismatchedNames}
                />
                <StatBox label="Invalid email" value={mailuGeneratorValidation.summary.invalidEmails} />
                <StatBox
                  label="Duplicates ignored"
                  value={mailuGeneratorValidation.summary.duplicateEmails}
                />
                <StatBox label="Will queue" value={dataGeneratorRecords.length} />
              </div>
            </div>
          )}

          {generatorForm.emailSource === "upload" ? (
          <div className="form-grid">
            <label className="field">
              <span>Generation count</span>
              <select
                value={generatorForm.countMode}
                onChange={(event) => updateGeneratorForm("countMode", event.target.value)}
              >
                <option value="all">Use all uploaded emails</option>
                <option value="manual">Manual count</option>
              </select>
            </label>
            <label className="field">
              <span>Manual count</span>
              <input
                type="number"
                min="1"
                value={generatorForm.manualCount}
                onChange={(event) => updateGeneratorForm("manualCount", event.target.value)}
                disabled={generatorForm.countMode !== "manual"}
              />
            </label>
          </div>
          ) : null}

          {generatorForm.emailSource === "upload" && generatorCountWarning ? (
            <div className="auto-map-box">{generatorCountWarning}</div>
          ) : null}

          {generatorForm.emailSource === "mailu" ? (
            <div className="table-wrap generator-preview">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Email</th>
                    <th>Name</th>
                    <th>DOB</th>
                    <th>Password</th>
                    <th>Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {mailuGeneratorValidation.records.slice(0, 100).map((record) => {
                    const isValid =
                      record.validation.validEmail &&
                      record.validation.hasRequiredIdentity &&
                      record.validation.nameMatchesEmail &&
                      Boolean(record.password);
                    return (
                      <tr key={record.mailuCreatedUserId || record.email}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedMailuCreatedIds.includes(
                              record.mailuCreatedUserId
                            )}
                            disabled={!isValid}
                            onChange={() =>
                              toggleMailuCreatedSelection(record.mailuCreatedUserId)
                            }
                          />
                        </td>
                        <td>
                          <code>{record.email}</code>
                        </td>
                        <td>
                          {record.firstName} {record.surname}
                        </td>
                        <td>
                          {record.birthDay}/{record.birthMonth}/{record.birthYear}
                        </td>
                        <td>
                          <code>{record.password}</code>
                        </td>
                        <td>
                          <StatusPill
                            status={
                              isValid
                                ? record.validation.hasLinkedIdentity
                                  ? "matched"
                                  : "fallback"
                                : "failed"
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {mailuGeneratorValidation.records.length === 0 ? (
                    <tr>
                      <td colSpan="6">Load Mailu-created users from MongoDB to select records.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="table-wrap generator-preview">
            <table>
              <thead>
                <tr>
                  <th>First name</th>
                  <th>Surname</th>
                  <th>Birth date</th>
                  <th>Gender</th>
                  <th>Email</th>
                  <th>MAJIC case</th>
                  <th>Proxy case</th>
                  <th>Password</th>
                  {generatorForm.emailSource === "mailu" ? <th>Validation</th> : null}
                </tr>
              </thead>
              <tbody>
                {dataGeneratorRecords.slice(0, 25).map((record, index) => (
                  <tr key={`${record.contact}-${index}`}>
                    <td>{record.firstName}</td>
                    <td>{record.surname}</td>
                    <td>
                      {record.birthDay} {months[Number(record.birthMonth) - 1]} {record.birthYear}
                    </td>
                    <td>{record.gender}</td>
                    <td>
                      <code>{record.contact}</code>
                    </td>
                    <td>{record.registrationCase}</td>
                    <td>{record.proxyCase}</td>
                    <td>
                      <code>{record.password}</code>
                    </td>
                    {generatorForm.emailSource === "mailu" ? (
                      <td>
                        <StatusPill
                          status={
                            record.validation?.hasLinkedIdentity ? "matched" : "fallback"
                          }
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
                {dataGeneratorRecords.length === 0 ? (
                  <tr>
                    <td colSpan={generatorForm.emailSource === "mailu" ? 9 : 8}>
                      {generatorForm.emailSource === "mailu"
                        ? "Load Mailu-created users from MongoDB to preview validated records."
                        : "Upload emails to preview generated records."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <button
            className="primary-button"
            disabled={busy || !generatorForm.templateId || dataGeneratorRecords.length === 0}
          >
            <CheckCircle2 size={17} />
            Confirm Data Generator Job
          </button>
        </form>
      ) : null}

      {activeTab === "mailu" ? (
        <section className="grid two-columns mailu-grid">
          <section className="panel mailu-panel">
            <div className="panel-title split">
              <div>
                <Database size={18} />
                <h2>Mailu Generator + MongoDB</h2>
              </div>
              <span className="muted">{mailuRows.length.toLocaleString()} rows</span>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>Rows</span>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={mailuForm.count}
                  onChange={(event) => updateMailuForm("count", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Email domain</span>
                <input
                  value={mailuForm.domain}
                  onChange={(event) => updateMailuForm("domain", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Saved batch</span>
                <select
                  value={mailuBatchId}
                  onChange={(event) => loadMailuBatchDetails(event.target.value)}
                >
                  <option value="">Current unsaved batch</option>
                  {mailuBatches.map((batch) => (
                    <option key={batch.batchId} value={batch.batchId}>
                      {batch.batchId.slice(0, 8)} - {batch.count} users
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="api-button-row">
              <button type="button" onClick={generateMailuBatch} disabled={busy}>
                <RefreshCw size={16} />
                Generate
              </button>
              <button type="button" onClick={saveMailuBatch} disabled={busy || mailuRows.length === 0}>
                <Database size={16} />
                Save to MongoDB
              </button>
              <button type="button" onClick={loadMailuStorage} disabled={busy}>
                <RefreshCw size={16} />
                Refresh Storage
              </button>
            </div>

            <div className="generator-stats">
              <StatBox label="Generated" value={mailuRows.length} />
              <StatBox label="Saved batches" value={mailuBatches.length} />
              <StatBox label="Created records" value={mailuCreatedTotal} />
              <StatBox label="Active batch" value={mailuBatchId ? mailuBatchId.slice(0, 8) : "New"} />
            </div>

            <div className="table-wrap generator-preview">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>DOB</th>
                    <th>Gender</th>
                    <th>Email</th>
                    <th>Password</th>
                  </tr>
                </thead>
                <tbody>
                  {mailuPreviewRows.map((row) => (
                    <tr key={row.email}>
                      <td>{row.name}</td>
                      <td>
                        {row.day}/{row.month}/{row.year}
                      </td>
                      <td>{row.gender}</td>
                      <td>
                        <code>{row.email}</code>
                      </td>
                      <td>
                        <code>{row.password}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel mailu-panel">
            <div className="panel-title">
              <ShieldCheck size={18} />
              <h2>Create Mailu Users</h2>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>Mailu URL</span>
                <input
                  type="url"
                  placeholder="https://mail.aitechia.com"
                  value={mailuForm.baseUrl}
                  onChange={(event) => updateMailuForm("baseUrl", event.target.value)}
                />
              </label>
              <label className="field">
                <span>API path</span>
                <input
                  value={mailuForm.apiPath}
                  onChange={(event) => updateMailuForm("apiPath", event.target.value)}
                />
              </label>
              <label className="field">
                <span>API token</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={mailuForm.apiToken}
                  onChange={(event) => updateMailuForm("apiToken", event.target.value)}
                />
              </label>
              <label className="field checkbox-field">
                <span>Dry run</span>
                <input
                  type="checkbox"
                  checked={mailuForm.dryRun}
                  onChange={(event) => updateMailuForm("dryRun", event.target.checked)}
                />
              </label>
            </div>

            <div className="api-button-row">
              <button type="button" onClick={testMailuConnection} disabled={busy}>
                <ShieldCheck size={16} />
                Test Connection
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={createMailuUsers}
                disabled={busy || mailuRows.length === 0}
              >
                <Plus size={16} />
                Create Generated Users
              </button>
              <button type="button" onClick={findMailuDuplicates} disabled={busy}>
                <ShieldCheck size={16} />
                Find Duplicates
              </button>
              <button type="button" onClick={cleanupMailuDuplicates} disabled={busy}>
                <Trash2 size={16} />
                Cleanup Duplicates
              </button>
              <button
                type="button"
                onClick={cleanupExistingGeneratedMailuUsers}
                disabled={busy || mailuRows.length === 0}
              >
                <Trash2 size={16} />
                Cleanup Generated Existing
              </button>
            </div>

            <div className={`mailu-status mailu-status-${mailuStatus.state}`}>
              <strong>Status</strong>
              <span>{mailuStatus.message}</span>
            </div>

            {mailuStatus.summary ? (
              <div className="generator-stats">
                {Object.entries(mailuStatus.summary).map(([key, value]) => (
                  <StatBox key={key} label={key} value={value} />
                ))}
              </div>
            ) : null}

            {mailuResultRows.length > 0 ? (
              <div className="table-wrap api-account-preview">
                <table>
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mailuResultRows.map((result) => (
                      <tr key={`${result.email}-${result.status}`}>
                        <td>
                          <code>{result.email}</code>
                        </td>
                        <td>
                          <StatusPill status={result.status} />
                        </td>
                        <td>{result.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="panel full-span">
            <div className="panel-title split">
              <div>
                <Database size={18} />
                <h2>Stored Mailu Created Users</h2>
              </div>
              <label className="inline-search">
                <span>Search</span>
                <input
                  value={mailuSearch}
                  onChange={(event) => setMailuSearch(event.target.value)}
                  placeholder="email"
                />
              </label>
            </div>

            <div className="api-button-row">
              <button type="button" onClick={loadMailuStorage} disabled={busy}>
                <RefreshCw size={16} />
                Apply Search
              </button>
            </div>

            {mailuCreatedUsers.length > 0 ? (
              <div className="table-wrap saved-accounts-table">
                <table>
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Password</th>
                      <th>Status</th>
                      <th>Batch</th>
                      <th>Created</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mailuCreatedUsers.map((user) => (
                      <tr key={user._id}>
                        <td>
                          <code>{user.email}</code>
                        </td>
                        <td>
                          <code>{user.password}</code>
                        </td>
                        <td>
                          <StatusPill status={user.status} />
                        </td>
                        <td>{user.batchId?.slice(0, 8) || "-"}</td>
                        <td>{formatDate(user.createdAt)}</td>
                        <td>{user.message || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-state">No Mailu-created users are stored yet.</p>
            )}
          </section>
        </section>
      ) : null}

      {activeTab === "api" ? (
        <>
        <section className="grid two-columns api-automation-grid">
          <form className="panel api-automation-panel" onSubmit={planApiAutomation}>
            <div className="panel-title">
              <KeyRound size={18} />
              <h2>Majic log in</h2>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>Login URL</span>
                <input
                  type="url"
                  value={apiAutomationForm.loginUrl}
                  onChange={(event) => updateApiAutomationForm("loginUrl", event.target.value)}
                  placeholder="https://example.com/login"
                  required
                />
              </label>
              <label className="field">
                <span>Target page URL</span>
                <input
                  type="url"
                  value={apiAutomationForm.targetUrl}
                  onChange={(event) => updateApiAutomationForm("targetUrl", event.target.value)}
                  placeholder="https://example.com/page"
                  required
                />
              </label>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>Username / email / mobile</span>
                <input
                  value={apiAutomationForm.username}
                  onChange={(event) => updateApiAutomationForm("username", event.target.value)}
                  placeholder="Email address or mobile number"
                  autoComplete="username"
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={apiAutomationForm.password}
                  onChange={(event) => updateApiAutomationForm("password", event.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                />
              </label>
            </div>

            <div className="api-action-grid">
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={apiAutomationForm.requestedActions.followPage}
                  onChange={(event) =>
                    updateApiAutomationAction("followPage", event.target.checked)
                  }
                />
                <span>Follow page</span>
              </label>
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={apiAutomationForm.requestedActions.likePosts}
                  onChange={(event) =>
                    updateApiAutomationAction("likePosts", event.target.checked)
                  }
                />
                <span>Like posts</span>
              </label>
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={apiAutomationForm.requestedActions.sharePosts}
                  onChange={(event) =>
                    updateApiAutomationAction("sharePosts", event.target.checked)
                  }
                />
                <span>Share posts</span>
              </label>
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={apiAutomationForm.useZyteProxy}
                  onChange={(event) =>
                    updateApiAutomationForm("useZyteProxy", event.target.checked)
                  }
                />
                <span>Zyte proxy</span>
              </label>
            </div>

            <div className="settings-grid">
              <label className="field">
                <span>Min delay ms</span>
                <input
                  type="number"
                  min="0"
                  value={apiAutomationForm.minDelayMs}
                  onChange={(event) =>
                    updateApiAutomationForm("minDelayMs", event.target.value)
                  }
                />
              </label>
              <label className="field">
                <span>Max delay ms</span>
                <input
                  type="number"
                  min="0"
                  value={apiAutomationForm.maxDelayMs}
                  onChange={(event) =>
                    updateApiAutomationForm("maxDelayMs", event.target.value)
                  }
                />
              </label>
              <label className="field">
                <span>Concurrency</span>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={apiAutomationForm.concurrency}
                  onChange={(event) =>
                    updateApiAutomationForm("concurrency", event.target.value)
                  }
                />
              </label>
            </div>

            <div className="field">
              <span>MAJIC cases for attached accounts</span>
              <div className="case-multi-select api-case-select">
                {registrationCaseOptions.map((registrationCase) => (
                  <label key={registrationCase}>
                    <input
                      type="checkbox"
                      checked={apiAutomationForm.registrationCases.includes(registrationCase)}
                      onChange={() => toggleApiAutomationRegistrationCase(registrationCase)}
                    />
                    <span>{registrationCase}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="field">
              <span>Proxy cases for attached accounts</span>
              <div className="case-multi-select api-case-select">
                {proxyCaseOptions.map((proxyCase) => (
                  <label key={proxyCase}>
                    <input
                      type="checkbox"
                      checked={apiAutomationForm.proxyCases.includes(proxyCase)}
                      onChange={() => toggleApiAutomationProxyCase(proxyCase)}
                    />
                    <span>{proxyCase}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="api-attach-box">
              <label className="field">
                <span>Attach accounts file</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt,.json,text/csv,text/plain,application/json"
                  onChange={handleApiAccountFile}
                />
              </label>
              <label className="field">
                <span>Paste accounts</span>
                <textarea
                  value={apiAccountPaste}
                  onChange={(event) => setApiAccountPaste(event.target.value)}
                  placeholder={"username,password\nuser@example.com,Secret123"}
                />
              </label>
              <div className="api-button-row">
                <button type="button" onClick={loadPastedApiAccounts} disabled={busy}>
                  <Upload size={16} />
                  Load Pasted
                </button>
                <button type="button" onClick={clearApiAccounts} disabled={busy}>
                  <Trash2 size={16} />
                  Clear Attached
                </button>
              </div>
              <div className="generator-stats">
                <StatBox label="Read" value={apiAccounts.rawCount} />
                <StatBox label="Valid" value={apiAccounts.valid.length} />
                <StatBox label="Duplicates/invalid" value={apiAccounts.duplicatesRemoved} />
                <StatBox label="Will queue" value={apiAccountsForQueue.length} />
              </div>
            </div>

            <div className="api-attach-box saved-accounts-box">
              <div className="panel-title compact split">
                <div>
                  <Database size={16} />
                  <h3>Saved Mongo accounts</h3>
                </div>
                <button
                  type="button"
                  onClick={() => loadRegisteredAccounts()}
                  disabled={busy}
                  title="Refresh saved accounts"
                >
                  <RefreshCw size={16} />
                  Refresh
                </button>
              </div>

              <div className="settings-grid">
                <label className="field">
                  <span>Search saved accounts</span>
                  <input
                    value={registeredAccountFilters.search}
                    onChange={(event) =>
                      updateRegisteredAccountFilter("search", event.target.value)
                    }
                    placeholder="email, mobile, username"
                  />
                </label>
                <label className="field">
                  <span>Saved MAJIC case</span>
                  <select
                    value={registeredAccountFilters.registrationCase}
                    onChange={(event) =>
                      updateRegisteredAccountFilter("registrationCase", event.target.value)
                    }
                  >
                    <option value="">All MAJIC cases</option>
                    {registrationCaseOptions.map((registrationCase) => (
                      <option key={registrationCase} value={registrationCase}>
                        {registrationCase}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Saved proxy case</span>
                  <select
                    value={registeredAccountFilters.proxyCase}
                    onChange={(event) =>
                      updateRegisteredAccountFilter("proxyCase", event.target.value)
                    }
                  >
                    <option value="">All proxy cases</option>
                    {proxyCaseOptions.map((proxyCase) => (
                      <option key={proxyCase} value={proxyCase}>
                        {proxyCase}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Status</span>
                  <select
                    value={registeredAccountFilters.status}
                    onChange={(event) =>
                      updateRegisteredAccountFilter("status", event.target.value)
                    }
                  >
                    <option value="">All statuses</option>
                    <option value="registered">Registered</option>
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </label>
              </div>

              <div className="api-button-row">
                <button type="button" onClick={() => loadRegisteredAccounts()} disabled={busy}>
                  <RefreshCw size={16} />
                  Apply Filters
                </button>
                <button
                  type="button"
                  onClick={showFacebookRegisteredAccounts}
                  disabled={busy}
                >
                  <Globe size={16} />
                  Show Facebook Accounts
                </button>
                <button
                  type="button"
                  onClick={selectVisibleRegisteredAccounts}
                  disabled={busy || registeredAccounts.length === 0}
                >
                  <CheckCircle2 size={16} />
                  Select Visible
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRegisteredAccountIds([])}
                  disabled={busy || selectedRegisteredAccountIds.length === 0}
                >
                  <Trash2 size={16} />
                  Clear Selection
                </button>
                <button
                  type="button"
                  onClick={() => createApiAutomationJobFromRegistered(false)}
                  disabled={busy || selectedRegisteredAccountIds.length === 0}
                >
                  <Plus size={16} />
                  Add Mongo to Queue
                </button>
                <button
                  type="button"
                  onClick={() => createApiAutomationJobFromRegistered(true)}
                  disabled={busy || selectedRegisteredAccountIds.length === 0}
                >
                  <Play size={16} />
                  Run Mongo Accounts
                </button>
                <button
                  className="danger"
                  type="button"
                  onClick={deleteSelectedRegisteredAccounts}
                  disabled={busy || selectedRegisteredAccountIds.length === 0}
                >
                  <Trash2 size={16} />
                  Delete Saved
                </button>
              </div>

              <div className="generator-stats">
                <StatBox label="Stored" value={registeredAccountsTotal} />
                <StatBox label="Visible" value={registeredAccounts.length} />
                <StatBox label="Selected" value={selectedRegisteredAccounts.length} />
                <StatBox
                  label="Encryption"
                  value={registeredAccountsCredentials?.ready === false ? "Missing" : "Ready"}
                />
              </div>

              {registeredAccountsCredentials?.ready === false ? (
                <div className="backend-error">
                  <strong>Credentials storage</strong>
                  <span>ACCOUNT_ENCRYPTION_KEY is required to store and reuse passwords.</span>
                </div>
              ) : null}

              {registeredAccounts.length > 0 ? (
                <div className="table-wrap api-account-preview saved-accounts-table">
                  <table>
                    <thead>
                      <tr>
                        <th></th>
                        <th>Account</th>
                        <th>MAJIC case</th>
                        <th>Proxy case</th>
                        <th>Proxy session</th>
                        <th>Source</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registeredAccounts.map((account) => (
                        <tr key={account._id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedRegisteredAccountIds.includes(account._id)}
                              onChange={() => toggleRegisteredAccountSelection(account._id)}
                            />
                          </td>
                          <td>
                            <code>{registeredAccountIdentifier(account)}</code>
                          </td>
                          <td>{account.registrationCase}</td>
                          <td>{account.proxyCase}</td>
                          <td>{account.proxySessionId || "-"}</td>
                          <td>{account.templateId?.name || account.source || "-"}</td>
                          <td>{formatDate(account.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-state">No saved Mongo accounts match the current filters.</p>
              )}
            </div>

            {apiAccountsForQueue.length > 0 ? (
              <div className="table-wrap api-account-preview">
                <table>
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Password</th>
                      <th>MAJIC case</th>
                      <th>Proxy case</th>
                      <th>Proxy session</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiAccountsForQueue.slice(0, 10).map((account, index) => (
                      <tr key={`${apiAccountIdentifier(account)}-${index}`}>
                        <td>
                          <code>{apiAccountIdentifier(account)}</code>
                        </td>
                        <td>
                          <code>{maskValue(account.password)}</code>
                        </td>
                        <td>{account.registrationCase}</td>
                        <td>{account.proxyCase}</td>
                        <td>{account.proxySessionId || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="template-preview">
              <strong>Zyte</strong>
              <span>
                {apiAutomationCapabilities?.zyte?.configured
                  ? "ZYTE_API_KEY configured"
                  : "ZYTE_API_KEY missing"}
              </span>
              <span>{apiAutomationCapabilities?.zyte?.proxyServer || "proxy server unknown"}</span>
            </div>

            <div className="template-preview">
              <strong>Official connector</strong>
              <span>
                {apiAutomationCapabilities?.officialConnector?.configured
                  ? "Connector configured"
                  : "Connector missing"}
              </span>
              <span>
                Allowed hosts:{" "}
                {apiAutomationCapabilities?.officialConnector?.allowedHosts?.length
                  ? apiAutomationCapabilities.officialConnector.allowedHosts.join(", ")
                  : "not configured"}
              </span>
            </div>

            <div className="api-button-row">
              <button className="primary-button" disabled={busy}>
                <ShieldCheck size={17} />
                Validate Workflow
              </button>
              <button
                type="button"
                onClick={() => createApiAutomationQueuedJob(false)}
                disabled={busy}
              >
                <Plus size={17} />
                Add Accounts to Queue
              </button>
              <button
                type="button"
                onClick={runApiAutomation}
                disabled={busy}
              >
                <Play size={17} />
                Run Automation
              </button>
            </div>
          </form>

          <section className="panel api-automation-panel">
            <div className="panel-title">
              <Link2 size={18} />
              <h2>Workflow Plan</h2>
            </div>

            {apiAutomationPlan ? (
              <>
                <div className="api-plan-summary">
                  <StatusPill status={apiAutomationPlan.status} />
                  <span>{apiAutomationPlan.urls.targetHost}</span>
                  <span>{apiAutomationPlan.credentials.identifierType}</span>
                </div>

                {apiAutomationPlan.warnings.length ? (
                  <div className="backend-error">
                    <strong>Guardrails</strong>
                    {apiAutomationPlan.warnings.map((warning) => (
                      <span key={warning}>{warning}</span>
                    ))}
                  </div>
                ) : null}

                <div className="api-steps">
                  {apiAutomationPlan.steps.map((step) => (
                    <div className="api-step" key={step.id}>
                      <span>
                        <strong>{step.title}</strong>
                        <small>{step.detail}</small>
                      </span>
                      <StatusPill status={step.status} />
                    </div>
                  ))}
                </div>

                <div className="template-preview">
                  <strong>Login field aliases</strong>
                  <span>{apiAutomationPlan.loginFieldAliases.slice(0, 8).join(", ")}</span>
                </div>

                {apiAutomationRunResult ? (
                  <div className="api-run-result">
                    <strong>Run result</strong>
                    <pre>{JSON.stringify(apiAutomationRunResult, null, 2)}</pre>
                  </div>
                ) : null}

                <div className="api-target-preview">
                  <div className="panel-title compact split">
                    <div>
                      <Monitor size={16} />
                      <h3>Target Preview</h3>
                    </div>
                    <a
                      href={apiAutomationPlan.urls.targetUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open
                    </a>
                  </div>
                  {apiAutomationPlan.status === "restricted" ? (
                    <div className="api-target-blocked">Preview blocked for this target.</div>
                  ) : (
                    <iframe
                      title="API automation target preview"
                      src={apiAutomationPlan.urls.targetUrl}
                      sandbox=""
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>
              </>
            ) : (
              <p className="empty-state">Enter credentials and URLs, then validate the workflow.</p>
            )}
          </section>
        </section>
        <section className="panel api-queue-panel">
          <div className="panel-title split">
            <div>
              <ClipboardList size={18} />
              <h2>Majic log in Queue</h2>
            </div>
            <div className="queue-controls">
              <button
                className="danger"
                type="button"
                onClick={deleteSelectedApiAutomationJobs}
                disabled={busy || selectedApiAutomationJobIds.length === 0}
              >
                <Trash2 size={16} />
                Delete Selected
              </button>
              <select
                className="job-select"
                value={selectedApiAutomationJobId}
                onChange={(event) => setSelectedApiAutomationJobId(event.target.value)}
              >
                <option value="">Choose API automation job</option>
                {apiAutomationJobs.map((job) => (
                  <option key={job._id} value={job._id}>
                    {job.targetUrl} - {job.status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {apiAutomationJobs.length > 0 ? (
            <div className="queue-list">
              {apiAutomationJobs.map((job) => (
                <div
                  className={`queue-item ${
                    job._id === selectedApiAutomationJobId ? "queue-item-active" : ""
                  }`}
                  key={job._id}
                  onClick={() => setSelectedApiAutomationJobId(job._id)}
                >
                  <input
                    checked={selectedApiAutomationJobIds.includes(job._id)}
                    onChange={() => toggleApiAutomationJobSelection(job._id)}
                    onClick={(event) => event.stopPropagation()}
                    type="checkbox"
                  />
                  <span>
                    <strong>{job.targetUrl}</strong>
                    <small>{job.loginUrl}</small>
                  </span>
                  <StatusPill status={job.status} />
                </div>
              ))}
            </div>
          ) : null}

          {selectedApiAutomationJob ? (
            <>
              {latestApiAutomationError ? (
                <div className="backend-error">
                  <strong>API automation error</strong>
                  <span>{latestApiAutomationError}</span>
                </div>
              ) : null}

              <div className="job-summary">
                <div>
                  <p className="muted">Selected API automation job</p>
                  <h3>{selectedApiAutomationJob.targetUrl}</h3>
                  <StatusPill status={selectedApiAutomationJob.status} />
                </div>
                <div className="actions">
                  <button
                    onClick={() => apiAutomationJobAction("start")}
                    disabled={busy}
                    title="Start"
                  >
                    <Play size={16} />
                    Start
                  </button>
                  <button
                    onClick={() => apiAutomationJobAction("pause")}
                    disabled={busy}
                    title="Pause"
                  >
                    <Pause size={16} />
                    Pause
                  </button>
                  <button
                    onClick={() => apiAutomationJobAction("resume")}
                    disabled={busy}
                    title="Resume"
                  >
                    <Play size={16} />
                    Resume
                  </button>
                  <button
                    className="danger"
                    onClick={() => apiAutomationJobAction("stop")}
                    disabled={busy}
                    title="Stop"
                  >
                    <Square size={16} />
                    Stop
                  </button>
                </div>
              </div>

              <div className="stats-row">
                <StatBox label="Pending" value={selectedApiAutomationJob.stats?.pending} />
                <StatBox label="Running" value={selectedApiAutomationJob.stats?.running} />
                <StatBox label="Success" value={selectedApiAutomationJob.stats?.success} />
                <StatBox label="Failed" value={selectedApiAutomationJob.stats?.failed} />
                <StatBox label="Cancelled" value={selectedApiAutomationJob.stats?.cancelled} />
              </div>

              <div className="live-browser-panel">
                <div className="panel-title compact split">
                  <div>
                    <Monitor size={16} />
                    <h3>Runtime Steps</h3>
                  </div>
                  <span className="muted">
                    {liveApiAutomationAttempt
                      ? `${liveApiAutomationAttempt.status} attempt`
                      : "No attempt selected"}
                  </span>
                </div>
                <div className="api-live-steps">
                  {liveApiAutomationAttempt?.result?.steps?.length ? (
                    liveApiAutomationAttempt.result.steps.map((step, index) => (
                      <code key={`${liveApiAutomationAttempt._id}-live-${index}`}>{step}</code>
                    ))
                  ) : (
                    <span>Start an API automation job to see runtime steps.</span>
                  )}
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Account</th>
                      <th>Error</th>
                      <th>Debug</th>
                      <th>Started</th>
                      <th>Finished</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiAutomationLogs.map((log) => (
                      <tr key={log._id}>
                        <td>
                          <StatusPill status={log.status} />
                        </td>
                        <td>
                          <code>
                            {log.account?.identifierPreview ||
                              apiAccountIdentifier(log.account || {})}
                          </code>
                        </td>
                        <td>{log.error || "-"}</td>
                        <td>
                          {log.result?.steps?.length || log.result?.connectorResponse ? (
                            <details className="debug-details">
                              <summary>View</summary>
                              {log.result?.failureType ? (
                                <p>
                                  <strong>Failure type:</strong> {log.result.failureType}
                                </p>
                              ) : null}
                              {log.result?.steps?.length ? (
                                <ol>
                                  {log.result.steps.map((step, index) => (
                                    <li key={`${log._id}-api-step-${index}`}>{step}</li>
                                  ))}
                                </ol>
                              ) : null}
                              {log.result?.plan ? (
                                <pre>{JSON.stringify(log.result.plan, null, 2)}</pre>
                              ) : null}
                              {log.result?.connectorResponse ? (
                                <pre>
                                  {JSON.stringify(log.result.connectorResponse, null, 2)}
                                </pre>
                              ) : null}
                              {log.result?.finalUrl ? <code>{log.result.finalUrl}</code> : null}
                            </details>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>{formatDate(log.startedAt)}</td>
                        <td>{formatDate(log.finishedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="empty-state">
              Attach accounts, add them to the Majic log in Queue, then press Start.
            </p>
          )}
        </section>
        </>
      ) : null}

      <section className="panel">
        <div className="panel-title split">
          <div>
            <Activity size={18} />
            <h2>Queue</h2>
          </div>
          <div className="queue-controls">
            <button
              className="danger"
              type="button"
              onClick={deleteSelectedJobs}
              disabled={busy || selectedJobIds.length === 0}
            >
              <Trash2 size={16} />
              Delete Selected Jobs
            </button>
            <select
              className="job-select"
              value={selectedJobId}
              onChange={(event) => setSelectedJobId(event.target.value)}
            >
              <option value="">Choose queued job</option>
              {jobs.map((job) => (
                <option key={job._id} value={job._id}>
                  {job.templateId?.name || "Untitled"} - {job.status}
                </option>
              ))}
            </select>
          </div>
        </div>

        {jobs.length > 0 && (
          <div className="queue-list">
            {jobs.map((job) => (
              <div
                className={`queue-item ${job._id === selectedJobId ? "queue-item-active" : ""}`}
                key={job._id}
                onClick={() => setSelectedJobId(job._id)}
              >
                <input
                  checked={selectedJobIds.includes(job._id)}
                  onChange={() => toggleJobSelection(job._id)}
                  onClick={(event) => event.stopPropagation()}
                  type="checkbox"
                />
                <span>
                  <strong>{job.templateId?.name || "Untitled"}</strong>
                  <small>{job.templateId?.url || job._id}</small>
                </span>
                <StatusPill status={job.status} />
              </div>
            ))}
          </div>
        )}

        {selectedJob ? (
          <>
            {latestBackendError && (
              <div className="backend-error">
                <strong>Backend error</strong>
                <span>{latestBackendError}</span>
              </div>
            )}

            <div className="job-summary">
              <div>
                <p className="muted">Selected queued job</p>
                <h3>{selectedJob.templateId?.name || selectedJob._id}</h3>
                <StatusPill status={selectedJob.status} />
              </div>
              <div className="actions">
                <button onClick={() => jobAction("start")} disabled={busy} title="Start">
                  <Play size={16} />
                  Start
                </button>
                <button onClick={() => jobAction("pause")} disabled={busy} title="Pause">
                  <Pause size={16} />
                  Pause
                </button>
                <button onClick={() => jobAction("resume")} disabled={busy} title="Resume">
                  <Play size={16} />
                  Resume
                </button>
                <button className="danger" onClick={() => jobAction("stop")} disabled={busy} title="Stop">
                  <Square size={16} />
                  Stop
                </button>
              </div>
            </div>

            <div className="stats-row">
              <StatBox label="Pending" value={selectedJob.stats?.pending} />
              <StatBox label="Running" value={selectedJob.stats?.running} />
              <StatBox label="Success" value={selectedJob.stats?.success} />
              <StatBox label="Failed" value={selectedJob.stats?.failed} />
              <StatBox label="Cancelled" value={selectedJob.stats?.cancelled} />
            </div>

            <div className="live-browser-panel">
              <div className="panel-title compact split">
                <div>
                  <Monitor size={16} />
                  <h3>Live Browser</h3>
                </div>
                <span className="muted">
                  {livePreviewAttempt
                    ? `${livePreviewAttempt.status} attempt`
                    : "No attempt selected"}
                </span>
              </div>
              <div className="live-browser-frame">
                {livePreviewUrl ? (
                  <img src={livePreviewUrl} alt="Live browser preview" />
                ) : (
                  <div className="live-browser-empty">
                    {livePreviewError || "Start a job to see the browser inside the dashboard."}
                  </div>
                )}
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Record</th>
                    <th>Error</th>
                    <th>Debug</th>
                    <th>Started</th>
                    <th>Finished</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log._id}>
                      <td>
                        <StatusPill status={log.status} />
                      </td>
                      <td>
                        <code>{JSON.stringify(log.record)}</code>
                      </td>
                      <td>{log.error || "-"}</td>
                      <td>
                        {log.result?.steps?.length || log.result?.pageText ? (
                          <details className="debug-details">
                            <summary>View</summary>
                            {log.result?.failureType ? (
                              <p>
                                <strong>Failure type:</strong> {log.result.failureType}
                              </p>
                            ) : null}
                            {log.result?.fieldEvidence ? (
                              <pre>{JSON.stringify(log.result.fieldEvidence, null, 2)}</pre>
                            ) : null}
                            {log.result?.steps?.length ? (
                              <ol>
                                {log.result.steps.map((step, index) => (
                                  <li key={`${log._id}-step-${index}`}>{step}</li>
                                ))}
                              </ol>
                            ) : null}
                            {log.result?.finalUrl ? <code>{log.result.finalUrl}</code> : null}
                            {log.result?.beforeSubmitSnapshot ? (
                              <pre>{JSON.stringify(log.result.beforeSubmitSnapshot, null, 2)}</pre>
                            ) : null}
                            {log.result?.afterFailureSnapshot ? (
                              <pre>{JSON.stringify(log.result.afterFailureSnapshot, null, 2)}</pre>
                            ) : null}
                            {log.result?.pageText ? <pre>{log.result.pageText}</pre> : null}
                          </details>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{formatDate(log.startedAt)}</td>
                      <td>{formatDate(log.finishedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="empty-state">
            No queued job yet. Save a template, choose it in Add to Queue, then press Add to Queue.
          </p>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);



