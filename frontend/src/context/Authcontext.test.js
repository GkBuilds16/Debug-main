import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./Authcontext";
import { restoreSessionUser } from "../api/authSession";
import { getExperiencePreferenceKey } from "./experiencePreference";
import { vi } from "vitest";

vi.mock("../firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({ signOut: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../api/axiosInstance", () => ({ default: { post: vi.fn().mockResolvedValue({}) } }));
vi.mock("../api/authSession", () => ({ restoreSessionUser: vi.fn() }));

function AuthProbe() {
  const { user, experience, setExperience, setUser, logout, login } = useAuth();

  return (
    <div>
      <span data-testid="user-id">{user?._id || user?.id || "signed-out"}</span>
      <span data-testid="experience">{experience}</span>
      <button onClick={() => setExperience("dev")}>Choose Dev</button>
      <button onClick={() => setUser({ _id: "user-2" })}>Sign in as another user</button>
      <button onClick={() => login("person@example.com", "Password123")}>Log in</button>
      <button onClick={logout}>Log out</button>
    </div>
  );
}

describe("authenticated experience preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
    restoreSessionUser.mockResolvedValue({ _id: "user-1" });
  });

  test("login stores the returned user and updates authentication state", async () => {
    const { default: axiosInstance } = await import("../api/axiosInstance");
    const signedInUser = { _id: "signed-in-user", email: "person@example.com" };
    axiosInstance.post.mockResolvedValueOnce({ data: { user: signedInUser } });
    render(<AuthProvider><AuthProbe /></AuthProvider>);
    await screen.findByText("user-1");

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(screen.getByTestId("user-id")).toHaveTextContent("signed-in-user"));
    expect(JSON.parse(window.localStorage.getItem("user"))).toEqual(signedInUser);
  });

  test("unauthenticated initialization resolves loading without repeated session checks", async () => {
    restoreSessionUser.mockClear();
    restoreSessionUser.mockResolvedValueOnce(null);
    render(<AuthProvider><AuthProbe /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId("user-id")).toHaveTextContent("signed-out"));
    expect(restoreSessionUser).toHaveBeenCalledTimes(1);
  });

  test("defaults to DSA and restores the user's preference after provider remount", async () => {
    const first = render(<AuthProvider><AuthProbe /></AuthProvider>);
    await screen.findByText("user-1");
    expect(screen.getByTestId("experience")).toHaveTextContent("dsa");

    fireEvent.click(screen.getByRole("button", { name: "Choose Dev" }));
    expect(screen.getByTestId("experience")).toHaveTextContent("dev");
    expect(window.localStorage.getItem(getExperiencePreferenceKey("user-1"))).toBe("dev");

    first.unmount();
    render(<AuthProvider><AuthProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("experience")).toHaveTextContent("dev"));
  });

  test("synchronizes a preference change received from another tab", async () => {
    render(<AuthProvider><AuthProbe /></AuthProvider>);
    await screen.findByText("user-1");

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: getExperiencePreferenceKey("user-1"),
        newValue: "dev"
      }));
    });

    await waitFor(() => expect(screen.getByTestId("experience")).toHaveTextContent("dev"));
  });

  test("clears the old identity preference when the user changes and on logout", async () => {
    window.localStorage.setItem(getExperiencePreferenceKey("user-1"), "dev");
    render(<AuthProvider><AuthProbe /></AuthProvider>);
    await screen.findByText("user-1");

    fireEvent.click(screen.getByRole("button", { name: "Sign in as another user" }));
    await waitFor(() => expect(screen.getByTestId("user-id")).toHaveTextContent("user-2"));
    expect(window.localStorage.getItem(getExperiencePreferenceKey("user-1"))).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Choose Dev" }));
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(screen.getByTestId("user-id")).toHaveTextContent("signed-out"));
    expect(window.localStorage.getItem(getExperiencePreferenceKey("user-2"))).toBeNull();
    expect(screen.getByTestId("experience")).toHaveTextContent("dsa");
  });
});
