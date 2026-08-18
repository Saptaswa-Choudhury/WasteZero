import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { CryptoService } from '../../core/crypto/crypto.service';

export interface ChatUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  publicKey?: string | null;
}

// What actually goes over the wire / lives in the DB - the server only ever
// sees these fields, never plaintext.
export interface EncryptedFields {
  ciphertext: string;
  iv: string;
  encryptedKeyForSender: string;
  encryptedKeyForReceiver: string;
}

export interface ChatMessage extends Partial<EncryptedFields> {
  _id: string;
  sender: ChatUser | string;
  receiver: ChatUser | string;
  // Populated client-side after decryption. Empty until enrich*() runs.
  content: string;
  decryptFailed?: boolean;
  isRead: boolean;
  createdAt: string;
}

export interface ConversationPreview extends Partial<EncryptedFields> {
  _id: string;
  content: string;
  decryptFailed?: boolean;
  sender: string;
  receiver: string;
  createdAt: string;
  isRead: boolean;
}

export interface Conversation {
  user: ChatUser;
  lastMessage: ConversationPreview;
  unreadCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class MessagesService {
  private apiUrl = `${environment.apiUrl}/messages`;
  private usersApiUrl = `${environment.apiUrl}/users`;

  // Socket.IO connects to the server root (not /api/v1) since it's a
  // separate transport layered onto the same HTTP server/port.
  private socketUrl = environment.apiUrl.replace(/\/api\/v1\/?$/, '');
  private socket: Socket | null = null;

  // Cache of other users' public keys (JWK JSON strings) so we don't hit the
  // API before every single send.
  private publicKeyCache = new Map<string, string>();

  newMessage$ = new Subject<ChatMessage>();
  readReceipt$ = new Subject<{ by: string }>();
  typingStart$ = new Subject<{ from: string }>();
  typingStop$ = new Subject<{ from: string }>();
  presenceUpdate$ = new Subject<{ userId: string; online: boolean }>();
  presenceList$ = new Subject<string[]>();
  connectionChange$ = new Subject<boolean>();

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private cryptoService: CryptoService
  ) {}

  connect(): void {
    if (this.socket?.connected) return;

    const token = this.authService.getToken();
    if (!token) return;

    this.socket = io(this.socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => this.connectionChange$.next(true));
    this.socket.on('disconnect', () => this.connectionChange$.next(false));

    this.socket.on('message:new', (msg: ChatMessage) => {
      this.enrichMessage(msg).then((decrypted) => this.newMessage$.next(decrypted));
    });
    this.socket.on('message:read', (payload: { by: string }) => this.readReceipt$.next(payload));
    this.socket.on('typing:start', (payload: { from: string }) => this.typingStart$.next(payload));
    this.socket.on('typing:stop', (payload: { from: string }) => this.typingStop$.next(payload));
    this.socket.on('presence:update', (payload: { userId: string; online: boolean }) =>
      this.presenceUpdate$.next(payload)
    );
    this.socket.on('presence:list', (payload: { onlineUserIds: string[] }) =>
      this.presenceList$.next(payload.onlineUserIds || [])
    );
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  get isConnected(): boolean {
    return !!this.socket?.connected;
  }

  // ---------- end-to-end encryption helpers ----------

  /** Registers a public key we already have on hand (e.g. from a search result or a populated message) in the cache. */
  cachePublicKey(userId: string, publicKey?: string | null): void {
    if (userId && publicKey) {
      this.publicKeyCache.set(userId, publicKey);
    }
  }

  private async getRecipientPublicKey(userId: string): Promise<string> {
    const cached = this.publicKeyCache.get(userId);
    if (cached) return cached;

    const res: any = await this.http.get(`${this.usersApiUrl}/${userId}/public-key`).toPromise();
    const publicKey = res?.data?.publicKey;
    if (!publicKey) {
      throw new Error('This user has not set up encrypted messaging yet');
    }

    this.publicKeyCache.set(userId, publicKey);
    return publicKey;
  }

  private idOf(entity: ChatUser | string): string {
    return typeof entity === 'string' ? entity : entity._id;
  }

  private get currentUserId(): string {
    const user = this.authService.getCurrentUser();
    return user?._id || user?.id || '';
  }

  /** Decrypts a fetched/received message, returning a copy with `.content` populated. */
  async enrichMessage(msg: ChatMessage): Promise<ChatMessage> {
    if (!msg.ciphertext || !msg.iv || !msg.encryptedKeyForSender || !msg.encryptedKeyForReceiver) {
      return { ...msg, content: msg.content || '' };
    }

    const senderId = this.idOf(msg.sender);
    const isMine = senderId === this.currentUserId;

    const plaintext = await this.cryptoService.decryptMessage(this.currentUserId, isMine, {
      ciphertext: msg.ciphertext,
      iv: msg.iv,
      encryptedKeyForSender: msg.encryptedKeyForSender,
      encryptedKeyForReceiver: msg.encryptedKeyForReceiver
    });

    return plaintext !== null
      ? { ...msg, content: plaintext }
      : { ...msg, content: '[Unable to decrypt message]', decryptFailed: true };
  }

  async enrichMessages(messages: ChatMessage[]): Promise<ChatMessage[]> {
    return Promise.all(messages.map((m) => this.enrichMessage(m)));
  }

  async enrichConversation(conv: Conversation): Promise<Conversation> {
    this.cachePublicKey(conv.user._id, conv.user.publicKey);

    const preview = conv.lastMessage;
    if (!preview?.ciphertext || !preview.iv || !preview.encryptedKeyForSender || !preview.encryptedKeyForReceiver) {
      return conv;
    }

    const isMine = preview.sender === this.currentUserId;
    const plaintext = await this.cryptoService.decryptMessage(this.currentUserId, isMine, {
      ciphertext: preview.ciphertext,
      iv: preview.iv,
      encryptedKeyForSender: preview.encryptedKeyForSender,
      encryptedKeyForReceiver: preview.encryptedKeyForReceiver
    });

    return {
      ...conv,
      lastMessage: {
        ...preview,
        content: plaintext !== null ? plaintext : '[Unable to decrypt message]',
        decryptFailed: plaintext === null
      }
    };
  }

  async enrichConversations(conversations: Conversation[]): Promise<Conversation[]> {
    return Promise.all(conversations.map((c) => this.enrichConversation(c)));
  }

  // ---------- sending ----------

  /** Encrypts `content` for `receiver` and sends it over the socket (falling back to REST). */
  async sendMessage(receiver: ChatUser, content: string): Promise<void> {
    const recipientPublicKey = await this.getRecipientPublicKey(receiver._id);
    const payload = await this.cryptoService.encryptMessage(content, this.currentUserId, recipientPublicKey);

    if (this.socket?.connected) {
      this.socket.emit('message:send', { receiver: receiver._id, ...payload });
    } else {
      // REST fallback keeps messaging working even if the socket briefly drops.
      this.http.post(this.apiUrl, { receiver: receiver._id, ...payload }).subscribe();
    }
  }

  notifyTyping(receiver: string, isTyping: boolean): void {
    if (!this.socket?.connected) return;
    this.socket.emit(isTyping ? 'typing:start' : 'typing:stop', { receiver });
  }

  markRead(otherUserId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('message:read', { otherUserId });
    }
    this.http.patch(`${this.apiUrl}/${otherUserId}/read`, {}).subscribe();
  }

  getConversations(): Observable<any> {
    return this.http.get(`${this.apiUrl}/conversations`);
  }

  getConversation(userId: string, page = 1, limit = 50): Observable<any> {
    const params = new HttpParams().set('page', page).set('limit', limit);
    return this.http.get(`${this.apiUrl}/${userId}`, { params });
  }

  searchUsers(query: string): Observable<any> {
    const params = new HttpParams().set('q', query);
    return this.http.get(`${this.usersApiUrl}/search`, { params });
  }
}
