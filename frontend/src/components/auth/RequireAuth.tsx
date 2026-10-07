import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Container } from '../ui/Container';

/**
 * Gate for pages that need an account (cart, checkout, order confirmation). Signed-out visitors are sent to the
 * sign-in page, which returns them to exactly where they were headed once they sign in or register.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // A stored token is still being checked: don't flash the sign-in page at someone who is signed in.
  if (loading) {
    return (
      <Container className="py-6">
        <div aria-busy="true" aria-label="Loading" className="h-64 animate-pulse rounded-card bg-white shadow-card" />
      </Container>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}
