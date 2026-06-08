// Minimal tab router. Each screen is { enter(el, ctx), exit() }.
export class Router {
  constructor(container, screens, sceneManager) {
    this.container = container;
    this.screens = screens;
    this.scene = sceneManager;
    this.current = null;
    this.currentName = null;

    this.tabbar = document.getElementById('tabbar');
    this.tabbar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-route]');
      if (btn) this.go(btn.dataset.route);
    });
  }

  go(name) {
    if (name === this.currentName) return;
    const screen = this.screens[name];
    if (!screen) return;

    this.current?.exit?.();
    this.container.innerHTML = '';
    this.current = screen;
    this.currentName = name;
    screen.enter(this.container, { scene: this.scene, router: this });

    // 3D scene only active on the Open tab (for now)
    this.scene.setActive(name === 'open');

    for (const btn of this.tabbar.querySelectorAll('button')) {
      btn.classList.toggle('active', btn.dataset.route === name);
    }
  }
}
