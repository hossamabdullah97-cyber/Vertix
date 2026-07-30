'use client';

import { useRef, useState } from 'react';
import { uploadImage } from '@/lib/client';
import { Icon } from '@/components/Icon';

const MAX_BYTES = 5 * 1024 * 1024; // keep in sync with the API limit
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif';

/**
 * Real image upload control: pick or drag a file, upload to the API, and emit
 * the returned public URL. Falls back to a manual URL field. `shape` controls
 * the preview aspect (round avatar vs. wide cover).
 */
export function ImageUpload({
  value,
  onChange,
  shape = 'wide',
  label,
}: {
  value: string;
  onChange: (url: string) => void;
  shape?: 'circle' | 'wide';
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Image is larger than 5 MB.');
      return;
    }
    setBusy(true);
    try {
      const url = await uploadImage(file);
      onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  const isWide = shape === 'wide';
  // Wide covers stack (preview on top, controls below) so buttons never overlap
  // the image; round avatars sit inline beside their controls.
  const previewClass = isWide ? 'h-28 w-full rounded-xl' : 'h-16 w-16 shrink-0 rounded-full';

  return (
    <div className="space-y-2">
      {label && <label className="text-[12px] font-bold text-muted uppercase">{label}</label>}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`rounded-xl border border-dashed p-3 transition-colors ${
          isWide ? 'flex flex-col gap-3' : 'flex items-center gap-3'
        } ${drag ? 'border-accent bg-accent/5' : 'border-line'}`}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className={`${previewClass} border border-line object-cover`} />
        ) : (
          <div className={`${previewClass} flex items-center justify-center bg-panel text-faint`}>
            <Icon name="image" size={20} />
          </div>
        )}

        <div className={`min-w-0 space-y-1.5 ${isWide ? 'w-full' : 'flex-1'}`}>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="v-btn v-btn-ghost h-9 px-3 text-[13px] font-semibold disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Icon name="loader" size={14} className="animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <Icon name="upload" size={14} /> {value ? 'Replace' : 'Upload'}
                </>
              )}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setError('');
                }}
                disabled={busy}
                className="v-btn v-btn-ghost h-9 px-3 text-[13px] font-semibold text-red-500 disabled:opacity-60"
              >
                <Icon name="trash" size={14} /> Remove
              </button>
            )}
          </div>
          <p className="text-[11px] text-faint">JPG, PNG, WebP or GIF · up to 5 MB · drag &amp; drop supported</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      <input
        className="v-field text-[13px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="…or paste an image URL"
      />

      {error && <p className="text-[12px] font-medium text-red-500">{error}</p>}
    </div>
  );
}
