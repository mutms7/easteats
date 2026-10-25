#!/usr/bin/env bash
# A second judge: scoped proof, at most five repair continuations.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/scripts/referee.mjs"
