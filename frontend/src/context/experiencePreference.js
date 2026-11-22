const STORAGE_PREFIX = "debugdsa:experience:";
const VALID_EXPERIENCES = new Set(["dsa", "dev"]);

export const isExperiencePreference = (value) => VALID_EXPERIENCES.has(value);

export const getExperiencePreferenceKey = (userId) =>
  `${STORAGE_PREFIX}${String(userId)}`;

export const getExperiencePreference = (userId) => {
  if (!userId || typeof window === "undefined") return "dsa";

  try {
    const value = window.localStorage.getItem(getExperiencePreferenceKey(userId));
    return isExperiencePreference(value) ? value : "dsa";
  } catch {
    return "dsa";
  }
};

export const clearExperiencePreference = (userId) => {
  if (!userId || typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(getExperiencePreferenceKey(userId));
  } catch {
    // Preference cleanup must not interrupt logout if browser storage is unavailable.
  }
};
