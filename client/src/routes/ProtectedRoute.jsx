import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Loader2 } from 'lucide-react';

export function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-brand-600 animate-spin" />
          <p className="text-xs text-app-muted font-medium">Verifying Session Security...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to user's permitted home
    if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
    if (user.role === 'COURSE_CREATOR') return <Navigate to="/creator" replace />;
    if (user.role === 'MODERATOR') return <Navigate to="/moderator" replace />;
    return <Navigate to="/courses" replace />;
  }

  return children;
}
