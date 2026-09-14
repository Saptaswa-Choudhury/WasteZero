// SendGrid's HTTP API replaces SMTP entirely — a normal HTTPS POST request,
// unaffected by Render's SMTP port block. See SENDGRID_API_KEY in env vars.
const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';

const getFromEmail = () => {
  // Must exactly match the address you verified under SendGrid's
  // Settings -> Sender Authentication -> Single Sender Verification.
  return process.env.FROM_EMAIL;
};

module.exports = { SENDGRID_API_URL, getFromEmail };
