/** Locale strings for the workspace drag-drop plugin. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'drag.drop.here': '拖拽文件夹到此处',
  'drag.create.workspace': '创建工作区',
  'drag.invalid.path': '无效的路径',
  'drag.error.title': '创建工作区失败',
} satisfies Record<string, string>

/** The workspace drag-drop namespace key union. */
export type WorkspaceDragDropKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'drag.drop.here': 'Drop folder here',
  'drag.create.workspace': 'Create workspace',
  'drag.invalid.path': 'Invalid path',
  'drag.error.title': 'Failed to create workspace',
} satisfies Record<WorkspaceDragDropKey, string>
