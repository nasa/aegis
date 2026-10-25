#!/bin/sh
set -eu

# Export the exact files in the deployment image, without running its entrypoint.
container=$(buildah from --pull=never "$1")
trap 'buildah rm "$container"' EXIT
image_root=$(buildah mount "$container")

test "$(cat "$image_root/app/.local/build-commit")" = "$CI_COMMIT_SHA"
mkdir -p .local
cp -R "$image_root/app/.local/." .local/
