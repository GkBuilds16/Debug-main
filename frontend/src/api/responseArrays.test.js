import { arrayFromResponseData } from "./responseArrays";

test("normalizes array and wrapped API response shapes safely", () => {
  const rows = [{ _id: "row-1" }];
  expect(arrayFromResponseData(rows)).toEqual(rows);
  expect(arrayFromResponseData({ users: rows })).toEqual(rows);
  expect(arrayFromResponseData({ leaderboard: rows }, "leaderboard")).toEqual(rows);
  expect(arrayFromResponseData({ users: null })).toEqual([]);
  expect(arrayFromResponseData(null)).toEqual([]);
});
