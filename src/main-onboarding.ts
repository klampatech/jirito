/**
 * src/main-onboarding.ts — first-time user wizard.
 *
 * Conversion notes from src/main-onboarding.js:
 *   - 1:1 translation. State persisted in `localStorage` under
 *     `jirito-onboarding` (legacy key).
 *   - Steps are driven by `data-step` attributes on `.onboarding-step`
 *     elements. The `Next` button doubles as `Get Started` on the
 *     final step.
 */

import { attach } from "./_attach";

export function initOnboarding(): void {
  const seen = localStorage.getItem("jirito-onboarding");
  if (seen) return;
  const overlay = document.getElementById("onboarding-overlay");
  if (!overlay) return;
  overlay.style.display = "flex";
  let currentStep = 1;
  const totalSteps = 4;

  function updateStep(step: number): void {
    document.querySelectorAll<HTMLElement>(".onboarding-step").forEach((s) => {
      s.style.display = "none";
    });
    const target = document.querySelector<HTMLElement>(`.onboarding-step[data-step="${step}"]`);
    if (target) target.style.display = "block";
    const nextBtn = document.getElementById("onboarding-next");
    if (nextBtn) nextBtn.textContent = step === totalSteps ? "Get Started" : "Next";
  }

  updateStep(1);

  document.getElementById("onboarding-next")?.addEventListener("click", () => {
    if (currentStep < totalSteps) {
      currentStep++;
      updateStep(currentStep);
    } else {
      overlay.style.display = "none";
      localStorage.setItem("jirito-onboarding", "true");
    }
  });

  document.getElementById("onboarding-skip")?.addEventListener("click", () => {
    overlay.style.display = "none";
    localStorage.setItem("jirito-onboarding", "true");
  });
}

attach({ initOnboarding });
