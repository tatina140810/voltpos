import axios from "axios";
const SUPER_TOKEN_KEY = "voltpos_super_token";
export const superApi = axios.create({
    baseURL: "https://voltpos.online/api",
    timeout: 15000,
});
superApi.interceptors.request.use((config) => {
    const token = localStorage.getItem(SUPER_TOKEN_KEY);
    if (token) {
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});
superApi.interceptors.response.use((response) => response, (error) => {
    if (error?.response?.status === 401) {
        localStorage.removeItem(SUPER_TOKEN_KEY);
        if (!window.location.pathname.startsWith("/super/login")) {
            window.location.href = "/super/login";
        }
    }
    return Promise.reject(error);
});
export { SUPER_TOKEN_KEY };
export default superApi;
