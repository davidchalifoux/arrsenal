import { CheckCircleIcon, EyeIcon } from "@phosphor-icons/react/ssr";
import { css } from "@styled-system/css";

const fieldLabel = css({ fontSize: "xs", fontWeight: "500", color: "muted" });

const field = css({
  display: "flex",
  alignItems: "center",
  h: "9",
  px: "3",
  rounded: "md",
  borderWidth: "1px",
  borderColor: "lineStrong",
  bg: "surface",
  fontSize: "sm",
  color: "soft",
  minW: "0",
  overflow: "hidden",
  whiteSpace: "nowrap",
});

const kinds = [
  { name: "Sonarr", hint: "Shows", selected: false },
  { name: "Radarr", hint: "Movies", selected: true },
];

/** A static rendering of the app's Connect an instance dialog. */
export function ConnectPreview() {
  return (
    <div
      aria-hidden
      className={css({
        minW: "0",
        rounded: "lg",
        borderWidth: "1px",
        borderColor: "line",
        bg: "canvas",
        overflow: "hidden",
        userSelect: "none",
      })}
    >
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          h: "10",
          px: "4",
          borderBottomWidth: "1px",
          borderColor: "line",
          fontFamily: "mono",
          fontSize: "xs",
          color: "subtle",
        })}
      >
        Settings › Connections
      </div>
      <div className={css({ p: { base: "4", md: "5" } })}>
        <p className={css({ fontWeight: "600" })}>Connect an instance</p>
        <p className={css({ mt: "1", fontSize: "xs", color: "subtle" })}>
          Link Sonarr or Radarr using its address and API key.
        </p>

        <div
          className={css({
            mt: "4",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "2.5",
          })}
        >
          {kinds.map((kind) => (
            <div
              key={kind.name}
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "3",
                px: "3.5",
                py: "2.5",
                rounded: "lg",
                borderWidth: "1px",
                borderColor: kind.selected ? "radarr" : "lineStrong",
                bg: kind.selected ? "elevated" : "surface",
                boxShadow: kind.selected
                  ? "0 0 0 3px rgba(255, 194, 48, 0.14)"
                  : "none",
              })}
            >
              <span
                className={css({
                  display: "grid",
                  placeItems: "center",
                  flexShrink: "0",
                  w: "3.5",
                  h: "3.5",
                  rounded: "full",
                  borderWidth: "1px",
                  borderColor: kind.selected ? "radarr" : "faint",
                })}
              >
                {kind.selected && (
                  <span
                    className={css({
                      w: "1.5",
                      h: "1.5",
                      rounded: "full",
                      bg: "radarr",
                    })}
                  />
                )}
              </span>
              <span>
                <span
                  className={css({
                    display: "block",
                    fontSize: "sm",
                    fontWeight: "600",
                  })}
                >
                  {kind.name}
                </span>
                <span
                  className={css({
                    display: "block",
                    fontSize: "xs",
                    color: "subtle",
                  })}
                >
                  {kind.hint}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div
          className={css({
            mt: "4",
            display: "grid",
            gridTemplateColumns: { base: "1fr", sm: "2fr 3fr" },
            gap: "3",
          })}
        >
          <div className={css({ display: "grid", gap: "1.5", minW: "0" })}>
            <span className={fieldLabel}>Instance name</span>
            <span className={field}>Radarr 4K</span>
          </div>
          <div className={css({ display: "grid", gap: "1.5", minW: "0" })}>
            <span className={fieldLabel}>Instance URL</span>
            <span
              className={`${field} ${css({ fontFamily: "mono", fontSize: "xs" })}`}
            >
              http://host.docker.internal:7879
            </span>
          </div>
        </div>

        <div className={css({ mt: "3", display: "grid", gap: "1.5" })}>
          <span className={fieldLabel}>API key</span>
          <span
            className={`${field} ${css({ justifyContent: "space-between", letterSpacing: "0.12em" })}`}
          >
            ••••••••••••••••••••••••
            <EyeIcon size={15} className={css({ color: "subtle" })} />
          </span>
        </div>

        <div
          className={css({
            mt: "5",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "3",
          })}
        >
          <span
            className={css({
              display: "inline-flex",
              alignItems: "center",
              gap: "1.5",
              fontSize: "xs",
              color: "positive",
            })}
          >
            <CheckCircleIcon size={15} weight="fill" />
            Connection verified
          </span>
          <span className={css({ display: "flex", gap: "2" })}>
            <span
              className={css({
                display: "inline-flex",
                alignItems: "center",
                h: "8",
                px: "3",
                rounded: "md",
                borderWidth: "1px",
                borderColor: "lineStrong",
                fontSize: "xs",
                color: "soft",
              })}
            >
              Test connection
            </span>
            <span
              className={css({
                display: "inline-flex",
                alignItems: "center",
                h: "8",
                px: "3",
                rounded: "md",
                bg: "ink",
                fontSize: "xs",
                fontWeight: "500",
                color: "canvas",
              })}
            >
              Connect instance
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
