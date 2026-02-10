# TrendForecasting

Excel / SQLite / MySQL 数据库 -> 趋势预测 -> 图表展示 的 npm Web 工具示例。

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

说明：环境初始化默认仅安装 `prophet`（以及服务运行基础依赖），其余模型可在前端按需点击安装。

3. 一键启动前端 + Node + Python

```bash
npm run dev
```

Windows 也可以直接双击根目录下的 `start-dev.bat` 一键启动（会自动检查并安装 Node 依赖后再启动）。

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

## 模型说明

- `prophet`：适合带趋势和节假日/季节性的业务时间序列，配置简单，解释性较好。
- `ets`：指数平滑模型（Error-Trend-Seasonality），对短期平稳趋势预测很常用，训练速度快。
- `sarima`：季节性 ARIMA，擅长处理自相关和季节性结构明显的序列。
- `tbats`：适合复杂季节性（如多重季节周期）场景，对波动型业务序列更灵活。
- `neuralprophet`：在 Prophet 思路上引入神经网络能力，能更好拟合非线性模式。
- `orbit`：Bayesian 时序框架（这里用 DLT），在趋势建模与不确定性表达方面比较现代化。

### 模型大小与资源开销（经验值）

这里的“大小”主要指依赖体积、内存占用和训练耗时的综合感受（同样数据量下）：

| 模型 | 体量级别 | 训练耗时 | 内存占用 | 说明 |
| --- | --- | --- | --- | --- |
| `ets` | 小 | 快 | 低 | 轻量级统计模型，适合快速基线 |
| `sarima` | 小-中 | 中 | 低-中 | 参数搜索时耗时会上升 |
| `prophet` | 中 | 中 | 中 | 依赖 Stan，稳定但不算最轻 |
| `tbats` | 中-大 | 中-慢 | 中 | 复杂季节性能力强，代价更高 |
| `orbit` | 中-大 | 中-慢 | 中-高 | 贝叶斯建模更灵活，计算开销更大 |
| `neuralprophet` | 大 | 慢 | 高 | 神经网络方案，对 CPU/内存更敏感 |

提示：

- 如果机器配置一般，建议先用 `ets`、`sarima`、`prophet` 做主流程。
- 多模型对比时可先跑轻量模型，再按需开启 `tbats` / `neuralprophet` / `orbit`。

建议：

- 数据量较小、追求稳定可解释：优先 `prophet`、`ets`、`sarima`。
- 季节性复杂或非线性明显：尝试 `tbats`、`neuralprophet`、`orbit`。
- 实际使用时建议多模型一起跑，用图表和误差指标共同判断。

## API 约定

- 前端调用：`POST /api/forecast`
- 数据源读取：`POST /api/data/sqlite`、`POST /api/data/mysql`
- 数据源连通性测试：`POST /api/data/sqlite/test`、`POST /api/data/mysql/test`
- 请求体：

```json
{
  "rows": [{ "date": "2023-01-01", "value": 120 }],
  "periods": 30,
  "models": ["prophet", "ets", "sarima"]
}
```

- 返回体包含：
  - `history`: 原始数据（date/value）
  - `forecast`: 主模型预测结果（date/yhat/yhat_lower/yhat_upper）
  - `forecasts_by_model`: 各模型预测结果
  - `failed_models`: 失败模型及原因

可选模型：`prophet`、`ets`、`sarima`、`tbats`、`neuralprophet`、`orbit`。

- 新增：`GET /api/models/status` 获取六个模型安装状态。
- 新增：`POST /api/models/install` 按模型名称执行安装。
- 新增：`POST /api/data/sqlite` 直连 SQLite 数据库读取 `date/value` 时序数据。
- 新增：`POST /api/data/mysql` 直连 MySQL 数据库读取 `date/value` 时序数据。
- 新增：SQLite / MySQL 均支持填写自定义 SQL（仅 `SELECT`，且结果需包含 `date`、`value` 两列）。
- 新增：前端可保存数据库连接配置（保存在浏览器 `localStorage`）。
- 新增：数据库面板支持「测试连接」按钮；填写 SQL 时 `table` 可留空。
- 新增：测试连接成功后自动保存当前配置；MySQL 密码不会写入本地保存项。
- 新增：数据库面板支持「一键启动」（读取数据并直接触发预测）。
- 新增：SQLite / MySQL 支持保存多套 SQL 连接配置，并可下拉切换与删除。
