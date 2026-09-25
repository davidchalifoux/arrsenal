"use client";

import { Switch } from "@base-ui/react/switch";
import { css } from "@styled-system/css";
import {
  cardDetails,
  defaultViewOptions,
  type LibraryViewOptions,
  posterSizes,
} from "@/lib/library-options";
import { Button, labelStyle, Modal, SelectField } from "./ui";

const sizeLabels = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  huge: "Huge",
} as const;

export function ViewOptionsDialog({
  open,
  onOpenChange,
  options,
  onChange,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: LibraryViewOptions;
  onChange: (options: LibraryViewOptions) => void;
  error?: string | null;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="View options"
      description="Changes apply right away and are saved for everyone on this server."
    >
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: "22px",
        })}
      >
        <fieldset
          className={css({ m: 0, p: 0, border: 0, minWidth: 0 })}
          aria-label="Poster size"
        >
          <p
            className={css({
              fontSize: "12px",
              fontWeight: "500",
              color: "soft",
              mb: "10px",
            })}
          >
            Poster size
          </p>
          <div
            className={css({
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "4px",
              p: "3px",
              bg: "canvas",
              border: "1px solid token(colors.line)",
              borderRadius: "10px",
            })}
          >
            {posterSizes.map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={options.posterSize === size}
                onClick={() => onChange({ ...options, posterSize: size })}
                className={css({
                  height: "32px",
                  border: 0,
                  borderRadius: "7px",
                  bg: "transparent",
                  color: "muted",
                  fontSize: "13px",
                  fontWeight: "500",
                  _hover: { color: "ink" },
                  "&[aria-pressed=true]": { bg: "elevated", color: "ink" },
                })}
              >
                {sizeLabels[size]}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <p
            className={css({
              fontSize: "12px",
              fontWeight: "500",
              color: "soft",
              mb: "10px",
            })}
          >
            Card details
          </p>
          <div
            className={css({
              display: "flex",
              flexDirection: "column",
              bg: "canvas",
              border: "1px solid token(colors.line)",
              borderRadius: "12px",
            })}
          >
            {cardDetails.map((detail, index) => (
              // biome-ignore lint/a11y/noLabelWithoutControl: the Switch renders the control inside the label
              <label
                key={detail.key}
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  minHeight: "48px",
                  px: "14px",
                  py: "8px",
                  cursor: "pointer",
                  borderBottom:
                    index === cardDetails.length - 1
                      ? "0"
                      : "1px solid token(colors.lineSoft)",
                })}
              >
                <span
                  className={css({
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  })}
                >
                  <span
                    className={css({ fontSize: "13px", fontWeight: "500" })}
                  >
                    {detail.label}
                  </span>
                  <span className={css({ fontSize: "12px", color: "subtle" })}>
                    {detail.hint}
                  </span>
                </span>
                <Switch.Root
                  checked={options[detail.key]}
                  onCheckedChange={(checked) =>
                    onChange({ ...options, [detail.key]: checked })
                  }
                  className={css({
                    position: "relative",
                    width: "36px",
                    height: "20px",
                    flexShrink: 0,
                    borderRadius: "999px",
                    bg: "lineStrong",
                    transition: "background 150ms",
                    "&[data-checked]": { bg: "accent" },
                  })}
                >
                  <Switch.Thumb
                    className={css({
                      position: "absolute",
                      top: "2px",
                      left: "2px",
                      width: "16px",
                      height: "16px",
                      borderRadius: "999px",
                      bg: "#ffffff",
                      transition: "transform 150ms",
                      "&[data-checked]": { transform: "translateX(16px)" },
                    })}
                  />
                </Switch.Root>
              </label>
            ))}
          </div>
        </div>

        <div className={labelStyle}>
          Chips show
          <SelectField
            label="Chips show"
            value={options.chipLabel}
            onChange={(value) =>
              onChange({
                ...options,
                chipLabel: value === "quality" ? "quality" : "profile",
              })
            }
            options={[
              { value: "profile", label: "Quality profile" },
              { value: "quality", label: "File quality" },
            ]}
          />
        </div>

        {error && (
          <p
            role="alert"
            className={css({ color: "negative", fontSize: "13px" })}
          >
            {error}
          </p>
        )}

        <div
          className={css({
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            pt: "14px",
            borderTop: "1px solid token(colors.line)",
          })}
        >
          <Button variant="ghost" onClick={() => onChange(defaultViewOptions)}>
            Reset
          </Button>
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
