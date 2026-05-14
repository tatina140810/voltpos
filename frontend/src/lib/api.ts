import axios from "axios";

export const api = axios.create({
  baseURL: "https://voltpos.online/api",
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("voltpos_token");
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("access_token");
      localStorage.removeItem("voltpos_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default api;
