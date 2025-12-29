#!/usr/bin/env node
/**
 * CLI entry point for electron-ui-mcp
 */

import { Command } from 'commander';
import { main, CliOptions } from './index';

const program = new Command();

program
  .name('electron-ui-mcp')
  .description('Electron UI automation MCP server with Playwright-style primitives')
  .version('0.1.0');

program
  .option(
    '--dev <path>',
    'Launch in dev mode with the specified main.js entry point'
  )
  .option(
    '--packaged <path>',
    'Launch packaged app from the specified executable path'
  )
  .option(
    '--cwd <path>',
    'Working directory for the Electron app'
  )
  .option(
    '--user-data-dir <path>',
    'Custom userData directory path'
  )
  .option(
    '--isolated',
    'Use isolated userData directory (creates temp dir)'
  )
  .option(
    '--dev-server <url>',
    'Dev server URL for the renderer (e.g., http://localhost:5173)'
  )
  .option(
    '--e2e',
    'Enable E2E mode (sets E2E=1 environment variable)'
  )
  .option(
    '--timeout <ms>',
    'Launch timeout in milliseconds',
    (val) => parseInt(val, 10)
  )
  .option(
    '--config <path>',
    'Path to configuration file'
  );

program.parse();

const options = program.opts();

// Convert CLI options to CliOptions interface
const cliOptions: CliOptions = {
  dev: options.dev,
  packaged: options.packaged,
  cwd: options.cwd,
  userDataDir: options.userDataDir,
  isolated: options.isolated,
  devServer: options.devServer,
  e2e: options.e2e,
  timeout: options.timeout,
  config: options.config,
};

// Run the server
main(cliOptions).catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
