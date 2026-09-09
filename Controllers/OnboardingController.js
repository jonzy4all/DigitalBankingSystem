const crypto = require("crypto");

const Onboarding = require("../Models/Onboarding");
const nibssService = require("../Services/nibssService");

const normalizeName = (value) => String(value || "").trim().toLowerCase();
const normalizeDob = (value) => String(value || "").trim().slice(0, 10);

exports.onboardKyc = async (req, res) => {
  try {
    const { kycType, kycID, firstName, lastName, dob, phone } = req.body;

    // ==========================================
    // 1. VALIDATE INPUT
    // ==========================================
    if (!kycType) {
      return res.status(400).json({ success: false, message: "kycType is required" });
    }

    const normalizedKycType = String(kycType).trim().toUpperCase();

    if (!["BVN", "NIN"].includes(normalizedKycType)) {
      return res.status(400).json({
        success: false,
        message: "kycType must be BVN or NIN",
      });
    }

    if (!kycID) {
      return res.status(400).json({ success: false, message: "kycID is required" });
    }

    const normalizedKycId = String(kycID).trim();

    // NIBSS by Phoenix documentation specifies 11 digits for both BVN and NIN.
    if (!/^\d{11}$/.test(normalizedKycId)) {
      return res.status(400).json({
        success: false,
        message: `${normalizedKycType} must contain exactly 11 digits`,
      });
    }

    if (!firstName || !lastName || !dob || !phone) {
      return res.status(400).json({
        success: false,
        message: "firstName, lastName, dob and phone are required",
      });
    }

    // ==========================================
    // 2. PREVENT DUPLICATE LOCAL ONBOARDING
    // ==========================================
    const existingOnboarding = await Onboarding.findOne({
      kycId: normalizedKycId,
    });

    if (existingOnboarding) {
      return res.status(409).json({
        success: false,
        message: "This KYC ID has already been onboarded",
        data: {
          onboardingId: existingOnboarding.onboardingId,
          onboardingStatus: existingOnboarding.onboardingStatus,
          validationStatus: existingOnboarding.validationStatus,
          accountCreationStatus: existingOnboarding.accountCreationStatus,
          accountNumber: existingOnboarding.accountNumber,
        },
      });
    }

    // ==========================================
    // 3. INSERT IDENTITY INTO NIBSS
    // ==========================================
    // A duplicate identity in the NIBSS identity store is not automatically a
    // failed onboarding. We can safely continue to validation and compare the
    // NIBSS identity details with the submitted customer details.
    let insertResponse;
    let identityAlreadyExisted = false;

    try {
      if (normalizedKycType === "BVN") {
        insertResponse = await nibssService.createBVN({
          bvn: normalizedKycId,
          firstName,
          lastName,
          dob,
          phone,
        });
      } else {
        insertResponse = await nibssService.createNIN({
          nin: normalizedKycId,
          firstName,
          lastName,
          dob,
        });
      }
    } catch (error) {
      if (error.response?.status === 409) {
        identityAlreadyExisted = true;
        insertResponse = error.response.data;
      } else {
        throw error;
      }
    }

    // ==========================================
    // 4. VALIDATE IDENTITY WITH NIBSS
    // ==========================================
    const validationResponse =
      normalizedKycType === "BVN"
        ? await nibssService.validateBVN(normalizedKycId)
        : await nibssService.validateNIN(normalizedKycId);

    // NIBSS by Phoenix has returned more than one validation response shape:
    // 1) { valid: true, bvn/nin, firstName, lastName, dob }
    // 2) { success: true, message: "... validation successful.", data: {...} }
    // 3) { message: "NIN Verified!!", response: {...} }
    // Normalize all known shapes before deciding whether validation succeeded.
    const validationData =
      validationResponse?.data ||
      validationResponse?.response ||
      validationResponse;

    const identityField = normalizedKycType.toLowerCase();
    const returnedKycId = String(validationData?.[identityField] || "").trim();
    const validationMessage = String(validationResponse?.message || "").toLowerCase();

    const successSignal =
      validationResponse?.valid === true ||
      validationResponse?.success === true ||
      validationMessage.includes("verified") ||
      validationMessage.includes("validation successful");

    // Require BOTH a success signal and the exact BVN/NIN we asked NIBSS to validate.
    const validationSucceeded =
      successSignal && returnedKycId === normalizedKycId;

    if (!validationSucceeded) {
      return res.status(400).json({
        success: false,
        message: `${normalizedKycType} validation failed`,
        error: validationResponse,
      });
    }

    // If the identity already existed in NIBSS, verify that the identity we
    // found belongs to the person being onboarded instead of blindly reusing it.
    // NIBSS may return DOB as an ISO timestamp, e.g. 1989-01-29T00:00:00.000Z,
    // while the request uses YYYY-MM-DD, so compare only the calendar date.
    const identityMismatch =
      normalizeName(validationData.firstName) !== normalizeName(firstName) ||
      normalizeName(validationData.lastName) !== normalizeName(lastName) ||
      normalizeDob(validationData.dob) !== normalizeDob(dob);

    if (identityMismatch) {
      return res.status(409).json({
        success: false,
        message: `The submitted customer details do not match the ${normalizedKycType} record in NIBSS`,
        code: "KYC_IDENTITY_MISMATCH",
      });
    }

    // ==========================================
    // 5. CREATE LOCAL ONBOARDING RECORD
    // ==========================================
    const onboardingId = `ONB-${crypto.randomUUID()}`;

    const onboarding = await Onboarding.create({
      onboardingId,
      kycType: normalizedKycType,
      kycId: normalizedKycId,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      dateOfBirth: String(dob),
      phone: String(phone).trim(),
      validationStatus: "SUCCESS",
      onboardingStatus: "SUCCESS",
      accountCreationStatus: "NOT_STARTED",
      nibssOnboardingResponse: insertResponse,
      nibssValidationResponse: validationResponse,
      completedAt: new Date(),
    });

    return res.status(201).json({
      success: true,
      message: `${normalizedKycType} onboarding completed successfully`,
      data: {
        onboardingId: onboarding.onboardingId,
        kycType: onboarding.kycType,
        onboardingStatus: onboarding.onboardingStatus,
        validationStatus: onboarding.validationStatus,
        accountCreationStatus: onboarding.accountCreationStatus,
        identityAlreadyExistedInNibss: identityAlreadyExisted,
      },
    });
  } catch (error) {
    console.error("KYC onboarding error:", error.response?.data || error.message);

    if (error.response) {
      return res
        .status(
          error.response.status >= 400 && error.response.status < 500
            ? error.response.status
            : 502
        )
        .json({
          success: false,
          message: "NIBSS KYC operation failed",
          error: error.response.data,
        });
    }

    // Handle a race where the same KYC is submitted twice at nearly the same time.
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This KYC ID has already been onboarded",
      });
    }

    return res.status(500).json({
      success: false,
      message: "KYC onboarding failed",
      error: error.message,
    });
  }
};
