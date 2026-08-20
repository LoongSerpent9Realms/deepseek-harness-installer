import { clientBundle } from '../tsdown.client.ts'
import type { UserConfig } from 'tsdown'

// Override the default entry to use .tsx instead of .ts
const config = clientBundle('@loongserpent/dsh-client-ui-workspace-drag-drop', [
  'lib/types/index.js',
  'lib/types/invariant.js',
])

// Wrap the config function to override the client entry
export default ((inlineConfig: Pick<UserConfig, 'env'>) => {
  const configs = config(inlineConfig)
  return configs.map((cfg) => {
    if (typeof cfg === 'object' && cfg !== null && 'name' in cfg && cfg.name === '@loongserpent/dsh-client-ui-workspace-drag-drop/client') {
      return { ...cfg, entry: { client: 'src/client/index.tsx' } }
    }
    return cfg
  })
}) as typeof config
