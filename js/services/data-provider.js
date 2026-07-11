/**
 * data-provider.js
 * -----------------------------------------------------------------------
 * Single entry point the UI talks to. By default (no Firebase project
 * configured) everything is backed by demo-data.js so the whole product
 * — auth, chats, groups, stories, notifications — works instantly in
 * the browser. Once you add real credentials to
 * js/config/firebase-config.js, Google Sign-In switches to the real
 * Firebase Authentication flow automatically; wire the remaining
 * exports in firebase-service.js the same way to go fully live
 * (each function there mirrors one exported here).
 * -----------------------------------------------------------------------
 */
import { isFirebaseConfigured } from '../config/firebase-config.js';
import * as demo from './demo-data.js';

export const backendMode = isFirebaseConfigured ? 'firebase' : 'demo';

let firebaseSvc = null;
async function loadFirebase(){
  if (!firebaseSvc) firebaseSvc = await import('./firebase-service.js');
  return firebaseSvc;
}

// Holds the mapped current user when running against real Firebase Auth.
// (Kept separate from demo state so the two backends never mix.)
let liveUser = null;
function mapUser(u){
  if (!u) return null;
  return {
    id: u.uid, displayName: u.displayName || 'You', photoURL: u.photoURL || '',
    email: u.email, status: 'Hey there! I am using HUB Chat.', online: true,
  };
}

/* ------------------------------- Auth -------------------------------- */

// Must be awaited once at boot, before the first currentUser() check, so
// an existing session (or a mobile sign-in returning via redirect) is
// picked up. Resolves to the current user (or null) either way.
export async function initAuth(){
  if (!isFirebaseConfigured) return demo.demoCurrentUser();
  const fb = await loadFirebase();
  const redirectUser = await fb.getGoogleRedirectResult();
  if (redirectUser) {
    liveUser = mapUser(redirectUser);
    return liveUser;
  }
  // No pending redirect — check whether Firebase already has a persisted session.
  return new Promise((resolve) => {
    const unsub = fb.watchAuthState((u) => {
      unsub();
      liveUser = mapUser(u);
      resolve(liveUser);
    });
  });
}

export async function signIn(){
  if (isFirebaseConfigured) {
    const fb = await loadFirebase();
    const user = await fb.signInWithGoogle();
    // On mobile this returns null immediately (redirect navigates away);
    // liveUser gets populated by initAuth()'s getGoogleRedirectResult()
    // call after the page reloads back from Google.
    if (user) liveUser = mapUser(user);
    return liveUser;
  }
  return demo.demoSignIn();
}

export async function signOutUser(){
  if (isFirebaseConfigured) {
    const fb = await loadFirebase();
    const uidVal = liveUser?.id;
    liveUser = null;
    return fb.signOutUser(uidVal);
  }
  return demo.demoSignOut();
}

export function currentUser(){ return isFirebaseConfigured ? liveUser : demo.demoCurrentUser(); }
export function updateProfile(patch){ return demo.demoUpdateProfile(patch); }
export function deleteAccount(){ return demo.demoDeleteAccount(); }
export function getUser(id){ return demo.demoGetUser(id); }
export function allContacts(){ return demo.demoAllContacts(); }

/* ------------------------------- Chats -------------------------------- */

export const getChats = demo.demoGetChats;
export const onChats = demo.demoOnChats;
export const getChat = demo.demoGetChat;
export const chatPeer = demo.demoChatPeer;
export const patchChat = demo.demoPatchChat;
export const createGroup = demo.demoCreateGroup;
export const startDirectChat = demo.demoStartDirectChat;

/* ------------------------------ Messages ------------------------------ */

export const getMessages = demo.demoGetMessages;
export const onMessages = demo.demoOnMessages;
export const sendMessage = demo.demoSendMessage;
export const editMessage = demo.demoEditMessage;
export const deleteMessage = demo.demoDeleteMessage;
export const toggleReaction = demo.demoToggleReaction;
export const setTyping = demo.demoSetTyping;
export const onTyping = demo.demoOnTyping;

/* ------------------------------- Groups -------------------------------- */

export const addMembers = demo.demoAddMembers;
export const removeMember = demo.demoRemoveMember;
export const promoteAdmin = demo.demoPromoteAdmin;
export const demoteAdmin = demo.demoDemoteAdmin;
export const regenerateInvite = demo.demoRegenerateInvite;

/* ------------------------------- Stories ------------------------------- */

export const getStories = demo.demoGetStories;
export const onStories = demo.demoOnStories;
export const postStory = demo.demoPostStory;
export const viewStory = demo.demoViewStory;

/* ---------------------------- Notifications ---------------------------- */

export const onNotifications = demo.demoOnNotifications;
export const markNotificationsRead = demo.demoMarkNotificationsRead;

/* ------------------------------- Storage ------------------------------- */

export async function uploadFile(file, pathHint = ''){
  if (isFirebaseConfigured) {
    const fb = await loadFirebase();
    return fb.uploadFile(`uploads/${pathHint}/${Date.now()}_${file.name}`, file);
  }
  return demo.demoUploadFile(file);
}
