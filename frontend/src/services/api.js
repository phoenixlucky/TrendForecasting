import axios from "axios";

const client = axios.create({
  baseURL: "/api",
  timeout: 30000
});

export async function forecast(payload) {
  const { data } = await client.post("/forecast", payload);
  return data;
}
