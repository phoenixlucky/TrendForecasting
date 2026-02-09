import * as XLSX from "xlsx";
import dayjs from "dayjs";

const REQUIRED_HEADERS = ["date", "value"];

function countDecimalPlaces(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const text = String(value).toLowerCase();
  if (text.includes("e-")) {
    const [base, expText] = text.split("e-");
    const exponent = Number(expText) || 0;
    const decimals = base.includes(".") ? base.split(".")[1].length : 0;
    return decimals + exponent;
  }
  return text.includes(".") ? text.split(".")[1].length : 0;
}

function normalizeCell(cell) {
  if (cell === null || cell === undefined) {
    return "";
  }
  return String(cell).trim();
}

function parseDateCell(cell) {
  if (cell === null || cell === undefined || cell === "") {
    return null;
  }

  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return dayjs(cell).format("YYYY-MM-DD");
  }

  if (typeof cell === "number") {
    const parsed = XLSX.SSF.parse_date_code(cell);
    if (!parsed) {
      return null;
    }
    const utcDate = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    return dayjs(utcDate).format("YYYY-MM-DD");
  }

  const text = normalizeCell(cell).replace(/\//g, "-");
  if (!text) {
    return null;
  }

  const parsed = dayjs(text);
  if (!parsed.isValid()) {
    return null;
  }
  return parsed.format("YYYY-MM-DD");
}

function parseValueCell(cell) {
  if (cell === null || cell === undefined) {
    return null;
  }
  const text = normalizeCell(cell);
  if (text === "") {
    return null;
  }

  const value = typeof cell === "number" ? cell : Number(text.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

export async function parseExcelRows(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("未读取到工作表");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (!rows.length) {
    throw new Error("Excel 没有可用数据");
  }

  const firstRow = rows[0];
  const headers = Object.keys(firstRow).map((h) => normalizeCell(h).toLowerCase());
  const hasAllHeaders = REQUIRED_HEADERS.every((h) => headers.includes(h));
  if (!hasAllHeaders) {
    throw new Error("表头必须包含 date 和 value");
  }

  const cleaned = rows
    .map((row) => {
      const dateCell = row.date ?? row.Date ?? row.DATE;
      const valueCell = row.value ?? row.Value ?? row.VALUE;
      const date = parseDateCell(dateCell);
      const value = parseValueCell(valueCell);

      if (!date || value === null) {
        return null;
      }
      return { date, value };
    })
    .filter(Boolean)
    .sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf());

  if (!cleaned.length) {
    throw new Error("没有有效行，请检查日期和数值格式");
  }

  const precision = cleaned.reduce((max, item) => Math.max(max, countDecimalPlaces(item.value)), 0);

  return { rows: cleaned, totalRows: rows.length, precision };
}

export function buildTemplateWorkbook() {
  const templateRows = [
    { date: "2023-01-01", value: 120 },
    { date: "2023-01-02", value: 132 }
  ];
  const worksheet = XLSX.utils.json_to_sheet(templateRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
  const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

export function buildForecastWorkbook(forecastRows) {
  const worksheet = XLSX.utils.json_to_sheet(forecastRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Forecast");
  const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}
