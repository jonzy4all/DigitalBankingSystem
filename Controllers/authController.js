const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const Customer = require("../Models/Customer");
const Account = require("../Models/Account");
const Onboarding = require("../Models/Onboarding");
const AuditLog = require("../Models/AuditLog");

const {
  sendEmail,
} = require("../Services/emailService");

const {
  logAudit,
} = require("../utils/auditLogger");

// ======================================================
// CONSTANTS
// ======================================================

const WEAK_TRANSFER_PINS = new Set([
  "0000",
  "1111",
  "2222",
  "3333",
  "4444",
  "5555",
  "6666",
  "7777",
  "8888",
  "9999",
  "1234",
  "4321",
]);

const PASSWORD_RESET_RESPONSE =
  "If an account exists for this email, password reset instructions have been sent.";

// ======================================================
// GENERATE CUSTOMER JWT
// ======================================================

function generateToken(customer) {
  return jwt.sign(
    {
      id: customer._id,
      email: customer.email,
      accountId: customer.account,
    },
    process.env.JWT_SECRET,
    {
      expiresIn:
        process.env.JWT_EXPIRES_IN ||
        "1d",
    }
  );
}

// ======================================================
// REGISTER CUSTOMER
// ======================================================

exports.register = async (req, res) => {
  try {
    const {
      onboardingId,
      email,
      password,
    } = req.body;

    // --------------------------------------------------
    // Validate required fields
    // --------------------------------------------------

    if (
      !onboardingId ||
      !email ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message:
          "onboardingId, email and password are required",
      });
    }

    // --------------------------------------------------
    // Validate password
    // --------------------------------------------------

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters long",
      });
    }

    const normalizedEmail =
      String(email)
        .toLowerCase()
        .trim();

    // --------------------------------------------------
    // Basic email validation
    // --------------------------------------------------

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message:
          "A valid email address is required",
      });
    }

    // --------------------------------------------------
    // Find onboarding
    // --------------------------------------------------

    const onboarding =
      await Onboarding.findOne({
        onboardingId,
      });

    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message:
          "Onboarding record not found",
      });
    }

    // --------------------------------------------------
    // Verify KYC onboarding
    // --------------------------------------------------

    if (
      onboarding.onboardingStatus !==
      "SUCCESS"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Registration is not allowed because onboarding has not been successfully completed",
      });
    }

    // --------------------------------------------------
    // Verify account creation
    // --------------------------------------------------

    if (
      onboarding.accountCreationStatus !==
      "SUCCESS"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Registration is not allowed because a bank account has not been successfully created",
      });
    }

    // --------------------------------------------------
    // Find local bank account
    // --------------------------------------------------

    const account =
      await Account.findOne({
        onboarding:
          onboarding._id,
      });

    if (!account) {
      return res.status(404).json({
        success: false,
        message:
          "Bank account associated with this onboarding was not found",
      });
    }

    // --------------------------------------------------
    // Prevent account from being linked twice
    // --------------------------------------------------

    if (account.customer) {
      return res.status(409).json({
        success: false,
        message:
          "This bank account is already linked to a customer",
      });
    }

    // --------------------------------------------------
    // Check duplicate email
    // --------------------------------------------------

    const existingCustomer =
      await Customer.findOne({
        email:
          normalizedEmail,
      });

    if (existingCustomer) {
      return res.status(409).json({
        success: false,
        message:
          "A customer with this email already exists",
      });
    }

    // --------------------------------------------------
    // Hash password
    // --------------------------------------------------

    const hashedPassword =
      await bcrypt.hash(
        password,
        12
      );

    // --------------------------------------------------
    // Create customer
    // --------------------------------------------------

    const customer =
      await Customer.create({
        firstName:
          onboarding.firstName,

        lastName:
          onboarding.lastName,

        email:
          normalizedEmail,

        phone:
          onboarding.phone,

        dateOfBirth:
          onboarding.dateOfBirth,

        password:
          hashedPassword,

        kycType:
          onboarding.kycType,

        account:
          account._id,

        onboarding:
          onboarding._id,

        status:
          "ACTIVE",
      });

    // --------------------------------------------------
    // Link account to customer
    // --------------------------------------------------

    account.customer =
      customer._id;

    await account.save();

    // --------------------------------------------------
    // Audit registration
    // --------------------------------------------------

    await logAudit({
      req,

      customer:
        customer._id,

      account:
        account._id,

      action:
        "CUSTOMER_REGISTER",

      status:
        "SUCCESS",

      message:
        "Customer registration completed successfully",
    });

    // --------------------------------------------------
    // Generate JWT
    // --------------------------------------------------

    const token =
      generateToken(customer);

    return res.status(201).json({
      success: true,

      message:
        "Customer registration completed successfully",

      data: {
        customerId:
          customer._id,

        firstName:
          customer.firstName,

        lastName:
          customer.lastName,

        email:
          customer.email,

        phone:
          customer.phone,

        accountNumber:
          account.accountNumber,

        accountName:
          account.accountName,

        balance:
          account.balance,

        currency:
          account.currency,

        token,
      },
    });

  } catch (error) {
    console.error(
      "Registration error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message:
        "Customer registration failed",
    });
  }
};

// ======================================================
// LOGIN
// ======================================================

exports.login = async (req, res) => {
  try {
    const {
      email,
      password,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Email and password are required",
      });
    }

    const normalizedEmail =
      String(email)
        .toLowerCase()
        .trim();

    const customer =
      await Customer.findOne({
        email:
          normalizedEmail,
      }).select("+password");

    // --------------------------------------------------
    // Customer does not exist
    // --------------------------------------------------

    if (!customer) {
      await logAudit({
        req,

        action:
          "LOGIN",

        status:
          "FAILED",

        message:
          "Invalid login credentials",

        metadata: {
          email:
            normalizedEmail,
        },
      });

      return res.status(401).json({
        success: false,
        message:
          "Invalid email or password",
      });
    }

    // --------------------------------------------------
    // Check customer status
    // --------------------------------------------------

    if (
      customer.status !==
      "ACTIVE"
    ) {
      await logAudit({
        req,

        customer:
          customer._id,

        account:
          customer.account,

        action:
          "LOGIN",

        status:
          "FAILED",

        message:
          "Inactive customer attempted login",
      });

      return res.status(403).json({
        success: false,
        message:
          "Your customer account is not active",
      });
    }

    // --------------------------------------------------
    // Verify password
    // --------------------------------------------------

    const passwordMatches =
      await bcrypt.compare(
        password,
        customer.password
      );

    if (!passwordMatches) {
      await logAudit({
        req,

        customer:
          customer._id,

        account:
          customer.account,

        action:
          "LOGIN",

        status:
          "FAILED",

        message:
          "Incorrect password",
      });

      return res.status(401).json({
        success: false,
        message:
          "Invalid email or password",
      });
    }

    // --------------------------------------------------
    // Find linked account
    // --------------------------------------------------

    const account =
      await Account.findById(
        customer.account
      );

    if (!account) {
      return res.status(404).json({
        success: false,
        message:
          "Customer bank account was not found",
      });
    }

    if (
      account.status !==
      "ACTIVE"
    ) {
      await logAudit({
        req,

        customer:
          customer._id,

        account:
          account._id,

        action:
          "LOGIN",

        status:
          "FAILED",

        message:
          "Customer attempted login with inactive bank account",
      });

      return res.status(403).json({
        success: false,
        message:
          "Your bank account is not active",
      });
    }

    // --------------------------------------------------
    // Update last login
    // --------------------------------------------------

    customer.lastLogin =
      new Date();

    await customer.save();

    // --------------------------------------------------
    // Generate JWT
    // --------------------------------------------------

    const token =
      generateToken(customer);

    // --------------------------------------------------
    // Audit successful login
    // --------------------------------------------------

    await logAudit({
      req,

      customer:
        customer._id,

      account:
        account._id,

      action:
        "LOGIN",

      status:
        "SUCCESS",

      message:
        "Customer logged in successfully",
    });

    return res.status(200).json({
      success: true,

      message:
        "Login successful",

      data: {
        customerId:
          customer._id,

        firstName:
          customer.firstName,

        lastName:
          customer.lastName,

        email:
          customer.email,

        accountNumber:
          account.accountNumber,

        accountName:
          account.accountName,

        currency:
          account.currency,

        accountStatus:
          account.status,

        token,
      },
    });

  } catch (error) {
    console.error(
      "Login error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message:
        "Login failed",
    });
  }
};

// ======================================================
// GET CURRENT CUSTOMER
// ======================================================

exports.getMe = async (req, res) => {
  try {
    const customer =
      await Customer.findById(
        req.user._id
      ).populate(
        "account",
        "accountNumber accountName bankCode bankName currency status"
      );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message:
          "Customer not found",
      });
    }

    return res.status(200).json({
      success: true,

      data: {
        customerId:
          customer._id,

        firstName:
          customer.firstName,

        lastName:
          customer.lastName,

        email:
          customer.email,

        phone:
          customer.phone,

        kycType:
          customer.kycType,

        account:
          customer.account,
      },
    });

  } catch (error) {
    console.error(
      "Get customer error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve customer information",
    });
  }
};

// ======================================================
// CHANGE PASSWORD
// ======================================================

exports.changePassword = async (
  req,
  res
) => {
  try {
    const {
      currentPassword,
      newPassword,
      confirmPassword,
    } = req.body;

    if (
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      return res.status(400).json({
        success: false,
        message:
          "currentPassword, newPassword and confirmPassword are required",
      });
    }

    if (
      newPassword.length < 8
    ) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be at least 8 characters long",
      });
    }

    if (
      newPassword !==
      confirmPassword
    ) {
      return res.status(400).json({
        success: false,
        message:
          "New password and confirm password do not match",
      });
    }

    const customer =
      await Customer.findById(
        req.user._id
      ).select("+password");

    if (!customer) {
      return res.status(404).json({
        success: false,
        message:
          "Customer not found",
      });
    }

    // --------------------------------------------------
    // Verify current password
    // --------------------------------------------------

    const currentPasswordCorrect =
      await bcrypt.compare(
        currentPassword,
        customer.password
      );

    if (!currentPasswordCorrect) {
      await logAudit({
        req,

        customer:
          customer._id,

        account:
          customer.account,

        action:
          "PASSWORD_CHANGE",

        status:
          "FAILED",

        message:
          "Incorrect current password during password change",
      });

      return res.status(401).json({
        success: false,
        message:
          "Current password is incorrect",
      });
    }

    // --------------------------------------------------
    // Prevent password reuse
    // --------------------------------------------------

    const samePassword =
      await bcrypt.compare(
        newPassword,
        customer.password
      );

    if (samePassword) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be different from the current password",
      });
    }

    // --------------------------------------------------
    // Hash new password
    // --------------------------------------------------

    customer.password =
      await bcrypt.hash(
        newPassword,
        12
      );

    customer.passwordChangedAt =
      new Date();

    // Clear outstanding reset tokens
    customer.passwordResetToken =
      undefined;

    customer.passwordResetExpires =
      undefined;

    await customer.save();

    // --------------------------------------------------
    // Audit password change
    // --------------------------------------------------

    await logAudit({
      req,

      customer:
        customer._id,

      account:
        customer.account,

      action:
        "PASSWORD_CHANGE",

      status:
        "SUCCESS",

      message:
        "Customer changed password successfully",
    });

    // --------------------------------------------------
    // Generate fresh JWT
    // --------------------------------------------------

    const token =
      generateToken(customer);

    return res.status(200).json({
      success: true,

      message:
        "Password changed successfully",

      data: {
        token,
      },
    });

  } catch (error) {
    console.error(
      "Change password error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to change password",
    });
  }
};

// ======================================================
// FORGOT PASSWORD
// ======================================================

exports.forgotPassword = async (
  req,
  res
) => {
  try {
    const {
      email,
    } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message:
          "Email is required",
      });
    }

    const normalizedEmail =
      String(email)
        .toLowerCase()
        .trim();

    const customer =
      await Customer.findOne({
        email:
          normalizedEmail,
      });

    // --------------------------------------------------
    // Prevent email/account enumeration
    // --------------------------------------------------

    if (!customer) {
      return res.status(200).json({
        success: true,
        message:
          PASSWORD_RESET_RESPONSE,
      });
    }

    // --------------------------------------------------
    // Generate random reset token
    // --------------------------------------------------

    const resetToken =
      crypto
        .randomBytes(32)
        .toString("hex");

    // --------------------------------------------------
    // Store only hashed version
    // --------------------------------------------------

    const hashedToken =
      crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

    customer.passwordResetToken =
      hashedToken;

    // Valid for 15 minutes
    customer.passwordResetExpires =
      new Date(
        Date.now() +
          15 * 60 * 1000
      );

    await customer.save();

    // --------------------------------------------------
    // Build password reset URL
    // --------------------------------------------------

    const frontendUrl =
      process.env.FRONTEND_RESET_URL ||
      "http://localhost:8001/app/reset-password";

    // Build a normal HTTPS URL instead of placing the reset token
    // inside a hash fragment. This works more reliably when users
    // open the link from email clients and on Render.
    const resetUrlObject =
      new URL(frontendUrl);

    // Backward compatibility: if the environment variable still uses
    // the old /app/#/reset-password format, convert it automatically.
    if (
      resetUrlObject.hash.includes(
        "reset-password"
      )
    ) {
      resetUrlObject.pathname =
        `${resetUrlObject.pathname.replace(/\/$/, "")}/reset-password`;
      resetUrlObject.hash = "";
    }

    resetUrlObject.searchParams.set(
      "token",
      resetToken
    );

    const resetUrl =
      resetUrlObject.toString();

    const message = `
Hello ${customer.firstName},

A password reset was requested for your OMA Bank account.

Reset your password using this link:

${resetUrl}

This link expires in 15 minutes.

If you did not request this password reset, you can ignore this email.

OMA Bank
`;

    // --------------------------------------------------
    // Send password reset email
    // --------------------------------------------------

    try {
      await sendEmail({
        to:
          customer.email,

        subject:
          "OMA Bank Password Reset",

        text:
          message,

        html: `
          <h2>OMA Bank Password Reset</h2>

          <p>Hello ${customer.firstName},</p>

          <p>
            A password reset was requested for your
            OMA Bank account.
          </p>

          <p>
            <a href="${resetUrl}">
              Reset Password
            </a>
          </p>

          <p>
            This link expires in 15 minutes.
          </p>

          <p>
            If you did not request this password reset,
            you can safely ignore this email.
          </p>

          <p>OMA Bank</p>
        `,
      });

      // ------------------------------------------------
      // Audit only after email successfully sends
      // ------------------------------------------------

      await logAudit({
        req,

        customer:
          customer._id,

        account:
          customer.account,

        action:
          "PASSWORD_RESET_REQUEST",

        status:
          "SUCCESS",

        message:
          "Customer requested a password reset",
      });

    } catch (emailError) {
      console.error(
        "Password reset email error:",
        emailError.message
      );

      // ------------------------------------------------
      // Delete unusable reset token
      // ------------------------------------------------

      customer.passwordResetToken =
        undefined;

      customer.passwordResetExpires =
        undefined;

      await customer.save();

      await logAudit({
        req,

        customer:
          customer._id,

        account:
          customer.account,

        action:
          "PASSWORD_RESET_REQUEST",

        status:
          "FAILED",

        message:
          "Password reset email could not be sent",

        metadata: {
          error:
            emailError.message,
        },
      });

      return res.status(500).json({
        success: false,
        message:
          "Password reset email could not be sent",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        PASSWORD_RESET_RESPONSE,
    });

  } catch (error) {
    console.error(
      "Forgot password error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to process password reset request",
    });
  }
};

// ======================================================
// RESET PASSWORD
// ======================================================

exports.resetPassword = async (
  req,
  res
) => {
  try {
    const {
      token,
    } = req.params;

    const {
      newPassword,
      confirmPassword,
    } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message:
          "Password reset token is required",
      });
    }

    if (
      !newPassword ||
      !confirmPassword
    ) {
      return res.status(400).json({
        success: false,
        message:
          "newPassword and confirmPassword are required",
      });
    }

    if (
      newPassword.length < 8
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters long",
      });
    }

    if (
      newPassword !==
      confirmPassword
    ) {
      return res.status(400).json({
        success: false,
        message:
          "New password and confirm password do not match",
      });
    }

    // --------------------------------------------------
    // Hash token from URL
    // --------------------------------------------------

    const hashedToken =
      crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

    // --------------------------------------------------
    // Find valid reset token
    // --------------------------------------------------

    const customer =
      await Customer.findOne({
        passwordResetToken:
          hashedToken,

        passwordResetExpires: {
          $gt:
            new Date(),
        },
      }).select(
        "+password +passwordResetToken +passwordResetExpires"
      );

    if (!customer) {
      return res.status(400).json({
        success: false,
        message:
          "Password reset token is invalid or has expired",
      });
    }

    // --------------------------------------------------
    // Prevent reuse of existing password
    // --------------------------------------------------

    const samePassword =
      await bcrypt.compare(
        newPassword,
        customer.password
      );

    if (samePassword) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be different from the current password",
      });
    }

    // --------------------------------------------------
    // Hash new password
    // --------------------------------------------------

    customer.password =
      await bcrypt.hash(
        newPassword,
        12
      );

    customer.passwordChangedAt =
      new Date();

    // Reset token can never be reused
    customer.passwordResetToken =
      undefined;

    customer.passwordResetExpires =
      undefined;

    await customer.save();

    // --------------------------------------------------
    // Audit successful reset
    // --------------------------------------------------

    await logAudit({
      req,

      customer:
        customer._id,

      account:
        customer.account,

      action:
        "PASSWORD_RESET",

      status:
        "SUCCESS",

      message:
        "Customer reset password successfully",
    });

    // --------------------------------------------------
    // Issue new JWT
    // --------------------------------------------------

    const newToken =
      generateToken(customer);

    return res.status(200).json({
      success: true,

      message:
        "Password reset successfully",

      data: {
        token:
          newToken,
      },
    });

  } catch (error) {
    console.error(
      "Reset password error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to reset password",
    });
  }
};

// ======================================================
// CUSTOMER SECURITY ACTIVITY
// ======================================================

exports.getSecurityActivity =
  async (req, res) => {
    try {
      const logs =
        await AuditLog.find({
          customer:
            req.user._id,
        })
          .sort({
            createdAt: -1,
          })
          .limit(50)
          .select(
            "action status message ipAddress userAgent createdAt"
          );

      return res.status(200).json({
        success: true,

        count:
          logs.length,

        data:
          logs,
      });

    } catch (error) {
      console.error(
        "Security activity error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to retrieve security activity",
      });
    }
  };

// ======================================================
// SET TRANSFER PIN
// ======================================================

exports.setTransferPin = async (
  req,
  res
) => {
  try {
    const {
      password,
      pin,
      confirmPin,
    } = req.body;

    if (
      !password ||
      !pin ||
      !confirmPin
    ) {
      return res.status(400).json({
        success: false,
        message:
          "password, pin and confirmPin are required",
      });
    }

    const pinString =
      String(pin);

    const confirmPinString =
      String(confirmPin);

    // --------------------------------------------------
    // PIN must be exactly four digits
    // --------------------------------------------------

    if (
      !/^\d{4}$/.test(
        pinString
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Transfer PIN must be exactly 4 digits",
      });
    }

    if (
      pinString !==
      confirmPinString
    ) {
      return res.status(400).json({
        success: false,
        message:
          "PIN and confirm PIN do not match",
      });
    }

    // --------------------------------------------------
    // Reject predictable PINs
    // --------------------------------------------------

    if (
      WEAK_TRANSFER_PINS.has(
        pinString
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please choose a less predictable transfer PIN",
      });
    }

    // --------------------------------------------------
    // Retrieve customer password and PIN
    // --------------------------------------------------

    const customer =
      await Customer.findById(
        req.user._id
      ).select(
        "+password +transferPin"
      );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message:
          "Customer not found",
      });
    }

    if (customer.transferPin) {
      return res.status(409).json({
        success: false,
        message:
          "Transfer PIN already exists. Use change transfer PIN instead.",
      });
    }

    // --------------------------------------------------
    // Verify login password
    // --------------------------------------------------

    const passwordCorrect =
      await bcrypt.compare(
        password,
        customer.password
      );

    if (!passwordCorrect) {
      await logAudit({
        req,

        customer:
          customer._id,

        account:
          customer.account,

        action:
          "TRANSFER_PIN_SET",

        status:
          "FAILED",

        message:
          "Incorrect password while creating transfer PIN",
      });

      return res.status(401).json({
        success: false,
        message:
          "Password is incorrect",
      });
    }

    // --------------------------------------------------
    // Hash transfer PIN
    // --------------------------------------------------

    customer.transferPin =
      await bcrypt.hash(
        pinString,
        12
      );

    customer.failedPinAttempts =
      0;

    customer.transferPinLockedUntil =
      null;

    await customer.save();

    // --------------------------------------------------
    // Audit
    // --------------------------------------------------

    await logAudit({
      req,

      customer:
        customer._id,

      account:
        customer.account,

      action:
        "TRANSFER_PIN_SET",

      status:
        "SUCCESS",

      message:
        "Customer created transfer PIN",
    });

    return res.status(200).json({
      success: true,
      message:
        "Transfer PIN created successfully",
    });

  } catch (error) {
    console.error(
      "Set transfer PIN error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to create transfer PIN",
    });
  }
};

// ======================================================
// CHANGE TRANSFER PIN
// ======================================================

exports.changeTransferPin = async (
  req,
  res
) => {
  try {
    const {
      currentPin,
      newPin,
      confirmPin,
    } = req.body;

    if (
      !currentPin ||
      !newPin ||
      !confirmPin
    ) {
      return res.status(400).json({
        success: false,
        message:
          "currentPin, newPin and confirmPin are required",
      });
    }

    const currentPinString =
      String(currentPin);

    const newPinString =
      String(newPin);

    const confirmPinString =
      String(confirmPin);

    if (
      !/^\d{4}$/.test(
        currentPinString
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Current transfer PIN must be exactly 4 digits",
      });
    }

    if (
      !/^\d{4}$/.test(
        newPinString
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "New transfer PIN must be exactly 4 digits",
      });
    }

    if (
      newPinString !==
      confirmPinString
    ) {
      return res.status(400).json({
        success: false,
        message:
          "New PIN and confirm PIN do not match",
      });
    }

    if (
      WEAK_TRANSFER_PINS.has(
        newPinString
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please choose a less predictable transfer PIN",
      });
    }

    const customer =
      await Customer.findById(
        req.user._id
      ).select("+transferPin");

    if (!customer) {
      return res.status(404).json({
        success: false,
        message:
          "Customer not found",
      });
    }

    if (!customer.transferPin) {
      return res.status(400).json({
        success: false,
        message:
          "You have not created a transfer PIN yet",
      });
    }

    // --------------------------------------------------
    // Check PIN lock
    // --------------------------------------------------

    if (
      customer.transferPinLockedUntil &&
      customer.transferPinLockedUntil >
        new Date()
    ) {
      return res.status(423).json({
        success: false,
        message:
          "Transfer PIN is temporarily locked. Please try again later.",
      });
    }

    // --------------------------------------------------
    // Verify current PIN
    // --------------------------------------------------

    const currentPinCorrect =
      await bcrypt.compare(
        currentPinString,
        customer.transferPin
      );

    if (!currentPinCorrect) {
      customer.failedPinAttempts =
        (
          customer.failedPinAttempts ||
          0
        ) + 1;

      let locked = false;

      if (
        customer.failedPinAttempts >=
        5
      ) {
        customer.transferPinLockedUntil =
          new Date(
            Date.now() +
              15 * 60 * 1000
          );

        customer.failedPinAttempts =
          0;

        locked = true;
      }

      await customer.save();

      await logAudit({
        req,

        customer:
          customer._id,

        account:
          customer.account,

        action:
          "TRANSFER_PIN_CHANGE",

        status:
          "FAILED",

        message:
          locked
            ? "Transfer PIN locked after repeated incorrect attempts"
            : "Incorrect current transfer PIN",
      });

      if (locked) {
        return res.status(423).json({
          success: false,
          message:
            "Transfer PIN has been temporarily locked because of too many incorrect attempts",
        });
      }

      return res.status(401).json({
        success: false,
        message:
          "Current transfer PIN is incorrect",
      });
    }

    // --------------------------------------------------
    // Prevent reuse of current PIN
    // --------------------------------------------------

    const samePin =
      await bcrypt.compare(
        newPinString,
        customer.transferPin
      );

    if (samePin) {
      return res.status(400).json({
        success: false,
        message:
          "New transfer PIN must be different from the current PIN",
      });
    }

    // --------------------------------------------------
    // Hash new PIN
    // --------------------------------------------------

    customer.transferPin =
      await bcrypt.hash(
        newPinString,
        12
      );

    customer.failedPinAttempts =
      0;

    customer.transferPinLockedUntil =
      null;

    await customer.save();

    // --------------------------------------------------
    // Audit
    // --------------------------------------------------

    await logAudit({
      req,

      customer:
        customer._id,

      account:
        customer.account,

      action:
        "TRANSFER_PIN_CHANGE",

      status:
        "SUCCESS",

      message:
        "Customer changed transfer PIN",
    });

    return res.status(200).json({
      success: true,
      message:
        "Transfer PIN changed successfully",
    });

  } catch (error) {
    console.error(
      "Change transfer PIN error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to change transfer PIN",
    });
  }
};

// ======================================================
// CUSTOMER SELF-BLOCK ACCOUNT
// ======================================================

exports.blockAccount = async (
  req,
  res
) => {
  try {
    const {
      password,
      reason,
    } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message:
          "Password is required to block your account",
      });
    }

    // --------------------------------------------------
    // Retrieve customer password
    // --------------------------------------------------

    const customer =
      await Customer.findById(
        req.user._id
      ).select("+password");

    if (!customer) {
      return res.status(404).json({
        success: false,
        message:
          "Customer not found",
      });
    }

    if (
      customer.status ===
      "BLOCKED"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Your account is already blocked",
      });
    }

    if (
      customer.status ===
      "CLOSED"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "A closed account cannot be modified",
      });
    }

    // --------------------------------------------------
    // Verify password
    // --------------------------------------------------

    const passwordCorrect =
      await bcrypt.compare(
        password,
        customer.password
      );

    if (!passwordCorrect) {
      await logAudit({
        req,

        customer:
          customer._id,

        account:
          customer.account,

        action:
          "ACCOUNT_BLOCK",

        status:
          "FAILED",

        message:
          "Incorrect password during account block request",
      });

      return res.status(401).json({
        success: false,
        message:
          "Password is incorrect",
      });
    }

    // --------------------------------------------------
    // Find bank account
    // --------------------------------------------------

    const account =
      await Account.findById(
        customer.account
      );

    if (!account) {
      return res.status(404).json({
        success: false,
        message:
          "Bank account not found",
      });
    }

    if (
      account.status ===
      "CLOSED"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "A closed bank account cannot be blocked",
      });
    }

    const blockReason =
      String(
        reason ||
        "Customer requested account block"
      )
        .trim()
        .slice(0, 250);

    const blockedAt =
      new Date();

    // --------------------------------------------------
    // Block customer
    // --------------------------------------------------

    customer.status =
      "BLOCKED";

    customer.blockedAt =
      blockedAt;

    customer.blockReason =
      blockReason;

    customer.blockedBy =
      "CUSTOMER";

    // --------------------------------------------------
    // Block local account
    // --------------------------------------------------

    account.status =
      "BLOCKED";

    account.blockedAt =
      blockedAt;

    account.blockReason =
      blockReason;

    account.blockedBy =
      "CUSTOMER";

    await customer.save();
    await account.save();

    // --------------------------------------------------
    // Audit
    // --------------------------------------------------

    await logAudit({
      req,

      customer:
        customer._id,

      account:
        account._id,

      action:
        "ACCOUNT_BLOCK",

      status:
        "SUCCESS",

      message:
        "Customer blocked account",

      metadata: {
        accountNumber:
          account.accountNumber,

        reason:
          blockReason,
      },
    });

    return res.status(200).json({
      success: true,

      message:
        "Your account has been blocked successfully",

      data: {
        accountNumber:
          account.accountNumber,

        status:
          account.status,

        blockedAt,

        reason:
          blockReason,
      },
    });

  } catch (error) {
    console.error(
      "Block account error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to block account",
    });
  }
};