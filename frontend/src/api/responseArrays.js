export function arrayFromResponseData(payload, property = "users") {
  if (Array.isArray(payload)) return payload;
  const rows = payload?.[property];
  return Array.isArray(rows) ? rows : [];
}
