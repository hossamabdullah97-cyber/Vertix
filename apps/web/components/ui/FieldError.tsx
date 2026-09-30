import { Icon } from '@/components/Icon';

/** The line under a field that says what is wrong with it; its id goes on the field's aria-describedby. */
export function FieldError({ id, children }: { id: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
      <Icon name="alert" size={13} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}
