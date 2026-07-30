export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="h-8 w-8 rounded-lg bg-accent" />
          <span className="text-lg font-semibold">Vertex Connect</span>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-7">
          <h1 className="text-lg font-semibold">{title}</h1>
          {subtitle && <p className="text-sm text-muted mt-1 mb-4">{subtitle}</p>}
          {children}
        </div>
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid theme('colors.line');
          border-radius: 0.5rem;
          padding: 0.6rem 0.75rem;
          font-size: 0.875rem;
          background: #fff;
          outline: none;
        }
        .input:focus {
          border-color: theme('colors.accent.DEFAULT');
        }
        .btn {
          width: 100%;
          border-radius: 0.5rem;
          background: theme('colors.accent.DEFAULT');
          color: #fff;
          padding: 0.625rem;
          font-size: 0.875rem;
          font-weight: 600;
        }
        .btn:disabled {
          opacity: 0.6;
        }
      `}</style>
    </main>
  );
}
