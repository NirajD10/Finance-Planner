import { useState, type FormEvent } from 'react';
import { useAuthStore } from '../store/authStore';
import { ApiError } from '../lib/api-client';

export function Login() {
  const login = useAuthStore((s) => s.login);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="password"
        inputMode="text"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
      />
      <button type="submit" disabled={submitting || password.length === 0}>
        {submitting ? 'Logging in…' : 'Log in'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
