'use client';

import { useEffect, useState } from 'react';
import QRCodeLib from 'qrcode';

/** Renders a crisp QR code (rendered off a high-res raster so it stays sharp). */
export function QRCode({
  value,
  size = 200,
  dark = '#0b0b0e',
  light = '#ffffff',
}: {
  value: string;
  size?: number;
  dark?: string;
  light?: string;
}) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let alive = true;
    QRCodeLib.toDataURL(value, {
      width: 640,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark, light },
    })
      .then((u) => alive && setUrl(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value, dark, light]);

  if (!url) return <div className="v-skeleton" style={{ width: size, height: size }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} width={size} height={size} alt="QR code" style={{ borderRadius: 10 }} />;
}

/** Downloads a high-resolution PNG of the QR code. */
export async function downloadQrPng(value: string, filename = 'vertex-qr.png') {
  const url = await QRCodeLib.toDataURL(value, {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
