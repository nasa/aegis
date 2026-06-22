import type { FieldValidator } from "final-form";

interface FFTextPropsAutomerge {
  name: string;
  ariaLabel: string;
  validators?: FieldValidator<unknown>[];
  className?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}

interface FFTextAreaPropsAutomerge {
  name: string;
  ariaLabel: string;
  validators?: FieldValidator<unknown>[];
  className?: string;
}
