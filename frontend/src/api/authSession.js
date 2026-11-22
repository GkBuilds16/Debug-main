import axiosInstance from "./axiosInstance";

export async function restoreSessionUser(cachedUser, client = axiosInstance, storage = window.localStorage) {
  try {
    // Initial session discovery must be allowed to conclude as unauthenticated.
    // If it invokes refresh and redirects to /login on refresh failure, the page
    // reloads and starts this same request again indefinitely.
    const response = await client.get("/users/me", { skipAuthRefresh: true });
    const user = response.data.user;
    if (!user) throw new Error("Session response did not include a user");
    storage.setItem("user", JSON.stringify(user));
    return user;
  } catch (error) {
    if ([401, 403].includes(error.response?.status)) {
      storage.removeItem("token");
      storage.removeItem("user");
      return null;
    }
    return cachedUser;
  }
}
