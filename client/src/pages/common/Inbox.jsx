import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import {
  Megaphone,
  Users,
  MessageSquare,
  ShieldCheck,
  Send,
  Search,
  Lock,
  Clock,
  Sparkles,
  Info,
  ChevronRight,
  RefreshCw,
  UserCheck,
} from 'lucide-react';

export default function Inbox() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('ANNOUNCEMENT'); // 'ANNOUNCEMENT' | 'COMMUNITY' | 'DIRECT' | 'AUDIT'
  const [messages, setMessages] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const messagesEndRef = useRef(null);

  const isAdmin = user?.role === 'ADMIN';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch messages based on active tab and selected contact
  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      let url = `/chat/messages?type=${activeTab === 'AUDIT' ? 'DIRECT' : activeTab}`;
      if (activeTab === 'DIRECT' && selectedContact) {
        url += `&contactId=${selectedContact.id}`;
      } else if (activeTab === 'AUDIT') {
        url += `&audit=true`;
      }
      const { data } = await api.get(url);
      setMessages(data.messages || []);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, selectedContact]);

  // Fetch contacts for 1-on-1 Direct Messaging
  const fetchContacts = useCallback(async () => {
    try {
      const { data } = await api.get('/chat/contacts');
      setContacts(data.contacts || []);
      if (data.contacts?.length > 0 && !selectedContact) {
        setSelectedContact(data.contacts[0]);
      }
    } catch {
      setContacts([]);
    }
  }, [selectedContact]);

  useEffect(() => {
    fetchMessages();
    if (activeTab === 'ANNOUNCEMENT') {
      api.post('/chat/read-announcements').catch(() => {});
    }
  }, [fetchMessages, activeTab]);

  useEffect(() => {
    if (activeTab === 'DIRECT') {
      fetchContacts();
    }
  }, [activeTab, fetchContacts]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Send message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!content.trim() || sending) return;

    setSending(true);
    try {
      const payload = {
        type: activeTab === 'AUDIT' ? 'COMMUNITY' : activeTab,
        content: content.trim(),
        recipientId: activeTab === 'DIRECT' ? selectedContact?.id : undefined,
      };

      const { data } = await api.post('/chat/messages', payload);
      setMessages((prev) => [...prev, data.message]);
      setContent('');
    } catch (err) {
      alert(err.response?.data?.message || 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  const filteredContacts = contacts.filter((c) =>
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.role?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-app pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-app tracking-tight">
            Inbox & Messaging Hub
          </h1>
          <p className="text-xs sm:text-sm text-app-secondary mt-0.5">
            Platform announcements, community support, and direct communications.
          </p>
        </div>

        {/* Channel Selection Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-elevated border border-app rounded-btn overflow-x-auto scrollbar-none text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('ANNOUNCEMENT')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all shrink-0 ${
              activeTab === 'ANNOUNCEMENT'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-app-secondary hover:text-app'
            }`}
          >
            <Megaphone className="h-3.5 w-3.5" />
            <span>Announcements</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('COMMUNITY')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all shrink-0 ${
              activeTab === 'COMMUNITY'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-app-secondary hover:text-app'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Community Support</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('DIRECT')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all shrink-0 ${
              activeTab === 'DIRECT'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-app-secondary hover:text-app'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Direct Messages</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('AUDIT')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all shrink-0 ${
                activeTab === 'AUDIT'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-purple-600 dark:text-purple-400 hover:bg-purple-500/10'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Admin Audit View</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Messaging Container */}
      <div className="rounded-card border border-app bg-surface dark:bg-dark-surface shadow-xs overflow-hidden flex flex-col md:flex-row min-h-[560px]">
        {/* Contact List Sidebar (Shown only for Direct Messages) */}
        {activeTab === 'DIRECT' && (
          <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-app flex flex-col bg-elevated/40 shrink-0">
            <div className="p-3.5 border-b border-app">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-app-muted" />
                <input
                  type="text"
                  placeholder="Search contacts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 text-xs rounded-btn bg-elevated border border-app text-app focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-app/40 max-h-[460px] scrollbar-thin">
              {filteredContacts.map((contact) => {
                const isSelected = selectedContact?.id === contact.id;
                return (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => setSelectedContact(contact)}
                    className={`w-full p-3 text-left flex items-center gap-3 transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-slate-800/80 border-l-4 border-l-blue-600'
                        : 'hover:bg-elevated'
                    }`}
                  >
                    <Avatar name={contact.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-app truncate">{contact.name}</p>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-elevated border border-app text-app-secondary">
                          {contact.role}
                        </span>
                      </div>
                      <p className="text-[11px] text-app-muted truncate mt-0.5">
                        {contact.department || 'Platform Member'}
                      </p>
                    </div>
                  </button>
                );
              })}

              {filteredContacts.length === 0 && (
                <div className="p-6 text-center text-xs text-app-muted">
                  No contacts found.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Active Conversation Feed */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Conversation Channel Header */}
          <div className="p-3.5 px-5 border-b border-app bg-elevated/60 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              {activeTab === 'ANNOUNCEMENT' && (
                <>
                  <div className="p-1.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                    <Megaphone className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-app">Global Announcements</h3>
                    <p className="text-[11px] text-app-muted">Broadcast platform messages verified by Admin</p>
                  </div>
                </>
              )}

              {activeTab === 'COMMUNITY' && (
                <>
                  <div className="p-1.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                    <Users className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-app">Community Support Desk</h3>
                    <p className="text-[11px] text-app-muted">Direct assistance between you and platform staff (Admin & Moderator)</p>
                  </div>
                </>
              )}

              {activeTab === 'DIRECT' && (
                <>
                  <Avatar name={selectedContact?.name || 'Contact'} size="sm" />
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-app">
                      {selectedContact ? selectedContact.name : 'Select a contact'}
                    </h3>
                    <p className="text-[11px] text-app-muted">
                      {selectedContact ? `${selectedContact.role} • 1-on-1 Secure Chat` : 'Direct messaging'}
                    </p>
                  </div>
                </>
              )}

              {activeTab === 'AUDIT' && (
                <>
                  <div className="p-1.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-purple-700 dark:text-purple-300">
                      Admin Compliance & Oversight Audit
                    </h3>
                    <p className="text-[11px] text-app-muted">All 1-on-1 messages across the platform for security verification</p>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={fetchMessages}
              title="Refresh feed"
              className="p-1.5 text-app-muted hover:text-app transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 max-h-[460px] scrollbar-thin">
            {messages.map((msg) => {
              const isMe = msg.senderId === user?.id;
              const formattedTime = new Date(msg.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe && activeTab !== 'AUDIT' ? 'items-end' : 'items-start'} space-y-1`}
                >
                  <div className="flex items-center gap-2 text-[11px] text-app-muted">
                    <span className="font-bold text-app">{msg.senderName}</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-elevated border border-app">
                      {msg.senderRole}
                    </span>
                    {activeTab === 'AUDIT' && msg.recipientName && (
                      <span className="text-[10px] text-purple-600 dark:text-purple-400">
                        → to {msg.recipientName} ({msg.recipientRole})
                      </span>
                    )}
                    <span>• {formattedTime}</span>
                  </div>

                  <div
                    className={`p-3 rounded-card text-xs max-w-lg leading-relaxed shadow-xs ${
                      isMe && activeTab !== 'AUDIT'
                        ? 'bg-blue-600 text-white rounded-tr-none'
                        : 'bg-elevated border border-app text-app rounded-tl-none'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              );
            })}

            {messages.length === 0 && !loading && (
              <div className="p-12 text-center text-xs text-app-muted space-y-1">
                <p className="font-semibold text-app">No messages in this channel yet.</p>
                <p className="text-[11px]">Be the first to start the conversation.</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Message Composer */}
          <div className="p-3 sm:p-4 border-t border-app bg-surface dark:bg-dark-surface shrink-0">
            {activeTab === 'ANNOUNCEMENT' && !isAdmin ? (
              <div className="p-2.5 rounded-btn bg-elevated border border-app text-xs text-app-secondary flex items-center gap-2">
                <Lock className="h-4 w-4 text-app-muted shrink-0" />
                <span>Announcements are broadcast-only from platform administrators.</span>
              </div>
            ) : activeTab === 'AUDIT' ? (
              <div className="p-2.5 rounded-btn bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-xs text-purple-700 dark:text-purple-300 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>Read-only compliance audit stream. Real-time message oversight is active.</span>
              </div>
            ) : (
              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                <input
                  type="text"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={
                    activeTab === 'ANNOUNCEMENT'
                      ? 'Broadcast a platform announcement to all users...'
                      : activeTab === 'DIRECT'
                      ? `Message ${selectedContact?.name || 'user'} directly...`
                      : 'Message platform staff (Admin & Moderator) for support...'
                  }
                  className="flex-1 h-10 px-3.5 text-xs rounded-btn bg-elevated border border-app text-app focus:ring-1 focus:ring-blue-500"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!content.trim() || sending}
                  isLoading={sending}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold shrink-0"
                  leftIcon={<Send className="h-3.5 w-3.5" />}
                >
                  Send
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
