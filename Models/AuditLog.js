const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
      index: true,
    },

    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
      index: true,
    },

    action: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["SUCCESS", "FAILED"],
      required: true,
    },

    message: {
      type: String,
      default: null,
    },

    ipAddress: {
      type: String,
      default: null,
    },

    userAgent: {
      type: String,
      default: null,
    },

    method: {
      type: String,
      default: null,
    },

    path: {
      type: String,
      default: null,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({
  customer: 1,
  createdAt: -1,
});

auditLogSchema.index({
  action: 1,
  createdAt: -1,
});

module.exports =
  mongoose.model(
    "AuditLog",
    auditLogSchema
  );