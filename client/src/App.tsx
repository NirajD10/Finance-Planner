import { useEffect, useState } from 'react';
import { useAuthStore } from './store/authStore';
import { Login } from './screens/Login';
import { HealthCheck } from './screens/HealthCheck';
import { DashboardScreen } from './screens/dashboard/DashboardScreen';
import { TransactionsScreen } from './screens/transactions/TransactionsScreen';
import { SyncStatusIndicator } from './components/SyncStatusIndicator';
import { runSync } from './lib/sync/syncEngine';
import { setupSyncTriggers } from './lib/sync/triggers';

type Tab = 'dashboard' | 'transactions';

function AuthenticatedApp({ accessToken }: { accessToken: string }) {
  const [tab, setTab] = useState<Tab>('dashboard');

  useEffect(() => {
    void runSync(accessToken);
    const cleanup = setupSyncTriggers(() => accessToken);
    return cleanup;
  }, [accessToken]);

  return (
    <>
      <div className="top-bar">
        <SyncStatusIndicator />
        <button type="button" onClick={() => void runSync(accessToken)}>
          Refresh
        </button>
      </div>

      <nav className="nav-tabs">
        <button
          type="button"
          className={`nav-tab ${tab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={`nav-tab ${tab === 'transactions' ? 'active' : ''}`}
          onClick={() => setTab('transactions')}
        >
          Transactions
        </button>
      </nav>

      {tab === 'dashboard' && <DashboardScreen accessToken={accessToken} />}
      {tab === 'transactions' && <TransactionsScreen accessToken={accessToken} />}

      <details className="diagnostics">
        <summary>Diagnostics</summary>
        <HealthCheck accessToken={accessToken} />
      </details>
    </>
  );
}

function App() {
  const auth = useAuthStore((s) => s.auth);
  const restoreSession = useAuthStore((s) => s.restoreSession);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  return (
    <main>
      <h1>Finance Planner</h1>
      {auth.status === 'loading' && <p>Loading…</p>}
      {auth.status === 'unauthenticated' && <Login />}
      {auth.status === 'authenticated' && <AuthenticatedApp accessToken={auth.accessToken} />}
    </main>
  );
}

export default App;
