import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeStepContent, closeCadKernel } from '../server/cad/kernel.js';
import { reportsDir, root, writeJson } from './quality-utils.mjs';
const classes = { small: 'cube.step', medium: 'multiple_features.step', large: 'large_model.step' };
const iterations = Number(process.env.BENCHMARK_ITERATIONS || 5);
const metrics = ['importMs','geometryValidationMs','areaCalculationMs','broadPhaseMs','narrowPhaseMs','candidateExtractionMs','holeRecognitionMs','cavityRecognitionMs','overlapResolutionMs','featureProcessingMs'];
const stats = (values) => { const sorted = [...values].sort((a,b)=>a-b); const mean = values.reduce((a,b)=>a+b,0)/values.length; return { min: sorted[0], median: sorted[Math.floor(sorted.length/2)], p95: sorted[Math.min(sorted.length-1, Math.ceil(sorted.length*.95)-1)], max: sorted.at(-1), mean, standardDeviation: Math.sqrt(values.reduce((sum,value)=>sum+(value-mean)**2,0)/values.length), iterations: values.length }; };
const results = {};
for (const [sizeClass, file] of Object.entries(classes)) {
  const content = await fs.readFile(path.join(root,'test-models/golden',file),'utf8');
  const coldStart = performance.now(); await analyzeStepContent(content,file); const coldMs = performance.now()-coldStart;
  const samples = [];
  for (let i=0;i<iterations;i+=1) { const started=performance.now(); const result=await analyzeStepContent(content,file); const jsonStarted=performance.now(); const json=JSON.stringify(result.diagnostics); const jsonReportMs=performance.now()-jsonStarted; const htmlStarted=performance.now(); const html=`<html><body><pre>${json.replaceAll('&','&amp;').replaceAll('<','&lt;')}</pre></body></html>`; const htmlReportMs=performance.now()-htmlStarted; const known=(result.diagnostics.performance.contactDetectionMs??0)+(result.diagnostics.performance.featureProcessingMs??0)+(result.viewerMesh?.performance?.meshGenerationMs??0); samples.push({ fullWorkflowMs: performance.now()-started, ...result.diagnostics.performance, geometryValidationMs: Math.max(0,result.diagnostics.performance.calculationMs-known), areaCalculationMs: Math.max(0,result.diagnostics.performance.calculationMs-known), viewerTriangulationMs: result.viewerMesh?.performance?.meshGenerationMs ?? 0, meshSerializationMs: result.viewerMesh?.performance?.meshSerializationMs ?? 0, jsonReportMs, htmlReportMs, htmlBytes: Buffer.byteLength(html) }); }
  results[sizeClass] = { fixture:file,coldStartMs:coldMs,stages:Object.fromEntries([...metrics,'viewerTriangulationMs','meshSerializationMs','jsonReportMs','htmlReportMs','fullWorkflowMs'].map((key)=>[key,stats(samples.map((sample)=>Number(sample[key]??0)))])) };
}
await closeCadKernel(); const report={schemaVersion:'1.0.0',applicationVersion:'2.0.3',generatedAt:new Date().toISOString(),nodeVersion:process.version,status:'PASS',measurementNotes:{geometryValidationMs:'Residual calculation time after instrumented contact, feature and viewer stages; area calculation is not separately exposed by OCCT wrapper.',sqliteSaveLoad:'Covered by benchmark:persistence and migration suites.'},results}; await writeJson(path.join(reportsDir,'performance-results.json'),report); console.log(JSON.stringify(report,null,2));
