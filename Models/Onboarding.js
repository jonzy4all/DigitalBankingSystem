const mongoose = require("mongoose");

const onboardingSchema = new mongoose.Schema(
  {
    onboardingId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    kycType: {
      type: String,
      enum: ["BVN", "NIN"],
      required: true,
    },

    kycId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    dateOfBirth: {
      type: String,
      required: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    validationStatus: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
    },

    onboardingStatus: {
      type: String,
      enum: ["PENDING", "VALIDATED", "SUCCESS", "FAILED"],
      default: "PENDING",
    },

    // Tracks the local/remote account-creation lifecycle. REMOTE_CREATED is
    // important: it lets us recover if NIBSS creates the account but the
    // local MongoDB write fails afterwards.
    accountCreationStatus: {
      type: String,
      enum: [
        "NOT_STARTED",
        "IN_PROGRESS",
        "REMOTE_RESPONSE_RECEIVED",
        "REMOTE_CREATED",
        "SUCCESS",
        "FAILED",
      ],
      default: "NOT_STARTED",
    },

    nibssOnboardingResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    nibssValidationResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    nibssAccountResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    accountCreationError: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    accountCreationAttemptedAt: {
      type: Date,
      default: null,
    },

    accountNumber: {
      type: String,
      default: null,
      index: true,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Onboarding", onboardingSchema);
