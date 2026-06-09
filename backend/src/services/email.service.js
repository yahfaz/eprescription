import nodemailer from 'nodemailer';
import env from '../config/env.js';

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  if (env.email.transport === 'smtp') {
    transporter = nodemailer.createTransport({
      host: env.email.smtp.host,
      port: env.email.smtp.port,
      secure: env.email.smtp.secure,
      auth:
        env.email.smtp.user && env.email.smtp.pass
          ? { user: env.email.smtp.user, pass: env.email.smtp.pass }
          : undefined,
    });
  } else {
    // Dev/test transport: prints the full message to the console instead of
    // sending it. Lets the whole verification flow run with zero config.
    transporter = nodemailer.createTransport({ streamTransport: true, newline: 'unix', buffer: true });
  }
  return transporter;
}

async function send({ to, subject, html, text }) {
  const tx = getTransporter();
  const info = await tx.sendMail({ from: env.email.from, to, subject, html, text });

  if (env.email.transport !== 'smtp') {
    // eslint-disable-next-line no-console
    console.log(`\n──────── EMAIL (${subject}) ────────\nTo: ${to}\n${text}\n──────────────────────────────────\n`);
  }
  return info;
}

function layout(title, bodyHtml) {
  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto">
    <h2 style="color:#0f766e">${title}</h2>
    ${bodyHtml}
    <hr style="margin-top:24px;border:none;border-top:1px solid #e5e7eb"/>
    <p style="color:#6b7280;font-size:12px">ePrescribe — secure e-prescribing for medical practices.
    If you did not request this, you can ignore this email.</p>
  </div>`;
}

export function sendVerificationEmail(to, name, link) {
  return send({
    to,
    subject: 'Verify your ePrescribe account',
    text: `Hi ${name},\n\nVerify your email to activate your ePrescribe account:\n${link}\n\nThis link expires in 24 hours.`,
    html: layout(
      'Verify your email',
      `<p>Hi ${name},</p>
       <p>Confirm your email address to activate your ePrescribe account.</p>
       <p><a href="${link}" style="background:#0f766e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Verify email</a></p>
       <p style="color:#6b7280;font-size:13px">Or paste this link: ${link}<br/>This link expires in 24 hours.</p>`,
    ),
  });
}

export function sendPasswordResetEmail(to, name, link) {
  return send({
    to,
    subject: 'Reset your ePrescribe password',
    text: `Hi ${name},\n\nReset your password using this link:\n${link}\n\nThis link expires in 1 hour. If you didn't request it, ignore this email.`,
    html: layout(
      'Reset your password',
      `<p>Hi ${name},</p>
       <p>We received a request to reset your password.</p>
       <p><a href="${link}" style="background:#0f766e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Reset password</a></p>
       <p style="color:#6b7280;font-size:13px">This link expires in 1 hour.</p>`,
    ),
  });
}

export default { sendVerificationEmail, sendPasswordResetEmail };
