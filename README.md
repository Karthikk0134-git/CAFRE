# CAFRE — Context-Aware Fairness Reasoning Engine

[![Python Version](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688.svg)](https://fastapi.tiangolo.com)

**CAFRE** (Context-Aware Fairness Reasoning Engine) is an agentic, modular AI framework engineered to audit, detect, reason over, and mitigate fairness violations and bias in machine learning models and datasets. Unlike conventional metric-only fairness tools, CAFRE incorporates domain knowledge and multi-stage reasoning to contextualize disparities across demographic, legal, and operational boundaries.

---

## 🌟 Architecture Overview

CAFRE operates through an orchestrated 9-block pipeline:

```
[ Input Dataset / Model ]
         │
         ▼
┌───────────────────────────────────────────────┐
│ BLOCK 2: Semantic Recognition Engine (SRE)    │
│ Identifies column semantics, types, and roles │
└───────────────────────┬───────────────────────┘
                        │
         ▼
┌───────────────────────────────────────────────┐
│ BLOCK 3: Context Detection Engine (CDE)       │
│ Determines domain (hiring, lending, etc.)     │
└───────────────────────┬───────────────────────┘
                        │
         ▼
┌───────────────────────────────────────────────┐
│ BLOCK 4: Context Knowledge Engine (CKE)       │
│ Retrieves domain standards, metrics, laws     │
└───────────────────────┬───────────────────────┘
                        │
         ▼
┌───────────────────────────────────────────────┐
│ BLOCK 5: Dynamic Investigation Planner (DIP)  │
│ Generates customized bias audit plan          │
└───────────────────────┬───────────────────────┘
                        │
         ▼
┌───────────────────────────────────────────────┐
│ BLOCK 6: Fairness Evidence Extractor (FEE)    │
│ Extracts statistical disparities & metrics    │
└───────────────────────┬───────────────────────┘
                        │
         ▼
┌───────────────────────────────────────────────┐
│ BLOCK 7: Context-Aware Reasoning Engine (CARE)│
│ LLM-guided context synthesis of bias evidence │
└───────────────────────┬───────────────────────┘
                        │
         ▼
┌───────────────────────────────────────────────┐
│ BLOCK 8: Agentic Feedback Loop (AFL)          │
│ Iterative verification & reflection cycle     │
└───────────────────────┬───────────────────────┘
                        │
         ▼
┌───────────────────────────────────────────────┐
│ BLOCK 9: FERC Explainability Engine           │
│ Generates natural language causal narratives  │
└───────────────────────┬───────────────────────┘
                        │
         ▼
┌───────────────────────────────────────────────┐
│ BLOCK 10: Bias Mitigation Engine (BME)        │
│ Applies re-weighing, thresholds & mitigations │
└───────────────────────────────────────────────┘
```

---

## 🚀 Key Features

- **End-to-End Pipeline Execution**: Run a full audit from raw CSV/Excel data to calibrated, mitigated outputs.
- **Context-Aware Reasoning**: Integrates domain-specific regulatory rules (e.g., EEOC four-fifths rule, Equal Credit Opportunity Act).
- **Agentic Iteration**: Self-refining feedback loops ensure robust and verifiable audit outcomes.
- **Interactive Web Interface**: Complete HTML5/CSS/JavaScript UI featuring:
  - Dataset file upload & pre-loaded benchmark datasets
  - Real-time block-by-block pipeline status tracking
  - Visual fairness metric dashboards & disparity charts
  - Natural language explainability reports with mitigation recommendations
- **FastAPI REST API**: Fully asynchronous endpoints for programmatic integration.

---

## 📂 Repository Structure

```
├── CAFRE/                               # Core CAFRE pipeline engines
│   ├── BLOCK_2_SEMANTIC_RECOGNITION_ENGINE/
│   ├── BLOCK_3_CONTEXT_DETECTION_ENGINE/
│   ├── BLOCK_4_CONTEXT_KNOWLEDGE_ENGINE/
│   ├── BLOCK_5_DYNAMIC_INVESTIGATION_PLANNER/
│   ├── BLOCK_6_FAIRNESS_EVIDENCE_EXTRACTOR/
│   ├── BLOCK_7_CONTEXT_AWARE_REASONING_ENGINE/
│   ├── BLOCK_8_AGENTIC_FEEDBACK_LOOP/
│   ├── BLOCK_9_FERC_EXPLAINABILITY_ENGINE/
│   ├── BLOCK_10_BIAS_MITIGATION_ENGINE/
│   └── tests/
├── api/                                 # FastAPI application & pipeline runner
│   ├── app.py
│   └── pipeline_runner.py
├── frontend/                            # Modern web dashboard
│   ├── index.html                       # Dataset upload & configuration
│   ├── analysis.html                    # Pipeline execution & status
│   ├── dashboard.html                   # Disparity metrics & charts
│   ├── explainability.html              # Natural language causal report
│   ├── report.html                      # Comprehensive audit report
│   ├── css/
│   └── js/
├── data/                                # Benchmark datasets
│   ├── ai_hiring_audit_dataset.csv
│   ├── biased_dataset_test.csv
│   ├── biased_dataset_train.csv
│   └── credit_risk_dataset.csv
├── main.py                              # CLI runner for standalone pipeline
├── requirements.txt                     # Python dependencies
└── README.md
```

---

## 🛠️ Quick Start

### 1. Prerequisites
- Python 3.10+
- (Optional, for LLM reasoning) [Ollama](https://ollama.ai/) with your preferred local model (e.g. `llama3` or `mistral`).

### 2. Installation
```bash
git clone https://github.com/Karthikk0134-git/CAFRE.git
cd CAFRE
pip install -r requirements.txt
```

### 3. Running the Web Application
Start the FastAPI server:
```bash
uvicorn api.app:app --host 0.0.0.0 --port 8000 --reload
```
Open your browser and navigate to:
```
http://localhost:8000/
```

### 4. Running the Standalone CLI
To run an automated audit on sample data directly in the terminal:
```bash
python main.py
```

---

## 📊 Supported Fairness Metrics

- **Disparate Impact (Four-Fifths Rule)**
- **Demographic Parity Difference**
- **Equal Opportunity Difference**
- **Average Odds Difference**
- **Predictive Parity & False Positive/Negative Disparities**

---

## 📄 License
This project is licensed under the MIT License.
