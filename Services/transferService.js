const mongoose = require("mongoose");
const Account = require("../Models/Account");
const Transaction = require("../Models/Transaction");
const generateTransactionReference = require("../utils/transactionReference");

async function executeLocalTransfer({
  senderAccountId,
  senderCustomerId,
  receiverAccountNumber,
  amount,
  description,
  idempotencyKey,
}) {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    /*
     * ---------------------------------------------------
     * 1. Check for duplicate request
     * ---------------------------------------------------
     */

    if (idempotencyKey) {
      const existingTransaction = await Transaction.findOne({
        idempotencyKey,
        customer: senderCustomerId,
      }).session(session);

      if (existingTransaction) {
        return {
          duplicate: true,
          transaction: existingTransaction,
        };
      }
    }

    /*
     * ---------------------------------------------------
     * 2. Find sender
     * ---------------------------------------------------
     */

    const sender = await Account.findOne({
      _id: senderAccountId,
      customer: senderCustomerId,
      status: "ACTIVE",
    }).session(session);

    if (!sender) {
      throw new Error("Sender account not found");
    }

    /*
     * ---------------------------------------------------
     * 3. Prevent self-transfer
     * ---------------------------------------------------
     */

    if (sender.accountNumber === receiverAccountNumber) {
      throw new Error("You cannot transfer money to your own account");
    }

    /*
     * ---------------------------------------------------
     * 4. Find receiver
     * ---------------------------------------------------
     */

    const receiver = await Account.findOne({
      accountNumber: receiverAccountNumber,
      status: "ACTIVE",
    }).session(session);

    if (!receiver) {
      throw new Error("Receiver account not found");
    }

    /*
     * ---------------------------------------------------
     * 5. Check balance
     * ---------------------------------------------------
     */

    if (sender.balance < amount) {
      throw new Error("Insufficient funds");
    }

    /*
     * ---------------------------------------------------
     * 6. Store balances before transaction
     * ---------------------------------------------------
     */

    const senderBalanceBefore = sender.balance;
    const receiverBalanceBefore = receiver.balance;

    /*
     * ---------------------------------------------------
     * 7. Calculate new balances
     * ---------------------------------------------------
     */

    const senderBalanceAfter =
      senderBalanceBefore - amount;

    const receiverBalanceAfter =
      receiverBalanceBefore + amount;

    /*
     * ---------------------------------------------------
     * 8. Update sender
     * ---------------------------------------------------
     */

    sender.balance = senderBalanceAfter;

    await sender.save({ session });

    /*
     * ---------------------------------------------------
     * 9. Update receiver
     * ---------------------------------------------------
     */

    receiver.balance = receiverBalanceAfter;

    await receiver.save({ session });

    /*
     * ---------------------------------------------------
     * 10. Generate transaction reference
     * ---------------------------------------------------
     */

    const reference = generateTransactionReference();

    /*
     * ---------------------------------------------------
     * 11. Create sender transaction
     * ---------------------------------------------------
     */

    await Transaction.create(
      [
        {
          reference,
          account: sender._id,
          customer: sender.customer,

          type: "TRANSFER",
          direction: "DEBIT",

          amount,

          balanceBefore: senderBalanceBefore,
          balanceAfter: senderBalanceAfter,

          senderAccount: sender.accountNumber,
          receiverAccount: receiver.accountNumber,

          description:
            description ||
            `Transfer to ${receiver.accountNumber}`,

          status: "SUCCESS",

          idempotencyKey,
        },
      ],
      { session }
    );

    /*
     * ---------------------------------------------------
     * 12. Create receiver transaction
     * ---------------------------------------------------
     */

    await Transaction.create(
      [
        {
          reference,
          account: receiver._id,
          customer: receiver.customer,

          type: "TRANSFER",
          direction: "CREDIT",

          amount,

          balanceBefore: receiverBalanceBefore,
          balanceAfter: receiverBalanceAfter,

          senderAccount: sender.accountNumber,
          receiverAccount: receiver.accountNumber,

          description:
            description ||
            `Transfer from ${sender.accountNumber}`,

          status: "SUCCESS",
        },
      ],
      { session }
    );

    /*
     * ---------------------------------------------------
     * 13. Commit everything
     * ---------------------------------------------------
     */

    await session.commitTransaction();

    return {
      duplicate: false,
      transaction: {
        reference,
        amount,
        senderAccount: sender.accountNumber,
        receiverAccount: receiver.accountNumber,
        senderBalance: senderBalanceAfter,
        receiverBalance: receiverBalanceAfter,
        status: "SUCCESS",
      },
    };
  } catch (error) {
    /*
     * If anything fails, ALL database changes
     * are rolled back.
     */

    await session.abortTransaction();

    throw error;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  executeLocalTransfer,
};