import axios from "axios";

const client = axios.create({
  baseURL: "/api",
  timeout: 30000
});

export async function forecast(payload) {
  const { data } = await client.post("/forecast", payload);
  return data;
}

export async function getModelStatus() {
  const { data } = await client.get("/models/status");
  return data;
}

export async function installModel(model) {
  const { data } = await client.post("/models/install", { model });
  return data;
}
