import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { acceptInvite, fetchInviteInfo, fetchFamilies } from '../api';
import { useAuth } from '../stores/auth';
import { errMessage } from '../api/client';

interface InviteInfo {
  email: string;
  mobile: string | null;
  message: string | null;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
  familyName: string;
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'an admin',
  MEMBER: 'a member',
  VIEWER: 'a view-only member',
};

export default function InviteAccept() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const setAuth = useAuth((s) => s.setAuth);
  const setFamilies = useAuth((s) => s.setFamilies);
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchInviteInfo(token).then(setInfo).catch((e) => setLoadError(errMessage(e)));
  }, [token]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      const data = await acceptInvite(token, name, password);
      setAuth(data.accessToken, data.user);
      const families = await fetchFamilies();
      setFamilies(families);
      navigate('/dashboard');
    } catch (err) {
      const msg = errMessage(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="w-full max-w-sm space-y-3 rounded-xl bg-white p-8 text-center shadow">
          <h1 className="text-xl font-bold text-red-600">Invitation problem</h1>
          <p className="text-sm text-slate-500">{loadError}</p>
          <Link to="/login" className="block text-sm text-indigo-600 hover:underline">
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Loading invitation…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow">
        <h1 className="text-2xl font-bold text-indigo-600">👨‍👩‍👧‍👦 Family Expenses</h1>
        <p className="text-sm text-slate-600">
          You are invited to join <strong>{info.familyName}</strong> as {ROLE_LABEL[info.role] ?? info.role}.
        </p>
        {info.message && <p className="rounded-lg bg-indigo-50 p-2 text-sm text-indigo-700">“{info.message}”</p>}
        <input type="email" value={info.email} disabled className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-slate-500" />
        <input
          required
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Create password (min 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        {error && (
          <p className="text-sm text-red-600">
            {error}
            {error.includes('log in') && (
              <>
                {' '}
                <Link to="/login" className="text-indigo-600 hover:underline">
                  Sign in instead
                </Link>
              </>
            )}
          </p>
        )}
        <button
          disabled={busy}
          className="w-full rounded-lg bg-indigo-600 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? 'Joining…' : `Join ${info.familyName}`}
        </button>
      </form>
    </div>
  );
}
