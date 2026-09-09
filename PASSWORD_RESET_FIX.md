# Password Reset Route Fix

The password-reset email now links to a normal browser URL:

```text
https://YOUR-SERVICE.onrender.com/app/reset-password?token=...
```

## Render environment variable

Set this in Render -> Environment:

```text
FRONTEND_RESET_URL=https://YOUR-SERVICE.onrender.com/app/reset-password
```

Replace `YOUR-SERVICE` with the actual Render service hostname.

After changing the environment variable, redeploy the service and request a **new** password-reset email. Reset tokens expire after 15 minutes.

The frontend still accepts older links that use:

```text
/app/#/reset-password?token=...
```

but newly generated emails use the direct `/app/reset-password` route.
