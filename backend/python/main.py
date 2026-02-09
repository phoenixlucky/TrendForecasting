from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from prophet_service import SUPPORTED_MODELS, run_forecast


app = FastAPI(title="Prophet Forecast Service")


class DataRow(BaseModel):
    date: str
    value: float


class ForecastRequest(BaseModel):
    rows: list[DataRow] = Field(min_length=3)
    periods: int = Field(default=30, ge=1, le=365)
    models: list[str] = Field(default_factory=lambda: ["prophet"], min_length=1)


@app.get("/health")
def health():
    return {"ok": True}


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
