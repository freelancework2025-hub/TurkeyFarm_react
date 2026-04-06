import React, { useState, useCallback, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: string;
  onChange: (value: string) => void;
  /** Allow decimal numbers (default: true) */
  allowDecimals?: boolean;
  /** Allow negative numbers (default: false) */
  allowNegative?: boolean;
  /** Allow arithmetic expressions like "5+2-1" (default: false) */
  allowExpressions?: boolean;
  /** Maximum number of decimal places (default: 2) */
  maxDecimals?: number;
  /** Minimum value (optional) */
  min?: number;
  /** Maximum value (optional) */
  max?: number;
  /** Show validation error styling */
  hasError?: boolean;
  /** Error message to display */
  errorMessage?: string;
}

/**
 * NumericInput component with real-time validation
 * Prevents invalid characters from being entered and provides visual feedback
 */
export const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(
  ({
    value,
    onChange,
    allowDecimals = true,
    allowNegative = false,
    allowExpressions = false,
    maxDecimals = 2,
    min,
    max,
    hasError = false,
    errorMessage,
    className,
    onKeyDown,
    onPaste,
    ...props
  }, ref) => {
    const [localError, setLocalError] = useState<string>("");

    // Validate if character is allowed
    const isValidCharacter = useCallback((char: string, currentValue: string, cursorPosition: number) => {
      // Always allow control characters
      if (char.length !== 1) return true;

      // Allow digits
      if (/\d/.test(char)) return true;

      // Allow decimal point if enabled and not already present
      if (allowDecimals && char === '.') {
        const beforeCursor = currentValue.slice(0, cursorPosition);
        const afterCursor = currentValue.slice(cursorPosition);
        const fullValue = beforeCursor + afterCursor;
        
        // Don't allow multiple decimal points
        if (fullValue.includes('.')) return false;
        
        // Don't allow decimal at start without leading zero
        if (cursorPosition === 0) return false;
        
        return true;
      }

      // Allow minus sign if negative numbers are enabled
      if (allowNegative && char === '-') {
        // Only allow at the beginning
        return cursorPosition === 0 && !currentValue.includes('-');
      }

      // Allow arithmetic operators if expressions are enabled
      if (allowExpressions && /[+\-]/.test(char)) {
        // Don't allow at the beginning (except minus)
        if (cursorPosition === 0 && char !== '-') return false;
        // Don't allow consecutive operators
        const prevChar = currentValue[cursorPosition - 1];
        if (prevChar && /[+\-.]/.test(prevChar)) return false;
        return true;
      }

      return false;
    }, [allowDecimals, allowNegative, allowExpressions]);

    // Validate the complete value
    const validateValue = useCallback((val: string) => {
      if (!val.trim()) {
        setLocalError("");
        return true;
      }

      // Check for valid number format
      if (allowExpressions) {
        // For expressions, we'll validate on blur
        return true;
      }

      const num = parseFloat(val.replace(/[\s\u00A0\u202F]/g, "").replace(",", "."));
      
      if (isNaN(num)) {
        setLocalError("Valeur numérique invalide");
        return false;
      }

      // Check min/max bounds
      if (min !== undefined && num < min) {
        setLocalError(`La valeur doit être supérieure ou égale à ${min}`);
        return false;
      }

      if (max !== undefined && num > max) {
        setLocalError(`La valeur doit être inférieure ou égale à ${max}`);
        return false;
      }

      // Check decimal places
      if (allowDecimals && maxDecimals !== undefined) {
        const decimalPart = val.split('.')[1];
        if (decimalPart && decimalPart.length > maxDecimals) {
          setLocalError(`Maximum ${maxDecimals} décimales autorisées`);
          return false;
        }
      }

      setLocalError("");
      return true;
    }, [allowExpressions, min, max, allowDecimals, maxDecimals]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
      const { key, ctrlKey, metaKey } = e;
      const input = e.currentTarget;
      const cursorPosition = input.selectionStart || 0;

      // Allow control keys
      if (ctrlKey || metaKey || 
          ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) {
        onKeyDown?.(e);
        return;
      }

      // Validate character
      if (!isValidCharacter(key, value, cursorPosition)) {
        e.preventDefault();
        return;
      }

      onKeyDown?.(e);
    }, [value, isValidCharacter, onKeyDown]);

    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
      const pastedText = e.clipboardData.getData('text');
      const input = e.currentTarget;
      const cursorPosition = input.selectionStart || 0;
      const selectionEnd = input.selectionEnd || 0;
      
      // Create the new value after paste
      const beforeSelection = value.slice(0, cursorPosition);
      const afterSelection = value.slice(selectionEnd);
      const newValue = beforeSelection + pastedText + afterSelection;

      // Validate each character in the pasted text
      let isValid = true;
      for (let i = 0; i < pastedText.length; i++) {
        if (!isValidCharacter(pastedText[i], beforeSelection + pastedText.slice(0, i), cursorPosition + i)) {
          isValid = false;
          break;
        }
      }

      if (!isValid) {
        e.preventDefault();
        return;
      }

      onPaste?.(e);
    }, [value, isValidCharacter, onPaste]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      validateValue(newValue);
      onChange(newValue);
    }, [onChange, validateValue]);

    const displayError = hasError || localError;
    const errorText = errorMessage || localError;

    return (
      <div className="relative">
        <input
          ref={ref}
          type="text"
          inputMode={allowDecimals ? "decimal" : "numeric"}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className={cn(
            "bg-transparent border-0 outline-none text-sm w-full",
            displayError && "text-red-600 bg-red-50",
            className
          )}
          {...props}
        />
        {errorText && (
          <div className="absolute top-full left-0 mt-1 text-xs text-red-600 bg-white border border-red-200 rounded px-2 py-1 shadow-sm z-10 whitespace-nowrap">
            {errorText}
          </div>
        )}
      </div>
    );
  }
);

NumericInput.displayName = "NumericInput";