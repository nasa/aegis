import type { FieldValidator } from "final-form";

interface FFTextPropsAutomerge {
  name: string;
  ariaLabel: string;
  validators?: FieldValidator<unknown>[];
  className?: string;
}

interface FFTextAreaPropsAutomerge {
  name: string;
  ariaLabel: string;
  validators?: FieldValidator<unknown>[];
  className?: string;
}
