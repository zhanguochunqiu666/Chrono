# 时序 Chrono 1.5.5 · 更新 GitHub 和 Windows 安装包

本次修复包含在 1.5.5。现在只使用统一目录 `Chrono`,GitHub 更新、网页部署和安装包构建都在这里进行。实际版本以根目录和 `desktop/package.json` 为准,两处都应为 1.5.5。

Windows 打包会重新执行 `desktop/prepare.js`,复制页面引用的全部 13 个脚本,包括 `core.js`、`sched.js` 和 `sync.js`。不需要手动复制 `desktop/app`,也不需要把它提交到 GitHub。网页更新本身不会更新电脑中已经安装的旧 exe,需要重新出包。

## 第一步:把代码推送到 GitHub

在 PowerShell 中依次运行,每一步成功后再继续:

```powershell
Set-Location -LiteralPath "E:\学校文件\AI项目\时序 Chrono\Chrono"
git status
git add .
git commit -m "v1.5.5: 修复跨时区同步后重复安排"
git pull --rebase origin main
git push origin main
```

`git status` 应显示位于 `main` 分支。若你后来切到了其他分支,先核对分支再继续。`git pull --rebase` 用来接上 GitHub 上的新提交;如果出现冲突,先停止后续步骤并处理冲突,不要强制推送。若提交时显示 `nothing to commit`,表示修改可能已经提交,可以继续拉取和推送。

推送后打开 https://github.com/zhanguochunqiu666/Chrono ,确认 `desktop/package.json` 的版本为 `1.5.5`,并能看到本次提交。

## 第二步:先构建自己使用的 Windows 包

1. 打开 https://github.com/zhanguochunqiu666/Chrono/actions 。
2. 左侧选择 **Build Windows installer**。
3. 点击 **Run workflow**,分支选 **main**,再确认运行。
4. 等这次运行成功变绿,点进去,在 **Artifacts** 下载 `chrono-windows`。
5. 解压后应有 `Chrono-Setup-1.5.5.exe` 和 `Chrono-Portable-1.5.5.exe`。如仍是 1.5.4,说明本次构建没有使用最新提交。

这一方式只生成 Actions 下载包,不会自动新建公开 Release。构建耗时受 GitHub 队列和下载速度影响。

## 可选:发布到 Releases

确认第一步推送成功后,在同一 PowerShell 窗口执行:

```powershell
git tag -a v1.5.5 -m "Chrono v1.5.5"
git push origin v1.5.5
```

这会触发 Windows、Android、macOS 和 Linux 构建。各平台构建成功后,对应文件才会出现在 https://github.com/zhanguochunqiu666/Chrono/releases 。Android 产物是现有流程生成的调试 APK。如果某个平台失败,不会保证该平台也有下载包。已有 `v1.5.5` 标签时,不要覆盖或移动已发布标签;先查看该标签是否已经指向正确版本。

以后发新版本,同步修改根目录与 `desktop/package.json` 的版本,网页显示版本和缓存版本也应一致;标签使用相同版本。

## 换到新版本

先在旧软件的设置中导出 JSON 备份,退出旧软件后运行新安装包,或打开新便携版。此更新没有修改应用标识或数据目录设置。安装后在软件设置底部确认 **1.5.5**,再点「立即同步」。电脑、手机和平板也都应使用新版,继续使用原服务器地址和同步码。

## 网页还需要单独部署

Windows 打包只更新 exe,不会直接更新 https://chrono-7pg.pages.dev/ 。

- 如果 Cloudflare 已连接这个仓库:推送 `main` 后等待 Cloudflare 生产部署成功;构建命令是 `node tools/make_deploy.js`,输出目录是 `deploy`。
- 如果使用手动部署:在上面的仓库文件夹运行 `node tools/make_deploy.js`,再按现有 Cloudflare 项目重新上传。使用 Wrangler 时先登录并查询项目名,然后运行 `npx wrangler pages deploy deploy --project-name 现有项目名 --branch main`。详见《同步重复修复说明.md》。

不要清空云端数据或重新生成同步码。此修复会在新版启动和同步时处理可确认的重复项,并保留有冲突的手动操作记录。
