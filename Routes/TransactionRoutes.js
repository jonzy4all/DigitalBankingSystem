const express = require("express");

const protect =
  require("../Middleware/AuthMiddleware");

const {
  transfer,
  getMyTransactions,
  getTransactionStatus,
} =
  require("../Controllers/TransactionController");

const router =
  express.Router();

router.post(
  "/transfer",
  protect,
  transfer
);

router.get(
  "/history",
  protect,
  getMyTransactions
);

router.get(
  "/:reference",
  protect,
  getTransactionStatus
);

module.exports = router;