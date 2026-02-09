import { useMemo, useState } from "react";
import { Alert, Button, Card, Col, InputNumber, Row, Select, Space, Typography, message } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import UploadPanel from "./components/UploadPanel";
import ForecastChart from "./components/ForecastChart";
import { forecast } from "./services/api";
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

function App() {
  const [rows, setRows] = useState([]);
  const [precision, setPrecision] = useState(0);
  const [periods, setPeriods] = useState(30);
  const [selectedModels, setSelectedModels] = useState(["prophet"]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const canPredict = useMemo(() => rows.length > 2, [rows]);

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
    setLoading(true);
    try {
      const data = await forecast({ rows, periods, models: selectedModels });
      const historyDateSet = new Set(rows.map((item) => item.date));
      const rawForecastMap = data.forecasts_by_model || {};
      const normalizedByModel = Object.fromEntries(
        Object.entries(rawForecastMap).map(([model, modelRows]) => [
          model,
          (modelRows || []).map((item) => ({
            date: item.date,
            yhat: roundValue(item.yhat),
            yhat_lower: roundValue(item.yhat_lower),
            yhat_upper: roundValue(item.yhat_upper)
          }))
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
                  <span>模型选择:</span>
                  <Select
                    mode="multiple"
                    value={selectedModels}
                    options={MODEL_OPTIONS}
                    maxTagCount="responsive"
                    onChange={(vals) => setSelectedModels(vals.length ? vals : ["prophet"])}
                    style={{ width: "100%" }}
                  />
                </Space>
                <Space>
                  <Button type="primary" loading={loading} onClick={handlePredict}>
                    开始预测
                  </Button>
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
