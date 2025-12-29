import { describe, it, expect } from 'vitest';
import { resolveConfig, defaultConfig, ConfigSchema } from '../src/config';

describe('config', () => {
  describe('resolveConfig', () => {
    it('returns default config when no options provided', () => {
      const config = resolveConfig({});
      expect(config.mode).toBe('dev');
      expect(config.isolated).toBe(false);
      expect(config.e2e).toBe(false);
      expect(config.timeout).toBe(60000);
    });

    it('applies CLI options', () => {
      const config = resolveConfig({
        dev: 'main.js',
        isolated: true,
        e2e: true,
        timeout: 30000,
      });

      expect(config.mode).toBe('dev');
      expect(config.appPath).toBe('main.js');
      expect(config.isolated).toBe(true);
      expect(config.e2e).toBe(true);
      expect(config.timeout).toBe(30000);
    });

    it('sets packaged mode when --packaged is used', () => {
      const config = resolveConfig({
        packaged: '/Applications/MyApp.app',
      });

      expect(config.mode).toBe('packaged');
      expect(config.appPath).toBe('/Applications/MyApp.app');
    });

    it('handles dev server URL', () => {
      const config = resolveConfig({
        devServer: 'http://localhost:5173',
      });

      expect(config.rendererUrl).toBe('http://localhost:5173');
    });
  });

  describe('ConfigSchema', () => {
    it('validates valid config', () => {
      const result = ConfigSchema.safeParse({
        mode: 'dev',
        appPath: 'main.js',
        timeout: 30000,
      });

      expect(result.success).toBe(true);
    });

    it('rejects invalid mode', () => {
      const result = ConfigSchema.safeParse({
        mode: 'invalid',
      });

      expect(result.success).toBe(false);
    });

    it('applies defaults for missing fields', () => {
      const result = ConfigSchema.parse({});

      expect(result.mode).toBe('dev');
      expect(result.isolated).toBe(false);
      expect(result.timeout).toBe(60000);
    });
  });
});
