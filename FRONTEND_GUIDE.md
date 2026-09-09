# OMA Bank Customer Frontend

The customer frontend is included in the `public/` directory and is served by the existing Express backend.

## Run it

1. Copy `.env.example` to `.env` and supply the required MongoDB, JWT, NIBSS and email values.
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
FRONTEND_RESET_URL=http://localhost:8001/app/#/reset-password
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
