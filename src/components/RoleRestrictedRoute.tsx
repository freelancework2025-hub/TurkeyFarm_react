import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

type RoleRestrictedRouteProps = {
  children: React.ReactNode;
  /** Role names that are allowed to access this route */
  allowedRoles: string[];
  /** Where to redirect when user is not allowed (default: /suivi-technique-hebdomadaire) */
  redirectTo?: string;
};

/**
 * Route wrapper that restricts access to specific roles.
 * User must have at least one of the allowed roles to see the content.
 */
export default function RoleRestrictedRoute({
  children,
  allowedRoles,
  redirectTo = "/suivi-technique-hebdomadaire",
}: RoleRestrictedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  const hasAllowedRole = user.roles?.some((r) => allowedRoles.includes(r.name ?? "")) ?? false;

  if (!hasAllowedRole) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
