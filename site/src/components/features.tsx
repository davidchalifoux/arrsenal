import {
  FadersIcon,
  FilmSlateIcon,
  FunnelIcon,
  LockKeyIcon,
  MagnifyingGlassIcon,
  PaletteIcon,
  ShieldCheckIcon,
  TrashIcon,
} from "@phosphor-icons/react/ssr";
import { css } from "@styled-system/css";
import { container, eyebrow, sectionLead, sectionTitle } from "./styles";

const features = [
  {
    icon: MagnifyingGlassIcon,
    title: "One search for everything",
    body: "Press ⌘K to jump to recently added titles and library matches, followed by movies and shows you can add.",
  },
  {
    icon: FunnelIcon,
    title: "Filters that go deep",
    body: "Build custom filters from type, quality, target, monitoring, genre, size, and more, with nested all/any groups.",
  },
  {
    icon: FadersIcon,
    title: "Posters or a dense table",
    body: "Switch views, sort, and pick your columns. Filters and view options are saved on the server, so every browser shares them.",
  },
  {
    icon: FilmSlateIcon,
    title: "Detail pages that do the work",
    body: "Bookmarkable movie and show pages with per-instance seasons, episode availability, and targeted searches.",
  },
  {
    icon: TrashIcon,
    title: "Deletion you can trust",
    body: "Removing a title keeps its files unless you explicitly choose otherwise. Confirmations name the instance and warn about shared files.",
  },
  {
    icon: PaletteIcon,
    title: "Make it yours",
    body: "Six themes, including Sonarr- and Radarr-inspired palettes, plus a custom accent color.",
  },
  {
    icon: LockKeyIcon,
    title: "Keys stay on the server",
    body: "API keys never reach the browser. Every upstream request is made server-side.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Optional sign-in",
    body: "Turn on single-account authentication in Settings, with local password recovery if you forget it.",
  },
];

export function Features() {
  return (
    <section
      id="features"
      className={css({
        py: { base: "20", md: "28" },
        borderTopWidth: "1px",
        borderColor: "line",
        scrollMarginTop: "16",
      })}
    >
      <div className={container}>
        <p className={eyebrow}>Features</p>
        <h2 className={`${sectionTitle} ${css({ mt: "4", maxW: "720px" })}`}>
          Built for people who already know their way around the arrs
        </h2>
        <p className={`${sectionLead} ${css({ mt: "5" })}`}>
          A familiar sidebar layout, fast keyboard navigation, and the details
          you'd otherwise dig through several screens to find.
        </p>
        <ul
          className={css({
            mt: { base: "12", md: "16" },
            display: "grid",
            gridTemplateColumns: {
              base: "1fr",
              sm: "repeat(2, 1fr)",
              lg: "repeat(4, 1fr)",
            },
            gap: "px",
            bg: "line",
            borderWidth: "1px",
            borderColor: "line",
            rounded: "xl",
            overflow: "hidden",
          })}
        >
          {features.map(({ icon: Icon, title, body }) => (
            <li key={title} className={css({ bg: "canvas", p: "6" })}>
              <Icon size={22} aria-hidden className={css({ color: "soft" })} />
              <h3
                className={css({
                  mt: "5",
                  fontWeight: "500",
                  letterSpacing: "-0.01em",
                })}
              >
                {title}
              </h3>
              <p
                className={css({
                  mt: "2",
                  fontSize: "sm",
                  lineHeight: "1.6",
                  color: "subtle",
                  textWrap: "pretty",
                })}
              >
                {body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
