'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { formatMoney } from '@/lib/crm';
import { Panel } from './Shared';

interface ReportsCenterProps {
  overview: any;
  leads: any[];
}

export function ReportsCenter({ overview, leads }: ReportsCenterProps) {
  const { t } = useTranslation('analytics');
  const [exporting, setExporting] = useState<string | null>(null);

  const buildRows = (): [string, string | number][] => {
    const totals = overview?.totals ?? {};
    const pipeline = leads.reduce((s, l) => s + (l.value ?? 0), 0);
    return [
      [t('metrics.views'), totals.VIEW ?? 0],
      [t('metrics.clicks'), totals.CLICK ?? 0],
      [t('metrics.saves'), totals.SAVE ?? 0],
      [t('metrics.shares'), totals.SHARE ?? 0],
      [t('metrics.scans'), totals.NFC_SCAN ?? 0],
      [t('metrics.unique'), overview?.uniqueVisitors ?? 0],
      [t('metrics.leads'), leads.length],
      [t('leadFunnel.hotLeads'), leads.filter((l) => l.temperature === 'HOT').length],
      [t('leadFunnel.pipelineValue'), formatMoney(pipeline)],
    ];
  };

  const handleExportCsv = () => {
    setExporting('csv');
    try {
      const rows = buildRows();
      const csv = `${t('reports2.csvMetric')},${t('reports2.csvValue')}\n` + rows.map(([k, v]) => `"${k}","${v}"`).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'vertex_connect_analytics.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <Panel title={t('reports2.exportTitle')} subtitle={t('reports2.exportSubtitle')} icon="check">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={handleExportCsv}
            disabled={exporting !== null}
            className="v-btn v-btn-ghost !h-auto flex-col items-start gap-1 p-5 text-start"
          >
            <span className="flex items-center gap-2 text-[13px] font-bold text-ink">
              <Icon name="copy" size={15} /> {t('reports2.exportCsv')}
            </span>
            <span className="text-[11px] font-medium text-muted">{t('reports2.exportCsvDesc')}</span>
          </button>

          <button
            onClick={() => window.print()}
            className="v-btn v-btn-ghost !h-auto flex-col items-start gap-1 p-5 text-start"
          >
            <span className="flex items-center gap-2 text-[13px] font-bold text-ink">
              <Icon name="file-text" size={15} /> {t('reports2.printPdf')}
            </span>
            <span className="text-[11px] font-medium text-muted">{t('reports2.printPdfDesc')}</span>
          </button>
        </div>

        <div className="mt-5 v-divider" />
        <p className="mt-4 v-section-label">{t('reports2.includedInExport')}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {buildRows().map(([k, v]) => (
            <span key={k} className="v-badge v-badge-neutral">
              {k}: <span className="font-bold text-ink">{v}</span>
            </span>
          ))}
        </div>
      </Panel>

      <div className="flex items-start gap-3 rounded-xl border border-line bg-elevated/50 p-4">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Icon name="clock" size={14} />
        </span>
        <div>
          <p className="text-[12.5px] font-bold text-ink">{t('reports2.scheduledSoon')}</p>
          <p className="mt-0.5 text-[12px] font-medium leading-relaxed text-muted">
            {t('reports2.scheduledDesc')}
          </p>
        </div>
      </div>
    </div>
  );
}
