const crypto = require("crypto");
const config = require("../config");
const OtpEmailLog = require("../models/OtpEmailLog");
const OtpSession = require("../models/OtpSession");
const {
  extractEmailAddresses,
  normalizeWhitespace,
  parseMimeMessage,
  sanitizePreview,
  stripHtml,
} = require("./emailParser");

const OTP_LENGTHS = new Set([4, 5, 6, 8]);

function makeHttpError(message, statusCode, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function ensureOtpConfig() {
  if (!config.otp.mailDomain) {
    throw makeHttpError("MAIL_DOMAIN is required for OTP receiving sessions", 500);
  }

  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(config.otp.mailDomain)) {
    throw makeHttpError("MAIL_DOMAIN is invalid", 500);
  }

  if (!/^[a-z0-9][a-z0-9._-]*$/.test(config.otp.aliasLocalPart)) {
    throw makeHttpError("OTP_ALIAS_LOCAL_PART is invalid", 500);
  }
}

function generateRequestId() {
  return crypto.randomBytes(16).toString("hex");
}

function buildAlias(requestId) {
  return `${config.otp.aliasLocalPart}+${requestId}@${config.otp.mailDomain}`;
}

function serializeSession(session, options = {}) {
  const payload = {
    requestId: session.requestId,
    alias: session.alias,
    status: session.status,
    expiresAt: session.expiresAt,
    otpReceivedAt: session.otpReceivedAt,
    deliveredAt: session.deliveredAt,
    deliveryStatus: session.deliveryStatus,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };

  if (options.includeOtp && session.otpCode) {
    payload.otp = session.otpCode;
  }

  return payload;
}

async function createOtpSession(requesterId, options = {}) {
  ensureOtpConfig();

  const expiresInMinutes =
    options.expiresInMinutes || config.otp.sessionExpireMinutes;
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const requestId = generateRequestId();
    const alias = buildAlias(requestId);

    try {
      const session = await OtpSession.create({
        requestId,
        requesterId,
        alias,
        localPart: `${config.otp.aliasLocalPart}+${requestId}`,
        domain: config.otp.mailDomain,
        expiresAt,
      });

      return serializeSession(session);
    } catch (error) {
      if (error.code !== 11000 || attempt === 2) throw error;
    }
  }

  throw makeHttpError("Unable to create OTP receiving session", 500);
}

function isExpired(session, now = new Date()) {
  return session.expiresAt.getTime() <= now.getTime();
}

async function expireSession(session) {
  if (!["pending", "received"].includes(session.status)) return session;

  const expired = await OtpSession.findOneAndUpdate(
    { _id: session._id, status: { $in: ["pending", "received"] } },
    {
      $set: {
        status: "expired",
        deliveryStatus: "expired",
      },
    },
    { new: true }
  );

  if (session.emailLogId) {
    await OtpEmailLog.updateOne(
      { _id: session.emailLogId },
      { $set: { deliveryStatus: "expired" } }
    );
  }

  return expired || session;
}

async function getOtpSessionForRequester(requesterId, requestId) {
  if (!/^[a-z0-9_-]{8,80}$/i.test(requestId)) {
    throw makeHttpError("OTP session id is invalid", 400);
  }

  const session = await OtpSession.findOne({
    requesterId,
    requestId: requestId.toLowerCase(),
  }).select("+otpCode");

  if (!session) {
    throw makeHttpError("OTP session not found", 404);
  }

  if (["pending", "received"].includes(session.status) && isExpired(session)) {
    const expired = await expireSession(session);
    return serializeSession(expired);
  }

  if (session.status !== "received") {
    return serializeSession(session);
  }

  const delivered = await OtpSession.findOneAndUpdate(
    {
      _id: session._id,
      requesterId,
      status: "received",
      expiresAt: { $gt: new Date() },
    },
    {
      $set: {
        status: "completed",
        deliveryStatus: "delivered",
        deliveredAt: new Date(),
      },
    },
    { new: true }
  ).select("+otpCode");

  if (!delivered) {
    const current = await OtpSession.findById(session._id).select("+otpCode");
    return serializeSession(current || session);
  }

  if (delivered.emailLogId) {
    await OtpEmailLog.updateOne(
      { _id: delivered.emailLogId },
      { $set: { deliveryStatus: "delivered" } }
    );
  }

  return serializeSession(delivered, { includeOtp: true });
}

function normalizePayloadValue(value) {
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function parseJsonMaybe(value) {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch (_error) {
    return value;
  }
}

function getHeaderFromMessageHeaders(messageHeaders, headerName) {
  if (!messageHeaders) return "";
  const normalizedName = String(headerName || "").toLowerCase();

  if (Array.isArray(messageHeaders)) {
    const values = [];
    for (const entry of messageHeaders) {
      if (Array.isArray(entry) && String(entry[0] || "").toLowerCase() === normalizedName) {
        values.push(entry[1]);
      } else if (
        entry &&
        typeof entry === "object" &&
        String(entry.name || entry.key || "").toLowerCase() === normalizedName
      ) {
        values.push(entry.value);
      }
    }
    return values.filter(Boolean).join(", ");
  }

  if (typeof messageHeaders === "object") {
    for (const [key, value] of Object.entries(messageHeaders)) {
      if (String(key).toLowerCase() === normalizedName) return value;
    }
  }

  return "";
}

function getPayloadField(payload, names) {
  if (!payload || typeof payload !== "object") return "";

  for (const name of names) {
    if (payload[name] !== undefined && payload[name] !== null) {
      return payload[name];
    }
  }

  return "";
}

function parseInboundPayload(payload) {
  if (Buffer.isBuffer(payload) || typeof payload === "string") {
    return parseMimeMessage(payload);
  }

  const body = payload && typeof payload === "object" ? payload : {};
  const raw = getPayloadField(body, [
    "raw",
    "mime",
    "email",
    "message",
    "body-mime",
    "rawMime",
    "raw_mime",
  ]);

  const parsedRaw = raw ? parseMimeMessage(normalizePayloadValue(raw)) : {};
  const envelope = parseJsonMaybe(body.envelope);
  const messageHeaders = parseJsonMaybe(body["message-headers"]);
  const debugHeaders = {
    ...(parsedRaw.debugHeaders || {}),
    to:
      getPayloadField(body, ["to", "recipient", "recipients", "rcpt_to"]) ||
      getHeaderFromMessageHeaders(messageHeaders, "to") ||
      (parsedRaw.debugHeaders && parsedRaw.debugHeaders.to) ||
      "",
    deliveredTo:
      getPayloadField(body, ["Delivered-To", "delivered-to", "deliveredTo"]) ||
      getHeaderFromMessageHeaders(messageHeaders, "delivered-to") ||
      (parsedRaw.debugHeaders && parsedRaw.debugHeaders.deliveredTo) ||
      "",
    xOriginalTo:
      getPayloadField(body, ["X-Original-To", "x-original-to", "xOriginalTo"]) ||
      getHeaderFromMessageHeaders(messageHeaders, "x-original-to") ||
      (parsedRaw.debugHeaders && parsedRaw.debugHeaders.xOriginalTo) ||
      "",
    envelopeTo:
      getPayloadField(body, ["Envelope-To", "envelope-to", "envelopeTo"]) ||
      getHeaderFromMessageHeaders(messageHeaders, "envelope-to") ||
      (parsedRaw.debugHeaders && parsedRaw.debugHeaders.envelopeTo) ||
      "",
    received:
      getPayloadField(body, ["Received", "received"]) ||
      getHeaderFromMessageHeaders(messageHeaders, "received") ||
      (parsedRaw.debugHeaders && parsedRaw.debugHeaders.received) ||
      "",
  };

  return {
    headers: parsedRaw.headers || {},
    debugHeaders,
    from:
      getPayloadField(body, ["from", "sender", "fromEmail", "from_email"]) ||
      parsedRaw.from ||
      "",
    recipients: [
      getPayloadField(body, ["to", "recipient", "recipients", "rcpt_to"]),
      getPayloadField(body, ["cc"]),
      getPayloadField(body, ["bcc"]),
      debugHeaders.deliveredTo,
      debugHeaders.xOriginalTo,
      debugHeaders.envelopeTo,
      debugHeaders.received,
      envelope,
      messageHeaders,
      parsedRaw.recipients,
    ].filter(Boolean),
    subject:
      normalizeWhitespace(getPayloadField(body, ["subject"]) || parsedRaw.subject || ""),
    text:
      normalizePayloadValue(
        getPayloadField(body, [
          "text",
          "plain",
          "body",
          "body-plain",
          "stripped-text",
          "textBody",
          "TextBody",
        ])
      ) ||
      parsedRaw.text ||
      "",
    html:
      normalizePayloadValue(
        getPayloadField(body, [
          "html",
          "body-html",
          "stripped-html",
          "htmlBody",
          "HtmlBody",
        ])
      ) ||
      parsedRaw.html ||
      "",
    messageId:
      getPayloadField(body, ["messageId", "message_id", "MessageID", "Message-Id"]) ||
      parsedRaw.messageId ||
      "",
  };
}

function getRequestIdFromRecipient(recipient) {
  const address = String(recipient || "").trim().toLowerCase();
  const atIndex = address.lastIndexOf("@");
  if (atIndex === -1) return null;

  const localPart = address.slice(0, atIndex);
  const domain = address.slice(atIndex + 1);
  if (domain !== config.otp.mailDomain) return null;

  const expectedPrefix = `${config.otp.aliasLocalPart}+`;
  if (!localPart.startsWith(expectedPrefix)) {
    if (!/^[a-z0-9_-]{4,80}$/.test(localPart)) return null;
    return { requestId: localPart, recipient: address };
  }

  const requestId = localPart.slice(expectedPrefix.length);
  if (!/^[a-z0-9_-]{8,80}$/.test(requestId)) return null;

  return { requestId, recipient: address };
}

function addOtpCandidate(candidates, candidate, source, score) {
  const otp = String(candidate || "").replace(/[^\d]/g, "");
  if (!OTP_LENGTHS.has(otp.length)) return;

  candidates.push({
    otp,
    source,
    score: score + (otp.length === 6 ? 6 : 0) + (otp.length === 8 ? 2 : 0),
  });
}

function extractOtpFromEmail(email) {
  const htmlText = email.html ? stripHtml(email.html) : "";
  const fields = [
    { name: "subject", text: email.subject, weight: 30 },
    { name: "text", text: email.text, weight: 10 },
    { name: "html", text: htmlText, weight: 5 },
  ];
  const candidates = [];

  for (const field of fields) {
    const text = String(field.text || "");
    if (!text) continue;

    const contextualPattern =
      /(otp|code|verification|verify|security|login|passcode|pin|one[\s-]?time)[^\d]{0,50}((?:\d[\s-]?){3,7}\d)/gi;
    let contextualMatch;
    while ((contextualMatch = contextualPattern.exec(text))) {
      addOtpCandidate(
        candidates,
        contextualMatch[2],
        field.name,
        field.weight + 50
      );
    }

    const genericPattern = /(^|[^\d])(\d{4}|\d{5}|\d{6}|\d{8})(?=$|[^\d])/g;
    let genericMatch;
    while ((genericMatch = genericPattern.exec(text))) {
      addOtpCandidate(candidates, genericMatch[2], field.name, field.weight);
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0];
}

function buildLogPayload(email, status, values = {}) {
  const recipients = extractEmailAddresses(email.recipients);
  const approvedRecipients = recipients.filter((recipient) =>
    recipient.endsWith(`@${config.otp.mailDomain}`)
  );

  return {
    source: values.source || "webhook",
    sender: extractEmailAddresses(email.from)[0] || "",
    recipients,
    approvedRecipients,
    recipientAlias: values.recipientAlias,
    requestId: values.requestId,
    requesterId: values.requesterId,
    matchedSessionId: values.matchedSessionId,
    status,
    deliveryStatus: values.deliveryStatus || "not_applicable",
    subjectPreview: sanitizePreview(email.subject),
    messageId: email.messageId,
    error: values.error,
    receivedAt: values.receivedAt || new Date(),
  };
}

async function writeLog(email, status, values = {}) {
  return OtpEmailLog.create(buildLogPayload(email, status, values));
}

async function processInboundEmail({ payload, source = "webhook" }) {
  ensureOtpConfig();

  const receivedAt = new Date();
  const email = parseInboundPayload(payload);
  const recipients = extractEmailAddresses(email.recipients);
  const approvedRecipients = recipients.filter((recipient) =>
    recipient.endsWith(`@${config.otp.mailDomain}`)
  );

  if (recipients.length === 0) {
    await writeLog(email, "invalid_recipient", { source, receivedAt });
    return { accepted: true, status: "invalid_recipient" };
  }

  if (approvedRecipients.length === 0) {
    await writeLog(email, "invalid_domain", { source, receivedAt });
    return { accepted: true, status: "invalid_domain" };
  }

  const recipientMatch = approvedRecipients
    .map((recipient) => getRequestIdFromRecipient(recipient))
    .find(Boolean);

  if (!recipientMatch) {
    await writeLog(email, "invalid_recipient", { source, receivedAt });
    return { accepted: true, status: "invalid_recipient" };
  }

  const logValues = {
    source,
    receivedAt,
    recipientAlias: recipientMatch.recipient,
    requestId: recipientMatch.requestId,
  };

  const session = await OtpSession.findOne({
    requestId: recipientMatch.requestId,
    domain: config.otp.mailDomain,
  }).select("+otpCode");

  if (!session) {
    await writeLog(email, "no_pending_session", logValues);
    return {
      accepted: true,
      status: "no_pending_session",
      requestId: recipientMatch.requestId,
    };
  }

  logValues.requesterId = session.requesterId;
  logValues.matchedSessionId = session._id;

  if (session.status !== "pending") {
    await writeLog(email, "duplicate", {
      ...logValues,
      deliveryStatus: session.deliveryStatus || "not_applicable",
    });
    return {
      accepted: true,
      status: "duplicate",
      requestId: session.requestId,
    };
  }

  if (isExpired(session, receivedAt)) {
    await expireSession(session);
    await writeLog(email, "expired_session", {
      ...logValues,
      deliveryStatus: "expired",
    });
    return {
      accepted: true,
      status: "expired_session",
      requestId: session.requestId,
    };
  }

  const otpResult = extractOtpFromEmail(email);
  if (!otpResult) {
    await writeLog(email, "no_otp", logValues);
    return {
      accepted: true,
      status: "no_otp",
      requestId: session.requestId,
    };
  }

  const updatedSession = await OtpSession.findOneAndUpdate(
    {
      _id: session._id,
      status: "pending",
      expiresAt: { $gt: receivedAt },
    },
    {
      $set: {
        status: "received",
        otpCode: otpResult.otp,
        otpReceivedAt: receivedAt,
        matchedRecipient: recipientMatch.recipient,
        sender: extractEmailAddresses(email.from)[0] || "",
        subjectPreview: sanitizePreview(email.subject),
        deliveryStatus: "not_delivered",
      },
    },
    { new: true }
  ).select("+otpCode");

  if (!updatedSession) {
    await writeLog(email, "duplicate", logValues);
    return {
      accepted: true,
      status: "duplicate",
      requestId: session.requestId,
    };
  }

  const log = await writeLog(email, "processed", {
    ...logValues,
    matchedSessionId: updatedSession._id,
    deliveryStatus: "not_delivered",
  });

  await OtpSession.updateOne(
    { _id: updatedSession._id },
    { $set: { emailLogId: log._id } }
  );

  return {
    accepted: true,
    status: "processed",
    requestId: updatedSession.requestId,
    matchedSessionId: String(updatedSession._id),
  };
}

module.exports = {
  createOtpSession,
  extractOtpFromEmail,
  getOtpSessionForRequester,
  processInboundEmail,
};
