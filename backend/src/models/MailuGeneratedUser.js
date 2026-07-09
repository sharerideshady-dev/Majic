const mongoose = require("mongoose");

const mailuGeneratedUserSchema = new mongoose.Schema(
  {
    batchId: { type: String, required: true, index: true },
    domain: { type: String, required: true, trim: true, lowercase: true, index: true },
    name: { type: String, trim: true },
    firstName: { type: String, trim: true },
    surname: { type: String, trim: true },
    day: { type: Number, min: 1, max: 31 },
    month: { type: Number, min: 1, max: 12 },
    year: { type: Number, min: 1900, max: 2100 },
    gender: { type: String, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    password: { type: String, required: true },
    source: { type: String, default: "mailu-generator", trim: true },
  },
  { timestamps: true }
);

mailuGeneratedUserSchema.index({ batchId: 1, email: 1 }, { unique: true });
mailuGeneratedUserSchema.index({ createdAt: -1 });

module.exports = mongoose.model("MailuGeneratedUser", mailuGeneratedUserSchema);
