import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil } from "@fortawesome/free-solid-svg-icons";
import { useRef, useEffect, useState } from "react";
import type { FunctionComponent, CSSProperties } from "react";
import formStyles from "./globalFieldsAutomerge.module.css";
import paneStyles from "../../panes/global-pane-styles.module.css";
import { Field, Form, FormSpy } from "react-final-form";
import type { FormApi } from "final-form";
import React from "react";
import { composeValidators } from "components/interface/form/formValidators";
import type { FFTextPropsAutomerge, FFTextAreaPropsAutomerge } from "typings/formAutomerge";
import round from "lodash/round";
import { useAppSelector, refEqual } from "utils/useAppSelector";
import { isConnected } from "store/selectors";

export const ToggleButton: FunctionComponent<{
  toggled: boolean;
  onClick: () => void;
  isDisabled?: boolean;
  label?: string;
  toolTip?: string;
  style?: CSSProperties;
  labelStyle?: CSSProperties;
  toggleAriaLabel?: string;
}> = ({ toggled, onClick, isDisabled, label, toolTip, style, labelStyle, toggleAriaLabel }) => {
  return (
    <div
      className={`${formStyles.toggleButton}`}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={toolTip}
      onClick={() => {
        if (isDisabled) return;
        onClick();
      }}
      style={style}
      aria-label={toggleAriaLabel || "toggle"}
    >
      <div style={labelStyle} className={formStyles.toggleButtonLabel}>
        {label}
      </div>
      <div
        className={`${formStyles.toggleSwitch} ${toggled ? formStyles.toggleSwitchOn : formStyles.toggleSwitchOff}  ${isDisabled ? formStyles.toggleButtonDisabled : ""}`}
      >
        <div className={formStyles.toggleSlider} />
      </div>
    </div>
  );
};

export const CollaborationInputField: FunctionComponent<{
  value: string | null | undefined;
  editMode: boolean;
  fieldProps: FFTextPropsAutomerge;
  styleContainer?: CSSProperties;
  onSubmit: (value: string) => void;
  focusContents?: boolean;
  onChange?: React.ChangeEventHandler;
}> = ({ value, editMode, styleContainer, onSubmit, fieldProps, focusContents, onChange }) => {
  const valueToShow = value || "";

  const dialogRef = useRef<HTMLDialogElement>(null); // Used to control the dialog box (open/close)
  const dialogChildrenRef = useRef<HTMLDivElement>(null); // Used to position the dialog box
  const containerRef = useRef<HTMLDivElement>(null); // Used to position the dialog box
  const inputRef = useRef<HTMLInputElement>(null); // Used to focus the input when dialog opens
  const lastValidValueRef = useRef<string>(valueToShow); // Track last successfully submitted value
  const [isRightAligned, setIsRightAligned] = useState<boolean>(false); // Track if dialog should be right-aligned
  const isOnline = useAppSelector(isConnected, refEqual);

  const setDialogLocation = () => {
    if (!containerRef.current || !dialogChildrenRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();

    // Check if dialog would overflow right edge of viewport
    const wouldOverflow = rect.left + rect.width > window.innerWidth;
    setIsRightAligned(wouldOverflow);

    if (wouldOverflow) {
      // Position dialog right-aligned to match container's right edge
      dialogChildrenRef.current.style.right = `${window.innerWidth - rect.right}px`;
      dialogChildrenRef.current.style.left = "auto";
    } else {
      // Position dialog left-aligned to match container's left edge
      dialogChildrenRef.current.style.left = `${rect.left}px`;
      dialogChildrenRef.current.style.right = "auto";
    }

    dialogChildrenRef.current.style.top = `${rect.top}px`;
    dialogChildrenRef.current.style.width = `${rect.width}px`;
    dialogChildrenRef.current.style.transform = `translateX(0)`;
  };

  // if set to focus the contents, select all text on focus
  const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    if (focusContents) event.target.select();
  };

  useEffect(() => {
    if (focusContents) {
      inputRef.current?.focus();
    }
  }, [focusContents]);

  useEffect(() => {
    if (!isOnline && dialogRef.current?.open) {
      dialogRef.current.close();
    }
  }, [isOnline]);

  return (
    <div
      ref={containerRef}
      style={styleContainer}
      className={`${editMode ? formStyles.dialogContainerEditable : formStyles.dialogContainer}`}
      onClick={(e) => {
        if (!editMode) return;
        e.stopPropagation();
        setDialogLocation();
        dialogRef.current?.showModal();
        lastValidValueRef.current = valueToShow; // Initialize valid value when dialog opens
      }}
    >
      <dialog
        ref={dialogRef}
        className={formStyles.dialog}
        onMouseDown={(e) => {
          // Close if mousedown happens on backdrop (clicking outside dialog content)
          // This prevents closing when user drags text selection from inside to outside
          if (e.target === dialogRef.current) {
            e.stopPropagation();
            dialogRef.current?.close();
          }
        }}
      >
        <div ref={dialogChildrenRef} className={formStyles.dialogWrapper}>
          <Form
            // Form submission is only preformed if all validation passes
            onSubmit={(formValues) => {
              const newValue = formValues[fieldProps.name];
              lastValidValueRef.current = newValue; // Update last valid value on successful submission
              onSubmit(newValue);
            }}
            initialValues={{ [fieldProps.name]: valueToShow }}
            render={({ handleSubmit, form }) => {
              return (
                <form onSubmit={handleSubmit}>
                  <div>
                    <Field
                      name={fieldProps.name}
                      validate={
                        fieldProps.validators
                          ? composeValidators(...fieldProps.validators)
                          : undefined
                      }
                      type="input"
                    >
                      {({ input }) => (
                        <React.Fragment>
                          <input
                            {...input}
                            className={`${formStyles.editField} ${fieldProps.className}`}
                            type="text"
                            aria-label={fieldProps.ariaLabel}
                            style={{ width: "100%", textAlign: isRightAligned ? "right" : "left" }}
                            onChange={(event) => {
                              if (onChange) onChange(event);
                              input.onChange(event); //call native on change
                              form.submit();
                            }}
                            onBlur={(event) => {
                              // Check for validation errors
                              // Reset to last valid value if there are errors
                              const state = form.getState();
                              const hasErrors = !!state.errors?.[fieldProps.name];
                              if (hasErrors) {
                                form.change(fieldProps.name, lastValidValueRef.current);
                              }

                              input.onBlur(event); // call native onBlur
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                            }}
                            onFocus={(event) => {
                              handleFocus(event);
                              input.onFocus(event); // call native onFocus
                            }}
                            ref={inputRef}
                          />
                        </React.Fragment>
                      )}
                    </Field>
                  </div>
                  <div className={formStyles.dialogFooter}>
                    <FormSpy subscription={{ errors: true }}>
                      {({ errors }) => {
                        const fieldError = errors?.[fieldProps.name];
                        // display error messages
                        return fieldError ? (
                          <div className={formStyles.errorMessage}>{fieldError}</div>
                        ) : null;
                      }}
                    </FormSpy>

                    <div className={formStyles.buttonControls}>
                      <div
                        className={formStyles.doneButton}
                        onClick={(e) => {
                          dialogRef.current?.close();
                          e.stopPropagation();
                        }}
                      >
                        Done
                      </div>
                    </div>
                  </div>
                </form>
              );
            }}
          />
        </div>
      </dialog>
      <div className={`${formStyles.labelContainer}`}>
        <div
          className={`${formStyles.inputFieldValue}`}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-html={fieldProps.ariaLabel}
          aria-label={fieldProps.ariaLabel}
        >
          {valueToShow}
        </div>
        {editMode && (
          <div className={formStyles.editPencilWrapper}>
            <FontAwesomeIcon
              icon={faPencil}
              style={{
                fontSize: "0.7rem",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export const CollaborationTextArea: FunctionComponent<{
  value: string | null | undefined;
  editMode: boolean;
  fieldProps: FFTextAreaPropsAutomerge;
  styleContainer?: CSSProperties;
  onSubmit: (value: string) => void;
  focusContents?: boolean;
}> = ({ value, editMode, styleContainer, onSubmit, fieldProps, focusContents }) => {
  const valueToShow = value || "";

  const dialogRef = useRef<HTMLDialogElement>(null); // Used to control the dialog box (open/close)
  const dialogChildrenRef = useRef<HTMLDivElement>(null); // Used to position the dialog box
  const containerRef = useRef<HTMLDivElement>(null); // Used to position the dialog box
  const inputRef = useRef<HTMLTextAreaElement>(null); // Used to focus the textarea when dialog opens
  const lastValidValueRef = useRef<string>(valueToShow); // Track last successfully submitted value
  const isOnline = useAppSelector(isConnected, refEqual);

  const autoResizeTextarea = () => {
    if (!inputRef.current) return;
    const textarea = inputRef.current;
    textarea.style.height = "auto";
    const newHeight = Math.min(textarea.scrollHeight, 300);
    textarea.style.height = `${newHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 300 ? "auto" : "hidden";
  };

  const setDialogLocation = () => {
    if (!containerRef.current || !dialogChildrenRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    dialogChildrenRef.current.style.left = `${rect.left}px`;
    dialogChildrenRef.current.style.top = `${rect.top}px`;
    dialogChildrenRef.current.style.width = `${rect.width}px`;
    dialogChildrenRef.current.style.transform = `translateX(0)`;
  };

  // if set to focus the contents, select all text on focus
  const handleFocus = (event: React.FocusEvent<HTMLTextAreaElement>) => {
    if (focusContents) event.target.select();
  };

  useEffect(() => {
    if (focusContents) {
      inputRef.current?.focus();
    }
  }, [focusContents]);

  useEffect(() => {
    autoResizeTextarea();
  }, [valueToShow]);

  useEffect(() => {
    if (!isOnline && dialogRef.current?.open) {
      dialogRef.current.close();
    }
  }, [isOnline]);

  return (
    <div
      ref={containerRef}
      style={styleContainer}
      className={`${editMode ? formStyles.dialogContainerEditable : formStyles.dialogContainer}`}
      onClick={(e) => {
        if (!editMode) return;
        e.stopPropagation();
        setDialogLocation();
        dialogRef.current?.showModal();
        lastValidValueRef.current = valueToShow; // Initialize valid value when dialog opens
        requestAnimationFrame(() => autoResizeTextarea()); // Resize textarea after dialog is rendered
      }}
    >
      <dialog
        ref={dialogRef}
        className={formStyles.dialog}
        onMouseDown={(e) => {
          // Close if mousedown happens on backdrop (clicking outside dialog content)
          // This prevents closing when user drags text selection from inside to outside
          if (e.target === dialogRef.current) {
            e.stopPropagation();
            dialogRef.current?.close();
          }
        }}
      >
        <div ref={dialogChildrenRef} className={formStyles.dialogWrapper}>
          <Form
            // Form submission is only preformed if all validation passes
            onSubmit={(formValues) => {
              const newValue = formValues[fieldProps.name];
              lastValidValueRef.current = newValue; // Update last valid value on successful submission
              onSubmit(newValue);
            }}
            initialValues={{ [fieldProps.name]: valueToShow }}
            render={({ handleSubmit, form }) => {
              return (
                <form onSubmit={handleSubmit}>
                  <div>
                    <Field
                      name={fieldProps.name}
                      validate={
                        fieldProps.validators
                          ? composeValidators(...fieldProps.validators)
                          : undefined
                      }
                    >
                      {({ input }) => (
                        <React.Fragment>
                          <textarea
                            {...input}
                            className={`${formStyles.textAreaField} ${fieldProps.className}`}
                            aria-label={fieldProps.ariaLabel}
                            style={{
                              width: "100%",
                              minHeight: "60px",
                              resize: "none",
                              boxSizing: "border-box",
                            }}
                            onChange={(event) => {
                              input.onChange(event); //call native on change
                              autoResizeTextarea();
                              form.submit();
                            }}
                            onBlur={(event) => {
                              // Check for validation errors
                              // Reset to last valid value if there are errors
                              const state = form.getState();
                              const hasErrors = !!state.errors?.[fieldProps.name];
                              if (hasErrors) {
                                form.change(fieldProps.name, lastValidValueRef.current);
                              }

                              input.onBlur(event); // call native onBlur
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                            }}
                            onFocus={(event) => {
                              handleFocus(event);
                              input.onFocus(event); // call native onFocus
                            }}
                            ref={inputRef}
                          />
                        </React.Fragment>
                      )}
                    </Field>
                  </div>
                  <div className={formStyles.dialogFooter}>
                    <FormSpy subscription={{ errors: true }}>
                      {({ errors }) => {
                        const fieldError = errors?.[fieldProps.name];
                        // display error messages
                        return fieldError ? (
                          <div className={formStyles.errorMessage}>{fieldError}</div>
                        ) : null;
                      }}
                    </FormSpy>

                    <div className={formStyles.buttonControls}>
                      <div
                        className={formStyles.doneButton}
                        onClick={(e) => {
                          dialogRef.current?.close();
                          e.stopPropagation();
                        }}
                      >
                        Done
                      </div>
                    </div>
                  </div>
                </form>
              );
            }}
          />
        </div>
      </dialog>
      <div className={`${formStyles.labelContainer}`}>
        <div
          className={`${formStyles.textAreaValue}`}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-html={fieldProps.ariaLabel}
          aria-label={fieldProps.ariaLabel}
        >
          {valueToShow}
        </div>
        {editMode && (
          <div className={formStyles.editPencilWrapper}>
            <FontAwesomeIcon
              icon={faPencil}
              style={{
                fontSize: "0.7rem",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export const ValidatedInputField: FunctionComponent<{
  value: string | null | undefined;
  editMode: boolean;
  fieldProps: FFTextPropsAutomerge;
  styleContainer?: CSSProperties;
  onSubmit: (value: string) => void;
  focusContents?: boolean;
  onChange?: React.ChangeEventHandler;
}> = ({ value, editMode, styleContainer, onSubmit, fieldProps, focusContents, onChange }) => {
  const valueToShow = value || "";

  const dialogRef = useRef<HTMLDialogElement>(null); // Used to control the dialog box (open/close)
  const dialogChildrenRef = useRef<HTMLDivElement>(null); // Used to position the dialog box
  const containerRef = useRef<HTMLDivElement>(null); // Used to position the dialog box
  const inputRef = useRef<HTMLInputElement>(null); // Used to focus the input when dialog opens
  const initialValueRef = useRef<string>(valueToShow); // Track last successfully submitted value
  const formApiRef = useRef<FormApi<Record<string, string>> | null>(null); // Access the form outside of the form
  const [isNarrowDialog, setIsNarrowDialog] = useState<boolean>(false); // Track if dialog width is <= 130px
  const [isRightAligned, setIsRightAligned] = useState<boolean>(false); // Track if dialog should be right-aligned
  const isOnline = useAppSelector(isConnected, refEqual);

  const setDialogLocation = () => {
    if (!containerRef.current || !dialogChildrenRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const width = Math.max(160, rect.width);
    setIsNarrowDialog(width <= 160); // Check if we're using the minimum width (meaning container was <= 130px)

    // Check if dialog would overflow right edge of viewport
    const wouldOverflow = rect.left + width > window.innerWidth;
    setIsRightAligned(wouldOverflow);

    if (wouldOverflow) {
      // Position dialog right-aligned to match container's right edge
      dialogChildrenRef.current.style.right = `${window.innerWidth - rect.right}px`;
      dialogChildrenRef.current.style.left = "auto";
    } else {
      // Position dialog left-aligned to match container's left edge
      dialogChildrenRef.current.style.left = `${rect.left}px`;
      dialogChildrenRef.current.style.right = "auto";
    }

    dialogChildrenRef.current.style.top = `${rect.top}px`;
    dialogChildrenRef.current.style.width = `${width}px`;
    dialogChildrenRef.current.style.transform = `translateX(0)`;
  };

  // if set to focus the contents, select all text on focus
  const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    if (focusContents) event.target.select();
  };

  useEffect(() => {
    if (focusContents) {
      inputRef.current?.focus();
    }
  }, [focusContents]);

  return (
    <div
      ref={containerRef}
      style={styleContainer}
      className={`${editMode ? formStyles.dialogContainerEditable : formStyles.dialogContainer}`}
      onClick={(e) => {
        if (!editMode) return;

        // open the dialog for editing
        e.stopPropagation();
        setDialogLocation();
        dialogRef.current?.showModal();
        initialValueRef.current = valueToShow; // Initialize valid value when dialog opens
      }}
    >
      <dialog
        ref={dialogRef}
        className={formStyles.dialog}
        onMouseDown={(e) => {
          // Close if mousedown happens on backdrop (clicking outside dialog content)
          // This prevents closing when user drags text selection from inside to outside
          if (e.target === dialogRef.current) {
            e.stopPropagation();
            dialogRef.current?.close();
            // reset value. it's like clicking cancel.
            formApiRef.current.change(fieldProps.name, initialValueRef.current);
          }
        }}
      >
        <div ref={dialogChildrenRef} className={formStyles.dialogWrapper}>
          <Form
            // Form submission is only preformed if all validation passes
            onSubmit={(formValues) => {
              const newValue = formValues[fieldProps.name];
              onSubmit(newValue);
            }}
            initialValues={{ [fieldProps.name]: valueToShow }}
            render={({ handleSubmit, form }) => {
              formApiRef.current = form;

              return (
                <form onSubmit={handleSubmit}>
                  <div>
                    <Field
                      name={fieldProps.name}
                      validate={
                        fieldProps.validators
                          ? composeValidators(...fieldProps.validators)
                          : undefined
                      }
                      type="input"
                    >
                      {({ input }) => (
                        <React.Fragment>
                          <input
                            {...input}
                            className={`${formStyles.editField} ${fieldProps.className}`}
                            type="text"
                            aria-label={fieldProps.ariaLabel}
                            style={{ width: "100%", textAlign: isRightAligned ? "right" : "left" }}
                            onClick={(event) => {
                              event.stopPropagation();
                            }}
                            onFocus={(event) => {
                              handleFocus(event);
                              input.onFocus(event); // call native onFocus
                            }}
                            onChange={(event) => {
                              if (onChange) onChange(event);
                              input.onChange(event);
                            }}
                            ref={inputRef}
                          />
                        </React.Fragment>
                      )}
                    </Field>
                  </div>
                  <div
                    className={
                      isNarrowDialog ? formStyles.dialogFooterVertical : formStyles.dialogFooter
                    }
                  >
                    <FormSpy subscription={{ errors: true }}>
                      {({ errors }) => {
                        // error messages
                        const hasError = errors?.[fieldProps.name];
                        return (
                          <>
                            {hasError && <div className={formStyles.errorMessage}>{hasError}</div>}
                            <div className={formStyles.buttonControls}>
                              <div
                                className={formStyles.cancelButton}
                                onClick={(e) => {
                                  form.change(fieldProps.name, initialValueRef.current);
                                  dialogRef.current?.close();
                                  e.stopPropagation();
                                }}
                              >
                                Cancel
                              </div>
                              <div
                                className={`${formStyles.saveButton} ${(hasError || !isOnline) && formStyles.saveButtonDisabled}`}
                                onClick={(e) => {
                                  if (hasError || !isOnline) return;
                                  dialogRef.current?.close();
                                  form.submit();
                                  e.stopPropagation();
                                }}
                              >
                                Save
                              </div>
                            </div>
                          </>
                        );
                      }}
                    </FormSpy>
                  </div>
                </form>
              );
            }}
          />
        </div>
      </dialog>
      <div className={`${formStyles.labelContainer}`}>
        <div
          className={`${formStyles.inputFieldValue}`}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-html={fieldProps.ariaLabel}
          aria-label={fieldProps.ariaLabel}
        >
          {valueToShow}
        </div>
        {editMode && (
          <div className={formStyles.editPencilWrapper}>
            <FontAwesomeIcon
              icon={faPencil}
              style={{
                fontSize: "0.7rem",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export const ValidatedTextArea: FunctionComponent<{
  value: string | null | undefined;
  editMode: boolean;
  fieldProps: FFTextAreaPropsAutomerge;
  styleContainer?: CSSProperties;
  onSubmit: (value: string) => void;
  focusContents?: boolean;
}> = ({ value, editMode, styleContainer, onSubmit, fieldProps, focusContents }) => {
  const valueToShow = value || "";

  const dialogRef = useRef<HTMLDialogElement>(null); // Used to control the dialog box (open/close)
  const dialogChildrenRef = useRef<HTMLDivElement>(null); // Used to position the dialog box
  const containerRef = useRef<HTMLDivElement>(null); // Used to position the dialog box
  const inputRef = useRef<HTMLTextAreaElement>(null); // Used to focus the textarea when dialog opens
  const initialValueRef = useRef<string>(valueToShow); // Track last successfully submitted value
  const formApiRef = useRef<FormApi<Record<string, string>> | null>(null); // Access the form outside of the form
  const isOnline = useAppSelector(isConnected, refEqual);

  const autoResizeTextarea = () => {
    if (!inputRef.current) return;
    const textarea = inputRef.current;
    textarea.style.height = "auto";
    const newHeight = Math.min(textarea.scrollHeight, 300);
    textarea.style.height = `${newHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 300 ? "auto" : "hidden";
  };

  const setDialogLocation = () => {
    if (!containerRef.current || !dialogChildrenRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    dialogChildrenRef.current.style.left = `${rect.left}px`;
    dialogChildrenRef.current.style.top = `${rect.top}px`;
    dialogChildrenRef.current.style.width = `${rect.width}px`;
    dialogChildrenRef.current.style.transform = `translateX(0)`;
  };

  // if set to focus the contents, select all text on focus
  const handleFocus = (event: React.FocusEvent<HTMLTextAreaElement>) => {
    if (focusContents) event.target.select();
  };

  useEffect(() => {
    if (focusContents) {
      inputRef.current?.focus();
    }
  }, [focusContents]);

  useEffect(() => {
    autoResizeTextarea();
  }, [valueToShow]);

  return (
    <div
      ref={containerRef}
      style={styleContainer}
      className={`${editMode ? formStyles.dialogContainerEditable : formStyles.dialogContainer}`}
      onClick={(e) => {
        if (!editMode) return;

        e.stopPropagation();
        setDialogLocation();
        dialogRef.current?.showModal();
        initialValueRef.current = valueToShow; // Initialize valid value when dialog opens
        requestAnimationFrame(() => autoResizeTextarea()); // Resize textarea after dialog is rendered
      }}
    >
      <dialog
        ref={dialogRef}
        className={formStyles.dialog}
        onMouseDown={(e) => {
          // Close if mousedown happens on backdrop (clicking outside dialog content)
          // This prevents closing when user drags text selection from inside to outside
          if (e.target === dialogRef.current) {
            e.stopPropagation();
            dialogRef.current?.close();
            // reset value. it's like clicking cancel.
            formApiRef.current.change(fieldProps.name, initialValueRef.current);
          }
        }}
      >
        <div ref={dialogChildrenRef} className={formStyles.dialogWrapper}>
          <Form
            // Form submission is only preformed if all validation passes
            onSubmit={(formValues) => {
              const newValue = formValues[fieldProps.name];
              onSubmit(newValue);
            }}
            initialValues={{ [fieldProps.name]: valueToShow }}
            render={({ handleSubmit, form }) => {
              formApiRef.current = form;

              return (
                <form onSubmit={handleSubmit}>
                  <div>
                    <Field
                      name={fieldProps.name}
                      validate={
                        fieldProps.validators
                          ? composeValidators(...fieldProps.validators)
                          : undefined
                      }
                    >
                      {({ input }) => (
                        <React.Fragment>
                          <textarea
                            {...input}
                            className={`${formStyles.textAreaField} ${fieldProps.className}`}
                            aria-label={fieldProps.ariaLabel}
                            style={{
                              width: "100%",
                              minHeight: "60px",
                              resize: "none",
                              boxSizing: "border-box",
                            }}
                            onChange={(event) => {
                              autoResizeTextarea();
                              input.onChange(event); //call native on change
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                            }}
                            onFocus={(event) => {
                              handleFocus(event);
                              input.onFocus(event); // call native onFocus
                            }}
                            ref={inputRef}
                          />
                        </React.Fragment>
                      )}
                    </Field>
                  </div>
                  <div className={formStyles.dialogFooter}>
                    <FormSpy subscription={{ errors: true }}>
                      {({ errors }) => {
                        const hasError = errors?.[fieldProps.name];
                        // display error messages
                        return (
                          <>
                            {hasError && <div className={formStyles.errorMessage}>{hasError}</div>}
                            <div className={formStyles.buttonControls}>
                              <div
                                className={formStyles.cancelButton}
                                onClick={(e) => {
                                  form.change(fieldProps.name, initialValueRef.current);
                                  dialogRef.current?.close();
                                  e.stopPropagation();
                                }}
                              >
                                Cancel
                              </div>
                              <div
                                className={`${formStyles.saveButton} ${(hasError || !isOnline) && formStyles.saveButtonDisabled}`}
                                onClick={(e) => {
                                  if (hasError || !isOnline) return;
                                  dialogRef.current?.close();
                                  form.submit();
                                  e.stopPropagation();
                                }}
                              >
                                Save
                              </div>
                            </div>
                          </>
                        );
                      }}
                    </FormSpy>
                  </div>
                </form>
              );
            }}
          />
        </div>
      </dialog>
      <div className={`${formStyles.labelContainer}`}>
        <div
          className={`${formStyles.textAreaValue}`}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-html={fieldProps.ariaLabel}
          aria-label={fieldProps.ariaLabel}
        >
          {valueToShow}
        </div>
        {editMode && (
          <div className={formStyles.editPencilWrapper}>
            <FontAwesomeIcon
              icon={faPencil}
              style={{
                fontSize: "0.7rem",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export const ValidatedLatLngField: FunctionComponent<{
  value: AEGISPoint | null | undefined;
  editMode: boolean;
  fieldPropsLat: FFTextPropsAutomerge;
  fieldPropsLng: FFTextPropsAutomerge;
  styleContainer?: CSSProperties;
  onSubmit: (value: AEGISPoint) => void;
}> = ({ value, editMode, styleContainer, onSubmit, fieldPropsLat, fieldPropsLng }) => {
  const dialogRef = useRef<HTMLDialogElement>(null); // Used to control the dialog box (open/close)
  const dialogChildrenRef = useRef<HTMLDivElement>(null); // Used to position the dialog box
  const containerRef = useRef<HTMLDivElement>(null); // Used to position the dialog box
  const initialValueRef = useRef<AEGISPoint>(value); // Track last successfully submitted value
  const formApiRef = useRef<FormApi<Record<string, string>> | null>(null); // Access the form outside of the form
  const isOnline = useAppSelector(isConnected, refEqual);

  const setDialogLocation = () => {
    if (!containerRef.current || !dialogChildrenRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const width = Math.max(130, rect.width);
    dialogChildrenRef.current.style.left = `${rect.left}px`;
    dialogChildrenRef.current.style.top = `${rect.top}px`;
    dialogChildrenRef.current.style.width = `${width}px`;
    dialogChildrenRef.current.style.transform = `translateX(0)`;
  };

  return (
    <div
      ref={containerRef}
      style={styleContainer}
      className={`${editMode ? formStyles.dialogContainerEditable : formStyles.dialogContainer} ${formStyles.latLngDialogContainer}`}
      onClick={(e) => {
        if (!editMode) return;
        e.stopPropagation();
        setDialogLocation();
        dialogRef.current?.showModal();
        initialValueRef.current = value; // Initialize valid value when dialog opens
      }}
    >
      <dialog
        ref={dialogRef}
        className={formStyles.dialog}
        onMouseDown={(e) => {
          // Close if mousedown happens on backdrop (clicking outside dialog content)
          // This prevents closing when user drags text selection from inside to outside
          if (e.target === dialogRef.current) {
            e.stopPropagation();
            dialogRef.current?.close();
            // reset value. it's like clicking cancel.
            formApiRef.current.change(fieldPropsLat.name, initialValueRef.current.lat.toString());
            formApiRef.current.change(fieldPropsLng.name, initialValueRef.current.lng.toString());
          }
        }}
      >
        <div ref={dialogChildrenRef} className={formStyles.dialogWrapper}>
          <Form
            // Form submission is only preformed if all validation passes
            onSubmit={(formValues) => {
              const newValue = {
                lat: parseFloat(formValues[fieldPropsLat.name]),
                lng: parseFloat(formValues[fieldPropsLng.name]),
              };
              onSubmit(newValue);
            }}
            initialValues={{
              [fieldPropsLat.name]: value.lat.toString(),
              [fieldPropsLng.name]: value.lng.toString(),
            }}
            render={({ handleSubmit, form }) => {
              // Store form API for use in dialog onClose handler
              formApiRef.current = form;

              return (
                <form onSubmit={handleSubmit}>
                  <div className={formStyles.latLngInputRow}>
                    <div className={formStyles.latLngLabel}>Lat:</div>
                    <Field
                      name={fieldPropsLat.name}
                      validate={
                        fieldPropsLat.validators
                          ? composeValidators(...fieldPropsLat.validators)
                          : undefined
                      }
                      type="input"
                    >
                      {({ input }) => (
                        <React.Fragment>
                          <input
                            {...input}
                            className={`${formStyles.latLngEditFieldFirstRow} ${fieldPropsLat.className}`}
                            type="text"
                            aria-label={fieldPropsLat.ariaLabel}
                            style={{ width: "100%" }}
                            onClick={(event) => {
                              event.stopPropagation();
                            }}
                          />
                        </React.Fragment>
                      )}
                    </Field>
                  </div>
                  <div className={formStyles.latLngInputRow}>
                    <div className={formStyles.latLngLabel}>Lng:</div>
                    <Field
                      name={fieldPropsLng.name}
                      validate={
                        fieldPropsLng.validators
                          ? composeValidators(...fieldPropsLng.validators)
                          : undefined
                      }
                      type="input"
                    >
                      {({ input }) => (
                        <React.Fragment>
                          <input
                            {...input}
                            className={`${formStyles.latLngEditFieldSecondRow} ${fieldPropsLng.className}`}
                            type="text"
                            aria-label={fieldPropsLng.ariaLabel}
                            style={{ width: "100%" }}
                            onClick={(event) => {
                              event.stopPropagation();
                            }}
                          />
                        </React.Fragment>
                      )}
                    </Field>
                  </div>
                  <div className={formStyles.dialogFooterVertical}>
                    <FormSpy subscription={{ errors: true }}>
                      {({ errors }) => {
                        const fieldErrorLat = errors?.[fieldPropsLat.name];
                        const fieldErrorLng = errors?.[fieldPropsLng.name];

                        // display error messages from both fields
                        const latError = fieldErrorLat;
                        const lngError = fieldErrorLng;
                        const hasErrors = !!fieldErrorLat || !!fieldErrorLng;

                        return (
                          <>
                            {(latError || lngError) && (
                              <div className={formStyles.errorMessage}>
                                {latError && <div>Lat: {latError}</div>}
                                {lngError && <div>Lng: {lngError}</div>}
                              </div>
                            )}
                            <div className={formStyles.buttonControls}>
                              <div
                                className={formStyles.cancelButton}
                                onClick={(e) => {
                                  form.change(
                                    fieldPropsLat.name,
                                    initialValueRef.current.lat.toString()
                                  );
                                  form.change(
                                    fieldPropsLng.name,
                                    initialValueRef.current.lng.toString()
                                  );
                                  dialogRef.current?.close();
                                  e.stopPropagation();
                                }}
                              >
                                Cancel
                              </div>
                              <div
                                className={`${formStyles.saveButton} ${(hasErrors || !isOnline) && formStyles.saveButtonDisabled}`}
                                onClick={(e) => {
                                  if (hasErrors || !isOnline) return;
                                  dialogRef.current?.close();
                                  form.submit();
                                  e.stopPropagation();
                                }}
                              >
                                Save
                              </div>
                            </div>
                          </>
                        );
                      }}
                    </FormSpy>
                  </div>
                </form>
              );
            }}
          />
        </div>
      </dialog>
      <div className={`${formStyles.labelContainer}`}>
        <div>
          <div className={paneStyles.panelColumnTableRow}>
            <div className={paneStyles.panelColumnTableCell}>
              <div className={paneStyles.displayFieldLabel}>Lat:</div>
            </div>
            <div className={paneStyles.panelColumnTableCell}>
              <div className={paneStyles.displayFieldValue}>
                {!value ? (
                  <>Not set</>
                ) : (
                  <div
                    data-tooltip-id="aegis-tooltip"
                    data-tooltip-html={fieldPropsLat.ariaLabel}
                    aria-label={fieldPropsLat.ariaLabel}
                  >
                    {round(value.lat, 6).toString()}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className={paneStyles.panelColumnTableRow}>
            <div className={paneStyles.panelColumnTableCell}>
              <div className={paneStyles.displayFieldLabel}>Lng:</div>
            </div>
            <div className={paneStyles.panelColumnTableCell}>
              <div className={paneStyles.displayFieldValue}>
                {!value ? (
                  <>Not set</>
                ) : (
                  <div
                    data-tooltip-id="aegis-tooltip"
                    data-tooltip-html={fieldPropsLng.ariaLabel}
                    aria-label={fieldPropsLng.ariaLabel}
                  >
                    {round(value.lng, 6).toString()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {editMode && (
          <>
            <div className={formStyles.editPencilWrapper}>
              <FontAwesomeIcon
                icon={faPencil}
                style={{
                  fontSize: "0.7rem",
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
