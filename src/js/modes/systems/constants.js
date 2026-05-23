/** Systems mode constants (Wave 15). */
export const STORE_KEY = 'hashui_system_specs_v1';
export const DATA_KEY_PREFIX = 'hashui_system_data_';
export const UI_STORE_KEY = 'hashui_system_ui_v1';
export const MAX_HISTORY = 12;

export const DOMAIN_BG = {
    restaurant:    { light: { app:"#fffbeb", card:"#ffffff", border:"rgba(120,53,15,.11)"  }, dark: { app:"#100900", card:"#1c1100", border:"rgba(245,158,11,.14)"  } },
    hotel:         { light: { app:"#f8f8f4", card:"#ffffff", border:"rgba(12,30,61,.09)"   }, dark: { app:"#030a18", card:"#06132b", border:"rgba(59,130,246,.12)"  } },
    healthcare:    { light: { app:"#f0fdfa", card:"#ffffff", border:"rgba(13,79,79,.1)"    }, dark: { app:"#011414", card:"#031f1f", border:"rgba(20,184,166,.13)"  } },
    education:     { light: { app:"#f5f3ff", card:"#ffffff", border:"rgba(79,70,229,.1)"   }, dark: { app:"#07061a", card:"#0e0c2a", border:"rgba(129,140,248,.12)" } },
    fitness:       { light: { app:"#faf5ff", card:"#ffffff", border:"rgba(124,58,237,.1)"  }, dark: { app:"#0a0117", card:"#130525", border:"rgba(167,139,250,.15)" } },
    realestate:    { light: { app:"#f0fdf4", card:"#ffffff", border:"rgba(4,120,87,.1)"    }, dark: { app:"#001509", card:"#002814", border:"rgba(16,185,129,.12)"  } },
    retail:        { light: { app:"#fff7f8", card:"#ffffff", border:"rgba(219,39,119,.1)"  }, dark: { app:"#120005", card:"#1e000a", border:"rgba(244,114,182,.14)" } },
    logistics:     { light: { app:"#f1f5f9", card:"#ffffff", border:"rgba(30,41,59,.1)"    }, dark: { app:"#020810", card:"#060f1c", border:"rgba(56,189,248,.13)"  } },
    manufacturing: { light: { app:"#f1f5f9", card:"#ffffff", border:"rgba(30,58,95,.1)"    }, dark: { app:"#030910", card:"#08141e", border:"rgba(96,165,250,.11)"  } },
    hr:            { light: { app:"#faf5ff", card:"#ffffff", border:"rgba(124,58,237,.1)"  }, dark: { app:"#0d0320", card:"#180738", border:"rgba(196,181,253,.12)" } },
    legal:         { light: { app:"#faf8f4", card:"#fffdf9", border:"rgba(28,25,23,.09)"   }, dark: { app:"#0c0900", card:"#1a1500", border:"rgba(217,119,6,.12)"   } },
    jewelry:       { light: { app:"#fefce8", card:"#fffdf0", border:"rgba(161,120,10,.13)" }, dark: { app:"#0d0900", card:"#1a1400", border:"rgba(212,175,55,.18)"  } },
    saas:          { light: { app:"#f8fafc", card:"#ffffff", border:"rgba(15,23,42,.09)"   }, dark: { app:"#04050a", card:"#090c14", border:"rgba(148,163,184,.1)"  } },
    generic:       { light: { app:"#f8fafc", card:"#ffffff", border:"rgba(15,23,42,.1)"    }, dark: { app:"#060b14", card:"#0d1526", border:"rgba(99,102,241,.12)"  } },
  };

  // Per-domain shell pools — picks randomly so each generation gets a fresh shape
export const DOMAIN_SHELL_OPTIONS = {
    restaurant:    ["cards-nav","top","sidebar"],
    hotel:         ["cards-nav","sidebar","command"],
    healthcare:    ["command","sidebar","dock"],
    education:     ["top","sidebar","cards-nav"],
    fitness:       ["cards-nav","dock","command"],
    realestate:    ["sidebar","cards-nav","top"],
    retail:        ["cards-nav","top","sidebar"],
    logistics:     ["dock","sidebar","command"],
    manufacturing: ["dock","command","sidebar"],
    hr:            ["command","sidebar","top"],
    legal:         ["command","sidebar"],
    jewelry:       ["cards-nav","sidebar","top"],
    saas:          ["top","sidebar","command"],
    generic:       ["sidebar","top","dock","cards-nav","command"],
  };

  // Creative directives injected randomly into AI prompts to force variety
export const CREATIVE_DIRECTIVES = [
    'Lead with a "metric" home screen — giant KPI tiles with sparklines, skip the generic table dashboard.',
    'Use a "feed" screen for live operational data instead of kanban — scrollable activity cards with avatars.',
    'Show the primary tracking module as "timeline" to emphasize date-ordered flow rather than status columns.',
    'Use "calendar" as the core scheduling module — put key records as chips on date cells.',
    'Use "cards" grid as the main browsing experience — visual, avatar-based, not a raw table.',
    'Use "split" view for the main entity module — rich detail panel on the right, list on the left.',
    'Keep only ONE "list" screen — replace the rest with kanban, cards, timeline, feed, and calendar.',
    'Make every module.color distinct — a different hex per module, making the nav a spectrum of colors.',
    'Choose shell "dock" — an ultra-narrow icon rail on the left, then fill the wide main area with rich screens.',
    'Choose shell "top" — horizontal tabs across the full width, giving a product/SaaS feel.',
    'Use "report" as the second module for immediate business intelligence — include meaningful kpis.',
    'Make the accent color dramatically different from primary (complementary, not analogous) for contrast.',
    'Choose shell "command" and use "feed" + "timeline" screens to give a developer-tool aesthetic.',
    'Use "cards" for people/products, "timeline" for activity, "metric" for KPIs — skip tables entirely.',
  ];

export const VALID_SCREENS = ["dashboard","list","kanban","report","split","cards","timeline","calendar","metric","feed"];

export const FALLBACK_SCREENS = ["kanban","split","cards","report","timeline","list","feed","calendar","metric","list"];

export const ACCENT_PALETTE = ["#6366f1","#a70d2a","#f59e0b","#3b82f6","#ec4899","#14b8a6","#8b5cf6","#f97316","#06b6d4","#84cc16"];

export const FINANCE_ENTITY_IDS = {
    accounts: "chart_accounts",
    invoices: "invoices",
    invoiceLines: "invoice_lines",
    payments: "payments",
    expenses: "expenses",
    journal: "journal_entries",
    bank: "bank_transactions",
    summary: "financial_summary",
  };

export const KPI_ICONS = [
    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="18" height="18"><rect x="2" y="5" width="16" height="12" rx="2"/><path d="M6 5V3.5a2 2 0 0 1 4 0V5"/><path d="M10 10v3M8 12h4"/></svg>`,
    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="18" height="18"><path d="M3 14V4M3 14h14"/><path d="M6 11V8M10 11V5M14 11V7"/></svg>`,
    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="18" height="18"><circle cx="10" cy="10" r="7"/><path d="M10 7v4l2.5 2.5"/></svg>`,
    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="18" height="18"><path d="M4 10h12M4 6h12M4 14h7"/><circle cx="15" cy="14" r="3"/><path d="M14 15l1 1 2-2"/></svg>`,
    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="18" height="18"><circle cx="10" cy="8" r="4"/><path d="M4 18c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>`,
    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="18" height="18"><path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.3L10 14.3l-4.8 2.5.9-5.3L2.2 7.7l5.4-.8L10 2z"/></svg>`,
    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="18" height="18"><rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/></svg>`,
    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="18" height="18"><path d="M3 7l4 4 4-4 6 6"/><path d="M14 13h3v-3"/></svg>`,
    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="18" height="18"><path d="M5 17V7M10 17V3M15 17v-6"/></svg>`,
    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="18" height="18"><path d="M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM14 13v4M16 15h-4"/></svg>`,
  ];
