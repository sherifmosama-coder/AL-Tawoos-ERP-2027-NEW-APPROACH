import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRecordComments } from '../../context/CommentContext';
import {
  createCommentThread,
  addThreadReply,
  resolveCommentThread,
  reopenCommentThread,
  deleteCommentThread,
  resolveMessageTask,
  reopenMessageTask,
  isUserAuthorizedForTab,
  markThreadAsRead
} from '../../utils/commentEngine';
import AttachmentViewerModal from '../AttachmentViewerModal';
import {
  X,
  Send,
  CheckCircle,
  RotateCcw,
  Trash2,
  AtSign,
  AlertCircle,
  ShieldAlert,
  UserCheck,
  Clock,
  Sparkles,
  Paperclip,
  FileImage,
  FileText,
  Maximize2,
  Loader2,
  Bell,
  BellOff,
  UserPlus,
  Users,
  Search,
  Check,
  AlertTriangle
} from 'lucide-react';

/**
 * Client-side Canvas Image Compression helper.
 * Downscales images to max 1280px and compresses to WebP (<150KB base64).
 */
async function compressImageFile(file, maxDimension = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        let dataUrl = canvas.toDataURL('image/webp', quality);
        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        const approxKb = (dataUrl.length * (3 / 4) / 1024).toFixed(1);
        resolve({
          id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: file.name || `screenshot_${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.webp`,
          type: 'image/webp',
          size: `${approxKb} KB`,
          url: dataUrl,
          uploadedAt: new Date().toISOString()
        });
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Universal file processor for comment attachments.
 */
async function processFileForComment(file, isAr = false) {
  if (file.type && file.type.startsWith('image/')) {
    return await compressImageFile(file);
  }
  if (file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')) {
    if (file.size > 500 * 1024) {
      throw new Error(isAr ? 'حجم ملف PDF يتجاوز 500 كيلوبايت' : 'PDF size exceeds 500 KB limit');
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: file.name,
          type: 'application/pdf',
          size: `${(file.size / 1024).toFixed(1)} KB`,
          url: reader.result,
          uploadedAt: new Date().toISOString()
        });
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }
  throw new Error(isAr ? 'الملفات المدعومة هي الصور وملفات PDF فقط' : 'Supported formats are images and PDFs only');
}

export default function CommentThreadPopover() {
  const {
    popoverState,
    closeCommentPopover,
    getThread,
    currentUser,
    usersList = [],
    cloudPermissions = {}
  } = useRecordComments();

  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [messageText, setMessageText] = useState('');
  const [selectedMentions, setSelectedMentions] = useState([]);
  const [isActionRequired, setIsActionRequired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResolvingTask, setIsResolvingTask] = useState({}); // { [messageId]: boolean }
  const [errorMsg, setErrorMsg] = useState('');

  // Attachments State
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [hoveredAttachment, setHoveredAttachment] = useState(null);
  const [viewerAttachment, setViewerAttachment] = useState(null);

  // Mention autocomplete popover state
  const [mentionQuery, setMentionQuery] = useState(null); // string or null
  const [mentionCursorIndex, setMentionCursorIndex] = useState(0);

  // Target Audience & Routing State ("User +" feature)
  const [isAudienceOpen, setIsAudienceOpen] = useState(false);
  const [audienceSearch, setAudienceSearch] = useState('');
  const [customAudience, setCustomAudience] = useState({
    notifyUserIds: [],
    actionUserIds: []
  });

  const popoverRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const audiencePanelRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messageItemRefs = useRef({});
  const [firstUnreadIdOnOpen, setFirstUnreadIdOnOpen] = useState(null);
  const scrolledForThreadIdRef = useRef(null);

  const target = popoverState.target;
  const isOpen = popoverState.isOpen;

  // Retrieve existing live thread if present
  const thread = useMemo(() => {
    if (!target) return null;
    return getThread(target.docId, target.fieldKey);
  }, [target, getThread]);

  // Filter users permitted on active tab & record (Strict RBAC & Sensitive Access)
  const permittedUsers = useMemo(() => {
    if (!target?.tab) return usersList;
    return usersList.filter((u) => {
      if (!isUserAuthorizedForTab({
        user: u,
        targetModule: target.module,
        targetTab: target.tab,
        cloudPermissions
      })) {
        return false;
      }

      if (target.isSensitive) {
        const hasSensitiveAccess =
          u.isGeneralAdmin ||
          u.role === 'general_admin' ||
          u.canViewSensitiveCosts ||
          cloudPermissions[u.id]?.sensitive?.[target.fieldKey] === true ||
          cloudPermissions[u.id]?.sensitive?.all === true ||
          u.permissions?.sensitive?.[target.fieldKey] === true ||
          u.permissions?.sensitive?.all === true;
        if (!hasSensitiveAccess) return false;
      }

      return true;
    });
  }, [usersList, target?.module, target?.tab, target?.isSensitive, target?.fieldKey, cloudPermissions]);

  // Reset inputs when popover opens with new target
  useEffect(() => {
    if (isOpen) {
      setMessageText('');
      setSelectedMentions([]);
      setPendingAttachments([]);
      setIsActionRequired(false);
      setErrorMsg('');
      setMentionQuery(null);
      setHoveredAttachment(null);
      setViewerAttachment(null);
      setIsAudienceOpen(false);
      setAudienceSearch('');
      setIsResolvingTask({});

      // Default audience: all users who have access to the target record get Notify by default
      const defaultNotify = permittedUsers
        .map((u) => u.id)
        .filter((uid) => uid && uid !== currentUser?.id);

      setCustomAudience({
        notifyUserIds: defaultNotify,
        actionUserIds: []
      });

      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen, target?.docId, target?.fieldKey, permittedUsers, currentUser?.id]);

  // Accurately detect read/unread state and auto-scroll to first unread or bottom
  useEffect(() => {
    if (!isOpen || !thread?.id) {
      if (!isOpen) {
        setFirstUnreadIdOnOpen(null);
        scrolledForThreadIdRef.current = null;
      }
      return;
    }

    const messages = Array.isArray(thread.messages) ? thread.messages : [];
    if (messages.length === 0) return;

    // Only run the initial open scroll once per thread session
    if (scrolledForThreadIdRef.current === thread.id) return;
    scrolledForThreadIdRef.current = thread.id;

    // Accurately identify the first unread message for the current user
    const unreadMsg = messages.find(
      (m) => m && m.authorId !== currentUser?.id && (!Array.isArray(m.readBy) || !m.readBy.includes(currentUser?.id))
    );

    const targetId = unreadMsg?.id || null;
    setFirstUnreadIdOnOpen(targetId);

    // Auto-scroll to first unread message, or to the bottom if all messages are read
    const timer = setTimeout(() => {
      if (targetId && messageItemRefs.current[targetId]) {
        messageItemRefs.current[targetId].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } else if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    }, 150);

    // Mark thread messages as read in Firestore
    if (unreadMsg && currentUser?.id) {
      markThreadAsRead({ threadId: thread.id, userId: currentUser.id });
    }

    return () => clearTimeout(timer);
  }, [isOpen, thread?.id, currentUser?.id]);

  // Synchronize mentions and checkbox with custom audience
  useEffect(() => {
    if (!selectedMentions) return;
    const mentionedIds = selectedMentions.map((m) => m.id).filter(Boolean);

    setCustomAudience((prev) => {
      let nextAction = [...prev.actionUserIds];
      let nextNotify = [...prev.notifyUserIds];

      mentionedIds.forEach((uid) => {
        if (uid === currentUser?.id) return;
        if (isActionRequired) {
          if (!nextAction.includes(uid)) nextAction.push(uid);
          nextNotify = nextNotify.filter((id) => id !== uid);
        } else {
          if (!nextNotify.includes(uid)) nextNotify.push(uid);
          nextAction = nextAction.filter((id) => id !== uid);
        }
      });

      return { notifyUserIds: nextNotify, actionUserIds: nextAction };
    });
  }, [selectedMentions, isActionRequired, currentUser?.id]);

  // Close on Escape or Outside Click
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !viewerAttachment) {
        if (isAudienceOpen) {
          setIsAudienceOpen(false);
        } else {
          closeCommentPopover();
        }
      }
    };
    const handleClickOutside = (e) => {
      if (
        !viewerAttachment &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        !e.target.closest('#comment-context-menu') &&
        !e.target.closest('.group\\/commentable')
      ) {
        closeCommentPopover();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, closeCommentPopover, viewerAttachment, isAudienceOpen]);

  // Filter mention suggestions strictly from permitted users and exclude author
  const mentionSuggestions = useMemo(() => {
    if (!mentionQuery && mentionQuery !== '') return [];
    const q = mentionQuery.toLowerCase();
    return permittedUsers.filter((u) => {
      if (u.id === currentUser?.id) return false; // Exclude author from mention list
      const nameMatch = (u.name || '').toLowerCase().includes(q);
      const nameArMatch = (u.nameAr || '').toLowerCase().includes(q);
      const roleMatch = (u.role || '').toLowerCase().includes(q);
      return nameMatch || nameArMatch || roleMatch;
    });
  }, [permittedUsers, mentionQuery, currentUser?.id]);

  // Filter audience list by search query
  const filteredAudienceUsers = useMemo(() => {
    const q = audienceSearch.toLowerCase().trim();
    return permittedUsers.filter((u) => {
      if (u.id === currentUser?.id) return false; // Author never in audience
      if (!q) return true;
      const nameMatch = (u.name || '').toLowerCase().includes(q);
      const nameArMatch = (u.nameAr || '').toLowerCase().includes(q);
      const roleMatch = (u.role || '').toLowerCase().includes(q);
      return nameMatch || nameArMatch || roleMatch;
    });
  }, [permittedUsers, audienceSearch, currentUser?.id]);

  if (!isOpen || !target) return null;

  // Calculate dynamic floating position anchored to target with viewport boundary awareness
  const anchorRect = target.anchorRect;
  const winW = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const popoverWidth = Math.min(380, winW - 24);
  const popoverHeight = isAudienceOpen ? 520 : 390;

  let top = 100;
  let left = 20;

  if (anchorRect) {
    const spaceBelow = winH - anchorRect.bottom - 16;
    const spaceAbove = anchorRect.top - 16;

    if (spaceBelow >= popoverHeight) {
      top = anchorRect.bottom + 8;
    } else if (spaceAbove >= popoverHeight) {
      top = anchorRect.top - popoverHeight - 8;
    } else {
      top = Math.max(12, winH - popoverHeight - 16);
    }

    if (isAr) {
      left = anchorRect.right - popoverWidth;
    } else {
      left = anchorRect.left;
    }
  }

  // Strict boundary clamping so popover is never clipped on any edge
  top = Math.max(12, Math.min(top, winH - (isAudienceOpen ? 460 : 340) - 16));
  left = Math.max(12, Math.min(left, winW - popoverWidth - 12));

  // Handle textarea text changes & mention trigger
  const handleTextChange = (e) => {
    const text = e.target.value;
    setMessageText(text);

    const cursor = e.target.selectionStart;
    const textBeforeCursor = text.slice(0, cursor);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1 && (atIndex === 0 || /\s/.test(textBeforeCursor[atIndex - 1]))) {
      const query = textBeforeCursor.slice(atIndex + 1);
      if (!/\s/.test(query)) {
        setMentionQuery(query);
        setMentionCursorIndex(cursor);
        return;
      }
    }
    setMentionQuery(null);
  };

  const handleSelectMention = (user) => {
    const textBeforeCursor = messageText.slice(0, mentionCursorIndex);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    const textAfterCursor = messageText.slice(mentionCursorIndex);

    const mentionName = isAr ? (user.nameAr || user.name || user.id) : (user.name || user.nameAr || user.id);
    const newText = `${messageText.slice(0, atIndex)}@${mentionName} ${textAfterCursor}`;

    setMessageText(newText);
    setMentionQuery(null);

    // Track selected user for action required assignment
    if (!selectedMentions.some((m) => m.id === user.id)) {
      setSelectedMentions((prev) => [...prev, user]);
      setIsActionRequired(true);
    }

    textareaRef.current?.focus();
  };

  // Process and append files/images
  const handleProcessAndAddFiles = async (files) => {
    if (!files || files.length === 0) return;
    setIsProcessingFile(true);
    setErrorMsg('');
    try {
      const processed = [];
      for (const f of files) {
        const item = await processFileForComment(f, isAr);
        processed.push(item);
      }
      setPendingAttachments((prev) => [...prev, ...processed]);
    } catch (err) {
      setErrorMsg(err.message || (isAr ? 'فشل معالجة المرفق' : 'Failed to process attachment'));
    } finally {
      setIsProcessingFile(false);
    }
  };

  // Direct Clipboard Paste Listener (Ctrl+V / Cmd+V for screenshots)
  const handlePaste = async (e) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;
    const items = Array.from(clipboardData.items || []);
    const fileItems = items.filter((item) => item.kind === 'file');

    if (fileItems.length > 0) {
      e.preventDefault();
      const files = fileItems.map((item) => item.getAsFile()).filter(Boolean);
      if (files.length > 0) {
        await handleProcessAndAddFiles(files);
      }
    }
  };

  // Audience Dual-Toggle Handlers (Mutually Exclusive per user)
  const handleToggleNotify = (userId) => {
    setCustomAudience((prev) => {
      const isCurrentlyNotify = prev.notifyUserIds.includes(userId);
      const nextNotify = isCurrentlyNotify
        ? prev.notifyUserIds.filter((id) => id !== userId)
        : [...prev.notifyUserIds, userId];
      // Mutually exclusive: if turning notify ON, remove from actionUserIds
      const nextAction = isCurrentlyNotify ? prev.actionUserIds : prev.actionUserIds.filter((id) => id !== userId);
      return { notifyUserIds: nextNotify, actionUserIds: nextAction };
    });
  };

  const handleToggleAction = (userId) => {
    const userObj = permittedUsers.find((u) => u.id === userId);
    const mentionName = userObj ? (isAr ? (userObj.nameAr || userObj.name || userObj.id) : (userObj.name || userObj.nameAr || userObj.id)) : userId;
    const mentionTag = `@${mentionName}`;

    const isCurrentlyAction = customAudience.actionUserIds.includes(userId);
    const isAdding = !isCurrentlyAction;

    setCustomAudience((prev) => {
      const nextAction = isCurrentlyAction
        ? prev.actionUserIds.filter((id) => id !== userId)
        : [...prev.actionUserIds, userId];
      // Mutually exclusive: if turning action ON, remove from notifyUserIds
      const nextNotify = isCurrentlyAction ? prev.notifyUserIds : prev.notifyUserIds.filter((id) => id !== userId);
      return { notifyUserIds: nextNotify, actionUserIds: nextAction };
    });

    if (isAdding) {
      // 1. Add user to selectedMentions if not present
      if (userObj && !selectedMentions.some((m) => m.id === userId)) {
        setSelectedMentions((prev) => [...prev, userObj]);
      }
      setIsActionRequired(true);

      // 2. Include "@username" chip in messageText if not already present
      setMessageText((prev) => {
        if (!prev.includes(mentionTag)) {
          const trimmed = prev.trim();
          return trimmed ? `${trimmed} ${mentionTag} ` : `${mentionTag} `;
        }
        return prev;
      });
    } else {
      // Removing action: remove from mentions and clean up from message text
      setSelectedMentions((prev) => prev.filter((m) => m.id !== userId));
      setMessageText((prev) => {
        return prev.replace(new RegExp(`\\s*${mentionTag}\\s*`, 'g'), ' ').trim();
      });
    }
  };

  const handleSelectAllNotify = () => {
    const allAllowedIds = permittedUsers
      .map((u) => u.id)
      .filter((uid) => uid && uid !== currentUser?.id);
    setCustomAudience({
      notifyUserIds: allAllowedIds,
      actionUserIds: []
    });
  };

  const handleClearAllAudience = () => {
    setCustomAudience({
      notifyUserIds: [],
      actionUserIds: []
    });
  };

  // Submit comment (New Thread or Reply)
  const handleSubmit = async (e) => {
    e?.preventDefault();
    if ((!messageText.trim() && pendingAttachments.length === 0) || isSubmitting) return;

    // Enforce rule: at least 1 user must be notified or assigned as task taker
    const totalRecipients = customAudience.notifyUserIds.length + customAudience.actionUserIds.length;
    if (totalRecipients === 0) {
      setErrorMsg(isAr ? 'يجب تحديد مستخدم واحد على الأقل للإشعار أو تعيين مهمة' : 'At least 1 user must be notified or assigned as task taker');
      setIsAudienceOpen(true);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const effectiveActionRequired = Boolean(
        isActionRequired || customAudience.actionUserIds.length > 0
      );

      if (thread) {
        // Append reply
        await addThreadReply({
          threadId: thread.id,
          text: messageText || (pendingAttachments.length > 0 ? (isAr ? 'مرفق' : 'Attachment') : ''),
          mentions: selectedMentions,
          attachments: pendingAttachments,
          isActionRequired: effectiveActionRequired,
          assignedUsers: isActionRequired ? selectedMentions : [],
          customAudience,
          currentUser,
          allUsers: usersList,
          cloudPermissions
        });
      } else {
        // Create new thread at row/record level
        await createCommentThread({
          targetModule: target.module,
          targetTab: target.tab,
          targetDocId: target.docId,
          targetDocNumber: target.docNumber,
          targetFieldKey: null,
          targetFieldLabel: null,
          targetContextType: 'table_row',
          isSensitive: target.isSensitive,
          text: messageText || (pendingAttachments.length > 0 ? (isAr ? 'مرفق' : 'Attachment') : ''),
          mentions: selectedMentions,
          isActionRequired: effectiveActionRequired,
          assignedUsers: isActionRequired ? selectedMentions : [],
          attachments: pendingAttachments,
          customAudience,
          currentUser,
          allUsers: usersList,
          cloudPermissions
        });
      }

      setMessageText('');
      setSelectedMentions([]);
      setPendingAttachments([]);
      setIsActionRequired(false);
      setMentionQuery(null);
      setIsAudienceOpen(false);

      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } else if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      }, 100);
    } catch (err) {
      console.error('[CommentThread] Submit failed:', err);
      setErrorMsg(err.message || (isAr ? 'فشل حفظ التعليق' : 'Failed to save comment'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Moderation Handlers
  const handleResolve = async () => {
    if (!thread) return;
    setIsSubmitting(true);
    try {
      await resolveCommentThread({
        threadId: thread.id,
        currentUser
      });
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReopen = async () => {
    if (!thread) return;
    setIsSubmitting(true);
    try {
      await reopenCommentThread({
        threadId: thread.id,
        currentUser
      });
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteThread = async () => {
    if (!thread) return;
    const confirmDelete = window.confirm(
      isAr
        ? 'هل أنت متأكد من حذف هذه المحادثة بالكامل؟ لا يمكن التراجع عن هذا الإجراء.'
        : 'Are you sure you want to permanently delete this entire conversation? This action cannot be undone.'
    );
    if (!confirmDelete) return;

    setIsSubmitting(true);
    try {
      await deleteCommentThread({
        threadId: thread.id,
        currentUser
      });
      closeCommentPopover();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isAuthor = thread?.createdBy === currentUser?.id;
  const isAssignee = thread?.assignedUserIds?.includes(currentUser?.id);
  const isGeneralAdmin = currentUser?.isGeneralAdmin || currentUser?.role === 'general_admin';
  const canResolve = Boolean(thread && (isAuthor || isAssignee || isGeneralAdmin));
  const canDeleteThread = Boolean(thread && (isAuthor || isGeneralAdmin));

  // Moderation Handlers
  const handleResolveMessageTask = async (messageId) => {
    if (!thread?.id || !messageId) return;
    setIsResolvingTask((prev) => ({ ...prev, [messageId]: true }));
    setErrorMsg('');
    try {
      await resolveMessageTask({
        threadId: thread.id,
        messageId,
        currentUser
      });
    } catch (err) {
      console.error('[CommentThread] Failed to resolve message task:', err);
      setErrorMsg(err.message || (isAr ? 'فشل إنجاز المهمة' : 'Failed to complete task'));
    } finally {
      setIsResolvingTask((prev) => ({ ...prev, [messageId]: false }));
    }
  };

  const handleReopenMessageTask = async (messageId) => {
    if (!thread?.id || !messageId) return;
    setIsResolvingTask((prev) => ({ ...prev, [messageId]: true }));
    setErrorMsg('');
    try {
      await reopenMessageTask({
        threadId: thread.id,
        messageId,
        currentUser
      });
    } catch (err) {
      console.error('[CommentThread] Failed to reopen message task:', err);
      setErrorMsg(err.message || (isAr ? 'فشل إعادة فتح المهمة' : 'Failed to reopen task'));
    } finally {
      setIsResolvingTask((prev) => ({ ...prev, [messageId]: false }));
    }
  };

  // Highlight @mentions in message body (accurately matches full multi-word Arabic and English names)
  const renderMessageTextWithMentions = (text) => {
    if (!text) return null;

    // Collect all candidate full names from usersList, permittedUsers, thread messages & mentions
    const knownNamesSet = new Set();
    usersList.forEach((u) => {
      if (u.name) knownNamesSet.add(u.name.trim());
      if (u.nameAr) knownNamesSet.add(u.nameAr.trim());
      if (u.displayName) knownNamesSet.add(u.displayName.trim());
    });

    if (thread && Array.isArray(thread.messages)) {
      thread.messages.forEach((m) => {
        if (Array.isArray(m.mentions)) {
          m.mentions.forEach((men) => {
            if (men.name) knownNamesSet.add(men.name.trim());
            if (men.nameAr) knownNamesSet.add(men.nameAr.trim());
          });
        }
        if (Array.isArray(m.assignedUsers)) {
          m.assignedUsers.forEach((au) => {
            if (au.name) knownNamesSet.add(au.name.trim());
            if (au.nameAr) knownNamesSet.add(au.nameAr.trim());
          });
        }
      });
    }

    // Sort by length descending so longer composite names match before shorter substrings
    const sortedNames = Array.from(knownNamesSet)
      .filter((n) => n && n.length > 0)
      .sort((a, b) => b.length - a.length);

    const escapeRegex = (s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

    let mentionPattern;
    if (sortedNames.length > 0) {
      const namesPattern = sortedNames.map(escapeRegex).join('|');
      mentionPattern = new RegExp(`(@(?:${namesPattern}|[^\\s@]+))`, 'gi');
    } else {
      mentionPattern = /(@[^\s@]+)/g;
    }

    const parts = text.split(mentionPattern);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return (
          <span
            key={i}
            className="inline-block px-1.5 py-0.5 mx-0.5 rounded-md font-bold text-amber-900 bg-amber-100 border border-amber-300 text-[11px]"
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  // Render prominent task assignment chips and message-level resolution actions
  const renderMessageTaskChips = (msg) => {
    let assignedList = [];
    if (Array.isArray(msg.assignedUsers) && msg.assignedUsers.length > 0) {
      assignedList = msg.assignedUsers;
    } else if (Array.isArray(msg.assignedUserIds) && msg.assignedUserIds.length > 0) {
      assignedList = msg.assignedUserIds.map((uid) => {
        const u = usersList.find((usr) => usr.id === uid);
        return {
          id: uid,
          name: u?.name || uid,
          nameAr: u?.nameAr || null
        };
      });
    } else if (msg.isActionRequired && Array.isArray(msg.mentions) && msg.mentions.length > 0) {
      assignedList = msg.mentions;
    }

    if (assignedList.length === 0 && !msg.isResolved) return null;

    const isTaskResolved = Boolean(msg.isResolved);
    const assignedIds = assignedList.map((u) => u.id);
    const isAssignedToMe = Boolean(currentUser?.id && assignedIds.includes(currentUser.id));
    const isMsgAuthor = msg.authorId === currentUser?.id;
    const isThreadAuthor = thread?.createdBy === currentUser?.id;
    const canManageThisTask = isAssignedToMe || isMsgAuthor || isThreadAuthor || isGeneralAdmin;

    if (isTaskResolved) {
      return (
        <div className="ps-6 pt-1 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs">
            <CheckCircle className="h-3 w-3 text-emerald-600 shrink-0" />
            <span>
              {isAr
                ? `تم إنجاز المهمة بواسطة ${msg.resolvedByNameAr || msg.resolvedByName || 'المستخدم'}`
                : `Task marked done by ${msg.resolvedByName || 'User'}`}
            </span>
            {msg.resolvedAt && (
              <span className="text-[9px] text-emerald-700/80 font-mono">
                ({new Date(msg.resolvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
              </span>
            )}
          </span>

          {canManageThisTask && (
            <button
              type="button"
              onClick={() => handleReopenMessageTask(msg.id)}
              disabled={isResolvingTask[msg.id]}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
              title={isAr ? 'إعادة فتح المهمة' : 'Reopen task'}
            >
              <RotateCcw className="h-2.5 w-2.5" />
              <span>{isAr ? 'إعادة فتح' : 'Reopen'}</span>
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="ps-6 pt-1 flex flex-wrap gap-1.5 items-center">
        {assignedList.map((usr) => {
          const isMe = usr.id === currentUser?.id;
          const displayName = isAr ? (usr.nameAr || usr.name || usr.id) : (usr.name || usr.nameAr || usr.id);

          return (
            <span
              key={usr.id}
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-2xs transition-all ${
                isMe
                  ? 'bg-amber-500 text-white shadow-sm ring-2 ring-amber-300 animate-pulse'
                  : 'bg-amber-50 text-amber-900 border border-amber-300'
              }`}
            >
              <AlertCircle className={`h-3 w-3 shrink-0 ${isMe ? 'text-white' : 'text-amber-600'}`} />
              <span>
                {isMe
                  ? (isAr ? 'مهمة مسندة إليك أنت' : 'Task assigned to YOU')
                  : (isAr ? 'مهمة مسندة إلى:' : 'Task assigned to:')}
              </span>
              <span className={`px-1.5 py-0.2 rounded font-extrabold ${isMe ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-950'}`}>
                @{displayName}
              </span>
            </span>
          );
        })}

        {/* Message-level "Mark as Done" button for assigned user / admin */}
        {canManageThisTask && (
          <button
            type="button"
            onClick={() => handleResolveMessageTask(msg.id)}
            disabled={isResolvingTask[msg.id]}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs hover:shadow transition cursor-pointer active:scale-95"
            title={isAr ? 'تأكيد: تم إنجاز المهمة' : 'Complete this task'}
          >
            {isResolvingTask[msg.id] ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            <span>{isAr ? 'تم إنجاز المهمة' : 'Mark as Done'}</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <div
        ref={popoverRef}
        style={{ top: `${top}px`, left: `${left}px` }}
        className={`fixed z-9999 w-[380px] max-w-[95vw] max-h-[calc(100vh-24px)] overflow-y-auto bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-150 select-none text-xs ${
          isAr ? 'text-right' : 'text-left'
        } ${viewerAttachment ? 'opacity-0 pointer-events-none' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Header & Target Breadcrumbs */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2 rounded-t-3xl shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-slate-800 truncate max-w-[230px]">
                {target.docNumber || target.docId}
              </span>
              {target.isSensitive && (
                <span className="inline-flex items-center gap-1 text-[9px] bg-amber-50 text-amber-700 font-bold px-1.5 py-0.5 rounded-md">
                  <ShieldAlert className="h-2.5 w-2.5" />
                  {isAr ? 'حساس' : 'Sensitive'}
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">
              {isAr ? 'ملاحظات وتعليقات السجل' : 'Record Comments & Tasks'}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {thread?.status === 'resolved' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                <CheckCircle className="h-3 w-3 text-slate-500" />
                {isAr ? 'مكتمل' : 'Resolved'}
              </span>
            ) : thread?.isActionRequired ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 animate-pulse">
                <AlertCircle className="h-3 w-3 text-amber-600" />
                {isAr ? 'مهمة مطلوبة' : 'Action Required'}
              </span>
            ) : thread ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                <Sparkles className="h-3 w-3 text-emerald-600" />
                {isAr ? 'نشط' : 'Active'}
              </span>
            ) : null}

            <button
              type="button"
              onClick={closeCommentPopover}
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition cursor-pointer"
              title={isAr ? 'إغلاق' : 'Close'}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 2. Messages Stream */}
        <div
          ref={messagesContainerRef}
          className="flex-1 p-4 max-h-[250px] overflow-y-auto space-y-3.5 bg-white scroll-smooth"
        >
          {thread ? (
            <>
              {(Array.isArray(thread.messages) ? thread.messages : []).map((msg, idx) => {
                const isFirstUnread = firstUnreadIdOnOpen && msg.id === firstUnreadIdOnOpen;

                return (
                  <React.Fragment key={msg.id || idx}>
                    {/* Visual Divider indicating the start of unread messages */}
                    {isFirstUnread && (
                      <div className="flex items-center gap-2 my-2 py-0.5">
                        <div className="flex-1 h-px bg-red-300" />
                        <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-200 shadow-2xs">
                          {isAr ? 'رسائل جديدة غير مقروءة' : 'New unread messages'}
                        </span>
                        <div className="flex-1 h-px bg-red-300" />
                      </div>
                    )}

                    <div
                      ref={(el) => {
                        if (msg.id) messageItemRefs.current[msg.id] = el;
                      }}
                      className={`space-y-1 transition-colors ${
                        isFirstUnread
                          ? 'bg-red-50/50 p-2 rounded-xl border border-red-200/60 shadow-2xs'
                          : ''
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px]">
                        {(msg.authorName || 'U').charAt(0).toUpperCase()}
                      </span>
                      <span>{isAr ? (msg.authorNameAr || msg.authorName || 'User') : (msg.authorName || 'User')}</span>
                      {msg.authorRole && (
                        <span className="text-[9px] font-normal text-slate-400">({msg.authorRole})</span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                      <Clock className="h-2.5 w-2.5" />
                      {msg.createdAt
                        ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : ''}
                    </span>
                  </div>

                  {msg.text && (
                    <div
                      dir="auto"
                      className="ps-6 text-xs text-slate-700 leading-relaxed font-normal whitespace-pre-wrap break-words"
                    >
                      {renderMessageTextWithMentions(msg.text)}
                    </div>
                  )}

                  {/* Task Assignment Chips on the message */}
                  {renderMessageTaskChips(msg)}

                  {/* Attachment Icons & Hover Preview */}
                  {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                    <div className="ps-6 pt-1 flex flex-wrap gap-1.5">
                      {msg.attachments.map((att) => {
                        const isImg = att.type?.startsWith('image/') || att.url?.startsWith('data:image/');
                        const isHovered = hoveredAttachment?.id === att.id;

                        return (
                          <div
                            key={att.id}
                            className="relative inline-block"
                            onMouseEnter={() => setHoveredAttachment(att)}
                            onMouseLeave={() => setHoveredAttachment(null)}
                          >
                            <button
                              type="button"
                              onClick={() => setViewerAttachment(att)}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-[10px] text-slate-700 transition cursor-pointer group/att shadow-2xs"
                              title={isAr ? 'انقر للمعاينة بملء الشاشة' : 'Click to preview fullscreen'}
                            >
                              {isImg ? (
                                <FileImage className="h-3.5 w-3.5 text-blue-500 group-hover/att:scale-110 transition shrink-0" />
                              ) : (
                                <FileText className="h-3.5 w-3.5 text-rose-500 group-hover/att:scale-110 transition shrink-0" />
                              )}
                              <span className="truncate max-w-[110px] font-medium" title={att.name}>
                                {att.name}
                              </span>
                              <span className="text-[9px] text-slate-400 font-mono">({att.size})</span>
                              <Maximize2 className="h-2.5 w-2.5 text-slate-400 opacity-0 group-hover/att:opacity-100 transition" />
                            </button>

                            {/* Hover Large High-Res Thumbnail Preview */}
                            {isHovered && (
                              <div
                                className={`absolute bottom-full mb-2 z-9999 p-2 bg-slate-900/95 text-white rounded-2xl shadow-2xl border border-slate-700/80 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 pointer-events-none ${
                                  isAr ? 'right-0' : 'left-0'
                                } w-64 max-w-[85vw]`}
                              >
                                {isImg ? (
                                  <div className="space-y-1.5">
                                    <img
                                      src={att.url}
                                      alt={att.name}
                                      className="w-full max-h-44 object-contain rounded-xl bg-slate-950/80 border border-slate-800"
                                    />
                                    <div className="flex items-center justify-between text-[10px] text-slate-300 px-0.5">
                                      <span className="truncate max-w-[150px] font-medium">{att.name}</span>
                                      <span className="text-[9px] text-slate-400 font-mono">{att.size}</span>
                                    </div>
                                    <div className="text-[9px] text-emerald-400 font-semibold text-center pt-0.5">
                                      {isAr ? 'انقر لفتح الصورة بملء الشاشة' : 'Click to open in fullscreen'}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="p-3 text-center space-y-1.5">
                                    <FileText className="h-8 w-8 text-rose-400 mx-auto" />
                                    <div className="text-[11px] font-bold text-white truncate">{att.name}</div>
                                    <div className="text-[9px] text-slate-400 font-mono">{att.size}</div>
                                    <div className="text-[9px] text-emerald-400 font-medium">
                                      {isAr ? 'انقر لفتح ملف PDF بملء الشاشة' : 'Click to view PDF in fullscreen'}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                    </div>
                  </React.Fragment>
                );
              })}

              {/* Resolved Notification Banner */}
              {thread.status === 'resolved' && (
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 flex items-center justify-between text-[11px] mt-2">
                  <span className="flex items-center gap-1.5 font-medium">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    {isAr
                      ? `تم حل التعليق بواسطة ${thread.resolvedByName || 'المستخدم'}`
                      : `Resolved by ${thread.resolvedByName || 'User'}`}
                  </span>
                  {canResolve && (
                    <button
                      type="button"
                      onClick={handleReopen}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {isAr ? 'إعادة فتح' : 'Re-open'}
                    </button>
                  )}
                </div>
              )}

              {/* Bottom scroll anchor */}
              <div ref={messagesEndRef} className="h-0 w-0" />
            </>
          ) : (
            <div className="py-6 text-center text-slate-400 space-y-1">
              <AtSign className="h-6 w-6 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-600">
                {isAr ? 'لا توجد تعليقات سابقة على هذا الحقل' : 'No comments yet on this target'}
              </p>
              <p className="text-[11px]">
                {isAr
                  ? 'أضف تعليقك أدناه، واستخدم @ للإشارة، أو الصق لقطات الشاشة مباشرة (Ctrl+V).'
                  : 'Add your comment below, use @ to mention, or paste screenshots directly (Ctrl+V).'}
              </p>
            </div>
          )}
        </div>

        {/* 3. Error Alert */}
        {errorMsg && (
          <div className="px-4 py-1.5 bg-red-50 text-red-700 text-[11px] font-semibold border-t border-red-100 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 4. Mention Autocomplete Dropdown (Filtered strictly to permitted tab users) */}
        {mentionQuery !== null && mentionSuggestions.length > 0 && (
          <div className="mx-3 mb-1 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden max-h-36 overflow-y-auto">
            <div className="px-2.5 py-1 text-[9px] font-bold text-slate-400 bg-slate-50 border-b border-slate-100">
              {isAr ? 'أعضاء مصرح لهم بهذه الشاشة للإشارة والتعيين:' : 'Authorized tab users to mention & assign:'}
            </div>
            {mentionSuggestions.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => handleSelectMention(user)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition cursor-pointer text-start"
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-bold flex items-center justify-center text-[10px]">
                    {(user.name || 'U').charAt(0)}
                  </span>
                  <span className="font-semibold">{isAr ? (user.nameAr || user.name) : (user.name || user.nameAr)}</span>
                </div>
                <span className="text-[10px] text-slate-400">{user.role || 'user'}</span>
              </button>
            ))}
          </div>
        )}

        {/* 5. Target Audience Floating Customizer Panel ("User +" Dropdown) */}
        {isAudienceOpen && (
          <div
            ref={audiencePanelRef}
            className="mx-3 mb-1 bg-white border border-emerald-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 z-50 flex flex-col"
          >
            {/* Panel Header */}
            <div className="px-3 py-2 bg-emerald-50/80 border-b border-emerald-100 flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-emerald-950 text-xs">
                <Users className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                <span>{isAr ? 'تخصيص الجمهور والمستهدفين' : 'Customize Audience & Actions'}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleSelectAllNotify}
                  className="px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 hover:bg-emerald-100 rounded-md transition cursor-pointer"
                  title={isAr ? 'تحديد الكل للإشعار' : 'All Notify'}
                >
                  {isAr ? 'الكل إشعار' : 'All Notify'}
                </button>
                <button
                  type="button"
                  onClick={handleClearAllAudience}
                  className="px-1.5 py-0.5 text-[9px] font-medium text-slate-500 hover:bg-slate-200 rounded-md transition cursor-pointer"
                  title={isAr ? 'إلغاء تحديد الجميع' : 'Clear All'}
                >
                  {isAr ? 'مسح' : 'Clear'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsAudienceOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-md transition cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Audience Search Input */}
            <div className="p-2 border-b border-slate-100 bg-slate-50/50">
              <div className="relative">
                <Search className="absolute start-2.5 top-2 h-3 w-3 text-slate-400" />
                <input
                  type="text"
                  value={audienceSearch}
                  onChange={(e) => setAudienceSearch(e.target.value)}
                  placeholder={isAr ? 'البحث في أعضاء الشاشة...' : 'Search tab users...'}
                  className="w-full ps-7 pe-2.5 py-1 bg-white border border-slate-200 rounded-xl text-[11px] text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Permitted Users List with Dual Toggle Buttons */}
            <div className="max-h-44 overflow-y-auto p-2 space-y-1.5 bg-white">
              {filteredAudienceUsers.length > 0 ? (
                filteredAudienceUsers.map((user) => {
                  const isNotify = customAudience.notifyUserIds.includes(user.id);
                  const isAction = customAudience.actionUserIds.includes(user.id);

                  return (
                    <div
                      key={user.id}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200 transition"
                    >
                      <div className="flex items-center gap-2 min-w-0 me-2">
                        <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                          {(user.name || 'U').charAt(0)}
                        </span>
                        <div className="truncate">
                          <div className="font-semibold text-slate-800 text-xs truncate">
                            {isAr ? (user.nameAr || user.name) : (user.name || user.nameAr)}
                          </div>
                          <div className="text-[9px] text-slate-400 truncate">
                            {user.role || 'user'}
                          </div>
                        </div>
                      </div>

                      {/* Dual Toggle Action Buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* 1. Notify Toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleNotify(user.id)}
                          className={`
                            px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition cursor-pointer border
                            ${
                              isNotify
                                ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-2xs'
                                : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:bg-slate-100'
                            }
                          `}
                          title={isAr ? 'إرسال إشعار عادي' : 'Send regular notification'}
                        >
                          {isNotify ? (
                            <Bell className="h-3 w-3 fill-blue-500 text-blue-600 shrink-0" />
                          ) : (
                            <BellOff className="h-3 w-3 shrink-0" />
                          )}
                          <span>{isAr ? 'إشعار' : 'Notify'}</span>
                        </button>

                        {/* 2. Action Required / Task Toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleAction(user.id)}
                          className={`
                            px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition cursor-pointer border
                            ${
                              isAction
                                ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-2xs animate-pulse'
                                : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:bg-slate-100'
                            }
                          `}
                          title={isAr ? 'تكليف بمهمة مطلوبة (Action Required)' : 'Assign as Action Required task'}
                        >
                          <AlertCircle
                            className={`h-3 w-3 shrink-0 ${isAction ? 'text-amber-600 fill-amber-200' : ''}`}
                          />
                          <span>{isAr ? 'مهمة' : 'Task'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-3 text-center text-slate-400 text-[11px]">
                  {isAr ? 'لا يوجد أعضاء مطابقين للبحث' : 'No matching users found'}
                </div>
              )}
            </div>

            {/* Legend Footer */}
            <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Bell className="h-2.5 w-2.5 text-blue-600 inline" />
                <span>{isAr ? 'إشعار فقط' : 'Notification'}</span>
              </span>
              <span className="flex items-center gap-1 font-semibold text-amber-800">
                <AlertCircle className="h-2.5 w-2.5 text-amber-600 inline" />
                <span>{isAr ? 'مهمة مطلوبة (حصرياً)' : 'Action Task (Exclusive)'}</span>
              </span>
            </div>
          </div>
        )}

        {/* 6. Composer & Action Required Box */}
        <form onSubmit={handleSubmit} className="p-3 bg-slate-50 border-t border-slate-100 space-y-2 rounded-b-3xl">
          <textarea
            ref={textareaRef}
            dir="auto"
            value={messageText}
            onChange={handleTextChange}
            onPaste={handlePaste}
            placeholder={
              thread
                ? (isAr ? 'اكتب ردك... (استخدم @ للإشارة، أو الصق لقطة الشاشة)' : 'Write a reply... (use @ to mention, or paste screenshot)')
                : (isAr ? 'اكتب تعليقك... (استخدم @ للإشارة، أو الصق لقطة الشاشة)' : 'Write a comment... (use @ to mention, or paste screenshot)')
            }
            rows={2}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
          />

          {/* Pending Draft Attachments List */}
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-1">
              {pendingAttachments.map((att) => (
                <div
                  key={att.id}
                  className="inline-flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] text-slate-700 shadow-2xs"
                >
                  {att.type?.startsWith('image/') ? (
                    <FileImage className="h-3 w-3 text-blue-500 shrink-0" />
                  ) : (
                    <FileText className="h-3 w-3 text-rose-500 shrink-0" />
                  )}
                  <span className="truncate max-w-[110px]" title={att.name}>
                    {att.name}
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">({att.size})</span>
                  <button
                    type="button"
                    onClick={() => setPendingAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                    className="text-slate-400 hover:text-red-600 transition cursor-pointer"
                    title={isAr ? 'إزالة' : 'Remove'}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Action Required Checkbox (when user is mentioned) */}
          {selectedMentions.length > 0 && (
            <label className="flex items-center gap-2 px-1 text-[11px] font-bold text-amber-900 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isActionRequired}
                onChange={(e) => setIsActionRequired(e.target.checked)}
                className="rounded text-amber-600 focus:ring-amber-500 h-3.5 w-3.5"
              />
              <span className="flex items-center gap-1">
                <UserCheck className="h-3 w-3 text-amber-600" />
                {isAr
                  ? `تعيين كإجراء مطلوب (Action Required) إلى: ${selectedMentions.map((m) => m.nameAr || m.name).join(', ')}`
                  : `Assign as Action Required task to: ${selectedMentions.map((m) => m.name || m.nameAr).join(', ')}`}
              </span>
            </label>
          )}

          {/* Footer Controls */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1">
              {/* File / Image Attachment Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingFile || isSubmitting}
                className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition cursor-pointer"
                title={isAr ? 'إرفاق صورة أو مستند (أو الصق لقطة الشاشة مباشرة)' : 'Attach image or PDF (or paste screenshot directly)'}
              >
                {isProcessingFile ? (
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleProcessAndAddFiles(Array.from(e.target.files));
                    e.target.value = '';
                  }
                }}
              />

              {/* Target Audience Customization Button ("User +") with Dynamic Status Chips */}
              <div className="inline-flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsAudienceOpen(!isAudienceOpen)}
                  className={`p-1.5 rounded-xl transition cursor-pointer relative shrink-0 ${
                    isAudienceOpen || customAudience.actionUserIds.length > 0
                      ? 'text-emerald-700 bg-emerald-100/70 border border-emerald-300'
                      : 'text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 border border-transparent'
                  }`}
                  title={isAr ? 'تخصيص الجمهور المستهدف والإجراءات المطلوبة' : 'Customize target audience & action takers'}
                >
                  <UserPlus className="h-4 w-4" />
                  {customAudience.actionUserIds.length > 0 && (
                    <span className="absolute -top-1 -end-1 w-2.5 h-2.5 bg-amber-500 rounded-full ring-2 ring-white animate-pulse" />
                  )}
                </button>

                {/* 1. Notify Chip */}
                {customAudience.notifyUserIds.length > 0 && (() => {
                  const count = customAudience.notifyUserIds.length;
                  const singleUser = count === 1 ? permittedUsers.find((u) => u.id === customAudience.notifyUserIds[0]) : null;
                  const singleName = singleUser ? (isAr ? (singleUser.nameAr || singleUser.name) : (singleUser.name || singleUser.nameAr)) : '';
                  return (
                    <button
                      type="button"
                      onClick={() => setIsAudienceOpen(true)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition cursor-pointer max-w-[120px] truncate"
                      title={isAr ? `إشعار (${count}) - انقر للتعديل` : `Notify (${count}) - Click to customize`}
                    >
                      <Bell className="h-2.5 w-2.5 shrink-0 text-blue-600" />
                      <span className="truncate">{count === 1 ? singleName : count}</span>
                    </button>
                  );
                })()}

                {/* 2. Action Required Chip */}
                {customAudience.actionUserIds.length > 0 && (() => {
                  const count = customAudience.actionUserIds.length;
                  const singleUser = count === 1 ? permittedUsers.find((u) => u.id === customAudience.actionUserIds[0]) : null;
                  const singleName = singleUser ? (isAr ? (singleUser.nameAr || singleUser.name) : (singleUser.name || singleUser.nameAr)) : '';
                  return (
                    <button
                      type="button"
                      onClick={() => setIsAudienceOpen(true)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 transition cursor-pointer max-w-[120px] truncate animate-pulse"
                      title={isAr ? `مهمة وإجراء مطلوب (${count}) - انقر للتعديل` : `Action Required (${count}) - Click to customize`}
                    >
                      <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-amber-600" />
                      <span className="truncate">{count === 1 ? singleName : count}</span>
                    </button>
                  );
                })()}
              </div>

              {/* Mark as Resolved button */}
              {thread && thread.status !== 'resolved' && canResolve && (
                <button
                  type="button"
                  onClick={handleResolve}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-200/80 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800 font-bold text-[10px] transition cursor-pointer"
                  title={isAr ? 'حل واكتمال المحادثة' : 'Mark conversation as resolved'}
                >
                  <CheckCircle className="h-3 w-3 text-emerald-600" />
                  <span>{isAr ? 'حل المحادثة' : 'Resolve'}</span>
                </button>
              )}

              {/* Delete entire thread (Author or General Admin only) */}
              {canDeleteThread && (
                <button
                  type="button"
                  onClick={handleDeleteThread}
                  disabled={isSubmitting}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                  title={isAr ? 'حذف المحادثة بالكامل (للمنشئ أو المشرف العام)' : 'Delete thread (Author or Admin only)'}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={
                (!messageText.trim() && pendingAttachments.length === 0) ||
                isSubmitting ||
                isProcessingFile ||
                (customAudience.notifyUserIds.length === 0 && customAudience.actionUserIds.length === 0)
              }
              className={`
                inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs text-white transition cursor-pointer shrink-0
                ${
                  (!messageText.trim() && pendingAttachments.length === 0) ||
                  isSubmitting ||
                  isProcessingFile ||
                  (customAudience.notifyUserIds.length === 0 && customAudience.actionUserIds.length === 0)
                    ? 'bg-slate-300 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-sm'
                }
              `}
              title={
                customAudience.notifyUserIds.length === 0 && customAudience.actionUserIds.length === 0
                  ? (isAr ? 'يجب تحديد مستخدم واحد على الأقل للإشعار أو تعيين مهمة' : 'Select at least 1 recipient')
                  : ''
              }
            >
              <Send className="h-3 w-3 rtl:rotate-180" />
              <span>{isSubmitting ? (isAr ? 'جاري الإرسال...' : 'Sending...') : (isAr ? 'إرسال' : 'Send')}</span>
            </button>
          </div>
        </form>
      </div>

      {/* 7. Fullscreen Attachment Lightbox Modal */}
      <AttachmentViewerModal
        attachment={viewerAttachment}
        isOpen={Boolean(viewerAttachment)}
        onClose={() => setViewerAttachment(null)}
      />
    </>
  );
}
