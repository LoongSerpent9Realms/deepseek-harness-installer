/** No runtime invariant: this is a UI plugin with no durable state. */
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

export const installer: InvariantInstaller = () => {}
