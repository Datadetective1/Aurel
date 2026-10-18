# Microsoft consent screen: "unverified" and missing terms

During a fresh-user walkthrough the Microsoft consent screen showed Atturel as
**unverified** and said **"The publisher has not provided links to their terms
for you to review."** The requested permissions were correct (read-only
calendar), but the screen looks untrustworthy. Neither message is controlled by
application code. Both come from the Entra app registration.

## What the repository controls (audited)

| Item                  | Value                                                                                                                                      | Where                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Scopes requested      | `offline_access openid email https://graph.microsoft.com/Calendars.Read` (delegated, read-only)                                            | `src/lib/calendar/provider.ts` (`MICROSOFT_SCOPES`)                           |
| Authority             | `https://login.microsoftonline.com/common` (multitenant) unless `MICROSOFT_TENANT` is set                                                  | `src/lib/calendar/microsoft.ts`, `src/lib/env.ts`                             |
| Redirect URI          | `https://www.atturel.com/api/calendar/microsoft/callback`                                                                                  | `calendarRedirectUri()` in `src/app/api/calendar/[provider]/connect/route.ts` |
| Client ID / secret    | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` (Vercel env, not in Git)                                                                  | `src/lib/env.ts`                                                              |
| Terms page            | `https://www.atturel.com/terms` (exists)                                                                                                   | `src/app/(marketing)/terms`                                                   |
| Privacy page          | `https://www.atturel.com/privacy` (exists)                                                                                                 | `src/app/(marketing)/privacy`                                                 |
| Publisher-domain file | `https://www.atturel.com/.well-known/microsoft-identity-association.json`, which lists the configured client ID (**added in this change**) | `src/app/.well-known/microsoft-identity-association.json/route.ts`            |

No permissions were added or broadened. Nothing in code can set the publisher
name, logo, terms link, privacy link or verification status. Those properties
live on the app registration.

## Manual checklist (Microsoft Entra admin center)

Sign in at **https://entra.microsoft.com** as an account with **Application
Administrator** or **Cloud Application Administrator** in the tenant that owns
the registration. Go to **Identity → Applications → App registrations → All
applications → Atturel** (the one whose Application (client) ID matches
`MICROSOFT_CLIENT_ID` in Vercel Production).

### 1. Branding & properties: fixes "has not provided links to their terms" (immediate)

| Field                 | Value                                                              |
| --------------------- | ------------------------------------------------------------------ |
| Name                  | `Atturel`                                                          |
| Logo                  | Square PNG, 215×215 px, under 100 KB (export the Atturel app icon) |
| Home page URL         | `https://www.atturel.com`                                          |
| Terms of service URL  | `https://www.atturel.com/terms`                                    |
| Privacy statement URL | `https://www.atturel.com/privacy`                                  |

Save. The consent screen picks these up within minutes. The "has not provided
links to their terms" line goes away once both URLs are set.

### 2. Publisher domain (immediate, after this branch is deployed)

Still in **Branding & properties → Publisher domain → Update domain**:

1. Choose **Verify a new domain** and enter **`www.atturel.com`**.
2. Entra asks for `https://www.atturel.com/.well-known/microsoft-identity-association.json`.
   This branch serves that file from `MICROSOFT_CLIENT_ID`, so there is
   nothing to upload. Check it in a browser first: it must show
   `{"associatedApplications":[{"applicationId":"<your client id>"}]}`.
3. Click **Verify and save domain**.

Why `www.atturel.com` and not the apex: `atturel.com` answers with a 308
redirect to `www`, and Entra does not follow redirects when it fetches this
file. If you want the apex as the publisher domain, the apex would have to
serve the file without redirecting, which is a Vercel domain setting and not
something code can change. `www.atturel.com` avoids that.

Alternative: if `atturel.com` is already a **verified custom domain** in this
tenant (Entra → Settings → Domain names), select it from the list instead.

### 3. Authentication and API permissions (confirm only, change nothing)

- **Authentication → Web → Redirect URIs** contains exactly
  `https://www.atturel.com/api/calendar/microsoft/callback`.
- **Supported account types**: _Accounts in any organizational directory and
  personal Microsoft accounts_.
- **API permissions** (Microsoft Graph, Delegated): `Calendars.Read`, `email`,
  `offline_access`, `openid`. If `User.Read` was added by default, it is
  harmless: the app never requests it, and the consent screen only lists the
  scopes actually requested. **Do not add** any `ReadWrite`, `Mail`,
  `Contacts` or `Files` permission.

### 4. Publisher verification: removes "unverified" (not immediate)

The **unverified** label goes away only with Microsoft **publisher
verification**, which links the app to a verified business in the Microsoft AI
Cloud Partner Program (formerly MPN).

Requirements:

1. A **Microsoft AI Cloud Partner Program** account for the legal entity
   (e.g. Atturel Labs) that has completed **business verification**. Enroll at
   https://partner.microsoft.com. Verification checks the legal name, address
   and a contact email, and usually takes **a few business days**.
2. The partner account's verification email must be on a domain the tenant
   has verified (e.g. `@atturel.com`).
3. The app's **publisher domain** is set and verified (step 2 above).
4. The person who clicks verify must hold **both**:
   - in the tenant: Application Administrator, Cloud Application Administrator
     or Global Administrator;
   - in Partner Center: Partner Admin, Accounts Admin or Global Admin.
5. MFA enabled on that account.

Then: **App registrations → Atturel → Branding & properties → Publisher
verification → Add Partner ID to verify publisher**, enter the Partner Global
Account (PGA) ID, and confirm. Once the prerequisites are met this step takes
effect immediately, and the consent screen shows a blue **verified** badge with
the business name.

## What can and cannot be resolved today

| Problem                                                   | Fixable now?                                                                                                                  | How                             |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| "Publisher has not provided links to their terms"         | **Yes**                                                                                                                       | Step 1 (terms and privacy URLs) |
| Missing logo / bare app name                              | **Yes**                                                                                                                       | Step 1                          |
| Unverified publisher domain                               | **Yes**, once this branch is in Production                                                                                    | Step 2                          |
| "Unverified" badge                                        | **No**, waits on Partner Program business verification (days)                                                                 | Step 4                          |
| Organizations that block user consent for unverified apps | Partly. Verification helps. Until then, their admin can grant consent under _Enterprise applications → Atturel → Permissions_ | Step 4, or admin consent        |

None of these steps changes the requested permissions, and none affects
existing connections.
