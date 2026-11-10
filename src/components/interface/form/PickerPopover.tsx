import type { FunctionComponent, ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";
import styles from "./globalFields.module.css";

/** Nonmodal top-layer picker, unaffected by scrolling or transformed panel ancestors. */
export const PickerPopover: FunctionComponent<{
  anchor: HTMLElement;
  onClose: () => void;
  direction?: "left" | "right";
  children: ReactNode;
}> = ({ anchor, onClose, direction = "right", children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const picker = ref.current!;
    const position = () => {
      const target = anchor.getBoundingClientRect();
      const bounds = picker.getBoundingClientRect();
      const left = direction === "left" ? target.right - bounds.width : target.left;
      const top =
        target.bottom + bounds.height + 4 > window.innerHeight - 8
          ? target.top - bounds.height - 4
          : target.bottom + 4;
      picker.style.left = `${Math.max(8, Math.min(left, window.innerWidth - bounds.width - 8))}px`;
      picker.style.top = `${Math.max(8, Math.min(top, window.innerHeight - bounds.height - 8))}px`;
    };
    const onToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === "closed") onClose();
    };
    picker.setAttribute("popover", "auto");
    picker.addEventListener("toggle", onToggle);
    picker.showPopover();
    position();
    // EmojiPicker fills its custom element after mounting.
    const observer = new ResizeObserver(position);
    observer.observe(picker);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      observer.disconnect();
      picker.removeEventListener("toggle", onToggle);
      picker.hidePopover();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [anchor, direction, onClose]);
  return (
    <div ref={ref} className={styles.pickerPopover}>
      {children}
    </div>
  );
};
