#!/bin/sh
set -eu

case "${API_BASE_URL:-/api/v1}" in
  http://*|https://*|/*) ;;
  *) echo "API_BASE_URL must be an absolute HTTP(S) URL or an absolute path" >&2; exit 1 ;;
esac

# URL validation above and JSON escaping keep this generated executable file from
# becoming an injection point. API_BASE_URL is public browser configuration.
escaped_url=$(printf '%s' "${API_BASE_URL:-/api/v1}" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf 'window.__APP_CONFIG__ = { apiBaseUrl: "%s" };\n' "$escaped_url" \
  > /usr/share/nginx/html/config.js

