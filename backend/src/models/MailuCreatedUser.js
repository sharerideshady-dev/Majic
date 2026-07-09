const mongoose = require("mongoose");

const mailuCreatedUserSchema = new mongoose.Schema(
  {
    batchId: { type: String, required: true, index: true },
    generatedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MailuGeneratedUser",
      index: true,
    },
    domain: { type: String, required: true, trim: true, lowercase: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    password: { type: String, required: true },
    displayedName: { type: String, trim: true },
    status: {
      type: String,
      enum: ["created", "skipped", "failed", "checked"],
      required: true,
      index: true,
    },
    message: { type: String, trim: true },
    dryRun: { type: Boolean, default: false, index: true },
    mailuStatusCode: { type: Number },
    source: { type: String, default: "mailu-api", trim: true },
  },
  { timestamps: true }
);

mailuCreatedUserSchema.index({ batchId: 1, email: 1, dryRun: 1 });
mailuCreatedUserSchema.index({ createdAt: -1 });

module.exports = mongoose.model("MailuCreatedUser", mailuCreatedUserSchema);
