const jwt = require("jsonwebtoken");
const Customer = require("../Models/Customer");
const Account = require("../Models/Account");

const authMiddleware = async (req, res, next) => {
  try {
    // -----------------------------------------
    // Get Authorization header
    // -----------------------------------------

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authorization token is required",
      });
    }

    // Expected:
    // Authorization: Bearer TOKEN

    const parts = authHeader.split(" ");

    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization format",
      });
    }

    const token = parts[1];

    // -----------------------------------------
    // Verify JWT
    // -----------------------------------------

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    // -----------------------------------------
    // Find customer
    // -----------------------------------------

    const customer = await Customer.findById(decoded.id);

    if (!customer) {
      return res.status(401).json({
        success: false,
        message: "Customer account not found",
      });
    }

    // -----------------------------------------
    // Invalidate JWTs issued before the
    // customer's latest password change/reset
    // -----------------------------------------

    if (customer.passwordChangedAt && decoded.iat) {
      const passwordChangedTimestamp = Math.floor(
        customer.passwordChangedAt.getTime() / 1000
      );

      if (passwordChangedTimestamp > decoded.iat) {
        return res.status(401).json({
          success: false,
          message:
            "Password was recently changed. Please log in again.",
        });
      }
    }

    // -----------------------------------------
    // Check customer status
    // -----------------------------------------

    if (customer.status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: "Customer account is not active",
      });
    }

    // -----------------------------------------
    // Check linked bank account
    // -----------------------------------------

    const account = await Account.findById(
      customer.account
    );

    if (!account) {
      return res.status(401).json({
        success: false,
        message: "Linked bank account was not found",
      });
    }

    if (account.status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: "Bank account is blocked or inactive",
      });
    }

    // -----------------------------------------
    // Attach authenticated customer to request
    // -----------------------------------------

    req.user = customer;
    req.account = account;

    next();
  } catch (error) {
    console.error(
      "Authentication error:",
      error.message
    );

    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token",
    });
  }
};

module.exports = authMiddleware;
