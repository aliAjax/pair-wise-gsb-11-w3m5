import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  message,
} from "antd";
import {
  CopyOutlined,
  DeleteOutlined,
  LockOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import type {
  Equipment,
  InspectionReading,
  IsolationMethod,
  IsolationPoint,
  Permit,
  PermitConflict,
  SaveResult,
} from "../types";
import { DATETIME_FORMAT, READING_SPECS, readingQualified } from "../domain";
import { useStore } from "../store";

const { RangePicker } = DatePicker;

const ISOLATION_METHODS: IsolationMethod[] = [
  "盲板隔离",
  "阀门关断",
  "加装堵头",
  "电气断电上锁",
];

function fmt(iso?: string): string {
  return iso ? dayjs(iso).format(DATETIME_FORMAT) : "—";
}

const statusColor: Record<Permit["status"], string> = {
  草稿: "default",
  已签发: "green",
  已作旧: "orange",
  已回收: "red",
};

export default function PermitDrawer({
  permitId,
  onClose,
}: {
  permitId: string | null;
  onClose: () => void;
}) {
  const {
    areas,
    equipment,
    permits,
    saveDraft,
    issuePermit,
    newVersion,
    recoverPermit,
    deletePermit,
    setEquipmentStop,
  } = useStore();
  const saved = useStore((s) => s.permits.find((p) => p.id === permitId));
  // 本地可编辑副本；签发冻结后只读
  const [draft, setDraft] = useState<Permit | null>(null);
  const [lastResult, setLastResult] = useState<SaveResult | null>(null);
  const [stopTarget, setStopTarget] = useState<Equipment | null>(null);
  const [versionOpen, setVersionOpen] = useState(false);
  const [versionReason, setVersionReason] = useState("");
  const [confirmIssueOpen, setConfirmIssueOpen] = useState(false);

  const permit = draft ?? saved;
  const open = Boolean(permitId);

  // 打开草稿票时先克隆到本地编辑态；已签发/已作旧/已回收票直接只读展示
  useEffect(() => {
    setDraft(null);
    setLastResult(null);
    if (saved && saved.status === "草稿") setDraft(structuredClone(saved));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permitId]);

  if (!permit) return <Drawer open={false} onClose={onClose} />;

  const readOnly = permit.frozen || permit.status === "已作旧" || permit.status === "已回收";
  const area = areas.find((a) => a.id === permit.areaId);
  const eq = equipment.find((e) => e.id === permit.equipmentId);
  const areaEquipments = equipment.filter((e) => e.areaId === permit.areaId);

  // 同票号版本链（巡检/作业票版本）
  const versions = permits
    .filter((p) => p.permitNo === permit.permitNo)
    .sort((a, b) => a.version - b.version);

  function patch(changes: Partial<Permit>) {
    setDraft((d) => (d ? { ...d, ...changes } : d));
    setLastResult(null);
  }

  function persist(): boolean {
    if (!draft) return false;
    const result = saveDraft(draft);
    setLastResult(result);
    if (result.ok) {
      // 保存成功后以存储中的最新值继续保持编辑态
      const synced = useStore.getState().permits.find((p) => p.id === draft.id);
      setDraft(synced ? { ...synced } : draft);
      message.success("作业票草稿已保存");
      return true;
    }
    return false;
  }

  function tryIssue() {
    if (!draft) return;
    setConfirmIssueOpen(false);
    const result = issuePermit(draft, "站长 方启明");
    setLastResult(result);
    if (result.ok) {
      setDraft(null);
      message.success(`作业票 ${draft.permitNo} v${draft.version} 已签发，巡检读数与隔离清单已冻结`);
    } else {
      message.error("签发条件不满足，请按提示处理");
    }
  }

  function createVersion() {
    if (!permit || permit.status !== "已签发") return;
    if (!versionReason.trim()) {
      message.warning("请填写现场条件变化原因");
      return;
    }
    const newId = newVersion(permit, versionReason);
    setVersionOpen(false);
    setVersionReason("");
    setDraft(null);
    message.warning("原许可已回收作旧，新版本需重新确认隔离点与巡检读数后签发");
    onClose();
    // 打开新版本
    queueMicrotask(() => openById(newId));
  }

  function openById(id: string) {
    const target = useStore.getState().permits.find((p) => p.id === id);
    if (target) setDraft({ ...target });
  }

  function editSaved() {
    if (saved) setDraft({ ...saved });
    setLastResult(null);
  }

  // ---------- 隔离点编辑 ----------
  function addIsolation() {
    const cur = draft!;
    const row: IsolationPoint = {
      id: crypto.randomUUID(),
      name: "",
      method: "阀门关断",
      confirmed: false,
      confirmer: "",
      confirmedAt: "",
    };
    patch({ isolations: [...cur.isolations, row] });
  }
  function updateIsolation(id: string, changes: Partial<IsolationPoint>) {
    patch({
      isolations: draft!.isolations.map((i) =>
        i.id === id
          ? {
              ...i,
              ...changes,
              // 勾选“已确认”时自动补确认时间
              confirmedAt:
                changes.confirmed && !i.confirmed
                  ? changes.confirmedAt || new Date().toISOString()
                  : i.confirmedAt,
              // 取消勾选则清空确认人/时间
              ...(changes.confirmed === false
                ? { confirmer: "", confirmedAt: "" }
                : {}),
            }
          : i
      ),
    });
  }

  // ---------- 巡检读数编辑 ----------
  function updateReading(id: string, changes: Partial<InspectionReading>) {
    patch({
      readings: draft!.readings.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...changes };
        if (changes.value !== undefined && changes.value !== "")
          next.qualified = readingQualified(r.metric, Number(changes.value));
        if (changes.value === "") next.qualified = false;
        return next;
      }),
    });
  }

  const title = (
    <Space wrap>
      <span>{permit.permitNo}</span>
      <Tag>v{permit.version}</Tag>
      <Tag color={statusColor[permit.status]}>{permit.status}</Tag>
      {permit.frozen && <Tag icon={<LockOutlined />} color="geekblue">已冻结</Tag>}
      {permit.status === "已签发" && versions.length > 1 && <Tag color="purple">迭代票</Tag>}
    </Space>
  );

  return (
    <>
      <Drawer
        title={title}
        width={980}
        open={open}
        onClose={() => {
          setDraft(null);
          setLastResult(null);
          onClose();
        }}
        extra={
          <Space>
            {permit.status === "已签发" && (
              <Button
                danger
                icon={<CopyOutlined />}
                onClick={() => setVersionOpen(true)}
              >
                现场条件变化，新建版本
              </Button>
            )}
            {permit.status === "已签发" && (
              <Popconfirm
                title="回收原许可"
                description="回收后该作业票不再占用区域/设备时段。"
                onConfirm={() => {
                  recoverPermit(permit.id, "作业完成，许可回收");
                  setDraft(null);
                  message.success("作业票已回收");
                  onClose();
                }}
              >
                <Button>完工回收</Button>
              </Popconfirm>
            )}
          </Space>
        }
        footer={
          permit.status === "草稿" ? (
            <Space style={{ float: "right" }}>
              <Button onClick={() => persist()}>保存草稿（校验冲突）</Button>
              <Button
                type="primary"
                icon={<SafetyCertificateOutlined />}
                onClick={() => {
                  // 先保存校验冲突，再走签发闸口
                  if (draft) {
                    const r = saveDraft(draft);
                    setLastResult(r);
                    if (!r.ok) {
                      message.error("存在冲突或不满足签发条件");
                      return;
                    }
                    const synced = useStore.getState().permits.find((p) => p.id === draft.id)!;
                    setDraft({ ...synced });
                    setConfirmIssueOpen(true);
                  } else if (saved) {
                    setDraft({ ...saved });
                    setConfirmIssueOpen(true);
                  }
                }}
              >
                检查并签发
              </Button>
            </Space>
          ) : (
            <Space style={{ float: "right" }}>
              {permit.status === "已作旧" && permit.supersededBy && (
                <Button
                  type="primary"
                  ghost
                  onClick={() => {
                    onClose();
                    queueMicrotask(() => openById(permit.supersededBy!));
                  }}
                >
                  查看新版本 v{versions.find((v) => v.id === permit.supersededBy)?.version}
                </Button>
              )}
              <Button onClick={onClose}>关闭</Button>
            </Space>
          )
        }
      >
        {/* 冲突 / 校验结果：列出区域、设备、时段与原值 */}
        {lastResult && !lastResult.ok && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 14 }}
            message={lastResult.errors?.[0] ?? "校验未通过"}
            description={
              <Space direction="vertical" style={{ width: "100%" }}>
                {lastResult.errors && lastResult.errors.length > 1 && (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {lastResult.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
                {lastResult.conflicts?.map((c) => {
                  const cur = c.a.id === permit.id ? c.a : c.b;
                  const other = c.a.id === permit.id ? c.b : c.a;
                  const oEq = equipment.find((x) => x.id === other.equipmentId);
                  const oArea = areas.find((x) => x.id === other.areaId);
                  return (
                    <div key={other.id} className="conflict-box">
                      <div>
                        <Badge status="error" text={
                          <Space wrap>
                            <strong>{other.permitNo} v{other.version}</strong>
                            <Tag>{c.adjacent ? "时段相邻" : "时段重叠"}</Tag>
                            {c.sameArea && <Tag color="red">同区域</Tag>}
                            {c.sameEquipment && <Tag color="volcano">同设备</Tag>}
                          </Space>
                        } />
                      </div>
                      <table className="diff-table">
                        <thead>
                          <tr><th>字段</th><th>当前票（原值）</th><th>冲突票</th></tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>区域</td>
                            <td>{areas.find((x) => x.id === cur.areaId)?.name}</td>
                            <td>{oArea?.name}</td>
                          </tr>
                          <tr>
                            <td>设备</td>
                            <td>{equipment.find((x) => x.id === cur.equipmentId)?.name ?? "—"}</td>
                            <td>{oEq ? `${oEq.name}（${oEq.code}）` : "—"}</td>
                          </tr>
                          <tr>
                            <td>许可时段</td>
                            <td>{fmt(cur.startAt)} ~ {fmt(cur.endAt)}</td>
                            <td>{fmt(other.startAt)} ~ {fmt(other.endAt)}</td>
                          </tr>
                          <tr>
                            <td>作业票号</td>
                            <td>{cur.permitNo}</td>
                            <td>{other.permitNo}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </Space>
            }
          />
        )}

        {/* 1. 作业基本信息 */}
        <Divider orientation="left">作业票信息（区域 / 设备 / 许可时段 / 监护人）</Divider>
        <Form layout="vertical" disabled={readOnly}>
          <div className="form-row">
            <Form.Item label="区域" required>
              <Select
                value={permit.areaId}
                options={areas.map((a) => ({ value: a.id, label: a.name }))}
                onChange={(areaId) => {
                  const firstEq = equipment.find((e) => e.areaId === areaId);
                  patch({ areaId, equipmentId: firstEq?.id ?? "" });
                }}
              />
            </Form.Item>
            <Form.Item label="动火设备（油罐/加油机/管线）" required>
              <Select
                value={permit.equipmentId || undefined}
                placeholder="请选择设备"
                options={areaEquipments.map((e) => ({
                  value: e.id,
                  label: `${e.name}（${e.code}）`,
                }))}
                onChange={(equipmentId) => patch({ equipmentId })}
              />
            </Form.Item>
          </div>
          <div className="form-row">
            <Form.Item label="动火等级">
              <Select
                value={permit.fireLevel}
                options={[{ value: "一级动火", label: "一级动火" }, { value: "二级动火", label: "二级动火" }]}
                onChange={(fireLevel) => patch({ fireLevel })}
              />
            </Form.Item>
            <Form.Item label="申请人">
              <Input value={permit.applicant} onChange={(e) => patch({ applicant: e.target.value })} />
            </Form.Item>
            <Form.Item label="监护人" required>
              <Input value={permit.watcher} onChange={(e) => patch({ watcher: e.target.value })} placeholder="现场专职监护人" />
            </Form.Item>
          </div>
          <Form.Item label="许可时段（相邻或重叠时段同一区域/设备只能保留一张作业票）" required>
            <RangePicker
              showTime={{ format: "HH:mm", minuteStep: 15 }}
              format={DATETIME_FORMAT}
              style={{ width: "100%" }}
              value={
                permit.startAt && permit.endAt
                  ? [dayjs(permit.startAt), dayjs(permit.endAt)]
                  : [null, null] as [Dayjs | null, Dayjs | null]
              }
              onChange={(range) => {
                if (range && range[0] && range[1]) {
                  patch({ startAt: range[0].toISOString(), endAt: range[1].toISOString() });
                } else {
                  patch({ startAt: "", endAt: "" });
                }
              }}
            />
          </Form.Item>
          <Form.Item label="动火作业内容" required>
            <Input.TextArea
              rows={2}
              value={permit.workContent}
              onChange={(e) => patch({ workContent: e.target.value })}
            />
          </Form.Item>
          {permit.changeReason && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={`现场条件变化原因（v${permit.version}）：${permit.changeReason}`}
            />
          )}
        </Form>

        {/* 2. 设备停用状态 */}
        <Divider orientation="left">设备停用状态</Divider>
        {eq ? (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Space wrap>
              <strong>{eq.name}（{eq.code}）</strong>
              <Tag color={eq.status === "在用" ? "red" : "green"}>{eq.status}</Tag>
              {eq.status === "停用" && eq.stop && (
                <span className="muted">
                  停用时间 {fmt(eq.stop.stoppedAt)} ｜ 停用原因：{eq.stop.reason} ｜ 确认人：{eq.stop.operator}
                </span>
              )}
              {!readOnly && eq.status === "在用" && (
                <Button size="small" danger ghost onClick={() => setStopTarget(eq)}>
                  登记停用（油罐/加油机/管线在用不能签发）
                </Button>
              )}
            </Space>
            {eq.status === "在用" && (
              <Alert
                type="error"
                showIcon
                message="该设备仍处于在用状态：请先记录停用状态、隔离点和确认人，否则作业票无法签发。"
              />
            )}
          </Space>
        ) : (
          <Alert type="info" showIcon message="请先选择动火设备" />
        )}

        {/* 3. 隔离点清单 */}
        <Divider orientation="left">
          <Space>隔离点清单 {permit.frozen && <Tag icon={<LockOutlined />}>签发时已冻结</Tag>}</Space>
        </Divider>
        <Table<IsolationPoint>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={permit.isolations}
          footer={() =>
            !readOnly ? (
              <Button type="dashed" icon={<PlusOutlined />} onClick={addIsolation} block>
                新增隔离点
              </Button>
            ) : undefined
          }
          columns={[
            {
              title: "隔离点/位置",
              dataIndex: "name",
              render: (v, row) =>
                readOnly ? v || "—" : (
                  <Input value={v} placeholder="如：进油阀 V-01" onChange={(e) => updateIsolation(row.id, { name: e.target.value })} />
                ),
            },
            {
              title: "隔离方式",
              dataIndex: "method",
              width: 150,
              render: (v, row) =>
                readOnly ? v : (
                  <Select
                    style={{ width: "100%" }}
                    value={v}
                    options={ISOLATION_METHODS.map((m) => ({ value: m, label: m }))}
                    onChange={(method) => updateIsolation(row.id, { method })}
                  />
                ),
            },
            {
              title: "确认人",
              dataIndex: "confirmer",
              width: 130,
              render: (v, row) =>
                readOnly ? v || "—" : (
                  <Input value={v} placeholder="确认人" onChange={(e) => updateIsolation(row.id, { confirmer: e.target.value })} />
                ),
            },
            {
              title: "确认时间",
              dataIndex: "confirmedAt",
              width: 160,
              render: (v) => (v ? fmt(v) : "—"),
            },
            {
              title: "确认到位",
              dataIndex: "confirmed",
              width: 100,
              render: (v, row) =>
                readOnly ? (
                  <Tag color={v ? "green" : "default"}>{v ? "已确认" : "未确认"}</Tag>
                ) : (
                  <Select
                    style={{ width: "100%" }}
                    value={v ? "yes" : "no"}
                    options={[
                      { value: "yes", label: "已确认" },
                      { value: "no", label: "未确认" },
                    ]}
                    onChange={(val) => updateIsolation(row.id, { confirmed: val === "yes" })}
                  />
                ),
            },
            ...(!readOnly
              ? [
                  {
                    title: "",
                    width: 44,
                    render: (_: unknown, row: IsolationPoint) => (
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() =>
                          patch({ isolations: permit.isolations.filter((i) => i.id !== row.id) })
                        }
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />

        {/* 4. 巡检读数（签发后冻结） */}
        <Divider orientation="left">
          <Space>动火前巡检读数 {permit.frozen && <Tag icon={<LockOutlined />}>签发时已冻结</Tag>}</Space>
        </Divider>
        <Table<InspectionReading>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={permit.readings}
          columns={[
            { title: "检测项", dataIndex: "metric", width: 150 },
            {
              title: "读数",
              dataIndex: "value",
              width: 150,
              render: (v: number | "", row) =>
                readOnly ? (
                  <span>{v === "" ? "—" : v} {row.unit}</span>
                ) : (
                  <InputNumber
                    style={{ width: "100%" }}
                    value={v === "" ? null : v}
                    placeholder="数值"
                    onChange={(val) => updateReading(row.id, { value: val === null ? "" : Number(val) })}
                    addonAfter={row.unit}
                  />
                ),
            },
            {
              title: "判定",
              dataIndex: "qualified",
              width: 100,
              render: (v, row) =>
                row.value === "" ? (
                  <Tag>待检测</Tag>
                ) : (
                  <Tag color={v ? "green" : "red"}>{v ? "合格" : "不合格"}</Tag>
                ),
            },
            {
              title: "检测时间",
              dataIndex: "measuredAt",
              width: 200,
              render: (v, row) =>
                readOnly ? (
                  fmt(v)
                ) : (
                  <DatePicker
                    style={{ width: "100%" }}
                    showTime={{ format: "HH:mm", minuteStep: 5 }}
                    format={DATETIME_FORMAT}
                    value={v ? dayjs(v) : null}
                    onChange={(d) => updateReading(row.id, { measuredAt: d ? d.toISOString() : "" })}
                  />
                ),
            },
            {
              title: "确认人",
              dataIndex: "inspector",
              width: 130,
              render: (v, row) =>
                readOnly ? v || "—" : (
                  <Input value={v} placeholder="巡检确认人" onChange={(e) => updateReading(row.id, { inspector: e.target.value })} />
                ),
            },
          ]}
        />
        <div className="limit-hint">
          {READING_SPECS.map((s) => `${s.metric}：${s.limitText}`).join("　｜　")}
        </div>

        {/* 5. 版本链 */}
        <Divider orientation="left">版本与回收记录</Divider>
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="票号">{permit.permitNo}</Descriptions.Item>
          <Descriptions.Item label="当前版本">v{permit.version}（{permit.status}）</Descriptions.Item>
          <Descriptions.Item label="签发人">{permit.issuer ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="签发时间">{fmt(permit.issuedAt)}</Descriptions.Item>
          <Descriptions.Item label="回收时间">{fmt(permit.recoveredAt)}</Descriptions.Item>
          <Descriptions.Item label="回收/作旧原因">{permit.recoverReason ?? "—"}</Descriptions.Item>
        </Descriptions>
        <Timeline
          style={{ marginTop: 14 }}
          items={versions.map((v) => ({
            color:
              v.status === "已签发"
                ? "green"
                : v.status === "草稿"
                ? "blue"
                : v.status === "已作旧"
                ? "orange"
                : "red",
            children: (
              <Space wrap>
                <a onClick={() => { onClose(); queueMicrotask(() => openById(v.id)); }}>
                  {v.permitNo} v{v.version}
                </a>
                <Tag color={statusColor[v.status]}>{v.status}</Tag>
                <span className="muted">{fmt(v.startAt)} ~ {fmt(v.endAt)}</span>
                {v.changeReason && <span className="muted">变化原因：{v.changeReason}</span>}
              </Space>
            ),
          }))}
        />
      </Drawer>

      {/* 设备停用登记弹窗 */}
      <StopEquipmentModal
        equipment={stopTarget}
        onCancel={() => setStopTarget(null)}
        onSubmit={(rec) => {
          if (stopTarget) {
            setEquipmentStop(stopTarget.id, rec);
            message.success(`${stopTarget.name} 已登记停用`);
            setStopTarget(null);
          }
        }}
      />

      {/* 签发确认 */}
      <Modal
        title="确认签发作业票"
        open={confirmIssueOpen}
        onCancel={() => setConfirmIssueOpen(false)}
        onOk={tryIssue}
        okText="确认签发并冻结"
        cancelText="再检查一下"
      >
        <p>签发后将<strong>冻结本版本的巡检读数与隔离清单</strong>，不可再直接修改。</p>
        <p>现场条件发生变化时，需新建带原因的版本并回收原许可。</p>
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="区域">{area?.name}</Descriptions.Item>
          <Descriptions.Item label="设备">
            {eq ? `${eq.name}（${eq.code}）· ${eq.status}` : "—"}
          </Descriptions.Item>
          <Descriptions.Item label="时段">{fmt(permit.startAt)} ~ {fmt(permit.endAt)}</Descriptions.Item>
          <Descriptions.Item label="监护人">{permit.watcher || "—"}</Descriptions.Item>
        </Descriptions>
      </Modal>

      {/* 现场条件变化 → 新版本 */}
      <Modal
        title="现场条件变化：新建版本并回收原许可"
        open={versionOpen}
        onCancel={() => setVersionOpen(false)}
        onOk={createVersion}
        okText="回收原票，创建新版本"
        okButtonProps={{ danger: true, disabled: !versionReason.trim() }}
      >
        <Alert
          style={{ marginBottom: 12 }}
          type="warning"
          showIcon
          message="原许可将标记为「已作旧」并记录回收；新版本为草稿，隔离点需重新确认、巡检读数需重新检测后才能再次签发。"
        />
        <Input.TextArea
          rows={3}
          placeholder="请填写现场条件变化原因，如：风向变化、周边新增卸油作业、隔离点松动等"
          value={versionReason}
          onChange={(e) => setVersionReason(e.target.value)}
        />
      </Modal>
    </>
  );
}

/** 设备停用登记（停用状态 + 确认人 + 原因） */
function StopEquipmentModal({
  equipment,
  onCancel,
  onSubmit,
}: {
  equipment: Equipment | null;
  onCancel: () => void;
  onSubmit: (rec: NonNullable<Equipment["stop"]>) => void;
}) {
  const [reason, setReason] = useState("");
  const [operator, setOperator] = useState("");
  const [time, setTime] = useState<Dayjs | null>(dayjs());

  // 每次打开重置
  const key = equipment?.id ?? "none";

  return (
    <Modal
      key={key}
      title={equipment ? `登记停用：${equipment.name}（${equipment.code}）` : ""}
      open={Boolean(equipment)}
      onCancel={onCancel}
      onOk={() => {
        if (!reason.trim() || !operator.trim() || !time) return;
        onSubmit({ reason: reason.trim(), operator: operator.trim(), stoppedAt: time.toISOString() });
      }}
      okText="确认停用登记"
      okButtonProps={{ danger: true, disabled: !reason.trim() || !operator.trim() || !time }}
      afterOpenChange={(open) => {
        if (open) {
          setReason("");
          setOperator("");
          setTime(dayjs());
        }
      }}
    >
      <Alert
        style={{ marginBottom: 12 }}
        type="info"
        showIcon
        message="油罐、加油机或管线仍在用时不能签发作业票。请先登记停用，再在作业票内登记隔离点与确认人。"
      />
      <Form layout="vertical">
        <Form.Item label="停用时间" required>
          <DatePicker
            style={{ width: "100%" }}
            showTime={{ format: "HH:mm", minuteStep: 5 }}
            format={DATETIME_FORMAT}
            value={time}
            onChange={setTime}
          />
        </Form.Item>
        <Form.Item label="停用原因 / 措施（如倒空置换、断电上锁）" required>
          <Input.TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Form.Item>
        <Form.Item label="停用确认人" required>
          <Input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="确认停用的人员" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
