#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec "$project_dir/../.tools/node-v22.23.3-linux-x64/bin/node" "$project_dir/scripts/serve.js"
