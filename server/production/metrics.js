import fs from 'node:fs';
import { queueStats, freshestWorkerHeartbeat } from '../jobs.js';

const counters = new Map();
const histograms = new Map();
const gauges = new Map();

const labelsKey = (labels = {}) => Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${String(value)}`).join(',');
const metricKey = (name, labels) => `${name}|${labelsKey(labels)}`;
const safeLabels = (labels = {}) => Object.fromEntries(Object.entries(labels).filter(([key]) => !/calculation|filename|job_id|request_id|correlation/i.test(key)));

export function increment(name, labels = {}, value = 1) {
  const normalized = safeLabels(labels);
  const key = metricKey(name, normalized);
  counters.set(key, { name, labels: normalized, value: (counters.get(key)?.value ?? 0) + value });
}

export function setCounter(name, labels = {}, value = 0) {
  const normalized = safeLabels(labels);
  counters.set(metricKey(name, normalized), { name, labels: normalized, value: Number(value) });
}

export function observe(name, labels = {}, value) {
  const normalized = safeLabels(labels);
  const key = metricKey(name, normalized);
  const entry = histograms.get(key) ?? { name, labels: normalized, values: [] };
  entry.values.push(Number(value));
  if (entry.values.length > 10_000) entry.values.splice(0, entry.values.length - 10_000);
  histograms.set(key, entry);
}

export function setGauge(name, labels = {}, value) {
  const normalized = safeLabels(labels);
  gauges.set(metricKey(name, normalized), { name, labels: normalized, value: Number(value) });
}

function formatLabels(labels) {
  const entries = Object.entries(labels);
  return entries.length ? `{${entries.map(([key, value]) => `${key}="${String(value).replace(/[\\"\n]/g, '_')}"`).join(',')}}` : '';
}

function filesystemSize(file) {
  try { return fs.statSync(file).size; } catch { return 0; }
}

export function renderPrometheus(config) {
  const queue = queueStats();
  setGauge('cad_jobs_queued', {}, queue.queued ?? 0);
  setGauge('cad_jobs_processing', {}, queue.processing ?? 0);
  setCounter('cad_jobs_completed_total', {}, queue.completed ?? 0);
  setCounter('cad_jobs_failed_total', {}, queue.failed ?? 0);
  setCounter('cad_jobs_timed_out_total', {}, queue.timed_out ?? 0);
  for (const name of ['cad_upload_bytes','cad_cleanup_deleted_total','cad_cleanup_failure_total','cad_backup_success_total','cad_backup_failure_total','http_rate_limit_rejections_total']) if (![...counters.values()].some((entry) => entry.name === name)) setCounter(name, {}, 0);
  for (const name of ['http_request_duration_seconds','cad_job_duration_seconds','cad_step_import_duration_seconds','cad_contact_duration_seconds','cad_feature_duration_seconds','cad_viewer_duration_seconds','cad_report_duration_seconds','cad_queue_wait_duration_seconds']) if (![...histograms.values()].some((entry) => entry.name === name)) histograms.set(metricKey(name, {}), { name, labels: {}, values: [] });
  const worker = freshestWorkerHeartbeat();
  setGauge('cad_worker_heartbeat_age_seconds', {}, worker ? Math.max(0, (Date.now() - Date.parse(worker.heartbeatAt)) / 1000) : -1);
  setGauge('cad_database_size_bytes', {}, filesystemSize(config.databasePath));
  setGauge('process_resident_memory_bytes', {}, process.memoryUsage().rss);
  setGauge('process_heap_bytes', {}, process.memoryUsage().heapUsed);
  setGauge('process_cpu_seconds_total', {}, (process.cpuUsage().user + process.cpuUsage().system) / 1_000_000);
  const lines = [
    '# HELP profigym_info Static build information.',
    '# TYPE profigym_info gauge',
    `profigym_info{version="${config.applicationVersion}",service="app"} 1`,
  ];
  for (const { name, labels, value } of counters.values()) lines.push(`# TYPE ${name} counter`, `${name}${formatLabels(labels)} ${value}`);
  for (const { name, labels, value } of gauges.values()) lines.push(`# TYPE ${name} gauge`, `${name}${formatLabels(labels)} ${value}`);
  for (const { name, labels, values } of histograms.values()) {
    const count = values.length;
    const sum = values.reduce((total, item) => total + item, 0);
    const buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300];
    lines.push(`# TYPE ${name} histogram`);
    for (const bucket of buckets) lines.push(`${name}_bucket${formatLabels({ ...labels, le: bucket })} ${values.filter((item) => item <= bucket).length}`);
    lines.push(`${name}_bucket${formatLabels({ ...labels, le: '+Inf' })} ${count}`, `${name}_count${formatLabels(labels)} ${count}`, `${name}_sum${formatLabels(labels)} ${sum}`);
  }
  return `${[...new Set(lines)].join('\n')}\n`;
}

export function resetMetrics() { counters.clear(); histograms.clear(); gauges.clear(); }
