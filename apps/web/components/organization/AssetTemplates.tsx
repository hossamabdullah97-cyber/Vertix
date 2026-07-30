'use client';

import { useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { uploadImage } from '@/lib/client';
import { TEMPLATES } from '@/lib/templates';

export interface Asset {
  id: string;
  name: string;
  url: string;
  mimeType: string | null;
  size: number;
  createdAt: string;
  uploader: { name: string | null; email: string } | null;
}

interface AssetTemplatesProps {
  assets: Asset[];
  canManage: boolean;
  onCreate: (input: { name: string; url: string; mimeType?: string; size?: number }) => Promise<void> | void;
  onDelete: (id: string) => void;
}

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssetTemplates({ assets, canManage, onCreate, onDelete }: AssetTemplatesProps) {
  const [tab, setTab] = useState<'assets' | 'templates'>('assets');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) { setError('Only image assets are supported right now.'); return; }
    setUploading(true);
    try {
      const url = await uploadImage(file);
      await onCreate({ name: file.name, url, mimeType: file.type, size: file.size });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  function copyUrl(a: Asset) {
    navigator.clipboard?.writeText(a.url).then(() => { setCopiedId(a.id); setTimeout(() => setCopiedId(''), 1500); }).catch(() => {});
  }

  return (
    <div className="v-card p-5 bg-surface border border-line rounded-2xl shadow-sm space-y-4">
      <div className="flex justify-between items-center border-b border-line pb-2 flex-wrap gap-2">
        <div className="flex gap-1 bg-canvas p-0.5 rounded-lg border border-line">
          <button onClick={() => setTab('assets')} className={`px-3 py-1.5 rounded-md text-[11.5px] font-bold transition-all ${tab === 'assets' ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
            Shared Assets
          </button>
          <button onClick={() => setTab('templates')} className={`px-3 py-1.5 rounded-md text-[11.5px] font-bold transition-all ${tab === 'templates' ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
            Card Templates
          </button>
        </div>

        {tab === 'assets' && canManage && (
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="v-btn !h-8 text-[11px] font-bold disabled:opacity-60">
            <Icon name={uploading ? 'loader' : 'upload'} size={12} className={uploading ? 'animate-spin' : ''} /> {uploading ? 'Uploading…' : 'Upload asset'}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {error && <p className="text-[12px] font-medium text-rose-500">{error}</p>}

      {tab === 'assets' ? (
        assets.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center text-faint">
            <Icon name="image" size={26} />
            <p className="text-[13px] font-semibold text-muted">No shared assets yet</p>
            <p className="text-[11.5px] max-w-xs">Upload logos, brand images, and card backgrounds to share them across your team.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {assets.map((a) => {
              const isImg = (a.mimeType ?? '').startsWith('image/');
              return (
                <div key={a.id} className="group relative overflow-hidden rounded-xl border border-line bg-canvas/30">
                  <div className="aspect-[4/3] bg-canvas flex items-center justify-center overflow-hidden">
                    {isImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                    ) : (
                      <Icon name="file-text" size={26} className="text-faint" />
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="truncate text-[11.5px] font-bold text-ink" title={a.name}>{a.name}</p>
                    <p className="text-[10px] text-muted mt-0.5">{formatSize(a.size)} · {a.uploader?.name || a.uploader?.email || 'Unknown'}</p>
                    <div className="mt-2 flex gap-1.5">
                      <button onClick={() => copyUrl(a)} className="v-btn v-btn-ghost !h-7 flex-1 !text-[10.5px] font-bold">
                        <Icon name={copiedId === a.id ? 'check' : 'copy'} size={11} /> {copiedId === a.id ? 'Copied' : 'Copy'}
                      </button>
                      {canManage && (
                        <button onClick={() => onDelete(a.id)} className="v-btn v-btn-ghost !h-7 !w-7 !p-0 text-rose-500" aria-label="Delete asset">
                          <Icon name="trash" size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div>
          <p className="text-[11.5px] text-muted mb-3">Built-in card templates available to your organization. Apply any of them when creating a card.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {TEMPLATES.map((t) => {
              const isDark = t.mode === 'dark';
              return (
                <div key={t.id} className="overflow-hidden rounded-xl border border-line">
                  <div className="relative h-14" style={{ background: isDark ? '#0b0b0e' : t.accent }}>
                    {isDark && <span className="absolute inset-0 opacity-70" style={{ background: `radial-gradient(60% 80% at 70% 30%, ${t.accent}66, transparent)` }} />}
                    <span className="absolute bottom-1.5 start-2 h-4 w-4 rounded-full border-2 border-white/70" style={{ background: t.accent }} />
                  </div>
                  <div className="flex items-center justify-between gap-1 bg-surface px-2.5 py-1.5">
                    <span className="truncate text-[11px] font-semibold text-ink">{t.name}</span>
                    <span className="text-[9px] font-bold uppercase text-faint">{t.mode}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
