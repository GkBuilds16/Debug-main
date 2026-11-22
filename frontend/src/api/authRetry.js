export function shouldRefreshSession(error) {
  const requestUrl = error.config?.url || "";
  const isAuthenticationRequest = [
    "/auth/refresh",
    "/auth/login",
    "/auth/register",
    "/auth/firebase-login",
    "/auth/logout",
    "/auth/forgot-password",
    "/auth/reset-password",
  ].some((path) => requestUrl.includes(path));
  return error.response?.status === 401 &&
    !error.config?._retry &&
    !error.config?.skipAuthRefresh &&
    !isAuthenticationRequest;
}

export function shouldRedirectToLogin(pathname) {
  return pathname !== "/login" && pathname !== "/signup";
}
