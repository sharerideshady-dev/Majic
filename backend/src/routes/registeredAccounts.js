const express = require("express");
const mongoose = require("mongoose");
const RegisteredAccount = require("../models/RegisteredAccount");
const { encryptionReady } = require("../services/credentialCrypto");
const {
  publicRegisteredAccount,
  queryRegisteredAccounts,
} = require("../services/registeredAccounts");

const router = express.Router();

function toLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(parsed, 1), 200);
}

function assertObjectIds(ids, label) {
  const invalid = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));
  if (invalid.length > 0) {
    const error = new Error(`${label} contains invalid ids`);
    error.statusCode = 400;
    throw error;
  }
}

router.get("/", async (req, res, next) => {
  try {
    const query = queryRegisteredAccounts(req.query);
    const limit = toLimit(req.query.limit);
    const [accounts, total] = await Promise.all([
      RegisteredAccount.find(query)
        .populate("templateId", "name url")
        .sort({ createdAt: -1 })
        .limit(limit),
      RegisteredAccount.countDocuments(query),
    ]);

    res.json({
      accounts: accounts.map(publicRegisteredAccount),
      total,
      limit,
      credentials: {
        encrypted: true,
        ready: encryptionReady(),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/summary", async (req, res, next) => {
  try {
    const [total, byRegistrationCase, byProxyCase] = await Promise.all([
      RegisteredAccount.countDocuments(),
      RegisteredAccount.aggregate([
        { $group: { _id: "$registrationCase", count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 25 },
      ]),
      RegisteredAccount.aggregate([
        { $group: { _id: "$proxyCase", count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 25 },
      ]),
    ]);

    res.json({
      total,
      byRegistrationCase,
      byProxyCase,
      credentials: {
        encrypted: true,
        ready: encryptionReady(),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/selected", async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.accountIds) ? req.body.accountIds : [];
    assertObjectIds(ids, "accountIds");
    if (ids.length === 0) {
      const error = new Error("No registered account ids provided");
      error.statusCode = 400;
      throw error;
    }

    const result = await RegisteredAccount.deleteMany({ _id: { $in: ids } });
    res.json({ deleted: result.deletedCount });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
