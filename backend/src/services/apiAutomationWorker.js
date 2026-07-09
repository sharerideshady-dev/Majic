




const mongoose = require("mongoose");
const ApiAutomationAttempt = require("../models/ApiAutomationAttempt");
const ApiAutomationJob = require("../models/ApiAutomationJob");
const {
  assertRunnable,
  buildPlan,
  callOfficialConnector,
} = require("./apiAutomationConnector");

const activeApiAutomationJobs = new Set();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function randomDelay(minDelayMs, maxDelayMs) {
  if (maxDelayMs <= minDelayMs) return minDelayMs;
  return Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
}

function accountIdentifier(account) {
  return account.username || account.email || account.mobile || account.contact || "";
}

async function recordStep(attempt, message) {
  const timestamp = new Date().toISOString();
  attempt.result = attempt.result || {};
  attempt.result.steps = [...(attempt.result.steps || []), `${timestamp} ${message}`].slice(-75);
  console.log(`[api-attempt:${attempt._id}] ${message}`);
}

function payloadForAttempt(job, attempt) {
  return {
    loginUrl: attempt.account.loginUrl || job.loginUrl,
    targetUrl: attempt.account.targetUrl || job.targetUrl,
    username: accountIdentifier(attempt.account),
    password: attempt.account.password,
    useZyteProxy: job.settings.useZyteProxy,
    requestedActions: job.settings.requestedActions || {},
  };
}

async function runApiAutomationAttempt(attempt, job) {
  try {
    const payload = payloadForAttempt(job, attempt);
    const registrationCase =
      attempt.account.registrationCase || job.settings.registrationCase || "MAJIC ONE";
    const proxyCase = attempt.account.proxyCase || "PROXY ONE";
    const proxySessionId = attempt.account.proxySessionId || `${proxyCase}-${attempt._id}`;
    const plan = buildPlan(payload);

    attempt.result = attempt.result || {};
    attempt.result.plan = {
      status: plan.status,
      urls: plan.urls,
      zyte: plan.zyte,
      officialConnector: plan.officialConnector,
      requestedActions: plan.requestedActions,
      warnings: plan.warnings,
    };

    if (plan.zyte.enabled) {
      attempt.result.proxySession = {
        provider: "zyte",
        sessionId: proxySessionId,
        enabled: true,
      };
    } else {
      delete attempt.result.proxySession;
    }

    await recordStep(
      attempt,
      `prepare runtime registrationCase=${registrationCase} proxyCase=${proxyCase}`
    );
    await recordStep(attempt, `login host=${plan.urls.loginHost} target host=${plan.urls.targetHost}`);
    assertRunnable(plan);

    await recordStep(attempt, "send workflow to official Majic API connector");
    const connectorResponse = await callOfficialConnector(payload, plan, {
      registrationCase,
      proxyCase,
      proxySessionId,
      accountMeta: {
        attemptId: String(attempt._id),
        jobId: String(job._id),
        proxyCase,
      },
    });

    attempt.status = "success";
    attempt.error = undefined;
    attempt.result.connectorResponse = connectorResponse;
    attempt.result.finalUrl = connectorResponse.finalUrl || payload.targetUrl;
    await recordStep(attempt, "connector completed workflow");
  } catch (error) {
    attempt.status = "failed";
    attempt.error = error.message || "API automation failed";
    attempt.result = attempt.result || {};
    attempt.result.failureType = error.statusCode ? `connector_${error.statusCode}` : "api_automation_failed";
    await recordStep(attempt, `failed: ${attempt.error}`);
    if (error.details) {
      attempt.result.connectorResponse = { details: error.details };
    }
  } finally {
    attempt.finishedAt = new Date();
    await attempt.save();
  }
}

async function claimApiAutomationAttempt(jobId) {
  return ApiAutomationAttempt.findOneAndUpdate(
    { jobId, status: "pending" },
    { $set: { status: "running", startedAt: new Date(), error: undefined } },
    { new: true, sort: { createdAt: 1 } }
  );
}

async function refreshApiAutomationJobStats(jobId) {
  const normalizedJobId =
    typeof jobId === "string" ? new mongoose.Types.ObjectId(jobId) : jobId;
  const counts = await ApiAutomationAttempt.aggregate([
    { $match: { jobId: normalizedJobId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const stats = {
    pending: 0,
    running: 0,
    success: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const item of counts) {
    stats[item._id] = item.count;
  }

  const finalStatuses = stats.success + stats.failed + stats.cancelled;
  const total = Object.values(stats).reduce((sum, value) => sum + value, 0);
  const update = { stats };
  const currentJob = await ApiAutomationJob.findById(normalizedJobId).select("status");

  if (
    currentJob &&
    !["paused", "stopped", "failed"].includes(currentJob.status) &&
    finalStatuses > 0 &&
    finalStatuses === total
  ) {
    update.status = "completed";
    update.finishedAt = new Date();
    activeApiAutomationJobs.delete(String(jobId));
  }

  return ApiAutomationJob.findByIdAndUpdate(normalizedJobId, update, { new: true });
}

async function apiAutomationWorkerLane(jobId) {
  while (activeApiAutomationJobs.has(String(jobId))) {
    const job = await ApiAutomationJob.findById(jobId);

    if (!job || job.status !== "running") {
      activeApiAutomationJobs.delete(String(jobId));
      return;
    }

    const attempt = await claimApiAutomationAttempt(jobId);
    if (!attempt) {
      await refreshApiAutomationJobStats(jobId);
      activeApiAutomationJobs.delete(String(jobId));
      return;
    }

    await refreshApiAutomationJobStats(jobId);
    await runApiAutomationAttempt(attempt, job);
    await refreshApiAutomationJobStats(jobId);

    const delayMs = randomDelay(job.settings.minDelayMs, job.settings.maxDelayMs);
    if (delayMs > 0 && activeApiAutomationJobs.has(String(jobId))) {
      await sleep(delayMs);
    }
  }
}

async function startApiAutomationJob(jobId) {
  const job = await ApiAutomationJob.findById(jobId);
  if (!job) {
    const error = new Error("API automation job not found");
    error.statusCode = 404;
    throw error;
  }

  if (job.status === "stopped" || job.status === "completed") {
    const error = new Error(`Cannot start a ${job.status} API automation job`);
    error.statusCode = 409;
    throw error;
  }

  await ApiAutomationJob.findByIdAndUpdate(jobId, {
    status: "running",
    startedAt: job.startedAt || new Date(),
    finishedAt: undefined,
    lastError: undefined,
  });

  if (!activeApiAutomationJobs.has(String(jobId))) {
    activeApiAutomationJobs.add(String(jobId));

    for (let index = 0; index < job.settings.concurrency; index += 1) {
      apiAutomationWorkerLane(jobId).catch(async (error) => {
        activeApiAutomationJobs.delete(String(jobId));
        await ApiAutomationJob.findByIdAndUpdate(jobId, {
          status: "failed",
          lastError: error.message || "API automation worker failed",
          finishedAt: new Date(),
        });
      });
    }
  }

  return ApiAutomationJob.findById(jobId);
}

async function pauseApiAutomationJob(jobId) {
  activeApiAutomationJobs.delete(String(jobId));
  const job = await ApiAutomationJob.findByIdAndUpdate(
    jobId,
    { status: "paused" },
    { new: true }
  );

  if (!job) {
    const error = new Error("API automation job not found");
    error.statusCode = 404;
    throw error;
  }

  return job;
}

async function resumeApiAutomationJob(jobId) {
  return startApiAutomationJob(jobId);
}

async function stopApiAutomationJob(jobId) {
  activeApiAutomationJobs.delete(String(jobId));

  const job = await ApiAutomationJob.findByIdAndUpdate(
    jobId,
    { status: "stopped", finishedAt: new Date() },
    { new: true }
  );

  if (!job) {
    const error = new Error("API automation job not found");
    error.statusCode = 404;
    throw error;
  }

  await ApiAutomationAttempt.updateMany(
    { jobId, status: "pending" },
    { $set: { status: "cancelled", finishedAt: new Date(), error: "Job stopped" } }
  );
  await refreshApiAutomationJobStats(jobId);

  return ApiAutomationJob.findById(jobId);
}

module.exports = {
  pauseApiAutomationJob,
  refreshApiAutomationJobStats,
  resumeApiAutomationJob,
  startApiAutomationJob,
  stopApiAutomationJob,
};
