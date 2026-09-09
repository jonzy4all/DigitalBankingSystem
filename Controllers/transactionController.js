const Account =
  require("../Models/Account");

const Transaction =
  require("../Models/Transaction");

const nibssService =
  require("../Services/NibssService");


// ======================================================
// TRANSFER
// ======================================================

const transfer =
  async (req, res) => {

    try {

      const {
        to,
        amount,
        narration,
      } = req.body;


      if (!to || !amount) {

        return res.status(400).json({
          success: false,
          message:
            "Recipient account and amount are required.",
        });
      }


      const transferAmount =
        Number(amount);


      if (
        !Number.isFinite(
          transferAmount
        ) ||
        transferAmount <= 0
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid transfer amount.",
        });
      }


      // -----------------------------------------------
      // FIND ONLY CUSTOMER'S ACCOUNT
      // -----------------------------------------------

      const account =
        await Account.findOne({

          customer:
            req.customer._id,

          status:
            "ACTIVE",
        });


      if (!account) {

        return res.status(404).json({
          success: false,
          message:
            "Active account not found.",
        });
      }


      // -----------------------------------------------
      // LOCAL BALANCE CHECK
      // -----------------------------------------------

      if (
        account.balance <
        transferAmount
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Insufficient funds.",
        });
      }


      // -----------------------------------------------
      // NAME ENQUIRY FIRST
      // -----------------------------------------------

      const recipient =
        await nibssService
          .nameEnquiry(to);


      if (
        !recipient ||
        recipient.success === false
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Recipient account could not be verified.",
        });
      }


      // -----------------------------------------------
      // NIBSS TRANSFER
      // -----------------------------------------------

      const result =
        await nibssService.transfer({

          from:
            account.accountNumber,

          to:

            String(to),

          amount:
            transferAmount,
        });


      if (
        !result ||
        result.success === false
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Transfer failed.",
          data:
            result,
        });
      }


      const balanceBefore =
        account.balance;

      const balanceAfter =
        balanceBefore -
        transferAmount;


      account.balance =
        balanceAfter;

      await account.save();


      // -----------------------------------------------
      // SAVE TRANSACTION
      // -----------------------------------------------

      const reference =
        result.reference ||
        result.data?.reference ||
        `TRF-${Date.now()}`;


      await Transaction.create({

        customer:
          req.customer._id,

        account:
          account._id,

        reference,

        type:
          "TRANSFER",

        direction:
          "DEBIT",

        amount:
          transferAmount,

        balanceBefore,

        balanceAfter,

        fromAccount:
          account.accountNumber,

        toAccount:
          String(to),

        narration:
          narration || "",

        status:
          "SUCCESS",

        providerResponse:
          result,
      });


      return res.status(200).json({

        success: true,

        message:
          "Transfer successful.",

        data: {

          reference,

          from:
            account.accountNumber,

          to:
            String(to),

          amount:
            transferAmount,

          balance:
            balanceAfter,
        },
      });

    } catch (error) {

      console.error(
        "Transfer error:",
        error.response?.data ||
          error.message
      );

      return res.status(500).json({
        success: false,
        message:
          "Transfer failed.",
      });
    }
  };


// ======================================================
// MY TRANSACTION HISTORY
// ======================================================

const getMyTransactions =
  async (req, res) => {

    try {

      const transactions =
        await Transaction
          .find({

            customer:
              req.customer._id,

          })
          .sort({
            createdAt: -1,
          });


      return res.status(200).json({

        success: true,

        count:
          transactions.length,

        data:
          transactions,

      });

    } catch (error) {

      console.error(
        "Transaction history error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to retrieve transaction history.",
      });
    }
  };


// ======================================================
// TRANSACTION STATUS
// ======================================================

const getTransactionStatus =
  async (req, res) => {

    try {

      const {
        reference,
      } = req.params;


      // -----------------------------------------------
      // VERIFY LOCAL OWNERSHIP FIRST
      // -----------------------------------------------

      const transaction =
        await Transaction.findOne({

          reference,

          customer:
            req.customer._id,
        });


      if (!transaction) {

        return res.status(404).json({
          success: false,
          message:
            "Transaction not found.",
        });
      }


      const result =
        await nibssService
          .transactionStatus(
            reference
          );


      return res.status(200).json({

        success: true,

        data:
          result,

      });

    } catch (error) {

      console.error(
        "Transaction status error:",
        error.response?.data ||
          error.message
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to retrieve transaction status.",
      });
    }
  };


module.exports = {
  transfer,
  getMyTransactions,
  getTransactionStatus,
};