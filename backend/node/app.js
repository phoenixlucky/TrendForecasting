import express from "express";
import cors from "cors";
import forecastRouter from "./routes/forecast.js";
import modelsRouter from "./routes/models.js";
import dataSourceRouter from "./routes/dataSource.js";

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/forecast", forecastRouter);
app.use("/api/models", modelsRouter);
app.use("/api/data", dataSourceRouter);

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ detail: err.message || "Server Error" });
});

app.listen(port, () => {
  console.log(`Node gateway listening at http://localhost:${port}`);
});
