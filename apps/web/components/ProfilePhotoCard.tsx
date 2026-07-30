'use client';

import { useRef, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { authFetch, uploadImage, type Me } from '@/lib/client';

const MAX_BYTES = 5 * 1024 * 1024;

/** Fired on `window` after the signed-in user's profile changes. */
export const PROFILE_UPDATED = 'vertex:profile-updated';

/**
 * Account photo + display name for the signed-in user. This is the person's own
 * picture — separate from any artwork on their cards — and it is what shows up
 * next to them across Team, notifications and the app shell.
 */
export function ProfilePhotoCard({
  me,
  onChange,
}: {
  me: Me;
  onChange?: (me: Me) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<Me>(me);
  const [name, setName] = useState(me.name ?? '');
  const [busy, setBusy] = useState<'photo' | 'name' | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  function flash(msg: string) {
    setSaved(msg);
    setTimeout(() => setSaved(''), 2000);
  }

  function apply(next: Me) {
    setUser(next);
    onChange?.(next);
    // Other views (the app shell, member lists) hold their own copy of the
    // signed-in user, so tell them to refresh rather than leave a stale photo
    // on screen until the next reload.
    window.dispatchEvent(new CustomEvent<Me>(PROFILE_UPDATED, { detail: next }));
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked after an error
    if (!file) return;

    setError('');
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That image is over 5 MB. Pick a smaller one.');
      return;
    }

    setBusy('photo');
    try {
      const url = await uploadImage(file);
      const next = await authFetch<Me>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ avatarUrl: url }),
      });
      apply(next);
      flash('Photo updated');
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function removePhoto() {
    setBusy('photo');
    setError('');
    try {
      const next = await authFetch<Me>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ avatarUrl: null }),
      });
      apply(next);
      flash('Photo removed');
    } catch {
      setError('Could not remove the photo.');
    } finally {
      setBusy(null);
    }
  }

  async function saveName() {
    if ((name.trim() || '') === (user.name ?? '')) return;
    setBusy('name');
    setError('');
    try {
      const next = await authFetch<Me>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      });
      apply(next);
      flash('Name updated');
    } catch {
      setError('Could not save your name.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="v-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold tracking-tight">Your profile</h3>
          <p className="mt-0.5 text-[11.5px] text-muted">
            Shown next to your name across the workspace. Separate from your card artwork.
          </p>
        </div>
        {saved && (
          <span className="v-badge v-badge-success">
            <Icon name="check" size={11} /> {saved}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative">
          <Avatar user={user} size={72} verified={user.verified} />
          {busy === 'photo' && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-canvas/70 text-muted">
              <Icon name="refresh" size={18} className="animate-spin" />
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy === 'photo'}
              className="v-btn h-9 px-3.5 text-[12.5px] disabled:opacity-60"
            >
              <Icon name="upload" size={13} />
              {user.avatarUrl ? 'Change photo' : 'Upload photo'}
            </button>
            {user.avatarUrl && (
              <button
                type="button"
                onClick={removePhoto}
                disabled={busy === 'photo'}
                className="v-btn v-btn-ghost h-9 px-3.5 text-[12.5px] disabled:opacity-60"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-[11px] text-faint">JPG, PNG, WebP, GIF or AVIF · up to 5 MB</p>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        onChange={pick}
        className="hidden"
      />

      <div className="v-divider my-5" />

      <label className="v-section-label mb-1.5 block">Display name</label>
      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          maxLength={120}
          placeholder="Your full name"
          className="v-field h-9 min-w-[200px] flex-1 text-[13px]"
        />
        <button
          type="button"
          onClick={saveName}
          disabled={busy === 'name' || name.trim() === (user.name ?? '')}
          className="v-btn v-btn-ghost h-9 px-3.5 text-[12.5px] disabled:opacity-50"
        >
          Save
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-faint">{user.email}</p>

      {error && (
        <p className="mt-3 flex items-center gap-1.5 text-[11.5px] font-medium text-red-500">
          <Icon name="x" size={12} /> {error}
        </p>
      )}
    </div>
  );
}
