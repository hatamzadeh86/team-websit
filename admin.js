/* ---------- Local encrypted-config auth layer ---------- */
/* No backend exists, so "login" works like this:
   - First visit: you connect the GitHub repo once and pick a password.
   - The repo owner/name/branch/token are encrypted with a key derived
     from that password (PBKDF2 + AES-GCM) and saved in this browser's
     localStorage only.
   - Next visits: you just type the password to decrypt and unlock —
     no need to re-enter the token every time.
   - This protects the panel from someone who opens the /admin page but
     doesn't know your password. It does NOT replace the GitHub token
     itself as the real write-permission — keep the token scoped to
     just this one repo's contents. */

const STORAGE_KEY = 'site_admin_vault_v1';

function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b64ToBuf(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
}

async function deriveKey(password, saltBuf) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuf, iterations: 150000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptConfig(password, configObj) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder();
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(configObj)));
  return { salt: bufToB64(salt), iv: bufToB64(iv), data: bufToB64(cipher) };
}

async function decryptConfig(password, vault) {
  const salt = b64ToBuf(vault.salt);
  const iv = b64ToBuf(vault.iv);
  const key = await deriveKey(password, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, b64ToBuf(vault.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

function getVault() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

/* ---------- Boot: decide which screen to show ---------- */
window.addEventListener('DOMContentLoaded', () => {
  if (getVault()) {
    document.getElementById('gate-box').style.display = 'block';
  } else {
    document.getElementById('setup-box').style.display = 'block';
  }
});

async function doSetup() {
  const owner = document.getElementById('setup-owner').value.trim();
  const repo = document.getElementById('setup-repo').value.trim();
  const branch = document.getElementById('setup-branch').value.trim() || 'main';
  const token = document.getElementById('setup-token').value.trim();
  const pass1 = document.getElementById('setup-pass1').value;
  const pass2 = document.getElementById('setup-pass2').value;
  const status = document.getElementById('setup-status');

  if (!owner || !repo || !token) { status.textContent = 'همه فیلدهای مخزن را پر کنید.'; return; }
  if (pass1.length < 4) { status.textContent = 'رمز عبور باید حداقل ۴ کاراکتر باشد.'; return; }
  if (pass1 !== pass2) { status.textContent = 'رمز عبور و تکرار آن یکسان نیستند.'; return; }

  status.textContent = 'در حال ذخیره...';
  const vault = await encryptConfig(pass1, { owner, repo, branch, token });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));

  ghConfig = { owner, repo, branch, token };
  document.getElementById('setup-box').style.display = 'none';
  await enterEditor();
}

async function doUnlock() {
  const pass = document.getElementById('gate-pass').value;
  const status = document.getElementById('gate-status');
  const vault = getVault();
  if (!vault) { status.textContent = 'اطلاعاتی یافت نشد.'; return; }
  status.textContent = 'در حال باز کردن قفل...';
  try {
    ghConfig = await decryptConfig(pass, vault);
    document.getElementById('gate-box').style.display = 'none';
    await enterEditor();
  } catch (e) {
    status.textContent = 'رمز عبور اشتباه است.';
  }
}

function resetSetup() {
  if (!confirm('اطلاعات ذخیره‌شده در این مرورگر پاک می‌شود و باید دوباره مخزن و توکن را وارد کنید. ادامه می‌دهید؟')) return;
  localStorage.removeItem(STORAGE_KEY);
  document.getElementById('gate-box').style.display = 'none';
  document.getElementById('setup-box').style.display = 'block';
}

function lock() {
  document.getElementById('editor').style.display = 'none';
  document.getElementById('gate-box').style.display = 'block';
  document.getElementById('gate-pass').value = '';
  ghConfig = {};
  state = null;
}

/* ---------- GitHub content read/write ---------- */
let state = null;
let fileSha = null;
let ghConfig = {};

function apiHeaders() {
  return {
    'Authorization': 'token ' + ghConfig.token,
    'Accept': 'application/vnd.github+json'
  };
}

async function enterEditor() {
  document.getElementById('repo-info').textContent = ghConfig.owner + '/' + ghConfig.repo + ' (' + ghConfig.branch + ')';
  try {
    const url = 'https://api.github.com/repos/' + ghConfig.owner + '/' + ghConfig.repo +
      '/contents/data.json?ref=' + ghConfig.branch;
    const res = await fetch(url, { headers: apiHeaders() });
    if (!res.ok) throw new Error('خطا در دریافت اطلاعات (' + res.status + '). آدرس مخزن یا توکن را بررسی کنید.');
    const json = await res.json();
    fileSha = json.sha;
    state = JSON.parse(decodeURIComponent(escape(atob(json.content))));
    if (!state.labels) state.labels = {};
    if (!state.contact) state.contact = [];
    renderEditor();
    document.getElementById('editor').style.display = 'block';
  } catch (e) {
    alert(e.message);
  }
}

function renderEditor() {
  document.getElementById('site-name').value = state.site.name;
  document.getElementById('site-tagline').value = state.site.tagline;

  document.getElementById('label-skills').value = state.labels.skillsTitle || '';
  document.getElementById('label-team').value = state.labels.teamTitle || '';
  document.getElementById('label-projects').value = state.labels.projectsTitle || '';
  document.getElementById('label-hint').value = state.labels.projectsHint || '';
  document.getElementById('label-contact').value = state.labels.contactTitle || '';
  document.getElementById('label-footer').value = state.labels.footerText || '';

  const skillsEl = document.getElementById('skills-list');
  skillsEl.innerHTML = '';
  state.skills.forEach((s, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML =
      '<label>نام مهارت</label><input value="' + esc(s.name) + '" onchange="state.skills[' + i + '].name=this.value">' +
      '<label>درصد (0-100)</label><input type="number" min="0" max="100" value="' + s.value + '" onchange="state.skills[' + i + '].value=Number(this.value)">' +
      '<button class="danger" onclick="removeItem(\'skills\',' + i + ')">حذف</button>';
    skillsEl.appendChild(card);
  });

  const teamEl = document.getElementById('team-list');
  teamEl.innerHTML = '';
  state.team.forEach((m, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML =
      '<label>نام</label><input value="' + esc(m.name) + '" onchange="state.team[' + i + '].name=this.value">' +
      '<label>سمت / تخصص</label><input value="' + esc(m.role) + '" onchange="state.team[' + i + '].role=this.value">' +
      '<label>حروف نمایشی (آواتار)</label><input value="' + esc(m.initials) + '" onchange="state.team[' + i + '].initials=this.value">' +
      '<label>بیوگرافی کوتاه</label><textarea onchange="state.team[' + i + '].bio=this.value">' + esc(m.bio || '') + '</textarea>' +
      '<label>لینکدین</label><input value="' + esc(m.linkedin || '') + '" onchange="state.team[' + i + '].linkedin=this.value">' +
      '<label>گیت‌هاب</label><input value="' + esc(m.github || '') + '" onchange="state.team[' + i + '].github=this.value">' +
      '<button class="danger" onclick="removeItem(\'team\',' + i + ')">حذف</button>';
    teamEl.appendChild(card);
  });

  const projEl = document.getElementById('projects-list');
  projEl.innerHTML = '';
  state.projects.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML =
      '<label>عنوان پروژه</label><input value="' + esc(p.title) + '" onchange="state.projects[' + i + '].title=this.value">' +
      '<label>دسته (CV / LLM / Agent / Dev)</label>' +
      '<select onchange="state.projects[' + i + '].category=this.value">' +
        ['CV', 'LLM', 'Agent', 'Dev'].map(c =>
          '<option value="' + c + '"' + (p.category === c ? ' selected' : '') + '>' + c + '</option>'
        ).join('') +
      '</select>' +
      '<label>توضیحات</label><textarea onchange="state.projects[' + i + '].description=this.value">' + esc(p.description || '') + '</textarea>' +
      '<label>لینک (اختیاری)</label><input value="' + esc(p.link || '') + '" onchange="state.projects[' + i + '].link=this.value">' +
      '<button class="danger" onclick="removeItem(\'projects\',' + i + ')">حذف</button>';
    projEl.appendChild(card);
  });

  const contactEl = document.getElementById('contact-list');
  contactEl.innerHTML = '';
  state.contact.forEach((c, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML =
      '<label>عنوان (مثلا ایمیل، تلگرام، واتساپ)</label><input value="' + esc(c.label) + '" onchange="state.contact[' + i + '].label=this.value">' +
      '<label>مقدار</label><input value="' + esc(c.value) + '" onchange="state.contact[' + i + '].value=this.value">' +
      '<button class="danger" onclick="removeItem(\'contact\',' + i + ')">حذف</button>';
    contactEl.appendChild(card);
  });
}

function esc(str) {
  return String(str).replace(/"/g, '&quot;');
}

function removeItem(section, index) {
  state[section].splice(index, 1);
  renderEditor();
}

function addSkill() { state.skills.push({ name: 'مهارت جدید', value: 50 }); renderEditor(); }
function addMember() { state.team.push({ name: 'عضو جدید', role: '', initials: '??', bio: '', linkedin: '', github: '' }); renderEditor(); }
function addProject() { state.projects.push({ title: 'پروژه جدید', category: 'CV', description: '', link: '' }); renderEditor(); }
function addContact() { state.contact.push({ label: 'راه ارتباطی جدید', value: '' }); renderEditor(); }

function syncSiteFields() {
  state.site.name = document.getElementById('site-name').value;
  state.site.tagline = document.getElementById('site-tagline').value;
  state.labels.skillsTitle = document.getElementById('label-skills').value;
  state.labels.teamTitle = document.getElementById('label-team').value;
  state.labels.projectsTitle = document.getElementById('label-projects').value;
  state.labels.projectsHint = document.getElementById('label-hint').value;
  state.labels.contactTitle = document.getElementById('label-contact').value;
  state.labels.footerText = document.getElementById('label-footer').value;
}

async function saveContent() {
  syncSiteFields();
  const status = document.getElementById('save-status');
  status.textContent = 'در حال ذخیره...';
  try {
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(state, null, 2))));
    const url = 'https://api.github.com/repos/' + ghConfig.owner + '/' + ghConfig.repo + '/contents/data.json';
    const res = await fetch(url, {
      method: 'PUT',
      headers: apiHeaders(),
      body: JSON.stringify({
        message: 'به‌روزرسانی محتوای سایت از پنل مدیریت',
        content: content,
        sha: fileSha,
        branch: ghConfig.branch
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error('ذخیره ناموفق بود: ' + (err.message || res.status));
    }
    const json = await res.json();
    fileSha = json.content.sha;
    status.textContent = 'ذخیره شد. تغییرات ظرف چند ثانیه روی سایت اعمال می‌شود.';
  } catch (e) {
    status.textContent = e.message;
  }
}
