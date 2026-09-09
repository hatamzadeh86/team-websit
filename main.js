const CATEGORY_COLORS = {
  CV: '#378ADD',
  LLM: '#7F77DD',
  Agent: '#D85A30',
  Dev: '#1D9E75'
};

function colorFor(cat) {
  return CATEGORY_COLORS[cat] || '#888780';
}

async function loadData() {
  const res = await fetch('data.json', { cache: 'no-store' });
  return res.json();
}

function renderSite(data) {
  document.getElementById('site-name').textContent = data.site.name;
  document.getElementById('site-tagline').textContent = data.site.tagline;
  document.title = data.site.name;

  const labels = data.labels || {};
  document.getElementById('skills-title').textContent = labels.skillsTitle || 'مهارت‌های تیم';
  document.getElementById('team-title').textContent = labels.teamTitle || 'اعضای تیم';
  document.getElementById('projects-title').textContent = labels.projectsTitle || 'پروژه‌ها';
  document.getElementById('projects-hint').textContent = labels.projectsHint || 'برای چرخاندن، بکشید';
  document.getElementById('contact-title').textContent = labels.contactTitle || 'تماس با ما';
  document.getElementById('footer-text').textContent =
    labels.footerText || ('© ' + new Date().getFullYear() + ' ' + data.site.name);

  const skillsList = document.getElementById('skills-list');
  skillsList.innerHTML = '';
  data.skills.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'skill-row';
    row.innerHTML =
      '<div class="labels"><span>' + s.name + '</span><span>' + s.value + '%</span></div>' +
      '<div class="skill-bar-track"><div class="skill-bar-fill" style="width:0%;background:' +
      colorFor(s.name.split(' ')[0]) + '"></div></div>';
    skillsList.appendChild(row);
    setTimeout(() => {
      row.querySelector('.skill-bar-fill').style.width = s.value + '%';
    }, 100 + i * 100);
  });

  const teamList = document.getElementById('team-list');
  teamList.innerHTML = '';
  data.team.forEach(member => {
    const card = document.createElement('div');
    card.className = 'team-card';
    card.innerHTML =
      '<div class="avatar">' + member.initials + '</div>' +
      '<h3>' + member.name + '</h3>' +
      '<p class="role">' + member.role + '</p>' +
      '<p class="bio">' + (member.bio || '') + '</p>';
    teamList.appendChild(card);
  });

  const contactCard = document.getElementById('contact-card');
  contactCard.innerHTML = (data.contact || []).map(c =>
    '<div class="contact-row"><span>' + c.label + '</span><span>' + c.value + '</span></div>'
  ).join('');

  buildSphere(data.projects);
}

function buildSphere(projects) {
  const sphere = document.getElementById('sphere');
  sphere.innerHTML = '';
  const n = projects.length;
  const radius = 130;

  projects.forEach((p, i) => {
    // Fibonacci sphere distribution
    const phi = Math.acos(1 - 2 * (i + 0.5) / n);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);

    const node = document.createElement('div');
    node.className = 'node';
    node.style.transform = 'translate3d(' + x + 'px,' + y + 'px,' + z + 'px)';
    node.innerHTML =
      '<div class="dot" style="background:' + colorFor(p.category) + '"></div>' +
      '<div class="title">' + p.title + '</div>' +
      '<div class="cat">' + p.category + '</div>';
    node.addEventListener('click', () => openModal(p));
    sphere.appendChild(node);
  });

  enableDragRotate();
  autoRotate();
}

let rotX = -15, rotY = 0, autoRotateEnabled = true;

function applyRotation() {
  document.getElementById('sphere').style.transform =
    'rotateX(' + rotX + 'deg) rotateY(' + rotY + 'deg)';
}

function autoRotate() {
  setInterval(() => {
    if (autoRotateEnabled) {
      rotY += 0.15;
      applyRotation();
    }
  }, 30);
}

function enableDragRotate() {
  const wrap = document.getElementById('sphere-wrap');
  let dragging = false, lastX = 0, lastY = 0;

  const start = (x, y) => { dragging = true; autoRotateEnabled = false; lastX = x; lastY = y; };
  const move = (x, y) => {
    if (!dragging) return;
    rotY += (x - lastX) * 0.4;
    rotX -= (y - lastY) * 0.4;
    rotX = Math.max(-80, Math.min(80, rotX));
    lastX = x; lastY = y;
    applyRotation();
  };
  const end = () => { dragging = false; setTimeout(() => autoRotateEnabled = true, 2000); };

  wrap.addEventListener('mousedown', e => start(e.clientX, e.clientY));
  window.addEventListener('mousemove', e => move(e.clientX, e.clientY));
  window.addEventListener('mouseup', end);

  wrap.addEventListener('touchstart', e => {
    const t = e.touches[0]; start(t.clientX, t.clientY);
  }, { passive: true });
  wrap.addEventListener('touchmove', e => {
    const t = e.touches[0]; move(t.clientX, t.clientY);
  }, { passive: true });
  wrap.addEventListener('touchend', end);

  applyRotation();
}

function openModal(p) {
  document.getElementById('modal-title').textContent = p.title;
  document.getElementById('modal-desc').textContent = p.description;
  document.getElementById('modal-backdrop').classList.add('open');
}
function closeModal() {
  document.getElementById('modal-backdrop').classList.remove('open');
}

function drawParticles() {
  const canvas = document.getElementById('particle-canvas');
  const ctx = canvas.getContext('2d');
  let w, h, points;

  function resize() {
    w = canvas.width = canvas.offsetWidth;
    h = canvas.height = canvas.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  points = Array.from({ length: 40 }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3
  }));

  function tick() {
    ctx.clearRect(0, 0, w, h);
    points.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    });
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[i].x - points[j].x, dy = points[i].y - points[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 110) {
          ctx.strokeStyle = 'rgba(127,119,221,' + (1 - dist / 110) * 0.4 + ')';
          ctx.beginPath();
          ctx.moveTo(points[i].x, points[i].y);
          ctx.lineTo(points[j].x, points[j].y);
          ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(127,119,221,0.6)';
      ctx.beginPath();
      ctx.arc(points[i].x, points[i].y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(tick);
  }
  tick();
}

loadData().then(renderSite);
drawParticles();
