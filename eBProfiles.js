import { eBliss } from './eBSDK.js';
import { showModal } from './eBModal.js';

let currentProfile = null;

function fileToHex(bytes) {
  let hex = '';
  for (const byte of new Uint8Array(bytes)) hex += byte.toString(16).padStart(2, '0');
  return `\\x${hex}`;
}

async function resizeAvatar(file) {
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    image.src = url;
    await image.decode();
    const size = 256;
    const scale = Math.min(1, size / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.86));
    if (!blob) throw new Error('Unable to encode avatar');
    return { data: await blob.arrayBuffer(), mimeType: 'image/webp' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function avatarDataUrl(profile) {
  if (!profile?.avatar_data) return '';
  const value = String(profile.avatar_data);
  if (!value.startsWith('\\x')) return value.startsWith('data:') ? value : '';
  const bytes = value.slice(2).match(/.{1,2}/g)?.map(pair => parseInt(pair, 16)) || [];
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${profile.avatar_mime_type || 'image/webp'};base64,${btoa(binary)}`;
}

export async function loadProfile(userId = null) {
  currentProfile = userId ? await eBliss.profile.get(userId) : null;
  window.dispatchEvent(new CustomEvent('profile:updated', { detail: currentProfile }));
  return currentProfile;
}

export function getProfile() { return currentProfile; }

export async function editProfile() {
  const sessionResult = await eBliss.auth.getSession();
  const user = sessionResult?.data?.session?.user || null;
  if (!user) return null;

  const values = await showModal({
    title: 'Edit Profile',
    submitLabel: 'Save Profile',
    fields: [
      { name: 'display_name', label: 'Name', value: currentProfile?.display_name || user.email?.split('@')[0] || '' },
      { name: 'avatar', label: 'Avatar', type: 'file', accept: 'image/*' },
    ],
  });
  if (!values) return null;

  const update = { display_name: String(values.display_name || '').trim() || null };
  const file = values.avatar instanceof File ? values.avatar : null;
  if (file) {
    const avatar = await resizeAvatar(file);
    update.avatar_data = fileToHex(avatar.data);
    update.avatar_mime_type = avatar.mimeType;
  }

  currentProfile = await eBliss.profile.upsert(user.id, update);
  window.dispatchEvent(new CustomEvent('profile:updated', { detail: currentProfile }));
  return currentProfile;
}

export async function initProfiles() {
  const sessionResult = await eBliss.auth.getSession();
  await loadProfile(sessionResult?.data?.session?.user?.id || null);

  eBliss.auth.onAuthStateChange(async (_event, session) => {
    await loadProfile(session?.user?.id || null);
  });

  document.addEventListener('click', event => {
    if (event.target.closest('[data-eb-profile-edit]')) void editProfile().catch(error => console.error(error));
  });
}

export function profileAvatarUrl(profile = currentProfile) { return avatarDataUrl(profile); }

export const eBProfiles = Object.freeze({
  get: loadProfile,
  current: getProfile,
  edit: editProfile,
  avatarUrl: profileAvatarUrl,
});
