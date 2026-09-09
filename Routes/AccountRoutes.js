const express = require("express");

const router = express.Router();

const accountController =
  require("../Controllers/accountController");

// ======================================================
// CUSTOMER ACCOUNT CREATION
// ======================================================

// Creates a new account after successful KYC onboarding.
//
// If a remote NIBSS account already exists because a
// previous request partially completed, the controller
// can safely recover it.
router.post(
  "/create",
  accountController.createAccount
);

module.exports = router;