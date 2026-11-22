import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { AuthContext } from "../context/Authcontext";
import { apiFetch } from "./apiClient";

async function api(path, options) {
  const response = await apiFetch(`/battles${path}`, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || "Unable to complete this Dev Battle action.");
  return body;
}

const filtersInitial = { q: "", difficulty: "", language: "", technology: "", status: "UPCOMING", tab: "all" };
const battleViews = [
  { id: "available", label: "Available", status: "UPCOMING", tab: "all" },
  { id: "live", label: "Live", status: "LIVE", tab: "all" },
  { id: "mine", label: "My battles", status: "", tab: "mine" },
  { id: "completed", label: "Completed", status: "COMPLETED", tab: "all" }
];

export default function DevBattlesExperience() {
  const { user } = useContext(AuthContext);
  const [battles, setBattles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [activePath, setActivePath] = useState("");
  const [filters, setFilters] = useState(filtersInitial);
  const [submissions, setSubmissions] = useState([]);
  const [battleResults, setBattleResults] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [clockNow, setClockNow] = useState(Date.now());
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page, limit: 12 });
      for (const [key, value] of Object.entries(filters)) if (value && !(key === "tab" && value === "all")) params.set(key, value);
      const result = await api(`?${params}`);
      setBattles(result.data || []);
      setPages(result.pagination?.pages || 1);
    } catch (cause) {
      setError(cause.message || "Unable to load Dev Battles.");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (selected?.status !== "LIVE") return undefined;
    const interval = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [selected?.status]);

  const updateFilter = (key, value) => {
    setFilters(current => ({ ...current, [key]: value }));
    setPage(1);
  };

  const changeView = view => {
    setFilters(current => ({ ...current, status: view.status, tab: view.tab }));
    setPage(1);
  };

  const open = async battle => {
    setBusy(true);
    setError("");
    setWorkspace(null);
    setBattleResults(null);
    try {
      const result = await api(`/${battle.id}`);
      setSelected(result.data);
    } catch (cause) {
      setError(cause.message || "Unable to load this battle.");
    } finally {
      setBusy(false);
    }
  };

  const register = async () => {
    setBusy(true);
    try {
      await api(`/${selected.id}/register`, { method: "POST", body: "{}" });
      const result = await api(`/${selected.id}`);
      setSelected(result.data);
      await load();
    } catch (cause) {
      setError(cause.message || "Unable to register for this battle.");
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    try {
      const result = await api(`/${selected.id}/workspace`, { method: "POST", body: "{}" });
      setWorkspace(result.data);
      setActivePath(result.data.files[0]?.path || "");
      setError("");
    } catch (cause) {
      setError(cause.message || "Unable to open the battle workspace.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!workspace) throw new Error("Open a battle workspace before saving.");
    const result = await api(`/${selected.id}/workspace/${workspace.id}`, {
      method: "PATCH",
      body: JSON.stringify({ revision: workspace.revision, files: workspace.files })
    });
    setWorkspace(result.data);
    return result.data;
  };

  const saveWithMessage = async () => {
    setBusy(true);
    try { await save(); setError(""); }
    catch (cause) { setError(cause.message || "Unable to save workspace."); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const saved = await save();
      const result = await api(`/${selected.id}/submit`, { method: "POST", body: JSON.stringify({ workspaceId: saved.id }) });
      setSelected(current => ({ ...current, submitted: result.data }));
      setWorkspace(null);
      setError("");
    } catch (cause) {
      setError(cause.message || "Unable to submit this workspace.");
    } finally { setBusy(false); }
  };

  const loadSubmissions = async () => {
    try { setSubmissions((await api(`/${selected.id}/submissions`)).data || []); setError(""); }
    catch (cause) { setError(cause.message || "Unable to load submissions for review."); }
  };

  const loadResults = async () => {
    try { setBattleResults((await api(`/${selected.id}/results`)).data.results || []); setError(""); }
    catch (cause) { setError(cause.message || "Verified results are not available yet."); }
  };

  const review = async (submissionId, valid, place) => {
    setBusy(true);
    try {
      await api(`/${selected.id}/submissions/${submissionId}/result`, { method: "PATCH", body: JSON.stringify({ valid, place }) });
      await loadSubmissions();
    } catch (cause) { setError(cause.message || "Unable to record the verified result."); }
    finally { setBusy(false); }
  };

  const updateFile = content => setWorkspace(current => ({
    ...current,
    files: current.files.map(file => file.path === activePath ? { ...file, content } : file)
  }));

  return <main className="dev-view-codebases dev-battles-page">
    <header><p className="dev-view-eyebrow">DEV MODE · COMPETITIVE DEBUGGING</p><h1>Dev Battles</h1><p>Join scheduled debugging challenges, work in an isolated project workspace, and review verified results.</p></header>
    {!selected && <>
      <nav className="dev-battle-tabs" aria-label="Battle categories">{battleViews.map(view => <button key={view.id} type="button" aria-pressed={filters.tab === view.tab && filters.status === view.status} onClick={() => changeView(view)}>{view.label}</button>)}</nav>
      <section className="dev-view-filters dev-battle-filters" aria-label="Dev Battle filters">
        <input aria-label="Search Dev Battles" placeholder="Search battles" value={filters.q} onChange={event => updateFilter("q", event.target.value)} />
        <select aria-label="Battle difficulty" value={filters.difficulty} onChange={event => updateFilter("difficulty", event.target.value)}><option value="">All difficulties</option><option>Easy</option><option>Medium</option><option>Hard</option></select>
        <input aria-label="Battle language" placeholder="Language" value={filters.language} onChange={event => updateFilter("language", event.target.value)} />
        <input aria-label="Battle technology" placeholder="Technology" value={filters.technology} onChange={event => updateFilter("technology", event.target.value)} />
      </section>
      {error && <p role="alert" className="dev-view-error">{error}</p>}
      {loading ? <section className="dev-view-grid" role="status" aria-label="Loading Dev Battles">{Array.from({ length: 6 }, (_, index) => <div className="dev-view-card dev-view-skeleton" key={index} aria-hidden="true"><h2 /><p /></div>)}</section> : battles.length === 0 ? <section className="dev-view-empty"><h2>No battles match these filters</h2><p>Try changing your search, or check back when the next challenge is scheduled.</p><button onClick={() => { setFilters(filtersInitial); setPage(1); }}>Clear filters</button></section> : <section className="dev-view-grid">{battles.map(battle => <article className="dev-view-card" key={battle.id}>
        <div className="dev-view-card-top"><span className={`dev-view-battle-status status-${battle.status.toLowerCase()}`}>{battle.status}</span><span className={`dev-view-difficulty difficulty-${battle.difficulty.toLowerCase()}`}>{battle.difficulty}</span></div>
        <h2>{battle.title}</h2><p>{battle.description || battle.challengeTitle}</p>
        <div className="dev-view-tags">{[...(battle.languages || []), ...(battle.technologies || [])].map(language => <span key={language}>{language}</span>)}</div>
        <small>Host: {battle.hostName} · {battle.registrationCount} participants</small>
        <small>{battle.durationMinutes} minute battle · Starts {new Date(battle.startsAt).toLocaleString()}</small>
        {battle.registration && <small className="dev-battle-registered">You are registered</small>}
        <button className="dev-view-primary" onClick={() => open(battle)}>View Details</button>
      </article>)}</section>}
      {!loading && pages > 1 && <nav className="dev-view-pagination"><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {pages}</span><button disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Next</button></nav>}
    </>}
    {selected && <section className="dev-view-detail">
      <button disabled={busy} onClick={() => { setSelected(null); setWorkspace(null); setSubmissions([]); setBattleResults(null); setError(""); }}>Back to battles</button>
      <p className="dev-view-eyebrow">{selected.status} · {selected.difficulty} DEV BATTLE</p><h2>{selected.title}</h2><p>{selected.description}</p>
      <div className="dev-view-project-facts"><span>Challenge: {selected.challengeTitle}</span><span>Host: {selected.hostName || "DebugDSA host"}</span><span>Languages: {selected.languages?.join(", ") || "Not specified"}</span><span>Technology: {selected.technologies?.join(", ") || "Not specified"}</span><span>Participants: {selected.registrationCount}</span><span>Duration: {selected.durationMinutes} minutes</span><span>Ends: {new Date(selected.endsAt).toLocaleString()}</span></div>
      {selected.status === "LIVE" && <p className="dev-battle-timer" role="timer">Time remaining: {formatRemaining(selected.endsAt, clockNow)}</p>}
      <div className="dev-view-challenge"><h3>Challenge instructions</h3><p>{selected.instructions || selected.rules || "Inspect the project and submit a verified fix before the timer ends."}</p>{selected.rules && <p><strong>Rules:</strong> {selected.rules}</p>}</div>
      {selected.submitted && <p className="dev-view-status">Submission received. Evaluation status: {selected.submitted.evaluationStatus}. Results are only added to rankings after verified review.</p>}
      {!selected.submitted && selected.registration?.status === "REGISTERED" && selected.status === "LIVE" && !workspace && <button className="dev-view-primary" disabled={busy} onClick={start}>{busy ? "Opening…" : "Enter Battle Workspace"}</button>}
      {selected.status === "UPCOMING" && !selected.registration && <button className="dev-view-primary" disabled={busy} onClick={register}>{busy ? "Registering…" : "Join Battle"}</button>}
      {selected.status === "UPCOMING" && selected.registration && <p className="dev-battle-registered">You are registered. Workspace access opens when the battle goes live.</p>}
      {selected.status === "LIVE" && !selected.registration && <p>Registration is closed or your account is not eligible for this battle.</p>}
      {selected.status === "COMPLETED" && <><button className="dev-view-primary" onClick={loadResults}>View Results</button><button className="dev-view-secondary" onClick={() => navigate("/leaderboard?mode=dev")}>Dev Leaderboard</button></>}
      {battleResults && <div className="dev-view-challenge"><h3>Verified battle results</h3>{battleResults.find(result => result.won) && <p className="dev-battle-winner">Winner: {battleResults.find(result => result.won).userName}</p>}{battleResults.length === 0 ? <p>Results are awaiting verified review.</p> : battleResults.map(result => <div className="dev-battle-review" key={result.userId}><strong>{result.place ? `#${result.place}` : "Participant"} · {result.userName}</strong><span>{result.points} points</span></div>)}</div>}
      {error && <p role="alert" className="dev-view-error">{error}</p>}
      {workspace && <div className="dev-battle-workspace"><aside><h3>Challenge files</h3>{workspace.files.map(file => <button key={file.path} aria-pressed={file.path === activePath} onClick={() => setActivePath(file.path)}>{file.path}</button>)}</aside><div><h3>{activePath}</h3><Editor height="480px" language={languageForPath(activePath)} value={workspace.files.find(file => file.path === activePath)?.content || ""} onChange={updateFile} theme="vs-dark" options={{ minimap: { enabled: false }, wordWrap: "on", automaticLayout: true }} /><div className="dev-battle-actions"><button disabled={busy} onClick={saveWithMessage}>Save workspace</button><button disabled={busy} onClick={submit}>Submit snapshot</button></div></div></div>}
      {user?.role === "admin" && selected.status === "COMPLETED" && <div className="dev-view-challenge"><h3>Verified submission review</h3><p>Only an administrator can record final results. A verified result can only be recorded once per submission.</p><button onClick={loadSubmissions}>Load submissions</button>{submissions.map(item => <div className="dev-battle-review" key={item.id}><strong>{item.userName}</strong><span>{item.fileCount} files · {item.evaluationStatus}</span>{item.evaluationStatus !== "EVALUATED" && <div><button disabled={busy} onClick={() => review(item.id, true, 1)}>1st</button><button disabled={busy} onClick={() => review(item.id, true, 2)}>2nd</button><button disabled={busy} onClick={() => review(item.id, true, 3)}>3rd</button><button disabled={busy} onClick={() => review(item.id, true, null)}>Participation</button><button disabled={busy} onClick={() => review(item.id, false, null)}>Not valid</button></div>}</div>)}</div>}
    </section>}
  </main>;
}

function languageForPath(path = "") {
  const extension = path.split(".").pop()?.toLowerCase();
  return ({ js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", py: "python", java: "java", c: "c", h: "c", cpp: "cpp", cs: "csharp", go: "go", rs: "rust", html: "html", css: "css", json: "json", md: "markdown", sql: "sql" })[extension] || "plaintext";
}

function formatRemaining(endsAt, now) {
  const remaining = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000));
  const minutes = Math.floor(remaining / 60).toString().padStart(2, "0");
  const seconds = (remaining % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
