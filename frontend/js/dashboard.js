/**
 * dashboard.js — Ingestion, Dataset Preview, and Pipeline Execution Controller
 */

let selectedDataset = {
  source: null,     // 'upload' or 'sample'
  id: null,         // file_id or filename
  filename: null,
  rows: 0,
  columns: [],
  columnDetails: []
};

let pollInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  await initHealthCheck();
  await loadSampleDatasets();
  setupDropzone();
  setupEventListeners();

  // Check if there was an active dataset previously selected
  const cachedDataset = CAFRE_UI.getActiveDataset();
  if (cachedDataset && cachedDataset.id) {
    loadPreview(cachedDataset.source || 'sample', cachedDataset.id);
  }
});

/**
 * Health check & backend connectivity status
 */
async function initHealthCheck() {
  const pill = document.getElementById('backend-status-pill');
  if (!pill) return;
  try {
    await CAFRE_API.checkHealth();
  } catch (err) {
    console.warn("Backend health check failed:", err);
  }
}

/**
 * Load benchmark sample datasets list
 */
async function loadSampleDatasets() {
  const grid = document.getElementById('sample-datasets-grid');
  try {
    const data = await CAFRE_API.getSampleDatasets();
    const datasets = data.datasets || [];

    if (datasets.length === 0) {
      grid.innerHTML = '<div class="col-12 text-muted">No sample datasets found in data/ directory.</div>';
      return;
    }

    grid.innerHTML = '';
    datasets.forEach(ds => {
      const cardCol = document.createElement('div');
      cardCol.className = 'col-md-6 col-lg-3';
      cardCol.innerHTML = `
        <div class="card-cafre p-3 h-100 d-flex flex-column justify-content-between" style="cursor: pointer;" onclick="loadPreview('sample', '${ds.id}')">
          <div>
            <div class="d-flex align-items-center justify-content-between mb-2">
              <i class="bi bi-filetype-csv text-primary fs-3"></i>
              <span class="badge bg-dark border border-secondary text-muted small">${ds.size_formatted}</span>
            </div>
            <h6 class="fw-bold text-white mb-1 text-truncate" title="${ds.name}">${ds.name}</h6>
            <div class="text-muted small mb-2">${CAFRE_UI.formatNumber(ds.rows)} rows &bull; ${ds.columns_count} columns</div>
          </div>
          <button class="btn btn-cafre-outline btn-sm w-100 mt-2">
            <i class="bi bi-eye me-1"></i>Select &amp; Preview
          </button>
        </div>
      `;
      grid.appendChild(cardCol);
    });
  } catch (err) {
    grid.innerHTML = `<div class="col-12 text-danger small">Failed to load datasets: ${err.message}</div>`;
  }
}

/**
 * Setup drag-and-drop file upload
 */
function setupDropzone() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');

  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFileUpload(files[0]);
  });

  dropzone.addEventListener('click', (e) => {
    if (!e.target.closest('button')) {
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) handleFileUpload(fileInput.files[0]);
  });
}

/**
 * Handle dataset upload (CSV and Excel)
 */
async function handleFileUpload(file) {
  const lowerName = (file.name || '').toLowerCase();
  const validExtensions = ['.csv', '.xlsx', '.xls'];
  if (!validExtensions.some(ext => lowerName.endsWith(ext))) {
    CAFRE_UI.showToast('Invalid File', 'Please upload a valid dataset file (.csv, .xlsx, .xls).', 'warning');
    return;
  }

  // Update file details bar
  const detailsBar = document.getElementById('file-details-bar');
  const filenameElem = document.getElementById('upload-filename');
  const filesizeElem = document.getElementById('upload-filesize');
  const statusBadge = document.getElementById('upload-status-badge');

  detailsBar.classList.remove('d-none');
  filenameElem.textContent = file.name;
  filesizeElem.textContent = CAFRE_UI.formatBytes(file.size);
  statusBadge.className = 'badge bg-warning-subtle text-warning px-2';
  statusBadge.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Uploading...';

  try {
    const res = await CAFRE_API.uploadDataset(file);
    statusBadge.className = 'badge bg-success-subtle text-success px-2';
    statusBadge.innerHTML = '<i class="bi bi-check2 me-1"></i>Uploaded &amp; Parsed';

    selectedDataset = {
      source: 'upload',
      id: res.file_id,
      filename: res.filename,
      rows: res.rows,
      columns: res.columns,
      columnDetails: res.column_details
    };
    CAFRE_UI.setActiveDataset(selectedDataset);
    renderDatasetSummary(res);
    renderTablePreview(res.columns, res.preview, res.column_details);

    CAFRE_UI.showToast('Upload Successful', `Loaded ${res.rows} rows and ${res.columns_count} columns.`, 'success');
  } catch (err) {
    statusBadge.className = 'badge bg-danger-subtle text-danger px-2';
    statusBadge.innerHTML = '<i class="bi bi-x-circle me-1"></i>Upload Failed';
    CAFRE_UI.showToast('Upload Error', err.message, 'danger');
  }
}

/**
 * Load preview for a dataset (sample or uploaded)
 */
async function loadPreview(source, datasetId) {
  try {
    CAFRE_UI.showToast('Loading Dataset', `Parsing ${datasetId}...`, 'info');
    const res = await CAFRE_API.getDatasetPreview(source, datasetId);

    selectedDataset = {
      source: source,
      id: datasetId,
      filename: res.filename,
      rows: res.rows,
      columns: res.columns,
      columnDetails: res.column_details
    };
    CAFRE_UI.setActiveDataset(selectedDataset);

    // If sample tab, switch visual focus
    renderDatasetSummary(res);
    renderTablePreview(res.columns, res.preview, res.column_details);

    CAFRE_UI.showToast('Dataset Loaded', `Inspecting ${res.filename} (${res.rows} rows).`, 'success');

    // Scroll to preview smoothly
    document.getElementById('dataset-preview-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    CAFRE_UI.showToast('Preview Error', err.message, 'danger');
  }
}

/**
 * Render dataset summary stats
 */
function renderDatasetSummary(data) {
  document.getElementById('dataset-summary-row').classList.remove('d-none');
  const actualRows = typeof data.rows === 'number' ? data.rows : parseInt(data.rows, 10) || 0;
  document.getElementById('stat-rows').textContent = CAFRE_UI.formatNumber(actualRows);
  document.getElementById('stat-cols').textContent = data.columns_count || (data.columns ? data.columns.length : 0);
  document.getElementById('stat-size').textContent = data.size_formatted || '0 KB';

  // Calculate overall missingness
  let totalCells = actualRows * (data.columns_count || (data.columns ? data.columns.length : 1));
  let totalMissing = 0;
  if (data.column_details) {
    totalMissing = data.column_details.reduce((acc, col) => acc + (col.missing_count || 0), 0);
  }
  let missingPct = totalCells > 0 ? ((totalMissing / totalCells) * 100).toFixed(1) : 0;
  document.getElementById('stat-missing').textContent = `${missingPct}%`;
}

/**
 * Render tabular preview
 */
function renderTablePreview(columns, previewRows, columnDetails) {
  const card = document.getElementById('dataset-preview-card');
  const setupCard = document.getElementById('analysis-setup-card');
  const headerTr = document.getElementById('preview-table-headers');
  const tbody = document.getElementById('preview-table-body');
  const colCountBadge = document.getElementById('preview-col-count');

  card.classList.remove('d-none');
  setupCard.classList.remove('d-none');
  colCountBadge.textContent = `${columns.length} columns`;

  // Build headers without data type information
  headerTr.innerHTML = '';
  columns.forEach(col => {
    const th = document.createElement('th');
    th.innerHTML = `<div>${escapeHtml(col)}</div>`;
    headerTr.appendChild(th);
  });

  // Build rows
  tbody.innerHTML = '';
  if (!previewRows || previewRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${columns.length}" class="text-center py-3 text-muted">No preview rows available.</td></tr>`;
    return;
  }

  previewRows.forEach(row => {
    const tr = document.createElement('tr');
    columns.forEach(col => {
      const td = document.createElement('td');
      const val = row[col];
      if (val === null || val === undefined) {
        td.innerHTML = '<span class="text-muted fst-italic">null</span>';
      } else {
        td.textContent = String(val);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}



/**
 * Setup event listeners
 */
function setupEventListeners() {
  const quickSampleBtn = document.getElementById('btn-quick-sample');
  if (quickSampleBtn) {
    quickSampleBtn.addEventListener('click', () => {
      loadPreview('sample', 'biased_dataset_test.csv');
    });
  }

  const startBtn = document.getElementById('btn-start-pipeline');
  if (startBtn) {
    startBtn.addEventListener('click', triggerPipelineExecution);
  }
}

/**
 * Execute CAFRE pipeline
 */
async function triggerPipelineExecution() {
  if (!selectedDataset.id) {
    CAFRE_UI.showToast('No Dataset Selected', 'Please upload or select a dataset first.', 'warning');
    return;
  }

  // Open execution modal
  const modalElem = document.getElementById('pipelineProgressModal');
  const modal = new bootstrap.Modal(modalElem);
  modal.show();

  const modalStepName = document.getElementById('modal-step-name');
  const modalPercent = document.getElementById('modal-progress-percent');
  const modalBar = document.getElementById('modal-progress-bar');
  const modalCounter = document.getElementById('modal-step-counter');
  const modalDesc = document.getElementById('modal-substep-desc');
  const modalLogs = document.getElementById('modal-terminal-logs');
  const btnViewResults = document.getElementById('btn-view-results');

  modalLogs.innerHTML = '<div class="terminal-line text-muted">[System] Dispatching request to CAFRE orchestrator...</div>';
  btnViewResults.classList.add('d-none');
  modalBar.style.width = '5%';
  modalPercent.textContent = '5%';

  try {
    const launchRes = await CAFRE_API.runPipeline({
      datasetSource: selectedDataset.source,
      datasetId: selectedDataset.id,
      targetColumn: null,
      domainOverride: null
    });

    const jobId = launchRes.job_id;
    CAFRE_UI.setActiveJobId(jobId);
    modalLogs.innerHTML += '<div class="terminal-line text-success">[System] Pipeline launched successfully</div>';

    // Start polling loop
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      try {
        const status = await CAFRE_API.getJobStatus(jobId);
        
        modalBar.style.width = `${status.percent}%`;
        modalPercent.textContent = `${status.percent}%`;
        modalStepName.textContent = status.current_step_name || 'Processing...';
        modalCounter.textContent = `Step ${status.current_step}/${status.total_steps}`;

        // Append logs
        if (status.logs && status.logs.length > 0) {
          modalLogs.innerHTML = status.logs.map(l => `<div class="terminal-line">${escapeHtml(l)}</div>`).join('');
          modalLogs.scrollTop = modalLogs.scrollHeight;
        }

        if (status.status === 'completed') {
          clearInterval(pollInterval);
          modalBar.style.width = '100%';
          modalPercent.textContent = '100%';
          modalDesc.className = 'text-success small fw-bold';
          modalDesc.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i>All 11 CAFRE Pipeline stages completed successfully!';
          btnViewResults.classList.remove('d-none');

          // Fetch full results and cache
          const results = await CAFRE_API.getJobResults(jobId);
          CAFRE_UI.setLastResults(results);

          CAFRE_UI.showToast('Audit Complete', 'Reasoning results ready for inspection.', 'success');

          // Auto-redirect after brief pause
          setTimeout(() => {
            window.location.href = 'analysis.html';
          }, 1500);
        } else if (status.status === 'failed') {
          clearInterval(pollInterval);
          modalDesc.className = 'text-danger small fw-bold';
          modalDesc.textContent = `Execution failed: ${status.error || 'Unknown error'}`;
          CAFRE_UI.showToast('Execution Error', status.error, 'danger');
        }
      } catch (pollErr) {
        console.warn('Poll error:', pollErr);
      }
    }, 700);

  } catch (err) {
    modalDesc.className = 'text-danger small fw-bold';
    modalDesc.textContent = `Launch error: ${err.message}`;
    CAFRE_UI.showToast('Pipeline Launch Failed', err.message, 'danger');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.loadPreview = loadPreview;
