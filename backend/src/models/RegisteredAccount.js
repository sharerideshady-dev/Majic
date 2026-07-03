const mongoose = require("mongoose");

const encryptedPasswordSchema = new mongoose.Schema(
  {
    algorithm: { type: String, required: true },
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    keyVersion: { type: String, default: "v1" },
  },
  { _id: false }
);

const registeredAccountSchema = new mongoose.Schema(
  {
    username: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    mobile: { type: String, trim: true },
    contact: { type: String, trim: true },
    identifier: { type: String, required: true, trim: true },
    identifierSearch: { type: String, required: true, trim: true, lowercase: true, index: true },
    password: { type: encryptedPasswordSchema, required: true },
    registrationCase: { type: String, default: "MAJIC ONE", trim: true, index: true },
    proxyCase: { type: String, default: "PROXY ONE", trim: true, index: true },
    proxySessionId: { type: String, trim: true },
    loginUrl: { type: String, trim: true },
    targetUrl: { type: String, trim: true },
    finalUrl: { type: String, trim: true },
    sourceUrl: { type: String, trim: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "Template", index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job", index: true },
    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attempt",
      unique: true,
      sparse: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["registered", "active", "disabled"],
      default: "registered",
      index: true,
    },
    source: { type: String, default: "registration-worker", trim: true },
    record: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    result: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true }
);

registeredAccountSchema.index({ identifierSearch: 1, sourceUrl: 1 });
registeredAccountSchema.index({ createdAt: -1 });

module.exports = mongoose.model("RegisteredAccount", registeredAccountSchema);
