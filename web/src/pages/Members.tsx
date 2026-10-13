import { FormEvent, useEffect, useState } from 'react';
import { fetchMembers, inviteMember, joinFamily, createFamily } from '../api';
import { useAuth } from '../stores/auth';
import SearchableSelect from '../components/SearchableSelect';
import type { FamilyMember } from '../types';

export default function Members() {
  const { activeFamily, setFamilies } = useAuth();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [inviteResult, setInviteResult] = useState('');
  const [joinToken, setJoinToken] = useState('');
  const [message, setMessage] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');

  useEffect(() => {
    if (!activeFamily) return;
    fetchMembers(activeFamily.id).then(setMembers).catch(() => {});
  }, [activeFamily]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Family</h1>

      {!activeFamily && (
        <form
          onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get('name') || '');
            await createFamily(name);
            const { fetchFamilies } = await import('../api');
            setFamilies(await fetchFamilies());
          }}
          className="max-w-sm space-y-3 rounded-xl bg-white p-5 shadow-sm"
        >
          <h2 className="font-semibold">Create your family</h2>
          <input name="name" required placeholder="e.g. Sharma Family" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Create</button>
        </form>
      )}

      {activeFamily && (
        <>
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5">{m.user.name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{m.user.email}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                        {m.role}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
            <form
              onSubmit={async (e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                try {
                  const res = await inviteMember(
                    activeFamily!.id,
                    String(fd.get('email')),
                    String(fd.get('role')),
                    String(fd.get('mobile')) || undefined,
                    String(fd.get('message')) || undefined,
                  );
                  setInviteResult(
                    `Invitation sent to ${res.email}${res.mobile ? ' via email, SMS and WhatsApp' : ' via email'}. ` +
                    `Link: ${location.origin}/invite/${res.inviteToken}`,
                  );
                } catch {
                  setInviteResult('Invite failed (admin only)');
                }
              }}
              className="space-y-3 rounded-xl bg-white p-5 shadow-sm"
            >
              <h2 className="font-semibold">Invite a member</h2>
              <input name="email" type="email" required placeholder="Email" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              <SearchableSelect
                options={[
                  { value: 'MEMBER', label: 'Member' },
                  { value: 'ADMIN', label: 'Admin' },
                  { value: 'VIEWER', label: 'View-only' },
                ]}
                value={inviteRole}
                onChange={setInviteRole}
                placeholder="Role…"
              />
              <input id="invite-role" name="role" type="hidden" value={inviteRole} />
              <input name="mobile" placeholder="Mobile (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              <input name="message" placeholder="Message (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Invite</button>
              {inviteResult && <p className="break-all text-xs text-slate-600">{inviteResult}</p>}
            </form>

            <form
              onSubmit={async (e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                setMessage('');
                try {
                  await joinFamily(joinToken.trim());
                  const { fetchFamilies } = await import('../api');
                  setFamilies(await fetchFamilies());
                  setMessage('Joined family!');
                } catch {
                  setMessage('Invalid or used token');
                }
              }}
              className="space-y-3 rounded-xl bg-white p-5 shadow-sm"
            >
              <h2 className="font-semibold">Join with invite token</h2>
              <input
                value={joinToken}
                onChange={(e) => setJoinToken(e.target.value)}
                required
                placeholder="Paste token"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Join</button>
              {message && <p className="text-xs text-slate-600">{message}</p>}
            </form>
          </div>
        </>
      )}
    </div>
  );
}
