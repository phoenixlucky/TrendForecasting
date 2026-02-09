import express from "express";
import dayjs from "dayjs";
import { requestForecast } from "../services/pythonClient.js";

const router = express.Router();
const SUPPORTED_MODELS = ["prophet", "ets", "sarima", "tbats", "neuralprophet", "orbit"];

function isValidRow(row) {
  if (!row || typeof row !== "object") {
    return false;
  }
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(row.date) && dayjs(row.date).isValid();
  return validDate && typeof row.value === "number" && Number.isFinite(row.value);
}

router.post("/", async (req, res, next) => {
  try {
    const { rows, periods = 30, models = ["prophet"] } = req.body || {};

    if (!Array.isArray(rows) || rows.length < 3) {
      return res.status(400).json({ detail: "rows 至少 3 条" });
    }

    const invalid = rows.some((row) => !isValidRow(row));
    if (invalid) {
      return res.status(400).json({ detail: "rows 数据格式不正确" });
    }

    if (!Number.isInteger(periods) || periods < 1 || periods > 365) {
      return res.status(400).json({ detail: "periods 必须是 1-365 的整数" });
    }

    if (!Array.isArray(models) || models.length < 1) {
      return res.status(400).json({ detail: "models 至少选择 1 个" });
    }
    const normalizedModels = models.map((m) => String(m).toLowerCase());
    const invalidModels = normalizedModels.filter((m) => !SUPPORTED_MODELS.includes(m));
    if (invalidModels.length) {
      return res.status(400).json({ detail: `不支持的模型: ${invalidModels.join(", ")}` });
    }

    const sortedRows = [...rows].sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf());
    const data = await requestForecast({ rows: sortedRows, periods, models: normalizedModels });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

export default router;
