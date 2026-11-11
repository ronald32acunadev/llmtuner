/**
 * @param {Object} options
 * @param {Array<{dataset: {tab: string}, classList: {toggle: (string, boolean) => void}, addEventListener?: (string, (Event) => void) => void}>} options.tabs
 * @param {Object<string, HTMLElement & {hidden: boolean}>} options.views
 * @param {((tabName: string) => void) | null} options.onTabChange
 * @param {string} [options.initialTab='tuner']
 * @returns {{select: (tabName: string) => void, currentTab: () => string}}
 */
export function createNavController({ tabs, views, onTabChange, initialTab = 'tuner' }) {
  let current = initialTab;

  function select(tabName) {
    for (const tab of tabs) {
      const isActive = tab.dataset.tab === tabName;
      tab.classList.toggle('active', isActive);
    }

    for (const [name, view] of Object.entries(views)) {
      view.hidden = name !== tabName;
    }

    if (onTabChange) {
      onTabChange(tabName);
    }

    current = tabName;
  }

  function currentTab() {
    return current;
  }

  for (const tab of tabs) {
    if (tab.addEventListener) {
      tab.addEventListener('click', () => select(tab.dataset.tab));
    }
  }

  select(initialTab);

  return { select, currentTab };
}
