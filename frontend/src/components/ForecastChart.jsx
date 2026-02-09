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

function ForecastChart({ result, precision = 0, selectedModels = ["prophet"] }) {
  if (!result) {
    return <div className="empty-chart">暂无结果，请先上传并预测</div>;
  }

  const history = result.history || [];
  const forecastsByModel = result.forecastsByModel || {};
  const activeModels = selectedModels.filter((model) => Array.isArray(forecastsByModel[model]));
  const primaryModel = result.primaryModel || activeModels[0] || "prophet";
  const primaryForecast = forecastsByModel[primaryModel] || result.forecast || [];
  const xData = primaryForecast.map((item) => item.date);

  const historyMap = new Map(history.map((item) => [item.date, item.value]));
  const yLower = primaryForecast.map((item) => item.yhat_lower);
  const bandDiff = primaryForecast.map((item) => item.yhat_upper - item.yhat_lower);
  const historySeries = xData.map((d) => historyMap.get(d) ?? null);

  const modelSeries = activeModels.map((model, index) => {
    const modelMap = new Map((forecastsByModel[model] || []).map((item) => [item.date, item.yhat]));
    return {
      name: `${MODEL_NAME_MAP[model] || model} 预测`,
      type: "line",
      smooth: true,
      data: xData.map((date) => modelMap.get(date) ?? null),
      symbol: "none",
      lineStyle: {
        width: 2,
        type: model === primaryModel ? "dashed" : "solid",
        color: MODEL_COLORS[index % MODEL_COLORS.length]
      }
    };
  });

  const showBand = activeModels.length <= 1;

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

  if (showBand) {
    series.push(
      {
        name: "区间下界",
        type: "line",
        stack: "ci",
        data: yLower,
        symbol: "none",
        lineStyle: { opacity: 0 },
        areaStyle: { opacity: 0 }
      },
      {
        name: "置信区间",
        type: "line",
        stack: "ci",
        data: bandDiff,
        symbol: "none",
        lineStyle: { opacity: 0 },
        areaStyle: {
          color: "rgba(239, 108, 0, 0.2)"
        }
      }
    );
  }

  const option = {
    tooltip: {
      trigger: "axis",
      valueFormatter: (value) => {
        if (value === null || value === undefined || value === "-") {
          return "-";
        }
        return Number(value).toFixed(precision);
      }
    },
    legend: {
      top: 0,
      data: series.filter((s) => s.name !== "区间下界").map((s) => s.name)
    },
    grid: { left: 72, right: 24, top: 40, bottom: 35, containLabel: true },
    xAxis: {
      type: "category",
      data: xData
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: {
        formatter: (value) => Number(value).toFixed(precision)
      }
    },
    series
  };

  return <ReactECharts style={{ height: 520 }} option={option} />;
}

export default ForecastChart;
