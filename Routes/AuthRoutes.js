const express = require("express");

const router = express.Router();

const authController =
  require("../Controllers/authController");

const authMiddleware =
  require("../Middleware/authMiddleware");

  const {
  loginLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
} = require("../Middleware/rateLimiters");

// Register
router.post(
  "/register",
  authController.register
);

// Login
router.post(
  "/login",
  loginLimiter,
  authController.login
);

// Protected customer profile
router.get(
  "/me",
  authMiddleware,
  authController.getMe
);

// Change password
// Customer must be logged in
router.post(
  "/change-password",
  authMiddleware,
  authController.changePassword
);

// Forgot password
// No login token required
router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  authController.forgotPassword
);

// Reset password
// No login token required.
// Reset token is supplied in URL.
router.post(
  "/reset-password/:token",
  resetPasswordLimiter,
  authController.resetPassword
);

router.get(
  "/security-activity",
  authMiddleware,
  authController.getSecurityActivity
);

// Create transfer PIN
router.post(
  "/transfer-pin",
  authMiddleware,
  authController.setTransferPin
);

// Change transfer PIN
router.put(
  "/transfer-pin",
  authMiddleware,
  authController.changeTransferPin
);
router.post(
  "/block-account",
  authMiddleware,
  authController.blockAccount
);

module.exports = router;