'use client';

import type { ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/** Shared help affordance: match the icon, hover behavior, and content surface across the app. */
export default function InfoTooltip({ label, children, contentClassName = '' }: { label: string; children: ReactNode; contentClassName?: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="metric-icon info-tooltip-trigger" aria-label={label}>
            <CircleHelp size={18} aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className={`factor-help ${contentClassName}`.trim()}>{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
