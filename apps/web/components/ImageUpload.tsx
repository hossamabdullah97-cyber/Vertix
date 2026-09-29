'use client';

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('cardEditor');
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [byLink, setByLink] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) {
      setError(t('upload.notImage'));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t('upload.tooLarge'));
      return;
    }
    setBusy(true);
    try {
      const url = await uploadImage(file);
      onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('upload.failed'));
    } finally {
      setBusy(false);
    }
  }

  // One compact row for both shapes: thumbnail, then the controls beside it.
  // Covers get a wide thumbnail, avatars a round one.
  const previewClass = shape === 'wide' ? 'h-14 w-24 rounded-lg' : 'h-14 w-14 rounded-full';

  return (
    <div className="space-y-2">
      {label && <p className="text-[12.5px] text-muted">{label}</p>}

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
        className={`flex items-center gap-3 rounded-[10px] border border-dashed p-2.5 transition-colors ${
          drag ? 'border-accent bg-accent/5' : 'border-line'
        }`}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className={`${previewClass} shrink-0 object-cover ring-1 ring-line`} />
        ) : (
          <div className={`${previewClass} flex shrink-0 items-center justify-center bg-elevated text-faint`}>
            <Icon name="image" size={18} />
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="v-btn v-btn-ghost !h-11 !px-2.5 !text-[12.5px] disabled:opacity-60 sm:!h-8"
            >
              {busy ? (
                <>
                  <Icon name="loader" size={13} className="animate-spin" /> {t('upload.uploading')}
                </>
              ) : (
                <>
                  <Icon name="upload" size={13} /> {value ? t('upload.replace') : t('upload.action')}
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
                className="v-btn v-btn-ghost !h-11 !px-2.5 !text-[12.5px] text-muted hover:!text-red-600 disabled:opacity-60 sm:!h-8"
              >
                <Icon name="trash" size={13} /> {t('upload.remove')}
              </button>
            )}
          </div>
          <p className="text-[11.5px] leading-snug text-faint">{t('upload.hint')}</p>
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

      {byLink ? (
        <input
          dir="ltr"
          className="v-field !text-[12.5px] rtl:text-right"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('upload.urlPlaceholder')}
          aria-label={t('upload.useLink')}
          autoFocus
        />
      ) : (
        <button type="button" onClick={() => setByLink(true)} className="min-h-11 text-[12.5px] font-medium text-accent hover:underline sm:min-h-0">
          {t('upload.useLink')}
        </button>
      )}

      {error && <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
