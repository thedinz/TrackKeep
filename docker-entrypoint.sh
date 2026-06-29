#!/bin/sh
set -eu

config_dir="${SPOTIFYBU_CONFIG_DIR:-/app/.spotifybu}"
music_dir="${MUSIC_LIBRARY_PATH:-/music}"
runtime_uid="${PUID:-1000}"
runtime_gid="${PGID:-1000}"
runtime_user="spotifybu"
runtime_group="spotifybu"

if [ "$(id -u)" = "0" ]; then
  case "$runtime_uid" in
    ""|*[!0-9]*)
      echo "PUID must be a numeric user ID." >&2
      exit 1
      ;;
  esac

  case "$runtime_gid" in
    ""|*[!0-9]*)
      echo "PGID must be a numeric group ID." >&2
      exit 1
      ;;
  esac

  if ! getent group "$runtime_gid" >/dev/null; then
    if getent group "$runtime_group" >/dev/null; then
      groupmod -g "$runtime_gid" "$runtime_group"
    else
      groupadd -g "$runtime_gid" "$runtime_group"
    fi
  fi

  if [ "$runtime_uid" != "0" ] && ! getent passwd "$runtime_uid" >/dev/null; then
    if getent passwd "$runtime_user" >/dev/null; then
      usermod -u "$runtime_uid" -g "$runtime_gid" -d /app "$runtime_user"
    else
      useradd -u "$runtime_uid" -g "$runtime_gid" -d /app -M -s /usr/sbin/nologin "$runtime_user"
    fi
  fi

  existing_user="$(getent passwd "$runtime_uid" | cut -d: -f1 || true)"
  if [ "$runtime_uid" != "0" ] && [ -n "$existing_user" ] && [ "$(id -g "$existing_user")" != "$runtime_gid" ]; then
    usermod -g "$runtime_gid" "$existing_user"
  fi

  mkdir -p "$config_dir"
  chown -R "$runtime_uid:$runtime_gid" "$config_dir"
  chmod -R u+rwX "$config_dir"

  if [ "${SPOTIFYBU_CHOWN_MUSIC:-false}" = "true" ]; then
    mkdir -p "$music_dir"
    chown -R "$runtime_uid:$runtime_gid" "$music_dir"
  fi

  exec gosu "$runtime_uid:$runtime_gid" "$@"
fi

mkdir -p "$config_dir"
exec "$@"
