const RegisteredAccount = require("../models/RegisteredAccount");
const { decryptSecret, encryptSecret, encryptionReady } = require("./credentialCrypto");
const { maskIdentifier } = require("./apiAutomationConnector");

function accountIdentifier(record = {}) {
  return record.username || record.email || record.mobile || record.contact || "";
}

function stripSensitiveRecord(record = {}) {
  const clean = { ...(record || {}) };
  delete clean.password;
  return clean;
}

function normalizeAccountRecord(record = {}) {
  const rawEmail = String(record.email || "").trim().toLowerCase();
  const rawContact = String(record.contact || "").trim();
  const contactEmail = rawContact.includes("@") ? rawContact.toLowerCase() : "";
  const email = rawEmail || contactEmail;
  const mobile = email ? "" : String(record.mobile || "").trim();
  const contact = email || rawContact;
  const identifier = String(
    email || record.username || mobile || contact || accountIdentifier(record)
  ).trim();

  return {
    username: String(record.username || "").trim() || undefined,
    email: email || undefined,
    mobile: mobile || undefined,
    contact: contact || undefined,
    identifier,
    identifierSearch: identifier.toLowerCase(),
  };
}

function publicRegisteredAccount(account) {
  const data = account.toObject ? account.toObject() : account;
  return {
    _id: data._id,
    username: data.username,
    email: data.email,
    mobile: data.mobile,
    contact: data.contact,
    identifier: data.identifier,
    identifierPreview: maskIdentifier(data.identifier),
    registrationCase: data.registrationCase,
    proxyCase: data.proxyCase,
    proxySessionId: data.proxySessionId,
    loginUrl: data.loginUrl,
    targetUrl: data.targetUrl,
    finalUrl: data.finalUrl,
    sourceUrl: data.sourceUrl,
    templateId: data.templateId,
    jobId: data.jobId,
    attemptId: data.attemptId,
    status: data.status,
    source: data.source,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function queryRegisteredAccounts(params = {}) {
  const query = {};
  if (params.status) query.status = params.status;
  if (params.registrationCase) query.registrationCase = params.registrationCase;
  if (params.proxyCase) query.proxyCase = params.proxyCase;
  if (params.templateId) query.templateId = params.templateId;
  if (String(params.facebookOnly || "").toLowerCase() === "true") {
    const facebookUrl = { $regex: "facebook\\.com|fb\\.com", $options: "i" };
    query.$or = [
      { sourceUrl: facebookUrl },
      { finalUrl: facebookUrl },
      { loginUrl: facebookUrl },
      { targetUrl: facebookUrl },
    ];
  }
  if (params.search) {
    const search = String(params.search)
      .trim()
      .toLowerCase()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.identifierSearch = { $regex: search, $options: "i" };
  }
  return query;
}

async function saveRegisteredAccountFromAttempt(attempt, template, settings) {
  if (!encryptionReady()) {
    return {
      stored: false,
      reason: "ACCOUNT_ENCRYPTION_KEY is not configured",
    };
  }

  const record = attempt.record || {};
  const password = String(record.password || "");
  const normalized = normalizeAccountRecord(record);
  if (!normalized.identifier || !password) {
    return {
      stored: false,
      reason: "registered account is missing identifier or password",
    };
  }

  const proxySession = attempt.result?.proxySession || {};
  const account = await RegisteredAccount.findOneAndUpdate(
    { attemptId: attempt._id },
    {
      $set: {
        ...normalized,
        password: encryptSecret(password),
        registrationCase: settings.registrationCase || record.registrationCase || "MAJIC ONE",
        proxyCase: record.proxyCase || "PROXY ONE",
        proxySessionId: record.proxySessionId || proxySession.sessionId || "",
        finalUrl: attempt.result?.finalUrl || "",
        sourceUrl: template.url,
        templateId: template._id,
        jobId: attempt.jobId,
        attemptId: attempt._id,
        status: "registered",
        source: "registration-worker",
        record: stripSensitiveRecord(record),
        result: {
          matchedBy: attempt.result?.matchedBy,
          proxySession,
        },
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return {
    stored: true,
    account,
  };
}

function registeredAccountToApiAccount(account, options = {}) {
  const identifierFields = {
    username: account.username,
    email: account.email,
    mobile: account.mobile,
    contact: account.contact,
  };
  const apiAccount = Object.fromEntries(
    Object.entries(identifierFields).filter(([, value]) => String(value || "").trim())
  );

  return {
    ...(Object.keys(apiAccount).length > 0 ? apiAccount : { username: account.identifier }),
    password: decryptSecret(account.password),
    loginUrl: options.loginUrl || account.loginUrl || undefined,
    targetUrl: options.targetUrl || account.targetUrl || undefined,
    registrationCase: account.registrationCase || options.registrationCase || "MAJIC ONE",
    proxyCase: account.proxyCase || options.proxyCase || "PROXY ONE",
    proxySessionId: account.proxySessionId || undefined,
    registeredAccountId: String(account._id),
  };
}

module.exports = {
  publicRegisteredAccount,
  queryRegisteredAccounts,
  registeredAccountToApiAccount,
  saveRegisteredAccountFromAttempt,
};
