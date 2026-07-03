const mongoose = require("mongoose");

const otpEmailLogSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ["webhook", "imap"],
      required: true,
      index: true,
    },
    sender: {
      type: String,
      trim: true,
      lowercase: true,
    },
    recipients: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    approvedRecipients: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    recipientAlias: {
      type: String,
      trim: true,
      lowercase: true,
    },
    requestId: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
    },
    requesterId: {
      type: String,
      trim: true,
      index: true,
    },
    matchedSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OtpSession",
      index: true,
    },
    status: {
      type: String,
      enum: [
        "processed",
        "invalid_domain",
        "invalid_recipient",
        "no_pending_session",
        "expired_session",
        "no_otp",
        "duplicate",
        "error",
      ],
      required: true,
      index: true,
    },
    deliveryStatus: {
      type: String,
      enum: ["not_delivered", "delivered", "expired", "not_applicable"],
      default: "not_applicable",
    },
    subjectPreview: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    messageId: {
      type: String,
      trim: true,
    },
    error: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    receivedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

otpEmailLogSchema.index({ requestId: 1, receivedAt: -1 });
otpEmailLogSchema.index({ requesterId: 1, receivedAt: -1 });

module.exports = mongoose.model("OtpEmailLog", otpEmailLogSchema);
