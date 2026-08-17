/**
 * dsh-wallpaper invariant companion —— 包级不变量占位。
 * 壁纸层不持有跨插件可变状态，注册空安装器即可。
 */
const PACKAGE_NAME = "dsh-wallpaper";
const name = "wallpaper-invariant";
const inject = ["invariants"];
const install = () => {};
const apply = (ctx) => ctx.invariants.register(PACKAGE_NAME, install);
export { apply, inject, name };
