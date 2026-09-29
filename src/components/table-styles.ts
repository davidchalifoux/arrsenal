import { css } from "@styled-system/css";

// Shared by the Activity tables: queue, history, and blocklist.
export const checkboxStyle = css({
  width: "15px",
  height: "15px",
  m: 0,
  display: "block",
});

export const headCellStyle = css({
  px: "10px",
  py: "7px",
  textAlign: "left",
  fontWeight: "500",
  whiteSpace: "nowrap",
});

export const cellStyle = css({
  px: "10px",
  py: "7px",
  textAlign: "left",
  verticalAlign: "middle",
  borderTop: "1px solid token(colors.line)",
});

export const columnSm = css({ display: { base: "none", sm: "table-cell" } });
export const columnMd = css({ display: { base: "none", md: "table-cell" } });
export const columnLg = css({ display: { base: "none", lg: "table-cell" } });

export const tableStyle = css({
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "12px",
});

export const tableHeadStyle = css({
  color: "muted",
  fontSize: "10px",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
});
