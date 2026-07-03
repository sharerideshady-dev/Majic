const mongoose = require("mongoose");

const locatorSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["text", "select"],
      default: "text",
    },
    selector: { type: String, trim: true },
    fallback: {
      placeholder: { type: String, trim: true },
      label: { type: String, trim: true },
      name: { type: String, trim: true },
    },
  },
  { _id: false }
);

const templateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    fields: {
      type: Map,
      of: locatorSchema,
      required: true,
    },
    submitButton: { type: locatorSchema, required: true },
    success: {
      urlContains: { type: String, trim: true },
      textSelector: { type: String, trim: true },
      textContains: { type: String, trim: true },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Template", templateSchema);
