import ReactECharts from "echarts-for-react";

function ForecastChart({ result, precision = 0 }) {
  if (!result) {
    return <div className="empty-chart">暂无结果，请先上传并预测</div>;
  }

  const history = result.history || [];
  const forecast = result.forecast || [];
  const xData = forecast.map((item) => item.date);

  const historyMap = new Map(history.map((item) => [item.date, item.value]));
  const yhat = forecast.map((item) => item.yhat);
  const yLower = forecast.map((item) => item.yhat_lower);
  const bandDiff = forecast.map((item) => item.yhat_upper - item.yhat_lower);
  const historySeries = xData.map((d) => historyMap.get(d) ?? null);

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
      data: ["历史值", "预测趋势", "置信区间"]
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
    series: [
      {
        name: "历史值",
        type: "line",
        smooth: true,
        data: historySeries,
        symbol: "none",
        lineStyle: { width: 2, color: "#1f78b4" }
      },
      {
        name: "预测趋势",
        type: "line",
        smooth: true,
        data: yhat,
        symbol: "none",
        lineStyle: { width: 2, type: "dashed", color: "#ef6c00" }
      },
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
    ]
  };

  return <ReactECharts style={{ height: 520 }} option={option} />;
}

export default ForecastChart;
