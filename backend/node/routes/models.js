import express from "express";
import { requestInstallModel, requestModelStatus } from "../services/pythonClient.js";

const router = express.Router();

router.get("/status", async (_req, res, next) => {
  try {
    const data = await requestModelStatus();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post("/install", async (req, res, next) => {
  try {
    const model = String(req.body?.model || "").toLowerCase().trim();
    if (!model) {
      return res.status(400).json({ detail: "model 不能为空" });
    }
    const data = await requestInstallModel({ model });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

export default router;
