const crypto = require("crypto");

const adminMiddleware = (
  req,
  res,
  next
) => {
  try {
    const suppliedKey =
      req.headers["x-admin-key"];

    const configuredKey =
      process.env.ADMIN_API_KEY;

    if (!configuredKey) {
      return res.status(503).json({
        success: false,
        message:
          "Admin access is not configured",
      });
    }

    if (!suppliedKey) {
      return res.status(401).json({
        success: false,
        message:
          "Admin authentication is required",
      });
    }

    const suppliedBuffer =
      Buffer.from(
        String(suppliedKey)
      );

    const configuredBuffer =
      Buffer.from(
        String(configuredKey)
      );

    if (
      suppliedBuffer.length !==
      configuredBuffer.length
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid admin credentials",
      });
    }

    const valid =
      crypto.timingSafeEqual(
        suppliedBuffer,
        configuredBuffer
      );

    if (!valid) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid admin credentials",
      });
    }

    next();

  } catch (error) {
    console.error(
      "Admin authentication error:",
      error.message
    );

    return res.status(401).json({
      success: false,
      message:
        "Admin authentication failed",
    });
  }
};

module.exports =
  adminMiddleware;