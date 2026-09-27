export type RegistrationInput = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export function validateRegistration(
  input: RegistrationInput,
): string | null {
  if (!input.name.trim()) return "Enter your name.";
  if (!input.email.trim()) return "Enter your email.";
  if (input.password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (input.password !== input.confirmPassword) {
    return "Passwords do not match.";
  }
  return null;
}
