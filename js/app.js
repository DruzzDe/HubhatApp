/**
 * app.js — HUB Chat application controller.
 * Boots the UI, wires every interactive surface to data-provider.js and
 * keeps the DOM in sync with realtime updates (or their demo-mode
 * simulation — see services/data-provider.js for how backends switch).
 */
import { initZoomLock } from './utils/zoom-lock.js';
import { initTheme, toggleTheme } from './ui/theme.js';
import { showToast } from './ui/toast.js';
import { $, $$, el, refreshIcons, escapeHTML, closeOnClickAway } from './utils/dom.js';
import {
  uid, debounce, formatTime, formatDayLabel, formatRelativeShort, formatLastSeen, formatBytes, initials,
} from './utils/helpers.js';
import * as data from './services/data-provider.js';

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

initZoomLock();
initTheme();

const state = {
  activeChatId: null,
  activeNav: 'chats',
  chatTab: 'all',
  replyTarget: null,
  unsubMessages: null,
  unsubTyping: null,
  isRecording: false,
  mediaRecorder: null,
  recordedChunks: [],
};

document.addEventListener('DOMContentLoaded', boot);

async function boot(){
  refreshIcons();
  $('#googleSignInBtn').addEventListener('click', handleSignIn);
  $('#backendModeNote').textContent = data.backendMode === 'demo'
    ? 'Running in demo mode — connect Firebase in js/config/firebase-config.js to go live.'
    : 'Connected to Firebase.';

  // On mobile, sign-in navigates away to Google and back to this page, so on
  // that return trip we land back in boot() and need to resolve the pending
  // redirect result before we know whether someone's signed in. Show the
  // spinner while that (brief) check happens instead of flashing the button.
  $('#authActions').classList.add('hidden');
  $('#authLoading').classList.add('is-visible');
  try {
    const existing = await data.initAuth();
    if (existing) { enterApp(); return; }
  } catch (err) {
    showToast(`Sign-in failed: ${err.message}`, 'error');
  }
  $('#authActions').classList.remove('hidden');
  $('#authLoading').classList.remove('is-visible');
}

async function handleSignIn(){
  $('#authActions').classList.add('hidden');
  $('#authLoading').classList.add('is-visible');
  try {
    const user = await data.signIn();
    if (user) {
      setTimeout(enterApp, 600); // brief, deliberate pause so the spinner reads as real auth
    }
    // else: mobile redirect flow — the page is about to navigate to Google;
    // nothing more to do here, the spinner stays up until that happens.
  } catch (err) {
    showToast(`Sign-in failed: ${err.message}`, 'error');
    $('#authActions').classList.remove('hidden');
    $('#authLoading').classList.remove('is-visible');
  }
}

function enterApp(){
  $('#authScreen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  const me = data.currentUser();
  $('#myAvatarImg').src = me.photoURL;
  renderChatList();
  data.onChats(renderChatList);
  renderStoriesBar();
  data.onStories(() => { renderStoriesBar(); renderStoriesFullList(); });
  data.onNotifications(renderNotifications);
  wireGlobalUI();
  refreshIcons();
}

/* ------------------------------------------------------------------ */
/* Nav rail + mobile view switching                                    */
/* ------------------------------------------------------------------ */

function wireGlobalUI(){
  $$('.rail-btn[data-nav]').forEach((btn) => btn.addEventListener('click', () => switchNav(btn.dataset.nav)));
  $('#themeToggleBtn').addEventListener('click', () => {
    const t = toggleTheme();
    $('#themeToggleBtn i').setAttribute('data-lucide', t === 'dark' ? 'sun' : 'moon-star');
    refreshIcons();
  });
  $('#myAvatarBtn').addEventListener('click', openProfileModal);
  $('#newChatBtn').addEventListener('click', openNewChatModal);
  $('#emptyNewChatBtn').addEventListener('click', openNewChatModal);
  $('#sidebarMenuBtn').addEventListener('click', (e) => openSidebarMenu(e.currentTarget));
  $('#closeStoriesPanelBtn').addEventListener('click', () => switchNav('chats'));
  $('#closeCallsPanelBtn').addEventListener('click', () => switchNav('chats'));
  $('#closeNotificationsPanelBtn').addEventListener('click', () => switchNav('chats'));
  $('#backToListBtn').addEventListener('click', () => setMobileView('list'));

  $$('.pill-tab[data-tab]').forEach((tab) => tab.addEventListener('click', () => {
    $$('.pill-tab[data-tab]').forEach((t) => t.classList.remove('is-active'));
    tab.classList.add('is-active');
    state.chatTab = tab.dataset.tab;
    renderChatList();
  }));

  $('#chatSearchInput').addEventListener('input', debounce(() => renderChatList(), 150));

  wireComposer();
  wireTopbarActions();
  renderCallsList();
  populateContactAvatars();
}

function switchNav(target){
  state.activeNav = target;
  $$('.rail-btn[data-nav]').forEach((b) => b.classList.toggle('is-active', b.dataset.nav === target));
  ['Chats', 'Stories', 'Calls', 'Notifications'].forEach((name) => {
    $(`#sidebar${name}`).classList.toggle('hidden', name.toLowerCase() !== target);
  });
  if (target === 'notifications') data.markNotificationsRead();
  setMobileView('list');
}

function setMobileView(view){
  $('#appShell').dataset.mobileView = view;
}

/* ------------------------------------------------------------------ */
/* Chat list                                                           */
/* ------------------------------------------------------------------ */

function renderChatList(){
  const me = data.currentUser();
  if (!me) return;
  const search = $('#chatSearchInput')?.value.trim().toLowerCase() || '';
  let chats = data.getChats();

  if (state.chatTab === 'groups') chats = chats.filter((c) => c.type === 'group' && !c.archived);
  else if (state.chatTab === 'pinned') chats = chats.filter((c) => c.pinned && !c.archived);
  else if (state.chatTab === 'archived') chats = chats.filter((c) => c.archived);
  else chats = chats.filter((c) => !c.archived);

  if (search) {
    chats = chats.filter((c) => chatTitle(c).toLowerCase().includes(search)
      || (c.lastMessage?.text || '').toLowerCase().includes(search));
  }

  const list = $('#chatList');
  list.innerHTML = '';
  if (chats.length === 0) {
    list.append(el('div', { class:'empty-state' },
      el('i', { 'data-lucide':'inbox' }),
      el('p', {}, 'No conversations here yet.'),
    ));
    refreshIcons();
    return;
  }
  chats.forEach((chat) => list.append(renderChatItem(chat)));
  refreshIcons();
}

function chatTitle(chat){
  if (chat.type === 'group') return chat.name;
  const peer = data.chatPeer(chat);
  return peer?.displayName || 'Unknown';
}

function chatPhoto(chat){
  if (chat.type === 'group') return chat.photoURL;
  return data.chatPeer(chat)?.photoURL;
}

function renderChatItem(chat){
  const title = chatTitle(chat);
  const photo = chatPhoto(chat);
  const peer = chat.type === 'direct' ? data.chatPeer(chat) : null;
  const preview = chat.lastMessage
    ? `${chat.lastMessage.senderId === 'me' ? 'You: ' : ''}${escapeHTML(chat.lastMessage.text || '')}`
    : 'Say hello 👋'.replace(' 👋', '');

  const item = el('div', { class:`chat-item${chat.id === state.activeChatId ? ' is-active' : ''}`, onclick: () => openChat(chat.id) },
    el('div', { class:'avatar avatar--md' },
      photo ? el('img', { src: photo, alt: title }) : initials(title),
      peer ? el('span', { class:`status-dot${peer.online ? ' is-online' : ''}` }) : null,
    ),
    el('div', { class:'chat-item__body' },
      el('div', { class:'chat-item__row' },
        el('div', { class:'chat-item__name' }, title),
        el('div', { class:'chat-item__time' }, chat.updatedAt ? formatRelativeShort(chat.updatedAt) : ''),
      ),
      el('div', { class:'chat-item__preview' },
        el('p', {}, preview),
        chat.pinned ? el('span', { class:'chat-item__pin' }, el('i', { 'data-lucide':'pin' })) : null,
        chat.muted ? el('span', { class:'chat-item__muted' }, el('i', { 'data-lucide':'bell-off' })) : null,
      ),
    ),
  );

  item.addEventListener('contextmenu', (e) => { e.preventDefault(); openChatItemMenu(e, chat); });
  let pressTimer;
  item.addEventListener('touchstart', () => { pressTimer = setTimeout(() => openChatItemMenu({ currentTarget:item, clientX:80, clientY:200 }, chat), 500); });
  item.addEventListener('touchend', () => clearTimeout(pressTimer));

  return item;
}

function openChatItemMenu(e, chat){
  e.preventDefault?.();
  const menu = el('div', { class:'dropdown', style:`top:${e.clientY}px;left:${Math.min(e.clientX, window.innerWidth - 220)}px;` },
    menuItem(chat.pinned ? 'pin-off' : 'pin', chat.pinned ? 'Unpin chat' : 'Pin chat', () => { data.patchChat(chat.id, { pinned: !chat.pinned }); showToast(chat.pinned ? 'Chat unpinned' : 'Chat pinned', 'success'); }),
    menuItem(chat.muted ? 'bell' : 'bell-off', chat.muted ? 'Unmute chat' : 'Mute chat', () => { data.patchChat(chat.id, { muted: !chat.muted }); showToast(chat.muted ? 'Chat unmuted' : 'Chat muted', 'success'); }),
    menuItem(chat.archived ? 'archive-restore' : 'archive', chat.archived ? 'Unarchive' : 'Archive chat', () => { data.patchChat(chat.id, { archived: !chat.archived }); showToast(chat.archived ? 'Chat restored' : 'Chat archived', 'success'); }),
  );
  document.body.append(menu);
  refreshIcons();
  closeOnClickAway(menu, () => {});
}

function menuItem(icon, label, onClick, danger = false){
  return el('button', { class:`dropdown__item${danger ? ' dropdown__item--danger' : ''}`, onclick: (e) => { onClick(e); e.currentTarget.closest('.dropdown')?.remove(); document.querySelector('.click-catcher')?.remove(); } },
    el('i', { 'data-lucide':icon }), label);
}

/* ------------------------------------------------------------------ */
/* Opening a chat + message rendering                                  */
/* ------------------------------------------------------------------ */

function openChat(chatId){
  state.activeChatId = chatId;
  state.replyTarget = null;
  $('#replyPreview').classList.remove('is-visible');
  $('#emptyState').classList.add('hidden');
  $('#chatView').classList.remove('hidden');
  $('#backToListBtn').style.display = 'inline-flex';
  setMobileView('chat');

  const chat = data.getChat(chatId);
  const title = chatTitle(chat);
  const photo = chatPhoto(chat);
  $('#topbarAvatar').innerHTML = '';
  $('#topbarAvatar').append(photo ? el('img', { src:photo }) : document.createTextNode(initials(title)));
  $('#topbarName').textContent = title;
  $('#topbarStatus').innerHTML = '';
  if (chat.type === 'direct') {
    const peer = data.chatPeer(chat);
    $('#topbarStatus').append(
      peer.online
        ? el('span', { style:'display:flex;align-items:center;gap:5px;' }, el('span', { style:'width:7px;height:7px;border-radius:50%;background:var(--accent-green);' }), 'Online')
        : document.createTextNode(`Last seen ${formatLastSeen(peer.lastSeen)}`),
    );
  } else {
    $('#topbarStatus').textContent = `${chat.members.length} members`;
  }

  renderChatList();

  if (state.unsubMessages) state.unsubMessages();
  if (state.unsubTyping) state.unsubTyping();
  state.unsubMessages = data.onMessages(chatId, (msgs) => renderMessages(chatId, msgs));
  state.unsubTyping = data.onTyping(chatId, (typingIds) => renderTypingIndicator(chat, typingIds));

  $('#contextPanel').classList.remove('is-open');
  refreshIcons();
}

function renderMessages(chatId, msgs){
  if (chatId !== state.activeChatId) return;
  const list = $('#messageList');
  const wasAtBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 60;
  list.innerHTML = '';

  let lastDay = null, lastSender = null;
  msgs.forEach((msg) => {
    const day = formatDayLabel(msg.createdAt);
    if (day !== lastDay) { list.append(el('div', { class:'day-divider' }, day)); lastDay = day; lastSender = null; }
    const isOut = msg.senderId === 'me';
    const sameSenderAsPrev = lastSender === msg.senderId;

    if (!sameSenderAsPrev) {
      list.append(el('div', { class:`msg-group is-${isOut ? 'out' : 'in'}` }));
    }
    const group = list.lastElementChild;

    if (!isOut && !sameSenderAsPrev) {
      const chat = data.getChat(chatId);
      if (chat.type === 'group') {
        const sender = data.getUser(msg.senderId);
        group.append(el('div', { class:'msg-group__sender' }, sender?.displayName || 'Member'));
      }
    }

    group.append(renderBubble(msg, isOut, chatId));
    lastSender = msg.senderId;
  });

  refreshIcons();
  if (wasAtBottom || msgs[msgs.length - 1]?.senderId === 'me') {
    list.scrollTop = list.scrollHeight;
  }
}

function renderBubble(msg, isOut, chatId){
  const wrap = el('div', { class:'msg-wrap' });
  const bubble = el('div', { class:'bubble' });

  if (msg.deleted) {
    bubble.style.opacity = '.6';
    bubble.style.fontStyle = 'italic';
    bubble.append('This message was deleted');
    wrap.append(bubble);
    return wrap;
  }

  if (msg.replyTo) {
    bubble.append(el('div', { class:'bubble--reply' },
      el('strong', {}, msg.replyTo.senderName), ' — ', msg.replyTo.text?.slice(0, 60) || 'Media',
    ));
  }

  if (msg.type === 'image' && msg.media) {
    bubble.append(el('div', { class:'bubble__media' }, el('img', { src: msg.media, loading:'lazy', alt:'Shared image' })));
  } else if (msg.type === 'video' && msg.media) {
    bubble.append(el('div', { class:'bubble__media' }, el('video', { src: msg.media, controls:true, preload:'metadata' })));
  } else if (msg.type === 'document') {
    bubble.append(el('div', { class:'bubble__doc' },
      el('div', { class:'bubble__doc-icon' }, el('i', { 'data-lucide':'file-text' })),
      el('div', { class:'bubble__doc-meta' },
        el('div', { class:'bubble__doc-name' }, msg.fileName || 'Document'),
        el('div', { class:'bubble__doc-size' }, formatBytes(msg.fileSize || 0)),
      ),
    ));
  } else if (msg.type === 'voice') {
    bubble.append(el('div', { class:'bubble__voice' },
      el('div', { class:'bubble__voice-play' }, el('i', { 'data-lucide':'play' })),
      el('div', { class:'bubble__voice-wave' }, ...Array.from({ length:24 }, () => el('span', { style:`height:${6 + Math.random() * 16}px` }))),
      el('div', { class:'bubble__voice-time' }, `0:${String(msg.duration || 6).padStart(2, '0')}`),
    ));
  }

  if (msg.text) bubble.append(el('div', {}, escapeHTML(msg.text)));

  const meta = el('div', { class:'bubble__meta' },
    el('span', { class:'bubble__time' }, formatTime(msg.createdAt)),
    msg.edited ? el('span', { class:'bubble__edited' }, 'edited') : null,
  );
  if (isOut) {
    meta.append(el('span', { class:`bubble__ticks${msg.status === 'read' ? ' is-read' : ''}` },
      el('i', { 'data-lucide': msg.status === 'sent' ? 'check' : 'check-check' }),
    ));
  }
  bubble.append(meta);

  if (msg.reactions && Object.keys(msg.reactions).length) {
    bubble.append(el('div', { class:'bubble__reactions' },
      ...Object.entries(msg.reactions).map(([emoji, users]) => el('span', { class:'reaction-chip' }, emoji, users.length > 1 ? users.length : '')),
    ));
  }

  const actions = el('div', { class:'msg-actions' },
    iconAction('smile-plus', () => openReactionPicker(wrap, chatId, msg.id)),
    iconAction('reply', () => setReplyTarget(msg)),
    iconAction('forward', () => openForwardModal(msg)),
    isOut && !msg.deleted && msg.type === 'text' ? iconAction('pencil', () => editMessagePrompt(chatId, msg)) : null,
    isOut && !msg.deleted ? iconAction('trash-2', () => { data.deleteMessage(chatId, msg.id); showToast('Message deleted', 'success'); }) : null,
  );

  wrap.append(actions, bubble);
  return wrap;
}

function iconAction(icon, onClick){
  return el('button', { class:'icon-btn', onclick: onClick }, el('i', { 'data-lucide':icon }));
}

function renderTypingIndicator(chat, typingIds){
  const row = $('#typingIndicatorRow');
  const relevant = typingIds.filter((id) => id !== 'me');
  row.style.display = relevant.length ? 'block' : 'none';
}

/* ------------------------------------------------------------------ */
/* Composer                                                             */
/* ------------------------------------------------------------------ */

function wireComposer(){
  const textarea = $('#messageInput');
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    if (state.activeChatId) data.setTyping(state.activeChatId, 'me', textarea.value.length > 0);
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCurrentMessage(); }
  });
  $('#sendBtn').addEventListener('click', sendCurrentMessage);
  $('#cancelReplyBtn').addEventListener('click', () => { state.replyTarget = null; $('#replyPreview').classList.remove('is-visible'); });

  $('#attachBtn').addEventListener('click', (e) => openAttachMenu(e.currentTarget));
  $('#fileInput').addEventListener('change', handleFileSelection);

  $('#voiceNoteBtn').addEventListener('click', toggleVoiceRecording);

  $('#searchInChatBtn').addEventListener('click', () => $('#searchInChatBar').classList.add('is-visible'));
  $('#closeInChatSearchBtn').addEventListener('click', () => { $('#searchInChatBar').classList.remove('is-visible'); $('#inChatSearchInput').value = ''; highlightSearchInChat(''); });
  $('#inChatSearchInput').addEventListener('input', debounce((e) => highlightSearchInChat(e.target.value), 150));
}

function sendCurrentMessage(){
  const textarea = $('#messageInput');
  const text = textarea.value.trim();
  if (!text || !state.activeChatId) return;
  const payload = { type:'text', text };
  if (state.replyTarget) {
    payload.replyTo = { senderName: data.getUser(state.replyTarget.senderId)?.displayName || 'You', text: state.replyTarget.text };
  }
  data.sendMessage(state.activeChatId, payload);
  textarea.value = '';
  textarea.style.height = 'auto';
  data.setTyping(state.activeChatId, 'me', false);
  state.replyTarget = null;
  $('#replyPreview').classList.remove('is-visible');
}

function setReplyTarget(msg){
  state.replyTarget = msg;
  $('#replyPreviewName').textContent = msg.senderId === 'me' ? 'yourself' : (data.getUser(msg.senderId)?.displayName || 'them');
  $('#replyPreviewText').textContent = msg.text || 'Media message';
  $('#replyPreview').classList.add('is-visible');
  $('#messageInput').focus();
}

function editMessagePrompt(chatId, msg){
  openModal('Edit message', (body, footer) => {
    const textarea = el('textarea', { class:'field__input', rows:'3', style:'width:100%;resize:vertical;' }, msg.text);
    body.append(el('div', { class:'field' }, el('label', { class:'field__label' }, 'Message'), textarea));
    footer.append(
      el('button', { class:'btn btn--secondary modal-close' }, 'Cancel'),
      el('button', { class:'btn btn--primary', onclick: () => { data.editMessage(chatId, msg.id, textarea.value.trim()); closeModal(); showToast('Message edited', 'success'); } }, 'Save'),
    );
  });
}

function openReactionPicker(anchor, chatId, msgId){
  const emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
  const rect = anchor.getBoundingClientRect();
  const picker = el('div', { class:'reaction-picker', style:`top:${rect.top - 44}px;left:${rect.left}px;` },
    ...emojis.map((em) => el('button', { onclick: () => { data.toggleReaction(chatId, msgId, em); picker.remove(); document.querySelector('.click-catcher')?.remove(); } }, em)),
  );
  document.body.append(picker);
  closeOnClickAway(picker, () => {});
}

function highlightSearchInChat(term){
  const bubbles = $$('#messageList .bubble');
  bubbles.forEach((b) => { b.style.boxShadow = ''; });
  if (!term) return;
  bubbles.forEach((b) => {
    if (b.textContent.toLowerCase().includes(term.toLowerCase())) b.style.boxShadow = '0 0 0 2px var(--signal-start)';
  });
}

/* ---- Attachments ---- */

function openAttachMenu(anchor){
  const rect = anchor.getBoundingClientRect();
  const menu = el('div', { class:'dropdown', style:`bottom:${window.innerHeight - rect.top + 8}px;left:${rect.left}px;` },
    menuItem('image', 'Photo', () => triggerFilePicker('image/*')),
    menuItem('video', 'Video', () => triggerFilePicker('video/*')),
    menuItem('file-text', 'Document', () => triggerFilePicker('.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt')),
  );
  document.body.append(menu);
  refreshIcons();
  closeOnClickAway(menu, () => {});
}

function triggerFilePicker(accept){
  const input = $('#fileInput');
  input.accept = accept;
  input.value = '';
  input.click();
}

async function handleFileSelection(e){
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    const dataUrl = await data.uploadFile(file, state.activeChatId);
    const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'document';
    data.sendMessage(state.activeChatId, {
      type, media: type !== 'document' ? dataUrl : null,
      fileName: file.name, fileSize: file.size,
      text: type === 'document' ? '' : '',
    });
  }
  if (files.length) showToast(`Sent ${files.length} file${files.length > 1 ? 's' : ''}`, 'success');
}

/* ---- Voice notes ---- */

async function toggleVoiceRecording(){
  const btn = $('#voiceNoteBtn');
  if (!state.isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      const recorder = new MediaRecorder(stream);
      state.recordedChunks = [];
      recorder.ondataavailable = (ev) => state.recordedChunks.push(ev.data);
      recorder.start();
      state.mediaRecorder = recorder;
      state.recordingStart = Date.now();
      state.isRecording = true;
      btn.classList.add('is-recording');
      btn.querySelector('i').setAttribute('data-lucide', 'square');
      refreshIcons();
    } catch {
      showToast('Microphone access denied — sending a sample voice note instead.', 'info');
      finishVoiceNote(6);
    }
  } else {
    const durationSec = Math.max(1, Math.round((Date.now() - state.recordingStart) / 1000));
    state.mediaRecorder?.stop();
    state.mediaRecorder?.stream.getTracks().forEach((t) => t.stop());
    state.isRecording = false;
    btn.classList.remove('is-recording');
    btn.querySelector('i').setAttribute('data-lucide', 'mic');
    refreshIcons();
    finishVoiceNote(durationSec);
  }
}

function finishVoiceNote(duration){
  if (!state.activeChatId) return;
  data.sendMessage(state.activeChatId, { type:'voice', duration, text:'' });
  showToast('Voice note sent', 'success');
}

/* ------------------------------------------------------------------ */
/* Topbar actions: calls, chat info, chat menu                         */
/* ------------------------------------------------------------------ */

function wireTopbarActions(){
  $('#voiceCallBtn').addEventListener('click', () => startCall('voice'));
  $('#videoCallBtn').addEventListener('click', () => startCall('video'));
  $('#chatInfoBtn').addEventListener('click', openChatInfoPanel);
  $('#closeContextPanelBtn').addEventListener('click', () => $('#contextPanel').classList.remove('is-open'));
  $('#chatMenuBtn').addEventListener('click', (e) => openChatHeaderMenu(e.currentTarget));
}

function openChatHeaderMenu(anchor){
  const rect = anchor.getBoundingClientRect();
  const chat = data.getChat(state.activeChatId);
  const menu = el('div', { class:'dropdown', style:`top:${rect.bottom + 6}px;right:16px;left:auto;` },
    menuItem(chat.pinned ? 'pin-off' : 'pin', chat.pinned ? 'Unpin chat' : 'Pin chat', () => data.patchChat(chat.id, { pinned:!chat.pinned })),
    menuItem(chat.muted ? 'bell' : 'bell-off', chat.muted ? 'Unmute' : 'Mute notifications', () => data.patchChat(chat.id, { muted:!chat.muted })),
    menuItem('archive', chat.archived ? 'Unarchive' : 'Archive chat', () => data.patchChat(chat.id, { archived:!chat.archived })),
    el('div', { class:'dropdown__divider' }),
    menuItem('info', 'View info', openChatInfoPanel),
  );
  document.body.append(menu);
  refreshIcons();
  closeOnClickAway(menu, () => {});
}

/* ------------------------------------------------------------------ */
/* Chat / Group info panel                                             */
/* ------------------------------------------------------------------ */

function openChatInfoPanel(){
  const chat = data.getChat(state.activeChatId);
  const panel = $('#contextPanel');
  const body = $('#contextPanelBody');
  body.innerHTML = '';
  $('#contextPanelTitle').textContent = chat.type === 'group' ? 'Group info' : 'Contact info';

  if (chat.type === 'direct') {
    const peer = data.chatPeer(chat);
    body.append(
      el('div', { style:'display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:24px;' },
        el('div', { class:'avatar avatar--xl' }, peer.photoURL ? el('img', { src:peer.photoURL }) : initials(peer.displayName)),
        el('h3', {}, peer.displayName),
        el('p', { style:'color:var(--text-tertiary);font-size:13px;' }, peer.status || ''),
      ),
      infoRow('bell-off', 'Mute notifications', switchToggle(chat.muted, (v) => data.patchChat(chat.id, { muted:v }))),
      infoRow('pin', 'Pin chat', switchToggle(chat.pinned, (v) => data.patchChat(chat.id, { pinned:v }))),
      infoRow('archive', 'Archive chat', switchToggle(chat.archived, (v) => data.patchChat(chat.id, { archived:v }))),
    );
  } else {
    body.append(
      el('div', { style:'display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:20px;' },
        el('div', { class:'avatar avatar--xl' }, chat.photoURL ? el('img', { src:chat.photoURL }) : initials(chat.name)),
        el('button', { class:'btn btn--secondary btn--sm', onclick: () => renameGroupPrompt(chat) }, el('i', { 'data-lucide':'pencil' }), 'Edit name'),
        el('h3', {}, chat.name),
        el('p', { style:'color:var(--text-tertiary);font-size:13px;text-align:center;' }, chat.description || 'No description yet.'),
        el('button', { class:'btn btn--ghost btn--sm', onclick: () => editDescriptionPrompt(chat) }, 'Edit description'),
      ),
      el('div', { class:'section-label' }, 'Invite link'),
      el('div', { class:'invite-box', style:'margin-bottom:16px;' },
        el('code', {}, `hubchat.app/invite/${chat.inviteCode}`),
        el('button', { class:'icon-btn', title:'Copy', onclick: () => { navigator.clipboard?.writeText(`hubchat.app/invite/${chat.inviteCode}`); showToast('Invite link copied', 'success'); } }, el('i', { 'data-lucide':'copy' })),
        el('button', { class:'icon-btn', title:'Regenerate', onclick: () => { data.regenerateInvite(chat.id); showToast('Invite link regenerated', 'success'); openChatInfoPanel(); } }, el('i', { 'data-lucide':'refresh-cw' })),
      ),
      infoRow('lock', chat.closed ? 'Group closed (admins only can message)' : 'Group open', switchToggle(chat.closed, (v) => data.patchChat(chat.id, { closed:v }))),
      infoRow('bell-off', 'Mute notifications', switchToggle(chat.muted, (v) => data.patchChat(chat.id, { muted:v }))),
      infoRow('pin', 'Pin chat', switchToggle(chat.pinned, (v) => data.patchChat(chat.id, { pinned:v }))),
      el('div', { class:'section-label', style:'display:flex;align-items:center;justify-content:space-between;' },
        `Members — ${chat.members.length}`,
        el('button', { class:'icon-btn', title:'Add members', onclick: () => openAddMembersModal(chat) }, el('i', { 'data-lucide':'user-plus' })),
      ),
      el('div', { id:'memberList' }, ...chat.members.map((mid) => renderMemberRow(chat, mid))),
      el('div', { style:'margin-top:24px;display:flex;flex-direction:column;gap:8px;' },
        el('button', { class:'btn btn--danger btn--block', onclick: () => leaveGroup(chat) }, el('i', { 'data-lucide':'log-out' }), 'Leave group'),
      ),
    );
  }
  panel.classList.add('is-open');
  refreshIcons();
}

function infoRow(icon, label, control){
  return el('div', { style:'display:flex;align-items:center;justify-content:space-between;padding:10px 2px;' },
    el('div', { style:'display:flex;align-items:center;gap:10px;font-size:13.5px;' }, el('i', { 'data-lucide':icon, style:'width:17px;height:17px;color:var(--text-secondary);' }), label),
    control,
  );
}

function switchToggle(checked, onChange){
  const input = el('input', { type:'checkbox', checked: checked || undefined, onchange: (e) => onChange(e.target.checked) });
  return el('label', { class:'switch' }, input, el('span', { class:'switch__track' }));
}

function renderMemberRow(chat, memberId){
  const user = data.getUser(memberId);
  if (!user) return el('div');
  const isAdmin = chat.admins?.includes(memberId);
  const isOwner = chat.owner === memberId;
  const iAmAdmin = chat.admins?.includes('me');
  const row = el('div', { class:'member-row' },
    el('div', { class:'avatar avatar--sm' }, user.photoURL ? el('img', { src:user.photoURL }) : initials(user.displayName)),
    el('div', { class:'member-row__info' },
      el('div', { class:'member-row__name' }, memberId === 'me' ? 'You' : user.displayName, isAdmin ? el('span', { class:'chip chip--admin' }, isOwner ? 'Owner' : 'Admin') : null),
      el('div', { class:'member-row__role' }, user.online ? 'Online' : `Last seen ${formatLastSeen(user.lastSeen)}`),
    ),
  );
  if (iAmAdmin && memberId !== 'me' && !isOwner) {
    row.append(el('button', { class:'icon-btn', title:'Options', onclick: (e) => openMemberMenu(e.currentTarget, chat, memberId, isAdmin) }, el('i', { 'data-lucide':'more-vertical' })));
  }
  return row;
}

function openMemberMenu(anchor, chat, memberId, isAdmin){
  const rect = anchor.getBoundingClientRect();
  const menu = el('div', { class:'dropdown', style:`top:${rect.bottom + 4}px;right:${window.innerWidth - rect.right}px;left:auto;` },
    isAdmin
      ? menuItem('shield-off', 'Remove as admin', () => { data.demoteAdmin(chat.id, memberId); openChatInfoPanel(); })
      : menuItem('shield-check', 'Make admin', () => { data.promoteAdmin(chat.id, memberId); openChatInfoPanel(); }),
    menuItem('user-minus', 'Remove from group', () => { data.removeMember(chat.id, memberId); openChatInfoPanel(); showToast('Member removed', 'success'); }, true),
  );
  document.body.append(menu);
  refreshIcons();
  closeOnClickAway(menu, () => {});
}

function renameGroupPrompt(chat){
  openModal('Rename group', (body, footer) => {
    const input = el('input', { class:'field__input', value: chat.name, style:'width:100%;' });
    body.append(el('div', { class:'field' }, el('label', { class:'field__label' }, 'Group name'), input));
    footer.append(
      el('button', { class:'btn btn--secondary modal-close' }, 'Cancel'),
      el('button', { class:'btn btn--primary', onclick: () => { data.patchChat(chat.id, { name: input.value.trim() || chat.name }); closeModal(); openChatInfoPanel(); showToast('Group name updated', 'success'); } }, 'Save'),
    );
  });
}

function editDescriptionPrompt(chat){
  openModal('Edit description', (body, footer) => {
    const textarea = el('textarea', { class:'field__input', rows:'3', style:'width:100%;resize:vertical;' }, chat.description || '');
    body.append(el('div', { class:'field' }, el('label', { class:'field__label' }, 'Description'), textarea));
    footer.append(
      el('button', { class:'btn btn--secondary modal-close' }, 'Cancel'),
      el('button', { class:'btn btn--primary', onclick: () => { data.patchChat(chat.id, { description: textarea.value.trim() }); closeModal(); openChatInfoPanel(); showToast('Description updated', 'success'); } }, 'Save'),
    );
  });
}

function leaveGroup(chat){
  data.removeMember(chat.id, 'me');
  showToast('You left the group', 'info');
  $('#contextPanel').classList.remove('is-open');
  $('#chatView').classList.add('hidden');
  $('#emptyState').classList.remove('hidden');
  state.activeChatId = null;
  setMobileView('list');
}

function openAddMembersModal(chat){
  const available = data.allContacts().filter((c) => !chat.members.includes(c.id));
  openModal('Add members', (body, footer) => {
    const selected = new Set();
    body.append(...available.map((u) => contactCheckRow(u, selected)));
    if (!available.length) body.append(el('p', { style:'color:var(--text-tertiary);font-size:13px;' }, 'Everyone in your contacts is already a member.'));
    footer.append(
      el('button', { class:'btn btn--secondary modal-close' }, 'Cancel'),
      el('button', { class:'btn btn--primary', onclick: () => { data.addMembers(chat.id, [...selected]); closeModal(); openChatInfoPanel(); showToast('Members added', 'success'); } }, 'Add'),
    );
  });
}

function contactCheckRow(user, selectedSet){
  const checkbox = el('input', { type:'checkbox', onchange: (e) => { e.target.checked ? selectedSet.add(user.id) : selectedSet.delete(user.id); } });
  return el('label', { class:'member-row', style:'cursor:pointer;' },
    el('div', { class:'avatar avatar--sm' }, user.photoURL ? el('img', { src:user.photoURL }) : initials(user.displayName)),
    el('div', { class:'member-row__info' }, el('div', { class:'member-row__name' }, user.displayName), el('div', { class:'member-row__role' }, user.status || '')),
    checkbox,
  );
}

/* ------------------------------------------------------------------ */
/* New chat / New group modals                                         */
/* ------------------------------------------------------------------ */

function openNewChatModal(){
  openModal('New chat', (body, footer) => {
    body.append(
      el('button', { class:'btn btn--secondary btn--block', style:'margin-bottom:16px;justify-content:flex-start;', onclick: () => { closeModal(); openNewGroupModal(); } },
        el('i', { 'data-lucide':'users' }), 'New group'),
      el('div', { class:'section-label' }, 'Contacts'),
      ...data.allContacts().map((u) => el('div', { class:'member-row', style:'cursor:pointer;', onclick: () => { closeModal(); const chat = data.startDirectChat(u.id); openChat(chat.id); } },
        el('div', { class:'avatar avatar--sm' }, u.photoURL ? el('img', { src:u.photoURL }) : initials(u.displayName)),
        el('div', { class:'member-row__info' }, el('div', { class:'member-row__name' }, u.displayName), el('div', { class:'member-row__role' }, u.online ? 'Online' : `Last seen ${formatLastSeen(u.lastSeen)}`)),
      )),
    );
  }, false);
}

function openNewGroupModal(){
  const selected = new Set();
  let groupPhoto = 'https://files.catbox.moe/x9w5kn.png';
  openModal('New group', (body, footer) => {
    const nameInput = el('input', { class:'field__input', placeholder:'Group name', style:'width:100%;' });
    body.append(
      el('div', { class:'field', style:'margin-bottom:16px;' }, el('label', { class:'field__label' }, 'Group name'), nameInput),
      el('div', { class:'section-label' }, 'Add members'),
      ...data.allContacts().map((u) => contactCheckRow(u, selected)),
    );
    footer.append(
      el('button', { class:'btn btn--secondary modal-close' }, 'Cancel'),
      el('button', { class:'btn btn--primary', onclick: () => {
        if (!nameInput.value.trim()) { showToast('Please enter a group name', 'error'); return; }
        const chat = data.createGroup({ name: nameInput.value.trim(), memberIds:[...selected], photoURL: groupPhoto });
        closeModal(); openChat(chat.id); showToast('Group created', 'success');
      } }, 'Create group'),
    );
  }, true);
}

/* ------------------------------------------------------------------ */
/* Forward message modal                                               */
/* ------------------------------------------------------------------ */

function openForwardModal(msg){
  openModal('Forward message', (body, footer) => {
    body.append(...data.getChats().map((c) => el('div', { class:'member-row', style:'cursor:pointer;', onclick: () => {
      data.sendMessage(c.id, { type: msg.type, text: msg.text, media: msg.media, fileName: msg.fileName, fileSize: msg.fileSize, duration: msg.duration });
      closeModal(); showToast(`Forwarded to ${chatTitle(c)}`, 'success');
    } },
      el('div', { class:'avatar avatar--sm' }, chatPhoto(c) ? el('img', { src:chatPhoto(c) }) : initials(chatTitle(c))),
      el('div', { class:'member-row__info' }, el('div', { class:'member-row__name' }, chatTitle(c))),
    )));
  }, false);
}

/* ------------------------------------------------------------------ */
/* Profile modal                                                       */
/* ------------------------------------------------------------------ */

function openProfileModal(){
  const me = data.currentUser();
  openModal('Your profile', (body, footer) => {
    const photoInput = el('input', { type:'file', accept:'image/*', class:'hidden' });
    const preview = el('div', { class:'avatar avatar--xl' }, me.photoURL ? el('img', { src:me.photoURL, id:'profilePreviewImg' }) : initials(me.displayName));
    photoInput.addEventListener('change', async () => {
      const file = photoInput.files[0];
      if (!file) return;
      const dataUrl = await data.uploadFile(file, 'avatars');
      preview.innerHTML = '';
      preview.append(el('img', { src:dataUrl, id:'profilePreviewImg' }));
      preview.dataset.newPhoto = dataUrl;
    });

    const nameInput = el('input', { class:'field__input', value: me.displayName, style:'width:100%;' });
    const statusInput = el('input', { class:'field__input', value: me.status || '', style:'width:100%;' });

    body.append(
      el('div', { class:'avatar-upload' },
        el('div', { class:'avatar-upload__preview' }, preview, el('button', { class:'avatar-upload__edit', onclick: () => photoInput.click() }, el('i', { 'data-lucide':'camera' }))),
        photoInput,
      ),
      el('div', { class:'field', style:'margin-bottom:14px;' }, el('label', { class:'field__label' }, 'Display name'), nameInput),
      el('div', { class:'field', style:'margin-bottom:14px;' }, el('label', { class:'field__label' }, 'Status'), statusInput),
      el('div', { class:'divider' }),
      el('button', { class:'btn btn--danger btn--block', onclick: confirmDeleteAccount }, el('i', { 'data-lucide':'trash-2' }), 'Delete account'),
    );
    footer.append(
      el('button', { class:'btn btn--secondary modal-close' }, 'Cancel'),
      el('button', { class:'btn btn--primary', onclick: () => {
        data.updateProfile({ displayName: nameInput.value.trim(), status: statusInput.value.trim(), photoURL: preview.dataset.newPhoto });
        $('#myAvatarImg').src = data.currentUser().photoURL;
        closeModal(); showToast('Profile updated', 'success');
      } }, 'Save changes'),
    );
    refreshIcons();
  });
}

function confirmDeleteAccount(){
  closeModal();
  openModal('Delete account?', (body, footer) => {
    body.append(el('p', { style:'font-size:13.5px;color:var(--text-secondary);line-height:1.6;' },
      'This permanently deletes your HUB Chat account, profile and chat history on this device. This cannot be undone.'));
    footer.append(
      el('button', { class:'btn btn--secondary modal-close' }, 'Cancel'),
      el('button', { class:'btn btn--danger', onclick: () => { data.deleteAccount(); closeModal(); location.reload(); } }, 'Delete permanently'),
    );
  });
}

/* ------------------------------------------------------------------ */
/* Sidebar overflow menu (settings, archived shortcut)                 */
/* ------------------------------------------------------------------ */

function openSidebarMenu(anchor){
  const rect = anchor.getBoundingClientRect();
  const menu = el('div', { class:'dropdown', style:`top:${rect.bottom + 6}px;right:16px;left:auto;` },
    menuItem('archive', 'Archived chats', () => { $('.pill-tab[data-tab="archived"]').click(); }),
    menuItem('log-out', 'Log out', async () => { await data.signOutUser(); location.reload(); }, true),
  );
  document.body.append(menu);
  refreshIcons();
  closeOnClickAway(menu, () => {});
}

/* ------------------------------------------------------------------ */
/* Generic modal helper                                                */
/* ------------------------------------------------------------------ */

function openModal(title, render, wide = false){
  closeModal();
  const overlay = el('div', { class:'modal-overlay', id:'activeModalOverlay', onclick: (e) => { if (e.target === overlay) closeModal(); } });
  const modal = el('div', { class:`modal${wide ? ' modal--wide' : ''}` });
  const header = el('div', { class:'modal__header' }, el('h2', {}, title), el('button', { class:'icon-btn', onclick: closeModal }, el('i', { 'data-lucide':'x' })));
  const body = el('div', { class:'modal__body' });
  const footer = el('div', { class:'modal__footer' });
  render(body, footer);
  modal.append(header, body, footer);
  overlay.append(modal);
  document.body.append(overlay);
  refreshIcons();
}
function closeModal(){ $('#activeModalOverlay')?.remove(); }
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/* ------------------------------------------------------------------ */
/* Stories                                                              */
/* ------------------------------------------------------------------ */

function renderStoriesBar(){
  const bar = $('#storiesBar');
  if (!bar) return;
  const me = data.currentUser();
  if (!me) return;
  const stories = data.getStories();
  const byAuthor = groupByAuthor(stories);

  bar.innerHTML = '';
  bar.append(storyAddTile());
  Object.entries(byAuthor).forEach(([authorId, list]) => {
    if (authorId === 'me') return;
    bar.append(storyTile(authorId, list));
  });
  refreshIcons();
}

function groupByAuthor(stories){
  return stories.reduce((acc, s) => { (acc[s.authorId] = acc[s.authorId] || []).push(s); return acc; }, {});
}

function storyAddTile(){
  const me = data.currentUser();
  const input = el('input', { type:'file', accept:'image/*,video/*', class:'hidden' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const dataUrl = await data.uploadFile(file, 'stories');
    data.postStory({ media:dataUrl, mediaType: file.type.startsWith('video/') ? 'video' : 'image' });
    showToast('Story posted — visible for 24 hours', 'success');
  });
  const myStories = data.getStories().filter((s) => s.authorId === 'me');
  return el('div', { class:'story-tile', onclick: () => myStories.length ? openStoryViewer('me') : input.click() },
    el('div', { class:`story-tile__ring${myStories.length ? '' : ' is-add'}` },
      el('div', { class:'story-tile__avatar' },
        me.photoURL ? el('img', { src:me.photoURL }) : initials(me.displayName),
        !myStories.length ? el('span', { class:'story-tile__add-icon' }, el('i', { 'data-lucide':'plus' })) : null,
      ),
    ),
    input,
    el('div', { class:'story-tile__label' }, 'Your story'),
  );
}

function storyTile(authorId, stories){
  const user = data.getUser(authorId);
  const allSeen = stories.every((s) => s.views.includes('me'));
  return el('div', { class:'story-tile', onclick: () => openStoryViewer(authorId) },
    el('div', { class:`story-tile__ring${allSeen ? ' is-seen' : ''}` },
      el('div', { class:'story-tile__avatar' }, user?.photoURL ? el('img', { src:user.photoURL }) : initials(user?.displayName)),
    ),
    el('div', { class:'story-tile__label' }, user?.displayName?.split(' ')[0] || 'User'),
  );
}

function renderStoriesFullList(){
  const list = $('#storiesFullList');
  if (!list) return;
  const stories = data.getStories();
  const byAuthor = groupByAuthor(stories);
  list.innerHTML = '';
  Object.entries(byAuthor).forEach(([authorId, s]) => {
    const user = authorId === 'me' ? data.currentUser() : data.getUser(authorId);
    list.append(el('div', { class:'chat-item', onclick: () => openStoryViewer(authorId) },
      el('div', { class:'avatar avatar--md' }, user?.photoURL ? el('img', { src:user.photoURL }) : initials(user?.displayName)),
      el('div', { class:'chat-item__body' },
        el('div', { class:'chat-item__name' }, authorId === 'me' ? 'Your story' : user?.displayName),
        el('div', { class:'chat-item__preview' }, el('p', {}, `${s.length} update${s.length > 1 ? 's' : ''} · ${formatRelativeShort(s[0].createdAtMs)}`)),
      ),
    ));
  });
  refreshIcons();
}

let storyState = { authorId:null, index:0, timer:null };

function openStoryViewer(authorId){
  const stories = data.getStories().filter((s) => s.authorId === authorId);
  if (!stories.length) return;
  storyState = { authorId, index:0, timer:null };
  const viewer = el('div', { class:'story-viewer', id:'storyViewer' });
  document.body.append(viewer);
  renderStoryFrame(stories, viewer);
}

function renderStoryFrame(stories, viewer){
  clearTimeout(storyState.timer);
  const s = stories[storyState.index];
  const user = s.authorId === 'me' ? data.currentUser() : data.getUser(s.authorId);
  data.viewStory(s.id);

  viewer.innerHTML = '';
  const stage = el('div', { class:'story-viewer__stage' },
    el('div', { class:'story-viewer__progress' }, ...stories.map((_, i) => el('div', { class:'story-viewer__progress-track' },
      el('div', { class:`story-viewer__progress-fill ${i < storyState.index ? 'is-complete' : i === storyState.index ? 'is-active' : ''}` })))),
    el('div', { class:'story-viewer__header' },
      el('div', { class:'story-viewer__user' },
        el('div', { class:'avatar avatar--sm' }, user?.photoURL ? el('img', { src:user.photoURL }) : initials(user?.displayName)),
        el('span', {}, s.authorId === 'me' ? 'Your story' : user?.displayName),
        el('span', { class:'story-viewer__time' }, formatRelativeShort(s.createdAtMs)),
      ),
      el('button', { class:'icon-btn story-viewer__close', onclick: () => viewer.remove() }, el('i', { 'data-lucide':'x' })),
    ),
    s.mediaType === 'video'
      ? el('video', { class:'story-viewer__media', src:s.media, autoplay:true, muted:true })
      : el('img', { class:'story-viewer__media', src:s.media, alt:'Story' }),
    el('div', { class:'story-viewer__tap-l', onclick: () => stepStory(stories, viewer, -1) }),
    el('div', { class:'story-viewer__tap-r', onclick: () => stepStory(stories, viewer, 1) }),
    el('div', { class:'story-viewer__footer' },
      s.authorId === 'me' ? el('div', { class:'story-viewer__views' }, el('i', { 'data-lucide':'eye' }), `${s.views.length} view${s.views.length !== 1 ? 's' : ''}`) : null,
    ),
  );
  viewer.append(stage);
  refreshIcons();
  storyState.timer = setTimeout(() => stepStory(stories, viewer, 1), 5000);
}

function stepStory(stories, viewer, dir){
  storyState.index += dir;
  if (storyState.index < 0) { viewer.remove(); return; }
  if (storyState.index >= stories.length) { viewer.remove(); renderStoriesBar(); return; }
  renderStoryFrame(stories, viewer);
}

/* ------------------------------------------------------------------ */
/* Calls (UI only)                                                      */
/* ------------------------------------------------------------------ */

function renderCallsList(){
  const list = $('#callsList');
  if (!list) return;
  const chats = data.getChats().filter((c) => c.type === 'direct');
  list.innerHTML = '';
  if (!chats.length) { list.append(el('div', { class:'empty-state' }, el('i', { 'data-lucide':'phone-missed' }), el('p', {}, 'No recent calls.'))); refreshIcons(); return; }
  chats.forEach((c) => {
    const peer = data.chatPeer(c);
    const isVideo = Math.random() > 0.5;
    list.append(el('div', { class:'chat-item', onclick: () => startCall(isVideo ? 'video' : 'voice', peer) },
      el('div', { class:'avatar avatar--md' }, peer.photoURL ? el('img', { src:peer.photoURL }) : initials(peer.displayName)),
      el('div', { class:'chat-item__body' },
        el('div', { class:'chat-item__name' }, peer.displayName),
        el('div', { class:'chat-item__preview' },
          el('i', { 'data-lucide': isVideo ? 'video' : 'phone', style:'width:13px;height:13px;color:var(--text-tertiary);' }),
          el('p', {}, `${isVideo ? 'Video' : 'Voice'} call · ${formatRelativeShort(c.updatedAt)}`),
        ),
      ),
    ));
  });
  refreshIcons();
}

function startCall(kind, peerOverride){
  const chat = state.activeChatId ? data.getChat(state.activeChatId) : null;
  const peer = peerOverride || (chat?.type === 'direct' ? data.chatPeer(chat) : null) || data.allContacts()[0];
  if (!peer) return showToast('Select a direct chat to start a call', 'info');

  const screen = el('div', { class:`call-screen${kind === 'video' ? ' call-screen--video' : ''}`, id:'callScreen' });

  if (kind === 'video') {
    screen.append(
      el('div', { class:'call-video__remote' }, el('img', { src:peer.photoURL, alt:peer.displayName })),
      el('div', { class:'call-video__topbar' },
        el('div', {}, el('div', { style:'font-weight:700;' }, peer.displayName), el('div', { class:'call-screen__timer', id:'callTimer' }, 'Connecting…')),
        el('button', { class:'icon-btn', style:'color:#fff;', onclick: () => endCall(screen) }, el('i', { 'data-lucide':'minimize-2' })),
      ),
      el('div', { class:'call-video__self' }, el('img', { src: data.currentUser().photoURL, alt:'You' })),
      el('div', { class:'call-video__controls' },
        callButton('mic', () => {}),
        callButton('video', () => {}, true),
        callButton('phone-off', () => endCall(screen), false, true),
        callButton('volume-2', () => {}),
        callButton('switch-camera', () => {}),
      ),
    );
  } else {
    screen.append(
      el('div', { class:'call-screen__status' },
        el('div', { class:'call-screen__label' }, 'VOICE CALL'),
        el('div', { class:'call-screen__name' }, peer.displayName),
        el('div', { class:'call-screen__timer', id:'callTimer' }, 'Connecting…'),
      ),
      el('div', { class:'call-screen__avatar-wrap' },
        el('div', { class:'call-screen__ring', style:'width:140px;height:140px;' }),
        el('div', { class:'call-screen__ring', style:'width:140px;height:140px;' }),
        el('div', { class:'call-screen__ring', style:'width:140px;height:140px;' }),
        el('div', { class:'avatar avatar--xl', style:'width:140px;height:140px;font-size:40px;' }, peer.photoURL ? el('img', { src:peer.photoURL }) : initials(peer.displayName)),
      ),
      el('div', { class:'call-screen__controls' },
        callButton('mic', () => {}),
        callButton('volume-2', () => {}),
        callButton('phone-off', () => endCall(screen), false, true),
      ),
    );
  }

  document.body.append(screen);
  refreshIcons();

  let seconds = 0;
  setTimeout(() => {
    const timerEl = $('#callTimer');
    screen.dataset.connected = 'true';
    screen.callInterval = setInterval(() => {
      seconds += 1;
      if (timerEl) timerEl.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }, 1000);
  }, 1800);
}

function callButton(icon, onClick, toggleable = false, isEnd = false){
  const btn = el('button', { class:`call-btn${isEnd ? ' call-btn--end' : ''}`, onclick: (e) => { onClick(e); if (toggleable) e.currentTarget.classList.toggle('is-active'); } },
    el('i', { 'data-lucide':icon }));
  return btn;
}

function endCall(screen){
  clearInterval(screen.callInterval);
  screen.remove();
}

/* Simulated incoming call, purely to showcase the UI (fires once per session, ~20s in) */
function simulateIncomingCall(){
  const contacts = data.allContacts();
  if (!contacts.length) return;
  const caller = contacts[Math.floor(Math.random() * contacts.length)];
  const kind = Math.random() > 0.5 ? 'video' : 'voice';
  const card = el('div', { class:'incoming-call' },
    el('div', { class:'avatar avatar--md' }, caller.photoURL ? el('img', { src:caller.photoURL }) : initials(caller.displayName)),
    el('div', { class:'incoming-call__info' }, el('strong', {}, caller.displayName), el('span', {}, `Incoming ${kind} call…`)),
    el('div', { class:'incoming-call__actions' },
      el('button', { class:'call-btn call-btn--end', onclick: () => card.remove() }, el('i', { 'data-lucide':'phone-off' })),
      el('button', { class:'call-btn call-btn--accept', onclick: () => { card.remove(); startCall(kind, caller); } }, el('i', { 'data-lucide':'phone' })),
    ),
  );
  document.body.append(card);
  refreshIcons();
  setTimeout(() => card.remove(), 12000);
}
setTimeout(simulateIncomingCall, 25000);

/* ------------------------------------------------------------------ */
/* Notifications                                                        */
/* ------------------------------------------------------------------ */

function renderNotifications(notes){
  const badge = $('#notifBadge');
  const unread = notes.filter((n) => !n.read).length;
  badge.textContent = unread;
  badge.classList.toggle('hidden', unread === 0);

  const list = $('#notificationsList');
  if (!list) return;
  list.innerHTML = '';
  if (!notes.length) { list.append(el('div', { class:'empty-state' }, el('i', { 'data-lucide':'bell-off' }), el('p', {}, 'No notifications yet.'))); refreshIcons(); return; }
  notes.forEach((n) => {
    const from = data.getUser(n.fromId);
    list.append(el('div', { class:'chat-item', onclick: () => { openChat(n.chatId); switchNav('chats'); } },
      el('div', { class:'avatar avatar--sm' }, from?.photoURL ? el('img', { src:from.photoURL }) : initials(from?.displayName)),
      el('div', { class:'chat-item__body' },
        el('div', { class:'chat-item__name' }, from?.displayName || 'HUB Chat'),
        el('div', { class:'chat-item__preview' }, el('p', {}, n.text)),
      ),
      !n.read ? el('span', { style:'width:8px;height:8px;border-radius:50%;background:var(--signal-start);flex-shrink:0;' }) : null,
    ));
  });
  refreshIcons();
}

/* ------------------------------------------------------------------ */
/* Misc                                                                 */
/* ------------------------------------------------------------------ */

function populateContactAvatars(){
  // Ensures dicebear avatars are ready before first paint on slow connections.
  data.allContacts().forEach((c) => { const img = new Image(); img.src = c.photoURL; });
}
