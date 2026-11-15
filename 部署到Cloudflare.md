# 部署到 Cloudflare(免费)

准备:一个 Cloudflare 账号(dash.cloudflare.com 注册,邮箱即可,不用绑卡)。

## 路线 A(推荐,一次搞定网页 + 同步 + 大模型代理):需要装 Node.js
1. 安装 Node.js(nodejs.org,下一步下一步即可)。
2. 在项目文件夹打开命令行(地址栏输入 cmd 回车),运行:`node tools/make_deploy.js`,生成 `deploy` 文件夹。
3. 登录:`npx wrangler login`,浏览器弹出授权,点允许。
4. 创建 KV:`npx wrangler kv namespace create CHRONO`,记下输出里的 id。
5. 部署:`npx wrangler pages deploy deploy --project-name chrono`(第一次会问是否创建项目,选 Y,生产分支填 main)。
6. 绑定 KV:控制台 → Workers & Pages → chrono → Settings → Bindings(或 Functions)→ Add → KV namespace,变量名填 `CHRONO`,选第 4 步创建的那个 → 保存 → 再执行一次第 5 步使其生效。
7. 打开 `https://chrono.pages.dev`(以控制台显示的为准)。

## 路线 B(不装任何东西,纯网页操作):网页和同步分开部署
1. 运行一次 `node tools/make_deploy.js` 得到 `deploy` 文件夹(没有 Node 就直接用项目文件夹,但不要包含 tests、tools、使用说明等)。
2. 控制台 → Workers & Pages → Create → Pages → Upload assets,项目名填 chrono,把 deploy 文件夹里的文件拖进去 → Deploy。得到 `https://chrono.pages.dev`。
3. 同步:控制台 → Workers & Pages → Create → Create Worker → 粘贴 `tools/sync-worker.js` 的全部内容 → Deploy。
4. 进入该 Worker → Settings → Bindings → Add → KV namespace,变量名 `CHRONO`,新建一个命名空间并选中 → Deploy。
5. 在应用里:设置 → 多设备同步,服务器地址填 `https://你的worker名.你的子域.workers.dev/sync`。
(此路线没有大模型代理;Anthropic 接口浏览器可直连,不受影响。)

## 之后每台设备
- 电脑:浏览器打开网址 → 地址栏右侧「安装」。
- 安卓:Chrome 打开 → 菜单 → 安装应用。
- iPhone:Safari 打开 → 分享 → 添加到主屏幕。
- 每台设备:设置 → 多设备同步 → 填同样的服务器地址和同步码(第一台点「生成」)。
- 大模型:设置 → 大模型 → 填自己的 Key。用了路线 A 且服务商不是 Anthropic 时,「本地代理地址」填 `https://chrono.pages.dev/proxy`。

## 更新版本
改了代码后:`node tools/make_deploy.js` 再执行第 5 步(路线 B 则重新上传 deploy 文件夹)。用户端下次打开会自动更新。

## 自定义域名(可选)
Pages 项目 → Custom domains → 添加你的域名,按提示改 DNS。国内长期稳定访问建议使用自己的域名;`*.pages.dev` 在部分网络下可能较慢或不稳定。


## 管理后台(可选)
`deploy` 里已包含管理后台(`/admin`)和授权码接口。启用步骤:
1. Pages 项目 → Settings → Variables and Secrets → 添加 Secret:名称 `ADMIN_TOKEN`,值是至少 24 位的随机字符串。保存后重新部署一次。
2. 打开 `https://你的域名/admin`,输入该口令。
3. 建议用 Cloudflare Access 再保护 `/admin*`。
4. 详细说明与商业化路线见 `docs/BACKEND-PLAN.md`。
不设置 `ADMIN_TOKEN` 时,后台整体关闭,别人无法访问。
