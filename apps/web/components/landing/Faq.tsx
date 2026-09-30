import { getT, serverLocale } from '@/lib/i18n/server';
import { Icon } from '@/components/Icon';
import { SectionHead, WRAP } from './shared';

const QUESTIONS = ['app', 'phones', 'change', 'lost', 'leads', 'arabic'] as const;

export function Faq() {
  const t = getT(serverLocale(), 'landing');
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 py-20 sm:py-28">
      <div className={`${WRAP} grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16`}>
        <SectionHead id="faq-title" label={t('faq.label')} title={t('faq.title')} />
        <div className="border-t border-line">
          {QUESTIONS.map((q) => (
            <details key={q} className="group border-b border-line">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-5 text-[15.5px] font-medium text-ink outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-accent/40 [&::-webkit-details-marker]:hidden">
                {t(`faq.items.${q}.q`)}
                <Icon name="plus" size={16} className="shrink-0 text-faint transition-transform duration-200 group-open:rotate-45" />
              </summary>
              <p className="-mt-1 max-w-2xl pb-5 pe-8 text-[14.5px] leading-relaxed text-muted">{t(`faq.items.${q}.a`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
