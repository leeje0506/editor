import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "./components/auth/LoginPage";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { HomePage } from "./components/home/HomePage";
import { AppLayout } from "./components/layout/AppLayout";
import { SettingsPage } from "./components/settings/SettingsPage";
import { ActivityController } from "./components/activity/ActivityController";
import "./index.css";

function RootRedirect() {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "master" || user.role === "manager") return <Navigate to="/dashboard" replace />;
  return <Navigate to="/projects" replace />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ActivityController />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RootRedirect />} />
        <Route path="/dashboard" element={<ProtectedRoute roles={["master","manager"]}><HomePage /></ProtectedRoute>} />
        <Route path="/projects" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/editor/:projectId" element={<ProtectedRoute><AppLayout /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/settings/:tab" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);