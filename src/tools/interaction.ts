/**
 * Interaction tools - click, type, hover, drag, select, fill_form, press_key, file_upload
 */

import { getGlobalContext } from '../electron/context';
import { refManager } from '../utils/refs';
import type { ToolDefinition } from './index';

export const interactionTools: ToolDefinition[] = [
  {
    name: 'browser_click',
    description:
      'Click on an element identified by ref from the last snapshot. Use browser_snapshot first to get element refs.',
    inputSchema: {
      type: 'object',
      properties: {
        element: {
          type: 'string',
          description: 'Human-readable description of the element being clicked',
        },
        ref: {
          type: 'string',
          description: 'Element ref from snapshot (e.g., "e0", "e1")',
        },
        doubleClick: {
          type: 'boolean',
          description: 'Whether to double-click (default: false)',
        },
        button: {
          type: 'string',
          enum: ['left', 'right', 'middle'],
          description: 'Mouse button to use (default: left)',
        },
        modifiers: {
          type: 'array',
          items: { type: 'string', enum: ['Alt', 'Control', 'Meta', 'Shift'] },
          description: 'Keyboard modifiers to hold during click',
        },
      },
      required: ['element', 'ref'],
    },
    annotations: {
      destructiveHint: false,
    },
    handler: async (args) => {
      const { ref, doubleClick, button = 'left', modifiers } = args as {
        element: string;
        ref: string;
        doubleClick?: boolean;
        button?: 'left' | 'right' | 'middle';
        modifiers?: Array<'Alt' | 'Control' | 'Meta' | 'Shift'>;
      };

      const ctx = getGlobalContext();
      const page = await ctx.getPage();
      const locator = refManager.resolveToLocator(page, ref);

      const clickOptions: Parameters<typeof locator.click>[0] = {
        button,
        clickCount: doubleClick ? 2 : 1,
        modifiers,
        timeout: 10000,
      };

      await locator.click(clickOptions);

      return { success: true };
    },
  },
  {
    name: 'browser_type',
    description:
      'Type text into an input element identified by ref. Use browser_snapshot first to get element refs.',
    inputSchema: {
      type: 'object',
      properties: {
        element: {
          type: 'string',
          description: 'Human-readable description of the element',
        },
        ref: {
          type: 'string',
          description: 'Element ref from snapshot (e.g., "e0", "e1")',
        },
        text: {
          type: 'string',
          description: 'Text to type',
        },
        submit: {
          type: 'boolean',
          description: 'Whether to press Enter after typing (default: false)',
        },
        slowly: {
          type: 'boolean',
          description: 'Whether to type slowly with delays (default: false)',
        },
        clear: {
          type: 'boolean',
          description: 'Whether to clear the field before typing (default: false)',
        },
      },
      required: ['element', 'ref', 'text'],
    },
    annotations: {
      destructiveHint: false,
    },
    handler: async (args) => {
      const { ref, text, submit, slowly, clear } = args as {
        element: string;
        ref: string;
        text: string;
        submit?: boolean;
        slowly?: boolean;
        clear?: boolean;
      };

      const ctx = getGlobalContext();
      const page = await ctx.getPage();
      const locator = refManager.resolveToLocator(page, ref);

      if (clear) {
        await locator.clear();
      }

      await locator.type(text, {
        delay: slowly ? 100 : 0,
        timeout: 10000,
      });

      if (submit) {
        await locator.press('Enter');
      }

      return { success: true };
    },
  },
  {
    name: 'browser_press_key',
    description:
      'Press a keyboard key. Can target a specific element or the page.',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description:
            'Key to press (e.g., "Enter", "Tab", "Escape", "ArrowDown", "Control+a")',
        },
        element: {
          type: 'string',
          description: 'Human-readable description of the element (optional)',
        },
        ref: {
          type: 'string',
          description: 'Element ref to press key on (optional, presses on page if not specified)',
        },
      },
      required: ['key'],
    },
    annotations: {
      destructiveHint: false,
    },
    handler: async (args) => {
      const { key, ref } = args as {
        key: string;
        element?: string;
        ref?: string;
      };

      const ctx = getGlobalContext();
      const page = await ctx.getPage();

      if (ref) {
        const locator = refManager.resolveToLocator(page, ref);
        await locator.press(key);
      } else {
        await page.keyboard.press(key);
      }

      return { success: true };
    },
  },
  {
    name: 'browser_hover',
    description: 'Hover over an element identified by ref.',
    inputSchema: {
      type: 'object',
      properties: {
        element: {
          type: 'string',
          description: 'Human-readable description of the element',
        },
        ref: {
          type: 'string',
          description: 'Element ref from snapshot',
        },
      },
      required: ['element', 'ref'],
    },
    annotations: {
      destructiveHint: false,
    },
    handler: async (args) => {
      const { ref } = args as { element: string; ref: string };

      const ctx = getGlobalContext();
      const page = await ctx.getPage();
      const locator = refManager.resolveToLocator(page, ref);

      await locator.hover({ timeout: 10000 });

      return { success: true };
    },
  },
  {
    name: 'browser_drag',
    description: 'Drag an element from one location to another.',
    inputSchema: {
      type: 'object',
      properties: {
        startElement: {
          type: 'string',
          description: 'Human-readable description of the source element',
        },
        startRef: {
          type: 'string',
          description: 'Element ref of the drag source',
        },
        endElement: {
          type: 'string',
          description: 'Human-readable description of the target element',
        },
        endRef: {
          type: 'string',
          description: 'Element ref of the drag target',
        },
      },
      required: ['startElement', 'startRef', 'endElement', 'endRef'],
    },
    annotations: {
      destructiveHint: false,
    },
    handler: async (args) => {
      const { startRef, endRef } = args as {
        startElement: string;
        startRef: string;
        endElement: string;
        endRef: string;
      };

      const ctx = getGlobalContext();
      const page = await ctx.getPage();
      const sourceLocator = refManager.resolveToLocator(page, startRef);
      const targetLocator = refManager.resolveToLocator(page, endRef);

      await sourceLocator.dragTo(targetLocator, { timeout: 10000 });

      return { success: true };
    },
  },
  {
    name: 'browser_select_option',
    description: 'Select an option in a dropdown/select element.',
    inputSchema: {
      type: 'object',
      properties: {
        element: {
          type: 'string',
          description: 'Human-readable description of the select element',
        },
        ref: {
          type: 'string',
          description: 'Element ref from snapshot',
        },
        value: {
          type: 'string',
          description: 'Option value to select',
        },
        label: {
          type: 'string',
          description: 'Option label to select (alternative to value)',
        },
        index: {
          type: 'number',
          description: 'Option index to select (alternative to value/label)',
        },
      },
      required: ['element', 'ref'],
    },
    annotations: {
      destructiveHint: false,
    },
    handler: async (args) => {
      const { ref, value, label, index } = args as {
        element: string;
        ref: string;
        value?: string;
        label?: string;
        index?: number;
      };

      const ctx = getGlobalContext();
      const page = await ctx.getPage();
      const locator = refManager.resolveToLocator(page, ref);

      if (value !== undefined) {
        await locator.selectOption({ value });
      } else if (label !== undefined) {
        await locator.selectOption({ label });
      } else if (index !== undefined) {
        await locator.selectOption({ index });
      } else {
        throw new Error('Must specify value, label, or index to select');
      }

      return { success: true };
    },
  },
  {
    name: 'browser_fill_form',
    description: 'Fill multiple form fields at once.',
    inputSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          description: 'Array of field values to fill',
          items: {
            type: 'object',
            properties: {
              ref: { type: 'string', description: 'Element ref' },
              value: { type: 'string', description: 'Value to fill' },
            },
            required: ['ref', 'value'],
          },
        },
        submit: {
          type: 'boolean',
          description: 'Whether to submit the form after filling (default: false)',
        },
      },
      required: ['fields'],
    },
    annotations: {
      destructiveHint: false,
    },
    handler: async (args) => {
      const { fields, submit } = args as {
        fields: Array<{ ref: string; value: string }>;
        submit?: boolean;
      };

      const ctx = getGlobalContext();
      const page = await ctx.getPage();

      for (const field of fields) {
        const locator = refManager.resolveToLocator(page, field.ref);
        await locator.fill(field.value);
      }

      if (submit) {
        await page.keyboard.press('Enter');
      }

      return { success: true, filledFields: fields.length };
    },
  },
  {
    name: 'browser_file_upload',
    description: 'Upload files to a file input element.',
    inputSchema: {
      type: 'object',
      properties: {
        element: {
          type: 'string',
          description: 'Human-readable description of the file input',
        },
        ref: {
          type: 'string',
          description: 'Element ref from snapshot',
        },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'File paths to upload',
        },
      },
      required: ['element', 'ref', 'paths'],
    },
    annotations: {
      destructiveHint: false,
    },
    handler: async (args) => {
      const { ref, paths } = args as {
        element: string;
        ref: string;
        paths: string[];
      };

      const ctx = getGlobalContext();
      const page = await ctx.getPage();
      const locator = refManager.resolveToLocator(page, ref);

      await locator.setInputFiles(paths);

      return { success: true, uploadedFiles: paths.length };
    },
  },
];
