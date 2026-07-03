const express = require("express");
const mongoose = require("mongoose");
const config = require("../config");
const ApiAutomationAttempt = require("../models/ApiAutomationAttempt");
const ApiAutomationJob = require("../models/ApiAutomationJob");
const RegisteredAccount = require("../models/RegisteredAccount");
const {
  apiAutomationJobSchema,
  apiAutomationRegisteredJobSchema,
  apiAutomationSchema,
  validate,
  zyteExtractSchema,
} = require("../validation");
const {
  publicRegisteredAccount,
  registeredAccountToApiAccount,
} = require("../services/registeredAccounts");
const {
  assertRunnable,
  buildPlan,
  callOfficialConnector,
  loginFieldAliases,
  maskIdentifier,
} = require("../services/apiAutomationConnector");
const { extractHttpResponse, zyteExamples } = require("../services/zyte");
const {
  pauseApiAutomationJob,
  refreshApiAutomationJobStats,
  resumeApiAutomationJob,
  startApiAutomationJob,
  stopApiAutomationJob,
} = require("../services/apiAutomationWorker");

const router = express.Router();

function assertObjectId(id, label) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error(`${label} is invalid`);
    error.statusCode = 400;
    throw error;
  }
}

function httpError(statusCode, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function accountIdentifier(account) {
  return account.username || account.email || account.mobile || account.contact || "";
}

function maskAttempt(attempt) {
  const data = attempt.toObject ? attempt.toObject() : attempt;
  const account = { ...(data.account || {}) };
  const identifier = accountIdentifier(account);

  if (account.password) {
    account.password = "*".repeat(Math.min(String(account.password).length || 8, 12));
  }

  account.identifierPreview = maskIdentifier(identifier);
  return { ...data, account };
}

async function serializeJob(job) {
  if (!job) return null;
  await refreshApiAutomationJobStats(job._id);
  return ApiAutomationJob.findById(job._id);
}

function planPayloadForJob(payload) {
  const firstAccount = payload.accounts[0] || {};
  return {
    loginUrl: firstAccount.loginUrl || payload.loginUrl,
    targetUrl: firstAccount.targetUrl || payload.targetUrl,
    username: accountIdentifier(firstAccount),
    password: firstAccount.password,
    useZyteProxy: payload.settings?.useZyteProxy ?? false,
    requestedActions: payload.settings?.requestedActions || {},
  };
}

function jobSettings(payload) {
  const settings = payload.settings || {};
  return {
    minDelayMs: settings.minDelayMs ?? config.defaults.minDelayMs,
    maxDelayMs: settings.maxDelayMs ?? config.defaults.maxDelayMs,
    concurrency: settings.concurrency ?? config.defaults.concurrency,
    registrationCase: settings.registrationCase || "MAJIC ONE",
    useZyteProxy: settings.useZyteProxy ?? config.zyte.enabledByDefault,
    requestedActions: settings.requestedActions || {},
  };
}

async function createApiAutomationJob(payload, accounts) {
  const plan = buildPlan(planPayloadForJob({ ...payload, accounts }));

  if (plan.status === "restricted") {
    throw httpError(403, "This workflow is blocked for automated social engagement", {
      warnings: plan.warnings,
    });
  }

  const settings = jobSettings(payload);
  if (settings.maxDelayMs < settings.minDelayMs) {
    throw httpError(400, "maxDelayMs must be greater than or equal to minDelayMs");
  }

  const job = await ApiAutomationJob.create({
    loginUrl: payload.loginUrl,
    targetUrl: payload.targetUrl,
    settings,
    total: accounts.length,
    stats: {
      pending: accounts.length,
      running: 0,
      success: 0,
      failed: 0,
      cancelled: 0,
    },
  });

  await ApiAutomationAttempt.insertMany(
    accounts.map((account) => ({
      jobId: job._id,
      account,
    }))
  );

  return job;
}

router.get("/capabilities", (req, res) => {
  res.json({
    loginFieldAliases,
    zyte: {
      configured: Boolean(config.zyte.apiKey),
      enabledByDefault: config.zyte.enabledByDefault,
      proxyServer: config.zyte.proxyServer,
      extractEndpoint: config.zyte.extractEndpoint,
      examples: zyteExamples,
    },
    officialConnector: {
      configured: Boolean(
        config.apiAutomation.connectorBaseUrl && config.apiAutomation.connectorApiKey
      ),
      allowedHosts: config.apiAutomation.allowedHosts,
      runPath: config.apiAutomation.connectorRunPath,
    },
  });
});

router.get("/zyte/examples", (req, res) => {
  res.json({ examples: zyteExamples });
});

router.post("/zyte/extract", async (req, res, next) => {
  try {
    const payload = validate(zyteExtractSchema, req.body);
    const result = await extractHttpResponse(payload);
    res.json({ result });
  } catch (error) {
    next(error);
  }
});

router.post("/plan", (req, res, next) => {
  try {
    const payload = validate(apiAutomationSchema, req.body);
    res.json({ plan: buildPlan(payload) });
  } catch (error) {
    next(error);
  }
});

router.post("/run", async (req, res, next) => {
  try {
    const payload = validate(apiAutomationSchema, req.body);
    const plan = buildPlan(payload);
    assertRunnable(plan);
    const result = await callOfficialConnector(payload, plan);

    res.json({
      status: "started",
      plan,
      result,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/jobs", async (req, res, next) => {
  try {
    const payload = validate(apiAutomationJobSchema, req.body);
    const job = await createApiAutomationJob(payload, payload.accounts);

    res.status(201).json({ job: await serializeJob(job) });
  } catch (error) {
    next(error);
  }
});

router.post("/jobs/from-registered-accounts", async (req, res, next) => {
  try {
    const payload = validate(apiAutomationRegisteredJobSchema, req.body);
    const accountIds = [...new Set(payload.accountIds)];
    accountIds.forEach((id) => assertObjectId(id, "registered account id"));

    const accounts = await RegisteredAccount.find({
      _id: { $in: accountIds },
      status: { $ne: "disabled" },
    });
    const accountById = new Map(accounts.map((account) => [String(account._id), account]));
    const orderedAccounts = accountIds.map((id) => accountById.get(id)).filter(Boolean);

    if (orderedAccounts.length !== accountIds.length) {
      throw httpError(404, "One or more registered accounts were not found");
    }

    const apiAccounts = orderedAccounts.map((account) =>
      registeredAccountToApiAccount(account, {
        loginUrl: payload.loginUrl,
        targetUrl: payload.targetUrl,
        registrationCase: payload.settings?.registrationCase,
      })
    );
    const job = await createApiAutomationJob({ ...payload, accounts: apiAccounts }, apiAccounts);

    res.status(201).json({
      job: await serializeJob(job),
      accounts: orderedAccounts.map(publicRegisteredAccount),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/jobs", async (req, res, next) => {
  try {
    const jobs = await ApiAutomationJob.find().sort({ createdAt: -1 });
    res.json({ jobs });
  } catch (error) {
    next(error);
  }
});

router.delete("/jobs/selected", async (req, res, next) => {
  try {
    const jobIds = Array.isArray(req.body?.jobIds) ? req.body.jobIds : [];
    const validJobIds = jobIds.filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (validJobIds.length === 0) {
      throw httpError(400, "No valid API automation job ids provided");
    }

    const runningJobs = await ApiAutomationJob.find({
      _id: { $in: validJobIds },
      status: "running",
    }).select("_id");
    if (runningJobs.length > 0) {
      throw httpError(409, "Stop running API automation jobs before deleting them");
    }

    const [attempts, jobs] = await Promise.all([
      ApiAutomationAttempt.deleteMany({ jobId: { $in: validJobIds } }),
      ApiAutomationJob.deleteMany({ _id: { $in: validJobIds } }),
    ]);

    res.json({
      deleted: {
        attempts: attempts.deletedCount,
        jobs: jobs.deletedCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/jobs/:id", async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "API automation job id");
    const job = await serializeJob(await ApiAutomationJob.findById(req.params.id));
    if (!job) throw httpError(404, "API automation job not found");
    res.json({ job });
  } catch (error) {
    next(error);
  }
});

router.get("/jobs/:id/logs", async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "API automation job id");
    const attempts = await ApiAutomationAttempt.find({ jobId: req.params.id }).sort({
      createdAt: 1,
    });
    res.json({ attempts: attempts.map(maskAttempt) });
  } catch (error) {
    next(error);
  }
});

router.post("/jobs/:id/start", async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "API automation job id");
    res.json({ job: await startApiAutomationJob(req.params.id) });
  } catch (error) {
    next(error);
  }
});

router.post("/jobs/:id/pause", async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "API automation job id");
    res.json({ job: await pauseApiAutomationJob(req.params.id) });
  } catch (error) {
    next(error);
  }
});

router.post("/jobs/:id/resume", async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "API automation job id");
    res.json({ job: await resumeApiAutomationJob(req.params.id) });
  } catch (error) {
    next(error);
  }
});

router.post("/jobs/:id/stop", async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "API automation job id");
    res.json({ job: await stopApiAutomationJob(req.params.id) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
