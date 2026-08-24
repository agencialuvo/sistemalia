"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Page numbers to render, with `null` standing in for an ellipsis. Always
 *  shows the first and last page so a user can jump straight to either end,
 *  plus a small window around the current page. */
function buildPageItems(page: number, totalPages: number): (number | null)[] {
  const items: (number | null)[] = [];
  const window = new Set([1, totalPages, page - 1, page, page + 1]);
  let previous = 0;
  for (let candidate = 1; candidate <= totalPages; candidate++) {
    if (!window.has(candidate) || candidate < 1) continue;
    if (previous && candidate - previous > 1) items.push(null);
    items.push(candidate);
    previous = candidate;
  }
  return items;
}

/**
 * Server-side pagination controls: a page-size selector plus numbered page
 * buttons with ellipsis. Content-agnostic (labels and page sizes are passed
 * in) so /servicios and /personal share one implementation instead of two
 * near-identical copies of the same page-window algorithm.
 */
export function Pagination<PageSize extends number>({
  page,
  totalPages,
  pageSize,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
  perPageLabel,
  previousLabel,
  nextLabel,
}: {
  page: number;
  totalPages: number;
  pageSize: PageSize;
  pageSizeOptions: readonly PageSize[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSize) => void;
  perPageLabel: string;
  previousLabel: string;
  nextLabel: string;
}) {
  const pageItems = useMemo(() => buildPageItems(page, totalPages), [page, totalPages]);

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{perPageLabel}</span>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => value && onPageSizeChange(Number(value) as PageSize)}
        >
          <SelectTrigger className="h-7 w-[4.5rem] text-xs">
            <SelectValue>{(value: string | null) => value ?? String(pageSize)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label={previousLabel}
          >
            <ChevronLeft className="size-4" />
          </Button>

          {pageItems.map((item, index) =>
            item === null ? (
              <span key={`ellipsis-${index}`} className="px-1 text-xs text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={item}
                variant={item === page ? "default" : "outline"}
                size="icon-sm"
                onClick={() => onPageChange(item)}
                aria-current={item === page ? "page" : undefined}
              >
                {item}
              </Button>
            ),
          )}

          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label={nextLabel}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
