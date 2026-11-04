const fs = require('fs')
const path = require('path')

const targets = ['linux-x64', 'linux-arm64', 'linuxmusl-x64', 'darwin-x64', 'darwin-arm64', 'win32-x64']
const root = path.join(__dirname, '..')
const missing = targets.filter(target => !fs.existsSync(path.join(root, 'prebuilds', target, 'infinitysqlite.node')))

if (missing.length > 0) {
  console.error('infinitysqlite: faltan prebuilds antes de publicar:')
  missing.forEach(target => console.error(`  - prebuilds/${target}/infinitysqlite.node`))
  console.error('infinitysqlite: no publiques a mano, usa el workflow de CI (git tag v* && git push --tags) para generarlos.')
  process.exit(1)
}

console.log('infinitysqlite: todos los prebuilds presentes, listo para publicar.')
