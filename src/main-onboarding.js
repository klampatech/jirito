// ===== Onboarding Module =====
function initOnboarding() {
  const seen = localStorage.getItem('jirito-onboarding');
  if (seen) return;
  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  let currentStep = 1;
  const totalSteps = 4;

  function updateStep(step) {
    document.querySelectorAll('.onboarding-step').forEach(s => s.style.display = 'none');
    document.querySelector(`.onboarding-step[data-step="${step}"]`).style.display = 'block';
    const nextBtn = document.getElementById('onboarding-next');
    nextBtn.textContent = step === totalSteps ? 'Get Started' : 'Next';
  }

  updateStep(1);

  document.getElementById('onboarding-next').addEventListener('click', () => {
    if (currentStep < totalSteps) {
      currentStep++;
      updateStep(currentStep);
    } else {
      overlay.style.display = 'none';
      localStorage.setItem('jirito-onboarding', 'true');
    }
  });

  document.getElementById('onboarding-skip').addEventListener('click', () => {
    overlay.style.display = 'none';
    localStorage.setItem('jirito-onboarding', 'true');
  });
}

