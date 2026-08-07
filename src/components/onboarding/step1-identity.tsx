'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SelectableCard } from './selectable-card';
import { StepProgress } from './step-progress';
import { isStep1Valid, type OnboardingData } from './types';

export function Step1Identity({
  data,
  onChange,
  onNext,
}: {
  data: OnboardingData;
  onChange: (patch: Partial<OnboardingData>) => void;
  onNext: () => void;
}) {
  const t = useTranslations('Onboarding');

  const taxIdDigitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, 11);

  return (
    <Card>
      <CardHeader>
        <StepProgress current={1} />
        <CardTitle>{t('step1.title')}</CardTitle>
        <CardDescription>{t('step1.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>{t('step1.identityTypeLabel')}</Label>
          <div className="flex gap-2">
            <SelectableCard
              active={data.identity_type === 'empresa'}
              title={t('step1.identityTypeEmpresa')}
              onClick={() => onChange({ identity_type: 'empresa' })}
            />
            <SelectableCard
              active={data.identity_type === 'marca_personal'}
              title={t('step1.identityTypePersonal')}
              onClick={() => onChange({ identity_type: 'marca_personal' })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t('step1.taxIdTypeLabel')}</Label>
          <div className="flex gap-2">
            <SelectableCard
              active={data.tax_id_type === 'RUC10'}
              title={t('step1.taxIdTypeRuc10')}
              onClick={() => onChange({ tax_id_type: 'RUC10' })}
            />
            <SelectableCard
              active={data.tax_id_type === 'RUC20'}
              title={t('step1.taxIdTypeRuc20')}
              onClick={() => onChange({ tax_id_type: 'RUC20' })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="onboarding-tax-id">{t('step1.taxIdLabel')}</Label>
          <Input
            id="onboarding-tax-id"
            inputMode="numeric"
            value={data.tax_id}
            onChange={(e) => onChange({ tax_id: taxIdDigitsOnly(e.target.value) })}
            placeholder={t('step1.taxIdPlaceholder')}
            maxLength={11}
          />
          <p className="text-xs text-muted-foreground">{t('step1.taxIdHint')}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="onboarding-legal-name">{t('step1.legalNameLabel')}</Label>
          <Input
            id="onboarding-legal-name"
            value={data.legal_name}
            onChange={(e) => onChange({ legal_name: e.target.value })}
            placeholder={t('step1.legalNamePlaceholder')}
            maxLength={200}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="onboarding-commercial-name">{t('step1.commercialNameLabel')}</Label>
          <Input
            id="onboarding-commercial-name"
            value={data.commercial_name}
            onChange={(e) => onChange({ commercial_name: e.target.value })}
            placeholder={t('step1.commercialNamePlaceholder')}
            maxLength={120}
          />
          <p className="text-xs text-muted-foreground">{t('step1.commercialNameHint')}</p>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="button" disabled={!isStep1Valid(data)} onClick={onNext}>
            {t('step1.next')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
