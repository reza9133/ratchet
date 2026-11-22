import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';
import { mountShell } from './ui/shell.js';
import { gearSpinner } from './ui/brand.js';

const page = document.body.dataset.page || 'home';
const splash = document.getElementById('splash');
if (splash) splash.innerHTML = `<div>${gearSpinner(110)}<p>RATCHET</p></div>`;

await mountShell(page);
const loaders = {
  home: () => import('./pages/home.js'), assembly: () => import('./pages/assembly.js'), charter: () => import('./pages/charter.js'),
  motions: () => import('./pages/motions.js'), docs: () => import('./pages/docs.js'), about: () => import('./pages/about.js'),
};
const mod = await loaders[page]?.();
mod?.default?.();
