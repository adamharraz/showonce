// Real media + delayed local API fixtures; tests cancellation without model calls.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.BASE_URL || 'http://127.0.0.1:8017';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    for (const phase of ['permission', 'session', 'recording', 'phone-permission']) {
      const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
      const page = await context.newPage();
      let sessions = 0, recordings = 0, finishes = 0, release;
      let reached;
      const gateReached = new Promise(resolve => { reached = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      const session = { id: 'late-test', owner_id: 'local-instructor', source: 'camera', mode: 'teach', state: 'capturing',
        recording_required: true, created_at: new Date().toISOString(), lesson_id: 'late-lesson', model: 'test-only', gaps: [] };
      await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        let data = {};
        if (path === '/api/config') data = { local_login: true, demo_mode: false, ai_configured: false, free_tier_confirmed: false, analysis_interval: 10, daily_limit: 120 };
        else if (path === '/api/me') data = { id: 'local-instructor', role: 'instructor' };
        else if (path === '/api/lessons') data = [];
        else if (path === '/api/sessions' && route.request().method() === 'POST') {
          sessions++; if (phase === 'session') { reached(); await gate; } data = session;
        } else if (path === '/api/sessions') data = [];
        else if (path.endsWith('/recording/start')) { recordings++; if (phase === 'recording') { reached(); await gate; } data = { state: 'uploading' }; }
        else if (path.endsWith('/finish')) { finishes++; data = {...session, state:'finished', finished_at:new Date().toISOString()}; }
        else data = { session, observations: [], assessments: [], job: null };
        await route.fulfill({ json: data });
      });
      await page.addInitScript(phase => {
        sessionStorage.setItem('showonce-token', 'test-only');
        const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        window.captureSettled = false; window.openedSockets = 0;
        navigator.mediaDevices.getUserMedia = constraints => {
          window.captureRequested = true;
          const get = async () => { window.lateStream = await acquire(constraints); return window.lateStream; };
          const request = phase.includes('permission') ? new Promise(resolve => { window.releaseCapture = async () => resolve(await get()); }) : get();
          return request.finally(() => { window.captureSettled = true; });
        };
        window.WebSocket = class {
          static OPEN = 1; readyState = 1;
          constructor() { window.openedSockets++; queueMicrotask(() => this.onopen?.()); }
          send() {}
          close() { this.readyState = 3; this.onclose?.(); }
        };
      }, phase);
      if (phase === 'phone-permission') {
        await page.goto(base + '/capture/late-test#test-ticket');
        await page.getByRole('button', {name:'Connect camera', exact:true}).click();
      } else {
        await page.goto(base + '/studio');
        await page.getByRole('button', {name:'Start demonstration', exact:true}).click();
      }
      if (phase.includes('permission')) await page.waitForFunction(() => window.captureRequested);
      else await gateReached;
      if (phase === 'phone-permission') await page.evaluate(() => { history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate')); });
      else await page.getByRole('button', {name:'Lessons', exact:true}).click();
      await page.waitForFunction(() => location.pathname === '/');
      if (phase.includes('permission')) await page.evaluate(() => window.releaseCapture());
      else release();
      // Allow returned promises and browser track termination to settle.
      await page.waitForTimeout(300);
      assert.deepEqual(await page.evaluate(() => window.lateStream.getTracks().map(track => track.readyState)), ['ended', 'ended'], phase + ': tracks must stop after navigation');
      assert.equal(await page.evaluate(() => window.openedSockets), 0, phase + ': no late capture socket');
      if (phase.includes('permission')) assert.equal(sessions, 0, phase + ': no session after navigation');
      if (phase === 'session') assert.equal(recordings, 0, 'no recorder after a canceled session request');
      if (phase === 'session' || phase === 'recording') assert(finishes >= 1, 'created session must be finished');
      console.log('PASS: capture cancellation during ' + phase);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
