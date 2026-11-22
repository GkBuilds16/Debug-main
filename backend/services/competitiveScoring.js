export const COMPETITIVE_POINTS = Object.freeze({
  DSA: Object.freeze({ first: 100, second: 60, third: 40, participation: 10 }),
  DEV: Object.freeze({ first: 120, second: 75, third: 50, participation: 15 })
});

export function pointsForPlace(mode, place) {
  const points = COMPETITIVE_POINTS[mode];
  if (!points) throw new TypeError("Unknown competition mode.");
  if (place === 1) return points.first;
  if (place === 2) return points.second;
  if (place === 3) return points.third;
  return points.participation;
}

export function rankDsaBattle(battle) {
  const completedAt = new Date(battle.endTime);
  if (battle.status === "CANCELLED" || !Number.isFinite(+completedAt) || completedAt > new Date()) return [];

  const participants = new Map();
  for (const submission of battle.submissions || []) {
    if (!submission.user || submission.late || !submission.submittedAt) continue;
    const submittedAt = new Date(submission.submittedAt);
    if (!Number.isFinite(+submittedAt) || submittedAt > completedAt) continue;
    const userId = String(submission.user._id || submission.user);
    const current = participants.get(userId) || { userId, acceptedAt: null };
    if (submission.status === "accepted" && (!current.acceptedAt || submittedAt < current.acceptedAt)) {
      current.acceptedAt = submittedAt;
    }
    participants.set(userId, current);
  }

  const ordered = [...participants.values()].sort((a, b) => {
    if (!a.acceptedAt) return b.acceptedAt ? 1 : a.userId.localeCompare(b.userId);
    if (!b.acceptedAt) return -1;
    return a.acceptedAt - b.acceptedAt || a.userId.localeCompare(b.userId);
  });
  let lastAcceptedAt = null;
  let place = 0;
  return ordered.map((entry, index) => {
    if (entry.acceptedAt) {
      if (!lastAcceptedAt || +entry.acceptedAt !== +lastAcceptedAt) place = index + 1;
      lastAcceptedAt = entry.acceptedAt;
    }
    const awardedPlace = entry.acceptedAt && place <= 3 ? place : null;
    return {
      userId: entry.userId,
      place: awardedPlace,
      points: pointsForPlace("DSA", awardedPlace),
      won: awardedPlace === 1
    };
  });
}

export function rankVerifiedDevBattle(submissions) {
  const eligible = (submissions || []).filter(submission =>
    submission.evaluationStatus === "EVALUATED" &&
    submission.result?.verified === true &&
    submission.result?.valid === true
  );
  const userPlaces = new Map();
  for (const submission of eligible) {
    const place = Number.isInteger(submission.result.place) && submission.result.place > 0
      ? submission.result.place
      : null;
    const userId = String(submission.userId);
    const previous = userPlaces.get(userId);
    if (!previous || (place !== null && (previous === null || place < previous))) userPlaces.set(userId, place);
  }
  const ranked = [];
  for (const [userId, place] of [...userPlaces.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    ranked.push({ userId, place: place !== null && place <= 3 ? place : null, points: pointsForPlace("DEV", place !== null && place <= 3 ? place : null), won: place === 1 });
  }
  return ranked;
}
