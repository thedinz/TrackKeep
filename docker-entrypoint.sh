#!/bin/sh
set -eu

config_dir="${SPOTIFYBU_CONFIG_DIR:-/app/.spotifybu}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$config_dir"
  chown -R node:node "$config_dir"
  exec gosu node "$@"
fi

mkdir -p "$config_dir"
exec "$@"
