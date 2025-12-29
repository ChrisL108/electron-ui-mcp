/**
 * Element reference manager for snapshot-based element addressing
 *
 * Refs are generated per-snapshot and map to Playwright locator strategies.
 * They expire when a new snapshot is taken.
 */

import type { Locator, Page } from 'playwright';
import { RefNotFoundError, StaleRefError } from './errors';

export interface ElementRef {
  ref: string;
  role: string;
  name: string;
  testId?: string;
  selector: string;
}

export interface SnapshotData {
  id: string;
  timestamp: number;
  refs: Map<string, ElementRef>;
}

export class RefManager {
  private currentSnapshot: SnapshotData | null = null;
  private refCounter = 0;

  /**
   * Start a new snapshot session, invalidating all previous refs
   */
  startNewSnapshot(): string {
    const id = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.currentSnapshot = {
      id,
      timestamp: Date.now(),
      refs: new Map(),
    };
    this.refCounter = 0;
    return id;
  }

  /**
   * Get the current snapshot ID
   */
  getCurrentSnapshotId(): string | null {
    return this.currentSnapshot?.id ?? null;
  }

  /**
   * Register an element and get a ref for it
   */
  registerElement(role: string, name: string, testId?: string): string {
    if (!this.currentSnapshot) {
      throw new Error('No active snapshot. Call startNewSnapshot() first.');
    }

    const ref = `e${this.refCounter++}`;

    // Build selector strategy (prefer role+name, fallback to testId)
    let selector: string;
    if (role && name) {
      selector = `role=${role}[name="${name}"]`;
    } else if (testId) {
      selector = `[data-testid="${testId}"]`;
    } else if (role) {
      selector = `role=${role}`;
    } else {
      // Last resort: use a unique attribute if we can't build a good selector
      selector = `[data-ref="${ref}"]`;
    }

    this.currentSnapshot.refs.set(ref, {
      ref,
      role,
      name,
      testId,
      selector,
    });

    return ref;
  }

  /**
   * Get element info by ref, throwing if not found or stale
   */
  getElement(ref: string, expectedSnapshotId?: string): ElementRef {
    if (!this.currentSnapshot) {
      throw new RefNotFoundError(ref);
    }

    if (expectedSnapshotId && expectedSnapshotId !== this.currentSnapshot.id) {
      throw new StaleRefError(ref, expectedSnapshotId);
    }

    const element = this.currentSnapshot.refs.get(ref);
    if (!element) {
      throw new RefNotFoundError(ref);
    }

    return element;
  }

  /**
   * Resolve a ref to a Playwright Locator
   */
  resolveToLocator(page: Page, ref: string): Locator {
    const element = this.getElement(ref);

    // Use getByRole when possible for better reliability
    if (element.role && element.name) {
      return page.getByRole(element.role as Parameters<Page['getByRole']>[0], {
        name: element.name,
      });
    }

    if (element.testId) {
      return page.getByTestId(element.testId);
    }

    // Fallback to CSS selector
    return page.locator(element.selector);
  }

  /**
   * Get all refs from current snapshot
   */
  getAllRefs(): ElementRef[] {
    if (!this.currentSnapshot) {
      return [];
    }
    return Array.from(this.currentSnapshot.refs.values());
  }

  /**
   * Clear all refs (on app close/crash)
   */
  clear(): void {
    this.currentSnapshot = null;
    this.refCounter = 0;
  }

  /**
   * Check if we have an active snapshot
   */
  hasSnapshot(): boolean {
    return this.currentSnapshot !== null;
  }
}

/**
 * Shared singleton instance
 */
export const refManager = new RefManager();
