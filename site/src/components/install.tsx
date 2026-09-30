import { css } from "@styled-system/css";
import { ConnectPreview } from "./connect-preview";
import { CopyButton } from "./copy-button";
import { container, eyebrow, sectionLead, sectionTitle } from "./styles";

const compose = `services:
  arrsenal:
    image: ghcr.io/davidchalifoux/arrsenal:latest
    ports:
      - "3000:3000"
    volumes:
      - arrsenal-config:/config
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped

volumes:
  arrsenal-config:`;

const run = "docker compose pull\ndocker compose up -d";

const steps = [
  {
    title: "Save compose.yaml",
    body: "No repository checkout required. Your connections and preferences persist in the arrsenal-config volume.",
    code: { file: "compose.yaml", text: compose },
  },
  {
    title: "Start it",
    body: "Then open http://localhost:3000 on the Docker host, or http://<server-ip>:3000 from your LAN.",
    code: { file: "Terminal", text: run },
  },
  {
    title: "Connect your instances",
    body: "Select Connect an instance, then enter each Sonarr or Radarr URL and the API key from its Settings > General > Security. Test the connection, save, and repeat for every instance.",
    note: "Running Sonarr or Radarr on the Docker host? Use host.docker.internal instead of localhost.",
    preview: true,
  },
];

export function Install() {
  return (
    <section
      id="install"
      className={css({
        py: { base: "20", md: "28" },
        borderTopWidth: "1px",
        borderColor: "line",
        scrollMarginTop: "16",
      })}
    >
      <div className={container}>
        <p className={eyebrow}>Get started</p>
        <h2 className={`${sectionTitle} ${css({ mt: "4" })}`}>
          Running in a couple of minutes
        </h2>
        <p className={`${sectionLead} ${css({ mt: "5" })}`}>
          All you need is Docker and at least one Sonarr or Radarr instance that
          the container can reach.
        </p>

        <ol
          className={css({
            mt: { base: "12", md: "16" },
            display: "grid",
            gap: "4",
          })}
        >
          {steps.map((step, index) => (
            <li
              key={step.title}
              className={css({
                display: "grid",
                gridTemplateColumns: { base: "1fr", lg: "2fr 3fr" },
                gap: { base: "5", lg: "10" },
                rounded: "xl",
                borderWidth: "1px",
                borderColor: "line",
                bg: "surface",
                p: { base: "5", md: "7" },
              })}
            >
              <div className={css({ display: "flex", gap: "4" })}>
                <span
                  className={css({
                    flexShrink: "0",
                    display: "grid",
                    placeItems: "center",
                    w: "8",
                    h: "8",
                    rounded: "full",
                    borderWidth: "1px",
                    borderColor: "lineStrong",
                    fontFamily: "mono",
                    fontSize: "sm",
                    color: "soft",
                  })}
                >
                  {index + 1}
                </span>
                <div>
                  <h3
                    className={css({
                      fontSize: "lg",
                      fontWeight: "500",
                      mt: "0.5",
                    })}
                  >
                    {step.title}
                  </h3>
                  <p
                    className={css({
                      mt: "2",
                      color: "subtle",
                      lineHeight: "1.6",
                      textWrap: "pretty",
                    })}
                  >
                    {step.body}
                  </p>
                  {step.note && (
                    <p
                      className={css({
                        mt: "4",
                        pt: "4",
                        borderTopWidth: "1px",
                        borderColor: "line",
                        fontSize: "sm",
                        lineHeight: "1.6",
                        color: "subtle",
                        textWrap: "pretty",
                      })}
                    >
                      {step.note}
                    </p>
                  )}
                </div>
              </div>
              {step.preview && <ConnectPreview />}
              {step.code && (
                <div
                  className={css({
                    minW: "0",
                    rounded: "lg",
                    borderWidth: "1px",
                    borderColor: "line",
                    bg: "canvas",
                    overflow: "hidden",
                  })}
                >
                  <div
                    className={css({
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      h: "10",
                      pl: "4",
                      pr: "1.5",
                      borderBottomWidth: "1px",
                      borderColor: "line",
                      fontFamily: "mono",
                      fontSize: "xs",
                      color: "subtle",
                    })}
                  >
                    {step.code.file}
                    <CopyButton
                      text={step.code.text}
                      label={`Copy ${step.code.file}`}
                    />
                  </div>
                  <pre
                    className={css({
                      p: "4",
                      overflowX: "auto",
                      fontFamily: "mono",
                      fontSize: "13px",
                      lineHeight: "1.65",
                      color: "soft",
                    })}
                  >
                    <code>{step.code.text}</code>
                  </pre>
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
