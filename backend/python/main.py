from importlib.util import find_spec
import math
import re
import sqlite3
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


class SqliteSourceRequest(BaseModel):
    db_path: str
    table: str = Field(default="")
    date_column: str = Field(default="date")
    value_column: str = Field(default="value")
    sql: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    limit: int = Field(default=5000, ge=1, le=50000)


def _is_model_installed(model: str) -> bool:
    imports = MODEL_IMPORTS.get(model, [])
    return bool(imports) and all(find_spec(module_name) is not None for module_name in imports)


def _model_status() -> dict[str, bool]:
    return {model: _is_model_installed(model) for model in SUPPORTED_MODELS}


def _is_safe_identifier(text: str) -> bool:
    return re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", text) is not None


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


@app.post("/source/sqlite")
def load_sqlite_source(payload: SqliteSourceRequest):
    table = payload.table.strip()
    date_column = payload.date_column.strip()
    value_column = payload.value_column.strip()
    params: list[object] = []
    custom_sql = (payload.sql or "").strip()
    if custom_sql:
        lowered_sql = custom_sql.lower()
        if not lowered_sql.startswith("select"):
            raise HTTPException(status_code=400, detail="SQL 仅支持 SELECT 查询")
        if ";" in custom_sql:
            raise HTTPException(status_code=400, detail="SQL 不允许包含分号")
        query = f"SELECT date, value FROM ({custom_sql}) AS subq LIMIT ?"
        params.append(payload.limit)
    else:
        if not table:
            raise HTTPException(status_code=400, detail="table 不能为空，或填写 SQL 查询")
        if not _is_safe_identifier(table) or not _is_safe_identifier(date_column) or not _is_safe_identifier(value_column):
            raise HTTPException(status_code=400, detail="表名和列名只能包含字母、数字、下划线，且不能数字开头")

        where_clauses: list[str] = []
        if payload.start_date:
            where_clauses.append(f'"{date_column}" >= ?')
            params.append(payload.start_date)
        if payload.end_date:
            where_clauses.append(f'"{date_column}" <= ?')
            params.append(payload.end_date)

        where_sql = f" WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        query = (
            f'SELECT "{date_column}" AS date, "{value_column}" AS value '
            f'FROM "{table}"{where_sql} ORDER BY "{date_column}" ASC LIMIT ?'
        )
        params.append(payload.limit)

    try:
        with sqlite3.connect(payload.db_path) as connection:
            cursor = connection.cursor()
            cursor.execute(query, params)
            raw_rows = cursor.fetchall()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"数据库读取失败: {exc}") from exc

    rows: list[dict] = []
    precision = 0
    for raw_date, raw_value in raw_rows:
        try:
            value = float(raw_value)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(value):
            continue
        date_text = str(raw_date).strip()[:10]
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_text):
            continue
        decimals = 0
        text = str(raw_value)
        if "." in text:
            decimals = len(text.split(".", maxsplit=1)[1].rstrip("0"))
        precision = max(precision, decimals)
        rows.append({"date": date_text, "value": value})

    if len(rows) < 3:
        raise HTTPException(status_code=400, detail="数据库有效数据不足 3 条，请检查字段映射和数据格式")

    return {"rows": rows, "total_rows": len(raw_rows), "valid_rows": len(rows), "precision": precision}


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
