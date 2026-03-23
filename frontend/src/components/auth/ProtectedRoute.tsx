import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../store/useAuthStore";

interface Props {
  children: React.ReactNode;
  roles?: string[];
}

export function ProtectedRoute({ children, roles }: Props) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/projects" replace />;
  }

  return <>{children}</>;
}