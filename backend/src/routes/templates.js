const express = require("express");
const mongoose = require("mongoose");
const Attempt = require("../models/Attempt");
const Job = require("../models/Job");
const Template = require("../models/Template");
const { templateSchema, validate } = require("../validation");

const router = express.Router();

router.post("/", async (req, res, next) => {
  try {
    const payload = validate(templateSchema, req.body);
    const template = await Template.create(payload);
    res.status(201).json({ template });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const templates = await Template.find().sort({ createdAt: -1 });
    res.json({ templates });
  } catch (error) {
    next(error);
  }
});

router.delete("/", async (req, res, next) => {
  try {
    const [attempts, jobs, templates] = await Promise.all([
      Attempt.deleteMany({}),
      Job.deleteMany({}),
      Template.deleteMany({}),
    ]);

    res.json({
      deleted: {
        attempts: attempts.deletedCount,
        jobs: jobs.deletedCount,
        templates: templates.deletedCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/selected", async (req, res, next) => {
  try {
    const templateIds = Array.isArray(req.body?.templateIds) ? req.body.templateIds : [];
    const validTemplateIds = templateIds.filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (validTemplateIds.length === 0) {
      const error = new Error("No valid template ids provided");
      error.statusCode = 400;
      throw error;
    }

    const jobs = await Job.find({ templateId: { $in: validTemplateIds } }).select("_id");
    const jobIds = jobs.map((job) => job._id);

    const [attempts, deletedJobs, templates] = await Promise.all([
      Attempt.deleteMany({ $or: [{ templateId: { $in: validTemplateIds } }, { jobId: { $in: jobIds } }] }),
      Job.deleteMany({ templateId: { $in: validTemplateIds } }),
      Template.deleteMany({ _id: { $in: validTemplateIds } }),
    ]);

    res.json({
      deleted: {
        attempts: attempts.deletedCount,
        jobs: deletedJobs.deletedCount,
        templates: templates.deletedCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
