import { Link } from "react-router-dom";

import { Eyebrow } from "../components/Primitives.js";

const UPDATED = "2026-11-18";

interface LegalSection {
  readonly title: string;
  readonly paragraphs?: readonly string[];
  readonly bullets?: readonly string[];
}

function LegalDocument({
  eyebrow,
  title,
  description,
  sections,
  closing,
}: {
  eyebrow: string;
  title: string;
  description: string;
  sections: readonly LegalSection[];
  closing?: string;
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="mt-3 font-display text-4xl text-paper-50">{title}</h1>
      <p className="mt-3 text-sm leading-7 text-mist-300">{description}</p>
      <p className="mt-2 text-xs text-mist-400">
        最后更新：{UPDATED} · 草案 · 不构成正式法律文件或已获批准的声明
      </p>

      <div className="paper-card prose-night mt-8 rounded-3xl p-6 sm:p-10">
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900">
          当前站点是 M1 演示环境：账号、角色与会话云端存档已接入；不调用模型，不开放真实支付。
          账号与故事数据仅用于本地/受控演示。本文件用于说明设计意图，正式上线前将由运营主体与专业顾问审定并公示生效版本。
        </div>

        {sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.bullets ? (
              <ul>
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}

        {closing ? <p className="mt-8 text-xs text-slate-500">{closing}</p> : null}
      </div>

      <p className="mt-6 text-xs leading-6 text-mist-400">
        相关文件：
        <Link className="text-moon-300 underline underline-offset-4" to="/terms">
          服务协议
        </Link>
        {" · "}
        <Link className="text-moon-300 underline underline-offset-4" to="/privacy">
          隐私政策
        </Link>
        {" · "}
        <Link className="text-moon-300 underline underline-offset-4" to="/refunds">
          退款说明
        </Link>
        {" · "}
        <Link className="text-moon-300 underline underline-offset-4" to="/contact">
          联系我们
        </Link>
      </p>
    </div>
  );
}

export function TermsPage() {
  return (
    <LegalDocument
      eyebrow="服务协议 / Terms"
      title="续月记服务协议（草案）"
      description="本协议描述续月记作为 AI 文本互动与文学创作工具的服务边界。当前为演示稿，正式版本将在公开运营前公示。"
      sections={[
        {
          title: "1. 服务说明与当前状态",
          paragraphs: [
            "续月记面向中国大陆成年用户，提供 AI 文本互动、长篇角色扮演与文学创作辅助。它不是 DeepSeek 官方产品，也不提供规避模型安全审核的“无限制”服务。",
            "当前站点为 M1 云端基础演示：账号登录、角色版本与会话消息图可写入 PostgreSQL；模型调用与真实支付仍未开放。页面展示的套餐与费用数字均为演示内容，不构成真实服务或交易。",
          ],
        },
        {
          title: "2. 用户资格与账号",
          bullets: [
            "仅限年满 18 周岁的用户使用；正式开放时可能要求完成年龄确认。",
            "正式账号需通过服务端认证；匿名请求不得调用计费 API。",
            "用户应妥善保管账号凭证，发现异常应立即通过正式渠道通知运营方。",
          ],
        },
        {
          title: "3. AI 生成内容与第三方服务",
          bullets: [
            "正式版本将调用 DeepSeek 官方 API，并在服务端强制官方要求的安全级别；用户不能通过脚本、预设或客户端选项改写安全边界。",
            "AI 生成内容可能存在错误、遗漏或不适合特定用途；用户应自行判断，不应将其作为医疗、法律、金融等专业建议。",
            "平台将按适用要求进行 AI 生成内容标识、风险提示与投诉处理。",
            "不经营 NSFW 内容，不允许利用本服务生成违法、侵权或危害他人的内容。",
          ],
        },
        {
          title: "4. 用户内容与授权",
          bullets: [
            "用户保留其创作内容与角色设定的权利。",
            "为提供服务所必需，用户授予运营方在服务范围内存储、传输、展示与处理内容的有限许可；该许可不用于未经授权的模型训练或营销。",
            "用户应确保上传的角色卡、世界书与图片不侵犯他人著作权、商标权、肖像权或其他权益。",
          ],
        },
        {
          title: "5. 禁止行为",
          bullets: [
            "不得将本服务用于违法犯罪、欺诈、骚扰、仇恨、未成年人性内容或其他违法用途。",
            "不得尝试绕过服务端安全策略、额度控制、身份认证或计费边界。",
            "不得对服务进行未授权爬取、反向代理、账号池共享、拒绝服务攻击或恶意代码投放。",
            "不得上传含路径穿越、压缩炸弹、可执行脚本或恶意载荷的导入文件。",
          ],
        },
        {
          title: "6. 积分、价格与支付",
          bullets: [
            "积分是服务内的整数记账单位，不代表法定货币，不可转让给其他用户。",
            "余额、价格、冻结与结算均由服务端决定；客户端展示不构成最终计费依据。",
            "模型价格将按官方实时文档校验后写入带生效期的 tariff 表，并在页面公示。",
            "支付宝商户准入完成前，不创建真实订单、不接收真实付款；当前充值按钮保持禁用。",
          ],
        },
        {
          title: "7. 数据导出、删除与服务变更",
          bullets: [
            "用户可导出自己的故事、角色、世界书与会话；云端存档是权威副本，浏览器缓存不是。",
            "删除请求将按公示的保留周期处理；依法应留存的财务与审计记录不与聊天正文一起删除。",
            "服务可能因维护、合规要求或不可抗力调整；重大变更将提前公示。",
          ],
        },
        {
          title: "8. 责任限制与争议",
          paragraphs: [
            "在法律允许的范围内，运营方不对因模型输出、第三方服务中断或用户自身操作造成的间接损失承担责任。",
            "争议适用中华人民共和国法律；具体管辖与运营主体信息将在正式版本中公示。当前演示环境不构成任何要约或承诺。",
          ],
        },
      ]}
      closing="本草案不构成法律意见。正式上线前将补充运营主体、备案号、投诉渠道与生效日期。"
    />
  );
}

export function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="隐私政策 / Privacy"
      title="续月记隐私政策（草案）"
      description="本政策说明续月记计划如何处理个人信息。当前演示环境不接收真实用户数据，因此没有实际个人信息处理发生。"
      sections={[
        {
          title: "1. 适用范围",
          paragraphs: [
            "本政策适用于续月记网站与后续客户端。M1 演示环境会在你主动创建账号时处理邮箱、显示名称与密码哈希，以及你主动创建的角色、会话与消息数据；不会调用模型。如果你只是浏览页面，不会要求你注册。",
          ],
        },
        {
          title: "2. 计划收集的信息",
          bullets: [
            "账号信息：邮箱或认证标识、密码哈希、会话记录、年龄确认状态。",
            "用户内容：角色卡、世界书、Persona、预设、消息、记忆、导入导出文件。",
            "使用与计费信息：生成运行记录、token 用量、积分冻结与结算、订单状态。",
            "设备与安全信息：必要的日志、请求 ID、错误类型、频率限制与风控事件。",
          ],
        },
        {
          title: "3. 处理目的",
          bullets: [
            "提供聊天、分支、记忆、同步、导出与账号安全等功能。",
            "执行服务端安全策略、额度控制、反滥用与故障排查。",
            "完成计费、对账、退款与依法应留存的审计。",
            "在取得单独同意的情况下，用于明确告知的其他目的。",
          ],
        },
        {
          title: "4. 第三方共享",
          bullets: [
            "模型服务：正式版本将调用 DeepSeek 官方 API 处理生成请求；具体字段与安全级别以官方接口为准。",
            "支付服务：正式签约后可能使用支付宝处理充值；支付凭据由支付机构处理。",
            "基础设施：使用阿里云等云服务承载数据库、备份与网络。",
            "我们不出售个人信息，不将私人聊天公开，也不将其用于未经授权的训练或营销。",
          ],
        },
        {
          title: "5. 存储、保留与删除",
          bullets: [
            "云端 PostgreSQL 是权威存档；浏览器 IndexedDB 仅保存缓存、草稿与待同步操作。",
            "具体保留期限、备份滞留窗口与删除流程将在 M4 前完成隐私审核并公示。",
            "用户可请求导出或删除个人数据；依法应留存的财务与审计记录除外。",
            "设备退出登录时应清除敏感会话缓存，跨账号切换不得读取上一账号缓存。",
          ],
        },
        {
          title: "6. 安全措施",
          bullets: [
            "传输层使用 HTTPS；密码以强哈希保存；会话 Cookie 使用 HttpOnly、Secure 与 SameSite 属性。",
            "所有 API 按登录用户做对象级授权，防止越权读取或写入。",
            "日志默认仅记录运行 ID、错误类型、延迟与计费摘要，不记录完整 Prompt 或消息正文。",
            "管理端高危操作需要二次确认与审计；客服与账务权限分离。",
          ],
        },
        {
          title: "7. 你的权利",
          paragraphs: [
            "在适用法律范围内，你可以请求访问、更正、导出或删除个人信息，撤回同意，或就个人信息处理提出投诉。当前演示环境尚不接收真实请求；正式渠道将在备案与运营主体公示后开放。",
          ],
        },
        {
          title: "8. 未成年人保护",
          paragraphs: [
            "本服务面向成年人。正式上线时将实施年龄确认与未成年人保护措施；若发现未成年人未经监护人同意使用，将按适用规则处理。",
          ],
        },
        {
          title: "9. 政策更新与联系",
          paragraphs: [
            "本政策为草案，正式版本将在公开运营前公示生效日期与运营主体信息。联系渠道见“联系我们”页面。",
          ],
        },
      ]}
      closing="本草案不构成法律意见，也不代表任何备案、评估或认证已经完成。"
    />
  );
}

export function RefundsPage() {
  return (
    <LegalDocument
      eyebrow="退款说明 / Refunds"
      title="退款与订单说明（草案）"
      description="当前演示环境不接收真实付款，因此不会产生真实订单或退款。以下内容说明正式开放支付后的设计原则，最终规则以签约与公示版本为准。"
      sections={[
        {
          title: "1. 当前状态",
          paragraphs: [
            "支付宝网站支付与商户资质尚未完成。页面上的套餐金额与积分是展示草案，充值按钮保持禁用；不会创建订单，也不会跳转收银台。",
          ],
        },
        {
          title: "2. 订单状态",
          bullets: [
            "订单生命周期为：created → pending → paid / closed / expired → partially_refunded / refunded。",
            "订单状态不使用单一 success 布尔值；每次状态变化都有时间与审计记录。",
            "重复支付通知、主动查询与进程重启都走同一套幂等确认逻辑，不会重复入账。",
          ],
        },
        {
          title: "3. 退款原则（待正式公示）",
          bullets: [
            "未消费积分与已消费积分将适用不同的退款规则；具体比例、时限与手续费以正式公示为准。",
            "退款需同时更新订单、钱包与不可变账本，并保留审计记录。",
            "重复退款回调或并发退款不得造成超额退款或负余额。",
            "已依法留存的财务记录不因删除聊天而删除。",
          ],
        },
        {
          title: "4. 如何联系",
          paragraphs: [
            "正式开放支付后，将在“联系我们”页面公示客服渠道、处理时限与投诉流程。当前演示环境不接收真实付款或退款请求。",
          ],
        },
      ]}
      closing="退款规则在正式签约、价格公示与合规审查完成前不生效。"
    />
  );
}

export function ContactPage() {
  return (
    <LegalDocument
      eyebrow="联系我们 / Contact"
      title="联系渠道与运营信息"
      description="我们不会在资质与渠道尚未确认时伪造联系方式。以下是当前可核对的真实状态。"
      sections={[
        {
          title: "当前状态",
          bullets: [
            "M1 演示环境：账号与云端存档已接入；不开放真实付款，不调用模型。账号与故事数据仅用于受控演示。",
            "运营主体、ICP 备案号、AI 服务相关手续与客服邮箱将在正式上线前于本页公示。",
            "在正式渠道开放前，请不要通过非官方渠道提交个人信息、支付凭据或身份材料。",
          ],
        },
        {
          title: "上线后将提供的渠道",
          bullets: [
            "账号与数据请求：访问、导出、更正与删除。",
            "计费与退款：订单查询、发票与退款进度。",
            "内容安全与投诉：AI 生成内容标识、申诉与风险处置。",
            "隐私与合规：个人信息处理相关问询。",
          ],
        },
        {
          title: "依法请求",
          paragraphs: [
            "正式运营后，司法机关或监管机关依法提出的请求将通过公示的正式渠道受理，并按照适用法律与最小必要原则处理。",
          ],
        },
      ]}
      closing="本页不构成任何已获批、已备案或已签约的声明。"
    />
  );
}
