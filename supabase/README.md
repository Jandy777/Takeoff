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

`schema.sql` documents the complete database setup. Applied changes are recorded
in Supabase migration history. It is a reference, not a script to rerun over an
existing database.

## Accounts and permissions

- The administrator's intended primary email is `jake@concretews.com`.
- `team_access` is the administrator-managed allowlist. Users create and verify
  their own email/password accounts; only approved addresses become members.
- `team_members` links roles to stable Auth user IDs. The private role helper
  reads this authoritative table, so removing access takes effect without
  waiting for JWT role claims to expire.
- Admin: team access plus drawing editing. Estimator: drawing editing. Viewer:
  read-only access to the shared company library.
- Changing an approved account's email preserves its Auth user ID and drawings.
  Preauthorize the new address before the change and remove the old address
  after verification if it should no longer be approved.
- Default Supabase email delivery has recipient and rate restrictions. Confirm
  the mail configuration before onboarding the wider company team; configure
  an appropriate SMTP sender if required. This is separate from drawing storage.

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

The `.tools/library-preview.html` page is an ignored local UI fixture with
sample data. It is not part of the production build and has no cloud access.
