import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
const TOKEN_STORAGE_KEY = "emb_auth_token";

const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  withCredentials: true,
});

// Frontend and backend run on different subdomains, so the session cookie the backend
// also sets gets treated as a third-party cookie and blocked by modern browsers. We rely
// on a Bearer token instead — attached here from localStorage on every request.
api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function getAuthToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setAuthToken(token) {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // ignore storage failures (private browsing, etc.)
  }
}

function clearAuthToken() {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export default api;
export { BACKEND_URL, getAuthToken, setAuthToken, clearAuthToken };
