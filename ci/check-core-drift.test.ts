import assert from 'node:assert/strict'
import {
  appendFileSync,
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'vitest'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const guard = join(root, 'ci/check-core-drift.mjs')

function runGuard(cwd: string) {
  return spawnSync(process.execPath, [guard], { cwd, encoding: 'utf8' })
}

function copyFixture() {
  const target = mkdtempSync(join(tmpdir(), 'phishsim-core-provenance-'))
  for (const file of ['core-provenance.json', 'package.json', 'pnpm-lock.yaml']) {
    cpSync(join(root, file), join(target, file))
  }
  mkdirSync(join(target, 'vendor'), { recursive: true })
  cpSync(
    join(root, 'vendor/kaan-os-core-7.4.0.tgz'),
    join(target, 'vendor/kaan-os-core-7.4.0.tgz'),
  )
  cpSync(
    join(root, 'server/os/kaan-os-core'),
    join(target, 'server/os/kaan-os-core'),
    { recursive: true },
  )
  mkdirSync(join(target, 'node_modules/@kaan/os-core'), { recursive: true })
  cpSync(
    join(root, 'node_modules/@kaan/os-core/package.json'),
    join(target, 'node_modules/@kaan/os-core/package.json'),
  )
  return target
}

test('core provenance guard accepts the package and legacy snapshot', () => {
  const result = runGuard(root)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /@kaan\/os-core@7\.4\.0 exact artifact/)
})

test('core provenance guard rejects package ranges', () => {
  const target = copyFixture()
  const pkgPath = join(target, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  pkg.dependencies['@kaan/os-core'] = '^7.4.0'
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

  const result = runGuard(target)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /exact immutable local artifact|unpinned range/)
})

test('core provenance guard rejects artifact and canonical source drift', () => {
  const target = copyFixture()
  appendFileSync(join(target, 'vendor/kaan-os-core-7.4.0.tgz'), 'tampered')
  const provenancePath = join(target, 'core-provenance.json')
  const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'))
  provenance.canonicalSource.commit = '0000000000000000000000000000000000000000'
  writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`)

  const result = runGuard(target)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /canonical commit/)
  assert.match(result.stderr, /sha256/)
})

test('core provenance guard rejects recursive legacy drift', () => {
  const target = copyFixture()
  appendFileSync(join(target, 'server/os/kaan-os-core/version.ts'), '\n// drift')

  const result = runGuard(target)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /legacy recursive snapshot/)
  assert.match(result.stderr, /legacy content drifted/)
})
