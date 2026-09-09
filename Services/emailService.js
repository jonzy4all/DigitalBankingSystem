const nodemailer =
  require("nodemailer");

// ======================================================
// SEND EMAIL
// ======================================================

const sendEmail = async ({
  to,
  subject,
  text,
  html,
}) => {
  const emailUser =
    process.env.EMAIL_USER;

  const emailPass =
    process.env.EMAIL_PASS?.replace(
      /\s+/g,
      ""
    );

  const emailHost =
    process.env.EMAIL_HOST ||
    "smtp.gmail.com";

  const emailPort =
    Number(
      process.env.EMAIL_PORT
    ) || 587;

  // --------------------------------------------------
  // Validate SMTP configuration
  // --------------------------------------------------

  if (!emailUser) {
    throw new Error(
      "EMAIL_USER is missing from environment variables"
    );
  }

  if (!emailPass) {
    throw new Error(
      "EMAIL_PASS is missing from environment variables"
    );
  }

  // --------------------------------------------------
  // Create SMTP transporter
  // --------------------------------------------------

  const transporter =
    nodemailer.createTransport({
      host:
        emailHost,

      port:
        emailPort,

      secure:
        emailPort === 465,

      auth: {
        user:
          emailUser,

        pass:
          emailPass,
      },
    });

  // --------------------------------------------------
  // Send
  // --------------------------------------------------

  const info =
    await transporter.sendMail({
      from:
        process.env.EMAIL_FROM ||
        `OMA Bank <${emailUser}>`,

      to,

      subject,

      text,

      html,
    });

  console.log(
    "Email sent successfully:",
    info.messageId
  );

  return info;
};

module.exports = {
  sendEmail,
};