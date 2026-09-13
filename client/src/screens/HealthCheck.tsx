import { useEffect, useState } from 'react';
import { getHealth, type HealthResponse } from '../lib/api-client';

type State =
  | { status: 'loading' }
  | { status: 'ok'; data: HealthResponse }
  | { status: 'error'; message: string };

export function HealthCheck({ accessToken }: { accessToken: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    getHealth(accessToken)
      .then((data) => setState({ status: 'ok', data }))
      .catch((err) => setState({ status: 'error', message: String(err) }));
  }, [accessToken]);

  if (state.status === 'loading') return <p>Checking...</p>;
  if (state.status === 'error') return <p>DB: error — {state.message}</p>;
  return <p>DB: {state.data.db}</p>;
}
