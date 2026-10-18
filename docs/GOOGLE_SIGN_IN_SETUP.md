# Google sign-in setup

Google sign-in is optional; the "Continue with Google" button appears only when both settings below are present.

1. Open Google Cloud Console and create (or pick) a project, e.g. "ADS Sign-in".
2. **OAuth consent screen**: user type *External*; app name *Africa Digital Synergy*; support email `admin@africadigitalsynergy.com`; authorised domain `africadigitalsynergy.com`; scopes `openid`, `email`, `profile`. Publish the app (testing mode limits sign-in to listed test users).
3. **Credentials → Create credentials → OAuth client ID**: type *Web application*.
   - Authorised redirect URI: `https://login.africadigitalsynergy.com/google/callback`
4. Copy the client ID and secret into `deploy/.env`:

```
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
```

5. Restart the identity service. The startup log shows `google=true`.

How accounts are matched: a Google account is linked to the ADS account with the same email only if Google says the email is verified. If someone had registered that email but never confirmed it, their unconfirmed password is removed when the real owner signs in with Google, so nobody can pre-register another person's email.
