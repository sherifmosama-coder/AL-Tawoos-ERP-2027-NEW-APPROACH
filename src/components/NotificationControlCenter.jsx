import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import {
  Bell,
  BellRing,
  Smartphone,
  Laptop,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Shield,
  Volume2,
  Vibrate,
  Sliders,
  Radio,
  Layers,
  Key,
  Database,
  ExternalLink,
  ClipboardCheck,
  Info
} from 'lucide-react';
import {
  ONESIGNAL_APP_ID,
  ONESIGNAL_REST_API_KEY,
  isOneSignalConfigured,
  detectDeviceName,
  getOneSignalDeviceSubscription,
  optInOneSignalPush,
  syncOneSignalUser,
  syncOneSignalDevicesWithFirestore,
  requestOneSignalPermission,
  sendOneSignalPush
} from '../utils/oneSignalEngine';
import {
  playNotificationSound,
  createActionRequired,
  reconcilePendingActions
} from '../utils/notificationEngine';

export default function NotificationControlCenter({ currentUser }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [usersList, setUsersList] = useState([]);
  const [currentDeviceSub, setCurrentDeviceSub] = useState(null);
  const [devicePermission, setDevicePermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [subscribeMessage, setSubscribeMessage] = useState(null);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [cloudSyncResult, setCloudSyncResult] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [lastResponse, setLastResponse] = useState(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState(null);

  // Custom Push Form State
  const [targetMode, setTargetMode] = useState('user'); // 'user' | 'direct_sub' | 'role' | 'broadcast'
  const [selectedUserId, setSelectedUserId] = useState('');
  const [customSubscriptionId, setCustomSubscriptionId] = useState('');
  const [selectedRole, setSelectedRole] = useState('general_admin');
  const [customTitleAr, setCustomTitleAr] = useState('إجراء واعتماد مطلوب | الطاووس ERP');
  const [customTitleEn, setCustomTitleEn] = useState('Action & Approval Required | Tawoos ERP');
  const [customMessageAr, setCustomMessageAr] = useState('مطلوب فحص واستلام باليتات منتج تام بمستودع المنتج التام: TRN-2026-TEST');
  const [customMessageEn, setCustomMessageEn] = useState('FG Inward pallet receipt verification required: TRN-2026-TEST');
  const [customTargetTab, setCustomTargetTab] = useState('fg_inward');
  const [notificationPreset, setNotificationPreset] = useState('fg_inward');

  // General Notification Policy & App Settings State
  const [generalConfig, setGeneralConfig] = useState({
    soundEnabled: true,
    vibrationEnabled: true,
    pushGatewayActive: true,
    actionAutoExpireHours: 48,
    notificationRetentionDays: 30
  });
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configSaveSuccess, setConfigSaveSuccess] = useState(false);

  // 1. Live Firestore Users Subscription Listener
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setUsersList(list);
      setSelectedUserId((prev) => {
        if (prev && list.some((u) => u.id === prev)) return prev;
        const withDevice = list.find((u) => u.onesignalSubscriptionId);
        const currentInList = list.find((u) => u.id === currentUser?.id);
        return withDevice?.id || currentInList?.id || list[0]?.id || '';
      });
    });

    // Detect current device status
    getOneSignalDeviceSubscription().then((sub) => {
      setCurrentDeviceSub(sub);
      if (sub?.permission) setDevicePermission('granted');
    });

    // 2. Subscribe to general system notification configuration
    const unsubConfig = onSnapshot(doc(db, 'system_config', 'notifications_config'), (snap) => {
      if (snap.exists()) {
        setGeneralConfig((prev) => ({ ...prev, ...snap.data() }));
      }
    });

    return () => {
      unsub();
      unsubConfig();
    };
  }, []);

  const handleSaveGeneralConfig = async () => {
    setIsSavingConfig(true);
    try {
      await setDoc(
        doc(db, 'system_config', 'notifications_config'),
        {
          ...generalConfig,
          updatedAt: serverTimestamp(),
          updatedBy: currentUser?.id || 'admin'
        },
        { merge: true }
      );
      setConfigSaveSuccess(true);
      setTimeout(() => setConfigSaveSuccess(false), 3000);
    } catch (e) {
      alert(`Error saving configuration: ${e.message}`);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const currentDeviceName = useMemo(() => detectDeviceName(), []);

  const copyToClipboard = (text, keyName) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Preset Selection Handler
  const handleSelectPreset = (preset) => {
    setNotificationPreset(preset);
    if (preset === 'fg_inward') {
      setCustomTitleAr('مطلوب فحص واستلام منتج تام');
      setCustomTitleEn('FG Inward Pallets Receipt Required');
      setCustomMessageAr('ترحيل بالتات منتج تام إلى مستودع المنتجات التامة برقم TRN-2026-TEST');
      setCustomMessageEn('Finished Goods pallet transfer TRN-2026-TEST waiting for custodian receipt');
      setCustomTargetTab('fg_inward');
      setSelectedRole('finished_goods_custodian');
    } else if (preset === 'po_approval') {
      setCustomTitleAr('مطلوب اعتماد أمر شراء (PO)');
      setCustomTitleEn('Purchase Order Approval Required');
      setCustomMessageAr('أمر شراء جديد PO-2026-TEST بقيمة 45,000 ج.م بانتظار اعتمادك');
      setCustomMessageEn('New purchase order PO-2026-TEST waiting for executive approval');
      setCustomTargetTab('orders');
      setSelectedRole('purchasing_manager');
    } else if (preset === 'stock_transfer') {
      setCustomTitleAr('مطلوب اعتماد تحويل مخزني (TRN)');
      setCustomTitleEn('Stock Transfer Approval Required');
      setCustomMessageAr('طلب صرف وتغذية صالة الإنتاج بخامات التشغيل TRN-2026-TEST');
      setCustomMessageEn('Floor materials feeding transfer TRN-2026-TEST waiting for storekeeper issue');
      setCustomTargetTab('transfers');
      setSelectedRole('warehouse_keeper');
    } else if (preset === 'system_info') {
      setCustomTitleAr('إشعار عام من إدارة النظام');
      setCustomTitleEn('System Announcement from Admin');
      setCustomMessageAr('تم تحديث منظومة الإشعارات والربط الفوري مع أجهزة الهاتف بنجاح ✓');
      setCustomMessageEn('Live mobile notifications engine updated and verified successfully ✓');
      setCustomTargetTab('landing');
      setTargetMode('broadcast');
    }
  };

  // Dispatch Test Push
  const handleDispatchPush = async (overrideTarget = null) => {
    setIsSending(true);
    setLastResponse(null);

    const title = isAr ? customTitleAr : customTitleEn;
    const message = isAr ? customMessageAr : customMessageEn;
    const targetTab = customTargetTab;

    let payload = {
      title,
      message,
      url: `/#tab=${targetTab}&highlight=TEST-HIGHLIGHT`,
      docId: 'TEST-PUSH-DOC',
      actionType: notificationPreset
    };

    if (overrideTarget) {
      if (overrideTarget.onesignalSubscriptionId) {
        payload.includeSubscriptionIds = [overrideTarget.onesignalSubscriptionId];
      } else {
        payload.targetUserId = overrideTarget.id;
      }
    } else if (targetMode === 'direct_sub') {
      if (!customSubscriptionId.trim()) {
        alert(isAr ? 'يرجى إدخال معرف الاشتراك (Subscription ID)' : 'Please enter a Subscription ID');
        setIsSending(false);
        return;
      }
      payload.includeSubscriptionIds = [customSubscriptionId.trim()];
    } else if (targetMode === 'user') {
      const targetUser = usersList.find((u) => u.id === selectedUserId);
      if (targetUser?.onesignalSubscriptionId) {
        payload.includeSubscriptionIds = [targetUser.onesignalSubscriptionId];
      } else {
        payload.targetUserId = selectedUserId;
      }
    } else if (targetMode === 'role') {
      payload.targetRoles = [selectedRole];
    } else {
      payload.sendToAll = true;
    }

    try {
      const res = await sendOneSignalPush(payload);
      setLastResponse({
        timestamp: new Date().toLocaleTimeString(),
        result: res
      });

      // Play chime locally for tester
      playNotificationSound();
    } catch (e) {
      setLastResponse({
        timestamp: new Date().toLocaleTimeString(),
        result: { success: false, error: e.message }
      });
    } finally {
      setIsSending(false);
    }
  };

  // Dispatch In-App Action Required
  const handleDispatchInAppAction = async (targetUser) => {
    try {
      const actId = await createActionRequired({
        actionType: 'fg_inward_verification',
        docId: `TRN-TEST-${Date.now().toString().slice(-4)}`,
        docNumber: `TRN-TEST-${Date.now().toString().slice(-4)}`,
        title: isAr ? 'اختبار اعتماد مستند منتج تام' : 'Test FG Inward Pallet Verification',
        titleEn: 'Test FG Inward Pallet Verification',
        message: isAr ? 'إجراء تجريبي لاختبار التنبيه والرنين والظهور في القائمة المعلقة' : 'Test action for verifying mobile push & pending badge',
        messageEn: 'Test action for verifying mobile push & pending badge',
        targetTab: 'fg_inward',
        targetModule: 'production',
        targetUserId: targetUser.id,
        targetRoles: [targetUser.role || 'general_admin'],
        createdBy: currentUser?.id || 'admin',
        createdByName: currentUser?.name || 'Admin Tester'
      });
      alert(isAr ? `✓ تم إنشاء الإجراء في قائمة المهام بنجاح: ${actId}` : `Action created successfully: ${actId}`);
    } catch (e) {
      alert(`Error creating action: ${e.message}`);
    }
  };

  // Run Cloud OneSignal Device Reconciliation
  const handleSyncCloudDevices = async () => {
    setIsSyncingCloud(true);
    setCloudSyncResult(null);
    try {
      const res = await syncOneSignalDevicesWithFirestore();
      if (res?.success) {
        setCloudSyncResult(
          isAr
            ? `تم بنجاح تحديث ${res.synced || 0} أجهزة من سحابة OneSignal ✓`
            : `Successfully synced ${res.synced || 0} devices from OneSignal Cloud ✓`
        );
      } else {
        setCloudSyncResult(isAr ? 'لم يتم العثور على أجهزة جديدة' : 'No new devices found in cloud');
      }
    } catch (e) {
      setCloudSyncResult(`Error: ${e.message}`);
    } finally {
      setIsSyncingCloud(false);
      setTimeout(() => setCloudSyncResult(null), 5000);
    }
  };

  // Run Self-Healing Reconciliation
  const handleRunReconciliation = async () => {
    setIsReconciling(true);
    try {
      await reconcilePendingActions();
      setReconcileResult(isAr ? 'تم فحص وتسوية كافة الإجراءات المعلقة بنجاح ✓' : 'All pending actions audited & reconciled ✓');
    } catch (e) {
      setReconcileResult(`Error: ${e.message}`);
    } finally {
      setIsReconciling(false);
      setTimeout(() => setReconcileResult(null), 4000);
    }
  };

  return (
    <div className="space-y-6 text-start animate-in fade-in duration-200">
      {/* 1. Header Hero & Diagnostic Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: OneSignal Push Engine */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <Radio className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">
                  {isAr ? 'محرك إشعارات الويب OneSignal' : 'OneSignal Web Push Engine'}
                </h4>
                <p className="text-[11px] text-slate-500">
                  {isAr ? 'خطة Spark المجانية (بدون Cloud Functions)' : 'Free Spark Plan (No Cloud Functions)'}
                </p>
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                isOneSignalConfigured()
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {isOneSignalConfigured() ? (isAr ? 'متصل وجاهز' : 'Connected') : (isAr ? 'مفقود' : 'Not Configured')}
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-slate-600 mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">App ID:</span>
              <div className="flex items-center gap-1 font-mono text-[11px]">
                <span>{ONESIGNAL_APP_ID ? `${ONESIGNAL_APP_ID.slice(0, 8)}...` : 'Not Set'}</span>
                {ONESIGNAL_APP_ID && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(ONESIGNAL_APP_ID, 'app_id')}
                    className="p-1 hover:bg-slate-100 rounded text-slate-500"
                    title="Copy App ID"
                  >
                    {copiedKey === 'app_id' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">REST API Key:</span>
              <div className="flex items-center gap-1 font-mono text-[11px]">
                <span>{ONESIGNAL_REST_API_KEY ? `${ONESIGNAL_REST_API_KEY.slice(0, 10)}...` : 'Not Set'}</span>
                {ONESIGNAL_REST_API_KEY && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(ONESIGNAL_REST_API_KEY, 'api_key')}
                    className="p-1 hover:bg-slate-100 rounded text-slate-500"
                    title="Copy REST API Key"
                  >
                    {copiedKey === 'api_key' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">{isAr ? 'الترخيص والتكلفة:' : 'Plan & Cost:'}</span>
              <span className="text-emerald-700 font-bold">$0.00 / month (10,000 Users)</span>
            </div>
          </div>
        </div>

        {/* Card 2: Current Device Status */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                {currentDeviceName.includes('iPhone') || currentDeviceName.includes('Android') ? (
                  <Smartphone className="h-5 w-5" />
                ) : (
                  <Laptop className="h-5 w-5" />
                )}
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">
                  {isAr ? 'جهازك الحالي المتصل' : 'Current Active Device'}
                </h4>
                <p className="text-[11px] text-slate-500 font-semibold">{currentDeviceName}</p>
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                devicePermission === 'granted' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {devicePermission === 'granted' ? (isAr ? 'مسموح' : 'Granted') : (isAr ? 'غير مفعل' : 'Pending')}
            </span>
          </div>

          <div className="space-y-2 text-xs text-slate-600 mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">{isAr ? 'إذن المتصفح:' : 'Browser Permission:'}</span>
              <span className={`font-bold ${devicePermission === 'granted' ? 'text-emerald-700' : 'text-amber-600'}`}>
                {devicePermission}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">{isAr ? 'معرف الاشتراك (Sub ID):' : 'Subscription ID:'}</span>
              {currentDeviceSub?.subscriptionId ? (
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[11px] text-emerald-800 font-bold truncate max-w-[120px]">
                    {currentDeviceSub.subscriptionId}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(currentDeviceSub.subscriptionId, 'current_sub_id')}
                    className="p-1 hover:bg-slate-100 rounded text-slate-400"
                    title="Copy"
                  >
                    {copiedKey === 'current_sub_id' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              ) : (
                <span className="font-bold text-amber-600 text-[11px]">
                  {isAr ? 'لم يولد بعد' : 'Not Subscribed'}
                </span>
              )}
            </div>

            {/* Subscription Action Button */}
            <div className="pt-1.5 space-y-1.5">
              {!currentDeviceSub?.subscriptionId ? (
                <button
                  type="button"
                  disabled={isSubscribing}
                  onClick={async () => {
                    setIsSubscribing(true);
                    setSubscribeMessage(null);
                    try {
                      const res = await optInOneSignalPush(currentUser);
                      if (res?.subscriptionId) {
                        setCurrentDeviceSub(res);
                        setDevicePermission('granted');
                        setSubscribeMessage({
                          type: 'success',
                          text: isAr ? '✓ تم ربط وتسجيل هذا الجهاز بنجاح!' : '✓ Device registered successfully!'
                        });
                        playNotificationSound();
                      } else {
                        setSubscribeMessage({
                          type: 'error',
                          text: isAr
                            ? 'تعذر الحصول على معرف الاشتراك. تأكد من السماح بالإشعارات أو إضافة التطبيق للشاشة الرئيسية على الآيفون.'
                            : 'Could not acquire subscription ID. Ensure push is allowed or PWA is installed on iPhone.'
                        });
                      }
                    } catch (e) {
                      setSubscribeMessage({ type: 'error', text: e.message });
                    } finally {
                      setIsSubscribing(false);
                      setTimeout(() => setSubscribeMessage(null), 5000);
                    }
                  }}
                  className="w-full py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-black text-xs transition cursor-pointer shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Sparkles className={`h-3.5 w-3.5 ${isSubscribing ? 'animate-spin' : ''}`} />
                  <span>
                    {isSubscribing
                      ? (isAr ? 'جاري التوليد والربط...' : 'Generating & Subscribing...')
                      : (isAr ? '🔗 ربط هذا الجهاز وتوليد التوكن' : 'Register & Subscribe This Device')}
                  </span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      handleDispatchPush({
                        id: currentUser?.id,
                        onesignalSubscriptionId: currentDeviceSub.subscriptionId
                      });
                    }}
                    className="flex-1 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg font-bold text-[11px] transition cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Smartphone className="h-3 w-3" />
                    <span>{isAr ? 'اختبار الرنين هنا 🔔' : 'Test Ring Here 🔔'}</span>
                  </button>
                  <button
                    type="button"
                    title={isAr ? 'إعادة المزامنة' : 'Re-sync'}
                    onClick={async () => {
                      setIsSubscribing(true);
                      const res = await optInOneSignalPush(currentUser);
                      if (res) setCurrentDeviceSub(res);
                      setIsSubscribing(false);
                    }}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isSubscribing ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              )}

              {subscribeMessage && (
                <p
                  className={`text-[10px] font-bold text-center mt-1 animate-in fade-in ${
                    subscribeMessage.type === 'success' ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {subscribeMessage.text}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Card 3: System Device Stats & Action Self-Healing */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900">
                    {isAr ? 'إحصائيات الأجهزة والتسوية' : 'Device Registry & Health'}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {isAr ? 'مزامنة المستخدمين وتنظيف المعلقات' : 'Live User Sync & Reconciliation'}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3 text-center">
              <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                <span className="text-lg font-black text-slate-800">
                  {usersList.filter((u) => u.pushEnabled || u.onesignalSubscriptionId).length}
                </span>
                <p className="text-[10px] text-slate-400 font-bold">{isAr ? 'أجهزة مسجلة' : 'Registered Devices'}</p>
              </div>
              <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                <span className="text-lg font-black text-emerald-700">{usersList.length}</span>
                <p className="text-[10px] text-slate-400 font-bold">{isAr ? 'إجمالي الحسابات' : 'Total Accounts'}</p>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 space-y-2">
            <button
              type="button"
              onClick={handleSyncCloudDevices}
              disabled={isSyncingCloud}
              className="w-full py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncingCloud ? 'animate-spin text-emerald-600' : 'text-emerald-600'}`} />
              <span>{isSyncingCloud ? (isAr ? 'جاري المزامنة...' : 'Syncing...') : (isAr ? 'مزامنة أجهزة السحابة (OneSignal)' : 'Sync Cloud Devices')}</span>
            </button>
            <button
              type="button"
              onClick={handleRunReconciliation}
              disabled={isReconciling}
              className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isReconciling ? 'animate-spin' : ''}`} />
              <span>{isAr ? 'تسوية المعلقات المكتملة تلقائياً' : 'Reconcile Stuck Actions'}</span>
            </button>
            {cloudSyncResult && (
              <p className="text-[10px] text-emerald-700 font-bold text-center mt-1 animate-in fade-in">
                {cloudSyncResult}
              </p>
            )}
            {reconcileResult && (
              <p className="text-[10px] text-emerald-600 font-bold text-center mt-1 animate-in fade-in">
                {reconcileResult}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 2. User Accounts & Device Push Registry Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
              <Smartphone className="h-4.5 w-4.5 text-emerald-600" />
              <span>{isAr ? 'سجل أجهزة المستخدمين وتوكنات الإشعارات (Device Tokens)' : 'User Device Tokens & Push Registry'}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isAr
                ? 'قائمة المستخدمين والأجهزة المسجلة لاستقبال إشعارات الهاتف والرنين أثناء قفل الشاشة'
                : 'Registered user devices capable of receiving off-screen push notifications'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSyncCloudDevices}
              disabled={isSyncingCloud}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
              <span>{isSyncingCloud ? (isAr ? 'جاري الفحص...' : 'Syncing...') : (isAr ? '🔄 مزامنة أجهزة السحابة' : '🔄 Sync Cloud Devices')}</span>
            </button>
            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-black">
              {usersList.filter((u) => u.onesignalSubscriptionId).length} / {usersList.length} {isAr ? 'أجهزة متصلة' : 'Connected'}
            </span>
          </div>
        </div>
        {cloudSyncResult && (
          <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 text-xs font-bold text-emerald-800 flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{cloudSyncResult}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-100/70 text-slate-600 font-extrabold border-b border-slate-200">
              <tr>
                <th className="p-3 text-start">{isAr ? 'المستخدم / الدور' : 'User / Role'}</th>
                <th className="p-3 text-start">{isAr ? 'نوع الجهاز المسجل' : 'Device Platform'}</th>
                <th className="p-3 text-start">{isAr ? 'معرف التوكن (OneSignal Sub ID)' : 'OneSignal Subscription ID'}</th>
                <th className="p-3 text-center">{isAr ? 'حالة الإشعارات' : 'Push Status'}</th>
                <th className="p-3 text-start">{isAr ? 'آخر نشاط' : 'Last Synced'}</th>
                <th className="p-3 text-end">{isAr ? 'إجراءات الفحص والتجربة' : 'Direct Test Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usersList.map((user) => {
                const hasDevice = Boolean(user.onesignalSubscriptionId);
                const isCurrent = user.id === currentUser?.id;
                return (
                  <tr key={user.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 font-black flex items-center justify-center text-xs shrink-0">
                          {(user.name || user.id).slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-extrabold text-slate-900 flex items-center gap-1.5">
                            <span>{isAr ? (user.nameAr || user.name) : user.name}</span>
                            {isCurrent && (
                              <span className="px-1.5 py-0.2 bg-emerald-500 text-white rounded text-[9px] font-black">
                                {isAr ? 'أنت' : 'You'}
                              </span>
                            )}
                          </p>
                          <span className="text-[10px] text-slate-400 font-mono">{user.role || 'user'}</span>
                        </div>
                      </div>
                    </td>

                    <td className="p-3">
                      {user.deviceType ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-100">
                          {user.deviceType.includes('iPhone') ? <Smartphone className="h-3.5 w-3.5" /> : <Laptop className="h-3.5 w-3.5" />}
                          <span>{user.deviceType}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">{isAr ? 'لم يسجل جهازاً بعد' : 'No device registered'}</span>
                      )}
                    </td>

                    <td className="p-3 font-mono text-[11px] text-slate-600">
                      {user.onesignalSubscriptionId ? (
                        <div className="flex items-center gap-1">
                          <span className="truncate max-w-[150px]">{user.onesignalSubscriptionId}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(user.onesignalSubscriptionId, `sub_${user.id}`)}
                            className="p-1 hover:bg-slate-200 rounded text-slate-400"
                            title="Copy ID"
                          >
                            {copiedKey === `sub_${user.id}` ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    <td className="p-3 text-center">
                      {user.pushEnabled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>{isAr ? 'مفعل ✓' : 'Active'}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                          <span>{isAr ? 'غير مفعل' : 'Inactive'}</span>
                        </span>
                      )}
                    </td>

                    <td className="p-3 text-[11px] text-slate-400">
                      {user.deviceLastActive
                        ? new Date(user.deviceLastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>

                    <td className="p-3 text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDispatchPush(user)}
                          className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white rounded-lg font-bold text-[10px] transition cursor-pointer border border-emerald-200 hover:border-transparent flex items-center gap-1"
                          title={isAr ? 'إرسال إشعار فوري للجهاز' : 'Send Push to this device'}
                        >
                          <Smartphone className="h-3 w-3" />
                          <span>{isAr ? 'إشعار فوري 📲' : 'Push'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDispatchInAppAction(user)}
                          className="px-2.5 py-1 bg-amber-50 hover:bg-amber-500 text-amber-800 hover:text-white rounded-lg font-bold text-[10px] transition cursor-pointer border border-amber-200 hover:border-transparent flex items-center gap-1"
                          title={isAr ? 'إرسال مهمة في القائمة المعلقة' : 'Send in-app action'}
                        >
                          <ClipboardCheck className="h-3 w-3" />
                          <span>{isAr ? 'إجراء معلق 📋' : 'Action'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. General Notification Policies & App Settings */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">
                {isAr ? 'إعدادات وسياسات الإشعارات والتنبيهات العامة' : 'General Notification & Alert Policies'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr
                  ? 'تهيئة الرنين الحركي والصوتي وسياسات انتهاء صلاحية المهام المعلقة على مستوى النظام'
                  : 'Configure system-wide sound chimes, mobile haptic vibration, and action expiration thresholds'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveGeneralConfig}
            disabled={isSavingConfig}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition cursor-pointer shadow-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            <Sparkles className={`h-3.5 w-3.5 ${isSavingConfig ? 'animate-spin' : ''}`} />
            <span>{configSaveSuccess ? (isAr ? 'تم الحفظ بنجاح ✓' : 'Saved ✓') : (isAr ? 'حفظ إعدادات المنظومة' : 'Save Policies')}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          {/* Sound Toggle */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white text-indigo-600 rounded-lg shadow-2xs border border-slate-100">
                <Volume2 className="h-4 w-4" />
              </div>
              <div>
                <p className="font-bold text-slate-900">{isAr ? 'رنين التنبيه الصوتي' : 'Audio Chime'}</p>
                <p className="text-[10px] text-slate-500">{isAr ? 'نغمة ثنائية النغمات Web Audio' : 'Dual-harmonic synthesized chime'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setGeneralConfig((p) => ({ ...p, soundEnabled: !p.soundEnabled }))}
              className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                generalConfig.soundEnabled ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${
                  generalConfig.soundEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Vibration Toggle */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white text-indigo-600 rounded-lg shadow-2xs border border-slate-100">
                <Vibrate className="h-4 w-4" />
              </div>
              <div>
                <p className="font-bold text-slate-900">{isAr ? 'الاهتزاز الحركي للهواتف' : 'Mobile Vibration'}</p>
                <p className="text-[10px] text-slate-500">{isAr ? 'رد فعل حركي Haptic للأجهزة المحمولة' : 'Haptic feedback on mobile devices'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setGeneralConfig((p) => ({ ...p, vibrationEnabled: !p.vibrationEnabled }))}
              className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                generalConfig.vibrationEnabled ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${
                  generalConfig.vibrationEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Web Push Gateway */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white text-indigo-600 rounded-lg shadow-2xs border border-slate-100">
                <Radio className="h-4 w-4" />
              </div>
              <div>
                <p className="font-bold text-slate-900">{isAr ? 'بوابة إشعارات الويب' : 'Web Push Gateway'}</p>
                <p className="text-[10px] text-slate-500">{isAr ? 'إرسال الإشعارات أثناء قفل الشاشة' : 'Push alerts to off-screen phones'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setGeneralConfig((p) => ({ ...p, pushGatewayActive: !p.pushGatewayActive }))}
              className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                generalConfig.pushGatewayActive ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${
                  generalConfig.pushGatewayActive ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Action Expiry */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-900">{isAr ? 'صلاحية الإجراءات المعلقة' : 'Action Auto-Expire'}</p>
              <p className="text-[10px] text-slate-500">{isAr ? 'المدة قبل تصنيف المهمة كمتعطلة' : 'Hours before marking overdue'}</p>
            </div>
            <select
              value={generalConfig.actionAutoExpireHours}
              onChange={(e) => setGeneralConfig((p) => ({ ...p, actionAutoExpireHours: Number(e.target.value) }))}
              className="p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
            >
              <option value={24}>24 {isAr ? 'ساعة' : 'Hours'}</option>
              <option value={48}>48 {isAr ? 'ساعة' : 'Hours'}</option>
              <option value={72}>72 {isAr ? 'ساعة' : 'Hours'}</option>
              <option value={168}>7 {isAr ? 'أيام' : 'Days'}</option>
            </select>
          </div>

          {/* Retention */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between sm:col-span-2 lg:col-span-1">
            <div>
              <p className="font-bold text-slate-900">{isAr ? 'أرشفة سجل الإشعارات' : 'Notification Retention'}</p>
              <p className="text-[10px] text-slate-500">{isAr ? 'المدة الزمنية للاحتفاظ بالإشعارات القديمة' : 'Days to keep past alerts'}</p>
            </div>
            <select
              value={generalConfig.notificationRetentionDays}
              onChange={(e) => setGeneralConfig((p) => ({ ...p, notificationRetentionDays: Number(e.target.value) }))}
              className="p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
            >
              <option value={15}>15 {isAr ? 'يوم' : 'Days'}</option>
              <option value={30}>30 {isAr ? 'يوم' : 'Days'}</option>
              <option value={60}>60 {isAr ? 'يوم' : 'Days'}</option>
              <option value={90}>90 {isAr ? 'يوم' : 'Days'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. Universal Interactive Push Dispatcher / Tester */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <Send className="h-5 w-5 text-emerald-600" />
                <span>{isAr ? 'أداة الإرسال والاختبار المباشر للإشعارات' : 'Universal Push Dispatcher & Tester'}</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr
                  ? 'قم بتركيب أي إشعار مخصص واختبر وصوله ورنينه على الهاتف المقفل أو المتصفح مباشرة'
                  : 'Compose and dispatch customized push alerts to verify mobile off-screen arrival'}
              </p>
            </div>

            {/* Presets */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
              <button
                type="button"
                onClick={() => handleSelectPreset('fg_inward')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  notificationPreset === 'fg_inward' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                {isAr ? 'منتج تام (FG)' : 'FG Inward'}
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('po_approval')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  notificationPreset === 'po_approval' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                {isAr ? 'مشتريات (PO)' : 'PO Approval'}
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('stock_transfer')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  notificationPreset === 'stock_transfer' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                {isAr ? 'تحويل مخزن (TRN)' : 'Transfer'}
              </button>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-4 text-xs">
            {/* Target Mode */}
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">
                {isAr ? '١. وجهة الإرسال (Target Audience):' : '1. Target Audience:'}
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setTargetMode('user')}
                  className={`p-2.5 rounded-xl border font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    targetMode === 'user'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Smartphone className="h-4 w-4" />
                  <span>{isAr ? 'مستخدم محدد' : 'Specific User'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetMode('direct_sub')}
                  className={`p-2.5 rounded-xl border font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    targetMode === 'direct_sub'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Key className="h-4 w-4" />
                  <span>{isAr ? 'معرف توكن مباشر' : 'Direct Sub ID'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetMode('role')}
                  className={`p-2.5 rounded-xl border font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    targetMode === 'role'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Shield className="h-4 w-4" />
                  <span>{isAr ? 'حسب الدور' : 'By Role'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetMode('broadcast')}
                  className={`p-2.5 rounded-xl border font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    targetMode === 'broadcast'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Radio className="h-4 w-4" />
                  <span>{isAr ? 'بث للجميع' : 'Broadcast All'}</span>
                </button>
              </div>
            </div>

            {/* Target Selectors */}
            {targetMode === 'user' && (
              <div className="space-y-2">
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'اختر المستخدم المستهدف:' : 'Select Target User:'}
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-800"
                >
                  {usersList.map((u) => {
                    const hasDevice = Boolean(u.onesignalSubscriptionId);
                    return (
                      <option key={u.id} value={u.id}>
                        {isAr ? (u.nameAr || u.name || u.id) : (u.name || u.id)} ({u.role || 'user'}) — {hasDevice ? `📱 ${u.deviceType || 'Device'} (Ready ✓)` : '⚪ No Device Registered'}
                      </option>
                    );
                  })}
                </select>

                {(() => {
                  const targetUser = usersList.find((u) => u.id === selectedUserId);
                  if (!targetUser) return null;
                  if (targetUser.onesignalSubscriptionId) {
                    return (
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 font-bold">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span>{isAr ? 'الجهاز المسجل جاهز للاستقبال:' : 'Target Device Ready:'} {targetUser.deviceType || 'Device'}</span>
                        </span>
                        <span className="font-mono text-[10px] text-emerald-700">Sub ID: {targetUser.onesignalSubscriptionId.slice(0, 16)}...</span>
                      </div>
                    );
                  } else {
                    return (
                      <div className="flex items-center gap-1.5 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 font-medium">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                        <span>{isAr ? 'هذا المستخدم لم يسجل جهازاً بعد. قم بتسجيل الدخول بهذا الحساب على الهاتف واضغط "ربط هذا الجهاز".' : 'This user has no registered device token yet. Log in on their phone to link.'}</span>
                      </div>
                    );
                  }
                })()}
              </div>
            )}

            {targetMode === 'direct_sub' && (
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'أدخل معرف الاشتراك المباشر للجهاز (Subscription UUID):' : 'Enter Direct OneSignal Subscription UUID:'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 9f3c7a11-58ab-4172-8877-e630129abcde"
                    value={customSubscriptionId}
                    onChange={(e) => setCustomSubscriptionId(e.target.value)}
                    className="flex-1 p-2.5 rounded-xl border border-slate-200 font-mono text-xs text-slate-800"
                  />
                  {currentDeviceSub?.subscriptionId && (
                    <button
                      type="button"
                      onClick={() => setCustomSubscriptionId(currentDeviceSub.subscriptionId)}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-[11px] whitespace-nowrap transition cursor-pointer"
                    >
                      {isAr ? 'استخدام جهازي الحالي' : 'Use Current Device'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {targetMode === 'role' && (
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'اختر الدور المستهدف:' : 'Select Target Role:'}
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-800"
                >
                  <option value="general_admin">general_admin (المسؤول العام)</option>
                  <option value="finished_goods_custodian">finished_goods_custodian (أمين المنتج التام)</option>
                  <option value="purchasing_manager">purchasing_manager (مدير المشتريات)</option>
                  <option value="warehouse_keeper">warehouse_keeper (أمين المستودع)</option>
                  <option value="storekeeper">storekeeper (مسؤول المخزن)</option>
                </select>
              </div>
            )}

            {/* Titles */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'عنوان الإشعار (عربي):' : 'Title (Arabic):'}
                </label>
                <input
                  type="text"
                  value={customTitleAr}
                  onChange={(e) => setCustomTitleAr(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'عنوان الإشعار (إنجليزي):' : 'Title (English):'}
                </label>
                <input
                  type="text"
                  value={customTitleEn}
                  onChange={(e) => setCustomTitleEn(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-bold font-sans"
                />
              </div>
            </div>

            {/* Messages */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'نص الرسالة (عربي):' : 'Message (Arabic):'}
                </label>
                <textarea
                  rows={2}
                  value={customMessageAr}
                  onChange={(e) => setCustomMessageAr(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-medium"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isAr ? 'نص الرسالة (إنجليزي):' : 'Message (English):'}
                </label>
                <textarea
                  rows={2}
                  value={customMessageEn}
                  onChange={(e) => setCustomMessageEn(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-medium font-sans"
                />
              </div>
            </div>

            {/* Target Tab */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                {isAr ? 'التبويب المستهدف عند الضغط على الإشعار:' : 'Deep-Link Routing Tab:'}
              </label>
              <select
                value={customTargetTab}
                onChange={(e) => setCustomTargetTab(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-800"
              >
                <option value="fg_inward">fg_inward (استلام المنتج التام)</option>
                <option value="orders">orders (أوامر الشراء PO)</option>
                <option value="receipts">receipts (أذون استلام الخامات GRN)</option>
                <option value="transfers">transfers (تحويلات المخازن TRN)</option>
                <option value="work_orders">work_orders (أوامر التشغيل والإنتاج)</option>
                <option value="landing">landing (الشاشة الرئيسية)</option>
              </select>
            </div>

            {/* Submit Button */}
            <button
              type="button"
              onClick={() => handleDispatchPush()}
              disabled={isSending}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl font-extrabold text-sm shadow-md shadow-emerald-700/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="h-4.5 w-4.5" />
              <span>{isSending ? (isAr ? 'جارِ الإرسال...' : 'Dispatching...') : (isAr ? '🚀 إرسال الإشعار وتجربة الرنين الفوري' : '🚀 Dispatch Live Push & Test Off-Screen')}</span>
            </button>
          </div>
        </div>

        {/* Console / Diagnostics Output */}
        <div className="bg-slate-900 text-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between border border-slate-800 font-mono text-xs">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <span className="font-bold text-emerald-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>OneSignal Live Console</span>
              </span>
              <span className="text-[10px] text-slate-500 font-sans">
                {lastResponse?.timestamp || 'Idle'}
              </span>
            </div>

            {lastResponse ? (
              <div className="space-y-2 overflow-y-auto max-h-[380px] p-2 bg-slate-950/80 rounded-xl border border-slate-800/80">
                <p className="text-[11px] font-bold text-slate-300">
                  Status: {lastResponse.result?.success ? '🟢 200 OK (Delivered)' : '🔴 Error'}
                </p>
                {lastResponse.result?.endpoint && (
                  <p className="text-[10px] text-slate-400">
                    Endpoint: {lastResponse.result.endpoint}
                  </p>
                )}
                <pre className="text-[10px] text-emerald-300 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(lastResponse.result, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="py-16 text-center text-slate-500 space-y-2">
                <Radio className="h-8 w-8 mx-auto text-slate-700" />
                <p className="text-xs">{isAr ? 'بانتظار إرسال تنبيه...' : 'Waiting for test dispatch...'}</p>
                <p className="text-[10px] text-slate-600">
                  {isAr ? 'سيظهر هنا الرد المباشر الصادر من خوادم OneSignal' : 'Real-time response logs will appear here'}
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[10px] text-slate-500 font-sans leading-relaxed">
            <p className="font-bold text-slate-400 mb-0.5">💡 iPhone Off-Screen Test Note:</p>
            <p>
              Lock your iPhone screen immediately after clicking dispatch. OneSignal pushes via Apple APNs to wake the device with ring and vibration.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
