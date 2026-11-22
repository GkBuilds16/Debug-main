import { useCallback, useEffect, useState } from "react";
import CreatorDashboard from "./post-codebase/CreatorDashboard";
import PostCodebasePage from "./post-codebase/PostCodebasePage";
import { apiFetch } from "./apiClient";

const readResponse = async (path, options = {}) => {
  const response = await apiFetch(path, options);
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error?.message || "Request failed");
  return body;
};

function PostCodebaseExperience() {
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState("");
  const [screen, setScreen] = useState("dashboard");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const guardExperienceSwitch = (event) => {
      if (screen === "editor" && dirty && !window.confirm("You have unsaved codebase changes. Leave this editor?")) {
        event.preventDefault();
      }
    };
    window.addEventListener("debugdsa:before-experience-switch", guardExperienceSwitch);
    return () => window.removeEventListener("debugdsa:before-experience-switch", guardExperienceSwitch);
  }, [dirty, screen]);

  const showNotice = useCallback((message) => setNotice(message || ""), []);
  const openEditor = useCallback(async (codebaseId) => {
    try {
      let result = await readResponse(`/creator/codebases/${codebaseId}`);
      if (result.data.state === "PUBLISHED") {
        result = await readResponse(`/creator/codebases/${codebaseId}/versions`, {
          method: "POST",
          body: "{}"
        });
      }
      setEditing(result.data);
      setNotice("");
      setScreen("editor");
    } catch (error) {
      showNotice(error.message);
    }
  }, [showNotice]);

  const startNewCodebase = () => {
    setEditing(null);
    setNotice("");
    setScreen("editor");
  };

  const returnToDashboard = () => {
    if (dirty && !window.confirm("You have unsaved codebase changes. Leave this editor?")) return;
    setEditing(null);
    setDirty(false);
    setScreen("dashboard");
  };

  return (
    <main className="dev-post-codebase">
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button>
        </div>
      )}
      {screen === "dashboard" ? (
        <CreatorDashboard
          onCreate={startNewCodebase}
          onEdit={openEditor}
          onNotice={showNotice}
        />
      ) : (
        <PostCodebasePage
          key={editing?._id || "new"}
          initialCodebase={editing}
          onSaved={returnToDashboard}
          onCancel={returnToDashboard}
          onNotice={showNotice}
          onDirtyChange={setDirty}
        />
      )}
    </main>
  );
}

export default PostCodebaseExperience;
