# Deployment

[Back to README](../README.md)

## Published Docker image

Follow the [README quick start](../README.md#quick-start-docker) for a standalone Compose file. No source checkout or Bun installation is needed.

Published images are available at `ghcr.io/davidchalifoux/arrsenal` for `linux/amd64` and `linux/arm64`. Use `:latest` for the most recently published release, or pin a version from [GitHub Releases](https://github.com/davidchalifoux/arrsenal/releases). Image version tags omit the `v` prefix.

The image runs as a non-root user and stores configuration at `/config/config.json`. Keep `/config` on a persistent volume. The quick-start configuration publishes port 3000 on all host interfaces. Open `http://localhost:3000` on the Docker host or `http://<server-ip>:3000` from another machine on your LAN. Arrsenal has no account enabled by default: configure one during initial setup and keep the port off the public internet. See [security](security.md). If you need host-only access, use `127.0.0.1:3000:3000` instead.

## Updates and stopping

Run these commands from the directory containing your published-image Compose file:

```sh
docker compose pull
docker compose up -d
```

If you pinned an image version, change that tag before updating. Back up your [configuration](configuration.md) first and check the release notes.

```sh
docker compose logs --tail=100 arrsenal
docker compose stop arrsenal
docker compose start arrsenal
```

Recreating the container preserves the named configuration volume. **Do not use `docker compose down -v`** unless you intend to delete the saved configuration.

## Building from source

The repository's [compose.yaml](../compose.yaml) uses `build: .`, unlike the published-image example in the README:

```sh
git clone https://github.com/davidchalifoux/arrsenal.git
cd arrsenal
docker compose up --build -d
```

To use a published image from that checkout instead, replace `build: .` with `image: ghcr.io/davidchalifoux/arrsenal:latest`, then run the update commands above.

Building requires network access to the package registry and Google Fonts. The built application serves Geist locally. For local development without Docker, see [development](development.md).

## Networking and reverse proxies

Instance URLs must be reachable from the **Arrsenal server**, not just your browser.

| Where Sonarr/Radarr runs | URL to use from Arrsenal in Docker |
| --- | --- |
| On the Docker host | `http://host.docker.internal:8989` for Sonarr or `http://host.docker.internal:7878` for Radarr |
| On a shared Docker network | Its service name and internal port, such as `http://sonarr:8989`; attach Arrsenal to that network |
| On another machine | That machine's reachable hostname or IP address and service port |
| Behind a base path | Include the path, such as `http://media-server:8989/sonarr` |

`localhost` inside the Arrsenal container refers to that container, not the host. The quick-start and repository Compose files include the `host.docker.internal:host-gateway` mapping.

- Realtime updates require WebSocket upgrades between Arrsenal and each instance's `/signalr/messages` endpoint.
- Browser updates use SSE on Arrsenal's `/api/events`: disable proxy buffering for this route and allow long-lived responses. No additional port is needed.
- If streaming is blocked, use **Refresh data** or fix the connection; there is no fallback interval polling.
- Reverse proxies must preserve the public request host and scheme. Use HTTPS on untrusted networks, and restrict direct access when using proxy authentication. See [security](security.md).

## Storage and common problems

- **Port 3000 is in use:** stop the other service or change the host port to, for example, `3001:3000`, then open `http://localhost:3001` on the host or `http://<server-ip>:3001` from your LAN.
- **Connection test fails:** check the URL from Arrsenal's network, the application type, and the API key from Sonarr/Radarr's **Settings > General > Security**. Use the actual destination URL; upstream redirects are not followed.
- **Bind-mount permission errors:** ensure the configuration directory is writable by UID/GID `1000:1000`. A bind mount can replace the named volume.
- **External configuration edits do not appear:** restart Arrsenal. Changes saved through its UI update live connections immediately; configuration discovery does not poll.
- **Configuration will not load or save:** follow the [configuration and recovery guidance](configuration.md); do not delete the volume to reset an error.
