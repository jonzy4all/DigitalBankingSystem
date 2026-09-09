const Account = require("../Models/Account");
const Customer = require("../Models/Customer");
const Transaction = require("../Models/Transaction");
const AuditLog = require("../Models/AuditLog");

const {
  logAudit,
} = require("../utils/auditLogger");


// ======================================================
// ADMIN BLOCK CUSTOMER ACCOUNT
// ======================================================
exports.blockAccount = async (req, res) => {
  try {
    const { accountNumber } = req.params;
    const reason = String(req.body?.reason || "").trim();

    if (!accountNumber || !/^\d{10}$/.test(accountNumber)) {
      return res.status(400).json({
        success: false,
        message: "A valid 10-digit account number is required",
      });
    }

    if (reason.length < 3) {
      return res.status(400).json({
        success: false,
        message: "A reason for blocking the account is required",
      });
    }

    const account = await Account.findOne({ accountNumber });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Bank account not found",
      });
    }

    if (account.status === "CLOSED") {
      return res.status(403).json({
        success: false,
        message: "A closed account cannot be blocked",
      });
    }

    const customer = await Customer.findById(account.customer);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer linked to account was not found",
      });
    }

    if (account.status === "BLOCKED" && customer.status === "BLOCKED") {
      return res.status(200).json({
        success: true,
        message: "Account is already blocked",
        data: {
          accountNumber: account.accountNumber,
          accountStatus: account.status,
          customerStatus: customer.status,
        },
      });
    }

    const blockedAt = new Date();

    customer.status = "BLOCKED";
    customer.blockedAt = blockedAt;
    customer.blockReason = reason;
    customer.blockedBy = "ADMIN";

    account.status = "BLOCKED";
    account.blockedAt = blockedAt;
    account.blockReason = reason;
    account.blockedBy = "ADMIN";

    await customer.save();
    await account.save();

    await logAudit({
      req,
      customer: customer._id,
      account: account._id,
      action: "ACCOUNT_BLOCK",
      status: "SUCCESS",
      message: "Account blocked by administrator",
      metadata: {
        accountNumber: account.accountNumber,
        reason,
        adminSource: "INTERNAL_ADMIN",
      },
    });

    return res.status(200).json({
      success: true,
      message: "Account blocked successfully",
      data: {
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        customerStatus: customer.status,
        accountStatus: account.status,
        reason,
      },
    });
  } catch (error) {
    console.error("Admin block error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to block account",
      error: error.message,
    });
  }
};

// ======================================================
// ADMIN UNBLOCK CUSTOMER ACCOUNT
// ======================================================
exports.unblockAccount = async (
  req,
  res
) => {
  try {
    const {
      accountNumber,
    } = req.params;

    if (
      !accountNumber ||
      !/^\d{10}$/.test(
        accountNumber
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A valid 10-digit account number is required",
      });
    }

    // -----------------------------------------
    // Find account
    // -----------------------------------------
    const account =
      await Account.findOne({
        accountNumber,
      });

    if (!account) {
      return res.status(404).json({
        success: false,
        message:
          "Bank account not found",
      });
    }

    if (account.status === "CLOSED") {
      return res.status(403).json({
        success: false,
        message:
          "A closed account cannot be unblocked",
      });
    }

    // -----------------------------------------
    // Find linked customer
    // -----------------------------------------
    const customer =
      await Customer.findById(
        account.customer
      );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message:
          "Customer linked to account was not found",
      });
    }

    if (
      account.status === "ACTIVE" &&
      customer.status === "ACTIVE"
    ) {
      return res.status(200).json({
        success: true,

        message:
          "Account is already active",

        data: {
          accountNumber:
            account.accountNumber,

          status:
            account.status,
        },
      });
    }

    // -----------------------------------------
    // Reactivate customer
    // -----------------------------------------
    customer.status =
      "ACTIVE";

    customer.blockedAt =
      null;

    customer.blockReason =
      null;

    customer.blockedBy =
      null;

    // Reset PIN lock as part of
    // reviewed admin unblock.
    customer.failedPinAttempts = 0;

    customer.transferPinLockedUntil =
      null;

    // -----------------------------------------
    // Reactivate account
    // -----------------------------------------
    account.status =
      "ACTIVE";

    account.blockedAt =
      null;

    account.blockReason =
      null;

    account.blockedBy =
      null;

    await customer.save();
    await account.save();

    // -----------------------------------------
    // Audit
    // -----------------------------------------
    await logAudit({
      req,

      customer:
        customer._id,

      account:
        account._id,

      action:
        "ACCOUNT_UNBLOCK",

      status:
        "SUCCESS",

      message:
        "Account unblocked by administrator",

      metadata: {
        accountNumber:
          account.accountNumber,

        adminSource:
          "INTERNAL_ADMIN",
      },
    });

    return res.status(200).json({
      success: true,

      message:
        "Account unblocked successfully",

      data: {
        accountNumber:
          account.accountNumber,

        accountName:
          account.accountName,

        customerStatus:
          customer.status,

        accountStatus:
          account.status,
      },
    });

  } catch (error) {
    console.error(
      "Admin unblock error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to unblock account",
      error:
        error.message,
    });
  }
};

// ======================================================
// ADMIN DASHBOARD SUMMARY
// ======================================================
exports.getDashboard = async (req, res) => {
  try {
    const [
      totalCustomers,
      activeCustomers,
      blockedCustomers,
      totalAccounts,
      activeAccounts,
      blockedAccounts,
      totalTransactions,
      successfulTransactions,
      pendingTransactions,
      failedTransactions,
    ] = await Promise.all([
      Customer.countDocuments(),

      Customer.countDocuments({
        status: "ACTIVE",
      }),

      Customer.countDocuments({
        status: "BLOCKED",
      }),

      Account.countDocuments(),

      Account.countDocuments({
        status: "ACTIVE",
      }),

      Account.countDocuments({
        status: "BLOCKED",
      }),

      Transaction.countDocuments(),

      Transaction.countDocuments({
        status: "SUCCESS",
      }),

      Transaction.countDocuments({
        status: "PENDING",
      }),

      Transaction.countDocuments({
        status: "FAILED",
      }),
    ]);

    // --------------------------------------------------
    // Calculate transfer totals
    // --------------------------------------------------
    const transferTotals =
      await Transaction.aggregate([
        {
          $match: {
            type: "TRANSFER",
            direction: "DEBIT",
            status: "SUCCESS",
          },
        },

        {
          $group: {
            _id: null,

            totalValue: {
              $sum: "$amount",
            },

            count: {
              $sum: 1,
            },
          },
        },
      ]);

    const totalTransferValue =
      transferTotals.length > 0
        ? Number(
            transferTotals[0].totalValue
          )
        : 0;

    const successfulTransferCount =
      transferTotals.length > 0
        ? Number(
            transferTotals[0].count
          )
        : 0;

    // --------------------------------------------------
    // Today's statistics
    // --------------------------------------------------
    const startOfToday =
      new Date();

    startOfToday.setHours(
      0,
      0,
      0,
      0
    );

    const todayTransactions =
      await Transaction.aggregate([
        {
          $match: {
            type: "TRANSFER",

            direction: "DEBIT",

            status: "SUCCESS",

            createdAt: {
              $gte: startOfToday,
            },
          },
        },

        {
          $group: {
            _id: null,

            totalValue: {
              $sum: "$amount",
            },

            count: {
              $sum: 1,
            },
          },
        },
      ]);

    const todayTransferValue =
      todayTransactions.length > 0
        ? Number(
            todayTransactions[0]
              .totalValue
          )
        : 0;

    const todayTransferCount =
      todayTransactions.length > 0
        ? Number(
            todayTransactions[0]
              .count
          )
        : 0;

    return res.status(200).json({
      success: true,

      message:
        "Admin dashboard retrieved successfully",

      data: {
        customers: {
          total: totalCustomers,
          active: activeCustomers,
          blocked: blockedCustomers,
        },

        accounts: {
          total: totalAccounts,
          active: activeAccounts,
          blocked: blockedAccounts,
        },

        transactions: {
          total: totalTransactions,
          successful:
            successfulTransactions,
          pending:
            pendingTransactions,
          failed:
            failedTransactions,
        },

        transfers: {
          successfulCount:
            successfulTransferCount,

          totalValue:
            totalTransferValue,

          todayCount:
            todayTransferCount,

          todayValue:
            todayTransferValue,
        },
      },
    });

  } catch (error) {
    console.error(
      "Admin dashboard error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve admin dashboard",
      error: error.message,
    });
  }
};


// ======================================================
// ADMIN - LIST CUSTOMERS
// ======================================================
exports.getCustomers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
    } = req.query;

    const pageNumber =
      Math.max(
        1,
        Number(page) || 1
      );

    const pageLimit =
      Math.min(
        100,
        Math.max(
          1,
          Number(limit) || 20
        )
      );

    const query = {};

    if (status) {
      query.status =
        String(status)
          .toUpperCase();
    }

    // --------------------------------------------------
    // Search customer by name/email/phone
    // --------------------------------------------------
    if (search) {
      const searchRegex =
        new RegExp(
          String(search),
          "i"
        );

      query.$or = [
        {
          firstName:
            searchRegex,
        },

        {
          lastName:
            searchRegex,
        },

        {
          email:
            searchRegex,
        },

        {
          phone:
            searchRegex,
        },
      ];
    }

    const total =
      await Customer.countDocuments(
        query
      );

    const customers =
      await Customer.find(query)
        .select(
          "-password -transferPin -passwordResetToken -passwordResetExpires"
        )
        .populate(
          "account",
          "accountNumber accountName bankName bankCode balance currency status"
        )
        .sort({
          createdAt: -1,
        })
        .skip(
          (pageNumber - 1) *
            pageLimit
        )
        .limit(
          pageLimit
        );

    return res.status(200).json({
      success: true,

      count:
        customers.length,

      pagination: {
        currentPage:
          pageNumber,

        limit:
          pageLimit,

        totalCustomers:
          total,

        totalPages:
          Math.ceil(
            total /
              pageLimit
          ),
      },

      data:
        customers,
    });

  } catch (error) {
    console.error(
      "Admin customer list error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve customers",
      error: error.message,
    });
  }
};


// ======================================================
// ADMIN - LIST ACCOUNTS
// ======================================================
exports.getAccounts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
    } = req.query;

    const pageNumber =
      Math.max(
        1,
        Number(page) || 1
      );

    const pageLimit =
      Math.min(
        100,
        Math.max(
          1,
          Number(limit) || 20
        )
      );

    const query = {};

    if (status) {
      query.status =
        String(status)
          .toUpperCase();
    }

    if (search) {
      const searchRegex =
        new RegExp(
          String(search),
          "i"
        );

      query.$or = [
        {
          accountNumber:
            searchRegex,
        },

        {
          accountName:
            searchRegex,
        },
      ];
    }

    const total =
      await Account.countDocuments(
        query
      );

    const accounts =
      await Account.find(query)
        .populate(
          "customer",
          "firstName lastName email phone status"
        )
        .sort({
          createdAt: -1,
        })
        .skip(
          (pageNumber - 1) *
            pageLimit
        )
        .limit(
          pageLimit
        );

    return res.status(200).json({
      success: true,

      count:
        accounts.length,

      pagination: {
        currentPage:
          pageNumber,

        limit:
          pageLimit,

        totalAccounts:
          total,

        totalPages:
          Math.ceil(
            total /
              pageLimit
          ),
      },

      data:
        accounts,
    });

  } catch (error) {
    console.error(
      "Admin account list error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve accounts",
      error: error.message,
    });
  }
};


// ======================================================
// ADMIN - BLOCKED ACCOUNTS
// ======================================================
exports.getBlockedAccounts =
  async (req, res) => {
    try {
      const accounts =
        await Account.find({
          status: "BLOCKED",
        })
          .populate(
            "customer",
            "firstName lastName email phone status blockedAt blockReason blockedBy"
          )
          .sort({
            blockedAt: -1,
          });

      return res.status(200).json({
        success: true,

        count:
          accounts.length,

        data:
          accounts,
      });

    } catch (error) {
      console.error(
        "Blocked accounts error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to retrieve blocked accounts",
        error:
          error.message,
      });
    }
  };


// ======================================================
// ADMIN - TRANSACTION LIST
// ======================================================
exports.getTransactions =
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        direction,
        reference,
      } = req.query;

      const pageNumber =
        Math.max(
          1,
          Number(page) || 1
        );

      const pageLimit =
        Math.min(
          100,
          Math.max(
            1,
            Number(limit) || 20
          )
        );

      const query = {};

      if (status) {
        query.status =
          String(status)
            .toUpperCase();
      }

      if (direction) {
        query.direction =
          String(direction)
            .toUpperCase();
      }

      if (reference) {
        query.$or = [
          {
            reference: {
              $regex:
                String(reference),

              $options:
                "i",
            },
          },

          {
            nibssReference: {
              $regex:
                String(reference),

              $options:
                "i",
            },
          },
        ];
      }

      const total =
        await Transaction.countDocuments(
          query
        );

      const transactions =
        await Transaction.find(
          query
        )
          .populate(
            "customer",
            "firstName lastName email"
          )
          .populate(
            "account",
            "accountNumber accountName"
          )
          .sort({
            createdAt: -1,
          })
          .skip(
            (pageNumber - 1) *
              pageLimit
          )
          .limit(
            pageLimit
          );

      return res.status(200).json({
        success: true,

        count:
          transactions.length,

        pagination: {
          currentPage:
            pageNumber,

          limit:
            pageLimit,

          totalTransactions:
            total,

          totalPages:
            Math.ceil(
              total /
                pageLimit
            ),
        },

        data:
          transactions,
      });

    } catch (error) {
      console.error(
        "Admin transactions error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to retrieve transactions",
        error:
          error.message,
      });
    }
  };


// ======================================================
// ADMIN - AUDIT LOGS
// ======================================================
exports.getAuditLogs =
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 50,
        action,
        status,
      } = req.query;

      const pageNumber =
        Math.max(
          1,
          Number(page) || 1
        );

      const pageLimit =
        Math.min(
          100,
          Math.max(
            1,
            Number(limit) || 50
          )
        );

      const query = {};

      if (action) {
        query.action =
          String(action)
            .toUpperCase();
      }

      if (status) {
        query.status =
          String(status)
            .toUpperCase();
      }

      const total =
        await AuditLog.countDocuments(
          query
        );

      const logs =
        await AuditLog.find(query)
          .populate(
            "customer",
            "firstName lastName email"
          )
          .populate(
            "account",
            "accountNumber accountName"
          )
          .sort({
            createdAt: -1,
          })
          .skip(
            (pageNumber - 1) *
              pageLimit
          )
          .limit(
            pageLimit
          );

      return res.status(200).json({
        success: true,

        count:
          logs.length,

        pagination: {
          currentPage:
            pageNumber,

          limit:
            pageLimit,

          totalLogs:
            total,

          totalPages:
            Math.ceil(
              total /
                pageLimit
            ),
        },

        data:
          logs,
      });

    } catch (error) {
      console.error(
        "Admin audit logs error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to retrieve audit logs",
        error:
          error.message,
      });
    }
  };