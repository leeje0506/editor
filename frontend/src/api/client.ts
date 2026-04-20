// src/api/client.ts
import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// JWT 토큰 자동 첨부
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// HTTP 에러 상세 로그 + 401 처리
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const method = err.config?.method?.toUpperCase?.() || "UNKNOWN";
    const baseURL = err.config?.baseURL || "";
    const url = err.config?.url || "";
    const fullUrl = `${baseURL}${url}`;

    if (err.response) {
      console.error("[API ERROR]", {
        method,
        url: fullUrl,
        status: err.response.status,
        data: err.response.data,
      });
    } else if (err.request) {
      console.error("[API NETWORK ERROR]", {
        method,
        url: fullUrl,
        message: "응답을 받지 못했습니다.",
      });
    } else {
      console.error("[API REQUEST SETUP ERROR]", {
        method,
        url: fullUrl,
        message: err.message,
      });
    }

    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");

      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    return Promise.reject(err);
  },
);

export default api;