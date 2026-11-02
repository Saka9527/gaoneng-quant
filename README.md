# GN Quant 文档

用 [Mintlify](https://www.mintlify.com/docs/zh) 集中发布 `java-quant-backtest` 的文档。这个仓库是文档源，代码仍在量化项目里。

信息架构对齐因子研究文档的阅读顺序：简介、开发指南、算子、因子列表、编写、发布、产品库、预计算、跟踪、生命周期、进阶。正文只写当前系统已经实现的行为。

## 本地预览

需要 Node.js 20.17 或更新版本。

```bash
npm i -g mint
mint dev
```

浏览器打开 http://localhost:3000 。

## 从代码仓库同步工程文档

叙事页（`index.mdx`、`quickstart.mdx`、`factor/overview.mdx` 等）是手写的，同步脚本不会覆盖。脚本只刷新由 Markdown 转来的页面，并重写 `docs.json`。

```bash
python scripts/import_from_backtest.py D:/project/gn_quant/java-quant-backtest/docs
```

## 接到 GitHub 与 Mintlify

远程仓库：https://github.com/Saka9527/gaoneng-quant

1. 打开 https://mintlify.com/start ，选择用自己的 GitHub。
2. 安装 Mintlify GitHub App 时只授权 `Saka9527/gaoneng-quant`。
3. Git Settings 里组织选个人账号，仓库选 `gaoneng-quant`，分支选 `main`。文档在仓库根目录，不需要子目录。
4. 之后推到 `main` 会自动部署。

数据页里有内网库地址和账号名，没有密码。站点公开前先在 Mintlify 里保持私有，或删掉这些地址。
