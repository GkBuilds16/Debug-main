import { Navigate } from "react-router-dom";

// Keep the old route as a stable link while ensuring every competitive mode
// uses the same verified, combined leaderboard and its DSA filter.
export default function BattleLeaderboard() {
  return <Navigate to="/leaderboard?mode=dsa" replace />;
}
