import { VLoader } from '@/components/brand/VMark';

export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center" style={{ background: 'hsl(var(--v-bg))' }}>
      <span style={{ color: 'var(--v-accent, #1d4ed8)' }}>
        <VLoader size={34} />
      </span>
    </main>
  );
}
