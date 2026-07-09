const config = require("../config");

const zyteExamples = {
  curl: `curl -kx api.zyte.com:8011 'https://toscrape.com/' -U "YOUR_ZYTE_API_KEY":`,
  python: `from base64 import b64decode
import requests

api_response = requests.post(
    "https://api.zyte.com/v1/extract",
    auth=("YOUR_ZYTE_API_KEY", ""),
    json={
        "url": "https://toscrape.com",
        "httpResponseBody": True,
    },
)
http_response_body: bytes = b64decode(api_response.json()["httpResponseBody"])`,
  javascript: `const axios = require('axios')

axios.post(
  'https://api.zyte.com/v1/extract',
  {
    url: 'https://toscrape.com',
    httpResponseBody: true
  },
  {
    auth: { username: 'YOUR_ZYTE_API_KEY' }
  }
).then((response) => {
  const httpResponseBody = Buffer.from(
    response.data.httpResponseBody,
    'base64'
  )
})`,
};

function httpError(statusCode, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function isPrivateIpAddress(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized.startsWith("127.")
  ) {
    return true;
  }

  const octets = normalized.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function assertPublicHttpUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch (error) {
    throw httpError(400, "url must be a valid HTTP or HTTPS URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw httpError(400, "url must use HTTP or HTTPS");
  }

  if (isPrivateIpAddress(url.hostname.toLowerCase())) {
    throw httpError(400, "url must target a public host");
  }

  return url.toString();
}

function zyteAuthHeader() {
  return `Basic ${Buffer.from(`${config.zyte.apiKey}:`).toString("base64")}`;
}

function decodeHttpResponseBody(data, includeBase64) {
  if (typeof data.httpResponseBody !== "string") {
    return {};
  }

  const bodyBuffer = Buffer.from(data.httpResponseBody, "base64");
  return {
    httpResponseBody: bodyBuffer.toString("utf8"),
    httpResponseBodyBytes: bodyBuffer.length,
    ...(includeBase64 ? { httpResponseBodyBase64: data.httpResponseBody } : {}),
  };
}

async function extractHttpResponse(payload) {
  if (!config.zyte.apiKey) {
    throw httpError(409, "ZYTE_API_KEY is required for Zyte extraction");
  }

  if (typeof fetch !== "function") {
    throw httpError(500, "Node fetch API is not available in this runtime");
  }

  const url = assertPublicHttpUrl(payload.url);
  const requestBody = {
    url,
    httpResponseBody: payload.httpResponseBody !== false,
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    config.zyte.requestTimeoutMs
  );

  try {
    const response = await fetch(config.zyte.extractEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: zyteAuthHeader(),
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw httpError(
        response.status,
        data.detail ||
          data.title ||
          data.error ||
          data.message ||
          `Zyte extraction failed with ${response.status}`
      );
    }

    return {
      url,
      zyteEndpoint: config.zyte.extractEndpoint,
      statusCode: data.statusCode || data.httpResponseStatusCode || null,
      httpResponseHeaders: data.httpResponseHeaders || [],
      ...decodeHttpResponseBody(data, payload.includeBase64),
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw httpError(504, "Zyte extraction timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  extractHttpResponse,
  zyteExamples,
};
