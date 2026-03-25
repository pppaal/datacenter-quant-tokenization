const form = document.getElementById('waitlist-form');
const statusEl = document.getElementById('form-status');

form?.addEventListener('submit', (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const name = data.get('name');

  statusEl.textContent = `${name}님, 대기자 등록이 완료되었습니다. 곧 안내 메일을 보내드릴게요.`;
  form.reset();
});
