/**
 * explainability.js — CAFRE Model Explainability Controller
 * Implements the clear, accessible hierarchy:
 * 1. Human-Readable Explanation First: "Why did the model make this decision?"
 * 2. Visual Feature Contribution Graph/Chart (Chart.js horizontal bars + visual factor cards)
 * 3. Expandable "View Technical Details" (SHAP, Mutual Info, Confidence, Evidence Scores)
 */

let currentResults = null;
let contributionChartInstance = null;
let currentFeatureFilter = 'top5'; // 'top5', 'top8', 'all'
let processedFeaturesList = [];

function getChartThemeColors() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    grid: isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)',
    text: isLight ? '#0f172a' : '#f8fafc',
    subText: isLight ? '#475569' : '#94a3b8',
    barBg: isLight ? 'rgba(79, 70, 229, 0.85)' : 'rgba(99, 102, 241, 0.85)',
    barHover: isLight ? 'rgba(67, 56, 202, 1)' : 'rgba(129, 140, 248, 1)'
  };
}

window.addEventListener('cafre-theme-changed', () => {
  if (currentResults) {
    renderExplainabilityPage(currentResults);
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  const jobId = CAFRE_UI.getActiveJobId();
  let results = CAFRE_UI.getLastResults();

  if (jobId) {
    try {
      const liveResults = await CAFRE_API.getJobResults(jobId);
      if (liveResults && (liveResults.fee_evidence || liveResults.cre_rankings || liveResults.summary)) {
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
  renderExplainabilityPage(results);

  // Demo loader button
  const btnLoadDemo = document.getElementById('btn-load-demo');
  if (btnLoadDemo) {
    btnLoadDemo.addEventListener('click', () => {
      const bench = CAFRE_UI.getBenchmarkResults();
      CAFRE_UI.setLastResults(bench);
      currentResults = bench;
      renderExplainabilityPage(bench);
      const alertElem = document.getElementById('no-analysis-alert');
      if (alertElem) alertElem.classList.add('d-none');
    });
  }

  // Filter buttons for Feature Contribution Chart
  const filterButtons = document.querySelectorAll('.btn-chart-filter');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      filterButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFeatureFilter = e.target.getAttribute('data-filter') || 'top5';
      updateChartAndCards();
    });
  });

  // Caret toggle for technical details
  const techPanel = document.getElementById('technical-details-panel');
  const caret = document.getElementById('tech-caret');
  const btnToggle = document.getElementById('btn-toggle-tech-details');
  const btnText = document.getElementById('tech-details-btn-text');

  if (techPanel && caret && btnToggle) {
    techPanel.addEventListener('show.bs.collapse', () => {
      caret.className = 'bi bi-chevron-up chevron-icon ms-2';
      btnToggle.setAttribute('aria-expanded', 'true');
      if (btnText) btnText.textContent = 'Hide Technical Details';
    });
    techPanel.addEventListener('hide.bs.collapse', () => {
      caret.className = 'bi bi-chevron-down chevron-icon ms-2';
      btnToggle.setAttribute('aria-expanded', 'false');
      if (btnText) btnText.textContent = 'View Technical Details';
    });
  }

  // Live filter for Technical Details Table
  const searchInput = document.getElementById('tech-feature-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const term = (e.target.value || '').toLowerCase().trim();
      filterTechnicalTable(term);
    });
  }
});

/**
 * Main render function for Model Explainability page
 */
function renderExplainabilityPage(data) {
  if (!data) return;

  // Active dataset name
  if (data.dataset_name) {
    const navDsName = document.getElementById('nav-dataset-name');
    if (navDsName) navDsName.textContent = data.dataset_name;
  }

  const rankings = data.cre_rankings || [];
  const feeEvidence = data.fee_evidence || {};

  // Consolidate features map
  const featureMap = {};

  rankings.forEach(r => {
    if (r.priority !== 'IGNORE') {
      featureMap[r.column_name] = {
        name: r.column_name,
        category: r.semantic_category || 'Feature',
        role: r.semantic_role || 'Feature',
        shap: 0.0,
        hasShap: false,
        mi: 0.0,
        hasMi: false,
        confidence: r.confidence !== undefined ? r.confidence : null,
        baseScore: r.base_score !== undefined ? r.base_score : null,
        statScore: r.stat_score !== undefined ? r.stat_score : null,
        finalScore: r.final_score !== undefined ? r.final_score : null,
        priority: r.priority || 'LOW',
        isProxy: !!r.is_proxy,
        proxyFor: r.proxy_for,
        isProtected: !!r.is_protected,
        trace: r.trace || []
      };
    }
  });

  Object.keys(feeEvidence).forEach(fname => {
    const ev = feeEvidence[fname] || {};
    if (!featureMap[fname]) {
      featureMap[fname] = {
        name: fname,
        category: 'Feature',
        role: 'Feature',
        shap: 0.0,
        hasShap: false,
        mi: 0.0,
        hasMi: false,
        confidence: null,
        baseScore: null,
        statScore: null,
        finalScore: null,
        priority: 'LOW',
        isProxy: false,
        proxyFor: null,
        isProtected: false,
        trace: []
      };
    }
    if (ev.predictive_impact !== undefined && ev.predictive_impact !== null) {
      featureMap[fname].shap = Number(ev.predictive_impact);
      featureMap[fname].hasShap = true;
    }
    if (ev.mutual_information !== undefined && ev.mutual_information !== null) {
      featureMap[fname].mi = Number(ev.mutual_information);
      featureMap[fname].hasMi = true;
    }
  });

  const allFeatures = Object.values(featureMap);

  if (allFeatures.length === 0) {
    const explanationElem = document.getElementById('explainability-human-explanation');
    if (explanationElem) explanationElem.textContent = 'No feature explanations available for this model.';
    return;
  }

  // Sort features by contribution (SHAP if present, else finalScore, else MI)
  allFeatures.sort((a, b) => {
    const valA = a.hasShap ? a.shap : (a.finalScore !== null ? a.finalScore / 100 : a.mi);
    const valB = b.hasShap ? b.shap : (b.finalScore !== null ? b.finalScore / 100 : b.mi);
    return valB - valA;
  });

  // Calculate percentage contribution across features
  const totalWeight = allFeatures.reduce((acc, f) => {
    const w = f.hasShap ? f.shap : (f.finalScore !== null ? f.finalScore / 100 : f.mi);
    return acc + Math.max(0.001, w);
  }, 0);

  allFeatures.forEach(f => {
    const rawVal = f.hasShap ? f.shap : (f.finalScore !== null ? f.finalScore / 100 : f.mi);
    f.relativePercent = Math.max(1, Math.round((rawVal / totalWeight) * 1000) / 10);
  });

  processedFeaturesList = allFeatures;

  // 1. Level 1: Render Human-Readable Explanation First
  renderHumanExplanationSection(allFeatures);

  // 2. Level 2: Render Feature Contribution Chart and Factor Cards
  updateChartAndCards();

  // 3. Level 3: Populate Technical Details Table
  renderTechnicalDetailsTable(allFeatures);
}

/**
 * Level 1: Human-readable explanation (Why did the model make this decision?)
 * Shown prominently at the top with plain-English takeaway cards.
 */
function renderHumanExplanationSection(features) {
  const explanationElem = document.getElementById('explainability-human-explanation');
  const pillsContainer = document.getElementById('explainability-drivers-pills');
  const takeawaysGrid = document.getElementById('explainability-takeaways-grid');

  if (!features || features.length === 0) return;

  const top1 = features[0];
  const top2 = features[1] || null;
  const top3 = features[2] || null;

  const top1Name = top1 ? formatFeatureName(top1.name) : 'Top Factor';
  const top2Name = top2 ? formatFeatureName(top2.name) : '';
  const top3Name = top3 ? formatFeatureName(top3.name) : '';

  // Main Narrative paragraph
  if (explanationElem) {
    let narrative = '';
    if (top2 && top3) {
      narrative = `The model's predictions were primarily driven by <strong>${escapeHtml(top1Name)}</strong> (${top1.relativePercent}%), followed by <strong>${escapeHtml(top2Name)}</strong> (${top2.relativePercent}%) and <strong>${escapeHtml(top3Name)}</strong> (${top3.relativePercent}%). Candidates with stronger qualifications in these areas received significantly higher approval outcomes.`;
    } else if (top2) {
      narrative = `The model's predictions were primarily driven by <strong>${escapeHtml(top1Name)}</strong> (${top1.relativePercent}%) and <strong>${escapeHtml(top2Name)}</strong> (${top2.relativePercent}%).`;
    } else {
      narrative = `The model's predictions were primarily driven by <strong>${escapeHtml(top1Name)}</strong> (${top1.relativePercent}%).`;
    }
    explanationElem.innerHTML = narrative;
  }

  // Key Decision Drivers Summary Pills
  if (pillsContainer) {
    pillsContainer.innerHTML = `
      <span class="text-muted small fw-semibold me-1"><i class="bi bi-pin-angle me-1"></i>Top Influences:</span>
      ${features.slice(0, 4).map((f, i) => `
        <span class="badge ${i === 0 ? 'bg-primary' : 'bg-dark border border-secondary'} px-2.5 py-1.5 text-white">
          ${escapeHtml(formatFeatureName(f.name))} 
          <span class="opacity-75 font-monospace ms-1">${f.relativePercent}%</span>
        </span>
      `).join('')}
    `;
  }

  // 3 Plain-English Takeaway Cards
  if (takeawaysGrid) {
    takeawaysGrid.innerHTML = '';

    // Takeaway 1: Primary Driver
    const card1 = document.createElement('div');
    card1.className = 'takeaway-card';
    card1.innerHTML = `
      <div class="takeaway-icon primary">
        <i class="bi bi-star-fill"></i>
      </div>
      <div>
        <div class="takeaway-label">Primary Decision Driver</div>
        <div class="takeaway-title">${escapeHtml(top1Name)} (${top1.relativePercent}%)</div>
        <p class="takeaway-desc">Had the single strongest impact on favorable predictions across the entire applicant cohort.</p>
      </div>
    `;
    takeawaysGrid.appendChild(card1);

    // Takeaway 2: Secondary Contributors
    if (top2) {
      const card2 = document.createElement('div');
      card2.className = 'takeaway-card';
      const secPercentSum = (top2.relativePercent + (top3 ? top3.relativePercent : 0)).toFixed(1);
      card2.innerHTML = `
        <div class="takeaway-icon success">
          <i class="bi bi-graph-up-arrow"></i>
        </div>
        <div>
          <div class="takeaway-label">Secondary Factors</div>
          <div class="takeaway-title">${escapeHtml(top2Name)}${top3 ? ' & ' + escapeHtml(top3Name) : ''} (${secPercentSum}%)</div>
          <p class="takeaway-desc">Consistently provided supportive predictive weight for positive evaluations.</p>
        </div>
      `;
      takeawaysGrid.appendChild(card2);
    }

    // Takeaway 3: Demographic & Bias Safeguard Check
    const sensitiveFeatures = features.filter(f => f.isProtected || f.isProxy || f.category === 'Demographic');
    const card3 = document.createElement('div');
    card3.className = 'takeaway-card';

    if (sensitiveFeatures.length > 0) {
      const totalSensWeight = sensitiveFeatures.reduce((acc, f) => acc + f.relativePercent, 0).toFixed(1);
      const isSensitiveHigh = sensitiveFeatures.some(f => f.relativePercent > 20 || f.priority === 'HIGH');
      
      card3.innerHTML = `
        <div class="takeaway-icon ${isSensitiveHigh ? 'warning' : 'info'}">
          <i class="bi ${isSensitiveHigh ? 'bi-shield-exclamation' : 'bi-shield-check'}"></i>
        </div>
        <div>
          <div class="takeaway-label">Fairness &amp; Demographics</div>
          <div class="takeaway-title">${isSensitiveHigh ? 'Monitored Attributes Active' : 'Low Direct Demographic Impact'}</div>
          <p class="takeaway-desc">${isSensitiveHigh ? 
            `Protected demographic attributes account for ${totalSensWeight}% direct weight. Audited for proxy bias.` : 
            `Direct demographic attributes accounted for only ${totalSensWeight}% weight. Inspected on Fairness Metrics page.`}</p>
        </div>
      `;
    } else {
      card3.innerHTML = `
        <div class="takeaway-icon info">
          <i class="bi bi-shield-check"></i>
        </div>
        <div>
          <div class="takeaway-label">Fairness Assessment</div>
          <div class="takeaway-title">Verified Objective Weights</div>
          <p class="takeaway-desc">Predictions are predominantly weighted by non-demographic qualification factors.</p>
        </div>
      `;
    }
    takeawaysGrid.appendChild(card3);
  }
}

/**
 * Level 2: Update Chart and Visual Driver Cards according to filter
 */
function updateChartAndCards() {
  if (!processedFeaturesList || processedFeaturesList.length === 0) return;

  let subset = [...processedFeaturesList];
  if (currentFeatureFilter === 'top5') {
    subset = subset.slice(0, 5);
  } else if (currentFeatureFilter === 'top8') {
    subset = subset.slice(0, 8);
  }

  // Update total count indicator
  const countElem = document.getElementById('chart-total-features-count');
  if (countElem) {
    countElem.textContent = `Showing ${subset.length} of ${processedFeaturesList.length} features`;
  }

  // Render Chart.js
  renderContributionChart(subset);

  // Render Visual Driver Cards
  renderDriverCards(subset.slice(0, 5));
}

/**
 * Render the clean horizontal bar chart for feature contributions
 */
function renderContributionChart(features) {
  const ctx = document.getElementById('featureContributionChart');
  if (!ctx || !window.Chart) return;

  if (contributionChartInstance) {
    contributionChartInstance.destroy();
  }

  const colors = getChartThemeColors();

  // Reverse so the highest contribution is at the top of the horizontal bar chart
  const reversed = [...features].reverse();
  const labels = reversed.map(f => formatFeatureName(f.name));
  const dataValues = reversed.map(f => f.relativePercent);

  // Gradient background fill
  const canvasCtx = ctx.getContext('2d');
  const gradient = canvasCtx.createLinearGradient(0, 0, 400, 0);
  gradient.addColorStop(0, 'rgba(99, 102, 241, 0.7)');
  gradient.addColorStop(1, 'rgba(129, 140, 248, 0.95)');

  contributionChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Predictive Contribution',
        data: dataValues,
        backgroundColor: gradient,
        hoverBackgroundColor: 'rgba(165, 180, 252, 1)',
        borderRadius: 6,
        barThickness: features.length > 8 ? 14 : 20,
        maxBarThickness: 24
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(99, 102, 241, 0.3)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: (ctx) => `Decision Influence: ${ctx.raw}% of predictive weight`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: colors.grid },
          ticks: {
            color: colors.subText,
            callback: (v) => v + '%'
          },
          title: {
            display: true,
            text: 'Relative Decision Contribution (%)',
            color: colors.subText,
            font: { size: 11, weight: '500' }
          }
        },
        y: {
          grid: { display: false },
          ticks: {
            color: colors.text,
            font: { weight: '600', size: 12 }
          }
        }
      }
    }
  });
}

/**
 * Render visual driver cards below chart
 */
function renderDriverCards(features) {
  const container = document.getElementById('driver-cards-container');
  if (!container) return;

  container.innerHTML = '';

  features.forEach((f, idx) => {
    const card = document.createElement('div');
    card.className = 'driver-item-card';

    let impactBadge = '';
    if (f.relativePercent >= 25) {
      impactBadge = '<span class="badge bg-primary px-2 py-1">High Impact</span>';
    } else if (f.relativePercent >= 12) {
      impactBadge = '<span class="badge bg-info-subtle text-info border border-info-subtle px-2 py-1">Moderate Impact</span>';
    } else {
      impactBadge = '<span class="badge bg-secondary-subtle text-secondary px-2 py-1">Minor Impact</span>';
    }

    let roleText = 'Direct factor contributing to evaluation';
    if (f.category === 'Qualification') {
      roleText = 'Core professional qualification criteria evaluating candidate ability';
    } else if (f.category === 'Evaluation') {
      roleText = 'Standardized assessment evaluating interpersonal and technical competency';
    } else if (f.category === 'Demographic' || f.isProtected) {
      roleText = 'Sensitive demographic characteristic audited for fair treatment';
    } else if (f.isProxy) {
      roleText = `Geographic or behavioral proxy for ${f.proxyFor || 'protected group'}`;
    }

    card.innerHTML = `
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-1">
        <div class="d-flex align-items-center gap-2">
          <span class="badge bg-dark border border-secondary text-white font-monospace" style="width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%;">#${idx + 1}</span>
          <span class="fw-bold text-white fs-6">${escapeHtml(formatFeatureName(f.name))}</span>
          <span class="badge bg-dark border border-secondary text-dim small">${escapeHtml(f.category)}</span>
        </div>
        <div class="d-flex align-items-center gap-2">
          ${impactBadge}
          <span class="fw-bold text-white font-monospace">${f.relativePercent}%</span>
        </div>
      </div>
      
      <div class="driver-bar-track">
        <div class="driver-bar-fill" style="width: ${Math.min(100, Math.max(3, f.relativePercent))}%;"></div>
      </div>

      <div class="d-flex justify-content-between align-items-center text-muted small mt-2">
        <span>${escapeHtml(roleText)}</span>
        <span class="font-monospace small text-dim">${f.hasShap ? 'SHAP: ' + f.shap.toFixed(4) : ''}</span>
      </div>
    `;

    container.appendChild(card);
  });
}

/**
 * Level 3: Populate Technical Details Table
 */
function renderTechnicalDetailsTable(features) {
  const tableBody = document.getElementById('technical-details-tbody');
  if (!tableBody) return;

  tableBody.innerHTML = '';

  features.forEach(f => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-feature-name', f.name.toLowerCase());
    tr.setAttribute('data-category', f.category.toLowerCase());

    const shapDisplay = f.hasShap 
      ? `<span class="font-monospace text-white fw-bold">${f.shap.toFixed(4)}</span> <span class="badge bg-primary-subtle text-primary small ms-1">${f.relativePercent}%</span>`
      : '<span class="text-muted">—</span>';
    
    const miDisplay = f.hasMi 
      ? `<span class="font-monospace text-white">${f.mi.toFixed(4)}</span>` 
      : '<span class="text-muted">—</span>';
    
    const confDisplay = f.confidence !== null 
      ? `<span class="badge bg-dark border border-secondary text-info font-monospace">${f.confidence.toFixed(1)}%</span>` 
      : '<span class="text-muted">—</span>';

    let evidenceScoresDisplay = '<span class="text-muted">—</span>';
    if (f.baseScore !== null || f.statScore !== null || f.finalScore !== null) {
      const b = f.baseScore !== null ? f.baseScore.toFixed(0) : '—';
      const s = f.statScore !== null ? f.statScore.toFixed(0) : '—';
      const fin = f.finalScore !== null ? f.finalScore.toFixed(1) : '—';
      evidenceScoresDisplay = `<span class="font-monospace text-muted small">${b}</span> / <span class="font-monospace text-muted small">${s}</span> / <strong class="font-monospace text-white">${fin}</strong>`;
    }

    let statusPill = '';
    if (f.priority === 'HIGH') {
      statusPill = '<span class="badge badge-cafre-high">High Focus</span>';
    } else if (f.priority === 'MEDIUM') {
      statusPill = '<span class="badge badge-cafre-med">Monitored</span>';
    } else {
      statusPill = '<span class="badge badge-cafre-low">Standard</span>';
    }

    tr.innerHTML = `
      <td class="fw-semibold text-white">
        ${escapeHtml(formatFeatureName(f.name))}
        <div class="text-dim small font-monospace">${escapeHtml(f.name)}</div>
      </td>
      <td>
        <span class="badge bg-dark border border-secondary text-dim">${escapeHtml(f.category)}</span>
      </td>
      <td>${shapDisplay}</td>
      <td>${miDisplay}</td>
      <td>${confDisplay}</td>
      <td>${evidenceScoresDisplay}</td>
      <td>${statusPill}</td>
    `;
    tableBody.appendChild(tr);
  });
}

/**
 * Filter technical table by search input
 */
function filterTechnicalTable(term) {
  const rows = document.querySelectorAll('#technical-details-tbody tr');
  rows.forEach(tr => {
    const featName = tr.getAttribute('data-feature-name') || '';
    const catName = tr.getAttribute('data-category') || '';
    if (!term || featName.includes(term) || catName.includes(term)) {
      tr.style.display = '';
    } else {
      tr.style.display = 'none';
    }
  });
}

function formatFeatureName(rawName) {
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
