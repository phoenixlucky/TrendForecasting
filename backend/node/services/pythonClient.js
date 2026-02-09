import axios from "axios";

const pythonBaseURL = process.env.PYTHON_API || "http://localhost:8000";

const client = axios.create({
  baseURL: pythonBaseURL,
  timeout: 60000
});

export async function requestForecast(payload) {
  try {
    const { data } = await client.post("/forecast", payload);
    return data;
  } catch (error) {
    const detail = error?.response?.data?.detail || "Python 服务调用失败";
    const wrapped = new Error(detail);
    wrapped.status = 502;
    throw wrapped;
  }
}

export async function requestModelStatus() {
  try {
    const { data } = await client.get("/models/status");
    return data;
  } catch (error) {
    const detail = error?.response?.data?.detail || "获取模型状态失败";
    const wrapped = new Error(detail);
    wrapped.status = 502;
    throw wrapped;
  }
}

export async function requestInstallModel(payload) {
  try {
    const { data } = await client.post("/models/install", payload);
    return data;
  } catch (error) {
    const detail = error?.response?.data?.detail || "模型安装失败";
    const wrapped = new Error(detail);
    wrapped.status = error?.response?.status || 502;
    throw wrapped;
  }
}

export async function requestSqliteSource(payload) {
  try {
    const { data } = await client.post("/source/sqlite", payload);
    return data;
  } catch (error) {
    const detail = error?.response?.data?.detail || "数据库读取失败";
    const wrapped = new Error(detail);
    wrapped.status = error?.response?.status || 502;
    throw wrapped;
  }
}
