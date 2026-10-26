'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Toggle } from '@/components/ui/Toggle';
import { useLocale } from '@/components/i18n/LanguageProvider';
import type { CardAction } from '@/lib/client';
import { detectLink, isQuickAction, isUnfinished, kindByKey, kindOf, QUICK_ADD, summaryOf } from '@/lib/link-kinds';
import { BrandBubble } from './LinkComposer';

/**
 * The Studio's "Contact and links": a tile per common way to be reached (one
 * tap opens it, ready to fill in), the buttons on the card in the two places
 * they show (round buttons under the name, and the list below), each one a
 * row to switch off, open or move; and the number and address saved with
 * the contact.
 */
export function LinksPanel({
  actions,
  onAdd,
  onBrowse,
  onEdit,
  onToggle,
  onReorder,
  contact,
}: {
  actions: CardAction[];
  /** Opens the composer for a kind, by its key, with a value to start from. */
  onAdd: (key: string, initial?: string) => void;
  /** Every kind, searchable. */
  onBrowse: () => void;
  onEdit: (a: CardAction) => void;
  onToggle: (a: CardAction) => void;
  /** The whole order, as ids. */
  onReorder: (ids: string[]) => void;
  /** The phone and email in the saved contact. */
  contact: React.ReactNode;
}) {
  const { t } = useTranslation('cardEditor');
  const { locale } = useLocale();
  const [arranging, setArranging] = useState<'quick' | 'list' | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // The one box: a pasted link, number or email, and what it was taken for.
  const [pasted, setPasted] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const take = (raw: string) => {
    const found = detectLink(raw);
    setUnknown(false);
    setPhone(null);
    if (!found) {
      setUnknown(!!raw.trim());
      return;
    }
    if ('phone' in found) {
      // A number can be a WhatsApp chat or a call: the owner says which.
      setPhone(found.phone);
      return;
    }
    onAdd(found.kind.key, found.value);
    setPasted('');
  };
  const name = (a: CardAction) => {
    const k = kindOf(a);
    return locale === 'ar' ? k.arLabel : k.label;
  };

  // Moving one within its place swaps it with its neighbour there; the rest keep their order.
  const move = (list: CardAction[], i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const ids = actions.map((a) => a.id);
    const [x, y] = [ids.indexOf(list[i].id), ids.indexOf(list[j].id)];
    [ids[x], ids[y]] = [ids[y], ids[x]];
    onReorder(ids);
  };
  const drop = (target: string) => {
    if (!dragged || dragged === target) return;
    const ids = actions.map((a) => a.id).filter((x) => x !== dragged);
    ids.splice(ids.indexOf(target), 0, dragged);
    onReorder(ids);
  };

  const groups = [
    { key: 'quick' as const, list: actions.filter((a) => isQuickAction(a)) },
    { key: 'list' as const, list: actions.filter((a) => !isQuickAction(a)) },
  ];

  return (
    <div className="space-y-8">
      <section aria-labelledby="links-add">
        <h3 id="links-add" className="text-sm font-medium text-ink">
          {t('linksPanel.addTitle')}
        </h3>
        <p className="mt-0.5 text-xs text-faint">{t('linksPanel.addHint')}</p>
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            take(pasted);
          }}
        >
          <div className="flex gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">{t('linksPanel.pasteLabel')}</span>
              <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-faint">
                <Icon name="link" size={15} />
              </span>
              <input
                dir="auto"
                value={pasted}
                onChange={(e) => {
                  setPasted(e.target.value);
                  setUnknown(false);
                  setPhone(null);
                }}
                onPaste={(e) => {
                  const text = e.clipboardData.getData('text');
                  if (!text) return;
                  e.preventDefault();
                  setPasted(text.trim());
                  take(text);
                }}
                placeholder={t('linksPanel.pastePlaceholder')}
                data-testid="link-paste"
                className="v-field !h-12 !ps-9 sm:!h-11"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </label>
            <button type="submit" className="v-btn !h-12 shrink-0 sm:!h-11" disabled={!pasted.trim()}>
              {t('linksPanel.pasteAdd')}
            </button>
          </div>
          {phone && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-elevated px-3 py-2.5 text-sm text-muted" role="status">
              <span className="me-1">{t('linksPanel.phoneAs')}</span>
              {(['WHATSAPP', 'CALL'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    onAdd(key, phone);
                    setPhone(null);
                    setPasted('');
                  }}
                  className="flex min-h-10 items-center gap-2 rounded-lg bg-surface px-3 text-sm font-medium text-ink ring-1 ring-inset ring-line hover:ring-line-strong"
                >
                  <BrandBubble kind={kindByKey(key)!} size={22} />
                  {locale === 'ar' ? kindByKey(key)!.arLabel : kindByKey(key)!.label}
                </button>
              ))}
            </div>
          )}
          {unknown && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400" role="status">
              {t('linksPanel.pasteUnknown')}
            </p>
          )}
        </form>
        <p className="mb-2 mt-4 text-xs text-faint">{t('linksPanel.orPick')}</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {QUICK_ADD.map((key) => {
            const kind = kindByKey(key)!;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onAdd(key)}
                data-testid={`quick-add-${key}`}
                className="flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-xl px-2 py-3 text-center ring-1 ring-inset ring-line transition-colors hover:bg-elevated hover:ring-line-strong"
              >
                <BrandBubble kind={kind} size={34} />
                <span className="w-full truncate text-xs font-medium text-ink">{locale === 'ar' ? kind.arLabel : kind.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={onBrowse}
            className="flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-2 py-3 text-center transition-colors hover:bg-elevated"
          >
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-elevated text-ink ring-1 ring-inset ring-line">
              <Icon name="plus" size={16} />
            </span>
            <span className="w-full truncate text-xs font-medium text-ink">{t('linksPanel.more')}</span>
          </button>
        </div>
      </section>

      <section aria-labelledby="links-on-card" className="space-y-5">
        <div>
          <h3 id="links-on-card" className="text-sm font-medium text-ink">
            {t('linksPanel.onCard')}
          </h3>
          <p className="mt-0.5 text-xs text-faint">{t('linksPanel.onCardHint')}</p>
        </div>
        {groups.map(({ key, list }) => (
          <div key={key}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <PlaceIcon quick={key === 'quick'} />
                <span className="truncate text-sm text-muted">{t(`linksPanel.group.${key}`)}</span>
                <span className="v-badge v-badge-neutral tabular">{list.length}</span>
              </div>
              {list.length > 1 && (
                <button
                  type="button"
                  onClick={() => setArranging(arranging === key ? null : key)}
                  aria-pressed={arranging === key}
                  className="v-btn v-btn-ghost !h-9 shrink-0 text-xs sm:!h-8"
                >
                  <Icon name={arranging === key ? 'check' : 'menu'} size={13} />
                  {arranging === key ? t('linksPanel.doneArranging') : t('linksPanel.arrange')}
                </button>
              )}
            </div>
            {list.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-3 text-center text-xs text-faint">{t(`linksPanel.group.${key}Empty`)}</p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl ring-1 ring-inset ring-line">
                {list.map((a, i) => {
                  const kind = kindOf(a);
                  const unfinished = isUnfinished(a);
                  const sub = summaryOf(a);
                  return (
                    <li
                      key={a.id}
                      id={`action-card-${a.id}`}
                      draggable={arranging !== key}
                      onDragStart={(e) => {
                        setDragged(a.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragged && dragged !== a.id) setOver(a.id);
                      }}
                      onDragLeave={() => setOver(null)}
                      onDragEnd={() => {
                        setDragged(null);
                        setOver(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        drop(a.id);
                        setDragged(null);
                        setOver(null);
                      }}
                      className={`group flex min-h-16 items-center gap-3 bg-surface px-3 py-2.5 transition-colors ${over === a.id ? 'shadow-[inset_0_2px_0_var(--v-accent)]' : ''}`}
                    >
                      <span className="hidden shrink-0 cursor-grab text-faint active:cursor-grabbing sm:inline" aria-hidden>
                        <Icon name="dots" size={14} className="rotate-90" />
                      </span>
                      <button
                        type="button"
                        onClick={() => onEdit(a)}
                        className={`flex min-w-0 flex-1 items-center gap-3 text-start ${a.isActive ? '' : 'opacity-50'}`}
                        aria-label={t('linksPanel.editNamed', { name: name(a) })}
                      >
                        <BrandBubble kind={kind} size={34} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{name(a)}</span>
                          {unfinished ? (
                            <span className="block truncate text-xs text-amber-700 dark:text-amber-400">{t('linksPanel.unfinished')}</span>
                          ) : sub ? (
                            <span dir="ltr" className="block truncate text-start text-xs text-faint rtl:text-right">
                              {sub}
                            </span>
                          ) : null}
                        </span>
                        {!a.isActive && <span className="v-badge v-badge-neutral shrink-0">{t('links.status.hidden')}</span>}
                      </button>
                      {arranging === key ? (
                        <span className="flex shrink-0 items-center">
                          <RowIcon label={t('links.moveUp')} disabled={i === 0} onClick={() => move(list, i, -1)}>
                            <Icon name="chevron-down" size={16} className="rotate-180" />
                          </RowIcon>
                          <RowIcon label={t('links.moveDown')} disabled={i === list.length - 1} onClick={() => move(list, i, 1)}>
                            <Icon name="chevron-down" size={16} />
                          </RowIcon>
                        </span>
                      ) : (
                        <span className="flex shrink-0 items-center gap-1">
                          <Toggle on={a.isActive} onChange={() => onToggle(a)} label={t('links.toggleVisibility')} />
                          <RowIcon label={t('linksPanel.editNamed', { name: name(a) })} onClick={() => onEdit(a)}>
                            <Icon name="edit" size={15} />
                          </RowIcon>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </section>

      <section aria-labelledby="links-contact" className="rounded-xl ring-1 ring-inset ring-line">
        <div className="flex items-start gap-3 px-4 pb-1 pt-4">
          <span className="v-icon-tile">
            <Icon name="user-plus" size={15} />
          </span>
          <div className="min-w-0">
            <h3 id="links-contact" className="text-sm font-medium text-ink">
              {t('linksPanel.savedTitle')}
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-faint">{t('linksPanel.savedHint')}</p>
          </div>
        </div>
        <div className="px-4 pb-4 pt-3">{contact}</div>
      </section>
    </div>
  );
}

function RowIcon({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-elevated hover:text-ink disabled:opacity-30 sm:h-9 sm:w-9"
    >
      {children}
    </button>
  );
}

/** A tiny drawing of where a group shows: round buttons under the name, or the list below. */
function PlaceIcon({ quick }: { quick: boolean }) {
  return (
    <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center text-faint">
      {quick ? (
        <span className="flex gap-[2px]">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-[5px] w-[5px] rounded-full bg-current" />
          ))}
        </span>
      ) : (
        <span className="flex w-3.5 flex-col gap-[2px]">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-[3px] w-full rounded-sm bg-current" />
          ))}
        </span>
      )}
    </span>
  );
}
