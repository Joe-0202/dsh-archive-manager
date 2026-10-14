// dsh-archive-manager — Client half (browser).
//
// Adds one sidebar-footer entry ("归档管理") that opens a management panel.
// The panel has two tabs:
//   • 已归档   — every archived session; each row offers 取消归档 / 删除
//   • 活跃会话 — every active session;   each row offers 归档   / 删除
// so "archive" and "delete" sit side by side on every row.
//
// Styling follows the harness design system: the stylesheet uses the same
// `--dsw-alias-*` tokens the shipped UI uses, and is injected once through the
// `styles` builtin (falling back to a manual <style> tag). No inline-style
// soup, no build step — plain lazy-CJS bundle protocol.
window.__ModuleLoader__.load({
  id: 'dsh-archive-manager',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var ROUTES = {
      list: '/plugins/archive-manager/list',
      archive: '/plugins/archive-manager/archive',
      unarchive: '/plugins/archive-manager/unarchive',
      del: '/plugins/archive-manager/delete',
      reveal: '/plugins/archive-manager/reveal',
    };

    // ── Stylesheet (harness design tokens) ───────────────────────────────────
    var CSS = [
      '.dsam-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:24px;background:color-mix(in srgb,var(--dsw-alias-bg-mask-3,#000) 42%,transparent);backdrop-filter:blur(2px)}',
      '.dsam-panel{display:flex;flex-direction:column;width:660px;max-width:100%;height:min(78vh,720px);max-height:100%;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,inherit);box-shadow:0 18px 56px color-mix(in srgb,var(--dsw-alias-bg-mask-3,#000) 28%,transparent)}',

      '.dsam-head{display:flex;flex:none;align-items:center;gap:10px;padding:16px 18px 12px}',
      '.dsam-headIcon{display:inline-flex;flex:none;color:var(--dsw-alias-label-secondary)}',
      '.dsam-title{flex:1 1 auto;min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;font-weight:600;line-height:22px;color:var(--dsw-alias-label-primary)}',
      '.dsam-iconBtn{display:inline-flex;align-items:center;justify-content:center;padding:4px;border:none;border-radius:6px;background:none;color:var(--dsw-alias-label-tertiary);cursor:pointer;transition:color .12s,background-color .12s}',
      '.dsam-iconBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
      '.dsam-iconBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',

      '.dsam-tabs{display:flex;flex:none;gap:2px;padding:0 18px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dsam-tab{display:inline-flex;align-items:center;gap:6px;padding:7px 12px 8px;border:none;border-bottom:2px solid transparent;border-radius:6px 6px 0 0;background:none;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;cursor:pointer;transition:color .12s,background-color .12s}',
      '.dsam-tab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
      '.dsam-tab.is-on{color:var(--dsw-alias-brand-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.dsam-tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dsam-count{min-width:18px;padding:0 5px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.14));color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:500;line-height:16px;text-align:center;font-variant-numeric:tabular-nums}',

      '.dsam-body{display:flex;flex:1 1 auto;flex-direction:column;gap:8px;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:12px 18px}',
      '.dsam-note{flex:none;padding:0 0 4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',

      '.dsam-row{display:flex;flex:none;align-items:flex-start;gap:12px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);transition:border-color .14s,box-shadow .14s}',
      '.dsam-row:hover{border-color:var(--dsw-alias-border-l2);box-shadow:0 2px 10px color-mix(in srgb,var(--dsw-alias-bg-mask-3,#000) 8%,transparent)}',
      '.dsam-rowMain{flex:1 1 auto;min-width:0}',
      '.dsam-rowTitle{font-size:13px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsam-rowId{margin-top:1px;color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:11px;line-height:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsam-rowPath{display:inline-flex;align-items:center;gap:5px;max-width:100%;margin-top:4px;padding:0;border:none;background:none;color:var(--dsw-alias-brand-primary);font:inherit;font-size:11px;line-height:16px;text-align:left;cursor:pointer}',
      '.dsam-rowPath span{text-decoration:underline;text-underline-offset:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsam-rowPath:hover{color:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary))}',
      '.dsam-rowPath:disabled{cursor:wait;opacity:.6}',

      '.dsam-meta{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:6px}',
      '.dsam-badge{padding:1px 6px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;color:var(--dsw-alias-label-secondary);font-size:10px;line-height:15px;white-space:nowrap}',
      '.dsam-badge--ok{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 45%,transparent)}',
      '.dsam-badge--warn{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 45%,transparent)}',
      '.dsam-badge--idle{color:var(--dsw-alias-label-tertiary)}',

      '.dsam-actions{display:flex;flex:none;align-items:center;gap:6px;padding-top:1px}',
      '.dsam-btn{display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:16px;white-space:nowrap;cursor:pointer;transition:color .12s,border-color .12s,background-color .12s}',
      '.dsam-btn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.dsam-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsam-btn:active:not(:disabled){transform:scale(.98)}',
      '.dsam-btn:disabled{opacity:.5;cursor:default}',
      '.dsam-btn--danger{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 55%,transparent);color:var(--dsw-alias-state-error-primary)}',
      '.dsam-btn--danger:hover:not(:disabled){border-color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-primary-foreground,#fff)}',

      '.dsam-empty{display:flex;flex:1 1 auto;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:24px 0;color:var(--dsw-alias-label-tertiary)}',
      '.dsam-emptyTitle{font-size:13px;font-weight:500;color:var(--dsw-alias-label-secondary)}',
      '.dsam-emptyHint{font-size:12px;line-height:18px;text-align:center}',
      '.dsam-loading{display:flex;flex:1 1 auto;align-items:center;justify-content:center;padding:24px 0;font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.dsam-error{flex:none;margin:0;padding:8px 10px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 55%,transparent);border-radius:8px;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}',
      '.dsam-notice{flex:none;margin:0;padding:8px 10px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary) 50%,transparent);border-radius:8px;color:var(--dsw-alias-state-warn-primary);font-size:12px;line-height:18px}',

      '.dsam-foot{display:flex;flex:none;align-items:center;justify-content:space-between;gap:10px;padding:12px 18px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dsam-footInfo{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums}',

      // ── In-app confirmation dialog (replaces window.confirm) ──────────────
      '.dsam-confirmOverlay{position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:24px;background:color-mix(in srgb,var(--dsw-alias-bg-mask-3,#000) 30%,transparent)}',
      '.dsam-confirm{display:flex;flex-direction:column;width:430px;max-width:100%;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,inherit);box-shadow:0 16px 48px color-mix(in srgb,var(--dsw-alias-bg-mask-3,#000) 32%,transparent)}',
      '.dsam-confirmHead{display:flex;flex:none;align-items:center;gap:8px;padding:16px 18px 0}',
      '.dsam-confirmIcon{display:inline-flex;flex:none;color:var(--dsw-alias-state-error-primary)}',
      '.dsam-confirmTitle{flex:1 1 auto;min-width:0;margin:0;font-size:14px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary)}',
      '.dsam-confirmBody{padding:10px 18px 16px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
      '.dsam-confirmTarget{display:flex;align-items:baseline;gap:8px;margin:0 0 10px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent)}',
      '.dsam-confirmLabel{flex:none;color:var(--dsw-alias-label-tertiary);font-size:12px}',
      '.dsam-confirmValue{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-weight:500}',
      '.dsam-confirmLine{margin:0}',
      '.dsam-confirmLine + .dsam-confirmLine{margin-top:5px}',
      '.dsam-confirmSafe{color:var(--dsw-alias-state-success-primary)}',
      '.dsam-confirmFoot{display:flex;flex:none;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--dsw-alias-border-l1)}',
    ].join('');

    /** Insert the stylesheet once: prefer the `styles` builtin, else a <style>. */
    function injectCss() {
      try {
        if (typeof styles !== 'undefined' && styles && typeof styles.insert === 'function') {
          styles.insert(CSS);
          return;
        }
      } catch (_) {
        /* builtin unavailable — fall through */
      }
      if (typeof document === 'undefined' || !document.head) return;
      if (document.querySelector('style[data-plugin-css="dsh-archive-manager"]') !== null) return;
      var tag = document.createElement('style');
      tag.dataset.pluginCss = 'dsh-archive-manager';
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    function getJson(url) {
      return fetch(url).then(function (r) {
        return r.json();
      });
    }

    function postJson(url, body) {
      return fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      }).then(function (r) {
        return r.json();
      });
    }

    // ── Components ───────────────────────────────────────────────────────────
    function makeComponents(React) {
      function icon(size, children) {
        return React.createElement(
          'svg',
          {
            width: size,
            height: size,
            viewBox: '0 0 16 16',
            'aria-hidden': true,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.5,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          },
          children,
        );
      }

      function ArchiveIcon(p) {
        return icon((p && p.size) || 16, [
          React.createElement('rect', { key: 'a', x: 1.5, y: 2.5, width: 13, height: 3.5, rx: 1 }),
          React.createElement('path', { key: 'b', d: 'M2.5 6v6.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6' }),
          React.createElement('path', { key: 'c', d: 'M6.5 9h3' }),
        ]);
      }

      function TrashIcon(p) {
        return icon((p && p.size) || 14, [
          React.createElement('path', { key: 'a', d: 'M2.5 4h11M6.5 4V2.5h3V4M4 4l.6 9.5h6.8L12 4M6.5 6.5v4.5M9.5 6.5v4.5' }),
        ]);
      }

      function RestoreIcon(p) {
        return icon((p && p.size) || 14, [
          React.createElement('path', { key: 'a', d: 'M3 6.5a5 5 0 1 1-1 3.5' }),
          React.createElement('path', { key: 'b', d: 'M2 2.5v4h4' }),
        ]);
      }

      function FolderIcon(p) {
        return icon((p && p.size) || 12, [
          React.createElement('path', {
            key: 'a',
            d: 'M1.5 4.5a1 1 0 0 1 1-1h3l1.5 1.5h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-7.5Z',
          }),
        ]);
      }

      function CloseIcon(p) {
        return icon((p && p.size) || 15, [
          React.createElement('path', { key: 'a', d: 'M4 4l8 8M12 4l-8 8' }),
        ]);
      }

      function AlertIcon(p) {
        return icon((p && p.size) || 16, [
          React.createElement('circle', { key: 'a', cx: 8, cy: 8, r: 6.5 }),
          React.createElement('path', { key: 'b', d: 'M8 4.8v4' }),
          React.createElement('path', { key: 'c', d: 'M8 11.2v.2' }),
        ]);
      }

      /**
       * In-app confirmation dialog, styled with the harness tokens. Replaces the
       * Electron-native `window.confirm`, whose shell chrome (and package-name
       * title) does not match the app.
       */
      function ConfirmDialog(props) {
        var it = props.item || {};
        var busy = props.busy;
        return React.createElement(
          'div',
          {
            className: 'dsam-confirmOverlay',
            role: 'alertdialog',
            'aria-modal': true,
            onClick: function (e) {
              if (e.target === e.currentTarget && !busy) props.onCancel();
            },
          },
          React.createElement(
            'div',
            { className: 'dsam-confirm' },
            React.createElement(
              'div',
              { className: 'dsam-confirmHead' },
              React.createElement('span', { className: 'dsam-confirmIcon' }, React.createElement(AlertIcon, { size: 17 })),
              React.createElement('h4', { className: 'dsam-confirmTitle' }, props.title),
            ),
            React.createElement(
              'div',
              { className: 'dsam-confirmBody' },
              React.createElement(
                'div',
                { className: 'dsam-confirmTarget' },
                React.createElement('span', { className: 'dsam-confirmLabel' }, '会话'),
                React.createElement('span', { className: 'dsam-confirmValue', title: it.title || it.sessionId || '' }, it.title || '无标题会话'),
              ),
              React.createElement('p', { className: 'dsam-confirmLine' }, '将删除该会话的会话日志与投影缓存，此操作不可恢复。'),
              React.createElement('p', { className: 'dsam-confirmLine dsam-confirmSafe' }, '绑定的工作目录不会被删除。'),
            ),
            React.createElement(
              'div',
              { className: 'dsam-confirmFoot' },
              React.createElement(
                'button',
                { type: 'button', className: 'dsam-btn', onClick: props.onCancel, disabled: busy },
                '取消',
              ),
              React.createElement(
                'button',
                { type: 'button', className: 'dsam-btn dsam-btn--danger', onClick: props.onConfirm, disabled: busy },
                busy ? '删除中…' : '彻底删除',
              ),
            ),
          ),
        );
      }

      /** A path that opens the OS file manager at that folder. */
      function PathButton(props) {
        var busyState = React.useState(false);
        var busy = busyState[0];
        var setBusy = busyState[1];
        return React.createElement(
          'button',
          {
            type: 'button',
            className: 'dsam-rowPath',
            title: '在资源管理器中打开',
            disabled: busy,
            onClick: function (e) {
              e.preventDefault();
              e.stopPropagation();
              if (busy) return;
              setBusy(true);
              postJson(ROUTES.reveal, { path: props.path })
                .catch(function () {})
                .then(function () { setBusy(false); });
            },
          },
          React.createElement(FolderIcon, { size: 12 }),
          React.createElement('span', null, props.path),
        );
      }

      function MetaBadges(props) {
        var it = props.item;
        var badges = [];
        if (it.dataExists === false) {
          badges.push(React.createElement('span', { key: 'ghost', className: 'dsam-badge dsam-badge--warn' }, '数据已不存在'));
        } else {
          badges.push(React.createElement('span', { key: 'log', className: 'dsam-badge dsam-badge--ok' }, '会话日志'));
          if (it.hasCache) badges.push(React.createElement('span', { key: 'cache', className: 'dsam-badge dsam-badge--ok' }, '缓存'));
        }
        if (it.live) badges.push(React.createElement('span', { key: 'live', className: 'dsam-badge dsam-badge--idle' }, '运行中'));
        return React.createElement('div', { className: 'dsam-meta' }, badges);
      }

      function Row(props) {
        var it = props.item;
        var busy = props.busy;
        var isArchived = props.tab === 'archived';
        return React.createElement(
          'div',
          { className: 'dsam-row' },
          React.createElement(
            'div',
            { className: 'dsam-rowMain' },
            React.createElement('div', { className: 'dsam-rowTitle', title: it.title || '' }, it.title || '无标题会话'),
            React.createElement('div', { className: 'dsam-rowId', title: it.sessionId }, it.sessionId),
            it.cwd ? React.createElement(PathButton, { path: it.cwd }) : null,
            React.createElement(MetaBadges, { item: it }),
          ),
          React.createElement(
            'div',
            { className: 'dsam-actions' },
            isArchived
              ? React.createElement(
                  'button',
                  { type: 'button', className: 'dsam-btn', disabled: busy, onClick: function () { props.onUnarchive(it); } },
                  React.createElement(RestoreIcon, { size: 13 }),
                  '取消归档',
                )
              : React.createElement(
                  'button',
                  { type: 'button', className: 'dsam-btn', disabled: busy, onClick: function () { props.onArchive(it); } },
                  React.createElement(ArchiveIcon, { size: 13 }),
                  '归档',
                ),
            React.createElement(
              'button',
              { type: 'button', className: 'dsam-btn dsam-btn--danger', disabled: busy, onClick: function () { props.onDelete(it); } },
              React.createElement(TrashIcon, { size: 13 }),
              '删除',
            ),
          ),
        );
      }

      function ArchivePanel(props) {
        var tabState = React.useState('archived');
        var tab = tabState[0];
        var setTab = tabState[1];

        var dataState = React.useState(null);
        var data = dataState[0];
        var setData = dataState[1];

        var busyState = React.useState(false);
        var busy = busyState[0];
        var setBusy = busyState[1];

        var errorState = React.useState(null);
        var error = errorState[0];
        var setError = errorState[1];

        var noticeState = React.useState(null);
        var notice = noticeState[0];
        var setNotice = noticeState[1];

        // Pending destructive action awaiting in-app confirmation.
        var pendingState = React.useState(null);
        var pending = pendingState[0];
        var setPending = pendingState[1];

        function load() {
          return getJson(ROUTES.list)
            .then(function (r) {
              if (r && (Array.isArray(r.archived) || Array.isArray(r.active))) {
                setData({
                  archived: r.archived || [],
                  active: r.active || [],
                  pendingCount: typeof r.pendingCount === 'number' ? r.pendingCount : 0,
                });
              } else if (r && r.error) {
                setError(r.error);
              }
            })
            .catch(function (e) {
              setError(e && e.message ? e.message : String(e));
            });
        }

        React.useEffect(function () {
          load();
        }, []);

        /** Perform one action, then reload the list. */
        function execute(url, item, failText) {
          setBusy(true);
          setError(null);
          setNotice(null);
          postJson(url, { sessionId: item.sessionId })
            .then(function (res) {
              if (res && res.errors && res.errors.length) {
                setError(res.errors.join('；'));
              }
              // A queued delete IS a success: the data is gone and the row is
              // hidden from the panel. The leftover archive entry is swept at
              // the next start, so there is nothing the user must do.
              setBusy(false);
              return load();
            })
            .catch(function (e) {
              setBusy(false);
              setError((failText || '') + (e && e.message ? e.message : String(e)));
            });
        }

        /**
         * Entry point for a row action. Destructive actions route through the
         * in-app confirmation dialog instead of the native `window.confirm`.
         */
        function run(url, item, needsConfirm, failText) {
          if (busy) return;
          if (needsConfirm) {
            setPending({ url: url, item: item, failText: failText });
            return;
          }
          execute(url, item, failText);
        }

        var archived = (data && data.archived) || [];
        var active = (data && data.active) || [];
        var list = tab === 'archived' ? archived : active;

        return React.createElement(
          React.Fragment,
          null,
          React.createElement(
            'div',
            {
              className: 'dsam-overlay',
              role: 'dialog',
              'aria-modal': true,
              onClick: function (e) {
                if (e.target === e.currentTarget && !busy) props.onClose();
              },
            },
            React.createElement(
              'div',
              { className: 'dsam-panel' },
              React.createElement(
                'div',
                { className: 'dsam-head' },
                React.createElement('span', { className: 'dsam-headIcon' }, React.createElement(ArchiveIcon, { size: 17 })),
                React.createElement('h3', { className: 'dsam-title' }, '归档管理'),
                React.createElement(
                  'button',
                  { type: 'button', className: 'dsam-iconBtn', onClick: props.onClose, title: '关闭', 'aria-label': '关闭' },
                React.createElement(CloseIcon, { size: 15 }),
              ),
            ),
            React.createElement(
              'div',
              { className: 'dsam-tabs', role: 'tablist' },
              React.createElement(
                'button',
                {
                  type: 'button',
                  role: 'tab',
                  'aria-selected': tab === 'archived',
                  className: 'dsam-tab' + (tab === 'archived' ? ' is-on' : ''),
                  onClick: function () { setTab('archived'); },
                },
                '已归档',
                React.createElement('span', { className: 'dsam-count' }, data === null ? '–' : String(archived.length)),
              ),
              React.createElement(
                'button',
                {
                  type: 'button',
                  role: 'tab',
                  'aria-selected': tab === 'active',
                  className: 'dsam-tab' + (tab === 'active' ? ' is-on' : ''),
                  onClick: function () { setTab('active'); },
                },
                '活跃会话',
                React.createElement('span', { className: 'dsam-count' }, data === null ? '–' : String(active.length)),
              ),
            ),
            React.createElement(
              'div',
              { className: 'dsam-body' },
              error ? React.createElement('div', { className: 'dsam-error' }, error) : null,
              notice ? React.createElement('div', { className: 'dsam-notice' }, notice) : null,
              tab === 'archived'
                ? React.createElement('div', { className: 'dsam-note' }, '已归档会话的数据仍完整保留在磁盘上；删除才会真正移除数据。')
                : React.createElement('div', { className: 'dsam-note' }, '归档后会话从活跃列表隐藏，数据保持原样，可随时取消归档。'),
              data === null
                ? React.createElement('div', { className: 'dsam-loading' }, '正在加载…')
                : list.length === 0
                  ? React.createElement(
                      'div',
                      { className: 'dsam-empty' },
                      React.createElement(ArchiveIcon, { size: 24 }),
                      React.createElement('div', { className: 'dsam-emptyTitle' }, tab === 'archived' ? '没有已归档的会话' : '没有活跃会话'),
                      React.createElement(
                        'div',
                        { className: 'dsam-emptyHint' },
                        tab === 'archived' ? '归档任意会话后，它会出现在这里' : '新建对话后会出现在这里',
                      ),
                    )
                  : list.map(function (it) {
                      return React.createElement(Row, {
                        key: it.sessionId,
                        item: it,
                        tab: tab,
                        busy: busy,
                        onArchive: function (item) {
                          run(ROUTES.archive, item, null, '归档失败：');
                        },
                        onUnarchive: function (item) {
                          run(ROUTES.unarchive, item, null, '取消归档失败：');
                        },
                        onDelete: function (item) {
                          run(ROUTES.del, item, true, '删除失败：');
                        },
                      });
                    }),
            ),
            React.createElement(
              'div',
              { className: 'dsam-foot' },
              React.createElement(
                'span',
                { className: 'dsam-footInfo' },
                data === null
                  ? ''
                  : '已归档 ' + archived.length + ' · 活跃 ' + active.length +
                    (data.pendingCount > 0 ? ' · 待清理 ' + data.pendingCount : ''),
              ),
              React.createElement(
                'button',
                { type: 'button', className: 'dsam-btn', disabled: busy, onClick: function () { load(); } },
                busy ? '处理中…' : '刷新',
              ),
            ),
          ),
        ),
          pending
            ? React.createElement(ConfirmDialog, {
                title: '彻底删除会话',
                item: pending.item,
                busy: busy,
                onCancel: function () { setPending(null); },
                onConfirm: function () {
                  var p = pending;
                  setPending(null);
                  if (p) execute(p.url, p.item, p.failText);
                },
              })
            : null,
        );
      }

      return { ArchiveIcon: ArchiveIcon, ArchivePanel: ArchivePanel };
    }

    // ── Module-level panel store (survives slot re-renders) ──────────────────
    var panelOpen = false;
    var panelListeners = [];

    function setPanelOpen(next) {
      panelOpen = next;
      panelListeners.forEach(function (fn) {
        try { fn(next); } catch (_) {}
      });
    }

    function apply(ctx) {
      var React;
      var ReactDOM;
      try {
        React = require('react');
      } catch (e) {
        console.error('[archive-manager] react 不可用，跳过 UI：' + String(e));
        return;
      }
      try {
        ReactDOM = require('react-dom');
      } catch (_) {
        ReactDOM = null;
      }

      injectCss();

      var C = makeComponents(React);
      var ArchivePanel = C.ArchivePanel;

      function PanelHost() {
        var stateArr = React.useState(panelOpen);
        var open = stateArr[0];
        var setOpen = stateArr[1];

        React.useEffect(function () {
          function onChg(next) { setOpen(next); }
          panelListeners.push(onChg);
          return function () {
            var i = panelListeners.indexOf(onChg);
            if (i >= 0) panelListeners.splice(i, 1);
          };
        }, []);

        if (!open) return null;
        return React.createElement(ArchivePanel, { onClose: function () { setPanelOpen(false); } });
      }

      // Mount the panel host on document.body, outside every slot host, so a
      // slot re-render cannot unmount an open panel.
      if (ReactDOM && typeof document !== 'undefined' && document.body) {
        var rootEl = document.createElement('div');
        rootEl.id = 'dsh-archive-manager-panel-root';
        document.body.appendChild(rootEl);
        var el = React.createElement(PanelHost);
        if (ReactDOM.createRoot) ReactDOM.createRoot(rootEl).render(el);
        else if (ReactDOM.render) ReactDOM.render(el, rootEl);
      }

      // Sidebar-footer entry.
      ctx.slots.inject('sidebar.footer.action', function* () {
        yield ctx.slots.register(
          { name: 'sidebar.footer.action', id: 'archive-manager-entry', order: 89, label: '归档管理' },
          function () {
            return React.createElement(
              'button',
              {
                type: 'button',
                className: 'dsam-iconBtn',
                onClick: function () { setPanelOpen(true); },
                title: '归档管理',
                'aria-label': '归档管理',
              },
              React.createElement(C.ArchiveIcon, { size: 16 }),
            );
          },
        );
      });
    }

    exports.apply = apply;
    exports.inject = ['slots'];
    return module.exports;
  },
});
