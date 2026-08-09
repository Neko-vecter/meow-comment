#!/usr/bin/env bash
set -Eeuo pipefail

package_name="meow-comment"
deb_arch="${DEB_ARCH:-}"
maintainer="${DEB_MAINTAINER:-Meow Comment <maintainers@example.invalid>}"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
backend_dir="$(cd -- "${script_dir}/.." && pwd)"
repo_root="$(cd -- "${backend_dir}/.." && pwd)"
output_dir="${PWD}"

if [[ -z "${deb_arch}" ]]; then
    if command -v dpkg >/dev/null 2>&1; then
        deb_arch="$(dpkg --print-architecture)"
    else
        deb_arch="amd64"
    fi
fi

case "${deb_arch}" in
    amd64)
        go_arch="amd64"
        ;;
    arm64)
        go_arch="arm64"
        ;;
    armhf)
        go_arch="arm"
        go_arm="7"
        ;;
    armel)
        go_arch="arm"
        go_arm="5"
        ;;
    i386)
        go_arch="386"
        ;;
    ppc64el)
        go_arch="ppc64le"
        ;;
    s390x)
        go_arch="s390x"
        ;;
    riscv64)
        go_arch="riscv64"
        ;;
    *)
        printf 'error: unsupported Debian architecture: %s\n' "${deb_arch}" >&2
        exit 1
        ;;
esac

for required_command in go git dpkg-deb install; do
    if ! command -v "${required_command}" >/dev/null 2>&1; then
        printf 'Required command not found: %s\n' "${required_command}" >&2
        exit 69
    fi
done

tag="$(git -C "${repo_root}" describe --tags --exact-match --match 'v[0-9]*' HEAD 2>/dev/null || true)"
if [[ ! "${tag}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    printf 'HEAD must have an exact version tag such as v1.2.3\n' >&2
    exit 65
fi
version="${tag#v}"
output_path="${output_dir}/${package_name}_${version}_${deb_arch}.deb"

build_root="$(mktemp -d "${MEOW_COMMENT_TMPDIR:-/tmp}/meow-comment-build.XXXXXX")"
package_root="${build_root}/package"
trap 'rm -rf "${build_root}"' EXIT

install -d -m 0755 \
    "${package_root}/DEBIAN" \
    "${package_root}/opt/meow-comment" \
    "${package_root}/lib/systemd/system"

build_environment=(CGO_ENABLED=0 GOOS=linux GOARCH="${go_arch}")
if [[ "${go_arch}" == "arm" ]]; then
    build_environment+=(GOARM="${go_arm}")
fi

printf 'Building %s version %s for %s...\n' "${package_name}" "${version}" "${deb_arch}"
(
    cd "${backend_dir}"
    env "${build_environment[@]}" go build \
        -trimpath \
        -ldflags='-s -w' \
        -o "${package_root}/opt/meow-comment/meow-comment" \
        ./cmd/meow-comment
    env "${build_environment[@]}" go build \
        -trimpath \
        -ldflags='-s -w' \
        -o "${package_root}/opt/meow-comment/meow-commentctl" \
        ./cmd/meow-commentctl
)

config_source="${backend_dir}/config.json"
if [[ ! -f "${config_source}" ]]; then
    config_source="${backend_dir}/config.example.json"
fi
if [[ ! -f "${config_source}" ]]; then
    printf 'Configuration template not found. Expected config.json or config.example.json\n' >&2
    exit 66
fi

install -m 0640 "${config_source}" "${package_root}/opt/meow-comment/config.json"
install -m 0644 "${backend_dir}/config.example.json" "${package_root}/opt/meow-comment/config.example.json"
install -m 0644 "${script_dir}/meow-comment.service" "${package_root}/lib/systemd/system/meow-comment.service"

cat > "${package_root}/DEBIAN/control" <<EOF
Package: ${package_name}
Version: ${version}
Section: web
Priority: optional
Architecture: ${deb_arch}
Maintainer: ${maintainer}
Description: Meow Comment backend
 A small comment backend service.
EOF

cat > "${package_root}/DEBIAN/conffiles" <<EOF
/opt/meow-comment/config.json
EOF

install -m 0755 "${script_dir}/deb/postinst" "${package_root}/DEBIAN/postinst"
install -m 0755 "${script_dir}/deb/prerm" "${package_root}/DEBIAN/prerm"
install -m 0755 "${script_dir}/deb/postrm" "${package_root}/DEBIAN/postrm"

dpkg-deb --build --root-owner-group "${package_root}" "${output_path}" >/dev/null
printf 'Created %s\n' "${output_path}"
