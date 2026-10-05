/**
 * api.js — CAFRE API Client
 * Centralized fetch module for communicating with the FastAPI backend.
 */

const API_BASE = (window.location.protocol.startsWith('http') && window.location.port === '8000') 
  ? window.location.origin 
  : 'http://127.0.0.1:8000';

const CAFRE_API = {
  /**
   * Health check endpoint
   */
  async checkHealth() {
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn("Backend not reachable or offline:", e);
      return { status: "offline", error: e.message };
    }
  },

  /**
   * List benchmark sample datasets
   */
  async getSampleDatasets() {
    const res = await fetch(`${API_BASE}/api/datasets`);
    if (!res.ok) throw new Error(`Failed to load datasets: ${res.statusText}`);
    return await res.json();
  },

  /**
   * Upload user dataset (multipart/form-data)
   */
  async uploadDataset(file) {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_BASE}/api/upload`, {
      method: "POST",
      body: formData
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Upload failed");
    }
    return await res.json();
  },

  /**
   * Fetch tabular preview and statistics for a dataset
   */
  async getDatasetPreview(source, datasetId) {
    const url = new URL(`${API_BASE}/api/dataset/preview`);
    url.searchParams.append("source", source);
    url.searchParams.append("dataset_id", datasetId);

    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Failed to load preview");
    }
    return await res.json();
  },

  /**
   * Start CAFRE pipeline execution
   */
  async runPipeline({ datasetSource, datasetId, targetColumn, domainOverride }) {
    const res = await fetch(`${API_BASE}/api/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset_source: datasetSource,
        dataset_id: datasetId,
        target_column: targetColumn || null,
        domain_override: domainOverride || null
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Failed to launch pipeline");
    }
    return await res.json();
  },

  /**
   * Get real-time status of a pipeline job
   */
  async getJobStatus(jobId) {
    const res = await fetch(`${API_BASE}/api/pipeline/status/${jobId}`);
    if (!res.ok) throw new Error(`Failed to get status for job ${jobId}`);
    return await res.json();
  },

  /**
   * Get full results of a completed pipeline job
   */
  async getJobResults(jobId) {
    const res = await fetch(`${API_BASE}/api/pipeline/results/${jobId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Failed to fetch results");
    }
    return await res.json();
  },

  /**
   * Get download URL for generated report
   */
  getReportDownloadUrl(jobId, format = "markdown") {
    return `${API_BASE}/api/reports/${jobId}/download?format=${format}`;
  }
};

window.CAFRE_API = CAFRE_API;
