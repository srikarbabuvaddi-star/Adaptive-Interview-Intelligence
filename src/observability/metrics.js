class MetricsCollector {
  constructor() {
    this.counters = {
      httpRequestsTotal: 0,
      httpErrorsTotal: 0,
      interviewsStarted: 0,
      interviewsCompleted: 0,
      geminiCallsTotal: 0,
      geminiErrorsTotal: 0,
      estimatedTokensTotal: 0,
      a2aTasksTotal: 0,
      a2aTasksCompleted: 0,
      a2aTasksFailed: 0,
      mcpToolCallsTotal: 0,
      ragRetrievalsTotal: 0,
      speechTranscriptionsTotal: 0
    };

    this.latencies = {
      geminiCallMs: [],
      a2aTaskMs: [],
      mcpToolMs: [],
      ragRetrievalMs: [],
      speechTranscriptionMs: []
    };

    this.maxSamples = 100;
  }

  increment(metricName, amount = 1) {
    if (this.counters[metricName] !== undefined) {
      this.counters[metricName] += amount;
    }
  }

  recordLatency(metricName, durationMs) {
    if (this.latencies[metricName] !== undefined && typeof durationMs === 'number') {
      this.latencies[metricName].push(Math.round(durationMs));
      if (this.latencies[metricName].length > this.maxSamples) {
        this.latencies[metricName].shift();
      }
    }
  }

  _calculateStats(samples = []) {
    if (samples.length === 0) return { p50: 0, p95: 0, p99: 0, avg: 0 };
    const sorted = [...samples].sort((a, b) => a - b);
    const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
    const p50 = sorted[Math.floor(sorted.length * 0.50)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || sorted[sorted.length - 1];
    return { p50, p95, p99, avg, sampleCount: samples.length };
  }

  getSnapshot() {
    const memory = process.memoryUsage();
    // Gemini 2.5 Flash pricing approximate: $0.075 per 1M input tokens, $0.30 per 1M output tokens (~$0.00015 per 1k tokens)
    const estimatedCostUsd = Math.round((this.counters.estimatedTokensTotal / 1000) * 0.00015 * 10000) / 10000;

    return {
      service: 'Adaptive Interview Intelligence',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      counters: { ...this.counters },
      costEstimate: {
        totalTokens: this.counters.estimatedTokensTotal,
        estimatedCostUsd
      },
      latencyStats: {
        gemini: this._calculateStats(this.latencies.geminiCallMs),
        a2a: this._calculateStats(this.latencies.a2aTaskMs),
        mcp: this._calculateStats(this.latencies.mcpToolMs),
        rag: this._calculateStats(this.latencies.ragRetrievalMs),
        speech: this._calculateStats(this.latencies.speechTranscriptionMs)
      },
      system: {
        rssMb: Math.round(memory.rss / (1024 * 1024)),
        heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
        heapTotalMb: Math.round(memory.heapTotal / (1024 * 1024))
      }
    };
  }

  reset() {
    Object.keys(this.counters).forEach(k => { this.counters[k] = 0; });
    Object.keys(this.latencies).forEach(k => { this.latencies[k] = []; });
  }
}

module.exports = new MetricsCollector();
