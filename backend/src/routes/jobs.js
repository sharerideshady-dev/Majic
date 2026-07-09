const express = require("express");
const mongoose = require("mongoose");
const Attempt = require("../models/Attempt");
const Job = require("../models/Job");
const Template = require("../models/Template");
const config = require("../config");
const { jobSchema, validate } = require("../validation");
const {
  pauseJob,
  refreshJobStats,
  resumeJob,
  startJob,
  stopJob,
  getAttemptScreenshot,
} = require("../services/worker");

const router = express.Router();

function assertObjectId(id, label) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error(`${label} is invalid`);
    error.statusCode = 400;
    throw error;
  }
}

async function serializeJob(job) {
  if (!job) return null;
  await refreshJobStats(job._id);
  return Job.findById(job._id).populate("templateId", "name url");
}

function canLaunchHeadedBrowser() {
  return process.platform !== "linux";
}

router.post("/", async (req, res, next) => {
  try {
    const payload = validate(jobSchema, req.body);
    assertObjectId(payload.templateId, "templateId");

    const template = await Template.findById(payload.templateId);
    if (!template) {
      const error = new Error("Template not found");
      error.statusCode = 404;
      throw error;
    }

    const requestedShowBrowser = payload.settings.showBrowser ?? payload.settings.headless === false;
    const showBrowser = requestedShowBrowser && canLaunchHeadedBrowser();
    const headless = showBrowser ? false : true;
    const settings = {
      minDelayMs: payload.settings.minDelayMs ?? config.defaults.minDelayMs,
      maxDelayMs: payload.settings.maxDelayMs ?? config.defaults.maxDelayMs,
      registrationCase: payload.settings.registrationCase ?? "MAJIC ONE",
      concurrency: payload.settings.concurrency ?? config.defaults.concurrency,
      headless,
      showBrowser,
      livePreview: payload.settings.livePreview ?? true,
      keepBrowserOpenOnError: payload.settings.keepBrowserOpenOnError ?? false,
      slowMoMs: showBrowser ? payload.settings.slowMoMs ?? 500 : 0,
      useZyteProxy: payload.settings.useZyteProxy ?? config.zyte.enabledByDefault,
      fieldOrder: payload.settings.fieldOrder ?? [
        "firstName",
        "surname",
        "username",
        "birthDay",
        "birthMonth",
        "birthYear",
        "gender",
        "contact",
        "password",
      ],
    };

    if (settings.maxDelayMs < settings.minDelayMs) {
      const error = new Error("maxDelayMs must be greater than or equal to minDelayMs");
      error.statusCode = 400;
      throw error;
    }

    const job = await Job.create({
      templateId: template._id,
      settings,
      total: payload.records.length,
      stats: {
        pending: payload.records.length,
        running: 0,
        success: 0,
        failed: 0,
        cancelled: 0,
      },
    });

    await Attempt.insertMany(
      payload.records.map((record) => ({
        jobId: job._id,
        templateId: template._id,
        record,
      }))
    );

    res.status(201).json({ job: await serializeJob(job) });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const jobs = await Job.find()
      .populate("templateId", "name url")
      .sort({ createdAt: -1 });
    res.json({ jobs });
  } catch (error) {
    next(error);
  }
});

router.get("/attempts/:attemptId/screenshot", async (req, res, next) => {
  try {
    assertObjectId(req.params.attemptId, "attempt id");
    const attempt = await Attempt.findById(req.params.attemptId).select("_id result.lastScreenshot");
    if (!attempt) {
      const error = new Error("Attempt not found");
      error.statusCode = 404;
      throw error;
    }

    let screenshot = getAttemptScreenshot(req.params.attemptId);
    if (!screenshot && attempt.result?.lastScreenshot?.data) {
      screenshot = {
        contentType: attempt.result.lastScreenshot.contentType || "image/jpeg",
        buffer: Buffer.from(attempt.result.lastScreenshot.data, "base64"),
        updatedAt: new Date(attempt.result.lastScreenshot.updatedAt || attempt.updatedAt).getTime(),
      };
    }
    if (!screenshot) {
      const error = new Error("Screenshot not available yet");
      error.statusCode = 404;
      throw error;
    }

    res.setHeader("Content-Type", screenshot.contentType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Screenshot-Updated-At", new Date(screenshot.updatedAt).toISOString());
    res.send(screenshot.buffer);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/live-screenshot", async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "job id");
    const attempt =
      (await Attempt.findOne({ jobId: req.params.id, status: "running" })
        .sort({ updatedAt: -1 })
        .select("_id result.lastScreenshot updatedAt")) ||
      (await Attempt.findOne({
        jobId: req.params.id,
        status: { $in: ["failed", "success"] },
      })
        .sort({ updatedAt: -1 })
        .select("_id result.lastScreenshot updatedAt"));

    if (!attempt) {
      const error = new Error("No attempt screenshot available yet");
      error.statusCode = 404;
      throw error;
    }

    let screenshot = getAttemptScreenshot(attempt._id);
    if (!screenshot && attempt.result?.lastScreenshot?.data) {
      screenshot = {
        contentType: attempt.result.lastScreenshot.contentType || "image/jpeg",
        buffer: Buffer.from(attempt.result.lastScreenshot.data, "base64"),
        updatedAt: new Date(attempt.result.lastScreenshot.updatedAt || attempt.updatedAt).getTime(),
      };
    }
    if (!screenshot) {
      const error = new Error("Screenshot not available yet");
      error.statusCode = 404;
      throw error;
    }

    res.setHeader("Content-Type", screenshot.contentType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Attempt-Id", String(attempt._id));
    res.setHeader("X-Screenshot-Updated-At", new Date(screenshot.updatedAt).toISOString());
    res.send(screenshot.buffer);
  } catch (error) {
    next(error);
  }
});

router.delete("/selected", async (req, res, next) => {
  try {
    const jobIds = Array.isArray(req.body?.jobIds) ? req.body.jobIds : [];
    const validJobIds = jobIds.filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (validJobIds.length === 0) {
      const error = new Error("No valid job ids provided");
      error.statusCode = 400;
      throw error;
    }

    const runningJobs = await Job.find({
      _id: { $in: validJobIds },
      status: "running",
    }).select("_id");
    if (runningJobs.length > 0) {
      const error = new Error("Stop running jobs before deleting them");
      error.statusCode = 409;
      throw error;
    }

    const [attempts, jobs] = await Promise.all([
      Attempt.deleteMany({ jobId: { $in: validJobIds } }),
      Job.deleteMany({ _id: { $in: validJobIds } }),
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

router.get("/:id", async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "job id");
    const job = await serializeJob(await Job.findById(req.params.id));

    if (!job) {
      const error = new Error("Job not found");
      error.statusCode = 404;
      throw error;
    }

    res.json({ job });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/logs", async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "job id");
    const attempts = await Attempt.find({ jobId: req.params.id }).sort({ createdAt: 1 });
    res.json({ attempts });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/start", async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "job id");
    res.json({ job: await startJob(req.params.id) });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/pause", async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "job id");
    res.json({ job: await pauseJob(req.params.id) });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/resume", async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "job id");
    res.json({ job: await resumeJob(req.params.id) });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/stop", async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "job id");
    res.json({ job: await stopJob(req.params.id) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
