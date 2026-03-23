import { create } from "zustand";
import type { User } from "../types";
import { authApi } from "../api/auth";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;

  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: JSON.parse(localStorage.getItem("user") || "null"),
  token: localStorage.getItem("token"),
  isAuthenticated: !!localStorage.getItem("token"),
  loading: false,

  login: async (username, password) => {
    const { token, user } = await authApi.login(username, password);
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    set({ token: null, user: null, isAuthenticated: false });
  },

  loadUser: async () => {
    set({ loading: true });
    try {
      const user = await authApi.getMe();
      localStorage.setItem("user", JSON.stringify(user));
      set({ user, isAuthenticated: true, loading: false });
    } catch {
      set({ user: null, isAuthenticated: false, loading: false });
    }
  },

  isAdmin: () => {
    const { user } = get();
    return user?.role === "master" || user?.role === "manager";
  },
}));