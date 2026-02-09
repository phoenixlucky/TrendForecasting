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
