import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ouw25-publish-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = path.join(root, "repo"), remote = path.join(root, "remote.git"), bin = path.join(root, "bin");
  await Promise.all([mkdir(repo), mkdir(bin)]);
  const env = { ...process.env, HOME: root, TMPDIR: root, GIT_CONFIG_NOSYSTEM: "1",
    PATH: `${bin}${path.delimiter}${process.env.PATH}`, FAKE_GH_LOG: path.join(root, "release.log") };
  const git = (...args) => execFileSync("git", args, { cwd: repo, env, stdio: "pipe" }).toString().trim();
  execFileSync("git", ["init", "--bare", remote], { env, stdio: "pipe" });
  git("init", "-b", "main");
  git("config", "user.name", "Release Test");
  git("config", "user.email", "release-test@example.invalid");
  git("config", "core.hooksPath", path.join(root, "no-hooks"));
  for (const dir of ["module", "styles", "templates", "lang", "test", "docs", "scripts"]) {
    await mkdir(path.join(repo, dir));
    await writeFile(path.join(repo, dir, "fixture.txt"), "fixture\n");
  }
  await copyFile(new URL("../scripts/publish.sh", import.meta.url), path.join(repo, "scripts/publish.sh"));
  await writeFile(path.join(repo, "system.json"), JSON.stringify({ version: "0.1.110" }) + "\n");
  await writeFile(path.join(repo, "package.json"), '{"name":"fixture"}\n');
  git("add", "--", "module", "styles", "templates", "lang", "test", "docs", "scripts", "system.json", "package.json");
  git("commit", "-m", "Initial fixture");
  git("remote", "add", "origin", remote);
  git("push", "-u", "origin", "main");
  await writeFile(path.join(bin, "gh"), `#!/bin/sh
case "$1 $2" in
  "auth status") exit 0 ;;
  "repo view") printf 'example/project\\n' ;;
  "release create")
    test -f "$4" && test -f "$5" || exit 1
    printf '%s\\n' "$@" > "$FAKE_GH_LOG" ;;
  *) exit 1 ;;
esac
`, { mode: 0o755 });
  await writeFile(path.join(bin, "npm"), `#!/bin/sh
case "$*" in
  test) test "\${FAIL_TESTS:-0}" != 1 ;;
  "run package") mkdir -p dist/ouw25 && cp system.json dist/ouw25/system.json && : > dist/ouw25.zip ;;
  *) exit 1 ;;
esac
`, { mode: 0o755 });
  const publish = extra => spawnSync("bash", ["scripts/publish.sh", "Test release"], {
    cwd: repo, env: { ...env, ...extra }, encoding: "utf8"
  });
  return { repo, root, git, publish };
}

test("a failed release test leaves the existing manifest and commit untouched", async t => {
  const { repo, git, publish } = await fixture(t);
  const manifest = '{"version":"0.1.111","custom":"keep"}\n';
  await writeFile(path.join(repo, "system.json"), manifest);
  const before = git("rev-parse", "HEAD");
  const result = publish({ FAIL_TESTS: "1" });
  assert.notEqual(result.status, 0);
  assert.equal(await readFile(path.join(repo, "system.json"), "utf8"), manifest);
  assert.equal(git("rev-parse", "HEAD"), before);
  assert.equal(git("diff", "--cached", "--name-only"), "");
});

test("a successful publish includes changed package and scripts in the release commit", async t => {
  const { repo, root, git, publish } = await fixture(t);
  await writeFile(path.join(repo, "package.json"), '{"name":"fixture","scripts":{"dev":"node scripts/dev.mjs"}}\n');
  await writeFile(path.join(repo, "scripts", "dev.mjs"), "console.log('dev');\n");
  const result = publish({});
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Published https:\/\/github\.com\/example\/project\/releases\/tag\/v0\.1\.111/);
  assert.match(git("show", "HEAD:package.json"), /scripts\/dev\.mjs/);
  assert.match(git("show", "HEAD:scripts/dev.mjs"), /console\.log/);
  assert.equal(JSON.parse(await readFile(path.join(repo, "system.json"), "utf8")).version, "0.1.111");
  assert.match(await readFile(path.join(root, "release.log"), "utf8"), /release\ncreate\nv0\.1\.111\n/);
  assert.equal(git("rev-parse", "HEAD"), git("rev-parse", "origin/main"));
});
