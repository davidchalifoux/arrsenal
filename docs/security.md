# Security and account recovery

[Back to README](../README.md)

Arrsenal defaults to **no account** for trusted local networks. Anyone who can reach an unprotected instance can view data, change settings, and enable authentication themselves. Do not expose it to an untrusted network without authentication or a VPN.

Enable the optional instance-wide account in **Settings > Security** by choosing a username and password. Passwords require at least 8 characters and allow up to 1,024 UTF-8 bytes. Usernames are case-sensitive. Settings also supports changing credentials, signing out, and disabling authentication. Changing or disabling credentials requires the current password; changes sign out other sessions.

Artwork is intentionally public, including when authentication is enabled, so Next.js can resize and cache it. Anyone who obtains or guesses an artwork URL can view it; cached images can remain available after logout or removal from the library. Library metadata, settings, and controls remain authenticated. Image requests retain strict path, destination, size, and raster-format restrictions, and upstream API keys stay server-side.

Only an Argon2id password hash is stored in private `config.json`, alongside the existing instance configuration. Sessions use opaque HttpOnly, SameSite cookies, expire after seven days, and are lost on server restart. Use one Arrsenal server process; sessions are not shared between replicas. Configuration and backups remain sensitive: upstream API keys must remain recoverable and are not password-hashed.

Use HTTPS on untrusted networks. HTTP remains supported for trusted LANs but exposes passwords and session cookies to network interception. Cookies use `Secure` when accessed through HTTPS. Reverse proxies must preserve the public request host and scheme, and direct access must be restricted when proxy authentication is used. Same-origin mutation protection remains enabled and is not a substitute for authentication.

### Forgotten Credentials

Restrict network access first: recovery **disables authentication**, making the instance open again.

1. Stop Arrsenal to prevent concurrent configuration writes and clear all sessions. For Docker Compose, use `docker compose stop arrsenal`.
2. Back up `config.json` in `ARRSENAL_CONFIG_DIR`, or `~/.config/arrsenal` if that variable is unset. In Docker, the file is `/config/config.json` in the persistent configuration volume.
3. Edit the file and remove the entire top-level `account` property, including its username, password hash, and generation. Keep the JSON valid: remove the adjacent comma where necessary. **Remove the property; do not set it to `null`.** Leave `version`, `instances`, and `preferences` unchanged.
4. Save the file with its original ownership and private permissions (`0600`). Protect the backup too: it contains API keys and the old password hash. Restart Arrsenal (`docker compose start arrsenal`).
5. Open **Settings > Security** and configure a new account before restoring wider network access.

For Docker named volumes, edit the file through a temporary maintenance container with the same configuration volume mounted while Arrsenal is stopped. Do not delete the volume or use `docker compose down -v`; that would also remove connections and preferences.

Malformed JSON, an `account` value of `null`, or unreadable configuration fails closed. Correct the file or restore the backup if Arrsenal cannot load it. If a crashed writer left `config.lock`, stop Arrsenal before removing that stale lock.
