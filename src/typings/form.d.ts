import { FieldValidator } from "final-form";

interface label {
  label?: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

interface option {
  value: string;
  label: string;
}

interface FFSelectProps {
  name: string;
  options: option[];
  label?: label | false;
  className?: string;
  searchable?: boolean;
}

interface FFCheckboxProps {
  name: string;
  label?: label | false;
  className?: string;
  validators?: FieldValidator<unknown>[];
  style?: React.CSSProperties;
  initialValue?: boolean;
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
}
