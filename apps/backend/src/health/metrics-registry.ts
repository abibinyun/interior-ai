/**
 * Minimal Prometheus-compatible metrics registry.
 *
 * Supports Counter, Gauge, Histogram with a text exposition format
 * compatible with `prometheus.io`'s scrape format.
 *
 * Not designed for multi-process aggregation — sufficient for a single
 * Node.js instance scraping at `/api/metrics`.
 */

type LabelMap = Record<string, string>;

interface CounterSeries { value: number; labels: LabelMap }
interface GaugeSeries { value: number; labels: LabelMap }
interface HistogramSeries {
  buckets: number[];
  counts: number[];
  sum: number;
  count: number;
  labels: LabelMap;
}

const BUCKET_BOUNDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

function labelsKey(labels: LabelMap): string {
  return Object.keys(labels).sort().map((k) => `${k}="${labels[k]}"`).join(',');
}

function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function formatLabels(labels: LabelMap): string {
  const keys = Object.keys(labels);
  if (keys.length === 0) return '';
  return `{${keys.map((k) => `${k}="${escapeLabelValue(labels[k] ?? '')}"`).join(',')}}`;
}

class Counter {
  private readonly series: Map<string, CounterSeries> = new Map();
  constructor(private readonly name: string, private readonly help: string) {}

  inc(labels: LabelMap = {}, value = 1): void {
    const key = labelsKey(labels);
    const existing = this.series.get(key);
    if (existing) {
      existing.value += value;
    } else {
      this.series.set(key, { value, labels });
    }
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const s of this.series.values()) {
      lines.push(`${this.name}${formatLabels(s.labels)} ${s.value}`);
    }
    return lines.join('\n');
  }
}

class Gauge {
  private readonly series: Map<string, GaugeSeries> = new Map();
  constructor(private readonly name: string, private readonly help: string) {}

  set(labels: LabelMap, value: number): void;
  set(value: number): void;
  set(arg1: LabelMap | number, arg2?: number): void {
    const labels = typeof arg1 === 'object' ? arg1 : {};
    const value = typeof arg1 === 'number' ? arg1 : (arg2 ?? 0);
    const key = labelsKey(labels);
    this.series.set(key, { value, labels });
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    for (const s of this.series.values()) {
      lines.push(`${this.name}${formatLabels(s.labels)} ${s.value}`);
    }
    return lines.join('\n');
  }
}

class Histogram {
  private readonly series: Map<string, HistogramSeries> = new Map();
  constructor(private readonly name: string, private readonly help: string) {}

  observe(labels: LabelMap, value: number): void {
    const key = labelsKey(labels);
    let s = this.series.get(key);
    if (!s) {
      s = { buckets: [...BUCKET_BOUNDS], counts: new Array(BUCKET_BOUNDS.length + 1).fill(0), sum: 0, count: 0, labels };
      this.series.set(key, s);
    }
    s.sum += value;
    s.count += 1;
    for (let i = 0; i < BUCKET_BOUNDS.length; i += 1) {
      if (value <= BUCKET_BOUNDS[i]!) s.counts[i]! += 1;
    }
    s.counts[BUCKET_BOUNDS.length]! += 1;
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const s of this.series.values()) {
      let cumulative = 0;
      for (let i = 0; i < BUCKET_BOUNDS.length; i += 1) {
        cumulative += s.counts[i]!;
        const le = BUCKET_BOUNDS[i]!;
        const bucketLabels: LabelMap = { ...s.labels, le: String(le) };
        lines.push(`${this.name}_bucket${formatLabels(bucketLabels)} ${cumulative}`);
      }
      lines.push(`${this.name}_bucket${formatLabels({ ...s.labels, le: '+Inf' })} ${s.count}`);
      lines.push(`${this.name}_sum${formatLabels(s.labels)} ${s.sum}`);
      lines.push(`${this.name}_count${formatLabels(s.labels)} ${s.count}`);
    }
    return lines.join('\n');
  }
}

class Registry {
  readonly httpRequestsTotal = new Counter('http_requests_total', 'Total HTTP requests');
  readonly httpRequestErrors = new Counter('http_request_errors_total', 'HTTP requests with status >= 500');
  readonly httpRequestDuration = new Histogram('http_request_duration_seconds', 'HTTP request duration');
  readonly processStartTime = new Gauge('process_start_time_seconds', 'Unix epoch of process start');
  readonly nodejsHeapBytes = new Gauge('nodejs_heap_bytes_total', 'Node.js heap size in bytes');
  readonly aiProviderErrors = new Counter('ai_provider_errors_total', 'AI provider errors by code');

  constructor() {
    this.processStartTime.set(Math.floor(Date.now() / 1000));
    setInterval(() => {
      const mem = process.memoryUsage();
      this.nodejsHeapBytes.set(mem.heapTotal);
    }, 15_000).unref();
  }

  render(): string {
    return [
      this.httpRequestsTotal.render(),
      this.httpRequestErrors.render(),
      this.httpRequestDuration.render(),
      this.processStartTime.render(),
      this.nodejsHeapBytes.render(),
      this.aiProviderErrors.render(),
    ].join('\n');
  }
}

let _registry: Registry | null = null;

export function getMetrics(): Registry {
  if (!_registry) _registry = new Registry();
  return _registry;
}

export type { Counter, Gauge, Histogram, Registry };
