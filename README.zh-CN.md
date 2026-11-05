# Doubao CLI Provider for Paseo

[English](./README.md) | [简体中文](./README.zh-CN.md)

用于将豆包代码助手命令行工具（`doubao` CLI）接入 Paseo 的 Provider 插件。支持 Paseo 桌面客户端、Web 端、移动端及 CLI 终端，遵循 Paseo Provider Protocol v1 规范。

---

## ✨ 核心特性

- **完整 Provider Protocol v1 规范适配**：实现 Paseo 原生连接握手、会话配置、流式时间线（Timeline）消息回传与多轮交互。
- **全动态目录探测**：代码中**零硬编码**。可用模型列表（`--model`）、思考推理强度（`--effort`）以及权限安全模式（`--permission-mode`）均在运行时从本地安装的 `doubao` CLI 自动探测获取，随底层 CLI 升级自动同步。
- **会话持久化与上下文断点续答**：自动从执行进程提取原生 Session ID 并注入 Paseo 状态树，后续轮次对话通过 `--resume` 实现精准上下文继承与记忆保持。
- **历史会话发现 (`session.list`)**：集成 `doubao --list`，直接支持在 Paseo 中发现并恢复本地已有会话。
- **子进程管道安全与防死锁**：深度优化非交互模式下的标准输入与输出管道映射，彻底解决后台无 TTY 管道执行时可能引发的输入连接等待问题。

---

## 📋 前置要求

使用前请确保当前系统环境中已安装 `doubao` 命令行并已添加到 `PATH`：

```bash
# 检查 CLI 安装与版本
doubao --version

# 查看登录状态
doubao auth status

# 若尚未登录，运行以下命令完成登录
doubao login
```

---

## 🚀 安装与加载

### 方式一：通过 Paseo CLI 安装

进入当前插件根目录（或指定目录绝对路径）：

```bash
paseo plugin install .
```

### 方式二：通过 Paseo 客户端界面安装

1. 打开 Paseo，进入 **Settings**（设置）→ **Plugins**（插件）。
2. 在 **Plugin source** 输入框中填入本插件的目录路径。
3. 点击 **Install plugin** 完成安装。

---

## ⚙️ 使用与操作

安装完成后，Paseo 守护进程中将注册名为 `doubao` 的 Provider。

### 查看 Provider 状态

```bash
paseo provider ls
paseo provider diagnostic doubao
```

### 查看动态探测到的模型列表

```bash
paseo provider models doubao
```

### 启动智能体任务

```bash
# 使用默认配置运行任务
paseo run --provider doubao "分析当前代码库的核心架构并给出说明"

# 指定模型与深度思考等级运行
paseo run --provider doubao --model "Doubao 2.1 Pro" --thinking high "重构数据访问层逻辑"

# 在已创建的 Agent 中继续多轮追问
paseo send <agent-id> "基于刚才的改动，为该模块补充单元测试用例"
```

---

## 🛠️ 本地开发与调试

```bash
# 安装开发依赖
npm install

# 静态类型检查
npm run typecheck

# 代码修改后重新热加载插件
paseo plugin reload doubao-cli-paseo
```

---

## 📄 开源许可

Apache-2.0
