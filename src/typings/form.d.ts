import type { FieldValidator } from "final-form";

interface label {
  label?: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

interface FFTextProps {
  name: string;
  ariaLabel?: string;
  label?: label | false;
  validators?: FieldValidator<unknown>[];
  style?: React.CSSProperties;
  className?: string;
  classNameError?: string;
  initialValue?: string;
  toFocus?: boolean;
  onChange?: React.ChangeEventHandler;
  onBlur?: React.FocusEventHandler;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement> & { "data-testid"?: string };
  onValueChange?: (value: string) => void;
}

interface FFTextAreaProps {
  name: string;
  ariaLabel?: string;
  label?: label | false;
  validators?: FieldValidator<unknown>[];
  style?: React.CSSProperties;
  className?: string;
  classNameError?: string;
  initialValue?: string;
  onChange?: React.ChangeEventHandler;
  onBlur?: React.FocusEventHandler;
  inputProps?: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { "data-testid"?: string };
  onValueChange?: (value: string) => void;
}
