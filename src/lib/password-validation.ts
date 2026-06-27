const WEAK_PATTERNS = [
  /^password/i,
  /^teacher/i,
  /^student/i,
  /^admin/i,
  /^bnhs/i,
  /^123456/,
  /^qwerty/i,
];

export function validateSignupPassword(password: string, confirmPassword: string): string | null {
  if (password !== confirmPassword) {
    return "Passwords do not match";
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Use uppercase, lowercase, and a number (e.g. Bnhs@Teacher2026!)";
  }
  if (WEAK_PATTERNS.some((pattern) => pattern.test(password))) {
    return "Avoid common words like Password or Teacher — use a unique passphrase";
  }
  return null;
}

export function formatSignupError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("weak") || lower.includes("easy to guess") || lower.includes("known to be")) {
    return "That password is too common. Use 8+ characters with upper, lower, numbers, and symbols (e.g. Bnhs@Teacher2026!).";
  }
  if (lower.includes("email") && lower.includes("invalid")) {
    return "Enter a valid email address (e.g. yourname@gmail.com).";
  }
  return message;
}
