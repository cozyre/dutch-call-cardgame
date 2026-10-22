import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/format";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label: string;
  error?: string | null;
  hint?: string;
  className?: string;
}

/**
 * The design's text field (Figma Home 3:79): a raised 52 px field with a
 * 14 px radius, a glaze/28 stroke and a 14 px glaze label above it.
 */
export function TextField({
  label,
  error,
  hint,
  id,
  className,
  ...props
}: TextFieldProps) {
  const fieldId = id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={fieldId} className="text-label text-glaze">
        {label}
      </label>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(
          "h-[52px] w-full rounded-input bg-raised px-[17px] text-body text-tile",
          "border-[1.5px] border-glaze/28 outline-none",
          "placeholder:text-glaze",
          "transition-colors focus:border-tile",
          error && "border-danger",
        )}
        {...props}
      />
      {error ? (
        <p id={`${fieldId}-error`} className="text-caption text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-caption text-glaze">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
