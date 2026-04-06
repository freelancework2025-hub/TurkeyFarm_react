import React, { useState, useCallback, forwardRef } from "react";
import { NumericInput } from "./NumericInput";
import { resolvedQteFromString } from "@/lib/depensesDiversShared";
import { formatGroupedNumber, toOptionalNumber } from "@/lib/formatResumeAmount";

interface QuantityInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: string;
  onChange: (value: string) => void;
  /** Show formatted display when not focused */
  showFormattedDisplay?: boolean;
  /** Is the input currently focused */
  isFocused?: boolean;
  /** Callback when focus changes */
  onFocusChange?: (focused: boolean) => void;
  /** Show validation error styling */
  hasError?: boolean;
  /** Error message to display */
  errorMessage?: string;
}

/**
 * QuantityInput component that supports arithmetic expressions like "5+2-1"
 * Shows formatted display when not focused, raw input when focused
 */
export const QuantityInput = forwardRef<HTMLInputElement, QuantityInputProps>(
  ({
    value,
    onChange,
    showFormattedDisplay = true,
    isFocused = false,
    onFocusChange,
    hasError = false,
    errorMessage,
    onFocus,
    onBlur,
    ...props
  }, ref) => {
    const [localError, setLocalError] = useState<string>("");

    const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
      onFocusChange?.(true);
      onFocus?.(e);
    }, [onFocusChange, onFocus]);

    const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
      const rawValue = e.target.value.trim();
      
      if (rawValue === "") {
        onChange("");
        setLocalError("");
        onFocusChange?.(false);
        onBlur?.(e);
        return;
      }

      // Validate and resolve the expression
      const resolvedValue = resolvedQteFromString(rawValue);
      
      if (resolvedValue == null || !Number.isFinite(resolvedValue)) {
        setLocalError("Expression invalide");
        onFocusChange?.(false);
        onBlur?.(e);
        return;
      }

      if (resolvedValue < 0) {
        setLocalError("La quantité ne peut pas être négative");
        onFocusChange?.(false);
        onBlur?.(e);
        return;
      }

      // Update with the resolved value
      onChange(resolvedValue.toFixed(2));
      setLocalError("");
      onFocusChange?.(false);
      onBlur?.(e);
    }, [onChange, onFocusChange, onBlur]);

    // Display value: raw when focused, formatted when not focused
    const displayValue = isFocused 
      ? value 
      : showFormattedDisplay && toOptionalNumber(value) != null
        ? formatGroupedNumber(toOptionalNumber(value)!, 2)
        : value;

    const displayError = hasError || localError;
    const errorText = errorMessage || localError;

    return (
      <NumericInput
        ref={ref}
        value={displayValue}
        onChange={onChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        allowDecimals={true}
        allowNegative={false}
        allowExpressions={true}
        maxDecimals={2}
        min={0}
        hasError={displayError}
        errorMessage={errorText}
        {...props}
      />
    );
  }
);

QuantityInput.displayName = "QuantityInput";