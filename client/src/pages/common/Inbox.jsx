import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { SegmentedToggle } from '../../components/ui/SegmentedToggle.jsx';
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
  Paperclip,
  FileText,
  Download,
  X,
  CheckCheck,
  CornerUpLeft,
} from 'lucide-react';

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function Inbox() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab persistence with URL search param
  const activeTab = searchParams.get('tab') || 'ANNOUNCEMENT';
  const handleTabChange = (tabId) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', tabId);
        return next;
      },
      { replace: true }
    );
  };

  const [messages, setMessages] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [communityThreads, setCommunityThreads] = useState([]);
  const [selectedCommunityUser, setSelectedCommunityUser] = useState(null);
  const [communitySearchTerm, setCommunitySearchTerm] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [content, setContent] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [channelCounts, setChannelCounts] = useState({
    announcements: 0,
    community: 0,
    direct: 0,
  });
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);

  const isAdmin = user?.role === 'ADMIN';
  const isModerator = user?.role === 'MODERATOR';
  const isStaff = isAdmin || isModerator;

  const selectedContactRef = useRef(selectedContact);
  useEffect(() => {
    selectedContactRef.current = selectedContact;
  }, [selectedContact]);

  const selectedCommunityUserRef = useRef(selectedCommunityUser);
  useEffect(() => {
    selectedCommunityUserRef.current = selectedCommunityUser;
  }, [selectedCommunityUser]);

  const fetchChannelCounts = useCallback(async () => {
    try {
      const { data } = await api.get('/chat/unread-count');
      if (data?.success) {
        setChannelCounts({
          announcements: data.announcementCount || 0,
          community: data.communityCount || 0,
          direct: data.directCount || 0,
        });
      }
    } catch {
      // silent
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch community support user threads (for Admin / Moderator view)
  const fetchCommunityThreads = useCallback(async () => {
    if (!isStaff) return;
    try {
      const { data } = await api.get('/chat/community/threads');
      const currentSelectedCommunity = selectedCommunityUserRef.current;
      const rawThreads = data.threads || [];
      const updatedThreads = rawThreads.map((t) =>
        currentSelectedCommunity && t.id === currentSelectedCommunity.id ? { ...t, unread: false } : t
      );
      setCommunityThreads(updatedThreads);
      if (rawThreads.length > 0 && !currentSelectedCommunity) {
        setSelectedCommunityUser(rawThreads[0]);
      }
    } catch {
      setCommunityThreads([]);
    }
  }, [isStaff]);

  // Fetch messages based on active tab, selected contact, or selected community thread
  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      let url = `/chat/messages?type=${activeTab === 'AUDIT' ? 'DIRECT' : activeTab}`;
      if (activeTab === 'DIRECT') {
        if (!selectedContact) {
          setMessages([]);
          setLoading(false);
          return;
        }
        url += `&contactId=${selectedContact.id}`;
      } else if (activeTab === 'COMMUNITY' && isStaff) {
        if (!selectedCommunityUser) {
          setMessages([]);
          setLoading(false);
          return;
        }
        url += `&contactId=${selectedCommunityUser.id}`;
      } else if (activeTab === 'AUDIT') {
        url += `&audit=true`;
      }
      const { data } = await api.get(url);
      setMessages(data.messages || []);

      if (activeTab === 'DIRECT' && selectedContact) {
        setContacts((prev) =>
          prev.map((c) => (c.id === selectedContact.id ? { ...c, unreadCount: 0 } : c))
        );
      } else if (activeTab === 'COMMUNITY' && isStaff && selectedCommunityUser) {
        setCommunityThreads((prev) =>
          prev.map((t) => (t.id === selectedCommunityUser.id ? { ...t, unread: false } : t))
        );
      }
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, selectedContact, isStaff, selectedCommunityUser]);

  // Fetch contacts for 1-on-1 Direct Messaging
  const fetchContacts = useCallback(async () => {
    try {
      const { data } = await api.get('/chat/contacts');
      const currentSelected = selectedContactRef.current;
      const rawContacts = data.contacts || [];
      const updated = rawContacts.map((c) =>
        currentSelected && c.id === currentSelected.id ? { ...c, unreadCount: 0 } : c
      );
      setContacts(updated);
      if (rawContacts.length > 0 && !currentSelected) {
        setSelectedContact(rawContacts[0]);
      }
    } catch {
      setContacts([]);
    }
  }, []);

  useEffect(() => {
    fetchChannelCounts();
  }, [fetchChannelCounts]);

  useEffect(() => {
    fetchMessages().then(() => {
      window.dispatchEvent(new Event('chat_messages_read'));
      fetchChannelCounts();
    });
    if (activeTab === 'ANNOUNCEMENT') {
      api.post('/chat/read-announcements').then(() => {
        window.dispatchEvent(new Event('chat_messages_read'));
        fetchChannelCounts();
      }).catch(() => {});
    }
  }, [fetchMessages, activeTab, fetchChannelCounts]);

  useEffect(() => {
    if (activeTab === 'DIRECT') {
      fetchContacts();
    } else if (activeTab === 'COMMUNITY' && isStaff) {
      fetchCommunityThreads();
    }
  }, [activeTab, fetchContacts, fetchCommunityThreads, isStaff]);

  // Real-time socket message listeners with deduplication and optimistic reconciliation
  useEffect(() => {
    if (!socket) return;

    const handleAnnouncement = (msg) => {
      if (activeTab === 'ANNOUNCEMENT') {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        api.post('/chat/read-announcements').then(() => {
          window.dispatchEvent(new Event('chat_messages_read'));
          fetchChannelCounts();
        }).catch(() => {});
      } else {
        setChannelCounts((prev) => ({ ...prev, announcements: prev.announcements + 1 }));
      }
    };

    const handleCommunity = (msg) => {
      const activeId = selectedCommunityUserRef.current?.id;
      if (activeTab === 'COMMUNITY') {
        if (isStaff) {
          const isForActiveThread = activeId && (msg.senderId === activeId || msg.recipientId === activeId);
          if (!isForActiveThread) {
            fetchCommunityThreads();
            setChannelCounts((prev) => ({ ...prev, community: prev.community + 1 }));
            return;
          }
          if (msg.senderId === activeId) {
            api.get(`/chat/messages?type=COMMUNITY&contactId=${activeId}`).then(() => {
              window.dispatchEvent(new Event('chat_messages_read'));
              fetchChannelCounts();
            }).catch(() => {});
            setCommunityThreads((prev) =>
              prev.map((t) => (t.id === activeId ? { ...t, unread: false } : t))
            );
          }
        } else {
          if (msg.senderRole === 'ADMIN' || msg.senderRole === 'MODERATOR') {
            api.get(`/chat/messages?type=COMMUNITY`).then(() => {
              window.dispatchEvent(new Event('chat_messages_read'));
              fetchChannelCounts();
            }).catch(() => {});
          }
        }
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          // Reconcile optimistic message sent by current user
          if (msg.senderId === user?.id) {
            const optIdx = prev.findIndex((m) => m.isOptimistic && m.content === msg.content);
            if (optIdx !== -1) {
              const updated = [...prev];
              updated[optIdx] = msg;
              return updated;
            }
          }
          return [...prev, msg];
        });
      } else {
        if (msg.senderId !== user?.id) {
          setChannelCounts((prev) => ({ ...prev, community: prev.community + 1 }));
          if (isStaff) {
            fetchCommunityThreads();
          }
        }
      }
    };

    const handleDirect = (msg) => {
      const currentSelected = selectedContactRef.current;
      if (activeTab === 'DIRECT') {
        if (
          (currentSelected && (msg.senderId === currentSelected.id || msg.recipientId === currentSelected.id)) ||
          msg.senderId === user?.id
        ) {
          if (currentSelected && msg.senderId === currentSelected.id) {
            api.get(`/chat/messages?type=DIRECT&contactId=${currentSelected.id}`).then(() => {
              window.dispatchEvent(new Event('chat_messages_read'));
              fetchChannelCounts();
            }).catch(() => {});
            setContacts((prev) =>
              prev.map((c) => (c.id === currentSelected.id ? { ...c, unreadCount: 0 } : c))
            );
          }
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            if (msg.senderId === user?.id) {
              const optIdx = prev.findIndex((m) => m.isOptimistic && m.content === msg.content);
              if (optIdx !== -1) {
                const updated = [...prev];
                updated[optIdx] = msg;
                return updated;
              }
            }
            return [...prev, msg];
          });
        } else if (msg.senderId !== user?.id && msg.recipientId === user?.id) {
          setChannelCounts((prev) => ({ ...prev, direct: prev.direct + 1 }));
          setContacts((prev) => {
            const exists = prev.some((c) => c.id === msg.senderId);
            if (!exists) {
              fetchContacts();
              return prev;
            }
            return prev.map((c) => (c.id === msg.senderId ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c));
          });
        }
      } else {
        if (msg.senderId !== user?.id && msg.recipientId === user?.id) {
          setChannelCounts((prev) => ({ ...prev, direct: prev.direct + 1 }));
          setContacts((prev) => {
            const exists = prev.some((c) => c.id === msg.senderId);
            if (!exists) {
              fetchContacts();
              return prev;
            }
            return prev.map((c) => (c.id === msg.senderId ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c));
          });
        }
      }
    };

    const handleAudit = (msg) => {
      if (isAdmin && activeTab === 'AUDIT') {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      }
    };

    socket.on('new_announcement', handleAnnouncement);
    socket.on('new_community_message', handleCommunity);
    socket.on('new_direct_message', handleDirect);
    socket.on('admin_message_audit', handleAudit);

    return () => {
      socket.off('new_announcement', handleAnnouncement);
      socket.off('new_community_message', handleCommunity);
      socket.off('new_direct_message', handleDirect);
      socket.off('admin_message_audit', handleAudit);
    };
  }, [socket, activeTab, selectedContact, selectedCommunityUser, isAdmin, isStaff, user?.id, fetchContacts, fetchCommunityThreads]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Send message with instant optimistic UI response, reply-to reference, and file upload support
  const handleSendMessage = async (e) => {
    e.preventDefault();
    const textToSend = content.trim();
    if ((!textToSend && !selectedFile) || sending) return;

    setSending(true);

    let uploadedFileInfo = null;
    try {
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        const { data: uploadRes } = await api.post('/chat/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        uploadedFileInfo = uploadRes.file;
      }

      const targetRecipientId =
        activeTab === 'DIRECT'
          ? selectedContact?.id
          : activeTab === 'COMMUNITY' && isStaff
          ? selectedCommunityUser?.id
          : undefined;

      const targetRecipientName =
        activeTab === 'DIRECT'
          ? selectedContact?.name
          : activeTab === 'COMMUNITY' && isStaff
          ? selectedCommunityUser?.name
          : undefined;

      const replySnapshot = replyingTo
        ? {
            id: replyingTo.id,
            senderName: replyingTo.senderName,
            content: replyingTo.content || replyingTo.fileName || 'Attachment',
          }
        : null;

      const tempId = `temp-${Date.now()}`;
      const optimisticMessage = {
        id: tempId,
        type: activeTab === 'AUDIT' ? 'COMMUNITY' : activeTab,
        content: textToSend,
        fileUrl: uploadedFileInfo?.fileUrl,
        fileName: uploadedFileInfo?.fileName,
        fileType: uploadedFileInfo?.fileType,
        fileSize: uploadedFileInfo?.fileSize,
        senderId: user?.id,
        senderName: user?.name,
        senderRole: user?.role,
        recipientId: targetRecipientId,
        recipientName: targetRecipientName,
        replyTo: replySnapshot,
        createdAt: new Date().toISOString(),
        isOptimistic: true,
      };

      // Instant local state dispatch
      setMessages((prev) => [...prev, optimisticMessage]);
      setContent('');
      setSelectedFile(null);
      setReplyingTo(null);

      const payload = {
        type: activeTab === 'AUDIT' ? 'COMMUNITY' : activeTab,
        content: textToSend,
        recipientId: targetRecipientId,
        fileUrl: uploadedFileInfo?.fileUrl,
        fileName: uploadedFileInfo?.fileName,
        fileType: uploadedFileInfo?.fileType,
        fileSize: uploadedFileInfo?.fileSize,
        replyTo: replySnapshot,
      };

      const { data } = await api.post('/chat/messages', payload);
      // Reconcile optimistic placeholder without duplicate insertion
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.message.id)) {
          return prev.filter((m) => m.id !== tempId || m.id === data.message.id);
        }
        return prev.map((m) => (m.id === tempId ? data.message : m));
      });

      if (activeTab === 'COMMUNITY' && isStaff) {
        fetchCommunityThreads();
      }
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

  const filteredCommunityThreads = communityThreads.filter((t) =>
    t.name?.toLowerCase().includes(communitySearchTerm.toLowerCase()) ||
    t.role?.toLowerCase().includes(communitySearchTerm.toLowerCase()) ||
    t.lastMessage?.toLowerCase().includes(communitySearchTerm.toLowerCase())
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

        {/* Channel Selection Buttons with Smooth Sliding Capsule */}
        <SegmentedToggle
          options={[
            {
              id: 'ANNOUNCEMENT',
              label: 'Announcements',
              icon: <Megaphone className="h-3.5 w-3.5" />,
              hasBadge: channelCounts.announcements > 0,
            },
            {
              id: 'COMMUNITY',
              label: 'Community Support',
              icon: <Users className="h-3.5 w-3.5" />,
              hasBadge: channelCounts.community > 0,
            },
            {
              id: 'DIRECT',
              label: 'Direct Messages',
              icon: <MessageSquare className="h-3.5 w-3.5" />,
              hasBadge: channelCounts.direct > 0,
            },
            ...(isAdmin ? [{ id: 'AUDIT', label: 'Admin Audit View', icon: <ShieldCheck className="h-3.5 w-3.5" /> }] : []),
          ]}
          value={activeTab}
          onChange={handleTabChange}
          size="sm"
          color={activeTab === 'AUDIT' ? 'purple' : 'blue'}
        />
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
                    onClick={() => {
                      setSelectedContact(contact);
                      setContacts((prev) =>
                        prev.map((c) => (c.id === contact.id ? { ...c, unreadCount: 0 } : c))
                      );
                    }}
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
                        <div className="flex items-center gap-1.5 shrink-0">
                          {contact.unreadCount > 0 && !isSelected && (
                            <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                          )}
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-elevated border border-app text-app-secondary">
                            {contact.role}
                          </span>
                        </div>
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

        {/* Support Desks Sidebar (Shown for Admin / Moderator in Community Support) */}
        {activeTab === 'COMMUNITY' && isStaff && (
          <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-app flex flex-col bg-elevated/40 shrink-0">
            <div className="p-3.5 border-b border-app">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-app-muted" />
                <input
                  type="text"
                  placeholder="Search user support threads..."
                  value={communitySearchTerm}
                  onChange={(e) => setCommunitySearchTerm(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 text-xs rounded-btn bg-elevated border border-app text-app focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-app/40 max-h-[460px] scrollbar-thin">
              {filteredCommunityThreads.map((thread) => {
                const isSelected = selectedCommunityUser?.id === thread.id;
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => {
                      setSelectedCommunityUser(thread);
                      setCommunityThreads((prev) =>
                        prev.map((t) => (t.id === thread.id ? { ...t, unread: false } : t))
                      );
                    }}
                    className={`w-full p-3 text-left flex items-center gap-3 transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-slate-800/80 border-l-4 border-l-blue-600'
                        : 'hover:bg-elevated'
                    }`}
                  >
                    <Avatar name={thread.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-xs font-bold text-app truncate">{thread.name}</p>
                          {thread.unread && !isSelected && (
                            <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-app-muted">
                          {new Date(thread.lastMessageAt).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-[11px] text-app-secondary truncate flex-1 mr-2">
                          {thread.lastMessage}
                        </p>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-elevated border border-app text-app-muted uppercase shrink-0">
                          {thread.role}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}

              {filteredCommunityThreads.length === 0 && (
                <div className="p-6 text-center text-xs text-app-muted">
                  No support tickets found.
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
                isStaff ? (
                  <>
                    <Avatar name={selectedCommunityUser?.name || 'User'} size="sm" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs sm:text-sm font-bold text-app">
                          {selectedCommunityUser ? selectedCommunityUser.name : 'Select user thread'}
                        </h3>
                        {selectedCommunityUser && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 uppercase">
                            {selectedCommunityUser.role}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-app-muted">
                        3-Party Desk • {selectedCommunityUser?.name || 'User'}, Admin & Moderator
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="p-1.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                      <Users className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-app">Community Support Desk</h3>
                      <p className="text-[11px] text-app-muted">Direct assistance between you and platform staff (Admin & Moderator)</p>
                    </div>
                  </>
                )
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
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-3.5 max-h-[460px] scrollbar-thin">
            {messages.map((msg) => {
              const isMe = msg.senderId === user?.id;
              const formattedTime = new Date(msg.createdAt).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              });

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe && activeTab !== 'AUDIT' ? 'items-end' : 'items-start'} space-y-1 group relative`}
                >
                  {/* Sender & Role Info (only on received messages, or in audit compliance) */}
                  {(!isMe || activeTab === 'AUDIT') && (
                    <div className="flex items-center gap-1.5 text-[11px] px-1 text-app-muted">
                      <span className="font-bold text-app">{msg.senderName}</span>
                      <span className="text-[10px] text-app-secondary font-medium tracking-wide uppercase">
                        {msg.senderRole}
                      </span>
                      {activeTab === 'AUDIT' && msg.recipientName && (
                        <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">
                          → {msg.recipientName} ({msg.recipientRole})
                        </span>
                      )}
                    </div>
                  )}

                  {/* Message Bubble Row with Hover Reply Action */}
                  <div className={`flex items-center gap-1.5 max-w-[85%] sm:max-w-md ${isMe && activeTab !== 'AUDIT' ? 'flex-row-reverse' : 'flex-row'}`}>
                    {/* Compact Bubble */}
                    <div
                      className={`px-3.5 py-2 rounded-2xl text-xs shadow-xs leading-relaxed flex-1 ${
                        isMe && activeTab !== 'AUDIT'
                          ? 'bg-blue-600 text-white rounded-tr-xs'
                          : 'bg-elevated border border-app text-app rounded-tl-xs'
                      }`}
                    >
                      {/* Quoted Reply Preview */}
                      {msg.replyTo && (
                        <div
                          className={`mb-1.5 pl-2.5 py-1 rounded text-[11px] border-l-2 ${
                            isMe && activeTab !== 'AUDIT'
                              ? 'bg-blue-700/50 border-blue-200 text-blue-100'
                              : 'bg-black/5 dark:bg-white/5 border-blue-500 text-app-secondary'
                          }`}
                        >
                          <span className="font-bold block text-[10px] uppercase tracking-wider">
                            {msg.replyTo.senderName}
                          </span>
                          <span className="line-clamp-1 opacity-80">{msg.replyTo.content}</span>
                        </div>
                      )}

                      {/* Attachment preview if present */}
                      {msg.fileUrl && (
                        <div className="mb-2">
                          {msg.fileType?.startsWith('image/') ? (
                            <a
                              href={msg.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block rounded-lg overflow-hidden border border-white/20 hover:opacity-95 transition-opacity"
                            >
                              <img
                                src={msg.fileUrl}
                                alt={msg.fileName || 'Attachment'}
                                className="max-h-60 w-full object-cover rounded-md"
                              />
                            </a>
                          ) : (
                            <a
                              href={msg.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={msg.fileName}
                              className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition-all ${
                                isMe && activeTab !== 'AUDIT'
                                  ? 'bg-blue-700/60 border-blue-400/30 text-white hover:bg-blue-700'
                                  : 'bg-surface dark:bg-dark-surface border-app text-app hover:border-brand-500/50'
                              }`}
                            >
                              <div className="p-2 rounded-md bg-black/10 dark:bg-white/10 shrink-0">
                                <FileText className="h-5 w-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-xs truncate">
                                  {msg.fileName || 'Document'}
                                </p>
                                <p className="text-[10px] opacity-75 font-mono">
                                  {formatFileSize(msg.fileSize)}
                                </p>
                              </div>
                              <Download className="h-4 w-4 shrink-0 opacity-80 hover:opacity-100" />
                            </a>
                          )}
                        </div>
                      )}

                      {/* Content & Inline Timestamp */}
                      <div className="flex items-end justify-between gap-3 flex-wrap">
                        {msg.content && (
                          <span className="whitespace-pre-wrap break-words text-xs leading-relaxed flex-1 min-w-[60px]">
                            {msg.content}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-mono shrink-0 ml-auto select-none ${
                            isMe && activeTab !== 'AUDIT' ? 'text-blue-200/90' : 'text-app-muted'
                          }`}
                        >
                          {formattedTime}
                          {isMe && activeTab !== 'AUDIT' && (
                            <CheckCheck className="h-3 w-3 inline text-blue-200" />
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Subtle Hover Reply Action Button */}
                    {activeTab !== 'AUDIT' && !(activeTab === 'ANNOUNCEMENT' && !isAdmin) && (
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingTo(msg);
                          inputRef.current?.focus();
                        }}
                        title="Reply to message"
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-app-muted hover:text-blue-500 hover:bg-elevated rounded-md shrink-0"
                      >
                        <CornerUpLeft className="h-3.5 w-3.5" />
                      </button>
                    )}
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
              <form onSubmit={handleSendMessage} className="space-y-2">
                {/* Replying To Banner */}
                {replyingTo && (
                  <div className="flex items-center justify-between px-3 py-1.5 rounded-btn bg-elevated border-l-2 border-blue-500 text-xs text-app animate-fade-in">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <CornerUpLeft className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      <span className="font-semibold text-app shrink-0">
                        Replying to {replyingTo.senderName}:
                      </span>
                      <span className="text-app-muted truncate">
                        {replyingTo.content || replyingTo.fileName || 'Attachment'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyingTo(null)}
                      className="p-1 hover:text-app text-app-muted transition-colors"
                      title="Cancel reply"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* File Attachment Staging Preview */}
                {selectedFile && (
                  <div className="flex items-center justify-between px-3 py-1.5 bg-elevated border border-brand-500/30 rounded-btn text-xs text-app animate-fade-in">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-brand-500 shrink-0" />
                      <span className="font-semibold truncate max-w-xs">{selectedFile.name}</span>
                      <span className="text-[10px] text-app-muted font-mono shrink-0">
                        ({formatFileSize(selectedFile.size)})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      className="p-1 hover:text-red-500 text-app-muted transition-colors"
                      title="Remove file"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setSelectedFile(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,image/*"
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach document, spreadsheet, PDF, or file"
                    className="h-10 w-10 flex items-center justify-center rounded-btn bg-elevated border border-app text-app-secondary hover:text-app hover:border-brand-500/50 transition-colors shrink-0"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>

                  <input
                    type="text"
                    ref={inputRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={
                      activeTab === 'ANNOUNCEMENT'
                        ? 'Broadcast a platform announcement to all users...'
                        : activeTab === 'DIRECT'
                        ? `Message ${selectedContact?.name || 'user'} directly...`
                        : isStaff
                        ? `Reply in ${selectedCommunityUser?.name || 'user'}'s support thread...`
                        : 'Message platform staff (Admin & Moderator) for support...'
                    }
                    className="flex-1 h-10 px-3.5 text-xs rounded-btn bg-elevated border border-app text-app focus:ring-1 focus:ring-blue-500"
                  />

                  <Button
                    type="submit"
                    size="sm"
                    disabled={(!content.trim() && !selectedFile) || sending}
                    isLoading={sending}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold shrink-0"
                    leftIcon={<Send className="h-3.5 w-3.5" />}
                  >
                    Send
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
