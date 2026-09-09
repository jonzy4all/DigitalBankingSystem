# OMA Bank Backend API

A Node.js / Express / MongoDB digital banking backend that integrates with the **NIBSS by Phoenix** API for identity verification, account creation, account balance, beneficiary name enquiry, fund transfer, and transaction status query (TSQ).

## 1. Core Architecture

OMA Bank is the API exposed to customers and administrators.

```text
Customer / Admin
      |
      v
OMA Bank API
      |
      +--> MongoDB
      |      - customers
      |      - onboarding
      |      - accounts
      |      - transactions
      |      - audit logs
      |
      +--> NIBSS by Phoenix
             - BVN / NIN
             - account creation
             - balance
             - name enquiry
             - transfer
             - TSQ
```

Customers do **not** call NIBSS directly.

## 2. Technology Stack

- Node.js
- Express
- MongoDB / Mongoose
- Axios
- JWT
- bcryptjs
- Brevo transactional email API over HTTPS
- PDFKit
- Helmet
- express-rate-limit

## 3. Installation

```bash
npm install
```

Create a `.env` file from `.env.example`.

```env
PORT=8001

MONGO_URI=mongodb://localhost:27017/oma_bank

JWT_SECRET=YOUR_LONG_RANDOM_SECRET
JWT_EXPIRES_IN=1d

NIBSS_BASE_URL=https://nibssbyphoenix.onrender.com
NIBSS_API_KEY=YOUR_NIBSS_API_KEY
NIBSS_API_SECRET=YOUR_NIBSS_API_SECRET

NODE_ENV=development

# Brevo transactional email over HTTPS
BREVO_API_KEY=YOUR_BREVO_API_KEY
BREVO_SENDER_EMAIL=your-verified-sender@example.com
BREVO_SENDER_NAME=OMA Bank

FRONTEND_RESET_URL=http://localhost:8001/app/reset-password

SINGLE_TRANSFER_LIMIT=500000
DAILY_TRANSFER_LIMIT=1000000

ADMIN_API_KEY=YOUR_GENERATED_RANDOM_ADMIN_KEY
```

Never commit `.env`.

Start the API:

```bash
npm run dev
```

Default local URL:

```text
http://localhost:8001
```


## Render Free deployment

This project now sends transactional email with the Brevo HTTPS API instead of SMTP. For the complete Render setup, including MongoDB Atlas and password-reset configuration, see [`RENDER_DEPLOYMENT.md`](RENDER_DEPLOYMENT.md).

You can test the configured email provider locally with:

```bash
npm run test:email
```

## 4. Authentication

Customer routes use:

```http
Authorization: Bearer CUSTOMER_JWT
```

Admin routes use:

```http
x-admin-key: YOUR_ADMIN_API_KEY
```

Transfers also require:

```http
Idempotency-Key: UNIQUE_KEY_FOR_THE_TRANSFER
```

The same idempotency key can safely be resent for the same transfer. OMA Bank should return the original transaction instead of sending a second debit to NIBSS.

## 5. API Endpoints

### Onboarding

| Method | Endpoint | Authentication | Purpose |
|---|---|---|---|
| POST | `/onboarding/kyc` | None | BVN/NIN onboarding and validation |

Example:

```json
{
  "kycType": "BVN",
  "kycID": "12345678901",
  "firstName": "John",
  "lastName": "Doe",
  "dob": "1990-01-01",
  "phone": "08000000000"
}
```

### Account

| Method | Endpoint | Authentication | Purpose |
|---|---|---|---|
| POST | `/account/create` | None | Create/recover customer NIBSS account |

```json
{
  "onboardingId": "ONB-..."
}
```

### Customer Authentication

| Method | Endpoint | Authentication | Purpose |
|---|---|---|---|
| POST | `/auth/register` | None | Register customer after successful onboarding/account creation |
| POST | `/auth/login` | None | Customer login |
| GET | `/auth/me` | Customer JWT | Current customer profile |
| POST | `/auth/change-password` | Customer JWT | Change password |
| POST | `/auth/forgot-password` | None | Request reset email |
| POST | `/auth/reset-password/:token` | Reset token | Reset password |
| GET | `/auth/security-activity` | Customer JWT | Recent audit/security activity |
| POST | `/auth/transfer-pin` | Customer JWT | Create transfer PIN |
| PUT | `/auth/transfer-pin` | Customer JWT | Change transfer PIN |
| POST | `/auth/block-account` | Customer JWT | Customer self-block |

### Banking

| Method | Endpoint | Authentication | Purpose |
|---|---|---|---|
| GET | `/banking/balance` | Customer JWT | Live NIBSS balance |
| GET | `/banking/name-enquiry/:accountNumber` | Customer JWT | Beneficiary name enquiry |
| POST | `/banking/transfer` | Customer JWT + PIN | NIBSS transfer |
| GET | `/banking/transactions` | Customer JWT | Local customer transaction history |
| GET | `/banking/transactions/:reference` | Customer JWT | One transaction |
| GET | `/banking/transaction-status/:reference` | Customer JWT | TSQ via NIBSS |
| GET | `/banking/statement` | Customer JWT | JSON account statement |
| GET | `/banking/statement/pdf` | Customer JWT | PDF account statement |
| GET | `/banking/transactions/:reference/receipt` | Customer JWT | PDF transaction receipt |

Transfer example:

```json
{
  "to": "0000000000",
  "amount": 500,
  "description": "Transfer test",
  "pin": "2580"
}
```

Required header:

```text
Idempotency-Key: transfer-test-001
```

### Admin

| Method | Endpoint | Authentication | Purpose |
|---|---|---|---|
| GET | `/admin/dashboard` | Admin key | Dashboard statistics |
| GET | `/admin/customers` | Admin key | Customers |
| GET | `/admin/accounts` | Admin key | Accounts |
| GET | `/admin/blocked-accounts` | Admin key | Blocked accounts |
| GET | `/admin/transactions` | Admin key | All local transactions |
| GET | `/admin/audit-logs` | Admin key | Audit logs |
| PATCH | `/admin/accounts/:accountNumber/unblock` | Admin key | Unblock reviewed account |
| POST | `/admin/accounts/reconcile` | Admin key | Recover a remote NIBSS account into MongoDB |

> If `/account/reconcile` still exists in your local Routes/AccountRoutes.js, remove it and expose reconciliation only under the protected admin route.

## 6. What Calls NIBSS?

| OMA Bank operation | NIBSS call |
|---|---|
| KYC onboarding | Insert BVN/NIN + validate BVN/NIN |
| Account creation | Create account / recover via account list |
| Balance | Account balance |
| Name enquiry | Name enquiry |
| Transfer | Balance + name enquiry + transfer |
| Transaction status | TSQ |
| Login | No |
| Register | No |
| `/auth/me` | No |
| Transaction history | No |
| Statement | No |
| Security activity | No |
| Admin dashboard | No |

MongoDB is the local source for authentication, customer profiles, onboarding state, transaction history, statements, idempotency records, account controls, and audit logs.

NIBSS is the external source of truth for live banking operations and current external balances.

## 7. Transfer Security

A transfer should pass these checks before NIBSS receives the transfer:

```text
Customer JWT
   |
Rate limit
   |
4-digit transfer PIN
   |
PIN lock check
   |
Beneficiary validation
   |
Amount validation
   |
Single-transfer limit
   |
Daily-transfer limit
   |
Idempotency check
   |
Sender account validation
   |
Live NIBSS balance
   |
NIBSS name enquiry
   |
Create local PENDING transaction
   |
NIBSS transfer
   |
Save final status
   |
Create receiver CREDIT entry when local
```

Important controls:

- Passwords are bcrypt hashes.
- Transfer PIN is a bcrypt hash.
- Reset tokens are stored hashed.
- JWT expiry is configurable through `JWT_EXPIRES_IN`.
- Duplicate transfer protection uses `Idempotency-Key`.
- Transfer PIN locks after repeated incorrect attempts.
- Login/reset/transfer endpoints are rate limited.
- Single and daily transfer limits are configurable.
- Account block state is checked locally.
- Audit logs must not contain passwords, PINs, JWTs, API secrets, or email app passwords.

## 8. Account Statements

JSON:

```http
GET /banking/statement?from=2026-09-01&to=2026-09-30&page=1&limit=20
```

Optional filters:

```text
direction=CREDIT|DEBIT
type=INITIAL_FUNDING|TRANSFER|CREDIT|DEBIT
minAmount=100
maxAmount=100000
sort=asc|desc
```

PDF:

```http
GET /banking/statement/pdf?from=2026-09-01&to=2026-09-30
```

## 9. Recommended End-to-End Postman Test Flow

Run in this order:

```text
1. POST /onboarding/kyc
2. POST /account/create
3. POST /auth/register
4. POST /auth/login
5. GET  /auth/me
6. POST /auth/transfer-pin
7. GET  /banking/balance
8. GET  /banking/name-enquiry/:accountNumber
9. POST /banking/transfer
10. POST /banking/transfer again with SAME Idempotency-Key
11. GET /banking/transactions
12. GET /banking/transactions/:reference
13. GET /banking/transaction-status/:reference
14. GET /banking/statement
15. GET /auth/security-activity
16. GET /admin/dashboard
```

For step 10:

```json
{
  "success": true,
  "duplicate": true
}
```

should be returned, and the sender must **not** be debited twice.

## 10. Production Cleanup Checklist

Before submission/deployment:

```text
[ ] Remove node_modules from ZIP
[ ] Remove .git from ZIP if not required
[ ] Never include .env
[ ] Keep .env.example
[ ] Remove legacy TransactionRoutes.js
[ ] Remove legacy transactionController.js
[ ] Remove transferService.js if no longer imported
[ ] Remove unused Balance/Kyc/NibssToken models if no longer referenced
[ ] Protect reconciliation with admin middleware
[ ] Remove raw nibssResponse from customer responses
[ ] Do not log BVN/NIN/DOB
[ ] Keep TLS certificate verification enabled
[ ] Enable trust proxy in production
[ ] Add JSON 404 handler
[ ] Test duplicate transfer
[ ] Test PIN lock
[ ] Test blocked-account behavior
[ ] Test password reset
[ ] Test admin unblock
```

## 11. Suggested Submission Structure

```text
DigitalBankingSystem/
├── Config/
├── Controllers/
├── Middleware/
├── Models/
├── Routes/
├── Services/
├── utils/
├── .env.example
├── .gitignore
├── app.js
├── package.json
├── package-lock.json
└── README.md
```

## 12. Important Notes

The project integrates with a simulated **NIBSS by Phoenix** service for training purposes.

Do not place real banking secrets, production BVNs/NINs, real customer passwords, transfer PINs, JWTs, Gmail App Passwords, NIBSS API secrets, or admin keys in source control or screenshots.

## 13. Included Customer Frontend

This project now includes a dependency-free customer banking frontend in `public/`.

Start the backend as usual:

```bash
npm run dev
```

Then open:

```text
http://localhost:8001/app/
```

The frontend uses the existing backend routes and includes:

- BVN/NIN test onboarding
- NIBSS account creation/recovery
- Customer registration and login
- Live NIBSS balance
- Fund transfers with name enquiry, transfer PIN, and idempotency key
- Transaction history and PDF receipts
- JSON statement filters and PDF statement download
- Transfer PIN setup/change
- Password change/reset
- Security activity
- Customer self-block

The login token is stored in `sessionStorage`, so it is cleared when the browser session ends. For a production banking application, prefer a hardened authentication design using Secure, HttpOnly, SameSite cookies, CSRF protection, a restrictive CSP, and a dedicated frontend origin/security review.

---

## Customer theme and secret-field controls

The customer application now supports persistent **Light** and **Dark** themes. Use the theme button on the sign-in/onboarding screens or in the customer dashboard top bar.

All password and transfer-PIN fields include a view/hide eye control. The control is applied automatically to dynamically rendered forms as well, including transfer confirmation and account-block dialogs.

## Administration interface

The same Express server now serves an operations dashboard at:

```text
http://localhost:8001/admin-app/
```

On Render:

```text
https://YOUR-SERVICE.onrender.com/admin-app/
```

The interface uses the existing protected `/admin/*` API and requires the `ADMIN_API_KEY` configured on the server. The key is entered on the admin sign-in screen and is not hard-coded in the frontend source.

Admin pages provide dashboard statistics, customer/account search, account block/unblock controls, NIBSS account reconciliation, blocked-account review, transaction filters and audit-log filters. See `ADMIN_INTERFACE.md` for details.
