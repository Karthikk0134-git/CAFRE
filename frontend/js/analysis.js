/**
 * analysis.js — CAFRE Fairness Metrics Controller
 * Implements the clean, accessible hierarchy:
 * 1. Executive Fairness Verdict & Human-Readable Story (with 3 Summary KPI cards)
 * 2. Simple, Human-Readable Visualizations (Group Outcome Rate comparison bars + 80% Parity Gauge)
 * 3. Expandable "View Detailed Metrics" (DI, DPD, EOD, EODD with exact numerical values and group breakdown)
 */

let currentResults = null;

document.addEventListener('DOMContentLoaded', async () => {
  const jobId = CAFRE_UI.getActiveJobId();
  let results = CAFRE_UI.getLastResults();

  if (jobId) {
    try {
      const liveResults = await CAFRE_API.getJobResults(jobId);
      if (liveResults && (liveResults.ref_metrics || liveResults.summary)) {
        results = liveResults;
        CAFRE_UI.setLastResults(results);
      }
    } catch (e) {
      console.warn("Could not refresh live results, using cached:", e);
    }
  }

  // Graceful fallback to benchmark data if memory is empty
  if (!results) {
    results = CAFRE_UI.getBenchmarkResults();
  }

  currentResults = results;
  renderFairnessPage(results);

  // Demo loader button
  const btnLoadDemo = document.getElementById('btn-load-demo');
  if (btnLoadDemo) {
    btnLoadDemo.addEventListener('click', () => {
      const bench = CAFRE_UI.getBenchmarkResults();
      CAFRE_UI.setLastResults(bench);
      currentResults = bench;
      renderFairnessPage(bench);
      const alertElem = document.getElementById('no-analysis-alert');
      if (alertElem) alertElem.classList.add('d-none');
    });
  }

  // Caret toggle for detailed metrics
  const detailedPanel = document.getElementById('detailed-metrics-panel');
  const caret = document.getElementById('detailed-caret');
  const btnToggle = document.getElementById('btn-toggle-detailed-metrics');
  const btnText = document.getElementById('detailed-metrics-btn-text');

  if (detailedPanel && caret && btnToggle) {
    detailedPanel.addEventListener('show.bs.collapse', () => {
      caret.className = 'bi bi-chevron-up chevron-icon ms-2';
      btnToggle.setAttribute('aria-expanded', 'true');
      if (btnText) btnText.textContent = 'Hide Detailed Metrics';
    });
    detailedPanel.addEventListener('hide.bs.collapse', () => {
      caret.className = 'bi bi-chevron-down chevron-icon ms-2';
      btnToggle.setAttribute('aria-expanded', 'false');
      if (btnText) btnText.textContent = 'View Detailed Metrics (DI, DPD, EOD, EODD)';
    });
  }

  // Search filter for detailed table
  const searchInput = document.getElementById('detailed-attr-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const term = (e.target.value || '').toLowerCase().trim();
      filterDetailedTable(term);
    });
  }
});

/**
 * Main render function for Fairness Metrics page
 */
function renderFairnessPage(data) {
  if (!data) return;

  // Active dataset name
  if (data.dataset_name) {
    const navDsName = document.getElementById('nav-dataset-name');
    if (navDsName) navDsName.textContent = data.dataset_name;
  }

  const refMetrics = data.ref_metrics || {};
  const keys = Object.keys(refMetrics);

  const badgeElem = document.getElementById('overall-fairness-badge');
  const explanationElem = document.getElementById('fairness-human-explanation');
  const kpisContainer = document.getElementById('fairness-summary-kpis');
  const visualContainer = document.getElementById('fairness-visual-container');
  const tableBody = document.getElementById('detailed-metrics-tbody');
  const breakdownBody = document.getElementById('group-breakdown-tbody');

  if (keys.length === 0) {
    if (badgeElem) badgeElem.innerHTML = '<span class="badge badge-cafre-low">No Attributes Audited</span>';
    if (explanationElem) explanationElem.textContent = 'No sensitive or protected attributes were registered for fairness evaluation in this dataset.';
    if (visualContainer) visualContainer.innerHTML = '<div class="text-muted small py-3">No demographic attributes to display.</div>';
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">No detailed metrics available.</td></tr>';
    return;
  }

  // 1. Analyze Disparities across attributes
  let maxSeverity = 'FAIR'; // 'FAIR', 'POTENTIAL', 'SIGNIFICANT'
  const significantAttrs = [];
  const potentialAttrs = [];
  const fairAttrs = [];

  keys.forEach(k => {
    const m = refMetrics[k];
    const di = (m.disparate_impact !== null && m.disparate_impact !== undefined) ? Number(m.disparate_impact) : 1.0;
    const dpd = (m.demographic_parity_difference !== null && m.demographic_parity_difference !== undefined) ? Number(m.demographic_parity_difference) : 0.0;
    const isBiased = m.is_biased || di < 0.8;
    const formattedName = formatAttributeName(k);

    if (di < 0.70 || (isBiased && dpd > 0.3)) {
      maxSeverity = 'SIGNIFICANT';
      significantAttrs.push(formattedName);
    } else if (di < 0.80 || isBiased) {
      if (maxSeverity !== 'SIGNIFICANT') maxSeverity = 'POTENTIAL';
      potentialAttrs.push(formattedName);
    } else {
      fairAttrs.push(formattedName);
    }
  });

  // 2. Render Overall Status Badge
  if (badgeElem) {
    if (maxSeverity === 'SIGNIFICANT') {
      badgeElem.innerHTML = '<span class="badge badge-cafre-high"><i class="bi bi-exclamation-octagon me-1"></i>Significant Disparity Detected</span>';
    } else if (maxSeverity === 'POTENTIAL') {
      badgeElem.innerHTML = '<span class="badge badge-cafre-med"><i class="bi bi-exclamation-triangle me-1"></i>Potential Bias Flagged</span>';
    } else {
      badgeElem.innerHTML = '<span class="badge badge-cafre-low"><i class="bi bi-shield-check me-1"></i>Fair &amp; Compliant</span>';
    }
  }

  // 3. Render Human-Readable Explanation
  if (explanationElem) {
    if (maxSeverity === 'SIGNIFICANT') {
      const affected = significantAttrs.concat(potentialAttrs);
      const attrText = formatAttributeList(affected);
      explanationElem.innerHTML = `The model shows a <strong>significant fairness disparity</strong> for <strong>${escapeHtml(attrText)}</strong>. Favorable selection rates between reference and comparison groups violate the legal four-fifths standard, warranting algorithmic bias mitigation.`;
    } else if (maxSeverity === 'POTENTIAL') {
      const attrText = formatAttributeList(potentialAttrs);
      explanationElem.innerHTML = `The model shows a <strong>potential fairness concern</strong> for <strong>${escapeHtml(attrText)}</strong>. Selection rates are near the legal boundary of the expected 80% fairness threshold.`;
    } else {
      explanationElem.innerHTML = `The model demonstrates <strong>fair and equitable behavior</strong> across all audited demographic groups. Outcome rates remain well within the 80% legal standard.`;
    }
  }

  // 4. Render 3 Summary KPI Cards
  if (kpisContainer) {
    kpisContainer.innerHTML = '';

    // KPI 1: Overall Compliance
    const kpi1 = document.createElement('div');
    kpi1.className = 'takeaway-card';
    const isGood = maxSeverity === 'FAIR';
    kpi1.innerHTML = `
      <div class="takeaway-icon ${isGood ? 'success' : (maxSeverity === 'SIGNIFICANT' ? 'warning' : 'info')}">
        <i class="bi ${isGood ? 'bi-shield-check' : 'bi-exclamation-triangle'}"></i>
      </div>
      <div>
        <div class="takeaway-label">Overall Parity Status</div>
        <div class="takeaway-title">${isGood ? 'Compliant' : (significantAttrs.length + potentialAttrs.length) + ' Flagged Group(s)'}</div>
        <p class="takeaway-desc">${isGood ? 'All demographic ratios meet legal benchmarks.' : 'Corrective pre/in-processing mitigation advised.'}</p>
      </div>
    `;
    kpisContainer.appendChild(kpi1);

    // KPI 2: Legal Benchmark
    const kpi2 = document.createElement('div');
    kpi2.className = 'takeaway-card';
    kpi2.innerHTML = `
      <div class="takeaway-icon info">
        <i class="bi bi-bank"></i>
      </div>
      <div>
        <div class="takeaway-label">Regulatory Benchmark</div>
        <div class="takeaway-title">EEOC 4/5ths (80%) Rule</div>
        <p class="takeaway-desc">Requires selection rate of protected groups to be at least 80% of reference rate.</p>
      </div>
    `;
    kpisContainer.appendChild(kpi2);

    // KPI 3: Audited Demographics
    const kpi3 = document.createElement('div');
    kpi3.className = 'takeaway-card';
    kpi3.innerHTML = `
      <div class="takeaway-icon primary">
        <i class="bi bi-people"></i>
      </div>
      <div>
        <div class="takeaway-label">Protected Demographics</div>
        <div class="takeaway-title">${keys.length} Attributes Audited</div>
        <p class="takeaway-desc">${keys.map(k => formatAttributeName(k)).join(', ')}</p>
      </div>
    `;
    kpisContainer.appendChild(kpi3);
  }

  // 5. Render Simple, Human-Readable Visualizations (Level 2)
  if (visualContainer) {
    visualContainer.innerHTML = '';

    keys.forEach(k => {
      const m = refMetrics[k];
      const di = (m.disparate_impact !== null && m.disparate_impact !== undefined) ? Number(m.disparate_impact) : 1.0;
      const dpd = (m.demographic_parity_difference !== null && m.demographic_parity_difference !== undefined) ? Number(m.demographic_parity_difference) : 0.0;
      const details = m.details || {};

      const privGroup = details.privileged_group || 'Reference Group';
      const unprivGroup = details.unprivileged_group || 'Comparison Group';
      const privRate = details.privileged_rate !== undefined ? Number((details.privileged_rate * 100).toFixed(1)) : 60.0;
      const unprivRate = details.unprivileged_rate !== undefined ? Number((details.unprivileged_rate * 100).toFixed(1)) : Number((privRate * di).toFixed(1));
      const rateGap = Math.abs(privRate - unprivRate).toFixed(1);

      const diPercent = Number((di * 100).toFixed(1));
      const diClamped = Math.min(100, Math.max(0, diPercent));

      // Status Pill & Bar Color
      let statusBadge = '';
      let isBiasedAttr = false;

      if (di < 0.70) {
        statusBadge = '<span class="badge badge-cafre-high"><i class="bi bi-x-circle me-1"></i>Significant Disparity</span>';
        isBiasedAttr = true;
      } else if (di < 0.80) {
        statusBadge = '<span class="badge badge-cafre-med"><i class="bi bi-exclamation-triangle me-1"></i>Potential Concern</span>';
        isBiasedAttr = true;
      } else {
        statusBadge = '<span class="badge badge-cafre-low"><i class="bi bi-check-circle me-1"></i>Fair &amp; Compliant</span>';
      }

      // Plain-English takeaway text
      let takeawaySentence = '';
      if (isBiasedAttr) {
        takeawaySentence = `Applicants in the <strong>${escapeHtml(unprivGroup)}</strong> group receive positive outcomes at only <strong>${diPercent}%</strong> the rate of the <strong>${escapeHtml(privGroup)}</strong> group (${unprivRate}% vs ${privRate}%). Because this is below the <strong>80.0% fairness benchmark</strong>, mitigation is recommended.`;
      } else {
        takeawaySentence = `Applicants in the <strong>${escapeHtml(unprivGroup)}</strong> group receive positive outcomes at <strong>${diPercent}%</strong> the rate of the <strong>${escapeHtml(privGroup)}</strong> group (${unprivRate}% vs ${privRate}%). This satisfies the <strong>80.0% legal fairness benchmark</strong>.`;
      }

      const card = document.createElement('div');
      card.className = 'comparison-card';
      card.innerHTML = `
        <!-- Card Header -->
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
          <div class="d-flex align-items-center gap-2">
            <span class="fw-bold text-white fs-5">${escapeHtml(formatAttributeName(k))}</span>
            <span class="badge bg-dark border border-secondary text-dim small">Demographic Feature</span>
          </div>
          ${statusBadge}
        </div>

        <!-- Visual 1: Group Outcome Rate Comparison (Side-by-Side Visual Bars) -->
        <div class="mb-3">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="text-white small fw-bold"><i class="bi bi-bar-chart-steps me-1 text-primary"></i>Selection Rate by Group</span>
            <span class="badge bg-dark border border-secondary text-warning font-monospace">${rateGap}% selection gap</span>
          </div>

          <div class="group-bar-container">
            <!-- Reference Group Bar -->
            <div class="group-bar-row">
              <span class="group-bar-name" title="${escapeHtml(privGroup)}">
                <i class="bi bi-circle-fill text-primary small me-1"></i>${escapeHtml(privGroup)} (Ref)
              </span>
              <div class="group-bar-track-outer">
                <div class="group-bar-fill-inner group-bar-fill-priv" style="width: ${Math.min(100, Math.max(5, privRate))}%;"></div>
              </div>
              <span class="group-bar-rate-num">${privRate}%</span>
            </div>

            <!-- Comparison Group Bar -->
            <div class="group-bar-row">
              <span class="group-bar-name" title="${escapeHtml(unprivGroup)}">
                <i class="bi bi-circle-fill ${isBiasedAttr ? 'text-danger' : 'text-success'} small me-1"></i>${escapeHtml(unprivGroup)}
              </span>
              <div class="group-bar-track-outer">
                <div class="group-bar-fill-inner ${isBiasedAttr ? 'group-bar-fill-biased' : 'group-bar-fill-unpriv'}" style="width: ${Math.min(100, Math.max(5, unprivRate))}%;"></div>
              </div>
              <span class="group-bar-rate-num">${unprivRate}%</span>
            </div>
          </div>
        </div>

        <!-- Visual 2: The 80% Fairness Benchmark Bar (Parity Ratio Gauge) -->
        <div class="parity-gauge-container mb-3">
          <div class="d-flex justify-content-between align-items-center text-muted small">
            <span class="fw-semibold text-white"><i class="bi bi-speedometer2 me-1 text-info"></i>Parity Ratio vs. 80% Standard</span>
            <span class="font-monospace fw-bold text-white">${diPercent}% of Reference Rate</span>
          </div>

          <!-- Gauge Bar with Zones & Marker -->
          <div class="parity-zones-bar">
            <!-- 80% Benchmark Line -->
            <div class="parity-threshold-rule-line" title="80% Legal Threshold"></div>
            <div class="parity-threshold-badge-label">80% Legal Standard</div>

            <!-- Current Parity Position Pin -->
            <div class="parity-marker-pin" style="left: ${Math.min(97, Math.max(3, diClamped))}%;">
              <span class="parity-marker-badge">${diPercent}%</span>
              <div class="parity-marker-pointer"></div>
            </div>
          </div>

          <!-- Zone Indicators -->
          <div class="parity-zone-labels mt-1">
            <span class="text-danger"><i class="bi bi-x-circle me-1"></i>Adverse Disparity (&lt; 70%)</span>
            <span class="text-warning"><i class="bi bi-exclamation-triangle me-1"></i>Caution (70–80%)</span>
            <span class="text-success"><i class="bi bi-check-circle me-1"></i>Fair Zone (&ge; 80%)</span>
          </div>
        </div>

        <!-- Plain-English Takeaway Narrative -->
        <p class="text-muted small mb-0 p-2 rounded bg-dark border border-secondary border-opacity-10">
          <i class="bi bi-info-circle text-primary me-1"></i>${takeawaySentence}
        </p>
      `;

      visualContainer.appendChild(card);
    });
  }

  // 6. Populate Detailed Metrics Table (Level 3: DI, DPD, EOD, EODD)
  if (tableBody) {
    tableBody.innerHTML = '';

    keys.forEach(k => {
      const m = refMetrics[k];
      const attrName = formatAttributeName(k);

      // Disparate Impact (DI)
      if (m.disparate_impact !== undefined && m.disparate_impact !== null) {
        const diVal = Number(m.disparate_impact).toFixed(3);
        const diStatus = m.disparate_impact < 0.70 ? '<span class="badge badge-cafre-high">Non-Compliant (&lt; 0.80)</span>' :
                         m.disparate_impact < 0.80 ? '<span class="badge badge-cafre-med">Caution (&lt; 0.80)</span>' :
                         '<span class="badge badge-cafre-low">Compliant (&ge; 0.80)</span>';
        appendMetricRow(tableBody, attrName, k, 'Disparate Impact (DI)', diVal, '&ge; 0.80 (80%)', diStatus, 'Rate<sub>unpriv</sub> / Rate<sub>priv</sub>');
      }

      // Demographic Parity Difference (DPD)
      if (m.demographic_parity_difference !== undefined && m.demographic_parity_difference !== null) {
        const dpdVal = Number(m.demographic_parity_difference).toFixed(3);
        const dpdStatus = m.demographic_parity_difference > 0.20 ? '<span class="badge badge-cafre-high">High Disparity (&gt; 0.20)</span>' :
                          m.demographic_parity_difference > 0.10 ? '<span class="badge badge-cafre-med">Moderate Gap (&gt; 0.10)</span>' :
                          '<span class="badge badge-cafre-low">Compliant (Near 0.00)</span>';
        appendMetricRow(tableBody, attrName, k, 'Demographic Parity Difference (DPD)', dpdVal, '&le; 0.10', dpdStatus, '|Rate<sub>priv</sub> - Rate<sub>unpriv</sub>|');
      }

      // Equal Opportunity Difference (EOD)
      if (m.equal_opportunity_difference !== undefined && m.equal_opportunity_difference !== null) {
        const eodVal = Number(m.equal_opportunity_difference).toFixed(3);
        const eodStatus = m.equal_opportunity_difference > 0.15 ? '<span class="badge badge-cafre-high">TPR Gap Elevated</span>' :
                          m.equal_opportunity_difference > 0.05 ? '<span class="badge badge-cafre-med">Minor TPR Gap</span>' :
                          '<span class="badge badge-cafre-low">Compliant (&le; 0.10)</span>';
        appendMetricRow(tableBody, attrName, k, 'Equal Opportunity Difference (EOD)', eodVal, '&le; 0.10', eodStatus, '|TPR<sub>priv</sub> - TPR<sub>unpriv</sub>|');
      }

      // Equalized Odds Difference (EODD)
      if (m.equalized_odds_difference !== undefined && m.equalized_odds_difference !== null) {
        const eoddVal = Number(m.equalized_odds_difference).toFixed(3);
        const eoddStatus = m.equalized_odds_difference > 0.15 ? '<span class="badge badge-cafre-high">Odds Disparity</span>' :
                           m.equalized_odds_difference > 0.05 ? '<span class="badge badge-cafre-med">Minor Gap</span>' :
                           '<span class="badge badge-cafre-low">Compliant (&le; 0.10)</span>';
        appendMetricRow(tableBody, attrName, k, 'Equalized Odds Difference (EODD)', eoddVal, '&le; 0.10', eoddStatus, 'max(|&Delta;TPR|, |&Delta;FPR|)');
      }
    });
  }

  // 7. Populate Group-Level Confusion Matrix & Selection Rates Breakdown
  if (breakdownBody) {
    breakdownBody.innerHTML = '';

    keys.forEach(k => {
      const m = refMetrics[k];
      const details = m.details || {};
      const privGroup = details.privileged_group || 'Reference Group';
      const unprivGroup = details.unprivileged_group || 'Comparison Group';
      const privRate = details.privileged_rate !== undefined ? (details.privileged_rate * 100).toFixed(1) + '%' : '—';
      const unprivRate = details.unprivileged_rate !== undefined ? (details.unprivileged_rate * 100).toFixed(1) + '%' : '—';
      const diRatio = m.disparate_impact !== undefined ? (m.disparate_impact * 100).toFixed(1) + '%' : '—';

      const privTPR = details.privileged_tpr !== undefined ? (details.privileged_tpr * 100).toFixed(1) + '%' : '100.0%';
      const unprivTPR = details.unprivileged_tpr !== undefined ? (details.unprivileged_tpr * 100).toFixed(1) + '%' : '100.0%';
      const tprGap = (details.privileged_tpr !== undefined && details.unprivileged_tpr !== undefined) 
        ? Math.abs((details.privileged_tpr - details.unprivileged_tpr) * 100).toFixed(1) + '%' 
        : '0.0%';

      const privFPR = details.privileged_fpr !== undefined ? (details.privileged_fpr * 100).toFixed(1) + '%' : '0.0%';
      const unprivFPR = details.unprivileged_fpr !== undefined ? (details.unprivileged_fpr * 100).toFixed(1) + '%' : '0.0%';
      const fprGap = (details.privileged_fpr !== undefined && details.unprivileged_fpr !== undefined) 
        ? Math.abs((details.privileged_fpr - details.unprivileged_fpr) * 100).toFixed(1) + '%' 
        : '0.0%';

      const tr = document.createElement('tr');
      tr.setAttribute('data-attribute-name', k.toLowerCase());
      tr.innerHTML = `
        <td class="fw-semibold text-white">${escapeHtml(formatAttributeName(k))}</td>
        <td><strong class="text-white">${escapeHtml(privGroup)}</strong> <span class="badge bg-dark border border-secondary text-info ms-1">${privRate}</span></td>
        <td><strong class="text-white">${escapeHtml(unprivGroup)}</strong> <span class="badge bg-dark border border-secondary text-warning ms-1">${unprivRate}</span></td>
        <td><span class="font-monospace fw-bold text-white">${diRatio}</span></td>
        <td><span class="font-monospace text-muted">${unprivTPR} vs ${privTPR}</span> <span class="badge bg-secondary-subtle text-secondary ms-1">${tprGap}</span></td>
        <td><span class="font-monospace text-muted">${unprivFPR} vs ${privFPR}</span> <span class="badge bg-secondary-subtle text-secondary ms-1">${fprGap}</span></td>
      `;
      breakdownBody.appendChild(tr);
    });
  }
}

function appendMetricRow(tbody, attrFormatted, rawAttr, metricName, value, threshold, statusHtml, formulaHtml) {
  const tr = document.createElement('tr');
  tr.setAttribute('data-attribute-name', rawAttr.toLowerCase());
  tr.innerHTML = `
    <td class="fw-semibold text-white">
      ${escapeHtml(attrFormatted)}
      <div class="text-dim small font-monospace">${escapeHtml(rawAttr)}</div>
    </td>
    <td>
      <strong class="text-white">${escapeHtml(metricName)}</strong>
      <div class="text-dim small font-monospace">${formulaHtml}</div>
    </td>
    <td><span class="font-monospace fw-bold text-white fs-6">${escapeHtml(value)}</span></td>
    <td><span class="font-monospace text-muted">${threshold}</span></td>
    <td>${statusHtml}</td>
  `;
  tbody.appendChild(tr);
}

function filterDetailedTable(term) {
  const rows = document.querySelectorAll('#detailed-metrics-tbody tr');
  rows.forEach(tr => {
    const attrName = tr.getAttribute('data-attribute-name') || '';
    if (!term || attrName.includes(term)) {
      tr.style.display = '';
    } else {
      tr.style.display = 'none';
    }
  });

  const bRows = document.querySelectorAll('#group-breakdown-tbody tr');
  bRows.forEach(tr => {
    const attrName = tr.getAttribute('data-attribute-name') || '';
    if (!term || attrName.includes(term)) {
      tr.style.display = '';
    } else {
      tr.style.display = 'none';
    }
  });
}

function formatAttributeList(attrs) {
  if (!attrs || attrs.length === 0) return 'protected attributes';
  const clean = [...new Set(attrs)];
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
}

function formatAttributeName(rawName) {
  if (!rawName) return '';
  return String(rawName)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
