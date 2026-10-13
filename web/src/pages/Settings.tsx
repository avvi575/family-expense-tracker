import { useEffect, useState } from 'react';
import { fetchSettings, updateSettings } from '../api';
import { errMessage } from '../api/client';
import { useAuth } from '../stores/auth';
import FolderPicker from '../components/FolderPicker';

export default function Settings() {
  const activeFamily = useAuth((s) => s.activeFamily);
  const isAdmin = activeFamily?.role === 'ADMIN';
  const [inboxDir, setInboxDir] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    fetchSettings()
      .then((s) => setInboxDir(s.statementInboxDir || ''))
      .catch((e) => setError(errMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  const onSave = async () => {
    if (!isAdmin) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateSettings({ statementInboxDir: inboxDir });
      setInboxDir(updated.statementInboxDir);
      setSavedAt(Date.now());
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const onReset = async () => {
    setSaving(true);
    setError('');
    try {
      const updated = await updateSettings({ statementInboxDir: '' });
      setInboxDir(updated.statementInboxDir);
      setSavedAt(Date.now());
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-slate-500">Configure how the app imports your statements.</p>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Statement inbox folder</h2>
          <p className="text-sm text-slate-500 mt-1">
            This is the folder the <strong>Scan Inbox</strong> button reads PDF statements from.
            Use <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-xs">📂 Browse…</kbd> to pick a folder
            from your file system. Leave it empty to use the backend default (<code className="font-mono text-xs">backend/statement-inbox/</code>).
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <>
            <FolderPicker
              value={inboxDir}
              onChange={setInboxDir}
              disabled={!isAdmin || saving}
            />

            <div className="rounded-md bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <p className="font-semibold">Tips</p>
              <ul className="mt-1 list-disc pl-5 space-y-0.5">
                <li>The folder must exist on the machine running the backend (the file picker may only see the browser's machine).</li>
                <li>You can also type or paste a path directly into the text field (supports Windows <code>\\</code> and POSIX <code>/</code> separators).</li>
                <li>After saving, hit <em>Scan Inbox</em> from the Credit or Debit Statement page to read PDFs from the new folder.</li>
              </ul>
            </div>

            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {savedAt && !error && (
              <p className="text-xs text-emerald-700">✓ Saved. The new folder will be used the next time you click <em>Scan Inbox</em>.</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={onSave}
                disabled={!isAdmin || saving}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={onReset}
                disabled={!isAdmin || saving}
                className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Reset to default
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
