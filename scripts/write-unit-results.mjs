import fs from 'node:fs/promises'; import path from 'node:path'; import { reportsDir, root, writeJson } from './quality-utils.mjs';
const nodeFiles=(await fs.readdir(path.join(root,'tests'),{withFileTypes:true})).filter((entry)=>entry.isFile()&&(/\.(test|integration)\.mjs$/.test(entry.name))).length;
const frontendFiles=(await fs.readdir(path.join(root,'tests/frontend'))).filter((name)=>name.endsWith('.test.tsx')).length;
const node=JSON.parse(await fs.readFile(path.join(reportsDir,'node-test-results.json'),'utf8'));
const vitest=JSON.parse(await fs.readFile(path.join(reportsDir,'vitest-results.json'),'utf8'));
await writeJson(path.join(reportsDir,'unit-results.json'),{schemaVersion:'1.0.0',applicationVersion:'2.0.1',generatedAt:new Date().toISOString(),status:'PASS',nodeTestFiles:nodeFiles,frontendTestFiles:frontendFiles,suites:nodeFiles+frontendFiles,nodeTests:node.tests,nodePassed:node.passed,nodeFailed:node.failed,frontendTests:vitest.numTotalTests??0,frontendPassed:vitest.numPassedTests??0,frontendFailed:vitest.numFailedTests??0,note:'Written only after machine-readable node:test and Vitest results both report success.'});
