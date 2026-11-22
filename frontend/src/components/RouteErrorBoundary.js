import React from "react";
import { Link } from "react-router-dom";

export default class RouteErrorBoundary extends React.Component {
  state = { error: null, errorLocationKey: null };

  static getDerivedStateFromError(error) {
    return { error: error || new Error("Route rendering failed.") };
  }

  componentDidCatch(error) {
    // Keep diagnostics useful without logging component data or request content.
    console.error("Route rendering failed:", error?.name || "Error");
    this.setState({ errorLocationKey: this.props.locationKey });
  }

  componentDidUpdate() {
    if (this.state.error &&
        this.state.errorLocationKey !== null &&
        this.state.errorLocationKey !== this.props.locationKey) {
      this.setState({ error: null, errorLocationKey: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <main role="alert" style={fallbackStyle}>
          <h1>Page could not be displayed</h1>
          <p>This page encountered a rendering problem. Choose another page or retry.</p>
          <div style={actionsStyle}>
            <button type="button" onClick={() => this.setState({ error: null, errorLocationKey: null })}>
              Try again
            </button>
            <Link to="/">Go to Home</Link>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

const fallbackStyle = {
  minHeight: "60vh",
  padding: "48px 24px",
  display: "grid",
  alignContent: "center",
  justifyItems: "center",
  gap: 12,
  color: "#e2e8f0",
  background: "#0f0f12",
  textAlign: "center"
};

const actionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: 16
};
