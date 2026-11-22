import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { vi } from "vitest";
import Signup from "./signup";

const { mockSetUser, mockPost } = vi.hoisted(() => ({
  mockSetUser: vi.fn(),
  mockPost: vi.fn()
}));

vi.mock("../firebase", () => ({ auth: null, provider: null, isFirebaseConfigured: false }));
vi.mock("../context/Authcontext", () => ({ useAuth: () => ({ setUser: mockSetUser }) }));
vi.mock("../api/axiosInstance", () => ({ default: { post: (...args) => mockPost(...args) } }));

function CurrentPath() {
  return <span data-testid="current-path">{useLocation().pathname}</span>;
}

test("successful registration stores the user, updates auth state, and navigates home", async () => {
  mockSetUser.mockClear();
  mockPost.mockClear();
  const user = { _id: "registered-user", email: "person@example.com" };
  mockPost.mockResolvedValueOnce({ data: { user } });

  render(
    <MemoryRouter initialEntries={["/signup"]}>
      <Signup />
      <CurrentPath />
    </MemoryRouter>
  );

  fireEvent.change(screen.getByPlaceholderText("Full Name"), { target: { value: "Test Person" } });
  fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: user.email } });
  fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "Password123" } });
  fireEvent.click(screen.getByRole("button", { name: "Signup" }));

  await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent("/"));
  expect(mockPost).toHaveBeenCalledWith("/auth/register", {
    name: "Test Person", email: user.email, password: "Password123"
  });
  expect(mockSetUser).toHaveBeenCalledWith(user);
  expect(JSON.parse(window.localStorage.getItem("user"))).toEqual(user);
});

test("duplicate form submissions while registration is pending send one request", async () => {
  mockSetUser.mockClear();
  mockPost.mockClear();
  let finishRequest;
  mockPost.mockReturnValueOnce(new Promise((resolve) => { finishRequest = resolve; }));

  render(
    <MemoryRouter initialEntries={["/signup"]}>
      <Signup />
    </MemoryRouter>
  );
  fireEvent.change(screen.getByPlaceholderText("Full Name"), { target: { value: "Test Person" } });
  fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "person@example.com" } });
  fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "Password123" } });
  const form = screen.getByRole("button", { name: "Signup" }).closest("form");
  fireEvent.submit(form);
  fireEvent.submit(form);

  expect(mockPost).toHaveBeenCalledTimes(1);
  finishRequest({ data: { user: { _id: "registered-user" } } });
  await waitFor(() => expect(mockSetUser).toHaveBeenCalledTimes(1));
});

test("signup presents the server's retry interval after rate limiting", async () => {
  mockSetUser.mockClear();
  mockPost.mockClear();
  mockPost.mockRejectedValueOnce({
    response: { data: { message: "Too many registration attempts. Please try again in about 4 minute(s)." } }
  });

  render(
    <MemoryRouter initialEntries={["/signup"]}>
      <Signup />
    </MemoryRouter>
  );
  fireEvent.change(screen.getByPlaceholderText("Full Name"), { target: { value: "Test Person" } });
  fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "person@example.com" } });
  fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "Password123" } });
  fireEvent.click(screen.getByRole("button", { name: "Signup" }));

  expect(await screen.findByText(/try again in about 4 minute/i)).toBeInTheDocument();
});
