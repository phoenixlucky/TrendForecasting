# TrendForecasting

Excel -> Prophet 趋势预测 -> 图表展示 的 npm Web 工具示例。

## 目录

- `frontend`：React + Vite + ECharts + Ant Design
- `backend/node`：Express 网关，负责校验并转发到 Python
- `backend/python`：FastAPI + Prophet 预测服务
- `docs`：模板说明与示例模板

## 快速启动

1. 安装 Node 依赖

```bash
npm install
npm install --prefix frontend
npm install --prefix backend/node
```

2. 创建 conda 环境（推荐）

```bash
conda env create -f backend/python/environment.yml
```

如果你已经创建过环境，可执行：

```bash
npm run py:install
```

说明：`requirements.txt` 已固定 `numpy<2` 和 `prophet==1.1.5`，避免 Windows 下的 Prophet 兼容性问题。

3. 一键启动前端 + Node + Python

```bash
npm run dev
```

在项目根目录执行，默认服务端口：

- 前端：`http://localhost:5173`
- Node 网关：`http://localhost:3001`
- Python 预测服务：`http://localhost:8001`

说明：`npm run dev` 中的 Python 服务默认不启用 `--reload`，避免扫描整个项目目录导致的 Windows 路径问题；如需 Python 热重载，可单独执行 `npm run py:dev`。

4. 若你希望单独启动，也可以分别执行：

启动 Python 预测服务：

```bash
conda activate trend-forecasting-py
cd backend/python
uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

启动 Node 网关服务：

```bash
npm run dev --prefix backend/node
```

启动前端：

```bash
npm run dev --prefix frontend
```

## 常见问题

- 如果出现 `Prophet object has no attribute stan_backend`，先执行：

```bash
npm run py:install
```

- Windows 下停止一键启动时，建议在 PowerShell 里按 `Ctrl+C` 一次；当前脚本已去掉嵌套 `npm run`，避免卡在 `Terminate batch job (Y/N)`。

## API 约定

- 前端调用：`POST /api/forecast`
- 请求体：

```json
{
  "rows": [{ "date": "2023-01-01", "value": 120 }],
  "periods": 30
}
```

- 返回体包含：
  - `history`: 原始数据（date/value）
  - `forecast`: 预测结果（date/yhat/yhat_lower/yhat_upper）
