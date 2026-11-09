const CONFIG = {
    OWNER: 'touchfish-devs',
    REPO: 'community',
    LABEL: 'Ticket',

    // 工单类型：label 为仓库中的 GitHub 标签名，name 为下拉框显示文本
    // 新建工单时始终附带 Ticket 标签，并额外附加所选类型的标签
    TICKET_TYPES: [
        { label: 'General',       name: '一般咨询' },
        { label: 'Academic',      name: '学术建议' },
        { label: 'Vulnerability', name: '漏洞报告' },
        { label: 'Report',        name: '举报用户' },
        { label: 'Feature',       name: '功能建议' },
        { label: 'Bug',           name: 'Bug 反馈' }
    ],
    DEFAULT_TICKET_TYPE: 'General'
};
