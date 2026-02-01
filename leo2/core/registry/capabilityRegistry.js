// leo2/core/registry/capabilityRegistry.js
const fs = require('fs').promises;
const path = require('path');
const operationLogger = require('../logging/operationLogger');
const capabilityRegistryPath = path.join(process.cwd(), 'data', 'capabilities_manifest.json');
const usageLogPath = path.join(process.cwd(), 'data', 'capability_usage.json');
const graphPath = path.join(process.cwd(), 'data', 'capability_graph.json');

class CapabilityRegistry {
  constructor() {
    this.capabilities = new Map();
    this.usageLog = [];
    this.graph = {};
    this.config = {
      manifestPath: capabilityRegistryPath,
      usageLogPath,
      graphPath,
      enableIntrospection: true,
      trackUsage: true,
      enableAutoDiscovery: true,
      enablePreconditionChecks: true,
      useLLM: false // Toggle for LLM integration
    };
    this.initialized = false;
    this._init();
    operationLogger.logOperation('capability_registry_loaded', { config: this.config });
  }

  async _init() {
    // Load persisted data if available
    try {
      const [manifest, usage, graph] = await Promise.all([
        fs.readFile(this.config.manifestPath, 'utf8').catch(() => '{}'),
        fs.readFile(this.config.usageLogPath, 'utf8').catch(() => '[]'),
        fs.readFile(this.config.graphPath, 'utf8').catch(() => '{}'),
      ]);
      Object.entries(JSON.parse(manifest)).forEach(([k, v]) => this.capabilities.set(k, v));
      this.usageLog = JSON.parse(usage);
      this.graph = JSON.parse(graph);
      this.initialized = true;
    } catch (e) {
      operationLogger.logOperation('capability_registry_init_error', { error: e.message });
    }
  }

  async registerCapability(name, details = {}) {
    const capability = { ...details, registeredAt: new Date().toISOString() };
    this.capabilities.set(name, capability);
    await this._persistManifest();
    operationLogger.logOperation('capability_registered', { name, details });
  }

  listCapabilities() {
    return Array.from(this.capabilities.keys());
  }

  getCapability(name) {
    return this.capabilities.get(name);
  }

  async trackUsage(name, context = {}) {
    if (!this.config.trackUsage) return;
    const usage = { name, context, timestamp: new Date().toISOString() };
    this.usageLog.push(usage);
    await this._persistUsage();
    operationLogger.logOperation('capability_usage', usage);
  }

  async _persistManifest() {
    await fs.mkdir(path.dirname(this.config.manifestPath), { recursive: true });
    await fs.writeFile(this.config.manifestPath, JSON.stringify(Object.fromEntries(this.capabilities), null, 2), 'utf8');
  }

  async _persistUsage() {
    await fs.mkdir(path.dirname(this.config.usageLogPath), { recursive: true });
    await fs.writeFile(this.config.usageLogPath, JSON.stringify(this.usageLog, null, 2), 'utf8');
  }

  async _persistGraph() {
    await fs.mkdir(path.dirname(this.config.graphPath), { recursive: true });
    await fs.writeFile(this.config.graphPath, JSON.stringify(this.graph, null, 2), 'utf8');
  }

  // Introspection
  introspect() {
    if (!this.config.enableIntrospection) return null;
    return {
      capabilities: this.listCapabilities(),
      usage: this.usageLog,
      graph: this.graph
    };
  }

  // Graph integration
  addToGraph(from, to) {
    if (!this.graph[from]) this.graph[from] = [];
    if (!this.graph[from].includes(to)) this.graph[from].push(to);
    this._persistGraph();
    operationLogger.logOperation('capability_graph_edge', { from, to });
  }

  // Auto-discovery (stub)
  async autoDiscoverCapabilities() {
    if (!this.config.enableAutoDiscovery) return [];
    // Implement file system scan or module registry scan here
    // For now, stub
    operationLogger.logOperation('capability_autodiscovery', {});
    return [];
  }

  // Precondition checks (stub)
  checkPreconditions(name, context = {}) {
    if (!this.config.enablePreconditionChecks) return true;
    // Implement specific preconditions per capability
    return true;
  }

  // LLM integration (stub)
  async resolveIntentWithLLM(intent) {
    if (!this.config.useLLM) throw new Error('LLM integration not enabled');
    // Call LLM here and map intent to capability
    operationLogger.logOperation('capability_llm_resolve', { intent });
    return null;
  }
}

module.exports = CapabilityRegistry;
