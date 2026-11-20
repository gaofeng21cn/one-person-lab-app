#!/usr/bin/env bash
set -euo pipefail

packages=(
  build-essential python3 python3-pip pkg-config libsqlite3-dev fakeroot dpkg-dev rpm
  libnss3-dev libatk-bridge2.0-dev libdrm2 libxkbcommon-dev libxss1 libatspi2.0-dev
  libgtk-3-dev libxrandr2 libasound2-dev
)
network_options=(-o Acquire::Retries=1 -o Acquire::http::Timeout=15 -o Acquire::https::Timeout=15)
install_options=(-y --no-install-recommends)
archive_sources=/etc/apt/sources.list.d/ubuntu.sources

stage_packages() {
  sudo apt-get "${network_options[@]}" "$@" -o APT::Update::Error-Mode=any update &&
    sudo apt-get "${network_options[@]}" "$@" --download-only install "${install_options[@]}" "${packages[@]}"
}

source_options=()
if [ "$(dpkg --print-architecture)" = amd64 ] && [ -f "$archive_sources" ] &&
  grep -Eq 'http://azure\.archive\.ubuntu\.com/ubuntu|mirror\+file:/etc/apt/apt-mirrors\.txt' "$archive_sources"; then
  # Preserve the runner's suites and signing keyring in a temporary sources directory.
  sources_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/opl-desktop-apt.XXXXXX")"
  trap 'rm -rf "$sources_dir"' EXIT
  source_options=(
    -o Dir::Etc::sourcelist=/dev/null -o "Dir::Etc::sourceparts=$sources_dir"
    -o APT::Get::List-Cleanup=false
  )

  sed -E \
    's|http://azure\.archive\.ubuntu\.com/ubuntu|https://mirrors.edge.kernel.org/ubuntu|g;
     s|mirror\+file:/etc/apt/apt-mirrors\.txt|https://mirrors.edge.kernel.org/ubuntu|g' \
    "$archive_sources" > "$sources_dir/ubuntu.sources"
  if ! stage_packages "${source_options[@]}"; then
    echo 'Retrying Ubuntu build dependency download against the Ubuntu archive.'
    sed -E \
      's|http://azure\.archive\.ubuntu\.com/ubuntu|https://archive.ubuntu.com/ubuntu|g;
       s|mirror\+file:/etc/apt/apt-mirrors\.txt|https://archive.ubuntu.com/ubuntu|g' \
      "$archive_sources" > "$sources_dir/ubuntu.sources"
    stage_packages "${source_options[@]}"
  fi
else
  stage_packages
fi

sudo apt-get "${source_options[@]}" --no-download install "${install_options[@]}" "${packages[@]}"
