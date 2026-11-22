import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/Authcontext";

const sectionRoutes = {
  post: { dsa: "/post", dev: "/post/dev" },
  view: { dsa: "/view", dev: "/view/dev" },
  battles: { dsa: "/battles", dev: "/battles/dev" }
};

function ExperienceSwitch({ section }) {
  const { setExperience } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const routes = sectionRoutes[section];

  if (!routes) return null;

  const isDevRoute = location.pathname === routes.dev;

  const selectExperience = (nextExperience) => {
    const beforeSwitch = new CustomEvent("debugdsa:before-experience-switch", { cancelable: true });
    window.dispatchEvent(beforeSwitch);
    if (beforeSwitch.defaultPrevented) return;
    setExperience(nextExperience);
    if (location.pathname !== routes[nextExperience]) {
      navigate(routes[nextExperience]);
    }
  };

  return (
    <div className="experience-switch-wrap">
      <div className="experience-switch" role="group" aria-label="Choose experience">
        <span className="experience-switch-label">Experience</span>
        <button
          type="button"
          className={`experience-switch-option${!isDevRoute ? " is-active" : ""}`}
          aria-pressed={!isDevRoute}
          onClick={() => selectExperience("dsa")}
        >
          DSA
        </button>
        <button
          type="button"
          className={`experience-switch-option${isDevRoute ? " is-active" : ""}`}
          aria-pressed={isDevRoute}
          onClick={() => selectExperience("dev")}
        >
          Dev
        </button>
      </div>
    </div>
  );
}

export default ExperienceSwitch;
