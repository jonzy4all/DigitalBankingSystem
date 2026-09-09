const dotenv = require("dotenv");

// Load environment variables BEFORE importing modules that may read process.env
// during module initialization.
dotenv.config();

const express = require("express");
const path = require("path");
const connectDB = require("./Config/database");
const accountRoutes = require("./Routes/AccountRoutes");
const authRoutes = require("./Routes/AuthRoutes");
const bankingRoutes = require("./Routes/bankingRoutes");
const onboardingRoutes = require("./Routes/OnboardingRoutes");
const helmet = require("helmet");
const adminRoutes = require("./Routes/AdminRoutes");

const app = express();
if (
  process.env.NODE_ENV ===
  "production"
) {
  app.set(
    "trust proxy",
    1
  );
}
app.use(helmet());

connectDB();

app.use(express.json({
  limit: "100kb",
}));
app.use(express.urlencoded({ extended: true }));

app.use("/onboarding", onboardingRoutes);
app.use("/account", accountRoutes);
app.use("/auth", authRoutes);
app.use("/banking", bankingRoutes);
app.use("/admin", adminRoutes);

// ======================================================
// CUSTOMER FRONTEND
// ======================================================
// The frontend is served from the same Express origin so browser requests can
// call the banking API without a separate CORS configuration. Hash-based
// navigation keeps all client-side pages under /app/.
app.use(
  "/app",
  express.static(path.join(__dirname, "public"))
);

// ======================================================
// ADMIN FRONTEND
// ======================================================
// Admin API requests are still protected by ADMIN_API_KEY. The key is entered
// by the administrator at sign-in and is not embedded in the frontend source.
app.use(
  "/admin-app",
  express.static(path.join(__dirname, "admin"))
);

// Direct password-reset URL used by emails. The browser receives index.html
// and public/app.js reads the ?token= value to render the reset form.
app.get(
  "/app/reset-password",
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }
);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "OMA Bank API is running",
    interfaces: {
      customer: "/app/",
      admin: "/admin-app/",
    },
  });
});

// ======================================================
// 404 ROUTE
// ======================================================

app.use((req, res) => {
  return res.status(404).json({
    success: false,

    message:
      `Route ${req.method} ${req.originalUrl} not found`,
  });
});

const PORT = process.env.PORT || 8001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
