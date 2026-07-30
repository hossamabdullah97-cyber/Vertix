'use client';

import { useState } from 'react';
import { Lightbox } from './Lightbox';

/**
 * Interactive portfolio image grid. Clicking any image opens a
 * full-screen lightbox with prev/next navigation.
 */
export function PortfolioGallery({ images }: { images: string[] }) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  if (images.length === 0) return null;

  return (
    <>
      <div
        className={`grid gap-2 ${
          images.length === 1
            ? 'grid-cols-1'
            : images.length === 2
              ? 'grid-cols-2'
              : 'grid-cols-2 sm:grid-cols-3'
        }`}
      >
        {images.map((imgUrl, i) => (
          <button
            key={i}
            onClick={() => setLightboxIdx(i)}
            className="group relative overflow-hidden rounded-[var(--v-radius-lg)] border border-[hsl(var(--v-border))] aspect-square focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v-accent)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgUrl}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              draggable={false}
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-0 group-hover:opacity-90 transition-opacity drop-shadow-lg"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      {lightboxIdx !== null && (
        <Lightbox
          images={images}
          startIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </>
  );
}
