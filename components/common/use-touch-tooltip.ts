'use client';

import { useState } from 'react';

/**
 * Recharts keeps a tooltip open after a touch ends, so on phones it hangs over the page while
 * scrolling. Spread `handlers` on the chart wrapper and pass `active` to <Tooltip>: the tooltip
 * follows the finger and closes when it lifts; mouse hover is unchanged.
 */
export function useTouchTooltip() {
  const [hidden, setHidden] = useState(false);
  return {
    active: hidden ? false : undefined,
    handlers: {
      onTouchStart: () => setHidden(false),
      onTouchEnd: () => setHidden(true),
      onTouchCancel: () => setHidden(true),
      onMouseMove: () => {
        if (hidden) setHidden(false);
      },
    },
  };
}
