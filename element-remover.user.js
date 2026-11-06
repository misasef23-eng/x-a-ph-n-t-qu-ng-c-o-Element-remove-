// ==UserScript==
// @name         Element Remover
// @namespace    MisaSef
// @version      1.0.0
// @description  Click an element to hide it on future visits. No coding required.
// @match        *://*/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(() => {
    'use strict';

    const STORAGE_KEY = 'element-remover-rules-v1';
    const STYLE_ID = '__element_remover_style__';
    const PICKER_ID = '__element_remover_picker__';

    const getRules = () => GM_getValue(STORAGE_KEY, {});
    const saveRules = rules => GM_setValue(STORAGE_KEY, rules);

    function hostname() {
        return location.hostname.toLowerCase();
    }

    function escapeCss(value) {
        if (window.CSS?.escape) return CSS.escape(value);
        return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
    }

    function isUsefulId(id) {
        return id && id.length < 80 &&
            !/^(ember|react|radix|headlessui|mui|chakra|:r|[a-z]+-\d{3,})/i.test(id);
    }

    function stableSelector(el) {
        if (!(el instanceof Element)) return null;

        if (isUsefulId(el.id)) {
            const s = `#${escapeCss(el.id)}`;
            try { if (document.querySelectorAll(s).length === 1) return s; } catch {}
        }

        const attrs = ['data-testid', 'data-test', 'data-cy', 'data-id'];
        for (const attr of attrs) {
            const value = el.getAttribute(attr);
            if (value && value.length < 100) {
                const s = `[${attr}="${CSS.escape(value)}"]`;
                try { if (document.querySelectorAll(s).length === 1) return s; } catch {}
            }
        }

        const classes = [...el.classList]
            .filter(c => c.length < 50 && !/^(css-|sc-|jsx-|_[a-z0-9]{5,})/i.test(c))
            .slice(0, 3);

        if (classes.length) {
            const s = `${el.tagName.toLowerCase()}.${classes.map(escapeCss).join('.')}`;
            try { if (document.querySelectorAll(s).length <= 5) return s; } catch {}
        }

        // Fallback: a short DOM path using :nth-of-type()
        const parts = [];
        let node = el;
        while (node && node.nodeType === 1 && node !== document.body) {
            let part = node.tagName.toLowerCase();
            if (node.parentElement) {
                const same = [...node.parentElement.children]
                    .filter(x => x.tagName === node.tagName);
                if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
            }
            parts.unshift(part);
            const candidate = parts.join(' > ');
            try {
                if (document.querySelectorAll(candidate).length === 1) return candidate;
            } catch {}
            node = node.parentElement;
            if (parts.length >= 6) break;
        }
        return parts.join(' > ');
    }

    function applyRules() {
        const rules = getRules();
        const selectors = rules[hostname()] || [];
        if (!selectors.length) return;

        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            (document.head || document.documentElement).appendChild(style);
        }

        // CSS hiding is faster and survives dynamically-created DOM elements.
        style.textContent = selectors.map(s => `${s}{display:none!important;}`).join('\n');
    }

    function addRule(selector) {
        if (!selector) return;
        const rules = getRules();
        const host = hostname();
        rules[host] ||= [];
        if (!rules[host].includes(selector)) {
            rules[host].push(selector);
            saveRules(rules);
        }
        applyRules();
    }

    function removeRule(selector) {
        const rules = getRules();
        const host = hostname();
        rules[host] = (rules[host] || []).filter(x => x !== selector);
        if (!rules[host].length) delete rules[host];
        saveRules(rules);
        applyRules();
    }

    function showPicker() {
        if (document.getElementById(PICKER_ID)) return;

        const overlay = document.createElement('div');
        overlay.id = PICKER_ID;
        Object.assign(overlay.style, {
            position: 'fixed', inset: '0', zIndex: '2147483647',
            pointerEvents: 'none', cursor: 'crosshair'
        });

        const label = document.createElement('div');
        label.textContent = '🎯 Element Remover — click an element to hide it • Esc to cancel';
        Object.assign(label.style, {
            position: 'fixed', top: '14px', left: '50%',
            transform: 'translateX(-50%)',
            padding: '10px 16px', borderRadius: '10px',
            background: '#111', color: '#fff',
            font: '14px system-ui,sans-serif',
            boxShadow: '0 4px 18px #0005',
            pointerEvents: 'auto'
        });
        overlay.appendChild(label);
        document.documentElement.appendChild(overlay);

        let highlighted = null;
        let previousOutline = '';

        const cleanup = () => {
            if (highlighted) highlighted.style.outline = previousOutline;
            overlay.remove();
            document.removeEventListener('mousemove', move, true);
            document.removeEventListener('click', click, true);
            document.removeEventListener('keydown', key, true);
        };

        const move = e => {
            const el = document.elementFromPoint(e.clientX, e.clientY);
            if (!el || el === overlay || overlay.contains(el)) return;
            if (highlighted !== el) {
                if (highlighted) highlighted.style.outline = previousOutline;
                highlighted = el;
                previousOutline = el.style.outline;
                el.style.outline = '3px solid #ff3b30';
            }
        };

        const click = e => {
            if (overlay.contains(e.target)) return;
            e.preventDefault();
            e.stopPropagation();
            const el = document.elementFromPoint(e.clientX, e.clientY);
            const selector = stableSelector(el);
            if (!selector) {
                cleanup();
                alert('Không tạo được selector ổn định cho element này.');
                return;
            }

            const ok = confirm(`Ẩn element này?\n\n${selector}`);
            cleanup();
            if (ok) addRule(selector);
        };

        const key = e => {
            if (e.key === 'Escape') cleanup();
        };

        document.addEventListener('mousemove', move, true);
        document.addEventListener('click', click, true);
        document.addEventListener('keydown', key, true);
    }

    function showRules() {
        const rules = getRules();
        const host = hostname();
        const list = rules[host] || [];

        if (!list.length) {
            alert(`Element Remover\n\n${host}\n\nChưa có element nào được ẩn.`);
            return;
        }

        const choice = prompt(
            `Element Remover — ${host}\n\n` +
            list.map((s, i) => `${i + 1}. ${s}`).join('\n') +
            `\n\nNhập số để xóa rule, hoặc Cancel để đóng.`
        );

        if (choice === null) return;
        const index = Number(choice) - 1;
        if (Number.isInteger(index) && list[index]) removeRule(list[index]);
    }

    GM_registerMenuCommand('🎯 Chọn element để ẩn', showPicker);
    GM_registerMenuCommand('📋 Quản lý element đã ẩn', showRules);

    // Also expose a tiny global API for a future GUI.
    window.ElementRemover = { pick: showPicker, rules: getRules };

    applyRules();

    // Re-apply shortly after startup because some sites replace <head>.
    setTimeout(applyRules, 100);
    setTimeout(applyRules, 1000);
})();
