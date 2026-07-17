/**
 * Tiny React harness for vitest-browser tests that need to mount components.
 *
 * Avoids `import { act } from "react"` because it triggers a "two React copies"
 * hook-null-deref under vitest-browser's optimizeDeps prebundling. `flushSync`
 * from react-dom is safe.
 */

import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import type { ReactNode } from "react";

export interface ReactHarness {
  container: HTMLDivElement;
  root: Root;
  render: (node: ReactNode) => void;
  unmount: () => void;
}

export function createReactHarness(): ReactHarness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  return {
    container,
    root,
    render: (node) => {
      flushSync(() => root.render(node));
    },
    unmount: () => {
      flushSync(() => root.unmount());
      container.remove();
    },
  };
}
