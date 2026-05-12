const allowedEmailConfig: string = import.meta.env.VITE_ALLOWED_EMAILS ?? "";

const allowedEmails = allowedEmailConfig
  .split(",")
  .map((email: string) => email.trim().toLowerCase())
  .filter(Boolean);

export function isAllowedEmail(email?: string | null) {
  if (!allowedEmails.length) return true;
  return Boolean(email && allowedEmails.includes(email.toLowerCase()));
}

export function allowedEmailText() {
  return allowedEmails.join("、");
}
