import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/format";

type ButtonVariant = "primary" | "secondary" | "ghost" | "accent";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  children: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-oranje text-ink hover:brightness-105 active:brightness-95",
  secondary: "border-[1.5px] border-tile text-tile hover:bg-tile/5",
  ghost: "text-glaze hover:text-tile",
  accent:
    "border-[1.5px] border-oranje text-oranje hover:bg-oranje/10 active:bg-oranje/20",
};

/**
 * The design's Button component (Figma `Component bench` 2:172):
 * Primary / Secondary / Ghost, 52 px tall, pill radius.
 */
export function Button({
  variant = "primary",
  fullWidth = false,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-[52px] items-center justify-center rounded-pill px-6 text-body font-medium",
        "transition-[filter,background-color,opacity] duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oranje",
        "disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
