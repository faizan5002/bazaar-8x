import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { RequireAuth } from './RequireAuth';

/**
 * Gate for the seller hub. Signed-out visitors go through the normal sign-in flow and come back; signed-in shoppers
 * who don't run a store are sent to /sell to open one. (Only a convenience: the API is what enforces who owns what.)
 */
export function RequireSeller({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <RequireAuth>
      {user && !user.seller ? <Navigate to="/sell" replace /> : children}
    </RequireAuth>
  );
}
