/**
 * demo-data.js
 * -----------------------------------------------------------------------
 * A self-contained, in-browser "backend" that mimics the shape and
 * real-time behaviour of Firebase (Auth + Firestore + Storage) closely
 * enough that data-provider.js can expose one consistent API to app.js
 * regardless of which backend is actually active.
 *
 * State is persisted to localStorage so a reload keeps your chats.
 * Simulated contacts occasionally "reply" and show typing indicators so
 * the interface feels alive during a demo / offline evaluation.
 * -----------------------------------------------------------------------
 */
import { uid } from '../utils/helpers.js';

const DB_KEY = 'hubchat:demo-db';
const bus = new EventTarget();
const emit = (topic) => bus.dispatchEvent(new CustomEvent(topic));

function avatar(seed){
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundType=gradientLinear`;
}

const CONTACT_SEEDS = [
  { name: 'Maya Chen', status: 'Building beautiful things ✦ probably in Figma' },
  { name: 'Theo Ramirez', status: 'Out for a run, back in 20' },
  { name: 'Priya Nair', status: 'Available' },
  { name: 'Jonas Weber', status: 'In a meeting until 3pm' },
  { name: 'Aiko Tanaka', status: 'Coffee first, questions later' },
  { name: 'Lucas Ferreira', status: 'On mobile' },
];

const AUTO_REPLIES = [
  "Got it, thanks for the update!",
  "Haha that's amazing 😄 wait — no emoji here, but you get the idea.",
  "Let me check and get back to you shortly.",
  "Sounds great, count me in.",
  "Can we sync on this tomorrow morning?",
  "Just saw this, on it now.",
  "Perfect, sending the files over shortly.",
  "Appreciate you flagging this early.",
];

function freshDB(){
  const now = Date.now();
  const contacts = CONTACT_SEEDS.map((c, i) => ({
    id: uid('user'),
    displayName: c.name,
    photoURL: avatar(c.name),
    status: c.status,
    online: i % 3 !== 0,
    lastSeen: now - (i + 1) * 1000 * 60 * 24,
  }));

  const me = {
    id: 'me',
    displayName: 'You',
    email: 'you@hubchat.app',
    photoURL: avatar('You HUB'),
    status: 'Hey there! I am using HUB Chat.',
    online: true,
    lastSeen: now,
  };

  const chats = [];
  const messages = {};

  // Seed a few 1:1 chats
  contacts.slice(0, 4).forEach((c, i) => {
    const chatId = uid('chat');
    chats.push({
      id: chatId, type: 'direct', members: ['me', c.id],
      pinned: i === 0, muted: false, archived: false,
      updatedAt: now - i * 1000 * 60 * 40,
    });
    messages[chatId] = seedThread(chatId, 'me', c.id, c.name);
  });

  // Seed one group chat
  const groupId = uid('chat');
  const groupMembers = ['me', ...contacts.slice(0, 4).map((c) => c.id)];
  chats.push({
    id: groupId, type: 'group', name: 'Product Launch 🚀'.replace(' 🚀', ''),
    name2: 'Product Launch Squad',
    description: 'Coordinating the Q3 launch across design, eng and marketing.',
    photoURL: 'https://files.catbox.moe/x9w5kn.png',
    members: groupMembers, admins: ['me', contacts[0].id], owner: 'me',
    inviteCode: Math.random().toString(36).slice(2, 9), closed: false,
    pinned: false, muted: false, archived: false,
    updatedAt: now - 1000 * 60 * 5,
  });
  chats[chats.length - 1].name = 'Product Launch Squad';
  messages[groupId] = seedGroupThread(groupId, groupMembers, contacts);

  return {
    currentUserId: null,
    users: [me, ...contacts].reduce((acc, u) => ({ ...acc, [u.id]: u }), {}),
    chats,
    messages,
    typing: {},
    stories: seedStories(contacts),
    notifications: [],
  };
}

function seedThread(chatId, meId, peerId, peerName){
  const now = Date.now();
  return [
    mkMsg(chatId, peerId, `Hey! Excited to be trying out HUB Chat with you 👋`.replace(' 👋', ''), now - 1000 * 60 * 60 * 3),
    mkMsg(chatId, meId, `Same here — loving the interface so far.`, now - 1000 * 60 * 58 * 3, { status: 'read' }),
    mkMsg(chatId, peerId, `The glass effect on the composer is such a nice touch.`, now - 1000 * 60 * 55 * 3),
    mkMsg(chatId, meId, `Right? Let's plan the ${peerName.split(' ')[0]} sync for tomorrow.`, now - 1000 * 60 * 40, { status: 'delivered' }),
  ];
}

function seedGroupThread(chatId, memberIds, contacts){
  const now = Date.now();
  const [a, b, c] = contacts;
  return [
    mkMsg(chatId, a.id, 'Kicking off the launch thread here — welcome everyone!', now - 1000 * 60 * 90),
    mkMsg(chatId, b.id, 'Design assets are 90% done, sharing previews soon.', now - 1000 * 60 * 70),
    mkMsg(chatId, 'me', 'Awesome, engineering is on track for the freeze date.', now - 1000 * 60 * 50, { status: 'read' }),
    mkMsg(chatId, c.id, 'Marketing copy first draft is in the doc, please review 🙏'.replace(' 🙏', ''), now - 1000 * 60 * 12),
  ];
}

function mkMsg(chatId, senderId, text, ts, extra = {}){
  return {
    id: uid('msg'), chatId, senderId, text, type: 'text',
    createdAt: ts, status: 'sent', reactions: {}, replyTo: null, edited: false, deleted: false,
    ...extra,
  };
}

function seedStories(contacts){
  const now = Date.now();
  return [
    { id: uid('story'), authorId: contacts[0].id, media: `https://picsum.photos/seed/${contacts[0].id}/480/854`, mediaType: 'image', createdAtMs: now - 1000 * 60 * 40, views: ['me', contacts[1].id] },
    { id: uid('story'), authorId: contacts[1].id, media: `https://picsum.photos/seed/${contacts[1].id}/480/854`, mediaType: 'image', createdAtMs: now - 1000 * 60 * 190, views: [] },
    { id: uid('story'), authorId: contacts[2].id, media: `https://picsum.photos/seed/${contacts[2].id}/480/854`, mediaType: 'image', createdAtMs: now - 1000 * 60 * 300, views: ['me'] },
  ];
}

let state = load();

function load(){
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore corrupt state */ }
  return freshDB();
}

function persist(){
  localStorage.setItem(DB_KEY, JSON.stringify(state));
}

/* ------------------------------- Auth -------------------------------- */

export function demoSignIn(){
  state.currentUserId = 'me';
  state.users.me.online = true;
  persist();
  emit('auth');
  return state.users.me;
}

export function demoSignOut(){
  if (state.users.me) state.users.me.online = false;
  state.currentUserId = null;
  persist();
  emit('auth');
}

export function demoCurrentUser(){
  return state.currentUserId ? state.users[state.currentUserId] : null;
}

export function demoUpdateProfile({ displayName, photoURL, status }){
  const me = state.users.me;
  if (displayName) me.displayName = displayName;
  if (photoURL) me.photoURL = photoURL;
  if (status !== undefined) me.status = status;
  persist();
  emit('users');
}

export function demoDeleteAccount(){
  delete state.users.me;
  state.chats = state.chats.filter((c) => !c.members.includes('me'));
  state.currentUserId = null;
  persist();
  emit('auth');
}

export function demoGetUser(id){ return state.users[id]; }
export function demoAllContacts(){ return Object.values(state.users).filter((u) => u.id !== 'me'); }

/* ------------------------------- Chats -------------------------------- */

export function demoGetChats(){
  return [...state.chats]
    .filter((c) => c.members.includes('me'))
    .sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
}

export function demoOnChats(cb){
  const handler = () => cb(demoGetChats());
  bus.addEventListener('chats', handler);
  bus.addEventListener('users', handler);
  handler();
  return () => { bus.removeEventListener('chats', handler); bus.removeEventListener('users', handler); };
}

export function demoGetChat(chatId){ return state.chats.find((c) => c.id === chatId); }

export function demoChatPeer(chat){
  if (chat.type !== 'direct') return null;
  const peerId = chat.members.find((m) => m !== 'me');
  return state.users[peerId];
}

export function demoPatchChat(chatId, patch){
  const chat = state.chats.find((c) => c.id === chatId);
  Object.assign(chat, patch, { updatedAt: Date.now() });
  persist();
  emit('chats');
}

export function demoCreateGroup({ name, memberIds, photoURL }){
  const chat = {
    id: uid('chat'), type: 'group', name, photoURL: photoURL || 'https://files.catbox.moe/x9w5kn.png',
    description: '', members: ['me', ...memberIds], admins: ['me'], owner: 'me',
    inviteCode: Math.random().toString(36).slice(2, 9), closed: false,
    pinned: false, muted: false, archived: false, updatedAt: Date.now(),
  };
  state.chats.unshift(chat);
  state.messages[chat.id] = [];
  persist();
  emit('chats');
  return chat;
}

export function demoStartDirectChat(peerId){
  let chat = state.chats.find((c) => c.type === 'direct' && c.members.includes(peerId) && c.members.includes('me'));
  if (!chat) {
    chat = { id: uid('chat'), type: 'direct', members: ['me', peerId], pinned: false, muted: false, archived: false, updatedAt: Date.now() };
    state.chats.unshift(chat);
    state.messages[chat.id] = [];
    persist();
    emit('chats');
  }
  return chat;
}

/* ------------------------------ Messages ------------------------------ */

export function demoGetMessages(chatId){ return state.messages[chatId] || []; }

export function demoOnMessages(chatId, cb){
  const handler = () => cb(demoGetMessages(chatId));
  const topic = `messages:${chatId}`;
  bus.addEventListener(topic, handler);
  handler();
  return () => bus.removeEventListener(topic, handler);
}

export function demoSendMessage(chatId, message){
  const msg = {
    id: uid('msg'), chatId, senderId: 'me', createdAt: Date.now(), status: 'sent',
    reactions: {}, replyTo: null, edited: false, deleted: false, ...message,
  };
  state.messages[chatId] = state.messages[chatId] || [];
  state.messages[chatId].push(msg);
  const chat = state.chats.find((c) => c.id === chatId);
  chat.updatedAt = Date.now();
  chat.lastMessage = { text: message.type === 'text' ? message.text : `Sent a ${message.type}`, senderId: 'me' };
  persist();
  emit(`messages:${chatId}`);
  emit('chats');
  simulateDelivery(chatId, msg.id);
  maybeAutoReply(chatId);
  return msg;
}

export function demoEditMessage(chatId, messageId, text){
  const msg = state.messages[chatId]?.find((m) => m.id === messageId);
  if (!msg) return;
  msg.text = text; msg.edited = true;
  persist();
  emit(`messages:${chatId}`);
}

export function demoDeleteMessage(chatId, messageId){
  const msg = state.messages[chatId]?.find((m) => m.id === messageId);
  if (!msg) return;
  msg.deleted = true; msg.text = ''; msg.media = null;
  persist();
  emit(`messages:${chatId}`);
}

export function demoToggleReaction(chatId, messageId, emoji){
  const msg = state.messages[chatId]?.find((m) => m.id === messageId);
  if (!msg) return;
  msg.reactions[emoji] = msg.reactions[emoji] || [];
  const idx = msg.reactions[emoji].indexOf('me');
  if (idx >= 0) msg.reactions[emoji].splice(idx, 1);
  else msg.reactions[emoji].push('me');
  if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
  persist();
  emit(`messages:${chatId}`);
}

function simulateDelivery(chatId, messageId){
  setTimeout(() => {
    const msg = state.messages[chatId]?.find((m) => m.id === messageId);
    if (!msg) return;
    msg.status = 'delivered';
    persist();
    emit(`messages:${chatId}`);
    setTimeout(() => {
      if (!msg) return;
      msg.status = 'read';
      persist();
      emit(`messages:${chatId}`);
    }, 1600 + Math.random() * 1200);
  }, 500 + Math.random() * 400);
}

function maybeAutoReply(chatId){
  const chat = state.chats.find((c) => c.id === chatId);
  if (!chat || Math.random() > 0.7) return;
  const replierId = chat.type === 'direct'
    ? chat.members.find((m) => m !== 'me')
    : chat.members.filter((m) => m !== 'me')[Math.floor(Math.random() * (chat.members.length - 1))];
  if (!replierId) return;

  setTimeout(() => {
    demoSetTyping(chatId, replierId, true);
    setTimeout(() => {
      demoSetTyping(chatId, replierId, false);
      const text = AUTO_REPLIES[Math.floor(Math.random() * AUTO_REPLIES.length)];
      state.messages[chatId].push(mkMsg(chatId, replierId, text, Date.now()));
      chat.updatedAt = Date.now();
      chat.lastMessage = { text, senderId: replierId };
      persist();
      emit(`messages:${chatId}`);
      emit('chats');
      pushNotification(replierId, chatId, text);
    }, 1400 + Math.random() * 1400);
  }, 900 + Math.random() * 1600);
}

/* ------------------------------ Typing ------------------------------ */

export function demoSetTyping(chatId, userId, isTyping){
  state.typing[chatId] = state.typing[chatId] || {};
  if (isTyping) state.typing[chatId][userId] = true;
  else delete state.typing[chatId][userId];
  emit(`typing:${chatId}`);
}

export function demoOnTyping(chatId, cb){
  const handler = () => cb(Object.keys(state.typing[chatId] || {}));
  const topic = `typing:${chatId}`;
  bus.addEventListener(topic, handler);
  return () => bus.removeEventListener(topic, handler);
}

/* ------------------------------- Groups ------------------------------- */

export function demoAddMembers(chatId, memberIds){
  const chat = state.chats.find((c) => c.id === chatId);
  chat.members = [...new Set([...chat.members, ...memberIds])];
  persist(); emit('chats');
}
export function demoRemoveMember(chatId, memberId){
  const chat = state.chats.find((c) => c.id === chatId);
  chat.members = chat.members.filter((m) => m !== memberId);
  chat.admins = chat.admins.filter((m) => m !== memberId);
  persist(); emit('chats');
}
export function demoPromoteAdmin(chatId, memberId){
  const chat = state.chats.find((c) => c.id === chatId);
  chat.admins = [...new Set([...chat.admins, memberId])];
  persist(); emit('chats');
}
export function demoDemoteAdmin(chatId, memberId){
  const chat = state.chats.find((c) => c.id === chatId);
  chat.admins = chat.admins.filter((m) => m !== memberId);
  persist(); emit('chats');
}
export function demoRegenerateInvite(chatId){
  const chat = state.chats.find((c) => c.id === chatId);
  chat.inviteCode = Math.random().toString(36).slice(2, 9);
  persist(); emit('chats');
  return chat.inviteCode;
}

/* ------------------------------- Stories ------------------------------- */

export function demoGetStories(){ return state.stories.filter((s) => Date.now() - s.createdAtMs < 86400000); }
export function demoOnStories(cb){
  const handler = () => cb(demoGetStories());
  bus.addEventListener('stories', handler);
  handler();
  return () => bus.removeEventListener('stories', handler);
}
export function demoPostStory(story){
  state.stories.unshift({ id: uid('story'), authorId: 'me', createdAtMs: Date.now(), views: [], ...story });
  persist(); emit('stories');
}
export function demoViewStory(storyId){
  const s = state.stories.find((s2) => s2.id === storyId);
  if (s && !s.views.includes('me')) { s.views.push('me'); persist(); emit('stories'); }
}

/* ---------------------------- Notifications ---------------------------- */

function pushNotification(fromId, chatId, text){
  const chat = state.chats.find((c) => c.id === chatId);
  if (chat?.muted) return;
  const from = state.users[fromId];
  const note = { id: uid('note'), fromId, chatId, text, ts: Date.now(), read: false, fromName: from?.displayName };
  state.notifications.unshift(note);
  state.notifications = state.notifications.slice(0, 30);
  persist();
  emit('notifications');
}

export function demoOnNotifications(cb){
  const handler = () => cb(state.notifications);
  bus.addEventListener('notifications', handler);
  handler();
  return () => bus.removeEventListener('notifications', handler);
}
export function demoMarkNotificationsRead(){
  state.notifications.forEach((n) => { n.read = true; });
  persist(); emit('notifications');
}

/* ------------------------------- Storage ------------------------------- */

/** Demo "upload": converts a File to a base64 data URL so it can be
 *  rendered immediately without any backend. */
export function demoUploadFile(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function resetDemoData(){
  state = freshDB();
  persist();
  emit('auth'); emit('chats'); emit('users'); emit('stories'); emit('notifications');
}
