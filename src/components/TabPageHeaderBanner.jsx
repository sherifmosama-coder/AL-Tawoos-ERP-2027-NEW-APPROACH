import React from 'react';
import { useTranslation } from 'react-i18next';
import { Palette, ShieldAlert } from 'lucide-react';
import {
  getTabConfig,
  getIconComponent,
  getAtmosphericWatercolorBannerStyle,
  hexToRgb,
  hexToRgba
} from '../utils/tabAppearanceConfig';

export default function TabPageHeaderBanner({
  activeTab,
  currentUser = {},
  onOpenTabCustomizer = null,
  onOpenTabPermissions = null,
  customTitle = null,
  customSubtitle = null
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const tabConfig = getTabConfig(activeTab);
  const IconComponent = getIconComponent(tabConfig.iconName);
  const tabColor = tabConfig.color || '#059669';
  const { r, g, b } = hexToRgb(tabColor);

  const watercolorStyle = getAtmosphericWatercolorBannerStyle(tabColor);
  const title = customTitle || (isAr ? tabConfig.labelAr : tabConfig.labelEn);
  const category = isAr ? tabConfig.categoryAr : tabConfig.categoryEn;

  const isGeneralAdmin = Boolean(currentUser.isGeneralAdmin || currentUser.role === 'general_admin');

  return (
    <div
      className="relative w-full rounded-2xl border p-4 sm:p-5 mb-5 transition-all duration-300 overflow-hidden"
      style={watercolorStyle}
    >
      {/* Decorative watercolor light bloom in corner */}
      <div
        className="absolute -top-12 -end-12 w-48 h-48 rounded-full pointer-events-none blur-2xl opacity-60"
        style={{
          background: `radial-gradient(circle, rgba(${r}, ${g}, ${b}, 0.25) 0%, transparent 70%)`
        }}
      />
      <div
        className="absolute -bottom-10 -start-10 w-40 h-40 rounded-full pointer-events-none blur-xl opacity-40"
        style={{
          background: `radial-gradient(circle, rgba(${r}, ${g}, ${b}, 0.2) 0%, transparent 70%)`
        }}
      />

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        {/* Left/Start: Stylized Icon Badge + Title & Breadcrumb */}
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
          {/* Creative Icon Badge with Tab Tint & Watercolor Border */}
          <div
            className="p-3 sm:p-3.5 rounded-2xl border shadow-xs flex items-center justify-center shrink-0 transition-transform duration-200 hover:scale-105"
            style={{
              background: `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.18) 0%, rgba(${r}, ${g}, ${b}, 0.08) 100%)`,
              borderColor: `rgba(${r}, ${g}, ${b}, 0.35)`,
              color: tabColor,
              boxShadow: `0 4px 12px -2px rgba(${r}, ${g}, ${b}, 0.2)`
            }}
          >
            <IconComponent className="h-6 w-6 sm:h-7 sm:w-7 shrink-0 drop-shadow-xs" />
          </div>

          <div className="min-w-0">
            {/* Category / Subtitle Pill */}
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold tracking-tight border uppercase"
                style={{
                  background: `rgba(${r}, ${g}, ${b}, 0.09)`,
                  color: tabColor,
                  borderColor: `rgba(${r}, ${g}, ${b}, 0.22)`
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: tabColor }}
                />
                {category || (isAr ? 'القسم الرئيسي' : 'Module Screen')}
              </span>

              <span className="font-mono text-[10px] text-slate-600 font-semibold bg-white/70 px-1.5 py-0.5 rounded border border-slate-200/80">
                #{activeTab}
              </span>
            </div>

            {/* Main Screen Title */}
            <h1 className="text-lg sm:text-xl md:text-2xl font-black text-slate-900 tracking-tight truncate">
              {title}
            </h1>
          </div>
        </div>

        {/* Right/End: Quick Configuration Actions for General Admin Only */}
        {isGeneralAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            {onOpenTabPermissions && (
              <button
                type="button"
                onClick={() => onOpenTabPermissions(activeTab)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer border bg-white/85 hover:bg-white text-slate-700 hover:text-emerald-700 hover:border-emerald-300"
                style={{
                  borderColor: `rgba(${r}, ${g}, ${b}, 0.3)`
                }}
                title={isAr ? `ضبط صلاحيات تبويب: ${title}` : `Configure permissions for ${title}`}
              >
                <ShieldAlert className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span className="hidden sm:inline">
                  {isAr ? 'صلاحيات التبويب' : 'Tab Permissions'}
                </span>
              </button>
            )}

            {onOpenTabCustomizer && (
              <button
                type="button"
                onClick={() => onOpenTabCustomizer(activeTab)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer border bg-white/85 hover:bg-white text-slate-700 hover:text-slate-900"
                style={{
                  borderColor: `rgba(${r}, ${g}, ${b}, 0.3)`
                }}
                title={isAr ? `تخصيص مسمى ولون وأيقونة: ${title}` : `Customize tab appearance for ${title}`}
              >
                <Palette className="h-3.5 w-3.5 shrink-0" style={{ color: tabColor }} />
                <span className="hidden sm:inline">
                  {isAr ? 'تخصيص مظهر التبويب' : 'Customize Tab'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
