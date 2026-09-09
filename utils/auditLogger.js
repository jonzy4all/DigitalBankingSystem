const AuditLog =
  require("../Models/AuditLog");

const sensitiveKeys =
  new Set([
    "password",
    "currentPassword",
    "newPassword",
    "confirmPassword",
    "token",
    "authorization",
    "apiKey",
    "apiSecret",
    "BREVO_API_KEY",
    "NIBSS_API_KEY",
    "NIBSS_API_SECRET",
    "JWT_SECRET",
    "ADMIN_API_KEY",
  ]);

const sanitize = (value) => {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitize);
  }

  if (
    typeof value === "object"
  ) {
    const cleanObject = {};

    for (
      const [key, item]
      of Object.entries(value)
    ) {
      if (
        sensitiveKeys.has(key)
      ) {
        cleanObject[key] =
          "[REDACTED]";
      } else {
        cleanObject[key] =
          sanitize(item);
      }
    }

    return cleanObject;
  }

  return value;
};

const getClientIp = (req) => {
  const forwarded =
    req.headers[
      "x-forwarded-for"
    ];

  if (forwarded) {
    return forwarded
      .split(",")[0]
      .trim();
  }

  return (
    req.ip ||
    req.socket?.remoteAddress ||
    null
  );
};

const logAudit = async ({
  req,
  customer = null,
  account = null,
  action,
  status,
  message = null,
  metadata = {},
}) => {
  try {
    await AuditLog.create({
      customer,
      account,

      action,
      status,
      message,

      ipAddress:
        req
          ? getClientIp(req)
          : null,

      userAgent:
        req?.headers[
          "user-agent"
        ] || null,

      method:
        req?.method || null,

      path:
        req?.originalUrl ||
        req?.url ||
        null,

      metadata:
        sanitize(metadata),
    });
  } catch (error) {
    // Audit logging must never crash
    // the banking operation.
    console.error(
      "Audit log error:",
      error.message
    );
  }
};

module.exports = {
  logAudit,
};