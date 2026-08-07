'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const STEP_KEYS = ['identity', 'branch', 'brand'] as const;

export function StepProgress({ current }: { current: 1 | 2 | 3 }) {
  const t = useTranslations('Onboarding');

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          {t('stepIndicator', { current, total: STEP_KEYS.length })}
        </p>
        <p className="text-xs font-medium text-foreground">
          {t(`steps.${STEP_KEYS[current - 1]}`)}
        </p>
      </div>
      <div className="flex gap-2">
        {STEP_KEYS.map((key, i) => (
          <div
            key={key}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              i + 1 <= current ? 'bg-primary' : 'bg-muted',
            )}
          />
        ))}
      </div>
    </div>
  );
}
