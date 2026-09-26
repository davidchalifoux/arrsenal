import { type ChangeEvent, type MouseEvent, useRef, useState } from "react";

/**
 * Checkbox selection with shift-click ranges, as in file managers and the arr
 * apps. A plain click toggles one row and makes it the anchor. A shift-click
 * gives every row from the anchor to the clicked row the anchor's state, and
 * replaces the range from the previous shift-click, so overshooting and then
 * shift-clicking a closer row shrinks the range. `keys` is the visible order.
 */
export function useRangeSelection(keys: readonly string[]) {
  const [selected, setSelectedState] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<{ key: string; checked: boolean } | null>(null);
  const lastRange = useRef<readonly string[]>([]);

  function setSelected(next: ReadonlySet<string>) {
    // Select all and clear start over; the next click sets a new anchor.
    anchor.current = null;
    lastRange.current = [];
    setSelectedState(next);
  }

  function toggle(key: string, extend = false) {
    const next = new Set(selected);
    const from = anchor.current ? keys.indexOf(anchor.current.key) : -1;
    const to = keys.indexOf(key);
    if (extend && anchor.current && from !== -1 && to !== -1) {
      const { checked } = anchor.current;
      for (const rangeKey of lastRange.current) {
        if (checked) next.delete(rangeKey);
        else next.add(rangeKey);
      }
      const range = keys.slice(Math.min(from, to), Math.max(from, to) + 1);
      for (const rangeKey of range) {
        if (checked) next.add(rangeKey);
        else next.delete(rangeKey);
      }
      lastRange.current = range;
    } else {
      const checked = !next.has(key);
      if (checked) next.add(key);
      else next.delete(key);
      anchor.current = { key, checked };
      lastRange.current = [];
    }
    setSelectedState(next);
  }

  /** Props for a row checkbox. React fires a checkbox's change from the click. */
  function checkboxProps(key: string) {
    return {
      checked: selected.has(key),
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        const native = event.nativeEvent;
        toggle(key, "shiftKey" in native && native.shiftKey === true);
      },
      // Shift-clicking would otherwise also select the text between rows.
      onMouseDown: (event: MouseEvent<HTMLInputElement>) => {
        if (event.shiftKey) event.preventDefault();
      },
    };
  }

  return { selected, setSelected, checkboxProps };
}
