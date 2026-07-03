const mongoose = require("mongoose");

const otpSessionSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    requesterId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    alias: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    localPart: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    domain: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    status: {
      type: String,
      enum: ["pending", "received", "completed", "expired"],
      default: "pending",
      index: true,
    },
    otpCode: {
      type: String,
      select: false,
    },
    deliveryStatus: {
      type: String,
      enum: ["not_delivered", "delivered", "expired"],
      default: "not_delivered",
    },
    matchedRecipient: {
      type: String,
      trim: true,
      lowercase: true,
    },
    sender: {
      type: String,
      trim: true,
      lowercase: true,
    },
    subjectPreview: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    emailLogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OtpEmailLog",
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    otpReceivedAt: Date,
    deliveredAt: Date,
  },
  { timestamps: true }
);

otpSessionSchema.index({ requesterId: 1, requestId: 1 }, { unique: true });
otpSessionSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model("OtpSession", otpSessionSchema);
