const sectionCopy = {
  post: {
    eyebrow: "DEV MODE · POST BUG",
    title: "Post Dev Codebase",
    description: "The Dev Mode codebase authoring experience is being integrated into DebugDSA.",
    detail: "You will be able to create and manage your own debugging codebases here."
  },
  view: {
    eyebrow: "DEV MODE · VIEW CODEBASES",
    title: "View Dev Codebases",
    description: "The Dev Mode codebase discovery experience is being integrated into DebugDSA.",
    detail: "Published codebases and candidate workspaces will be available here."
  },
  battles: {
    eyebrow: "DEV MODE · BATTLES",
    title: "Dev Battles",
    description: "The Dev Mode battle experience is being integrated into DebugDSA.",
    detail: "Battle participation and administration will be connected in a later phase."
  }
};

function DevModePlaceholder({ section }) {
  const copy = sectionCopy[section] || sectionCopy.view;

  return (
    <main className="dev-scaffold-page">
      <section className="dev-scaffold-card" aria-labelledby="dev-scaffold-title">
        <p className="dev-scaffold-eyebrow">{copy.eyebrow}</p>
        <h1 id="dev-scaffold-title">{copy.title}</h1>
        <p className="dev-scaffold-description">{copy.description}</p>
        <p className="dev-scaffold-detail">{copy.detail}</p>
        {section === "post" && (
          <p className="dev-scaffold-ai-placeholder">
            <strong>Generate with AI</strong>
            <span>Placeholder — AI Codebase Generator will be integrated in a later phase.</span>
          </p>
        )}
      </section>
    </main>
  );
}

export default DevModePlaceholder;
