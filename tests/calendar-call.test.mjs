import assert from 'node:assert/strict';
import test from 'node:test';
import { loadUts } from './uts-loader.mjs';

function calendarArgs() {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  start.setSeconds(0, 0);
  const day = [start.getFullYear(), String(start.getMonth() + 1).padStart(2, '0'), String(start.getDate()).padStart(2, '0')].join('-');
  const time = [String(start.getHours()).padStart(2, '0'), String(start.getMinutes()).padStart(2, '0')].join(':');
  return { title: '测试提醒', start_at: day + ' ' + time, duration_minutes: 30, alarm_minutes_before: 5 };
}

test('calendar call passes title, 30 minute duration, and five minute alarm offset', async () => {
  let calendarOptions;
  const { createCalendarReminder } = loadUts('uni_modules/uni-ai-x/sdk/agent-tools.uts',
    ['createCalendarReminder'], {
      console: { log() {} },
      CustomProviderAdapter: class {},
      setTimeout,
      clearTimeout,
      uni: {
        requestSystemPermission(options) {
          assert.deepEqual(Array.from(options.permissions), [
            'android.permission.READ_CALENDAR', 'android.permission.WRITE_CALENDAR',
          ]);
          options.success({ grantedList: options.permissions, deniedList: [], doNotAskAgainList: [] });
        },
        addPhoneCalendar(options) {
          calendarOptions = options;
          options.success({ errMsg: 'addPhoneCalendar:ok' });
        },
      },
    });

  const result = JSON.parse(await createCalendarReminder(calendarArgs()));
  assert.equal(result.success, true);
  assert.equal(calendarOptions.title, '测试提醒');
  assert.equal(calendarOptions.endTime - calendarOptions.startTime, 30 * 60 * 1000);
  assert.equal(calendarOptions.alarm, true);
  assert.equal(calendarOptions.alarmOffset, 300);
});

test('denied calendar access does not open the system editor with a wrong alarm', async () => {
  let calendarCalled = false;
  const { createCalendarReminder } = loadUts('uni_modules/uni-ai-x/sdk/agent-tools.uts',
    ['createCalendarReminder'], {
      console: { log() {} },
      CustomProviderAdapter: class {},
      setTimeout,
      clearTimeout,
      uni: {
        requestSystemPermission(options) {
          assert.deepEqual(Array.from(options.permissions), [
            'android.permission.READ_CALENDAR', 'android.permission.WRITE_CALENDAR',
          ]);
          options.success({ grantedList: [], deniedList: options.permissions, doNotAskAgainList: [] });
        },
        addPhoneCalendar() { calendarCalled = true; },
      },
    });

  const result = JSON.parse(await createCalendarReminder(calendarArgs()));
  assert.match(result.error, /日历读写权限/);
  assert.equal(calendarCalled, false);
});

test('missing permission module ends the request without opening the system editor', async () => {
  let calendarCalled = false;
  const { createCalendarReminder } = loadUts('uni_modules/uni-ai-x/sdk/agent-tools.uts',
    ['createCalendarReminder'], {
      console: { log() {}, error() {} },
      CustomProviderAdapter: class {},
      setTimeout,
      clearTimeout,
      uni: {
        requestSystemPermission() { throw new Error('uni-requestSystemPermission 模块不存在'); },
        addPhoneCalendar() { calendarCalled = true; },
      },
    });

  const result = JSON.parse(await createCalendarReminder(calendarArgs()));
  assert.match(result.error, /无法申请日历权限/);
  assert.equal(calendarCalled, false);
});
