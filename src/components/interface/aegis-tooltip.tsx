import type { ComponentProps } from "react";
import { useEffect, useRef } from "react";
import { Tooltip } from "react-tooltip";

import aegisTooltipStyles from "styles/aegis-tooltip.module.css";

/**
 * react-tooltip hides an open tooltip the moment its anchor element leaves the
 * document, and only shows it again on the next `mouseover`. Live views replace
 * anchor nodes while the pointer sits still — on the dashboard a position row
 * moves between the "Latest" and "Older" table groups, and React has to destroy
 * and recreate the row because it cannot move DOM between parents. The pointer
 * never moves, so no new `mouseover` arrives and the tooltip stays hidden until
 * the user jiggles the mouse, which reads as flickering on and off.
 *
 * Watch for the hovered anchor being disconnected and hand react-tooltip the
 * replacement that is now under the pointer, so the tooltip survives the swap.
 * The event is dispatched only on an actual replacement; re-announcing the same
 * anchor would restart `delayShow` and could keep the tooltip from ever opening.
 */
const AegisTooltip = ({
  id,
  className = aegisTooltipStyles.tooltip,
  ...tooltipProps
}: ComponentProps<typeof Tooltip>): JSX.Element => {
  const hoveredAnchorRef = useRef<Element | null>(null);
  // Where to look for the replacement: the live pointer when the browser has
  // reported one, otherwise the centre of the anchor as it was last laid out.
  const probePointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!id) return undefined;

    const anchorSelector = `[data-tooltip-id="${CSS.escape(id)}"]`;
    const anchorFor = (target: EventTarget | null): Element | null =>
      target instanceof Element ? target.closest(anchorSelector) : null;

    const rememberAnchorCentre = (anchor: Element) => {
      const rect = anchor.getBoundingClientRect();
      if (rect.width || rect.height)
        probePointRef.current = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.clientX || event.clientY)
        probePointRef.current = { x: event.clientX, y: event.clientY };
    };
    const onMouseOver = (event: MouseEvent) => {
      const anchor = anchorFor(event.target);
      hoveredAnchorRef.current = anchor;
      if (anchor) rememberAnchorCentre(anchor);
    };
    const onMouseOut = (event: MouseEvent) => {
      if (anchorFor(event.target) === hoveredAnchorRef.current) hoveredAnchorRef.current = null;
    };

    const observer = new MutationObserver(() => {
      const hovered = hoveredAnchorRef.current;
      if (!hovered) return;
      if (hovered.isConnected) {
        // Keep the fallback probe point following the anchor as it is laid out.
        rememberAnchorCentre(hovered);
        return;
      }

      const probe = probePointRef.current;
      if (!probe) return;
      const replacement = anchorFor(document.elementFromPoint(probe.x, probe.y));
      hoveredAnchorRef.current = replacement;
      if (!replacement) return;

      replacement.dispatchEvent(
        new MouseEvent("mouseover", {
          bubbles: true,
          cancelable: true,
          clientX: probe.x,
          clientY: probe.y,
          relatedTarget: document.body,
        })
      );
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("pointermove", onPointerMove, { passive: true, capture: true });
    document.addEventListener("mouseover", onMouseOver, true);
    document.addEventListener("mouseout", onMouseOut, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("mouseover", onMouseOver, true);
      document.removeEventListener("mouseout", onMouseOut, true);
      hoveredAnchorRef.current = null;
      probePointRef.current = null;
    };
  }, [id]);

  return <Tooltip id={id} className={className} {...tooltipProps} />;
};

export default AegisTooltip;
