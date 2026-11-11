// Parse only public status fields. Tokens stay with the Supabase client and
// are never included in UI messages, logs, or drawing data.
export function authReturnNotice(href) {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const value = (key) => fragment.get(key) || url.searchParams.get(key);
  if (value("error_code") === "otp_expired") return {
    kind: "warning",
    message: "This confirmation link has already been used or has expired. For an email change, check both inboxes for the newest confirmation messages. If both are confirmed, sign in with your new email; you do not need to reopen the links.",
  };
  if (value("error")) return { kind: "warning", message: "Sign-in or email confirmation could not be completed. You can try signing in again. For an email change, check your account and both inboxes before requesting another link." };
  if (value("message")?.startsWith("Confirmation link accepted.")) return {
    kind: "info",
    message: "One email confirmation was accepted. Please also open the email-change confirmation in your other inbox. This is separate from the original account signup confirmation.",
  };
  return null;
}

export function authReturnUrl(location) {
  // The app can be opened at / or /index.html. Always use the exact callback
  // address registered for both local testing and Netlify.
  return `${location.origin}/index.html`;
}
