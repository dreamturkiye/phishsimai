import { readFileSync, existsSync, readdirSync } from 'fs';

// Resolve path aliases from tsconfig.json 'paths' (e.g. PhishSim maps @/* -> ./client/src/*).
// Falls back to @/ -> repo root when no tsconfig paths exist (ScrollFuel-style).
function loadAliases() {
  const aliases = [];
  try {
    let raw = readFileSync('tsconfig.json', 'utf8');
    raw = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1');
    const paths = (JSON.parse(raw).compilerOptions || {}).paths || {};
    for (const [pattern, targets] of Object.entries(paths)) {
      if (!pattern.endsWith('/*') || !targets.length) continue;
      aliases.push({ prefix: pattern.slice(0, -1), target: targets[0].replace(/\*$/, '') });
    }
  } catch {}
  if (!aliases.some(a => a.prefix === '@/')) aliases.push({ prefix: '@/', target: './' });
  return aliases;
}
const ALIASES = loadAliases();
import { join, resolve, basename, extname } from 'path';

const skipDirs = new Set(['node_modules', '.next', '.vercel', '.git', 'dist', 'build', 'out', 'coverage']);

let fileCount = 0;

function checkFile(filePath) {
    fileCount++;
    const content = readFileSync(filePath, 'utf-8');
    const regex = /(?:import|export)\s*(?:\w+\s+from\s*)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        const specifier = match[1];
        if (specifier.startsWith('.') || ALIASES.some(a => specifier.startsWith(a.prefix))) {
            checkImport(filePath, specifier);
        } else {
            denylistLLMSDK(specifier, filePath);
        }
    }
}

function checkImport(importingFile, specifier) {
    let resolvedPath;
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
        resolvedPath = resolve(resolve(importingFile, '..'), specifier);
    } else {
        const alias = ALIASES.find(a => specifier.startsWith(a.prefix));
        if (!alias) return;
        resolvedPath = resolve(process.cwd(), alias.target + specifier.slice(alias.prefix.length));
    }
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx'];
    let found = false;
    for (const ext of extensions) {
        if (existsSync(resolvedPath + ext)) {
            found = true;
            break;
        } else if (existsSync(resolve(resolvedPath, 'index' + ext))) {
            found = true;
            break;
        }
    }
    if (!found) {
        violations.push({ file: importingFile, specifier, reason: 'unresolved import' });
    }
}

function denylistLLMSDK(specifier, filePath) {
    const llmSDKs = ['groq-sdk', 'openai', '@google/generative-ai', '@anthropic-ai/sdk'];
    if (llmSDKs.some(sdk => specifier === sdk || specifier.startsWith(sdk + '/'))) {
        const baseName = basename(filePath);
        if (baseName !== 'llmProvider.ts') {
            violations.push({ file: filePath, specifier, reason: 'LLM SDK import outside llmProvider.ts' });
        }
    }
}

const violations = [];

function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && !skipDirs.has(entry.name)) {
            walk(resolve(dir, entry.name));
        } else if (entry.isFile() && ['.ts', '.tsx', '.js', '.jsx'].includes(extname(entry.name))) {
            checkFile(resolve(dir, entry.name));
        }
    }
}

try {
    walk(process.cwd());
    if (violations.length === 0) {
        console.log(`check-imports: ${fileCount} files scanned, 0 violations`);
        process.exit(0);
    } else {
        for (const violation of violations) {
            console.error(`VIOLATION in ${violation.file}: ${violation.specifier} -- ${violation.reason}`);
        }
        console.log(`check-imports: ${violations.length} violations found`);
        process.exit(1);
    }
} catch (error) {
    console.error(error);
    process.exit(1);
}
