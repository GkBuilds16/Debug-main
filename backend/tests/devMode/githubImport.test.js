import { expect, test } from "@jest/globals";
import {
  assertAllowedArchiveUrl,
  importPublicGitHubRepository,
  isPublicGitHubAddress,
  parsePublicGitHubUrl,
} from "../../devMode/modules/post-codebase/services/githubImport.js";

function createZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const body = Buffer.from(entry.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test("accepts only clean public GitHub repository URLs", () => {
  expect(parsePublicGitHubUrl("https://github.com/acme/demo.git")).toEqual({
    owner: "acme",
    repository: "demo",
    canonicalUrl: "https://github.com/acme/demo",
  });
  for (const url of [
    "http://github.com/acme/demo",
    "https://github.com.evil.test/acme/demo",
    "https://github.com/acme/demo/tree/main",
    "https://github.com/acme/demo?archive=1",
    "https://user:pass@github.com/acme/demo",
    "https://github.com//acme/demo",
  ]) expect(() => parsePublicGitHubUrl(url)).toThrow();
});

test("redirect policy permits only HTTPS GitHub archive hosts and public DNS addresses", () => {
  expect(() => assertAllowedArchiveUrl(new URL("https://codeload.github.com/acme/demo/archive.zip"))).not.toThrow();
  for (const url of ["http://codeload.github.com/acme/demo.zip", "https://127.0.0.1/archive.zip", "https://evil.example/archive.zip", "https://codeload.github.com.evil.example/archive.zip"]) {
    expect(() => assertAllowedArchiveUrl(new URL(url))).toThrow();
  }
  expect(isPublicGitHubAddress("140.82.112.3", 4)).toBe(true);
  expect(isPublicGitHubAddress("2001:4860:4860::8888", 6)).toBe(true);
  expect(isPublicGitHubAddress("::ffff:8.8.8.8", 6)).toBe(true);
  for (const address of [
    "127.0.0.1", "10.2.3.4", "169.254.1.2", "192.168.1.3", "::1", "fc00::1", "fe80::1",
    "2001:db8::1", "2002:7f00:1::", "3fff::1", "::ffff:127.0.0.1", "::ffff:7f00:1",
  ]) {
    expect(isPublicGitHubAddress(address, address.includes(":") ? 6 : 4)).toBe(false);
  }
});

test("imports a bounded GitHub archive and strips its generated repository root", async () => {
  const repository = parsePublicGitHubUrl("https://github.com/acme/demo");
  const archive = createZip([
    { name: "acme-demo-0123456/README.md", content: "# safe project" },
    { name: "acme-demo-0123456/src/main.js", content: "export const safe = true;" },
  ]);
  const result = await importPublicGitHubRepository(repository, { download: async () => archive });
  expect(result.canonicalUrl).toBe(repository.canonicalUrl);
  expect(result.files.map(file => file.path)).toEqual(["README.md", "src/main.js"]);
});

test("reuses ZIP traversal protections for GitHub archive contents", async () => {
  const repository = parsePublicGitHubUrl("https://github.com/acme/demo");
  const archive = createZip([{ name: "demo-main/../outside.js", content: "unsafe" }]);
  await expect(importPublicGitHubRepository(repository, { download: async () => archive })).rejects.toMatchObject({ code: "GITHUB_ARCHIVE_REJECTED" });
});
