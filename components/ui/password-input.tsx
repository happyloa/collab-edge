'use client';

import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState, type ComponentProps } from 'react';
import { useI18n } from './i18n';

export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<ComponentProps<'input'>, 'type'>
>(function PasswordInput({ className = '', ...props }, ref) {
  const [visible, setVisible] = useState(false);
  const { t } = useI18n();

  return (
    <div className="relative">
      <input
        {...props}
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={`pr-12 ${className}`}
      />
      <button
        type="button"
        aria-label={t(visible ? 'Hide password' : 'Show password')}
        aria-pressed={visible}
        className="absolute inset-y-1 right-1 flex min-w-10 items-center justify-center rounded-md text-muted transition-colors hover:text-foreground"
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? (
          <EyeOff aria-hidden="true" className="size-4" />
        ) : (
          <Eye aria-hidden="true" className="size-4" />
        )}
      </button>
    </div>
  );
});
