import fs from 'node:fs';
import path from 'node:path';

function writeExecutable(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  fs.chmodSync(filePath, 0o755);
}

export function writeRuntimeWrappers(runtimeRoot) {
  writeExecutable(path.join(runtimeRoot, 'bin', 'opl'), `#!/bin/bash
set -euo pipefail
SYSTEM_PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export PATH="$SYSTEM_PATH:$PATH"
RUNTIME_HOME="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN_CANDIDATES=()
while IFS= read -r candidate; do PYTHON_BIN_CANDIDATES+=("$candidate"); done < <(
  find "$RUNTIME_HOME/python" -maxdepth 2 -path '*/bin' -type d -print 2>/dev/null | LC_ALL=C sort
)
if [[ "\${#PYTHON_BIN_CANDIDATES[@]}" -gt 1 ]]; then
  printf 'Packaged Full runtime contains multiple Python bin roots: %s\n' "\${#PYTHON_BIN_CANDIDATES[@]}" >&2
  exit 1
fi
PYTHON_BIN="\${PYTHON_BIN_CANDIDATES[0]:-}"
export OPL_FULL_RUNTIME_HOME="$RUNTIME_HOME"
export OPL_PACKAGED_SKILLS_ROOT="$RUNTIME_HOME/skills"
# Packaged Python must never materialize bytecode in the signed runtime tree.
export PYTHONDONTWRITEBYTECODE="1"
OPL_RUNTIME_STATE_ROOT="\${OPL_STATE_DIR:-}"
if [[ -z "$OPL_RUNTIME_STATE_ROOT" && -n "\${OPL_DATA_DIR:-}" ]]; then
  OPL_RUNTIME_STATE_ROOT="$OPL_DATA_DIR/opl/state"
elif [[ -z "$OPL_RUNTIME_STATE_ROOT" ]]; then
  OPL_RUNTIME_STATE_ROOT="\${HOME:-$RUNTIME_HOME}/Library/Application Support/OPL/state"
fi
case "$OPL_RUNTIME_STATE_ROOT" in
  "$RUNTIME_HOME"|"$RUNTIME_HOME"/*)
    OPL_RUNTIME_STATE_ROOT="\${HOME:-\${TMPDIR:-/tmp}}/Library/Application Support/OPL/state"
    ;;
esac
case "$OPL_RUNTIME_STATE_ROOT" in
  "$RUNTIME_HOME"|"$RUNTIME_HOME"/*)
    OPL_RUNTIME_STATE_ROOT="\${TMPDIR:-/tmp}/opl-full-runtime-state"
    ;;
esac
OPL_RUNTIME_PYCACHE_ROOT="\${OPL_FULL_RUNTIME_PYCACHE_ROOT:-$OPL_RUNTIME_STATE_ROOT/full-runtime/python-cache}"
case "$OPL_RUNTIME_PYCACHE_ROOT" in
  "$RUNTIME_HOME"|"$RUNTIME_HOME"/*)
    OPL_RUNTIME_PYCACHE_ROOT="$OPL_RUNTIME_STATE_ROOT/full-runtime/python-cache"
    ;;
esac
mkdir -p "$OPL_RUNTIME_PYCACHE_ROOT"
export OPL_FULL_RUNTIME_PYCACHE_ROOT="$OPL_RUNTIME_PYCACHE_ROOT"
export PYTHONPYCACHEPREFIX="$OPL_RUNTIME_PYCACHE_ROOT"
export OPL_MODULE_PATH_MEDAUTOSCIENCE="$RUNTIME_HOME/modules/mas"
export OPL_MODULE_PATH_MAS_SCHOLAR_SKILLS="$RUNTIME_HOME/modules/mas-scholar-skills"
export OPL_MODULE_PATH_MEDAUTOGRANT="$RUNTIME_HOME/modules/mag"
export OPL_MODULE_PATH_REDCUBE="$RUNTIME_HOME/modules/rca"
export OPL_MODULE_PATH_OPLMETAAGENT="$RUNTIME_HOME/modules/meta-agent"
export OPL_MODULE_PATH_OPLBOOKFORGE="$RUNTIME_HOME/modules/bookforge"
export OPL_FLOW_REPO_ROOT="$RUNTIME_HOME/modules/opl-flow"
if [[ -n "$PYTHON_BIN" ]]; then
  export PATH="$RUNTIME_HOME/bin:$RUNTIME_HOME/node/bin:$RUNTIME_HOME/uv/bin:$PYTHON_BIN:$PATH"
else
  export PATH="$RUNTIME_HOME/bin:$RUNTIME_HOME/node/bin:$RUNTIME_HOME/uv/bin:$PATH"
fi
exec "$RUNTIME_HOME/opl/bin/opl" "$@"
`);
}
