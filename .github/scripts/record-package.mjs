import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
const pkg = JSON.parse(readFileSync('package.json', 'utf8')), config = JSON.parse(readFileSync('.github/npm-release.json', 'utf8'))
const [pack] = JSON.parse(readFileSync('.release/pack.json', 'utf8'))
assert.equal(pkg.name, config.package); assert.equal(pkg.version, process.env.RELEASE_VERSION)
assert.equal(pack.name, pkg.name); assert.equal(pack.version, pkg.version)
assert.equal(process.env.GITHUB_REPOSITORY, config.repository)
assert.equal(process.env.GITHUB_REF, 'refs/heads/' + config.branch)
assert.match(pack.filename, /^[a-z0-9][a-z0-9._-]*\.tgz$/)
const integrity = 'sha512-' + createHash('sha512').update(readFileSync('.release/' + pack.filename)).digest('base64')
assert.equal(integrity, pack.integrity)
writeFileSync('.release/manifest.json', JSON.stringify({ name: pkg.name, version: pkg.version, filename: pack.filename, integrity, repository: config.repository, commit: process.env.GITHUB_SHA }, null, 2))
console.log('Verified Windows release artifact')
