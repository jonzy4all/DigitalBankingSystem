const express = require("express");

const router = express.Router();
const onboardingController = require("../Controllers/OnboardingController");

// BVN / NIN KYC onboarding
router.post("/kyc", onboardingController.onboardKyc);

module.exports = router;
