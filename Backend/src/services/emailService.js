const path = require('path');
const fs = require('fs');
const { SENDGRID_API_URL, getFromEmail } = require('../config/email');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

const SUBJECTS = {
  verifyEmail: 'Verify Your Email — WasteZero',
  forgotPassword: 'Reset Your Password — WasteZero',
  twoFactor: 'Your 2FA Code — WasteZero'
};

const sendOtpEmail = async (toEmail, otp, templateName = 'verifyEmail') => {
  const fromEmail = getFromEmail();

  const filename = `${templateName}.html`;
  const html = loadTemplate(filename, otp);
  const subject = SUBJECTS[templateName] || SUBJECTS.verifyEmail;

  try {
    const response = await fetch(SENDGRID_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: fromEmail },
        subject,
        content: [{ type: 'text/html', value: html }]
      })
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message = errorBody.errors?.[0]?.message || `SendGrid API responded with status ${response.status}`;
      throw new Error(message);
    }

    logger.info(`${templateName} email dispatched successfully to ${maskEmail(toEmail)}`);
  } catch (error) {
    logger.error(`Email send failed [${templateName}] to ${maskEmail(toEmail)}: ${error.message}`);
    throw error;
  }
};

const maskEmail = (email) => {
  const [local, domain] = email.split('@');
  return `${local[0]}***@${domain}`;
};

const loadTemplate = (filename, otp) => {
  const filePath = path.join(TEMPLATES_DIR, filename);

  if (!fs.existsSync(filePath)) {
    throw new ApiError(500, `Email template not found: ${filename}`);
  }

  let html = fs.readFileSync(filePath, 'utf-8');
  html = html.replace('{{otp}}', otp);
  return html;
};

module.exports = { sendOtpEmail };
