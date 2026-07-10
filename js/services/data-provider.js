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

/* ------------------------------- Auth -------------------------------- */

export async function signIn(){
  if (isFirebaseConfigured) {
    const fb = await loadFirebase();
    const user = await fb.signInWithGoogle();
    return { id: user.uid, displayName: user.displayName, photoURL: user.photoURL, email: user.email };
  }
  return demo.demoSignIn();
}

export async function signOutUser(){
  if (isFirebaseConfigured) {
    const fb = await loadFirebase();
    return fb.signOutUser(demo.demoCurrentUser()?.id);
  }
  return demo.demoSignOut();
}

export function currentUser(){ return demo.demoCurrentUser(); }
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
