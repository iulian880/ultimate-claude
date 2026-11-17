#!/usr/bin/env node
// Structure and frontmatter linter for a Claude Code plugin directory.
// Usage: node scripts/lint-plugin.mjs <pluginDir>   (exit 1 when problems exist)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_SKILL_LISTING = 1536;

/** Parses `key: value` lines between the first two `---` lines. Returns null when there is no frontmatter. */
export function parseFrontmatter(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (end === -1) return null;
  const data = {};
  for (const line of lines.slice(1, end)) {
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    const quote = value[0];
    if (value.length >= 2 && (quote === '"' || quote === "'") && value.at(-1) === quote) {
      value = value.slice(1, -1);
    }
    data[m[1]] = value;
  }
  return data;
}

function readFrontmatter(file, label, problems) {
  const data = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  if (!data) problems.push(`${label}: missing frontmatter`);
  return data;
}

function listDir(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];
}

function lintManifest(pluginDir, problems) {
  const label = '.claude-plugin/plugin.json';
  const file = path.join(pluginDir, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(file)) return problems.push(`${label}: missing`);
  try {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!manifest.name) problems.push(`${label}: missing name`);
  } catch (err) {
    problems.push(`${label}: invalid JSON (${err.message})`);
  }
}

function lintAgents(pluginDir, problems) {
  for (const entry of listDir(path.join(pluginDir, 'agents'))) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const label = `agents/${entry.name}`;
    const data = readFrontmatter(path.join(pluginDir, 'agents', entry.name), label, problems);
    if (!data) continue;
    const expected = entry.name.slice(0, -'.md'.length);
    if (!data.name) problems.push(`${label}: missing name`);
    else if (data.name !== expected) problems.push(`${label}: name "${data.name}" differs from file name "${expected}"`);
    if (!data.description) problems.push(`${label}: missing description`);
  }
}

function lintSkills(pluginDir, problems) {
  for (const entry of listDir(path.join(pluginDir, 'skills'))) {
    if (!entry.isDirectory()) continue;
    const label = `skills/${entry.name}/SKILL.md`;
    const file = path.join(pluginDir, 'skills', entry.name, 'SKILL.md');
    if (!fs.existsSync(file)) {
      problems.push(`${label}: missing`);
      continue;
    }
    const data = readFrontmatter(file, label, problems);
    if (!data) continue;
    if (!data.name) problems.push(`${label}: missing name`);
    else if (data.name !== entry.name) problems.push(`${label}: name "${data.name}" differs from directory "${entry.name}"`);
    if (!data.description) problems.push(`${label}: missing description`);
    const listing = (data.description ?? '').length + (data.when_to_use ?? '').length;
    if (listing > MAX_SKILL_LISTING) {
      problems.push(`${label}: description + when_to_use is ${listing} chars, over the ${MAX_SKILL_LISTING} limit`);
    }
  }
}

function lintHooks(pluginDir, problems) {
  const label = 'hooks/hooks.json';
  const file = path.join(pluginDir, 'hooks', 'hooks.json');
  if (!fs.existsSync(file)) return;
  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return problems.push(`${label}: invalid JSON (${err.message})`);
  }
  if (!config || typeof config.hooks !== 'object' || config.hooks === null) {
    return problems.push(`${label}: missing top-level "hooks" object`);
  }
  for (const [event, groups] of Object.entries(config.hooks)) {
    if (!Array.isArray(groups)) {
      problems.push(`${label}: ${event} must be an array`);
      continue;
    }
    for (const group of groups) {
      for (const hook of Array.isArray(group?.hooks) ? group.hooks : []) {
        if (hook?.type !== 'command') continue;
        const text = [hook.command, ...(Array.isArray(hook.args) ? hook.args : [])].join(' ');
        for (const m of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}[\\/]([^"'\s]+)/g)) {
          if (!fs.existsSync(path.join(pluginDir, m[1]))) {
            problems.push(`${label}: ${event} command points to a missing script: ${m[1]}`);
          }
        }
      }
    }
  }
}

/** Returns the list of problems found in a plugin directory; empty means OK. */
export function lintPlugin(pluginDir) {
  const problems = [];
  if (!fs.existsSync(pluginDir)) return [`${pluginDir}: plugin directory does not exist`];
  lintManifest(pluginDir, problems);
  lintAgents(pluginDir, problems);
  lintSkills(pluginDir, problems);
  lintHooks(pluginDir, problems);
  return problems;
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isMain()) {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node scripts/lint-plugin.mjs <pluginDir>');
    process.exitCode = 1;
  } else {
    const problems = lintPlugin(path.resolve(target));
    for (const p of problems) console.error(p);
    if (problems.length) process.exitCode = 1;
    else console.log(`OK: ${target}`);
  }
}
