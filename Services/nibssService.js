const axios = require("axios");

const NIBSS_BASE_URL =
  process.env.NIBSS_BASE_URL ||
  "https://nibssbyphoenix.onrender.com";

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Normalize NIBSS account-creation responses.
 *
 * The published docs show accountNumber at the top level, while the live API
 * has already been observed returning successful payloads under nested
 * `data` or `response` objects for other endpoints. This helper accepts both
 * forms and searches a few levels deep for the account object.
 */
const normalizeAccountCreateResponse = (raw) => {
  const seen = new Set();
  const queue = [{ value: raw, depth: 0 }];
  let accountNode = null;

  while (queue.length) {
    const { value, depth } = queue.shift();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);

    if (value.accountNumber !== undefined && value.accountNumber !== null) {
      accountNode = value;
      break;
    }

    if (depth >= 4) continue;

    for (const child of Object.values(value)) {
      if (child && typeof child === "object") {
        queue.push({ value: child, depth: depth + 1 });
      }
    }
  }

  if (!accountNode) {
    return {
      accountNumber: null,
      rawResponse: raw,
    };
  }

  const normalizedBalance = Number(accountNode.balance);

  return {
    accountNumber: String(accountNode.accountNumber),
    bankCode:
      accountNode.bankCode ??
      raw?.bankCode ??
      raw?.data?.bankCode ??
      raw?.response?.bankCode ??
      null,
    bankName:
      accountNode.bankName ??
      raw?.bankName ??
      raw?.data?.bankName ??
      raw?.response?.bankName ??
      null,
    balance: Number.isFinite(normalizedBalance)
      ? normalizedBalance
      : undefined,
    message:
      raw?.message ??
      accountNode.message ??
      null,
    rawResponse: raw,
  };
};



/**
 * Normalize GET /api/accounts responses.
 *
 * The published documentation shows { accounts: [...] }, while live NIBSS
 * payloads can wrap endpoint data in `data` or `response`. Find an array that
 * contains account-like objects and normalize the fields used for recovery.
 */
const normalizeAccountsResponse = (raw) => {
  const seen = new Set();
  const queue = [{ value: raw, depth: 0 }];
  let accountArray = null;

  while (queue.length) {
    const { value, depth } = queue.shift();

    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);

    if (Array.isArray(value)) {
      if (
        value.length === 0 ||
        value.some(
          (item) => item && typeof item === "object" && item.accountNumber != null
        )
      ) {
        accountArray = value;
        break;
      }
    }

    if (depth >= 5) continue;

    for (const child of Object.values(value)) {
      if (child && typeof child === "object") {
        queue.push({ value: child, depth: depth + 1 });
      }
    }
  }

  const accounts = (accountArray || [])
    .filter((item) => item && typeof item === "object" && item.accountNumber != null)
    .map((item) => {
      const parsedBalance = Number(item.balance);

      return {
        accountNumber: String(item.accountNumber),
        accountName: item.accountName || null,
        bankCode: item.bankCode != null ? String(item.bankCode) : null,
        bankName: item.bankName || null,
        fintechId: item.fintechId || null,
        kycType: item.kycType || null,
        kycID: item.kycID != null ? String(item.kycID) : null,
        balance: Number.isFinite(parsedBalance) ? parsedBalance : undefined,
        rawResponse: item,
      };
    });

  return { accounts, rawResponse: raw };
};

/**
 * Get JWT token from NIBSS
 */
const getToken = async () => {
  // Reuse token if it is still valid
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  try {
    const response = await axios.post(
      `${NIBSS_BASE_URL}/api/auth/token`,
      {
        apiKey: process.env.NIBSS_API_KEY,
        apiSecret: process.env.NIBSS_API_SECRET,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const token = response.data?.token;

    if (!token) {
      throw new Error("NIBSS did not return a JWT token");
    }

    cachedToken = token;

    // Documentation says token is valid for 1 hour.
    // Refresh slightly before expiry.
    tokenExpiresAt = Date.now() + 55 * 60 * 1000;

    return token;
  } catch (error) {
    console.error("NIBSS authentication failed");

    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Response:", error.response.data);
    } else {
      console.error("Message:", error.message);
    }

    throw new Error("Unable to authenticate with NIBSS");
  }
};

/**
 * Create BVN record.
 *
 * The supplied Postman collection sends BVN/NIN identity endpoints without
 * bearer authentication, and the API documentation's endpoint summary marks
 * these identity endpoints as Auth: None. Keep JWT auth for protected account
 * and transaction operations only.
 */
const createBVN = async ({
  bvn,
  firstName,
  lastName,
  dob,
  phone,
}) => {
  const response = await axios.post(
    `${NIBSS_BASE_URL}/api/insertBvn`,
    {
      bvn,
      firstName,
      lastName,
      dob,
      phone,
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
};

/**
 * Create NIN record
 */
const createNIN = async ({
  nin,
  firstName,
  lastName,
  dob,
}) => {
  const response = await axios.post(
    `${NIBSS_BASE_URL}/api/insertNin`,
    {
      nin,
      firstName,
      lastName,
      dob,
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
};

/**
 * Validate BVN
 */
const validateBVN = async (bvn) => {
  const response = await axios.post(
    `${NIBSS_BASE_URL}/api/validateBvn`,
    { bvn },
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
};

/**
 * Validate NIN
 */
const validateNIN = async (nin) => {
  const response = await axios.post(
    `${NIBSS_BASE_URL}/api/validateNin`,
    { nin },
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
};



/**
 * Retrieve all accounts belonging to the authenticated fintech.
 * Used only for exact KYC-based reconciliation when a remote account may
 * already exist but was not linked in the local database.
 */
const getAllAccounts = async () => {
  const token = await getToken();

  const response = await axios.get(`${NIBSS_BASE_URL}/api/accounts`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const normalized = normalizeAccountsResponse(response.data);

  console.log("========== NIBSS ACCOUNT LIST ==========");
  console.log("Accounts parsed:", normalized.accounts.length);
  console.log("========================================");

  return normalized;
};


/**
 * Get the live NIBSS balance for a 10-digit account number.
 */
const getBalance = async (accountNumber) => {
  const token = await getToken();

  const response = await axios.get(
    `${NIBSS_BASE_URL}/api/account/balance/${accountNumber}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response;
};

/**
 * Resolve an account number to its registered account name.
 */
const nameEnquiry = async (accountNumber) => {
  const token = await getToken();

  return axios.get(
    `${NIBSS_BASE_URL}/api/account/name-enquiry/${accountNumber}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
};

/**
 * Submit an interbank transfer to NIBSS.
 */
const transfer = async ({ from, to, amount }) => {
  const token = await getToken();

  return axios.post(
    `${NIBSS_BASE_URL}/api/transfer`,
    {
      from,
      to,
      amount: String(amount),
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
};

/**
 * Query NIBSS using the transactionId returned by /api/transfer.
 */
const transactionStatus = async (transactionId) => {
  const token = await getToken();

  return axios.get(
    `${NIBSS_BASE_URL}/api/transaction/${transactionId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
};

/**
 * Backward-compatible alias used by an older controller helper.
 */
const getAccounts = async () => {
  const token = await getToken();
  return axios.get(`${NIBSS_BASE_URL}/api/accounts`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
};

/**
 * Create customer bank account
 *
 * NIBSS generates the 10-digit account number.
 */
const createAccount = async ({
  kycType,
  kycID,
  dob,
}) => {
  const token = await getToken();

  try {
    const response = await axios.post(
      `${NIBSS_BASE_URL}/api/account/create`,
      {
        kycType: kycType.toLowerCase(),
        kycID,
        dob,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const rawResponse = response.data;
    const normalizedResponse = normalizeAccountCreateResponse(rawResponse);

    console.log("========== NIBSS ACCOUNT CREATION RESPONSE ==========");
    console.log(JSON.stringify(rawResponse, null, 2));
    console.log("Normalized account number:", normalizedResponse.accountNumber);
    console.log("=====================================================");

    return normalizedResponse;
  } catch (error) {
    console.error("========== NIBSS ACCOUNT CREATION ERROR ==========");

    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("NIBSS Response:", error.response.data);
    } else {
      console.error("Message:", error.message);
    }

    console.error("===================================================");

    throw error;
  }
};

module.exports = {
  getToken,
  createBVN,
  createNIN,
  validateBVN,
  validateNIN,
  getAllAccounts,
  getAccounts,
  getBalance,
  nameEnquiry,
  transfer,
  transactionStatus,
  createAccount,
};