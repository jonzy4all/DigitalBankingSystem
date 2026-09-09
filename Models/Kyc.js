const mongoose = require("mongoose");

const kycSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
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
      type: Date,
      required: true,
    },

    phone: {
      type: String,
      default: null,
    },

    verificationStatus: {
      type: String,
      enum: ["PENDING", "VERIFIED", "FAILED"],
      default: "PENDING",
    },

    nibssResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    verifiedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.Kyc ||
  mongoose.model("Kyc", kycSchema);