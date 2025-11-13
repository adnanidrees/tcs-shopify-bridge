let nodemailerModule;
try {
  const mod = await import('nodemailer');
  nodemailerModule = mod?.default || mod;
} catch (err) {
  if (process.env.DEBUG_ENV) {
    console.warn('nodemailer not loaded; emails will be logged to console', err);
  }
}

export function makeTransport(env) {
  if (!nodemailerModule?.createTransport) {
    return null;
  }
  return nodemailerModule.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: String(env.SMTP_SECURE || 'false') === 'true',
    auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
  });
}

export async function sendAdminMail(env, subject, text) {
  if (!env.EMAIL_ADMIN_TO || !env.EMAIL_FROM) return;
  const t = makeTransport(env);
  if (!t?.sendMail) {
    console.warn('Email not sent (nodemailer unavailable):', { subject });
    return;
  }
  await t.sendMail({ from: env.EMAIL_FROM, to: env.EMAIL_ADMIN_TO, subject, text });
}
