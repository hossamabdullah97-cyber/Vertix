import 'reflect-metadata';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { roleCapabilities } from '@vertex/shared';
import { allowed } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AREA_KEY } from '../decorators/area.decorator';

const BUILT_IN = ['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE'] as const;

/** Every route in the API that needs a role, with the roles and the area it is in. */
function guardedRoutes() {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.controller.ts')) files.push(p);
    }
  };
  walk(join(__dirname, '../..'));
  const out: { where: string; required: string[]; area: string | undefined }[] = [];
  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file) as Record<string, unknown>;
    for (const ctrl of Object.values(mod)) {
      if (typeof ctrl !== 'function') continue;
      const proto = (ctrl as { prototype: Record<string, unknown> }).prototype;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const fn = proto[name];
        if (typeof fn !== 'function' || Reflect.getMetadata(METHOD_METADATA, fn) === undefined) continue;
        const required = (Reflect.getMetadata(ROLES_KEY, fn) ?? Reflect.getMetadata(ROLES_KEY, ctrl)) as string[] | undefined;
        if (!required?.length) continue;
        const area = (Reflect.getMetadata(AREA_KEY, fn) ?? Reflect.getMetadata(AREA_KEY, ctrl)) as string | undefined;
        out.push({ where: `${(ctrl as { name: string }).name}.${name}`, required, area });
      }
    }
  }
  return out;
}

describe('custom roles on role-guarded routes', () => {
  const routes = guardedRoutes();

  it('finds the routes', () => {
    expect(routes.length).toBeGreaterThan(80);
  });

  it('put every role-guarded route in an area, so a custom role reaches it or is refused on purpose', () => {
    expect(routes.filter((r) => !r.area).map((r) => r.where)).toEqual([]);
  });

  it('give a custom role made from a built-in role exactly what that role has', () => {
    const differs: string[] = [];
    for (const r of routes) {
      if (r.area === 'roles' || !r.required.includes('ADMIN')) continue; // never through a custom role
      for (const base of ['ADMIN', 'MANAGER', 'EMPLOYEE'] as const) {
        const plain = allowed({ role: base }, r.required, r.area);
        const custom = allowed({ role: base, customRole: { id: 'x', name: 'x', capabilities: roleCapabilities(base) } }, r.required, r.area);
        if (plain !== custom) differs.push(`${r.where} as ${base}: ${plain} vs ${custom}`);
      }
    }
    expect(differs).toEqual([]);
  });

  it('never reach changing roles, owner-only routes, or more than they were given', () => {
    const everything = { id: 'x', name: 'Everything', capabilities: roleCapabilities('ADMIN') };
    for (const r of routes.filter((x) => x.area === 'roles' || !x.required.includes('ADMIN'))) {
      if (r.required.includes('EMPLOYEE')) continue;
      expect({ route: r.where, ok: allowed({ role: 'ADMIN', customRole: everything }, r.required, r.area) }).toEqual({ route: r.where, ok: false });
    }
    const billingOnly = { id: 'b', name: 'Billing', capabilities: ['billing:full'] };
    expect(allowed({ role: 'EMPLOYEE', customRole: billingOnly }, ['OWNER', 'ADMIN'], 'billing')).toBe(true);
    expect(allowed({ role: 'EMPLOYEE', customRole: billingOnly }, ['OWNER', 'ADMIN'], 'integrations')).toBe(false);
    expect(allowed({ role: 'EMPLOYEE', customRole: billingOnly }, ['OWNER'], 'billing')).toBe(false);
    // Full includes basic; basic doesn't reach full.
    expect(allowed({ role: 'EMPLOYEE', customRole: { id: 't', name: 't', capabilities: ['teams:full'] } }, ['OWNER', 'ADMIN', 'MANAGER'], 'teams')).toBe(true);
    expect(allowed({ role: 'EMPLOYEE', customRole: { id: 't', name: 't', capabilities: ['teams:basic'] } }, ['OWNER', 'ADMIN'], 'teams')).toBe(false);
    // An admin-based role without billing can't reach billing.
    expect(allowed({ role: 'ADMIN', customRole: { id: 'a', name: 'a', capabilities: ['people:full'] } }, ['OWNER', 'ADMIN'], 'billing')).toBe(false);
  });

  it('leave built-in roles exactly as they were', () => {
    for (const r of routes) for (const role of BUILT_IN) expect(allowed({ role }, r.required, r.area)).toBe(r.required.includes(role));
  });
});
