import React, { type ComponentPropsWithoutRef, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

export interface ShimmerButtonProps extends ComponentPropsWithoutRef<"button"> {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
  className?: string;
  children?: React.ReactNode;
}

export const ShimmerButton = React.forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  (
    {
      shimmerColor = "#ffffff",
      shimmerSize = "0.05em",
      shimmerDuration = "3s",
      borderRadius = "100px",
      background = "hsl(var(--primary))",
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        style={
          {
            "--spread": "90deg",
            "--shimmer-color": shimmerColor,
            "--radius": borderRadius,
            "--speed": shimmerDuration,
            "--cut": shimmerSize,
            "--bg": background,
          } as CSSProperties
        }
        className={cn(
          "group relative z-0 flex cursor-pointer items-center justify-center overflow-hidden rounded-lg px-4 py-2 [border-radius:var(--radius)] [background:var(--bg)]",
          "border border-primary/30 text-primary-foreground",
          "transform-gpu transition-all duration-300 ease-in-out hover:opacity-90 active:translate-y-px",
          className
        )}
        ref={ref}
        {...props}
      >
        <div className={cn("-z-30 blur-[2px] absolute inset-0 overflow-visible")}>
          <div className="animate-shimmer-slide absolute inset-0 aspect-square h-full min-h-[200%] w-full min-w-[200%] -translate-x-1/2 -translate-y-1/2 rounded-none">
            <div
              className="absolute -inset-full w-auto rotate-0 opacity-30"
              style={{
                background: `conic-gradient(from 225deg, transparent 0deg, var(--shimmer-color) 90deg, transparent 180deg)`,
              }}
            />
          </div>
        </div>
        {children}
      </button>
    );
  }
);
ShimmerButton.displayName = "ShimmerButton";
