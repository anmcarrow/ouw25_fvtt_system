#!/usr/bin/env bash
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

branch="$(git branch --show-current)"
if [[ "$branch" != "main" ]]; then
  printf 'Publish from main; current branch is %s.\n' "$branch" >&2
  exit 1
fi

if ! git diff --cached --quiet; then
  printf 'The index already contains staged changes. Commit or unstage them first.\n' >&2
  exit 1
fi

gh auth status >/dev/null
repository="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
git fetch origin "$branch" --quiet
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$branch")" ]]; then
  printf 'Local main must be synchronized with origin/main before publishing.\n' >&2
  exit 1
fi

npm test

version="$(REPOSITORY="$repository" node --input-type=module <<'NODE'
import { readFile, writeFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("system.json", "utf8"));
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(manifest.version);
if (!match) throw new Error(`Invalid system version: ${manifest.version}`);
const [, major, minor, patch] = match;
manifest.version = `${major}.${minor}.${Number(patch) + 1}`;
manifest.download = `https://github.com/${process.env.REPOSITORY}/releases/download/v${manifest.version}/ouw25.zip`;
await writeFile("system.json", `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(manifest.version);
NODE
)"
tag="v$version"

git add -- module styles templates lang test docs system.json scripts package.json
if git diff --cached --quiet; then
  printf 'No publishable source files were found.\n' >&2
  exit 1
fi

git commit -m "Release $tag" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

snapshot="$(mktemp -d "${TMPDIR:-/tmp}/ouw25-release.XXXXXX")"
trap 'rm -rf "$snapshot"' EXIT
git archive HEAD | tar -x -C "$snapshot"
(
  cd "$snapshot"
  npm run package
)

git push origin "$branch"
notes="${1:-Update system assets and translations.}"
gh release create "$tag" \
  "$snapshot/dist/ouw25/system.json" \
  "$snapshot/dist/ouw25.zip" \
  --repo "$repository" \
  --title "$tag" \
  --notes "$notes" \
  --target "$branch"

printf 'Published %s\n' "https://github.com/$repository/releases/tag/$tag"
