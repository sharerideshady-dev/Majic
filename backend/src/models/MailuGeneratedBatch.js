const mongoose = require("mongoose");

const mailuGeneratedBatchSchema = new mongoose.Schema(
  {
    batchId: { type: String, required: true, unique: true, index: true },
    domain: { type: String, required: true, trim: true, lowercase: true, index: true },
    count: { type: Number, required: true, min: 0 },
    source: { type: String, default: "mailu-generator", trim: true },
    createdBy: { type: String, default: "local-ui", trim: true },
    latestMailuSummary: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true }
);

mailuGeneratedBatchSchema.index({ createdAt: -1 });

module.exports = mongoose.model("MailuGeneratedBatch", mailuGeneratedBatchSchema);
