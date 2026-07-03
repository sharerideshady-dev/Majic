const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Template",
      required: true,
    },
    status: {
      type: String,
      enum: ["queued", "running", "paused", "completed", "stopped", "failed"],
      default: "queued",
      index: true,
    },
    settings: {
      minDelayMs: { type: Number, required: true },
      maxDelayMs: { type: Number, required: true },
      registrationCase: { type: String, default: "MAJIC ONE", trim: true },
      concurrency: { type: Number, required: true },
      headless: { type: Boolean, default: true },
      showBrowser: { type: Boolean, default: false },
      livePreview: { type: Boolean, default: true },
      keepBrowserOpenOnError: { type: Boolean, default: false },
      slowMoMs: { type: Number, default: 0 },
      useZyteProxy: { type: Boolean, default: false },
      fieldOrder: [{ type: String, trim: true }],
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

module.exports = mongoose.model("Job", jobSchema);
