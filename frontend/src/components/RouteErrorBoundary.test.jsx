import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { vi } from "vitest";
import RouteErrorBoundary from "./RouteErrorBoundary";

function BrokenRoute() {
  throw new Error("render failure");
}

function BoundaryHarness() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <>
      <button onClick={() => navigate("/recovered")}>Navigate away</button>
      <RouteErrorBoundary locationKey={location.key}>
        <Routes>
          <Route path="/broken" element={<BrokenRoute />} />
          <Route path="/recovered" element={<p>Recovered route</p>} />
        </Routes>
      </RouteErrorBoundary>
    </>
  );
}

test("a route render error shows a recovery UI and clears after navigating away", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    render(
      <MemoryRouter initialEntries={["/broken"]}>
        <BoundaryHarness />
      </MemoryRouter>
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Page could not be displayed");
    fireEvent.click(screen.getByRole("button", { name: "Navigate away" }));
    expect(await screen.findByText("Recovered route")).toBeInTheDocument();
  } finally {
    consoleError.mockRestore();
  }
});
