#!/usr/bin/env node
/**
 * Проверяет корневой OpenAPI-контракт на уровне, который не покрывает Spectral:
 *
 * 1. у каждой операции есть operationId;
 * 2. все operationId уникальны;
 * 3. management token не встречается в path/query параметрах и в шаблонах путей (правило M-6);
 * 4. каждая схема-объект закрыта от неожиданных свойств (additionalProperties: false).
 *
 * Запуск: node scripts/check-operation-ids.mjs [openapi.yaml]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

const file = resolve(process.cwd(), process.argv[2] ?? 'openapi.yaml');
const document = parse(readFileSync(file, 'utf8'));

const problems = [];
const operationIds = new Map();

for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
  if (/token/i.test(path)) {
    problems.push(`M-6: path template "${path}" must not contain a token.`);
  }

  const pathParameters = pathItem.parameters ?? [];

  for (const method of HTTP_METHODS) {
    const operation = pathItem[method];
    if (!operation) {
      continue;
    }

    const location = `${method.toUpperCase()} ${path}`;
    const operationId = operation.operationId;

    if (!operationId) {
      problems.push(`${location}: operationId is missing.`);
    } else if (operationIds.has(operationId)) {
      problems.push(
        `${location}: operationId "${operationId}" duplicates ${operationIds.get(operationId)}.`,
      );
    } else {
      operationIds.set(operationId, location);
    }

    for (const parameter of [...pathParameters, ...(operation.parameters ?? [])]) {
      const resolved = parameter.$ref ? resolveRef(document, parameter.$ref) : parameter;
      if (
        (resolved.in === 'path' || resolved.in === 'query') &&
        /token/i.test(resolved.name ?? '')
      ) {
        problems.push(
          `${location}: M-6 violated, parameter "${resolved.name}" in ${resolved.in} looks like a token.`,
        );
      }
    }
  }
}

for (const [name, schema] of Object.entries(document.components?.schemas ?? {})) {
  if (schema.type === 'object' && schema.additionalProperties !== false) {
    problems.push(`components.schemas.${name}: object schema must set additionalProperties: false.`);
  }
}

function resolveRef(root, ref) {
  return ref
    .replace(/^#\//, '')
    .split('/')
    .reduce((node, segment) => node?.[segment.replace(/~1/g, '/').replace(/~0/g, '~')], root);
}

if (problems.length > 0) {
  console.error('Contract checks failed:');
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.log(
  `Contract checks passed: ${operationIds.size} unique operationIds, ` +
    `${Object.keys(document.components?.schemas ?? {}).length} schemas.`,
);
for (const [operationId, location] of operationIds) {
  console.log(`  ${operationId.padEnd(34)} ${location}`);
}
