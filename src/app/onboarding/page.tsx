"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Step1Identity } from "@/components/onboarding/step1-identity";
import { Step2BranchHours } from "@/components/onboarding/step2-branch-hours";
import { Step3Branding } from "@/components/onboarding/step3-branding";
import {
  EMPTY_ONBOARDING_DRAFT,
  toOnboardingPayload,
  type OnboardingDraft,
} from "@/components/onboarding/types";
import { api, getApiErrorMessage } from "@/lib/api";
import { tenantOnboardingSchema } from "@/lib/validators/tenant";

// Spec §1 "Persistencia del Estado": closing the tab mid-wizard must resume on
// the same screen with the same data. The backend keeps the authoritative draft
// key (`onboarding_step:{userId}` in Redis, cleared by TenantService), but there
// is no endpoint to write it yet — Task 2.3 only invalidates it. localStorage
// covers the requirement today and the Redis draft can be layered on later
// without changing this component's contract.
const DRAFT_KEY = "onboarding_step";

type Step = 1 | 2 | 3;

interface StoredDraft {
  step: Step;
  data: OnboardingDraft;
}

function loadDraft(): StoredDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    if (!parsed || typeof parsed !== "object") return null;

    const step: Step = parsed.step === 2 || parsed.step === 3 ? parsed.step : 1;
    // Merge over the defaults rather than trusting the stored object wholesale:
    // a draft written by an older build can be missing keys the current wizard
    // reads (workingHours above all), and a half-shaped branch would crash the
    // matrix on first render.
    return {
      step,
      data: {
        ...EMPTY_ONBOARDING_DRAFT,
        ...parsed.data,
        branch: { ...EMPTY_ONBOARDING_DRAFT.branch, ...parsed.data?.branch },
      },
    };
  } catch {
    return null;
  }
}

function saveDraft(step: Step, data: OnboardingDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ step, data }));
  } catch {
    // Best-effort — private browsing / storage quota. Losing persistence is not
    // fatal; the wizard still works within the tab.
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

export default function OnboardingPage() {
  const t = useTranslations("Onboarding");

  // Step and data live in one object because they are always restored, saved
  // and advanced together — splitting them meant the hydration effect had to
  // fire three setStates for what is a single logical transition.
  const [wizard, setWizard] = useState<{ hydrated: boolean; step: Step; data: OnboardingDraft }>({
    hydrated: false,
    step: 1,
    data: EMPTY_ONBOARDING_DRAFT,
  });
  const [finishing, setFinishing] = useState(false);

  const { hydrated, step, data } = wizard;

  // localStorage is read in an effect rather than in useState's initialiser so
  // the server-rendered markup and the first client render match — /onboarding
  // is prerendered, and reading storage during render would hydrate it with
  // different content.
  useEffect(() => {
    const draft = loadDraft();
    // Restoring a persisted draft is the one case the rule cannot express: it
    // is a single setState, on mount, with an empty dep array, so it settles in
    // one extra render pass and cannot cascade. `hydrated` gates the UI until
    // then, so no form state is ever rendered from the pre-restore defaults.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWizard({
      hydrated: true,
      step: draft?.step ?? 1,
      data: draft?.data ?? EMPTY_ONBOARDING_DRAFT,
    });
  }, []);

  const onChange = useCallback((patch: Partial<OnboardingDraft>) => {
    setWizard((prev) => {
      const data = { ...prev.data, ...patch };
      saveDraft(prev.step, data);
      return { ...prev, data };
    });
  }, []);

  const goToStep = useCallback((step: Step) => {
    setWizard((prev) => {
      saveDraft(step, prev.data);
      return { ...prev, step };
    });
    // Steps 2 and 3 are taller than the viewport on most laptops; without this
    // the user lands mid-form after advancing.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const onFinish = useCallback(async () => {
    const payload = toOnboardingPayload(data);

    // Re-validate the consolidated payload, not just the individual steps: the
    // draft may have been edited across sessions, and this is the last point
    // where a problem can be shown on the form instead of as a bare 400.
    const parsed = tenantOnboardingSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? t("invalidDraft"));
      return;
    }

    setFinishing(true);
    try {
      await api.post("/tenant/onboarding", parsed.data);
      clearDraft();
      // Full reload rather than router.push: the middleware gate re-reads the
      // membership on the next request, and a client-side navigation would
      // bounce straight back to /onboarding from the cached route tree.
      window.location.href = "/panel";
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("step3.completeFailedGeneric")));
      setFinishing(false);
    }
  }, [data, t]);

  if (!hydrated) {
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
      <Step2BranchHours
        data={data}
        onChange={onChange}
        onBack={() => goToStep(1)}
        onNext={() => goToStep(3)}
      />
    );
  }

  return (
    <Step3Branding
      data={data}
      onChange={onChange}
      onBack={() => goToStep(2)}
      onFinish={onFinish}
      finishing={finishing}
    />
  );
}
