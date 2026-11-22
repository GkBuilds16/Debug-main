import axios from "axios";
import { API_BASE_URL } from "../config";
import { shouldRefreshSession, shouldRedirectToLogin } from "./authRetry";

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // 🔥 needed for cookies
  headers: {
    "Content-Type": "application/json"
  }
});
let refreshPromise = null;

////////////////////////////////////////////////////////////
// RESPONSE INTERCEPTOR (TOKEN REFRESH)
////////////////////////////////////////////////////////////

axiosInstance.interceptors.response.use(
  (response) => response,

  async (error) => {

    const originalRequest = error.config;

    if (shouldRefreshSession(error)) {

      originalRequest._retry = true;

      try {

        // Share one refresh request across concurrent 401 responses. Refresh
        // tokens rotate on every use, so parallel refreshes would invalidate
        // one another and strand otherwise valid requests.
        if (!refreshPromise) {
          refreshPromise = axiosInstance.post("/auth/refresh").finally(() => {
            refreshPromise = null;
          });
        }
        await refreshPromise;

        // retry original request
        return axiosInstance(originalRequest);

      } catch (refreshError) {

        if (shouldRedirectToLogin(window.location.pathname)) {
          window.location.href = "/login";
        }

        return Promise.reject(refreshError);

      }

    }

    return Promise.reject(error);

  }
);

export default axiosInstance;
