import React from 'react';
import {
  Landmark,
  BadgeDollarSign,
  BarChart3,
  Clock,
  ArrowRight,
  ShieldCheck,
  Building2,
  FileSpreadsheet,
  CheckCircle2,
  Coins,
  FileText,
  Layers,
  ArrowLeftRight
} from 'lucide-react';

export default function FinanceUpcomingView({
  tabId = 'banks',
  onNavigateToCash = () => {},
  onNavigateToBankMaster = () => {},
  isAr = true
}) {
  const VIEW_CONFIGS = {
    banks: {
      id: 'banks',
      titleAr: 'الحسابات البنكية والشيكات',
      titleEn: 'Bank Accounts & Cheques',
      descAr: 'إدارة حسابات الشركة في البنوك، الشيكات الصادرة والواردة، ومطابقة كشوف الحساب البنكية آلياً.',
      descEn: 'Manage corporate bank accounts, incoming/outgoing cheques, and automated bank reconciliations.',
      icon: Landmark,
      color: 'blue',
      badgeAr: 'المرحلة التالية في موديول المالية',
      badgeEn: 'Next Phase in Finance Module',
      subtabs: [
        {
          id: 'bank_list',
          titleAr: '١- حسابات البنوك المعتمدة',
          titleEn: '1. Bank Accounts Directory',
          descAr: 'تسجيل الحسابات البنكية (CIB, QNB, الأهلي, مصر)، أرقام الآيبان (IBAN)، وأرصدة البنوك اللحظية.',
          icon: Building2
        },
        {
          id: 'cheques_ledger',
          titleAr: '٢- حافظة الشيكات وأوراق القبض والدفع',
          titleEn: '2. Cheques & Notes Payable/Receivable',
          descAr: 'تتبع دورة حياة الشيكات: إصدار الشيك، في الحافظة، تحت التحصيل، التحصيل الفعلي، أو الارتداد.',
          icon: FileSpreadsheet
        },
        {
          id: 'bank_reconciliation',
          titleAr: '٣- مطابقة وتسوية كشف الحساب البنكي',
          titleEn: '3. Bank Statement Reconciliation',
          descAr: 'مطابقة حركات البنك الفعلية مع قيود السيولة وسدادات الموردين والعملاء لتسوية الفروقات.',
          icon: ArrowLeftRight
        }
      ]
    },
    accounts: {
      id: 'accounts',
      titleAr: 'دليل الحسابات والأستاذ العام (GL)',
      titleEn: 'Chart of Accounts & General Ledger',
      descAr: 'شجرة الحسابات المحاسبية المتكاملة، قيود اليومية الآلية، وموازين المراجعة الموحدة.',
      descEn: 'Unified Chart of Accounts tree, automatic double-entry journal vouchers, and live trial balances.',
      icon: BadgeDollarSign,
      color: 'indigo',
      badgeAr: 'النواة المحاسبية المركزية',
      badgeEn: 'Central Accounting Core',
      subtabs: [
        {
          id: 'chart_tree',
          titleAr: '١- شجرة الحسابات (COA Tree)',
          titleEn: '1. Chart of Accounts Tree',
          descAr: 'أصول، خصوم، حقوق ملكية، إيرادات، ومصروفات بتصنيف شجري مرن من ٤ إلى ٦ مستويات.',
          icon: Layers
        },
        {
          id: 'journal_vouchers',
          titleAr: '٢- قيود اليومية التلقائية واليدوية',
          titleEn: '2. Journal Vouchers & Double Entry',
          descAr: 'توليد القيود آلياً من سندات الخزينة، أذون استلام المشتريات (GRN)، وتكاليف أوامر الشغل.',
          icon: FileText
        },
        {
          id: 'trial_balance',
          titleAr: '٣- ميزان المراجعة والأستاذ العام',
          titleEn: '3. General Ledger & Trial Balance',
          descAr: 'كشف الأستاذ لكل حساب تحليلي وميزان المراجعة بالأرصدة والمجاميع لأي فترة مالية.',
          icon: CheckCircle2
        }
      ]
    },
    financial_statements: {
      id: 'financial_statements',
      titleAr: 'القوائم المالية والتقارير الختامية',
      titleEn: 'Financial Statements & Executive Reports',
      descAr: 'قوائم الدخل، المركز المالي، والتدفقات النقدية اللحظية المبنية على التكلفة الحقيقية.',
      descEn: 'Real-time Income Statements, Balance Sheets, and Cash Flow grounded in actual inventory costs.',
      icon: BarChart3,
      color: 'emerald',
      badgeAr: 'التقارير المالية التنفيذية',
      badgeEn: 'Executive Financial Reporting',
      subtabs: [
        {
          id: 'income_statement',
          titleAr: '١- قائمة الدخل (الأرباح والخسائر)',
          titleEn: '1. Income Statement (P&L)',
          descAr: 'مجمل الربح التشغيلي، تكلفة البضاعة المباعة (COGS) من أوامر التشغيل، وصافي الأرباح.',
          icon: BarChart3
        },
        {
          id: 'balance_sheet',
          titleAr: '٢- قائمة المركز المالي (الميزانية العمومية)',
          titleEn: '2. Balance Sheet',
          descAr: 'تقييم المخزون الحي، أرصدة الخزائن والبنوك، مديونيات العملاء، والتزامات الموردين.',
          icon: ShieldCheck
        },
        {
          id: 'cash_flow',
          titleAr: '٣- قائمة التدفقات النقدية (Cash Flow)',
          titleEn: '3. Cash Flow Statement',
          descAr: 'حركة السيولة التشغيلية، الرأسمالية، والتمويلية لضمان كفاءة دورة رأس المال العامل.',
          icon: Coins
        }
      ]
    }
  };

  const config = VIEW_CONFIGS[tabId] || VIEW_CONFIGS.banks;
  const MainIcon = config.icon;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute left-6 top-1/2 -translate-y-1/2 opacity-5 pointer-events-none">
          <MainIcon className="h-64 w-64 text-white" />
        </div>

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30 mb-4">
            <Clock className="h-3.5 w-3.5" />
            <span>{isAr ? config.badgeAr : config.badgeEn}</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-2">
            {isAr ? `خارطة تطوير موديول: ${config.titleAr}` : `Development Roadmap: ${config.titleEn}`}
          </h2>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed mb-6">
            {isAr ? config.descAr : config.descEn}
          </p>

          {/* Quick Action to Active Cash Vaults */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={onNavigateToCash}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold rounded-xl shadow-lg transition cursor-pointer"
            >
              <Coins className="h-4 w-4" />
              <span>{isAr ? 'الانتقال إلى شاشة الخزائن النقدية المفعلة حالياً' : 'Go to Active Cash Safes & Vaults'}</span>
              <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </button>
            <span className="text-xs text-slate-400">
              {isAr ? '• الخزائن والسيولة النقدية مفعلة وجاهزة للعمل داخل موديول المالية' : '• Cash vaults are fully live inside Finance'}
            </span>
          </div>
        </div>
      </div>

      {/* Subtabs Architecture Roadmap Cards */}
      <div className="space-y-3">
        <div className="text-xs font-extrabold text-slate-500 uppercase tracking-wider px-1">
          {isAr ? 'الهيكل المعماري والتبويبات المخططة للشاشة:' : 'Planned Tab Architecture & Workspaces:'}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {config.subtabs.map((sub) => {
            const SubIcon = sub.icon;
            return (
              <div
                key={sub.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition"
              >
                <div className="space-y-2.5">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700">
                    <SubIcon className="h-5 w-5 text-emerald-600" />
                  </div>
                  <h3 className="text-sm font-black text-slate-900">
                    {isAr ? sub.titleAr : sub.titleEn}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {isAr ? sub.descAr : sub.descEn}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-400">
                  <span>{isAr ? 'مخطط للتطوير' : 'Roadmap Phase'}</span>
                  <span className="font-mono text-emerald-600 font-extrabold">{sub.id}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
