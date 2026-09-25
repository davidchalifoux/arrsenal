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
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "500",
    whiteSpace: "nowrap",
    transition: "background 150ms, color 150ms, border-color 150ms",
    flexShrink: 0,
    _disabled: { opacity: 0.45, cursor: "not-allowed" },
  },
  variants: {
    variant: {
      primary: {
        bg: "accent",
        color: "onAccent",
        fontWeight: "600",
        border: "1px solid transparent",
        _hover: { filter: "brightness(1.08)" },
      },
      secondary: {
        bg: "elevated",
        border: "1px solid token(colors.lineStrong)",
        color: "ink",
        _hover: {
          bg: "color-mix(in srgb, var(--elevated) 70%, var(--ink) 8%)",
        },
      },
      ghost: {
        color: "soft",
        border: "1px solid transparent",
        _hover: { bg: "elevated", color: "ink" },
      },
      danger: {
        bg: "color-mix(in srgb, var(--negative) 12%, transparent)",
        color: "negative",
        border:
          "1px solid color-mix(in srgb, var(--negative) 32%, transparent)",
        _hover: { bg: "color-mix(in srgb, var(--negative) 20%, transparent)" },
      },
    },
    size: {
      sm: { height: "30px", px: "10px", fontSize: "12px" },
      md: { height: "36px", px: "14px" },
      lg: { height: "42px", px: "18px", fontSize: "14px" },
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
  height: "40px",
  px: "12px",
  bg: "canvas",
  border: "1px solid token(colors.lineStrong)",
  borderRadius: "9px",
  fontSize: "14px",
  color: "ink",
  outline: "none",
  _placeholder: { color: "subtle" },
  _focus: {
    borderColor: "accent",
    boxShadow: "0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent)",
  },
});
export const labelStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  color: "soft",
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
  borderRadius: "14px",
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
        className={css(buttonStyle.raw({ variant: "secondary", size: "md" }), {
          minWidth: "0",
          width: compact ? "auto" : "100%",
          justifyContent: "space-between",
          gap: "12px",
          px: "12px",
          fontSize: "13px",
          fontWeight: "400",
          textAlign: "left",
        })}
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
              bg: "raised",
              border: "1px solid token(colors.lineStrong)",
              borderRadius: "10px",
              padding: "5px",
              boxShadow: "0 16px 48px -12px #000a",
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
                    py: "8px",
                    fontSize: "13px",
                    borderRadius: "7px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "24px",
                    outline: "none",
                    _highlighted: { bg: "elevated", color: "ink" },
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
          border: "1px solid token(colors.lineStrong)",
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          _checked: { bg: "accent", color: "onAccent", borderColor: "accent" },
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
  initialFocus,
  command = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
  initialFocus?: ComponentProps<typeof Dialog.Popup>["initialFocus"];
  command?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop
          className={css({
            position: "fixed",
            inset: 0,
            bg: "scrim",
            backdropFilter: "blur(4px)",
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
            alignItems: command ? "flex-start" : "center",
            justifyContent: "center",
            px: { base: "12px", md: "32px" },
            pb: { base: "12px", md: "32px" },
            pt: command ? "min(15dvh, 120px)" : { base: "12px", md: "32px" },
          })}
        >
          <Dialog.Popup
            initialFocus={initialFocus}
            className={css({
              width: "100%",
              maxWidth: command ? "720px" : wide ? "800px" : "540px",
              maxHeight: command ? "calc(85dvh - 24px)" : "calc(100dvh - 40px)",
              overflowY: "auto",
              bg: "surface",
              border: "1px solid token(colors.lineStrong)",
              borderRadius: "16px",
              boxShadow: "0 40px 80px -20px #000c",
              p: command ? "16px 16px 0" : { base: "20px", md: "28px" },
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
                mb: command ? "12px" : "22px",
              })}
            >
              <div>
                <Dialog.Title
                  className={css({
                    fontSize: command ? "14px" : "18px",
                    fontWeight: "600",
                    letterSpacing: "-.3px",
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
        borderColor: error
          ? "color-mix(in srgb, var(--negative) 32%, transparent)"
          : "line",
        bg: error
          ? "color-mix(in srgb, var(--negative) 10%, transparent)"
          : "raised",
        color: error ? "negative" : "soft",
        borderRadius: "10px",
        fontSize: "13px",
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

export const menuPopupStyle = css({
  minWidth: "220px",
  maxHeight: "min(420px, var(--available-height))",
  overflowY: "auto",
  p: "6px",
  bg: "raised",
  border: "1px solid token(colors.lineStrong)",
  borderRadius: "12px",
  boxShadow: "0 24px 60px -12px #000c",
  outline: "none",
  transition: "opacity 120ms, transform 120ms",
  _startingStyle: { opacity: 0, transform: "translateY(-4px)" },
  _endingStyle: { opacity: 0, transform: "translateY(-4px)" },
});

export const menuItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "10px",
  minHeight: "34px",
  px: "10px",
  borderRadius: "8px",
  fontSize: "13px",
  color: "soft",
  cursor: "pointer",
  outline: "none",
  userSelect: "none",
  _highlighted: { bg: "elevated", color: "ink" },
  "&[data-checked]": { color: "ink" },
});

export const menuLabelStyle = css({
  px: "10px",
  pt: "8px",
  pb: "6px",
  fontSize: "11px",
  fontWeight: "600",
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "subtle",
});

export const menuSeparatorStyle = css({
  height: "1px",
  bg: "lineStrong",
  my: "6px",
  mx: "4px",
});
