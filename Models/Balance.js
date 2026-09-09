const mongoose = require('mongoose');

const balanceSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer ID is required'],
      index: true
    },
    accountNumber: {
      type: String,
      required: [true, 'Account number is required'],
      trim: true,
      index: true
    },
    balance: {
      type: Number,
      required: [true, 'Balance is required'],
      default: 0
    },
    currency: {
      type: String,
      default: 'NGN'
    },
    availableBalance: {
      type: Number,
      default: 0
    },
    ledgerBalance: {
      type: Number,
      default: 0
    },
    balanceAsOfDate: {
      type: Date,
      default: Date.now
    },
    externalResponse: {
      type: mongoose.Schema.Types.Mixed
    },
    source: {
      type: String,
      enum: ['System', 'NIBSS', 'Manual'],
      default: 'System'
    }
  },
  {
    timestamps: true
  }
);

// Indexes for quick lookups
balanceSchema.index({ customerId: 1 });
balanceSchema.index({ accountNumber: 1 });
balanceSchema.index({ createdAt: -1 });

const Balance = mongoose.model('Balance', balanceSchema);

module.exports = Balance;
