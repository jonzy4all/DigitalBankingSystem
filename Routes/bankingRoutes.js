const express = require("express");
const router = express.Router();

const authMiddleware = require("../Middleware/authMiddleware");
const bankingController = require("../Controllers/bankingController");

const {
transferLimiter,
} = require("../Middleware/rateLimiters");

// ======================================================
// OMA BANK CUSTOMER BANKING ROUTES
//
// All routes below require the customer's OMA Bank JWT.
// Customers communicate with OMA Bank only.
// The controller decides internally when NIBSS must
// be contacted.
// ======================================================

// ------------------------------------------------------
// LIVE ACCOUNT BALANCE
//
// Calls NIBSS internally and synchronizes MongoDB.
// Customer does not provide their account number because
// it is obtained from their authenticated account.
// ------------------------------------------------------
router.get(
  "/balance",
  authMiddleware,
  bankingController.getBalance
);

// ------------------------------------------------------
// ACCOUNT STATEMENT
//
// Reads successful DEBIT/CREDIT transactions from
// MongoDB for the authenticated customer's account.
// ------------------------------------------------------
router.get(
  "/statement",
  authMiddleware,
  bankingController.getAccountStatement
);

// ------------------------------------------------------
// DOWNLOAD ACCOUNT STATEMENT AS PDF
// ------------------------------------------------------
router.get(
  "/statement/pdf",
  authMiddleware,
  bankingController.downloadAccountStatementPdf
);

// ------------------------------------------------------
// BENEFICIARY NAME ENQUIRY
//
// Calls NIBSS internally before a transfer.
// ------------------------------------------------------
router.get(
  "/name-enquiry/:accountNumber",
  authMiddleware,
  bankingController.nameEnquiry
);

// ------------------------------------------------------
// FUND TRANSFER
//
// Calls NIBSS internally.
// Includes balance validation, name enquiry,
// idempotency protection and transaction recording.
// ------------------------------------------------------
router.post(
  "/transfer",
  authMiddleware,
  transferLimiter,
  bankingController.nibssTransfer
);

// ------------------------------------------------------
// CUSTOMER TRANSACTION HISTORY
//
// Reads transaction records from our MongoDB.
// Does not need to call NIBSS.
// ------------------------------------------------------
router.get(
  "/transactions",
  authMiddleware,
  bankingController.getTransactions
);

router.get(
  "/transactions/:reference/receipt",
  authMiddleware,
  bankingController.downloadTransactionReceipt
);

router.get(
  "/transactions/:reference",
  authMiddleware,
  bankingController.getTransaction
);

router.get(
  "/transaction-status/:reference",
  authMiddleware,
  bankingController.checkNibssTransactionStatus
);

module.exports = router;