# 各平台安装包怎么出

| 平台 | 产物 | 工作流 |
|---|---|---|
| Android | Chrono-android.apk | .github/workflows/build-android.yml |
| Windows | Chrono-Setup-x.y.z.exe / Portable | release-windows.yml |
| macOS | Chrono-x.y.z-arm64/x64.dmg | build-desktop-other.yml |
| Linux | .AppImage / .deb | build-desktop-other.yml |
| iOS | 需要 Mac + Xcode;日常用 Safari「添加到主屏幕」 | — |

## 一次性准备
1. 在 GitHub 新建仓库,把整个 `时序Chrono` 文件夹的内容推上去(不要推 node_modules)。
2. 仓库 → Actions → 选对应工作流 → Run workflow(手动触发),约 5–15 分钟。
3. 完成后在该次运行页面底部 Artifacts 下载;或打 tag(`git tag v1.5.3 && git push --tags`)自动发布到 Releases。

## 安装 APK
手机下载 APK → 允许「安装未知来源应用」→ 安装。产物是 debug 签名,可直接侧载;上架应用商店需另做 release 签名。

## 本机构建(可选)
Android:装 JDK17 + Android Studio,`npm run android:add && npm run android:sync`。
Windows:`npm run desktop`。
