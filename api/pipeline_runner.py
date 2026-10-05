"""
api/pipeline_runner.py
======================
Thread-safe execution orchestrator for the CAFRE pipeline.
Imports and calls existing CAFRE modules directly without rewriting their logic.
Provides fine-grained step-by-step progress tracking for the frontend.
"""

import os
import sys
import time
import uuid
import json
import logging
import threading
from typing import Dict, Any, Optional, List
import pandas as pd
import numpy as np

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

logger = logging.getLogger("cafre.pipeline_runner")

# Existing CAFRE modules
from CAFRE.BLOCK_2_SEMANTIC_RECOGNITION_ENGINE.semantic_engine import SemanticEngine
from CAFRE.BLOCK_2_SEMANTIC_RECOGNITION_ENGINE.utils import load_dataset
from CAFRE.BLOCK_3_CONTEXT_DETECTION_ENGINE.detector import ContextDetector
from CAFRE.BLOCK_4_CONTEXT_KNOWLEDGE_ENGINE.leco_generator import CKEGenerator
from CAFRE.BLOCK_5_DYNAMIC_INVESTIGATION_PLANNER.planner import InvestigationPlanner
from CAFRE.BLOCK_6_FAIRNESS_EVIDENCE_EXTRACTOR.mpem import FairnessEvidenceExtractor
from CAFRE.BLOCK_6_FAIRNESS_EVIDENCE_EXTRACTOR.ref import RegisteredFairnessEvidences
from CAFRE.BLOCK_7_CONTEXT_AWARE_REASONING_ENGINE.cre import ContextAwareReasoningEngine
from CAFRE.BLOCK_8_AGENTIC_FEEDBACK_LOOP.afl import AgenticFeedbackLoop
from CAFRE.BLOCK_9_FERC_EXPLAINABILITY_ENGINE.ferc import FERCExplainabilityEngine
from CAFRE.BLOCK_10_BIAS_MITIGATION_ENGINE.engine import BiasMitigationEngine


def sanitize_for_json(obj: Any) -> Any:
    """Recursively converts NumPy/Pandas types into standard JSON-serializable Python types."""
    if isinstance(obj, (np.integer, np.int64, np.int32, np.int16, np.int8)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float64, np.float32)):
        val = float(obj)
        if np.isnan(val) or np.isinf(val):
            return None
        return val
    elif isinstance(obj, np.bool_):
        return bool(obj)
    elif isinstance(obj, np.ndarray):
        return [sanitize_for_json(x) for x in obj.tolist()]
    elif isinstance(obj, dict):
        return {str(k): sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple, set)):
        return [sanitize_for_json(x) for x in obj]
    elif pd.isna(obj):
        return None
    return obj


class JobState:
    def __init__(self, job_id: str, dataset_name: str, dataset_path: str):
        self.job_id = job_id
        self.dataset_name = dataset_name
        self.dataset_path = dataset_path
        self.status = "pending"  # "pending", "running", "completed", "failed"
        self.current_step = 0
        self.total_steps = 11
        self.current_step_name = "Initialized"
        self.percent = 0
        self.logs: List[str] = []
        self.results: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None
        self.start_time = time.time()
        self.end_time: Optional[float] = None
        self.elapsed: float = 0.0

    def add_log(self, message: str):
        timestamp = time.strftime("%H:%M:%S")
        entry = f"[{timestamp}] {message}"
        self.logs.append(entry)
        logger.info(f"[{self.job_id}] {message}")

    def update_step(self, step_num: int, step_name: str, message: str = ""):
        self.current_step = step_num
        self.current_step_name = step_name
        self.percent = int((step_num / self.total_steps) * 100)
        log_msg = f"Step {step_num}/{self.total_steps}: {step_name}"
        if message:
            log_msg += f" — {message}"
        self.add_log(log_msg)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "dataset_name": self.dataset_name,
            "status": self.status,
            "current_step": self.current_step,
            "total_steps": self.total_steps,
            "current_step_name": self.current_step_name,
            "percent": self.percent,
            "logs": self.logs,
            "error": self.error,
            "elapsed": round(time.time() - self.start_time, 2) if self.status == "running" else self.elapsed,
            "has_results": self.results is not None
        }


class PipelineRunner:
    """Singleton runner that manages and executes pipeline jobs."""
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(PipelineRunner, cls).__new__(cls)
                cls._instance.jobs = {}
                cls._instance._detector = None
            return cls._instance

    def _get_context_detector(self) -> ContextDetector:
        """Cached ContextDetector instance with graceful fallback."""
        if self._detector is None:
            try:
                self._detector = ContextDetector()
            except Exception as e:
                logger.warning(f"Failed to load standard ContextDetector: {e}. Using fallback detector.")
                # Fallback implementation if SentenceTransformer cannot load
                class FallbackContextDetector:
                    DOMAIN_ANCHORS = ContextDetector.DOMAIN_ANCHORS
                    def detect_context(self, metadata):
                        cols = [str(c).lower() for c in metadata.get("columns", [])]
                        col_str = " ".join(cols)
                        scores = {}
                        for domain, keywords in self.DOMAIN_ANCHORS.items():
                            kw_list = [k.strip() for k in keywords.split(",")]
                            match_count = sum(1 for kw in kw_list if kw in col_str)
                            scores[domain] = match_count / max(len(kw_list), 1)
                        best_domain = max(scores, key=scores.get)
                        conf = max(0.4, min(scores[best_domain] * 2.0, 0.95)) if scores[best_domain] > 0 else 0.5
                        return (best_domain, conf) if scores[best_domain] > 0 else ("Hiring", 0.6)
                self._detector = FallbackContextDetector()
        return self._detector

    def start_job(self, dataset_path: str, dataset_name: str, target_col: Optional[str] = None, domain_override: Optional[str] = None) -> str:
        job_id = str(uuid.uuid4())[:8]
        job = JobState(job_id=job_id, dataset_name=dataset_name, dataset_path=dataset_path)
        self.jobs[job_id] = job

        thread = threading.Thread(
            target=self._execute_pipeline,
            args=(job, target_col, domain_override),
            daemon=True
        )
        thread.start()
        return job_id

    def get_job(self, job_id: str) -> Optional[JobState]:
        return self.jobs.get(job_id)

    def _execute_pipeline(self, job: JobState, target_col_override: Optional[str] = None, domain_override: Optional[str] = None):
        job.status = "running"
        job.start_time = time.time()
        job.add_log(f"Starting CAFRE fairness reasoning pipeline on '{job.dataset_name}'")

        try:
            # -------------------------------------------------------------------
            # Step 1 — Dataset Input
            # -------------------------------------------------------------------
            job.update_step(1, "Dataset Input", "Loading and parsing CSV dataset")
            df = load_dataset(job.dataset_path)
            row_count, col_count = df.shape
            col_names = df.columns.tolist()
            job.add_log(f"Loaded dataset: {row_count:,} rows × {col_count} columns")

            # -------------------------------------------------------------------
            # Step 2 — Semantic Recognition Engine (SRE)
            # -------------------------------------------------------------------
            job.update_step(2, "Semantic Recognition Engine (SRE)", "Inferring semantic roles and sensitive concepts")
            kb_path = os.path.join(PROJECT_ROOT, "CAFRE", "BLOCK_2_SEMANTIC_RECOGNITION_ENGINE", "knowledge.json")
            sre = SemanticEngine(kb_path=kb_path)
            semantics = sre.understand_dataset(df)

            detected_target = target_col_override or sre.identify_primary_outcome(semantics)
            if detected_target is None or detected_target not in df.columns:
                for col in reversed(df.columns.tolist()):
                    if df[col].nunique() <= 5:
                        detected_target = col
                        break
            if detected_target is None:
                detected_target = df.columns[-1]

            job.add_log(f"Target Outcome Variable: '{detected_target}'")
            semantic_roles_summary = []
            for s in semantics:
                is_sens = s.concept_match.is_sensitive if s.concept_match else False
                concept_name = s.concept_match.name if s.concept_match else "Unmatched"
                category = s.concept_match.category if s.concept_match else "Feature"
                semantic_roles_summary.append({
                    "column_name": s.column_name,
                    "inferred_role": s.inferred_role,
                    "concept_name": concept_name,
                    "category": category,
                    "is_sensitive": is_sens,
                    "match_confidence": round(float(s.match_confidence), 1),
                    "detected_dtype": s.detected_dtype
                })

            # -------------------------------------------------------------------
            # Step 3 — Context Detection Engine (CDE)
            # -------------------------------------------------------------------
            job.update_step(3, "Context Detection Engine (CDE)", "Identifying domain context and regulatory framework")
            if domain_override and domain_override.strip() and domain_override.lower() != "auto":
                detected_domain = domain_override.strip()
                domain_confidence = 1.0
                job.add_log(f"Domain context manually set to: {detected_domain}")
            else:
                detector = self._get_context_detector()
                dataset_metadata = {"columns": col_names}
                detected_domain, domain_confidence = detector.detect_context(dataset_metadata)
                if detected_domain == "Unknown" or domain_confidence < 0.15:
                    # Heuristic default based on column names
                    col_str = " ".join([c.lower() for c in col_names])
                    if any(k in col_str for k in ["loan", "credit", "risk", "income", "borrower"]):
                        detected_domain, domain_confidence = "Finance", 0.75
                    elif any(k in col_str for k in ["hire", "hiring", "resume", "interview", "candidate", "salary", "job"]):
                        detected_domain, domain_confidence = "Hiring", 0.85
                    elif any(k in col_str for k in ["patient", "medical", "disease", "blood"]):
                        detected_domain, domain_confidence = "Healthcare", 0.80
                    elif any(k in col_str for k in ["student", "grade", "gpa", "school"]):
                        detected_domain, domain_confidence = "Education", 0.80
                    else:
                        detected_domain, domain_confidence = "Hiring", 0.60
                job.add_log(f"Detected Domain: {detected_domain} ({domain_confidence:.1%} confidence)")

            # -------------------------------------------------------------------
            # Step 4 — Context Knowledge Engine (CKE)
            # -------------------------------------------------------------------
            job.update_step(4, "Context Knowledge Engine (CKE)", "Loading domain fairness rules, protected classes & proxy maps")
            cke = CKEGenerator()
            try:
                cke_ontology = cke.get_ontology(detected_domain)
            except Exception as e:
                logger.warning(f"CKE get_ontology failed: {e}. Falling back to default ontology.")
                cke_ontology = None

            if not cke_ontology:
                # Built-in fallbacks matching CAFRE knowledge
                fallbacks = {
                    "Hiring": {
                        "domain": "Hiring",
                        "protected_attributes": ["gender", "race", "age"],
                        "historical_biases": ["Gender disparity in technical roles", "Ageism in entry level recruiting"],
                        "known_proxies": {"gender": ["name", "prefix"], "race": ["zipcode"]}
                    },
                    "Finance": {
                        "domain": "Finance",
                        "protected_attributes": ["person_age", "gender", "race"],
                        "historical_biases": ["Redlining and geographical credit denial", "Generational wealth disparity"],
                        "known_proxies": {"race": ["cb_person_default_on_file", "zipcode"], "person_age": ["cb_person_cred_hist_length"]}
                    }
                }
                cke_ontology = fallbacks.get(detected_domain, {
                    "domain": detected_domain,
                    "protected_attributes": [c for c in col_names if c.lower() in ["gender", "race", "age", "sex"]],
                    "historical_biases": [f"Historical systemic biases in {detected_domain}"],
                    "known_proxies": {}
                })

            protected_attrs = cke_ontology.get("protected_attributes", [])
            job.add_log(f"Protected Attributes: {', '.join(protected_attrs) if protected_attrs else 'None declared'}")

            # -------------------------------------------------------------------
            # Step 5 — Dynamic Investigation Planner (DIP)
            # -------------------------------------------------------------------
            job.update_step(5, "Dynamic Investigation Planner (DIP)", "Formulating targeted statistical tests & causal checks")
            dip = InvestigationPlanner()
            investigation_plan = dip.generate_plan(
                context=detected_domain,
                dataset_metadata={"columns": col_names},
                leco_ontology=cke_ontology,
                target_variable=detected_target
            )
            shap_count = sum(1 for p in investigation_plan.feature_plans if p.run_shap)
            causal_count = sum(1 for p in investigation_plan.feature_plans if p.run_causal_discovery)
            job.add_log(f"Planned statistical tests for {len(investigation_plan.feature_plans)} features (SHAP: {shap_count}, Causal: {causal_count})")

            # -------------------------------------------------------------------
            # Step 6 — Fairness Evidence Extractor (FEE)
            # -------------------------------------------------------------------
            job.update_step(6, "Fairness Evidence Extractor (FEE)", "Calculating predictive impact, mutual information & dependency")
            fee = FairnessEvidenceExtractor()
            fee_results = fee.execute_plan(df, investigation_plan)
            job.add_log(f"Extracted empirical evidence for {len(fee_results)} features")

            # -------------------------------------------------------------------
            # Step 7 — Registered Fairness Evidences (REF)
            # -------------------------------------------------------------------
            job.update_step(7, "Registered Fairness Evidences (REF)", "Evaluating mathematical parity: DI, DPD, EOD, EODD")
            ref_engine = RegisteredFairnessEvidences()
            ref_results = {}
            protected_in_data = [
                col for col in cke_ontology.get("protected_attributes", [])
                if col in df.columns
            ]
            for proxies in cke_ontology.get("known_proxies", {}).values():
                for proxy in proxies:
                    if proxy in df.columns and proxy not in protected_in_data:
                        protected_in_data.append(proxy)

            if not protected_in_data:
                protected_in_data = [
                    c for c in df.columns if c != detected_target and df[c].nunique() <= 10
                ]

            for col in protected_in_data:
                try:
                    metrics = ref_engine.compute_metrics(df, protected_col=col, target_col=detected_target)
                    if metrics:
                        ref_results[col] = metrics
                        di = metrics.get("disparate_impact", 1.0)
                        dpd = metrics.get("demographic_parity_difference", 0.0)
                        status_tag = "BIASED" if (di < 0.8 or dpd > 0.2) else "FAIR"
                        job.add_log(f"REF for '{col}': Disparate Impact={di:.3f}, DPD={dpd:.3f} [{status_tag}]")
                except Exception as ex:
                    logger.warning(f"REF calculation error on {col}: {ex}")

            # -------------------------------------------------------------------
            # Step 8 — Context-Aware Reasoning Engine (CRE)
            # -------------------------------------------------------------------
            job.update_step(8, "Context-Aware Reasoning Engine (CRE)", "Multi-dimensional cognitive fusion of law, semantics & evidence")
            cre = ContextAwareReasoningEngine(
                domain=detected_domain,
                cke_ontology=cke_ontology,
                target_col=detected_target
            )
            cre_results = cre.analyze_dataset(df, fee_results, ref_results)
            high_risk = [r for r in cre_results if r.priority == "HIGH"]
            med_risk  = [r for r in cre_results if r.priority == "MEDIUM"]
            low_risk  = [r for r in cre_results if r.priority == "LOW"]
            job.add_log(f"Risk Classification: {len(high_risk)} HIGH, {len(med_risk)} MEDIUM, {len(low_risk)} LOW")

            # -------------------------------------------------------------------
            # Step 9 — Agentic Feedback Loop (AFL)
            # -------------------------------------------------------------------
            job.update_step(9, "Agentic Feedback Loop (AFL)", "Executing Pareto-optimized iterative validation investigations")
            afl = AgenticFeedbackLoop(max_loops=2)
            afl_trace = []
            refined_fee_results, afl_actions = afl.run_feedback_loop(
                df=df,
                target_col=detected_target,
                cre_engine=cre,
                fee_results=fee_results,
                ref_results=ref_results,
                trace_logger=afl_trace
            )
            job.add_log(f"AFL completed {len(afl_actions)} Pareto-optimized investigation(s)")
            for t_line in afl_trace:
                job.add_log(f"  {t_line}")

            # Re-run CRE with refined evidence
            cre_results = cre.analyze_dataset(df, refined_fee_results, ref_results)

            # -------------------------------------------------------------------
            # Step 10 — FERC Explainability Engine
            # -------------------------------------------------------------------
            job.update_step(10, "FERC Explainability Engine", "Generating full audit report, Markdown trace & JSON evidence graph")
            output_dir = os.path.join(PROJECT_ROOT, "output", job.job_id)
            os.makedirs(output_dir, exist_ok=True)

            ferc = FERCExplainabilityEngine(
                domain=detected_domain,
                target_col=detected_target,
                cke_ontology=cke_ontology,
                cre_results=cre_results,
                afl_actions=afl_actions,
                fee_results=refined_fee_results,
                ref_results=ref_results
            )
            json_path, md_path = ferc.write_reports(output_dir=output_dir)
            json_report = ferc.compile_json_report()
            with open(md_path, "r", encoding="utf-8") as f:
                markdown_content = f.read()
            job.add_log(f"Generated FERC Reports: {os.path.basename(json_path)} & {os.path.basename(md_path)}")

            # -------------------------------------------------------------------
            # Step 11 — Bias Mitigation Engine (Beta Advisory)
            # -------------------------------------------------------------------
            job.update_step(11, "Bias Mitigation Engine", "Constructing tailored preprocessing, in-processing & post-processing code")
            mitigation_engine = BiasMitigationEngine(domain=detected_domain)
            recommendations = mitigation_engine.generate_recommendations(cre_results)
            total_recs = sum(len(r.get("recs", [])) for r in recommendations)
            job.add_log(f"Generated {total_recs} mitigation strategies across {len(recommendations)} feature(s)")

            # Compile Clean Final Result Payload
            job.elapsed = round(time.time() - job.start_time, 2)
            job.end_time = time.time()
            job.percent = 100
            job.status = "completed"
            job.add_log(f"CAFRE pipeline finished successfully in {job.elapsed:.2f}s")

            # Structured CRE items
            structured_cre = []
            for r in cre_results:
                structured_cre.append({
                    "column_name": r.column_name,
                    "semantic_role": r.semantic_role,
                    "semantic_category": r.semantic_category,
                    "is_protected": r.is_protected,
                    "is_proxy": r.is_proxy,
                    "proxy_for": r.proxy_for,
                    "base_score": round(r.base_score, 1),
                    "stat_score": round(r.stat_score, 1),
                    "final_score": round(r.final_score, 1),
                    "confidence": round(r.confidence, 1),
                    "priority": r.priority,
                    "is_uncertain": r.is_uncertain,
                    "uncertainty_reasons": r.uncertainty_reasons,
                    "trace": r.trace
                })

            # Structured REF items
            structured_ref = {}
            for col, m in ref_results.items():
                di = m.get("disparate_impact", 1.0)
                dpd = m.get("demographic_parity_difference", 0.0)
                eod = m.get("equal_opportunity_difference", 0.0)
                eodd = m.get("equalized_odds_difference", 0.0)
                is_biased = bool(di < 0.8 or dpd > 0.2)
                structured_ref[col] = {
                    "disparate_impact": round(float(di), 3),
                    "demographic_parity_difference": round(float(dpd), 3),
                    "equal_opportunity_difference": round(float(eod), 3),
                    "equalized_odds_difference": round(float(eodd), 3),
                    "is_biased": is_biased,
                    "status": "BIASED" if is_biased else "FAIR",
                    "details": m.get("details", {})
                }

            # Compile complete results dictionary
            job.results = sanitize_for_json({
                "job_id": job.job_id,
                "dataset_name": job.dataset_name,
                "dataset_info": {
                    "rows": row_count,
                    "columns": col_count,
                    "column_names": col_names,
                    "target_column": detected_target
                },
                "semantics": semantic_roles_summary,
                "context": {
                    "domain": detected_domain,
                    "confidence": round(float(domain_confidence), 2)
                },
                "ontology": cke_ontology,
                "investigation_plan": {
                    "domain": investigation_plan.domain,
                    "target_variable": investigation_plan.target_variable,
                    "features_count": len(investigation_plan.feature_plans),
                    "shap_features_count": shap_count,
                    "causal_features_count": causal_count,
                    "plans": [p.model_dump() for p in investigation_plan.feature_plans]
                },
                "fee_evidence": refined_fee_results,
                "ref_metrics": structured_ref,
                "cre_rankings": structured_cre,
                "afl": {
                    "iterations_count": len(afl_actions),
                    "actions": afl_actions,
                    "trace": afl_trace
                },
                "mitigations": recommendations,
                "reports": {
                    "json_path": json_path,
                    "md_path": md_path,
                    "markdown_content": markdown_content,
                    "json_data": json_report
                },
                "summary": {
                    "total_features": len([r for r in cre_results if r.priority != "IGNORE"]),
                    "high_bias_count": len([r for r in cre_results if r.priority == "HIGH"]),
                    "medium_bias_count": len([r for r in cre_results if r.priority == "MEDIUM"]),
                    "low_bias_count": len([r for r in cre_results if r.priority == "LOW"]),
                    "biased_features_count": sum(1 for v in structured_ref.values() if v["is_biased"]),
                    "execution_time_seconds": job.elapsed
                }
            })

        except Exception as e:
            job.status = "failed"
            job.error = str(e)
            job.elapsed = round(time.time() - job.start_time, 2)
            job.add_log(f"ERROR: Pipeline execution failed: {e}")
            logger.exception("Pipeline execution error")
