import { useMemo, useState } from "react";
import {
  Alert,
  App as AntApp,
  Badge,
  Button,
  Card,
  Col,
  ConfigProvider,
  DatePicker,
  Form,
  Input,
  Layout,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  message,
} from "antd";
import zhCN from "antd/locale/zh_CN";
import {
  AlertOutlined,
  FileAddOutlined,
  FireOutlined,
  LockOutlined,
  SafetyOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import "dayjs/locale/zh-cn";
import type {
  Equipment,
  Permit,
  PermitConflict,
  PermitStatus,
} from "./types";
import { allConflicts, DATETIME_FORMAT } from "./domain";
import { useStore } from "./store";
import PermitDrawer from "./components/PermitDrawer";

dayjs.locale("zh-cn");

const statusColor: Record<PermitStatus, string> = {
  草稿: "default",
  已签发: "green",
  已作旧: "orange",
  已回收: "red",
};

function fmt(iso?: string): string {
  return iso ? dayjs(iso).format(DATETIME_FORMAT) : "—";
}

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#176b87",
          borderRadius: 8,
          colorInfo: "#176b87",
        },
      }}
    >
      <AntApp>
        <Station />
      </AntApp>
    </ConfigProvider>
  );
}

function Station() {
  const { areas, equipment, permits, createDraft, deletePermit, resumeEquipment } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("全部");

  const conflicts = useMemo(() => allConflicts(permits), [permits]);
  const conflictIds = useMemo(
    () => new Set(conflicts.flatMap((c) => [c.a.id, c.b.id])),
    [conflicts]
  );

  const activeCount = permits.filter((p) => p.status === "草稿" || p.status === "已签发").length;
  const issuedCount = permits.filter((p) => p.status === "已签发").length;
  const draftCount = permits.filter((p) => p.status === "草稿").length;
  const stoppedCount = equipment.filter((e) => e.status === "停用").length;

  const visiblePermits = useMemo(() => {
    const list =
      statusFilter === "全部"
        ? permits
        : permits.filter((p) => p.status === statusFilter);
    return [...list].sort(
      (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)
    );
  }, [permits, statusFilter]);

  function nameOfArea(id: string) {
    return areas.find((a) => a.id === id)?.name ?? "—";
  }
  function nameOfEq(id: string) {
    const e = equipment.find((x) => x.id === id);
    return e ? `${e.name}（${e.code}）` : "—";
  }

  return (
    <Layout className="app-layout">
      <Layout.Content className="app-content">
        <header className="page-header">
          <div>
            <p className="eyebrow">
              <FireOutlined /> 石油行业 · 动火作业管理
            </p>
            <h1>动火作业前隔离确认台</h1>
            <p className="subtitle">
              由油站巡检清单改造：创建动火作业票（区域 / 设备 / 许可时段 / 监护人），油罐、加油机或管线仍在用时不能签发；
              先登记停用状态、隔离点与确认人，签发后冻结巡检读数与隔离清单；现场条件变化只能新建带原因的版本并回收原许可。
            </p>
          </div>
          <Space>
            <Tag color="geekblue" icon={<LockOutlined />}>localStorage 持久化</Tag>
            <Button
              type="primary"
              icon={<FileAddOutlined />}
              size="large"
              onClick={() => {
                const id = createDraft();
                setOpenId(id);
              }}
            >
              新建动火作业票
            </Button>
          </Space>
        </header>

        <Row gutter={14} className="metric-row">
          <Col xs={12} md={6}>
            <Card>
              <Statistic title="有效作业票（草稿+已签发）" value={activeCount} prefix={<SafetyOutlined />} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card>
              <Statistic title="已签发（冻结）" value={issuedCount} valueStyle={{ color: "#14724f" }} prefix={<LockOutlined />} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card>
              <Statistic title="待签发草稿" value={draftCount} prefix={<ThunderboltOutlined />} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card>
              <Statistic
                title="时段冲突"
                value={conflicts.length}
                prefix={<AlertOutlined />}
                valueStyle={{ color: conflicts.length ? "#cf1322" : undefined }}
              />
            </Card>
          </Col>
        </Row>

        <Tabs
          defaultActiveKey="permits"
          items={[
            {
              key: "permits",
              label: (
                <Badge count={conflicts.length} size="small" offset={[10, -2]}>
                  作业票
                </Badge>
              ),
              children: (
                <>
                  {/* 冲突总览：区域、设备、时段与原值，刷新后由持久化数据重算 */}
                  {conflicts.length > 0 && (
                    <Alert
                      type="error"
                      showIcon
                      style={{ marginBottom: 14 }}
                      message={`检测到 ${conflicts.length} 处相邻或重叠时段冲突，同区域/同设备只能保留一张作业票`}
                      description={
                        <Space direction="vertical" style={{ width: "100%" }}>
                          {conflicts.map((c) => (
                            <ConflictCard
                              key={`${c.a.id}-${c.b.id}`}
                              conflict={c}
                              areaName={nameOfArea}
                              eqName={nameOfEq}
                              onOpen={(id) => setOpenId(id)}
                            />
                          ))}
                        </Space>
                      }
                    />
                  )}

                  <div className="toolbar">
                    <Space wrap>
                      <span className="muted">状态筛选：</span>
                      <Select
                        style={{ width: 140 }}
                        value={statusFilter}
                        onChange={setStatusFilter}
                        options={["全部", "草稿", "已签发", "已作旧", "已回收"].map((s) => ({
                          value: s,
                          label: s,
                        }))}
                      />
                    </Space>
                    <span className="muted">已停用设备 {stoppedCount}/{equipment.length}</span>
                  </div>

                  <Table<Permit>
                    rowKey="id"
                    dataSource={visiblePermits}
                    onRow={(p) => ({ onClick: () => setOpenId(p.id), className: "clickable-row" })}
                    pagination={{ pageSize: 8 }}
                    columns={[
                      {
                        title: "作业票号 / 版本",
                        render: (_, p) => (
                          <Space direction="vertical" size={0}>
                            <a>{p.permitNo}</a>
                            <span className="muted">v{p.version}{p.changeReason ? " · 条件变化新版本" : ""}</span>
                          </Space>
                        ),
                      },
                      { title: "区域", dataIndex: "areaId", render: nameOfArea },
                      { title: "设备", dataIndex: "equipmentId", render: nameOfEq },
                      { title: "动火等级", dataIndex: "fireLevel", width: 100 },
                      { title: "监护人", dataIndex: "watcher", width: 90, render: (v) => v || "—" },
                      {
                        title: "许可时段",
                        render: (_, p) => (
                          <span className="mono">
                            {fmt(p.startAt)}<br />~ {fmt(p.endAt)}
                          </span>
                        ),
                        width: 210,
                      },
                      {
                        title: "隔离/巡检",
                        render: (_, p) => (
                          <Space size={4}>
                            <Tooltip title="隔离点确认数">
                              <Tag color={p.isolations.length && p.isolations.every((i) => i.confirmed) ? "green" : "default"}>
                                隔离 {p.isolations.filter((i) => i.confirmed).length}/{p.isolations.length}
                              </Tag>
                            </Tooltip>
                            <Tooltip title="合格巡检读数">
                              <Tag color={p.readings.every((r) => r.value !== "" && r.qualified) ? "green" : "default"}>
                                气检 {p.readings.filter((r) => r.value !== "" && r.qualified).length}/{p.readings.length}
                              </Tag>
                            </Tooltip>
                          </Space>
                        ),
                        width: 150,
                      },
                      {
                        title: "状态",
                        width: 110,
                        render: (_, p) => (
                          <Space direction="vertical" size={2}>
                            <Tag color={statusColor[p.status]}>{p.status}</Tag>
                            {conflictIds.has(p.id) && <Tag color="error">冲突</Tag>}
                          </Space>
                        ),
                      },
                      {
                        title: "操作",
                        width: 90,
                        render: (_, p) =>
                          p.status === "草稿" ? (
                            <Popconfirm
                              title="删除该草稿？"
                              onConfirm={(e) => {
                                e?.stopPropagation();
                                deletePermit(p.id);
                                message.success("草稿已删除");
                              }}
                              onCancel={(e) => e?.stopPropagation()}
                            >
                              <Button
                                size="small"
                                danger
                                type="text"
                                onClick={(e) => e.stopPropagation()}
                              >
                                删除
                              </Button>
                            </Popconfirm>
                          ) : (
                            <span className="muted">不可删除</span>
                          ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: "equipment",
              label: `设备停用登记（${stoppedCount}/${equipment.length} 已停用）`,
              children: (
                <EquipmentTab
                  onResume={(id) => {
                    const r = resumeEquipment(id);
                    if (!r.ok) message.error(r.errors?.[0]);
                    else message.success("设备已恢复在用");
                  }}
                />
              ),
            },
            {
              key: "rules",
              label: "规则说明",
              children: <RulesPanel />,
            },
          ]}
        />
      </Layout.Content>

      <PermitDrawer permitId={openId} onClose={() => setOpenId(null)} />
    </Layout>
  );
}

/** 冲突卡片：列出区域、设备、时段与原值 */
function ConflictCard({
  conflict,
  areaName,
  eqName,
  onOpen,
}: {
  conflict: PermitConflict;
  areaName: (id: string) => string;
  eqName: (id: string) => string;
  onOpen: (id: string) => void;
}) {
  const { a, b, sameArea, sameEquipment, adjacent } = conflict;
  return (
    <div className="conflict-box">
      <table className="diff-table">
        <thead>
          <tr>
            <th style={{ width: 90 }}>字段</th>
            <th>
              <a onClick={() => onOpen(a.id)}>{a.permitNo} v{a.version}</a>{" "}
              <Tag color={statusColor[a.status]}>{a.status}</Tag>
            </th>
            <th>
              <a onClick={() => onOpen(b.id)}>{b.permitNo} v{b.version}</a>{" "}
              <Tag color={statusColor[b.status]}>{b.status}</Tag>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>区域</td>
            <td className={sameArea ? "clash-cell" : ""}>{areaName(a.areaId)}</td>
            <td className={sameArea ? "clash-cell" : ""}>{areaName(b.areaId)}</td>
          </tr>
          <tr>
            <td>设备</td>
            <td className={sameEquipment ? "clash-cell" : ""}>{eqName(a.equipmentId)}</td>
            <td className={sameEquipment ? "clash-cell" : ""}>{eqName(b.equipmentId)}</td>
          </tr>
          <tr>
            <td>时段（原值）</td>
            <td className="clash-cell mono">{fmt(a.startAt)} ~ {fmt(a.endAt)}</td>
            <td className="clash-cell mono">{fmt(b.startAt)} ~ {fmt(b.endAt)}</td>
          </tr>
          <tr>
            <td>冲突类型</td>
            <td colSpan={2}>
              <Tag color="red">{adjacent ? "时段首尾相邻" : "时段重叠"}</Tag>
              {sameArea && <Tag color="volcano">同区域</Tag>}
              {sameEquipment && <Tag color="orange">同设备</Tag>}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** 设备管理：停用状态/停用记录/恢复投用 */
function EquipmentTab({ onResume }: { onResume: (id: string) => void }) {
  const { areas, equipment, permits, setEquipmentStop } = useStore();
  const [target, setTarget] = useState<Equipment | null>(null);

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 14 }}
        message="油罐、加油机或管线必须先登记停用（停用时间、原因、确认人），作业票登记隔离点并逐项确认后才能签发。"
      />
      <Table<Equipment>
        rowKey="id"
        pagination={false}
        dataSource={equipment}
        columns={[
          { title: "编号", dataIndex: "code", width: 110 },
          {
            title: "设备",
            render: (_, e) => (
              <Space>
                <strong>{e.name}</strong>
                <Tag>{e.type}</Tag>
              </Space>
            ),
          },
          {
            title: "所属区域",
            dataIndex: "areaId",
            width: 120,
            render: (id) => areas.find((a) => a.id === id)?.name,
          },
          {
            title: "状态",
            width: 90,
            render: (_, e) => <Tag color={e.status === "在用" ? "red" : "green"}>{e.status}</Tag>,
          },
          {
            title: "停用记录（时间 / 原因 / 确认人）",
            render: (_, e) =>
              e.stop ? (
                <span>
                  {fmt(e.stop.stoppedAt)} ｜ {e.stop.reason} ｜ <strong>{e.stop.operator}</strong>
                </span>
              ) : (
                <span className="muted">未停用 — 相关作业票不能签发</span>
              ),
          },
          {
            title: "占用票",
            width: 90,
            render: (_, e) => {
              const n = permits.filter(
                (p) => p.equipmentId === e.id && (p.status === "草稿" || p.status === "已签发")
              ).length;
              return n ? <Tag color="error">{n} 张</Tag> : <Tag>无</Tag>;
            },
          },
          {
            title: "操作",
            width: 170,
            render: (_, e) =>
              e.status === "在用" ? (
                <Button size="small" danger ghost onClick={() => setTarget(e)}>
                  登记停用
                </Button>
              ) : (
                <Popconfirm
                  title="恢复设备在用？"
                  description="存在有效作业票占用时将被阻止。"
                  onConfirm={() => onResume(e.id)}
                >
                  <Button size="small">恢复投用</Button>
                </Popconfirm>
              ),
          },
        ]}
      />
      <EquipmentStopModal
        equipment={target}
        onClose={() => setTarget(null)}
        onSubmit={(rec) => {
          if (target) {
            setEquipmentStop(target.id, rec);
            message.success(`${target.name} 已登记停用`);
            setTarget(null);
          }
        }}
      />
    </>
  );
}

function EquipmentStopModal({
  equipment,
  onClose,
  onSubmit,
}: {
  equipment: Equipment | null;
  onClose: () => void;
  onSubmit: (rec: NonNullable<Equipment["stop"]>) => void;
}) {
  const [form] = Form.useForm();
  return (
    <Modal
      title={equipment ? `登记停用：${equipment.name}` : ""}
      open={Boolean(equipment)}
      onCancel={onClose}
      okText="确认停用登记"
      okButtonProps={{ danger: true }}
      onOk={() =>
        form.validateFields().then((v) => {
          onSubmit({
            stoppedAt: (v.stoppedAt as Dayjs).toISOString(),
            reason: v.reason,
            operator: v.operator,
          });
          form.resetFields();
        })
      }
      afterOpenChange={(open) => open && form.setFieldsValue({ stoppedAt: dayjs() })}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="stoppedAt" label="停用时间" rules={[{ required: true }]}>
          <DatePicker
            style={{ width: "100%" }}
            showTime={{ format: "HH:mm", minuteStep: 5 }}
            format={DATETIME_FORMAT}
          />
        </Form.Item>
        <Form.Item
          name="reason"
          label="停用原因 / 措施"
          rules={[{ required: true, message: "请填写停用原因，如倒空置换、断电上锁" }]}
        >
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="operator" label="停用确认人" rules={[{ required: true, message: "请填写确认人" }]}>
          <Input placeholder="确认停用的人员" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function RulesPanel() {
  const rules: { t: string; d: string }[] = [
    {
      t: "一张票原则",
      d: "同一区域或同一设备，许可时段相邻（首尾相接）或重叠时只能保留一张作业票；保存草稿与签发都会校验，冲突必须列出区域、设备、时段与原值。",
    },
    {
      t: "在用设备禁止签发",
      d: "油罐、加油机或管线状态为「在用」时不能签发；先在设备管理或作业票内登记停用（停用时间、原因、确认人），再逐项登记隔离点并由确认人确认。",
    },
    {
      t: "签发冻结",
      d: "签发瞬间冻结该版本的四项巡检读数（可燃气体、氧含量、硫化氢、一氧化碳）与隔离清单，之后不可直接修改。",
    },
    {
      t: "版本与回收",
      d: "现场条件变化不能改原票：必须新建带原因的版本，原许可自动回收并标记「已作旧」；新版本隔离点需重新确认、巡检读数需重新检测后方可再次签发。",
    },
    {
      t: "刷新一致",
      d: "作业票、隔离点、巡检版本与冲突全部持久化在浏览器 localStorage，刷新后从持久化数据重算冲突，状态保持一致。",
    },
  ];
  return (
    <Row gutter={[14, 14]}>
      {rules.map((r) => (
        <Col xs={24} md={12} key={r.t}>
          <Card type="inner" title={r.t}>
            {r.d}
          </Card>
        </Col>
      ))}
    </Row>
  );
}
