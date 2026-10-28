'use client';

import { CheckCircle2, CircleDashed, ShieldAlert, WifiOff } from 'lucide-react';
import { useI18n } from './i18n';

export function ConnectionStatus({ status }: { status: string }) {
  const { t } = useI18n();
  const Icon =
    status === 'Connected'
      ? CheckCircle2
      : status === 'Access expired'
        ? ShieldAlert
        : status === 'Offline'
          ? WifiOff
          : CircleDashed;
  const tone =
    status === 'Connected'
      ? 'text-success'
      : status === 'Access expired'
        ? 'text-destructive'
        : 'text-muted';
  return (
    <span role="status" aria-label={t('Connection status')} className="badge">
      <Icon size={15} className={tone} aria-hidden="true" />
      {t(status)}
    </span>
  );
}
