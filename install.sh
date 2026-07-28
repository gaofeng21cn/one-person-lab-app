#!/usr/bin/env bash
set -euo pipefail

OPL_INSTALL_SCRIPT_URL=${OPL_INSTALL_SCRIPT_URL:-https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh}
OPL_LOCAL_APP_PATH=${OPL_LOCAL_APP_PATH:-/Applications/One Person Lab.app}
OPL_APP_RELEASE_REPO=${OPL_APP_RELEASE_REPO:-gaofeng21cn/one-person-lab-app}
OPL_APP_DOCS_REF=${OPL_APP_DOCS_REF:-main}
OPL_DOCKER_WEBUI_INSTALLER_URL=${OPL_DOCKER_WEBUI_INSTALLER_URL:-https://raw.githubusercontent.com/gaofeng21cn/one-person-lab-app/main/scripts/install-docker-webui.sh}
OPL_APP_SOURCE_REF=${OPL_APP_SOURCE_REF:-}
OPL_SHELL_SOURCE_REF=${OPL_SHELL_SOURCE_REF:-}
OPL_FRAMEWORK_SOURCE_REF=${OPL_FRAMEWORK_SOURCE_REF:-}
OPL_APP_RELEASE_SELECTOR=${OPL_APP_RELEASE_SELECTOR:-latest}
OPL_FROZEN_RELEASE_TAG=${OPL_FROZEN_RELEASE_TAG:-}
OPL_RELEASE_VERSION=${OPL_RELEASE_VERSION:-}
OPL_RELEASE_REPO=${OPL_RELEASE_REPO:-${OPL_APP_RELEASE_REPO}}
OPL_CONTAINER_WEBUI_TAG=${OPL_CONTAINER_WEBUI_TAG:-}
OPL_NATIVE_WEBUI_INSTALLER_URL=${OPL_NATIVE_WEBUI_INSTALLER_URL:-}
OPL_NATIVE_WEBUI_INSTALLER_SHA256=${OPL_NATIVE_WEBUI_INSTALLER_SHA256:-}
OPL_NATIVE_WEBUI_MIRROR=${OPL_NATIVE_WEBUI_MIRROR:-}
OPL_NATIVE_WEBUI_VERSION=${OPL_NATIVE_WEBUI_VERSION:-}
OPL_INSTALL_RUNTIME_FORM=${OPL_INSTALL_RUNTIME_FORM:-auto}
export OPL_RELEASE_VERSION OPL_RELEASE_REPO OPL_FRAMEWORK_SOURCE_REF

INSTALL_ARGS=()
AUTHORIZE_LOCAL_APP=0
AUTHORIZE_LOCAL_APP_ONLY=0
AUTHORIZE_LOCAL_APP_YES=${OPL_AUTHORIZE_LOCAL_APP_YES:-0}
STABLE_MACOS_INSTALL=0
STABLE_MACOS_PACKAGE_PROFILE_EXPLICIT=0
if [ -n "${OPL_STABLE_MACOS_PACKAGE_PROFILE+x}" ]; then
  STABLE_MACOS_PACKAGE_PROFILE_EXPLICIT=1
fi
STABLE_MACOS_PACKAGE_PROFILE=${OPL_STABLE_MACOS_PACKAGE_PROFILE:-full}
STABLE_MACOS_RELEASE_TAG=${OPL_STABLE_MACOS_RELEASE_TAG:-}
STABLE_MACOS_DMG_URL=${OPL_STABLE_MACOS_DMG_URL:-}
STABLE_MACOS_DMG_PATH=${OPL_STABLE_MACOS_DMG_PATH:-}
STABLE_MACOS_DMG_SHA256=${OPL_STABLE_MACOS_DMG_SHA256:-}
STABLE_MACOS_OPEN=${OPL_STABLE_MACOS_OPEN:-1}
STABLE_MACOS_WORK_DIR=''
STABLE_MACOS_RESOLVED_DMG_PATH=''
STABLE_MACOS_RESOLVED_DMG_SHA256=''
STABLE_MACOS_RELEASE_RECORD_PATH=''
STABLE_MACOS_RELEASE_PRERELEASE=''
STABLE_MACOS_COMPONENT_MANIFEST_PATH=''
STABLE_MACOS_COMPONENT_MANIFEST_SHA256=''
STABLE_MACOS_RELEASE_QUALITY_ASSERTED=0
INSTALL_SCENARIO=${OPL_INSTALL_SCENARIO:-personal}
PRINT_INSTALL_ROUTE=0
OPEN_OPTION_EXPLICIT=''

usage() {
  cat <<'USAGE'
Usage:
  install.sh [OPL install args...]
  install.sh [--runtime-form auto|desktop|webui|native-webui|container-webui|headless]
  install.sh [--server|--isolated|--headless]
  install.sh --stable-macos-install [--full|--standard] [--release-tag vX.Y.Z] [--yes]
  install.sh --authorize-local-app-only [--app-path "/Applications/One Person Lab.app"] [--yes]

Options:
  By default, route macOS personal hosts to Desktop, Linux personal hosts to a
  verified OPL Native WebUI artifact or the Container WebUI fallback, and
  server/isolated hosts to Container WebUI.
  --runtime-form <form>      Select auto, desktop, webui, native-webui, container-webui, or headless.
  --desktop                 Require the macOS Desktop/bootstrap path.
  --webui                   Select the best supported browser runtime for this host.
  --native-webui            Require a verified OPL Native WebUI artifact.
  --container-webui         Use the Container WebUI installer.
  --server                  Select the Container WebUI server path.
  --isolated                Select the Container WebUI isolation path.
  --headless                Install OPL Base only, without an App runtime form.
  --native-mirror <url>     Candidate OPL Native WebUI release mirror.
  --native-version <ver>    Candidate OPL Native WebUI immutable version.
  --native-installer-url <url>
                            Exact verifier script URL.
  --native-installer-sha256 <digest>
                            Required SHA256 for the verifier script bytes.
  --print-install-route     Resolve and print the selected route without installing.
  --stable-macos-install     Download, copy, locally authorize, and open the App release.
  --full                     Require the Full first-install DMG for --stable-macos-install.
  --standard                 Require the standard App DMG for --stable-macos-install.
  --release-tag <tag>        GitHub Release tag for --stable-macos-install. Defaults to latest.
  --dmg-url <url>            Download a specific DMG URL for --stable-macos-install.
  --dmg-path <path>          Install from a local DMG path for --stable-macos-install.
  --dmg-sha256 <digest>      Required SHA256 for a custom DMG URL or local DMG path.
  --authorize-local-app      After setup, remove macOS quarantine from a local App bundle.
  --authorize-local-app-only Only run the local App authorization helper.
  --app-path <path>          App bundle path for the local authorization helper.
  --open                    Open the App after --stable-macos-install. This is the default.
  --no-open                 Do not open the App after --stable-macos-install.
  --yes                     Confirm local App authorization non-interactively.

The macOS App install path uses local authorization and does not require Apple Developer ID signing.
For an official GitHub Release, it verifies the component manifest and displays the
actual Stable or Preview quality. A custom DMG source has no asserted release quality.
Without an explicit package profile, the legacy-named option prefers Full and falls
back to Standard only when the Full asset is not yet published.
USAGE
}

while [ "$#" -gt 0 ]; do
  arg="$1"
  case "$arg" in
    --stable-macos-install)
      STABLE_MACOS_INSTALL=1
      ;;
    --full)
      STABLE_MACOS_PACKAGE_PROFILE=full
      STABLE_MACOS_PACKAGE_PROFILE_EXPLICIT=1
      ;;
    --standard)
      STABLE_MACOS_PACKAGE_PROFILE=standard
      STABLE_MACOS_PACKAGE_PROFILE_EXPLICIT=1
      ;;
    --release-tag)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --release-tag\n' >&2
        exit 1
      fi
      STABLE_MACOS_RELEASE_TAG="$1"
      ;;
    --release-tag=*)
      STABLE_MACOS_RELEASE_TAG="${arg#--release-tag=}"
      ;;
    --dmg-url)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --dmg-url\n' >&2
        exit 1
      fi
      STABLE_MACOS_DMG_URL="$1"
      ;;
    --dmg-url=*)
      STABLE_MACOS_DMG_URL="${arg#--dmg-url=}"
      ;;
    --dmg-path)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --dmg-path\n' >&2
        exit 1
      fi
      STABLE_MACOS_DMG_PATH="$1"
      ;;
    --dmg-path=*)
      STABLE_MACOS_DMG_PATH="${arg#--dmg-path=}"
      ;;
    --dmg-sha256)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --dmg-sha256\n' >&2
        exit 1
      fi
      STABLE_MACOS_DMG_SHA256="$1"
      ;;
    --dmg-sha256=*)
      STABLE_MACOS_DMG_SHA256="${arg#--dmg-sha256=}"
      ;;
    --authorize-local-app)
      AUTHORIZE_LOCAL_APP=1
      ;;
    --authorize-local-app-only)
      AUTHORIZE_LOCAL_APP=1
      AUTHORIZE_LOCAL_APP_ONLY=1
      ;;
    --app-path)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --app-path\n' >&2
        exit 1
      fi
      OPL_LOCAL_APP_PATH="$1"
      ;;
    --app-path=*)
      OPL_LOCAL_APP_PATH="${arg#--app-path=}"
      ;;
    --yes)
      AUTHORIZE_LOCAL_APP_YES=1
      ;;
    --open)
      STABLE_MACOS_OPEN=1
      OPEN_OPTION_EXPLICIT=--open
      ;;
    --no-open)
      STABLE_MACOS_OPEN=0
      OPEN_OPTION_EXPLICIT=--no-open
      ;;
    --runtime-form)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --runtime-form\n' >&2
        exit 1
      fi
      OPL_INSTALL_RUNTIME_FORM="$1"
      ;;
    --runtime-form=*)
      OPL_INSTALL_RUNTIME_FORM="${arg#--runtime-form=}"
      ;;
    --desktop)
      OPL_INSTALL_RUNTIME_FORM=desktop
      ;;
    --webui|--browser)
      OPL_INSTALL_RUNTIME_FORM=webui
      ;;
    --native-webui)
      OPL_INSTALL_RUNTIME_FORM=native-webui
      ;;
    --container-webui)
      OPL_INSTALL_RUNTIME_FORM=container-webui
      ;;
    --server)
      INSTALL_SCENARIO=server
      ;;
    --isolated|--isolation)
      INSTALL_SCENARIO=isolated
      ;;
    --headless)
      OPL_INSTALL_RUNTIME_FORM=headless
      ;;
    --native-mirror)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --native-mirror\n' >&2
        exit 1
      fi
      OPL_NATIVE_WEBUI_MIRROR="$1"
      ;;
    --native-mirror=*)
      OPL_NATIVE_WEBUI_MIRROR="${arg#--native-mirror=}"
      ;;
    --native-version)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --native-version\n' >&2
        exit 1
      fi
      OPL_NATIVE_WEBUI_VERSION="$1"
      ;;
    --native-version=*)
      OPL_NATIVE_WEBUI_VERSION="${arg#--native-version=}"
      ;;
    --native-installer-url)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --native-installer-url\n' >&2
        exit 1
      fi
      OPL_NATIVE_WEBUI_INSTALLER_URL="$1"
      ;;
    --native-installer-url=*)
      OPL_NATIVE_WEBUI_INSTALLER_URL="${arg#--native-installer-url=}"
      ;;
    --native-installer-sha256)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --native-installer-sha256\n' >&2
        exit 1
      fi
      OPL_NATIVE_WEBUI_INSTALLER_SHA256="$1"
      ;;
    --native-installer-sha256=*)
      OPL_NATIVE_WEBUI_INSTALLER_SHA256="${arg#--native-installer-sha256=}"
      ;;
    --print-install-route)
      PRINT_INSTALL_ROUTE=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      INSTALL_ARGS+=("$arg")
      ;;
  esac
  shift
done

if [ -n "$OPL_FROZEN_RELEASE_TAG" ]; then
  if [ -n "$STABLE_MACOS_RELEASE_TAG" ] && [ "$STABLE_MACOS_RELEASE_TAG" != "$OPL_FROZEN_RELEASE_TAG" ]; then
    printf 'This version-frozen installer is bound to Release tag %s.\n' "$OPL_FROZEN_RELEASE_TAG" >&2
    exit 1
  fi
  STABLE_MACOS_RELEASE_TAG="$OPL_FROZEN_RELEASE_TAG"
fi

arg_present() {
  local expected="$1"
  if [ "${#INSTALL_ARGS[@]}" -eq 0 ]; then
    return 1
  fi
  for arg in "${INSTALL_ARGS[@]}"; do
    if [ "$arg" = "$expected" ]; then
      return 0
    fi
  done
  return 1
}

is_macos() {
  [ "$(uname -s)" = "Darwin" ]
}

platform_family() {
  case "$(uname -s)" in
    Darwin)
      printf 'macos\n'
      ;;
    Linux)
      printf 'linux\n'
      ;;
    MINGW*|MSYS*|CYGWIN*)
      printf 'windows\n'
      ;;
    *)
      printf 'unsupported\n'
      ;;
  esac
}

normalize_runtime_form() {
  case "$OPL_INSTALL_RUNTIME_FORM" in
    auto)
      printf 'auto\n'
      ;;
    desktop)
      printf 'desktop\n'
      ;;
    webui|browser)
      printf 'webui\n'
      ;;
    native|native-webui|native_webui)
      printf 'native-webui\n'
      ;;
    container|container-webui|container_webui|docker)
      printf 'container-webui\n'
      ;;
    headless|base|base-only|base_only)
      printf 'headless\n'
      ;;
    *)
      printf 'Unsupported runtime form: %s\n' "$OPL_INSTALL_RUNTIME_FORM" >&2
      return 1
      ;;
  esac
}

NATIVE_INSTALLER_PATH=''
NATIVE_RELEASE_RECORD_PATH=''
NATIVE_QUALIFICATION_RECEIPT_PATH=''

validate_native_mirror() {
  case "$OPL_NATIVE_WEBUI_MIRROR" in
    file://*)
      return 0
      ;;
    https://github.com/gaofeng21cn/one-person-lab-app/releases/download|https://github.com/gaofeng21cn/one-person-lab-app/releases/download/)
      return 0
      ;;
    http://*|https://*)
      printf 'Remote Native WebUI mirror must be the One Person Lab App GitHub Release base namespace.\n' >&2
      return 1
      ;;
    *)
      printf 'Native WebUI mirror must be the App GitHub Release base URL or an explicit file:// development candidate.\n' >&2
      return 1
      ;;
  esac
}

native_mirror_is_local_development() {
  case "$OPL_NATIVE_WEBUI_MIRROR" in
    file://*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

native_target() {
  local platform machine
  platform=$(platform_family)
  machine=$(uname -m)
  case "$platform:$machine" in
    linux:x86_64|linux:amd64)
      printf 'linux\tx86_64\n'
      ;;
    macos:arm64)
      printf 'darwin\tarm64\n'
      ;;
    *)
      return 1
      ;;
  esac
}

native_target_supported() {
  native_target >/dev/null 2>&1
}

validate_native_version() {
  case "$OPL_NATIVE_WEBUI_VERSION" in
    ''|*[!0-9A-Za-z._-]*)
      printf 'Native WebUI version must use only letters, numbers, dots, underscores, or hyphens.\n' >&2
      return 1
      ;;
  esac
}

expected_native_installer_url() {
  printf '%s/v%s/install-web.sh\n' "${OPL_NATIVE_WEBUI_MIRROR%/}" "$OPL_NATIVE_WEBUI_VERSION"
}

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    printf 'shasum or sha256sum is required for SHA256 verification.\n' >&2
    return 1
  fi
}

cleanup_native_installer() {
  if [ -n "$NATIVE_INSTALLER_PATH" ]; then
    rm -f "$NATIVE_INSTALLER_PATH"
  fi
  if [ -n "$NATIVE_RELEASE_RECORD_PATH" ]; then
    rm -f "$NATIVE_RELEASE_RECORD_PATH"
  fi
  if [ -n "$NATIVE_QUALIFICATION_RECEIPT_PATH" ]; then
    rm -f "$NATIVE_QUALIFICATION_RECEIPT_PATH"
  fi
}

native_configuration_is_empty() {
  [ -z "$OPL_NATIVE_WEBUI_MIRROR" ] &&
    [ -z "$OPL_NATIVE_WEBUI_VERSION" ] &&
    [ -z "$OPL_NATIVE_WEBUI_INSTALLER_URL" ] &&
    [ -z "$OPL_NATIVE_WEBUI_INSTALLER_SHA256" ]
}

discover_public_native_webui() {
  native_configuration_is_empty || return 1
  command -v python3 >/dev/null 2>&1 || return 1
  local target_platform target_architecture
  if ! IFS=$'\t' read -r target_platform target_architecture < <(native_target); then
    return 1
  fi

  NATIVE_RELEASE_RECORD_PATH=$(mktemp "${TMPDIR:-/tmp}/opl-native-webui-release.XXXXXX")
  local api_path='latest'
  if [ "$OPL_APP_RELEASE_SELECTOR" != "latest" ]; then
    validate_release_tag "$OPL_APP_RELEASE_SELECTOR" || return 1
    api_path="tags/$OPL_APP_RELEASE_SELECTOR"
  fi
  if ! curl -fsSL \
    -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -H 'User-Agent: one-person-lab-installer' \
    "https://api.github.com/repos/$OPL_APP_RELEASE_REPO/releases/$api_path" \
    -o "$NATIVE_RELEASE_RECORD_PATH"; then
    rm -f "$NATIVE_RELEASE_RECORD_PATH"
    NATIVE_RELEASE_RECORD_PATH=''
    return 1
  fi

  local discovery
  if ! discovery=$(python3 - "$NATIVE_RELEASE_RECORD_PATH" "$target_platform" "$target_architecture" <<'PY'
import json
import re
import sys

record = json.load(open(sys.argv[1], encoding="utf-8"))
platform = sys.argv[2]
architecture = sys.argv[3]
tag = record.get("tag_name")
if record.get("draft") is not False or record.get("prerelease") is not False:
    raise SystemExit(1)
if not isinstance(tag, str) or re.fullmatch(r"v[0-9]{2}\.[0-9]{1,2}\.[0-9]{1,2}(?:-r[1-9][0-9]*)?", tag) is None:
    raise SystemExit(1)
version = tag[1:]
base = f"one-person-lab-webui-{version}-{platform}-{architecture}"
required = {
    f"{base}.tar.gz",
    f"{base}.tar.gz.sha256",
    "install-web.sh",
    "install-web.sh.sha256",
    f"{base}.qualification.json",
}
assets = record.get("assets")
if not isinstance(assets, list):
    raise SystemExit(1)
by_name = {}
for asset in assets:
    if not isinstance(asset, dict) or asset.get("name") not in required:
        continue
    name = asset["name"]
    if name in by_name:
        raise SystemExit(1)
    expected_url = f"https://github.com/gaofeng21cn/one-person-lab-app/releases/download/{tag}/{name}"
    digest = asset.get("digest")
    if (
        asset.get("state") != "uploaded"
        or not isinstance(asset.get("size"), int)
        or asset["size"] <= 0
        or not isinstance(digest, str)
        or re.fullmatch(r"sha256:[0-9a-f]{64}", digest) is None
        or asset.get("browser_download_url") != expected_url
    ):
        raise SystemExit(1)
    by_name[name] = asset
if set(by_name) != required:
    raise SystemExit(1)
installer = by_name["install-web.sh"]
qualification = by_name[f"{base}.qualification.json"]
app_sha = record.get("target_commitish")
if not isinstance(app_sha, str) or re.fullmatch(r"[0-9a-f]{40}", app_sha) is None:
    raise SystemExit(1)
print("\t".join((
    version,
    app_sha,
    installer["browser_download_url"],
    installer["digest"].removeprefix("sha256:"),
    qualification["browser_download_url"],
    qualification["digest"].removeprefix("sha256:"),
)))
PY
  ); then
    rm -f "$NATIVE_RELEASE_RECORD_PATH"
    NATIVE_RELEASE_RECORD_PATH=''
    return 1
  fi

  local version app_sha installer_url installer_sha256 qualification_url qualification_sha256
  IFS=$'\t' read -r version app_sha installer_url installer_sha256 qualification_url qualification_sha256 <<< "$discovery"
  [ -n "$version" ] && [ -n "$app_sha" ] && [ -n "$installer_url" ] && [ -n "$installer_sha256" ] &&
    [ -n "$qualification_url" ] && [ -n "$qualification_sha256" ] || return 1
  if [ -n "$OPL_APP_SOURCE_REF" ] && [ "$app_sha" != "$OPL_APP_SOURCE_REF" ]; then
    printf 'Native WebUI Release target commit does not match the frozen App source ref.\n' >&2
    return 1
  fi

  NATIVE_QUALIFICATION_RECEIPT_PATH=$(mktemp "${TMPDIR:-/tmp}/opl-native-webui-qualification.XXXXXX")
  if ! curl -fsSL "$qualification_url" -o "$NATIVE_QUALIFICATION_RECEIPT_PATH"; then
    rm -f "$NATIVE_QUALIFICATION_RECEIPT_PATH"
    NATIVE_QUALIFICATION_RECEIPT_PATH=''
    return 1
  fi
  [ "$(sha256_file "$NATIVE_QUALIFICATION_RECEIPT_PATH")" = "$qualification_sha256" ] || return 1
  python3 - "$NATIVE_QUALIFICATION_RECEIPT_PATH" "$version" "$app_sha" \
    "$OPL_SHELL_SOURCE_REF" "$OPL_FRAMEWORK_SOURCE_REF" \
    "$target_platform" "$target_architecture" <<'PY' || return 1
import json
import re
import sys

receipt = json.load(open(sys.argv[1], encoding="utf-8"))
version = sys.argv[2]
app_sha = sys.argv[3]
shell_sha = sys.argv[4]
framework_sha = sys.argv[5]
platform = sys.argv[6]
architecture = sys.argv[7]
cohort = receipt.get("cohort")
lifecycle = receipt.get("lifecycle")
required_lifecycle = {
    "first_install",
    "same_version_idempotence",
    "cross_version_update",
    "rollback",
    "data_preservation",
    "http_health",
    "official_profile_first_install",
}
if (
    receipt.get("schema") != "opl_app_native_webui_qualification_receipt.v1"
    or receipt.get("status") != "passed"
    or receipt.get("version") != version
    or not isinstance(receipt.get("stable_authority_run_id"), (str, int))
    or re.fullmatch(r"[1-9][0-9]*", str(receipt.get("stable_authority_run_id"))) is None
    or not isinstance(receipt.get("release_bundle_digest"), str)
    or re.fullmatch(r"sha256:[0-9a-f]{64}", receipt["release_bundle_digest"]) is None
    or receipt.get("platform") != platform
    or receipt.get("architecture") != architecture
    or receipt.get("non_root") is not True
    or not isinstance(cohort, dict)
    or cohort.get("app_sha") != app_sha
    or re.fullmatch(r"[0-9a-f]{40}", str(cohort.get("shell_sha", ""))) is None
    or re.fullmatch(r"[0-9a-f]{40}", str(cohort.get("framework_sha", ""))) is None
    or (shell_sha != "" and cohort.get("shell_sha") != shell_sha)
    or (framework_sha != "" and cohort.get("framework_sha") != framework_sha)
    or not isinstance(lifecycle, dict)
    or set(lifecycle) != required_lifecycle
    or any(lifecycle.get(gate) != "passed" for gate in required_lifecycle)
):
    raise SystemExit(1)
PY
  OPL_NATIVE_WEBUI_MIRROR='https://github.com/gaofeng21cn/one-person-lab-app/releases/download'
  OPL_NATIVE_WEBUI_VERSION="$version"
  OPL_NATIVE_WEBUI_INSTALLER_URL="$installer_url"
  OPL_NATIVE_WEBUI_INSTALLER_SHA256="$installer_sha256"
  OPL_APP_RELEASE_SELECTOR="v$version"
}

prepare_native_installer() {
  if [ -n "$NATIVE_INSTALLER_PATH" ]; then
    return 0
  fi
  if [ -z "$OPL_NATIVE_WEBUI_MIRROR" ] || [ -z "$OPL_NATIVE_WEBUI_VERSION" ]; then
    return 1
  fi
  validate_native_mirror || return 1
  validate_native_version || return 1
  if [ -z "$OPL_NATIVE_WEBUI_INSTALLER_URL" ] || [ -z "$OPL_NATIVE_WEBUI_INSTALLER_SHA256" ]; then
    printf 'Native WebUI verifier requires an explicit URL and caller-supplied SHA256.\n' >&2
    return 1
  fi
  local expected_installer_url
  expected_installer_url=$(expected_native_installer_url)
  if [ "$OPL_NATIVE_WEBUI_INSTALLER_URL" != "$expected_installer_url" ]; then
    printf 'Native WebUI verifier URL must be the install-web.sh asset from the selected App Release version.\n' >&2
    return 1
  fi
  case "$OPL_NATIVE_WEBUI_INSTALLER_SHA256" in
    *[!0-9a-f]*|'')
      printf 'Native WebUI verifier SHA256 must be 64 lowercase hexadecimal characters.\n' >&2
      return 1
      ;;
  esac
  if [ "${#OPL_NATIVE_WEBUI_INSTALLER_SHA256}" -ne 64 ]; then
    printf 'Native WebUI verifier SHA256 must be 64 lowercase hexadecimal characters.\n' >&2
    return 1
  fi
  NATIVE_INSTALLER_PATH=$(mktemp "${TMPDIR:-/tmp}/opl-native-webui-installer.XXXXXX")
  if ! curl -fsSL "$OPL_NATIVE_WEBUI_INSTALLER_URL" -o "$NATIVE_INSTALLER_PATH"; then
    cleanup_native_installer
    NATIVE_INSTALLER_PATH=''
    return 1
  fi
  local actual_sha256
  actual_sha256=$(sha256_file "$NATIVE_INSTALLER_PATH") || return 1
  if [ "$actual_sha256" != "$OPL_NATIVE_WEBUI_INSTALLER_SHA256" ]; then
    printf 'Native WebUI verifier SHA256 mismatch.\n' >&2
    cleanup_native_installer
    NATIVE_INSTALLER_PATH=''
    return 1
  fi
  if ! grep -Fq -- 'dev.onepersonlab.opl-native-webui-artifact.v1' "$NATIVE_INSTALLER_PATH" ||
    ! grep -Fq -- '--probe-artifact' "$NATIVE_INSTALLER_PATH"; then
    printf 'Native WebUI verifier does not implement the OPL immutable artifact guard.\n' >&2
    cleanup_native_installer
    NATIVE_INSTALLER_PATH=''
    return 1
  fi
}

verified_native_artifact_available() {
  prepare_native_installer || return 1
  bash "$NATIVE_INSTALLER_PATH" \
    --mirror "$OPL_NATIVE_WEBUI_MIRROR" \
    --version "$OPL_NATIVE_WEBUI_VERSION" \
    --probe-artifact >/dev/null 2>&1
}

resolve_install_route() {
  local platform runtime_form
  platform=$(platform_family)
  runtime_form=$(normalize_runtime_form) || return 1

  if [ "$platform" = "unsupported" ]; then
    printf 'Unsupported platform for OPL App installer: %s\n' "$(uname -s)" >&2
    exit 1
  fi
  case "$INSTALL_SCENARIO" in
    personal|server|isolated)
      ;;
    *)
      printf 'Unsupported install scenario: %s\n' "$INSTALL_SCENARIO" >&2
      exit 1
      ;;
  esac

  if [ "$runtime_form" = "headless" ]; then
    printf 'headless\n'
    return
  fi
  if [ "$INSTALL_SCENARIO" = "server" ] || [ "$INSTALL_SCENARIO" = "isolated" ]; then
    if [ "$runtime_form" != "auto" ] && [ "$runtime_form" != "webui" ] && [ "$runtime_form" != "container-webui" ]; then
      printf 'Server or isolated installs require the Container WebUI runtime form.\n' >&2
      exit 1
    fi
    printf 'container-webui\n'
    return
  fi

  case "$runtime_form" in
    desktop)
      if [ "$platform" != "macos" ]; then
        printf 'Desktop installation is currently supported only on macOS.\n' >&2
        exit 1
      fi
      printf 'desktop\n'
      ;;
    native-webui)
      if ! native_target_supported; then
        printf 'Native WebUI is currently supported only on Linux x86_64 and macOS arm64 hosts.\n' >&2
        exit 1
      fi
      if native_configuration_is_empty; then
        discover_public_native_webui || true
      fi
      if ! verified_native_artifact_available; then
        printf 'A verified OPL Native WebUI artifact is required for --native-webui.\n' >&2
        printf 'Publish the exact Native asset set or provide mirror/version plus an exact verifier URL and SHA256 for an OPL-owned immutable candidate.\n' >&2
        exit 1
      fi
      printf 'native-webui\n'
      ;;
    container-webui)
      printf 'container-webui\n'
      ;;
    webui)
      if native_target_supported; then
        if native_configuration_is_empty; then
          discover_public_native_webui || true
        fi
        if native_mirror_is_local_development; then
          printf 'Local Native WebUI candidates require explicit --native-webui selection; using Container WebUI.\n' >&2
          printf 'container-webui\n'
        elif verified_native_artifact_available; then
          printf 'native-webui\n'
        else
          printf 'No verified Native WebUI artifact is available; using Container WebUI.\n' >&2
          printf 'container-webui\n'
        fi
      else
        printf 'container-webui\n'
      fi
      ;;
    auto)
      case "$platform" in
        macos)
          printf 'desktop\n'
          ;;
        linux)
          if native_configuration_is_empty; then
            discover_public_native_webui || true
          fi
          if native_mirror_is_local_development; then
            printf 'Local Native WebUI candidates require explicit --native-webui selection; using Container WebUI.\n' >&2
            printf 'container-webui\n'
          elif verified_native_artifact_available; then
            printf 'native-webui\n'
          else
            printf 'No verified OPL Native WebUI artifact is available; using Container WebUI.\n' >&2
            printf 'container-webui\n'
          fi
          ;;
        windows)
          printf 'container-webui\n'
          ;;
      esac
      ;;
  esac
}

install_desktop_bootstrap() {
  if ! arg_present "--with-app"; then
    INSTALL_ARGS+=("--with-app")
  fi
  export OPL_RELEASE_VERSION OPL_RELEASE_REPO
  curl -fsSL "$OPL_INSTALL_SCRIPT_URL" | bash -s -- "${INSTALL_ARGS[@]}"
}

install_headless_base() {
  if ! arg_present "--headless"; then
    INSTALL_ARGS+=("--headless")
  fi
  if ! arg_present "--skip-packages" && ! arg_present "--package" && ! arg_present "--packages"; then
    INSTALL_ARGS+=("--skip-packages")
  fi
  curl -fsSL "$OPL_INSTALL_SCRIPT_URL" | bash -s -- "${INSTALL_ARGS[@]}"
}

install_container_webui() {
  local container_args=()
  if [ -n "$OPL_CONTAINER_WEBUI_TAG" ]; then
    container_args+=("--tag" "$OPL_CONTAINER_WEBUI_TAG")
  fi
  if [ "$AUTHORIZE_LOCAL_APP_YES" = "1" ]; then
    container_args+=("--yes")
  fi
  if [ "$OPEN_OPTION_EXPLICIT" = "--no-open" ]; then
    container_args+=("--no-open")
  fi
  if [ "${#container_args[@]}" -eq 0 ]; then
    curl -fsSL "$OPL_DOCKER_WEBUI_INSTALLER_URL" | bash -s --
  else
    curl -fsSL "$OPL_DOCKER_WEBUI_INSTALLER_URL" | bash -s -- "${container_args[@]}"
  fi
}

install_native_webui() {
  if native_configuration_is_empty; then
    discover_public_native_webui || true
  fi
  prepare_native_installer || {
    printf 'OPL Native WebUI installer or immutable candidate metadata is unavailable.\n' >&2
    exit 1
  }
  bash "$NATIVE_INSTALLER_PATH" \
    --mirror "$OPL_NATIVE_WEBUI_MIRROR" \
    --version "$OPL_NATIVE_WEBUI_VERSION"
}

count_quarantine_attrs() {
  local target="$1"
  local count=0
  local item
  while IFS= read -r -d '' item; do
    if xattr -p com.apple.quarantine "$item" >/dev/null 2>&1; then
      count=$((count + 1))
    fi
  done < <(find "$target" -print0)
  printf '%s\n' "$count"
}

confirm_local_app_authorization() {
  if [ "$AUTHORIZE_LOCAL_APP_YES" = "1" ]; then
    return 0
  fi
  if [ ! -r /dev/tty ]; then
    printf 'Local App authorization needs confirmation. Re-run with --yes when using a non-interactive installer.\n' >&2
    exit 1
  fi
  {
    printf 'One Person Lab will remove macOS quarantine from this local App bundle:\n'
    printf '  %s\n' "$OPL_LOCAL_APP_PATH"
    printf 'This clears the local quarantine marker so the App and nested tools launch without repeated System Settings approval.\n'
    printf 'Type "authorize" to continue: '
  } > /dev/tty
  local reply
  if ! IFS= read -r reply < /dev/tty; then
    printf 'Local App authorization needs a controlling terminal, or pass --yes for explicit non-interactive confirmation.\n' >&2
    exit 1
  fi
  if [ "$reply" != "authorize" ]; then
    printf 'Local App authorization cancelled.\n' >&2
    exit 1
  fi
}

diagnostic_status() {
  local label="$1"
  shift
  if "$@" >/tmp/opl-local-app-authorization."$label".log 2>&1; then
    printf 'passed\n'
  else
    printf 'failed\n'
  fi
}

print_stable_macos_next_steps() {
  local repo_url="https://github.com/$OPL_APP_RELEASE_REPO"
  local docs_url="$repo_url/blob/$OPL_APP_DOCS_REF/docs/user-guides/site/index.html"
  local pdf_url="$repo_url/blob/$OPL_APP_DOCS_REF/docs/user-guides/macos-app-install-slides.pdf"
  local pptx_url="$repo_url/blob/$OPL_APP_DOCS_REF/docs/user-guides/macos-app-install-slides.pptx"
  local releases_url="$repo_url/releases/latest"

  printf 'Next steps:\n'
  printf '  1. If the App is not already open, open: %s\n' "$OPL_LOCAL_APP_PATH"
  printf '  2. Follow the first-run screen until One Person Lab is ready to launch.\n'
  printf '  3. User guide: %s\n' "$docs_url"
  printf '  4. Shareable PDF: %s\n' "$pdf_url"
  printf '  5. Shareable PPTX: %s\n' "$pptx_url"
  printf '  6. Latest release assets: %s\n' "$releases_url"
  printf 'If macOS still asks for repeated approval, use a reviewed source checkout and run:\n'
  printf '  ./install.sh --authorize-local-app-only --app-path "%s" --yes\n' "$OPL_LOCAL_APP_PATH"
}

run_with_sudo_fallback() {
  local label="$1"
  shift
  if "$@" >/tmp/opl-stable-macos-install."$label".log 2>&1; then
    return 0
  fi
  if ! command -v sudo >/dev/null 2>&1; then
    cat /tmp/opl-stable-macos-install."$label".log >&2 || true
    return 1
  fi
  printf 'Retrying %s with administrator permission.\n' "$label" >&2
  sudo "$@" >>/tmp/opl-stable-macos-install."$label".log 2>&1
}

ensure_app_target_path() {
  case "$OPL_LOCAL_APP_PATH" in
    /*.app)
      ;;
    *)
      printf 'App path must be an absolute .app bundle path: %s\n' "$OPL_LOCAL_APP_PATH" >&2
      exit 1
      ;;
  esac
}

authorize_local_app() {
  if ! is_macos; then
    printf 'Local App authorization is macOS-only.\n' >&2
    exit 1
  fi
  ensure_app_target_path
  if [ ! -d "$OPL_LOCAL_APP_PATH" ]; then
    printf 'App bundle not found: %s\n' "$OPL_LOCAL_APP_PATH" >&2
    printf 'Copy One Person Lab.app into /Applications first, or pass --app-path <path>.\n' >&2
    exit 1
  fi
  if ! command -v xattr >/dev/null 2>&1; then
    printf 'Missing required command: xattr\n' >&2
    exit 1
  fi
  if ! command -v find >/dev/null 2>&1; then
    printf 'Missing required command: find\n' >&2
    exit 1
  fi

  confirm_local_app_authorization

  local before_quarantine
  local after_quarantine
  local codesign_status
  local spctl_status
  before_quarantine=$(count_quarantine_attrs "$OPL_LOCAL_APP_PATH")
  run_with_sudo_fallback xattr xattr -dr com.apple.quarantine "$OPL_LOCAL_APP_PATH" || {
    printf 'Failed to remove macOS quarantine from: %s\n' "$OPL_LOCAL_APP_PATH" >&2
    cat /tmp/opl-stable-macos-install.xattr.log >&2 || true
    exit 1
  }
  after_quarantine=$(count_quarantine_attrs "$OPL_LOCAL_APP_PATH")

  if command -v codesign >/dev/null 2>&1; then
    codesign_status=$(diagnostic_status codesign codesign --verify --deep --strict --verbose=2 "$OPL_LOCAL_APP_PATH")
  else
    codesign_status='skipped_missing_codesign'
  fi
  if command -v spctl >/dev/null 2>&1; then
    spctl_status=$(diagnostic_status spctl spctl --assess --type execute --verbose=4 "$OPL_LOCAL_APP_PATH")
  else
    spctl_status='skipped_missing_spctl'
  fi

  printf 'One Person Lab local App authorization finished.\n'
  printf '  app_path: %s\n' "$OPL_LOCAL_APP_PATH"
  printf '  quarantine_before: %s\n' "$before_quarantine"
  printf '  quarantine_after: %s\n' "$after_quarantine"
  printf '  codesign_status: %s\n' "$codesign_status"
  printf '  spctl_status: %s\n' "$spctl_status"
  if [ "$after_quarantine" != "0" ]; then
    printf 'Some quarantine attributes remain. Inspect /tmp/opl-local-app-authorization.xattr.log and retry from an administrator account.\n' >&2
    exit 1
  fi
  if [ "$spctl_status" != "passed" ]; then
    printf 'Gatekeeper assessment did not pass. The Stable install path records this as an unsigned local-authorization diagnostic after quarantine removal.\n' >&2
  fi
}

confirm_stable_macos_install() {
  if [ "$AUTHORIZE_LOCAL_APP_YES" = "1" ]; then
    return 0
  fi
  if [ ! -r /dev/tty ]; then
    printf 'macOS App install needs confirmation. Re-run with --yes when using a non-interactive installer.\n' >&2
    exit 1
  fi
  {
    printf 'One Person Lab will install this App bundle with local macOS authorization:\n'
    printf '  %s\n' "$OPL_LOCAL_APP_PATH"
    printf 'This may replace an existing App at that path, remove recursive quarantine, and open the App.\n'
    printf 'Type "install" to continue: '
  } > /dev/tty
  local reply
  if ! IFS= read -r reply < /dev/tty; then
    printf 'macOS App install needs a controlling terminal, or pass --yes for explicit non-interactive confirmation.\n' >&2
    exit 1
  fi
  if [ "$reply" != "install" ]; then
    printf 'macOS App install cancelled.\n' >&2
    exit 1
  fi
}

validate_sha256_value() {
  case "$1" in
    *[!0-9a-f]*|'')
      return 1
      ;;
  esac
  [ "${#1}" -eq 64 ]
}

validate_release_tag() {
  case "$1" in
    v[0-9A-Za-z._-]*)
      ;;
    *)
      return 1
      ;;
  esac
  case "$1" in
    *[!0-9A-Za-z._-]*)
      return 1
      ;;
  esac
}

release_record_value() {
  local record_path="$1"
  local key_path="$2"
  plutil -extract "$key_path" raw -o - "$record_path"
}

download_release_record() {
  local selector="$1"
  local record_path="$2"
  local endpoint api_path curl_error_path curl_status=0
  if ! command -v plutil >/dev/null 2>&1; then
    printf 'plutil is required to verify the exact GitHub Release record.\n' >&2
    return 1
  fi
  if [ "$selector" = "latest" ]; then
    api_path="repos/$OPL_APP_RELEASE_REPO/releases/latest"
  else
    validate_release_tag "$selector" || {
      printf 'Invalid GitHub Release tag: %s\n' "$selector" >&2
      return 1
    }
    api_path="repos/$OPL_APP_RELEASE_REPO/releases/tags/$selector"
  fi
  endpoint="https://api.github.com/$api_path"
  curl_error_path="${record_path}.curl.stderr"
  if curl -fsSL \
    -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -H 'User-Agent: one-person-lab-installer' \
    "$endpoint" \
    -o "$record_path" \
    2>"$curl_error_path"; then
    rm -f "$curl_error_path"
    return 0
  else
    curl_status=$?
  fi
  rm -f "$record_path"
  if command -v gh >/dev/null 2>&1 \
    && GH_PROMPT_DISABLED=1 gh api --hostname github.com \
      -H 'Accept: application/vnd.github+json' \
      -H 'X-GitHub-Api-Version: 2022-11-28' \
      "$api_path" >"$record_path"; then
    rm -f "$curl_error_path"
    printf 'Anonymous GitHub Release API request failed; used authenticated gh fallback.\n' >&2
    return 0
  fi
  rm -f "$record_path"
  if [ -f "$curl_error_path" ]; then
    cat "$curl_error_path" >&2
    rm -f "$curl_error_path"
  fi
  return "$curl_status"
}

resolve_release_record() {
  local work_dir="$1"
  local requested_tag="$STABLE_MACOS_RELEASE_TAG"
  local selector="${requested_tag:-latest}"
  local record_path="$work_dir/github-release.json"
  local resolved_tag draft prerelease
  download_release_record "$selector" "$record_path" || return 1
  resolved_tag=$(release_record_value "$record_path" tag_name) || {
    printf 'GitHub Release record does not contain tag_name.\n' >&2
    return 1
  }
  validate_release_tag "$resolved_tag" || {
    printf 'GitHub Release record returned an invalid tag: %s\n' "$resolved_tag" >&2
    return 1
  }
  if [ -n "$requested_tag" ] && [ "$resolved_tag" != "$requested_tag" ]; then
    printf 'GitHub Release record tag mismatch: expected %s, got %s.\n' "$requested_tag" "$resolved_tag" >&2
    return 1
  fi
  draft=$(release_record_value "$record_path" draft) || {
    printf 'GitHub Release record does not contain draft state.\n' >&2
    return 1
  }
  if [ "$draft" != "false" ]; then
    printf 'macOS App install requires a published GitHub Release record.\n' >&2
    return 1
  fi
  prerelease=$(release_record_value "$record_path" prerelease) || {
    printf 'GitHub Release record does not contain prerelease state.\n' >&2
    return 1
  }
  case "$prerelease" in
    true|false)
      ;;
    *)
      printf 'GitHub Release record has an invalid prerelease state.\n' >&2
      return 1
      ;;
  esac
  STABLE_MACOS_RELEASE_TAG="$resolved_tag"
  STABLE_MACOS_RELEASE_RECORD_PATH="$record_path"
  STABLE_MACOS_RELEASE_PRERELEASE="$prerelease"
}

resolve_latest_release_tag() {
  local work_dir="$1"
  resolve_release_record "$work_dir" || return 1
  printf '%s\n' "$STABLE_MACOS_RELEASE_TAG"
}

RELEASE_ASSET_URL=''
RELEASE_ASSET_SHA256=''

resolve_release_asset() {
  local record_path="$1"
  local expected_name="$2"
  local index=0 name digest url matches=0
  RELEASE_ASSET_URL=''
  RELEASE_ASSET_SHA256=''
  while name=$(release_record_value "$record_path" "assets.$index.name" 2>/dev/null); do
    if [ "$name" = "$expected_name" ]; then
      matches=$((matches + 1))
      digest=$(release_record_value "$record_path" "assets.$index.digest") || return 1
      url=$(release_record_value "$record_path" "assets.$index.browser_download_url") || return 1
      case "$digest" in
        sha256:*)
          digest="${digest#sha256:}"
          ;;
        *)
          return 1
          ;;
      esac
      validate_sha256_value "$digest" || return 1
      RELEASE_ASSET_SHA256="$digest"
      RELEASE_ASSET_URL="$url"
    fi
    index=$((index + 1))
  done
  [ "$matches" -eq 1 ]
}

require_caller_dmg_sha256() {
  if ! validate_sha256_value "$STABLE_MACOS_DMG_SHA256"; then
    printf 'Custom DMG URL or path requires --dmg-sha256 with 64 lowercase hexadecimal characters.\n' >&2
    return 1
  fi
}

verify_resolved_dmg() {
  local dmg_path="$1"
  local expected_sha256="$2"
  verify_file_sha256 "$dmg_path" "$expected_sha256" 'DMG'
}

verify_file_sha256() {
  local file_path="$1"
  local expected_sha256="$2"
  local label="$3"
  local actual_sha256
  actual_sha256=$(sha256_file "$file_path") || return 1
  if [ "$actual_sha256" != "$expected_sha256" ]; then
    printf '%s SHA256 mismatch: expected %s, got %s.\n' "$label" "$expected_sha256" "$actual_sha256" >&2
    return 1
  fi
}

release_asset_name() {
  local tag="$1"
  local profile="$2"
  local version="${tag#v}"
  case "$profile" in
    full)
      printf 'One-Person-Lab-Full-%s-mac-arm64.dmg\n' "$version"
      ;;
    standard)
      printf 'One-Person-Lab-%s-mac-arm64.dmg\n' "$version"
      ;;
    *)
      printf 'Unsupported --stable-macos-install package profile: %s\n' "$profile" >&2
      printf 'Expected one of: full, standard\n' >&2
      exit 1
      ;;
  esac
}

DOWNLOAD_HTTP_CODE=''

download_release_file() {
  local url="$1"
  local output_path="$2"
  local label="$3"
  local curl_status=0
  DOWNLOAD_HTTP_CODE=''
  printf 'Downloading One Person Lab App %s:\n  %s\n' "$label" "$url" >&2
  DOWNLOAD_HTTP_CODE=$(curl --http1.1 --connect-timeout 20 --max-time 1800 --retry 3 --retry-delay 2 -fsSL -w '%{http_code}' "$url" -o "$output_path") || curl_status=$?
  if [ "$curl_status" -eq 0 ]; then
    return 0
  fi
  rm -f "$output_path"
  return "$curl_status"
}

component_manifest_value() {
  local manifest_path="$1"
  local key_path="$2"
  plutil -extract "$key_path" raw -o - "$manifest_path"
}

component_manifest_array_json() {
  local manifest_path="$1"
  local key_path="$2"
  plutil -extract "$key_path" json -o - "$manifest_path"
}

component_manifest_has_exact_artifact() {
  local manifest_path="$1"
  local asset_name="$2"
  local asset_sha256="$3"
  local tag="$4"
  local expected_url="https://github.com/$OPL_APP_RELEASE_REPO/releases/download/$tag/$asset_name"
  local index=0 name digest ref matches=0
  while name=$(component_manifest_value "$manifest_path" "artifacts.$index.name" 2>/dev/null); do
    if [ "$name" = "$asset_name" ]; then
      digest=$(component_manifest_value "$manifest_path" "artifacts.$index.digest") || return 1
      ref=$(component_manifest_value "$manifest_path" "artifacts.$index.ref") || return 1
      if [ "$digest" = "sha256:$asset_sha256" ] && [ "$ref" = "$expected_url" ]; then
        matches=$((matches + 1))
      fi
    fi
    index=$((index + 1))
  done
  [ "$matches" -eq 1 ]
}

verify_release_installer_bootstrap() {
  local record_path="$1"
  local manifest_path="$2"
  local tag="$3"
  local installer_name='opl-app-installer.sh'
  local expected_url

  [ "${0##*/}" = "$installer_name" ] || return 0
  if [ ! -f "$0" ] || [ -L "$0" ]; then
    printf 'Release installer bootstrap must be a regular file: %s\n' "$0" >&2
    return 1
  fi
  resolve_release_asset "$record_path" "$installer_name" || {
    printf 'GitHub Release record has no unique digest-bound installer bootstrap asset.\n' >&2
    return 1
  }
  expected_url="https://github.com/$OPL_APP_RELEASE_REPO/releases/download/$tag/$installer_name"
  if [ "$RELEASE_ASSET_URL" != "$expected_url" ]; then
    printf 'GitHub Release installer bootstrap URL mismatch.\n' >&2
    return 1
  fi
  component_manifest_has_exact_artifact \
    "$manifest_path" "$installer_name" "$RELEASE_ASSET_SHA256" "$tag" || {
    printf 'Component manifest does not bind one exact installer bootstrap from the selected Release.\n' >&2
    return 1
  }
  verify_file_sha256 "$0" "$RELEASE_ASSET_SHA256" 'Installer bootstrap'
}

download_and_validate_component_manifest() {
  local work_dir="$1"
  local record_path="$2"
  local tag="$3"
  local standard_asset_name="$4"
  local standard_asset_sha256="$5"
  local manifest_path expected_url quality build_trigger preview_kind stable_qualified non_stable_notice
  local release_version version release_tag primary_name primary_digest manifest_ref release_url manifest_digest
  local skipped_gates failed_gates manifest_asset_sha256

  if ! resolve_release_asset "$record_path" 'opl-app-component-manifest.json'; then
    printf 'GitHub Release record has no unique digest-bound App component manifest asset.\n' >&2
    return 1
  fi
  expected_url="https://github.com/$OPL_APP_RELEASE_REPO/releases/download/$tag/opl-app-component-manifest.json"
  if [ "$RELEASE_ASSET_URL" != "$expected_url" ]; then
    printf 'GitHub Release component manifest URL mismatch.\n' >&2
    return 1
  fi
  manifest_path="$work_dir/opl-app-component-manifest.json"
  download_release_file "$RELEASE_ASSET_URL" "$manifest_path" 'component manifest' || return 1
  verify_file_sha256 "$manifest_path" "$RELEASE_ASSET_SHA256" 'Component manifest' || return 1
  manifest_asset_sha256="$RELEASE_ASSET_SHA256"

  [ "$(component_manifest_value "$manifest_path" surface_kind)" = 'opl_app_component_manifest.v1' ] || {
    printf 'Component manifest surface kind is invalid.\n' >&2
    return 1
  }
  [ "$(component_manifest_value "$manifest_path" component_id)" = 'opl-app' ] || {
    printf 'Component manifest component id is invalid.\n' >&2
    return 1
  }
  release_tag=$(component_manifest_value "$manifest_path" release_tag) || return 1
  release_version=$(component_manifest_value "$manifest_path" release_version 2>/dev/null || true)
  version=$(component_manifest_value "$manifest_path" version) || return 1
  primary_name=$(component_manifest_value "$manifest_path" primary_artifact.name) || return 1
  primary_digest=$(component_manifest_value "$manifest_path" primary_artifact.digest) || return 1
  manifest_ref=$(component_manifest_value "$manifest_path" component_manifest_ref) || return 1
  release_url=$(component_manifest_value "$manifest_path" release_url) || return 1
  manifest_digest=$(component_manifest_value "$manifest_path" component_manifest_digest) || return 1
  [ "$release_tag" = "$tag" ] || {
    printf 'Component manifest release tag does not match the selected GitHub Release.\n' >&2
    return 1
  }
  [ "$version" = "${tag#v}" ] || {
    printf 'Component manifest version does not match the selected GitHub Release.\n' >&2
    return 1
  }
  if [ -n "$release_version" ] && [ "$release_version" != "${tag#v}" ]; then
    printf 'Component manifest release version does not match the selected GitHub Release.\n' >&2
    return 1
  fi
  [ "$primary_name" = "$standard_asset_name" ] && [ "$primary_digest" = "sha256:$standard_asset_sha256" ] || {
    printf 'Component manifest primary Standard DMG identity does not match the selected Release.\n' >&2
    return 1
  }
  component_manifest_has_exact_artifact "$manifest_path" "$standard_asset_name" "$standard_asset_sha256" "$tag" || {
    printf 'Component manifest does not bind one exact Standard DMG artifact from the selected Release.\n' >&2
    return 1
  }
  [ "$manifest_ref" = "$expected_url" ] || {
    printf 'Component manifest reference does not match its exact GitHub Release asset URL.\n' >&2
    return 1
  }
  [ "$release_url" = "https://github.com/$OPL_APP_RELEASE_REPO/releases/tag/$tag" ] || {
    printf 'Component manifest release URL does not match the selected GitHub Release.\n' >&2
    return 1
  }
  case "$manifest_digest" in
    sha256:*)
      validate_sha256_value "${manifest_digest#sha256:}" || {
        printf 'Component manifest identity digest is invalid.\n' >&2
        return 1
      }
      ;;
    *)
      printf 'Component manifest identity digest is invalid.\n' >&2
      return 1
      ;;
  esac

  quality=$(component_manifest_value "$manifest_path" quality_status 2>/dev/null || true)
  build_trigger=$(component_manifest_value "$manifest_path" build_trigger 2>/dev/null || true)
  preview_kind=$(component_manifest_value "$manifest_path" preview_kind 2>/dev/null || true)
  stable_qualified=$(component_manifest_value "$manifest_path" qualification_disclosure.stable_qualified 2>/dev/null || true)
  non_stable_notice=$(component_manifest_value "$manifest_path" qualification_disclosure.non_stable_notice 2>/dev/null || true)
  skipped_gates=$(component_manifest_array_json "$manifest_path" qualification_disclosure.skipped_gates 2>/dev/null || true)
  failed_gates=$(component_manifest_array_json "$manifest_path" qualification_disclosure.failed_gates 2>/dev/null || true)

  if [ -z "$quality$build_trigger$preview_kind$stable_qualified$non_stable_notice$skipped_gates$failed_gates" ]; then
    [ "$STABLE_MACOS_RELEASE_PRERELEASE" = false ] || {
      printf 'A legacy component manifest cannot describe a prerelease App.\n' >&2
      return 1
    }
    printf 'Release quality: unasserted legacy release (V3 Stable/Preview metadata unavailable).\n'
    printf 'Legacy release manifest predates V3 qualification disclosure.\n'
  else
    [ -n "$quality" ] && [ -n "$build_trigger" ] && [ -n "$preview_kind" ] \
      && [ -n "$stable_qualified" ] && [ -n "$non_stable_notice" ] \
      && [ -n "$skipped_gates" ] && [ -n "$failed_gates" ] || {
      printf 'Component manifest must provide every V3 quality and qualification disclosure field.\n' >&2
      return 1
    }
    case "$quality:$build_trigger:$preview_kind:$stable_qualified:$non_stable_notice:$STABLE_MACOS_RELEASE_PRERELEASE" in
      stable:manual:null:true:false:false|stable:automated:null:true:false:false)
        [ "$skipped_gates" = '[]' ] || {
          printf 'Stable component manifest must not claim skipped qualification gates.\n' >&2
          return 1
        }
        printf 'Release quality: Stable\n'
        ;;
      preview:manual:dev:false:true:false)
        [ "$skipped_gates" != '[]' ] || {
          printf 'Preview component manifest must disclose skipped qualification gates.\n' >&2
          return 1
        }
        printf 'Release quality: Preview (Dev)\n'
        ;;
      preview:automated:nightly:false:true:true)
        [ "$skipped_gates" != '[]' ] || {
          printf 'Preview component manifest must disclose skipped qualification gates.\n' >&2
          return 1
        }
        printf 'Release quality: Preview (Nightly)\n'
        ;;
      *)
        printf 'Component manifest has an invalid quality, trigger, preview-kind, disclosure, or release-prerelease combination.\n' >&2
        return 1
        ;;
    esac
    if [ "$quality" = preview ]; then
      printf 'Non-Stable release: full Stable qualification is not asserted.\n'
    fi
    printf 'Skipped qualification gates: %s\n' "$skipped_gates"
    printf 'Failed qualification gates: %s\n' "$failed_gates"
  fi
  printf 'Latest pointer selects this exact release but does not change its declared quality.\n'
  verify_release_installer_bootstrap "$record_path" "$manifest_path" "$tag" || return 1

  STABLE_MACOS_COMPONENT_MANIFEST_PATH="$manifest_path"
  STABLE_MACOS_COMPONENT_MANIFEST_SHA256="$manifest_asset_sha256"
  STABLE_MACOS_RELEASE_QUALITY_ASSERTED=1
}

download_or_use_dmg() {
  local work_dir="$1"
  local record_path tag asset_name url expected_url dmg_path download_status expected_sha256
  local standard_asset_name standard_asset_sha256
  STABLE_MACOS_RESOLVED_DMG_PATH=''
  STABLE_MACOS_RESOLVED_DMG_SHA256=''
  STABLE_MACOS_RELEASE_QUALITY_ASSERTED=0
  if [ -n "$STABLE_MACOS_DMG_PATH" ] || [ -n "$STABLE_MACOS_DMG_URL" ]; then
    require_caller_dmg_sha256 || return 1
    if [ -n "$STABLE_MACOS_DMG_PATH" ]; then
      if [ ! -f "$STABLE_MACOS_DMG_PATH" ]; then
        printf 'DMG path not found: %s\n' "$STABLE_MACOS_DMG_PATH" >&2
        return 1
      fi
      STABLE_MACOS_RESOLVED_DMG_PATH="$STABLE_MACOS_DMG_PATH"
    else
      asset_name="${STABLE_MACOS_DMG_URL##*/}"
      [ -n "$asset_name" ] || asset_name='custom.dmg'
      dmg_path="$work_dir/$asset_name"
      download_release_file "$STABLE_MACOS_DMG_URL" "$dmg_path" 'custom DMG' || return 1
      STABLE_MACOS_RESOLVED_DMG_PATH="$dmg_path"
    fi
    STABLE_MACOS_RESOLVED_DMG_SHA256="$STABLE_MACOS_DMG_SHA256"
    verify_resolved_dmg "$STABLE_MACOS_RESOLVED_DMG_PATH" "$STABLE_MACOS_RESOLVED_DMG_SHA256" || return 1
    printf 'Release quality: not asserted for a custom DMG source.\n'
    return 0
  fi

  if [ -z "$STABLE_MACOS_RELEASE_TAG" ]; then
    resolve_latest_release_tag "$work_dir" >/dev/null || return 1
  else
    resolve_release_record "$work_dir" || return 1
  fi
  record_path="$STABLE_MACOS_RELEASE_RECORD_PATH"
  tag="$STABLE_MACOS_RELEASE_TAG"
  asset_name=$(release_asset_name "$tag" "$STABLE_MACOS_PACKAGE_PROFILE")
  if ! resolve_release_asset "$record_path" "$asset_name"; then
    if [ "$STABLE_MACOS_PACKAGE_PROFILE" = "full" ] && [ "$STABLE_MACOS_PACKAGE_PROFILE_EXPLICIT" = "0" ]; then
      asset_name=$(release_asset_name "$tag" standard)
      printf 'Full DMG is not published for %s; continuing with the Standard DMG.\n' "$tag" >&2
      resolve_release_asset "$record_path" "$asset_name" || {
        printf 'GitHub Release record has no unique digest-bound Standard DMG asset: %s\n' "$asset_name" >&2
        return 1
      }
    else
      printf 'GitHub Release record has no unique digest-bound DMG asset: %s\n' "$asset_name" >&2
      return 1
    fi
  fi
  expected_url="https://github.com/$OPL_APP_RELEASE_REPO/releases/download/$tag/$asset_name"
  if [ "$RELEASE_ASSET_URL" != "$expected_url" ]; then
    printf 'GitHub Release asset URL mismatch for %s.\n' "$asset_name" >&2
    return 1
  fi
  expected_sha256="$RELEASE_ASSET_SHA256"

  url="$RELEASE_ASSET_URL"
  dmg_path="$work_dir/$asset_name"
  if download_release_file "$url" "$dmg_path" 'DMG'; then
    STABLE_MACOS_RESOLVED_DMG_PATH="$dmg_path"
  else
    download_status=$?
    return "$download_status"
  fi

  STABLE_MACOS_RESOLVED_DMG_SHA256="$expected_sha256"
  verify_resolved_dmg "$STABLE_MACOS_RESOLVED_DMG_PATH" "$STABLE_MACOS_RESOLVED_DMG_SHA256" || return 1
  standard_asset_name=$(release_asset_name "$tag" standard)
  resolve_release_asset "$record_path" "$standard_asset_name" || {
    printf 'GitHub Release record has no unique digest-bound Standard DMG asset: %s\n' "$standard_asset_name" >&2
    return 1
  }
  standard_asset_sha256="$RELEASE_ASSET_SHA256"
  download_and_validate_component_manifest \
    "$work_dir" "$record_path" "$tag" "$standard_asset_name" "$standard_asset_sha256"
}

copy_app_from_dmg() {
  local dmg_path="$1"
  local work_dir="$2"
  local mount_dir="$work_dir/mount"
  local source_app
  local source_apps=()
  mkdir -p "$mount_dir"
  hdiutil attach -nobrowse -readonly -mountpoint "$mount_dir" "$dmg_path" >/tmp/opl-stable-macos-install.hdiutil-attach.log
  while IFS= read -r candidate; do source_apps+=("$candidate"); done < <(
    find "$mount_dir" -maxdepth 2 -type d -name '*.app' -print | LC_ALL=C sort
  )
  if [ "${#source_apps[@]}" -ne 1 ]; then
    printf 'Mounted DMG must contain exactly one App bundle; found %s.\n' "${#source_apps[@]}" >&2
    exit 1
  fi
  source_app="${source_apps[0]}"
  if [ ! -d "$source_app" ] || [ -L "$source_app" ]; then
    printf 'Mounted DMG App bundle path is invalid.\n' >&2
    exit 1
  fi
  ensure_app_target_path
  run_with_sudo_fallback mkdir mkdir -p "$(dirname "$OPL_LOCAL_APP_PATH")" || {
    printf 'Failed to prepare App target directory: %s\n' "$(dirname "$OPL_LOCAL_APP_PATH")" >&2
    exit 1
  }
  if [ -e "$OPL_LOCAL_APP_PATH" ]; then
    run_with_sudo_fallback remove-existing-app rm -rf "$OPL_LOCAL_APP_PATH" || {
      printf 'Failed to replace existing App bundle: %s\n' "$OPL_LOCAL_APP_PATH" >&2
      exit 1
    }
  fi
  run_with_sudo_fallback copy-app ditto "$source_app" "$OPL_LOCAL_APP_PATH" || {
    printf 'Failed to copy App bundle into: %s\n' "$OPL_LOCAL_APP_PATH" >&2
    exit 1
  }
  hdiutil detach "$mount_dir" >/tmp/opl-stable-macos-install.hdiutil-detach.log 2>&1 || true
}

stable_macos_install() {
  if ! is_macos; then
    printf 'Stable macOS App install is macOS-only.\n' >&2
    exit 1
  fi
  for required_command in curl hdiutil ditto find plutil xattr; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
      printf 'Missing required command: %s\n' "$required_command" >&2
      exit 1
    fi
  done
  ensure_app_target_path
  confirm_stable_macos_install

  STABLE_MACOS_WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/opl-stable-macos-install.XXXXXX")
  cleanup_stable_macos_install() {
    if [ -n "$STABLE_MACOS_WORK_DIR" ] && [ -d "$STABLE_MACOS_WORK_DIR/mount" ]; then
      hdiutil detach "$STABLE_MACOS_WORK_DIR/mount" >/tmp/opl-stable-macos-install.hdiutil-detach.log 2>&1 || true
    fi
    if [ -n "$STABLE_MACOS_WORK_DIR" ]; then
      rm -rf "$STABLE_MACOS_WORK_DIR"
    fi
  }
  trap cleanup_stable_macos_install EXIT

  download_or_use_dmg "$STABLE_MACOS_WORK_DIR"
  copy_app_from_dmg "$STABLE_MACOS_RESOLVED_DMG_PATH" "$STABLE_MACOS_WORK_DIR"
  AUTHORIZE_LOCAL_APP_YES=1
  authorize_local_app

  if [ "$STABLE_MACOS_OPEN" = "1" ]; then
    if open "$OPL_LOCAL_APP_PATH"; then
      printf 'One Person Lab App opened.\n'
    else
      printf 'The App was installed and locally authorized, but macOS did not open it automatically. Open it manually from: %s\n' "$OPL_LOCAL_APP_PATH" >&2
    fi
  fi
  printf 'One Person Lab macOS App install finished.\n'
  print_stable_macos_next_steps
}

if [ "$STABLE_MACOS_INSTALL" = "1" ]; then
  stable_macos_install
  exit 0
fi

if [ "$AUTHORIZE_LOCAL_APP_ONLY" = "1" ]; then
  authorize_local_app
  exit 0
fi

if ! command -v curl >/dev/null 2>&1; then
  printf 'Missing required command: curl\n' >&2
  exit 1
fi

trap cleanup_native_installer EXIT
SELECTED_INSTALL_ROUTE=$(resolve_install_route) || exit 1
if [ "$PRINT_INSTALL_ROUTE" = "1" ]; then
  printf '%s\n' "$SELECTED_INSTALL_ROUTE"
  exit 0
fi

case "$SELECTED_INSTALL_ROUTE" in
  desktop)
    install_desktop_bootstrap
    ;;
  native-webui)
    install_native_webui
    ;;
  container-webui)
    install_container_webui
    ;;
  headless)
    install_headless_base
    ;;
  *)
    printf 'Internal installer routing error: %s\n' "$SELECTED_INSTALL_ROUTE" >&2
    exit 1
    ;;
esac

if [ "$AUTHORIZE_LOCAL_APP" = "1" ]; then
  authorize_local_app
fi
