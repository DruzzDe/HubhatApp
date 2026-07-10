/**
 * firebase-service.js
 * -----------------------------------------------------------------------
 * Thin wrapper around the Firebase Web SDK (v10, modular, loaded from the
 * official CDN as ES modules). Every exported function mirrors a method
 * used by the demo-data service so app.js can call either implementation
 * through the same interface (see services/data-provider.js).
 *
 * This file only executes Firebase calls — it never falls back to demo
 * data itself. That decision is made once, in data-provider.js.
 * -----------------------------------------------------------------------
 */
import { firebaseConfig, fcmVapidKey } from '../config/firebase-config.js';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  updateProfile, deleteUser,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, doc, setDoc, addDoc, getDoc, getDocs, updateDoc,
  deleteDoc, onSnapshot, query, where, orderBy, limit, serverTimestamp,
  arrayUnion, arrayRemove,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getStorage, ref, uploadBytes, getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import {
  getMessaging, getToken, onMessage, isSupported,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

/* ------------------------------- Auth ------------------------------- */

export function watchAuthState(callback){
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle(){
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  const { uid, displayName, email, photoURL } = result.user;
  // Ensure a user profile document exists in Firestore.
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      uid, displayName, email, photoURL,
      status: 'Hey there! I am using HUB Chat.',
      online: true,
      lastSeen: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
  } else {
    await updateDoc(userRef, { online: true, lastSeen: serverTimestamp() });
  }
  return result.user;
}

export async function signOutUser(uid){
  if (uid) await updateDoc(doc(db, 'users', uid), { online: false, lastSeen: serverTimestamp() });
  return signOut(auth);
}

export async function updateUserProfile(uid, { displayName, photoURL }){
  await updateProfile(auth.currentUser, { displayName, photoURL });
  await updateDoc(doc(db, 'users', uid), { displayName, photoURL });
}

export async function deleteUserAccount(uid){
  await deleteDoc(doc(db, 'users', uid));
  await deleteUser(auth.currentUser);
}

/* ----------------------------- Firestore ----------------------------- */

export function watchUserChats(uid, callback){
  const q = query(collection(db, 'chats'), where('members', 'array-contains', uid), orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export function watchMessages(chatId, callback){
  const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'), limit(500));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function sendMessage(chatId, message){
  await addDoc(collection(db, 'chats', chatId, 'messages'), { ...message, createdAt: serverTimestamp() });
  await updateDoc(doc(db, 'chats', chatId), { lastMessage: message, updatedAt: serverTimestamp() });
}

export async function editMessage(chatId, messageId, newText){
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), { text: newText, edited: true });
}

export async function deleteMessage(chatId, messageId){
  await deleteDoc(doc(db, 'chats', chatId, 'messages', messageId));
}

export async function toggleReaction(chatId, messageId, emoji, uid){
  const ref2 = doc(db, 'chats', chatId, 'messages', messageId);
  await updateDoc(ref2, { [`reactions.${emoji}`]: arrayUnion(uid) });
}

export async function setTyping(chatId, uid, isTyping){
  await setDoc(doc(db, 'chats', chatId, 'typing', uid), { isTyping, at: serverTimestamp() }, { merge: true });
}

export function watchTyping(chatId, callback){
  return onSnapshot(collection(db, 'chats', chatId, 'typing'), (snap) => {
    callback(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
  });
}

export async function createGroup(name, memberIds, ownerUid, photoURL = ''){
  const ref2 = await addDoc(collection(db, 'chats'), {
    type: 'group', name, photoURL, members: memberIds, admins: [ownerUid], owner: ownerUid,
    inviteCode: Math.random().toString(36).slice(2, 9), closed: false,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref2.id;
}

export async function updateGroup(chatId, data){
  await updateDoc(doc(db, 'chats', chatId), data);
}

/* ------------------------------ Storage ------------------------------ */

export async function uploadFile(path, file){
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

/* ------------------------------ Stories ------------------------------- */

export function watchStories(callback){
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const q = query(collection(db, 'stories'), where('createdAtMs', '>', cutoff), orderBy('createdAtMs', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function postStory(story){
  await addDoc(collection(db, 'stories'), { ...story, createdAt: serverTimestamp(), createdAtMs: Date.now(), views: [] });
}

export async function markStoryViewed(storyId, uid){
  await updateDoc(doc(db, 'stories', storyId), { views: arrayUnion(uid) });
}

/* ----------------------------- Messaging (FCM) ----------------------------- */

export async function initMessaging(onForegroundMessage){
  if (!(await isSupported().catch(() => false))) return null;
  const messaging = getMessaging(app);
  try {
    const token = await getToken(messaging, { vapidKey: fcmVapidKey });
    onMessage(messaging, onForegroundMessage);
    return token;
  } catch (err) {
    console.warn('FCM permission not granted or unsupported:', err.message);
    return null;
  }
}
