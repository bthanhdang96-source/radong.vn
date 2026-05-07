import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'

const serverDir = fileURLToPath(new URL('.', import.meta.url))
const rootEnvPath = resolve(serverDir, '..', '.env')
const serverEnvPath = resolve(serverDir, '.env')

if (existsSync(rootEnvPath)) {
  loadEnv({ path: rootEnvPath, override: false, quiet: true })
}

if (existsSync(serverEnvPath)) {
  loadEnv({ path: serverEnvPath, override: true, quiet: true })
}
