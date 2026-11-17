import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldNotify, askNotifyPermission, notifyDone } from "../public/lib/notify.js";

test("shouldNotify: chỉ báo khi đã được phép và người dùng không nhìn tab", () => {
  assert.equal(shouldNotify({ permission: "granted", hidden: true, focused: false }), true);
  assert.equal(shouldNotify({ permission: "granted", hidden: false, focused: false }), true); // tab hiện nhưng đang ở cửa sổ khác
  assert.equal(shouldNotify({ permission: "granted", hidden: false, focused: true }), false);
  assert.equal(shouldNotify({ permission: "default", hidden: true, focused: false }), false);
  assert.equal(shouldNotify({ permission: "denied", hidden: true, focused: false }), false);
  assert.equal(shouldNotify({ permission: undefined, hidden: true, focused: false }), false);
});

test("askNotifyPermission: chỉ hỏi khi chưa trả lời; không có Notification thì thôi; lỗi không lan ra", async () => {
  let asked = 0;
  const api = (permission) => ({ permission, requestPermission: async () => { asked++; return "granted"; } });
  assert.equal(await askNotifyPermission(api("default")), "granted");
  assert.equal(await askNotifyPermission(api("granted")), "granted");
  assert.equal(await askNotifyPermission(api("denied")), "denied");
  assert.equal(asked, 1);
  assert.equal(await askNotifyPermission(undefined), "unsupported");
  assert.equal(await askNotifyPermission({ permission: "default", requestPermission: async () => { throw new Error("x"); } }), "default");
});

test("notifyDone: không được phép hoặc đang nhìn tab thì không báo; báo qua service worker khi có, không thì new Notification; lỗi không lan ra", async () => {
  const shown = [];
  class Fake { constructor(title, options) { shown.push(["new", title, options.body]); } }
  Fake.permission = "granted";
  const away = { hidden: true, hasFocus: () => false };
  assert.equal(await notifyDone("Xong", "Video A", { Notification: Fake, document: { hidden: false, hasFocus: () => true } }), false);
  assert.equal(await notifyDone("Xong", "Video A", { Notification: Fake, document: away }), true);
  assert.deepEqual(shown, [["new", "Xong", "Video A"]]);
  const registration = { showNotification: async (title, options) => { shown.push(["sw", title, options.body]); } };
  assert.equal(await notifyDone("Xong", "Video B", { Notification: Fake, document: away, registration }), true);
  assert.deepEqual(shown.at(-1), ["sw", "Xong", "Video B"]);
  class Denied {} Denied.permission = "denied";
  assert.equal(await notifyDone("Xong", "", { Notification: Denied, document: away }), false);
  class Broken { constructor() { throw new TypeError("Illegal constructor"); } } Broken.permission = "granted";
  assert.equal(await notifyDone("Xong", "", { Notification: Broken, document: away }), false);
  assert.equal(await notifyDone("Xong", "", { Notification: undefined, document: away }), false);
});
