import { describe, it, expect, beforeEach } from 'vitest';
import { RefManager } from '../src/utils/refs';
import { RefNotFoundError, StaleRefError } from '../src/utils/errors';

describe('RefManager', () => {
  let manager: RefManager;

  beforeEach(() => {
    manager = new RefManager();
  });

  describe('startNewSnapshot', () => {
    it('creates a new snapshot with unique ID', () => {
      const id1 = manager.startNewSnapshot();
      const id2 = manager.startNewSnapshot();

      expect(id1).toMatch(/^snap_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^snap_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('invalidates previous refs', () => {
      manager.startNewSnapshot();
      const ref = manager.registerElement('button', 'Submit');

      // Start new snapshot
      manager.startNewSnapshot();

      // Old ref should not be found
      expect(() => manager.getElement(ref)).toThrow(RefNotFoundError);
    });
  });

  describe('registerElement', () => {
    it('generates sequential refs', () => {
      manager.startNewSnapshot();

      const ref1 = manager.registerElement('button', 'Submit');
      const ref2 = manager.registerElement('textbox', 'Email');
      const ref3 = manager.registerElement('link', 'Help');

      expect(ref1).toBe('e0');
      expect(ref2).toBe('e1');
      expect(ref3).toBe('e2');
    });

    it('throws when no snapshot is active', () => {
      expect(() => manager.registerElement('button', 'Submit')).toThrow(
        'No active snapshot'
      );
    });
  });

  describe('getElement', () => {
    it('returns element info by ref', () => {
      manager.startNewSnapshot();
      const ref = manager.registerElement('button', 'Submit');

      const element = manager.getElement(ref);

      expect(element.ref).toBe('e0');
      expect(element.role).toBe('button');
      expect(element.name).toBe('Submit');
    });

    it('throws RefNotFoundError for unknown ref', () => {
      manager.startNewSnapshot();

      expect(() => manager.getElement('e99')).toThrow(RefNotFoundError);
    });

    it('throws StaleRefError for wrong snapshot ID', () => {
      const snapshotId = manager.startNewSnapshot();
      manager.registerElement('button', 'Submit');

      // New snapshot
      manager.startNewSnapshot();
      manager.registerElement('link', 'Home');

      expect(() => manager.getElement('e0', snapshotId)).toThrow(StaleRefError);
    });
  });

  describe('getAllRefs', () => {
    it('returns all refs from current snapshot', () => {
      manager.startNewSnapshot();
      manager.registerElement('button', 'Submit');
      manager.registerElement('textbox', 'Email');

      const refs = manager.getAllRefs();

      expect(refs).toHaveLength(2);
      expect(refs[0].role).toBe('button');
      expect(refs[1].role).toBe('textbox');
    });

    it('returns empty array when no snapshot', () => {
      expect(manager.getAllRefs()).toEqual([]);
    });
  });

  describe('clear', () => {
    it('clears all state', () => {
      manager.startNewSnapshot();
      manager.registerElement('button', 'Submit');

      manager.clear();

      expect(manager.hasSnapshot()).toBe(false);
      expect(manager.getAllRefs()).toEqual([]);
    });
  });
});
