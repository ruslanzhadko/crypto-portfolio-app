'use client';

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, action, icon, ...props }) => (
        <Toast key={id} {...props}>
          <div className="flex min-w-0 items-start gap-3">
            {icon}
            <div className="grid min-w-0 gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
          </div>
          {action}
          <ToastClose />
          {/* Time left before the toast hides; stops while hovered, as the toast itself does. */}
          {icon && props.duration && (
            <span
              aria-hidden
              className="absolute bottom-0 left-0 !ml-0 h-0.5 w-full origin-left animate-[toast-timer_linear_forwards] bg-text-muted/40 group-hover:[animation-play-state:paused]"
              style={{ animationDuration: `${props.duration}ms` }}
            />
          )}
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
