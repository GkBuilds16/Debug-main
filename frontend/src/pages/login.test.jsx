import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { vi } from "vitest";
import Login from "./login";
import { AuthContext } from "../context/Authcontext";

function CurrentPath() {
  return <span data-testid="current-path">{useLocation().pathname}</span>;
}

test("login form stays public while unauthenticated and navigates after successful login", async () => {
  const login = vi.fn().mockResolvedValue({ _id: "user-1", role: "user" });

  render(
    <AuthContext.Provider value={{ user: null, login }}>
      <MemoryRouter initialEntries={["/login"]}>
        <Login />
        <CurrentPath />
      </MemoryRouter>
    </AuthContext.Provider>
  );

  expect(screen.getByRole("heading", { name: "Debug Login" })).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText("Email Address"), { target: { value: "person@example.com" } });
  fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "Password123" } });
  fireEvent.click(screen.getByRole("button", { name: "Login" }));

  await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent("/"));
  expect(login).toHaveBeenCalledWith("person@example.com", "Password123");
});
