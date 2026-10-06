import type { JsonValue } from './strict-json.ts';

export type OsvProfile = 'minimal' | 'consumer' | 'overlay';
type JsonObject = { [key: string]: JsonValue };

function mapping(value: JsonValue | undefined, location: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${location} must be an object`);
  }
  return value;
}

function list(value: JsonValue | undefined, location: string): JsonValue[] {
  if (!Array.isArray(value)) throw new TypeError(`${location} must be an array`);
  return value;
}

function string(value: JsonValue | undefined, location: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${location} must be a non-empty string`);
  }
}

function optionalString(value: JsonValue | undefined, location: string): void {
  if (value !== undefined && value !== null) string(value, location);
}

export function validateOsvReport(value: JsonValue, profile: OsvProfile): JsonObject {
  const document = mapping(value, 'OSV document');
  for (const [resultIndex, rawResult] of list(document.results, 'OSV document.results').entries()) {
    const resultLocation = `OSV document.results[${resultIndex}]`;
    const result = mapping(rawResult, resultLocation);
    if (profile === 'minimal') continue;
    const source = mapping(result.source, `${resultLocation}.source`);
    string(source.type, `${resultLocation}.source.type`);
    string(source.path, `${resultLocation}.source.path`);
    for (const [packageIndex, rawPackage] of list(result.packages, `${resultLocation}.packages`).entries()) {
      const location = `${resultLocation}.packages[${packageIndex}]`;
      const packageResult = mapping(rawPackage, location);
      const package_ = mapping(packageResult.package, `${location}.package`);
      for (const key of ['ecosystem', 'name', 'version']) optionalString(package_[key], `${location}.package.${key}`);
      for (const [index, rawVulnerability] of list(packageResult.vulnerabilities, `${location}.vulnerabilities`).entries()) {
        const vulnerabilityLocation = `${location}.vulnerabilities[${index}]`;
        const vulnerability = mapping(rawVulnerability, vulnerabilityLocation);
        string(vulnerability.id, `${vulnerabilityLocation}.id`);
        if (profile === 'overlay') {
          for (const key of ['modified', 'published', 'withdrawn', 'summary', 'details', 'schema_version']) {
            optionalString(vulnerability[key], `${vulnerabilityLocation}.${key}`);
          }
          for (const key of ['aliases', 'related', 'affected', 'references', 'severity', 'credits']) {
            if (Object.hasOwn(vulnerability, key)) list(vulnerability[key], `${vulnerabilityLocation}.${key}`);
          }
          for (const key of ['database_specific', 'ecosystem_specific']) {
            if (Object.hasOwn(vulnerability, key)) mapping(vulnerability[key], `${vulnerabilityLocation}.${key}`);
          }
        }
      }
      for (const [index, rawGroup] of list(packageResult.groups, `${location}.groups`).entries()) {
        const groupLocation = `${location}.groups[${index}]`;
        const group = mapping(rawGroup, groupLocation);
        const ids = list(group.ids, `${groupLocation}.ids`);
        if (ids.length === 0) throw new TypeError(`${groupLocation}.ids must contain non-empty strings`);
        for (const id of ids) string(id, `${groupLocation}.ids`);
        if (group.aliases !== undefined && group.aliases !== null) {
          for (const alias of list(group.aliases, `${groupLocation}.aliases`)) string(alias, `${groupLocation}.alias`);
        }
      }
    }
  }
  return document;
}
