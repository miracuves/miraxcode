export function registerFinanceMode() {
  (window._registeredModes = window._registeredModes || {})['finance'] = {
    label: 'Finance AI',
    bodyClass: 'finance-mode',
    appClass: null,
    fullscreen: true,
    btnId: 'tabFinance',
    mount: () => window.FinanceMode?.mount?.(),
    destroy: () => window.FinanceMode?.destroy?.(),
  };
}
