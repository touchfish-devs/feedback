const API_BASE = `https://api.github.com/repos/${CONFIG.OWNER}/${CONFIG.REPO}`;

// --- 登录态 Cookie 持久化 ---
const AUTH_COOKIE_NAME = 'gh_ticket_auth';
const AUTH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 天

function getCookieAttrs(maxAge = AUTH_COOKIE_MAX_AGE) {
    return `Path=/; Max-Age=${maxAge}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}

function readAuthCookie() {
    const prefix = `${AUTH_COOKIE_NAME}=`;
    const item = document.cookie.split('; ').find(c => c.startsWith(prefix));
    if (!item) return null;
    try {
        const data = JSON.parse(decodeURIComponent(item.slice(prefix.length)));
        return data && data.token ? data : null;
    } catch (e) {
        console.warn('读取登录 Cookie 失败', e);
        return null;
    }
}

function writeAuthCookie() {
    // 只保存页面所需的字段，避免 Cookie 体积过大
    const data = {
        token: Auth.token,
        user: Auth.user ? { login: Auth.user.login, avatar_url: Auth.user.avatar_url } : null,
        isCollaborator: Auth.isCollaborator
    };
    document.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(data))}; ${getCookieAttrs()}`;
}

function clearAuthCookie() {
    document.cookie = `${AUTH_COOKIE_NAME}=; ${getCookieAttrs(0)}`;
}

// --- 状态管理 ---
const savedAuth = readAuthCookie();
const Auth = {
    token: savedAuth ? savedAuth.token : null,
    user: savedAuth && savedAuth.user ? savedAuth.user : null,
    isCollaborator: savedAuth ? savedAuth.isCollaborator === true : false,

    async loginWithPAT(pat) {
        if (!pat) throw new Error('请输入 PAT');
        
        // 验证 Token 并获取用户信息
        const res = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `Bearer ${pat}`, 'Accept': 'application/vnd.github+json' }
        });
        if (!res.ok) throw new Error('PAT 无效或已过期');
        
        const user = await res.json();
        this.token = pat;
        this.user = user;

        // 检查是否具有仓库权限 (通过尝试读取 collaborators 判断)
        try {
            const collabRes = await fetch(`${API_BASE}/collaborators?per_page=100`, {
                headers: { 'Authorization': `Bearer ${pat}`, 'Accept': 'application/vnd.github+json' }
            });
            if (collabRes.ok) {
                const collabs = await collabRes.json();
                this.isCollaborator = collabs.some(c => c.login === user.login);
            } else {
                this.isCollaborator = false;
            }
        } catch (e) {
            console.warn('权限检查失败', e);
            this.isCollaborator = false;
        }

        // 保存到 Cookie
        writeAuthCookie();
    },

    logout() {
        this.token = null;
        this.user = null;
        this.isCollaborator = false;
        clearAuthCookie();
    }
};

let state = {
    issues: [],
    filterState: 'open',
    filterScope: 'all',
    currentIssue: null
};

// --- API 封装 ---
function getHeaders() {
    const headers = { 'Accept': 'application/vnd.github+json' };
    if (Auth.token) headers['Authorization'] = `Bearer ${Auth.token}`;
    return headers;
}

// --- 新建工单表单（由 Issue 模板驱动） ---
let currentTicketType = null;

function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
}

function getTicketType(label) {
    return CONFIG.TICKET_TYPES.find(t => t.label === label) || CONFIG.TICKET_TYPES[0];
}

function renderCreateFields(type) {
    const container = document.getElementById('create-fields');
    container.innerHTML = (type.fields || []).map(field => {
        const description = field.description
            ? `<div class="field-desc">${escapeHtml(field.description)}</div>` : '';
        if (field.type === 'checkbox') {
            const options = (field.options || []).map(option => `
                <label class="checkbox-row">
                    <input type="checkbox" data-field-id="${escapeHtml(field.id)}" value="${escapeHtml(option.label)}"${option.required ? ' required' : ''}>
                    <span>${escapeHtml(option.label)}</span>
                </label>
            `).join('');
            return `<fieldset class="create-field"><legend class="field-label">${escapeHtml(field.label)}</legend>${description}${options}</fieldset>`;
        }

        const required = field.required ? ' required' : '';
        const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : '';
        const fieldId = escapeHtml(field.id);
        const input = field.type === 'textarea'
            ? `<textarea id="field-${fieldId}" class="md-input" rows="4" data-field-id="${fieldId}"${placeholder}${required}></textarea>`
            : `<input id="field-${fieldId}" type="text" class="md-input" data-field-id="${fieldId}"${placeholder}${required}>`;
        return `
            <div class="create-field">
                <label class="field-label" for="field-${fieldId}">${escapeHtml(field.label)}</label>
                ${description}
                ${input}
            </div>
        `;
    }).join('');
}

function setTicketType(label) {
    const type = getTicketType(label);
    const titleInput = document.getElementById('create-title');
    const previousPrefix = currentTicketType ? (getTicketType(currentTicketType).titlePrefix || '') : '';
    let title = titleInput.value;
    if (previousPrefix && title.startsWith(previousPrefix)) {
        title = title.slice(previousPrefix.length);
    }
    titleInput.value = (type.titlePrefix || '') + title;

    const intro = document.getElementById('create-intro');
    intro.textContent = type.intro || '';
    intro.style.display = type.intro ? 'block' : 'none';

    renderCreateFields(type);
    currentTicketType = type.label;
}

function populateTypeSelect() {
    const select = document.getElementById('create-type');
    if (!select) return;
    select.innerHTML = CONFIG.TICKET_TYPES.map(t =>
        `<option value="${escapeHtml(t.label)}">${escapeHtml(t.name)}</option>`
    ).join('');
    select.value = CONFIG.DEFAULT_TICKET_TYPE;
    setTicketType(CONFIG.DEFAULT_TICKET_TYPE);
}

function resetCreateForm() {
    document.getElementById('create-form').reset();
    populateTypeSelect();
}

function buildIssueBody(type) {
    const parts = [];
    if (type.intro) parts.push(type.intro);

    (type.fields || []).forEach(field => {
        let value;
        if (field.type === 'checkbox') {
            value = [...document.querySelectorAll(`input[type="checkbox"][data-field-id="${CSS.escape(field.id)}"]:checked`)]
                .map(input => `- [x] ${input.value}`).join('\n');
        } else {
            const input = document.querySelector(`[data-field-id="${CSS.escape(field.id)}"]`);
            value = input ? input.value.trim() : '';
        }
        if (value) parts.push(`### ${field.label}\n\n${value}`);
    });
    return parts.join('\n\n');
}

async function fetchIssues() {
    let url = `${API_BASE}/issues?labels=${CONFIG.LABEL}&state=${state.filterState}&per_page=50&sort=created&direction=desc`;
    
    if (state.filterScope === 'created' && Auth.user) {
        url += `&creator=${Auth.user.login}`;
    } else if (state.filterScope === 'assigned' && Auth.user) {
        url += `&assignee=${Auth.user.login}`;
    }

    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) throw new Error('获取工单失败');
    return res.json();
}

async function createIssue(title, body, typeLabel) {
    // 工单必须带 Ticket 标签，类型标签为可选的附加标签
    const labels = [CONFIG.LABEL];
    if (typeLabel && typeLabel !== CONFIG.LABEL) labels.push(typeLabel);

    const res = await fetch(`${API_BASE}/issues`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ title, body, labels })
    });
    if (!res.ok) throw new Error('创建失败，请检查 PAT 权限');
    return res.json();
}

async function addComment(issueNumber, body) {
    const res = await fetch(`${API_BASE}/issues/${issueNumber}/comments`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ body })
    });
    if (!res.ok) throw new Error('评论失败');
    return res.json();
}

async function closeIssue(issueNumber) {
    const res = await fetch(`${API_BASE}/issues/${issueNumber}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ state: 'closed' })
    });
    if (!res.ok) throw new Error('关闭失败，权限不足');
    return res.json();
}

async function fetchComments(issueNumber) {
    const res = await fetch(`${API_BASE}/issues/${issueNumber}/comments`, { headers: getHeaders() });
    return res.json();
}

// --- UI 渲染 ---
function getIssueType(issue) {
    const labels = (issue.labels || []).map(l => typeof l === 'string' ? l : l.name).filter(Boolean);
    const matched = CONFIG.TICKET_TYPES.find(t => labels.includes(t.label));
    if (matched) return { label: matched.label, name: matched.name };
    const extra = labels.find(name => name !== CONFIG.LABEL);
    return extra ? { label: extra, name: extra } : null;
}

function renderTypeBadge(issue) {
    const type = getIssueType(issue);
    return type ? `<span class="badge type" title="${escapeHtml(type.label)}">${escapeHtml(type.name)}</span>` : '';
}

function getAssignees(issue) {
    if (issue.assignees && issue.assignees.length) return issue.assignees.filter(Boolean);
    return issue.assignee ? [issue.assignee] : [];
}

function renderAssignees(issue, withNames = false) {
    const assignees = getAssignees(issue);
    if (!assignees.length) return `<span class="assignee-empty">未受理</span>`;
    const avatars = assignees.map(assignee => {
        const avatar = assignee.avatar_url || `https://github.com/${encodeURIComponent(assignee.login)}.png?size=48`;
        return `<img class="assignee-avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(assignee.login)}" title="受理人：${escapeHtml(assignee.login)}" width="24" height="24">`;
    }).join('');
    const names = withNames
        ? `<span class="assignee-names">${assignees.map(a =>
            `<a href="https://github.com/${encodeURIComponent(a.login)}" target="_blank" rel="noopener noreferrer" title="查看 ${escapeHtml(a.login)} 的 GitHub 主页">${escapeHtml(a.login)}</a>`
        ).join(', ')}</span>` : '';
    return `<span class="assignees">${avatars}${names}</span>`;
}

function renderAuthUI() {
    const authSection = document.getElementById('auth-section');
    const btnCreate = document.getElementById('btn-create');
    const scopeFilter = document.getElementById('scope-filter');

    if (Auth.user) {
        authSection.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px;">
                <img src="${escapeHtml(Auth.user.avatar_url)}" width="32" height="32" style="border-radius:50%;">
                <span style="font-size: 14px;">${escapeHtml(Auth.user.login)} ${Auth.isCollaborator ? '(Admin)' : ''}</span>
                <button id="btn-logout" class="btn btn-text">登出</button>
            </div>
        `;
        document.getElementById('btn-logout').onclick = () => {
            Auth.logout();
            renderAuthUI();
            loadIssues();
        };
        btnCreate.style.display = 'inline-flex';
        scopeFilter.disabled = false;
    } else {
        authSection.innerHTML = `<button id="btn-login" class="btn btn-primary">登录</button>`;
        document.getElementById('btn-login').onclick = () => document.getElementById('login-modal').showModal();
        btnCreate.style.display = 'none';
        scopeFilter.disabled = true;
        scopeFilter.value = 'all';
        state.filterScope = 'all';
    }
}

async function loadIssues() {
    const listEl = document.getElementById('ticket-list');
    listEl.innerHTML = '<div class="loading">加载中...</div>';
    try {
        state.issues = await fetchIssues();
        renderList();
    } catch (err) {
        listEl.innerHTML = `<div class="error">${err.message}</div>`;
    }
}

function renderList() {
    const listEl = document.getElementById('ticket-list');
    if (state.issues.length === 0) {
        listEl.innerHTML = '<div class="empty">暂无工单</div>';
        return;
    }

    listEl.innerHTML = state.issues.map(issue => `
        <div class="ticket-card" onclick="openDetail(${issue.number})">
            <div class="ticket-info">
                <h3>#${issue.number} ${escapeHtml(issue.title)}</h3>
                <div class="ticket-meta">
                    <span class="badge ${escapeHtml(issue.state)}">${escapeHtml(issue.state.toUpperCase())}</span>
                    ${renderTypeBadge(issue)}
                    <span>由 ${escapeHtml(issue.user.login)} 创建于 ${new Date(issue.created_at).toLocaleDateString()}</span>
                    <span>💬 ${issue.comments}</span>
                </div>
            </div>
            <div class="ticket-assignee">${renderAssignees(issue)}</div>
        </div>
    `).join('');
}

async function openDetail(issueNumber) {
    const issue = state.issues.find(i => i.number === issueNumber);
    if (!issue) return;
    state.currentIssue = issue;

    document.getElementById('detail-title').innerText = `#${issue.number} ${issue.title}`;
    document.getElementById('detail-meta').innerHTML = `
        <span class="badge ${escapeHtml(issue.state)}">${escapeHtml(issue.state.toUpperCase())}</span>
        ${renderTypeBadge(issue)}
        <span>由 <b>${escapeHtml(issue.user.login)}</b> 创建于 ${new Date(issue.created_at).toLocaleString()}</span>
        <span class="detail-assignee">受理人：${renderAssignees(issue, true)}</span>
    `;
    
    // 安全渲染 Markdown
    const rawHtml = marked.parse(issue.body || '*没有描述*');
    document.getElementById('detail-body').innerHTML = DOMPurify.sanitize(rawHtml);

    // 权限控制 (Collaborator 或 创建者自己)
    const canManage = Auth.user && (Auth.isCollaborator || issue.user.login === Auth.user.login);
    const commentBox = document.getElementById('comment-box');
    const btnClose = document.getElementById('btn-close-ticket');

    if (canManage && issue.state === 'open') {
        commentBox.style.display = 'block';
        btnClose.style.display = 'inline-flex';
    } else {
        commentBox.style.display = 'none';
    }

    document.getElementById('comments-list').innerHTML = '<div class="loading">加载评论中...</div>';
    document.getElementById('detail-modal').showModal();

    // 加载评论
    try {
        const comments = await fetchComments(issue.number);
        document.getElementById('comments-list').innerHTML = comments.map(c => `
            <div class="comment">
                <div class="comment-meta">
                    <b>${escapeHtml(c.user.login)}</b> 评论于 ${new Date(c.created_at).toLocaleString()}
                </div>
                <div class="markdown-body">${DOMPurify.sanitize(marked.parse(c.body))}</div>
            </div>
        `).join('') || '<div class="hint">暂无评论</div>';
    } catch (e) {
        document.getElementById('comments-list').innerHTML = '<div class="error">评论加载失败</div>';
    }
}

// --- 事件绑定 ---
document.addEventListener('DOMContentLoaded', () => {
    renderAuthUI();
    loadIssues();

    // 筛选事件
    document.getElementById('state-tabs').addEventListener('click', (e) => {
        if (e.target.classList.contains('tab')) {
            document.querySelectorAll('#state-tabs .tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            state.filterState = e.target.dataset.state;
            loadIssues();
        }
    });

    document.getElementById('scope-filter').addEventListener('change', (e) => {
        state.filterScope = e.target.value;
        loadIssues();
    });

    // 登录弹窗事件
    document.getElementById('btn-cancel-login').onclick = () => document.getElementById('login-modal').close();
    
    document.getElementById('btn-pat-login').onclick = async () => {
        const pat = document.getElementById('pat-input').value.trim();
        const btn = document.getElementById('btn-pat-login');
        btn.innerText = '验证中...';
        btn.disabled = true;
        
        try {
            await Auth.loginWithPAT(pat);
            document.getElementById('login-modal').close();
            document.getElementById('pat-input').value = '';
            renderAuthUI();
            loadIssues();
        } catch (err) {
            alert(err.message);
        } finally {
            btn.innerText = '登录';
            btn.disabled = false;
        }
    };

    // 创建工单事件
    populateTypeSelect();
    document.getElementById('create-type').addEventListener('change', e => setTicketType(e.target.value));
    document.getElementById('btn-create').onclick = () => {
        resetCreateForm();
        document.getElementById('create-modal').showModal();
    };
    document.getElementById('btn-close-create').onclick = () => document.getElementById('create-modal').close();
    
    document.getElementById('create-form').addEventListener('submit', async e => {
        e.preventDefault();
        if (!e.currentTarget.reportValidity()) return;

        const typeLabel = document.getElementById('create-type').value;
        const type = getTicketType(typeLabel);
        const title = document.getElementById('create-title').value.trim();
        if (!title.slice((type.titlePrefix || '').length).trim()) return alert('请输入标题');
        const body = buildIssueBody(type);
        
        const btn = document.getElementById('btn-submit-ticket');
        btn.innerText = '提交中...';
        btn.disabled = true;

        try {
            await createIssue(title, body, typeLabel);
            document.getElementById('create-modal').close();
            resetCreateForm();
            loadIssues();
        } catch (err) {
            alert(err.message);
        } finally {
            btn.innerText = '提交';
            btn.disabled = false;
        }
    });

    // 详情弹窗事件
    document.getElementById('btn-close-detail').onclick = () => document.getElementById('detail-modal').close();
    
    document.getElementById('btn-submit-comment').onclick = async () => {
        const body = document.getElementById('comment-input').value.trim();
        if (!body || !state.currentIssue) return;
        
        const btn = document.getElementById('btn-submit-comment');
        btn.innerText = '发送中...';
        btn.disabled = true;

        try {
            await addComment(state.currentIssue.number, body);
            document.getElementById('comment-input').value = '';
            // 刷新详情
            openDetail(state.currentIssue.number);
            // 刷新列表（更新评论数）
            loadIssues();
        } catch (err) {
            alert(err.message);
        } finally {
            btn.innerText = '发送评论';
            btn.disabled = false;
        }
    };

    document.getElementById('btn-close-ticket').onclick = async () => {
        if (!state.currentIssue || !confirm('确定要关闭此工单吗？')) return;
        const btn = document.getElementById('btn-close-ticket');
        btn.innerText = '关闭中...';
        btn.disabled = true;

        try {
            await closeIssue(state.currentIssue.number);
            document.getElementById('detail-modal').close();
            loadIssues();
        } catch (err) {
            alert(err.message);
        } finally {
            btn.innerText = '关闭工单';
            btn.disabled = false;
        }
    };
});
