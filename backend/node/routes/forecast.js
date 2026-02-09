import express from "express";
import dayjs from "dayjs";
import { requestForecast } from "../services/pythonClient.js";

const router = express.Router();

function isValidRow(row) {
  if (!row || typeof row !== "object") {
    return false;
  }
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(row.date) && dayjs(row.date).isValid();
  return validDate && typeof row.value === "number" && Number.isFinite(row.value);
}

router.post("/", async (req, res, next) => {
  try {
    const { rows, periods = 30 } = req.body || {};

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

    const sortedRows = [...rows].sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf());
    const data = await requestForecast({ rows: sortedRows, periods });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

export default router;
