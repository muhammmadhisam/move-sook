import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../lib/utils';

export interface CheckboxProps
  extends Omit<React.ComponentProps<'button'>, 'onChange'> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

// Dependency-free checkbox (no @radix-ui/react-checkbox). Renders a button with
// role="checkbox" so it stays keyboard- and screen-reader-accessible.
const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, checked = false, onCheckedChange, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange?.(!checked)}
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-input shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50',
          checked && 'border-primary bg-primary text-primary-foreground',
          className,
        )}
        {...props}
      >
        {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </button>
    );
  },
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
