export async function readAuthProviders(url, key, request = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await request(`${url}/auth/v1/settings`, { headers: { apikey: key }, signal: controller.signal });
    if (!response.ok) throw new Error("Sign-in options could not be loaded. Refresh the page to try again.");
    const settings = await response.json();
    return { google: settings.external?.google === true };
  } finally { clearTimeout(timeout); }
}

export function socialSignInRequest(provider, redirectTo) {
  if (provider !== "google") throw new Error("Choose Google sign-in.");
  return {
    provider,
    options: {
      redirectTo, skipBrowserRedirect: true,
      scopes: "openid email profile",
      queryParams: { prompt: "select_account" },
    },
  };
}
