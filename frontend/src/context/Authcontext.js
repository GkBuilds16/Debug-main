import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";

import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import axiosInstance from "../api/axiosInstance";
import { restoreSessionUser } from "../api/authSession";
import {
  clearExperiencePreference,
  getExperiencePreference,
  getExperiencePreferenceKey,
  isExperiencePreference
} from "./experiencePreference";

////////////////////////////////////////////////////////////

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {

  const [user, setUser] = useState(null);

  const [loading, setLoading] = useState(true);
  const [experiencePreference, setExperiencePreferenceState] = useState({
    userId: null,
    value: "dsa"
  });
  const previousUserId = useRef(null);

  const userId = user?._id || user?.id || user?.uid || null;

  useEffect(() => {
    const previousId = previousUserId.current;
    if (previousId && previousId !== userId) {
      clearExperiencePreference(previousId);
    }
    previousUserId.current = userId;

    if (!userId) {
      setExperiencePreferenceState({ userId: null, value: "dsa" });
      return;
    }

    setExperiencePreferenceState({
      userId: String(userId),
      value: getExperiencePreference(userId)
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;

    const key = getExperiencePreferenceKey(userId);
    const syncPreference = (event) => {
      if (event.key !== key) return;
      setExperiencePreferenceState({
        userId: String(userId),
        value: isExperiencePreference(event.newValue) ? event.newValue : "dsa"
      });
    };

    window.addEventListener("storage", syncPreference);
    return () => window.removeEventListener("storage", syncPreference);
  }, [userId]);

  const experience = experiencePreference.userId === String(userId)
    ? experiencePreference.value
    : userId ? getExperiencePreference(userId) : "dsa";

  const setExperience = useCallback((value) => {
    if (!isExperiencePreference(value)) return;
    if (userId) {
      const normalizedUserId = String(userId);
      try {
        localStorage.setItem(getExperiencePreferenceKey(normalizedUserId), value);
      } catch {
        // The current page can still use the selection if browser storage is unavailable.
      }
      setExperiencePreferenceState({ userId: normalizedUserId, value });
    }
  }, [userId]);

  ////////////////////////////////////////////////////////////
  // LOAD USER
  ////////////////////////////////////////////////////////////

  useEffect(() => {
    const loadUser = async () => {
      try {
        let cachedUser = null;
        try {
          cachedUser = JSON.parse(localStorage.getItem("user") || "null");
        } catch {
          localStorage.removeItem("user");
        }
        const restoredUser = await restoreSessionUser(cachedUser, axiosInstance, localStorage);
        setUser(restoredUser);
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  ////////////////////////////////////////////////////////////
  // LOGIN
  ////////////////////////////////////////////////////////////

  const login = async (email, password) => {

    try {

      const res = await axiosInstance.post(
        "/auth/login",
        {
          email,
          password
        }
      );

      localStorage.setItem(
        "user",
        JSON.stringify(res.data.user)
      );

      setUser(res.data.user);

      return res.data.user;

    } catch (error) {

      console.error("Login error:", error);

      throw new Error(error?.response?.data?.message || "Login failed. Please try again.");

    }

  };

  ////////////////////////////////////////////////////////////
  // REFRESH USER
  ////////////////////////////////////////////////////////////

  const refreshUser = async () => {

    try {

      const res = await axiosInstance.get("/users/me");

      setUser(res.data.user);

      localStorage.setItem(
        "user",
        JSON.stringify(res.data.user)
      );

    } catch (err) {

      console.log(err);

    }

  };

  ////////////////////////////////////////////////////////////
  // LOGOUT
  ////////////////////////////////////////////////////////////

  const logout = async () => {

    if (userId) clearExperiencePreference(userId);
    setExperiencePreferenceState({ userId: null, value: "dsa" });

    try {
      await axiosInstance.post("/auth/logout");
    } catch (err) {
      console.log("Backend session logout could not be confirmed");
    }

    try {

      // Firebase logout
      if (auth) await signOut(auth);

    } catch (err) {

      console.log("Firebase logout skipped");

    }

    // Clear local auth
    localStorage.removeItem("token");

    localStorage.removeItem("user");

    setUser(null);

    // Redirect
    window.location.href = "/login";

  };

  ////////////////////////////////////////////////////////////

  return (

    <AuthContext.Provider
      value={{
        user,
        setUser,
        experience,
        setExperience,
        login,
        logout,
        loading,
        refreshUser
      }}
    >

      {children}

    </AuthContext.Provider>

  );

};

////////////////////////////////////////////////////////////

export const useAuth = () =>
  useContext(AuthContext);
