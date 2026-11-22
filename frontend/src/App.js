import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
  useNavigationType
} from "react-router-dom";
import { useEffect, useRef } from "react";

import { useAuth } from "./context/Authcontext";

import Navbar from "./components/Navbar";
import RouteErrorBoundary from "./components/RouteErrorBoundary";
import ExperienceSwitch from "./components/ExperienceSwitch";
import DevModePlaceholder from "./pages/DevModePlaceholder";
import PostCodebaseExperience from "./devMode/PostCodebaseExperience";
import ViewCodebasesExperience from "./devMode/ViewCodebasesExperience";
import DevBattlesExperience from "./devMode/DevBattlesExperience";

/* USER PAGES */

import Home from "./pages/Home";
import Login from "./pages/login";
import Signup from "./pages/signup";
import Profile from "./pages/profile";
import Leaderboard from "./pages/leaderboard";
import PostBug from "./pages/postbug";
import ViewBugs from "./pages/viewbugs";
import ViewBug from "./pages/viewbug";
import UserProfile from "./pages/userprofile";
import MySubmissions from "./pages/MySubmissions";
import AllSubmissions from "./pages/AllSubmissions";
import OAuthSuccess from "./pages/OAuthSuccess";
import ResetPassword from "./pages/ResetPassword";
import ForgotPassword from "./pages/ForgotPassword";
/* BATTLES */

import Battles from "./pages/Battles";
import BattleRoom from "./pages/BattleRoom";
import BattleLeaderboard from "./pages/BattleLeaderboard";

/* ADMIN PAGES */

import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminBugs from "./pages/admin/AdminBugs";
import AdminSubmissions from "./pages/admin/AdminSubmissions";
import AdminBattles from "./pages/admin/AdminBattles";
import AdminBattleSubmissions from "./pages/admin/adminBattleSubmissions";

/* PROFILE */

import ProfilePoints from "./pages/ProfilePoints";
import ProfileBugs from "./pages/ProfileBug";
import ProfileFollowers from "./pages/ProfileFollowers";
import ProfileFollowing from "./pages/ProfileFollowing";
import ProfileUpvotes from "./pages/ProfileUpvotes";

/* BUG SOLUTION */

import BugSolution from "./pages/BugSolution";

//////////////////////////////////////////////////////
// PROTECTED ROUTE
//////////////////////////////////////////////////////

function ProtectedRoute({ children }) {

  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={loadingScreen}>
        <h2 style={{ color: "#8b5cf6" }}>Loading DebugDSA...</h2>
      </div>
    );
  }

  return user ? children : <Navigate to="/login" replace />;
}

//////////////////////////////////////////////////////
// ADMIN ROUTE
//////////////////////////////////////////////////////

function AdminRoute({ children }) {

  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={loadingScreen}>
        <h2 style={{ color: "#8b5cf6" }}>Loading Admin...</h2>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return <Navigate to="/admin" replace />;
  }

  return children;
}

//////////////////////////////////////////////////////
// LAYOUT
//////////////////////////////////////////////////////

function Layout() {

  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { user, experience, setExperience } = useAuth();
  const previousPath = useRef(location.pathname);

  const hideNavbar = location.pathname.startsWith("/admin");
  const switchSection = getExperienceSection(location.pathname);

  useEffect(() => {
    const currentPath = location.pathname;
    const pathChanged = previousPath.current !== currentPath;
    previousPath.current = currentPath;

    if (!user || !isExperienceRoot(currentPath)) return;

    const routeExperience = currentPath.endsWith("/dev") ? "dev" : "dsa";
    if (pathChanged && navigationType === "POP") {
      if (routeExperience !== experience) setExperience(routeExperience);
      return;
    }

    const expectedPath = experienceRoute(getExperienceSection(currentPath), experience);
    if (expectedPath && expectedPath !== currentPath) {
      navigate(expectedPath, { replace: true });
    }
  }, [
    experience,
    location.pathname,
    navigate,
    navigationType,
    setExperience,
    user
  ]);

  return (
    <>
      {!hideNavbar && <Navbar />}
      {!hideNavbar && switchSection && <ExperienceSwitch section={switchSection} />}

      <div style={{ paddingTop: hideNavbar ? "0px" : "70px" }}>

        <RouteErrorBoundary locationKey={location.key}>
        <Routes>

          {/* PUBLIC ROUTES */}

          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
<Route
  path="/forgot-password"
  element={<ForgotPassword />}
/>

<Route
  path="/reset-password/:token"
  element={<ResetPassword />}
/>
          {/* GOOGLE OAUTH SUCCESS */}
          <Route path="/oauth-success" element={<OAuthSuccess />} />

          {/* BUG ROUTES */}

          <Route path="/view" element={<ViewBugs />} />
          <Route
            path="/view/dev"
            element={
              <ProtectedRoute>
                <ViewCodebasesExperience />
              </ProtectedRoute>
            }
          />
          <Route path="/view/:id" element={<ViewBug />} />
          <Route path="/leaderboard" element={<Leaderboard />} />

          {/* BATTLES */}

          <Route path="/battles" element={<Battles />} />
          <Route
            path="/battles/dev"
            element={
              <ProtectedRoute>
                <DevBattlesExperience />
              </ProtectedRoute>
            }
          />

          <Route
            path="/battle/:id"
            element={
              <ProtectedRoute>
                <BattleRoom />
              </ProtectedRoute>
            }
          />

          <Route path="/battle-leaderboard" element={<BattleLeaderboard />} />

          {/* USER PROTECTED ROUTES */}

          <Route
            path="/post"
            element={
              <ProtectedRoute>
                <PostBug />
              </ProtectedRoute>
            }
          />

          <Route
            path="/post/dev"
            element={
              <ProtectedRoute>
                <PostCodebaseExperience />
              </ProtectedRoute>
            }
          />

          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />

          <Route path="/profile/:id" element={<UserProfile />} />

          <Route
            path="/mysubmissions"
            element={
              <ProtectedRoute>
                <MySubmissions />
              </ProtectedRoute>
            }
          />

          <Route
            path="/allsubmissions"
            element={
              <ProtectedRoute>
                <AllSubmissions />
              </ProtectedRoute>
            }
          />

          <Route
            path="/bugs/:bugId/solution"
            element={
              <ProtectedRoute>
                <BugSolution />
              </ProtectedRoute>
            }
          />

          {/* PROFILE SUB PAGES */}

          <Route path="/profile/points" element={<ProfilePoints />} />
          <Route path="/profile/bugs" element={<ProfileBugs />} />
          <Route path="/profile/followers" element={<ProfileFollowers />} />
          <Route path="/profile/following" element={<ProfileFollowing />} />
          <Route path="/profile/upvotes" element={<ProfileUpvotes />} />

          {/* ADMIN ROUTES */}

          <Route path="/admin" element={<AdminLogin />} />

          <Route
            path="/admin/dashboard"
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            }
          />

          <Route
            path="/admin/users"
            element={
              <AdminRoute>
                <AdminUsers />
              </AdminRoute>
            }
          />

          <Route
            path="/admin/bugs"
            element={
              <AdminRoute>
                <AdminBugs />
              </AdminRoute>
            }
          />

          <Route
            path="/admin/submissions"
            element={
              <AdminRoute>
                <AdminSubmissions />
              </AdminRoute>
            }
          />

          <Route
            path="/admin/battles"
            element={
              <AdminRoute>
                <AdminBattles />
              </AdminRoute>
            }
          />

          <Route
            path="/admin/battle/:id"
            element={
              <AdminRoute>
                <AdminBattleSubmissions />
              </AdminRoute>
            }
          />

          {/* 404 */}

          <Route
            path="*"
            element={
              <div style={notFound}>
                <h1>404</h1>
                <p>Page not found</p>
              </div>
            }
          />

        </Routes>
        </RouteErrorBoundary>

      </div>
    </>
  );
}

function getExperienceSection(pathname) {
  if (pathname === "/post" || pathname === "/post/dev") return "post";
  if (pathname === "/view" || pathname === "/view/dev" || /^\/view\/[^/]+$/.test(pathname)) return "view";
  if (pathname === "/battles" || pathname === "/battles/dev") return "battles";
  return null;
}

function isExperienceRoot(pathname) {
  return ["/post", "/post/dev", "/view", "/view/dev", "/battles", "/battles/dev"].includes(pathname);
}

function experienceRoute(section, experience) {
  if (!section) return null;
  const routes = {
    post: { dsa: "/post", dev: "/post/dev" },
    view: { dsa: "/view", dev: "/view/dev" },
    battles: { dsa: "/battles", dev: "/battles/dev" }
  };
  return routes[section]?.[experience] || null;
}


//////////////////////////////////////////////////////
// APP
//////////////////////////////////////////////////////

function App() {
  return <Layout />;
}



//////////////////////////////////////////////////////
// STYLES
//////////////////////////////////////////////////////

const loadingScreen = {
  height: "100vh",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  background: "#0f0f12"
};



const notFound = {
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  color: "white",
  background: "#0f0f12"
};

export default App;
