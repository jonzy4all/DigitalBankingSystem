const Account = require("../Models/Account");
const Transaction = require("../Models/Transaction");
const nibssService = require("../Services/nibssService");
const generateTransactionReference = require("../utils/transactionReference");
const PDFDocument = require("pdfkit");
const bcrypt = require("bcryptjs");
const Customer = require("../Models/Customer");

const {
  logAudit,
} = require("../utils/auditLogger");

const findNestedValue = (raw, key, maxDepth = 5) => {
  const seen = new Set();
  const queue = [{ value: raw, depth: 0 }];

  while (queue.length) {
    const { value, depth } = queue.shift();

    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);

    if (value[key] !== undefined && value[key] !== null) {
      return value[key];
    }

    if (depth >= maxDepth) continue;

    for (const child of Object.values(value)) {
      if (child && typeof child === "object") {
        queue.push({ value: child, depth: depth + 1 });
      }
    }
  }

  return null;
};

const syncAccountBalanceFromNibss = async (account) => {
  const response = await nibssService.getBalance(account.accountNumber);
  const raw = response.data;
  const balanceValue = findNestedValue(raw, "balance");
  const numericBalance = Number(balanceValue);

  if (!Number.isFinite(numericBalance) || numericBalance < 0) {
    throw new Error("NIBSS returned an invalid balance");
  }

  account.balance = numericBalance;
  await account.save();

  return { balance: numericBalance, raw };
};

// -----------------------------------------------------
// CUSTOMER-FACING LIVE BALANCE
// -----------------------------------------------------
exports.getBalance = async (req, res) => {
  try {
    const account = await Account.findOne({
      _id: req.user.account,
      customer: req.user._id,
      status: "ACTIVE",
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Account not found or inactive",
      });
    }

    const live = await syncAccountBalanceFromNibss(account);

    return res.status(200).json({
      success: true,
      message: "Balance retrieved successfully",
      data: {
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        balance: live.balance,
        currency: account.currency,
        status: account.status,
        source: "NIBSS",
      },
    });
  } catch (error) {
    console.error("Balance error:", error.response?.data || error.message);

    return res.status(502).json({
      success: false,
      message: "Unable to retrieve live balance",
      error: error.response?.data || error.message,
    });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    // Use the bank account instead of customer ID.
    // This means transactions created before customer
    // registration will still appear once the customer
    // is linked to the account.
    const transactions =
  await Transaction.find({
    account:
      req.user.account,
  })
    .select(
      "-__v -idempotencyKey -failureReason"
    )
    .sort({
      createdAt: -1,
    })
    .limit(100);

    return res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions,
    });
  } catch (error) {
    console.error(
      "Transaction history error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve transaction history",
    });
  }
};

exports.getTransaction = async (req, res) => {
  try {
    const { reference } = req.params;

    const transaction =
  await Transaction.findOne({
    reference,
    account:
      req.user.account,
  }).select(
    "-__v -idempotencyKey -failureReason"
  );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    console.error(
      "Transaction lookup error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve transaction",
    });
  }
};


// -----------------------------------------------------
// NAME ENQUIRY
// -----------------------------------------------------
exports.nameEnquiry = async (req, res) => {
  try {
    const { accountNumber } = req.params;

    if (!/^\d{10}$/.test(accountNumber || "")) {
      return res.status(400).json({
        success: false,
        message: "Account number must be exactly 10 digits",
      });
    }

    const response = await nibssService.nameEnquiry(accountNumber);

    return res.status(200).json({
      success: true,
      message: "Name enquiry successful",
      data: response.data,
    });
  } catch (error) {
    console.error("Name enquiry error:", error.response?.data || error.message);

    return res.status(error.response?.status || 502).json({
      success: false,
      message: "Unable to complete name enquiry",
      error: error.response?.data || error.message,
    });
  }
};

// -----------------------------------------------------
// CUSTOMER-FACING NIBSS TRANSFER
// -----------------------------------------------------
exports.nibssTransfer = async (req, res) => {
  let transaction = null;

  try {
    const {
  to,
  amount,
  description,
  pin,
  idempotencyKey: bodyIdempotencyKey,
} = req.body;

// ======================================================
// TRANSFER PIN SECURITY
// ======================================================

if (!pin) {
  return res.status(400).json({
    success: false,
    message:
      "Transfer PIN is required",
  });
}

if (!/^\d{4}$/.test(String(pin))) {
  return res.status(400).json({
    success: false,
    message:
      "Transfer PIN must be exactly 4 digits",
  });
}

const transferCustomer =
  await Customer.findById(
    req.user._id
  ).select("+transferPin");

if (!transferCustomer) {
  return res.status(404).json({
    success: false,
    message: "Customer not found",
  });
}

if (!transferCustomer.transferPin) {
  return res.status(403).json({
    success: false,
    message:
      "Please create a transfer PIN before making transfers",
  });
}

// --------------------------------------------------
// Check PIN lock
// --------------------------------------------------
if (
  transferCustomer.transferPinLockedUntil &&
  transferCustomer.transferPinLockedUntil >
    new Date()
) {
  return res.status(423).json({
    success: false,
    message:
      "Transfer PIN is temporarily locked because of too many incorrect attempts",
  });
}

// --------------------------------------------------
// Verify PIN
// --------------------------------------------------
const pinCorrect =
  await bcrypt.compare(
    String(pin),
    transferCustomer.transferPin
  );

if (!pinCorrect) {
  transferCustomer.failedPinAttempts =
    (transferCustomer.failedPinAttempts || 0) +
    1;

  // Lock after 5 wrong attempts
  if (
    transferCustomer.failedPinAttempts >= 5
  ) {
    transferCustomer.transferPinLockedUntil =
      new Date(
        Date.now() +
          15 * 60 * 1000
      );

    transferCustomer.failedPinAttempts = 0;
  }

  await transferCustomer.save();

  await logAudit({
    req,
    customer:
      transferCustomer._id,
    account:
      transferCustomer.account,
    action:
      "TRANSFER_PIN_FAILED",
    status:
      "FAILED",
    message:
      "Incorrect transfer PIN",
  });

  return res.status(401).json({
    success: false,
    message:
      "Incorrect transfer PIN",
  });
}

// --------------------------------------------------
// Correct PIN - reset failed attempts
// --------------------------------------------------
if (
  transferCustomer.failedPinAttempts > 0 ||
  transferCustomer.transferPinLockedUntil
) {
  transferCustomer.failedPinAttempts = 0;
  transferCustomer.transferPinLockedUntil =
    null;

  await transferCustomer.save();
}

    // --------------------------------------------------
    // 1. Validate beneficiary account number
    // --------------------------------------------------
    const receiverAccountNumber = String(to || "").trim();

    if (!receiverAccountNumber) {
      return res.status(400).json({
        success: false,
        message: "Receiver account number is required",
      });
    }

    if (!/^\d{10}$/.test(receiverAccountNumber)) {
      return res.status(400).json({
        success: false,
        message: "Receiver account number must be exactly 10 digits",
      });
    }

    // --------------------------------------------------
    // 2. Validate amount
    // --------------------------------------------------
    if (
      amount === undefined ||
      amount === null ||
      String(amount).trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Transfer amount is required",
      });
    }

    const transferAmount = Number(amount);

    if (!Number.isFinite(transferAmount) || transferAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Transfer amount must be greater than zero",
      });
    }

    

    // Only allow maximum of 2 decimal places.
    const roundedAmount =
      Math.round((transferAmount + Number.EPSILON) * 100) / 100;

    if (Math.abs(roundedAmount - transferAmount) > 0.000001) {
      return res.status(400).json({
        success: false,
        message: "Transfer amount cannot have more than 2 decimal places",
      });
    }

    // ======================================================
// TRANSFER LIMIT SECURITY
// ======================================================

const singleTransferLimit =
  Number(
    process.env.SINGLE_TRANSFER_LIMIT
  ) || 500000;

const dailyTransferLimit =
  Number(
    process.env.DAILY_TRANSFER_LIMIT
  ) || 1000000;

// --------------------------------------------------
// SINGLE TRANSFER LIMIT
// --------------------------------------------------
if (
  roundedAmount >
  singleTransferLimit
) {
  return res.status(400).json({
    success: false,

    message:
      "Transfer amount exceeds your single transfer limit",

    data: {
      requestedAmount:
        roundedAmount,

      singleTransferLimit,
    },
  });
}

    // --------------------------------------------------
    // 3. Validate description
    // --------------------------------------------------
    let transferDescription = "";

    if (description !== undefined && description !== null) {
      if (typeof description !== "string") {
        return res.status(400).json({
          success: false,
          message: "Description must be a string",
        });
      }

      transferDescription = description.trim();

      if (transferDescription.length > 120) {
        return res.status(400).json({
          success: false,
          message: "Description cannot exceed 120 characters",
        });
      }
    }

    // --------------------------------------------------
    // 4. Require an idempotency key
    //
    // It can be supplied either as:
    //
    // Header:
    // Idempotency-Key: transfer-001
    //
    // OR inside the JSON body.
    // --------------------------------------------------
    const idempotencyKey = String(
      req.get("Idempotency-Key") ||
        bodyIdempotencyKey ||
        ""
    ).trim();

    if (!idempotencyKey) {
      return res.status(400).json({
        success: false,
        message: "Idempotency-Key is required for transfers",
      });
    }

    if (
      idempotencyKey.length < 10 ||
      idempotencyKey.length > 100
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Idempotency-Key must be between 10 and 100 characters",
      });
    }

    if (!/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
      return res.status(400).json({
        success: false,
        message:
          "Idempotency-Key contains invalid characters",
      });
    }

    // --------------------------------------------------
    // 5. Check whether this transfer was already sent
    // --------------------------------------------------
    const existingTransaction =
      await Transaction.findOne({
        customer: req.user._id,
        idempotencyKey,
      });

    if (existingTransaction) {
  // --------------------------------------------------
  // The same Idempotency-Key cannot be reused for
  // a different transfer.
  // --------------------------------------------------

  if (
    existingTransaction.receiverAccount !==
      receiverAccountNumber ||
    Number(existingTransaction.amount) !==
      roundedAmount
  ) {
    return res.status(409).json({
      success: false,
      message:
        "This Idempotency-Key has already been used for a different transfer",
    });
  }

  // --------------------------------------------------
  // Audit duplicate request
  // --------------------------------------------------

  await logAudit({
    req,

    customer:
      req.user._id,

    account:
      req.user.account,

    action:
      "TRANSFER_DUPLICATE",

    status:
      "SUCCESS",

    message:
      "Duplicate transfer request detected",

    metadata: {
      reference:
        existingTransaction.reference,

      nibssReference:
        existingTransaction.nibssReference,

      from:
        existingTransaction.senderAccount,

      to:
        existingTransaction.receiverAccount,

      amount:
        existingTransaction.amount,

      transactionStatus:
        existingTransaction.status,

      idempotencyKey:
        existingTransaction.idempotencyKey,
    },
  });

  // --------------------------------------------------
  // Return original transaction.
  //
  // IMPORTANT:
  // NIBSS is NOT called again.
  // --------------------------------------------------

  return res.status(200).json({
    success: true,

    message:
      "Duplicate transfer request detected. The original transaction was returned and no new transfer was sent.",

    duplicate: true,

    data: {
      reference:
        existingTransaction.reference,

      transactionId:
        existingTransaction.nibssReference,

      from:
        existingTransaction.senderAccount,

      to:
        existingTransaction.receiverAccount,

      amount:
        existingTransaction.amount,

      status:
        existingTransaction.status,

      balanceBefore:
        existingTransaction.balanceBefore,

      balanceAfter:
        existingTransaction.balanceAfter,

      idempotencyKey:
        existingTransaction.idempotencyKey,
    },
  });
}

    // --------------------------------------------------
    // 6. Find authenticated customer's sender account
    // --------------------------------------------------
    const senderAccount = await Account.findOne({
      _id: req.user.account,
      customer: req.user._id,
      status: "ACTIVE",
    });

    if (!senderAccount) {
      return res.status(404).json({
        success: false,
        message: "Sender account not found or inactive",
      });
    }

    // --------------------------------------------------
    // 7. Prevent transfer to own account
    // --------------------------------------------------
    if (
      senderAccount.accountNumber ===
      receiverAccountNumber
    ) {
      return res.status(400).json({
        success: false,
        message: "You cannot transfer to your own account",
      });
    }

    // --------------------------------------------------
    // 8. Get LIVE NIBSS sender balance
    // --------------------------------------------------
    const senderLive =
      await syncAccountBalanceFromNibss(senderAccount);

    if (senderLive.balance < roundedAmount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient funds",

        data: {
          availableBalance: senderLive.balance,
          requestedAmount: roundedAmount,
        },
      });
    }

    // ======================================================
// DAILY TRANSFER LIMIT
// ======================================================

// Start of today
const startOfToday =
  new Date();

startOfToday.setHours(
  0,
  0,
  0,
  0
);

// End of today
const endOfToday =
  new Date();

endOfToday.setHours(
  23,
  59,
  59,
  999
);

// --------------------------------------------------
// Sum today's successful outgoing transfers
// --------------------------------------------------
const dailyTransferResult =
  await Transaction.aggregate([
    {
      $match: {
        account:
          senderAccount._id,

        direction:
          "DEBIT",

        type:
          "TRANSFER",

        status:
          "SUCCESS",

        createdAt: {
          $gte:
            startOfToday,

          $lte:
            endOfToday,
        },
      },
    },

    {
      $group: {
        _id: null,

        totalAmount: {
          $sum: "$amount",
        },
      },
    },
  ]);

const amountTransferredToday =
  dailyTransferResult.length > 0
    ? Number(
        dailyTransferResult[0]
          .totalAmount
      )
    : 0;

const projectedDailyTotal =
  amountTransferredToday +
  roundedAmount;

// --------------------------------------------------
// Reject if this transaction would exceed
// customer's daily limit
// --------------------------------------------------
if (
  projectedDailyTotal >
  dailyTransferLimit
) {
  return res.status(400).json({
    success: false,

    message:
      "Transfer would exceed your daily transfer limit",

    data: {
      dailyTransferLimit,

      amountTransferredToday,

      requestedAmount:
        roundedAmount,

      remainingDailyLimit:
        Math.max(
          0,
          dailyTransferLimit -
            amountTransferredToday
        ),
    },
  });
}

    // --------------------------------------------------
    // 9. Confirm beneficiary with NIBSS
    // --------------------------------------------------
    const nameEnquiry =
      await nibssService.nameEnquiry(
        receiverAccountNumber
      );

      // --------------------------------------------------
// Find receiver locally.
//
// If the receiver is another OMA Bank account,
// we will also create a CREDIT transaction for them.
// --------------------------------------------------
const receiverLocal = await Account.findOne({
  accountNumber: receiverAccountNumber,
});

let receiverBalanceBefore = null;

if (receiverLocal) {
  try {
    const receiverBefore =
      await syncAccountBalanceFromNibss(
        receiverLocal
      );

    receiverBalanceBefore =
      receiverBefore.balance;
  } catch (receiverBeforeError) {
  console.warn(
    "Could not retrieve receiver balance before transfer:",
    receiverBeforeError.message
  );

  await logAudit({
    req,

    customer:
      req.user._id,

    account:
      req.user.account,

    action:
      "RECEIVER_BALANCE_SYNC",

    status:
      "FAILED",

    message:
      "Could not retrieve receiver balance before transfer",

    metadata: {
      receiverAccount:
        receiverAccountNumber,

      error:
        receiverBeforeError.message,
    },
  });
}
}
    // --------------------------------------------------
    // 10. Generate our local transaction reference
    // --------------------------------------------------
    const reference =
      generateTransactionReference();

    // --------------------------------------------------
    // 11. Create PENDING transaction BEFORE
    //     sending money to NIBSS.
    //
    // This protects against duplicate submissions.
    // --------------------------------------------------
    try {
      transaction = await Transaction.create({
        reference,

        account: senderAccount._id,
        customer: req.user._id,

        type: "TRANSFER",
        direction: "DEBIT",

        amount: roundedAmount,

        balanceBefore: senderLive.balance,
        balanceAfter: senderLive.balance,

        senderAccount:
          senderAccount.accountNumber,

        receiverAccount:
          receiverAccountNumber,

        description:
          transferDescription ||
          `Transfer to ${receiverAccountNumber}`,

        status: "PENDING",

        idempotencyKey,
      });
    } catch (createError) {
      // A second identical request may arrive at
      // almost exactly the same time.
      if (createError.code === 11000) {
        const duplicateTransaction =
          await Transaction.findOne({
            customer: req.user._id,
            idempotencyKey,
          });

        if (duplicateTransaction) {
          return res.status(200).json({
            success: true,
            message:
              "Duplicate transfer request detected. No second transfer was sent.",
            duplicate: true,

            data: {
              reference:
                duplicateTransaction.reference,

              transactionId:
                duplicateTransaction.nibssReference,

              from:
                duplicateTransaction.senderAccount,

              to:
                duplicateTransaction.receiverAccount,

              amount:
                duplicateTransaction.amount,

              status:
                duplicateTransaction.status,

              idempotencyKey:
                duplicateTransaction.idempotencyKey,
            },
          });
        }
      }

      throw createError;
    }

    // --------------------------------------------------
    // 12. Send transfer to NIBSS
    // --------------------------------------------------
    const nibssResponse =
      await nibssService.transfer({
        from: senderAccount.accountNumber,
        to: receiverAccountNumber,
        amount: roundedAmount,
      });

    const raw = nibssResponse.data;

    // --------------------------------------------------
    // 13. Extract NIBSS transaction ID
    // --------------------------------------------------
    const transactionId =
      findNestedValue(raw, "transactionId") ||
      findNestedValue(raw, "reference");

    if (transactionId) {
      transaction.nibssReference =
        String(transactionId);
    }

    // --------------------------------------------------
    // 14. Extract NIBSS transaction status
    // --------------------------------------------------
    const remoteStatus = String(
      findNestedValue(raw, "status") || "PENDING"
    ).toUpperCase();

    if (
      ["SUCCESS", "FAILED", "PENDING"].includes(
        remoteStatus
      )
    ) {
      transaction.status = remoteStatus;
    } else {
      transaction.status = "PENDING";
    }

    // --------------------------------------------------
    // 15. Refresh sender balance from NIBSS
    // --------------------------------------------------
    try {
      const updatedSenderBalance =
        await syncAccountBalanceFromNibss(
          senderAccount
        );

      transaction.balanceAfter =
        updatedSenderBalance.balance;
    } catch (balanceError) {
      console.error(
        "Post-transfer sender balance sync failed:",
        balanceError.message
      );
    }

    // --------------------------------------------------
    // 16. Save transaction
    // --------------------------------------------------
    await transaction.save();

   // --------------------------------------------------
// 17. Create receiver-side CREDIT transaction
// --------------------------------------------------
if (
  receiverLocal &&
  transaction.status === "SUCCESS"
) {
  try {
    // Retrieve the receiver's new LIVE NIBSS balance
    const receiverAfter =
      await syncAccountBalanceFromNibss(
        receiverLocal
      );

    // Deterministic key means this CREDIT record
    // can never be created twice for the same transfer.
    const receiverCreditKey =
      `credit:${transaction.reference}`;

    const existingCredit =
      await Transaction.findOne({
        account: receiverLocal._id,
        idempotencyKey: receiverCreditKey,
      });

    if (!existingCredit) {
      await Transaction.create({
        reference:
          `${transaction.reference}-CREDIT`,

        nibssReference:
          transaction.nibssReference,

        account:
          receiverLocal._id,

        customer:
          receiverLocal.customer || null,

        type: "TRANSFER",

        direction: "CREDIT",

        amount: roundedAmount,

        balanceBefore:
          receiverBalanceBefore !== null
            ? receiverBalanceBefore
            : Math.max(
                0,
                receiverAfter.balance -
                  roundedAmount
              ),

        balanceAfter:
          receiverAfter.balance,

        senderAccount:
          senderAccount.accountNumber,

        receiverAccount:
          receiverAccountNumber,

        description:
          transferDescription ||
          `Transfer from ${senderAccount.accountNumber}`,

        status: "SUCCESS",

        failureReason: null,

        idempotencyKey:
          receiverCreditKey,
      });
    }
  } catch (receiverCreditError) {
    // IMPORTANT:
    // The transfer already succeeded at NIBSS.
    // Therefore we must NOT report the bank transfer
    // itself as failed just because local credit
    // history creation had a problem.
    console.error(
      "Receiver CREDIT transaction creation failed:",
      receiverCreditError.message
    );
  }
}

    // --------------------------------------------------
    // 18. Return successful response
    // --------------------------------------------------
    await logAudit({
  req,

  customer:
    req.user._id,

  account:
    senderAccount._id,

  action:
    "TRANSFER",

  status:
    "SUCCESS",

  message:
    transaction.status === "SUCCESS"
      ? "Fund transfer completed successfully"
      : "Fund transfer submitted to NIBSS",

  metadata: {
    reference:
      transaction.reference,

    nibssReference:
      transaction.nibssReference,

    from:
      senderAccount.accountNumber,

    to:
      receiverAccountNumber,

    amount:
      roundedAmount,

    transactionStatus:
      transaction.status,

    idempotencyKey,
  },
});

    return res.status(200).json({
  success: true,

  message:
    transaction.status === "SUCCESS"
      ? "Transfer completed successfully"
      : "Transfer submitted successfully",

  duplicate: false,

  data: {
    reference:
      transaction.reference,

    transactionId:
      transaction.nibssReference,

    from:
      senderAccount.accountNumber,

    to:
      receiverAccountNumber,

    amount:
      roundedAmount,

    beneficiary:
      nameEnquiry.data,

    status:
      transaction.status,

    balanceBefore:
      transaction.balanceBefore,

    balanceAfter:
      transaction.balanceAfter,

    idempotencyKey,
  },
});

  } catch (error) {
    console.error(
      "NIBSS transfer error:",
      error.response?.data ||
        error.message
    );

    // --------------------------------------------------
    // IMPORTANT:
    //
    // A network timeout does NOT always mean that
    // the transfer failed. NIBSS may have processed it
    // even though our server did not receive the response.
    //
    // 4xx = definite rejection
    // network/5xx = outcome may be uncertain
    // --------------------------------------------------
    if (transaction) {
      const statusCode =
        error.response?.status;

      const definitelyRejected =
        statusCode >= 400 &&
        statusCode < 500;

      transaction.status =
        definitelyRejected
          ? "FAILED"
          : "PENDING";

      transaction.failureReason =
        typeof error.response?.data ===
        "string"
          ? error.response.data
          : JSON.stringify(
              error.response?.data ||
                error.message
            );

      await transaction.save().catch(
        saveError => {
          console.error(
            "Could not save failed/pending transaction:",
            saveError.message
          );
        }
      );
    }

    return res
      .status(error.response?.status || 502)
      .json({
        success: false,

        message: transaction
          ? transaction.status === "FAILED"
            ? "Transfer was rejected by NIBSS"
            : "Transfer status is uncertain. Do not submit another transfer with a new Idempotency-Key until this transaction is checked."
          : "Unable to process transfer",

        data: transaction
          ? {
              reference:
                transaction.reference,

              transactionId:
                transaction.nibssReference,

              status:
                transaction.status,

              idempotencyKey:
                transaction.idempotencyKey,
            }
          : undefined,

        error:
          error.response?.data ||
          error.message,
      });
  }
};

// -----------------------------------------------------
// NIBSS TRANSACTION STATUS (TSQ)
// -----------------------------------------------------
exports.checkNibssTransactionStatus = async (req, res) => {
  try {
    const { reference } = req.params;

    // --------------------------------------------------
    // 1. Validate local transaction reference
    // --------------------------------------------------
    if (!reference || !reference.trim()) {
      return res.status(400).json({
        success: false,
        message: "Transaction reference is required",
      });
    }

    // --------------------------------------------------
    // 2. Find transaction belonging to logged-in account
    //
    // We use account rather than customer so both
    // DEBIT and CREDIT transaction records work.
    // --------------------------------------------------
    const transaction = await Transaction.findOne({
      reference: reference.trim(),
      account: req.user.account,
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // --------------------------------------------------
    // 3. Check that NIBSS gave us a transaction ID
    // --------------------------------------------------
    if (!transaction.nibssReference) {
      return res.status(409).json({
        success: false,
        message:
          "This transaction does not have a NIBSS transaction ID yet",

        data: {
          reference: transaction.reference,
          localStatus: transaction.status,
        },
      });
    }

    // --------------------------------------------------
    // 4. Ask NIBSS for the actual transaction status
    // --------------------------------------------------
    const response =
      await nibssService.transactionStatus(
        transaction.nibssReference
      );

    const raw = response.data;

    // --------------------------------------------------
    // 5. Extract status from different possible
    //    NIBSS response structures
    // --------------------------------------------------
    let rawStatus =
      findNestedValue(raw, "status") ||
      findNestedValue(raw, "transactionStatus") ||
      transaction.status;

    rawStatus = String(rawStatus)
      .trim()
      .toUpperCase();

    // --------------------------------------------------
    // 6. Normalize possible NIBSS status values
    // --------------------------------------------------
    let finalStatus;

    switch (rawStatus) {
      case "SUCCESS":
      case "SUCCESSFUL":
      case "COMPLETED":
      case "COMPLETE":
        finalStatus = "SUCCESS";
        break;

      case "FAILED":
      case "FAIL":
      case "REJECTED":
      case "DECLINED":
        finalStatus = "FAILED";
        break;

      case "PENDING":
      case "PROCESSING":
      case "IN_PROGRESS":
        finalStatus = "PENDING";
        break;

      default:
        finalStatus = transaction.status;
    }

    // --------------------------------------------------
    // 7. Update every local side of this NIBSS transfer
    //
    // If Jonathan has DEBIT and Nadia has CREDIT,
    // both records use the same nibssReference.
    // --------------------------------------------------
    await Transaction.updateMany(
      {
        nibssReference:
          transaction.nibssReference,
      },
      {
        $set: {
          status: finalStatus,
          failureReason:
            finalStatus === "FAILED"
              ? transaction.failureReason
              : null,
        },
      }
    );

    transaction.status = finalStatus;

    // --------------------------------------------------
    // 8. If successful, refresh the customer's
    //    live balance from NIBSS
    // --------------------------------------------------
    if (finalStatus === "SUCCESS") {
      try {
        const customerAccount =
          await Account.findById(
            transaction.account
          );

        if (
          customerAccount &&
          customerAccount.status === "ACTIVE"
        ) {
          const live =
            await syncAccountBalanceFromNibss(
              customerAccount
            );

          transaction.balanceAfter =
            live.balance;

          await transaction.save();
        }
      } catch (balanceError) {
        console.error(
          "TSQ balance sync failed:",
          balanceError.message
        );
      }

      // ----------------------------------------------
      // Also refresh the other OMA Bank account
      // involved in the transfer, if it exists locally.
      // ----------------------------------------------
      try {
        const otherAccountNumber =
          transaction.direction === "DEBIT"
            ? transaction.receiverAccount
            : transaction.senderAccount;

        if (otherAccountNumber) {
          const otherAccount =
            await Account.findOne({
              accountNumber:
                otherAccountNumber,
            });

          if (
            otherAccount &&
            otherAccount.status === "ACTIVE"
          ) {
            await syncAccountBalanceFromNibss(
              otherAccount
            );
          }
        }
      } catch (otherBalanceError) {
        console.error(
          "Counterparty balance sync failed:",
          otherBalanceError.message
        );
      }
    }

    // --------------------------------------------------
    // 9. Return clean status response
    // --------------------------------------------------
    return res.status(200).json({
  success: true,

  message:
    "Transaction status retrieved successfully",

  data: {
    reference:
      transaction.reference,

    transactionId:
      transaction.nibssReference,

    status:
      finalStatus,

    direction:
      transaction.direction,

    amount:
      transaction.amount,

    senderAccount:
      transaction.senderAccount,

    receiverAccount:
      transaction.receiverAccount,

    balanceAfter:
      transaction.balanceAfter,
  },
});

  } catch (error) {
    console.error(
      "Transaction status error:",
      error.response?.data ||
        error.message
    );

    return res
      .status(error.response?.status || 502)
      .json({
        success: false,
        message:
          "Unable to retrieve transaction status",

        error:
          error.response?.data ||
          error.message,
      });
  }
};

// ======================================================
// CUSTOMER ACCOUNT STATEMENT
// ======================================================
// ======================================================
// CUSTOMER ACCOUNT STATEMENT
// Supports:
// - Date range
// - Pagination
// - CREDIT / DEBIT filtering
// - Transaction type filtering
// - Amount filtering
// - Ascending / descending date sorting
// ======================================================
exports.getAccountStatement = async (req, res) => {
  try {
    const {
      from,
      to,
      page = 1,
      limit = 20,
      direction,
      type,
      minAmount,
      maxAmount,
      sort = "desc",
    } = req.query;

    // --------------------------------------------------
    // 1. Validate required dates
    // --------------------------------------------------
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message:
          "Both 'from' and 'to' dates are required. Use YYYY-MM-DD format.",
      });
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (!datePattern.test(from) || !datePattern.test(to)) {
      return res.status(400).json({
        success: false,
        message: "Dates must be in YYYY-MM-DD format",
      });
    }

    const startDate = new Date(`${from}T00:00:00.000Z`);
    const endDate = new Date(`${to}T23:59:59.999Z`);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime())
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid statement date",
      });
    }

    if (startDate > endDate) {
      return res.status(400).json({
        success: false,
        message: "'from' date cannot be later than 'to' date",
      });
    }

    // --------------------------------------------------
    // 2. Pagination validation
    // --------------------------------------------------
    const pageNumber = Number(page);
    const pageLimit = Number(limit);

    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "Page must be a positive integer",
      });
    }

    if (
      !Number.isInteger(pageLimit) ||
      pageLimit < 1 ||
      pageLimit > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Limit must be between 1 and 100",
      });
    }

    // --------------------------------------------------
    // 3. Validate direction
    // --------------------------------------------------
    let normalizedDirection;

    if (direction) {
      normalizedDirection = direction.toUpperCase();

      if (
        !["CREDIT", "DEBIT"].includes(
          normalizedDirection
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Direction must be CREDIT or DEBIT",
        });
      }
    }

    // --------------------------------------------------
    // 4. Validate transaction type
    // --------------------------------------------------
    let normalizedType;

    const allowedTypes = [
      "INITIAL_FUNDING",
      "TRANSFER",
      "CREDIT",
      "DEBIT",
    ];

    if (type) {
      normalizedType = type.toUpperCase();

      if (!allowedTypes.includes(normalizedType)) {
        return res.status(400).json({
          success: false,
          message: `Invalid transaction type. Allowed values: ${allowedTypes.join(
            ", "
          )}`,
        });
      }
    }

    // --------------------------------------------------
    // 5. Validate amount filters
    // --------------------------------------------------
    let minimumAmount;
    let maximumAmount;

    if (minAmount !== undefined) {
      minimumAmount = Number(minAmount);

      if (
        !Number.isFinite(minimumAmount) ||
        minimumAmount < 0
      ) {
        return res.status(400).json({
          success: false,
          message: "minAmount must be a valid positive number",
        });
      }
    }

    if (maxAmount !== undefined) {
      maximumAmount = Number(maxAmount);

      if (
        !Number.isFinite(maximumAmount) ||
        maximumAmount < 0
      ) {
        return res.status(400).json({
          success: false,
          message: "maxAmount must be a valid positive number",
        });
      }
    }

    if (
      minimumAmount !== undefined &&
      maximumAmount !== undefined &&
      minimumAmount > maximumAmount
    ) {
      return res.status(400).json({
        success: false,
        message:
          "minAmount cannot be greater than maxAmount",
      });
    }

    // --------------------------------------------------
    // 6. Validate sorting
    // --------------------------------------------------
    const normalizedSort =
      String(sort).toLowerCase();

    if (
      !["asc", "desc"].includes(normalizedSort)
    ) {
      return res.status(400).json({
        success: false,
        message: "sort must be asc or desc",
      });
    }

    const sortOrder =
      normalizedSort === "asc" ? 1 : -1;

    // --------------------------------------------------
    // 7. Find customer's account
    // --------------------------------------------------
    const account = await Account.findOne({
      _id: req.user.account,
      customer: req.user._id,
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Customer account not found",
      });
    }

    // --------------------------------------------------
    // 8. Base query
    //
    // A bank statement should contain POSTED /
    // SUCCESSFUL transactions only.
    // --------------------------------------------------
    const basePeriodQuery = {
      account: account._id,

      status: "SUCCESS",

      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
    };

    // --------------------------------------------------
    // 9. Filtered query
    // --------------------------------------------------
    const filteredQuery = {
      ...basePeriodQuery,
    };

    if (normalizedDirection) {
      filteredQuery.direction =
        normalizedDirection;
    }

    if (normalizedType) {
      filteredQuery.type =
        normalizedType;
    }

    if (
      minimumAmount !== undefined ||
      maximumAmount !== undefined
    ) {
      filteredQuery.amount = {};

      if (minimumAmount !== undefined) {
        filteredQuery.amount.$gte =
          minimumAmount;
      }

      if (maximumAmount !== undefined) {
        filteredQuery.amount.$lte =
          maximumAmount;
      }
    }

    // --------------------------------------------------
    // 10. Opening balance
    //
    // Find the last successful transaction BEFORE
    // the requested statement period.
    // --------------------------------------------------
    const previousTransaction =
      await Transaction.findOne({
        account: account._id,

        status: "SUCCESS",

        createdAt: {
          $lt: startDate,
        },
      }).sort({
        createdAt: -1,
      });

    // Get the first transaction in the period too,
    // in case there is no earlier transaction.
    const firstPeriodTransaction =
      await Transaction.findOne(
        basePeriodQuery
      ).sort({
        createdAt: 1,
      });

    let openingBalance = 0;

    if (previousTransaction) {
      openingBalance =
        Number(
          previousTransaction.balanceAfter
        ) || 0;
    } else if (firstPeriodTransaction) {
      openingBalance =
        Number(
          firstPeriodTransaction.balanceBefore
        ) || 0;
    }

    // --------------------------------------------------
    // 11. Get ALL successful transactions in period
    // for accurate statement totals.
    //
    // Pagination should NOT affect summary totals.
    // --------------------------------------------------
    const allPeriodTransactions =
      await Transaction.find(
        basePeriodQuery
      ).sort({
        createdAt: 1,
      });

    let totalCredits = 0;
    let totalDebits = 0;

    for (const transaction of allPeriodTransactions) {
      const transactionAmount =
        Number(transaction.amount) || 0;

      if (
        transaction.direction === "CREDIT"
      ) {
        totalCredits += transactionAmount;
      }

      if (
        transaction.direction === "DEBIT"
      ) {
        totalDebits += transactionAmount;
      }
    }

    // --------------------------------------------------
    // 12. Calculate true closing balance
    //
    // Filters do NOT change the real account closing
    // balance.
    // --------------------------------------------------
    let closingBalance = openingBalance;

    if (allPeriodTransactions.length > 0) {
      const lastTransaction =
        allPeriodTransactions[
          allPeriodTransactions.length - 1
        ];

      closingBalance =
        Number(
          lastTransaction.balanceAfter
        ) || 0;
    }

    // --------------------------------------------------
    // 13. Count filtered transactions
    // --------------------------------------------------
    const totalFilteredTransactions =
      await Transaction.countDocuments(
        filteredQuery
      );

    const totalPages =
      totalFilteredTransactions === 0
        ? 0
        : Math.ceil(
            totalFilteredTransactions /
              pageLimit
          );

    // --------------------------------------------------
    // 14. Paginated transactions
    // --------------------------------------------------
    const skip =
      (pageNumber - 1) * pageLimit;

    const transactions =
      await Transaction.find(
        filteredQuery
      )
        .sort({
          createdAt: sortOrder,
        })
        .skip(skip)
        .limit(pageLimit);

    // --------------------------------------------------
    // 15. Totals for currently applied filters
    // --------------------------------------------------
    const filteredTransactionsForSummary =
      await Transaction.find(
        filteredQuery
      );

    let filteredCredits = 0;
    let filteredDebits = 0;

    for (
      const transaction
      of filteredTransactionsForSummary
    ) {
      const transactionAmount =
        Number(transaction.amount) || 0;

      if (
        transaction.direction === "CREDIT"
      ) {
        filteredCredits += transactionAmount;
      }

      if (
        transaction.direction === "DEBIT"
      ) {
        filteredDebits += transactionAmount;
      }
    }

    // --------------------------------------------------
    // 16. Clean transaction output
    // --------------------------------------------------
    const statementTransactions =
      transactions.map(
        (transaction) => ({
          reference:
            transaction.reference,

          nibssReference:
            transaction.nibssReference,

          date:
            transaction.createdAt,

          type:
            transaction.type,

          direction:
            transaction.direction,

          description:
            transaction.description,

          amount:
            transaction.amount,

          balanceBefore:
            transaction.balanceBefore,

          balanceAfter:
            transaction.balanceAfter,

          senderAccount:
            transaction.senderAccount,

          receiverAccount:
            transaction.receiverAccount,

          status:
            transaction.status,
        })
      );

    // --------------------------------------------------
    // 17. Response
    // --------------------------------------------------
    return res.status(200).json({
      success: true,

      message:
        "Account statement retrieved successfully",

      data: {
        account: {
          accountNumber:
            account.accountNumber,

          accountName:
            account.accountName,

          bankName:
            account.bankName,

          bankCode:
            account.bankCode,

          currency:
            account.currency,

          status:
            account.status,
        },

        statementPeriod: {
          from,
          to,
        },

        // ----------------------------------------------
        // Real statement totals.
        // These are NOT affected by pagination/filter.
        // ----------------------------------------------
        summary: {
          openingBalance,

          totalCredits,

          totalDebits,

          netMovement:
            totalCredits -
            totalDebits,

          closingBalance,

          transactionCount:
            allPeriodTransactions.length,
        },

        // ----------------------------------------------
        // Information about filters currently applied.
        // ----------------------------------------------
        filters: {
          direction:
            normalizedDirection || null,

          type:
            normalizedType || null,

          minAmount:
            minimumAmount ??
            null,

          maxAmount:
            maximumAmount ??
            null,

          sort:
            normalizedSort,
        },

        filteredSummary: {
          totalCredits:
            filteredCredits,

          totalDebits:
            filteredDebits,

          netMovement:
            filteredCredits -
            filteredDebits,

          transactionCount:
            totalFilteredTransactions,
        },

        // ----------------------------------------------
        // Pagination
        // ----------------------------------------------
        pagination: {
          currentPage:
            pageNumber,

          limit:
            pageLimit,

          totalTransactions:
            totalFilteredTransactions,

          totalPages,

          hasNextPage:
            totalPages > 0 &&
            pageNumber < totalPages,

          hasPreviousPage:
            pageNumber > 1 &&
            totalPages > 0,
        },

        transactions:
          statementTransactions,
      },
    });
  } catch (error) {
    console.error(
      "Account statement error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve account statement",
      error: error.message,
    });
  }
};

// ======================================================
// DOWNLOAD CUSTOMER ACCOUNT STATEMENT AS PDF
// ======================================================
exports.downloadAccountStatementPdf = async (req, res) => {
  try {
    const { from, to } = req.query;

    // --------------------------------------------------
    // 1. Validate dates
    // --------------------------------------------------
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message:
          "Both 'from' and 'to' dates are required. Use YYYY-MM-DD format.",
      });
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (
      !datePattern.test(from) ||
      !datePattern.test(to)
    ) {
      return res.status(400).json({
        success: false,
        message: "Dates must be in YYYY-MM-DD format",
      });
    }

    const startDate = new Date(
      `${from}T00:00:00.000Z`
    );

    const endDate = new Date(
      `${to}T23:59:59.999Z`
    );

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime())
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid statement date",
      });
    }

    if (startDate > endDate) {
      return res.status(400).json({
        success: false,
        message:
          "'from' date cannot be later than 'to' date",
      });
    }

    // --------------------------------------------------
    // 2. Find authenticated customer's account
    // --------------------------------------------------
    const account = await Account.findOne({
      _id: req.user.account,
      customer: req.user._id,
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Customer account not found",
      });
    }

    // --------------------------------------------------
    // 3. Find successful transactions for period
    // --------------------------------------------------
    const transactions = await Transaction.find({
      account: account._id,

      status: "SUCCESS",

      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
    }).sort({
      createdAt: 1,
    });

    // --------------------------------------------------
    // 4. Get previous transaction for opening balance
    // --------------------------------------------------
    const previousTransaction =
      await Transaction.findOne({
        account: account._id,

        status: "SUCCESS",

        createdAt: {
          $lt: startDate,
        },
      }).sort({
        createdAt: -1,
      });

    // --------------------------------------------------
    // 5. Calculate opening balance
    // --------------------------------------------------
    let openingBalance = 0;

    if (previousTransaction) {
      openingBalance =
        Number(
          previousTransaction.balanceAfter
        ) || 0;
    } else if (transactions.length > 0) {
      openingBalance =
        Number(
          transactions[0].balanceBefore
        ) || 0;
    }

    // --------------------------------------------------
    // 6. Calculate totals
    // --------------------------------------------------
    let totalCredits = 0;
    let totalDebits = 0;

    for (const transaction of transactions) {
      const amount =
        Number(transaction.amount) || 0;

      if (
        transaction.direction === "CREDIT"
      ) {
        totalCredits += amount;
      }

      if (
        transaction.direction === "DEBIT"
      ) {
        totalDebits += amount;
      }
    }

    let closingBalance = openingBalance;

    if (transactions.length > 0) {
      closingBalance =
        Number(
          transactions[
            transactions.length - 1
          ].balanceAfter
        ) || 0;
    }

    // --------------------------------------------------
    // 7. Formatting helpers
    // --------------------------------------------------
    const formatNumber = (amount) => {
      return Number(amount || 0).toLocaleString(
        "en-NG",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }
      );
    };

    const formatMoney = (amount) => {
      return `NGN ${formatNumber(amount)}`;
    };

    const formatDate = (date) => {
      return new Date(date)
        .toISOString()
        .slice(0, 10);
    };

    const cleanText = (value, maxLength = 45) => {
      const text = String(value || "");

      if (text.length <= maxLength) {
        return text;
      }

      return `${text.slice(
        0,
        maxLength - 3
      )}...`;
    };

    // --------------------------------------------------
    // 8. Set PDF download response headers
    // --------------------------------------------------
    const fileName =
      `OMA-Bank-Statement-${account.accountNumber}-${from}-to-${to}.pdf`;

    res.setHeader(
      "Content-Type",
      "application/pdf"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    // --------------------------------------------------
    // 9. Create PDF
    //
    // Landscape gives us enough room for the
    // transaction table.
    // --------------------------------------------------
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 36,
      bufferPages: true,

      info: {
        Title: "OMA Bank Account Statement",
        Author: "OMA Bank",
        Subject: "Customer Account Statement",
      },
    });

    doc.pipe(res);

    // --------------------------------------------------
    // 10. Bank heading
    // --------------------------------------------------
    const bankName =
      account.bankName ||
      process.env.BANK_NAME ||
      "OMA Bank";

    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .text(bankName, {
        align: "center",
      });

    doc.moveDown(0.3);

    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .text("ACCOUNT STATEMENT", {
        align: "center",
      });

    doc.moveDown(1);

    // --------------------------------------------------
    // 11. Account information
    // --------------------------------------------------
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(
        `Account Name: ${account.accountName}`
      );

    doc
      .font("Helvetica")
      .fontSize(10)
      .text(
        `Account Number: ${account.accountNumber}`
      );

    doc.text(
      `Bank Code: ${account.bankCode || "-"}`
    );

    doc.text(
      `Currency: ${account.currency || "NGN"}`
    );

    doc.text(
      `Account Status: ${account.status}`
    );

    doc.text(
      `Statement Period: ${from} to ${to}`
    );

    doc.text(
      `Generated: ${new Date().toISOString()}`
    );

    doc.moveDown(1);

    // --------------------------------------------------
    // 12. Statement summary
    // --------------------------------------------------
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("STATEMENT SUMMARY");

    doc.moveDown(0.4);

    doc
      .font("Helvetica")
      .fontSize(10);

    doc.text(
      `Opening Balance: ${formatMoney(
        openingBalance
      )}`
    );

    doc.text(
      `Total Credits: ${formatMoney(
        totalCredits
      )}`
    );

    doc.text(
      `Total Debits: ${formatMoney(
        totalDebits
      )}`
    );

    doc.text(
      `Net Movement: ${formatMoney(
        totalCredits - totalDebits
      )}`
    );

    doc
      .font("Helvetica-Bold")
      .text(
        `Closing Balance: ${formatMoney(
          closingBalance
        )}`
      );

    doc
      .font("Helvetica")
      .text(
        `Number of Transactions: ${transactions.length}`
      );

    doc.moveDown(1);

    // --------------------------------------------------
    // 13. Transaction table configuration
    // --------------------------------------------------
    const left = 36;

    const columns = {
      date: left,

      reference:
        left + 75,

      description:
        left + 245,

      debit:
        left + 465,

      credit:
        left + 555,

      balance:
        left + 645,
    };

    // --------------------------------------------------
    // Draw table heading
    // --------------------------------------------------
    const drawTableHeader = () => {
      const y = doc.y;

      doc
        .font("Helvetica-Bold")
        .fontSize(8);

      doc.text(
        "DATE",
        columns.date,
        y,
        {
          width: 70,
        }
      );

      doc.text(
        "REFERENCE",
        columns.reference,
        y,
        {
          width: 165,
        }
      );

      doc.text(
        "DESCRIPTION",
        columns.description,
        y,
        {
          width: 210,
        }
      );

      doc.text(
        "DEBIT",
        columns.debit,
        y,
        {
          width: 85,
          align: "right",
        }
      );

      doc.text(
        "CREDIT",
        columns.credit,
        y,
        {
          width: 85,
          align: "right",
        }
      );

      doc.text(
        "BALANCE",
        columns.balance,
        y,
        {
          width: 90,
          align: "right",
        }
      );

      doc.moveTo(
        left,
        y + 14
      );

      doc.lineTo(
        doc.page.width - 36,
        y + 14
      );

      doc.stroke();

      doc.y = y + 20;
    };

    drawTableHeader();

    // --------------------------------------------------
    // 14. Add transactions to table
    // --------------------------------------------------
    if (transactions.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(9)
        .text(
          "No successful transactions were found for this statement period."
        );
    }

    for (const transaction of transactions) {

      // ----------------------------------------------
      // Add another page if needed
      // ----------------------------------------------
      if (
        doc.y >
        doc.page.height - 70
      ) {
        doc.addPage();

        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(
            `${bankName} - Account Statement`,
            {
              align: "center",
            }
          );

        doc.moveDown(0.5);

        drawTableHeader();
      }

      const rowY = doc.y;

      const debit =
        transaction.direction === "DEBIT"
          ? formatNumber(
              transaction.amount
            )
          : "";

      const credit =
        transaction.direction === "CREDIT"
          ? formatNumber(
              transaction.amount
            )
          : "";

      doc
        .font("Helvetica")
        .fontSize(7.5);

      doc.text(
        formatDate(
          transaction.createdAt
        ),
        columns.date,
        rowY,
        {
          width: 70,
        }
      );

      doc.text(
        cleanText(
          transaction.reference,
          24
        ),
        columns.reference,
        rowY,
        {
          width: 165,
        }
      );

      doc.text(
        cleanText(
          transaction.description ||
            transaction.type,
          40
        ),
        columns.description,
        rowY,
        {
          width: 210,
        }
      );

      doc.text(
        debit,
        columns.debit,
        rowY,
        {
          width: 85,
          align: "right",
        }
      );

      doc.text(
        credit,
        columns.credit,
        rowY,
        {
          width: 85,
          align: "right",
        }
      );

      doc.text(
        formatNumber(
          transaction.balanceAfter
        ),
        columns.balance,
        rowY,
        {
          width: 90,
          align: "right",
        }
      );

      const lineY =
        rowY + 17;

      doc
        .moveTo(
          left,
          lineY
        )
        .lineTo(
          doc.page.width - 36,
          lineY
        )
        .strokeOpacity(0.15)
        .stroke()
        .strokeOpacity(1);

      doc.y =
        lineY + 5;
    }

    // --------------------------------------------------
    // 15. Statement footer
    // --------------------------------------------------
    doc.moveDown(1);

    doc
      .font("Helvetica")
      .fontSize(8)
      .text(
        "This statement was generated electronically by OMA Bank.",
        {
          align: "center",
        }
      );

    doc.text(
      "Transactions shown are successful transactions recorded for the selected statement period.",
      {
        align: "center",
      }
    );

    // --------------------------------------------------
    // 16. Add page numbers
    // --------------------------------------------------
    const pages =
      doc.bufferedPageRange();

    for (
      let i = pages.start;
      i <
      pages.start + pages.count;
      i++
    ) {
      doc.switchToPage(i);

      doc
        .font("Helvetica")
        .fontSize(7)
        .text(
          `Page ${
            i - pages.start + 1
          } of ${pages.count}`,
          36,
          doc.page.height - 25,
          {
            width:
              doc.page.width - 72,
            align: "center",
          }
        );
    }

    // --------------------------------------------------
    // 17. Finish PDF
    // --------------------------------------------------
    doc.end();

  } catch (error) {
    console.error(
      "PDF statement error:",
      error.message
    );

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message:
          "Unable to generate PDF account statement",
        error: error.message,
      });
    }

    res.end();
  }
};

// ======================================================
// DOWNLOAD TRANSACTION RECEIPT AS PDF
// ======================================================
exports.downloadTransactionReceipt = async (req, res) => {
  try {
    const { reference } = req.params;

    // --------------------------------------------------
    // 1. Validate reference
    // --------------------------------------------------
    if (!reference || !reference.trim()) {
      return res.status(400).json({
        success: false,
        message: "Transaction reference is required",
      });
    }

    // --------------------------------------------------
    // 2. Find transaction belonging to logged-in account
    // --------------------------------------------------
    const transaction = await Transaction.findOne({
      reference: reference.trim(),
      account: req.user.account,
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // --------------------------------------------------
    // 3. Only successful transactions get receipts
    // --------------------------------------------------
    if (transaction.status !== "SUCCESS") {
      return res.status(409).json({
        success: false,
        message:
          "A receipt can only be generated for a successful transaction",
        data: {
          reference: transaction.reference,
          status: transaction.status,
        },
      });
    }

    // --------------------------------------------------
    // 4. Find customer's account
    // --------------------------------------------------
    const customerAccount = await Account.findById(
      transaction.account
    );

    if (!customerAccount) {
      return res.status(404).json({
        success: false,
        message: "Account linked to transaction was not found",
      });
    }

    // --------------------------------------------------
    // 5. Try to find sender/receiver locally
    //
    // If the counterparty is another OMA Bank customer,
    // we can display their account name.
    // --------------------------------------------------
    const senderLocal = await Account.findOne({
      accountNumber: transaction.senderAccount,
    });

    const receiverLocal = await Account.findOne({
      accountNumber: transaction.receiverAccount,
    });

    const senderName =
      senderLocal?.accountName ||
      (transaction.direction === "DEBIT"
        ? customerAccount.accountName
        : "External Account");

    const receiverName =
      receiverLocal?.accountName ||
      (transaction.direction === "CREDIT"
        ? customerAccount.accountName
        : "External Account");

    // --------------------------------------------------
    // 6. Formatting helpers
    // --------------------------------------------------
    const formatMoney = (amount) => {
      return `NGN ${Number(amount || 0).toLocaleString(
        "en-NG",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }
      )}`;
    };

    const formatDateTime = (date) => {
      return new Date(date).toLocaleString(
        "en-NG",
        {
          year: "numeric",
          month: "long",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
          timeZone: "Africa/Lagos",
        }
      );
    };

    // --------------------------------------------------
    // 7. PDF filename
    // --------------------------------------------------
    const fileName =
      `OMA-Bank-Receipt-${transaction.reference}.pdf`;

    res.setHeader(
      "Content-Type",
      "application/pdf"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    // --------------------------------------------------
    // 8. Create PDF
    // --------------------------------------------------
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,

      info: {
        Title: "OMA Bank Transaction Receipt",
        Author: "OMA Bank",
        Subject: "Transaction Receipt",
      },
    });

    doc.pipe(res);

    const bankName =
      customerAccount.bankName ||
      process.env.BANK_NAME ||
      "OMA Bank";

    // --------------------------------------------------
    // 9. Bank heading
    // --------------------------------------------------
    doc
      .font("Helvetica-Bold")
      .fontSize(24)
      .text(bankName, {
        align: "center",
      });

    doc.moveDown(0.4);

    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .text("TRANSACTION RECEIPT", {
        align: "center",
      });

    doc.moveDown(0.4);

    doc
      .font("Helvetica")
      .fontSize(10)
      .text("Transaction Successful", {
        align: "center",
      });

    doc.moveDown(1.5);

    // --------------------------------------------------
    // 10. Amount
    // --------------------------------------------------
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("AMOUNT", {
        align: "center",
      });

    doc.moveDown(0.3);

    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .text(
        formatMoney(transaction.amount),
        {
          align: "center",
        }
      );

    doc.moveDown(1.5);

    // --------------------------------------------------
    // 11. Separator
    // --------------------------------------------------
    doc
      .moveTo(50, doc.y)
      .lineTo(
        doc.page.width - 50,
        doc.y
      )
      .stroke();

    doc.moveDown(1);

    // --------------------------------------------------
    // Helper for receipt rows
    // --------------------------------------------------
    const receiptRow = (
      label,
      value
    ) => {
      const y = doc.y;

      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(
          label,
          60,
          y,
          {
            width: 160,
          }
        );

      doc
        .font("Helvetica")
        .fontSize(10)
        .text(
          String(value || "-"),
          220,
          y,
          {
            width: 320,
            align: "right",
          }
        );

      doc.moveDown(1);
    };

    // --------------------------------------------------
    // 12. Transaction details
    // --------------------------------------------------
    receiptRow(
      "Status",
      transaction.status
    );

    receiptRow(
      "Transaction Type",
      transaction.type
    );

    receiptRow(
      "Direction",
      transaction.direction
    );

    receiptRow(
      "Date",
      formatDateTime(
        transaction.createdAt
      )
    );

    receiptRow(
      "Description",
      transaction.description ||
        "Fund Transfer"
    );

    receiptRow(
      "OMA Reference",
      transaction.reference
    );

    receiptRow(
      "NIBSS Reference",
      transaction.nibssReference ||
        "Not available"
    );

    // --------------------------------------------------
    // 13. Separator
    // --------------------------------------------------
    doc.moveDown(0.5);

    doc
      .moveTo(50, doc.y)
      .lineTo(
        doc.page.width - 50,
        doc.y
      )
      .stroke();

    doc.moveDown(1);

    // --------------------------------------------------
    // 14. Sender details
    // --------------------------------------------------
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("SENDER");

    doc.moveDown(0.6);

    receiptRow(
      "Account Name",
      senderName
    );

    receiptRow(
      "Account Number",
      transaction.senderAccount
    );

    // --------------------------------------------------
    // 15. Beneficiary details
    // --------------------------------------------------
    doc.moveDown(0.5);

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("BENEFICIARY");

    doc.moveDown(0.6);

    receiptRow(
      "Account Name",
      receiverName
    );

    receiptRow(
      "Account Number",
      transaction.receiverAccount
    );

    // --------------------------------------------------
    // 16. Balance information
    //
    // Only meaningful for the account viewing
    // this particular transaction record.
    // --------------------------------------------------
    doc.moveDown(0.5);

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("ACCOUNT BALANCE");

    doc.moveDown(0.6);

    receiptRow(
      "Balance Before",
      formatMoney(
        transaction.balanceBefore
      )
    );

    receiptRow(
      "Balance After",
      formatMoney(
        transaction.balanceAfter
      )
    );

    // --------------------------------------------------
    // 17. Footer
    // --------------------------------------------------
    doc.moveDown(1.5);

    doc
      .moveTo(50, doc.y)
      .lineTo(
        doc.page.width - 50,
        doc.y
      )
      .stroke();

    doc.moveDown(1);

    doc
      .font("Helvetica")
      .fontSize(8)
      .text(
        "This receipt was generated electronically by OMA Bank.",
        {
          align: "center",
        }
      );

    doc.text(
      "It confirms that the transaction recorded above was successful.",
      {
        align: "center",
      }
    );

    doc.moveDown(0.5);

    doc.text(
      `Generated on ${formatDateTime(
        new Date()
      )}`,
      {
        align: "center",
      }
    );

    // --------------------------------------------------
    // 18. Finish PDF
    // --------------------------------------------------
    doc.end();

  } catch (error) {
    console.error(
      "Transaction receipt PDF error:",
      error.message
    );

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message:
          "Unable to generate transaction receipt",
        error: error.message,
      });
    }

    res.end();
  }
};