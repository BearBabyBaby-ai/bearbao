'use strict';
(() => {
  const log = document.getElementById('log');
  const form = document.getElementById('form');
  const input = document.getElementById('input');
  const send = document.getElementById('send');

  function add(text, who) {
    const d = document.createElement('div');
    d.className = 'msg ' + who;
    d.textContent = text;
    log.appendChild(d);
    while (log.children.length > 40) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
    return d;
  }

  add('要查分海或記帳，直接打給我：\n2026/11/15 分海\n2026/11/14 消夜 111', 'bear');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || send.disabled) return;
    add(text, 'me');
    input.value = '';
    send.disabled = true;
    const wait = add('熊寶處理中…', 'bear wait');
    let reply;
    try { reply = await window.desk.ask(text); } catch (_) { reply = '連不上熊寶系統，請確認網路後再試一次'; }
    wait.remove();
    add(reply, 'bear');
    send.disabled = false;
    input.focus();
  });

  window.desk.onFocus(() => input.focus());
})();
