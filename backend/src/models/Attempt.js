const mongoose = require("mongoose");

const attemptSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Template",
      required: true,
    },
    record: { type: mongoose.Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ["pending", "running", "success", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    error: String,
    result: {
      finalUrl: String,
      matchedBy: String,
      failureType: String,
      pageText: String,
      steps: [String],
      fieldEvidence: mongoose.Schema.Types.Mixed,
      beforeSubmitSnapshot: mongoose.Schema.Types.Mixed,
      afterFailureSnapshot: mongoose.Schema.Types.Mixed,
      lastScreenshot: {
        contentType: String,
        data: String,
        updatedAt: Date,
        error: String,
      },
      proxySession: {
        provider: String,
        sessionId: String,
        enabled: Boolean,
      },
    },
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true }
);

attemptSchema.index({ jobId: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model("Attempt", attemptSchema);
