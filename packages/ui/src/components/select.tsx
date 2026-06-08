'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-10 w-full items-center justify-between whitespace-nowrap rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground shadow-xs focus:border-ring focus:outline-none focus:ring-4 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

// Recursively pull display text out of a child node so we can filter by it.
function nodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(' ');
  if (React.isValidElement(node)) {
    return nodeText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

type SelectContentProps = React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
  /** Force the search box on/off. Defaults to auto (on when there are many options). */
  searchable?: boolean;
  searchPlaceholder?: string;
};

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  SelectContentProps
>(
  (
    { className, children, position = 'popper', searchable, searchPlaceholder = 'ค้นหา…', ...props },
    ref,
  ) => {
    const [query, setQuery] = React.useState('');
    const inputRef = React.useRef<HTMLInputElement>(null);

    const items = React.Children.toArray(children);
    // Auto-enable search once a list is long enough to be worth filtering.
    const enabled = searchable ?? items.length > 6;

    // Grab focus on open so the user can type immediately (Radix focuses an item otherwise).
    React.useEffect(() => {
      if (!enabled) return;
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }, [enabled]);

    const q = query.trim().toLowerCase();
    const visible =
      !enabled || q === ''
        ? items
        : items.filter((child) =>
            React.isValidElement(child) ? nodeText(child).toLowerCase().includes(q) : true,
          );

    return (
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          ref={ref}
          className={cn(
            'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg',
            position === 'popper' && 'data-[side=bottom]:translate-y-1',
            className,
          )}
          position={position}
          {...props}
        >
          {enabled && (
            <div className="sticky top-0 z-10 border-b bg-popover p-1">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                // Let Escape bubble (closes the menu); swallow the rest so Radix
                // typeahead doesn't steal keystrokes from this input.
                onKeyDown={(e) => {
                  if (e.key !== 'Escape') e.stopPropagation();
                }}
                placeholder={searchPlaceholder}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/20"
              />
            </div>
          )}
          <SelectPrimitive.Viewport className="p-1">
            {visible.length > 0 ? (
              visible
            ) : (
              <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                ไม่พบตัวเลือก
              </div>
            )}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    );
  },
);
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem };
