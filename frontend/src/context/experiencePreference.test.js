import {
  clearExperiencePreference,
  getExperiencePreference,
  getExperiencePreferenceKey
} from "./experiencePreference";

describe("experience preference storage", () => {
  beforeEach(() => window.localStorage.clear());

  test("defaults to DSA and accepts only supported preference values", () => {
    expect(getExperiencePreference("user-1")).toBe("dsa");
    window.localStorage.setItem(getExperiencePreferenceKey("user-1"), "other");
    expect(getExperiencePreference("user-1")).toBe("dsa");
  });

  test("stores preferences under a stable user-specific key", () => {
    window.localStorage.setItem(getExperiencePreferenceKey("user-1"), "dev");
    window.localStorage.setItem(getExperiencePreferenceKey("user-2"), "dsa");

    expect(getExperiencePreference("user-1")).toBe("dev");
    expect(getExperiencePreference("user-2")).toBe("dsa");
  });

  test("clears only the selected user's preference", () => {
    window.localStorage.setItem(getExperiencePreferenceKey("user-1"), "dev");
    window.localStorage.setItem(getExperiencePreferenceKey("user-2"), "dev");

    clearExperiencePreference("user-1");

    expect(getExperiencePreference("user-1")).toBe("dsa");
    expect(getExperiencePreference("user-2")).toBe("dev");
  });
});
