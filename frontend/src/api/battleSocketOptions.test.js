import { expect, test } from "vitest";
import { BATTLE_SOCKET_OPTIONS } from "./battleSocketOptions";

test("battle sockets authenticate with cookies and reconnect with bounded backoff", () => {
  expect(BATTLE_SOCKET_OPTIONS).toMatchObject({
    withCredentials: true,
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });
});
