function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function decodeQuotedPrintable(value) {
  return String(value || "")
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9a-f]{2})/gi, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16))
    );
}

function decodeMimeWords(value) {
  return String(value || "").replace(
    /=\?([^?]+)\?([bq])\?([^?]*)\?=/gi,
    (_, charset, encoding, encoded) => {
      try {
        const normalizedCharset = String(charset).toLowerCase();
        if (!["utf-8", "us-ascii", "iso-8859-1"].includes(normalizedCharset)) {
          return encoded;
        }

        if (encoding.toLowerCase() === "b") {
          return Buffer.from(encoded, "base64").toString(
            normalizedCharset === "iso-8859-1" ? "latin1" : "utf8"
          );
        }

        const decoded = decodeQuotedPrintable(encoded.replace(/_/g, " "));
        return Buffer.from(decoded, "binary").toString(
          normalizedCharset === "iso-8859-1" ? "latin1" : "utf8"
        );
      } catch (_error) {
        return encoded;
      }
    }
  );
}

function decodeTransferEncoding(body, encoding) {
  const normalizedEncoding = String(encoding || "").toLowerCase();

  if (normalizedEncoding === "base64") {
    try {
      return Buffer.from(String(body || "").replace(/\s+/g, ""), "base64").toString(
        "utf8"
      );
    } catch (_error) {
      return String(body || "");
    }
  }

  if (normalizedEncoding === "quoted-printable") {
    return decodeQuotedPrintable(body);
  }

  return String(body || "");
}

function parseHeaders(headerText) {
  const headers = {};
  let currentName = "";

  for (const rawLine of String(headerText || "").split(/\r?\n/)) {
    if (/^\s/.test(rawLine) && currentName) {
      headers[currentName] = `${headers[currentName]} ${rawLine.trim()}`;
      continue;
    }

    const separatorIndex = rawLine.indexOf(":");
    if (separatorIndex === -1) continue;

    currentName = rawLine.slice(0, separatorIndex).trim().toLowerCase();
    const value = decodeMimeWords(rawLine.slice(separatorIndex + 1).trim());

    if (headers[currentName]) {
      headers[currentName] = `${headers[currentName]}, ${value}`;
    } else {
      headers[currentName] = value;
    }
  }

  return headers;
}

function getHeaderValue(headers, name) {
  return headers[String(name || "").toLowerCase()] || "";
}

function getDebugHeaders(headers) {
  return {
    to: getHeaderValue(headers, "to"),
    deliveredTo: getHeaderValue(headers, "delivered-to"),
    xOriginalTo: getHeaderValue(headers, "x-original-to"),
    envelopeTo: getHeaderValue(headers, "envelope-to"),
    received: getHeaderValue(headers, "received"),
    subject: getHeaderValue(headers, "subject"),
    from: getHeaderValue(headers, "from"),
    date: getHeaderValue(headers, "date"),
  };
}

function splitHeaderAndBody(raw) {
  const text = String(raw || "").replace(/\r?\n/g, "\r\n");
  const separatorIndex = text.indexOf("\r\n\r\n");
  if (separatorIndex === -1) {
    return { headerText: "", body: text };
  }

  return {
    headerText: text.slice(0, separatorIndex),
    body: text.slice(separatorIndex + 4),
  };
}

function getBoundary(contentType) {
  const match = String(contentType || "").match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  return match ? match[1] || match[2] : "";
}

function collectMimeParts(raw, output) {
  const { headerText, body } = splitHeaderAndBody(raw);
  const headers = parseHeaders(headerText);
  const contentType = String(headers["content-type"] || "text/plain").toLowerCase();
  const transferEncoding = headers["content-transfer-encoding"];
  const boundary = getBoundary(contentType);

  if (contentType.includes("multipart/") && boundary) {
    const delimiter = `--${boundary}`;
    const parts = body.split(delimiter).slice(1);

    for (const part of parts) {
      if (part.trim().startsWith("--")) continue;
      collectMimeParts(part.replace(/^\r\n/, ""), output);
    }

    return;
  }

  const decodedBody = decodeTransferEncoding(body, transferEncoding);
  if (contentType.includes("text/html")) {
    output.html.push(decodedBody);
  } else if (contentType.includes("text/plain") || !contentType) {
    output.text.push(decodedBody);
  }
}

function stripHtml(html) {
  return normalizeWhitespace(
    String(html || "")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
  );
}

function parseMimeMessage(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw || "");
  const { headerText, body } = splitHeaderAndBody(text);
  const headers = parseHeaders(headerText);
  const parts = { text: [], html: [] };
  const contentType = String(headers["content-type"] || "").toLowerCase();

  if (contentType.includes("multipart/")) {
    collectMimeParts(text, parts);
  } else {
    const decodedBody = decodeTransferEncoding(body, headers["content-transfer-encoding"]);
    if (contentType.includes("text/html")) {
      parts.html.push(decodedBody);
    } else {
      parts.text.push(decodedBody);
    }
  }

  const html = parts.html.join("\n").trim();
  const plainText = parts.text.join("\n").trim();

  return {
    headers,
    debugHeaders: getDebugHeaders(headers),
    from: headers.from || headers.sender || "",
    recipients: [
      headers.to,
      headers.cc,
      headers.bcc,
      headers["delivered-to"],
      headers["x-original-to"],
      headers["envelope-to"],
      headers.received,
    ].filter(Boolean),
    subject: normalizeWhitespace(headers.subject || ""),
    text: plainText || stripHtml(html),
    html,
    messageId: headers["message-id"] || "",
  };
}

function extractEmailAddresses(value) {
  const addresses = [];

  function visit(input) {
    if (!input) return;

    if (Array.isArray(input)) {
      input.forEach(visit);
      return;
    }

    if (typeof input === "object") {
      visit(input.address);
      visit(input.email);
      visit(input.from);
      visit(input.to);
      visit(input.cc);
      visit(input.bcc);
      visit(input.recipients);
      visit(input.value);
      return;
    }

    const matches = String(input).match(
      /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
    );
    if (matches) {
      addresses.push(
        ...matches.map((address) => address.replace(/^mailto:/i, "").toLowerCase())
      );
    }
  }

  visit(value);

  return [...new Set(addresses)];
}

function maskOtpCandidates(value) {
  return String(value || "").replace(
    /(^|[^\d])(\d(?:[\s-]?\d){3,7})(?=$|[^\d])/g,
    (match, prefix, candidate) => {
      const digits = candidate.replace(/[^\d]/g, "");
      if (![4, 5, 6, 8].includes(digits.length)) return match;
      return `${prefix}[code]`;
    }
  );
}

function sanitizePreview(value, limit = 300) {
  return normalizeWhitespace(maskOtpCandidates(value)).slice(0, limit);
}

module.exports = {
  extractEmailAddresses,
  getDebugHeaders,
  normalizeWhitespace,
  parseHeaders,
  parseMimeMessage,
  sanitizePreview,
  stripHtml,
};
