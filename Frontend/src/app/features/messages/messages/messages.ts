import { Component, ChangeDetectionStrategy, OnDestroy, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { PageShell } from '../../../shared/page-shell/page-shell';
import { AuthService } from '../../auth/auth.service';
import { CryptoService } from '../../../core/crypto/crypto.service';
import { ChatMessage, ChatUser, Conversation, MessagesService } from '../messages.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule, PageShell],
  templateUrl: './messages.html',
  styleUrl: './messages.scss'
})
export class Messages implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messageList') private messageListRef?: ElementRef<HTMLDivElement>;

  currentUser: any = null;
  currentUserId = '';

  conversations: Conversation[] = [];
  isLoadingConversations = true;

  searchTerm = '';
  isSearchMode = false;
  isSearchingUsers = false;
  searchResults: ChatUser[] = [];

  selectedUser: ChatUser | null = null;
  messages: ChatMessage[] = [];
  isLoadingMessages = false;
  messageInput = '';

  showChatOnMobile = false;
  isOtherUserTyping = false;
  onlineUserIds = new Set<string>();

  private destroy$ = new Subject<void>();
  private searchDebounceHandle: ReturnType<typeof setTimeout> | undefined;
  private typingStopHandle: ReturnType<typeof setTimeout> | undefined;
  private shouldScrollToBottom = false;

  constructor(
    private messagesService: MessagesService,
    private authService: AuthService,
    private cryptoService: CryptoService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.currentUserId = this.currentUser?._id || this.currentUser?.id || '';

    // Defensive: normally the key pair is set up right after login, but
    // this covers a still-valid session on a device that hasn't run that
    // flow yet (or had its local key wiped). ensureKeyPair() is a no-op if
    // a key pair already exists locally.
    if (this.currentUserId) {
      this.cryptoService
        .ensureKeyPair(this.currentUserId)
        .then((publicKey) => this.authService.setPublicKey(publicKey).subscribe())
        .catch((err) => console.error('Failed to set up encryption keys', err));
    }

    this.messagesService.connect();
    this.listenForRealtimeEvents();
    this.fetchConversations();

    const preselectUserId = this.route.snapshot.queryParamMap.get('user');
    const preselectUserName = this.route.snapshot.queryParamMap.get('name');
    if (preselectUserId) {
      this.openConversation({
        _id: preselectUserId,
        name: preselectUserName || 'User',
        email: '',
        role: ''
      });
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollMessagesToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.searchDebounceHandle) clearTimeout(this.searchDebounceHandle);
    if (this.typingStopHandle) clearTimeout(this.typingStopHandle);
  }

  // ---------- realtime wiring ----------

  private listenForRealtimeEvents(): void {
    this.messagesService.newMessage$.pipe(takeUntil(this.destroy$)).subscribe((msg) => {
      const senderId = this.idOf(msg.sender);
      const receiverId = this.idOf(msg.receiver);
      const otherId = senderId === this.currentUserId ? receiverId : senderId;

      if (this.selectedUser?._id === otherId) {
        this.messages = [...this.messages, msg];
        this.shouldScrollToBottom = true;
        if (senderId === otherId) {
          this.messagesService.markRead(otherId);
        }
      }

      this.upsertConversationPreview(msg, otherId, senderId);
    });

    this.messagesService.readReceipt$.pipe(takeUntil(this.destroy$)).subscribe(({ by }) => {
      if (this.selectedUser?._id === by) {
        this.messages = this.messages.map((m) => ({ ...m, isRead: true }));
      }
    });

    this.messagesService.typingStart$.pipe(takeUntil(this.destroy$)).subscribe(({ from }) => {
      if (this.selectedUser?._id === from) this.isOtherUserTyping = true;
    });

    this.messagesService.typingStop$.pipe(takeUntil(this.destroy$)).subscribe(({ from }) => {
      if (this.selectedUser?._id === from) this.isOtherUserTyping = false;
    });

    this.messagesService.presenceUpdate$.pipe(takeUntil(this.destroy$)).subscribe(({ userId, online }) => {
      if (online) this.onlineUserIds.add(userId);
      else this.onlineUserIds.delete(userId);
    });

    this.messagesService.presenceList$.pipe(takeUntil(this.destroy$)).subscribe((ids) => {
      this.onlineUserIds = new Set(ids);
    });
  }

  private idOf(entity: ChatUser | string): string {
    return typeof entity === 'string' ? entity : entity._id;
  }

  private upsertConversationPreview(msg: ChatMessage, otherId: string, senderId: string): void {
    const isIncoming = senderId !== this.currentUserId;
    const isActivelyOpen = this.selectedUser?._id === otherId;

    const existing = this.conversations.find((c) => c.user._id === otherId);

    const preview = {
      _id: msg._id,
      content: msg.content,
      sender: senderId,
      receiver: this.idOf(msg.receiver),
      createdAt: msg.createdAt,
      isRead: msg.isRead
    };

    if (existing) {
      existing.lastMessage = preview;
      if (isIncoming && !isActivelyOpen) existing.unreadCount += 1;
      this.conversations = [existing, ...this.conversations.filter((c) => c !== existing)];
      return;
    }

    const senderObj = typeof msg.sender !== 'string' ? msg.sender : null;
    const receiverObj = typeof msg.receiver !== 'string' ? msg.receiver : null;
    const otherUser: ChatUser =
      (senderObj && senderObj._id === otherId && senderObj) ||
      (receiverObj && receiverObj._id === otherId && receiverObj) ||
      { _id: otherId, name: 'User', email: '', role: '' };

    this.conversations = [
      {
        user: otherUser,
        lastMessage: preview,
        unreadCount: isIncoming && !isActivelyOpen ? 1 : 0
      },
      ...this.conversations
    ];
  }

  // ---------- data fetching ----------

  fetchConversations(): void {
    this.isLoadingConversations = true;
    this.messagesService.getConversations().subscribe({
      next: (res: any) => {
        const conversations: Conversation[] = res.data?.conversations || [];
        this.messagesService.enrichConversations(conversations).then((decrypted) => {
          this.conversations = decrypted;
          this.isLoadingConversations = false;
        });
      },
      error: () => {
        this.isLoadingConversations = false;
      }
    });
  }

  // ---------- user search (start a new chat) ----------

  onSearchChange(): void {
    if (this.searchDebounceHandle) clearTimeout(this.searchDebounceHandle);

    const term = this.searchTerm.trim();
    if (!term) {
      this.isSearchMode = false;
      this.searchResults = [];
      return;
    }

    this.isSearchMode = true;
    this.searchDebounceHandle = setTimeout(() => {
      this.isSearchingUsers = true;
      this.messagesService.searchUsers(term).subscribe({
        next: (res: any) => {
          this.searchResults = res.data?.users || [];
          this.isSearchingUsers = false;
        },
        error: () => {
          this.searchResults = [];
          this.isSearchingUsers = false;
        }
      });
    }, 300);
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.isSearchMode = false;
    this.searchResults = [];
  }

  // ---------- conversation handling ----------

  startChatWithUser(user: ChatUser): void {
    this.messagesService.cachePublicKey(user._id, user.publicKey);
    this.clearSearch();
    this.openConversation(user);
  }

  openConversation(user: ChatUser): void {
    this.selectedUser = user;
    this.showChatOnMobile = true;
    this.messages = [];
    this.isLoadingMessages = true;
    this.isOtherUserTyping = false;

    this.messagesService.cachePublicKey(user._id, user.publicKey);

    const existing = this.conversations.find((c) => c.user._id === user._id);
    if (existing) existing.unreadCount = 0;

    this.messagesService.getConversation(user._id).subscribe({
      next: (res: any) => {
        const messages: ChatMessage[] = res.data?.messages || [];
        this.messagesService.enrichMessages(messages).then((decrypted) => {
          this.messages = decrypted;
          this.isLoadingMessages = false;
          this.shouldScrollToBottom = true;
          this.messagesService.markRead(user._id);
        });
      },
      error: () => {
        this.isLoadingMessages = false;
      }
    });
  }

  backToList(): void {
    this.showChatOnMobile = false;
  }

  sendMessage(): void {
    const content = this.messageInput.trim();
    if (!content || !this.selectedUser) return;

    const receiver = this.selectedUser;
    this.messageInput = '';
    this.clearTypingSoon(true);

    this.messagesService.sendMessage(receiver, content).catch((err) => {
      console.error('Failed to send encrypted message', err);
      alert(err?.message || 'Could not send message. The recipient may not have encrypted messaging set up yet.');
    });
  }

  onInputChange(): void {
    if (!this.selectedUser) return;
    this.messagesService.notifyTyping(this.selectedUser._id, true);
    this.clearTypingSoon(false);
  }

  private clearTypingSoon(immediate: boolean): void {
    if (this.typingStopHandle) clearTimeout(this.typingStopHandle);
    if (!this.selectedUser) return;

    if (immediate) {
      this.messagesService.notifyTyping(this.selectedUser._id, false);
      return;
    }

    this.typingStopHandle = setTimeout(() => {
      if (this.selectedUser) this.messagesService.notifyTyping(this.selectedUser._id, false);
    }, 1500);
  }

  // ---------- view helpers ----------

  isMine(msg: ChatMessage): boolean {
    return this.idOf(msg.sender) === this.currentUserId;
  }

  initials(name: string | undefined): string {
    return (name || 'U').charAt(0).toUpperCase();
  }

  formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }

  isUserOnline(userId: string | undefined): boolean {
    return !!userId && this.onlineUserIds.has(userId);
  }

  trackConversation(_index: number, conv: Conversation): string {
    return conv.user._id;
  }

  trackMessage(_index: number, msg: ChatMessage): string {
    return msg._id;
  }

  trackUser(_index: number, user: ChatUser): string {
    return user._id;
  }

  private scrollMessagesToBottom(): void {
    const el = this.messageListRef?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }
}
