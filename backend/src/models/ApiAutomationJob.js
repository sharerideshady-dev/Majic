const mongoose = require("mongoose");

const requestedActionsSchema = new mongoose.Schema(
  {
    followPage: { type: Boolean, default: false },
    likePosts: { type: Boolean, default: false },
    sharePosts: { type: Boolean, default: false },
  },
  { _id: false }
);

const apiAutomationJobSchema = new mongoose.Schema(
  {
    loginUrl: { type: String, required: true, trim: true },
    targetUrl: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["queued", "running", "paused", "completed", "stopped", "failed"],
      default: "queued",
      index: true,
    },
    settings: {
      minDelayMs: { type: Number, required: true },
      maxDelayMs: { type: Number, required: true },
      concurrency: { type: Number, required: true },
      registrationCase: { type: String, default: "MAJIC ONE", trim: true },
      useZyteProxy: { type: Boolean, default: false },
      requestedActions: { type: requestedActionsSchema, default: () => ({}) },
    },
    total: { type: Number, default: 0 },
    stats: {
      pending: { type: Number, default: 0 },
      running: { type: Number, default: 0 },
      success: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      cancelled: { type: Number, default: 0 },
    },
    startedAt: Date,
    finishedAt: Date,
    lastError: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("ApiAutomationJob", apiAutomationJobSchema);
