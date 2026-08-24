"use client";

import { useCallback, useEffect, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import { createPaymentMethod, updatePaymentMethod } from "@/lib/payment-methods/api";
import {
  EMPTY_DETAILS,
  EMPTY_PAYMENT_METHOD_FORM,
  PAYMENT_METHOD_FIELDS,
  PAYMENT_METHOD_TYPES,
  paymentMethodSchema,
  toPaymentMethodForm,
  type PaymentMethodConfig,
  type PaymentMethodFormInput,
  type PaymentMethodType,
} from "@/lib/validators/payment-methods";

export function PaymentMethodFormDialog({
  open,
  onOpenChange,
  method,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create. */
  method: PaymentMethodConfig | null;
  onSaved: () => void;
}) {
  const t = useTranslations("PaymentMethods");
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    getValues,
    watch,
    formState: { errors },
  } = useForm<PaymentMethodFormInput>({
    resolver: zodResolver(paymentMethodSchema) as Resolver<PaymentMethodFormInput>,
    defaultValues: EMPTY_PAYMENT_METHOD_FORM,
  });

  const type = watch("type");

  useEffect(() => {
    if (!open) return;
    reset(method ? toPaymentMethodForm(method) : EMPTY_PAYMENT_METHOD_FORM);
  }, [open, method, reset]);

  const onSubmit = useCallback(
    async (values: PaymentMethodFormInput) => {
      setSubmitting(true);
      try {
        if (method) {
          await updatePaymentMethod(method.id, values);
          toast.success(t("form.updated"));
        } else {
          await createPaymentMethod(values);
          toast.success(t("form.created"));
        }
        onOpenChange(false);
        onSaved();
      } catch (error) {
        toast.error(getApiErrorMessage(error, t("form.saveFailed")));
      } finally {
        setSubmitting(false);
      }
    },
    [method, onOpenChange, onSaved, t],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{method ? t("form.editTitle") : t("form.newTitle")}</DialogTitle>
          <DialogDescription>{t("form.description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="payment-method-type">{t("form.typeLabel")}</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    const nextType = value as PaymentMethodType;
                    field.onChange(nextType);
                    // A field set from another tipo (e.g. "phoneNumber" left
                    // over from YAPE) must not survive into BANK_ACCOUNT's
                    // payload — reset to that tipo's own blank shape.
                    reset({ ...getValues(), type: nextType, details: EMPTY_DETAILS[nextType] });
                  }}
                  // Editing an existing method keeps its tipo fixed: switching
                  // YAPE into BANK_ACCOUNT after the fact reads as creating a
                  // different method, not editing this one.
                  disabled={!!method}
                >
                  <SelectTrigger id="payment-method-type" className="mt-1.5 w-full">
                    <SelectValue>{(value: PaymentMethodType) => t(`types.${value}`)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_TYPES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`types.${option}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div>
            <Label htmlFor="payment-method-label">{t("form.labelLabel")}</Label>
            <Input
              id="payment-method-label"
              {...register("label")}
              placeholder={t("form.labelPlaceholder")}
              className="mt-1.5"
            />
            <FieldError message={errors.label?.message} />
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            {PAYMENT_METHOD_FIELDS[type].map((field) => (
              <div key={field.key}>
                <Label htmlFor={`payment-method-${field.key}`}>
                  {t(`fields.${field.labelKey}`)}
                  {field.optional && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({t("form.optional")})
                    </span>
                  )}
                </Label>
                {field.multiline ? (
                  <Textarea
                    id={`payment-method-${field.key}`}
                    {...register(`details.${field.key}`)}
                    rows={3}
                    className="mt-1.5"
                  />
                ) : (
                  <Input
                    id={`payment-method-${field.key}`}
                    type={field.secret ? "password" : "text"}
                    {...register(`details.${field.key}`)}
                    placeholder={field.placeholder}
                    className="mt-1.5"
                  />
                )}
                <FieldError message={errors.details?.[field.key]?.message} />
              </div>
            ))}
          </div>

          <Controller
            control={control}
            name="isEnabled"
            render={({ field }) => (
              <div className="flex items-center gap-2.5">
                <Switch id="payment-method-enabled" checked={field.value} onCheckedChange={field.onChange} />
                <Label htmlFor="payment-method-enabled" className="cursor-pointer">
                  {field.value ? t("form.enabledLabel") : t("form.disabledLabel")}
                </Label>
              </div>
            )}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {method ? t("common.saveChanges") : t("form.createButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}
