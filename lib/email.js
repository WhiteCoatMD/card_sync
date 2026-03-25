/**
 * Email Service using SendGrid
 */

const sendgrid = require('@sendgrid/mail');

sendgrid.setApiKey(process.env.SENDGRID_API_KEY);

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@cardsync.com';

async function sendEmail({ to, subject, html }) {
    return sendgrid.send({ to, from: FROM_EMAIL, subject, html });
}

module.exports = { sendEmail };
