import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

export interface BuildInfo {
  version: string;
  commit: string;
  builtAt: string;
  nodeEnv: string;
}

/**
 * Reads build metadata. Priority:
 *   1. Environment variables (set at Docker build time).
 *   2. .env.build file (written by the Dockerfile).
 *   3. package.json + git HEAD (dev fallback).
 */
export function loadBuildInfo(): BuildInfo {
  const version = process.env.APP_VERSION ?? readPackageVersion();
  const commit = process.env.GIT_COMMIT ?? readGitCommit();
  const builtAt = process.env.BUILD_AT ?? new Date().toISOString();
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  return { version, commit, builtAt, nodeEnv };
}

function readPackageVersion(): string {
  try {
    const candidates = [
      join(process.cwd(), 'package.json'),
      join(process.cwd(), 'apps', 'backend', 'package.json'),
    ];
    for (const path of candidates) {
      if (existsSync(path)) {
        const json = JSON.parse(readFileSync(path, 'utf8')) as { version?: string };
        if (json.version) return json.version;
      }
    }
  } catch {
    // ignore
  }
  return '0.0.0';
}

function readGitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}
