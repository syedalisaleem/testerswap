import { createHash } from 'node:crypto';
const script = `(function () {
  var t = 'console';
  try { t = localStorage.getItem('ts-theme') || t; } catch (e) {}
  document.documentElement.setAttribute('data-theme', t);
})();`;
console.log('sha256-' + createHash('sha256').update(script).digest('base64'));