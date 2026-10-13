import type { Category } from '../types';
import SearchableSelect from './SearchableSelect';

/**
 * Two-level category picker with searchable dropdowns: pick a parent category,
 * then optionally narrow to one of its subcategories. If no subcategory is
 * chosen, the parent itself is the selected category.
 */
export default function CategoryPicker({
  categories,
  parentId,
  childId,
  onParentChange,
  onChildChange,
}: {
  categories: Category[];
  parentId: string;
  childId: string;
  onParentChange: (id: string) => void;
  onChildChange: (id: string) => void;
}) {
  const parents = categories.filter((c) => !c.parentId);
  const children = categories.filter((c) => c.parentId === parentId);

  return (
    <div className="space-y-2">
      <SearchableSelect
        options={parents.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }))}
        value={parentId}
        onChange={(id) => {
          onParentChange(id);
          onChildChange('');
        }}
        placeholder="Category…"
      />
      {children.length > 0 && (
        <SearchableSelect
          options={[
            { value: '', label: 'Subcategory (optional)' },
            ...children.map((c) => ({ value: c.id, label: `↳ ${c.name}` })),
          ]}
          value={childId}
          onChange={onChildChange}
          placeholder="Subcategory (optional)…"
        />
      )}
    </div>
  );
}
