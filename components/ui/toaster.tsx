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
  const { toasts, dismiss } = useToast();

  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, action, icon, duration, ...props }) => {
        // Alert toasts close when their timer bar runs out. Radix's own timer also pauses while the
        // window is unfocused, which left the toast on screen after the bar had ended.
        const timed = Boolean(icon && duration);
        return (
          <Toast key={id} {...props} duration={timed ? Infinity : duration}>
            <div className="flex min-w-0 items-start gap-3">
              {icon}
              <div className="grid min-w-0 gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && <ToastDescription>{description}</ToastDescription>}
              </div>
            </div>
            {action}
            <ToastClose />
            {/* Time left before the toast hides; stops while hovered. */}
            {timed && (
              <span
                aria-hidden
                className="absolute bottom-0 left-0 !ml-0 h-0.5 w-full origin-left animate-[toast-timer_linear_forwards] bg-text-muted/40 group-hover:[animation-play-state:paused]"
                style={{ animationDuration: `${duration}ms` }}
                onAnimationEnd={() => dismiss(id)}
              />
            )}
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
