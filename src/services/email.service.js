require('dotenv').config();
const nodemailer = require('nodemailer');

/**
 * Creates and returns the nodemailer transporter.
 * Uses Gmail SMTP by default based on the .env config.
 */
function getTransporter() {
  const user = process.env.GMAIL_EMAIL;
  const pass = process.env.GMAIL_PASSWORD;

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: user,
      pass: pass,
    },
  });
}

/**
 * Sends an outreach email.
 * 
 * @param {string} toEmail - The recipient's email address
 * @param {string} firstName - The recipient's first name (for greeting/subject)
 * @param {string} message - The body of the connection note
 * @returns {Promise<boolean>} - True if sent successfully, false otherwise
 */
async function sendOutreachEmail(toEmail, firstName, message) {
  const transporter = getTransporter();

  if (!transporter) {
    console.error('❌ Email not sent: GMAIL_EMAIL or GMAIL_PASSWORD is not set in .env');
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: `"LinkedIn Connection Engine" <${process.env.GMAIL_EMAIL}>`,
      to: toEmail,
      subject: `Hi ${firstName} - Following up on my LinkedIn connection`,
      text: message, // Raw text format matching the LinkedIn note
      html: `<p>${message.replace(/\n/g, '<br>')}</p>` // HTML format with breaks preserved
    });

    console.log(`📧 Email sent successfully to ${toEmail} (Message ID: ${info.messageId})`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send email to ${toEmail}: `, error.message);
    return false;
  }
}

module.exports = {
  sendOutreachEmail
};
