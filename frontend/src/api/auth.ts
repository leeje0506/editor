import api from "./client";
import type { User } from "../types";

export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ token: string; user: User }>("/auth/login", { username, password }).then((r) => r.data),

  getMe: () => api.get<User>("/auth/me").then((r) => r.data),

  updateMe: (data: { display_name?: string; current_password?: string; new_password?: string }) =>
    api.patch<User>("/auth/me", data).then((r) => r.data),

  listUsers: () => api.get<User[]>("/auth/users").then((r) => r.data),

  createUser: (data: { username: string; password: string; display_name: string; role: string }) =>
    api.post<User>("/auth/users", data).then((r) => r.data),

  updateUser: (id: number, data: { display_name?: string; role?: string; is_active?: boolean }) =>
    api.patch<User>(`/auth/users/${id}`, data).then((r) => r.data),

  deleteUser: (id: number) => api.delete(`/auth/users/${id}`),

  resetPassword: (id: number) =>
    api.post<{ message: string }>(`/auth/users/${id}/reset-password`).then((r) => r.data),

  getSettings: async (): Promise<Record<string, any>> => {
    const res = await api.get("/auth/me/settings");
    return res.data;
  },

  saveSettings: async (settings: Record<string, any>): Promise<Record<string, any>> => {
    const res = await api.put("/auth/me/settings", settings);
    return res.data;
  },
};