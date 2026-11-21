import { defineConfig } from 'vite'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const runGit = (args: string[]) => {
  try {
    return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

const tag = runGit(['describe', '--tags', '--match', 'v[0-9]*', '--abbrev=0'])
const commit = runGit(['rev-parse', '--short=7', 'HEAD'])
const frontendVersion = `frontend-${tag || 'v0.0.0'}-g${commit || 'unknown'}`

// https://vite.dev/config/
export default defineConfig({
  define: {
    __FRONTEND_VERSION__: JSON.stringify(frontendVersion),
  },
  plugins: [reactRouter(), tailwindcss()],
})
