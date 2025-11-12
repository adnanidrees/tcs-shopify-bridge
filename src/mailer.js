import nodemailer from 'nodemailer';

export function makeTransport(env) {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: String(env.SMTP_SECURE || 'false') === 'true',
    auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
  });
}

export async function sendAdminMail(env, subject, text) {
  if (!env.EMAIL_ADMIN_TO || !env.EMAIL_FROM) return;
  const t = makeTransport(env);
  await t.sendMail({ from: env.EMAIL_FROM, to: env.EMAIL_ADMIN_TO, subject, text });
}
