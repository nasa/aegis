// The published declarations reference unshipped internal modules.
// Describe only the official web component API used by our React adapter.
declare module "emoji-mart" {
  export class Picker extends HTMLElement {
    constructor(options: Record<string, unknown>);
    update(options: Record<string, unknown>): void;
  }
}
