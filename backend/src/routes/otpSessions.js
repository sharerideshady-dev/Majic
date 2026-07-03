const express = require("express");
const { createRateLimiter, getClientIp } = require("../middleware/rateLimit");
const { requireRequesterAuth } = require("../middleware/requesterAuth");
const { otpSessionCreateSchema, validate } = require("../validation");
const {
  createOtpSession,
  getOtpSessionForRequester,
} = require("../services/otpReceiver");

const router = express.Router();

const authLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: getClientIp,
  message: "Too many OTP API requests",
});

const createLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.requester?.id || getClientIp(req),
  message: "Too many OTP sessions created",
});

const statusLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (req) => req.requester?.id || getClientIp(req),
  message: "Too many OTP session status requests",
});

router.use(authLimiter);
router.use(requireRequesterAuth);

router.post("/", createLimiter, async (req, res, next) => {
  try {
    const payload = validate(otpSessionCreateSchema, req.body);
    const session = await createOtpSession(req.requester.id, payload);
    res.status(201).json({ session });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", statusLimiter, async (req, res, next) => {
  try {
    const session = await getOtpSessionForRequester(req.requester.id, req.params.id);
    res.json({ session });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
