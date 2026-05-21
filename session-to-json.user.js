// ==UserScript==
// @name         SessionToJson
// @namespace    local.session-to-json
// @version      1.0.0
// @license      MIT
// @description  Read ChatGPT session JSON and convert it to CPA/Codex auth JSON.
// @match        *://*/*
// @match        file:///*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @connect      chatgpt.com
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  if (window.top !== window.self) {
    return;
  }

  const DEFAULT_SERVER_BASE_URL = 'http://localhost:8317';
  const DEFAULT_CPA_PASSWORD = 'admin123';
  const SERVER_BASE_URL_STORAGE_KEY = 'serverBaseUrl';
  const CPA_PASSWORD_STORAGE_KEY = 'cpaPassword';
  const UPLOAD_PATH = '/v0/management/auth-files';
  const CHATGPT_SESSION_URL = 'https://chatgpt.com/api/auth/session';
  const CHATGPT_PLUS_ELIGIBILITY_URL = 'https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27?timezone_offset_min=-480';
  const CHATGPT_PLUS_PLAN_ID = 'chatgptplusplan';
  const CONVERSION_RULES = [
    { from: 'accessToken', to: 'access_token' },
    { from: 'account.id', to: 'account_id' },
    { from: 'user.email', to: 'email' },
    { from: 'expires', to: 'expired' },
    { from: 'account.id', to: 'chatgpt_account_id' },
    { from: 'account.planType', to: 'plan_type' },
    { from: 'account.planType', to: 'chatgpt_plan_type' },
    { from: 'sessionToken', to: 'session_token' },
    { to: 'last_refresh', value: '' },
    { to: 'refresh_token', value: '' },
    { to: 'type', value: 'codex' },
    { to: 'disabled', value: false },
    { to: 'id_token_synthetic', value: true }
  ];

  const elements = createApp();

  elements.toggleButton.addEventListener('click', openApp);
  elements.backdrop.addEventListener('click', closeApp);
  elements.closeButton.addEventListener('click', closeApp);
  document.addEventListener('keydown', closeAppOnEscape);
  elements.fetchChatGptSessionButton.addEventListener('click', fetchChatGptSessionJson);
  elements.readPageButton.addEventListener('click', readPageJson);
  elements.convertButton.addEventListener('click', convertJson);
  elements.copyButton.addEventListener('click', copyResult);
  elements.downloadButton.addEventListener('click', downloadResult);
  elements.uploadButton.addEventListener('click', uploadResult);
  elements.toggleCpaPasswordButton.addEventListener('click', toggleCpaPasswordVisibility);
  elements.serverUrlInput.addEventListener('change', saveServerBaseUrl);
  elements.serverUrlInput.addEventListener('blur', saveServerBaseUrl);
  elements.cpaPasswordInput.addEventListener('change', saveCpaPassword);
  elements.cpaPasswordInput.addEventListener('blur', saveCpaPassword);
  initializeStoredValues();

  function createApp() {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'closed' });

    host.id = 'session-to-json-userscript-root';
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          color-scheme: dark;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        * {
          box-sizing: border-box;
        }

        button,
        input,
        textarea {
          font: inherit;
        }

        .launcher {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 2147483647;
          min-height: 38px;
          border: 1px solid rgba(75, 85, 99, 0.72);
          border-radius: 999px;
          padding: 0 16px;
          background: #111827;
          color: #f9fafb;
          cursor: pointer;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
          font-size: 13px;
          font-weight: 700;
        }

        .backdrop {
          position: fixed;
          inset: 0;
          z-index: 2147483646;
          background: rgba(3, 7, 18, 0.62);
          backdrop-filter: blur(3px);
        }

        .backdrop[hidden] {
          display: none;
        }

        .app {
          position: fixed;
          top: 50%;
          left: 50%;
          z-index: 2147483647;
          display: grid;
          gap: 12px;
          width: min(640px, calc(100vw - 36px));
          max-height: calc(100vh - 36px);
          overflow: auto;
          padding: 14px;
          border: 1px solid rgba(75, 85, 99, 0.72);
          border-radius: 16px;
          background: linear-gradient(145deg, #050816 0%, #0b1020 52%, #111827 100%);
          color: #e5e7eb;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
          transform: translate(-50%, -50%);
        }

        .app[hidden] {
          display: none;
        }

        .header {
          display: grid;
          gap: 10px;
          padding: 12px;
          border: 1px solid rgba(75, 85, 99, 0.6);
          border-radius: 14px;
          background: rgba(17, 24, 39, 0.88);
        }

        .header-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        h1 {
          margin: 0;
          color: #f9fafb;
          font-size: 20px;
          line-height: 1.1;
          letter-spacing: 0.02em;
        }

        .header-actions,
        .actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 8px;
        }

        .panel {
          display: grid;
          gap: 7px;
          padding: 12px;
          border: 1px solid rgba(75, 85, 99, 0.58);
          border-radius: 14px;
          background: rgba(17, 24, 39, 0.78);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
        }

        label {
          color: #d1d5db;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        input,
        textarea {
          width: 100%;
          border: 1px solid rgba(75, 85, 99, 0.72);
          border-radius: 10px;
          padding: 10px;
          background: rgba(3, 7, 18, 0.7);
          color: #f3f4f6;
          font-family: "Cascadia Code", Consolas, monospace;
          font-size: 12px;
          line-height: 1.5;
          outline: none;
          caret-color: #e5e7eb;
        }

        textarea {
          min-height: 150px;
          resize: vertical;
        }

        input {
          min-height: 38px;
          font-family: inherit;
        }

        input::placeholder,
        textarea::placeholder {
          color: #6b7280;
        }

        input:focus,
        textarea:focus {
          border-color: #9ca3af;
          box-shadow: 0 0 0 3px rgba(156, 163, 175, 0.16);
        }

        .password-field {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
        }

        button {
          min-height: 36px;
          border: 1px solid rgba(75, 85, 99, 0.72);
          border-radius: 10px;
          padding: 0 12px;
          background: rgba(31, 41, 55, 0.88);
          color: #e5e7eb;
          cursor: pointer;
          font-size: 12px;
          box-shadow: 0 8px 18px rgba(0, 0, 0, 0.2);
        }

        button:hover {
          border-color: #9ca3af;
          background: rgba(55, 65, 81, 0.92);
          color: #f9fafb;
        }

        button.primary {
          border-color: #4b5563;
          background: #374151;
          color: #ffffff;
          font-weight: 700;
        }

        .status {
          min-height: 20px;
          margin: 0;
          padding: 8px 10px;
          border: 1px solid rgba(75, 85, 99, 0.52);
          border-radius: 10px;
          background: rgba(17, 24, 39, 0.72);
          color: #d1d5db;
          font-size: 12px;
          line-height: 1.45;
        }

        .status.error {
          border-color: rgba(248, 113, 113, 0.5);
          color: #fca5a5;
        }
      </style>
      <button id="toggleButton" class="launcher" type="button">SessionToJson</button>
      <div id="backdrop" class="backdrop" hidden></div>
      <main id="app" class="app" aria-label="SessionToJson" role="dialog" aria-modal="true" hidden>
        <header class="header">
          <div class="header-top">
            <h1>SessionToJson</h1>
            <button id="closeButton" type="button">收起</button>
          </div>
          <div class="header-actions">
            <button id="fetchChatGptSessionButton" type="button">一键获取 Session</button>
            <button id="readPageButton" type="button">读取页面 JSON</button>
          </div>
        </header>

        <section class="panel">
          <label for="pageJson">页面 JSON</label>
          <textarea id="pageJson" spellcheck="false" placeholder="打开正文为 JSON 的页面，然后点击读取页面 JSON。"></textarea>
        </section>

        <div class="actions">
          <button id="convertButton" type="button" class="primary">转换</button>
        </div>

        <section class="panel">
          <label for="outputJson">输出 JSON</label>
          <textarea id="outputJson" spellcheck="false" readonly placeholder="转换后的 JSON 会显示在这里。"></textarea>
        </section>

        <section class="panel">
          <label for="serverUrl">服务器地址</label>
          <input id="serverUrl" type="url" spellcheck="false" placeholder="http://localhost:8317">
        </section>

        <section class="panel">
          <label for="cpaPassword">CPA 密码</label>
          <div class="password-field">
            <input id="cpaPassword" type="password" spellcheck="false" placeholder="请输入 CPA 密码">
            <button id="toggleCpaPasswordButton" type="button" aria-label="显示 CPA 密码">显示</button>
          </div>
        </section>

        <p id="status" class="status" role="status" aria-live="polite"></p>

        <div class="actions">
          <button id="copyButton" type="button">复制结果</button>
          <button id="downloadButton" type="button">下载 JSON</button>
          <button id="uploadButton" type="button">上传到 CPA</button>
        </div>
      </main>
    `;

    document.documentElement.appendChild(host);

    return {
      app: shadow.getElementById('app'),
      backdrop: shadow.getElementById('backdrop'),
      toggleButton: shadow.getElementById('toggleButton'),
      closeButton: shadow.getElementById('closeButton'),
      pageJsonInput: shadow.getElementById('pageJson'),
      outputJsonInput: shadow.getElementById('outputJson'),
      serverUrlInput: shadow.getElementById('serverUrl'),
      cpaPasswordInput: shadow.getElementById('cpaPassword'),
      toggleCpaPasswordButton: shadow.getElementById('toggleCpaPasswordButton'),
      statusElement: shadow.getElementById('status'),
      fetchChatGptSessionButton: shadow.getElementById('fetchChatGptSessionButton'),
      readPageButton: shadow.getElementById('readPageButton'),
      convertButton: shadow.getElementById('convertButton'),
      copyButton: shadow.getElementById('copyButton'),
      downloadButton: shadow.getElementById('downloadButton'),
      uploadButton: shadow.getElementById('uploadButton')
    };
  }

  function openApp() {
    elements.backdrop.hidden = false;
    elements.app.hidden = false;
  }

  function closeApp() {
    elements.app.hidden = true;
    elements.backdrop.hidden = true;
  }

  function closeAppOnEscape(event) {
    if (event.key === 'Escape' && !elements.app.hidden) {
      closeApp();
    }
  }

  async function fetchChatGptSessionJson() {
    setStatus('正在获取 ChatGPT Session...');

    try {
      const session = await requestJson(CHATGPT_SESSION_URL, {}, '获取 ChatGPT Session 失败');

      elements.pageJsonInput.value = JSON.stringify(session, null, 2);
      convertJson();
      await checkChatGptPlusEligibilityForFreePlan(session);
    } catch (error) {
      setError(`${getErrorMessage(error)}请确认已登录 ChatGPT。`);
    }
  }

  async function checkChatGptPlusEligibilityForFreePlan(source) {
    if (readPathOrDefault(source, 'account.planType', '') !== 'free') {
      return;
    }

    await checkChatGptPlusEligibility(source.accessToken);
  }

  async function checkChatGptPlusEligibility(accessToken) {
    if (!accessToken) {
      throw new Error('获取 ChatGPT Session 失败：缺少 accessToken');
    }

    const result = await requestJson(
      CHATGPT_PLUS_ELIGIBILITY_URL,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      '检查 ChatGPT Plus 资格失败'
    );

    setChatGptPlusEligibilityStatus(hasChatGptPlusEligibility(result));
  }

  function hasChatGptPlusEligibility(result) {
    const offers = result && result.accounts && result.accounts.default && result.accounts.default.eligible_offers && Array.isArray(result.accounts.default.eligible_offers.offers)
      ? result.accounts.default.eligible_offers.offers
      : [];
    const plusOffer = offers.find((offer) => offer && offer.id === CHATGPT_PLUS_PLAN_ID);

    return Boolean(plusOffer && plusOffer.epl_enabled);
  }

  function setChatGptPlusEligibilityStatus(hasEligibility) {
    const message = hasEligibility ? '此账户有 ChatGPT Plus 订阅资格。' : '此账户暂无 ChatGPT Plus 订阅资格。';

    setStatus(`${elements.statusElement.textContent}${message}`);
  }

  async function readPageJson() {
    setStatus('正在读取当前页面 JSON...');

    try {
      const text = document.body ? document.body.innerText.trim() : '';
      const source = JSON.parse(text);

      elements.pageJsonInput.value = JSON.stringify(source, null, 2);
      convertJson();
      await checkChatGptPlusEligibilityForFreePlan(source);
    } catch (error) {
      setError(`无法从此页面读取有效 JSON。${getErrorMessage(error)}`);
    }
  }

  function convertJson() {
    try {
      const source = parseJson(elements.pageJsonInput.value);
      const result = convertSessionJson(source);

      elements.outputJsonInput.value = JSON.stringify(result.output, null, 2);
      setConversionStatus(result.warnings);
    } catch (error) {
      setError(getErrorMessage(error));
    }
  }

  async function copyResult() {
    try {
      requireOutput();

      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(elements.outputJsonInput.value, 'text');
      } else {
        await navigator.clipboard.writeText(elements.outputJsonInput.value);
      }

      setStatus('复制成功。');
    } catch (error) {
      setError(getErrorMessage(error));
    }
  }

  function downloadResult() {
    try {
      requireOutput();

      const source = parseJson(elements.pageJsonInput.value);
      const blob = new Blob([elements.outputJsonInput.value], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = buildDownloadFilename(source);
      link.click();
      URL.revokeObjectURL(url);
      setStatus('开始下载。');
    } catch (error) {
      setError(getErrorMessage(error));
    }
  }

  async function uploadResult() {
    try {
      requireOutput();

      const source = parseJson(elements.pageJsonInput.value);
      const password = getCpaPassword(elements.cpaPasswordInput.value);
      const file = new File([elements.outputJsonInput.value], buildDownloadFilename(source), { type: 'application/json' });
      const formData = new FormData();

      formData.append('file', file);

      const response = await request(buildUploadUrl(elements.serverUrlInput.value), {
        method: 'POST',
        headers: { Authorization: `Bearer ${password}` },
        data: formData
      });

      if (!isSuccessStatus(response.status)) {
        throw new Error(`上传失败：HTTP ${response.status}`);
      }

      setStatus('上传成功。');
    } catch (error) {
      setError(getErrorMessage(error));
    }
  }

  function convertSessionJson(source) {
    const output = {};
    const warnings = [];

    for (const rule of CONVERSION_RULES) {
      if (Object.prototype.hasOwnProperty.call(rule, 'value')) {
        writePath(output, rule.to, rule.value);
        continue;
      }

      const resolved = readPath(source, rule.from);
      if (!resolved.found) {
        warnings.push(`Missing value for path "${rule.from}"`);
        continue;
      }

      writePath(output, rule.to, resolved.value);
    }

    writePath(
      output,
      'id_token',
      buildIdToken(
        readPath(source, 'user.email').value,
        readPath(source, 'account.id').value,
        readPath(source, 'account.planType').value,
        readPath(source, 'user.id').value,
        readPath(source, 'expires').value
      )
    );

    return { output, warnings };
  }

  function buildIdToken(email, accountId, planType, userId, expires) {
    if (!accountId) {
      return '';
    }

    const now = Math.trunc(Date.now() / 1000);
    const exp = epochFromValue(expires) || now + 90 * 24 * 60 * 60;
    const authInfo = { chatgpt_account_id: accountId };

    if (planType) {
      authInfo.chatgpt_plan_type = planType;
    }

    if (userId) {
      authInfo.chatgpt_user_id = userId;
      authInfo.user_id = userId;
    }

    const payload = {
      iat: now,
      exp,
      'https://api.openai.com/auth': authInfo
    };

    if (email) {
      payload.email = email;
    }

    return `${genBase64({ alg: 'none', typ: 'JWT', cpa_synthetic: true })}.${genBase64(payload)}.`;
  }

  function epochFromValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value);
    }

    if (typeof value === 'string' && value.trim()) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return Math.trunc(numeric);
      }

      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) {
        return Math.trunc(parsed / 1000);
      }
    }

    return 0;
  }

  function genBase64(value) {
    const json = JSON.stringify(value);

    return btoa(unescape(encodeURIComponent(json))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error('页面 JSON 不是有效的 JSON。');
    }
  }

  function buildDownloadFilename(source) {
    const email = sanitizeFilenamePart(readPathOrDefault(source, 'user.email', 'unknown-email'));
    const plan = sanitizeFilenamePart(readPathOrDefault(source, 'account.planType', 'unknown-plan'));

    return `codex-${email}-${plan}.json`;
  }

  function getServerBaseUrl(value) {
    const trimmed = String(value || '').trim();

    return trimmed || DEFAULT_SERVER_BASE_URL;
  }

  function getCpaPassword(value) {
    return String(value || DEFAULT_CPA_PASSWORD).trim();
  }

  function buildUploadUrl(value) {
    const baseUrl = getServerBaseUrl(value);
    let parsed;

    try {
      parsed = new URL(baseUrl);
    } catch (error) {
      throw new Error('服务器地址不是有效的 URL。');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('服务器地址不是有效的 URL。');
    }

    return `${baseUrl.replace(/\/+$/, '')}${UPLOAD_PATH}`;
  }

  async function initializeStoredValues() {
    elements.serverUrlInput.value = getServerBaseUrl(await getStoredValue(SERVER_BASE_URL_STORAGE_KEY, DEFAULT_SERVER_BASE_URL));
    elements.cpaPasswordInput.value = getCpaPassword(await getStoredValue(CPA_PASSWORD_STORAGE_KEY, DEFAULT_CPA_PASSWORD));
  }

  function saveServerBaseUrl() {
    const value = getServerBaseUrl(elements.serverUrlInput.value);

    elements.serverUrlInput.value = value;
    setStoredValue(SERVER_BASE_URL_STORAGE_KEY, value);
  }

  function saveCpaPassword() {
    const value = String(elements.cpaPasswordInput.value || '').trim();

    elements.cpaPasswordInput.value = value;
    setStoredValue(CPA_PASSWORD_STORAGE_KEY, value);
  }

  function toggleCpaPasswordVisibility() {
    const shouldShow = elements.cpaPasswordInput.type === 'password';

    elements.cpaPasswordInput.type = shouldShow ? 'text' : 'password';
    elements.toggleCpaPasswordButton.textContent = shouldShow ? '隐藏' : '显示';
    elements.toggleCpaPasswordButton.setAttribute('aria-label', shouldShow ? '隐藏 CPA 密码' : '显示 CPA 密码');
  }

  function getStoredValue(key, fallback) {
    if (typeof GM_getValue === 'function') {
      return Promise.resolve(GM_getValue(key, fallback));
    }

    const value = localStorage.getItem(`sessionToJson:${key}`);

    return Promise.resolve(value === null ? fallback : value);
  }

  function setStoredValue(key, value) {
    if (typeof GM_setValue === 'function') {
      GM_setValue(key, value);
      return;
    }

    localStorage.setItem(`sessionToJson:${key}`, value);
  }

  async function requestJson(url, options, errorPrefix) {
    const response = await request(url, { ...options, responseType: 'json' });

    if (!isSuccessStatus(response.status)) {
      throw new Error(`${errorPrefix}：HTTP ${response.status}`);
    }

    if (response.body !== undefined && response.body !== null && response.body !== '') {
      return response.body;
    }

    try {
      return JSON.parse(response.text);
    } catch (error) {
      throw new Error(`${errorPrefix}：响应不是有效 JSON`);
    }
  }

  function request(url, options = {}) {
    const target = new URL(url, location.href);
    const method = options.method || 'GET';
    const headers = options.headers || {};

    if (target.origin === location.origin || typeof GM_xmlhttpRequest !== 'function') {
      return fetch(target.href, {
        method,
        headers,
        body: options.data,
        credentials: 'include'
      }).then(async (response) => {
        const text = await response.text();

        return {
          status: response.status,
          text,
          body: parseResponseBody(text, options.responseType)
        };
      });
    }

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url: target.href,
        headers,
        data: options.data,
        responseType: options.responseType || '',
        anonymous: false,
        onload: (response) => {
          resolve({
            status: response.status,
            text: response.responseText || '',
            body: response.response
          });
        },
        onerror: () => reject(new Error('网络请求失败。')),
        ontimeout: () => reject(new Error('网络请求超时。'))
      });
    });
  }

  function parseResponseBody(text, responseType) {
    if (responseType !== 'json' || !text) {
      return text;
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  function isSuccessStatus(status) {
    return status >= 200 && status < 300;
  }

  function readPath(source, path) {
    const parts = path.split('.').filter(Boolean);
    let current = source;

    for (const part of parts) {
      if (!hasOwn(current, part)) {
        return { found: false };
      }

      current = current[part];
    }

    return { found: true, value: current };
  }

  function readPathOrDefault(source, path, fallback) {
    const resolved = readPath(source, path);

    return resolved.found ? String(resolved.value) : fallback;
  }

  function writePath(target, path, value) {
    const parts = path.split('.').filter(Boolean);
    let current = target;

    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];

      if (!hasOwn(current, part) || current[part] === null || typeof current[part] !== 'object' || Array.isArray(current[part])) {
        current[part] = {};
      }

      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
  }

  function sanitizeFilenamePart(value) {
    return String(value).replace(/[\\/:*?"<>|]/g, '-');
  }

  function hasOwn(value, key) {
    return value !== null && (typeof value === 'object' || typeof value === 'function') && Object.prototype.hasOwnProperty.call(value, key);
  }

  function requireOutput() {
    if (!elements.outputJsonInput.value.trim()) {
      throw new Error('请先转换 JSON 再执行此操作。');
    }
  }

  function setConversionStatus(warnings) {
    if (!warnings.length) {
      setStatus('转换完成。');
      return;
    }

    setStatus(`转换完成，但有 ${warnings.length} 条警告：${warnings.join(', ')}`);
  }

  function setStatus(message) {
    elements.statusElement.textContent = message;
    elements.statusElement.classList.remove('error');
  }

  function setError(message) {
    elements.statusElement.textContent = message;
    elements.statusElement.classList.add('error');
  }

  function getErrorMessage(error) {
    return error && error.message ? error.message : String(error);
  }
})();
