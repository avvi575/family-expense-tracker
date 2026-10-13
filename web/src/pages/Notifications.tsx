import { useEffect, useState } from 'react';
import { fetchNotifications, markRead } from '../api';
import type { AppNotification } from '../types';

export default function Notifications() {
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    fetchNotifications().then(setItems).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Alerts</h1>
      <div className="max-w-2xl space-y-2">
        {items.map((n) => (
          <div
            key={n.id}
            className={`flex items-start justify-between rounded-xl p-4 shadow-sm ${
              n.read ? 'bg-white' : 'border-l-4 border-indigo-500 bg-indigo-50'
            }`}
          >
            <div>
              <p className="font-medium">{n.title}</p>
              <p className="text-sm text-slate-500">{n.message}</p>
              <p className="mt-1 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
            </div>
            {!n.read && (
              <button
                onClick={async () => {
                  await markRead(n.id).catch(() => {});
                  setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
                }}
                className="text-sm text-indigo-600 hover:underline"
              >
                Mark read
              </button>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-400">No notifications.</p>}
      </div>
    </div>
  );
}
