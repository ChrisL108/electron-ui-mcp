/**
 * ARIA Snapshot system - captures accessibility tree with refs
 *
 * The snapshot provides element refs (e0, e1, etc.) that can be used
 * with interaction tools like browser_click and browser_type.
 */

import type { Page } from 'playwright';
import { refManager } from '../utils/refs';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapshotElement {
  ref: string;
  role: string;
  name: string;
  level?: number;
  bounds?: BoundingBox;
  children?: SnapshotElement[];
}

export interface SnapshotResult {
  snapshotId: string;
  title: string;
  url: string;
  tree: SnapshotElement[];
  text: string; // Human-readable text format
}

// Store bounding boxes for annotation
let currentBoundingBoxes: Map<string, BoundingBox> = new Map();

/**
 * Get bounding boxes from the last snapshot
 */
export function getBoundingBoxes(): Map<string, BoundingBox> {
  return currentBoundingBoxes;
}

/**
 * Capture an accessibility snapshot of the page
 */
export async function captureSnapshot(page: Page): Promise<SnapshotResult> {
  // Start new snapshot session (invalidates old refs)
  const snapshotId = refManager.startNewSnapshot();
  currentBoundingBoxes = new Map();

  const title = await page.title();
  const url = page.url();

  // Get accessibility tree by evaluating in the page
  // This approach works across all Playwright versions
  const rawTree = await page.evaluate(() => {
    function getAccessibleName(el: Element): string {
      // Try aria-label first
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel;

      // Try aria-labelledby
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl) return labelEl.textContent?.trim() || '';
      }

      // Try associated label for form elements
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        const id = el.id;
        if (id) {
          const label = document.querySelector(`label[for="${id}"]`);
          if (label) return label.textContent?.trim() || '';
        }
      }

      // Try title attribute
      const titleAttr = el.getAttribute('title');
      if (titleAttr) return titleAttr;

      // Try alt for images
      if (el instanceof HTMLImageElement) {
        return el.alt || '';
      }

      // Try button/link text content
      if (el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement) {
        return el.textContent?.trim() || '';
      }

      // Try value for inputs
      if (el instanceof HTMLInputElement) {
        if (el.type === 'submit' || el.type === 'button') {
          return el.value || '';
        }
      }

      return '';
    }

    function getRole(el: Element): string {
      // Explicit ARIA role takes precedence
      const explicitRole = el.getAttribute('role');
      if (explicitRole) return explicitRole;

      // Implicit roles based on element type
      const tagName = el.tagName.toLowerCase();
      const roleMap: Record<string, string> = {
        'a': 'link',
        'button': 'button',
        'input': getInputRole(el as HTMLInputElement),
        'select': 'combobox',
        'textarea': 'textbox',
        'img': 'img',
        'h1': 'heading',
        'h2': 'heading',
        'h3': 'heading',
        'h4': 'heading',
        'h5': 'heading',
        'h6': 'heading',
        'nav': 'navigation',
        'main': 'main',
        'header': 'banner',
        'footer': 'contentinfo',
        'aside': 'complementary',
        'section': 'region',
        'article': 'article',
        'form': 'form',
        'table': 'table',
        'ul': 'list',
        'ol': 'list',
        'li': 'listitem',
        'dialog': 'dialog',
        'menu': 'menu',
        'menuitem': 'menuitem',
      };

      return roleMap[tagName] || '';
    }

    function getInputRole(input: HTMLInputElement): string {
      const typeRoles: Record<string, string> = {
        'button': 'button',
        'submit': 'button',
        'reset': 'button',
        'checkbox': 'checkbox',
        'radio': 'radio',
        'range': 'slider',
        'search': 'searchbox',
        'text': 'textbox',
        'email': 'textbox',
        'password': 'textbox',
        'tel': 'textbox',
        'url': 'textbox',
        'number': 'spinbutton',
      };
      return typeRoles[input.type] || 'textbox';
    }

    function getHeadingLevel(el: Element): number | undefined {
      const tagName = el.tagName.toLowerCase();
      const levelMatch = tagName.match(/^h([1-6])$/);
      if (levelMatch) {
        return parseInt(levelMatch[1], 10);
      }
      const ariaLevel = el.getAttribute('aria-level');
      if (ariaLevel) {
        return parseInt(ariaLevel, 10);
      }
      return undefined;
    }

    function isInteractive(el: Element): boolean {
      const tagName = el.tagName.toLowerCase();
      const interactiveTags = ['a', 'button', 'input', 'select', 'textarea'];
      if (interactiveTags.includes(tagName)) return true;

      const role = el.getAttribute('role');
      const interactiveRoles = [
        'button', 'link', 'checkbox', 'radio', 'menuitem', 'menuitemcheckbox',
        'menuitemradio', 'option', 'tab', 'switch', 'slider', 'spinbutton',
        'textbox', 'searchbox', 'combobox', 'listbox', 'tree', 'treegrid',
        'grid', 'row', 'cell', 'gridcell', 'scrollbar',
      ];
      if (role && interactiveRoles.includes(role)) return true;

      // Check tabindex
      if (el.getAttribute('tabindex') !== null) return true;

      // Check click handler (approximate)
      if (el.getAttribute('onclick') !== null) return true;

      return false;
    }

    interface TreeNode {
      role: string;
      name: string;
      level?: number;
      testId?: string;
      bounds?: { x: number; y: number; width: number; height: number };
      children?: TreeNode[];
    }

    function getBounds(el: Element): { x: number; y: number; width: number; height: number } | undefined {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return undefined;
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }

    function buildTree(el: Element, depth = 0): TreeNode | null {
      // Skip hidden elements
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return null;
      }

      // Skip elements with aria-hidden
      if (el.getAttribute('aria-hidden') === 'true') {
        return null;
      }

      const role = getRole(el);
      const name = getAccessibleName(el);
      const testId = el.getAttribute('data-testid') || undefined;

      // Collect children
      const children: TreeNode[] = [];
      for (const child of el.children) {
        const childNode = buildTree(child, depth + 1);
        if (childNode) {
          children.push(childNode);
        }
      }

      // Skip non-interesting nodes (no role, no name, no interactivity)
      // unless they have interesting children
      if (!role && !name && !isInteractive(el) && children.length === 0) {
        return null;
      }

      // If this node has no role/name but has children, return children directly
      if (!role && !name && children.length > 0) {
        // Flatten - return null but children should be collected at parent level
        return null;
      }

      const node: TreeNode = { role, name };

      const level = getHeadingLevel(el);
      if (level !== undefined) {
        node.level = level;
      }

      if (testId) {
        node.testId = testId;
      }

      // Capture bounding box for annotation
      const bounds = getBounds(el);
      if (bounds) {
        node.bounds = bounds;
      }

      if (children.length > 0) {
        node.children = children;
      }

      return node;
    }

    function collectNodes(el: Element): TreeNode[] {
      const result: TreeNode[] = [];

      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return result;
      }

      if (el.getAttribute('aria-hidden') === 'true') {
        return result;
      }

      const node = buildTree(el);
      if (node) {
        result.push(node);
      } else {
        // Collect from children if current node is not interesting
        for (const child of el.children) {
          result.push(...collectNodes(child));
        }
      }

      return result;
    }

    return collectNodes(document.body);
  });

  // Process the raw tree and assign refs
  const tree = processNodes(rawTree as RawNode[]);

  // Generate human-readable text
  const text = generateTextOutput(tree);

  return {
    snapshotId,
    title,
    url,
    tree,
    text,
  };
}

interface RawNode {
  role: string;
  name: string;
  level?: number;
  testId?: string;
  bounds?: BoundingBox;
  children?: RawNode[];
}

/**
 * Process raw nodes and assign refs
 */
function processNodes(nodes: RawNode[]): SnapshotElement[] {
  const results: SnapshotElement[] = [];

  for (const node of nodes) {
    // Only assign refs to nodes that have a role or are interesting
    if (node.role || node.name) {
      const ref = refManager.registerElement(node.role, node.name, node.testId);

      const element: SnapshotElement = {
        ref,
        role: node.role || 'generic',
        name: node.name,
      };

      if (node.level !== undefined) {
        element.level = node.level;
      }

      // Store bounding box for annotations
      if (node.bounds) {
        element.bounds = node.bounds;
        currentBoundingBoxes.set(ref, node.bounds);
      }

      if (node.children && node.children.length > 0) {
        const childElements = processNodes(node.children);
        if (childElements.length > 0) {
          element.children = childElements;
        }
      }

      results.push(element);
    } else if (node.children) {
      // Process children even if this node is not interesting
      results.push(...processNodes(node.children));
    }
  }

  return results;
}

/**
 * Generate human-readable text output
 */
function generateTextOutput(
  elements: SnapshotElement[],
  indent = 0
): string {
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);

  for (const element of elements) {
    const namePart = element.name ? ` "${element.name}"` : '';
    const levelPart = element.level !== undefined ? ` [level ${element.level}]` : '';

    lines.push(`${prefix}- [${element.ref}] ${element.role}${namePart}${levelPart}`);

    if (element.children) {
      lines.push(generateTextOutput(element.children, indent + 1));
    }
  }

  return lines.join('\n');
}

/**
 * Inject annotation overlays onto the page
 */
export async function injectAnnotations(page: Page): Promise<void> {
  const boxes = Array.from(currentBoundingBoxes.entries());

  if (boxes.length === 0) {
    return;
  }

  await page.evaluate((annotations: Array<[string, BoundingBox]>) => {
    // Create container for annotations
    const container = document.createElement('div');
    container.id = '__electron_mcp_annotations__';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 2147483647;
    `;

    for (const [ref, bounds] of annotations) {
      // Create highlight box
      const highlight = document.createElement('div');
      highlight.style.cssText = `
        position: fixed;
        left: ${bounds.x}px;
        top: ${bounds.y}px;
        width: ${bounds.width}px;
        height: ${bounds.height}px;
        border: 2px solid rgba(255, 107, 107, 0.8);
        background: rgba(255, 107, 107, 0.1);
        box-sizing: border-box;
        pointer-events: none;
      `;

      // Create ref label
      const label = document.createElement('div');
      label.textContent = ref;
      label.style.cssText = `
        position: fixed;
        left: ${bounds.x}px;
        top: ${Math.max(0, bounds.y - 18)}px;
        background: rgba(255, 107, 107, 0.95);
        color: white;
        font-family: monospace;
        font-size: 11px;
        font-weight: bold;
        padding: 1px 4px;
        border-radius: 2px;
        pointer-events: none;
        white-space: nowrap;
      `;

      container.appendChild(highlight);
      container.appendChild(label);
    }

    document.body.appendChild(container);
  }, boxes);
}

/**
 * Remove annotation overlays from the page
 */
export async function removeAnnotations(page: Page): Promise<void> {
  await page.evaluate(() => {
    const container = document.getElementById('__electron_mcp_annotations__');
    if (container) {
      container.remove();
    }
  });
}

/**
 * Take a screenshot of the page
 */
export async function takeScreenshot(
  page: Page,
  options: {
    fullPage?: boolean;
    type?: 'png' | 'jpeg';
    quality?: number;
    annotate?: boolean;
  } = {}
): Promise<Buffer> {
  const { annotate = false, ...screenshotOptions } = options;

  // If annotating, ensure we have bounding boxes and inject overlays
  if (annotate) {
    // If no snapshot taken yet, take one to get bounding boxes
    if (currentBoundingBoxes.size === 0) {
      await captureSnapshot(page);
    }

    await injectAnnotations(page);
  }

  try {
    const buffer = await page.screenshot({
      fullPage: screenshotOptions.fullPage ?? false,
      type: screenshotOptions.type ?? 'png',
      quality: screenshotOptions.type === 'jpeg' ? (screenshotOptions.quality ?? 80) : undefined,
    });

    return buffer;
  } finally {
    // Always clean up annotations
    if (annotate) {
      await removeAnnotations(page);
    }
  }
}
