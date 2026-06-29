/**
 * src/main-profile.ts — Profile menu: avatar click → modal → localStorage.
 */

const PROFILE_KEY = "jirito_display_name";

export function getDisplayName(): string {
  return localStorage.getItem(PROFILE_KEY) ?? "";
}

export function setDisplayName(name: string): void {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    localStorage.removeItem(PROFILE_KEY);
  } else {
    localStorage.setItem(PROFILE_KEY, trimmed);
  }
}

export function getAvatarInitial(): string {
  const name = getDisplayName();
  return name.trim().charAt(0).toUpperCase() || "K";
}

function openProfileModal(): void {
  const overlay = document.getElementById("profile-modal-overlay");
  const nameInput = document.getElementById("profile-name") as HTMLInputElement | null;
  if (overlay) overlay.style.display = "flex";
  if (nameInput) {
    nameInput.value = getDisplayName();
    nameInput.focus();
    nameInput.select();
  }
}

function closeProfileModal(): void {
  const overlay = document.getElementById("profile-modal-overlay");
  const form = document.getElementById("profile-form") as HTMLFormElement | null;
  if (overlay) overlay.style.display = "none";
  if (form) form.reset();
}

function updateAvatar(): void {
  const avatar = document.getElementById("user-avatar");
  if (avatar) {
    avatar.textContent = getAvatarInitial();
  }
}

function saveProfile(e: Event): void {
  e.preventDefault();
  const nameInput = document.getElementById("profile-name") as HTMLInputElement | null;
  if (!nameInput) return;
  setDisplayName(nameInput.value);
  updateAvatar();
  closeProfileModal();
}

export function initProfile(): void {
  // Wire avatar click
  document.getElementById("user-avatar")?.addEventListener("click", openProfileModal);

  // Wire modal buttons
  document.getElementById("profile-modal-close")?.addEventListener("click", closeProfileModal);
  document.getElementById("profile-cancel")?.addEventListener("click", closeProfileModal);
  document.getElementById("profile-form")?.addEventListener("submit", saveProfile);

  // Close on overlay click outside modal
  document.getElementById("profile-modal-overlay")?.addEventListener("click", (e: Event) => {
    if (!(e.target as HTMLElement).closest(".modal")) closeProfileModal();
  });

  // Initialize avatar with saved name
  updateAvatar();
}
