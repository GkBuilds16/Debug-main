import axios from "axios";
import { lookup } from "node:dns/promises";
import https from "node:https";
import { BlockList } from "node:net";
import { MAX_ARCHIVE_BYTES, validateProjectFiles } from "./filePolicy.js";
import { extractSafeZip } from "./zipImport.js";

const MAX_REDIRECTS = 2;
const REQUEST_TIMEOUT_MS = 10_000;
const ALLOWED_ARCHIVE_HOSTS = new Set(["api.github.com", "codeload.github.com"]);
const privateIpv4Ranges = new BlockList();
const nonPublicIpv6Ranges = new BlockList();
const globallyRoutableIpv6Ranges = new BlockList();
for (const [subnet, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
]) privateIpv4Ranges.addSubnet(subnet, prefix, "ipv4");
globallyRoutableIpv6Ranges.addSubnet("2000::", 3, "ipv6");
for (const [subnet, prefix] of [
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["fc00::", 7], ["fe80::", 10],
  ["ff00::", 8], ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20],
]) {
  nonPublicIpv6Ranges.addSubnet(subnet, prefix, "ipv6");
}

export function isPublicGitHubAddress(address, family) {
  if (family !== 4 && family !== 6) return false;
  if (family === 4) return !privateIpv4Ranges.check(address, "ipv4");

  const mappedV4 = /^::ffff:(.+)$/i.exec(address);
  if (mappedV4) {
    const dotted = /^(\d{1,3}(?:\.\d{1,3}){3})$/.exec(mappedV4[1]);
    if (dotted) return isPublicGitHubAddress(dotted[1], 4);
    const hexadecimal = /^([\da-f]{1,4}):([\da-f]{1,4})$/i.exec(mappedV4[1]);
    if (!hexadecimal) return false;
    const high = Number.parseInt(hexadecimal[1], 16);
    const low = Number.parseInt(hexadecimal[2], 16);
    return isPublicGitHubAddress(`${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`, 4);
  }

  return globallyRoutableIpv6Ranges.check(address, "ipv6") &&
    !nonPublicIpv6Ranges.check(address, "ipv6");
}

export function assertAllowedArchiveUrl(url) {
  if (url.protocol !== "https:" || !ALLOWED_ARCHIVE_HOSTS.has(url.hostname.toLowerCase()) ||
      url.port || url.username || url.password || url.search || url.hash) {
    const error = new Error("GitHub returned an unsupported archive redirect.");
    error.code = "GITHUB_UNSAFE_REDIRECT";
    throw error;
  }
}

export function parsePublicGitHubUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("Enter a valid public GitHub repository URL."); }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || url.port ||
      url.username || url.password || url.search || url.hash) {
    throw new Error("Only public repositories hosted at https://github.com are supported.");
  }
  const match = /^\/([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})(?:\.git)?\/?$/.exec(url.pathname);
  if (!match) throw new Error("Use a repository URL in the form https://github.com/owner/repository.");
  const [, owner, rawRepository] = match;
  const repository = rawRepository.replace(/\.git$/i, "");
  if (!repository || repository === "." || repository === "..") throw new Error("Repository URL contains unsupported characters.");
  return { owner, repository, canonicalUrl: `https://github.com/${owner}/${repository}` };
}

async function requestPinnedHttps(url) {
  assertAllowedArchiveUrl(url);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address, family }) => !isPublicGitHubAddress(address, family))) {
    const error = new Error("GitHub archive host resolved to a non-public network address.");
    error.code = "GITHUB_UNSAFE_DESTINATION";
    throw error;
  }

  const lookupPinned = (hostname, options, callback) => {
    if (hostname.toLowerCase() !== url.hostname.toLowerCase()) {
      return callback(new Error("Unexpected host in GitHub archive request."));
    }
    if (options?.all) return callback(null, addresses);
    const address = addresses.find(candidate => !options?.family || candidate.family === options.family) || addresses[0];
    return callback(null, address.address, address.family);
  };
  const agent = new https.Agent({ lookup: lookupPinned, servername: url.hostname, keepAlive: false });
  try {
    const response = await axios.get(url.href, {
      httpsAgent: agent,
      proxy: false,
      maxRedirects: 0,
      responseType: "stream",
      timeout: REQUEST_TIMEOUT_MS,
      validateStatus: () => true,
      headers: {
        "User-Agent": "DebugDSA-public-repository-import/1.0",
        Accept: "application/vnd.github+json, application/zip, application/octet-stream",
      },
    });
    return { response, agent };
  } catch (cause) {
    agent.destroy();
    const error = new Error("Could not retrieve the public GitHub repository archive.");
    error.code = cause.code === "ECONNABORTED" ? "GITHUB_TIMEOUT" : "GITHUB_FETCH_FAILED";
    throw error;
  }
}

async function readBoundedResponse(stream, agent) {
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > MAX_ARCHIVE_BYTES) {
        stream.destroy();
        const error = new Error("GitHub archive exceeds the 10 MiB compressed-size limit.");
        error.code = "GITHUB_ARCHIVE_TOO_LARGE";
        throw error;
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, size);
  } finally {
    agent.destroy();
  }
}

async function downloadGitHubArchive(repository) {
  let target = new URL(`https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}/zipball`);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const { response, agent } = await requestPinnedHttps(target);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      response.data.destroy();
      agent.destroy();
      if (redirects === MAX_REDIRECTS || !response.headers.location) {
        const error = new Error("GitHub returned too many archive redirects.");
        error.code = "GITHUB_TOO_MANY_REDIRECTS";
        throw error;
      }
      let next;
      try { next = new URL(response.headers.location, target); }
      catch {
        const error = new Error("GitHub returned an invalid archive redirect.");
        error.code = "GITHUB_UNSAFE_REDIRECT";
        throw error;
      }
      assertAllowedArchiveUrl(next);
      target = next;
      continue;
    }
    if (response.status === 404) {
      response.data.destroy(); agent.destroy();
      const error = new Error("Repository was not found or is not public.");
      error.code = "GITHUB_NOT_FOUND";
      throw error;
    }
    if (response.status === 403 || response.status === 429) {
      response.data.destroy(); agent.destroy();
      const error = new Error("GitHub rate limit reached. Try again later.");
      error.code = "GITHUB_RATE_LIMIT";
      throw error;
    }
    if (response.status !== 200) {
      response.data.destroy(); agent.destroy();
      const error = new Error("GitHub did not return a repository archive.");
      error.code = "GITHUB_FETCH_FAILED";
      throw error;
    }
    const contentLength = Number(response.headers["content-length"]);
    if (Number.isFinite(contentLength) && contentLength > MAX_ARCHIVE_BYTES) {
      response.data.destroy(); agent.destroy();
      const error = new Error("GitHub archive exceeds the 10 MiB compressed-size limit.");
      error.code = "GITHUB_ARCHIVE_TOO_LARGE";
      throw error;
    }
    return readBoundedResponse(response.data, agent);
  }
  const error = new Error("GitHub archive could not be retrieved.");
  error.code = "GITHUB_FETCH_FAILED";
  throw error;
}

export async function importPublicGitHubRepository(repository, { download = downloadGitHubArchive } = {}) {
  const archive = await download(repository);
  let files;
  try { files = await extractSafeZip(archive); }
  catch (cause) {
    const error = new Error(`GitHub repository archive was rejected: ${cause.message}`);
    error.code = "GITHUB_ARCHIVE_REJECTED";
    throw error;
  }

  const root = files[0]?.path.split("/")[0];
  if (!root || files.some(file => file.path !== root && !file.path.startsWith(`${root}/`))) {
    const error = new Error("GitHub archive contains unexpected top-level paths.");
    error.code = "GITHUB_ARCHIVE_REJECTED";
    throw error;
  }
  const flattened = files.map(file => ({ path: file.path.slice(root.length).replace(/^\//, ""), content: file.content }));
  if (flattened.some(file => !file.path)) {
    const error = new Error("GitHub archive did not contain any project files.");
    error.code = "GITHUB_ARCHIVE_REJECTED";
    throw error;
  }
  return {
    canonicalUrl: repository.canonicalUrl,
    files: validateProjectFiles(flattened),
  };
}
