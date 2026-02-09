import { useMemo, useState } from "react";
import { Button, Card, Col, InputNumber, Row, Space, Typography, message } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import UploadPanel from "./components/UploadPanel";
import ForecastChart from "./components/ForecastChart";
import { forecast } from "./services/api";
import { buildForecastWorkbook, buildTemplateWorkbook } from "./utils/excel";

const { Title, Paragraph } = Typography;

function App() {
  const [rows, setRows] = useState([]);
  const [precision, setPrecision] = useState(0);
  const [periods, setPeriods] = useState(30);
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
      const data = await forecast({ rows, periods });
      const historyDateSet = new Set(rows.map((item) => item.date));
      const normalizedForecast = (data.forecast || []).map((item) => ({
        date: item.date,
        yhat: roundValue(item.yhat),
        yhat_lower: roundValue(item.yhat_lower),
        yhat_upper: roundValue(item.yhat_upper)
      }));
      const predictedRows = normalizedForecast.filter((item) => !historyDateSet.has(item.date));
      setResult({ history: rows, forecast: normalizedForecast, predictedRows });
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
    const workbookBlob = buildForecastWorkbook(result.predictedRows);
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
          上传标准 Excel，系统会自动完成数据校验、Prophet 预测并展示趋势和置信区间。
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
                  <Button type="primary" loading={loading} onClick={handlePredict}>
                    开始预测
                  </Button>
                </Space>
              </Space>
            </Card>
          </Col>

          <Col xs={24} lg={16}>
            <Card
              title="2) 结果图表"
              className="panel-card"
              extra={
                <Button icon={<DownloadOutlined />} onClick={downloadForecast} disabled={!result?.predictedRows?.length}>
                  下载预测数据
                </Button>
              }
            >
              <ForecastChart result={result} precision={precision} />
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
}

export default App;
