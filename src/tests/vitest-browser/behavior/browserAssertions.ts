import type { Locator } from "vitest/browser";

export function exactText(value: string): RegExp {
  const normalized = value.trim().replace(/\s+/g, " ");
  return new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}

export function isVisible(locator: Locator): boolean {
  const element = locator.query();
  if (!element?.checkVisibility({ visibilityProperty: true })) return false;
  const bounds = element.getBoundingClientRect();
  return bounds.width > 0 && bounds.height > 0;
}
