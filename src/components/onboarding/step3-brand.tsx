'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Upload, X } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
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
import { isStep3Valid, type OnboardingData } from './types';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg']);
const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg']);

export function Step3Brand({
  data,
  onChange,
  accountId,
  onBack,
  onFinish,
  finishing,
}: {
  data: OnboardingData;
  onChange: (patch: Partial<OnboardingData>) => void;
  accountId: string | null;
  onBack: () => void;
  onFinish: () => void;
  finishing: boolean;
}) {
  const t = useTranslations('Onboarding');
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const uploadLogo = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_MIME.has(file.type) || !ALLOWED_EXT.has(ext)) {
      toast.error(t('step3.unsupportedImage'), {
        description: t('step3.unsupportedImageDesc'),
      });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(t('step3.imageTooLarge'), {
        description: t('step3.imageTooLargeDesc'),
      });
      return;
    }
    if (!accountId) {
      toast.error(t('loadError'));
      return;
    }

    setUploading(true);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    try {
      const path = `account-${accountId}/logo-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('tenant-logos')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type,
        });
      if (uploadError) {
        throw new Error(uploadError.message);
      }
      const {
        data: { publicUrl },
      } = supabase.storage.from('tenant-logos').getPublicUrl(path);
      onChange({ logo_url: publicUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(t('step3.uploadFailed', { message }));
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) uploadLogo(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadLogo(file);
  };

  const onRemoveLogo = () => {
    setPreviewUrl(null);
    onChange({ logo_url: null });
  };

  const displayUrl = previewUrl ?? data.logo_url;

  return (
    <Card>
      <CardHeader>
        <StepProgress current={3} />
        <CardTitle>{t('step3.title')}</CardTitle>
        <CardDescription>{t('step3.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>{t('step3.logoLabel')}</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={onPickFile}
          />
          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors ${
              dragActive ? 'border-primary bg-primary/5' : 'border-border bg-muted'
            }`}
          >
            {displayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayUrl}
                alt={t('step3.logoLabel')}
                className="size-20 rounded-lg object-cover"
              />
            ) : uploading ? (
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="size-6 text-muted-foreground" />
            )}
            <p className="text-sm text-muted-foreground">
              {uploading ? t('step3.logoUploading') : t('step3.logoDropHint')}
            </p>
            <p className="text-xs text-muted-foreground">{t('step3.logoFormatsHint')}</p>
          </div>
          {displayUrl && !uploading && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveLogo();
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
              {t('step3.logoRemove')}
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <Label>{t('step3.categoryLabel')}</Label>
          <Select
            value={data.main_category || undefined}
            onValueChange={(val) => onChange({ main_category: val as OnboardingData['main_category'] })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('step3.categoryPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="medicina_estetica">{t('step3.categoryMedicina')}</SelectItem>
              <SelectItem value="cosmetologia_spa">{t('step3.categoryCosmetologia')}</SelectItem>
              <SelectItem value="cejas_pestanas">{t('step3.categoryCejas')}</SelectItem>
              <SelectItem value="salon_belleza">{t('step3.categorySalon')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-between pt-2">
          <Button type="button" variant="outline" onClick={onBack} disabled={finishing}>
            {t('step3.back')}
          </Button>
          <Button
            type="button"
            disabled={!isStep3Valid(data) || uploading || finishing}
            onClick={onFinish}
          >
            {finishing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('step3.finishing')}
              </>
            ) : (
              t('step3.finish')
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
