import { useEffect, useRef, useState } from 'react';

export interface SearchableOption {
  value: string;
  label: string;
}

/**
 * Dropdown with live filtering. Click to open, then type anywhere (the list
 * itself captures keys) to narrow options. Keyboard: ArrowUp/ArrowDown to
 * move, Enter to pick, Escape to close. Closes on outside click.
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  disabled = false,
}: {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(query.toLowerCase()),
  );

  function toggleOpen() {
    if (disabled) return;
    if (open) {
      setOpen(false);
    } else {
      setOpen(true);
      setQuery('');
      setHighlight(0);
      // focus the list so key presses filter immediately
      setTimeout(() => listRef.current?.focus(), 0);
    }
  }

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered[highlight];
      if (target) pick(target.value);
    } else if (e.key.length === 1) {
      // printable character typed over the list -> filter it
      setQuery((q) => (e.key === 'Backspace' ? q.slice(0, -1) : q + e.key));
      setHighlight(0);
    } else if (e.key === 'Backspace') {
      setQuery((q) => q.slice(0, -1));
      setHighlight(0);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${
          disabled ? 'border-slate-200 bg-slate-100 text-slate-400' : 'border-slate-300'
        }`}
      >
        <span className={selected ? '' : 'text-slate-400'}>{selected?.label ?? placeholder}</span>
        <span className="ml-2 text-slate-400">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div
            ref={listRef}
            tabIndex={0}
            onKeyDown={onListKeyDown}
            className="outline-none"
          >
            <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
              {query ? `Filtering: "${query}"` : 'Type to filter…'}
            </div>
            <ul className="max-h-48 overflow-y-auto">
              {filtered.map((o, i) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => pick(o.value)}
                    className={`w-full px-3 py-2 text-left text-sm ${
                      i === highlight
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    {o.label}
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-3 py-2 text-sm text-slate-400">
                  No matches for “{query}”
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
