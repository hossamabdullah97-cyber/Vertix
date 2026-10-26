'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { paletteFromImage } from '@/lib/palette';

/** The frame each shape is cut to, and the size it is saved at. */
const FRAMES = {
  circle: { aspect: 1, out: [640, 640] },
  wide: { aspect: 3, out: [1500, 500] },
} as const;

/**
 * Placing a picture before it is uploaded: drag it in the frame, zoom with the
 * slider (or the wheel), and keep what is inside. The photo is cut on this
 * device, so only what shows on the card is uploaded; its colours are read
 * here too, for the Design part to offer.
 */
export function ImageCropper({
  file,
  shape,
  onCancel,
  onDone,
}: {
  file: File | null;
  shape: 'circle' | 'wide';
  onCancel: () => void;
  onDone: (result: { file: File; colors: string[] }) => void;
}) {
  const { t } = useTranslation('cardEditor');
  const titleId = useId();
  const frame = FRAMES[shape];
  const boxRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [width, setWidth] = useState(320);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => setImg(el);
    el.src = url;
    setZoom(1);
    setPos({ x: 0, y: 0 });
    return () => {
      URL.revokeObjectURL(url);
      setImg(null);
    };
  }, [file]);

  useEffect(() => {
    if (!file) return;
    const measure = () => boxRef.current && setWidth(boxRef.current.clientWidth);
    measure();
    window.addEventListener('resize', measure);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('keydown', onKey);
    };
  }, [file, onCancel, img]);

  const height = width / frame.aspect;
  // At zoom 1 the picture just covers the frame.
  const base = img ? Math.max(width / img.naturalWidth, height / img.naturalHeight) : 1;
  const scale = base * zoom;
  const shownW = img ? img.naturalWidth * scale : width;
  const shownH = img ? img.naturalHeight * scale : height;
  // The picture's top-left corner, kept so the frame never shows past its edges.
  const clamp = (x: number, y: number) => ({
    x: Math.min(0, Math.max(width - shownW, x)),
    y: Math.min(0, Math.max(height - shownH, y)),
  });
  const at = clamp((width - shownW) / 2 + pos.x, (height - shownH) / 2 + pos.y);

  function setZoomKeepingCentre(next: number) {
    setZoom(Math.min(4, Math.max(1, next)));
  }

  async function finish() {
    if (!img || !file) return;
    const [ow, oh] = frame.out;
    const canvas = document.createElement('canvas');
    canvas.width = ow;
    canvas.height = oh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const keepAlpha = file.type === 'image/png' || file.type === 'image/webp';
    if (!keepAlpha) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, ow, oh);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, -at.x / scale, -at.y / scale, width / scale, height / scale, 0, 0, ow, oh);
    const type = keepAlpha ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
    if (!blob) return;
    const name = file.name.replace(/\.[^.]+$/, '') + (keepAlpha ? '.png' : '.jpg');
    onDone({ file: new File([blob], name, { type }), colors: paletteFromImage(canvas) });
  }

  return (
    <AnimatePresence>
      {file && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          className="fixed inset-0 z-[140] flex items-end justify-center bg-canvas/75 backdrop-blur-[2px] sm:items-center sm:px-4"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="w-full overflow-hidden rounded-t-2xl border border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-w-[520px] sm:rounded-2xl"
          >
            <header className="flex items-center gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-md font-semibold text-ink">
                  {t(shape === 'circle' ? 'crop.photoTitle' : 'crop.coverTitle')}
                </h2>
                <p className="text-xs text-faint">{t('crop.hint')}</p>
              </div>
              <button
                type="button"
                onClick={onCancel}
                aria-label={t('settings.cancel')}
                className="-m-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-ink sm:h-8 sm:w-8"
              >
                <Icon name="x" size={16} />
              </button>
            </header>

            <div className="px-5 pt-5">
              <div ref={boxRef} className="w-full">
                <div
                  className="relative cursor-grab touch-none select-none overflow-hidden rounded-xl bg-[#111] active:cursor-grabbing"
                  style={{ height }}
                  onPointerDown={(e) => {
                    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
                  }}
                  onPointerMove={(e) => {
                    const d = drag.current;
                    if (!d) return;
                    // Stored relative to the centred position, then held inside the frame.
                    const next = clamp((width - shownW) / 2 + d.px + e.clientX - d.x, (height - shownH) / 2 + d.py + e.clientY - d.y);
                    setPos({ x: next.x - (width - shownW) / 2, y: next.y - (height - shownH) / 2 });
                  }}
                  onPointerUp={() => (drag.current = null)}
                  onPointerCancel={() => (drag.current = null)}
                  onWheel={(e) => setZoomKeepingCentre(zoom - e.deltaY * 0.002)}
                  data-testid="crop-frame"
                >
                  {img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img.src}
                      alt=""
                      draggable={false}
                      className="pointer-events-none absolute max-w-none"
                      style={{ width: shownW, height: shownH, left: at.x, top: at.y }}
                    />
                  )}
                  {/* What is kept: a circle for the photo; the cover keeps the whole frame. */}
                  {shape === 'circle' && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0"
                      style={{ background: 'radial-gradient(circle at center, transparent 49.5%, rgba(0,0,0,0.55) 50%)' }}
                    />
                  )}
                  <span aria-hidden className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20" />
                </div>
              </div>

              <label className="mt-4 flex items-center gap-3">
                <Icon name="image" size={14} className="shrink-0 text-faint" />
                <span className="sr-only">{t('crop.zoom')}</span>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoomKeepingCentre(Number(e.target.value))}
                  className="h-11 w-full accent-[var(--v-accent)]"
                  aria-label={t('crop.zoom')}
                />
                <Icon name="image" size={20} className="shrink-0 text-faint" />
              </label>
            </div>

            <footer className="mt-2 flex items-center gap-2 border-t border-line px-5 py-3.5">
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setPos({ x: 0, y: 0 });
                }}
                className="v-btn v-btn-ghost"
              >
                <Icon name="refresh" size={14} /> {t('crop.reset')}
              </button>
              <span className="flex-1" />
              <button type="button" onClick={onCancel} className="v-btn v-btn-ghost">
                {t('settings.cancel')}
              </button>
              <button type="button" onClick={() => void finish()} disabled={!img} className="v-btn" data-testid="crop-done">
                <Icon name="check" size={14} /> {t('crop.use')}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
