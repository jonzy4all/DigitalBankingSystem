# OMA Bank Admin Interface

## URL

Local:

```text
http://localhost:8001/admin-app/
```

Render:

```text
https://YOUR-SERVICE.onrender.com/admin-app/
```

## Admin sign in

The interface authenticates against the existing admin middleware with the `x-admin-key` request header. Enter the exact value configured as:

```env
ADMIN_API_KEY=your-long-random-admin-key
```

Do not put the real key in GitHub, `.env.example`, `admin.js`, or any public frontend file. Configure it only in your local `.env` and Render Environment Variables.

The entered key is held in browser `sessionStorage` for the active tab/session and is cleared on admin sign-out.

## Available pages

- **Dashboard** — customer/account/transaction totals, transfer value, today's transfer activity, and recent transactions.
- **Customers** — search by name/email/phone, filter by status, and block/unblock linked accounts.
- **Accounts** — search/filter account records, block/unblock accounts, and reconcile an existing NIBSS account by onboarding ID.
- **Blocked accounts** — review block reason, source and time, then unblock after review.
- **Transactions** — filter by reference, status and direction.
- **Audit logs** — filter backend audit records by action and success/failure status.

## New admin API action

The project now includes:

```http
PATCH /admin/accounts/:accountNumber/block
x-admin-key: ADMIN_API_KEY
Content-Type: application/json

{
  "reason": "Suspicious activity under review"
}
```

It blocks both the bank `Account` and linked `Customer`, records the reason/source/time, and creates an `ACCOUNT_BLOCK` audit record. The existing unblock endpoint reverses the block after admin review.

## Production note

The current shared `ADMIN_API_KEY` scheme is suitable for this coursework/demo environment, but it is not a production bank administration architecture. A production version should use named admin users, hashed credentials or enterprise identity, MFA, RBAC, short-lived sessions, device/session controls, IP/network policies, and detailed privileged-action approvals.
