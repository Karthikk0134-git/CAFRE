/**
 * report.js — CAFRE Audit Report & Bias Mitigation Controller
 */

let currentResults = null;

document.addEventListener('DOMContentLoaded', async () => {
  const btnMd = document.getElementById('btn-download-md');
  const btnPrint = document.getElementById('btn-print');

  const results = CAFRE_UI.getLastResults();
  if (!results) {
    document.getElementById('no-report-alert').classList.remove('d-none');
    if (btnMd) {
      btnMd.disabled = true;
      btnMd.style.opacity = '0.5';
      btnMd.style.cursor = 'not-allowed';
    }
    if (btnPrint) {
      btnPrint.disabled = true;
      btnPrint.style.opacity = '0.5';
      btnPrint.style.cursor = 'not-allowed';
      btnPrint.removeAttribute('onclick');
    }
    return;
  }

  // Analysis successfully completed - enable MD and PDF buttons
  if (btnMd) {
    btnMd.disabled = false;
    btnMd.removeAttribute('disabled');
    btnMd.style.opacity = '1';
    btnMd.style.cursor = 'pointer';
  }
  if (btnPrint) {
    btnPrint.disabled = false;
    btnPrint.removeAttribute('disabled');
    btnPrint.style.opacity = '1';
    btnPrint.style.cursor = 'pointer';
    btnPrint.onclick = () => window.print();
  }

  currentResults = results;
  renderReport(results);
  setupDownloadHandlers();
});

function renderReport(data) {
  const summary = data.summary || {};
  const highRiskCount = summary.high_bias_count || 0;
  const biasedRefCount = summary.biased_features_count || 0;
  const isBiasedOverall = highRiskCount > 0 || biasedRefCount > 0;

  // 1. Executive Verdict Banner
  const title = document.getElementById('verdict-title');
  const badge = document.getElementById('verdict-badge');
  const desc = document.getElementById('verdict-desc');
  const iconCont = document.getElementById('verdict-icon-container');

  if (isBiasedOverall) {
    title.textContent = 'Critical Bias Risks Flagged';
    badge.className = 'badge badge-cafre-high';
    badge.textContent = 'NON-COMPLIANT / HIGH RISK';
    desc.textContent = `Audit detected significant outcome disparity in ${biasedRefCount} protected group(s) and flagged ${highRiskCount} high-risk features. Immediate mitigation recommended before deployment.`;
    iconCont.className = 'p-3 rounded-circle bg-danger-subtle text-danger fs-2 flex-shrink-0';
    iconCont.innerHTML = '<i class="bi bi-shield-x"></i>';
  } else {
    title.textContent = 'Statistically Fair & Compliant';
    badge.className = 'badge badge-cafre-low';
    badge.textContent = 'COMPLIANT / FAIR';
    desc.textContent = 'Disparate impact ratios satisfy the standard 80% rule across protected classes, with high confidence observed between semantic ontology expectations and empirical data.';
    iconCont.className = 'p-3 rounded-circle bg-success-subtle text-success fs-2 flex-shrink-0';
    iconCont.innerHTML = '<i class="bi bi-shield-check"></i>';
  }

  document.getElementById('verdict-dataset').textContent = data.dataset_name || 'dataset.csv';
  document.getElementById('verdict-domain').textContent = data.context ? data.context.domain : 'Unknown';
  document.getElementById('verdict-target').textContent = data.dataset_info ? data.dataset_info.target_column : 'Outcome';
  document.getElementById('verdict-time').textContent = `${data.summary ? data.summary.execution_time_seconds : 0}s`;

  document.getElementById('summary-feat-count').textContent = summary.total_features || 0;
  document.getElementById('summary-high-count').textContent = highRiskCount;
  document.getElementById('summary-ref-count').textContent = biasedRefCount;

  const totalRecs = (data.mitigations || []).reduce((acc, f) => acc + (f.recs ? f.recs.length : 0), 0);
  document.getElementById('summary-mit-count').textContent = `${totalRecs} Generated`;

  // Print Header Status
  const printStatus = document.getElementById('print-verdict-status');
  if (printStatus) {
    printStatus.textContent = isBiasedOverall ? 'NON-COMPLIANT / HIGH RISK' : 'COMPLIANT / FAIR';
  }
  const printTime = document.getElementById('print-timestamp');
  if (printTime) {
    printTime.textContent = new Date().toLocaleString();
  }

  // 2. Bias Mitigation Cards
  renderMitigations(data.mitigations || []);

  // 3. Markdown Report
  const reports = data.reports || {};
  const mdPre = document.getElementById('md-report-pre');
  const mdRendered = document.getElementById('md-report-rendered');
  const markdownText = reports.markdown_content || "# CAFRE Report\nNo markdown content available.";

  if (mdPre) {
    mdPre.textContent = markdownText;
  }

  if (mdRendered) {
    if (window.marked && typeof window.marked.parse === 'function') {
      mdRendered.innerHTML = window.marked.parse(markdownText);
    } else {
      mdRendered.innerHTML = `<pre style="white-space: pre-wrap; font-family: var(--font-mono); color: #f8fafc; background: transparent; padding: 0;">${escapeHtml(markdownText)}</pre>`;
    }
  }
}

/**
 * Render Bias Mitigation Recommendations
 */
function renderMitigations(mitigations) {
  const container = document.getElementById('mitigation-cards-container');
  if (mitigations.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4 text-muted">
        <i class="bi bi-check-circle text-success fs-3 mb-2 d-block"></i>
        No high or medium risk bias patterns detected requiring corrective mitigation.
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  mitigations.forEach((featRec, featIdx) => {
    const featureCard = document.createElement('div');
    featureCard.className = 'p-3 rounded bg-dark border border-secondary border-opacity-25 mb-4';

    let recsHtml = '';
    (featRec.recs || []).forEach((r, rIdx) => {
      const snippetId = `code_${featIdx}_${rIdx}`;
      const typeBadge = r.type === 'Preprocessing' ? 'bg-primary-subtle text-primary border-primary-subtle' :
                        r.type === 'In-processing' ? 'bg-warning-subtle text-warning border-warning-subtle' :
                        'bg-info-subtle text-info border-info-subtle';

      recsHtml += `
        <div class="mb-3 p-3 rounded bg-surface border border-secondary border-opacity-10">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
            <div class="d-flex align-items-center gap-2">
              <span class="badge border ${typeBadge}">${escapeHtml(r.type)}</span>
              <h6 class="fw-bold text-white mb-0">${escapeHtml(r.strategy_name)}</h6>
            </div>
            <span class="badge ${r.priority === 'HIGH' ? 'badge-cafre-high' : 'badge-cafre-med'}">${r.priority} PRIORITY</span>
          </div>

          <p class="text-muted small mb-3">${escapeHtml(r.suitability_rationale)}</p>

          <div class="code-box">
            <button class="btn-copy-code" onclick="copySnippet('${snippetId}')">
              <i class="bi bi-clipboard me-1"></i>Copy Python Code
            </button>
            <pre id="${snippetId}"><code>${escapeHtml(r.implementation_snippet)}</code></pre>
          </div>
        </div>
      `;
    });

    featureCard.innerHTML = `
      <div class="d-flex align-items-center justify-content-between mb-3 border-bottom border-secondary border-opacity-25 pb-2">
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-cpu text-info"></i>
          <h5 class="fw-bold text-white mb-0">Feature: <span class="text-primary">${escapeHtml(featRec.feature)}</span></h5>
        </div>
        <span class="badge ${featRec.priority_level === 'HIGH' ? 'badge-cafre-high' : 'badge-cafre-med'}">
          ${featRec.priority_level} RISK
        </span>
      </div>
      <div>${recsHtml}</div>
    `;

    container.appendChild(featureCard);
  });
}

/**
 * Setup Download Handlers
 */
function setupDownloadHandlers() {
  const btnMd = document.getElementById('btn-download-md');
  if (btnMd) {
    btnMd.addEventListener('click', () => {
      if (!currentResults) return;
      const jobId = currentResults.job_id || CAFRE_UI.getActiveJobId();
      if (jobId) {
        window.location.href = CAFRE_API.getReportDownloadUrl(jobId, 'markdown');
      } else {
        // Fallback blob download
        const md = (currentResults.reports && currentResults.reports.markdown_content) || '';
        downloadBlob(md, 'cafre_fairness_report.md', 'text/markdown');
      }
    });
  }
}

function downloadBlob(content, filename, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function copySnippet(elementId) {
  const elem = document.getElementById(elementId);
  if (!elem) return;
  const text = elem.textContent;
  navigator.clipboard.writeText(text).then(() => {
    CAFRE_UI.showToast('Copied', 'Python snippet copied to clipboard.', 'success');
  });
}

function copyReportText(elementId) {
  const elem = document.getElementById(elementId);
  if (!elem) return;
  const text = elem.textContent;
  navigator.clipboard.writeText(text).then(() => {
    CAFRE_UI.showToast('Copied', 'Report content copied to clipboard.', 'success');
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.copySnippet = copySnippet;
window.copyReportText = copyReportText;
