const rateLimit = require("express-rate-limit");

// ======================================================
// LOGIN RATE LIMIT
// 5 attempts every 15 minutes per IP
// ======================================================
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    message:
      "Too many login attempts. Please try again after 15 minutes.",
  },
});

// ======================================================
// FORGOT PASSWORD RATE LIMIT
// 3 requests every 15 minutes
// ======================================================
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    message:
      "Too many password reset requests. Please try again later.",
  },
});

// ======================================================
// RESET PASSWORD RATE LIMIT
// ======================================================
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    message:
      "Too many password reset attempts. Please try again later.",
  },
});

// ======================================================
// TRANSFER RATE LIMIT
// Prevent rapid repeated transfer requests
// ======================================================
const transferLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    message:
      "Too many transfer requests. Please wait before trying again.",
  },
});

module.exports = {
  loginLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  transferLimiter,
};