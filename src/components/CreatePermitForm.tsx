import { useMemo, useState } from "react";
import { Alert, Button, Card, DatePicker, Form, Input, Select, Tag } from "antd";
import type { FormInstance } from "antd";
import { FireOutlined, WarningOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { AREAS, EQUIPMENT, EQUIPMENT_KIND_TEXT } from "../constants";
import { conflictsForCandidate } from "../conflict";
import { usePermitStore } from "../store";
import { fullRange } from "../utils";
import type { Permit } from "../types";

type FormValues = {
  area: string;
  equipmentKey: string;
  range: [dayjs.Dayjs, dayjs.Dayjs];
  guardian: string;
};

export default function CreatePermitForm({ onCreated }: { onCreated: (p: Permit) => void }) {
  const [form] = Form.useForm<FormValues>();
  const permits = usePermitStore((s) => s.permits);
  const createDraft = usePermitStore((s) => s.createDraft);
  const [area, setArea] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const equipmentOptions = useMemo(
    () =>
      EQUIPMENT.filter((item) => !area || item.area === area).map((item) => ({
        value: item.key,
        label: `${item.name}（${EQUIPMENT_KIND_TEXT[item.kind]}）`
      })),
    [area]
  );

  const areaVal = Form.useWatch("area", form) as string | undefined;
  const equipmentVal = Form.useWatch("equipmentKey", form) as string | undefined;
  const rangeVal = Form.useWatch("range", form) as [dayjs.Dayjs, dayjs.Dayjs] | undefined;

  const previewConflicts = useMemo(() => {
    if (!areaVal || !rangeVal?.[0] || !rangeVal?.[1]) return [];
    return conflictsForCandidate(
      {
        area: areaVal,
        equipmentKey: equipmentVal ?? "",
        startAt: rangeVal[0].toISOString(),
        endAt: rangeVal[1].toISOString()
      },
      permits
    );
  }, [areaVal, equipmentVal, rangeVal, permits]);

  async function handleSubmit() {
    const values = await form.validateFields();
    const equipment = EQUIPMENT.find((item) => item.key === values.equipmentKey)!;
    setSubmitting(true);
    const permit = createDraft({
      area: values.area,
      equipmentKey: equipment.key,
      equipmentName: equipment.name,
      equipmentKind: equipment.kind,
      startAt: values.range[0].toISOString(),
      endAt: values.range[1].toISOString(),
      guardian: values.guardian.trim()
    });
    setSubmitting(false);
    form.resetFields();
    setArea(undefined);
    onCreated(permit);
  }

  return (
    <Card
      className="panel-card"
      title={
        <span>
          <FireOutlined /> 创建动火作业票
        </span>
      }
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          label="作业区域"
          name="area"
          rules={[{ required: true, message: "请选择作业区域" }]}
          extra="同一区域内许可时段相邻或重叠时，只允许保留一张已签发作业票"
        >
          <Select
            placeholder="选择防火区域"
            options={AREAS.map((a) => ({ value: a.key, label: a.name }))}
            onChange={(value) => {
              setArea(value);
              form.setFieldValue("equipmentKey", undefined);
            }}
          />
        </Form.Item>

        <Form.Item label="动火设备" name="equipmentKey" rules={[{ required: true, message: "请选择动火设备" }]}>
          <Select
            placeholder={area ? "选择油罐 / 加油机 / 管线" : "请先选择区域"}
            disabled={!area}
            options={equipmentOptions}
            optionRender={(option) => (
              <span>
                {option.label}
                <Tag color="geekblue" style={{ marginInlineStart: 8 }}>
                  {EQUIPMENT_KIND_TEXT[EQUIPMENT.find((e) => e.key === option.value)?.kind ?? ""]}
                </Tag>
              </span>
            )}
          />
        </Form.Item>

        <Form.Item
          label="许可时段"
          name="range"
          rules={[
            { required: true, message: "请选择许可时段" },
            {
              validator: (_, value) =>
                value && value[0] && value[1] && value[1].diff(value[0], "minute") > 0
                  ? Promise.resolve()
                  : Promise.reject(new Error("结束时间必须晚于开始时间"))
            }
          ]}
        >
          <DatePicker.RangePicker showTime={{ format: "HH:mm" }} format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item label="监护人" name="guardian" rules={[{ required: true, message: "请填写现场监护人" }]}>
          <Input placeholder="填写全程在场监护人姓名" maxLength={20} />
        </Form.Item>

        <CandidateConflictHint conflicts={previewConflicts} />

        <Button type="primary" block size="large" loading={submitting} onClick={handleSubmit}>
          新建作业票（待签发）
        </Button>
      </Form>
    </Card>
  );
}

function CandidateConflictHint({ conflicts }: { conflicts: ReturnType<typeof conflictsForCandidate> }) {
  if (conflicts.length === 0) return null;
  return (
    <Alert
      className="conflict-hint"
      type="error"
      showIcon
      icon={<WarningOutlined />}
      message="该时段与已签发作业票冲突，需调整时段或先回收原票"
      description={
        <ul className="conflict-mini-list">
          {conflicts.map((c) => (
            <li key={c.key}>
              <Tag color={c.reason === "overlap" ? "red" : "orange"}>{c.reasonText}</Tag>
              <strong>{c.b.code} V{c.b.version}</strong>（{c.area}·{c.b.equipmentName}）
              <br />
              原时段：{fullRange(c.b.startAt, c.b.endAt)}；监护人：{c.b.guardian}
            </li>
          ))}
        </ul>
      }
    />
  );
}
