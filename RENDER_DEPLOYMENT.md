# Deploy OMA Bank on Render Free

This version of OMA Bank sends password-reset email through the **Brevo transactional email HTTPS API** instead of Gmail SMTP. That makes the email flow compatible with Render Free, where outbound SMTP ports are restricted.

## 1. Create a Brevo sender and API key

1. Create/sign in to your Brevo account.
2. In Brevo, create and verify a transactional email sender.
3. Create an API key under the SMTP/API settings.
4. Keep the API key private. Never put it in GitHub or commit it to `.env`.

You will need:

```env
BREVO_API_KEY=YOUR_BREVO_API_KEY
BREVO_SENDER_EMAIL=your-verified-sender@example.com
BREVO_SENDER_NAME=OMA Bank
```

`BREVO_SENDER_EMAIL` must be a sender that Brevo accepts for your account.

## 2. Test email locally

Copy `.env.example` to `.env`, then add your real Brevo values.

Optionally set a recipient for the test:

```env
TEST_EMAIL_TO=your-email@example.com
```

Run:

```bash
npm install
npm run test:email
```

If Brevo accepts the message, the terminal will print an email message ID or `accepted`.

## 3. Push the project to GitHub

Make sure `.env` is ignored. This project already contains:

```gitignore
node_modules/
.env
```

Then push the project to a GitHub repository.

## 4. Create the Render Web Service

In Render:

1. Choose **New > Web Service**.
2. Connect your GitHub repository.
3. Select the OMA Bank repository.
4. Use these settings:

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
Instance Type: Free
```

The project reads `process.env.PORT`, so do not hard-code a Render port.

## 5. Add Render environment variables

Add these in **Render > Service > Environment**:

```env
NODE_ENV=production

MONGO_URI=YOUR_MONGODB_ATLAS_CONNECTION_STRING

JWT_SECRET=YOUR_LONG_RANDOM_SECRET
JWT_EXPIRES_IN=1d

NIBSS_BASE_URL=https://nibssbyphoenix.onrender.com
NIBSS_API_KEY=YOUR_NIBSS_API_KEY
NIBSS_API_SECRET=YOUR_NIBSS_API_SECRET

BREVO_API_KEY=YOUR_BREVO_API_KEY
BREVO_SENDER_EMAIL=your-verified-sender@example.com
BREVO_SENDER_NAME=OMA Bank

SINGLE_TRANSFER_LIMIT=500000
DAILY_TRANSFER_LIMIT=1000000

ADMIN_API_KEY=YOUR_GENERATED_RANDOM_ADMIN_KEY
```

After Render gives you a public service URL, also add:

```env
FRONTEND_RESET_URL=https://YOUR-SERVICE.onrender.com/app/reset-password
```

Do not include a token in this value. OMA Bank adds the reset token automatically.

## 6. MongoDB Atlas network access

Your deployed Render app must be allowed to connect to MongoDB Atlas.

For a short-lived class/demo deployment, `0.0.0.0/0` is the simplest Atlas Network Access rule, but it exposes the database endpoint to connections from any IP and should only be used with strong credentials. A more restrictive allowlist is preferable when possible.

## 7. Open the deployed app

Once the deployment succeeds:

```text
API health/root:
https://YOUR-SERVICE.onrender.com/

Customer banking frontend:
https://YOUR-SERVICE.onrender.com/app/
```

## 8. Test password reset

1. Open the deployed customer frontend.
2. Choose **Forgot password**.
3. Enter the email of a registered OMA Bank customer.
4. Check the inbox.
5. Open the link in the email.
6. Enter and confirm a new password.

The reset link is valid for 15 minutes according to the backend controller.

## Troubleshooting

### `BREVO_API_KEY is missing`
Add `BREVO_API_KEY` in Render's Environment settings and redeploy/restart the service.

### `BREVO_SENDER_EMAIL is missing`
Add the verified sender email as `BREVO_SENDER_EMAIL`.

### Brevo returns a sender/authentication error
Verify that:

- the API key is copied correctly;
- the sender is registered/verified in Brevo;
- there are no extra quotes around Render environment values.

### Reset email arrives but link points to localhost
Change:

```env
FRONTEND_RESET_URL=https://YOUR-SERVICE.onrender.com/app/reset-password
```

Then redeploy/restart Render.

### App cannot connect to MongoDB Atlas
Check `MONGO_URI`, the Atlas database username/password, and Atlas Network Access.

## Important security note

This project is suitable as a learning/demo banking application. A real banking system handling real customers, money, BVN/NIN data, or production credentials needs substantially stronger infrastructure, compliance, secrets management, monitoring, authentication/session controls, and a professional security review.

## Admin dashboard after deployment

After Render deploys the project, open:

```text
https://YOUR-SERVICE.onrender.com/admin-app/
```

Sign in using the exact value configured in Render as `ADMIN_API_KEY`.

Do not expose this value in GitHub, screenshots, frontend JavaScript, documentation containing real secrets, or chat messages. The repository should contain only placeholders such as those in `.env.example`.
