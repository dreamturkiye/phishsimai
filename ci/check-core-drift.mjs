import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'

const EXPECTED = Object.freeze({
  name: '@kaan/os-core',
  version: '7.5.0',
  dependency: 'file:vendor/kaan-os-core-7.5.0.tgz',
  artifact: 'vendor/kaan-os-core-7.5.0.tgz',
  sha256: '9671f770923040075cd60c31f1ab85f4d21b1452a1476b26d71a8bd38effb4a2',
  integrity: 'sha512-boaQlmI07p9X+GznR5iL+tEIFE9EXoS4vZ1rxOl/kvM1i9VluvLRc5cInpThjExqeugmHzjgU7reGI5Gt9SXtA==',
  commit: '15dc3d849caa07d7ed3be1d5abd6de671cb414f4',
  tree: '027a937f656ab056aa13dc546d8c4db5306a1ef1',
})

const root = resolve(process.cwd())
const provenancePath = join(root, 'core-provenance.json')
const packagePath = join(root, 'package.json')
const lockPath = join(root, 'pnpm-lock.yaml')
const violations = []

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    violations.push(`${label} -- invalid or missing JSON: ${error.message}`)
    return {}
  }
}

function readText(path, label) {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    violations.push(`${label} -- missing or unreadable: ${error.message}`)
    return ''
  }
}

function hashFile(path, algorithm) {
  return createHash(algorithm).update(readFileSync(path)).digest('hex')
}

function recursiveFiles(directory, excluded = new Set()) {
  const files = []
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name)
      const rel = relative(directory, absolute).split('\\').join('/')
      if (excluded.has(rel)) continue
      if (entry.isDirectory()) walk(absolute)
      else if (entry.isFile()) files.push(rel)
      else violations.push(`${rel} -- legacy snapshot may contain regular files only`)
    }
  }
  walk(directory)
  return files.sort()
}

function recursiveSnapshotHash(directory, files) {
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(file)
    hash.update('\0')
    hash.update(readFileSync(join(directory, file)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

const provenance = readJson(provenancePath, 'core-provenance.json')
const pkg = readJson(packagePath, 'package.json')
const lock = readText(lockPath, 'pnpm-lock.yaml')
const packageProvenance = provenance.package ?? {}
const canonical = provenance.canonicalSource ?? {}
const legacyProvenance = provenance.legacySnapshot ?? {}

for (const [field, expected] of Object.entries({
  name: EXPECTED.name,
  version: EXPECTED.version,
  dependency: EXPECTED.dependency,
  artifact: EXPECTED.artifact,
  sha256: EXPECTED.sha256,
  integrity: EXPECTED.integrity,
})) {
  if (packageProvenance[field] !== expected) {
    violations.push(`provenance package.${field} -- expected ${expected}, got ${packageProvenance[field]}`)
  }
}
if (canonical.repository !== 'dreamturkiye/kaan-os-core') {
  violations.push(`canonical repository -- expected dreamturkiye/kaan-os-core, got ${canonical.repository}`)
}
if (canonical.commit !== EXPECTED.commit) {
  violations.push(`canonical commit -- expected ${EXPECTED.commit}, got ${canonical.commit}`)
}
if (canonical.tree !== EXPECTED.tree) {
  violations.push(`canonical tree -- expected ${EXPECTED.tree}, got ${canonical.tree}`)
}

const dependency = pkg.dependencies?.[EXPECTED.name]
if (dependency !== EXPECTED.dependency) {
  violations.push(
    `${EXPECTED.name} dependency must be the exact immutable local artifact ${EXPECTED.dependency}; ranges, tags, registries, and other paths are forbidden`,
  )
}
if (typeof dependency === 'string' && /^[~^*]|[<>=|]|\bx\b/i.test(dependency)) {
  violations.push(`${EXPECTED.name} dependency is an unpinned range: ${dependency}`)
}

const importerMatch = lock.match(
  /^\s{6}'@kaan\/os-core':\n\s{8}specifier:\s*(\S+)\n\s{8}version:\s*(\S+)/m,
)
if (importerMatch?.[1] !== EXPECTED.dependency || importerMatch?.[2] !== EXPECTED.dependency) {
  violations.push('pnpm lock importer must pin the exact local core artifact')
}
const packageKey = `  '${EXPECTED.name}@${EXPECTED.dependency}':`
if (!lock.includes(packageKey)) {
  violations.push(`pnpm lock package key -- missing ${EXPECTED.name}@${EXPECTED.dependency}`)
}
if (!lock.includes(`integrity: ${EXPECTED.integrity}, tarball: ${EXPECTED.dependency}`)) {
  violations.push('pnpm lock resolution must pin the exact artifact integrity and tarball')
}

const artifactPath = join(root, EXPECTED.artifact)
try {
  const stat = lstatSync(artifactPath)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    violations.push(`${EXPECTED.artifact} -- artifact must be a regular, immutable repository file`)
  } else {
    const sha256 = hashFile(artifactPath, 'sha256')
    const integrity = `sha512-${Buffer.from(hashFile(artifactPath, 'sha512'), 'hex').toString('base64')}`
    if (sha256 !== EXPECTED.sha256) {
      violations.push(`${EXPECTED.artifact} -- sha256 ${sha256} does not match exact pinned artifact`)
    }
    if (integrity !== EXPECTED.integrity) {
      violations.push(`${EXPECTED.artifact} -- sha512 integrity does not match exact pinned artifact`)
    }
  }
} catch (error) {
  violations.push(`${EXPECTED.artifact} -- missing artifact: ${error.message}`)
}

if (basename(EXPECTED.artifact) !== `kaan-os-core-${EXPECTED.version}.tgz`) {
  violations.push(`${EXPECTED.artifact} -- artifact filename does not pin package version`)
}

const installedPackage = readJson(
  join(root, 'node_modules', '@kaan', 'os-core', 'package.json'),
  'installed @kaan/os-core package.json',
)
if (installedPackage.name !== EXPECTED.name || installedPackage.version !== EXPECTED.version) {
  violations.push(
    `installed package identity -- expected ${EXPECTED.name}@${EXPECTED.version}, got ${installedPackage.name}@${installedPackage.version}`,
  )
}

const legacyDirectory = join(root, legacyProvenance.path ?? 'server/os/kaan-os-core')
const legacyManifest = readJson(join(legacyDirectory, '.core-version'), 'legacy .core-version')
if (
  legacyProvenance.classification !== 'legacy-product-diverged-pre-v7'
  || legacyProvenance.canonical !== false
  || legacyProvenance.vintage !== 'pre-v7'
) {
  violations.push('provenance legacy snapshot must be classified product-diverged/pre-v7 with canonical=false')
}
if (
  legacyManifest.classification !== 'legacy-product-diverged-pre-v7'
  || legacyManifest.canonical !== false
  || legacyManifest.vintage !== 'pre-v7'
) {
  violations.push('legacy .core-version must identify product-diverged/pre-v7 files as non-canonical')
}
for (const [field, expected] of Object.entries({
  name: EXPECTED.name,
  version: EXPECTED.version,
  artifact_sha256: EXPECTED.sha256,
  integrity: EXPECTED.integrity,
  commit: EXPECTED.commit,
  tree: EXPECTED.tree,
})) {
  if (legacyManifest.canonical_package?.[field] !== expected) {
    violations.push(`legacy canonical_package.${field} -- expected ${expected}, got ${legacyManifest.canonical_package?.[field]}`)
  }
}

let legacyFiles = []
try {
  legacyFiles = recursiveFiles(legacyDirectory, new Set(['.core-version']))
  const recursiveHash = recursiveSnapshotHash(legacyDirectory, legacyFiles)
  if (recursiveHash !== legacyProvenance.recursiveSha256) {
    violations.push(`legacy recursive snapshot -- ${recursiveHash} does not match provenance ${legacyProvenance.recursiveSha256}`)
  }
  if (recursiveHash !== legacyManifest.recursive_sha256) {
    violations.push(`legacy recursive snapshot -- ${recursiveHash} does not match .core-version ${legacyManifest.recursive_sha256}`)
  }
} catch (error) {
  violations.push(`legacy recursive snapshot -- cannot read: ${error.message}`)
}

const legacyTsFiles = legacyFiles.filter(file => file.endsWith('.ts'))
for (const file of legacyTsFiles) {
  const actual = hashFile(join(legacyDirectory, file), 'sha256')
  const pinned = legacyManifest.files?.[file]
  if (!pinned) violations.push(`${file} -- legacy file is not in the pinned manifest`)
  else if (pinned !== actual) violations.push(`${file} -- legacy content drifted from ${legacyManifest.tag}`)
}
for (const file of Object.keys(legacyManifest.files ?? {})) {
  if (!legacyTsFiles.includes(file)) violations.push(`${file} -- legacy manifest entry is missing on disk`)
}

if (violations.length === 0) {
  console.log(
    `check-core-drift: ${EXPECTED.name}@${EXPECTED.version} exact artifact, canonical commit/tree, pnpm integrity, and ${legacyFiles.length}-file product-diverged/pre-v7 snapshot match provenance`,
  )
  process.exit(0)
}
for (const violation of violations) console.error(`DRIFT: ${violation}`)
console.error(`check-core-drift: ${violations.length} core provenance violation(s)`)
process.exit(1)
