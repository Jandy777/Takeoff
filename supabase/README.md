# Takeoff drawing library

The local app uses the dedicated Free-plan project `czjalcygmijkoqplukqt`.
No Storage buckets or PDF uploads are used. Drawing geometry is stored in
`public.drawings.document` as versioned JSON; color overrides are stored in
`settings`. The list query retrieves metadata only.

## Configuration

Copy `.env.example` to `.env.local` and use the project's URL and **publishable**
key. Never put a secret/service-role key into a Vite environment variable.
Production receives these two public browser values from `netlify.toml` during
the build. They are not server credentials and do not grant administrative
access. Supabase Auth and database row-level policies enforce permissions.

The Supabase Auth Site URL is `https://take0ff.netlify.app`. The allowed return
URLs are:

- `http://127.0.0.1:4176/index.html`
- `http://localhost:4176/index.html`
- `https://take0ff.netlify.app/index.html`

`schema.sql` documents the base database setup. `employee-signup.sql` extends it
with employee self-registration and verified viewer accounts. `social-signin.sql`
adds authenticated employee setup after Microsoft sign-in. Applied changes
are recorded in Supabase migration history. These are references, not scripts to
rerun over an existing database.

## Accounts and permissions

- The administrator's intended primary email is `jake@concretews.com`.
- The sign-in page lists Hector Reyes, Don Baggio, Steve Martin, Scott Martin,
  Chuck Atkinson, Randy Guenther, and Eric O'Neil. A listed employee can select
  their name and register using a verified `@concretews.com` address to receive
  editing access automatically. Employee slots are claimed only after email
  verification and can belong to one account at a time.
- Other verified signups receive view-only access to the company library.
  User approval of automatic external viewing is part of this access model.
- `team_access` holds administrator-managed role overrides and preapprovals.
  Non-company addresses cannot receive editing or administrative roles.
- `team_members` links roles to stable Auth user IDs. The private role helper
  reads this authoritative table plus the actual verified Auth email, so
  disabling access or changing to a non-company address takes effect without
  waiting for JWT role claims to expire. User-editable metadata cannot change
  an established role or claim another employee after registration.
- Admin: team access plus drawing editing. Estimator: drawing editing. Viewer:
  read-only access to the shared company library.
- Changing an approved account's email preserves its Auth user ID and drawings.
  Preauthorize the new address before the change and remove the old address
  after verification if it should no longer be approved.
- Microsoft and Google verify email during their own sign-in flows. These
  accounts do not need Takeoff confirmation emails or a separate mail sender.
  Personal Google accounts receive viewer access. Microsoft employees select
  their name, enter their work address, and sign in with that same account.
  The protected `claim_employee_account` RPC checks the real verified Auth
  email and roster, preserves admin overrides, and refuses disabled accounts
  or a name already claimed by another account.
- Email/password accounts remain supported. Their confirmation and password
  reset emails still need a configured sender for general onboarding: the
  default Supabase sender only supports project-team recipients. Custom SMTP
  is currently disabled. This does not affect Microsoft/Google sign-in.

## Microsoft and Google setup

The app reads public Auth settings and enables each button only when the
corresponding provider is enabled. No OAuth secret belongs in the app, Git,
`netlify.toml`, or a `VITE_` variable. Provider secrets go directly into Supabase.

Both providers use this authorized callback:
`https://czjalcygmijkoqplukqt.supabase.co/auth/v1/callback`.
The app then returns to `https://take0ff.netlify.app/index.html`.

- Google: configure an external Google Auth Platform application with a Web
  client. Authorized JavaScript origin: `https://take0ff.netlify.app`. Use only
  `openid`, email, and profile scopes. Set the production audience so friends
  can sign in without being added as individual test users. Enter its client
  ID and secret in Supabase's Google provider. Google Cloud project: Takeoff
  (`united-pier-514416-h0`).
- Microsoft: register a Web application in Microsoft Entra. Use the company
  tenant for employee-only Microsoft sign-in, and configure its tenant URL
  in Supabase's Azure provider. Add the `email` and `xms_edov` optional ID-token
  claims, plus `xms_edov` for access tokens, as recommended by Supabase. Keep
  unverified email domains disabled. Enter the client ID and secret directly
  in Supabase and record the secret expiry. The app requests the `email` scope.

Provider activation and an actual account round-trip must be verified before
calling either provider ready. Existing password sign-in remains available.

## Saves and revisions

Autosave uses a version condition so another estimator's newer save cannot be
silently overwritten. The browser retains recovery drafts per account and
drawing until the cloud save succeeds. Recovery against an already changed
cloud drawing creates a separate recovered copy.

“New revision” runs a transaction that preserves the previous revision and
creates an independent editable copy. Preserved revisions open in a read-only
viewer and can be used as the starting point of another revision. An approved
field-release workflow is a separate future feature.

## Verification

- `npm test`: existing geometry tests plus metadata grouping, serialization,
  anchor and color preservation, loaded identifiers, and form rendering.
- `npm run build`: production compilation.
- `test-library.sql`: transactional save/reopen, conflict, revision, and access
  checks against the project. Its fixtures are rolled back.
- `test-employee-signup.sql`: verifies email confirmation, employee claims,
  domain restrictions, forged metadata, duplicate names, account disabling,
  and work-to-external email changes. All fixtures roll back; no emails are sent.
- `test-social-signin.sql`: verified OAuth-style user setup, personal-account
  restrictions, duplicate names, admin demotion, and account revocation.
  All fixtures roll back; it does not simulate the provider's actual login.

The `.tools/library-preview.html` page is an ignored local UI fixture with
sample data. It is not part of the production build and has no cloud access.
