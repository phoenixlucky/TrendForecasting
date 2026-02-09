import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, InputNumber, Row, Select, Space, Tag, Typography, message } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import UploadPanel from "./components/UploadPanel";
import ForecastChart from "./components/ForecastChart";
import { forecast, getModelStatus, installModel } from "./services/api";
import { buildForecastWorkbook, buildTemplateWorkbook } from "./utils/excel";

const { Title, Paragraph } = Typography;
const MODEL_OPTIONS = [
  { label: "Prophet", value: "prophet" },
  { label: "ETS", value: "ets" },
  { label: "SARIMA", value: "sarima" },
  { label: "TBATS", value: "tbats" },
  { label: "NeuralProphet", value: "neuralprophet" },
  { label: "Orbit", value: "orbit" }
];

function median(values) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function sanitizeModelForecast(modelRows, historyRows) {
  const numericHistory = historyRows.map((item) => item.value).filter((value) => Number.isFinite(value));
  if (!numericHistory.length) {
    return { rows: modelRows, removed: 0 };
  }

  const histMin = Math.min(...numericHistory);
  const histMax = Math.max(...numericHistory);
  const histRange = Math.max(histMax - histMin, Math.abs(histMax), 1);
  const lowerBound = histMin - histRange * 3;
  const upperBound = histMax + histRange * 3;

  const yhatValues = modelRows.map((item) => item.yhat).filter((value) => Number.isFinite(value));
  const jumps = [];
  for (let i = 1; i < yhatValues.length; i += 1) {
    jumps.push(Math.abs(yhatValues[i] - yhatValues[i - 1]));
  }
  const jumpBaseline = Math.max(median(jumps), histRange * 0.02, 1e-6);

  let removed = 0;
  let lastValid = numericHistory[numericHistory.length - 1];
  const rows = modelRows.map((item) => {
    const value = item.yhat;
    if (!Number.isFinite(value)) {
      removed += 1;
      return { ...item, yhat: null, yhat_lower: null, yhat_upper: null };
    }
    const jump = Math.abs(value - lastValid);
    const isOutOfRange = value < lowerBound || value > upperBound;
    const isSharpSpike = jump > jumpBaseline * 8 && jump > histRange * 0.5;
    if (isOutOfRange || isSharpSpike) {
      removed += 1;
      return { ...item, yhat: null, yhat_lower: null, yhat_upper: null };
    }
    lastValid = value;
    return item;
  });

  return { rows, removed };
}

function App() {
  const [rows, setRows] = useState([]);
  const [precision, setPrecision] = useState(0);
  const [periods, setPeriods] = useState(30);
  const [selectedModels, setSelectedModels] = useState(["prophet"]);
  const [modelStatus, setModelStatus] = useState({ prophet: true });
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [installingModel, setInstallingModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const canPredict = useMemo(() => rows.length > 2, [rows]);
  const installedModels = useMemo(
    () => MODEL_OPTIONS.filter((item) => modelStatus[item.value]).map((item) => item.value),
    [modelStatus]
  );

  const syncSelectedModels = (nextStatus) => {
    const installed = MODEL_OPTIONS.filter((item) => nextStatus[item.value]).map((item) => item.value);
    setSelectedModels((prev) => {
      const filtered = prev.filter((item) => installed.includes(item));
      if (filtered.length) {
        return filtered;
      }
      if (installed.includes("prophet")) {
        return ["prophet"];
      }
      return installed.length ? [installed[0]] : ["prophet"];
    });
  };

  const loadModelStatus = async () => {
    setLoadingStatus(true);
    try {
      const data = await getModelStatus();
      const nextStatus = data?.models || {};
      setModelStatus(nextStatus);
      syncSelectedModels(nextStatus);
    } catch (error) {
      const detail = error?.response?.data?.detail || error.message || "获取模型状态失败";
      message.error(detail);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    loadModelStatus();
  }, []);

  const roundValue = (value) => {
    if (!Number.isFinite(value)) {
      return value;
    }
    return Number(value.toFixed(precision));
  };

  const handleValidRows = (validRows, parsedPrecision) => {
    setRows(validRows);
    setPrecision(parsedPrecision || 0);
    setResult(null);
  };

  const handlePredict = async () => {
    if (!canPredict) {
      message.warning("请至少上传 3 条有效数据");
      return;
    }
    const unavailable = selectedModels.filter((model) => !modelStatus[model]);
    if (unavailable.length) {
      message.warning(`请先安装模型: ${unavailable.join(", ")}`);
      return;
    }
    setLoading(true);
    try {
      const data = await forecast({ rows, periods, models: selectedModels });
      const historyDateSet = new Set(rows.map((item) => item.date));
      const rawForecastMap = data.forecasts_by_model || {};
      let removedPoints = 0;
      const normalizedByModel = Object.fromEntries(
        Object.entries(rawForecastMap).map(([model, modelRows]) => [
          model,
          (() => {
            const roundedRows = (modelRows || []).map((item) => ({
              date: item.date,
              yhat: roundValue(item.yhat),
              yhat_lower: roundValue(item.yhat_lower),
              yhat_upper: roundValue(item.yhat_upper)
            }));
            const sanitized = sanitizeModelForecast(roundedRows, rows);
            removedPoints += sanitized.removed;
            return sanitized.rows;
          })()
        ])
      );
      const primaryModel = data.primary_model || selectedModels[0];
      const primaryForecast = normalizedByModel[primaryModel] || [];
      const predictedRows = primaryForecast.filter((item) => !historyDateSet.has(item.date));
      const failedModels = data.failed_models || {};

      setResult({
        history: rows,
        forecast: primaryForecast,
        primaryModel,
        forecastsByModel: normalizedByModel,
        failedModels,
        predictedRows
      });

      if (Object.keys(failedModels).length) {
        message.warning("部分模型未成功运行，已返回可用结果");
      }
      if (removedPoints > 0) {
        message.info(`已移除 ${removedPoints} 个明显异常预测点`);
      }
      message.success("预测完成");
    } catch (error) {
      const detail = error?.response?.data?.detail || error.message || "预测失败";
      message.error(detail);
    } finally {
      setLoading(false);
    }
  };

  const downloadForecast = () => {
    if (!result?.predictedRows?.length) {
      message.warning("暂无可下载的预测数据");
      return;
    }
    const modelKeys = Object.keys(result.forecastsByModel || {});
    const futureDates = [...new Set(result.predictedRows.map((item) => item.date))].sort();
    const exportRows = futureDates.map((date) => {
      const row = { date };
      for (const model of modelKeys) {
        const modelMap = new Map((result.forecastsByModel[model] || []).map((item) => [item.date, item.yhat]));
        row[model] = modelMap.get(date) ?? "";
      }
      return row;
    });

    const workbookBlob = buildForecastWorkbook(exportRows);
    const url = URL.createObjectURL(workbookBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "forecast-result.xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadTemplate = () => {
    const workbookBlob = buildTemplateWorkbook();
    const url = URL.createObjectURL(workbookBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "excel-template.xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleInstallModel = async (model) => {
    setInstallingModel(model);
    try {
      const data = await installModel(model);
      message.success(data?.detail || `${model} 安装成功`);
      await loadModelStatus();
    } catch (error) {
      const detail = error?.response?.data?.detail || error.message || "模型安装失败";
      message.error(detail);
    } finally {
      setInstallingModel("");
    }
  };

  return (
    <div className="page-wrap">
      <div className="backdrop" />
      <div className="page-content">
        <Title level={2}>业务趋势预测工作台</Title>
        <Paragraph>
          上传标准 Excel，系统会自动完成数据校验，并支持 Prophet、ETS、SARIMA、TBATS、NeuralProphet、Orbit 多模型预测对比。
        </Paragraph>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={8}>
            <Card title="1) 数据准备" className="panel-card prep-card">
              <Space direction="vertical" style={{ width: "100%" }} size="middle">
                <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>
                  下载标准模板
                </Button>
                <UploadPanel onValidRows={handleValidRows} />
                <Space>
                  预测天数:
                  <InputNumber min={1} max={365} value={periods} onChange={(v) => setPeriods(v || 30)} />
                </Space>
                <Space direction="vertical" style={{ width: "100%" }} size={6}>
                  <Button type="primary" loading={loading} onClick={handlePredict}>
                    开始预测
                  </Button>
                </Space>
                <Space direction="vertical" style={{ width: "100%" }} size={6}>
                  <span>模型选择:</span>
                  <Select
                    mode="multiple"
                    value={selectedModels}
                    options={MODEL_OPTIONS.map((item) => ({
                      ...item,
                      disabled: !modelStatus[item.value]
                    }))}
                    maxTagCount="responsive"
                    onChange={(vals) => setSelectedModels(vals.length ? vals : (installedModels.length ? [installedModels[0]] : ["prophet"]))}
                    style={{ width: "100%" }}
                  />
                </Space>
                <Space direction="vertical" style={{ width: "100%" }} size={6}>
                  <span>模型安装状态:</span>
                  {MODEL_OPTIONS.map((item) => {
                    const installed = !!modelStatus[item.value];
                    return (
                      <Space key={item.value} style={{ justifyContent: "space-between", width: "100%" }}>
                        <Space size={8}>
                          <span>{item.label}</span>
                          {installed ? <Tag color="success">已安装</Tag> : <Tag color="default">未安装</Tag>}
                        </Space>
                        {!installed && (
                          <Button
                            size="small"
                            type="link"
                            loading={installingModel === item.value}
                            onClick={() => handleInstallModel(item.value)}
                          >
                            安装
                          </Button>
                        )}
                      </Space>
                    );
                  })}
                  {loadingStatus && <span>正在刷新模型状态...</span>}
                </Space>
                {result?.failedModels && Object.keys(result.failedModels).length > 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    message={`失败模型: ${Object.entries(result.failedModels)
                      .map(([name, reason]) => `${name} (${reason})`)
                      .join("; ")}`}
                  />
                )}
              </Space>
            </Card>
          </Col>

          <Col xs={24} lg={16}>
            <Card
              title="2) 结果图表"
              className="panel-card"
              extra={
                <Button icon={<DownloadOutlined />} onClick={downloadForecast} disabled={!result?.predictedRows?.length}>
                  下载预测对比数据
                </Button>
              }
            >
              <ForecastChart result={result} precision={precision} selectedModels={selectedModels} />
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
}

export default App;
