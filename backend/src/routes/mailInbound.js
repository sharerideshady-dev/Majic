const express = require("express");
const config = require("../config");
const { createRateLimiter, getClientIp } = require("../middleware/rateLimit");
const { sameSecret } = require("../middleware/requesterAuth");
const { processInboundEmail } = require("../services/otpReceiver");

const router = express.Router();

const inboundLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 180,
  keyGenerator: getClientIp,
  message: "Too many inbound mail webhook requests",
});

function getWebhookSecret(req) {
  const authorization = req.get("authorization") || "";
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) return bearerMatch[1].trim();

  return (
    req.get("x-inbound-mail-webhook-secret") ||
    req.get("x-inbound-mail-secret") ||
    req.get("x-mail-webhook-secret") ||
    req.get("x-webhook-secret") ||
    ""
  ).trim();
}

function requireInboundWebhookSecret(req, res, next) {
  if (!config.otp.inboundWebhookSecret) {
    res.status(503).json({
      error: "INBOUND_MAIL_WEBHOOK_SECRET is not configured",
    });
    return;
  }

  const suppliedSecret = getWebhookSecret(req);
  if (!suppliedSecret || !sameSecret(suppliedSecret, config.otp.inboundWebhookSecret)) {
    res.status(401).json({ error: "Invalid inbound mail webhook secret" });
    return;
  }

  next();
}

router.post("/", inboundLimiter, requireInboundWebhookSecret, async (req, res, next) => {
  try {
    const result = await processInboundEmail({
      payload: req.body,
      source: "webhook",
    });

    res.status(202).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
