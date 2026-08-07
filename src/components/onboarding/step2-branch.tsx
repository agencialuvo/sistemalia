'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StepProgress } from './step-progress';
import { isStep2Valid, type OnboardingData } from './types';

interface UbigeoOption {
  code: string;
  name: string;
}

export function Step2Branch({
  data,
  onChange,
  onBack,
  onNext,
}: {
  data: OnboardingData;
  onChange: (patch: Partial<OnboardingData>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations('Onboarding');

  const [regions, setRegions] = useState<UbigeoOption[]>([]);
  const [provinces, setProvinces] = useState<UbigeoOption[]>([]);
  const [districts, setDistricts] = useState<UbigeoOption[]>([]);

  // Regions load once.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/onboarding/ubigeo?level=regions')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body) => {
        if (!cancelled) setRegions(body.regions ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error(t('step2.loadRegionsError'));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  // Provinces depend on the selected region. Resetting the province/
  // district list on region change happens at the call site
  // (onValueChange below clears province_code/district_code), so this
  // effect only needs to skip fetching when there's nothing to fetch —
  // clearing `provinces` here too would just be a second setState for
  // the same render.
  useEffect(() => {
    if (!data.region_code) return;
    let cancelled = false;
    fetch(`/api/onboarding/ubigeo?level=provinces&region=${data.region_code}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body) => {
        if (!cancelled) setProvinces(body.provinces ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error(t('step2.loadProvincesError'));
      });
    return () => {
      cancelled = true;
    };
  }, [data.region_code, t]);

  // Districts depend on the selected province — same reasoning as
  // the provinces effect above.
  useEffect(() => {
    if (!data.province_code) return;
    let cancelled = false;
    fetch(`/api/onboarding/ubigeo?level=districts&province=${data.province_code}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body) => {
        if (!cancelled) setDistricts(body.districts ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error(t('step2.loadDistrictsError'));
      });
    return () => {
      cancelled = true;
    };
  }, [data.province_code, t]);

  return (
    <Card>
      <CardHeader>
        <StepProgress current={2} />
        <CardTitle>{t('step2.title')}</CardTitle>
        <CardDescription>{t('step2.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="onboarding-branch-name">{t('step2.branchNameLabel')}</Label>
          <Input
            id="onboarding-branch-name"
            value={data.branch_name}
            onChange={(e) => onChange({ branch_name: e.target.value })}
            placeholder={t('step2.branchNamePlaceholder')}
            maxLength={120}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="onboarding-address">{t('step2.addressLabel')}</Label>
          <Input
            id="onboarding-address"
            value={data.address}
            onChange={(e) => onChange({ address: e.target.value })}
            placeholder={t('step2.addressPlaceholder')}
            maxLength={200}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>{t('step2.regionLabel')}</Label>
            <Select
              value={data.region_code || undefined}
              onValueChange={(val) =>
                onChange({ region_code: val ?? '', province_code: '', district_code: '' })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('step2.regionPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {regions.map((r) => (
                  <SelectItem key={r.code} value={r.code}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('step2.provinceLabel')}</Label>
            <Select
              value={data.province_code || undefined}
              onValueChange={(val) => onChange({ province_code: val ?? '', district_code: '' })}
              disabled={!data.region_code}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('step2.provincePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {provinces.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('step2.districtLabel')}</Label>
            <Select
              value={data.district_code || undefined}
              onValueChange={(val) => onChange({ district_code: val ?? '' })}
              disabled={!data.province_code}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('step2.districtPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {districts.map((d) => (
                  <SelectItem key={d.code} value={d.code}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="onboarding-whatsapp">{t('step2.whatsappLabel')}</Label>
          <Input
            id="onboarding-whatsapp"
            inputMode="numeric"
            value={data.whatsapp_number}
            onChange={(e) =>
              onChange({ whatsapp_number: e.target.value.replace(/\D/g, '').slice(0, 9) })
            }
            placeholder={t('step2.whatsappPlaceholder')}
            maxLength={9}
          />
          <p className="text-xs text-muted-foreground">{t('step2.whatsappHint')}</p>
        </div>

        <div className="flex justify-between pt-2">
          <Button type="button" variant="outline" onClick={onBack}>
            {t('step2.back')}
          </Button>
          <Button type="button" disabled={!isStep2Valid(data)} onClick={onNext}>
            {t('step2.next')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
