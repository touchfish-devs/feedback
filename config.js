const CONFIG = {
    OWNER: 'touchfish-devs',
    REPO: 'community',
    LABEL: 'Ticket',

    // 工单类型：label 为仓库中的 GitHub 标签名，name 为界面显示文本
    // titlePrefix / intro / fields 对应 .github/ISSUE_TEMPLATE 中的 Issue 模板
    // 新建工单时始终附带 Ticket 标签，并额外附加所选类型的标签
    TICKET_TYPES: [
        {
            label: 'General',
            name: '一般咨询',
            titlePrefix: '',
            intro: '',
            fields: [
                { id: 'description', type: 'textarea', label: '描述', description: '描述你的问题或建议（支持 Markdown）', placeholder: '在这里填写详细内容...', required: true }
            ]
        },
        {
            label: 'Academic',
            name: '学术建议',
            titlePrefix: '',
            intro: '',
            fields: [
                { id: 'description', type: 'textarea', label: '描述', description: '描述你的建议（支持 Markdown）', placeholder: '在这里填写详细内容...', required: true }
            ]
        },
        {
            label: 'Vulnerability',
            name: '漏洞报告',
            titlePrefix: '[漏洞] ',
            intro: '> 若漏洞细节极其敏感（如可直接获取用户数据），请优先通过私下渠道联系维护者，\n> 确认后再公开。',
            fields: [
                { id: 'software', type: 'input', label: '软件', description: '受影响的软件 / 项目 / 模块（含版本号）', placeholder: '例如：TouchFish Server', required: true },
                { id: 'cvss', type: 'input', label: '等级', description: '填写 1~10 的 CVSS 评分，可带一位小数（选填）', placeholder: '例如：7.5', required: false },
                { id: 'attack_surface', type: 'textarea', label: '攻击面', description: '漏洞所在位置与触发条件，如接口、参数、认证要求等', placeholder: '例如：/api/v1/upload 接口未校验文件类型，无需登录即可访问', required: true },
                { id: 'poc', type: 'textarea', label: '复现过程', description: '详细的复现步骤或 PoC（请勿包含真实用户数据）', placeholder: '1. …\n2. …\n3. 观察到 …', required: true },
                {
                    id: 'credit_public', type: 'checkbox', label: '是否允许在修复后公开报告者',
                    description: '勾选表示漏洞修复后，可在公告中致谢你的用户名',
                    options: [{ label: '允许在漏洞修复后公开我的用户名作为报告者' }]
                }
            ]
        },
        {
            label: 'Report',
            name: '举报用户',
            titlePrefix: '[举报] ',
            intro: '> 请勿在举报中公开他人隐私信息\n> 证明材料请尽量使用链接或打码截图',
            fields: [
                { id: 'location', type: 'input', label: '举报位置', description: '违规内容出现的页面 / 板块 / 帖子链接', placeholder: '例如：https://example.com/thread/12345', required: true },
                { id: 'target', type: 'input', label: '用户名或 UID', description: '被举报用户的昵称和/或 UID', placeholder: '例如：昵称 xxx / UID 114514', required: true },
                { id: 'reason', type: 'textarea', label: '举报原因', description: '说明违规行为及所违反的社区规则', placeholder: '例如：发布广告 / 人身攻击 / 侵权 …', required: true },
                { id: 'evidence', type: 'textarea', label: '证明材料', description: '截图、链接、聊天记录等（可直接拖拽上传图片）', placeholder: '在此粘贴链接或描述...', required: false },
                {
                    id: 'allow_intervention', type: 'checkbox', label: '是否允许其他用户介入',
                    description: '勾选表示同意其他用户参与本举报的讨论与举证',
                    options: [{ label: '允许其他用户介入本举报的讨论' }]
                }
            ]
        },
        {
            label: 'Feature',
            name: '功能建议',
            titlePrefix: '[功能建议] ',
            intro: '感谢你的建议！提交前请先搜索是否已有相似的 issue。',
            fields: [
                { id: 'software', type: 'input', label: '软件', description: '该建议针对哪个软件 / 项目 / 模块？', placeholder: '例如：TouchFish Client', required: true },
                { id: 'feature', type: 'textarea', label: '需要的功能', description: '你希望增加什么功能？它解决什么问题？', placeholder: '描述期望的功能、使用场景和它能带来的价值', required: true },
                { id: 'remarks', type: 'textarea', label: '备注', description: '可补充参考链接、界面草图、替代方案等（选填）', placeholder: '选填', required: false }
            ]
        },
        {
            label: 'Bug',
            name: 'Bug 反馈',
            titlePrefix: '[Bug] ',
            intro: '感谢反馈！提交前请先搜索是否已有相同问题。',
            fields: [
                { id: 'software', type: 'input', label: '软件', description: '出现问题的软件 / 项目 / 模块（含版本号更佳）', placeholder: '例如：TouchFish Client 0.0.3', required: true },
                { id: 'summary', type: 'input', label: 'Bug 概述', description: '用一句话说明问题', placeholder: '例如：点击发送语音按钮后界面卡死', required: true },
                { id: 'steps', type: 'textarea', label: '复现过程', description: '按步骤描述如何触发该问题', placeholder: '1. 打开 …\n2. 点击 …\n3. 观察 …', required: false },
                { id: 'expected', type: 'textarea', label: '期望行为', description: '你预期应该发生什么？', placeholder: '描述期望的行为...', required: false },
                { id: 'actual', type: 'textarea', label: '实际行为', description: '实际发生了什么？可附日志、截图、录屏', placeholder: '描述实际发生的行为...', required: false }
            ]
        }
    ],
    DEFAULT_TICKET_TYPE: 'General'
};
