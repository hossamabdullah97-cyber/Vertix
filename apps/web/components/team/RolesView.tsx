'use client';

import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { Member, Role } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatNumber } from '@/lib/format';
import { Icon } from '@/components/Icon';

const ROLES: Role[] = ['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE'];

/**
 * What each role may do. This mirrors the API's @Roles guards; it is a
 * description, not a switchboard, because the four roles are fixed today.
 */
const GROUPS: { key: string; perms: { key: string; allow: Role[] }[] }[] = [
  {
    key: 'people',
    perms: [
      { key: 'viewMembers', allow: ['OWNER', 'ADMIN', 'MANAGER'] },
      { key: 'invite', allow: ['OWNER', 'ADMIN'] },
      { key: 'changeRoles', allow: ['OWNER', 'ADMIN'] },
      { key: 'remove', allow: ['OWNER', 'ADMIN'] },
    ],
  },
  {
    key: 'teams',
    perms: [
      { key: 'viewTeams', allow: ['OWNER', 'ADMIN', 'MANAGER'] },
      { key: 'manageTeams', allow: ['OWNER', 'ADMIN'] },
    ],
  },
  {
    key: 'workspace',
    perms: [
      { key: 'chips', allow: ['OWNER', 'ADMIN', 'MANAGER'] },
      { key: 'branding', allow: ['OWNER', 'ADMIN'] },
      { key: 'activity', allow: ['OWNER', 'ADMIN'] },
      { key: 'billing', allow: ['OWNER', 'ADMIN'] },
      { key: 'ownership', allow: ['OWNER'] },
    ],
  },
  {
    key: 'own',
    perms: [
      { key: 'ownCards', allow: ['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE'] },
      { key: 'ownLeads', allow: ['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE'] },
    ],
  },
];

export function RolesView({ myRole, members }: { myRole?: Role; members: Member[] }) {
  const { t } = useTranslation('teams');
  const { locale } = useLocale();
  const count = (r: Role) => members.filter((m) => m.role === r).length;

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ROLES.map((r) => (
          <div key={r} className={`rounded-xl px-4 py-3.5 ring-1 ring-inset ${r === myRole ? 'bg-accent/[0.05] ring-accent/30' : 'ring-line'}`}>
            <p className="flex items-center gap-2 text-[14px] font-medium text-ink">
              {t(`roles.${r}.name`)}
              {r === myRole && <span className="v-badge v-badge-neutral">{t('rolesView.yours')}</span>}
              <span className="tabular ms-auto text-[12.5px] font-normal text-faint">{t('rolesView.people', { count: count(r), value: formatNumber(count(r), locale) })}</span>
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{t(`roles.${r}.summary`)}</p>
          </div>
        ))}
      </div>

      <div className="v-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="v-table">
            <thead>
              <tr>
                <th>{t('rolesView.capability')}</th>
                {ROLES.map((r) => (
                  <th key={r} className={`!text-center ${r === myRole ? '!text-ink' : ''}`}>
                    {t(`roles.${r}.name`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => (
                <Fragment key={g.key}>
                  <tr className="[&>td]:!bg-elevated hover:[&>td]:!bg-elevated">
                    <td colSpan={ROLES.length + 1} className="!py-2 text-[12px] font-medium text-faint">
                      {t(`rolesView.groups.${g.key}`)}
                    </td>
                  </tr>
                  {g.perms.map((p) => (
                    <tr key={p.key}>
                      <td className="min-w-[220px]">
                        <span className="block text-ink">{t(`rolesView.perms.${p.key}.label`)}</span>
                        <span className="block text-[12px] text-faint">{t(`rolesView.perms.${p.key}.desc`)}</span>
                      </td>
                      {ROLES.map((r) => {
                        const allowed = p.allow.includes(r);
                        return (
                          <td key={r} className="text-center">
                            {allowed ? (
                              <Icon name="check" size={15} className="inline text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <span className="text-faint" aria-label={t('rolesView.notAllowed')}>
                                —
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[12.5px] leading-relaxed text-faint">{t('rolesView.note')}</p>
    </div>
  );
}
