"use client";

import { Button as BaseButton } from "@base-ui/react/button";
import { Checkbox } from "@base-ui/react/checkbox";
import { Dialog } from "@base-ui/react/dialog";
import { Select } from "@base-ui/react/select";
import {
  CaretDownIcon,
  CheckIcon,
  CircleNotchIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { css, cva, cx } from "@styled-system/css";
import { type ComponentProps, type ReactNode, useId } from "react";

export const buttonStyle = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    borderRadius: "7px",
    fontSize: "12px",
    fontWeight: "550",
    whiteSpace: "nowrap",
    transition: "background 150ms, color 150ms, border-color 150ms",
    flexShrink: 0,
    _disabled: { opacity: 0.45, cursor: "not-allowed" },
  },
  variants: {
    variant: {
      primary: {
        bg: "accent",
        color: "#192211",
        border: "1px solid transparent",
        _hover: { bg: "#d4fa9a" },
      },
      secondary: {
        bg: "surface",
        border: "1px solid token(colors.line)",
        color: "ink",
        _hover: { bg: "elevated", borderColor: "#444d40" },
      },
      ghost: {
        color: "muted",
        border: "1px solid transparent",
        _hover: { bg: "elevated", color: "ink" },
      },
      danger: {
        bg: "#372323",
        color: "negative",
        border: "1px solid #553535",
        _hover: { bg: "#4a2c2c" },
      },
    },
    size: {
      sm: { height: "30px", px: "10px" },
      md: { height: "36px", px: "13px" },
      lg: { height: "42px", px: "17px", fontSize: "13px" },
      icon: { width: "34px", height: "34px", p: 0 },
    },
  },
  defaultVariants: { variant: "secondary", size: "md" },
});

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof BaseButton> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
}) {
  return (
    <BaseButton
      className={cx(
        buttonStyle({ variant, size }),
        typeof className === "string" ? className : undefined,
      )}
      {...props}
    />
  );
}

export const inputStyle = css({
  width: "100%",
  height: "41px",
  px: "12px",
  bg: "canvas",
  border: "1px solid token(colors.line)",
  borderRadius: "7px",
  fontSize: "13px",
  color: "ink",
  outline: "none",
  _placeholder: { color: "subtle" },
  _focus: { borderColor: "accent", boxShadow: "0 0 0 2px #c5f27712" },
});
export const labelStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  color: "#d3d8d0",
  fontSize: "12px",
  fontWeight: "500",
});
export const mutedStyle = css({
  color: "muted",
  fontSize: "13px",
  lineHeight: "1.7",
});
export const panelStyle = css({
  border: "1px solid token(colors.line)",
  borderRadius: "10px",
  bg: "surface",
});

export function Spinner({ size = 17 }: { size?: number }) {
  return (
    <CircleNotchIcon
      size={size}
      aria-label="Loading"
      className={css({ animation: "spin 1s linear infinite" })}
    />
  );
}

export function SelectField({
  value,
  onChange,
  options,
  label,
  compact = false,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <Select.Root
      disabled={disabled}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
      items={options}
    >
      <Select.Trigger
        aria-label={label}
        className={cx(
          buttonStyle({ variant: "secondary" }),
          css({
            minWidth: "0",
            width: compact ? "auto" : "100%",
            justifyContent: "space-between",
            gap: "16px",
            fontSize: "12px",
            fontWeight: "400",
          }),
        )}
      >
        <Select.Value />
        <Select.Icon>
          <CaretDownIcon size={12} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={6} className={css({ zIndex: 100 })}>
          <Select.Popup
            className={css({
              bg: "#20251f",
              border: "1px solid #3a4236",
              borderRadius: "8px",
              padding: "5px",
              boxShadow: "0 12px 40px #0006",
              minWidth: "var(--anchor-width)",
              maxHeight: "min(320px, var(--available-height))",
              overflowY: "auto",
            })}
          >
            <Select.List>
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className={css({
                    px: "10px",
                    py: "9px",
                    fontSize: "12px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "24px",
                    outline: "none",
                    _highlighted: { bg: "#35402b", color: "accent" },
                  })}
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator>
                    <CheckIcon size={13} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

export function CheckField({
  checked,
  onChange,
  children,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "10px",
        cursor: "pointer",
        fontSize: "12px",
        lineHeight: "1.6",
      })}
    >
      <Checkbox.Root
        id={id}
        disabled={disabled}
        checked={checked}
        onCheckedChange={onChange}
        className={css({
          width: "17px",
          height: "17px",
          border: "1px solid #495044",
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          _checked: { bg: "accent", color: "#17200f", borderColor: "accent" },
        })}
      >
        <Checkbox.Indicator>
          <CheckIcon size={12} weight="bold" />
        </Checkbox.Indicator>
      </Checkbox.Root>
      {children}
    </label>
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop
          className={css({
            position: "fixed",
            inset: 0,
            bg: "#030603b8",
            backdropFilter: "blur(7px)",
            zIndex: 60,
            transition: "opacity 180ms",
            _startingStyle: { opacity: 0 },
            _endingStyle: { opacity: 0 },
          })}
        />
        <Dialog.Viewport
          className={css({
            position: "fixed",
            inset: 0,
            zIndex: 61,
            overflowY: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: { base: "12px", md: "32px" },
          })}
        >
          <Dialog.Popup
            className={css({
              width: "100%",
              maxWidth: wide ? "800px" : "540px",
              maxHeight: "calc(100dvh - 40px)",
              overflowY: "auto",
              bg: "#181c18",
              border: "1px solid #363e32",
              borderRadius: "14px",
              boxShadow: "0 24px 100px #0008",
              p: { base: "20px", md: "28px" },
              outline: "none",
              transition: "opacity 180ms, transform 180ms",
              _startingStyle: {
                opacity: 0,
                transform: "translateY(8px) scale(.98)",
              },
              _endingStyle: {
                opacity: 0,
                transform: "translateY(8px) scale(.98)",
              },
            })}
          >
            <div
              className={css({
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "16px",
                mb: "22px",
              })}
            >
              <div>
                <Dialog.Title
                  className={css({
                    fontSize: "21px",
                    fontWeight: "600",
                    letterSpacing: "-.5px",
                  })}
                >
                  {title}
                </Dialog.Title>
                {description && (
                  <Dialog.Description
                    className={cx(
                      mutedStyle,
                      css({ mt: "6px", maxWidth: "590px" }),
                    )}
                  >
                    {description}
                  </Dialog.Description>
                )}
              </div>
              <Dialog.Close
                aria-label="Close dialog"
                className={buttonStyle({ variant: "ghost", size: "icon" })}
              >
                <XIcon size={19} />
              </Dialog.Close>
            </div>
            {children}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={css({
        display: "flex",
        gap: "10px",
        alignItems: "flex-start",
        padding: "12px 14px",
        border: "1px solid",
        borderColor: error ? "#633a35" : "#3c4730",
        bg: error ? "#30211f" : "#222a1c",
        color: error ? "negative" : "#bfcea9",
        borderRadius: "7px",
        fontSize: "12px",
        lineHeight: "1.6",
      })}
    >
      <WarningCircleIcon
        size={17}
        className={css({ flexShrink: 0, mt: "1px" })}
      />
      {children}
    </div>
  );
}
