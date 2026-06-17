const titleInput = document.getElementById('req-title');
const submitBtn  = document.getElementById('req-submit');

function updateSubmit() {
  submitBtn.disabled = !titleInput.value.trim();
}

titleInput.addEventListener('input', updateSubmit);
updateSubmit();

const BTN_LABEL = 'ENVOYER <i class="fa-solid fa-angle-right"></i>';
const success = document.getElementById('req-success');
let successTimer;

document.getElementById('req-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  if (!titleInput.value.trim()) return;

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

  try {
    const res = await fetch('https://formspree.io/f/mjgddkqp', {
      method: 'POST',
      body: new FormData(this),
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error('bad response');

    this.reset();
    success.classList.add('visible');
    clearTimeout(successTimer);
    successTimer = setTimeout(() => success.classList.remove('visible'), 4000);
  } catch (_) {
    alert("Une erreur est survenue. Réessaie plus tard.");
  } finally {
    submitBtn.innerHTML = BTN_LABEL;
    updateSubmit();
  }
});
