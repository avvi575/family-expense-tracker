import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './stores/auth';
import { fetchFamilies } from './api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import InviteAccept from './pages/InviteAccept';
import Dashboard from './pages/Dashboard';
import Expenses from './pages/Expenses';
import Budgets from './pages/Budgets';
import Goals from './pages/Goals';
import Categories from './pages/Categories';
import IncomePage from './pages/Income';
import StatementImportPage from './pages/StatementImport';
import BankStatementsPage from './pages/BankStatements';
import Members from './pages/Members';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuth((s) => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  const location = useLocation();
  const setFamilies = useAuth((s) => s.setFamilies);
  const token = useAuth((s) => s.token);

  useEffect(() => {
    if (token) document.title = 'Family Expense Tracker';
  }, [location, token, setFamilies]);

  useEffect(() => {
    if (token) {
      fetchFamilies().then(setFamilies).catch(() => {});
    }
  }, [token, setFamilies]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/invite/:token" element={<InviteAccept />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="categories" element={<Categories />} />
        <Route path="income" element={<IncomePage />} />
        <Route path="statement-import" element={<StatementImportPage />} />
        <Route path="bank-statements" element={<BankStatementsPage />} />
        <Route path="budgets" element={<Budgets />} />
        <Route path="goals" element={<Goals />} />
        <Route path="members" element={<Members />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
