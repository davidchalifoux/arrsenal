# Configuration and backups

[Back to README](../README.md)

On a local installation, the file is `~/.config/arrsenal/config.json`. Set `ARRSENAL_CONFIG_DIR` to choose another directory. Docker uses `/config/config.json`.

The file is created when the first instance is saved. Writes are serialized and atomic, with directory permissions `0700` and file permissions `0600`. API keys are stored in this file in plaintext and are never returned to the browser. Protect the directory and its backups. Removing a connection only removes local configuration; it does not delete remote media or files.

A corrupt or unreadable config produces an error rather than being silently replaced. A process killed during a write can leave `config.lock`; stop all Arrsenal processes before removing a stale lock. See [backend details](../src/lib/server/README.md) for the data contract, limits, and recovery instructions.

## Backups and external edits

Stop Arrsenal before copying or editing `config.json`, preserve its ownership and private permissions, and restart afterward. Back up the persistent configuration volume before replacing a container or changing versions. Do not use `docker compose down -v` unless you intend to delete saved connections, preferences, and account configuration.

Instance changes saved through Arrsenal immediately update live connections. External file edits or changes from another server process require a restart. Run one Arrsenal server process with persistent local storage; replicas and distributed shared storage are unsupported.

For account recovery, follow [forgotten credentials](security.md#forgotten-credentials).
