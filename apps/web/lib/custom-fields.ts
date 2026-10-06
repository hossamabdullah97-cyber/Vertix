'use client';

import { useEffect, useState } from 'react';
import type { CustomFieldDef, CustomFieldValue } from '@vertex/shared';
import { authFetch } from './client';

/** Fired after the fields are changed, so every open list and drawer reloads them. */
export const FIELDS_CHANGED = 'vx:fields-changed';

let pending: Promise<CustomFieldDef[]> | null = null;
function load(force = false) {
  if (force || !pending) pending = authFetch<CustomFieldDef[]>('/leads/fields').catch(() => ((pending = null), []));
  return pending;
}

/** The workspace's own lead fields, in order (shared by every component that asks). */
export function useCustomFields(): CustomFieldDef[] | null {
  const [fields, setFields] = useState<CustomFieldDef[] | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((f) => alive && setFields(f));
    const reload = () => load(true).then((f) => alive && setFields(f));
    window.addEventListener(FIELDS_CHANGED, reload);
    return () => {
      alive = false;
      window.removeEventListener(FIELDS_CHANGED, reload);
    };
  }, []);
  return fields;
}

export function fieldsChanged() {
  window.dispatchEvent(new Event(FIELDS_CHANGED));
}

/** A value as text, for lists and exports. */
export function fieldText(field: Pick<CustomFieldDef, 'type'>, value: CustomFieldValue | null | undefined, yesNo: [string, string]): string {
  if (value === null || value === undefined || value === '') return '';
  if (field.type === 'CHECKBOX') return value ? yesNo[0] : yesNo[1];
  return String(value);
}
