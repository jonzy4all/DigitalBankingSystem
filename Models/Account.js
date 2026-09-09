const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema(
  {
    accountNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },

    onboarding: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Onboarding",
      required: true,
      unique: true,
    },

    accountName: {
      type: String,
      required: true,
      trim: true,
    },

    balance: {
      type: Number,
      required: true,
      default: 15000,
      min: 0,
    },

    currency: {
      type: String,
      default: "NGN",
    },

    bankCode: {
      type: String,
      default: null,
    },

    bankName: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "BLOCKED", "CLOSED"],
      default: "ACTIVE",
    },

    blockedAt: {
  type: Date,
  default: null,
},

blockReason: {
  type: String,
  default: null,
  trim: true,
},

blockedBy: {
  type: String,
  enum: ["CUSTOMER", "ADMIN", null],
  default: null,
},

    initialFunding: {
      type: Number,
      default: 15000,
    },

    initialFundingCompleted: {
      type: Boolean,
      default: true,
    },

    nibssAccountResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Account", accountSchema);