import test from "node:test";
import assert from "node:assert/strict";
import { pointsForPlace, rankDsaBattle, rankVerifiedDevBattle } from "./competitiveScoring.js";
import { summarizeCompetitiveResults } from "./competitiveLeaderboard.js";

test("awards the documented DSA and Dev placement values", () => {
  assert.deepEqual([1, 2, 3, null].map(place => pointsForPlace("DSA", place)), [100, 60, 40, 10]);
  assert.deepEqual([1, 2, 3, null].map(place => pointsForPlace("DEV", place)), [120, 75, 50, 15]);
});

test("DSA result calculation ignores incomplete, late and out-of-window results", () => {
  const endTime = new Date(Date.now() - 1000);
  const result = rankDsaBattle({ endTime, submissions: [
    { user: "winner", status: "accepted", submittedAt: new Date(+endTime - 500) },
    { user: "participant", status: "pending", submittedAt: new Date(+endTime - 400) },
    { user: "late", status: "accepted", submittedAt: new Date(+endTime - 300), late: true },
    { user: "after-end", status: "accepted", submittedAt: new Date(+endTime + 100) }
  ] });
  assert.deepEqual(result.map(item => [item.userId, item.points, item.won]), [["winner", 100, true], ["participant", 10, false]]);
  assert.deepEqual(rankDsaBattle({ endTime: new Date(Date.now() + 1000), submissions: [] }), []);
  assert.deepEqual(rankDsaBattle({ status: "CANCELLED", endTime, submissions: [{ user: "cancelled", status: "accepted", submittedAt: new Date(+endTime - 100) }] }), []);
});

test("ties share the same place and duplicate Dev results do not double award", () => {
  const tiedAt = new Date(Date.now() - 2000);
  const tied = rankDsaBattle({ endTime: new Date(Date.now() - 1000), submissions: [
    { user: "one", status: "accepted", submittedAt: tiedAt },
    { user: "two", status: "accepted", submittedAt: tiedAt },
    { user: "third", status: "accepted", submittedAt: new Date(+tiedAt + 100) }
  ] });
  assert.deepEqual(tied.map(item => item.points), [100, 100, 40]);

  const dev = rankVerifiedDevBattle([
    { userId: "dev-user", evaluationStatus: "EVALUATED", result: { verified: true, valid: true, place: 1 } },
    { userId: "dev-user", evaluationStatus: "EVALUATED", result: { verified: true, valid: true, place: 1 } },
    { userId: "unverified", evaluationStatus: "EVALUATED", result: { verified: false, valid: true, place: 1 } },
    { userId: "joining-only", evaluationStatus: "NOT_EVALUATED", result: null }
  ]);
  assert.deepEqual(dev, [{ userId: "dev-user", place: 1, points: 120, won: true }]);
});

test("verified valid Dev participation earns points while invalid and unverified outcomes do not", () => {
  const results = rankVerifiedDevBattle([
    { userId: "participant", evaluationStatus: "EVALUATED", result: { verified: true, valid: true, place: null } },
    { userId: "invalid", evaluationStatus: "EVALUATED", result: { verified: true, valid: false, place: null } },
    { userId: "pending", evaluationStatus: "PENDING", result: { verified: true, valid: true, place: 1 } }
  ]);
  assert.deepEqual(results, [{ userId: "participant", place: null, points: 15, won: false }]);
});

test("summarizes combined mode scores and win rate from one result per battle", () => {
  const [stats] = summarizeCompetitiveResults([
    { userId: "u1", mode: "DSA", points: 100, won: true, battleId: "a", completedAt: new Date() },
    { userId: "u1", mode: "DEV", points: 15, won: false, battleId: "b", completedAt: new Date() }
  ]);
  assert.deepEqual({ points: stats.points, dsa: stats.dsaPoints, dev: stats.devPoints, battles: stats.totalBattles, wins: stats.totalWins, winRate: stats.winRate }, {
    points: 115, dsa: 100, dev: 15, battles: 2, wins: 1, winRate: 50
  });
});
