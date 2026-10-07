import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';

const inputClass =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-400/40';

/** Shared sign-in / create-account form. */
export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const cameFrom = (location.state as { from?: string } | null)?.from;
  const redirectTo = cameFrom ?? '/';
  const isLogin = mode === 'login';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isLogin) await login(email, password);
      else await register(name, email, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-10">
      <Link to="/" className="mb-6 block text-center text-3xl font-extrabold tracking-tight">
        Bazaar<span className="text-accent-500">.</span>
      </Link>
      <form onSubmit={onSubmit} className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">{isLogin ? 'Sign in' : 'Create account'}</h1>
        {cameFrom && <p className="rounded bg-amber-50 p-3 text-sm text-slate-800 ring-1 ring-amber-200">Please {isLogin ? 'sign in' : 'create an account'} to continue. We&apos;ll take you right back.</p>}
        {error && (
          <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {!isLogin && (
          <label className="block text-sm font-medium">
            Your name
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" />
          </label>
        )}
        <label className="block text-sm font-medium">
          Email
          <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            className={inputClass}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={isLogin ? undefined : 8}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
          />
          {!isLogin && <span className="mt-1 block text-xs text-slate-500">At least 8 characters.</span>}
        </label>
        <Button type="submit" fullWidth disabled={submitting}>
          {submitting ? 'Please wait…' : isLogin ? 'Sign in' : 'Create your account'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        {isLogin ? (
          <>
            New to Bazaar?{' '}
            <Link to="/register" state={location.state} className="text-link hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <Link to="/login" state={location.state} className="text-link hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
