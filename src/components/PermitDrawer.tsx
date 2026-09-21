import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Timeline,
  Typography
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  LockOutlined,
  SafetyCertificateOutlined,
  CopyOutlined,
  StopOutlined,
  CheckCircleOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { InspectionReading, IsolationPoint, Permit } from "../types";
import {
  AREAS,
  EQUIPMENT,
  EQUIPMENT_KIND_TEXT,
  INSPECTION_PRESETS,
  ISOLATION_METHODS,
  STATUS_TEXT,
  areaName
} from "../constants";
import { conflictsForCandidate } from "../conflict";
import { usePermitStore } from "../store";
import { fmtDateTime, fullRange } from "../utils";

const { Text, Paragraph } = Typography;

export function evaluateReading(value: string, limit: string): "合格" | "不合格" | null {
  const num = Number(value);
  if (value === "" || Number.isNaN(num)) return null;
  const le = limit.match(/^≤\s*([\d.]+)/);
  if (le) return num <= Number(le[1]) ? "合格" : "不合格";
  const range = limit.match(/^([\d.]+)\s*~\s*([\d.]+)/);
  if (range) return num >= Number(range[1]) && num <= Number(range[2]) ? "合格" : "不合格";
  return null;
}

type BlockReason = { level: "block" | "warn"; text: string };

export default function PermitDrawer({
  permitId,
  onClose
}: {
  permitId: string | null;
  onClose: () => void;
}) {
  const permits = usePermitStore((s) => s.permits);
  const permit = permits.find((p) => p.id === permitId) ?? null;
  const open = Boolean(permit);
  const isDraft = permit?.status === "draft";
  const isIssued = permit?.status === "issued";

  return (
    <Drawer
      width={760}
      open={open}
      onClose={onClose}
      title={
        permit ? (
          <Space wrap>
            <strong>{permit.code}</strong>
            <Tag color="purple">V{permit.version}</Tag>
            <Tag color={permit.status === "issued" ? "green" : permit.status === "draft" ? "gold" : "default"}>
              {STATUS_TEXT[permit.status]}
            </Tag>
            {permit.revisionReason && <Tag color="magenta">现场条件变化换版</Tag>}
          </Space>
        ) : (
          ""
        )
      }
      destroyOnClose
    >
      {permit && (
        <>
          {isIssued && (
            <Alert
              className="frozen-banner"
              type="success"
              showIcon
              icon={<LockOutlined />}
              message="作业票已签发：巡检读数、隔离清单与停用记录已冻结"
              description={`签发时间 ${fmtDateTime(permit.issuedAt)}。现场条件变化时不得直接修改，须回收本票并新建带原因的版本。`}
              style={{ marginBottom: 16 }}
            />
          )}
          {permit.status === "reclaimed" && (
            <Alert
              type="warning"
              showIcon
              message="本作业票已回收"
              description={
                <>
                  <div>回收时间：{fmtDateTime(permit.reclaimedAt)}</div>
                  <div>回收原因：{permit.reclaimReason}</div>
                </>
              }
              style={{ marginBottom: 16 }}
            />
          )}

          <MetaSection permit={permit} editable={isDraft} />
          <ShutdownSection permit={permit} editable={isDraft} />
          <IsolationSection permit={permit} editable={isDraft} />
          <ReadingSection permit={permit} editable={isDraft} />
          {isDraft && <IssueSection permit={permit} onClose={onClose} />}
          {isIssued && <IssuedActions permit={permit} onClose={onClose} />}
          <VersionChain current={permit} permits={permits} onOpen={(id) => onClose()} />
        </>
      )}
    </Drawer>
  );
}

/* ---------------- 基础信息 ---------------- */

function MetaSection({ permit, editable }: { permit: Permit; editable: boolean }) {
  const updateDraftMeta = usePermitStore((s) => s.updateDraftMeta);

  if (!editable) {
    return (
      <Card size="small" title="作业信息（冻结）" className="drawer-card">
        <Descriptions column={2} size="small">
          <Descriptions.Item label="作业区域">{areaName(permit.area)}</Descriptions.Item>
          <Descriptions.Item label="设备类型">
            <Tag>{EQUIPMENT_KIND_TEXT[permit.equipmentKind]}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="动火设备" span={2}>
            {permit.equipmentName}
          </Descriptions.Item>
          <Descriptions.Item label="许可时段" span={2}>
            {fullRange(permit.startAt, permit.endAt)}
          </Descriptions.Item>
          <Descriptions.Item label="监护人">{permit.guardian}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{fmtDateTime(permit.createdAt)}</Descriptions.Item>
        </Descriptions>
      </Card>
    );
  }

  return (
    <Card size="small" title="作业信息" className="drawer-card">
      <Form layout="vertical">
        <Space wrap align="start">
          <Form.Item label="作业区域" required style={{ width: 200 }}>
            <Select
              value={permit.area}
              options={AREAS.map((a) => ({ value: a.key, label: a.name }))}
              onChange={(area) => {
                const eq = EQUIPMENT.find((e) => e.key === permit.equipmentKey);
                updateDraftMeta(permit.id, { area, equipmentKey: eq?.area === area ? permit.equipmentKey : "" });
              }}
            />
          </Form.Item>
          <Form.Item label="动火设备" required style={{ width: 320 }}>
            <Select
              value={permit.equipmentKey || undefined}
              placeholder="选择油罐 / 加油机 / 管线"
              options={EQUIPMENT.filter((e) => e.area === permit.area).map((e) => ({
                value: e.key,
                label: `${e.name}（${EQUIPMENT_KIND_TEXT[e.kind]}）`
              }))}
              onChange={(key) => {
                const eq = EQUIPMENT.find((e) => e.key === key)!;
                updateDraftMeta(permit.id, {
                  equipmentKey: eq.key,
                  equipmentName: eq.name,
                  equipmentKind: eq.kind
                });
              }}
            />
          </Form.Item>
          <Form.Item label="监护人" required style={{ width: 160 }}>
            <Input
              value={permit.guardian}
              onChange={(e) => updateDraftMeta(permit.id, { guardian: e.target.value })}
            />
          </Form.Item>
        </Space>
        <Form.Item label="许可时段" required style={{ marginBottom: 0 }}>
          <DatePicker.RangePicker
            showTime={{ format: "HH:mm" }}
            format="YYYY-MM-DD HH:mm"
            style={{ width: "100%" }}
            value={[dayjs(permit.startAt), dayjs(permit.endAt)]}
            onChange={(value) => {
              if (value?.[0] && value[1]) {
                updateDraftMeta(permit.id, {
                  startAt: value[0].toISOString(),
                  endAt: value[1].toISOString()
                });
              }
            }}
          />
        </Form.Item>
      </Form>
    </Card>
  );
}

/* ---------------- 停用状态 ---------------- */

function ShutdownSection({ permit, editable }: { permit: Permit; editable: boolean }) {
  const setShutdown = usePermitStore((s) => s.setShutdown);
  const [draft, setDraft] = useState(permit.shutdown);

  useEffect(() => setDraft(permit.shutdown), [permit.id, permit.shutdown]);

  const stopped = draft.state === "stopped";

  return (
    <Card
      size="small"
      title={
        <span>
          <StopOutlined /> 设备停用状态
        </span>
      }
      className="drawer-card"
      extra={
        permit.shutdown.state === "stopped" ? <Tag color="cyan">已停用</Tag> : <Tag color="red">仍在用</Tag>
      }
    >
      {!editable && (
        <Descriptions column={1} size="small">
          <Descriptions.Item label="停用状态">
            {permit.shutdown.state === "stopped" ? "已停用" : "仍在用（禁止签发）"}
          </Descriptions.Item>
          {permit.shutdown.state === "stopped" && (
            <>
              <Descriptions.Item label="停用时间">{fmtDateTime(permit.shutdown.stoppedAt)}</Descriptions.Item>
              <Descriptions.Item label="停用方式">{permit.shutdown.method}</Descriptions.Item>
              <Descriptions.Item label="记录人">{permit.shutdown.recorder}</Descriptions.Item>
              <Descriptions.Item label="备注">{permit.shutdown.note || "—"}</Descriptions.Item>
            </>
          )}
        </Descriptions>
      )}

      {editable && (
        <Form layout="vertical">
          <Radio.Group
            value={draft.state}
            onChange={(e) => setDraft({ ...draft, state: e.target.value })}
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: "仍在用", value: "in_use" },
              { label: "已停用", value: "stopped" }
            ]}
          />
          {stopped && (
            <div className="sub-form">
              <Space wrap align="start">
                <Form.Item label="停用时间" required style={{ width: 220 }}>
                  <DatePicker
                    showTime={{ format: "HH:mm" }}
                    format="YYYY-MM-DD HH:mm"
                    style={{ width: "100%" }}
                    value={draft.stoppedAt ? dayjs(draft.stoppedAt) : null}
                    onChange={(v) => setDraft({ ...draft, stoppedAt: v ? v.toISOString() : "" })}
                  />
                </Form.Item>
                <Form.Item label="停用方式" required style={{ width: 240 }}>
                  <Select
                    mode="tags"
                    maxCount={3}
                    placeholder="断电 / 泄压 / 吹扫 / 油品回收"
                    value={draft.method ? draft.method.split("、") : []}
                    onChange={(vals: string[]) => setDraft({ ...draft, method: vals.join("、") })}
                    options={["断电", "泄压", "吹扫置换", "残余油品回收", "停机挂牌"].map((v) => ({ value: v, label: v }))}
                  />
                </Form.Item>
                <Form.Item label="记录人" required style={{ width: 160 }}>
                  <Input
                    value={draft.recorder}
                    onChange={(e) => setDraft({ ...draft, recorder: e.target.value })}
                  />
                </Form.Item>
              </Space>
              <Form.Item label="停用说明" style={{ marginBottom: 12 }}>
                <Input.TextArea
                  rows={2}
                  value={draft.note}
                  placeholder="停电挂牌、阀门状态、置换次数等"
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                />
              </Form.Item>
            </div>
          )}
          <Button
            type="primary"
            ghost
            disabled={
              stopped && (!draft.stoppedAt || !draft.method || !draft.recorder.trim())
            }
            onClick={() => setShutdown(permit.id, { ...draft, recorder: draft.recorder.trim() })}
          >
            记录停用状态
          </Button>
        </Form>
      )}
    </Card>
  );
}

/* ---------------- 隔离点 ---------------- */

function IsolationSection({ permit, editable }: { permit: Permit; editable: boolean }) {
  const addIsolation = usePermitStore((s) => s.addIsolation);
  const removeIsolation = usePermitStore((s) => s.removeIsolation);
  const updateIsolation = usePermitStore((s) => s.updateIsolation);
  const [location, setLocation] = useState("");
  const [method, setMethod] = useState<string>();
  const [locked, setLocked] = useState(false);
  const [confirmer, setConfirmer] = useState("");

  const columns: ColumnsType<IsolationPoint> = [
    { title: "隔离点", dataIndex: "location" },
    { title: "隔离方式", dataIndex: "method", width: 170 },
    {
      title: "上锁挂签",
      dataIndex: "locked",
      width: 90,
      align: "center",
      render: (v: boolean, row) =>
        editable ? (
          <Switch checked={v} size="small" onChange={(val) => updateIsolation(permit.id, row.id, { locked: val })} />
        ) : v ? (
          <Tag color="green">已上锁</Tag>
        ) : (
          <Tag color="red">未上锁</Tag>
        )
    },
    { title: "确认人", dataIndex: "confirmer", width: 100 },
    { title: "确认时间", dataIndex: "confirmedAt", width: 150, render: (v: string) => fmtDateTime(v) },
    ...(editable
      ? [
          {
            title: "",
            key: "op",
            width: 60,
            render: (_: unknown, row: IsolationPoint) => (
              <Popconfirm title="删除该隔离点？" onConfirm={() => removeIsolation(permit.id, row.id)}>
                <Button type="link" danger size="small">
                  删除
                </Button>
              </Popconfirm>
            )
          } as ColumnsType<IsolationPoint>[number]
        ]
      : [])
  ];

  function handleAdd() {
    if (!location.trim() || !method || !confirmer.trim()) return;
    addIsolation(permit.id, {
      location: location.trim(),
      method: method!,
      locked,
      confirmer: confirmer.trim(),
      confirmedAt: new Date().toISOString()
    });
    setLocation("");
    setMethod(undefined);
    setLocked(false);
    setConfirmer("");
  }

  return (
    <Card
      size="small"
      title={
        <span>
          <SafetyCertificateOutlined /> 隔离点清单（{permit.isolation.length}）
        </span>
      }
      className="drawer-card"
    >
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={permit.isolation}
        pagination={false}
        locale={{ emptyText: "尚未登记隔离点，油罐/加油机/管线须完成隔离后方可签发" }}
      />
      {editable && (
        <div className="sub-form">
          <Space wrap align="end">
            <Form.Item label="隔离点位置" style={{ marginBottom: 8, width: 220 }}>
              <Input placeholder="如：1号机进油球阀" value={location} onChange={(e) => setLocation(e.target.value)} />
            </Form.Item>
            <Form.Item label="隔离方式" style={{ marginBottom: 8, width: 200 }}>
              <Select
                placeholder="选择隔离方式"
                value={method}
                onChange={setMethod}
                options={ISOLATION_METHODS.map((m) => ({ value: m, label: m }))}
              />
            </Form.Item>
            <Form.Item label="确认人" style={{ marginBottom: 8, width: 130 }}>
              <Input value={confirmer} onChange={(e) => setConfirmer(e.target.value)} />
            </Form.Item>
            <Form.Item label="上锁挂签" style={{ marginBottom: 8 }}>
              <Switch checked={locked} onChange={setLocked} checkedChildren="锁" unCheckedChildren="无" />
            </Form.Item>
            <Button type="primary" ghost style={{ marginBottom: 8 }} onClick={handleAdd}>
              添加隔离点
            </Button>
          </Space>
        </div>
      )}
    </Card>
  );
}

/* ---------------- 巡检读数 ---------------- */

function ReadingSection({ permit, editable }: { permit: Permit; editable: boolean }) {
  const addReading = usePermitStore((s) => s.addReading);
  const removeReading = usePermitStore((s) => s.removeReading);
  const [preset, setPreset] = useState<string>();
  const [value, setValue] = useState("");
  const [inspector, setInspector] = useState("");

  const selected = INSPECTION_PRESETS.find((p) => p.item === preset);

  const columns: ColumnsType<InspectionReading> = [
    { title: "巡检项", dataIndex: "item" },
    {
      title: "读数",
      key: "value",
      width: 140,
      render: (_, row) => (
        <strong>
          {row.value} <Text type="secondary">{row.unit}</Text>
        </strong>
      )
    },
    { title: "限值", dataIndex: "limit", width: 150 },
    {
      title: "判定",
      dataIndex: "result",
      width: 90,
      render: (v: string) => <Tag color={v === "合格" ? "green" : "red"}>{v}</Tag>
    },
    { title: "巡检人", dataIndex: "inspector", width: 100 },
    { title: "检测时间", dataIndex: "inspectedAt", width: 150, render: (v: string) => fmtDateTime(v) },
    ...(editable
      ? [
          {
            title: "",
            key: "op",
            width: 60,
            render: (_: unknown, row: InspectionReading) => (
              <Popconfirm title="删除该读数？" onConfirm={() => removeReading(permit.id, row.id)}>
                <Button type="link" danger size="small">
                  删除
                </Button>
              </Popconfirm>
            )
          } as ColumnsType<InspectionReading>[number]
        ]
      : [])
  ];

  function handleAdd() {
    if (!selected || value === "" || !inspector.trim()) return;
    const result = evaluateReading(value, selected.limit) ?? "不合格";
    addReading(permit.id, {
      item: selected.item,
      value,
      unit: selected.unit,
      limit: selected.limit,
      result,
      inspector: inspector.trim(),
      inspectedAt: new Date().toISOString()
    });
    setValue("");
    setInspector("");
  }

  return (
    <Card
      size="small"
      title={<span><CheckCircleOutlined /> 动火前巡检读数（{permit.readings.length}）</span>}
      className="drawer-card"
    >
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={permit.readings}
        pagination={false}
        locale={{ emptyText: "暂无巡检读数，签发前须完成可燃气体浓度等检测" }}
      />
      {editable && (
        <div className="sub-form">
          <Space wrap align="end">
            <Form.Item label="检测项" style={{ marginBottom: 8, width: 220 }}>
              <Select
                placeholder="选择检测项"
                value={preset}
                onChange={setPreset}
                options={INSPECTION_PRESETS.map((p) => ({
                  value: p.item,
                  label: `${p.item}（限值 ${p.limit} ${p.unit}）`
                }))}
              />
            </Form.Item>
            <Form.Item label={`读数${selected ? ` (${selected.unit})` : ""}`} style={{ marginBottom: 8, width: 130 }}>
              <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="数值" inputMode="decimal" />
            </Form.Item>
            <Form.Item label="巡检人" style={{ marginBottom: 8, width: 130 }}>
              <Input value={inspector} onChange={(e) => setInspector(e.target.value)} />
            </Form.Item>
            <Button type="primary" ghost style={{ marginBottom: 8 }} onClick={handleAdd}>
              冻结前添加读数
            </Button>
          </Space>
          {selected && value !== "" && evaluateReading(value, selected.limit) && (
            <Tag color={evaluateReading(value, selected.limit) === "合格" ? "green" : "red"}>
              系统预判：{evaluateReading(value, selected.limit)}
            </Tag>
          )}
        </div>
      )}
    </Card>
  );
}

/* ---------------- 签发前校验 ---------------- */

function buildBlockReasons(permit: Permit, permits: Permit[]): BlockReason[] {
  const reasons: BlockReason[] = [];
  if (!permit.area || !permit.equipmentKey || !permit.guardian.trim() || !permit.startAt || !permit.endAt) {
    reasons.push({ level: "block", text: "作业区域、设备、许可时段或监护人不完整" });
  }
  if (new Date(permit.endAt).getTime() <= new Date(permit.startAt).getTime()) {
    reasons.push({ level: "block", text: "许可时段结束时间必须晚于开始时间" });
  }
  if (permit.shutdown.state !== "stopped") {
    reasons.push({ level: "block", text: "油罐 / 加油机 / 管线仍在用，须先记录停用状态" });
  } else {
    if (!permit.shutdown.stoppedAt || !permit.shutdown.method || !permit.shutdown.recorder.trim()) {
      reasons.push({ level: "block", text: "停用状态缺少停用时间、停用方式或记录人" });
    }
  }
  if (permit.isolation.length === 0) {
    reasons.push({ level: "block", text: "尚未登记任何隔离点" });
  } else {
    if (permit.isolation.some((p) => !p.confirmer.trim())) {
      reasons.push({ level: "block", text: "存在未填写确认人的隔离点" });
    }
    if (permit.isolation.some((p) => !p.locked)) {
      reasons.push({ level: "block", text: "存在未上锁挂签的隔离点" });
    }
  }
  if (permit.readings.length === 0) {
    reasons.push({ level: "block", text: "尚无动火前巡检读数" });
  } else if (permit.readings.some((r) => r.result === "不合格")) {
    reasons.push({ level: "block", text: "存在不合格巡检读数，不得动火" });
  }

  const conflicts = conflictsForCandidate(
    {
      area: permit.area,
      equipmentKey: permit.equipmentKey,
      startAt: permit.startAt,
      endAt: permit.endAt,
      baseId: permit.baseId
    },
    permits
  );
  conflicts.forEach((c) => {
    reasons.push({
      level: "block",
      text: `${c.reasonText}：${c.b.code} V${c.b.version}（${c.area}·${c.b.equipmentName}）原值时段 ${fullRange(
        c.b.startAt,
        c.b.endAt
      )}，监护人 ${c.b.guardian}；只能保留一张作业票`
    });
  });
  return reasons;
}

function IssueSection({ permit, onClose }: { permit: Permit; onClose: () => void }) {
  const permits = usePermitStore((s) => s.permits);
  const issue = usePermitStore((s) => s.issue);
  const removeDraft = usePermitStore((s) => s.removeDraft);
  const [issueNote, setIssueNote] = useState(permit.issueNote);

  const reasons = useMemo(() => buildBlockReasons(permit, permits), [permit, permits]);
  const blocked = reasons.length > 0;

  return (
    <Card size="small" title="签发确认" className="drawer-card issue-card">
      {blocked ? (
        <Alert
          type="error"
          showIcon
          message="以下条件未满足，作业票暂不能签发："
          description={
            <ul className="reason-list">
              {reasons.map((r, i) => (
                <li key={i}>{r.text}</li>
              ))}
            </ul>
          }
          style={{ marginBottom: 12 }}
        />
      ) : (
        <Alert
          type="success"
          showIcon
          message="停用、隔离、巡检读数及时段校验均已通过，可以签发"
          style={{ marginBottom: 12 }}
        />
      )}
      <Form layout="vertical">
        <Form.Item label="签发意见">
          <Input.TextArea
            rows={2}
            value={issueNote}
            onChange={(e) => setIssueNote(e.target.value)}
            placeholder="签发人现场复核说明（盲板、上锁、检测值复核等）"
          />
        </Form.Item>
        <Space>
          <Button
            type="primary"
            icon={<LockOutlined />}
            disabled={blocked}
            onClick={() => {
              Modal.confirm({
                title: "确认签发作业票？",
                content: "签发后巡检读数与隔离清单将被冻结，任何现场条件变化只能回收后新建版本。",
                okText: "确认签发并冻结",
                cancelText: "取消",
                onOk: () => {
                  issue(permit.id, {
                    area: permit.area,
                    equipmentKey: permit.equipmentKey,
                    equipmentName: permit.equipmentName,
                    equipmentKind: permit.equipmentKind,
                    startAt: permit.startAt,
                    endAt: permit.endAt,
                    guardian: permit.guardian,
                    issueNote: issueNote.trim() || "现场复核合格，准予动火"
                  });
                  onClose();
                }
              });
            }}
          >
            签发并冻结
          </Button>
          <Popconfirm
            title="删除该待签发作业票？"
            onConfirm={() => {
              removeDraft(permit.id);
              onClose();
            }}
          >
            <Button danger>作废删除</Button>
          </Popconfirm>
        </Space>
      </Form>
    </Card>
  );
}

/* ---------------- 已签发票据操作：回收 / 新建版本 ---------------- */

function IssuedActions({ permit, onClose }: { permit: Permit; onClose: () => void }) {
  const reclaim = usePermitStore((s) => s.reclaim);
  const createNewVersion = usePermitStore((s) => s.createNewVersion);
  const [reclaimOpen, setReclaimOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [reclaimReason, setReclaimReason] = useState("");
  const [versionReason, setVersionReason] = useState("");

  return (
    <Card size="small" title="许可处置" className="drawer-card">
      <Space wrap>
        <Button
          danger
          icon={<StopOutlined />}
          onClick={() => {
            setReclaimReason("");
            setReclaimOpen(true);
          }}
        >
          回收许可
        </Button>
        <Button
          type="primary"
          ghost
          icon={<CopyOutlined />}
          onClick={() => {
            setVersionReason("");
            setVersionOpen(true);
          }}
        >
          现场条件变化 · 新建版本
        </Button>
      </Space>

      <Paragraph type="secondary" style={{ marginTop: 10, marginBottom: 0, fontSize: 13 }}>
        新建版本将自动回收 V{permit.version} 原许可，并沿用票号 {permit.code} 生成 V
        {permit.version + 1} 草稿，携带冻结的隔离与巡检数据供重新核对，原票保留可追溯。
      </Paragraph>

      <Modal
        title="回收作业许可"
        open={reclaimOpen}
        okText="确认回收"
        okButtonProps={{ danger: true, disabled: !reclaimReason.trim() }}
        cancelText="取消"
        onOk={() => {
          reclaim(permit.id, reclaimReason.trim());
          setReclaimOpen(false);
          onClose();
        }}
        onCancel={() => setReclaimOpen(false)}
      >
        <Alert type="warning" showIcon message="回收后该许可立即失效，现场必须停止动火。" style={{ marginBottom: 12 }} />
        <Input.TextArea
          rows={3}
          value={reclaimReason}
          onChange={(e) => setReclaimReason(e.target.value)}
          placeholder="填写回收原因（作业完成 / 天气变化 / 设备状态变化等，必填）"
        />
      </Modal>

      <Modal
        title={`现场条件变化 · 新建 ${permit.code} V${permit.version + 1}`}
        open={versionOpen}
        okText="回收原票并新建版本"
        cancelText="取消"
        okButtonProps={{ disabled: !versionReason.trim() }}
        onOk={() => {
          createNewVersion(permit.id, {
            area: permit.area,
            equipmentKey: permit.equipmentKey,
            equipmentName: permit.equipmentName,
            equipmentKind: permit.equipmentKind,
            startAt: permit.startAt,
            endAt: permit.endAt,
            guardian: permit.guardian,
            issueNote: "",
            reason: versionReason.trim()
          });
          setVersionOpen(false);
          onClose();
        }}
        onCancel={() => setVersionOpen(false)}
      >
        <Alert
          type="info"
          showIcon
          message={`原许可 V${permit.version} 将被标记回收（需现场停止动火并交回票据），新版本为待签发状态。`}
          style={{ marginBottom: 12 }}
        />
        <Input.TextArea
          rows={3}
          value={versionReason}
          onChange={(e) => setVersionReason(e.target.value)}
          placeholder="填写现场条件变化原因（如：周边罐车卸油、风向变化、监护调整、检测值波动等，必填）"
        />
      </Modal>
    </Card>
  );
}

/* ---------------- 版本链 ---------------- */

function VersionChain({
  current,
  permits,
  onOpen
}: {
  current: Permit;
  permits: Permit[];
  onOpen: (id: string) => void;
}) {
  const chain = useMemo(
    () => permits.filter((p) => p.baseId === current.baseId).sort((a, b) => b.version - a.version),
    [permits, current.baseId]
  );
  if (chain.length <= 1 && current.version === 1) {
    return (
      <Card size="small" title="版本记录" className="drawer-card">
        <Timeline
          items={[
            {
              color: "blue",
              children: (
                <>
                  <strong>{current.code} V1</strong> 首次创建
                </>
              )
            }
          ]}
        />
      </Card>
    );
  }
  return (
    <Card size="small" title={`版本记录（${current.code} 共 ${chain.length} 个版本）`} className="drawer-card">
      <Timeline
        items={chain.map((p) => ({
          color: p.status === "issued" ? "green" : p.status === "draft" ? "gold" : "gray",
          children: (
            <Space direction="vertical" size={2}>
              <Space>
                <a onClick={() => onOpen(p.id)}>
                  <strong>V{p.version}</strong>
                </a>
                <Tag color={p.status === "issued" ? "green" : p.status === "draft" ? "gold" : "default"}>
                  {STATUS_TEXT[p.status]}
                </Tag>
                {p.id === current.id && <Tag color="blue">当前查看</Tag>}
              </Space>
              {p.revisionReason && <Text type="secondary">换版原因：{p.revisionReason}</Text>}
              <Text type="secondary" style={{ fontSize: 12 }}>
                时段 {fullRange(p.startAt, p.endAt)} · 监护人 {p.guardian}
                {p.issuedAt && ` · 签发 ${fmtDateTime(p.issuedAt)}`}
                {p.reclaimedAt && ` · 回收 ${fmtDateTime(p.reclaimedAt)}`}
              </Text>
            </Space>
          )
        }))}
      />
      <Divider style={{ margin: "8px 0" }} />
      <Text type="secondary" style={{ fontSize: 12 }}>
        每次现场条件变化都回收原许可并新建带原因版本；相邻或重叠时段同一区域仅保留一张有效作业票。
      </Text>
    </Card>
  );
}
