/* ═══════════════════════════════════════════════════════════════════
   Threadline — Frontend App
   ═══════════════════════════════════════════════════════════════════ */

let STATE = {
  user: null,
  posts: [],
  currentPage: 1,
  hasMore: false,
  searchQuery: '',
  searchTimer: null,
};

let postPollTimer   = null;
let homePollTimer   = null;
const knownCommentIds = new Set();

// ── CSRF ─────────────────────────────────────────────────────────────────────
function getCookie(name) {
  const v = `; ${document.cookie}`.split(`; ${name}=`);
  return v.length === 2 ? v.pop().split(';').shift() : '';
}

async function api(url, opts = {}) {
  const headers = { ...opts.headers };
  if (!(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  headers['X-CSRFToken'] = getCookie('csrftoken');
  const token = sessionStorage.getItem('authToken');
  if (token) headers['X-Auth-Token'] = token;
  const res = await fetch(url, { credentials: 'same-origin', ...opts, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── SESSION HELPERS (ecommerce pattern: full user object lives in sessionStorage) ──
function getSessionUser() {
  try { return JSON.parse(sessionStorage.getItem('authUser')); } catch { return null; }
}
function setSession(user, token) {
  sessionStorage.setItem('authUser',  JSON.stringify(user));
  sessionStorage.setItem('authToken', token);
}
function clearSession() {
  sessionStorage.removeItem('authUser');
  sessionStorage.removeItem('authToken');
  // clean up old keys from previous implementation
  sessionStorage.removeItem('loggedIn');
  sessionStorage.removeItem('tabUser');
}

// ── INIT ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  document.getElementById('themeToggle').textContent = saved === 'dark' ? '☀' : '🌙';

  // Restore user from THIS tab's sessionStorage — no server call needed.
  // Each tab holds its own copy, so Tab A (alice) and Tab B (moderator)
  // are completely independent even after refresh.
  const stored = getSessionUser();
  if (stored) {
    STATE.user = stored;
    updateNavAuth();
  }

  loadPosts(true);
  startHomeRealtime();
});

// ── AUTH ──────────────────────────────────────────────────────────────────────
async function checkAuth() {
  try {
    const data = await api('/api/auth/me/');
    STATE.user = data.user;
    updateNavAuth();
  } catch {}
}

function updateNavAuth() {
  const u = STATE.user;
  if (u) {
    document.getElementById('navActions').classList.add('hidden');
    document.getElementById('navUser').classList.remove('hidden');
    document.getElementById('avatarInitial').textContent = u.username[0].toUpperCase();
    document.getElementById('avatarBtn').title = u.username;
    if (u.is_moderator) document.getElementById('modLink').classList.remove('hidden');
  } else {
    document.getElementById('navActions').classList.remove('hidden');
    document.getElementById('navUser').classList.add('hidden');
    document.getElementById('modLink').classList.add('hidden');
  }
}

async function doLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.classList.add('hidden');
  try {
    const data = await api('/api/auth/login/', { method: 'POST', body: JSON.stringify({ username, password }) });
    STATE.user = data.user;
    setSession(data.user, data.token);
    updateNavAuth();
    hideModal('loginModal');
    toast('Welcome back, ' + data.user.username + '!', 'success');
    loadPosts(true);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  }
}

async function doRegister() {
  const username = document.getElementById('regUsername').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const errEl = document.getElementById('registerError');
  errEl.classList.add('hidden');
  try {
    const data = await api('/api/auth/register/', { method: 'POST', body: JSON.stringify({ username, email, password }) });
    STATE.user = data.user;
    setSession(data.user, data.token);
    updateNavAuth();
    hideModal('registerModal');
    toast('Account created! Welcome, ' + data.user.username + '!', 'success');
    loadPosts(true);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  }
}

async function doLogout() {
  await api('/api/auth/logout/', { method: 'POST' });
  clearSession();
  STATE.user = null;
  updateNavAuth();
  closeUserMenu();
  showPage('home');
  toast('Logged out');
}

// ── NAVIGATION ─────────────────────────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(name + 'Page').classList.add('active');
  closeUserMenu();
  if (name === 'home') {
    stopPostRealtime();
    loadPosts(true);
    startHomeRealtime();
  } else {
    stopHomeRealtime();
    if (name !== 'post') stopPostRealtime();
  }
  if (name === 'mod') loadModTab('users');
}

// ── POSTS ─────────────────────────────────────────────────────────────────────
async function loadPosts(reset = false) {
  if (reset) { STATE.currentPage = 1; STATE.posts = []; }
  const grid = document.getElementById('postsGrid');
  if (reset) grid.innerHTML = '<div class="loading-posts">Loading…</div>';

  const q = STATE.searchQuery ? `&q=${encodeURIComponent(STATE.searchQuery)}` : '';
  try {
    const data = await api(`/api/posts/?page=${STATE.currentPage}${q}`);
    STATE.hasMore = data.has_next;
    STATE.posts = reset ? data.posts : [...STATE.posts, ...data.posts];
    renderPosts(reset);
    document.getElementById('loadMoreWrap').classList.toggle('hidden', !STATE.hasMore);
  } catch (e) {
    grid.innerHTML = `<div class="loading-posts" style="color:var(--red)">Failed to load: ${e.message}</div>`;
  }
}

function loadMorePosts() {
  STATE.currentPage++;
  loadPosts(false);
}

function renderPosts(reset) {
  const grid = document.getElementById('postsGrid');
  if (reset) grid.innerHTML = '';

  if (STATE.posts.length === 0) {
    grid.innerHTML = '<div class="loading-posts">No posts yet. Be the first to write!</div>';
    return;
  }

  const frag = document.createDocumentFragment();
  const posts = reset ? STATE.posts : STATE.posts.slice(-10);
  posts.forEach(p => {
    const el = document.createElement('div');
    el.className = 'post-card';
    el.onclick = () => openPost(p.id);
    const excerpt = p.content.length > 160 ? p.content.slice(0, 160) + '…' : p.content;
    const dateStr = new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    el.innerHTML = `
      ${p.image ? `<img class="post-card-img" src="${p.image}" alt="${esc(p.title)}" loading="lazy">` : '<div class="post-card-img-placeholder"></div>'}
      <div class="post-card-body">
        <div class="post-card-meta">
          <span>${esc(p.author)}</span><span class="dot">·</span><span>${dateStr}</span>
        </div>
        <h3>${esc(p.title)}</h3>
        <p class="post-card-excerpt">${esc(excerpt)}</p>
      </div>
      <div class="post-card-footer">
        <div class="post-card-stats">
          <span id="card-likes-${p.id}">♡ ${p.like_count}</span>
          <span id="card-comments-${p.id}">💬 ${p.comment_count}</span>
        </div>
        ${p.file_attachment ? '<span style="font-size:12px;color:var(--text3)">📎 file</span>' : ''}
      </div>`;
    frag.appendChild(el);
  });
  grid.appendChild(frag);
}

async function openPost(postId) {
  showPage('post');
  stopPostRealtime();
  const container = document.getElementById('postDetail');
  container.innerHTML = '<div class="loading-posts">Loading post…</div>';
  try {
    const [postData, commentsData] = await Promise.all([
      api(`/api/posts/${postId}/`),
      api(`/api/posts/${postId}/comments/`),
    ]);
    renderPostDetail(postData.post, commentsData.comments, container);
    startPostRealtime(postId);
  } catch (e) {
    container.innerHTML = `<div class="loading-posts" style="color:var(--red)">Error: ${e.message}</div>`;
  }
}

function renderPostDetail(post, comments, container) {
  const canEdit = STATE.user && (STATE.user.username === post.author || STATE.user.is_moderator);
  const isOwner = STATE.user && STATE.user.username === post.author;
  const dateStr = new Date(post.created_at).toLocaleString();
  const liked = post.liked;

  container.innerHTML = `
    <div class="post-detail">
      <div class="post-back" onclick="showPage('home')">← Back to posts</div>
      <h1 class="post-detail-title">${esc(post.title)}</h1>
      <div class="post-detail-meta">
        <span class="author-tag" style="cursor:pointer" onclick="showUserProfile('${esc(post.author)}')">${esc(post.author)}</span>
        <span>·</span><span>${dateStr}</span>
        <span>·</span><span>${post.comment_count} comments</span>
        ${isOwner ? `<span>·</span><button class="btn btn-ghost sm" onclick="editPost(${post.id})">Edit</button>` : ''}
        ${canEdit && !isOwner ? `<span>·</span><button class="btn btn-danger sm" onclick="deletePost(${post.id})">Delete</button>` : ''}
        ${isOwner ? `<button class="btn btn-danger sm" onclick="deletePost(${post.id})">Delete</button>` : ''}
      </div>
      ${post.image ? `<img class="post-detail-img" src="${post.image}" alt="${esc(post.title)}">` : ''}
      <div class="post-detail-content">${esc(post.content)}</div>
      <div class="post-actions">
        <button class="like-btn ${liked ? 'liked' : ''}" id="likeBtn-${post.id}" onclick="togglePostLike(${post.id})">
          ${liked ? '♥' : '♡'} <span id="likeCount-${post.id}">${post.like_count}</span> ${liked ? 'Liked' : 'Like'}
        </button>
        ${post.file_attachment ? `<a class="attachment-link" href="${post.file_attachment}" target="_blank">📎 ${esc(post.file_attachment_name || 'Download attachment')}</a>` : ''}
      </div>
      <div class="comments-section">
        <h3>Comments (${post.comment_count})</h3>
        ${STATE.user
          ? `<div class="comment-form">
              <textarea id="newCommentText" placeholder="Share your thoughts…"></textarea>
              <div class="comment-form-actions">
                <button class="btn btn-primary sm" onclick="submitComment(${post.id})">Comment</button>
              </div>
             </div>`
          : `<div class="login-to-comment"><a href="#" onclick="showModal('loginModal')">Log in</a> or <a href="#" onclick="showModal('registerModal')">sign up</a> to comment</div>`
        }
        <div class="comment-tree" id="commentTree-${post.id}">
          ${renderCommentTree(comments, post.id)}
        </div>
      </div>
    </div>`;
}

// ── COMMENT RENDERING ──────────────────────────────────────────────────────────
function renderCommentTree(comments, postId) {
  if (!comments.length) return '<p style="color:var(--text3);font-size:14px;padding:16px 0">No comments yet. Start the discussion!</p>';
  return comments.map(c => renderComment(c, postId, false)).join('');
}

function renderComment(c, postId, isReply) {
  const replies = c.replies || [];
  const repliesHtml = replies.length
    ? `<div class="replies-container" id="replies-${c.id}">${replies.map(r => renderComment(r, postId, true)).join('')}</div>`
    : `<div class="replies-container" id="replies-${c.id}"></div>`;

  if (c.deleted) {
    return `
      <div class="comment-node ${isReply ? 'is-reply' : ''}" id="comment-${c.id}">
        <div class="comment-body">
          <div class="comment-deleted">— comment removed by ${c.deleted_by} —</div>
          ${repliesHtml}
        </div>
      </div>`;
  }

  const initial = c.author[0].toUpperCase();
  const timeStr = new Date(c.created_at).toLocaleString();
  const canEdit = STATE.user && STATE.user.username === c.author;
  const canDelete = STATE.user && (STATE.user.username === c.author || STATE.user.is_moderator);

  return `
    <div class="comment-node ${isReply ? 'is-reply' : ''}" id="comment-${c.id}">
      <div class="comment-avatar" style="background:${avatarColor(c.author)}">${initial}</div>
      <div class="comment-body">
        <div class="comment-header">
          <span class="comment-author" style="cursor:pointer" onclick="showUserProfile('${esc(c.author)}')">${esc(c.author)}</span>
          <span class="comment-time">${timeStr}</span>
        </div>
        <div class="comment-content" id="cContent-${c.id}">${esc(c.content)}</div>
        <div class="comment-actions">
          <button class="vote-btn ${c.user_liked ? 'upvoted' : ''}" onclick="voteComment(${c.id}, 'like', ${postId})">
            ▲ <span id="cLikes-${c.id}">${c.likes}</span>
          </button>
          <button class="vote-btn ${c.user_disliked ? 'downvoted' : ''}" onclick="voteComment(${c.id}, 'dislike', ${postId})">
            ▼ <span id="cDislikes-${c.id}">${c.dislikes}</span>
          </button>
          ${STATE.user ? `<button class="comment-action-btn" onclick="toggleReplyForm(${c.id}, ${postId})">Reply</button>` : ''}
          ${canEdit ? `<button class="comment-action-btn" onclick="startEditComment(${c.id})">Edit</button>` : ''}
          ${canDelete ? `<button class="comment-action-btn" style="color:var(--red)" onclick="deleteComment(${c.id}, ${postId})">Delete</button>` : ''}
        </div>
        <div id="replyForm-${c.id}" class="hidden"></div>
        ${repliesHtml}
      </div>
    </div>`;
}

function avatarColor(username) {
  const colors = ['#7c6af7','#4eca8b','#f7c06a','#f75a6a','#6af7e4','#f76af5'];
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) % colors.length;
  return colors[h];
}

// ── COMMENT ACTIONS ────────────────────────────────────────────────────────────
async function submitComment(postId, parentId = null) {
  const ta = parentId ? document.getElementById(`replyText-${parentId}`) : document.getElementById('newCommentText');
  const content = ta.value.trim();
  if (!content) return;
  if (!STATE.user) { showModal('loginModal'); return; }
  try {
    const data = await api(`/api/posts/${postId}/comments/`, {
      method: 'POST',
      body: JSON.stringify({ content, parent_id: parentId }),
    });
    const c = data.comment;
    if (parentId) {
      const repliesContainer = document.getElementById(`replies-${parentId}`);
      repliesContainer.insertAdjacentHTML('beforeend', renderComment(c, postId, true));
      document.getElementById(`replyForm-${parentId}`).innerHTML = '';
      document.getElementById(`replyForm-${parentId}`).classList.add('hidden');
    } else {
      document.getElementById(`commentTree-${postId}`).insertAdjacentHTML('beforeend', renderComment(c, postId, false));
      ta.value = '';
    }
    // Update comment count display
    const h3 = document.querySelector('.comments-section h3');
    if (h3) {
      const match = h3.textContent.match(/\d+/);
      const cur = match ? parseInt(match[0]) : 0;
      h3.textContent = `Comments (${cur + 1})`;
    }
    toast('Comment posted', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

function toggleReplyForm(commentId, postId) {
  if (!STATE.user) { showModal('loginModal'); return; }
  const formEl = document.getElementById(`replyForm-${commentId}`);
  if (!formEl.classList.contains('hidden') && formEl.innerHTML) {
    formEl.innerHTML = '';
    formEl.classList.add('hidden');
    return;
  }
  formEl.classList.remove('hidden');
  formEl.innerHTML = `
    <div class="reply-form">
      <textarea id="replyText-${commentId}" placeholder="Write a reply…"></textarea>
      <div class="reply-form-actions">
        <button class="btn btn-ghost sm" onclick="cancelReply(${commentId})">Cancel</button>
        <button class="btn btn-primary sm" onclick="submitComment(${postId}, ${commentId})">Reply</button>
      </div>
    </div>`;
  document.getElementById(`replyText-${commentId}`).focus();
}

function cancelReply(commentId) {
  const formEl = document.getElementById(`replyForm-${commentId}`);
  formEl.innerHTML = '';
  formEl.classList.add('hidden');
}

function startEditComment(commentId) {
  const contentEl = document.getElementById(`cContent-${commentId}`);
  const original = contentEl.textContent;
  contentEl.classList.add('editing');
  contentEl.innerHTML = `
    <textarea id="editText-${commentId}">${esc(original)}</textarea>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn btn-ghost sm" onclick="cancelEditComment(${commentId}, \`${original.replace(/`/g, '\\`')}\`)">Cancel</button>
      <button class="btn btn-primary sm" onclick="saveEditComment(${commentId})">Save</button>
    </div>`;
}

function cancelEditComment(commentId, original) {
  const contentEl = document.getElementById(`cContent-${commentId}`);
  contentEl.classList.remove('editing');
  contentEl.textContent = original;
}

async function saveEditComment(commentId) {
  const ta = document.getElementById(`editText-${commentId}`);
  const content = ta.value.trim();
  if (!content) return;
  try {
    const data = await api(`/api/comments/${commentId}/`, { method: 'PUT', body: JSON.stringify({ content }) });
    const contentEl = document.getElementById(`cContent-${commentId}`);
    contentEl.classList.remove('editing');
    contentEl.textContent = data.comment.content;
    toast('Comment updated', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteComment(commentId, postId) {
  if (!confirm('Remove this comment? It will show as removed (replies are kept).')) return;
  try {
    const data = await api(`/api/comments/${commentId}/`, { method: 'DELETE' });
    const el = document.getElementById(`comment-${commentId}`);
    if (el) {
      const isReply = el.classList.contains('is-reply');
      el.outerHTML = renderComment(data.comment, postId, isReply);
    }
    toast('Comment removed');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function voteComment(commentId, vote, postId) {
  if (!STATE.user) { showModal('loginModal'); return; }
  try {
    const data = await api(`/api/comments/${commentId}/vote/`, { method: 'POST', body: JSON.stringify({ vote }) });
    const likeEl = document.getElementById(`cLikes-${commentId}`);
    const dislikeEl = document.getElementById(`cDislikes-${commentId}`);
    if (likeEl) likeEl.textContent = data.likes;
    if (dislikeEl) dislikeEl.textContent = data.dislikes;
    // Update button styles
    const node = document.getElementById(`comment-${commentId}`);
    if (node) {
      const btns = node.querySelectorAll('.vote-btn');
      btns[0] && btns[0].classList.toggle('upvoted', data.user_liked);
      btns[1] && btns[1].classList.toggle('downvoted', data.user_disliked);
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ── POST LIKE ─────────────────────────────────────────────────────────────────
async function togglePostLike(postId) {
  if (!STATE.user) { showModal('loginModal'); return; }
  try {
    const data = await api(`/api/posts/${postId}/like/`, { method: 'POST' });
    const btn = document.getElementById(`likeBtn-${postId}`);
    const count = document.getElementById(`likeCount-${postId}`);
    if (btn) {
      btn.className = `like-btn ${data.liked ? 'liked' : ''}`;
      btn.innerHTML = `${data.liked ? '♥' : '♡'} <span id="likeCount-${postId}">${data.count}</span> ${data.liked ? 'Liked' : 'Like'}`;
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ── CREATE/EDIT POST ──────────────────────────────────────────────────────────
function showCreatePost() {
  if (!STATE.user) { showModal('loginModal'); return; }
  document.getElementById('postModalTitle').textContent = 'New Post';
  document.getElementById('editPostId').value = '';
  document.getElementById('postTitle').value = '';
  document.getElementById('postContent').value = '';
  document.getElementById('imagePreview').classList.add('hidden');
  document.getElementById('imageDropLabel').textContent = 'Click or drag an image here';
  document.getElementById('postImageUrl').value = '';
  document.getElementById('attachLabel').textContent = 'Click to select a file';
  document.getElementById('postImageInput').value = '';
  document.getElementById('postAttachInput').value = '';
  document.getElementById('postFormError').classList.add('hidden');
  showModal('postModal');
}

async function editPost(postId) {
  try {
    const data = await api(`/api/posts/${postId}/`);
    const p = data.post;
    document.getElementById('postModalTitle').textContent = 'Edit Post';
    document.getElementById('editPostId').value = postId;
    document.getElementById('postTitle').value = p.title;
    document.getElementById('postContent').value = p.content;
    document.getElementById('postImageUrl').value = p.image_url || '';
    if (p.image_url) {
      document.getElementById('imagePreview').src = p.image_url;
      document.getElementById('imagePreview').classList.remove('hidden');
    } else if (p.image) {
      document.getElementById('imagePreview').src = p.image;
      document.getElementById('imagePreview').classList.remove('hidden');
    }
    document.getElementById('postFormError').classList.add('hidden');
    showModal('postModal');
  } catch (e) { toast(e.message, 'error'); }
}

async function submitPost() {
  const title = document.getElementById('postTitle').value.trim();
  const content = document.getElementById('postContent').value.trim();
  const editId = document.getElementById('editPostId').value;
  const errEl = document.getElementById('postFormError');
  errEl.classList.add('hidden');

  if (!title || !content) {
    errEl.textContent = 'Title and content are required.';
    errEl.classList.remove('hidden');
    return;
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('content', content);
  const img = document.getElementById('postImageInput').files[0];
  const att = document.getElementById('postAttachInput').files[0];
  const imageUrl = document.getElementById('postImageUrl').value.trim();
  if (img) formData.append('image', img);
  else if (imageUrl) formData.append('image_url', imageUrl);
  if (att) formData.append('attachment', att);

  try {
    let data;
    if (editId) {
      data = await api(`/api/posts/${editId}/`, { method: 'PUT', body: formData });
      toast('Post updated!', 'success');
    } else {
      data = await api('/api/posts/', { method: 'POST', body: formData });
      toast('Post published!', 'success');
    }
    hideModal('postModal');
    if (editId) {
      openPost(editId);
    } else {
      openPost(data.post.id);
    }
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  }
}

async function deletePost(postId) {
  if (!confirm('Delete this post? This cannot be undone.')) return;
  try {
    await api(`/api/posts/${postId}/`, { method: 'DELETE' });
    toast('Post deleted');
    showPage('home');
  } catch (e) {
    toast(e.message, 'error');
  }
}

function handleImagePreview(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('imageDropLabel').textContent = file.name;
  document.getElementById('postImageUrl').value = '';
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('imagePreview');
    img.src = e.target.result;
    img.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function handleImageUrl(url) {
  const preview = document.getElementById('imagePreview');
  if (url) {
    preview.src = url;
    preview.classList.remove('hidden');
    document.getElementById('postImageInput').value = '';
    document.getElementById('imageDropLabel').textContent = 'Click or drag an image here';
  } else {
    preview.src = '';
    preview.classList.add('hidden');
  }
}

function handleAttachLabel(input) {
  const file = input.files[0];
  if (file) document.getElementById('attachLabel').textContent = '📎 ' + file.name;
}

// ── PROFILE / HISTORY ─────────────────────────────────────────────────────────
function showProfile() {
  if (STATE.user) showUserProfile(STATE.user.username);
  closeUserMenu();
}

async function showUserProfile(username) {
  showPage('profile');
  const container = document.getElementById('profileContent');
  container.innerHTML = '<div class="loading-posts">Loading profile…</div>';
  try {
    const data = await api(`/api/users/${username}/history/`);
    renderProfile(data, container);
  } catch (e) {
    container.innerHTML = `<div class="loading-posts" style="color:var(--red)">Error: ${e.message}</div>`;
  }
}

function renderProfile(data, container) {
  const { user, posts, comments } = data;
  const isSelf = STATE.user && STATE.user.username === user.username;
  const joined = new Date(user.date_joined).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  container.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar-lg" style="background:${avatarColor(user.username)}">${user.username[0].toUpperCase()}</div>
      <div class="profile-info">
        <h2>${esc(user.username)}</h2>
        <p>Joined ${joined} · ${posts.length} posts · ${comments.length} comments</p>
      </div>
    </div>
    <div class="profile-tabs">
      <button class="profile-tab active" onclick="profileTab(this,'profilePosts')">Posts</button>
      <button class="profile-tab" onclick="profileTab(this,'profileComments')">Comments</button>
    </div>
    <div id="profilePosts" class="profile-section">
      ${posts.length === 0 ? '<p style="color:var(--text3)">No posts yet.</p>' : ''}
      ${posts.map(p => {
        const isOwner = isSelf || (STATE.user && STATE.user.is_moderator);
        return `
          <div class="post-card" style="cursor:pointer">
            <div class="post-card-body" onclick="openPost(${p.id})">
              <div class="post-card-meta"><span>${new Date(p.created_at).toLocaleDateString()}</span></div>
              <h3>${esc(p.title)}</h3>
              <p class="post-card-excerpt">${esc(p.content.slice(0, 120))}…</p>
            </div>
            ${isOwner ? `
              <div class="post-card-footer">
                <button class="btn btn-ghost sm" onclick="editPost(${p.id})">Edit</button>
                <button class="btn btn-danger sm" onclick="deletePost(${p.id})">Delete</button>
              </div>` : ''}
          </div>`;
      }).join('')}
    </div>
    <div id="profileComments" class="profile-section hidden">
      ${comments.length === 0 ? '<p style="color:var(--text3)">No comments yet.</p>' : ''}
      ${comments.map(c => {
        const isOwner = isSelf || (STATE.user && STATE.user.is_moderator);
        return `
          <div class="profile-comment-card">
            <div class="c-meta">On post: <a href="#" onclick="openPost(${c.post_id})" style="color:var(--accent-light)">#${c.post_id}</a> · ${new Date(c.created_at).toLocaleString()}</div>
            <div class="c-text" id="pcContent-${c.id}">${esc(c.content)}</div>
            ${isOwner ? `
              <div class="c-actions">
                <button class="btn btn-ghost sm" onclick="startEditProfileComment(${c.id})">Edit</button>
                <button class="btn btn-danger sm" onclick="deleteProfileComment(${c.id}, '${esc(user.username)}')">Delete</button>
              </div>` : ''}
          </div>`;
      }).join('')}
    </div>`;
}

function profileTab(btn, tabId) {
  document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.profile-section').forEach(s => s.classList.add('hidden'));
  document.getElementById(tabId).classList.remove('hidden');
}

function startEditProfileComment(commentId) {
  const el = document.getElementById(`pcContent-${commentId}`);
  const original = el.textContent;
  el.innerHTML = `
    <textarea style="width:100%;background:var(--bg3);border:1px solid var(--accent);border-radius:var(--radius-sm);padding:8px;color:var(--text);font-family:var(--font-body);min-height:60px;outline:none">${esc(original)}</textarea>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn btn-ghost sm" onclick="document.getElementById('pcContent-${commentId}').textContent='${original.replace(/'/g,"\\'")}'"  >Cancel</button>
      <button class="btn btn-primary sm" onclick="saveProfileComment(${commentId})">Save</button>
    </div>`;
}

async function saveProfileComment(commentId) {
  const el = document.getElementById(`pcContent-${commentId}`);
  const ta = el.querySelector('textarea');
  if (!ta) return;
  const content = ta.value.trim();
  try {
    const data = await api(`/api/comments/${commentId}/`, { method: 'PUT', body: JSON.stringify({ content }) });
    el.textContent = data.comment.content;
    toast('Updated', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteProfileComment(commentId, username) {
  if (!confirm('Remove this comment? It will show as removed.')) return;
  try {
    await api(`/api/comments/${commentId}/`, { method: 'DELETE' });
    const card = document.getElementById(`pcContent-${commentId}`).closest('.profile-comment-card');
    if (card) card.innerHTML = '<div class="c-meta comment-deleted">— comment removed by poster —</div>';
    toast('Comment removed');
  } catch (e) { toast(e.message, 'error'); }
}

// ── MODERATOR PANEL ───────────────────────────────────────────────────────────
let currentModTab = 'users';

function modTab(tab) {
  currentModTab = tab;
  document.querySelectorAll('.tab').forEach((t, i) => {
    t.classList.toggle('active', ['users','posts','comments'][i] === tab);
  });
  loadModTab(tab);
}

async function loadModTab(tab) {
  const container = document.getElementById('modContent');
  container.innerHTML = '<div class="loading-posts">Loading…</div>';
  try {
    if (tab === 'users') {
      const data = await api('/api/mod/users/');
      container.innerHTML = `
        <table class="mod-table">
          <thead><tr><th>ID</th><th>Username</th><th>Email</th><th>Role</th><th>Posts</th><th>Comments</th><th>Joined</th></tr></thead>
          <tbody>
            ${data.users.map(u => `
              <tr>
                <td>${u.id}</td>
                <td><a href="#" onclick="showUserProfile('${esc(u.username)}')" style="color:var(--accent-light)">${esc(u.username)}</a></td>
                <td>${esc(u.email || '—')}</td>
                <td><span class="badge ${u.is_moderator ? 'badge-mod' : 'badge-user'}">${u.is_moderator ? 'Mod' : 'User'}</span></td>
                <td>${u.post_count}</td>
                <td>${u.comment_count}</td>
                <td style="font-family:var(--font-mono);font-size:11px">${new Date(u.date_joined).toLocaleDateString()}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    } else if (tab === 'posts') {
      const data = await api('/api/mod/posts/');
      container.innerHTML = `
        <table class="mod-table">
          <thead><tr><th>ID</th><th>Title</th><th>Author</th><th>Comments</th><th>Likes</th><th>Date</th><th>Action</th></tr></thead>
          <tbody>
            ${data.posts.map(p => `
              <tr>
                <td>${p.id}</td>
                <td><a href="#" onclick="openPost(${p.id})" style="color:var(--accent-light)">${esc(p.title)}</a></td>
                <td>${esc(p.author)}</td>
                <td>${p.comment_count}</td>
                <td>${p.like_count}</td>
                <td style="font-family:var(--font-mono);font-size:11px">${new Date(p.created_at).toLocaleDateString()}</td>
                <td><button class="btn btn-danger sm" onclick="modDeletePost(${p.id})">Delete</button></td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    } else {
      const data = await api('/api/mod/comments/');
      container.innerHTML = `
        <table class="mod-table">
          <thead><tr><th>ID</th><th>Author</th><th>Post ID</th><th>Content</th><th>Date</th><th>Action</th></tr></thead>
          <tbody>
            ${data.comments.map(c => `
              <tr>
                <td>${c.id}</td>
                <td>${esc(c.author)}</td>
                <td><a href="#" onclick="openPost(${c.post_id})" style="color:var(--accent-light)">#${c.post_id}</a></td>
                <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis">${c.deleted ? `<em style="color:var(--text3)">— removed by ${c.deleted_by} —</em>` : esc(c.content)}</td>
                <td style="font-family:var(--font-mono);font-size:11px">${new Date(c.created_at).toLocaleDateString()}</td>
                <td><button class="btn btn-danger sm" onclick="modDeleteComment(${c.id})">Delete</button></td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    }
  } catch (e) {
    container.innerHTML = `<div class="loading-posts" style="color:var(--red)">${e.message}</div>`;
  }
}

async function modDeletePost(postId) {
  if (!confirm('Delete this post?')) return;
  try {
    await api(`/api/posts/${postId}/`, { method: 'DELETE' });
    toast('Post deleted');
    loadModTab('posts');
  } catch (e) { toast(e.message, 'error'); }
}

async function modDeleteComment(commentId) {
  if (!confirm('Delete this comment?')) return;
  try {
    await api(`/api/comments/${commentId}/`, { method: 'DELETE' });
    toast('Comment deleted');
    loadModTab('comments');
  } catch (e) { toast(e.message, 'error'); }
}

// ── REAL-TIME POLLING ─────────────────────────────────────────────────────────
function startPostRealtime(postId) {
  stopPostRealtime();
  knownCommentIds.clear();
  document.querySelectorAll('[id^="comment-"]').forEach(el => {
    knownCommentIds.add(Number(el.id.replace('comment-', '')));
  });
  postPollTimer = setInterval(() => pollPostUpdates(postId), 5000);
}

function stopPostRealtime() {
  clearInterval(postPollTimer);
  postPollTimer = null;
  knownCommentIds.clear();
}

function startHomeRealtime() {
  stopHomeRealtime();
  homePollTimer = setInterval(pollHomeUpdates, 10000);
}

function stopHomeRealtime() {
  clearInterval(homePollTimer);
  homePollTimer = null;
}

async function pollPostUpdates(postId) {
  try {
    const [postData, commentsData] = await Promise.all([
      api(`/api/posts/${postId}/`),
      api(`/api/posts/${postId}/comments/`),
    ]);
    const post = postData.post;

    // Update like count in place
    const likeCountEl = document.getElementById(`likeCount-${postId}`);
    if (likeCountEl && likeCountEl.textContent != post.like_count) {
      likeCountEl.textContent = post.like_count;
    }

    // Update comment heading count
    const h3 = document.querySelector('.comments-section h3');
    if (h3) h3.textContent = `Comments (${post.comment_count})`;

    const tree = document.getElementById(`commentTree-${postId}`);
    if (!tree) return;

    // Remove "no comments" placeholder when first comment arrives
    if (commentsData.comments.length > 0 && tree.querySelector('p')) {
      tree.innerHTML = '';
    }

    // Update vote counts on all existing comments without re-rendering
    updateCommentVotes(commentsData.comments);

    // Append only new top-level comments and new replies
    commentsData.comments.forEach(c => {
      if (!knownCommentIds.has(c.id)) {
        tree.insertAdjacentHTML('beforeend', renderComment(c, postId, false));
        knownCommentIds.add(c.id);
      }
      (c.replies || []).forEach(r => {
        if (!knownCommentIds.has(r.id)) {
          const repliesEl = document.getElementById(`replies-${c.id}`);
          if (repliesEl) {
            repliesEl.insertAdjacentHTML('beforeend', renderComment(r, postId, true));
            knownCommentIds.add(r.id);
          }
        }
      });
    });
  } catch {}
}

function updateCommentVotes(comments) {
  comments.forEach(c => {
    if (!c.deleted) {
      const likesEl    = document.getElementById(`cLikes-${c.id}`);
      const dislikesEl = document.getElementById(`cDislikes-${c.id}`);
      if (likesEl    && likesEl.textContent    != c.likes)    likesEl.textContent    = c.likes;
      if (dislikesEl && dislikesEl.textContent != c.dislikes) dislikesEl.textContent = c.dislikes;
    }
    if (c.replies && c.replies.length) updateCommentVotes(c.replies);
  });
}

async function pollHomeUpdates() {
  try {
    const q = STATE.searchQuery ? `&q=${encodeURIComponent(STATE.searchQuery)}` : '';
    const data = await api(`/api/posts/?page=1${q}`);
    data.posts.forEach(p => {
      const likesEl = document.getElementById(`card-likes-${p.id}`);
      const commentsEl = document.getElementById(`card-comments-${p.id}`);
      if (likesEl) likesEl.textContent = `♡ ${p.like_count}`;
      if (commentsEl) commentsEl.textContent = `💬 ${p.comment_count}`;
    });
  } catch {}
}

// ── SEARCH ────────────────────────────────────────────────────────────────────
function debounceSearch() {
  clearTimeout(STATE.searchTimer);
  STATE.searchQuery = document.getElementById('searchInput').value;
  STATE.searchTimer = setTimeout(() => loadPosts(true), 400);
}

// ── MODAL UTILS ───────────────────────────────────────────────────────────────
function showModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function hideModal(id) {
  document.getElementById(id).classList.add('hidden');
}
function switchModal(from, to) {
  hideModal(from); showModal(to);
}

// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden');
  }
});

// ── USER MENU ──────────────────────────────────────────────────────────────────
function toggleUserMenu() {
  document.getElementById('userDropdown').classList.toggle('hidden');
}
function closeUserMenu() {
  document.getElementById('userDropdown').classList.add('hidden');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.avatar-menu')) closeUserMenu();
});

// ── TOAST ─────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

// ── THEME ─────────────────────────────────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const next = (html.getAttribute('data-theme') || 'dark') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  document.getElementById('themeToggle').textContent = next === 'dark' ? '☀' : '🌙';
}

// ── PASSWORD VISIBILITY ───────────────────────────────────────────────────────
function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.textContent = show ? '🙈' : '👁';
}

// ── ESCAPE HTML ──────────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
