import express from "express";
import mysql from "mysql2/promise";
import { requestSqliteSource } from "../services/pythonClient.js";

const router = express.Router();

function isSafeIdentifier(text) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text);
}

function countDecimalPlaces(value) {
  const text = String(value ?? "").toLowerCase();
  if (!text || !Number.isFinite(Number(value))) {
    return 0;
  }
  if (text.includes("e-")) {
    const [base, expText] = text.split("e-");
    const exponent = Number(expText) || 0;
    const decimals = base.includes(".") ? base.split(".")[1].length : 0;
    return decimals + exponent;
  }
  return text.includes(".") ? text.split(".")[1].length : 0;
}

router.post("/sqlite", async (req, res, next) => {
  try {
    const {
      dbPath,
      table,
      dateColumn = "date",
      valueColumn = "value",
      sql,
      startDate,
      endDate,
      limit = 5000
    } = req.body || {};

    if (!dbPath || (!table && !sql)) {
      return res.status(400).json({ detail: "dbPath 不能为空，且 table 与 sql 至少填写一个" });
    }

    const data = await requestSqliteSource({
      db_path: String(dbPath),
      table: String(table || ""),
      date_column: String(dateColumn),
      value_column: String(valueColumn),
      sql: sql ? String(sql) : null,
      start_date: startDate ? String(startDate) : null,
      end_date: endDate ? String(endDate) : null,
      limit: Number(limit)
    });
    res.json(data);
  } catch (error) {
    if (error?.status === 404) {
      return res.status(503).json({ detail: "SQLite 数据源接口未就绪，请重启 Python 服务后重试" });
    }
    next(error);
  }
});

router.post("/sqlite/test", async (req, res, next) => {
  try {
    const { dbPath } = req.body || {};
    if (!dbPath) {
      return res.status(400).json({ detail: "dbPath 不能为空" });
    }
    await requestSqliteSource({
      db_path: String(dbPath),
      table: "",
      date_column: "date",
      value_column: "value",
      sql: "SELECT date('now') AS date, 1 AS value",
      start_date: null,
      end_date: null,
      limit: 1
    });
    res.json({ ok: true, detail: "SQLite 连接成功" });
  } catch (error) {
    if (error?.status === 404) {
      return res.status(503).json({ detail: "SQLite 数据源接口未就绪，请重启 Python 服务后重试" });
    }
    next(error);
  }
});

router.post("/mysql", async (req, res, next) => {
  let connection;
  try {
    const {
      host,
      port = 3306,
      user,
      password,
      database,
      table,
      dateColumn = "date",
      valueColumn = "value",
      sql,
      startDate,
      endDate,
      limit = 5000
    } = req.body || {};

    if (!host || !user || !database || (!table && !sql)) {
      return res.status(400).json({ detail: "host、user、database 不能为空，且 table 与 sql 至少填写一个" });
    }
    if (table && ![table, dateColumn, valueColumn].every(isSafeIdentifier)) {
      return res.status(400).json({ detail: "表名和列名只能包含字母、数字、下划线，且不能数字开头" });
    }

    const params = [];
    const safeLimit = Math.min(Math.max(Number(limit) || 5000, 1), 50000);
    const customSql = String(sql || "").trim();
    let query = "";
    let usePrepared = true;
    if (customSql) {
      const loweredSql = customSql.toLowerCase();
      if (!loweredSql.startsWith("select")) {
        return res.status(400).json({ detail: "SQL 仅支持 SELECT 查询" });
      }
      if (customSql.includes(";")) {
        return res.status(400).json({ detail: "SQL 不允许包含分号" });
      }
      if (customSql.includes("?")) {
        return res.status(400).json({ detail: "自定义 SQL 不支持参数占位符 ?" });
      }
      query = `SELECT * FROM (${customSql}) AS subq LIMIT ${safeLimit}`;
      usePrepared = false;
    } else {
      const where = [];
      if (startDate) {
        where.push(`\`${dateColumn}\` >= ?`);
        params.push(String(startDate));
      }
      if (endDate) {
        where.push(`\`${dateColumn}\` <= ?`);
        params.push(String(endDate));
      }
      const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
      query =
        `SELECT \`${dateColumn}\` AS date, \`${valueColumn}\` AS value ` +
        `FROM \`${table}\`${whereSql} ORDER BY \`${dateColumn}\` ASC LIMIT ?`;
      params.push(safeLimit);
    }

    connection = await mysql.createConnection({
      host: String(host),
      port: Number(port) || 3306,
      user: String(user),
      password: password == null ? "" : String(password),
      database: String(database),
      dateStrings: true,
      connectTimeout: 10000
    });
    const [rawRows] = usePrepared ? await connection.execute(query, params) : await connection.query(query);

    let precision = 0;
    const rows = rawRows
      .map((item) => {
        const values = Array.isArray(item) ? item : Object.values(item || {});
        if (values.length < 2) {
          return null;
        }
        const rawDate = values[0];
        const date = rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : String(rawDate ?? "").trim().slice(0, 10);
        const value = Number(values[1]);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) {
          return null;
        }
        precision = Math.max(precision, countDecimalPlaces(values[1]));
        return { date, value };
      })
      .filter(Boolean);

    if (rows.length < 3) {
      return res.status(400).json({ detail: "数据库有效数据不足 3 条，请检查字段映射和筛选条件" });
    }

    res.json({ rows, total_rows: rawRows.length, valid_rows: rows.length, precision });
  } catch (error) {
    next(error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

router.post("/mysql/test", async (req, res, next) => {
  let connection;
  try {
    const { host, port = 3306, user, password, database } = req.body || {};
    if (!host || !user || !database) {
      return res.status(400).json({ detail: "host、user、database 不能为空" });
    }
    connection = await mysql.createConnection({
      host: String(host),
      port: Number(port) || 3306,
      user: String(user),
      password: password == null ? "" : String(password),
      database: String(database),
      connectTimeout: 10000
    });
    await connection.ping();
    res.json({ ok: true, detail: "MySQL 连接成功" });
  } catch (error) {
    next(error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

export default router;
