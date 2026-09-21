import { Alert, Card, Empty, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { WarningOutlined } from "@ant-design/icons";
import type { Conflict } from "../types";
import { fmtDateTime, fullRange } from "../utils";

export default function ConflictPanel({ conflicts }: { conflicts: Conflict[] }) {
  if (conflicts.length === 0) {
    return (
      <Card className="panel-card conflict-panel" title={<span><WarningOutlined /> 时段冲突监控</span>}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="当前已签发票据之间无相邻 / 重叠时段冲突"
        />
      </Card>
    );
  }

  const columns: ColumnsType<Conflict> = [
    {
      title: "冲突类型",
      dataIndex: "reasonText",
      width: 150,
      render: (text: string, row) => (
        <Tag color={row.reason === "overlap" ? "red" : "orange"}>{text}</Tag>
      )
    },
    {
      title: "区域",
      dataIndex: "area",
      width: 120
    },
    {
      title: "涉及设备",
      dataIndex: "equipmentName",
      width: 220
    },
    {
      title: "冲突时段",
      key: "range",
      width: 240,
      render: (_, row) => fullRange(row.startAt, row.endAt)
    },
    {
      title: "冲突双方原值",
      key: "sides",
      render: (_, row) => (
        <div className="conflict-sides">
          {[row.a, row.b].map((s) => (
            <div className="conflict-side" key={`${s.code}-${s.version}`}>
              <strong>
                {s.code} V{s.version}
              </strong>
              <Tag>{s.area === row.a.area ? row.area : s.area}</Tag>
              <ul>
                <li>设备（原值）：{s.equipmentName}</li>
                <li>时段（原值）：{fmtDateTime(s.startAt)} ~ {fmtDateTime(s.endAt)}</li>
                <li>监护人（原值）：{s.guardian}</li>
                <li>签发时间：{fmtDateTime(s.issuedAt)}</li>
              </ul>
            </div>
          ))}
        </div>
      )
    }
  ];

  return (
    <Card
      className="panel-card conflict-panel has-conflict"
      title={
        <span>
          <WarningOutlined /> 时段冲突监控（{conflicts.length}）
        </span>
      }
    >
      <Alert
        className="conflict-banner"
        type="error"
        showIcon
        message="检测到同区域相邻或重叠时段的已签发作业票，按规定只能保留一张，请立即回收其中一张并核查现场。"
      />
      <Table
        rowKey="key"
        columns={columns}
        dataSource={conflicts}
        pagination={false}
        size="small"
        scroll={{ x: 900 }}
      />
    </Card>
  );
}
