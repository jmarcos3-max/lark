import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig, loadEnv } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const elevenLabsKey = env.ELEVENLABS_API_KEY || env.VITE_ELEVENLABS_API_KEY
  const replicateToken = env.REPLICATE_API_TOKEN || env.VITE_REPLICATE_API_TOKEN
  const isGithubActions = process.env.GITHUB_ACTIONS === 'true'
  const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'lark'

  return {
  // GitHub Pages serves this repo at /<repo-name>/ in production.
  base: isGithubActions ? `/${repoName}/` : '/',
  logLevel: 'error', // Suppress warnings, only show errors
  server: {
    // Audiotool OAuth requires 127.0.0.1, not localhost — see developer.audiotool.com docs
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      ...(elevenLabsKey
        ? {
          '/api/elevenlabs': {
            target: 'https://api.elevenlabs.io',
            changeOrigin: true,
            rewrite: (p) => p.replace(/^\/api\/elevenlabs/, ''),
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq) => {
                proxyReq.setHeader('xi-api-key', elevenLabsKey)
              })
            },
          },
        }
        : {}),
      ...(replicateToken
        ? {
          '/api/replicate': {
            target: 'https://api.replicate.com',
            changeOrigin: true,
            rewrite: (p) => p.replace(/^\/api\/replicate/, '/v1'),
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq) => {
                proxyReq.setHeader('Authorization', `Bearer ${replicateToken}`)
              })
            },
          },
        }
        : {}),
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      react: path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // Pre-bundle Nexus (CJS dep toposort needs a default-export shim in dev).
    include: [
      '@audiotool/nexus',
      '@audiotool/nexus/utils',
      '@spotify/basic-pitch',
      '@tensorflow/tfjs',
    ],
  },
  plugins: [react()],
  }
});