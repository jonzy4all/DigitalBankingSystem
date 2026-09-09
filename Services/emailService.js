// ======================================================
// BREVO TRANSACTIONAL EMAIL (HTTPS API)
// ======================================================
// Render's free web services cannot send mail through the
// usual SMTP ports. Brevo's transactional email API uses
// HTTPS, so password-reset emails can be sent from Render
// without opening an SMTP connection.
// ======================================================

const BREVO_SEND_URL =
  "https://api.brevo.com/v3/smtp/email";

const parseLegacyEmailFrom = () => {
  const raw = String(
    process.env.EMAIL_FROM || ""
  ).trim();

  if (!raw) {
    return {
      name: "",
      email: "",
    };
  }

  // Supports values such as:
  // EMAIL_FROM=OMA Bank <bank@example.com>
  const match = raw.match(
    /^(.*?)\s*<([^<>]+)>$/
  );

  if (match) {
    return {
      name: match[1]
        .trim()
        .replace(/^['"]|['"]$/g, ""),
      email: match[2].trim(),
    };
  }

  // If EMAIL_FROM contains only an email address.
  if (raw.includes("@")) {
    return {
      name: "",
      email: raw,
    };
  }

  return {
    name: raw,
    email: "",
  };
};

const getSender = () => {
  const legacy =
    parseLegacyEmailFrom();

  const email =
    process.env.BREVO_SENDER_EMAIL ||
    process.env.EMAIL_FROM_ADDRESS ||
    legacy.email;

  const name =
    process.env.BREVO_SENDER_NAME ||
    process.env.EMAIL_FROM_NAME ||
    legacy.name ||
    "OMA Bank";

  if (!email) {
    throw new Error(
      "BREVO_SENDER_EMAIL is missing from environment variables"
    );
  }

  return {
    email: email.trim(),
    name: name.trim(),
  };
};

const normalizeRecipients = (to) => {
  const values = Array.isArray(to)
    ? to
    : [to];

  const recipients = values
    .filter(Boolean)
    .map((recipient) => {
      if (
        typeof recipient === "object" &&
        recipient.email
      ) {
        return {
          email: String(
            recipient.email
          ).trim(),
          ...(recipient.name
            ? {
                name: String(
                  recipient.name
                ).trim(),
              }
            : {}),
        };
      }

      return {
        email: String(
          recipient
        ).trim(),
      };
    })
    .filter(
      (recipient) =>
        recipient.email
    );

  if (!recipients.length) {
    throw new Error(
      "At least one email recipient is required"
    );
  }

  return recipients;
};

// ======================================================
// SEND EMAIL
// ======================================================

const sendEmail = async ({
  to,
  subject,
  text,
  html,
}) => {
  const apiKey =
    process.env.BREVO_API_KEY;

  if (!apiKey) {
    throw new Error(
      "BREVO_API_KEY is missing from environment variables"
    );
  }

  if (!subject) {
    throw new Error(
      "Email subject is required"
    );
  }

  if (!html && !text) {
    throw new Error(
      "Email content is required"
    );
  }

  const sender = getSender();
  const recipients =
    normalizeRecipients(to);

  const payload = {
    sender,
    to: recipients,
    subject,
  };

  // Brevo accepts HTML or plain-text content. Prefer
  // the HTML version when the caller supplies both.
  if (html) {
    payload.htmlContent = html;
  } else {
    payload.textContent = text;
  }

  if (typeof fetch !== "function") {
    throw new Error(
      "This email service requires Node.js 18 or newer"
    );
  }

  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    15000
  );

  try {
    const response =
      await fetch(
        BREVO_SEND_URL,
        {
          method: "POST",
          headers: {
            accept:
              "application/json",
            "api-key":
              apiKey.trim(),
            "content-type":
              "application/json",
          },
          body: JSON.stringify(
            payload
          ),
          signal:
            controller.signal,
        }
      );

    const rawBody =
      await response.text();

    let data = {};

    if (rawBody) {
      try {
        data = JSON.parse(
          rawBody
        );
      } catch {
        data = {
          message: rawBody,
        };
      }
    }

    if (!response.ok) {
      const providerMessage =
        data.message ||
        data.code ||
        `Brevo returned HTTP ${response.status}`;

      throw new Error(
        `${response.status} - ${providerMessage}`
      );
    }

    const messageId =
      data.messageId ||
      data.messageIds?.[0] ||
      null;

    console.log(
      "Email sent successfully via Brevo:",
      messageId || "accepted"
    );

    return {
      messageId,
      provider: "brevo",
      data,
    };
  } catch (error) {
    const providerMessage =
      error.name === "AbortError"
        ? "Brevo request timed out"
        : error.message ||
          "Unknown Brevo email error";

    console.error(
      "Brevo email error:",
      providerMessage
    );

    throw new Error(
      `Email delivery failed: ${providerMessage}`
    );
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = {
  sendEmail,
};
