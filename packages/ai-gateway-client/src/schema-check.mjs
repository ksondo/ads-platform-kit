import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

// Validates values against the shared contract schemas (contracts/ai-gateway-v1). The same
// keyword subset as the gateway's validator (RAG-Intelligence-AI-Platform gateway/src/schema).

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'contracts', 'ai-gateway-v1');
export const SCHEMAS = Object.fromEntries(readdirSync(DIR).filter(f => f.endsWith('.schema.json')).map(f => [f.replace('.schema.json', ''), JSON.parse(readFileSync(join(DIR, f), 'utf8'))]));

const typeOf = v => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const isType = (v, t) => (t === 'number' ? ['number', 'integer'].includes(typeOf(v)) : typeOf(v) === t);

export function validate(schema, value, path = '$') {
  const errors = [];
  if (schema.oneOf) {
    const n = schema.oneOf.filter(s => validate(s, value, path).length === 0).length;
    return n === 1 ? [] : [`${path}: must match exactly one schema (matched ${n})`];
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(t => isType(value, t))) return [`${path}: expected ${types.join('|')}, got ${typeOf(value)}`];
  }
  if (schema.const !== undefined && value !== schema.const) errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: not in enum`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: too long`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: pattern`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above maximum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: too many items`);
    if (schema.items) value.forEach((x, i) => errors.push(...validate(schema.items, x, `${path}[${i}]`)));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of schema.required ?? []) if (!(k in value)) errors.push(`${path}: missing ${k}`);
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties?.[k]) errors.push(...validate(schema.properties[k], v, `${path}.${k}`));
      else if (schema.additionalProperties === false) errors.push(`${path}: unexpected ${k}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') errors.push(...validate(schema.additionalProperties, v, `${path}.${k}`));
    }
  }
  return errors;
}

export function assertContract(name, value) {
  const schema = SCHEMAS[name];
  if (!schema) throw new Error(`unknown contract schema ${name}`);
  const errors = validate(schema, value);
  if (errors.length) throw new Error(`contract ${name} violated: ${errors.join('; ')}`);
  return value;
}
