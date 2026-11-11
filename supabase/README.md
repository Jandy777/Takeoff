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
- `https://foundationtakeoff.com/index.html`

`schema.sql` documents the base database setup. `employee-signup.sql` extends it
with employee self-registration and verified viewer accounts. `social-signin.sql`
records the earlier Microsoft setup. `simple-signup.sql` supersedes automatic
employee elevation: all new accounts start as viewers, and administrators grant
editing after registration. It also revokes the earlier self-service role RPC.
Microsoft sign-in is no longer part of the product flow. Applied changes
are recorded in Supabase migration history. These are references, not scripts to
rerun over an existing database.

## Accounts and permissions

- The administrator's intended primary email is `jake@concretews.com`.
- The sign-in page lists Hector Reyes, Don Baggio, Steve Martin, Scott Martin,
  Chuck Atkinson, Randy Guenther, and Eric O'Neil. A listed employee can select
  their name and register using a `@concretews.com` address. This records an
  employee request in Team Access. The administrator then grants Estimator
  access to the registered account. A typed address or name cannot grant editing.
  An approved employee slot can belong to one account at a time.
- All new signups receive view-only access to the company library.
  User approval of automatic external viewing is part of this access model.
- `team_access` holds administrator-managed role overrides. Entries made before
  registration do not automatically grant a new account editing permissions.
  Non-company addresses cannot receive editing or administrative roles.
- `team_members` links roles to stable Auth user IDs. The private role helper
  reads this authoritative table plus the actual Auth email, so
  disabling access or changing to a non-company address takes effect without
  waiting for JWT role claims to expire. User-editable metadata cannot change
  an established role or claim another employee after registration.
- Admin: team access plus drawing editing. Estimator: drawing editing. Viewer:
  read-only access to the shared company library.
- Changing an approved account's email preserves its Auth user ID and drawings,
  but requires new administrator approval for editing. The final active admin
  cannot accidentally remove their own access this way.
- Email/password signup has Supabase's Confirm email setting disabled
  for immediate access, as approved by the administrator. Since that removes email ownership verification, editing
  requires an administrator action on an existing account. Custom SMTP remains
  disabled. Password resets still depend on email delivery and its recipient
  restrictions; immediate signup does not solve password-reset delivery.
- Google handles its own sign-in verification and does not need Takeoff emails.
  Personal Google accounts receive viewer access.

## Google setup

The app reads public Auth settings and enables Google only when the
provider is enabled. No OAuth secret belongs in the app, Git,
`netlify.toml`, or a `VITE_` variable. Provider secrets go directly into Supabase.

Google uses this authorized callback:
`https://czjalcygmijkoqplukqt.supabase.co/auth/v1/callback`.
The app returns to `/index.html` on the origin where sign-in started, including
`https://foundationtakeoff.com` and `https://take0ff.netlify.app`.

- Google: configure an external Google Auth Platform application with a Web
  client. Authorized JavaScript origins: `https://foundationtakeoff.com` and
  `https://take0ff.netlify.app`. Use only
  `openid`, email, and profile scopes. Set the production audience so friends
  can sign in without being added as individual test users. Enter its client
  ID and secret in Supabase's Google provider. Google Cloud project: Takeoff
  (`united-pier-514416-h0`).
  Public disclosure pages are `/privacy.html` and `/terms.html` and are linked
  from signup. These are factual descriptions of the current shared-library flow.

Provider activation and an actual account round-trip must be verified before
calling Google ready. Existing password sign-in remains available.

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
- `test-employee-signup.sql`: immediate signup viewing, explicit administrator
  editing approval, duplicate names, domain restrictions, account disabling,
  and email changes. All fixtures roll back; no emails are sent.
- `test-social-signin.sql`: Google-style viewer accounts and revocation of the
  earlier employee elevation endpoint.
  All fixtures roll back; it does not simulate the provider's actual login.

The `.tools/library-preview.html` page is an ignored local UI fixture with
sample data. It is not part of the production build and has no cloud access.
