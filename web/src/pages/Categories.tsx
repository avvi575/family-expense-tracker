import { FormEvent, useEffect, useState } from 'react';
import { createCategory, deleteCategory, fetchCategories, updateCategory } from '../api';
import { useAuth } from '../stores/auth';
import { errMessage } from '../api/client';
import type { Category } from '../types';

export default function Categories() {
  const activeFamily = useAuth((s) => s.activeFamily);
  const [categories, setCategories] = useState<Category[]>([]);
  const isAdmin = activeFamily?.role === 'ADMIN';
  const [editingId, setEditingId] = useState<string | null>(null);

  function load() {
    if (!activeFamily) return;
    fetchCategories(activeFamily.id).then(setCategories).catch(() => {});
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFamily]);

  const parents = categories.filter((c) => !c.parentId);

  async function handleDelete(id: string) {
    if (!confirm('Delete this category? Expenses keep their history; subcategories are moved up.')) return;
    await deleteCategory(id).catch(() => {});
    load();
  }

  async function handleSave(c: Category, patch: { name?: string; icon?: string; color?: string }) {
    await updateCategory(c.id, patch).catch((e) => alert(errMessage(e)));
    setEditingId(null);
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Categories</h1>

      {!activeFamily && <p className="text-slate-500">Create or join a family first.</p>}

      {activeFamily && (
        <>
          <div className="space-y-3">
            {parents.map((p) => {
              const children = categories.filter((c) => c.parentId === p.id);
              const isSystem = !p.familyId;
              const isEditing = editingId === p.id;
              return (
                <div key={p.id} className="rounded-xl bg-white p-4 shadow-sm">
                  {isEditing ? (
                    <EditRow initial={p} onCancel={() => setEditingId(null)} onSave={(patch) => handleSave(p, patch)} />
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {p.icon} {p.name}
                        {isSystem && <span className="ml-2 text-xs text-slate-400">(system)</span>}
                      </span>
                      {isAdmin && !isSystem && (
                        <div className="flex gap-2 text-xs">
                          <button onClick={() => setEditingId(p.id)} className="text-indigo-500 hover:underline">Edit</button>
                          <button onClick={() => handleDelete(p.id)} className="text-red-500 hover:underline">Delete</button>
                        </div>
                      )}
                    </div>
                  )}
                  {children.length > 0 && (
                    <ul className="mt-2 space-y-1 border-l-2 border-slate-100 pl-4">
                      {children.map((c) => {
                        const isChildEditing = editingId === c.id;
                        return (
                          <li key={c.id} className="flex items-center justify-between text-sm">
                            {isChildEditing ? (
                              <EditRow
                                initial={c}
                                onCancel={() => setEditingId(null)}
                                onSave={(patch) => handleSave(c, patch)}
                              />
                            ) : (
                              <>
                                <span>
                                  {c.icon} {c.name}
                                  {!c.familyId && <span className="ml-2 text-xs text-slate-400">(system)</span>}
                                </span>
                                {isAdmin && !!c.familyId && (
                                  <div className="flex gap-2 text-xs">
                                    <button onClick={() => setEditingId(c.id)} className="text-indigo-500 hover:underline">Edit</button>
                                    <button onClick={() => handleDelete(c.id)} className="text-red-500 hover:underline">Delete</button>
                                  </div>
                                )}
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {isAdmin && <AddSubcategoryForm parent={p} familyId={activeFamily.id} onAdded={load} />}
                </div>
              );
            })}
          </div>

          {isAdmin && <AddParentForm familyId={activeFamily.id} onAdded={load} />}
        </>
      )}
    </div>
  );
}

function EditRow({
  initial, onCancel, onSave,
}: {
  initial: Category;
  onCancel: () => void;
  onSave: (patch: { name?: string; icon?: string; color?: string }) => Promise<void>;
}) {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        await onSave({
          name: String(fd.get('name') || '').trim(),
          icon: String(fd.get('icon') || '').trim() || undefined,
          color: String(fd.get('color') || '').trim() || undefined,
        });
      }}
      className="flex flex-1 items-center gap-2 text-sm"
    >
      <input name="icon" defaultValue={initial.icon} className="w-14 rounded border border-slate-300 px-2 py-1 text-center" />
      <input name="name" defaultValue={initial.name} required className="flex-1 rounded border border-slate-300 px-2 py-1" />
      <input name="color" defaultValue={initial.color} className="w-24 rounded border border-slate-300 px-2 py-1" />
      <button className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white">Save</button>
      <button type="button" onClick={onCancel} className="text-xs text-slate-400 hover:underline">Cancel</button>
    </form>
  );
}

function AddParentForm({ familyId, onAdded }: { familyId: string; onAdded: () => void }) {
  const [error, setError] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await createCategory({
        familyId,
        name: String(fd.get('name')),
        icon: String(fd.get('icon')) || undefined,
        color: String(fd.get('color')) || undefined,
      });
      form.reset();
      onAdded();
    } catch (err) {
      setError(errMessage(err));
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-3 rounded-xl bg-white p-5 shadow-sm">
      <h2 className="font-semibold">Add a category</h2>
      <input name="name" required placeholder="Category name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <div className="flex gap-2">
        <input name="icon" placeholder="Icon (e.g. 🏦)" className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input name="color" placeholder="Color (e.g. #3b82f6)" className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Add category</button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

function AddSubcategoryForm({ parent, familyId, onAdded }: { parent: Category; familyId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await createCategory({
        familyId,
        name: String(fd.get('name')),
        icon: String(fd.get('icon')) || undefined,
        color: String(fd.get('color')) || undefined,
        parentId: parent.id,
      });
      form.reset();
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(errMessage(err));
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs text-indigo-500 hover:underline">
        + Add subcategory
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2 flex items-center gap-2">
      <input name="name" required placeholder="Subcategory name" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      <input name="icon" placeholder="Icon" className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white">Add</button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:underline">
        Cancel
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
