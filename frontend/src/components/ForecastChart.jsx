import ReactECharts from "echarts-for-react";

const MODEL_NAME_MAP = {
  prophet: "Prophet",
  ets: "ETS",
  sarima: "SARIMA",
  tbats: "TBATS",
  neuralprophet: "NeuralProphet",
  orbit: "Orbit"
};

const MODEL_COLORS = ["#ef6c00", "#2e7d32", "#6a1b9a", "#00838f", "#ad1457", "#5d4037"];

function ForecastChart({ result, precision = 0, selectedModels = ["prophet"], chartTitle = "" }) {
  if (!result) {
    return <div className="empty-chart">暂无结果，请先上传并预测</div>;
  }

  const history = result.history || [];
  const historyDateSet = new Set(history.map((item) => item.date));
  const forecastsByModel = result.forecastsByModel || {};
  const activeModels = selectedModels.filter((model) => Array.isArray(forecastsByModel[model]));
  const primaryModel = result.primaryModel || activeModels[0] || "prophet";
  const axisModel = activeModels[0] || primaryModel;
  const axisForecast = forecastsByModel[axisModel] || forecastsByModel[primaryModel] || result.forecast || [];
  const xData = axisForecast.map((item) => item.date);

  const historyMap = new Map(history.map((item) => [item.date, item.value]));
  const historySeries = xData.map((d) => historyMap.get(d) ?? null);

  const modelSeries = activeModels.map((model, index) => {
    const modelMap = new Map((forecastsByModel[model] || []).map((item) => [item.date, item.yhat]));
    const modelData = xData.map((date) => {
      if (model === "sarima" && historyDateSet.has(date)) {
        return null;
      }
      return modelMap.get(date) ?? null;
    });
    return {
      name: `${MODEL_NAME_MAP[model] || model} 预测`,
      type: "line",
      smooth: true,
      data: modelData,
      symbol: "none",
      lineStyle: {
        width: 2,
        type: model === primaryModel ? "dashed" : "solid",
        color: MODEL_COLORS[index % MODEL_COLORS.length]
      }
    };
  });

  const series = [
    {
      name: "历史值",
      type: "line",
      smooth: true,
      data: historySeries,
      symbol: "none",
      lineStyle: { width: 2, color: "#1f78b4" }
    },
    ...modelSeries
  ];

  const option = {
    title: {
      text: chartTitle || "结果图表",
      left: "center",
      top: 0,
      textStyle: {
        fontSize: 14,
        fontWeight: 600
      }
    },
    tooltip: {
      trigger: "axis",
      valueFormatter: (value) => {
        if (value === null || value === undefined || value === "-" || !Number.isFinite(Number(value))) {
          return "-";
        }
        return Number(value).toFixed(precision);
      }
    },
    legend: {
      top: 28,
      data: series.map((s) => s.name)
    },
    grid: { left: 72, right: 24, top: 64, bottom: 35, containLabel: true },
    xAxis: {
      type: "category",
      data: xData
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: {
        formatter: (value) => (Number.isFinite(Number(value)) ? Number(value).toFixed(precision) : "-")
      }
    },
    series
  };

  return <ReactECharts style={{ height: 520 }} option={option} notMerge />;
}

export default ForecastChart;
