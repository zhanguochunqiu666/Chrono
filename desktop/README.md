# 时序 Chrono · Windows 桌面版

界面和功能与网页版完全一致,数据只保存在本机(`%APPDATA%\时序 Chrono`)。

## 直接下载使用
到本项目的 **Releases** 页面下载:
- `Chrono-Setup-x.y.z.exe` — 安装版(可选安装位置,创建桌面/开始菜单快捷方式)
- `Chrono-Portable-x.y.z.exe` — 便携版,双击即用,无需安装

Windows 可能提示「未知发布者」(安装包没有付费代码签名证书):点「更多信息 → 仍要运行」即可。

## 自己构建
需要 Node.js 18+ 。在 `desktop` 目录:
```
npm install
npm start        # 开发运行
npm run dist     # 生成安装包到 desktop/dist
```
也可以不装任何东西:fork 本仓库,在 GitHub 上打一个 `v1.5.0` 形式的 tag,Actions 会自动构建并发布到 Releases。

## 与网页版的差别
- 调用大模型不需要「本地代理」(桌面版自动放开跨域)。
- 提醒使用 Windows 系统通知。
- 多设备同步:在「设置 → 多设备同步」填同步服务器(见主项目文档)。
