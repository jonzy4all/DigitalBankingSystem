const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      index: true,
    },

    nibssReference: {
      type: String,
      default: null,
      index: true,
    },

    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "INITIAL_FUNDING",
        "TRANSFER",
        "CREDIT",
        "DEBIT",
      ],
      required: true,
    },

    direction: {
      type: String,
      enum: ["CREDIT", "DEBIT"],
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },

    balanceBefore: {
      type: Number,
      required: true,
      min: 0,
    },

    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },

    senderAccount: {
      type: String,
      default: null,
    },

    receiverAccount: {
      type: String,
      default: null,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "SUCCESS",
    },

    failureReason: {
      type: String,
      default: null,
    },

    idempotencyKey: {
      type: String,
      default: null,
      trim: true,
},
  },
  {
    timestamps: true,
  }
);

transactionSchema.index(
  {
    customer: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: "string" },
    },
    name: "customer_idempotency_unique",
  }
);

module.exports = mongoose.model(
  "Transaction",
  transactionSchema
);