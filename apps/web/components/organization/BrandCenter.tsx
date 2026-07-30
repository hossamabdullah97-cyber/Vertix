'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { uploadImage } from '@/lib/client';

interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  branding: Record<string, unknown> | null;
}

interface BrandCenterProps {
  org: OrgInfo | null;
  saving?: boolean;
  onSave: (input: { name: string; branding: Record<string, unknown> }) => void | Promise<void>;
}

const SWATCHES = ['#2563eb', '#1d4ed8', '#0ea5e9', '#10b981', '#16a34a', '#ec4899', '#f97316', '#eab308', '#ef4444', '#0a0a0a'];

export function BrandCenter({ org, saving, onSave }: BrandCenterProps) {
  const [companyName, setCompanyName] = useState('');
  const [accent, setAccent] = useState('#2563eb');
  const [font, setFont] = useState('sans');
  const [logo, setLogo] = useState('');
  const [watermark, setWatermark] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Hydrate from the real org branding whenever it loads/changes.
  useEffect(() => {
    if (!org) return;
    const b = org.branding ?? {};
    setCompanyName(org.name);
    setAccent((b.accent as string) || '#2563eb');
    setFont((b.font as string) || 'sans');
    setLogo((b.logo as string) || '');
    setWatermark(b.watermark !== false);
  }, [org]);

  async function handleLogoFile(file: File | undefined) {
    if (!file) return;
    setUploadError('');
    if (!file.type.startsWith('image/')) { setUploadError('Please choose an image file.'); return; }
    setUploading(true);
    try {
      setLogo(await uploadImage(file));
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    onSave({ name: companyName.trim() || org?.name || 'Organization', branding: { accent, font, logo: logo || null, watermark } });
  }

  return (
    <form onSubmit={handleSave} className="grid lg:grid-cols-[1.5fr_1fr] gap-6">
      {/* Brand form */}
      <div className="v-card p-5 bg-surface border border-line rounded-2xl shadow-sm space-y-5">
        <div>
          <h3 className="text-[14.5px] font-bold text-ink tracking-tight">Organization Brand Center</h3>
          <p className="text-[11.5px] text-muted">Logo, brand color, typography, and public-profile defaults for this workspace</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block space-y-1.5">
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Organization Name</span>
            <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="v-field !h-9 text-[12.5px]" required />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Default Typography</span>
            <select value={font} onChange={(e) => setFont(e.target.value)} className="v-field !h-9 text-[12.5px] font-semibold">
              <option value="sans">Sans-Serif (Inter / Outfit)</option>
              <option value="serif">Serif (Playfair Display)</option>
              <option value="mono">Monospace (JetBrains Mono)</option>
            </select>
          </label>
        </div>

        {/* Brand color */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Brand Color</span>
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setAccent(c)}
                className="h-8 w-8 rounded-lg border-2 transition-transform hover:scale-105"
                style={{ background: c, borderColor: accent.toLowerCase() === c ? 'hsl(var(--v-fg))' : 'transparent' }}
                aria-label={c}
              />
            ))}
            <div className="flex items-center gap-1.5">
              <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-8 w-10 border border-line rounded-lg cursor-pointer" />
              <input type="text" value={accent} onChange={(e) => setAccent(e.target.value)} className="v-field !h-8 !w-24 text-[12px] font-mono" />
            </div>
          </div>
        </div>

        {/* Logo upload (real) */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Organization Logo</span>
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-line p-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-12 w-12 rounded-lg border border-line object-cover" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-canvas text-white font-black" style={{ background: accent }}>
                {(companyName[0] || 'O').toUpperCase()}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="v-btn v-btn-ghost !h-9 text-[12px] font-bold disabled:opacity-60">
                <Icon name={uploading ? 'loader' : 'upload'} size={13} className={uploading ? 'animate-spin' : ''} /> {uploading ? 'Uploading…' : logo ? 'Replace logo' : 'Upload logo'}
              </button>
              {logo && (
                <button type="button" onClick={() => setLogo('')} className="v-btn v-btn-ghost !h-9 text-[12px] font-bold text-rose-500">
                  <Icon name="trash" size={13} /> Remove
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { handleLogoFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          {uploadError && <p className="text-[12px] font-medium text-rose-500">{uploadError}</p>}
        </div>

        <div className="pt-3 border-t border-line flex items-center justify-between flex-wrap gap-3">
          <label className="flex items-center gap-2 text-[12px] font-bold text-muted cursor-pointer select-none">
            <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} className="rounded border-line text-blue-700 focus:ring-blue-600" />
            Show &ldquo;Powered by Vertex&rdquo; on public profiles
          </label>
          <button type="submit" disabled={saving || uploading} className="v-btn h-9 px-6 font-bold shadow-md disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Brand'}
          </button>
        </div>
      </div>

      {/* Live preview */}
      <div className="v-card p-5 bg-surface border border-line rounded-2xl shadow-sm flex flex-col justify-between">
        <div>
          <h3 className="text-[14.5px] font-bold text-ink tracking-tight mb-1">Live Preview</h3>
          <p className="text-[11.5px] text-muted mb-4">How your brand appears on cards</p>

          <div className="overflow-hidden rounded-xl border border-line">
            <div className="h-12" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }} />
            <div className="p-4 bg-canvas/30 space-y-3.5">
              <div className="-mt-8 flex items-end gap-3">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="" className="h-12 w-12 rounded-xl border-2 border-surface object-cover shadow" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-surface text-white font-black shadow" style={{ background: accent }}>
                    {(companyName[0] || 'O').toUpperCase()}
                  </div>
                )}
              </div>
              <div>
                <h4 className={`text-[14px] font-bold text-ink ${font === 'serif' ? 'font-serif' : font === 'mono' ? 'font-mono' : ''}`}>{companyName || 'Organization'}</h4>
                <p className="text-[10.5px] text-muted">Corporate card preview</p>
              </div>
              <div className="h-1.5 w-full bg-line rounded" />
              <div className="h-1.5 w-2/3 bg-line rounded" />
              <div className="flex justify-center pt-1">
                <span className="flex h-8 w-full items-center justify-center rounded-lg text-[11px] font-bold text-white" style={{ background: accent }}>
                  Save Contact
                </span>
              </div>
            </div>
          </div>
        </div>

        {watermark && <p className="text-center text-[9px] text-faint font-semibold mt-4">Powered by Vertex Connect</p>}
      </div>
    </form>
  );
}
