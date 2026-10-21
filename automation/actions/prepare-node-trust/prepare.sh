#!/bin/sh
set -eu

fail() {
  printf 'prepare-node-trust: %s\n' "$1" >&2
  exit 1
}

[ "$#" -eq 0 ] || fail 'Unexpected arguments.'
[ "${NODE_OPTIONS-}" = '--use-openssl-ca' ] || fail 'NODE_OPTIONS must select the OpenSSL trust store.'
[ "${SSL_CERT_FILE-}" = '/etc/ssl/certs/ca-certificates.crt' ] || fail 'SSL_CERT_FILE must select the official certificate bundle.'
[ "${SSL_CERT_DIR-}" = '/etc/ssl/certs' ] || fail 'SSL_CERT_DIR must select the official certificate directory.'
[ "${NODE_EXTRA_CA_CERTS+x}" != x ] || fail 'NODE_EXTRA_CA_CERTS overrides are unsupported.'
[ "${NODE_TLS_REJECT_UNAUTHORIZED+x}" != x ] || fail 'NODE_TLS_REJECT_UNAUTHORIZED overrides are unsupported.'

[ -f /etc/os-release ] || fail 'Missing OS release identity.'
# shellcheck disable=SC1091
. /etc/os-release

ubuntu_floor='20260816ubuntu0.24.04.1'
alpine_floor='20261020-r0'

ubuntu_version() {
  dpkg-query -W -f='${Version}' ca-certificates || fail 'Ubuntu ca-certificates is missing.'
}

ubuntu_current() {
  dpkg --compare-versions "$1" ge "$ubuntu_floor"
}

apt_run() {
  if [ "$(id -u)" -eq 0 ]; then
    apt-get "$@"
  else
    command -v sudo >/dev/null 2>&1 || fail 'sudo is required to refresh the Ubuntu package.'
    sudo apt-get "$@"
  fi
}

alpine_version() {
  package=$1
  if ! installed=$(apk info -e -v "$package"); then
    printf 'missing'
    return
  fi
  case "$installed" in
    "$package"-*) version=${installed#"$package"-} ;;
    *) fail "Unexpected Alpine $package version output." ;;
  esac
  case "$version" in
    ''|*[!0-9A-Za-z.+_~-]*) fail "Invalid Alpine $package version." ;;
  esac
  printf '%s' "$version"
}

alpine_current() {
  [ "$1" != missing ] || return 1
  case "$(apk version -t "$1" "$alpine_floor")" in
    '='|'>') return 0 ;;
    *) return 1 ;;
  esac
}

case "${ID-}:${VERSION_ID-}" in
  ubuntu:24.04)
    ca_version=$(ubuntu_version)
    if ! ubuntu_current "$ca_version"; then
      apt_run update -qq
      apt_run install -y --only-upgrade ca-certificates
      ca_version=$(ubuntu_version)
    fi
    ubuntu_current "$ca_version" || fail "Ubuntu ca-certificates is below $ubuntu_floor."
    printf 'prepare-node-trust: ubuntu=24.04 uid=%s ca-certificates=%s\n' "$(id -u)" "$ca_version"
    ;;
  alpine:3.23|alpine:3.23.*)
    [ "$(id -u)" -eq 0 ] || fail 'Root is required to refresh Alpine packages.'
    ca_version=$(alpine_version ca-certificates)
    bundle_version=$(alpine_version ca-certificates-bundle)
    if ! alpine_current "$ca_version" || ! alpine_current "$bundle_version"; then
      apk add --upgrade --no-cache ca-certificates ca-certificates-bundle
      ca_version=$(alpine_version ca-certificates)
      bundle_version=$(alpine_version ca-certificates-bundle)
    fi
    [ "$ca_version" != missing ] || fail 'Alpine ca-certificates is missing after refresh.'
    [ "$bundle_version" != missing ] || fail 'Alpine ca-certificates-bundle is missing after refresh.'
    alpine_current "$ca_version" || fail "Alpine ca-certificates is below $alpine_floor."
    alpine_current "$bundle_version" || fail "Alpine ca-certificates-bundle is below $alpine_floor."
    printf 'prepare-node-trust: alpine=%s uid=%s ca-certificates=%s ca-certificates-bundle=%s\n' "$VERSION_ID" "$(id -u)" "$ca_version" "$bundle_version"
    ;;
  *) fail 'Only Ubuntu 24.04 and Alpine 3.23 are supported.' ;;
esac

[ -s /etc/ssl/certs/ca-certificates.crt ] || fail 'The certificate bundle is empty or missing.'
[ -d /etc/ssl/certs ] || fail 'The certificate directory is missing.'
