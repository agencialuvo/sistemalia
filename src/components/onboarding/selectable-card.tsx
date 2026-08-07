'use client';

import { cn } from '@/lib/utils';

// Plain toggle-button "card", same proven shape as the KindTab
// pattern in quick-replies-manager.tsx — avoids pulling in the
// radio-group primitive (unused elsewhere in this codebase, so its
// interaction behavior is unverified here) for what's functionally a
// single-select toggle.
export function SelectableCard({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex-1 rounded-lg border px-4 py-3 text-left text-sm transition-colors',
        active
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border bg-muted text-muted-foreground hover:text-foreground',
      )}
    >
      <span className="block font-medium">{title}</span>
      {description && (
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      )}
    </button>
  );
}
