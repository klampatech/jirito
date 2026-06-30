/**
 * src/main-profile.ts — Profile menu: avatar click → modal → localStorage.
 */
const PROFILE_KEY = "jirito_display_name";
export function getDisplayName() {
    return localStorage.getItem(PROFILE_KEY) ?? "";
}
export function setDisplayName(name) {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
        localStorage.removeItem(PROFILE_KEY);
    }
    else {
        localStorage.setItem(PROFILE_KEY, trimmed);
    }
}
export function getAvatarInitial() {
    const name = getDisplayName();
    return name.trim().charAt(0).toUpperCase() || "K";
}
function openProfileModal() {
    const overlay = document.getElementById("profile-modal-overlay");
    const nameInput = document.getElementById("profile-name");
    if (overlay)
        overlay.style.display = "flex";
    if (nameInput) {
        nameInput.value = getDisplayName();
        nameInput.focus();
        nameInput.select();
    }
}
function closeProfileModal() {
    const overlay = document.getElementById("profile-modal-overlay");
    const form = document.getElementById("profile-form");
    if (overlay)
        overlay.style.display = "none";
    if (form)
        form.reset();
}
function updateAvatar() {
    const avatar = document.getElementById("user-avatar");
    if (avatar) {
        avatar.textContent = getAvatarInitial();
    }
}
function saveProfile(e) {
    e.preventDefault();
    const nameInput = document.getElementById("profile-name");
    if (!nameInput)
        return;
    setDisplayName(nameInput.value);
    updateAvatar();
    closeProfileModal();
}
export function initProfile() {
    // Wire avatar click
    document.getElementById("user-avatar")?.addEventListener("click", openProfileModal);
    // Wire modal buttons
    document.getElementById("profile-modal-close")?.addEventListener("click", closeProfileModal);
    document.getElementById("profile-cancel")?.addEventListener("click", closeProfileModal);
    document.getElementById("profile-form")?.addEventListener("submit", saveProfile);
    // Close on overlay click outside modal
    document.getElementById("profile-modal-overlay")?.addEventListener("click", (e) => {
        if (!e.target.closest(".modal"))
            closeProfileModal();
    });
    // Initialize avatar with saved name
    updateAvatar();
}
//# sourceMappingURL=main-profile.js.map