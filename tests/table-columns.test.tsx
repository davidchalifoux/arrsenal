import { afterEach, describe, expect, it, mock } from "bun:test";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import {
  type ColumnDefinition,
  columnSettings,
  type ResolvedColumn,
  resolveColumns,
  tableSettingsSchema,
} from "@/lib/table-columns";

const { TableOptionsDialog } = await import("@/components/table-options");
const { DownloadQueue } = await import("@/components/queue");

const definitions: ColumnDefinition[] = [
  { key: "title", label: "Title", locked: true },
  { key: "status", label: "Status" },
  { key: "size", label: "Size" },
  { key: "quality", label: "Quality", defaultVisible: false },
];

afterEach(cleanup);

describe("resolveColumns", () => {
  it("uses the defaults with nothing saved", () => {
    expect(
      resolveColumns(definitions).map((column) => [column.key, column.visible]),
    ).toEqual([
      ["title", true],
      ["status", true],
      ["size", true],
      ["quality", false],
    ]);
  });

  it("keeps saved order, drops unknown keys, and slots in new columns", () => {
    const columns = resolveColumns(definitions, [
      { key: "size", visible: false },
      { key: "gone", visible: true },
      { key: "status", visible: true },
      // A saved locked column can't be hidden or moved.
      { key: "title", visible: false },
    ]);
    // Quality is new since the save; it follows Size, its default neighbour.
    expect(columns.map((column) => [column.key, column.visible])).toEqual([
      ["title", true],
      ["size", false],
      ["quality", false],
      ["status", true],
    ]);
    expect(columnSettings(columns)).toEqual([
      { key: "size", visible: false },
      { key: "quality", visible: false },
      { key: "status", visible: true },
    ]);
  });

  it("validates saved settings", () => {
    expect(
      tableSettingsSchema.safeParse({ queue: [{ key: "size", visible: true }] })
        .success,
    ).toBe(true);
    expect(
      tableSettingsSchema.safeParse({
        queue: [
          { key: "size", visible: true },
          { key: "size", visible: false },
        ],
      }).success,
    ).toBe(false);
    expect(tableSettingsSchema.safeParse({ nope: [] }).success).toBe(false);
  });
});

describe("TableOptionsDialog", () => {
  function renderDialog() {
    const onChange = mock<(columns: ResolvedColumn[] | null) => void>();
    render(
      <TableOptionsDialog
        open
        onOpenChange={() => {}}
        control={{ columns: resolveColumns(definitions), onChange }}
      />,
    );
    return onChange;
  }

  it("shows, hides, and reorders columns, and resets", () => {
    const onChange = renderDialog();
    const list = within(screen.getByRole("list", { name: "Columns" }));
    expect(list.getByRole("checkbox", { name: /Title/ })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(list.getByRole("checkbox", { name: "Quality" }));
    expect(
      onChange.mock.calls[0][0]?.find((column) => column.key === "quality")
        ?.visible,
    ).toBe(true);

    expect(list.getByRole("button", { name: "Move Status up" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(list.getByRole("button", { name: "Move Status down" }));
    expect(onChange.mock.calls[1][0]?.map((column) => column.key)).toEqual([
      "title",
      "size",
      "status",
      "quality",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(onChange.mock.calls[2][0]).toBeNull();
  });
});

describe("configured tables", () => {
  it("renders only the chosen columns, in order", () => {
    const columns = resolveColumns(
      [
        { key: "title", label: "Download", locked: true },
        { key: "timeleft", label: "Time left" },
        { key: "status", label: "Status" },
      ],
      [
        { key: "timeleft", visible: true },
        { key: "status", visible: true },
      ],
    );
    render(
      <DownloadQueue
        data={{
          items: [
            {
              id: 1,
              instanceId: "a",
              instanceName: "Sonarr HD",
              title: "Show.S01E01",
              mediaTitle: "Show",
              kind: "series",
              quality: "HDTV-720p",
              size: 100,
              sizeleft: 50,
              status: "downloading",
              timeleft: "00:01:00",
              warnings: [],
            },
          ],
          errors: [],
        }}
        loading={false}
        onRefresh={() => {}}
        notify={() => {}}
        tableColumns={{ columns, onChange: () => {} }}
      />,
    );
    expect(
      screen
        .getAllByRole("columnheader")
        .map((header) => header.textContent)
        .filter(Boolean),
    ).toEqual(["Download", "Time left", "Status", "Actions"]);
    expect(screen.getByRole("button", { name: "Table options" })).toBeTruthy();
  });
});
