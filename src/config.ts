/**
 * Configuration resolution: CLI > env > file > defaults
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

/**
 * Launch mode for Electron app
 */
export type LaunchMode = 'dev' | 'packaged';

/**
 * Configuration schema
 */
export const ConfigSchema = z.object({
  // Launch mode
  mode: z.enum(['dev', 'packaged']).default('dev'),

  // Path to electron entry or packaged app
  appPath: z.string().optional(),

  // Working directory for the app
  cwd: z.string().optional(),

  // Custom userData directory (isolation for testing)
  userDataDir: z.string().optional(),

  // Whether to use isolated userData (creates temp dir)
  isolated: z.boolean().default(false),

  // Dev server URL for renderer (Vite dev server)
  rendererUrl: z.string().optional(),

  // Enable E2E mode (sets E2E=1 env var)
  e2e: z.boolean().default(false),

  // Launch timeout in milliseconds
  timeout: z.number().default(60000),

  // Extra args to pass to Electron
  electronArgs: z.array(z.string()).default([]),

  // Extra environment variables
  env: z.record(z.string()).default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Default configuration values
 */
export const defaultConfig: Config = {
  mode: 'dev',
  isolated: false,
  e2e: false,
  timeout: 60000,
  electronArgs: [],
  env: {},
};

/**
 * Load config from a JSON file if it exists
 */
function loadConfigFile(configPath?: string): Partial<Config> {
  const paths = configPath
    ? [configPath]
    : [
        'electron-ui-mcp.json',
        '.electron-ui-mcp.json',
        path.join(process.cwd(), 'electron-ui-mcp.json'),
        path.join(process.cwd(), '.electron-ui-mcp.json'),
      ];

  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        return JSON.parse(content);
      }
    } catch {
      // Ignore parse errors, continue to next
    }
  }

  return {};
}

/**
 * Load config from environment variables
 */
function loadEnvConfig(): Partial<Config> {
  const config: Partial<Config> = {};

  if (process.env.ELECTRON_APP_PATH) {
    config.appPath = process.env.ELECTRON_APP_PATH;
  }

  if (process.env.ELECTRON_CWD) {
    config.cwd = process.env.ELECTRON_CWD;
  }

  if (process.env.ELECTRON_USER_DATA_DIR) {
    config.userDataDir = process.env.ELECTRON_USER_DATA_DIR;
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    config.rendererUrl = process.env.ELECTRON_RENDERER_URL;
  }

  if (process.env.E2E === '1' || process.env.E2E === 'true') {
    config.e2e = true;
  }

  if (process.env.ELECTRON_LAUNCH_TIMEOUT) {
    const timeout = parseInt(process.env.ELECTRON_LAUNCH_TIMEOUT, 10);
    if (!isNaN(timeout)) {
      config.timeout = timeout;
    }
  }

  if (process.env.ELECTRON_MODE === 'packaged' || process.env.ELECTRON_MODE === 'dev') {
    config.mode = process.env.ELECTRON_MODE;
  }

  return config;
}

/**
 * CLI options interface (from commander)
 */
export interface CliOptions {
  dev?: string;
  packaged?: string;
  cwd?: string;
  userDataDir?: string;
  isolated?: boolean;
  devServer?: string;
  e2e?: boolean;
  timeout?: number;
  config?: string;
}

/**
 * Convert CLI options to config
 */
function cliToConfig(cli: CliOptions): Partial<Config> {
  const config: Partial<Config> = {};

  if (cli.dev) {
    config.mode = 'dev';
    config.appPath = cli.dev;
  } else if (cli.packaged) {
    config.mode = 'packaged';
    config.appPath = cli.packaged;
  }

  if (cli.cwd) {
    config.cwd = cli.cwd;
  }

  if (cli.userDataDir) {
    config.userDataDir = cli.userDataDir;
  }

  if (cli.isolated) {
    config.isolated = true;
  }

  if (cli.devServer) {
    config.rendererUrl = cli.devServer;
  }

  if (cli.e2e) {
    config.e2e = true;
  }

  if (cli.timeout !== undefined) {
    config.timeout = cli.timeout;
  }

  return config;
}

/**
 * Resolve configuration from all sources (CLI > env > file > defaults)
 */
export function resolveConfig(cliOptions: CliOptions = {}): Config {
  const fileConfig = loadConfigFile(cliOptions.config);
  const envConfig = loadEnvConfig();
  const cliConfig = cliToConfig(cliOptions);

  // Merge in order: defaults < file < env < cli
  const merged = {
    ...defaultConfig,
    ...fileConfig,
    ...envConfig,
    ...cliConfig,
  };

  // Validate and return
  return ConfigSchema.parse(merged);
}

/**
 * Resolve the app path for launching
 */
export function resolveAppPath(config: Config): string {
  if (config.appPath) {
    // Use explicit path
    const resolved = path.isAbsolute(config.appPath)
      ? config.appPath
      : path.resolve(config.cwd || process.cwd(), config.appPath);

    if (!fs.existsSync(resolved)) {
      throw new Error(`Electron app not found at: ${resolved}`);
    }

    return resolved;
  }

  // Try to find default dev entry
  if (config.mode === 'dev') {
    const candidates = [
      '.vite/build/main.js',
      'dist/main.js',
      'out/main/index.js',
      'build/main.js',
    ];

    const basePath = config.cwd || process.cwd();

    for (const candidate of candidates) {
      const fullPath = path.join(basePath, candidate);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    throw new Error(
      'Could not find Electron main entry. ' +
        'Tried: ' +
        candidates.join(', ') +
        '. ' +
        'Use --dev <path> to specify the entry point.'
    );
  }

  throw new Error(
    'No app path specified. ' +
      'Use --dev <main.js> for dev mode or --packaged <app-path> for packaged apps.'
  );
}
