'use client';

import * as React from 'react';
import Link from 'next/link';

/* ============================================================================
   SidebarItem Component
   ============================================================================ */
export interface SidebarItemProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  active?: boolean;
  icon?: React.ReactNode;
  href: string;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  className = '',
  active = false,
  icon,
  href,
  children,
  ...props
}) => {
  return (
    <Link
      href={href}
      className={`v-nav-item hover:translate-x-0.5 w-full select-none ${className}`}
      data-active={active}
      {...props}
    >
      {icon && (
        <span className={`transition-colors duration-200 ${active ? 'text-[var(--ds-accent)]' : 'text-[hsl(var(--ds-fg-muted))]'}`}>
          {icon}
        </span>
      )}
      <span className="font-semibold">{children}</span>
    </Link>
  );
};

/* ============================================================================
   TopbarItem Component
   ============================================================================ */
export interface TopbarItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const TopbarItem: React.FC<TopbarItemProps> = ({
  className = '',
  active = false,
  children,
  ...props
}) => {
  return (
    <button
      className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all duration-150 select-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-soft)] ${
        active
          ? 'bg-[var(--ds-accent)] text-[var(--ds-accent-contrast)] shadow-sm'
          : 'text-[hsl(var(--ds-fg-muted))] hover:text-ink hover:bg-[hsl(var(--ds-fg)/0.04)]'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

/* ============================================================================
   Breadcrumb Component
   ============================================================================ */
export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps extends React.HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({
  items,
  className = '',
  ...props
}) => {
  return (
    <nav className={`text-[12.5px] font-semibold text-[hsl(var(--ds-fg-muted))] flex items-center gap-2 select-none ${className}`} {...props}>
      {items.map((item, idx) => {
        const last = idx === items.length - 1;
        return (
          <React.Fragment key={idx}>
            {idx > 0 && <span className="text-[hsl(var(--ds-fg-faint))] font-bold">/</span>}
            {last || !item.href ? (
              <span className="text-ink font-bold truncate max-w-[120px]">{item.label}</span>
            ) : (
              <Link href={item.href} className="hover:text-ink transition-colors">
                {item.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

/* ============================================================================
   Tabs Component
   ============================================================================ */
export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface TabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeId,
  onChange,
  className = '',
  ...props
}) => {
  return (
    <div className={`flex border-b border-[hsl(var(--ds-border))] overflow-x-auto no-scrollbar gap-5 select-none ${className}`} {...props}>
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`pb-2.5 px-0.5 text-[13.5px] font-bold flex items-center gap-1.5 border-b-2 transition-all relative outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-soft)] ${
              active
                ? 'border-[var(--ds-accent)] text-ink'
                : 'border-transparent text-[hsl(var(--ds-fg-muted))] hover:text-ink'
            }`}
          >
            {tab.icon && <span className={active ? 'text-[var(--ds-accent)]' : 'text-[hsl(var(--ds-fg-muted))]'}>{tab.icon}</span>}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};

/* ============================================================================
   Segmented Control Component (Apple segmented slider style)
   ============================================================================ */
export interface SegmentedControlProps {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  value,
  onChange,
  className = '',
}) => {
  return (
    <div className={`flex rounded-ds-md border border-[hsl(var(--ds-border))] bg-[hsl(var(--ds-gray-50))] p-0.5 shadow-inner select-none ${className}`}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className="rounded-ds-sm px-3.5 py-1.5 text-[12.5px] font-bold capitalize transition-all duration-200"
          style={{
            background: value === o ? 'var(--ds-accent)' : 'transparent',
            color: value === o ? 'var(--ds-accent-contrast)' : 'hsl(var(--ds-fg-muted))',
            boxShadow: value === o ? 'var(--ds-shadow-sm)' : 'none',
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
};

/* ============================================================================
   DropdownMenu Component
   ============================================================================ */
export interface DropdownItem {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
}

export interface DropdownMenuProps extends React.HTMLAttributes<HTMLDivElement> {
  trigger: React.ReactNode;
  items: DropdownItem[];
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  trigger,
  items,
  className = '',
  ...props
}) => {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div ref={containerRef} className="relative inline-block text-left" {...props}>
      <div onClick={() => setOpen((o) => !o)} className="cursor-pointer">
        {trigger}
      </div>
      {open && (
        <div
          className={`absolute right-0 mt-1.5 w-48 rounded-ds-lg border border-[hsl(var(--ds-border-strong))] bg-[hsl(var(--ds-surface))] shadow-[var(--ds-shadow-lg)] z-[var(--ds-z-dropdown)] py-1.5 overflow-hidden animate-fadeIn select-none ${className}`}
        >
          {items.map((item, idx) => (
            <button
              key={idx}
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-[13px] font-bold flex items-center gap-2.5 transition-colors ${
                item.danger
                  ? 'text-[hsl(var(--ds-error-accent))] hover:bg-[hsl(var(--ds-error-bg))]'
                  : 'text-ink hover:bg-[hsl(var(--ds-fg)/0.04)]'
              }`}
            >
              {item.icon && <span className="shrink-0">{item.icon}</span>}
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
