const mongoose = require("mongoose");

const nibssTokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    tokenType: {
      type: String,
      default: "Bearer",
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.NibssToken ||
  mongoose.model("NibssToken", nibssTokenSchema);