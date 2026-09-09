require("dotenv").config();

const {
  sendEmail,
} = require("../Services/emailService");

const run = async () => {
  const recipient =
    process.env.TEST_EMAIL_TO ||
    process.env.BREVO_SENDER_EMAIL;

  if (!recipient) {
    throw new Error(
      "Set TEST_EMAIL_TO or BREVO_SENDER_EMAIL before running the email test"
    );
  }

  const result = await sendEmail({
    to: recipient,
    subject:
      "OMA Bank email configuration test",
    text:
      "Your OMA Bank Brevo email configuration is working.",
    html: `
      <h2>OMA Bank email test</h2>
      <p>
        Your Brevo HTTPS email configuration is working.
      </p>
    `,
  });

  console.log(
    "Test email accepted by provider:",
    result.messageId || "accepted"
  );
};

run().catch((error) => {
  console.error(
    "Email test failed:",
    error.message
  );
  process.exit(1);
});
