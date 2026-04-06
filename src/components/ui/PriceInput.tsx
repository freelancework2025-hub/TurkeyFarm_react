import React, { forwardRef } from "react";
import { NumericInput } from "./NumericInput";

interface PriceInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: string;
  onChange: (value: string) => void;
  /** Currency symbol to display (optional) */
  currency?: string;
  /** Show validation error styling */
  hasError?: boolean;
  /** Error message to display */
  errorMessage?: string;
}

/**
 * PriceInput component for monetary values
 * Only allows positive numbers with up to 2 decimal places
 */
export const PriceInput = forwardRef<HTMLInputElement, PriceInputProps>(
  ({
    value,
    onChange,
    currency,
    hasError = false,
    errorMessage,
    ...props
  }, ref) => {
    return (
      <div className="relative">
        <NumericInput
          ref={ref}
          value={value}
          onChange={onChange}
          allowDecimals={true}
          allowNegative={false}
          allowExpressions={false}
          maxDecimals={2}
          min={0}
          hasError={hasError}
          errorMessage={errorMessage}
          {...props}
        />
        {currency && (
          <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {currency}
          </span>
        )}
      </div>
    );
  }
);

PriceInput.displayName = "PriceInput";