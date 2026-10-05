/**
 * app.js — CAFRE UI Engine
 * Shared utilities, session persistence, toast notifications, badge renderers,
 * and live multi-theme management (Light, Midnight, OLED, Classic Dark).
 */

const CAFRE_UI = {
  /**
   * Session & settings storage keys
   */
  KEYS: {
    ACTIVE_JOB_ID: 'cafre_active_job_id',
    ACTIVE_DATASET: 'cafre_active_dataset',
    LAST_RESULTS: 'cafre_last_results',
    THEME: 'cafre_theme'
  },

  /**
   * Supported Theme Metadata
   */
  THEMES: {
    light: { name: 'Light Research', icon: 'bi-sun-fill text-warning' },
    midnight: { name: 'Deep Midnight', icon: 'bi-stars text-primary' },
    oled: { name: 'OLED Black', icon: 'bi-circle-fill text-light' },
    dark: { name: 'Classic Dark', icon: 'bi-moon-stars-fill text-info' }
  },

  setActiveJobId(jobId) {
    if (jobId) localStorage.setItem(this.KEYS.ACTIVE_JOB_ID, jobId);
    else localStorage.removeItem(this.KEYS.ACTIVE_JOB_ID);
  },

  getActiveJobId() {
    return localStorage.getItem(this.KEYS.ACTIVE_JOB_ID);
  },

  setActiveDataset(datasetObj) {
    if (datasetObj) localStorage.setItem(this.KEYS.ACTIVE_DATASET, JSON.stringify(datasetObj));
    else localStorage.removeItem(this.KEYS.ACTIVE_DATASET);
  },

  getActiveDataset() {
    try {
      const data = localStorage.getItem(this.KEYS.ACTIVE_DATASET);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  setLastResults(resultsObj) {
    if (resultsObj) {
      try {
        localStorage.setItem(this.KEYS.LAST_RESULTS, JSON.stringify(resultsObj));
      } catch (e) {
        console.warn("Storage quota exceeded or error storing results:", e);
      }
    } else {
      localStorage.removeItem(this.KEYS.LAST_RESULTS);
    }
  },

  getLastResults() {
    try {
      const data = localStorage.getItem(this.KEYS.LAST_RESULTS);
      if (data) return JSON.parse(data);
      // Auto fallback to benchmark dataset so the UI is immediately interactive
      return this.getBenchmarkResults();
    } catch {
      return this.getBenchmarkResults();
    }
  },

  getBenchmarkResults() {
    return {
      job_id: "demo-benchmark",
      dataset_name: "ai_hiring_audit_dataset.csv",
      dataset_info: {
        rows: 450,
        columns: 8,
        column_names: ["experience_years", "interview_score", "education_level", "gender", "race", "zipcode", "income"],
        target_column: "income"
      },
      context: {
        domain: "Hiring",
        confidence: 0.94
      },
      ontology: {
        domain: "Hiring",
        protected_attributes: ["gender", "race", "age"],
        historical_biases: [
          "Gender disparity in technical roles",
          "Ethnic name bias in resume screening",
          "Resource and compensation gaps"
        ],
        known_proxies: {
          "gender": ["prefix", "career_gap"],
          "race": ["zipcode", "school_district"]
        }
      },
      investigation_plan: {
        domain: "Hiring",
        target_variable: "income",
        features_count: 6,
        shap_features_count: 6,
        causal_features_count: 3
      },
      fee_evidence: {
        experience_years: {
          distribution: { missing_percentage: 0.0, unique_values: 156 },
          mutual_information: 0.1381,
          predictive_impact: 0.3433,
          conditional_p_value: 0.3123,
          is_conditionally_linked: false,
          causal_control: "race"
        },
        interview_score: {
          distribution: { missing_percentage: 0.0, unique_values: 48 },
          mutual_information: 0.1145,
          predictive_impact: 0.2280,
          conditional_p_value: 0.1820,
          is_conditionally_linked: false
        },
        education_level: {
          distribution: { missing_percentage: 0.0, unique_values: 4 },
          mutual_information: 0.0399,
          predictive_impact: 0.1278
        },
        gender: {
          distribution: { missing_percentage: 0.0, unique_values: 2 },
          mutual_information: 0.0878,
          causal_indicator: { p_value: 2.14e-08, is_causally_linked: true },
          predictive_impact: 0.1244
        },
        race: {
          distribution: { missing_percentage: 0.0, unique_values: 3 },
          mutual_information: 0.0628,
          causal_indicator: { p_value: 3.19e-07, is_causally_linked: true },
          predictive_impact: 0.1167
        },
        zipcode: {
          distribution: { missing_percentage: 0.0, unique_values: 24 },
          mutual_information: 0.0512,
          predictive_impact: 0.0890,
          causal_indicator: { p_value: 0.0014, is_causally_linked: true }
        }
      },
      ref_metrics: {
        gender: {
          disparate_impact: 0.402,
          demographic_parity_difference: 0.367,
          equal_opportunity_difference: 0.000,
          equalized_odds_difference: 0.000,
          is_biased: true,
          status: "BIASED",
          details: {
            privileged_group: "Male",
            privileged_rate: 0.614,
            unprivileged_group: "Female",
            unprivileged_rate: 0.247,
            privileged_tpr: 1.0,
            unprivileged_tpr: 1.0,
            privileged_fpr: 0.0,
            unprivileged_fpr: 0.0
          }
        },
        race: {
          disparate_impact: 0.353,
          demographic_parity_difference: 0.407,
          equal_opportunity_difference: 0.000,
          equalized_odds_difference: 0.000,
          is_biased: true,
          status: "BIASED",
          details: {
            privileged_group: "Majority Group",
            privileged_rate: 0.629,
            unprivileged_group: "Underrepresented Minority",
            unprivileged_rate: 0.222,
            privileged_tpr: 1.0,
            unprivileged_tpr: 1.0,
            privileged_fpr: 0.0,
            unprivileged_fpr: 0.0
          }
        },
        zipcode: {
          disparate_impact: 0.725,
          demographic_parity_difference: 0.158,
          equal_opportunity_difference: 0.024,
          equalized_odds_difference: 0.028,
          is_biased: true,
          status: "BIASED",
          details: {
            privileged_group: "Metro-North",
            privileged_rate: 0.575,
            unprivileged_group: "South-District",
            unprivileged_rate: 0.417,
            privileged_tpr: 0.94,
            unprivileged_tpr: 0.91,
            privileged_fpr: 0.08,
            unprivileged_fpr: 0.11
          }
        }
      },
      cre_rankings: [
        {
          column_name: "gender",
          semantic_category: "Demographic",
          semantic_role: "Feature",
          is_protected: true,
          is_proxy: false,
          proxy_for: null,
          base_score: 80.0,
          stat_score: 74.0,
          final_score: 77.6,
          confidence: 94.0,
          priority: "HIGH",
          is_uncertain: false,
          uncertainty_reasons: [],
          trace: [
            "Semantics: 'gender' is a declared protected attribute in Hiring ontology.",
            "Evidence: Empirical statistics aggregated score is 74.0/100.",
            "Disparity: Female favorable outcome rate is 24.7% vs Male rate 61.4% (DI: 0.402).",
            "Fusion: Combined final bias score is 77.6/100.",
            "Decision: Assigned priority level HIGH. Immediate mitigation required."
          ]
        },
        {
          column_name: "race",
          semantic_category: "Demographic",
          semantic_role: "Feature",
          is_protected: true,
          is_proxy: false,
          proxy_for: null,
          base_score: 80.0,
          stat_score: 71.9,
          final_score: 76.8,
          confidence: 91.9,
          priority: "HIGH",
          is_uncertain: false,
          uncertainty_reasons: [],
          trace: [
            "Semantics: 'race' is a declared protected attribute in Hiring ontology.",
            "Evidence: Empirical statistics aggregated score is 71.9/100.",
            "Disparity: Minority favorable selection rate is 22.2% vs Majority 62.9% (DI: 0.353).",
            "Fusion: Combined final bias score is 76.8/100.",
            "Decision: Assigned priority level HIGH."
          ]
        },
        {
          column_name: "zipcode",
          semantic_category: "Geographic Proxy",
          semantic_role: "Proxy",
          is_protected: false,
          is_proxy: true,
          proxy_for: "race",
          base_score: 65.0,
          stat_score: 68.5,
          final_score: 66.8,
          confidence: 88.5,
          priority: "MEDIUM",
          is_uncertain: false,
          uncertainty_reasons: [],
          trace: [
            "Semantics: 'zipcode' flagged as geographic proxy for race in Hiring domain.",
            "Evidence: Empirical dependency score is 68.5/100 with significant causal link.",
            "Fusion: Combined final bias score is 66.8/100.",
            "Decision: Assigned priority level MEDIUM. Consider proxy suppression."
          ]
        },
        {
          column_name: "experience_years",
          semantic_category: "Qualification",
          semantic_role: "Feature",
          is_protected: false,
          is_proxy: false,
          proxy_for: null,
          base_score: 30.0,
          stat_score: 84.5,
          final_score: 51.8,
          confidence: 85.5,
          priority: "MEDIUM",
          is_uncertain: false,
          uncertainty_reasons: [],
          trace: [
            "Semantics: 'experience_years' is a standard legitimate job qualification feature.",
            "Evidence: Highly predictive of outcome (SHAP impact: 34.33%).",
            "Causal Check: No direct causal link to demographic disparity.",
            "Decision: Legitimate predictive qualification."
          ]
        },
        {
          column_name: "interview_score",
          semantic_category: "Evaluation",
          semantic_role: "Feature",
          is_protected: false,
          is_proxy: false,
          proxy_for: null,
          base_score: 25.0,
          stat_score: 42.0,
          final_score: 33.5,
          confidence: 82.0,
          priority: "LOW",
          is_uncertain: false,
          uncertainty_reasons: [],
          trace: [
            "Semantics: 'interview_score' is a standardized qualification assessment.",
            "Evidence: Moderate predictive impact (22.8%) with uniform group distribution.",
            "Decision: Assigned priority level LOW (Fair factor)."
          ]
        },
        {
          column_name: "education_level",
          semantic_category: "Qualification",
          semantic_role: "Feature",
          is_protected: false,
          is_proxy: false,
          proxy_for: null,
          base_score: 30.0,
          stat_score: 60.0,
          final_score: 42.0,
          confidence: 70.0,
          priority: "LOW",
          is_uncertain: false,
          uncertainty_reasons: [],
          trace: [
            "Semantics: 'education_level' is a standard feature column.",
            "Evidence: Empirical statistics aggregated score is 60.0/100.",
            "Decision: Assigned priority level LOW."
          ]
        }
      ],
      afl: {
        iterations_count: 2,
        actions: [
          {
            iteration: 1,
            feature: "experience_years",
            action: "DeepCausalDiscovery",
            objectives: {
              evidence_gain: 9.0,
              confidence_improvement: 9.0,
              cost: 6.0
            }
          },
          {
            iteration: 2,
            feature: "zipcode",
            action: "ConditionalProxyAudit",
            objectives: {
              evidence_gain: 8.5,
              confidence_improvement: 8.0,
              cost: 5.5
            }
          }
        ],
        trace: [
          "[AFL Iteration 1] Evaluating high-predictive feature 'experience_years' against 'gender' control.",
          "[AFL Iteration 1] Result: Conditional p-value = 0.312. Verified independent of demographic disparity.",
          "[AFL Iteration 2] Evaluating proxy feature 'zipcode' against 'race' distribution.",
          "[AFL Iteration 2] Result: Confirmed proxy linkage. Disparate impact ratio = 0.725."
        ]
      },
      mitigations: [
        {
          feature: "gender",
          priority_level: "HIGH",
          recs: [
            {
              type: "In-processing",
              strategy_name: "Fairlearn Exponentiated Gradient (Demographic Parity)",
              priority: "HIGH",
              suitability_rationale: "Directly enforces demographic parity constraints during training by optimizing a randomized ensemble of reweighted estimators via Fairlearn's reduction framework.",
              implementation_snippet: "# Example using Fairlearn's Exponentiated Gradient optimizer to enforce fairness constraints\nfrom fairlearn.reductions import ExponentiatedGradient, DemographicParity\nfrom sklearn.ensemble import RandomForestClassifier\n\nestimator = RandomForestClassifier(random_state=42)\nmitigator = ExponentiatedGradient(estimator, constraints=DemographicParity())\nmitigator.fit(X, y, sensitive_features=sensitive_series)"
            },
            {
              type: "Preprocessing",
              strategy_name: "Demographic Parity Reweighing",
              priority: "HIGH",
              suitability_rationale: "Assigns balancing weights to underrepresented female candidates before model training to eliminate historical outcome disparity without discarding training data.",
              implementation_snippet: "# Preprocessing: Reweighing sample weights\nfrom aif360.algorithms.preprocessing import Reweighing\nfrom aif360.datasets import BinaryLabelDataset\n\nrw = Reweighing(unprivileged_groups=[{'gender': 0}], privileged_groups=[{'gender': 1}])\ntransformed_dataset = rw.fit_transform(binary_dataset)\nweights = transformed_dataset.instance_weights"
            },
            {
              type: "Post-processing",
              strategy_name: "Reject Option Classification (ROC) / Equalized Odds",
              priority: "MEDIUM",
              suitability_rationale: "Non-invasive threshold adjustment around the decision boundary for unprivileged groups after standard model training.",
              implementation_snippet: "# Example post-processing adjustment\n# Shift predictions for unprivileged group within the margin of uncertainty\nunpriv_mask = (df['gender'] == 'Female')\nprobs = model.predict_proba(X)[:, 1]\nnew_preds = (probs > 0.5).astype(int)\n# Apply an adjusted decision threshold to unprivileged group\nnew_preds[unpriv_mask] = (probs[unpriv_mask] > 0.45).astype(int)"
            }
          ]
        },
        {
          feature: "zipcode",
          priority_level: "MEDIUM",
          recs: [
            {
              type: "Preprocessing",
              strategy_name: "Proxy Feature Dropping / Suppression",
              priority: "MEDIUM",
              suitability_rationale: "'zipcode' is a known geographic proxy for race. Removing or decorrelating it prevents proxy reconstruction.",
              implementation_snippet: "# Drop the proxy column to prevent indirect proxy leakage\nX_debiased = X.drop(columns=['zipcode'])"
            }
          ]
        }
      ],
      summary: {
        total_features: 6,
        high_bias_count: 2,
        medium_bias_count: 1,
        low_bias_count: 3,
        biased_features_count: 3,
        execution_time_seconds: 4.82
      }
    };
  },


  /**
   * Theme Management - Uses default design consistently
   */
  getTheme() {
    return 'light';
  },

  setTheme(themeName) {
    document.documentElement.setAttribute('data-theme', 'light');
  },

  initTheme() {
    document.documentElement.setAttribute('data-theme', 'light');
  },

  /**
   * Toast notification system
   */
  showToast(title, message, type = 'info') {
    let container = document.getElementById('cafre-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'cafre-toast-container';
      container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
      document.body.appendChild(container);
    }

    const toastId = 'toast_' + Math.random().toString(36).substring(2, 9);
    const bgClass = type === 'success' ? 'text-success' :
                    type === 'danger' || type === 'error' ? 'text-danger' :
                    type === 'warning' ? 'text-warning' : 'text-primary';

    const icon = type === 'success' ? 'bi-check-circle-fill' :
                 type === 'danger' || type === 'error' ? 'bi-exclamation-triangle-fill' :
                 type === 'warning' ? 'bi-exclamation-circle-fill' : 'bi-info-circle-fill';

    const html = `
      <div id="${toastId}" class="toast align-items-center shadow-lg" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
          <div class="toast-body d-flex align-items-start gap-2">
            <i class="bi ${icon} ${bgClass} fs-5"></i>
            <div>
              <div class="fw-bold">${title}</div>
              <div class="text-muted small">${message}</div>
            </div>
          </div>
          <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
    const elem = document.getElementById(toastId);
    if (window.bootstrap && window.bootstrap.Toast) {
      const bsToast = new bootstrap.Toast(elem, { delay: 3500 });
      bsToast.show();
      elem.addEventListener('hidden.bs.toast', () => elem.remove());
    }
  },

  /**
   * Formatting helpers
   */
  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  },

  formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '—';
    return Number(num).toLocaleString();
  },

  /**
   * Priority badge HTML
   */
  renderPriorityBadge(priority) {
    switch ((priority || '').toUpperCase()) {
      case 'HIGH':
        return '<span class="badge badge-cafre-high"><i class="bi bi-fire me-1"></i>HIGH</span>';
      case 'MEDIUM':
        return '<span class="badge badge-cafre-med"><i class="bi bi-exclamation-circle me-1"></i>MEDIUM</span>';
      case 'LOW':
        return '<span class="badge badge-cafre-low"><i class="bi bi-shield-check me-1"></i>LOW</span>';
      default:
        return '<span class="badge bg-secondary text-muted">IGNORE</span>';
    }
  },

  /**
   * Disparate Impact (80% Rule) badge
   */
  renderDiBadge(di) {
    if (di === null || di === undefined) return '<span class="badge bg-secondary">N/A</span>';
    const val = parseFloat(di);
    if (val < 0.8) {
      return `<span class="badge badge-cafre-high" title="Below 0.80 standard EEOC threshold"><i class="bi bi-x-circle me-1"></i>${val.toFixed(3)} (BIASED)</span>`;
    }
    return `<span class="badge badge-cafre-low" title="Complies with 80% rule"><i class="bi bi-check-circle me-1"></i>${val.toFixed(3)} (FAIR)</span>`;
  },

  /**
   * Semantic Role badge
   */
  renderRoleBadge(role, isSensitive = false) {
    let base = `<span class="badge bg-dark border border-secondary">${role || 'Feature'}</span>`;
    if (isSensitive) {
      base += ` <span class="badge badge-cafre-sensitive ms-1"><i class="bi bi-lock-fill me-1"></i>PROTECTED</span>`;
    }
    return base;
  },

  /**
   * Setup active navigation highlights & theme switcher
   */
  initNav() {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-link, .sidebar-nav-item').forEach(link => {
      const href = link.getAttribute('href');
      if (href && (href === currentPath || (currentPath === '' && href === 'index.html'))) {
        link.classList.add('active');
      }
    });

    // Mobile sidebar toggler
    const toggleBtn = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.app-sidebar');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('show');
      });
    }

  }
};

// Immediate early theme application to prevent visual flash
CAFRE_UI.initTheme();

document.addEventListener('DOMContentLoaded', () => {
  CAFRE_UI.initNav();
  CAFRE_UI.initTheme();
});

window.CAFRE_UI = CAFRE_UI;
