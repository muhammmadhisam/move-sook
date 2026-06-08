import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none',
  {
    variants: {
      variant: {
        default: 'border-brand-200 bg-brand-50 text-brand-700',
        secondary: 'border-gray-200 bg-gray-50 text-gray-700',
        destructive: 'border-error-200 bg-error-50 text-error-700',
        success: 'border-successScale-200 bg-successScale-50 text-successScale-700',
        warning: 'border-warningScale-200 bg-warningScale-50 text-warningScale-700',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
