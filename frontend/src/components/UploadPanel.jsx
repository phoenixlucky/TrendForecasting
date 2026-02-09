import { useState } from "react";
import { Alert, Button, Input, InputNumber, Space, Tabs, Upload, message } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { parseExcelRows } from "../utils/excel";
import { fetchMysqlRows, fetchSqliteRows, testMysqlConnection, testSqliteConnection } from "../services/api";

const { TextArea } = Input;
const SQLITE_CONFIG_KEY = "trend-forecasting-sqlite-config";
const MYSQL_CONFIG_KEY = "trend-forecasting-mysql-config";

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

function UploadPanel({ onValidRows }) {
  const [stats, setStats] = useState(null);
  const [loadingDb, setLoadingDb] = useState(false);
  const [testingSqlite, setTestingSqlite] = useState(false);
  const [testingMysql, setTestingMysql] = useState(false);
  const [dbConfig, setDbConfig] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SQLITE_CONFIG_KEY) || "{}");
      return {
        dbPath: saved.dbPath || "",
        sql: saved.sql || "",
        limit: saved.limit || 5000
      };
    } catch {
      return { dbPath: "", sql: "", limit: 5000 };
    }
  });
  const [mysqlConfig, setMysqlConfig] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(MYSQL_CONFIG_KEY) || "{}");
      return {
        host: saved.host || "127.0.0.1",
        port: saved.port || 3306,
        user: saved.user || "",
        password: "",
        database: saved.database || "",
        sql: saved.sql || "",
        limit: saved.limit || 5000
      };
    } catch {
      return {
        host: "127.0.0.1",
        port: 3306,
        user: "",
        password: "",
        database: "",
        sql: "",
        limit: 5000
      };
    }
  });

  const saveSqliteConfig = ({ notify = true } = {}) => {
    localStorage.setItem(
      SQLITE_CONFIG_KEY,
      JSON.stringify({
        dbPath: dbConfig.dbPath,
        sql: dbConfig.sql,
        limit: dbConfig.limit
      })
    );
    if (notify) {
      message.success("SQLite 连接配置已保存");
    }
  };

  const saveMysqlConfig = async ({ notify = true } = {}) => {
    localStorage.setItem(
      MYSQL_CONFIG_KEY,
      JSON.stringify({
        host: mysqlConfig.host,
        port: mysqlConfig.port,
        user: mysqlConfig.user,
        database: mysqlConfig.database,
        sql: mysqlConfig.sql,
        limit: mysqlConfig.limit
      })
    );
    if (notify) {
      message.success("MySQL 连接配置已保存");
    }
  };

  const beforeUpload = async (file) => {
    try {
      const { rows, totalRows, precision } = await parseExcelRows(file);
      onValidRows(rows, precision);
      setStats({ validRows: rows.length, totalRows });
      message.success(`解析成功: ${rows.length}/${totalRows} 条有效数据`);
    } catch (error) {
      onValidRows([], 0);
      setStats(null);
      message.error(error.message || "文件解析失败");
    }
    return false;
  };

  const loadFromSqlite = async () => {
    if (!dbConfig.dbPath || !dbConfig.sql.trim()) {
      message.warning("请填写数据库文件路径和 SQL 查询");
      return;
    }
    setLoadingDb(true);
    try {
      const data = await fetchSqliteRows({
        dbPath: dbConfig.dbPath,
        table: "",
        dateColumn: "date",
        valueColumn: "value",
        sql: dbConfig.sql.trim() || null,
        startDate: null,
        endDate: null,
        limit: dbConfig.limit || 5000
      });
      const rows = (data?.rows || []).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const precision = rows.reduce((max, item) => Math.max(max, countDecimalPlaces(item.value)), 0);
      onValidRows(rows, Number.isFinite(data?.precision) ? data.precision : precision);
      setStats({ validRows: rows.length, totalRows: data?.total_rows ?? rows.length });
      message.success(`数据库读取成功: ${rows.length}/${data?.total_rows ?? rows.length} 条有效数据`);
    } catch (error) {
      onValidRows([], 0);
      setStats(null);
      const detail = error?.response?.data?.detail || error.message || "数据库读取失败";
      message.error(detail);
    } finally {
      setLoadingDb(false);
    }
  };

  const handleTestSqlite = async () => {
    if (!dbConfig.dbPath) {
      message.warning("请先填写 SQLite 文件路径");
      return;
    }
    setTestingSqlite(true);
    try {
      const data = await testSqliteConnection({ dbPath: dbConfig.dbPath });
      message.success(data?.detail || "SQLite 连接成功");
      saveSqliteConfig({ notify: false });
    } catch (error) {
      const detail = error?.response?.data?.detail || error.message || "SQLite 连接失败";
      message.error(detail);
    } finally {
      setTestingSqlite(false);
    }
  };

  const loadFromMysql = async () => {
    if (!mysqlConfig.host || !mysqlConfig.user || !mysqlConfig.database || !mysqlConfig.sql.trim()) {
      message.warning("请填写 host、user、database 和 SQL 查询");
      return;
    }
    setLoadingDb(true);
    try {
      const data = await fetchMysqlRows({
        host: mysqlConfig.host,
        port: mysqlConfig.port || 3306,
        user: mysqlConfig.user,
        password: mysqlConfig.password,
        database: mysqlConfig.database,
        table: "",
        dateColumn: "date",
        valueColumn: "value",
        sql: mysqlConfig.sql.trim() || null,
        startDate: null,
        endDate: null,
        limit: mysqlConfig.limit || 5000
      });
      const rows = (data?.rows || []).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const precision = rows.reduce((max, item) => Math.max(max, countDecimalPlaces(item.value)), 0);
      onValidRows(rows, Number.isFinite(data?.precision) ? data.precision : precision);
      setStats({ validRows: rows.length, totalRows: data?.total_rows ?? rows.length });
      message.success(`MySQL 读取成功: ${rows.length}/${data?.total_rows ?? rows.length} 条有效数据`);
    } catch (error) {
      onValidRows([], 0);
      setStats(null);
      const status = error?.response?.status;
      let detail = error?.response?.data?.detail || error.message || "MySQL 读取失败";
      if (status === 404) {
        detail = "MySQL 数据源接口不存在，请重启 Node 服务后重试";
      } else if (String(detail).includes("host、user、database、table 不能为空")) {
        detail = "当前后端仍是旧版本校验，请重启 Node 服务加载最新代码（table 在填写 SQL 时可为空）";
      }
      message.error(detail);
    } finally {
      setLoadingDb(false);
    }
  };

  const handleTestMysql = async () => {
    if (!mysqlConfig.host || !mysqlConfig.user || !mysqlConfig.database) {
      message.warning("请先填写 host、user、database");
      return;
    }
    setTestingMysql(true);
    try {
      const data = await testMysqlConnection({
        host: mysqlConfig.host,
        port: mysqlConfig.port || 3306,
        user: mysqlConfig.user,
        password: mysqlConfig.password,
        database: mysqlConfig.database
      });
      message.success(data?.detail || "MySQL 连接成功");
      await saveMysqlConfig({ notify: false });
    } catch (error) {
      const status = error?.response?.status;
      let detail = error?.response?.data?.detail || error.message || "MySQL 连接失败";
      if (status === 404) {
        detail = "MySQL 测试连接接口不存在，请重启 Node 服务后重试";
      }
      message.error(detail);
    } finally {
      setTestingMysql(false);
    }
  };

  return (
    <>
      <Tabs
        size="small"
        items={[
          {
            key: "excel",
            label: "Excel 上传",
            children: (
              <Upload.Dragger
                name="file"
                accept=".xlsx,.xls"
                maxCount={1}
                beforeUpload={beforeUpload}
                showUploadList={false}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p className="ant-upload-text">点击或拖拽 Excel 文件到此处</p>
                <p className="ant-upload-hint">仅支持列名: date, value</p>
              </Upload.Dragger>
            )
          },
          {
            key: "sqlite",
            label: "SQLite 直连",
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size={8}>
                <Input
                  placeholder="SQLite 文件路径，例如 D:\\data\\sales.db"
                  value={dbConfig.dbPath}
                  onChange={(e) => setDbConfig((prev) => ({ ...prev, dbPath: e.target.value }))}
                />
                <TextArea
                  rows={4}
                  placeholder="填写 SQL（仅 SELECT，需返回 date/value 两列）"
                  value={dbConfig.sql}
                  onChange={(e) => setDbConfig((prev) => ({ ...prev, sql: e.target.value }))}
                />
                <InputNumber
                  style={{ width: "100%" }}
                  min={1}
                  max={50000}
                  value={dbConfig.limit}
                  onChange={(value) => setDbConfig((prev) => ({ ...prev, limit: value || 5000 }))}
                  addonBefore="最大读取行数"
                />
                <Space>
                  <Button type="default" loading={loadingDb} onClick={loadFromSqlite}>
                    从数据库读取
                  </Button>
                  <Button loading={testingSqlite} onClick={handleTestSqlite}>
                    测试连接
                  </Button>
                  <Button onClick={saveSqliteConfig}>保存连接配置</Button>
                </Space>
              </Space>
            )
          },
          {
            key: "mysql",
            label: "MySQL 直连",
            children: (
              <Space direction="vertical" style={{ width: "100%" }} size={8}>
                <Space.Compact block>
                  <Input
                    placeholder="Host，例如 127.0.0.1"
                    value={mysqlConfig.host}
                    onChange={(e) => setMysqlConfig((prev) => ({ ...prev, host: e.target.value }))}
                  />
                  <InputNumber
                    style={{ width: 120 }}
                    min={1}
                    max={65535}
                    value={mysqlConfig.port}
                    onChange={(value) => setMysqlConfig((prev) => ({ ...prev, port: value || 3306 }))}
                    controls={false}
                  />
                </Space.Compact>
                <Space.Compact block>
                  <Input
                    placeholder="用户名"
                    value={mysqlConfig.user}
                    onChange={(e) => setMysqlConfig((prev) => ({ ...prev, user: e.target.value }))}
                  />
                  <Input.Password
                    placeholder="密码"
                    value={mysqlConfig.password}
                    onChange={(e) => setMysqlConfig((prev) => ({ ...prev, password: e.target.value }))}
                  />
                </Space.Compact>
                <Input
                  placeholder="数据库名，例如 business_db"
                  value={mysqlConfig.database}
                  onChange={(e) => setMysqlConfig((prev) => ({ ...prev, database: e.target.value }))}
                />
                <TextArea
                  rows={4}
                  placeholder="填写 SQL（仅 SELECT，需返回 date/value 两列）"
                  value={mysqlConfig.sql}
                  onChange={(e) => setMysqlConfig((prev) => ({ ...prev, sql: e.target.value }))}
                />
                <InputNumber
                  style={{ width: "100%" }}
                  min={1}
                  max={50000}
                  value={mysqlConfig.limit}
                  onChange={(value) => setMysqlConfig((prev) => ({ ...prev, limit: value || 5000 }))}
                  addonBefore="最大读取行数"
                />
                <Space>
                  <Button type="default" loading={loadingDb} onClick={loadFromMysql}>
                    从 MySQL 读取
                  </Button>
                  <Button loading={testingMysql} onClick={handleTestMysql}>
                    测试连接
                  </Button>
                  <Button onClick={() => saveMysqlConfig()}>保存连接配置</Button>
                </Space>
              </Space>
            )
          }
        ]}
      />

      {stats && (
        <Alert
          style={{ marginTop: 12 }}
          type="info"
          message={`总行数 ${stats.totalRows}，有效行 ${stats.validRows}`}
          showIcon
        />
      )}
    </>
  );
}

export default UploadPanel;
