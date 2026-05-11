// ===== Theme Toggle Module =====
function initTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  const savedTheme = localStorage.getItem('jirito-theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggle.innerHTML = savedTheme === 'dark' ? lucideIcon('Sun', {class:'icon'}) : lucideIcon('Moon', {class:'icon'});
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeToggle.innerHTML = lucideIcon('Sun', {class:'icon'});
  }
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('jirito-theme', next);
    themeToggle.innerHTML = next === 'dark' ? lucideIcon('Sun', {class:'icon'}) : lucideIcon('Moon', {class:'icon'});
  });
}

