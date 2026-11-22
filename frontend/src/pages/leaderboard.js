import { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../context/Authcontext";
import axiosInstance from "../api/axiosInstance";
import { useNavigate, useSearchParams } from "react-router-dom";
import { arrayFromResponseData } from "../api/responseArrays";

const tabs = [
  { id: "overall", label: "Overall" },
  { id: "dsa", label: "DSA Battles" },
  { id: "dev", label: "Dev Battles" }
];
const number = value => (Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "0");

function Leaderboard() {
  const { user, loading: authLoading } = useContext(AuthContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMode = searchParams.get("mode");
  const mode = tabs.some(tab => tab.id === requestedMode) ? requestedMode : "overall";
  const [leaders, setLeaders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [mine, setMine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState("");
  const [statsError, setStatsError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    axiosInstance.get(`/leaderboard/${mode}`)
      .then(response => {
        if (!active) return;
        setLeaders(arrayFromResponseData(response.data));
        setSummary(response.data?.summary || null);
      })
      .catch(err => { if (active) setError(err.response?.data?.message || "Leaderboard results could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mode]);

  useEffect(() => {
    let active = true;
    if (!user || authLoading) {
      setMine(null);
      setStatsLoading(false);
      return () => { active = false; };
    }
    setStatsLoading(true);
    setStatsError("");
    axiosInstance.get("/leaderboard/me")
      .then(response => { if (active) setMine(response.data || null); })
      .catch(err => { if (active) setStatsError(err.response?.data?.message || "Your competitive stats could not be loaded."); })
      .finally(() => { if (active) setStatsLoading(false); });
    return () => { active = false; };
  }, [user, authLoading]);

  const maxModePoints = useMemo(() => Math.max(1, mine?.dsaPoints || 0, mine?.devPoints || 0), [mine]);
  const openProfile = id => { if (id) navigate(`/profile/${id}`); };
  const columns = mode === "overall"
    ? ["Rank", "Competitor", "Total points", "DSA points", "Dev points", "Battles", "Wins", "Win rate"]
    : ["Rank", "Competitor", mode === "dsa" ? "DSA points" : "Dev points", "Battles", "Wins", "Win rate"];

  return <main className="competitive-page">
    <header className="competitive-header">
      <p className="competitive-eyebrow">DEBUGDSA · COMPETITIVE ARENA</p>
      <h1>Competitive Rankings</h1>
      <p>Verified standings from completed DSA and developer debugging battles.</p>
      <span className="competitive-context">{summary ? `Ranking ${number(summary.totalCompetitors)} competitors · Top 50 shown` : "Rankings are calculated from persisted battle results"}</span>
    </header>

    <section className="competitive-stat-grid" aria-label="Competitive statistics">
      <SummaryCard label="Competitors" value={summary?.totalCompetitors} loading={!summary && loading} />
      <SummaryCard label="Completed battles" value={summary?.totalCompletedBattles} loading={!summary && loading} />
      <SummaryCard label="DSA points awarded" value={summary?.totalDsaPointsAwarded} loading={!summary && loading} />
      <SummaryCard label="Dev points awarded" value={summary?.totalDevPointsAwarded} loading={!summary && loading} />
    </section>

    {user && <section aria-label="Your battle performance" className="competitive-performance">
      <div className="competitive-performance-heading"><div><p className="competitive-eyebrow">PERSONAL PERFORMANCE</p><h2>{statsLoading ? "Loading your results…" : mine?.rank ? `Overall rank #${mine.rank}` : "Your battle stats"}</h2></div><strong>{number(mine?.points)} <small>points</small></strong></div>
      {statsError && <p role="alert" className="competitive-error">{statsError}</p>}
      <div className="competitive-personal-stats">
        <PersonalStat label="DSA points" value={mine?.dsaPoints} />
        <PersonalStat label="Dev points" value={mine?.devPoints} />
        <PersonalStat label="Completed battles" value={mine?.totalBattles} />
        <PersonalStat label="Wins" value={mine?.totalWins} />
        <PersonalStat label="Win rate" value={`${number(mine?.winRate)}%`} />
      </div>
      {mine && <div className="competitive-breakdown" aria-label="Points breakdown">
        <div><span>DSA</span><div className="competitive-bar-track"><div className="competitive-bar" style={{ width: `${Math.min(100, ((mine.dsaPoints || 0) / maxModePoints) * 100)}%` }} /></div><strong>{number(mine.dsaPoints)}</strong></div>
        <div><span>Dev</span><div className="competitive-bar-track"><div className="competitive-bar competitive-bar-dev" style={{ width: `${Math.min(100, ((mine.devPoints || 0) / maxModePoints) * 100)}%` }} /></div><strong>{number(mine.devPoints)}</strong></div>
      </div>}
      {mine?.recentResults?.length > 0 && <div className="competitive-recent"><h3>Recent results</h3>{mine.recentResults.slice(0, 5).map((result, index) => <div className="competitive-recent-row" key={`${result.mode}-${result.battleId}-${index}`}><span>{result.mode} · {result.title}</span><strong>+{number(result.points)} pts</strong></div>)}</div>}
      {!mine && !statsLoading && !statsError && <p className="competitive-muted">Your verified results will appear here after your first completed battle.</p>}
    </section>}
    {!user && !authLoading && <p className="competitive-sign-in">Sign in to see your personal competitive performance.</p>}

    <nav aria-label="Leaderboard categories" className="competitive-tabs">
      {tabs.map(tab => <button key={tab.id} type="button" aria-pressed={mode === tab.id} onClick={() => setSearchParams(tab.id === "overall" ? {} : { mode: tab.id })}>{tab.label}</button>)}
    </nav>

    <section className="competitive-table-wrap" aria-label={`${mode} leaderboard`}>
      {error ? <p role="alert" className="competitive-error">{error}</p> : loading ? <div className="competitive-table-loading" role="status">Loading verified rankings…</div> : leaders.length === 0 ? <div className="competitive-empty"><h2>No verified results yet</h2><p>Rankings appear after completed battles have verified results.</p></div> : <>
        <div className="competitive-table-caption">{tabs.find(tab => tab.id === mode)?.label} · {number(leaders.length)} ranked competitors</div>
        <table className="competitive-table"><thead><tr>{columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>
          {leaders.map((leader, index) => <tr key={leader._id || index}>
            <td><span className={`competitive-rank ${leader.rank <= 3 ? `rank-${leader.rank}` : ""}`}>#{leader.rank || index + 1}</span></td>
            <td><div className="competitive-competitor"><span className="competitive-avatar" aria-hidden="true">{leader.name?.trim()?.charAt(0)?.toUpperCase() || "D"}</span><button type="button" onClick={() => openProfile(leader._id)}>{leader.name || "DebugDSA user"}</button></div></td>
            {mode === "overall" && <td className="competitive-points">{number(leader.points)}</td>}
            {mode !== "dev" && <td>{number(leader.dsaPoints)}</td>}
            {mode !== "dsa" && <td>{number(leader.devPoints)}</td>}
            <td>{number(leader.totalBattles)}</td><td>{number(leader.totalWins)}</td><td>{number(leader.winRate)}%</td>
          </tr>)}
        </tbody></table>
        {leaders.length < (summary?.totalCompetitors || 0) && <p className="competitive-muted competitive-limit">Showing the top {leaders.length} of {number(summary.totalCompetitors)} competitors.</p>}
      </>}
    </section>
  </main>;
}

function SummaryCard({ label, value, loading }) {
  return <article className="competitive-summary-card"><span>{label}</span><strong>{loading ? "…" : number(value)}</strong></article>;
}

function PersonalStat({ label, value }) {
  return <div><span>{label}</span><strong>{value == null ? "—" : typeof value === "number" ? number(value) : value}</strong></div>;
}

export default Leaderboard;
