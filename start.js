import { spawn } from 'node:child_process'
const server = spawn(process.execPath, ['server/index.js'], { stdio: 'inherit' })
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: 'inherit' })
const stop = () => { server.kill(); vite.kill() }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
server.on('exit', () => { vite.kill(); process.exit() })
vite.on('exit', () => { server.kill(); process.exit() })
