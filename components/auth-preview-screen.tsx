"use client";

import Link from "next/link";
import Image from "next/image";
import {
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  submitGoogleSignIn,
  submitLogin,
  submitRegistration,
} from "@/lib/auth-submit";
import {
  validateRegistration,
  type RegistrationInput,
} from "@/lib/sign-up-validation";
import { cn } from "@/lib/utils";

export type AuthPreviewMode = "login" | "register";

type AuthFieldProps = {
  accessibleLabel: string;
  autoComplete: string;
  id: string;
  label: string;
  name: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  type: "email" | "password";
  value: string;
  className?: string;
};

type RegisterFieldProps = {
  accessibleLabel: string;
  autoComplete: string;
  id: string;
  label: string;
  minLength?: number;
  name: keyof RegistrationInput;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  type: "email" | "password" | "text";
  value: string;
  className?: string;
};

const inputClassName =
  "mt-[6px] h-12 w-full rounded-[8px] border-login-border bg-login-surface px-4 text-[13px] font-normal leading-[1.2] text-login-muted placeholder:text-login-muted focus-visible:border-login-accent focus-visible:ring-2 focus-visible:ring-login-accent focus-visible:ring-offset-2 focus-visible:ring-offset-login-canvas md:h-[52px] md:text-[13px]";

const fieldLabelClassName =
  "font-login-mono text-[9px] font-normal leading-[1.2] text-login-muted";

const socialActions = [
  {
    iconAlt: "Google",
    iconSrc: "/icons/google.svg",
    label: "Continue with Google",
    provider: "google",
  },
  {
    iconAlt: "Apple",
    iconSrc: "/icons/apple.svg",
    label: "Continue with Apple",
    provider: null,
  },
] as const;

function AuthField({
  accessibleLabel,
  autoComplete,
  id,
  label,
  name,
  onChange,
  placeholder,
  type,
  value,
  className,
}: AuthFieldProps) {
  return (
    <Field className={cn("gap-0", className)}>
      <FieldLabel className={fieldLabelClassName} htmlFor={id}>
        {label}
      </FieldLabel>
      <Input
        aria-label={accessibleLabel}
        autoComplete={autoComplete}
        className={inputClassName}
        id={id}
        name={name}
        onChange={onChange}
        placeholder={placeholder}
        required
        type={type}
        value={value}
      />
    </Field>
  );
}

function RegisterField({
  accessibleLabel,
  autoComplete,
  id,
  label,
  minLength,
  name,
  onChange,
  placeholder,
  type,
  value,
  className,
}: RegisterFieldProps) {
  return (
    <Field className={cn("gap-0", className)}>
      <FieldLabel className={fieldLabelClassName} htmlFor={id}>
        {label}
      </FieldLabel>
      <Input
        aria-label={accessibleLabel}
        autoComplete={autoComplete}
        className={inputClassName}
        id={id}
        minLength={minLength}
        name={name}
        onChange={onChange}
        placeholder={placeholder}
        required
        type={type}
        value={value}
      />
    </Field>
  );
}

function LoginForm({ accountCreated }: { accountCreated: boolean }) {
  const [values, setValues] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  function updateValue(field: keyof typeof values) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      if (error) setError(null);
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setIsPending(true);
    try {
      const authError = await submitLogin(values);
      if (authError) setError(authError);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form
      aria-busy={isPending}
      aria-label="Sign in form"
      className="mt-[28px] md:mt-[31px]"
      onSubmit={handleSubmit}
    >
      {accountCreated ? (
        <Alert
          aria-live="polite"
          className="mb-[18px] border-login-accent/40 bg-login-surface p-3"
        >
          <AlertDescription className="text-[12px] leading-[1.4] text-login-accent">
            Account created. Sign in to continue.
          </AlertDescription>
        </Alert>
      ) : null}
      <AuthField
        accessibleLabel="Email"
        autoComplete="email"
        id="email"
        label="EMAIL"
        name="email"
        onChange={updateValue("email")}
        placeholder="you@example.com"
        type="email"
        value={values.email}
      />
      <AuthField
        accessibleLabel="Password"
        autoComplete="current-password"
        className="mt-[10px]"
        id="password"
        label="PASSWORD"
        name="password"
        onChange={updateValue("password")}
        placeholder="Your password"
        type="password"
        value={values.password}
      />

      <p className="mt-[10px] text-[12px] leading-[1.2] text-login-muted md:mt-4">
        Password reset is coming soon.
      </p>

      <Button
        aria-disabled={isPending}
        className="mt-[27px] h-12 w-full rounded-[8px] bg-login-accent px-4 text-[13px] font-normal leading-[1.2] text-login-canvas hover:bg-login-accent disabled:cursor-wait disabled:opacity-70 md:h-[52px]"
        disabled={isPending}
        type="submit"
        variant="default"
      >
        {isPending ? (
          <>
            <Spinner data-icon="inline-start" />
            Signing in...
          </>
        ) : (
          "Sign in"
        )}
      </Button>
      <Alert
        aria-hidden={!error}
        aria-live="polite"
        className={cn(
          "mt-3 border-login-border bg-login-surface p-3",
          !error && "sr-only",
        )}
        variant={error ? "destructive" : "default"}
      >
        <AlertDescription className="text-[12px] leading-[1.4] text-login-accent">
          {error ?? ""}
        </AlertDescription>
      </Alert>
    </form>
  );
}

function RegisterForm() {
  const [values, setValues] = useState<RegistrationInput>({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  function updateValue(field: keyof RegistrationInput) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      if (error) setError(null);
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateRegistration(values);
    setError(validationError);
    if (validationError) return;

    setIsPending(true);
    try {
      const authError = await submitRegistration(values);
      if (authError) setError(authError);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form
      aria-label="Create account form"
      className="mt-[28px] md:mt-[31px]"
      onSubmit={handleSubmit}
    >
      <FieldGroup className="gap-[10px]">
        <RegisterField
          accessibleLabel="Name"
          autoComplete="name"
          id="name"
          label="NAME"
          name="name"
          onChange={updateValue("name")}
          placeholder="Your name"
          type="text"
          value={values.name}
        />
        <RegisterField
          accessibleLabel="Email"
          autoComplete="email"
          id="email"
          label="EMAIL"
          name="email"
          onChange={updateValue("email")}
          placeholder="you@example.com"
          type="email"
          value={values.email}
        />
        <RegisterField
          accessibleLabel="Password"
          autoComplete="new-password"
          id="password"
          label="PASSWORD"
          minLength={8}
          name="password"
          onChange={updateValue("password")}
          placeholder="••••••••"
          type="password"
          value={values.password}
        />
        <RegisterField
          accessibleLabel="Confirm password"
          autoComplete="new-password"
          id="confirm-password"
          label="CONFIRM PASSWORD"
          minLength={8}
          name="confirmPassword"
          onChange={updateValue("confirmPassword")}
          placeholder="••••••••"
          type="password"
          value={values.confirmPassword}
        />
      </FieldGroup>

      <Button
        aria-disabled={isPending}
        className="mt-[34px] h-12 w-full rounded-[8px] bg-login-accent px-4 text-[13px] font-normal leading-[1.2] text-login-canvas hover:bg-login-accent disabled:cursor-wait disabled:opacity-70 md:h-[52px]"
        disabled={isPending}
        type="submit"
      >
        {isPending ? (
          <>
            <Spinner data-icon="inline-start" />
            Creating account...
          </>
        ) : (
          "Create account"
        )}
      </Button>
      <Alert
        aria-hidden={!error}
        aria-live="polite"
        className={cn(
          "mt-3 border-login-border bg-login-surface p-3",
          !error && "sr-only",
        )}
        variant={error ? "destructive" : "default"}
      >
        <AlertDescription className="text-[12px] leading-[1.4] text-login-accent">
          {error ?? ""}
        </AlertDescription>
      </Alert>
    </form>
  );
}

export function AuthPreviewScreen({
  accountCreated = false,
  mode,
}: {
  accountCreated?: boolean;
  mode: AuthPreviewMode;
}) {
  const isRegister = mode === "register";
  const title = isRegister ? "Create account" : "Welcome back";
  const subtitle = isRegister
    ? "Start building your next deck in minutes."
    : "Sign in to keep your deck work moving.";
  const [isGooglePending, setIsGooglePending] = useState(false);
  const [socialError, setSocialError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setSocialError(null);
    setIsGooglePending(true);

    const error = await submitGoogleSignIn();
    if (error) {
      setSocialError(error);
      setIsGooglePending(false);
    }
  }

  return (
    <main className="min-h-dvh bg-login-canvas font-login-sans text-login-text">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1920px] flex-col px-10 py-8 md:px-[86px] md:py-[67px]">
        <header className="flex min-h-11 items-center">
          <Link
            aria-label="Back to card library"
            className="flex min-h-11 items-center gap-3 rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-login-accent focus-visible:ring-offset-2 focus-visible:ring-offset-login-canvas"
            href="/"
          >
            <span
              aria-hidden="true"
              className="hidden h-3 w-3 rounded-[3px] bg-login-accent md:block"
            />
            <span className="font-login-mono text-[9px] leading-[1.2] text-login-text md:text-[11px] md:normal-case">
              MHR Dex
            </span>
          </Link>
        </header>

        <section className="mx-auto flex w-full max-w-[720px] flex-1 flex-col pt-[34px] md:pt-[121px]">
          <h1 className="text-[24px] font-normal leading-[1.2] tracking-[-0.02em] md:text-[32px]">
            {title}
          </h1>
          <p className="mt-[10px] text-[14px] leading-[1.2] text-login-muted">
            {subtitle}
          </p>

          {isRegister ? <RegisterForm /> : <LoginForm accountCreated={accountCreated} />}

          <div className="mt-[35px] flex items-center gap-3 md:gap-[53px]">
            <Separator className="h-px w-auto flex-1 bg-login-border" />
            <span className="w-10 text-center font-login-mono text-[9px] leading-[1.2] text-login-muted md:w-[88px]">
              OR
            </span>
            <Separator className="h-px w-auto flex-1 bg-login-border" />
          </div>

          {socialActions.map(({ iconAlt, iconSrc, label, provider }, index) => (
            <div
              className={`relative ${index === 0 ? "mt-[31px] md:mt-[33px]" : "mt-[15px] md:mt-5"}`}
              key={label}
            >
              <Button
                aria-disabled={provider !== "google" || isGooglePending}
                className="flex h-12 w-full items-center gap-3 rounded-[8px] border-login-border bg-login-surface px-6 text-left text-[12px] font-normal leading-[1.2] text-login-text hover:bg-login-surface disabled:cursor-default disabled:opacity-100"
                disabled={provider !== "google" || isGooglePending}
                onClick={
                  provider === "google"
                    ? () => void handleGoogleSignIn()
                    : undefined
                }
                type="button"
                variant="outline"
              >
                <Image alt={iconAlt} height={24} src={iconSrc} width={24} />
                <span>{label}</span>
              </Button>
              {provider === null ? (
                <span className="absolute right-0 top-[52px] font-login-mono text-[9px] leading-[1.2] text-login-muted">
                  Coming soon
                </span>
              ) : null}
            </div>
          ))}

          <Alert
            aria-hidden={!socialError}
            aria-live="polite"
            className={cn(
              "mt-3 border-login-border bg-login-surface p-3",
              !socialError && "sr-only",
            )}
            variant={socialError ? "destructive" : "default"}
          >
            <AlertDescription className="text-[12px] leading-[1.4] text-login-accent">
              {socialError ?? ""}
            </AlertDescription>
          </Alert>

          <div className="mt-[49px] flex items-center justify-center gap-4 text-[12px] leading-[1.2] md:gap-8">
            <span className="text-login-muted">
              {isRegister ? "Already have an account?" : "Don’t have an account?"}
            </span>
            <Button
              className="h-auto p-0 text-[12px] font-normal text-login-accent no-underline hover:no-underline"
              nativeButton={false}
              render={
                <Link href={isRegister ? "/sign-in" : "/sign-up"} />
              }
              variant="link"
            >
              {isRegister ? "Sign in" : "Sign up"}
            </Button>
          </div>
        </section>

        <footer className="hidden font-login-mono text-[8px] leading-[1.2] text-login-muted md:block">
          MHR DEX / {isRegister ? "00B" : "00"}
        </footer>
      </div>
    </main>
  );
}
