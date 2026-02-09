import { useState } from "react";
import { Alert, Upload, message } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { parseExcelRows } from "../utils/excel";

function UploadPanel({ onValidRows }) {
  const [stats, setStats] = useState(null);

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

  return (
    <>
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
