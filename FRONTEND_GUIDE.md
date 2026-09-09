# OMA Bank Customer Frontend

The customer frontend is included in the `public/` directory and is served by the existing Express backend.

## Run it

1. Copy `.env.example` to `.env` and supply the required MongoDB, JWT, NIBSS and Brevo email API values.
2. Install dependencies if needed:

```bash
npm install
```

3. Start the project:

```bash
npm run dev
```

4. Open the customer interface:

```text
http://localhost:8001/app/
```

The API health endpoint remains available at:

```text
http://localhost:8001/
```

## Frontend screens

- Login
- Forgot/reset password
- BVN/NIN onboarding
- Account creation
- Customer registration
- Dashboard with live balance
- Beneficiary name enquiry and fund transfer
- Transaction history
- PDF transaction receipts
- Account statement filters
- PDF account statements
- Transfer PIN setup/change
- Security activity
- Profile and password change
- Customer self-block

## Password reset email URL

Use this in `.env` so reset emails return users to the included frontend:

```env
FRONTEND_RESET_URL=http://localhost:8001/app/reset-password
```

The backend appends `?token=...` automatically.

## Authentication note

For this assignment frontend, the JWT is stored in browser `sessionStorage`, not `localStorage`, so the browser session does not retain it indefinitely. For a production banking system, use a security-reviewed authentication design such as Secure + HttpOnly + SameSite cookies, CSRF protection, strict Content Security Policy, short sessions, refresh-token rotation, and server-side session controls.

## Files added/changed

```text
public/index.html      Customer app HTML shell
public/styles.css      Responsive banking UI
public/app.js          SPA routing, API integration, forms and downloads
app.js                 Serves /public under /app
.env.example           Frontend reset URL updated
OMA_BANK_README.md     Frontend documentation added
FRONTEND_GUIDE.md      Quick setup guide
```

## Render Free email support

Password-reset emails use Brevo's HTTPS transactional email API, not Gmail SMTP. Configure `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `BREVO_SENDER_NAME`. For the complete deployment procedure, see `RENDER_DEPLOYMENT.md`.


## Theme and password/PIN visibility

The customer interface now includes a light/dark theme toggle. The selected theme is stored in browser `localStorage` under `oma_bank_theme` so it persists across visits.

Every password and transfer-PIN field automatically gets an eye button that toggles between hidden and visible text. This includes login, registration, password reset, transfer confirmation, transfer-PIN setup/change, password change, and the account-block confirmation modal.

## Admin interface

The administration interface is served at:

```text
http://localhost:8001/admin-app/
```

On Render it is:

```text
https://YOUR-SERVICE.onrender.com/admin-app/
```

Sign in with the same `ADMIN_API_KEY` configured in `.env` locally or in Render Environment Variables. The key is **not embedded in the frontend source**; the browser keeps it in session storage for the active admin session.

Admin features include:

- dashboard totals for customers, accounts, transactions and transfers
- customer search/filtering
- account search/filtering and NIBSS reconciliation
- admin block/unblock controls
- blocked-account review
- transaction filtering
- audit-log filtering
- light/dark theme support

For a real production banking system, replace the shared API-key admin login with individual admin accounts, MFA, roles/permissions, session expiry, and stronger operational controls.
