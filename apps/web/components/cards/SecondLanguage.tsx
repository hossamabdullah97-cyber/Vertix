'use client';

import { useTranslation } from 'react-i18next';
import { Toggle } from '@/components/ui/Toggle';

type Lang = 'en' | 'ar';

/** The card's identity in its second language, as kept in `vcardData.alt`. */
export interface AltIdentity {
  lang: Lang;
  fullName?: string;
  title?: string;
  company?: string;
  location?: string;
  about?: string;
}

/**
 * The card written once more in the other language. Visitors whose phone is
 * in that language see it first, and anyone can switch on the card.
 */
export function SecondLanguage({ primary, value, onChange }: { primary: Lang; value: AltIdentity | undefined; onChange: (next: AltIdentity | undefined) => void }) {
  const { t } = useTranslation('cardEditor');
  const other: Lang = primary === 'ar' ? 'en' : 'ar';
  // Written for the language the card is now in (it was switched): start over.
  const current = value?.lang === other ? value : undefined;
  const on = !!current;
  const dir = other === 'ar' ? 'rtl' : 'ltr';
  const set = (key: keyof Omit<AltIdentity, 'lang'>, v: string) => onChange({ ...(current ?? { lang: other }), [key]: v });

  const field = (key: keyof Omit<AltIdentity, 'lang'>, label: string, placeholder: string) => (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink">{label}</span>
      <input dir={dir} lang={other} className="v-field" value={current?.[key] ?? ''} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} />
    </label>
  );

  return (
    <div className="mt-6 rounded-xl ring-1 ring-inset ring-line">
      <div className="flex items-center justify-between gap-4 px-3.5 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{t('second.title', { language: t(`second.lang.${other}`) })}</p>
          <p className="mt-0.5 text-xs leading-snug text-faint">{t('second.hint', { language: t(`second.lang.${other}`) })}</p>
        </div>
        <Toggle on={on} onChange={() => onChange(on ? undefined : { lang: other })} label={t('second.title', { language: t(`second.lang.${other}`) })} />
      </div>
      {on && (
        <div className="grid gap-4 border-t border-line p-3.5 sm:grid-cols-2">
          {field('fullName', t('profile.fullName'), other === 'ar' ? 'مريم خالد' : 'Mariam Khaled')}
          {field('title', t('profile.jobTitle'), other === 'ar' ? 'مديرة المبيعات' : 'Sales Director')}
          {field('company', t('profile.company'), other === 'ar' ? 'فيرتكس للمقاولات' : 'Vertex Build')}
          {field('location', t('profile.location'), other === 'ar' ? 'القاهرة، مصر' : 'Cairo, Egypt')}
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-medium text-ink">{t('second.about')}</span>
            <textarea dir={dir} lang={other} className="v-field min-h-20" value={current?.about ?? ''} onChange={(e) => set('about', e.target.value)} />
          </label>
          {!current?.fullName?.trim() && <p className="text-xs text-amber-700 dark:text-amber-400 sm:col-span-2">{t('second.needName')}</p>}
        </div>
      )}
    </div>
  );
}
