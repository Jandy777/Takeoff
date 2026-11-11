import { employeeSignupData, isWorkEmail } from "./employeeSignup";

const EMPLOYEE_RETURN_KEY = "takeoff.employee-signin.v1";
const RETURN_LIFETIME = 60 * 60 * 1000;

export async function readAuthProviders(url, key, request = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await request(`${url}/auth/v1/settings`, { headers: { apikey: key }, signal: controller.signal });
    if (!response.ok) throw new Error("Sign-in options could not be loaded. Refresh the page to try again.");
    const settings = await response.json();
    return { google: settings.external?.google === true, azure: settings.external?.azure === true };
  } finally { clearTimeout(timeout); }
}

export function socialSignInRequest(provider, redirectTo, email = "") {
  if (!["google", "azure"].includes(provider)) throw new Error("Choose Microsoft or Google sign-in.");
  return {
    provider,
    options: {
      redirectTo, skipBrowserRedirect: true,
      scopes: provider === "azure" ? "email" : "openid email profile",
      queryParams: { prompt: "select_account", ...(provider === "azure" && email ? { login_hint: email.trim().toLowerCase() } : {}) },
    },
  };
}

export function saveEmployeeReturn(storage, email, employeeId, now = Date.now()) {
  employeeSignupData(email, employeeId);
  storage.setItem(EMPLOYEE_RETURN_KEY, JSON.stringify({ email: email.trim().toLowerCase(), employeeId, createdAt: now }));
}

export function clearEmployeeReturn(storage) { storage.removeItem(EMPLOYEE_RETURN_KEY); }

export function takeEmployeeReturn(storage, now = Date.now()) {
  const raw = storage.getItem(EMPLOYEE_RETURN_KEY);
  storage.removeItem(EMPLOYEE_RETURN_KEY);
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw);
    employeeSignupData(pending.email, pending.employeeId);
    if (!Number.isFinite(pending.createdAt) || now < pending.createdAt || now - pending.createdAt > RETURN_LIFETIME) return null;
    return pending;
  } catch { return null; }
}

export async function completeEmployeeReturn(client, pending, user) {
  if (!pending) return;
  if (!isWorkEmail(user.email) || user.email.toLowerCase() !== pending.email) {
    throw new Error("Microsoft signed in with a different email. Your account has kept its existing permissions. Sign out and choose your work account to finish employee setup.");
  }
  const { error } = await client.rpc("claim_employee_account", { requested_employee: pending.employeeId });
  if (error) throw new Error(error.message);
}
