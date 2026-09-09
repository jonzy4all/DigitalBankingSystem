const Onboarding = require("../Models/Onboarding");
const Account = require("../Models/Account");
const Transaction = require("../Models/Transaction");
const nibssService = require("../Services/nibssService");
const generateTransactionReference = require("../utils/generateTransactionReference");

const normalizeKycType = (value) => String(value || "").trim().toLowerCase();
const normalizeKycId = (value) => String(value || "").trim();

const buildAccountPayload = (onboarding, nibssResponse) => {
  const accountName =
    nibssResponse?.accountName ||
    `${onboarding.firstName || ""} ${onboarding.lastName || ""}`.trim();

  const parsedBalance = Number(nibssResponse?.balance);
  const balance = Number.isFinite(parsedBalance) ? parsedBalance : 15000;

  return {
    accountNumber: onboarding.accountNumber || nibssResponse?.accountNumber,
    onboarding: onboarding._id,
    accountName,
    balance,
    currency: "NGN",
    bankCode: nibssResponse?.bankCode || process.env.BANK_CODE || null,
    bankName: nibssResponse?.bankName || process.env.BANK_NAME || null,
    status: "ACTIVE",
    initialFunding: 15000,
    initialFundingCompleted: true,
    nibssAccountResponse: nibssResponse?.rawResponse || nibssResponse || null,
  };
};

const ensureInitialFundingTransaction = async (account) => {
  const existingFunding = await Transaction.findOne({
    account: account._id,
    type: "INITIAL_FUNDING",
  });

  if (existingFunding) return existingFunding;

  const amount = account.initialFunding || 15000;

  return Transaction.create({
    reference: generateTransactionReference(),
    account: account._id,
    type: "INITIAL_FUNDING",
    direction: "CREDIT",
    amount,
    balanceBefore: 0,
    balanceAfter: account.balance,
    description: "Initial account funding",
    status: "SUCCESS",
  });
};

const finishLocalAccountCreation = async (onboarding, nibssResponse) => {
  const accountNumber = onboarding.accountNumber || nibssResponse?.accountNumber;

  if (!accountNumber) {
    throw new Error("Cannot finalize local account without an account number");
  }

  let account = await Account.findOne({
    $or: [
      { onboarding: onboarding._id },
      { accountNumber: String(accountNumber) },
    ],
  });

  if (!account) {
    account = await Account.create(buildAccountPayload(onboarding, nibssResponse));
  } else if (String(account.onboarding) !== String(onboarding._id)) {
    const conflict = new Error(
      `Account number ${accountNumber} is already linked to a different local onboarding record`
    );
    conflict.code = "LOCAL_ACCOUNT_LINK_CONFLICT";
    throw conflict;
  }

  await ensureInitialFundingTransaction(account);

  onboarding.accountNumber = account.accountNumber;
  onboarding.nibssAccountResponse =
    nibssResponse?.rawResponse || nibssResponse || onboarding.nibssAccountResponse;
  onboarding.accountCreationStatus = "SUCCESS";
  onboarding.accountCreationError = null;
  onboarding.onboardingStatus = "SUCCESS";
  onboarding.completedAt = new Date();
  await onboarding.save();

  return account;
};

/**
 * Safe recovery path for a remote NIBSS account that exists but was not linked
 * to the local onboarding record. The live GET /api/accounts response includes
 * kycType and kycID, so recovery is based on an exact KYC match, never merely
 * on customer name.
 */
const findRemoteAccountForOnboarding = async (onboarding) => {
  const { accounts, rawResponse } = await nibssService.getAllAccounts();

  const expectedType = normalizeKycType(onboarding.kycType);
  const expectedId = normalizeKycId(onboarding.kycId);

  const matches = accounts.filter((remoteAccount) => {
    return (
      normalizeKycType(remoteAccount.kycType) === expectedType &&
      normalizeKycId(remoteAccount.kycID) === expectedId
    );
  });

  if (matches.length === 0) {
    return { account: null, matches: [], rawResponse };
  }

  if (matches.length > 1) {
    const error = new Error(
      "More than one NIBSS account matched the same KYC ID; automatic recovery was stopped"
    );
    error.code = "MULTIPLE_REMOTE_KYC_MATCHES";
    error.matches = matches.map((item) => item.accountNumber);
    throw error;
  }

  return { account: matches[0], matches, rawResponse };
};

const reconcileRemoteAccount = async (onboarding) => {
  const { account: remoteAccount } = await findRemoteAccountForOnboarding(onboarding);

  if (!remoteAccount) return null;

  // Persist the remote identity/account linkage BEFORE creating local records.
  onboarding.accountNumber = remoteAccount.accountNumber;
  onboarding.nibssAccountResponse = remoteAccount.rawResponse || remoteAccount;
  onboarding.accountCreationStatus = "REMOTE_CREATED";
  onboarding.accountCreationError = null;
  await onboarding.save();

  return finishLocalAccountCreation(onboarding, remoteAccount);
};

const presentAccount = (account) => ({
  accountNumber: account.accountNumber,
  accountName: account.accountName,
  bankCode: account.bankCode,
  bankName: account.bankName,
  balance: account.balance,
  currency: account.currency,
  status: account.status,
});

const createAccount = async (req, res) => {
  let onboarding = null;

  try {
    const { onboardingId } = req.body;

    if (!onboardingId) {
      return res.status(400).json({
        success: false,
        message: "onboardingId is required",
      });
    }

    onboarding = await Onboarding.findOne({ onboardingId: String(onboardingId).trim() });

    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: "Onboarding record not found",
      });
    }

    if (onboarding.validationStatus !== "SUCCESS") {
      return res.status(400).json({
        success: false,
        message:
          "BVN/NIN validation must be successfully completed before account creation",
      });
    }

    // 1) Idempotency: return an already-linked local account immediately.
    const existingAccount = await Account.findOne({ onboarding: onboarding._id });

    if (existingAccount) {
      if (onboarding.accountCreationStatus !== "SUCCESS") {
        onboarding.accountCreationStatus = "SUCCESS";
        onboarding.accountNumber = existingAccount.accountNumber;
        onboarding.accountCreationError = null;
        await onboarding.save();
      }

      return res.status(200).json({
        success: true,
        message: "Account already created",
        account: presentAccount(existingAccount),
      });
    }

    // 2) If a previous build saved the remote account number but failed before
    // creating the local Account record, reconstruct it without another NIBSS
    // create call.
    if (onboarding.accountNumber) {
      const recoveredAccount = await finishLocalAccountCreation(
        onboarding,
        onboarding.nibssAccountResponse || { accountNumber: onboarding.accountNumber }
      );

      return res.status(200).json({
        success: true,
        message: "Account recovered and linked successfully",
        recovered: true,
        account: presentAccount(recoveredAccount),
      });
    }

    // 3) If this onboarding has evidence of a previous account-creation attempt,
    // check NIBSS first. This fixes older builds that created the remote account
    // but lost/failed to parse the returned account number.
    const priorAttemptStatuses = new Set([
      "IN_PROGRESS",
      "REMOTE_RESPONSE_RECEIVED",
      "REMOTE_CREATED",
      "FAILED",
    ]);

    if (priorAttemptStatuses.has(onboarding.accountCreationStatus)) {
      try {
        const recoveredAccount = await reconcileRemoteAccount(onboarding);

        if (recoveredAccount) {
          return res.status(200).json({
            success: true,
            message: "Existing NIBSS account recovered and linked successfully",
            recovered: true,
            account: presentAccount(recoveredAccount),
          });
        }
      } catch (recoveryError) {
        // A failed discovery call should not hide a useful error. Multiple exact
        // matches or local conflicts are unsafe and must stop; network/API errors
        // can fall through to the normal create attempt.
        if (
          recoveryError.code === "MULTIPLE_REMOTE_KYC_MATCHES" ||
          recoveryError.code === "LOCAL_ACCOUNT_LINK_CONFLICT"
        ) {
          throw recoveryError;
        }

        console.warn(
          "Pre-create NIBSS reconciliation could not complete:",
          recoveryError.response?.data || recoveryError.message
        );
      }
    }

    onboarding.accountCreationStatus = "IN_PROGRESS";
    onboarding.accountCreationAttemptedAt = new Date();
    onboarding.accountCreationError = null;
    await onboarding.save();

    console.log(
  "Starting NIBSS account creation for onboarding:",
  onboarding.onboardingId
);

    const nibssResponse = await nibssService.createAccount({
      kycType: onboarding.kycType.toLowerCase(),
      kycID: onboarding.kycId,
      dob: onboarding.dateOfBirth,
    });

    if (!nibssResponse?.accountNumber) {
      // A 2xx response without a recognized account number may still have
      // created the account remotely. Query /api/accounts and match exact KYC.
      try {
        const recoveredAccount = await reconcileRemoteAccount(onboarding);

        if (recoveredAccount) {
          return res.status(201).json({
            success: true,
            message: "Account created in NIBSS and recovered from the account list",
            recovered: true,
            account: presentAccount(recoveredAccount),
          });
        }
      } catch (recoveryError) {
        if (
          recoveryError.code === "MULTIPLE_REMOTE_KYC_MATCHES" ||
          recoveryError.code === "LOCAL_ACCOUNT_LINK_CONFLICT"
        ) {
          throw recoveryError;
        }
      }

      onboarding.nibssAccountResponse =
        nibssResponse?.rawResponse || nibssResponse || null;
      onboarding.accountCreationStatus = "REMOTE_RESPONSE_RECEIVED";
      onboarding.accountCreationError = {
        code: "NIBSS_MISSING_ACCOUNT_NUMBER",
        message:
          "NIBSS returned a successful response but no account number could be parsed or reconciled",
      };
      await onboarding.save();

      return res.status(502).json({
        success: false,
        code: "NIBSS_RESPONSE_SHAPE_UNRECOGNIZED",
        message:
          "NIBSS responded, but the account number could not be parsed or found in the fintech account list.",
      });
    }

    // CRITICAL: persist the NIBSS result BEFORE any further local writes.
    onboarding.accountNumber = nibssResponse.accountNumber;
    onboarding.nibssAccountResponse = nibssResponse.rawResponse || nibssResponse;
    onboarding.accountCreationStatus = "REMOTE_CREATED";
    onboarding.accountCreationError = null;
    await onboarding.save();

    const account = await finishLocalAccountCreation(onboarding, nibssResponse);

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      account: presentAccount(account),
    });
  } catch (error) {
    console.error("======================================");
    console.error("ACCOUNT CREATION ERROR");
    console.error("======================================");

    if (error.response) {
      console.error("NIBSS Status:", error.response.status);
      console.error("NIBSS Response:", error.response.data);
    } else {
      console.error("Message:", error.message);
    }

    console.error("======================================");

    const nibssMessage = error.response?.data?.message || "";

    // If NIBSS says the KYC is already linked, do not stop there. The live
    // account-list response includes kycType + kycID, so we can safely recover
    // the exact account instead of matching by name or guessing.
    if (onboarding && nibssMessage.toLowerCase().includes("already linked")) {
      try {
        const recoveredAccount = await reconcileRemoteAccount(onboarding);

        if (recoveredAccount) {
          return res.status(200).json({
            success: true,
            message: "NIBSS account already existed and was linked locally",
            recovered: true,
            account: presentAccount(recoveredAccount),
          });
        }
      } catch (recoveryError) {
        console.error(
          "NIBSS reconciliation after already-linked response failed:",
          recoveryError.response?.data || recoveryError.message
        );

        if (recoveryError.code === "MULTIPLE_REMOTE_KYC_MATCHES") {
          return res.status(409).json({
            success: false,
            code: recoveryError.code,
            message: recoveryError.message,
            matchingAccountNumbers: recoveryError.matches,
          });
        }

        if (recoveryError.code === "LOCAL_ACCOUNT_LINK_CONFLICT") {
          return res.status(409).json({
            success: false,
            code: recoveryError.code,
            message: recoveryError.message,
          });
        }
      }

      onboarding.accountCreationStatus = "FAILED";
      onboarding.accountCreationError = {
        status: error.response?.status || 409,
        message: nibssMessage,
        occurredAt: new Date(),
      };
      await onboarding.save();

      return res.status(409).json({
        success: false,
        code: "NIBSS_KYC_ALREADY_LINKED",
        message:
          "This KYC ID is already linked in NIBSS, but the matching account could not be recovered automatically.",
        onboardingId: onboarding.onboardingId,
      });
    }

    if (onboarding) {
      onboarding.accountCreationStatus = "FAILED";
      onboarding.accountCreationError = {
        status: error.response?.status || 500,
        message: nibssMessage || error.message,
        occurredAt: new Date(),
      };

      try {
        await onboarding.save();
      } catch (saveError) {
        console.error("Could not save account creation failure state:", saveError.message);
      }
    }

    if (error.code === "MULTIPLE_REMOTE_KYC_MATCHES") {
      return res.status(409).json({
        success: false,
        code: error.code,
        message: error.message,
        matchingAccountNumbers: error.matches,
      });
    }

    if (error.code === "LOCAL_ACCOUNT_LINK_CONFLICT") {
      return res.status(409).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }

    if (error.response?.status === 400) {
      return res.status(400).json({
        success: false,
        message: "NIBSS rejected the account creation request.",
        error: nibssMessage || "Invalid account creation data",
      });
    }

    if (error.response?.status === 401) {
      return res.status(502).json({
        success: false,
        message: "NIBSS authentication failed.",
      });
    }

    if (error.response?.status === 500) {
      return res.status(502).json({
        success: false,
        message: "NIBSS account creation failed.",
        error: nibssMessage || "NIBSS server error",
      });
    }

    if (onboarding?.accountNumber && onboarding?.nibssAccountResponse) {
      return res.status(500).json({
        success: false,
        code: "LOCAL_ACCOUNT_FINALIZATION_FAILED",
        message:
          "NIBSS created the account, but local finalization failed. Retry the same onboardingId to recover safely.",
        accountNumber: onboarding.accountNumber,
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create account",
      error: error.message,
    });
  }
};

const reconcileAccount = async (req, res) => {
  try {
    const { onboardingId } = req.body;

    if (!onboardingId) {
      return res.status(400).json({
        success: false,
        message: "onboardingId is required",
      });
    }

    const onboarding = await Onboarding.findOne({
      onboardingId: String(onboardingId).trim(),
    });

    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: "Onboarding record not found",
      });
    }

    if (onboarding.validationStatus !== "SUCCESS") {
      return res.status(400).json({
        success: false,
        message: "KYC must be validated before account reconciliation",
      });
    }

    const existingAccount = await Account.findOne({ onboarding: onboarding._id });
    if (existingAccount) {
      return res.status(200).json({
        success: true,
        message: "Local account is already linked",
        recovered: false,
        account: presentAccount(existingAccount),
      });
    }

    const recoveredAccount = await reconcileRemoteAccount(onboarding);

    if (!recoveredAccount) {
      return res.status(404).json({
        success: false,
        code: "REMOTE_ACCOUNT_NOT_FOUND",
        message:
          "No NIBSS account matched this onboarding record's exact KYC type and KYC ID.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Existing NIBSS account recovered and linked successfully",
      recovered: true,
      account: presentAccount(recoveredAccount),
    });
  } catch (error) {
    console.error("ACCOUNT RECONCILIATION ERROR:", error.response?.data || error.message);

    if (error.code === "MULTIPLE_REMOTE_KYC_MATCHES") {
      return res.status(409).json({
        success: false,
        code: error.code,
        message: error.message,
        matchingAccountNumbers: error.matches,
      });
    }

    if (error.code === "LOCAL_ACCOUNT_LINK_CONFLICT") {
      return res.status(409).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }

    if (error.response?.status === 401) {
      return res.status(502).json({
        success: false,
        message: "NIBSS authentication failed during account reconciliation",
      });
    }

    return res.status(502).json({
      success: false,
      message: "Unable to reconcile account with NIBSS",
      error: error.response?.data || error.message,
    });
  }
};

module.exports = { createAccount, reconcileAccount };
