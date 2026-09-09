const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
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

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    dateOfBirth: {
      type: Date,
      required: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    kycType: {
      type: String,
      enum: ["BVN", "NIN"],
      required: true,
    },

    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      unique: true,
    },

    onboarding: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Onboarding",
      required: true,
      unique: true,
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

    lastLogin: {
      type: Date,
      default: null,
    },

    // When the customer last changed/reset their password.
// Used to invalidate old JWT tokens.
passwordChangedAt: {
  type: Date,
  default: null,
},

// Hashed password-reset token.
// We never store the real reset token.
passwordResetToken: {
  type: String,
  default: null,
  select: false,
  index: true,
},

// Reset token expiry time.
passwordResetExpires: {
  type: Date,
  default: null,
  select: false,
},

transferPin: {
  type: String,
  default: null,
  select: false,
},

failedPinAttempts: {
  type: Number,
  default: 0,
},

transferPinLockedUntil: {
  type: Date,
  default: null,
},

  },
  {
    timestamps: true,
  }
);


module.exports =
  mongoose.models.Customer ||
  mongoose.model("Customer", customerSchema);