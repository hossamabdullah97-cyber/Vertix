'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { twoStep, type TwoStepStatus } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatDate } from '@/lib/format';
import { QRCode } from '@/components/QRCode';
import { Icon } from '@/components/Icon';

type Step = { kind: 'idle' } | { kind: 'scan'; secret: string; url: string } | { kind: 'codes'; codes: string[] } | { kind: 'confirm'; action: 'disable' | 'regenerate' };

/**
 * Two-step verification for the signed-in person: scan a QR code into an
 * authenticator app, prove it with the first code, keep the recovery codes.
 * Once on, every sign-in asks for a code from the app.
 */
export function TwoStepPanel({ onChange }: { onChange?: (enabled: boolean) => void }) {
  const { t } = useTranslation('settings');
  const { locale } = useLocale();
  const [status, setStatus] = useState<TwoStepStatus | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const changed = useRef(onChange);
  changed.current = onChange;
  const load = useCallback(async () => {
    const s = await twoStep.status();
    setStatus(s);
    changed.current?.(s.enabled);
  }, []);

  useEffect(() => {
    load().catch((e) => setError((e as Error).message));
  }, [load]);

  async function run(fn: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  const start = () =>
    run(async () => {
      const s = await twoStep.setup();
      setStep({ kind: 'scan', secret: s.secret, url: s.otpauthUrl });
      setCode('');
    });

  const confirmScan = () =>
    run(async () => {
      const { recoveryCodes } = await twoStep.enable(code);
      setCode('');
      setStep({ kind: 'codes', codes: recoveryCodes });
      await load();
    });

  const confirmAction = (action: 'disable' | 'regenerate') =>
    run(async () => {
      if (action === 'disable') {
        await twoStep.disable(code);
        setStep({ kind: 'idle' });
      } else {
        const { recoveryCodes } = await twoStep.recoveryCodes(code);
        setStep({ kind: 'codes', codes: recoveryCodes });
      }
      setCode('');
      await load();
    });

  function copy(text: string) {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  function download(codes: string[]) {
    const body = `${t('twoStep.fileHeading')}\n\n${codes.join('\n')}\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
    a.download = 'vertex-connect-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const codeInput = (onSubmit: () => void, allowRecovery: boolean) => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) onSubmit();
      }}
      className="mt-4 flex flex-wrap items-center gap-2"
    >
      <input
        className="v-field w-44 text-center font-mono tracking-[0.3em]"
        value={code}
        onChange={(e) => setCode(allowRecovery ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode={allowRecovery ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        placeholder="000000"
        aria-label={t('twoStep.codeLabel')}
        autoFocus
        dir="ltr"
      />
      <button disabled={busy || !code.trim()} className="v-btn disabled:opacity-50">
        {busy ? t('twoStep.checking') : t('twoStep.confirm')}
      </button>
      <button type="button" onClick={() => (setStep({ kind: 'idle' }), setCode(''), setError(''))} className="v-btn v-btn-ghost">
        {t('twoStep.cancel')}
      </button>
    </form>
  );

  return (
    <section className="rounded-xl p-5 ring-1 ring-inset ring-line">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${status?.enabled ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-elevated text-muted'}`}>
          <Icon name="shield" size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-medium text-ink">{t('twoStep.title')}</h2>
            {status && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.enabled ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-elevated text-muted ring-1 ring-inset ring-line'}`}>
                {status.enabled ? t('twoStep.on') : t('twoStep.off')}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t('twoStep.body')}</p>
          {status?.enabled && status.enabledAt && step.kind === 'idle' && (
            <p className="mt-2 text-xs text-faint">
              {t('twoStep.since', { date: formatDate(status.enabledAt, locale) })} · {t('twoStep.codesLeft', { count: status.recoveryCodesLeft })}
            </p>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-500/[0.06] px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-300">
          {error}
        </p>
      )}

      {!status ? (
        <div className="v-skeleton mt-4 h-9 w-40 rounded-lg" />
      ) : step.kind === 'scan' ? (
        <div className="mt-5 grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div className="w-fit rounded-xl bg-white p-2 ring-1 ring-line">
            <QRCode value={step.url} size={168} />
          </div>
          <div className="min-w-0">
            <ol className="list-decimal space-y-1.5 ps-5 text-sm leading-relaxed text-muted">
              <li>{t('twoStep.scan1')}</li>
              <li>{t('twoStep.scan2')}</li>
              <li>{t('twoStep.scan3')}</li>
            </ol>
            <p className="mt-3 text-xs text-faint">{t('twoStep.manual')}</p>
            <button type="button" onClick={() => copy(step.secret)} className="mt-1 flex max-w-full items-center gap-2 rounded-md bg-elevated px-2 py-1 font-mono text-xs text-ink ring-1 ring-inset ring-line" dir="ltr">
              <span className="truncate">{step.secret.match(/.{1,4}/g)?.join(' ')}</span>
              <Icon name={copied ? 'check' : 'copy'} size={12} />
            </button>
            {codeInput(confirmScan, false)}
          </div>
        </div>
      ) : step.kind === 'codes' ? (
        <div className="mt-5">
          <p className="text-sm font-medium text-ink">{t('twoStep.codesTitle')}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t('twoStep.codesBody')}</p>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg bg-elevated p-4 font-mono text-sm text-ink ring-1 ring-inset ring-line sm:w-fit" dir="ltr">
            {step.codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => copy(step.codes.join('\n'))} className="v-btn v-btn-ghost">
              <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? t('twoStep.copied') : t('twoStep.copy')}
            </button>
            <button type="button" onClick={() => download(step.codes)} className="v-btn v-btn-ghost">
              <Icon name="download" size={14} /> {t('twoStep.download')}
            </button>
            <button type="button" onClick={() => setStep({ kind: 'idle' })} className="v-btn">
              {t('twoStep.saved')}
            </button>
          </div>
        </div>
      ) : step.kind === 'confirm' ? (
        <div className="mt-5">
          <p className="text-sm text-muted">{step.action === 'disable' ? t('twoStep.confirmDisable') : t('twoStep.confirmRegenerate')}</p>
          {codeInput(() => confirmAction(step.action), true)}
        </div>
      ) : status.enabled ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => (setStep({ kind: 'confirm', action: 'regenerate' }), setError(''))} className="v-btn v-btn-ghost">
            {t('twoStep.regenerate')}
          </button>
          <button type="button" onClick={() => (setStep({ kind: 'confirm', action: 'disable' }), setError(''))} className="v-btn v-btn-ghost text-red-600 dark:text-red-400">
            {t('twoStep.disable')}
          </button>
        </div>
      ) : (
        <button type="button" onClick={start} disabled={busy} className="v-btn mt-4 disabled:opacity-50">
          {t('twoStep.enable')}
        </button>
      )}
    </section>
  );
}
