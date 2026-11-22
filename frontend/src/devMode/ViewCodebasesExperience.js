import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { apiFetch } from "./apiClient";

async function api(path) {
  const response = await apiFetch(`/view${path}`);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || "Unable to load codebases.");
  return body;
}

function ViewCodebasesExperience() {
  const [filters, setFilters] = useState({ q: "", difficulty: "", language: "", technology: "", sort: "newest" });
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [selected, setSelected] = useState(null);
  const [files, setFiles] = useState([]);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: pagination.page, limit: 12, sort: filters.sort });
        Object.entries(filters).forEach(([key, value]) => value && key !== "sort" && params.set(key, value));
        const result = await api(`/codebases?${params}`);
        if (active) {
          setRows(result.data || []);
          setPagination(value => ({ ...value, ...(result.pagination || {}) }));
          setError("");
        }
      } catch (cause) {
        if (active) setError(cause.message || "Unable to load published projects.");
      } finally {
        if (active) setLoading(false);
      }
    }, filters.q ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [filters, pagination.page]);

  const updateFilter = (key, value) => {
    setFilters(current => ({ ...current, [key]: value }));
    setPagination(current => ({ ...current, page: 1 }));
  };

  const open = async row => {
    setDetailLoading(true);
    setError("");
    try {
      const [detail, tree] = await Promise.all([api(`/codebases/${row._id}`), api(`/codebases/${row._id}/files`)]);
      setSelected(detail.data);
      setFiles(tree.data.files || []);
      setFile(null);
    } catch (cause) {
      setError(cause.message || "Unable to load this project.");
    } finally {
      setDetailLoading(false);
    }
  };

  const openFile = async path => {
    try {
      setFile((await api(`/codebases/${selected._id}/file?path=${encodeURIComponent(path)}`)).data);
      setError("");
    } catch (cause) {
      setError(cause.message || "Unable to load this project file.");
    }
  };

  return (
    <main className="dev-view-codebases">
      <header>
        <p className="dev-view-eyebrow">DEV MODE · PROJECT DISCOVERY</p>
        <h1>Explore Developer Projects</h1>
        <p>Browse published codebases, inspect the reported issue, and explore project files before you start debugging.</p>
        <div className="dev-view-header-actions"><span>{loading ? "Loading published projects…" : `${pagination.total || 0} published projects`}</span><Link to="/post/dev">Publish Project</Link></div>
      </header>
      <section className="dev-view-filters" aria-label="Codebase filters">
        <input aria-label="Search codebases" placeholder="Search title or description" value={filters.q} onChange={event => updateFilter("q", event.target.value)} />
        <select aria-label="Filter difficulty" value={filters.difficulty} onChange={event => updateFilter("difficulty", event.target.value)}><option value="">All difficulties</option><option>Easy</option><option>Medium</option><option>Hard</option></select>
        <input aria-label="Filter language" placeholder="Language" value={filters.language} onChange={event => updateFilter("language", event.target.value)} />
        <input aria-label="Filter technology" placeholder="Technology" value={filters.technology} onChange={event => updateFilter("technology", event.target.value)} />
        <select aria-label="Sort codebases" value={filters.sort} onChange={event => updateFilter("sort", event.target.value)}><option value="newest">Newest</option><option value="popular">Most popular</option><option value="difficulty">Most challenging</option></select>
      </section>
      {(filters.q || filters.difficulty || filters.language || filters.technology || filters.sort !== "newest") && <button className="dev-view-clear" onClick={() => { setFilters({ q: "", difficulty: "", language: "", technology: "", sort: "newest" }); setPagination(value => ({ ...value, page: 1 })); }}>Clear filters</button>}
      {error && <p role="alert" className="dev-view-error">{error}</p>}
      {detailLoading && <p className="dev-view-status" role="status">Loading project details and file tree…</p>}
      {!selected && !detailLoading && (loading ? (
        <section className="dev-view-grid" aria-label="Loading published projects">{Array.from({ length: 6 }, (_, index) => <div className="dev-view-card dev-view-skeleton" key={index} aria-hidden="true"><span /><h2 /><p /><small /></div>)}</section>
      ) : rows.length === 0 ? (
        <section className="dev-view-empty"><h2>No published projects yet</h2><p>Publish a codebase to share a real debugging challenge with the community.</p><Link to="/post/dev">Publish a project</Link></section>
      ) : (
        <section className="dev-view-grid">{rows.map(row => <article className="dev-view-card" key={row._id}>
          <div className="dev-view-card-top"><span className={`dev-view-difficulty difficulty-${row.difficulty?.toLowerCase()}`}>{row.difficulty || "Unrated"}</span><span className="dev-view-project-status">{row.state || "PUBLISHED"}</span></div>
          <h2>{row.title}</h2><p>{row.description}</p>
          <div className="dev-view-tags">{(row.languages || []).slice(0, 2).concat((row.technologies || []).slice(0, 2)).map(tag => <span key={tag}>{tag}</span>)}</div>
          <small>By {row.author?.name || "DebugDSA user"} · {row.fileCount || 0} files · {row.reportedIssueCount || 0} reported issue{row.reportedIssueCount === 1 ? "" : "s"}</small>
          <small className="dev-view-card-date">Updated {row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : row.publishedAt ? new Date(row.publishedAt).toLocaleDateString() : "date unavailable"} · {row.viewCount || 0} views</small>
          <button type="button" className="dev-view-primary" onClick={() => open(row)}>View Project</button>
        </article>)}</section>
      ))}
      {!selected && !loading && pagination.pages > 1 && <nav className="dev-view-pagination"><button disabled={pagination.page <= 1} onClick={() => setPagination(value => ({ ...value, page: value.page - 1 }))}>Previous</button><span>Page {pagination.page} of {pagination.pages}</span><button disabled={pagination.page >= pagination.pages} onClick={() => setPagination(value => ({ ...value, page: value.page + 1 }))}>Next</button></nav>}
      {selected && <section className="dev-view-detail">
        <button onClick={() => { setSelected(null); setFile(null); setError(""); }}>Back to projects</button>
        <p className="dev-view-eyebrow">{selected.difficulty} DEBUGGING PROJECT</p><h2>{selected.title}</h2><p>{selected.detailedDescription || selected.description}</p>
        <div className="dev-view-project-facts"><span>Author: {selected.author?.name || "DebugDSA user"}</span><span>Languages: {selected.languages?.join(", ") || "Not specified"}</span><span>Stack: {[...(selected.technologies || []), ...(selected.frameworks || [])].join(", ") || "Not specified"}</span><span>Files: {selected.fileCount || files.length}</span><span>Version: {selected.version || "Not specified"}</span><span>Updated: {selected.updatedAt ? new Date(selected.updatedAt).toLocaleDateString() : "Date unavailable"}</span></div>
        {(selected.bugTitle || selected.bugDescription || selected.problemStatement) && <div className="dev-view-challenge"><h3>{selected.bugTitle || "Reported problem"}</h3><p>{selected.bugDescription || selected.problemStatement}</p>{selected.currentBehavior && <p><strong>Current behavior:</strong> {selected.currentBehavior}</p>}{selected.expectedBehavior && <p><strong>Expected behavior:</strong> {selected.expectedBehavior}</p>}</div>}
        {selected.instructions && <div className="dev-view-challenge"><h3>Project instructions</h3><p>{selected.instructions}</p></div>}
        <div className="dev-view-files"><aside><h3>Project files</h3>{files.map(item => <button key={item.path} onClick={() => openFile(item.path)}>{item.path}</button>)}</aside><article>{file ? <><h3>{file.path}</h3><Editor height="460px" language={languageForPath(file.path)} value={file.content} theme="vs-dark" options={{ readOnly: true, minimap: { enabled: false }, wordWrap: "on", automaticLayout: true }} /></> : <p>Select a file to inspect its contents.</p>}</article></div>
      </section>}
    </main>
  );
}

function languageForPath(path = "") {
  const extension = path.split(".").pop()?.toLowerCase();
  return ({ js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", py: "python", java: "java", c: "c", h: "c", cpp: "cpp", cs: "csharp", go: "go", rs: "rust", html: "html", css: "css", json: "json", md: "markdown", sql: "sql" })[extension] || "plaintext";
}

export default ViewCodebasesExperience;
