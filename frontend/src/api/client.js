const runtimeOrigin =
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://localhost:8000";

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || runtimeOrigin;
const normalizedBaseUrl = rawBaseUrl.endsWith("/") ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
const baseUrl = normalizedBaseUrl.endsWith("/api") ? normalizedBaseUrl : `${normalizedBaseUrl}/api`;
const TOKEN_STORAGE_KEY = "ocr-platform.tokens";

let tokens = loadStoredTokens();

function loadStoredTokens() {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.accessToken && parsed.refreshToken) {
      return parsed;
    }
  } catch (error) {
    console.warn("Failed to parse stored tokens", error);
  }
  return null;
}

function persistTokens(nextTokens) {
  tokens = nextTokens;
  if (typeof window === "undefined") {
    return;
  }
  if (nextTokens) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(nextTokens));
  } else {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

function normalizeTokenPair(pair) {
  if (!pair?.access_token || !pair?.refresh_token) {
    throw new Error("Invalid token payload received from server");
  }
  return {
    accessToken: pair.access_token,
    refreshToken: pair.refresh_token,
  };
}

async function refreshTokens() {
  if (!tokens?.refreshToken) {
    throw new Error("Refresh token unavailable");
  }

  const response = await fetch(`${baseUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: tokens.refreshToken }),
  });

  if (!response.ok) {
    persistTokens(null);
    throw new Error("Session expired. Please login again.");
  }

  const data = await response.json();
  const normalized = normalizeTokenPair(data);
  persistTokens(normalized);
  return normalized;
}

async function request(path, options = {}) {
  const {
    method = "GET",
    json,
    formData,
    headers = {},
    auth = true,
    retry = true,
  } = options;

  const finalHeaders = { ...headers };
  let body = options.body ?? undefined;

  if (formData) {
    body = formData;
  } else if (json !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (
    body &&
    typeof body === "object" &&
    !(body instanceof FormData) &&
    !finalHeaders["Content-Type"]
  ) {
    finalHeaders["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }

  if (auth && tokens?.accessToken) {
    finalHeaders.Authorization = `Bearer ${tokens.accessToken}`;
  }

  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: finalHeaders,
      body,
    });
  } catch (networkError) {
    const err = new Error("Network error. Please check your connection.");
    err.cause = networkError;
    throw err;
  }

  if (response.status === 401 && auth && retry && tokens?.refreshToken) {
    try {
      await refreshTokens();
      return request(path, { ...options, retry: false });
    } catch (refreshError) {
      persistTokens(null);
      const err = new Error(refreshError.message || "Authentication expired");
      err.status = 401;
      throw err;
    }
  }

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(text || `Request failed with status ${response.status}`);
    err.status = response.status;
    throw err;
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text;
}

async function login(credentials) {
  const data = await request("/auth/login", {
    method: "POST",
    json: credentials,
    auth: false,
  });
  const normalized = normalizeTokenPair(data);
  persistTokens(normalized);
  return normalized;
}

async function register(payload) {
  return request("/auth/register", {
    method: "POST",
    json: payload,
    auth: false,
  });
}

function logout() {
  persistTokens(null);
}

export const apiClient = {
  baseUrl,
  request,
  get(path, options = {}) {
    return request(path, { ...options, method: "GET" });
  },
  post(path, jsonBody, options = {}) {
    return request(path, { ...options, method: "POST", json: jsonBody });
  },
  postForm(path, formData, options = {}) {
    return request(path, { ...options, method: "POST", formData });
  },
  delete(path, options = {}) {
    return request(path, { ...options, method: "DELETE" });
  },
  login,
  register,
  logout,
  refreshAuth: refreshTokens,
  getTokens() {
    return tokens;
  },
  setTokens(pair) {
    persistTokens(pair);
  },
  clearTokens() {
    persistTokens(null);
  },
};
