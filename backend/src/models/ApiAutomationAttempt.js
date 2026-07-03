const mongoose = require("mongoose");

const apiAutomationAttemptSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ApiAutomationJob",
      required: true,
      index: true,
    },
    account: { type: mongoose.Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ["pending", "running", "success", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    error: String,
    result: {
      finalUrl: String,
      failureType: String,
      steps: [String],
      connectorResponse: mongoose.Schema.Types.Mixed,
      plan: mongoose.Schema.Types.Mixed,
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

apiAutomationAttemptSchema.index({ jobId: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model("ApiAutomationAttempt", apiAutomationAttemptSchema);
