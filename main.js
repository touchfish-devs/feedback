const API_BASE = `https://api.github.com/repos/${CONFIG.OWNER}/${CONFIG.REPO}`;

// --- 状态管理 ---
const Auth = {
    token: sessionStorage.getItem('gh_ticket_token') || null,
    user: JSON.parse(sessionStorage.getItem('gh_ticket_user')) || null,
    isCollaborator: JSON.parse(sessionStorage.getItem('gh_is_collab')) || false,

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

        // 保存到 sessionStorage
        sessionStorage.setItem('gh_ticket_token', this.token);
        sessionStorage.setItem('gh_ticket_user', JSON.stringify(this.user));
        sessionStorage.setItem('gh_is_collab', JSON.stringify(this.isCollaborator));
    },

    logout() {
        this.token = null;
        this.user = null;
        this.isCollaborator = false;
        sessionStorage.removeItem('gh_ticket_token');
        sessionStorage.removeItem('gh_ticket_user');
        sessionStorage.removeItem('gh_is_collab');
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

async function createIssue(title, body) {
    const res = await fetch(`${API_BASE}/issues`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ title, body, labels: [CONFIG.LABEL] })
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
function renderAuthUI() {
    const authSection = document.getElementById('auth-section');
    const btnCreate = document.getElementById('btn-create');
    const scopeFilter = document.getElementById('scope-filter');

    if (Auth.user) {
        authSection.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px;">
                <img src="${Auth.user.avatar_url}" width="32" height="32" style="border-radius:50%;">
                <span style="font-size: 14px;">${Auth.user.login} ${Auth.isCollaborator ? '(Admin)' : ''}</span>
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
                <h3>#${issue.number} ${issue.title}</h3>
                <div class="ticket-meta">
                    <span class="badge ${issue.state}">${issue.state.toUpperCase()}</span>
                    <span>由 ${issue.user.login} 创建于 ${new Date(issue.created_at).toLocaleDateString()}</span>
                    <span>💬 ${issue.comments}</span>
                </div>
            </div>
        </div>
    `).join('');
}

async function openDetail(issueNumber) {
    const issue = state.issues.find(i => i.number === issueNumber);
    if (!issue) return;
    state.currentIssue = issue;

    document.getElementById('detail-title').innerText = `#${issue.number} ${issue.title}`;
    document.getElementById('detail-meta').innerHTML = `
        <span class="badge ${issue.state}">${issue.state.toUpperCase()}</span>
        <span>由 <b>${issue.user.login}</b> 创建于 ${new Date(issue.created_at).toLocaleString()}</span>
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
                    <b>${c.user.login}</b> 评论于 ${new Date(c.created_at).toLocaleString()}
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
    document.getElementById('btn-create').onclick = () => document.getElementById('create-modal').showModal();
    document.getElementById('btn-close-create').onclick = () => document.getElementById('create-modal').close();
    
    document.getElementById('btn-submit-ticket').onclick = async () => {
        const title = document.getElementById('create-title').value.trim();
        const body = document.getElementById('create-body').value.trim();
        if (!title) return alert('请输入标题');
        
        const btn = document.getElementById('btn-submit-ticket');
        btn.innerText = '提交中...';
        btn.disabled = true;

        try {
            await createIssue(title, body);
            document.getElementById('create-modal').close();
            document.getElementById('create-title').value = '';
            document.getElementById('create-body').value = '';
            loadIssues();
        } catch (err) {
            alert(err.message);
        } finally {
            btn.innerText = '提交';
            btn.disabled = false;
        }
    };

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
