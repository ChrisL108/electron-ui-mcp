/**
 * Tool registry - exports all MCP tools
 */

export * from './navigation';
export * from './interaction';
export * from './snapshot';
export * from './evaluation';
export * from './waiting';
export * from './windows';
export * from './application';

import { navigationTools } from './navigation';
import { interactionTools } from './interaction';
import { snapshotTools } from './snapshot';
import { evaluationTools } from './evaluation';
import { waitingTools } from './waiting';
import { windowTools } from './windows';
import { applicationTools } from './application';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
  };
}

/**
 * Get all registered tools
 */
export function getAllTools(): ToolDefinition[] {
  return [
    ...navigationTools,
    ...interactionTools,
    ...snapshotTools,
    ...evaluationTools,
    ...waitingTools,
    ...windowTools,
    ...applicationTools,
  ];
}
