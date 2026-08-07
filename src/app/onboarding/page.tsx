'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { Step1Identity } from '@/components/onboarding/step1-identity';
import { Step2Branch } from '@/components/onboarding/step2-branch';
import { Step3Brand } from '@/components/onboarding/step3-brand';
import { EMPTY_ONBOARDING_DATA, type OnboardingData } from '@/components/onboarding/types';

// Historia 2 §1 "Persistencia": if the user closes the tab mid-wizard,
// re-opening /onboarding must resume on the same screen with the same
// data. There's no draft table in the DB (the tenant/branch rows are
// only written once, atomically, on "Finalizar Registro" — see
// /api/onboarding/complete), so the in-progress draft lives in
// localStorage, keyed per account so switching accounts never leaks
// one business's draft into another's form.
const DRAFT_KEY_PREFIX = 'lia-onboarding-draft:';

type Step = 1 | 2 | 3;

function loadDraft(accountId: string): { step: Step; data: OnboardingData } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY_PREFIX + accountId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const step = parsed.step === 2 || parsed.step === 3 ? parsed.step : 1;
    return { step, data: { ...EMPTY_ONBOARDING_DATA, ...parsed.data } };
  } catch {
    return null;
  }
}

function saveDraft(accountId: string, step: Step, data: OnboardingData) {
  try {
    localStorage.setItem(DRAFT_KEY_PREFIX + accountId, JSON.stringify({ step, data }));
  } catch {
    // Best-effort — private browsing / storage quota. Losing draft
    // persistence isn't fatal, the wizard still works within the tab.
  }
}

function clearDraft(accountId: string) {
  try {
    localStorage.removeItem(DRAFT_KEY_PREFIX + accountId);
  } catch {
    // ignore
  }
}

export default function OnboardingPage() {
  const t = useTranslations('Onboarding');

  const [accountId, setAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>(1);
  const [data, setData] = useState<OnboardingData>(EMPTY_ONBOARDING_DATA);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/account')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body) => {
        if (cancelled) return;
        const id: string | undefined = body?.account?.id;
        if (!id) throw new Error('missing account id');
        setAccountId(id);
        const draft = loadDraft(id);
        if (draft) {
          setStep(draft.step);
          setData(draft.data);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const onChange = useCallback(
    (patch: Partial<OnboardingData>) => {
      setData((prev) => {
        const next = { ...prev, ...patch };
        if (accountId) saveDraft(accountId, step, next);
        return next;
      });
    },
    [accountId, step],
  );

  const goToStep = useCallback(
    (next: Step) => {
      setStep(next);
      if (accountId) saveDraft(accountId, next, data);
    },
    [accountId, data],
  );

  const onFinish = useCallback(async () => {
    setFinishing(true);
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity_type: data.identity_type,
          tax_id_type: data.tax_id_type,
          tax_id: data.tax_id,
          legal_name: data.legal_name,
          commercial_name: data.commercial_name,
          main_category: data.main_category,
          logo_url: data.logo_url,
          branch_name: data.branch_name,
          address: data.address,
          ubigeo_code: data.district_code,
          whatsapp_number: data.whatsapp_number,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          toast.error(t('alreadyCompleted'));
        } else {
          toast.error(t('step3.completeFailed', { message: body.error ?? String(res.status) }));
        }
        setFinishing(false);
        return;
      }
      if (accountId) clearDraft(accountId);
      // Full reload (not router.push) so the dashboard shell's
      // AuthProvider and the middleware both see the freshly-created
      // tenant on the very next request — same reasoning as the
      // post-login/post-signup redirects elsewhere in this app.
      window.location.href = '/dashboard';
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(t('step3.completeFailed', { message }));
      setFinishing(false);
    }
  }, [accountId, data, t]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (step === 1) {
    return <Step1Identity data={data} onChange={onChange} onNext={() => goToStep(2)} />;
  }

  if (step === 2) {
    return (
      <Step2Branch
        data={data}
        onChange={onChange}
        onBack={() => goToStep(1)}
        onNext={() => goToStep(3)}
      />
    );
  }

  return (
    <Step3Brand
      data={data}
      onChange={onChange}
      accountId={accountId}
      onBack={() => goToStep(2)}
      onFinish={onFinish}
      finishing={finishing}
    />
  );
}
