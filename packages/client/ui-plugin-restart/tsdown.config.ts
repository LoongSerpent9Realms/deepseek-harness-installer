import { clientBundle } from '../tsdown.client.ts'
import type { UserConfig } from 'tsdown'

const config = clientBundle('@deepseek-ai/dsh-client-ui-plugin-restart', [
  'lib/types/index.js',
  'lib/types/invariant.js',
])

// Override the default entry to use .tsx instead of .ts
export default ((inlineConfig: Pick<UserConfig, 'env'>) => {
  const configs = config(inlineConfig)
  return configs.map((cfg) => {
    if (typeof cfg === 'object' && cfg !== null && 'name' in cfg && cfg.name === '@deepseek-ai/dsh-client-ui-plugin-restart/client') {
      return { ...cfg, entry: { client: 'src/client/index.tsx' } }
    }
    return cfg
  })
}) as typeof config
