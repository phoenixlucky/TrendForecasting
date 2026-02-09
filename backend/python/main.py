from importlib.util import find_spec
import subprocess
import sys
from threading import Lock

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from prophet_service import SUPPORTED_MODELS, run_forecast


app = FastAPI(title="Prophet Forecast Service")

INSTALL_LOCK = Lock()
MODEL_PACKAGES = {
    "prophet": ["prophet==1.1.5"],
    "ets": ["statsmodels==0.14.4"],
    "sarima": ["statsmodels==0.14.4"],
    "tbats": ["tbats==1.1.3"],
    "neuralprophet": ["neuralprophet==0.9.0"],
    "orbit": ["orbit-ml==1.1.4.9"],
}
MODEL_IMPORTS = {
    "prophet": ["prophet"],
    "ets": ["statsmodels"],
    "sarima": ["statsmodels"],
    "tbats": ["tbats"],
    "neuralprophet": ["neuralprophet"],
    "orbit": ["orbit"],
}


class DataRow(BaseModel):
    date: str
    value: float


class ForecastRequest(BaseModel):
    rows: list[DataRow] = Field(min_length=3)
    periods: int = Field(default=30, ge=1, le=365)
    models: list[str] = Field(default_factory=lambda: ["prophet"], min_length=1)


class InstallModelRequest(BaseModel):
    model: str


def _is_model_installed(model: str) -> bool:
    imports = MODEL_IMPORTS.get(model, [])
    return bool(imports) and all(find_spec(module_name) is not None for module_name in imports)


def _model_status() -> dict[str, bool]:
    return {model: _is_model_installed(model) for model in SUPPORTED_MODELS}


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/models/status")
def models_status():
    return {"models": _model_status()}


@app.post("/models/install")
def install_model(payload: InstallModelRequest):
    model = payload.model.lower().strip()
    if model not in SUPPORTED_MODELS:
        raise HTTPException(status_code=400, detail=f"不支持的模型: {model}")

    if _is_model_installed(model):
        return {"ok": True, "model": model, "installed": True, "detail": "模型已安装"}

    packages = MODEL_PACKAGES.get(model)
    if not packages:
        raise HTTPException(status_code=400, detail=f"模型无安装定义: {model}")

    if not INSTALL_LOCK.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="当前有模型正在安装，请稍后重试")

    try:
        command = [sys.executable, "-m", "pip", "install", *packages]
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            detail = result.stderr.strip() or result.stdout.strip() or "安装失败"
            raise HTTPException(status_code=500, detail=f"安装失败: {detail}")

        installed = _is_model_installed(model)
        if not installed:
            raise HTTPException(status_code=500, detail="安装命令执行成功，但模型未能识别为已安装")

        return {"ok": True, "model": model, "installed": True, "detail": "安装成功"}
    finally:
        INSTALL_LOCK.release()


@app.post("/forecast")
def forecast(payload: ForecastRequest):
    try:
        rows = [{"date": row.date, "value": row.value} for row in payload.rows]
        models = [model.lower() for model in payload.models]
        invalid = [model for model in models if model not in SUPPORTED_MODELS]
        if invalid:
            raise ValueError(f"不支持的模型: {', '.join(invalid)}")
        return run_forecast(rows=rows, periods=payload.periods, models=models)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"预测失败: {exc}") from exc
