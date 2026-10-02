# Better Auth two-factor

Read this when adding or changing the `twoFactor` plugin: TOTP, email or SMS OTP, backup codes, trusted devices, and the sign-in flow. Details come from the Better Auth 1.7 docs (`plugins/2fa`). The docs list the full option types, so check them for exact option names and defaults on the installed version.

## Setup

1. Add `twoFactor()` to the server `plugins` (from `better-auth/plugins`), with an `appName` on the config. The app name becomes the issuer shown in authenticator apps. Set `issuer` on the plugin to override it.
2. Add `twoFactorClient()` to the client (from `better-auth/client/plugins`), with `onTwoFactorRedirect({ twoFactorMethods })` to send the user to the verification page. The `twoFactorPage` option does the same with a full page reload.
3. Regenerate and apply the schema. The plugin adds a `twoFactor` table and fields on the user.

## Enrol a user

- `twoFactor.enable({ password, method })` requires the password for credential accounts. Users who signed up through OAuth, passkeys, magic links, or anonymous auth can't enable 2FA unless you set `allowPasswordless: true`.
- `method: "totp"` (the default) returns `{ totpURI, backupCodes }`. `twoFactorEnabled` stays `false` until the user verifies one TOTP code, so a mistyped enrollment doesn't lock them out. Leave `skipVerificationOnEnable` at `false`.
- `method: "otp"` enables code delivery immediately and needs `otpOptions.sendOTP` on the server.
- Treat the TOTP URI as a secret, because it contains the shared secret and the user's email. Render the QR code in the browser from the URI, and don't send it to a third-party QR service.
- Show backup codes once and tell the user to store them. Regenerating them invalidates the old set. Disabling 2FA needs the password for credential accounts.

## Sign in

When a user with 2FA signs in through a credential endpoint (`/sign-in/email`, `/sign-in/username`, `/sign-in/phone-number`), the response contains `twoFactorRedirect: true` and `twoFactorMethods`. Better Auth discards the pending session and issues a short-lived two-factor cookie. The session exists only after the user verifies with `verifyTotp`, `verifyOtp`, or `verifyBackupCode`.

- **Passwordless sign-in isn't gated by default.** Email OTP, magic link, social, passkey, and anonymous sign-in are not challenged. If the policy requires a second factor for them, add hook handling on those endpoints that redirects into your 2FA flow. Don't assume the plugin covers them.
- With `auth.api.signInEmail` on the server, check `"twoFactorRedirect" in response`, since TypeScript doesn't infer it. When you continue the flow with `auth.api.*`, forward the incoming request headers, and forward the cookies from each response into the next call, or Better Auth can't read the two-factor state.
- Hooks that read `ctx.context.newSession` after a credential sign-in must null-check it, because there is no session while the challenge is pending.
- Pass `trustDevice: true` when verifying to skip the challenge on that device. The docs set the trust period to 30 days, refreshed on each successful sign-in. Offer it as a user choice, and clear trusted devices when 2FA is disabled.

## Limits and storage

- TOTP accepts codes from one period before and after the current one. The default period is 30 seconds and the default length is 6 digits.
- 2FA endpoints have a stricter default rate limit (3 requests per 10 seconds under `/two-factor/*`), and repeated failed verifications temporarily lock the account (`429`, `ACCOUNT_TEMPORARILY_LOCKED`). Verification attempts across TOTP, OTP, and backup codes share one counter, and a success resets it.
- OTP delivery needs `otpOptions.sendOTP({ user, otp }, ctx)`. Don't await a slow mail or SMS call in the response path, for the timing reason given in `email-password.md`. Choose how stored OTPs and backup codes are protected from the plugin's options in the docs, and prefer encrypted or hashed storage over plain.

## Check

Test enrollment with a wrong and a right code, sign-in with each method, backup-code single use, lockout after repeated failures, the trusted-device skip and its expiry, and the passwordless paths your policy says must be challenged.
