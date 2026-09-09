const express = require("express");

const router = express.Router();

const adminController =
  require("../Controllers/adminController");

const accountController =
  require("../Controllers/accountController");

const adminMiddleware =
  require("../Middleware/adminMiddleware");

// ======================================================
// ADMIN ROUTES
//
// Every route below requires:
//
// x-admin-key: YOUR_ADMIN_API_KEY
// ======================================================

// ------------------------------------------------------
// DASHBOARD
// ------------------------------------------------------

router.get(
  "/dashboard",
  adminMiddleware,
  adminController.getDashboard
);

// ------------------------------------------------------
// CUSTOMERS
// ------------------------------------------------------

router.get(
  "/customers",
  adminMiddleware,
  adminController.getCustomers
);

// ------------------------------------------------------
// ACCOUNTS
// ------------------------------------------------------

router.get(
  "/accounts",
  adminMiddleware,
  adminController.getAccounts
);

// ------------------------------------------------------
// BLOCKED ACCOUNTS
// ------------------------------------------------------

router.get(
  "/blocked-accounts",
  adminMiddleware,
  adminController.getBlockedAccounts
);

// ------------------------------------------------------
// TRANSACTIONS
// ------------------------------------------------------

router.get(
  "/transactions",
  adminMiddleware,
  adminController.getTransactions
);

// ------------------------------------------------------
// AUDIT LOGS
// ------------------------------------------------------

router.get(
  "/audit-logs",
  adminMiddleware,
  adminController.getAuditLogs
);

// ------------------------------------------------------
// ACCOUNT UNBLOCK
// ------------------------------------------------------

router.patch(
  "/accounts/:accountNumber/block",
  adminMiddleware,
  adminController.blockAccount
);

router.patch(
  "/accounts/:accountNumber/unblock",
  adminMiddleware,
  adminController.unblockAccount
);

// ------------------------------------------------------
// ACCOUNT RECONCILIATION
//
// Recovery endpoint used when NIBSS created an account
// but local linking was incomplete.
// ------------------------------------------------------

router.post(
  "/accounts/reconcile",
  adminMiddleware,
  accountController.reconcileAccount
);

module.exports = router;