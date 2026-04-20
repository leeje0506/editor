// src/api/auth.ts
import api from "./client";
import type { User } from "../types";
import { ensureArray, ensureObject } from "./guards";

export const authApi = {
  login: async (username: string, password: string) => {
    const r = await api.post("/auth/login", { username, password });
    return ensureObject<{ token: string; user: User }>(r.data, "authApi.login");
  },

  getMe: async () => {
    const r = await api.get("/auth/me");
    return ensureObject<User>(r.data, "authApi.getMe");
  },

  updateMe: async (data: {
    display_name?: string;
    current_password?: string;
    new_password?: string;
  }) => {
    const r = await api.patch("/auth/me", data);
    return ensureObject<User>(r.data, "authApi.updateMe");
  },

  listUsers: async () => {
    const r = await api.get("/auth/users");
    return ensureArray<User>(r.data, "authApi.listUsers");
  },

  createUser: async (data: {
    username: string;
    password: string;
    display_name: string;
    role: string;
  }) => {
    const r = await api.post("/auth/users", data);
    return ensureObject<User>(r.data, "authApi.createUser");
  },

  updateUser: async (
    id: number,
    data: { display_name?: string; role?: string; is_active?: boolean },
  ) => {
    const r = await api.patch(`/auth/users/${id}`, data);
    return ensureObject<User>(r.data, "authApi.updateUser");
  },

  deleteUser: (id: number) => api.delete(`/auth/users/${id}`),

  resetPassword: async (id: number) => {
    const r = await api.post(`/auth/users/${id}/reset-password`);
    return ensureObject<{ message: string }>(r.data, "authApi.resetPassword");
  },

  getSettings: async (): Promise<Record<string, any>> => {
    const r = await api.get("/auth/me/settings");
    return ensureObject<Record<string, any>>(r.data, "authApi.getSettings");
  },

  saveSettings: async (settings: Record<string, any>): Promise<Record<string, any>> => {
    const r = await api.put("/auth/me/settings", settings);
    return ensureObject<Record<string, any>>(r.data, "authApi.saveSettings");
  },
};