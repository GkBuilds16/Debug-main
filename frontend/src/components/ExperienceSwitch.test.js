import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthContext } from "../context/Authcontext";
import ExperienceSwitch from "./ExperienceSwitch";
import { vi } from "vitest";

function LocationText() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

describe("experience switch", () => {
  test.each([
    ["post", "/post", "/post/dev"],
    ["view", "/view", "/view/dev"],
    ["battles", "/battles", "/battles/dev"]
  ])("switches %s within its section and supports browser history", (section, dsaPath, devPath) => {
    const setExperience = vi.fn();
    render(
      <AuthContext.Provider value={{ user: { _id: "user-1" }, experience: "dsa", setExperience }}>
        <MemoryRouter initialEntries={[dsaPath]}>
          <ExperienceSwitch section={section} />
          <Routes>
            <Route path={dsaPath} element={<p>DSA section</p>} />
            <Route path={devPath} element={<p>Dev section</p>} />
          </Routes>
          <LocationText />
        </MemoryRouter>
      </AuthContext.Provider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Dev" }));
    expect(screen.getByText("Dev section")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(devPath);
    expect(setExperience).toHaveBeenCalledWith("dev");

    fireEvent.click(screen.getByRole("button", { name: "DSA" }));
    expect(screen.getByText("DSA section")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(dsaPath);
    expect(setExperience).toHaveBeenLastCalledWith("dsa");
  });
});
