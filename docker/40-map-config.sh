#!/bin/sh
set -eu

key="${VITE_CARTO_BASEMAP_API_KEY:-}"
case "$key" in
    *[!A-Za-z0-9_-]*)
        echo 'VITE_CARTO_BASEMAP_API_KEY contains invalid characters' >&2
        exit 1
        ;;
esac

printf 'window.__DRCAE_MAP_CONFIG__ = {"cartoBasemapApiKey":"%s"};\n' "$key" \
    > /usr/share/nginx/html/map-config.js
