import axiosInstance from "../api/axiosInstance";

export async function apiFetch(path, options = {}) {
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  let data = options.body;

  if (!isFormData && typeof data === "string" && data.length > 0) {
    try {
      data = JSON.parse(data);
    } catch {
      // Keep non-JSON request bodies unchanged for the host client to report.
    }
  }

  const headers = isFormData
    ? { "Content-Type": "multipart/form-data" }
    : data === undefined || data === null
      ? {}
      : { "Content-Type": "application/json" };

  try {
    const response = await axiosInstance.request({
      url: `/dev/v1${path}`,
      method: options.method || "GET",
      data,
      headers
    });
    return {
      status: response.status,
      ok: true,
      json: async () => response.data
    };
  } catch (error) {
    if (!error.response) throw error;
    return {
      status: error.response.status,
      ok: false,
      json: async () => error.response.data
    };
  }
}
