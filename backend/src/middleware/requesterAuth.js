const crypto = require("crypto");
const config = require("../config");

function hashSecret(value) {
  return crypto.createHash("sha256").update(String(value)).digest();
}

function sameSecret(left, right) {
  return crypto.timingSafeEqual(hashSecret(left), hashSecret(right));
}

function extractApiKey(req) {
  const authorization = req.get("authorization") || "";
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) return bearerMatch[1].trim();

  return (req.get("x-api-key") || "").trim();
}

function requireRequesterAuth(req, res, next) {
  if (config.otp.requesterApiKeys.length === 0) {
    res.status(503).json({
      error: "OTP requester authentication is not configured",
    });
    return;
  }

  const apiKey = extractApiKey(req);
  if (!apiKey) {
    res.status(401).json({ error: "Missing requester API key" });
    return;
  }

  const requester = config.otp.requesterApiKeys.find((entry) =>
    sameSecret(apiKey, entry.apiKey)
  );

  if (!requester) {
    res.status(401).json({ error: "Invalid requester API key" });
    return;
  }

  req.requester = { id: requester.requesterId };
  next();
}

module.exports = {
  requireRequesterAuth,
  sameSecret,
};
