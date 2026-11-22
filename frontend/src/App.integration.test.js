import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import App from "./App";
import { AuthContext } from "./context/Authcontext";
import { vi } from "vitest";

const { mockGet, mockRequest } = vi.hoisted(() => ({ mockGet: vi.fn(), mockRequest: vi.fn() }));
vi.mock("./api/axiosInstance", () => ({ default: { get: (...args) => mockGet(...args), request: (...args) => mockRequest(...args) } }));
vi.mock("./pages/postbug", () => ({ default: () => <p>Existing DSA post page</p> }));
vi.mock("./pages/viewbugs", () => ({ default: () => <p>Existing DSA view page</p> }));
vi.mock("./pages/viewbug", () => ({ default: () => <p>Existing DSA bug detail</p> }));
vi.mock("./pages/Battles", () => ({ default: () => <p>Existing DSA battles page</p> }));
vi.mock("./pages/BattleRoom", () => ({ default: () => <p>Existing DSA battle room</p> }));
vi.mock("./pages/Home", () => ({ default: () => <p>Existing Home page</p> }));
vi.mock("./pages/profile", () => ({ default: () => <p>Existing Profile page</p> }));
vi.mock("./devMode/post-codebase/CreatorDashboard", () => ({ default: () => <h1>Your challenge workspace.</h1> }));
vi.mock("./devMode/post-codebase/PostCodebasePage", () => ({ default: () => <p>Dev codebase editor</p> }));

function renderAt(path, experience = "dsa") {
  return render(
    <AuthContext.Provider value={{
      user: { _id: "user-1", role: "user" },
      loading: false,
      experience,
      setExperience: vi.fn(),
      logout: vi.fn()
    }}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

function renderUnauthenticatedAt(path) {
  function LocationProbe() {
    const location = useLocation();
    return <span data-testid="current-path">{location.pathname}</span>;
  }

  return render(
    <AuthContext.Provider value={{
      user: null,
      loading: false,
      experience: "dsa",
      setExperience: vi.fn(),
      setUser: vi.fn(),
      login: vi.fn(),
      logout: vi.fn()
    }}>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe("DebugDSA route preservation and Dev scaffold routes", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockRequest.mockReset();
    mockGet.mockImplementation(url => Promise.resolve(url === "/leaderboard/me"
      ? { data: { points: 0, dsaPoints: 0, devPoints: 0, totalBattles: 0, totalWins: 0, winRate: 0, recentResults: [] } }
      : { data: { users: [] } }));
    const project = { _id: "project-1", title: "Cache Debug Project", description: "Repair a stale cache", detailedDescription: "A real published project.", difficulty: "Medium", state: "PUBLISHED", author: { name: "Ada" }, languages: ["JavaScript"], technologies: ["Redis"], files: [], fileCount: 1, reportedIssueCount: 1, bugTitle: "Stale response", bugDescription: "The cache is not invalidated." };
    const devBattle = { id: "dev-battle-1", title: "Cache Repair Sprint", description: "Fix the invalidation logic", challengeTitle: "Cache Debug Project", difficulty: "Medium", languages: ["JavaScript"], status: "UPCOMING", startsAt: new Date(Date.now() + 3600000).toISOString(), endsAt: new Date(Date.now() + 7200000).toISOString(), durationMinutes: 60, registrationCount: 5, hostName: "Ada", registration: null, instructions: "Inspect the code and make a fix." };
    mockRequest.mockImplementation(({ url, method }) => {
      if (url.includes("/dev/v1/battles")) {
        if (url.includes("/register") && method === "POST") return Promise.resolve({ status: 201, data: { success: true, data: { status: "REGISTERED" } } });
        if (url.includes("/dev-battle-1")) return Promise.resolve({ status: 200, data: { success: true, data: devBattle } });
        return Promise.resolve({ status: 200, data: { success: true, data: [devBattle], pagination: { page: 1, pages: 1 } } });
      }
      if (url.includes("/codebases/project-1/files")) return Promise.resolve({ status: 200, data: { success: true, data: { files: [{ path: "src/index.js" }] } } });
      if (url.includes("/codebases/project-1")) return Promise.resolve({ status: 200, data: { success: true, data: project } });
      return Promise.resolve({ status: 200, data: { success: true, data: [project], pagination: { page: 1, pages: 1 } } });
    });
  });

  test("the Navbar opens the leaderboard and browser Back and Forward restore routes", async () => {
    function HistoryControls() {
      const navigate = useNavigate();
      const location = useLocation();
      return (
        <>
          <button onClick={() => navigate(-1)}>Go back</button>
          <button onClick={() => navigate(1)}>Go forward</button>
          <span data-testid="current-path">{location.pathname}</span>
        </>
      );
    }

    render(
      <AuthContext.Provider value={{
        user: { _id: "user-1", role: "user" }, loading: false,
        experience: "dsa", setExperience: vi.fn(), logout: vi.fn()
      }}>
        <MemoryRouter initialEntries={["/"]}>
          <App />
          <HistoryControls />
        </MemoryRouter>
      </AuthContext.Provider>
    );

    expect(screen.getByText("Existing Home page")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Leaderboard" }));
    expect(await screen.findByRole("heading", { name: /Competitive Rankings/ })).toBeInTheDocument();
    expect(screen.getByTestId("current-path")).toHaveTextContent("/leaderboard");
    expect(mockGet).toHaveBeenCalledWith("/leaderboard/overall");

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent("/"));
    expect(screen.getByText("Existing Home page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Go forward" }));
    await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent("/leaderboard"));
    expect(screen.getByRole("heading", { name: /Competitive Rankings/ })).toBeInTheDocument();
  });

  test("direct leaderboard route renders and reports API failures", async () => {
    mockGet.mockRejectedValueOnce({ response: { status: 503, data: { message: "Leaderboard service unavailable." } } });
    renderAt("/leaderboard");

    expect(screen.getByRole("heading", { name: /Competitive Rankings/ })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Leaderboard service unavailable.");
  });

  test("Dev project discovery filters published results and opens project details", async () => {
    renderAt("/view/dev", "dev");
    expect(await screen.findByRole("heading", { name: "Explore Developer Projects" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Cache Debug Project" })).toBeInTheDocument();
    expect(screen.getByText(/1 files · 1 reported issue/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search codebases" }), { target: { value: "cache" } });
    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining("q=cache") })));
    fireEvent.click(screen.getByRole("button", { name: "View Project" }));
    expect(await screen.findByText("Stale response")).toBeInTheDocument();
    expect(screen.getByText("Project files")).toBeInTheDocument();
  });

  test("Dev Battles can be searched, opened, and registered for", async () => {
    renderAt("/battles/dev", "dev");
    expect(await screen.findByRole("heading", { name: "Dev Battles" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Cache Repair Sprint" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search Dev Battles" }), { target: { value: "cache" } });
    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining("q=cache") })));
    fireEvent.click(screen.getByRole("button", { name: "View Details" }));
    expect(await screen.findByText("Inspect the code and make a fix.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Join Battle" }));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", url: expect.stringContaining("/register") })));
  });

  test("leaderboard renders the backend users response shape", async () => {
    mockGet.mockResolvedValueOnce({ data: { users: [{ _id: "leader-1", name: "Ada Lovelace", rank: 1, points: 42, dsaPoints: 32, devPoints: 10, totalBattles: 4, totalWins: 1, winRate: 25 }] } });
    renderAt("/leaderboard");

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "DSA points" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Dev points" })).toBeInTheDocument();
    expect(screen.getByText("32")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  test("leaderboard tabs load DSA-only and Dev-only rankings", async () => {
    renderAt("/leaderboard");
    expect(await screen.findByRole("button", { name: "DSA Battles" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "DSA Battles" }));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/leaderboard/dsa"));
    fireEvent.click(screen.getByRole("button", { name: "Dev Battles" }));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/leaderboard/dev"));
  });

  test("legacy battle rankings route opens the unified DSA leaderboard", async () => {
    mockGet.mockResolvedValueOnce({ data: { users: [{ _id: "battle-leader-1", name: "Grace Hopper", rank: 1, points: 31, dsaPoints: 31, devPoints: 0, totalBattles: 1, totalWins: 0, winRate: 0 }] } });
    renderAt("/battle-leaderboard");

    expect(await screen.findByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith("/leaderboard/dsa");
  });

  test("unified DSA leaderboard reports API failures from the legacy route", async () => {
    mockGet.mockRejectedValueOnce({ response: { status: 503, data: { message: "Battle rankings are temporarily unavailable." } } });
    renderAt("/battle-leaderboard");

    expect(await screen.findByRole("alert")).toHaveTextContent("Battle rankings are temporarily unavailable.");
  });

  test("public login and signup forms render for unauthenticated visitors", () => {
    const login = renderUnauthenticatedAt("/login");
    expect(screen.getByRole("heading", { name: "Debug Login" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Email Address")).toBeInTheDocument();

    login.unmount();
    renderUnauthenticatedAt("/signup");
    expect(screen.getByRole("heading", { name: "Create Account" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Full Name")).toBeInTheDocument();
  });

  test("an unauthenticated protected route redirects to login once and stays there", async () => {
    renderUnauthenticatedAt("/post");
    expect(await screen.findByRole("heading", { name: "Debug Login" })).toBeInTheDocument();
    expect(screen.getByTestId("current-path")).toHaveTextContent("/login");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId("current-path")).toHaveTextContent("/login");
  });

  test.each([
    ["/post", "Existing DSA post page", "dsa"],
    ["/view", "Existing DSA view page", "dsa"],
    ["/battles", "Existing DSA battles page", "dsa"],
    ["/post/dev", "Your challenge workspace.", "dev"],
    ["/view/dev", "Explore Developer Projects", "dev"],
    ["/battles/dev", "Dev Battles", "dev"],
    ["/post", "Your challenge workspace.", "dev"]
  ])("renders %s without replacing the existing DSA pages", (path, heading, experience) => {
    renderAt(path, experience);
    expect(screen.getByText(heading)).toBeInTheDocument();
  });

  test.each([
    ["/battle/example", "Existing DSA battle room"],
    ["/", "Existing Home page"],
    ["/profile", "Existing Profile page"]
  ])("preserves the existing route %s", (path, content) => {
    renderAt(path);
    expect(screen.getByText(content)).toBeInTheDocument();
  });

  test("the view Dev route wins over the existing dynamic bug detail route", () => {
    renderAt("/view/dev", "dev");
    expect(screen.getByRole("heading", { name: "Explore Developer Projects" })).toBeInTheDocument();
    expect(screen.queryByText("Existing DSA bug detail")).not.toBeInTheDocument();
  });

  test("browser back and forward follow the selected experience in the same section", async () => {
    function StatefulAuth({ children }) {
      const [experience, setExperience] = useState("dsa");
      return (
        <AuthContext.Provider value={{
          user: { _id: "user-1", role: "user" },
          loading: false,
          experience,
          setExperience,
          logout: vi.fn()
        }}>
          {children}
        </AuthContext.Provider>
      );
    }

    function HistoryControls() {
      const navigate = useNavigate();
      const location = useLocation();
      return (
        <>
          <button onClick={() => navigate(-1)}>Browser back</button>
          <button onClick={() => navigate(1)}>Browser forward</button>
          <span data-testid="current-path">{location.pathname}</span>
        </>
      );
    }

    render(
      <StatefulAuth>
        <MemoryRouter initialEntries={["/post"]}>
          <App />
          <HistoryControls />
        </MemoryRouter>
      </StatefulAuth>
    );

    fireEvent.click(screen.getByRole("button", { name: "Dev" }));
    await screen.findByRole("heading", { name: /Your challenge workspace/ });
    expect(screen.getByTestId("current-path")).toHaveTextContent("/post/dev");

    fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
    await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent("/post"));
    expect(screen.getByText("Existing DSA post page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Browser forward" }));
    await screen.findByRole("heading", { name: /Your challenge workspace/ });
    expect(screen.getByTestId("current-path")).toHaveTextContent("/post/dev");
  });
});
