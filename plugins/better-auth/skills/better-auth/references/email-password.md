# Better Auth email and password

Read this when enabling or hardening email and password sign-in: verification email, password reset, session revocation, hashing, and enumeration protection. Details come from the Better Auth 1.7 docs (`authentication/email-password`, `reference/options`, `reference/security`).

## Enable and send mail

```ts
export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 12,          // default 8
    maxPasswordLength: 128,         // default 128
    sendResetPassword: async ({ user, url, token }, request) => {
      void sendEmail({ to: user.email, subject: "Reset your password", text: url });
    },
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url, token }, request) => {
      void sendEmail({ to: user.email, subject: "Verify your email", text: url });
    },
  },
});
```

- **Don't await the send.** The mail call is slow, so awaiting it makes the response slower for real accounts, and that timing difference reveals which emails exist. Fire it without `await`. On serverless platforms, register `advanced.backgroundTasks.handler` (for example with `waitUntil`) so the send finishes after the response.
- `requireEmailVerification` blocks password sign-in until the email is verified, and calls `sendVerificationEmail` on every sign-in attempt by the unverified user. It needs `sendVerificationEmail`. It doesn't gate social sign-in, which has its own per-provider `requireEmailVerification`.
- `emailVerification.sendOnSignUp` controls the automatic send after sign-up. `true` always sends, `false` never sends, and unset follows `requireEmailVerification`. `sendOnSignIn` and `expiresIn` (default 3600 seconds) are also available.
- Call `requestPasswordReset` with an absolute `redirectTo`. The user returns to it with `?token=<token>` for a valid link, or `?error=INVALID_TOKEN`. Then call `resetPassword({ newPassword, token })`. Serve the reset page with `Referrer-Policy: no-referrer` and no third-party scripts, since the one-time token sits in the URL.
- Pass full URLs (scheme and host) as `callbackURL` and `redirectTo`, and list each host in `trustedOrigins`. Better Auth validates these against `trustedOrigins`, and a bare path resolves against the server's base URL, which is the wrong host when the UI is served from another domain.
- Reset tokens expire after `resetPasswordTokenExpiresIn` seconds (default 3600) and are single-use. Shorten the window for higher-risk apps.

## Revoke sessions

By default a password reset does **not** end other sessions. Set `revokeSessionsOnPasswordReset: true` so a stolen session doesn't survive the reset. For password changes by a signed-in user, pass `revokeOtherSessions: true` to `changePassword`. Decide the same for email changes.

## Enumeration safety

Sign-up returns the same `200` response whether the email is already registered only when `requireEmailVerification` is on or `autoSignIn` is `false`. With the default configuration, sign-up still returns an error for an existing email, so the account's existence is visible. If you add plugins that put fields on the user table (admin, two-factor, phone number), provide `emailAndPassword.customSyntheticUser` so the fake response matches a real one. Use `onExistingUserSignUp` to notify the real owner that someone tried to register their address. Return generic sign-in errors ("Invalid email or password"), not which part failed.

## Hashing

Passwords hash with `scrypt` by default, because Node ships it. The docs show Argon2id through `@node-rs/argon2`. Any replacement needs both a `hash` and a `verify` function:

```ts
emailAndPassword: {
  enabled: true,
  password: {
    hash: async (password) => hashWithYourLibrary(password),
    verify: async ({ hash, password }) => verifyWithYourLibrary(hash, password),
  },
},
```

Switching algorithms on a system with existing users breaks their sign-in, because their stored hashes use the old format. Make `verify` recognize both formats and rehash on successful sign-in, or plan a forced reset. Take cost parameters (memory, iterations, parallelism) from the current OWASP guidance, and measure latency on production-class hardware.

## Check

Test sign-up, an unverified sign-in attempt, verification, reset with a valid and an expired token, reuse of a used token, and sign-in with an old session after reset. Confirm that sign-up and reset responses and timing don't differ for existing and unknown emails.
