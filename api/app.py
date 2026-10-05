"""
api/app.py
==========
FastAPI Backend Application for CAFRE.
Provides RESTful APIs for dataset uploading, pipeline orchestration,
real-time status polling, fairness metrics inspection, and report downloads.
Serves static frontend files seamlessly.
"""

import os
import sys
import uuid
import logging
from typing import Optional
import pandas as pd
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from api.pipeline_runner import PipelineRunner, sanitize_for_json

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(name)s | %(levelname)s | %(message)s'
)
logger = logging.getLogger("cafre.api")

app = FastAPI(
    title="CAFRE API",
    description="Context-Aware Fairness Reasoning Engine REST API",
    version="1.0.0"
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(PROJECT_ROOT, "uploads")
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(FRONTEND_DIR, exist_ok=True)

runner = PipelineRunner()


class PipelineRunRequest(BaseModel):
    dataset_source: str  # "sample" or "upload"
    dataset_id: str      # filename or upload ID
    target_column: Optional[str] = None
    domain_override: Optional[str] = None


@app.get("/api/health")
async def health_check():
    """Health check endpoint confirming API status and system readiness."""
    return {
        "status": "healthy",
        "service": "CAFRE (Context-Aware Fairness Reasoning Engine)",
        "version": "1.0.0",
        "sample_datasets_available": len(os.listdir(DATA_DIR)) if os.path.exists(DATA_DIR) else 0
    }


@app.get("/api/datasets")
async def list_datasets():
    """Lists all available benchmark sample datasets in data/."""
    datasets = []
    if os.path.exists(DATA_DIR):
        for f in os.listdir(DATA_DIR):
            lower_f = f.lower()
            if lower_f.endswith(".csv") or lower_f.endswith(".xlsx") or lower_f.endswith(".xls"):
                file_path = os.path.join(DATA_DIR, f)
                try:
                    if lower_f.endswith(".xlsx") or lower_f.endswith(".xls"):
                        df = pd.read_excel(file_path, nrows=5)
                        full_df = pd.read_excel(file_path)
                    else:
                        df = pd.read_csv(file_path, nrows=5)
                        full_df = pd.read_csv(file_path)
                    size_bytes = os.path.getsize(file_path)
                    datasets.append({
                        "id": f,
                        "name": f,
                        "size_bytes": size_bytes,
                        "size_formatted": f"{size_bytes / 1024:.1f} KB" if size_bytes < 1024*1024 else f"{size_bytes / (1024*1024):.2f} MB",
                        "rows": len(full_df),
                        "columns_count": len(df.columns),
                        "columns": [str(c) for c in df.columns.tolist()]
                    })
                except Exception as e:
                    logger.warning(f"Could not read dataset {f}: {e}")
    return {"datasets": datasets}


@app.post("/api/upload")
async def upload_dataset(file: UploadFile = File(...)):
    """Receives a CSV or Excel file upload, computes summary statistics, and provides an instant preview."""
    filename = file.filename or "dataset"
    lower_name = filename.lower()
    is_csv = lower_name.endswith(".csv")
    is_excel = lower_name.endswith(".xlsx") or lower_name.endswith(".xls")

    if not (is_csv or is_excel):
        raise HTTPException(status_code=400, detail="Only CSV (.csv) and Excel (.xlsx, .xls) files are supported.")

    file_id = f"{uuid.uuid4().hex[:8]}_{filename}"
    file_path = os.path.join(UPLOAD_DIR, file_id)

    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        # Parse CSV or Excel for preview
        if is_excel:
            df = pd.read_excel(file_path)
            # Pre-convert and save normalized CSV representation for the CAFRE pipeline
            csv_file_id = os.path.splitext(file_id)[0] + ".csv"
            csv_path = os.path.join(UPLOAD_DIR, csv_file_id)
            df.to_csv(csv_path, index=False)
        else:
            df = pd.read_csv(file_path)

        rows, cols = df.shape

        preview_rows = df.head(15).replace({pd.NA: None, float("nan"): None}).to_dict(orient="records")
        preview_rows = sanitize_for_json(preview_rows)

        column_details = []
        for col in df.columns:
            missing = int(df[col].isna().sum())
            missing_pct = round((missing / rows) * 100, 1) if rows > 0 else 0
            nunique = int(df[col].nunique())
            column_details.append({
                "name": str(col),
                "dtype": str(df[col].dtype),
                "unique_values": nunique,
                "missing_count": missing,
                "missing_percentage": missing_pct,
                "sample_values": [str(x) for x in df[col].dropna().unique()[:3]]
            })

        size_bytes = os.path.getsize(file_path)
        return {
            "status": "success",
            "file_id": file_id,
            "filename": file.filename,
            "size_bytes": size_bytes,
            "size_formatted": f"{size_bytes / 1024:.1f} KB" if size_bytes < 1024*1024 else f"{size_bytes / (1024*1024):.2f} MB",
            "rows": rows,
            "columns_count": cols,
            "columns": [str(c) for c in df.columns.tolist()],
            "column_details": column_details,
            "preview": preview_rows
        }
    except Exception as e:
        logger.exception("Upload processing error")
        raise HTTPException(status_code=500, detail=f"Failed to process dataset: {str(e)}")


@app.get("/api/dataset/preview")
async def get_dataset_preview(source: str = Query("sample"), dataset_id: str = Query(...)):
    """Returns detailed structure and row preview for any dataset (CSV or Excel)."""
    if source == "upload":
        file_path = os.path.join(UPLOAD_DIR, dataset_id)
    else:
        file_path = os.path.join(DATA_DIR, dataset_id)

    if not os.path.exists(file_path):
        alt_path = os.path.splitext(file_path)[0] + ".csv"
        if os.path.exists(alt_path):
            file_path = alt_path
        else:
            raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found.")

    try:
        lower_p = file_path.lower()
        if lower_p.endswith(".xlsx") or lower_p.endswith(".xls"):
            df = pd.read_excel(file_path)
        else:
            df = pd.read_csv(file_path)

        rows, cols = df.shape
        preview_rows = df.head(15).replace({pd.NA: None, float("nan"): None}).to_dict(orient="records")
        preview_rows = sanitize_for_json(preview_rows)

        column_details = []
        for col in df.columns:
            missing = int(df[col].isna().sum())
            missing_pct = round((missing / rows) * 100, 1) if rows > 0 else 0
            nunique = int(df[col].nunique())
            column_details.append({
                "name": str(col),
                "dtype": str(df[col].dtype),
                "unique_values": nunique,
                "missing_count": missing,
                "missing_percentage": missing_pct,
                "sample_values": [str(x) for x in df[col].dropna().unique()[:3]]
            })

        size_bytes = os.path.getsize(file_path)
        return {
            "dataset_id": dataset_id,
            "filename": os.path.basename(file_path),
            "size_bytes": size_bytes,
            "size_formatted": f"{size_bytes / 1024:.1f} KB" if size_bytes < 1024*1024 else f"{size_bytes / (1024*1024):.2f} MB",
            "rows": rows,
            "columns_count": cols,
            "columns": [str(c) for c in df.columns.tolist()],
            "column_details": column_details,
            "preview": preview_rows
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to preview dataset: {str(e)}")


@app.post("/api/pipeline/run")
async def run_pipeline(req: PipelineRunRequest):
    """Triggers the full 11-step CAFRE pipeline on a selected dataset."""
    if req.dataset_source == "upload":
        file_path = os.path.join(UPLOAD_DIR, req.dataset_id)
    else:
        file_path = os.path.join(DATA_DIR, req.dataset_id)

    if not os.path.exists(file_path):
        alt_path = os.path.splitext(file_path)[0] + ".csv"
        if os.path.exists(alt_path):
            file_path = alt_path
        else:
            raise HTTPException(status_code=404, detail=f"Dataset file '{req.dataset_id}' not found.")

    lower_path = file_path.lower()
    pipeline_file_path = file_path
    if lower_path.endswith(".xlsx") or lower_path.endswith(".xls"):
        # Convert Excel to normalized CSV in the backend/API layer for the pipeline
        csv_file_path = os.path.splitext(file_path)[0] + ".csv"
        if not os.path.exists(csv_file_path):
            excel_df = pd.read_excel(file_path)
            excel_df.to_csv(csv_file_path, index=False)
        pipeline_file_path = csv_file_path

    job_id = runner.start_job(
        dataset_path=pipeline_file_path,
        dataset_name=os.path.basename(file_path),
        target_col=req.target_column,
        domain_override=req.domain_override
    )

    return {
        "job_id": job_id,
        "status": "running",
        "dataset_name": os.path.basename(file_path)
    }


@app.get("/api/pipeline/status/{job_id}")
async def get_pipeline_status(job_id: str):
    """Returns the live status, current step, logs, and progress percentage of a job."""
    job = runner.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    return job.to_dict()


@app.get("/api/pipeline/results/{job_id}")
async def get_pipeline_results(job_id: str):
    """Returns the full compiled CAFRE results, metrics, reasoning trace, and mitigations."""
    job = runner.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    if job.status == "failed":
        raise HTTPException(status_code=500, detail=f"Job failed: {job.error}")
    if job.status != "completed" or job.results is None:
        return {
            "status": job.status,
            "percent": job.percent,
            "current_step_name": job.current_step_name,
            "message": "Job is still processing. Please continue polling."
        }
    return job.results


@app.get("/api/reports/{job_id}/download")
async def download_report(job_id: str, format: str = Query("markdown", pattern="^(markdown|json)$")):
    """Streams the generated markdown or JSON audit report file for direct browser download."""
    job = runner.get_job(job_id)
    if not job or not job.results:
        raise HTTPException(status_code=404, detail=f"Job or report for '{job_id}' not found.")

    reports = job.results.get("reports", {})
    if format == "json":
        file_path = reports.get("json_path")
        filename = f"cafre_report_{job_id}.json"
        media_type = "application/json"
    else:
        file_path = reports.get("md_path")
        filename = f"cafre_report_{job_id}.md"
        media_type = "text/markdown"

    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Report file not found on server disk.")

    return FileResponse(
        path=file_path,
        filename=filename,
        media_type=media_type
    )


# Mount static frontend files
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.app:app", host="127.0.0.1", port=8000, reload=True)

