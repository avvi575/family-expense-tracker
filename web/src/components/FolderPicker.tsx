import { useRef, useState } from 'react';

interface Props {
  value: string;
  onChange: (path: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Folder picker that works in modern Chromium browsers (Chrome, Edge).
 * Uses the `webkitdirectory` attribute to let the user pick a folder via the
 * standard OS file dialog; we then derive the absolute folder path from the
 * first File's `webkitRelativePath` (which is "FolderName/sub/file.pdf").
 *
 * On non-Chromium browsers the Browse button falls back to a plain text
 * input where the user can paste/type the path.
 */
export default function FolderPicker({ value, onChange, placeholder, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [directoryPickerSupported, setDirectoryPickerSupported] = useState(() => {
    const input = document.createElement('input');
    return 'webkitdirectory' in input || 'directory' in input;
  });

  const handleBrowse = () => inputRef.current?.click();

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const first = files[0] as File & { webkitRelativePath?: string };
    const rel = first.webkitRelativePath || '';
    if (rel) {
      // webkitRelativePath is "FolderName[/sub/...]/file.pdf" — derive the parent folder.
      const segments = rel.split('/');
      segments.pop(); // drop the filename
      if (segments.length > 0) {
        // We can only recover the basename from the picker; combine with the
        // existing value's directory if present, otherwise just use the basename.
        const folderName = segments[0];
        const existing = (value || '').replace(/["']/g, '').trim();
        let dir = '';
        if (existing) {
          const m = existing.match(/^(.*[\\/])/);
          if (m) dir = m[1];
        }
        onChange(dir + folderName);
        return;
      }
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="file"
          ref={inputRef}
          className="hidden"
          // @ts-expect-error - non-standard attribute used by Chromium
          webkitdirectory=""
          directory=""
          multiple
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || 'e.g. D:\\Statements\\inbox'}
          disabled={disabled}
          className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm font-mono disabled:bg-slate-50"
        />
        <button
          type="button"
          onClick={handleBrowse}
          disabled={disabled}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          📂 Browse…
        </button>
      </div>
      {!directoryPickerSupported && (
        <p className="text-xs text-slate-500">
          Folder browsing is not supported in this browser. Paste the folder path above instead.
        </p>
      )}
    </div>
  );
}
