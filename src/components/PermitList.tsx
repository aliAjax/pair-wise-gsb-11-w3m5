import { useMemo, useState } from "react";
import { Card, Input, Segmented, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { FileProtectOutlined } from "@ant-design/icons";
import type { Permit } from "../types";
import { STATUS_TEXT, areaName, EQUIPMENT_KIND_TEXT } from "../constants";
import { fmtDateTime, fullRange } from "../utils";

const STATUS_COLOR: Record<string, string> = {
  draft: "gold",
  issued: "green",
  reclaimed: "default"
};

export default function PermitList({
  permits,
  onOpen
}: {
  permits: Permit[];
  onOpen: (permit: Permit) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [keyword, setKeyword] = useState("");

  const data = useMemo(() => {
    return permits.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (keyword) {
        const hay = `${p.code} V${p.version} ${p.equipmentName} ${areaName(p.area)} ${p.guardian}`;
        if (!hay.toLowerCase().includes(keyword.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [permits, statusFilter, keyword]);

  const columns: ColumnsType<Permit> = [
    {
      title: "作业票号 / 版本",
      dataIndex: "code",
      width: 190,
      render: (_, row) => (
        <Space direction="vertical" size={2}>
          <a onClick={() => onOpen(row)}>
            <strong>{row.code}</strong> V{row.version}
          </a>
          {row.revisionReason && <Tag color="purple">变更版本</Tag>}
        </Space>
      )
    },
    {
      title: "区域 / 设备",
      key: "target",
      width: 260,
      render: (_, row) => (
        <Space size={6} wrap>
          <Tag color="geekblue">{areaName(row.area)}</Tag>
          <Tag>{EQUIPMENT_KIND_TEXT[row.equipmentKind]}</Tag>
          <span>{row.equipmentName}</span>
        </Space>
      )
    },
    {
      title: "许可时段",
      key: "range",
      width: 260,
      render: (_, row) => fullRange(row.startAt, row.endAt)
    },
    { title: "监护人", dataIndex: "guardian", width: 100 },
    {
      title: "停用",
      key: "shutdown",
      width: 80,
      render: (_, row) =>
        row.shutdown.state === "stopped" ? <Tag color="cyan">已停用</Tag> : <Tag color="red">在用</Tag>
    },
    {
      title: "隔离点",
      key: "isolation",
      width: 80,
      align: "center",
      render: (_, row) => row.isolation.length
    },
    {
      title: "巡检读数",
      key: "readings",
      width: 90,
      align: "center",
      render: (_, row) => {
        const bad = row.readings.filter((r) => r.result === "不合格").length;
        return bad > 0 ? <Tag color="red">{row.readings.length}（{bad} 不合格）</Tag> : row.readings.length;
      }
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (status: string) => <Tag color={STATUS_COLOR[status]}>{STATUS_TEXT[status]}</Tag>
    },
    {
      title: "签发时间",
      dataIndex: "issuedAt",
      width: 150,
      render: (v: string) => fmtDateTime(v)
    }
  ];

  return (
    <Card
      className="panel-card"
      title={
        <span>
          <FileProtectOutlined /> 作业票台账
        </span>
      }
      extra={
        <Space>
          <Input.Search
            placeholder="票号 / 设备 / 监护人"
            allowClear
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 220 }}
          />
          <Segmented
            value={statusFilter}
            onChange={(v) => setStatusFilter(String(v))}
            options={[
              { label: "全部", value: "all" },
              { label: "待签发", value: "draft" },
              { label: "已签发", value: "issued" },
              { label: "已回收", value: "reclaimed" }
            ]}
          />
        </Space>
      }
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        size="small"
        pagination={{ pageSize: 8, showSizeChanger: false }}
        scroll={{ x: 1200 }}
        onRow={(row) => ({ onClick: () => onOpen(row), style: { cursor: "pointer" } })}
      />
    </Card>
  );
}
