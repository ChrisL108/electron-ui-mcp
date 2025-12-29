import { describe, it, expect } from 'vitest';
import {
  ElectronMcpError,
  RefNotFoundError,
  StaleRefError,
  AppNotReadyError,
  LaunchError,
  TimeoutError,
  formatError,
} from '../src/utils/errors';

describe('errors', () => {
  describe('ElectronMcpError', () => {
    it('includes message and suggestion', () => {
      const error = new ElectronMcpError('Something went wrong', 'Try again');

      expect(error.message).toBe('Something went wrong');
      expect(error.suggestion).toBe('Try again');
      expect(error.name).toBe('ElectronMcpError');
    });

    it('serializes to JSON', () => {
      const error = new ElectronMcpError('Failed', 'Retry');
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'Failed',
        suggestion: 'Retry',
      });
    });
  });

  describe('RefNotFoundError', () => {
    it('includes ref in message and helpful suggestion', () => {
      const error = new RefNotFoundError('e42');

      expect(error.message).toContain('e42');
      expect(error.suggestion).toContain('browser_snapshot');
    });
  });

  describe('StaleRefError', () => {
    it('includes ref and snapshot ID', () => {
      const error = new StaleRefError('e5', 'snap_123');

      expect(error.message).toContain('e5');
      expect(error.message).toContain('snap_123');
      expect(error.suggestion).toContain('snapshot');
    });
  });

  describe('LaunchError', () => {
    it('includes path in suggestion when provided', () => {
      const error = new LaunchError('ENOENT', '/path/to/app');

      expect(error.message).toContain('ENOENT');
      expect(error.suggestion).toContain('/path/to/app');
    });
  });

  describe('TimeoutError', () => {
    it('includes operation and timeout value', () => {
      const error = new TimeoutError('click', 5000);

      expect(error.message).toContain('click');
      expect(error.message).toContain('5000ms');
    });
  });

  describe('formatError', () => {
    it('formats ElectronMcpError', () => {
      const error = new RefNotFoundError('e10');
      const formatted = formatError(error);

      expect(formatted.error).toContain('e10');
      expect(formatted.suggestion).toBeDefined();
    });

    it('formats generic Error', () => {
      const error = new Error('Something failed');
      const formatted = formatError(error);

      expect(formatted.error).toBe('Something failed');
      expect(formatted.suggestion).toBeDefined();
    });

    it('formats non-Error values', () => {
      const formatted = formatError('string error');

      expect(formatted.error).toBe('string error');
    });
  });
});
